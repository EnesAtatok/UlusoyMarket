"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { start, tmpDir } = require("./helpers");
const { upgrade } = require("../lib/db");

// Eski (online-siparis öncesi) db.json biçimi
function legacyDb() {
  return {
    categories: [
      { id: 1, name: "Meyve & Sebze", emoji: "🥦" },
      { id: 2, name: "İçecek", emoji: "🧃" },
    ],
    products: [
      { id: 1, name: "Domates", price: 34.9, unit: "kg", categoryId: 1, emoji: "🍅", hidden: false },
      { id: 2, name: "Su 1,5 L", price: 9.9, unit: "adet", categoryId: 2, emoji: "💧", hidden: false, soldOut: true, image: "/uploads/eski.jpg" },
    ],
    orders: [
      {
        id: 1,
        token: "abcdefabcdefabcdefabcdef",
        createdAt: "2026-10-01T18:00:00.000Z",
        updatedAt: "2026-10-01T19:00:00.000Z",
        customer: { name: "Mehmet Kaya", phone: "05551234567", address: "İstiklal Mah. Uzun Sok. No:1" },
        items: [{ productId: 1, name: "Domates", price: 34.9, qty: 2 }],
        total: 69.8,
        status: "Teslim edildi",
        history: [{ status: "Yeni", at: "2026-10-01T18:00:00.000Z" }, { status: "Teslim edildi", at: "2026-10-01T19:00:00.000Z" }],
      },
      {
        id: 2,
        createdAt: "2026-10-02T18:00:00.000Z",
        customer: { name: "Zeynep Ak", phone: "05331112233", address: "Sabuni Mah. Kısa Sok. No:2" },
        items: [{ productId: 2, name: "Su 1,5 L", price: 9.9, qty: 3 }],
        total: 29.7,
        status: "İptal",
        cancelNote: "Adrese ulaşılamadı",
      },
    ],
  };
}

test("eski db.json kayıpsız yükseltilir; eski takip anahtarı ve telefonla sorgu çalışır", async () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify(legacyDb(), null, 2));
  const s = await start({ dataDir: dir });
  try {
    const db = s.app.db;
    assert.equal(db.meta.schemaVersion, 2);
    // Katalog korunur, yeni alanlar varsayılanla dolar
    assert.equal(db.products.length, 2);
    assert.equal(db.products[1].soldOut, true);
    assert.equal(db.products[1].image, "/uploads/eski.jpg");
    assert.equal(db.products[0].stock, null);
    assert.equal(db.products[0].brand, "");
    assert.equal(db.products[0].featured, false);
    assert.equal(db.categories[0].hidden, false);
    // Ayarlar ve kullanıcı oluşturulur
    assert.equal(db.settings.store.name, "Ulusoy Market");
    assert.equal(db.settings.zones.length, 7);
    assert.ok(db.settings.faq.every((f) => f.id > 0));
    assert.equal(db.users.length, 1);
    assert.equal(db.users[0].username, "admin");
    assert.match(db.users[0].passHash, /^scrypt\$/);
    assert.equal(db.coupons[0].code, "HOSGELDIN");
    // Siparişler
    const [o1, o2] = db.orders;
    assert.equal(o1.token, "abcdefabcdefabcdefabcdef");
    assert.equal(o1.type, "teslimat");
    assert.equal(o1.payment, "nakit");
    assert.equal(o1.subtotal, 69.8);
    assert.equal(o1.deliveryFee, 0);
    assert.equal(o1.discount, 0);
    assert.equal(o1.total, 69.8);
    assert.equal(o1.items[0].unit, "kg");
    assert.equal(o1.history.length, 2);
    assert.equal(o1.customer.zoneId, null);
    assert.equal(o1.customer.zoneName, "");
    assert.match(o2.token, /^[a-f0-9]{24}$/);
    assert.equal(o2.cancelledBy, "market");
    assert.equal(o2.cancelNote, "Adrese ulaşılamadı");
    assert.equal(o2.updatedAt, o2.createdAt);
    assert.deepEqual(o2.history.map((h) => h.status), ["Yeni", "İptal"]);

    // Yükseltme öncesi yedek alınmış olmalı
    const backups = fs.readdirSync(path.join(dir, "backups"));
    assert.ok(backups.some((f) => f.startsWith("yukseltme-oncesi-")));
    const original = JSON.parse(fs.readFileSync(path.join(dir, "backups", backups.find((f) => f.startsWith("yukseltme-oncesi-"))), "utf8"));
    assert.deepEqual(original, legacyDb());

    // Eski sözleşme: GET /api/orders/:id?token= ve ?phone=
    let r = await s.req("GET", "/api/orders/1?token=abcdefabcdefabcdefabcdef");
    assert.equal(r.status, 200);
    assert.equal(r.json.id, 1);
    assert.equal(r.json.status, "Teslim edildi");
    assert.equal(r.json.total, 69.8);
    assert.equal(r.json.customer.name, "Mehmet Kaya");
    assert.equal(r.json.token, "abcdefabcdefabcdefabcdef");
    assert.equal(r.json.customer.phone, undefined); // telefon/adres dönmez
    r = await s.req("GET", "/api/orders/2?phone=0533%20111%2022%2033");
    assert.equal(r.status, 200);
    assert.equal(r.json.cancelNote, "Adrese ulaşılamadı");
    assert.equal(r.json.token, o2.token);
    r = await s.req("GET", "/api/orders/1?token=yanlis");
    assert.equal(r.status, 404);
    assert.equal(r.json.error, "Sipariş bulunamadı. Numara ve telefonu kontrol edin.");

    // Yükseltilmiş veri diske yazılmış olmalı
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "db.json"), "utf8"));
    assert.equal(onDisk.meta.schemaVersion, 2);
  } finally {
    await s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("yükseltme idempotent: ikinci kez değişiklik yapmaz", () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "seed.json"), "utf8"));
  const first = upgrade(legacyDb(), seed).db;
  const again = upgrade(JSON.parse(JSON.stringify(first)), seed);
  assert.equal(again.changed, false);
  assert.deepEqual(again.db, first);
});

test("ilk kurulum: seed'den başlar, admin oluşur, atomik kayıt + günlük yedek", async () => {
  const s = await start();
  try {
    assert.ok(s.app.db.products.length >= 120);
    assert.ok(s.app.db.categories.length >= 12);
    assert.equal(s.app.db.orders.length, 0);
    assert.ok(fs.existsSync(path.join(s.dataDir, "db.json")));
    const backups = fs.readdirSync(path.join(s.dataDir, "backups"));
    assert.ok(backups.some((f) => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)));
    // Geçici dosya kalmamalı
    assert.deepEqual(fs.readdirSync(s.dataDir).filter((f) => f.includes(".tmp-")), []);
  } finally {
    await s.close();
  }
});

test("bozuk db.json'ın üzerine yazılmaz, sunucu açılmaz", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "db.json"), "{bozuk");
  const { createApp } = require("../lib/app");
  assert.throws(() => createApp({ dataDir: dir, log: () => {} }), /db.json okunamadı/);
  assert.equal(fs.readFileSync(path.join(dir, "db.json"), "utf8"), "{bozuk");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("seed kataloğunda alkol ve tütün ürünü yok", () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "seed.json"), "utf8"));
  const banned = /(bira|rakı|raki|şarap|sarap|votka|viski|cin\b|likör|sigara|tütün|tutun|puro|nargile|alkol|tekel|efes|tuborg)/i;
  for (const p of seed.products) assert.ok(!banned.test(`${p.name} ${p.brand} ${p.description}`), p.name);
  for (const c of seed.categories) assert.ok(!banned.test(c.name), c.name);
  assert.ok(seed.products.length >= 120);
  assert.ok(seed.products.some((p) => p.oldPrice > p.price));
  assert.ok(seed.products.some((p) => p.featured));
  assert.equal(seed.coupons[0].code, "HOSGELDIN");
  assert.equal(seed.coupons[0].active, false);
});
