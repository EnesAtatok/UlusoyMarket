"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const zlib = require("zlib");
const { start, orderBody } = require("./helpers");

let s;
before(async () => {
  s = await start({ rateLimits: { login: { windowMs: 60000, max: 3 }, orders: { windowMs: 60000, max: 2 }, lookup: { windowMs: 60000, max: 2 } } });
});
after(() => s.close());

// fetch gzip'i kendiliğinden açar; ham yanıt için http modülü
function raw(path, headers = {}, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(s.base + path, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("güvenlik başlıkları ve CSP", async () => {
  const r = await raw("/api/store");
  assert.match(r.headers["content-security-policy"], /script-src 'self';/);
  assert.match(r.headers["content-security-policy"], /img-src 'self' data: blob:/);
  assert.match(r.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(r.headers["x-content-type-options"], "nosniff");
  assert.equal(r.headers["x-frame-options"], "DENY");
  assert.equal(r.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(r.headers["strict-transport-security"], undefined, "HTTP'de HSTS yok");
});

test("gzip: JSON ve statik dosyalar sıkıştırılır", async () => {
  const r = await raw("/api/store", { "Accept-Encoding": "gzip, deflate, br" });
  assert.equal(r.headers["content-encoding"], "gzip");
  const json = JSON.parse(zlib.gunzipSync(r.body).toString("utf8"));
  assert.ok(json.products.length >= 120);
  const plain = await raw("/api/store");
  assert.equal(plain.headers["content-encoding"], undefined);
  const css = await raw("/style.css", { "Accept-Encoding": "gzip" });
  assert.equal(css.status, 200);
  assert.equal(css.headers["content-encoding"], "gzip");
  assert.equal(css.headers["vary"], "Accept-Encoding");
});

test("ETag ve 304; HEAD gövdesiz yanıt", async () => {
  const r = await raw("/app.js");
  assert.equal(r.status, 200);
  assert.ok(r.headers.etag);
  assert.equal(r.headers["cache-control"], "no-cache");
  const again = await raw("/app.js", { "If-None-Match": r.headers.etag });
  assert.equal(again.status, 304);
  assert.equal(again.body.length, 0);
  const head = await raw("/app.js", {}, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers["content-length"]), r.body.length);
  const page = await raw("/kvkk");
  const page304 = await raw("/kvkk", { "If-None-Match": page.headers.etag });
  assert.equal(page304.status, 304);
  const apiHead = await raw("/api/store", {}, "HEAD");
  assert.equal(apiHead.status, 200);
  assert.equal(apiHead.body.length, 0);
  const logo = await raw("/img/logo.webp");
  assert.equal(logo.headers["content-type"], "image/webp");
  assert.equal(logo.headers["cache-control"], "public, max-age=604800");
});

test("gövde boyutu sınırı 413, geçersiz JSON 400, bilinmeyen API 404, yanlış yöntem 405", async () => {
  let r = await s.req("POST", "/api/cart/quote", JSON.stringify({ items: [], pad: "x".repeat(1100000) }), null, { "Content-Type": "application/json" });
  assert.equal(r.status, 413);
  assert.equal(r.json.code, "COK_BUYUK");
  r = await s.req("POST", "/api/cart/quote", "{bozuk", null, { "Content-Type": "application/json" });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, "GECERSIZ_JSON");
  r = await s.req("GET", "/api/yok");
  assert.equal(r.status, 404);
  assert.equal(r.json.error, "Bulunamadı");
  r = await s.req("DELETE", "/api/store");
  assert.equal(r.status, 405);
  r = await s.req("GET", "/healthz");
  assert.equal(r.json.ok, true);
});

test("dizin dışına çıkma ve gizli dosyalar engellenir", async () => {
  for (const p of ["/..%2Fserver.js", "/%2e%2e/server.js", "/uploads/..%2F..%2Fdb.json", "/.gitignore", "/img/../../server.js"]) {
    const r = await raw(p);
    assert.notEqual(r.status, 200, p);
    assert.ok(!r.body.toString().includes("createApp"), p);
  }
});

test("hız sınırı: hatalı giriş denemeleri 429 + Retry-After; doğru şifre de engellenir", async () => {
  for (let i = 0; i < 3; i++) {
    const r = await s.req("POST", "/api/admin/login", { username: "admin", password: "yanlis" });
    assert.equal(r.status, 401);
  }
  const r = await s.req("POST", "/api/admin/login", { username: "admin", password: "test1234" });
  assert.equal(r.status, 429);
  assert.equal(r.json.code, "HIZ_SINIRI");
  assert.ok(Number(r.headers.get("retry-after")) > 0);
  s.app.limiters.login.reset("127.0.0.1");
  assert.equal((await s.req("POST", "/api/admin/login", { username: "admin", password: "test1234" })).status, 200);
});

test("hız sınırı: sipariş ve telefonla sorgu", async () => {
  assert.equal((await s.req("POST", "/api/orders", orderBody({ phone: "05320000001" }))).status, 201);
  assert.equal((await s.req("POST", "/api/orders", orderBody({ phone: "05320000002", name: "X" }))).status, 400);
  const r = await s.req("POST", "/api/orders", orderBody({ phone: "05320000003" }));
  assert.equal(r.status, 429);
  assert.match(r.json.error, /Çok fazla sipariş denemesi/);
  await s.req("GET", "/api/orders/1?phone=05320000009");
  await s.req("GET", "/api/orders/1?phone=05320000009");
  assert.equal((await s.req("GET", "/api/orders/1?phone=05320000009")).status, 429);
});

test("TRUST_PROXY: X-Forwarded-For'un en sağdaki adresi ve HSTS", async () => {
  const t = await start({ trustProxy: true, rateLimits: { login: { windowMs: 60000, max: 1 } } });
  try {
    const bad = (ip) => t.req("POST", "/api/admin/login", { password: "yanlis" }, null, { "X-Forwarded-For": `1.1.1.1, ${ip}`, "X-Forwarded-Proto": "https" });
    assert.equal((await bad("9.9.9.9")).status, 401);
    const blocked = await bad("9.9.9.9");
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("strict-transport-security"), "max-age=31536000");
    assert.equal((await bad("8.8.8.8")).status, 401, "farklı istemci etkilenmez");
  } finally {
    await t.close();
  }
});

test("ana sayfa: SEO etiketleri ve JSON-LD enjekte edilir", async () => {
  const r = await s.req("GET", "/");
  assert.equal(r.status, 200);
  const html = r.text;
  assert.match(html, /<title>Ulusoy Market · Gece de açık mahalle marketi \| Edirne<\/title>/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  // public/img/og.jpg varsa o, yoksa logo kullanılır (docs/API.md §4 "Görsel dosya kuralları")
  assert.match(html, /<meta property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/img\/(og\.jpg|logo\.webp)">/);
  assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/">/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.+?)<\/script>/.exec(html)[1]);
  assert.equal(ld["@type"], "GroceryStore");
  assert.equal(ld.telephone, "+905373119696");
  assert.equal(ld.address.postalCode, "22000");
  assert.equal(ld.openingHoursSpecification.length, 7);
  assert.ok(html.indexOf("application/ld+json") < html.indexOf("</head>"));
  assert.equal((await s.req("GET", "/index.html")).status, 301);
});

test("PUBLIC_URL ayarlıysa mutlak adresler ondan üretilir", async () => {
  const t = await start({ publicUrl: "https://ulusoymarket.com/" });
  try {
    const r = await t.req("GET", "/sitemap.xml");
    assert.match(r.text, /<loc>https:\/\/ulusoymarket\.com\/<\/loc>/);
    assert.match(r.text, /<loc>https:\/\/ulusoymarket\.com\/teslimat\/sukrupasa<\/loc>/);
    assert.match(r.text, /<loc>https:\/\/ulusoymarket\.com\/kvkk<\/loc>/);
    const robots = await t.req("GET", "/robots.txt");
    assert.match(robots.text, /Sitemap: https:\/\/ulusoymarket\.com\/sitemap\.xml/);
    assert.match(robots.text, /Disallow: \/panel/);
  } finally {
    await t.close();
  }
});

test("yasal sayfalar ayarlardan üretilir; boş alanlar […] kalır", async () => {
  let r = await s.req("GET", "/kvkk");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/html/);
  assert.match(r.text, /<body class="page page-legal">/);
  assert.match(r.text, /<h1 class="page-title">KVKK Aydınlatma Metni<\/h1>/);
  assert.match(r.text, /Unvan: \[…\]/);
  assert.match(r.text, /<link rel="stylesheet" href="\/style.css">/);
  s.app.db.settings.legal.companyTitle = "Ulusoy Gıda <Ltd>";
  r = await s.req("GET", "/kvkk");
  assert.match(r.text, /Unvan: Ulusoy Gıda &lt;Ltd&gt;/, "HTML kaçışlı");
  s.app.db.settings.legal.texts.iade = "## Özel başlık\nSatır bir\n\n- madde";
  r = await s.req("GET", "/iade-kosullari");
  assert.match(r.text, /<h2>Özel başlık<\/h2>\n<p>Satır bir<\/p>\n<ul><li>madde<\/li><\/ul>/);
  for (const p of ["/mesafeli-satis", "/cerez-politikasi", "/hakkimizda", "/teslimat"]) {
    assert.equal((await s.req("GET", p)).status, 200, p);
  }
});

test("bölge sayfaları, eski -tekel adreslerinden 301, 404 sayfası", async () => {
  let r = await s.req("GET", "/teslimat/sukrupasa");
  assert.equal(r.status, 200);
  assert.match(r.text, /<body class="page page-zone">/);
  assert.match(r.text, /Şükrüpaşa · Eve market teslimatı/);
  assert.match(r.text, /href="\/\?bolge=sukrupasa"/);
  for (const [from, to] of [
    ["/sukrupasa-tekel", "/teslimat/sukrupasa"],
    ["/medrese-alibey-tekel", "/teslimat/medrese-alibey"],
    ["/edirne-tekel", "/teslimat/edirne-merkez"],
    ["/bilinmeyen-tekel", "/teslimat"],
    ["/teslimat/", "/teslimat"],
  ]) {
    r = await s.req("GET", from);
    assert.equal(r.status, 301, from);
    assert.equal(r.headers.get("location"), to, from);
  }
  r = await s.req("GET", "/teslimat/yok-boyle");
  assert.equal(r.status, 404);
  assert.match(r.text, /page-notfound/);
  r = await s.req("GET", "/rastgele-sayfa");
  assert.equal(r.status, 404);
  assert.match(r.text, /Sayfa bulunamadı/);
  r = await s.req("GET", "/yok.js");
  assert.equal(r.status, 404);
  assert.equal(r.text, "Bulunamadı");
});

test("panel: noindex; /panel.html → /panel; alt yollar aynı sayfa", async () => {
  let r = await s.req("GET", "/panel");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(r.text, /<meta name="robots" content="noindex, nofollow">/);
  assert.equal((await s.req("GET", "/panel/siparisler")).status, 200);
  r = await s.req("GET", "/panel.html");
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "/panel");
});

test("manifest", async () => {
  const r = await s.req("GET", "/manifest.webmanifest");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /application\/manifest\+json/);
  assert.equal(r.json.name, "Ulusoy Market");
  assert.equal(r.json.lang, "tr");
  assert.equal(r.json.start_url, "/");
  assert.equal(r.json.theme_color, "#F97330");
  assert.ok(r.json.icons.length >= 1);
});
