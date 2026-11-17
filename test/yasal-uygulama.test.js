"use strict";
// YASAL.md'den gelen backend kararları: fiyat geçmişi / indirim öncesi fiyat, sipariş teyidi, arşiv maskesi,
// güvenlik durumu (ETBİS, Telegram), cayma durumu (ürün/kategori), Telegram'a kişisel veri gitmemesi
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { start, orderBody } = require("./helpers");
const { upgrade } = require("../lib/db");
const { orderMessage, cancelMessage } = require("../lib/notify");

const DAY = 86400000;

test("fiyat geçmişi: indirimde eski fiyat son 10 günün en düşüğünden otomatik; elle yüksek girilirse uyarı (kayıt reddedilmez)", async () => {
  const s = await start();
  try {
    const tok = await s.login();
    const t0 = Date.parse("2026-11-16T18:00:00.000Z");
    let p = (await s.req("POST", "/api/admin/products", { name: "Deterjan 3 kg", price: 300, categoryId: 11 }, tok)).json;
    assert.deepEqual(p.priceHistory.map((h) => h.price), [300]);
    assert.deepEqual(p.warnings, []);
    // 3 gün sonra zam (320), 5 gün sonra indirim (250) → başvuru: son 10 gündeki en düşük = 300
    s.setTime(new Date(t0 + 3 * DAY).toISOString());
    p = (await s.req("PATCH", `/api/admin/products/${p.id}`, { price: 320 }, tok)).json;
    assert.equal(p.oldPrice, null, "zamda indirim etiketi olmaz");
    s.setTime(new Date(t0 + 5 * DAY).toISOString());
    p = (await s.req("PATCH", `/api/admin/products/${p.id}`, { price: 250 }, tok)).json;
    assert.equal(p.oldPrice, 300, "eski fiyat = son 10 günün en düşüğü (320 değil)");
    assert.deepEqual(p.priceHistory.map((h) => h.price), [300, 320, 250]);
    // Elle 320 girilirse kabul edilir ama uyarı döner
    let r = await s.req("PATCH", `/api/admin/products/${p.id}`, { oldPrice: 320 }, tok);
    assert.equal(r.status, 200);
    assert.equal(r.json.oldPrice, 320);
    assert.equal(r.json.warnings.length, 1);
    assert.match(r.json.warnings[0], /son 10 günde uygulanan en düşük fiyat ₺300,00/);
    // Elle doğru değer → uyarı yok
    r = await s.req("PATCH", `/api/admin/products/${p.id}`, { oldPrice: 300 }, tok);
    assert.deepEqual(r.json.warnings, []);
    // Fiyatla birlikte gönderilen eski fiyat esas alınır (otomatik değer yazılmaz)
    s.setTime(new Date(t0 + 20 * DAY).toISOString());
    r = await s.req("PATCH", `/api/admin/products/${p.id}`, { price: 240, oldPrice: 260 }, tok);
    assert.equal(r.json.oldPrice, 260);
    assert.equal(r.json.warnings.length, 1, "son 10 günde en düşük 250 iken 260 girildi");
    // Toplu yüzde indirim de geçmişe yazılır ve eski fiyatı otomatik koyar
    s.setTime(new Date(t0 + 40 * DAY).toISOString());
    await s.req("POST", "/api/admin/products/bulk", { ids: [p.id], action: "price", percent: -10 }, tok);
    const after = s.app.db.products.find((x) => x.id === p.id);
    assert.equal(after.price, 216);
    assert.equal(after.oldPrice, 240);
    // Meyve-sebzede bir önceki fiyat esas alınır
    const m = (await s.req("POST", "/api/admin/products", { name: "Elma", price: 40, categoryId: 1, unit: "kg" }, tok)).json;
    s.setTime(new Date(t0 + 41 * DAY).toISOString());
    await s.req("PATCH", `/api/admin/products/${m.id}`, { price: 50 }, tok);
    s.setTime(new Date(t0 + 42 * DAY).toISOString());
    const m2 = (await s.req("PATCH", `/api/admin/products/${m.id}`, { price: 45 }, tok)).json;
    assert.equal(m2.oldPrice, 50, "meyve-sebzede bir önceki fiyat (40 değil)");
    // Geçmiş müşteriye gitmez
    const pub = (await s.req("GET", "/api/store")).json.products.find((x) => x.id === m.id);
    assert.equal(pub.priceHistory, undefined);
  } finally {
    await s.close();
  }
});

test("sipariş teyidi (ikinci kanal): kanal, sonuç, zaman, kim; personel yapabilir; doğrulanır", async () => {
  const s = await start();
  try {
    const admin = await s.login();
    await s.req("POST", "/api/admin/users", { username: "kasa", password: "kasa12345", role: "personel" }, admin);
    const staff = await s.login("kasa", "kasa12345");
    const o = (await s.req("POST", "/api/orders", orderBody())).json;
    assert.equal((await s.req("POST", `/api/orders/${o.id}/confirmation`, { channel: "telefon" })).status, 404, "müşteri ucu değil");
    assert.equal((await s.req("POST", `/api/admin/orders/${o.id}/confirmation`, { channel: "posta" }, staff)).status, 400);
    let r = await s.req("POST", `/api/admin/orders/${o.id}/confirmation`, { channel: "telefon" }, staff);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.confirmations.length, 1);
    assert.deepEqual({ ...r.json.confirmations[0], at: undefined }, { channel: "telefon", result: "ulasildi", at: undefined, by: "kasa" });
    r = await s.req("POST", `/api/admin/orders/${o.id}/confirmation`, { channel: "sms", result: "ulasilamadi", note: "Kapalı" }, staff);
    assert.equal(r.json.confirmations[1].result, "ulasilamadi");
    const audit = (await s.req("GET", "/api/admin/audit", undefined, admin)).json.entries;
    assert.ok(audit.some((e) => e.path === "/api/admin/orders/:id/confirmation" && e.user === "kasa" && e.details.channel === "sms"));
  } finally {
    await s.close();
  }
});

test("arşiv eşiği: süresi geçmiş tamamlanmış siparişte kişisel veri personele maskeli, yöneticiye açık", async () => {
  const s = await start();
  try {
    const admin = await s.login();
    await s.req("POST", "/api/admin/users", { username: "kasa", password: "kasa12345", role: "personel" }, admin);
    const ph = "05556667788";
    const old = (await s.req("POST", "/api/orders", orderBody({ phone: ph, name: "Eski Kişi", note: "Zil bozuk" }))).json;
    await s.req("PATCH", `/api/admin/orders/${old.id}`, { status: "Teslim edildi" }, admin);
    const active = (await s.req("POST", "/api/orders", orderBody({ phone: "05551112244" }))).json;
    s.setTime("2028-12-01T12:00:00.000Z"); // 730 günden fazla sonra
    const staff = await s.login("kasa", "kasa12345");
    let r = await s.req("GET", `/api/admin/orders/${old.id}`, undefined, staff);
    assert.equal(r.json.archived, true);
    assert.equal(r.json.customer.phone, "");
    assert.equal(r.json.customer.name, "Arşivlenmiş sipariş");
    assert.match(r.json.note, /arşivde/);
    assert.equal(r.json.total, 232.5, "tutar görünür");
    r = await s.req("GET", `/api/admin/orders/${old.id}`, undefined, admin);
    assert.equal(r.json.archived, true);
    assert.equal(r.json.customer.name, "Eski Kişi", "yönetici görür");
    // Listede ve aramada personel telefonla eski siparişi bulamaz
    r = await s.req("GET", `/api/admin/orders?q=${ph}`, undefined, staff);
    assert.equal(r.json.orders.length, 0);
    r = await s.req("GET", "/api/admin/orders", undefined, staff);
    assert.ok(r.json.orders.every((o) => !(o.archived && o.customer.phone)));
    assert.ok(r.json.orders.some((o) => o.id === active.id && o.customer.phone === "05551112244"), "aktif sipariş etkilenmez");
    r = await s.req("GET", "/api/admin/customers", undefined, staff);
    assert.ok(!r.json.customers.some((c) => c.phone === ph));
    assert.equal((await s.req("GET", `/api/admin/customers/${ph}`, undefined, staff)).status, 404);
    r = await s.req("GET", `/api/admin/orders/${old.id}/documents`, undefined, staff);
    assert.ok(r.json.documents.every((d) => !/Eski Kişi/.test(d.text)));
    // Ayar kapatılınca maske kalkar; eşik anonimleştirme süresinden uzun olamaz
    assert.equal((await s.req("PATCH", "/api/admin/settings", { privacy: { archiveDays: 4000 } }, admin)).status, 400);
    await s.req("PATCH", "/api/admin/settings", { privacy: { archiveDays: null } }, admin);
    assert.equal((await s.req("GET", `/api/admin/orders/${old.id}`, undefined, staff)).json.customer.name, "Eski Kişi");
  } finally {
    await s.close();
  }
});

test("güvenlik durumu: ETBİS eksik uyarısı, Telegram açıkken bilgi notu; ETBİS girilince uyarı kalkar", async () => {
  const s = await start();
  try {
    const tok = await s.login();
    let r = await s.req("GET", "/api/admin/security", undefined, tok);
    assert.ok(r.json.warnings.some((w) => w.code === "ETBIS_YOK"));
    assert.equal(r.json.etbis.ok, false);
    assert.ok(!r.json.warnings.some((w) => w.code === "TELEGRAM_ACIK"));
    await s.req("PATCH", "/api/admin/settings", { legal: { etbisNo: "ETBIS-123456" }, notify: { telegramBotToken: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ", telegramChatId: "42" } }, tok);
    r = await s.req("GET", "/api/admin/security", undefined, tok);
    assert.ok(!r.json.warnings.some((w) => w.code === "ETBIS_YOK"));
    const tg = r.json.warnings.find((w) => w.code === "TELEGRAM_ACIK");
    assert.equal(tg.level, "bilgi");
    assert.equal(r.json.telegram.personalData, false);
  } finally {
    await s.close();
  }
});

test("Telegram mesajında müşteri adı, telefon, adres, not yok", () => {
  const o = {
    id: 7, preorder: false, type: "teslimat", total: 120, payment: "nakit", changeFor: 200, note: "Zil bozuk", substitution: "ara",
    customer: { name: "Zeynep Ak", phone: "05331112233", address: "Sabuni Mah. Kısa Sok. No:2", zoneName: "Sabuni" },
    items: [{ name: "Süt", qty: 2, price: 30 }, { name: "Ekmek", qty: 3, price: 20 }],
  };
  for (const text of [orderMessage(o, "https://ulusoymarket.com"), cancelMessage(o)]) {
    assert.doesNotMatch(text, /Zeynep|0533|Sabuni Mah|Zil bozuk|Süt|Ekmek/);
  }
  assert.match(orderMessage(o, "https://ulusoymarket.com"), /#7[\s\S]*Eve teslim · Sabuni[\s\S]*2 kalem, 5 ürün · Toplam: ₺120,00[\s\S]*https:\/\/ulusoymarket\.com\/panel/);
});

test("cayma durumu: yükseltmede kategori adından türetilir; ürün/kategori panelden değiştirilir ve doğrulanır", async () => {
  const { db } = upgrade({ categories: [{ id: 1, name: "Meyve & Sebze" }, { id: 2, name: "Kişisel Bakım" }, { id: 3, name: "Temizlik" }], products: [{ id: 1, name: "X", price: 1, categoryId: 2 }], orders: [] });
  assert.deepEqual(db.categories.map((c) => c.caymaDurumu), ["yok_cabuk_bozulan", "acilirsa_yok_hijyen", "var"]);
  assert.equal(db.products[0].caymaDurumu, null);
  const s = await start();
  try {
    const tok = await s.login();
    assert.equal((await s.req("PATCH", "/api/admin/products/13", { caymaDurumu: "bilmem" }, tok)).status, 400);
    let r = await s.req("PATCH", "/api/admin/products/13", { caymaDurumu: "var" }, tok);
    assert.equal(r.json.caymaDurumu, "var");
    assert.equal((await s.req("GET", "/api/store")).json.products.find((p) => p.id === 13).caymaDurumu, "var");
    r = await s.req("PATCH", "/api/admin/products/13", { caymaDurumu: null }, tok);
    assert.equal((await s.req("GET", "/api/store")).json.products.find((p) => p.id === 13).caymaDurumu, "yok_cabuk_bozulan");
    r = await s.req("POST", "/api/admin/categories", { name: "Bebek Bezleri" }, tok);
    assert.equal(r.json.caymaDurumu, "acilirsa_yok_hijyen");
    r = await s.req("PATCH", `/api/admin/categories/${r.json.id}`, { caymaDurumu: "var" }, tok);
    assert.equal(r.json.caymaDurumu, "var");
  } finally {
    await s.close();
  }
});
