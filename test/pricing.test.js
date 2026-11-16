"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start } = require("./helpers");

let s;
before(async () => {
  s = await start();
  const db = s.app.db;
  db.settings.ordering.deliveryFee = 25;
  db.settings.ordering.freeDeliveryOver = 500;
  db.settings.ordering.minOrder = 200;
  db.coupons.push(
    { id: 2, code: "YUZDE10", type: "yuzde", value: 10, minOrder: 0, maxUses: null, usedCount: 0, perPhoneLimit: null, startsAt: null, endsAt: null, active: true, description: "" },
    { id: 3, code: "TUTAR50", type: "tutar", value: 50, minOrder: 300, maxUses: 1, usedCount: 0, perPhoneLimit: null, startsAt: null, endsAt: null, active: true, description: "" },
    { id: 4, code: "KARGOBEDAVA", type: "ucretsizTeslimat", value: 0, minOrder: 0, maxUses: null, usedCount: 0, perPhoneLimit: null, startsAt: null, endsAt: null, active: true, description: "" },
    { id: 5, code: "ESKI", type: "yuzde", value: 20, minOrder: 0, maxUses: null, usedCount: 0, perPhoneLimit: null, startsAt: null, endsAt: "2026-01-01T00:00:00.000Z", active: true, description: "" },
    { id: 6, code: "BIRKEZ", type: "tutar", value: 10, minOrder: 0, maxUses: null, usedCount: 0, perPhoneLimit: 1, startsAt: null, endsAt: null, active: true, description: "" }
  );
  const p = db.products.find((x) => x.id === 14);
  p.maxPerOrder = 3;
  db.products.find((x) => x.id === 15).stock = 2;
  db.products.find((x) => x.id === 16).soldOut = true;
  db.products.find((x) => x.id === 17).hidden = true;
  s.app.save();
});
after(() => s.close());

const quote = (body) => s.req("POST", "/api/cart/quote", body);
const milk = (qty) => [{ productId: 13, qty }]; // 46,5 ₺

test("ara toplam, bölge, minimum tutar eksiği", async () => {
  const r = await quote({ items: milk(2), type: "teslimat", zoneId: 1 });
  assert.equal(r.status, 200);
  assert.equal(r.json.subtotal, 93);
  assert.equal(r.json.deliveryFee, 25);
  assert.equal(r.json.total, 118);
  assert.equal(r.json.minOrder, 200);
  assert.equal(r.json.minOrderRemaining, 107);
  assert.equal(r.json.freeDeliveryRemaining, 407);
  assert.equal(r.json.canOrder, false);
  assert.deepEqual(r.json.errors.map((e) => e.code), ["MIN_TUTAR"]);
  assert.equal(r.json.status, undefined);
});

test("ücretsiz teslimat eşiği ve bölgeye özel ücret/minimum", async () => {
  let r = await quote({ items: milk(11), type: "teslimat", zoneId: 1 }); // 511,5
  assert.equal(r.json.deliveryFee, 0);
  assert.equal(r.json.freeDelivery, true);
  assert.equal(r.json.total, 511.5);
  r = await quote({ items: milk(5), type: "teslimat", zoneId: 7 }); // Diğer: ücret 40, minimum 400
  assert.equal(r.json.deliveryFee, 40);
  assert.equal(r.json.minOrder, 400);
  assert.equal(r.json.etaMinutes, 45);
  assert.equal(r.json.errors[0].code, "MIN_TUTAR");
});

test("gel-al: teslimat ücreti ve minimum tutar yok, bölge gerekmez", async () => {
  const r = await quote({ items: milk(1), type: "gelal" });
  assert.equal(r.json.deliveryFee, 0);
  assert.equal(r.json.minOrder, 0);
  assert.equal(r.json.total, 46.5);
  assert.equal(r.json.canOrder, true);
});

test("bölge seçilmemiş / geçersiz bölge", async () => {
  let r = await quote({ items: milk(5), type: "teslimat" });
  assert.ok(r.json.errors.some((e) => e.code === "BOLGE_SECIN"));
  r = await quote({ items: milk(5), type: "teslimat", zoneId: 999 });
  assert.ok(r.json.errors.some((e) => e.code === "BOLGE_GECERSIZ"));
});

test("kuponlar: yüzde, tutar (alt sınır), ücretsiz teslimat, süresi dolmuş, geçersiz", async () => {
  let r = await quote({ items: milk(5), type: "teslimat", zoneId: 1, couponCode: "yuzde10" });
  assert.equal(r.json.discount, 23.25);
  assert.equal(r.json.coupon.valid, true);
  assert.equal(r.json.coupon.code, "YUZDE10");
  assert.equal(r.json.total, 232.5 - 23.25 + 25);

  r = await quote({ items: milk(5), type: "teslimat", zoneId: 1, couponCode: "TUTAR50" });
  assert.equal(r.json.coupon.valid, false);
  assert.match(r.json.coupon.message, /300 ₺ ve üzeri/);
  assert.equal(r.json.discount, 0);
  r = await quote({ items: milk(7), type: "teslimat", zoneId: 1, couponCode: "TUTAR50" });
  assert.equal(r.json.discount, 50);

  r = await quote({ items: milk(5), type: "teslimat", zoneId: 1, couponCode: "KARGOBEDAVA" });
  assert.equal(r.json.deliveryFee, 0);
  assert.equal(r.json.discount, 0);
  assert.equal(r.json.total, 232.5);
  r = await quote({ items: milk(5), type: "gelal", couponCode: "KARGOBEDAVA" });
  assert.equal(r.json.coupon.valid, false);

  // Küçük harf ve Türkçe "i" sorunu: "birkez" → BIRKEZ (BİRKEZ değil)
  r = await quote({ items: milk(5), type: "teslimat", zoneId: 1, couponCode: " birkez ", phone: "05440000099" });
  assert.equal(r.json.coupon.valid, true, JSON.stringify(r.json.coupon));
  assert.equal(r.json.coupon.code, "BIRKEZ");
  assert.equal(r.json.discount, 10);

  r = await quote({ items: milk(5), type: "teslimat", zoneId: 1, couponCode: "ESKI" });
  assert.equal(r.json.coupon.message, "Bu kuponun süresi doldu.");
  r = await quote({ items: milk(5), type: "teslimat", zoneId: 1, couponCode: "YOKBOYLE" });
  assert.equal(r.json.coupon.message, "Kupon kodu geçersiz.");
  r = await quote({ items: milk(5), type: "teslimat", zoneId: 1, couponCode: "HOSGELDIN" }); // pasif
  assert.equal(r.json.coupon.valid, false);
});

test("tükenen/gizli ürün çıkarılır, adet sınırı ve stok uygulanır", async () => {
  const r = await quote({
    items: [
      { productId: 13, qty: 5 },
      { productId: 14, qty: 10 }, // maxPerOrder 3
      { productId: 15, qty: 5 }, // stok 2
      { productId: 16, qty: 1 }, // tükendi
      { productId: 17, qty: 1 }, // gizli
      { productId: 99999, qty: 1 },
      { productId: 13, qty: 1 }, // aynı ürün birleşir
    ],
    type: "gelal",
  });
  const items = Object.fromEntries(r.json.items.map((i) => [i.productId, i.qty]));
  assert.deepEqual(items, { 13: 6, 14: 3, 15: 2 });
  assert.deepEqual(r.json.removed.map((x) => [x.productId, x.code]), [[16, "TUKENDI"], [17, "SATISTA_DEGIL"], [99999, "SATISTA_DEGIL"]]);
  assert.deepEqual(r.json.adjusted.map((x) => [x.productId, x.qty]), [[14, 3], [15, 2]]);
  assert.match(r.json.adjusted[1].reason, /stokta 2/);
  assert.equal(r.json.warnings.length, 5);
});

test("kapalıyken teklif KAPALI hatası içerir; fiyat istemciden alınmaz", async () => {
  s.setTime("2026-11-17T07:00:00.000Z"); // 10:00
  try {
    const r = await quote({ items: [{ productId: 13, qty: 5, price: 1 }], type: "teslimat", zoneId: 1 });
    assert.ok(r.json.errors.some((e) => e.code === "KAPALI"));
    assert.equal(r.json.subtotal, 232.5);
  } finally {
    s.setTime("2026-11-16T18:00:00.000Z");
  }
});

test("boş sepet", async () => {
  const r = await quote({ items: [] });
  assert.equal(r.json.errors[0].code, "BOS_SEPET");
});

test("telefon başına kupon sınırı (sipariş verildikten sonra)", async () => {
  const body = { name: "Ali Veli", phone: "05440000001", address: "Meydan Mah. Bir Sok. No:1", zoneId: 2, kvkk: true, items: milk(5), couponCode: "BIRKEZ" };
  let r = await s.req("POST", "/api/orders", body);
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.order.discount, 10);
  r = await quote({ items: milk(5), type: "teslimat", zoneId: 2, couponCode: "BIRKEZ", phone: "0544 000 00 01" });
  assert.equal(r.json.coupon.message, "Bu kuponu kullanım hakkınız doldu.");
  r = await s.req("POST", "/api/orders", body);
  assert.equal(r.status, 400);
  assert.equal(r.json.code, "KUPON");
});
