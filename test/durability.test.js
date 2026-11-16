"use strict";
// Dayanıklılık: eşzamanlı siparişler, son stok, kupon kullanım sınırı, yeniden başlatma
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { start, tmpDir, orderBody } = require("./helpers");

const fast = { rateLimits: { orders: { windowMs: 60000, max: 1000 } } };
const phone = (i) => `0532${String(1000000 + i).slice(-7)}`;

test("50 eşzamanlı sipariş: stok aşılmaz, numaralar benzersiz, diskteki veri tutarlı", async () => {
  const dir = tmpDir();
  let s = await start({ dataDir: dir, ...fast });
  try {
    const admin = await s.login();
    let r = await s.req("POST", "/api/admin/products", { name: "Kampanya Ürünü", price: 300, categoryId: 1, stock: 30 }, admin);
    const pid = r.json.id;
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => s.req("POST", "/api/orders", orderBody({ phone: phone(i), items: [{ productId: pid, qty: 1 }] })))
    );
    const ok = results.filter((x) => x.status === 201);
    const failed = results.filter((x) => x.status !== 201);
    assert.equal(ok.length, 30);
    assert.ok(failed.every((x) => x.status === 409 && ["TUKENDI", "SATISTA_DEGIL"].includes(x.json.code)), failed.map((x) => x.text).join("\n"));
    const ids = ok.map((x) => x.json.id).sort((a, b) => a - b);
    assert.deepEqual(ids, Array.from({ length: 30 }, (_, i) => i + 1));
    assert.equal(s.app.db.products.find((p) => p.id === pid).stock, 0);
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "db.json"), "utf8"));
    assert.equal(onDisk.orders.length, 30);
    assert.equal(onDisk.products.find((p) => p.id === pid).stock, 0);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes(".tmp-")), []);
    // Yeniden başlatınca veri ve oturum korunur
    await s.close(true);
    s = await start({ dataDir: dir, ...fast });
    assert.equal(s.app.db.orders.length, 30);
    assert.equal((await s.req("GET", "/api/admin/orders?pageSize=5", undefined, admin)).json.total, 30);
    // İptal edilen siparişin stoğu geri gelir; geri gelen tek adedi iki müşteri aynı anda isterse yalnız biri alır
    r = await s.req("PATCH", "/api/admin/orders/1", { status: "İptal" }, admin);
    assert.equal(s.app.db.products.find((p) => p.id === pid).stock, 1);
    const two = await Promise.all([phone(100), phone(101)].map((ph) => s.req("POST", "/api/orders", orderBody({ phone: ph, items: [{ productId: pid, qty: 1 }] }))));
    assert.deepEqual(two.map((x) => x.status).sort(), [201, 409]);
    assert.equal(s.app.db.products.find((p) => p.id === pid).stock, 0);
    assert.equal((await s.req("GET", "/api/store")).json.products.find((p) => p.id === pid).soldOut, true);
  } finally {
    await s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("kupon kullanım sınırı eşzamanlı isteklerde aşılmaz; iptal edilince hak geri gelir", async () => {
  const s = await start(fast);
  try {
    const admin = await s.login();
    let r = await s.req("POST", "/api/admin/coupons", { code: "TEKSEFER", type: "tutar", value: 20, maxUses: 1, active: true }, admin);
    assert.equal(r.status, 201, r.text);
    const results = await Promise.all([1, 2, 3].map((i) => s.req("POST", "/api/orders", orderBody({ phone: phone(200 + i), couponCode: "teksefer" }))));
    const ok = results.filter((x) => x.status === 201);
    assert.equal(ok.length, 1);
    assert.ok(results.filter((x) => x.status !== 201).every((x) => x.status === 400 && x.json.code === "KUPON" && /kullanım sınırı/.test(x.json.error)));
    assert.equal(s.app.db.coupons.find((c) => c.code === "TEKSEFER").usedCount, 1);
    r = await s.req("POST", `/api/orders/${ok[0].json.id}/cancel`, { token: ok[0].json.token });
    assert.equal(r.status, 200);
    assert.equal(s.app.db.coupons.find((c) => c.code === "TEKSEFER").usedCount, 0);
    r = await s.req("POST", "/api/orders", orderBody({ phone: phone(210), couponCode: "TEKSEFER" }));
    assert.equal(r.status, 201);
    assert.equal(r.json.order.discount, 20);
  } finally {
    await s.close();
  }
});
