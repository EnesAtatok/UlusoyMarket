"use strict";
// Kimlikler (sipariş no, ürün, kategori, kupon, bölge) asla tekrar kullanılmaz
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { start, tmpDir, orderBody } = require("./helpers");

const fast = { rateLimits: { orders: { windowMs: 60000, max: 1000 } } };

async function deliverAndDelete(s, admin, id) {
  let r = await s.req("PATCH", `/api/admin/orders/${id}`, { status: "Teslim edildi" }, admin);
  assert.equal(r.status, 200, r.text);
  r = await s.req("POST", "/api/admin/orders/bulk", { ids: [id], action: "delete" }, admin);
  assert.equal(r.json.processed, 1, r.text);
}

test("silinen siparişin numarası yeni siparişe verilmez (yeniden başlatmadan sonra da)", async () => {
  const dir = tmpDir();
  let s = await start({ dataDir: dir, ...fast });
  try {
    const admin = await s.login();
    const ids = [];
    for (const phone of ["05320000001", "05320000002", "05320000003"]) {
      const r = await s.req("POST", "/api/orders", orderBody({ phone }));
      assert.equal(r.status, 201, r.text);
      ids.push(r.json.id);
    }
    assert.deepEqual(ids, [1, 2, 3]);
    await deliverAndDelete(s, admin, 3);
    let r = await s.req("POST", "/api/orders", orderBody({ phone: "05320000004" }));
    assert.equal(r.json.id, 4, "3 numarası tekrar verilmemeli");
    // Eski 3 numaralı siparişin takip bağlantısı yeni siparişi göstermez
    r = await s.req("GET", "/api/orders/3?phone=05320000003");
    assert.equal(r.status, 404);
    await deliverAndDelete(s, admin, 4);
    await s.close(true);
    s = await start({ dataDir: dir, ...fast });
    r = await s.req("POST", "/api/orders", orderBody({ phone: "05320000005" }));
    assert.equal(r.json.id, 5, "sayaç diske yazılmış olmalı");
    // Panelden elle sipariş de aynı sayaçtan numara alır
    r = await s.req("POST", "/api/admin/orders", orderBody({ phone: "05320000006" }), await s.login());
    assert.equal(r.json.id, 6);
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "db.json"), "utf8"));
    assert.equal(onDisk.meta.idCounters.orders, 6);
  } finally {
    await s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("silinen ürün/kategori/kupon kimliği tekrar verilmez; eski siparişin stok kaydı yeni ürüne kaymaz", async () => {
  const s = await start(fast);
  try {
    const admin = await s.login();
    const maxProduct = Math.max(...s.app.db.products.map((p) => p.id));
    let r = await s.req("POST", "/api/admin/products", { name: "Deneme Ürün", price: 10, categoryId: 1, stock: 5 }, admin);
    const pid = r.json.id;
    assert.equal(pid, maxProduct + 1);
    // Stoklu ürünle sipariş: 2 adet ayrılır
    r = await s.req("POST", "/api/orders", orderBody({ items: [{ productId: 13, qty: 5 }, { productId: pid, qty: 2 }] }));
    assert.equal(r.status, 201, r.text);
    const oid = r.json.id;
    r = await s.req("DELETE", `/api/admin/products/${pid}`, undefined, admin);
    assert.equal(r.status, 200);
    r = await s.req("POST", "/api/admin/products", { name: "Başka Ürün", price: 20, categoryId: 1, stock: 10 }, admin);
    assert.equal(r.json.id, pid + 1, "silinen ürünün kimliği tekrar verilmemeli");
    const newId = r.json.id;
    // Çoğaltma da yeni kimlik alır
    r = await s.req("POST", `/api/admin/products/${newId}/duplicate`, undefined, admin);
    assert.equal(r.json.id, newId + 1);
    // Eski sipariş iptal edilince stok iadesi yeni ürüne gitmez
    r = await s.req("PATCH", `/api/admin/orders/${oid}`, { status: "İptal" }, admin);
    assert.equal(r.status, 200);
    assert.equal(s.app.db.products.find((p) => p.id === newId).stock, 10);

    // Kategori
    r = await s.req("POST", "/api/admin/categories", { name: "Geçici Reyon" }, admin);
    const cid = r.json.id;
    await s.req("DELETE", `/api/admin/categories/${cid}`, undefined, admin);
    r = await s.req("POST", "/api/admin/categories", { name: "Yeni Reyon" }, admin);
    assert.equal(r.json.id, cid + 1);

    // Kupon
    r = await s.req("POST", "/api/admin/coupons", { code: "DENEME1", type: "tutar", value: 5 }, admin);
    const kid = r.json.id;
    await s.req("DELETE", `/api/admin/coupons/${kid}`, undefined, admin);
    r = await s.req("POST", "/api/admin/coupons", { code: "DENEME2", type: "tutar", value: 5 }, admin);
    assert.equal(r.json.id, kid + 1);
  } finally {
    await s.close();
  }
});

test("bölge/afiş/SSS: silinen kimlik yeni kayda verilmez", async () => {
  const s = await start(fast);
  try {
    const admin = await s.login();
    const zones = s.app.db.settings.zones.map((z) => ({ ...z }));
    const maxZone = Math.max(...zones.map((z) => z.id));
    // Son bölgeyi sil, kaydet; sonra yeni bölge ekle
    let r = await s.req("PATCH", "/api/admin/settings", { zones: zones.slice(0, -1) }, admin);
    assert.equal(r.status, 200, r.text);
    r = await s.req("PATCH", "/api/admin/settings", { zones: [...zones.slice(0, -1), { name: "Yeni Mahalle", fee: 30 }] }, admin);
    const added = r.json.settings.zones.find((z) => z.name === "Yeni Mahalle");
    assert.equal(added.id, maxZone + 1);
    // İstemci silinmiş bir kimliği gönderse bile yeni kimlik verilir
    r = await s.req("PATCH", "/api/admin/settings", { zones: [...r.json.settings.zones, { id: maxZone, name: "Hayalet", fee: 10 }] }, admin);
    const ghost = r.json.settings.zones.find((z) => z.name === "Hayalet");
    assert.equal(ghost.id, maxZone + 2);
    // SSS
    const faq = s.app.db.settings.faq;
    const maxFaq = Math.max(...faq.map((f) => f.id));
    await s.req("POST", "/api/admin/settings/faq/bulk-delete", { ids: [maxFaq] }, admin);
    r = await s.req("PATCH", "/api/admin/settings", { faq: [...s.app.db.settings.faq, { q: "Yeni soru?", a: "Yeni cevap." }] }, admin);
    assert.equal(r.json.settings.faq.at(-1).id, maxFaq + 1);
  } finally {
    await s.close();
  }
});

test("eski biçimli veri: sayaçlar mevcut en büyük kimlikten başlar", async () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "db.json"),
    JSON.stringify({
      categories: [{ id: 4, name: "İçecek", emoji: "🧃" }],
      products: [{ id: 17, name: "Su 1,5 L", price: 9.9, unit: "adet", categoryId: 4 }],
      orders: [
        { id: 9, token: "a".repeat(24), createdAt: "2026-10-01T18:00:00.000Z", customer: { name: "Ali Veli", phone: "05551112233", address: "Meydan Mah. No:1 Edirne" }, items: [{ productId: 17, name: "Su 1,5 L", price: 9.9, qty: 1 }], total: 9.9, status: "Teslim edildi" },
      ],
    })
  );
  const s = await start({ dataDir: dir, ...fast });
  try {
    assert.equal(s.app.db.meta.idCounters.orders, 9);
    assert.equal(s.app.db.meta.idCounters.products, 17);
    const admin = await s.login();
    await deliverAndDelete(s, admin, 9);
    const r = await s.req("POST", "/api/admin/orders", { ...orderBody({ items: [{ productId: 17, qty: 1 }] }) }, admin);
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.id, 10);
  } finally {
    await s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("yedek geri yüklenince sayaç geriye gitmez; CSV kuru çalıştırma sayacı ilerletmez", async () => {
  const s = await start(fast);
  try {
    let admin = await s.login();
    assert.equal((await s.req("POST", "/api/orders", orderBody({ phone: "05320000011" }))).json.id, 1);
    const backup = (await s.req("GET", "/api/admin/backup", undefined, admin)).json;
    assert.equal((await s.req("POST", "/api/orders", orderBody({ phone: "05320000012" }))).json.id, 2);
    assert.equal((await s.req("POST", "/api/orders", orderBody({ phone: "05320000013" }))).json.id, 3);
    // Yedekte sayaç 1; geri yüklenince 2 ve 3 tekrar verilmemeli
    let r = await s.req("POST", "/api/admin/restore", backup, admin);
    assert.equal(r.status, 200, r.text);
    assert.equal(s.app.db.orders.length, 1);
    r = await s.req("POST", "/api/orders", orderBody({ phone: "05320000014" }));
    assert.equal(r.json.id, 4);

    admin = await s.login();
    const before = s.app.db.meta.idCounters.products;
    r = await s.req("POST", "/api/admin/products/import", { csv: "Ürün adı;Fiyat;Kategori\nKuru Ürün;5;Yepyeni Reyon\n", dryRun: true }, admin);
    assert.equal(r.json.added, 1);
    assert.equal(s.app.db.meta.idCounters.products, before);
    r = await s.req("POST", "/api/admin/products/import", { csv: "Ürün adı;Fiyat;Kategori\nKuru Ürün;5;Yepyeni Reyon\n" }, admin);
    assert.equal(s.app.db.meta.idCounters.products, before + 1);
    assert.equal(s.app.db.products.find((p) => p.name === "Kuru Ürün").id, before + 1);
  } finally {
    await s.close();
  }
});
