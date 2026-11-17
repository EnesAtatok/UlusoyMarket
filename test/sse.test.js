"use strict";
// Canlı güncelleme (SSE): bilet akışı, olay biçimi, yetki, sınırlar, kalp atışı, temizlik
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, orderBody } = require("./helpers");
const { openSse, sleep } = require("./sse-client");

let s;
let admin;
before(async () => {
  s = await start({ rateLimits: { orders: { windowMs: 60000, max: 1000 } }, sse: { heartbeatMs: 150, maxPerIp: 3 } });
  admin = await s.login();
});
after(() => s.close());

let seq = 0;
const newOrder = async () => {
  const r = await s.req("POST", "/api/orders", orderBody({ phone: `0533${String(1000000 + ++seq).padStart(7, "0")}` }));
  assert.equal(r.status, 201, r.text);
  return r.json;
};
const ticketFor = (orders) => s.req("POST", "/api/orders/stream-ticket", { orders });
const waitSubs = async (n) => {
  for (let i = 0; i < 50 && s.app.events.subs.size !== n; i++) await sleep(10);
  return s.app.events.subs.size;
};

test("müşteri: bilet → akış; kendi siparişinin durum değişikliği anında gelir, başkasınınki gelmez", async () => {
  const a = await newOrder();
  const b = await newOrder();
  const t = await ticketFor([{ id: a.id, token: a.token }, { id: b.id, token: "0".repeat(24) }]);
  assert.equal(t.status, 201, t.text);
  assert.deepEqual(t.json.orders, [a.id]);
  assert.deepEqual(t.json.missing, [b.id]);
  assert.match(t.json.ticket, /^[A-Za-z0-9_-]{20,64}$/);
  assert.ok(t.json.ttlSeconds > 0);
  // Bilet URL'de; token ve Bearer URL'de değil. Tarayıcı gzip istese de akış sıkıştırılmaz.
  const es = await openSse(s.base, `/api/orders/stream?ticket=${t.json.ticket}`, { "Accept-Encoding": "gzip, deflate, br" });
  try {
    assert.equal(es.status, 200);
    assert.match(es.headers["content-type"], /^text\/event-stream/);
    assert.equal(es.headers["content-encoding"], undefined);
    assert.match(es.headers["cache-control"], /no-transform/);
    assert.equal(es.headers["x-accel-buffering"], "no");
    assert.equal(es.headers["content-length"], undefined);
    const hello = await es.waitEvent("hello");
    assert.ok(hello, "hello olayı");
    assert.equal(hello.id, null, "hello'nun id'si yok (Last-Event-ID'yi değiştirmez)");
    assert.equal(hello.json.orders.length, 1);
    assert.equal(hello.json.orders[0].id, a.id);
    assert.equal(hello.json.orders[0].token, undefined, "akışta token yok");
    assert.ok(hello.json.boot);
    assert.ok(es.retry > 0);

    // Başkasının (B) siparişi değişir → bu akışa hiçbir şey gelmez
    const n0 = es.events.length;
    await s.req("PATCH", `/api/admin/orders/${b.id}`, { status: "Hazırlanıyor" }, admin);
    await sleep(150);
    assert.equal(es.events.length, n0, "başka siparişin olayı sızdı");

    // Kendi siparişi
    await s.req("PATCH", `/api/admin/orders/${a.id}`, { status: "Hazırlanıyor" }, admin);
    const ev = await es.waitFor((e) => e.event === "siparis" && e.json.status === "Hazırlanıyor", 2000, n0);
    assert.ok(ev, "durum değişikliği gelmedi");
    assert.ok(ev.id > 0);
    assert.equal(ev.json.id, a.id);
    assert.equal(ev.json.statusLabel, "Hazırlanıyor");
    assert.equal(ev.json.token, undefined);
    assert.equal(ev.json.customer.phone, undefined, "müşteriye telefon/adres gitmez");
    assert.ok(ev.json.history.length >= 2);

    // Kalp atışı (yorum satırı)
    for (let i = 0; i < 40 && !es.comments.some((c) => c.startsWith("ping")); i++) await sleep(20);
    assert.ok(es.comments.some((c) => c.startsWith("ping")), "kalp atışı yok");

    // Silinen sipariş
    await s.req("PATCH", `/api/admin/orders/${a.id}`, { status: "Teslim edildi" }, admin);
    const del = await s.req("POST", "/api/admin/orders/bulk", { ids: [a.id], action: "delete" }, admin);
    assert.equal(del.json.processed, 1);
    assert.ok(await es.waitFor((e) => e.event === "siparis.silindi" && e.json.id === a.id));
  } finally {
    es.close();
  }
  assert.equal(await waitSubs(0), 0, "kapanan bağlantı temizlenmedi");
});

test("bilet: tek kullanımlık, süreli, aynı IP'ye bağlı; yanlış token ile bilet verilmez", async () => {
  const a = await newOrder();
  // Yalnızca yanlış token → 404
  let r = await ticketFor([{ id: a.id, token: "f".repeat(24) }]);
  assert.equal(r.status, 404);
  r = await ticketFor([{ id: a.id }]);
  assert.equal(r.status, 404);
  // Biçim hataları
  assert.equal((await s.req("POST", "/api/orders/stream-ticket", { orders: [] })).status, 400);
  assert.equal((await s.req("POST", "/api/orders/stream-ticket", { orders: Array.from({ length: 31 }, (_, i) => ({ id: i + 1, token: "x" })) })).status, 400);
  // Biletsiz / uydurma bilet
  let es = await openSse(s.base, "/api/orders/stream");
  assert.equal(es.status, 403);
  assert.equal(es.json.code, "BILET_GECERSIZ");
  es = await openSse(s.base, `/api/orders/stream?ticket=${"A".repeat(32)}`);
  assert.equal(es.status, 403);
  // Tekrar kullanım
  const t = (await ticketFor([{ id: a.id, token: a.token }])).json.ticket;
  const first = await openSse(s.base, `/api/orders/stream?ticket=${t}`);
  assert.equal(first.status, 200);
  first.close();
  const again = await openSse(s.base, `/api/orders/stream?ticket=${t}`);
  assert.equal(again.status, 403, "bilet ikinci kez kullanılabildi");
  assert.equal(again.json.code, "BILET_GECERSIZ");
  // Müşteri bileti panel akışında geçmez
  const t2 = (await ticketFor([{ id: a.id, token: a.token }])).json.ticket;
  const wrongKind = await openSse(s.base, `/api/admin/stream?ticket=${t2}`);
  assert.equal(wrongKind.status, 403);
  await waitSubs(0);
});

test("bilet süresi dolunca 410; başka IP'den kullanılamaz", async () => {
  const t = await start({ trustProxy: true, sse: { ticketTtlMs: 60 } });
  try {
    const o = (await t.req("POST", "/api/orders", orderBody(), undefined, { "X-Forwarded-For": "10.0.0.1" })).json;
    const issue = async (ip) =>
      (await t.req("POST", "/api/orders/stream-ticket", { orders: [{ id: o.id, token: o.token }] }, undefined, { "X-Forwarded-For": ip })).json.ticket;
    let tk = await issue("10.0.0.1");
    await sleep(120);
    let es = await openSse(t.base, `/api/orders/stream?ticket=${tk}`, { "X-Forwarded-For": "10.0.0.1" });
    assert.equal(es.status, 410);
    assert.equal(es.json.code, "BILET_SURESI_DOLDU");
    tk = await issue("10.0.0.1");
    es = await openSse(t.base, `/api/orders/stream?ticket=${tk}`, { "X-Forwarded-For": "10.0.0.2" });
    assert.equal(es.status, 403, "bilet başka IP'den kullanıldı");
  } finally {
    await t.close();
  }
});

test("bağlantı sınırı (IP başına) aşılınca 429; kapananlar sayılmaz", async () => {
  const a = await newOrder();
  const open = [];
  try {
    for (let i = 0; i < 3; i++) {
      const tk = (await ticketFor([{ id: a.id, token: a.token }])).json.ticket;
      const es = await openSse(s.base, `/api/orders/stream?ticket=${tk}`);
      assert.equal(es.status, 200);
      open.push(es);
    }
    const tk = (await ticketFor([{ id: a.id, token: a.token }])).json.ticket;
    const extra = await openSse(s.base, `/api/orders/stream?ticket=${tk}`);
    assert.equal(extra.status, 429);
    assert.equal(extra.json.code, "AKIS_SINIRI");
    open.pop().close();
    await waitSubs(2);
    const tk2 = (await ticketFor([{ id: a.id, token: a.token }])).json.ticket;
    const ok = await openSse(s.base, `/api/orders/stream?ticket=${tk2}`);
    assert.equal(ok.status, 200);
    open.push(ok);
  } finally {
    for (const es of open) es.close();
  }
  assert.equal(await waitSubs(0), 0);
});

test("panel: Bearer ile bilet, yeni sipariş ve güncellemeler anında; çıkışta akış kapanır", async () => {
  assert.equal((await s.req("POST", "/api/admin/stream-ticket", {})).status, 401);
  const tok = await s.login();
  const t = await s.req("POST", "/api/admin/stream-ticket", {}, tok);
  assert.equal(t.status, 201);
  const es = await openSse(s.base, `/api/admin/stream?ticket=${t.json.ticket}`);
  try {
    assert.equal(es.status, 200);
    const hello = await es.waitEvent("hello");
    assert.ok(hello.json.latestId >= 1);
    assert.ok(hello.json.status && "isOpen" in hello.json.status);
    const n = es.events.length;
    const o = await newOrder();
    const ev = await es.waitFor((e) => e.event === "siparis.yeni" && e.json.id === o.id, 2000, n);
    assert.ok(ev, "yeni sipariş olayı gelmedi");
    assert.equal(ev.json.customer.phone.length, 11, "panel tam sipariş nesnesini alır");
    // Müşteri iptali panele de düşer
    await s.req("POST", `/api/orders/${o.id}/cancel`, { token: o.token });
    assert.ok(await es.waitFor((e) => e.event === "siparis.guncellendi" && e.json.id === o.id && e.json.status === "İptal", 2000, n));
    // Saat değişikliği → durum olayı
    const days = s.app.db.settings.hours.days.map((d) => ({ ...d, close: "03:00" }));
    await s.req("PATCH", "/api/admin/settings", { hours: { days } }, admin);
    const st = await es.waitFor((e) => e.event === "durum", 2000, n);
    assert.ok(st);
    assert.equal(st.json.status.today.close, "03:00");
    // Çıkış → akış "oturum" olayıyla kapanır
    await s.req("POST", "/api/admin/logout", {}, tok);
    assert.ok(await es.waitEvent("oturum"));
    assert.ok(await es.waitEnd());
  } finally {
    es.close();
  }
});

test("panel: oturum kapanmış biletle akış açılmaz; pasif kullanıcının akışı kalp atışında kapanır", async () => {
  const tok = await s.login();
  const tk = (await s.req("POST", "/api/admin/stream-ticket", {}, tok)).json.ticket;
  await s.req("POST", "/api/admin/logout", {}, tok);
  const es = await openSse(s.base, `/api/admin/stream?ticket=${tk}`);
  assert.equal(es.status, 401);
  // Personel hesabı pasifleştirilince açık akış kapanır
  await s.req("POST", "/api/admin/users", { username: "kasa1", password: "kasa12345", role: "personel" }, admin);
  const staff = await s.login("kasa1", "kasa12345");
  const tk2 = (await s.req("POST", "/api/admin/stream-ticket", {}, staff)).json.ticket;
  const live = await openSse(s.base, `/api/admin/stream?ticket=${tk2}`);
  assert.equal(live.status, 200);
  const u = s.app.db.users.find((x) => x.username === "kasa1");
  await s.req("PATCH", `/api/admin/users/${u.id}`, { active: false }, admin);
  assert.ok(await live.waitEvent("oturum", 2000), "pasif kullanıcının akışı kapanmadı");
  live.close();
});

test("yeniden bağlanmada lastEventId ile kaçırılan olaylar gönderilir", async () => {
  const a = await newOrder();
  const t1 = (await ticketFor([{ id: a.id, token: a.token }])).json.ticket;
  const es = await openSse(s.base, `/api/orders/stream?ticket=${t1}`);
  await es.waitEvent("hello");
  await s.req("PATCH", `/api/admin/orders/${a.id}`, { status: "Hazırlanıyor" }, admin);
  const ev = await es.waitEvent("siparis");
  es.close();
  await s.req("PATCH", `/api/admin/orders/${a.id}`, { status: "Yolda" }, admin); // bağlantı yokken
  const t2 = (await ticketFor([{ id: a.id, token: a.token }])).json.ticket;
  const es2 = await openSse(s.base, `/api/orders/stream?ticket=${t2}&lastEventId=${ev.id}`);
  try {
    const hello = await es2.waitEvent("hello");
    assert.equal(hello.json.orders[0].status, "Yolda", "hello güncel durumu taşır");
    const missed = await es2.waitFor((e) => e.event === "siparis" && e.json.status === "Yolda");
    assert.ok(missed, "kaçırılan olay gelmedi");
  } finally {
    es2.close();
  }
});

test("yoklama yedek yolu: takip yanıtı önbelleğe alınmaz, ETag/304 yok, durum hemen yansır", async () => {
  const a = await newOrder();
  const url = `/api/orders/${a.id}?token=${a.token}`;
  const r1 = await s.req("GET", url);
  assert.equal(r1.headers.get("cache-control"), "no-store");
  assert.equal(r1.headers.get("etag"), null);
  await s.req("PATCH", `/api/admin/orders/${a.id}`, { status: "Hazırlanıyor" }, admin);
  const r2 = await s.req("GET", url, undefined, undefined, { "If-None-Match": '"x"', "If-Modified-Since": new Date().toUTCString() });
  assert.equal(r2.status, 200);
  assert.equal(r2.json.status, "Hazırlanıyor");
  const r3 = await s.req("POST", "/api/orders/lookup", { orders: [{ id: a.id, token: a.token }] });
  assert.equal(r3.headers.get("cache-control"), "no-store");
  assert.equal(r3.json.orders[0].status, "Hazırlanıyor");
});
