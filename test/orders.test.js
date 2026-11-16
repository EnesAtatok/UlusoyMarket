"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { start, orderBody } = require("./helpers");

let s;
before(async () => {
  s = await start({ rateLimits: { orders: { windowMs: 60000, max: 1000 } } });
});
after(() => s.close());

const post = (body) => s.req("POST", "/api/orders", body);
const product = (id) => s.app.db.products.find((p) => p.id === id);
let phoneSeq = 0;
const freshPhone = () => `0532${String(5000000 + ++phoneSeq).padStart(7, "0")}`;

test("geçerli sipariş: 201, sunucu fiyatı, takip anahtarı, yeni alanlar", async () => {
  const r = await post(orderBody({ phone: freshPhone(), note: "Zile basmayın", substitution: "benzer", changeFor: 500 }));
  assert.equal(r.status, 201, r.text);
  assert.ok(r.json.id > 0);
  assert.match(r.json.token, /^[a-f0-9]{24}$/);
  assert.equal(r.json.total, 232.5);
  const o = s.app.db.orders.find((x) => x.id === r.json.id);
  assert.equal(o.type, "teslimat");
  assert.equal(o.payment, "nakit");
  assert.equal(o.changeFor, 500);
  assert.equal(o.substitution, "benzer");
  assert.equal(o.note, "Zile basmayın");
  assert.equal(o.customer.zoneName, "Şükrüpaşa");
  assert.equal(o.source, "web");
  assert.ok(o.consentAt);
  assert.equal(r.json.order.statusLabel, "Alındı");
  assert.equal(r.json.order.canCancel, true);
  assert.equal(r.json.order.etaMinutes, 20);
});

test("doğrulamalar: ad, telefon, adres, KVKK, bölge, ödeme, para üstü", async () => {
  const cases = [
    [{ name: "A" }, 400, /Ad soyad/],
    [{ name: "Ayşe123 Yılmaz" }, 400, /Ad soyad/],
    [{ phone: "1234" }, 400, /Telefon 0 ile başlamalı/],
    [{ address: "kısa" }, 400, /en az 10 karakter/],
    [{ address: "Şükrüpaşa <script> No:5 D:3" }, 400, /izin verilmeyen karakter/],
    [{ kvkk: false }, 400, /KVKK/],
    [{ zoneId: 999 }, 400, /teslimat yapılmıyor/],
    [{ zoneId: undefined }, 400, /bölgesini seçin/],
    [{ payment: "bitcoin" }, 400, /Ödeme yöntemini seçin/],
    [{ changeFor: 100 }, 400, /Para üstü/],
    [{ items: [] }, 400, /Sepetiniz boş/],
    [{ items: [{ productId: 13, qty: 0 }] }, 400, /Geçersiz adet/],
    [{ note: "x".repeat(301) }, 400, /en fazla 300/],
  ];
  for (const [patch, status, re] of cases) {
    const r = await post(orderBody({ phone: freshPhone(), ...patch }));
    assert.equal(r.status, status, `${JSON.stringify(patch)} → ${r.text}`);
    assert.match(r.json.error, re);
  }
});

test("telefon normalleştirilir (+90, boşluklu)", async () => {
  const r = await post(orderBody({ phone: "+90 533 999 88 77" }));
  assert.equal(r.status, 201, r.text);
  assert.equal(s.app.db.orders.find((o) => o.id === r.json.id).customer.phone, "05339998877");
});

test("minimum tutar altı reddedilir; gel-al'da adres zorunlu değil ve minimum yok", async () => {
  let r = await post(orderBody({ phone: freshPhone(), items: [{ productId: 13, qty: 1 }] }));
  assert.equal(r.status, 400);
  assert.equal(r.json.code, "MIN_TUTAR");
  assert.ok(r.json.quote, "hata yanıtında güncel teklif de döner");
  r = await post(orderBody({ phone: freshPhone(), type: "gelal", address: "", zoneId: undefined, items: [{ productId: 13, qty: 1 }] }));
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.total, 46.5);
});

test("kapalıyken red, ön sipariş açıksa kabul; durdurulmuşsa her zaman red", async () => {
  const ord = s.app.db.settings.ordering;
  s.setTime("2026-11-17T07:00:00.000Z"); // 10:00 — kapalı
  try {
    let r = await post(orderBody({ phone: freshPhone() }));
    assert.equal(r.status, 409);
    assert.equal(r.json.code, "KAPALI");
    assert.match(r.json.error, /14:00'te/);
    ord.allowPreorder = true;
    r = await post(orderBody({ phone: freshPhone() }));
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.order.preorder, true);
    ord.enabled = false;
    r = await post(orderBody({ phone: freshPhone() }));
    assert.equal(r.status, 409);
    assert.equal(r.json.code, "DURDURULDU");
  } finally {
    ord.allowPreorder = false;
    ord.enabled = true;
    s.setTime("2026-11-16T18:00:00.000Z");
  }
  const r = await post(orderBody({ phone: freshPhone() }));
  assert.equal(r.status, 201);
});

test("engelli telefon ve telefon başına aktif sipariş sınırı", async () => {
  s.app.db.settings.blockedPhones.push("05001112233");
  let r = await post(orderBody({ phone: "0500 111 22 33" }));
  assert.equal(r.status, 403);
  assert.equal(r.json.code, "ENGELLI");

  const phone = freshPhone();
  s.app.db.settings.ordering.maxActiveOrdersPerPhone = 2;
  try {
    assert.equal((await post(orderBody({ phone }))).status, 201);
    assert.equal((await post(orderBody({ phone }))).status, 201);
    r = await post(orderBody({ phone }));
    assert.equal(r.status, 429);
    assert.equal(r.json.code, "AKTIF_SINIR");
  } finally {
    s.app.db.settings.ordering.maxActiveOrdersPerPhone = 3;
  }
});

test("ödeme yöntemi kapalıysa ve gel-al kapalıysa red", async () => {
  const ord = s.app.db.settings.ordering;
  ord.payments.kart = false;
  ord.pickupEnabled = false;
  try {
    let r = await post(orderBody({ phone: freshPhone(), payment: "kart" }));
    assert.equal(r.status, 400);
    assert.match(r.json.error, /kartla ödeme alınmıyor/);
    r = await post(orderBody({ phone: freshPhone(), type: "gelal", zoneId: undefined }));
    assert.equal(r.status, 400);
    assert.equal(r.json.code, "GELAL_KAPALI");
  } finally {
    ord.payments.kart = true;
    ord.pickupEnabled = true;
  }
});

test("tükenen ürün, gizli ürün, adet sınırı → 409", async () => {
  product(20).soldOut = true;
  let r = await post(orderBody({ phone: freshPhone(), items: [{ productId: 13, qty: 5 }, { productId: 20, qty: 1 }] }));
  assert.equal(r.status, 409);
  assert.equal(r.json.code, "TUKENDI");
  assert.match(r.json.error, /tükendi/);
  product(20).soldOut = false;
  product(21).hidden = true;
  r = await post(orderBody({ phone: freshPhone(), items: [{ productId: 13, qty: 5 }, { productId: 21, qty: 1 }] }));
  assert.equal(r.status, 409);
  assert.equal(r.json.code, "SATISTA_DEGIL");
  product(21).hidden = false;
  product(22).maxPerOrder = 2;
  r = await post(orderBody({ phone: freshPhone(), items: [{ productId: 13, qty: 5 }, { productId: 22, qty: 3 }] }));
  assert.equal(r.status, 409);
  assert.equal(r.json.code, "ADET_SINIRI");
  product(22).maxPerOrder = null;
});

test("stok: siparişte düşer, 0 olunca tükendi sayılır, iptalde geri eklenir", async () => {
  const p = product(30);
  p.stock = 3;
  const items = [{ productId: 13, qty: 5 }, { productId: 30, qty: 3 }];
  const r = await post(orderBody({ phone: freshPhone(), items }));
  assert.equal(r.status, 201, r.text);
  assert.equal(p.stock, 0);
  const store = await s.req("GET", "/api/store");
  const pub = store.json.products.find((x) => x.id === 30);
  assert.equal(pub.soldOut, true);
  assert.equal(pub.maxQty, 0);
  assert.equal(pub.stock, undefined, "stok adedi müşteriye gösterilmez");
  const r2 = await post(orderBody({ phone: freshPhone(), items }));
  assert.equal(r2.status, 409);
  assert.equal(r2.json.code, "TUKENDI");
  // Müşteri iptali stoku geri ekler
  const c = await s.req("POST", `/api/orders/${r.json.id}/cancel`, { token: r.json.token });
  assert.equal(c.status, 200, c.text);
  assert.equal(p.stock, 3);
  assert.equal((await s.req("GET", "/api/store")).json.products.find((x) => x.id === 30).soldOut, false);
});

test("müşteri iptali: yalnızca Yeni durumunda; token ya da telefonla", async () => {
  const phone = freshPhone();
  let r = await post(orderBody({ phone }));
  const { id, token } = r.json;
  // Yanlış token
  r = await s.req("POST", `/api/orders/${id}/cancel`, { token: "0".repeat(24) });
  assert.equal(r.status, 404);
  // Telefonla iptal
  r = await s.req("POST", `/api/orders/${id}/cancel`, { phone, reason: "Yanlışlıkla verdim" });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "İptal");
  assert.equal(r.json.cancelledBy, "musteri");
  assert.equal(r.json.canCancel, false);
  const o = s.app.db.orders.find((x) => x.id === id);
  assert.equal(o.history.at(-1).by, "musteri");
  assert.equal(o.history.at(-1).note, "Yanlışlıkla verdim");
  r = await s.req("POST", `/api/orders/${id}/cancel`, { token });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, "IPTAL_EDILMIS");
  // Hazırlanıyor durumundaki sipariş iptal edilemez
  r = await post(orderBody({ phone: freshPhone() }));
  s.app.db.orders.find((x) => x.id === r.json.id).status = "Hazırlanıyor";
  const c = await s.req("POST", `/api/orders/${r.json.id}/cancel`, { token: r.json.token });
  assert.equal(c.status, 409);
  assert.equal(c.json.code, "IPTAL_EDILEMEZ");
});

test("gel-al siparişinde 'Yolda' → 'Hazır, teslim alabilirsiniz'", async () => {
  const r = await post(orderBody({ phone: freshPhone(), type: "gelal", zoneId: undefined }));
  s.app.db.orders.find((x) => x.id === r.json.id).status = "Yolda";
  const t = await s.req("GET", `/api/orders/${r.json.id}?token=${r.json.token}`);
  assert.equal(t.json.statusLabel, "Hazır, teslim alabilirsiniz");
});

test("honeypot doluysa sessizce reddedilir (sipariş oluşmaz)", async () => {
  const before = s.app.db.orders.length;
  const r = await post(orderBody({ phone: freshPhone(), website: "http://spam" }));
  assert.equal(r.status, 201);
  assert.equal(r.json.id, 0);
  assert.equal(s.app.db.orders.length, before);
});

test("Telegram hatası siparişi engellemez; ayarlıysa mesaj gönderilir", async () => {
  // Sahte Telegram sunucusu
  const got = [];
  const fake = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      got.push({ url: req.url, body: JSON.parse(b) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  const t = await start({ telegramApiBase: `http://127.0.0.1:${fake.address().port}` });
  try {
    t.app.db.settings.notify.telegramBotToken = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    t.app.db.settings.notify.telegramChatId = "42";
    const r = await t.req("POST", "/api/orders", orderBody());
    assert.equal(r.status, 201);
    for (let i = 0; i < 50 && !got.length; i++) await new Promise((x) => setTimeout(x, 20));
    assert.equal(got.length, 1);
    assert.equal(got[0].url, "/bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ/sendMessage");
    assert.equal(got[0].body.chat_id, "42");
    assert.match(got[0].body.text, /Yeni sipariş #1/);
    assert.match(got[0].body.text, /Ayşe Yılmaz/);
  } finally {
    await t.close();
    fake.close();
  }
  // Ulaşılamayan Telegram: sipariş yine de alınır
  const t2 = await start({ telegramApiBase: "http://127.0.0.1:1" });
  try {
    t2.app.db.settings.notify.telegramBotToken = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    t2.app.db.settings.notify.telegramChatId = "42";
    const r = await t2.req("POST", "/api/orders", orderBody());
    assert.equal(r.status, 201);
  } finally {
    await t2.close();
  }
});

test("takip: telefonun son 10 hanesiyle sorgu", async () => {
  const r = await post(orderBody({ phone: "05357654321" }));
  const t = await s.req("GET", `/api/orders/${r.json.id}?phone=5357654321`);
  assert.equal(t.status, 200);
  assert.equal(t.json.token, r.json.token);
  const bad = await s.req("GET", `/api/orders/${r.json.id}?phone=05350000000`);
  assert.equal(bad.status, 404);
});
