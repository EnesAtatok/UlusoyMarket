"use strict";
// Yayın öncesi güvenlik denetiminde bulunan sorunların regresyon testleri
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { start, orderBody, tmpDir } = require("./helpers");
const { createApp } = require("../lib/app");
const { SESSIONS_PER_USER } = require("../lib/auth");

// fetch Host başlığını değiştirmeye izin vermez; ham http isteği
function rawGet(base, pathName, headers = {}, method = "GET", body) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const r = http.request({ host: u.hostname, port: u.port, path: pathName, method, headers }, (res) => {
      let t = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (t += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: t }));
    });
    r.on("error", reject);
    r.end(body);
  });
}

test("giriş hız sınırı eşzamanlı isteklerle aşılamaz", async () => {
  const s = await start({ rateLimits: { login: { windowMs: 60000, max: 5 } } });
  try {
    const all = await Promise.all(
      Array.from({ length: 30 }, (_, i) => s.req("POST", "/api/admin/login", { username: "admin", password: `yanlis-${i}` }))
    );
    const failed = all.filter((r) => r.status === 401).length;
    const limited = all.filter((r) => r.status === 429).length;
    assert.ok(failed <= 5, `şifre en fazla 5 kez denenebilmeli, ${failed} kez denendi`);
    assert.equal(failed + limited, 30);
    // Sınır dolunca doğru şifre de beklemeli
    assert.equal((await s.req("POST", "/api/admin/login", { username: "admin", password: "test1234" })).status, 429);
  } finally {
    await s.close();
  }
});

test("başarılı giriş sayaç sıfırlar; doğru şifreyle giriş normal çalışır", async () => {
  const s = await start({ rateLimits: { login: { windowMs: 60000, max: 3 } } });
  try {
    for (let i = 0; i < 2; i++) assert.equal((await s.req("POST", "/api/admin/login", { username: "admin", password: "x" })).status, 401);
    assert.equal((await s.req("POST", "/api/admin/login", { username: "admin", password: "test1234" })).status, 200);
    for (let i = 0; i < 3; i++) assert.equal((await s.req("POST", "/api/admin/login", { username: "admin", password: "x" })).status, 401);
  } finally {
    await s.close();
  }
});

test("sondaki / yönlendirmesi başka siteye açık yönlendirme yapmaz, CRLF 500 üretmez", async () => {
  const s = await start();
  try {
    for (const p of ["/%2Fevil.com/", "/%5Cevil.com/", "/%2F%2Fevil.com/", "/.//evil.com/", "/%5C%5Cevil.com/"]) {
      const r = await rawGet(s.base, p);
      if (r.status === 301) {
        const loc = r.headers.location;
        assert.ok(loc.startsWith("/") && !/^\/[/\\]/.test(loc), `${p} → ${loc} başka siteye gidebilir`);
      }
    }
    const crlf = await rawGet(s.base, "/x%0d%0aSet-Cookie:%20a=b/");
    assert.notEqual(crlf.status, 500);
    assert.equal(crlf.headers["set-cookie"], undefined);
    // Normal davranış korunur
    const r = await rawGet(s.base, "/kvkk/?a=1");
    assert.equal(r.status, 301);
    assert.equal(r.headers.location, "/kvkk?a=1");
  } finally {
    await s.close();
  }
});

test("ayar güncellemede devralınan adlar (constructor, __proto__, toString) reddedilir", async () => {
  const s = await start();
  try {
    const t = await s.login();
    for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      const r = await s.req("PATCH", "/api/admin/settings", `{"${k}":{"a":1}}`, t, { "Content-Type": "application/json" });
      assert.equal(r.status, 400, `${k}: ${r.status}`);
    }
    const keys = Object.keys(s.app.db.settings);
    assert.ok(!keys.includes("constructor") && !keys.includes("toString"));
  } finally {
    await s.close();
  }
});

test("ayarlardaki $' $` $& dizileri ana sayfayı ve JSON-LD'yi bozmaz; şablonda {{constructor}} çözülmez", async () => {
  const s = await start();
  try {
    const t = await s.login();
    const evil = "Gece $' açık $` market $& </script><script>alert(1)</script>";
    const r = await s.req("PATCH", "/api/admin/settings", { store: { slogan: evil, about: evil + " {{constructor}}" } }, t);
    assert.equal(r.status, 200);
    const home = await s.req("GET", "/");
    assert.equal((home.text.match(/<title>/g) || []).length, 1);
    assert.equal((home.text.match(/<\/head>/g) || []).length, 1);
    assert.equal((home.text.match(/<body/g) || []).length, 1);
    assert.ok(!home.text.includes("<script>alert(1)"));
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(home.text);
    const data = JSON.parse(ld[1]);
    assert.ok(data.description.includes("$'") && data.description.includes("</script>"));
    const about = await s.req("GET", "/hakkimizda");
    assert.ok(about.text.includes("{{constructor}}"));
    assert.ok(!about.text.includes("function Object"));
  } finally {
    await s.close();
  }
});

test("Telegram'daki panel bağlantısı Host başlığından değil PUBLIC_URL'den gelir", async () => {
  const got = [];
  const fake = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      got.push(JSON.parse(b).text);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  const wait = async (n) => { for (let i = 0; i < 100 && got.length < n; i++) await new Promise((x) => setTimeout(x, 20)); };
  for (const publicUrl of ["", "https://ulusoymarket.example"]) {
    const s = await start({ publicUrl, telegramApiBase: `http://127.0.0.1:${fake.address().port}` });
    try {
      s.app.db.settings.notify.telegramBotToken = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      s.app.db.settings.notify.telegramChatId = "42";
      const before = got.length;
      const r = await rawGet(s.base, "/api/orders", { Host: "ulusoy-panel.evil.example", "Content-Type": "application/json" }, "POST", JSON.stringify(orderBody()));
      assert.equal(r.status, 201);
      await wait(before + 1);
      const text = got[before];
      assert.ok(!text.includes("evil.example"), "sahte alan adı mesaja girmemeli");
      if (publicUrl) assert.ok(text.includes("https://ulusoymarket.example/panel"));
      // PUBLIC_URL yoksa sitemap paylaşımlı önbellekte tutulmaz
      const sm = await rawGet(s.base, "/sitemap.xml");
      assert.equal(sm.headers["cache-control"], publicUrl ? "public, max-age=3600" : "no-cache");
    } finally {
      await s.close();
    }
  }
  fake.close();
});

test("varsayılan şifre (admin123): açılışta uyarı, girişte ve /me'de işaret; yeni şifre admin123 olamaz", async () => {
  const dataDir = tmpDir();
  const logs = [];
  const inst = createApp({ dataDir, adminPassword: "admin123", publicUrl: "", log: (m) => logs.push(m) });
  await new Promise((r) => inst.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${inst.server.address().port}`;
  const j = async (method, url, body, token) => {
    const res = await fetch(base + url, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json() };
  };
  try {
    assert.ok(logs.some((m) => /UYARI/.test(m) && /admin123/.test(m) && /admin/.test(m)), "açılışta uyarı yazılmalı");
    assert.deepEqual(inst.app.defaultPasswordUsers, ["admin"]);
    const login = await j("POST", "/api/admin/login", { username: "admin", password: "admin123" });
    assert.equal(login.status, 200);
    assert.equal(login.json.defaultPassword, true);
    const t = login.json.token;
    assert.equal((await j("GET", "/api/admin/me", null, t)).json.defaultPassword, true);
    // Varsayılan şifre yeniden seçilemez
    let r = await j("POST", "/api/admin/users", { username: "kasa", password: "admin123" }, t);
    assert.equal(r.status, 400);
    r = await j("POST", "/api/admin/password", { currentPassword: "admin123", newPassword: "admin123" }, t);
    assert.equal(r.status, 400);
    r = await j("POST", "/api/admin/password", { currentPassword: "admin123", newPassword: "Guclu-Sifre-2026" }, t);
    assert.equal(r.status, 200);
    assert.equal((await j("GET", "/api/admin/me", null, t)).json.defaultPassword, false);
  } finally {
    await inst.close();
  }
  // Yeniden açılışta uyarı yok
  const logs2 = [];
  const inst2 = createApp({ dataDir, adminPassword: "admin123", publicUrl: "", log: (m) => logs2.push(m) });
  try {
    assert.deepEqual(inst2.app.defaultPasswordUsers, []);
    assert.ok(!logs2.some((m) => /admin123/.test(m)));
  } finally {
    await inst2.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("kullanıcı başına oturum sayısı sınırlı; en eski oturumlar kapanır", async () => {
  const s = await start({ rateLimits: { login: { windowMs: 60000, max: 1000 } } });
  try {
    const tokens = [];
    for (let i = 0; i < SESSIONS_PER_USER + 5; i++) tokens.push(await s.login());
    assert.equal((await s.req("GET", "/api/admin/me", undefined, tokens[0])).status, 401);
    assert.equal((await s.req("GET", "/api/admin/me", undefined, tokens[tokens.length - 1])).status, 200);
    const stored = JSON.parse(fs.readFileSync(path.join(s.dataDir, "sessions.json"), "utf8"));
    assert.ok(Object.keys(stored).length <= SESSIONS_PER_USER);
  } finally {
    await s.close();
  }
});

test("eşzamanlı kullanıcı istekleri: son yönetici kuralı ve aynı kullanıcı adı korunur", async () => {
  const s = await start();
  try {
    const t = await s.login();
    const r = await s.req("POST", "/api/admin/users", { username: "ikinci", password: "ikinci-yonetici", role: "yonetici" }, t);
    const ids = [1, r.json.id];
    // İki yöneticiyi aynı anda personele düşürme (şifre değişikliği eşzamansız özet hesabı yaptırır)
    await Promise.all(ids.map((id) => s.req("PATCH", `/api/admin/users/${id}`, { role: "personel", password: `yeni-sifre-${id}` }, t)));
    assert.ok(s.app.db.users.some((u) => u.role === "yonetici" && u.active), "en az bir aktif yönetici kalmalı");
    // Aynı kullanıcı adıyla eşzamanlı ekleme
    const t2 = await s.login(s.app.db.users.find((u) => u.role === "yonetici").username, s.app.db.users.find((u) => u.role === "yonetici").id === 1 ? "test1234" : "ikinci-yonetici");
    const res = await Promise.all([0, 1, 2].map(() => s.req("POST", "/api/admin/users", { username: "kasa", password: "kasa-sifre-1" }, t2)));
    assert.equal(res.filter((x) => x.status === 201).length, 1);
    assert.equal(s.app.db.users.filter((u) => u.username === "kasa").length, 1);
  } finally {
    await s.close();
  }
});

test("statik: sonda nokta / büyük harf .HTML / NTFS akışı ile .html ve gizli dosya denetimi atlatılamaz", async () => {
  const s = await start();
  try {
    for (const p of ["/panel.html.", "/index.HTML", "/panel.html::$DATA", "/img/logo.webp.", "/uploads/x%5C.gizli", "/js%5C..%5Cpanel.html"]) {
      const r = await s.req("GET", p);
      assert.equal(r.status, 404, `${p} → ${r.status}`);
    }
    assert.equal((await s.req("GET", "/img/logo.webp")).status, 200);
  } finally {
    await s.close();
  }
});
