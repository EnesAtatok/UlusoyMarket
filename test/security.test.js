"use strict";
// Güvenlik: yetki denetimi (her yönetim ucu), hız sınırı atlatma, veri dosyalarına erişim,
// sunucu sayfalarında kaçışlama, CSV formül koruması, bozuk/kötü niyetli yedek, hata yanıtları
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { start, orderBody } = require("./helpers");

let s;
let admin;
let staff;
before(async () => {
  s = await start({ rateLimits: { orders: { windowMs: 60000, max: 1000 }, lookup: { windowMs: 60000, max: 3 } } });
  admin = await s.login();
  await s.req("POST", "/api/admin/users", { username: "kasa", role: "personel", password: "personel1" }, admin);
  staff = await s.login("kasa", "personel1");
});
after(() => s.close());

function raw(p, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(s.base + p, { method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

const adminRoutes = () =>
  s.inst.router.routes
    // /api/admin/stream Bearer değil, tek kullanımlık bilet ister (EventSource başlık gönderemez; bkz. sse.test.js)
    .filter((r) => r.pattern.startsWith("/api/admin/") && r.pattern !== "/api/admin/login" && r.pattern !== "/api/admin/stream")
    .map((r) => ({
      method: r.method,
      // ":id" gibi parametreler örnek değerle doldurulur
      path: r.pattern.replace(":phone", "05321234567").replace(":name", "db-2026-01-01.json").replace(/:\w+/g, "1"),
      role: r.opts.role || null,
    }));

test("her yönetim ucu oturumsuz ve sahte belirteçle 401 döner", async () => {
  const routes = adminRoutes();
  assert.ok(routes.length >= 45, `uç sayısı: ${routes.length}`);
  for (const r of routes) {
    for (const tok of [null, "a".repeat(64), "yanlis"]) {
      const res = await s.req(r.method, r.path, r.method === "GET" ? undefined : {}, tok);
      assert.equal(res.status, 401, `${r.method} ${r.path} (${tok})`);
      assert.equal(res.json.code, "OTURUM");
    }
  }
});

test("yalnızca yöneticiye açık her uç personel rolüyle 403 döner", async () => {
  const routes = adminRoutes().filter((r) => r.role === "yonetici");
  assert.ok(routes.length >= 30);
  for (const r of routes) {
    const res = await s.req(r.method, r.path, r.method === "GET" ? undefined : {}, staff);
    assert.equal(res.status, 403, `${r.method} ${r.path}`);
  }
  // Personel açık uçlarda yetki dışı alan değiştiremez
  assert.equal((await s.req("PATCH", "/api/admin/products/1", { name: "x" }, staff)).status, 403);
  assert.equal((await s.req("POST", "/api/admin/products/bulk", { ids: [1], action: "price", percent: 10 }, staff)).status, 403);
  assert.equal((await s.req("POST", "/api/admin/orders/bulk", { ids: [1], action: "delete" }, staff)).status, 403);
});

test("başka müşterinin siparişi yanlış anahtar/telefonla okunamaz ve iptal edilemez", async () => {
  const r = await s.req("POST", "/api/orders", orderBody({ phone: "05551230001" }));
  const { id, token } = r.json;
  assert.equal((await s.req("GET", `/api/orders/${id}?token=${"0".repeat(24)}`)).status, 404);
  assert.equal((await s.req("POST", `/api/orders/${id}/cancel`, { token: "x" })).status, 404);
  assert.equal((await s.req("POST", `/api/orders/${id}/cancel`, { token: { $ne: 1 } })).status, 404);
  assert.equal((await s.req("GET", `/api/orders/${id}?token=${token}`)).json.status, "Yeni");
});

test("telefonla sorgu hız sınırı sahte anahtar eklenerek atlatılamaz", async () => {
  s.app.limiters.lookup.reset("127.0.0.1");
  s.app.db.settings.privacy.phoneLookup = true; // varsayılan kapalı; sınır davranışı açıkken denenir
  for (let i = 0; i < 3; i++) assert.equal((await s.req("GET", `/api/orders/1?token=yanlis&phone=0532000${String(i).padStart(4, "0")}`)).status, 404);
  const r = await s.req("GET", "/api/orders/1?token=yanlis&phone=05329999999");
  assert.equal(r.status, 429);
  // İptal artık yalnızca token ile: telefon hiç denenmez
  assert.equal((await s.req("POST", "/api/orders/1/cancel", { token: "yanlis", phone: "05329999999" })).status, 404);
  // Doğru anahtar hız sınırından etkilenmez
  const o = s.app.db.orders[0];
  assert.equal((await s.req("GET", `/api/orders/${o.id}?token=${o.token}`)).status, 200);
  s.app.limiters.lookup.reset("127.0.0.1");
  s.app.db.settings.privacy.phoneLookup = false;
});

test("db.json, sessions.json, yedekler ve kaynak dosyalar HTTP ile okunamaz", async () => {
  // Gerçek yedek dosyası oluşsun
  s.app.store.backupNow("elle");
  const backupName = fs.readdirSync(path.join(s.dataDir, "backups"))[0];
  const paths = [
    "/db.json", "/data/db.json", "/sessions.json", "/data/sessions.json", "/backups/" + backupName, "/data/backups/" + backupName,
    "/uploads/../db.json", "/uploads/..%2fdb.json", "/uploads/..%5cdb.json", "/uploads/%2e%2e/db.json", "/uploads/%2e%2e%2fsessions.json",
    "/uploads/x%5c..%5c..%5cdb.json", "/uploads/..%5c..%5cserver.js", "/..%5cserver.js", "/img/..%5c..%5cserver.js", "/%2e%2e%5cpackage.json",
    "/lib/app.js", "/server.js", "/package.json", "/data/seed.json", "/test/helpers.js", "/.git/config", "/uploads/.htaccess",
    "/api/admin/backups/..%2f..%2fdb.json", "/api/admin/backups/..%5cdb.json",
  ];
  for (const p of paths) {
    const r = await raw(p);
    assert.notEqual(r.status, 200, p);
    assert.ok(!/"passHash"|"orders"\s*:|userId|createApp|"scripts"/.test(r.body), p);
  }
  // Yönetici bile yedek indirme ucundan klasör dışına çıkamaz
  for (const name of ["..%2fdb.json", "..%5cdb.json", "%2e%2e%2fsessions.json"]) {
    const r = await s.req("GET", `/api/admin/backups/${name}`, undefined, admin);
    assert.equal(r.status, 404, name);
  }
});

test("sunucu sayfalarında ayarlardaki metinler kaçışlanır (XSS)", async () => {
  const x = `<script>alert(1)</script><img src=x onerror=alert(2)>"'`;
  const zones = s.app.db.settings.zones.map((z) => ({ ...z }));
  zones[0].name = `Bölge ${x}`.slice(0, 80);
  let r = await s.req(
    "PATCH",
    "/api/admin/settings",
    {
      store: { name: `Market ${x}`.slice(0, 80), slogan: x, about: `${x}\n\n## ${x}\n- ${x}`, address: x, phone: x.slice(0, 30), city: x.slice(0, 60) },
      legal: { companyTitle: x, taxNo: x.slice(0, 20), texts: { kvkk: `## ${x}\n${x}\n- ${x}` } },
      zones,
      faq: [{ q: `${x}?`, a: x }],
      announcement: { text: x, active: true },
    },
    admin
  );
  assert.equal(r.status, 200, r.text);
  const slug = r.json.settings.zones[0].slug;
  for (const p of ["/", "/hakkimizda", "/kvkk", "/mesafeli-satis", "/teslimat", `/teslimat/${slug}`, "/yok-boyle-sayfa", "/sitemap.xml"]) {
    const res = await raw(p);
    assert.ok(!res.body.includes("<script>alert"), `${p}: <script> kaçışlanmamış`);
    assert.ok(!res.body.includes("<img src=x"), `${p}: <img> kaçışlanmamış`);
  }
  // JSON-LD içinde </script> kapanışı kırılamaz
  const home = await raw("/");
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(home.body);
  assert.ok(ld);
  assert.ok(!ld[1].includes("<"));
  JSON.parse(ld[1]);
  // Mağaza API'si metni olduğu gibi döner (kaçışlama istemcide yapılır), ama veri bozulmaz
  const store = await s.req("GET", "/api/store");
  assert.equal(store.json.announcement.text, x);
  // Sonraki testler için ayarları geri al
  await s.req("POST", "/api/admin/restore", { ...s.app.store.readSeed(), orders: [], users: s.app.db.users }, admin);
  admin = await s.login();
  staff = await s.login("kasa", "personel1");
});

test("CSV dışa aktarmada = + - @ ile başlayan hücreler formül olarak çalışmaz", async () => {
  let r = await s.req("POST", "/api/admin/products", { name: "=HYPERLINK(\"http://x\")", brand: "+cmd", description: "@SUM(1)", unit: "-1+1", price: 5, categoryId: 1, emoji: "=1+1" }, admin);
  assert.equal(r.status, 201, r.text);
  const csv = (await s.req("GET", "/api/admin/products/export", undefined, admin)).text;
  const line = csv.split("\r\n").find((l) => l.includes("HYPERLINK"));
  for (const cell of line.split(";").map((c) => c.replace(/^"|"$/g, ""))) assert.ok(!/^[=+\-@]/.test(cell), `formül hücresi: ${cell}`);
  // Sipariş dışa aktarma: müşteri notu
  r = await s.req("POST", "/api/orders", orderBody({ phone: "05551230002", note: "=1+2" }));
  assert.equal(r.status, 201, r.text);
  const ocsv = (await s.req("GET", "/api/admin/orders/export", undefined, admin)).text;
  assert.ok(ocsv.includes("'=1+2"));
  assert.ok(!/;=1\+2/.test(ocsv));
});

test("bozuk ya da kötü niyetli yedek geri yüklenmez, mevcut veri bozulmaz", async () => {
  const before = JSON.stringify(s.app.db);
  const good = JSON.parse((await s.req("GET", "/api/admin/backup", undefined, admin)).text);
  const bad = [
    "{bozuk",
    [],
    { products: "x", categories: [] },
    { ...good, orders: ["metin"] },
    { ...good, products: [...good.products, { ...good.products[0] }] }, // aynı kimlik iki kez
    { ...good, products: [{ ...good.products[0], price: "bedava" }] },
    { ...good, products: [{ ...good.products[0], id: -3 }] },
    { ...good, orders: [{ id: 1, createdAt: "dün", customer: {}, items: [] }] },
    { ...good, users: [{ id: 1, username: "admin", passHash: "x", role: "kral" }] },
    { ...good, settings: { ...good.settings, hours: { days: Array(7).fill({ open: "25:99", close: "x", closed: false }) } } },
    { ...good, settings: { ...good.settings, ordering: { ...good.settings.ordering, minOrder: "çok" } } },
    { ...good, settings: { ...good.settings, zones: [{ id: 1, name: "Merkez", fee: "çok pahalı" }] } },
    { ...good, settings: { ...good.settings, banners: [{ id: 1, title: "A", link: "javascript:alert(1)" }] } },
    { ...good, settings: { ...good.settings, blockedPhones: [{}] } },
    JSON.stringify(good).replace(/^\{/, '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},').replace('"settings":{', '"settings":{"__proto__":{"polluted":true},'),
  ];
  for (const [i, b] of bad.entries()) {
    const r = await s.req("POST", "/api/admin/restore", typeof b === "string" ? b : JSON.stringify(b), admin, { "Content-Type": "application/json" });
    if (i === bad.length - 1) {
      // Prototip kirletme denemesi: geri yükleme olsa bile nesne prototipi değişmez
      assert.equal({}.polluted, undefined);
      if (r.status === 200) admin = await s.login();
      continue;
    }
    assert.equal(r.status, 400, `#${i}: ${r.text}`);
    assert.equal(r.json.code, b === "{bozuk" ? "GECERSIZ_JSON" : "DOGRULAMA");
    assert.ok(!/\n\s+at |\\lib\\|\/lib\/|TypeError|Cannot read/.test(r.json.error), r.json.error);
  }
  if (JSON.stringify(s.app.db) !== before) {
    // Yalnızca son (geçerli) yükleme veri değiştirebilir; ürünler korunmuş olmalı
    assert.equal(s.app.db.products.length, good.products.length);
  }
  staff = await s.login("kasa", "personel1");
});

test("görsel yükleme: tür, imza ve boyut denetimi; yüklenen dosya yalnızca görsel olarak sunulur", async () => {
  const b64 = (s) => Buffer.from(s).toString("base64");
  const bad = [
    `data:image/svg+xml;base64,${b64('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')}`,
    `data:text/html;base64,${b64("<script>alert(1)</script>")}`,
    `data:image/png;base64,${b64("<html><script>alert(1)</script></html>")}`, // uzantı PNG, içerik HTML
    `data:image/jpeg;base64,${Buffer.alloc(6 * 1024 * 1024, 0xff).toString("base64")}`, // 5 MB'tan büyük
    "../../db.json",
    "",
  ];
  for (const image of bad) {
    const r = await s.req("POST", "/api/admin/uploads", { image }, admin);
    assert.ok([400, 413].includes(r.status), `${image.slice(0, 30)} → ${r.status}`);
  }
  // Ürün görseli olarak dış/özel adres verilemez
  for (const image of ["javascript:alert(1)", "https://kotu.example/x.png", "/uploads/../db.json", "/api/admin/backup"]) {
    const r = await s.req("PATCH", "/api/admin/products/1", { image }, admin);
    assert.equal(r.status, 400, image);
  }
  const ok = await s.req("POST", "/api/admin/uploads", { image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" }, admin);
  assert.equal(ok.status, 201);
  assert.match(ok.json.url, /^\/uploads\/[\w-]+\.png$/);
  const img = await s.req("GET", ok.json.url);
  assert.equal(img.headers.get("content-type"), "image/png");
  assert.equal(img.headers.get("x-content-type-options"), "nosniff");
});

test("hata yanıtlarında yığın izi ya da iç dosya yolu yok", async () => {
  // Beklenmeyen hata: işleyici içinde istisna
  s.inst.router.add("GET", "/api/test-patlat", () => {
    throw new Error(`gizli ${__filename}`);
  });
  const r = await s.req("GET", "/api/test-patlat");
  assert.equal(r.status, 500);
  assert.equal(r.json.code, "SUNUCU");
  assert.ok(!r.text.includes(__dirname) && !r.text.includes("gizli") && !r.text.includes(" at "));
  for (const p of ["/%E0%A4%A", "/api/orders/%E0%A4%A", "/api/orders/abc"]) {
    const res = await raw(p);
    assert.ok(res.status >= 400, p);
    assert.ok(!res.body.includes(__dirname) && !/\n\s+at /.test(res.body), p);
  }
});
