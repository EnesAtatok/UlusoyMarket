"use strict";
// Güvenlik denetimi (security-audit run-1) bulgularının yerel doğrulaması ve regresyon testleri.
// Her test önce açığı gösterir (düzeltme öncesi kırmızı), düzeltmeden sonra yeşil kalır.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { start, orderBody, tmpDir, enablePhoneLookup, ADMIN_PASSWORD } = require("./helpers");
const { createApp, resolveListenHost } = require("../lib/app");
const { ipKey } = require("../lib/http");
const { verifyPassword } = require("../lib/auth");
const L = require("../lib/legal");

const fast = { rateLimits: { orders: { windowMs: 60000, max: 1000 } } };

// fetch Host başlığını değiştirmeye izin vermez; ham istek
function raw(base, pathName, { method = "GET", headers = {}, body } = {}) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const r = http.request({ host: u.hostname, port: u.port, path: pathName, method, headers }, (res) => {
      let t = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (t += c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(t); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text: t, json });
      });
    });
    r.on("error", reject);
    r.end(body);
  });
}

async function staffSession(s, admin, username = "kasa", password = "kasa12345") {
  const r = await s.req("POST", "/api/admin/users", { username, password, role: "personel" }, admin);
  assert.equal(r.status, 201, r.text);
  return s.login(username, password);
}

// ---------- A1: telefonla sorgu ----------
test("A1 telefonla sorgu salt okunur: token, takip yolu ve kişisel veri dönmez; arşivdeki sipariş bulunmaz", async () => {
  const s = await start(fast);
  try {
    await enablePhoneLookup(s);
    const o = (await s.req("POST", "/api/orders", orderBody({ phone: "05357654321" }))).json;
    const r = await s.req("GET", `/api/orders/${o.id}?phone=05357654321`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.readOnly, true);
    assert.equal(r.json.status, "Yeni");
    for (const k of ["token", "trackPath", "customer", "items", "note", "canCancel"]) assert.equal(r.json[k], undefined, `${k} dönmemeli`);
    assert.ok(!r.text.includes(o.token), "yanıtta takip anahtarı var");
    // Telefonla bulunan siparişte iptal / belge / iade için kullanılabilecek bir şey yok
    assert.equal((await s.req("POST", `/api/orders/${o.id}/cancel`, { token: r.json.token })).status, 404);
    assert.equal(s.app.db.orders.find((x) => x.id === o.id).status, "Yeni");
    // Arşiv eşiğini geçmiş sipariş telefonla bulunmaz
    const admin = await s.login();
    await s.req("PATCH", `/api/admin/orders/${o.id}`, { status: "Teslim edildi" }, admin);
    s.setTime("2028-12-01T12:00:00.000Z");
    assert.equal((await s.req("GET", `/api/orders/${o.id}?phone=05357654321`)).status, 404);
    // Token sahibi her şeyi görmeye devam eder
    const own = await s.req("GET", `/api/orders/${o.id}?token=${o.token}`);
    assert.equal(own.status, 200);
    assert.equal(own.json.token, o.token);
  } finally {
    await s.close();
  }
});

// ---------- A2: giriş hız sınırı ----------
test("A2 giriş sınırı IP + kullanıcı adına göre: personelin kendi başarılı girişi yöneticiye karşı deneme sayacını sıfırlamaz", async () => {
  const s = await start({ rateLimits: { login: { windowMs: 60000, max: 3 } } });
  try {
    const admin = await s.login();
    await staffSession(s, admin);
    let limited = false;
    for (let round = 0; round < 5 && !limited; round++) {
      for (let i = 0; i < 2; i++) {
        const r = await s.req("POST", "/api/admin/login", { username: "admin", password: `yanlis-${round}-${i}` });
        if (r.status === 429) limited = true;
        else assert.equal(r.status, 401);
      }
      assert.equal((await s.req("POST", "/api/admin/login", { username: "kasa", password: "kasa12345" })).status, 200, "personel kendi hesabına girebilmeli");
    }
    assert.ok(limited, "yöneticiye karşı denemeler hiç sınırlanmadı");
    // Başka kullanıcının girişi engellenmez (anahtarı ayrı)
    assert.equal((await s.req("POST", "/api/admin/login", { username: "kasa", password: "kasa12345" })).status, 200);
  } finally {
    await s.close();
  }
});

test("A2 kullanıcı adı başına (IP'den bağımsız) yavaşlatma; daha önce giriş yapılan ağdan yönetici yine girebilir", async () => {
  const s = await start({ trustProxy: true, rateLimits: { login: { windowMs: 60000, max: 3 }, loginUser: { windowMs: 60000, max: 4 } } });
  try {
    const from = (ip, password) => s.req("POST", "/api/admin/login", { username: "admin", password }, null, { "X-Forwarded-For": ip });
    assert.equal((await from("203.0.113.1", ADMIN_PASSWORD)).status, 200, "yöneticinin kendi ağı");
    const codes = [];
    for (let i = 0; i < 8; i++) codes.push((await from(`198.51.100.${10 + i}`, "yanlis")).status);
    assert.ok(codes.includes(429), `farklı IP'lerden sınırsız deneme yapılabildi: ${codes}`);
    assert.equal((await from("198.51.100.200", ADMIN_PASSWORD)).status, 429, "yeni ağdan doğru şifre de beklemeli");
    assert.equal((await from("203.0.113.1", ADMIN_PASSWORD)).status, 200, "yönetici kendi ağından kilitlenmemeli");
  } finally {
    await s.close();
  }
});

// ---------- A4: geri yükleme ve onay kaydı ----------
test("A4 geri yükleme: mevcut siparişin onay kaydı sahte (özeti tutan) metne bağlanamaz, anlık görüntü değiştirilemez", async () => {
  const s = await start(fast);
  try {
    const admin = await s.login();
    const o = (await s.req("POST", "/api/orders", orderBody())).json;
    const clean = (await s.req("GET", "/api/admin/backup", undefined, admin)).text;
    // 1) Sürümü sahte metne çevir
    let backup = JSON.parse(clean);
    let bo = backup.orders.find((x) => x.id === o.id);
    const d = bo.consent.accepted.find((c) => c.docs.length).docs[0];
    const forged = "SAHTE: Alıcı cayma hakkından feragat etmiştir.";
    const h = L.versionOf(d.title, forged);
    backup.legalArchive[h] = { key: d.key, title: d.title, text: forged, at: "2099-01-01T00:00:00.000Z" };
    d.version = h;
    let r = await s.req("POST", "/api/admin/restore", backup, admin);
    assert.equal(r.status, 409, r.text);
    assert.equal(r.json.code, "ONAY_KAYDI");
    assert.deepEqual(r.json.orders, [o.id]);
    let page = await s.req("GET", `/siparis/${o.id}/belgeler?t=${o.token}`);
    assert.equal(page.status, 200);
    assert.ok(!page.text.includes("SAHTE"));
    assert.equal(s.app.db.legalArchive[h], undefined, "reddedilen yedeğin arşiv kaydı eklenmemeli");
    // 2) Sözleşmedeki tutarları (anlık görüntü) değiştirme
    backup = JSON.parse(clean);
    bo = backup.orders.find((x) => x.id === o.id);
    bo.consent.snapshot.total = 1;
    r = await s.req("POST", "/api/admin/restore", backup, admin);
    assert.equal(r.status, 409, r.text);
    // 3) Değiştirilmemiş yedek geri yüklenir
    r = await s.req("POST", "/api/admin/restore", JSON.parse(clean), admin);
    assert.equal(r.status, 200, r.text);
  } finally {
    await s.close();
  }
});

// ---------- A5: personel ve arşivlenmiş sipariş ----------
test("A5 personel arşivlenmiş siparişin durumunu (tekil/toplu) ve kalemlerini değiştiremez; yanıt maskeli kalır", async () => {
  const s = await start(fast);
  try {
    const admin = await s.login();
    const staff = await staffSession(s, admin);
    const o = (await s.req("POST", "/api/orders", orderBody({ phone: "05556667788", name: "Eski Kişi" }))).json;
    await s.req("PATCH", `/api/admin/orders/${o.id}`, { status: "Teslim edildi" }, admin);
    s.setTime("2028-12-01T12:00:00.000Z");
    let r = await s.req("PATCH", `/api/admin/orders/${o.id}`, { status: "Yolda" }, staff);
    assert.equal(r.status, 403, r.text);
    assert.equal(r.json.code, "ARSIV");
    assert.ok(!r.text.includes("Eski Kişi") && !r.text.includes(o.token));
    r = await s.req("POST", "/api/admin/orders/bulk", { ids: [o.id], action: "status", status: "Yolda" }, staff);
    assert.equal(r.status, 200);
    assert.equal(r.json.processed, 0);
    assert.match(r.json.skipped[0].reason, /[Aa]rşiv/);
    assert.equal((await s.req("PUT", `/api/admin/orders/${o.id}/items`, { items: [{ productId: 13, qty: 1 }] }, staff)).status, 403);
    assert.equal((await s.req("PATCH", `/api/admin/orders/${o.id}`, { adminNote: "x" }, staff)).status, 403);
    assert.equal(s.app.db.orders.find((x) => x.id === o.id).status, "Teslim edildi");
    r = await s.req("GET", `/api/admin/orders/${o.id}`, undefined, staff);
    assert.equal(r.json.customer.name, "Arşivlenmiş sipariş");
    assert.equal(r.json.token, "");
    // Yönetici değiştirebilir
    assert.equal((await s.req("PATCH", `/api/admin/orders/${o.id}`, { status: "Yolda" }, admin)).status, 200);
  } finally {
    await s.close();
  }
});

// ---------- A6: denetim kaydı ----------
test("A6 denetim kaydı: etkisiz işlemler yazılmaz, başarısız girişler özetlenir, güvenlik kayıtları taşırılamaz", async () => {
  const s = await start({ ...fast, audit: { max: 10 } });
  try {
    const admin = await s.login();
    const staff = await staffSession(s, admin);
    assert.equal((await s.req("GET", "/api/admin/backup", undefined, admin)).status, 200);
    const count = () => s.app.auditLog.entries.length;
    const before = count();
    for (let i = 0; i < 20; i++) {
      const r = await s.req("POST", "/api/admin/orders/bulk", { ids: [999999], action: "status", status: "Yeni" }, staff);
      assert.equal(r.json.processed, 0);
    }
    assert.equal(count(), before, "etkisiz toplu işlemler kayda yazıldı");
    for (let i = 0; i < 6; i++) await s.req("POST", "/api/admin/login", { username: "admin", password: `yanlis${i}` });
    const failed = s.app.auditLog.entries.filter((e) => e.action === "giris.basarisiz");
    assert.equal(failed.length, 1, "başarısız girişler tek kayıtta özetlenmeli");
    assert.equal(failed[0].count, 6);
    // Personel gerçek değişikliklerle genel kaydı taşırır; güvenlik bölmesi etkilenmez
    const o = (await s.req("POST", "/api/orders", orderBody())).json;
    for (let i = 0; i < 30; i++) await s.req("PATCH", `/api/admin/orders/${o.id}`, { status: i % 2 ? "Yeni" : "Hazırlanıyor" }, staff);
    assert.ok(s.app.auditLog.entries.length <= 10, "genel kayıt sınırlı kalmalı");
    const sec = (await s.req("GET", "/api/admin/audit?section=guvenlik", undefined, admin)).json;
    assert.ok(sec.entries.some((e) => e.action === "GET /api/admin/backup"), "yedek indirme kaydı silindi");
    assert.ok(sec.entries.some((e) => e.action === "POST /api/admin/users"), "kullanıcı ekleme kaydı silindi");
    assert.ok(sec.entries.every((e) => e.secure === true), "güvenlik bölmesinde genel kayıt var");
    assert.ok(!sec.entries.some((e) => e.action === "PATCH /api/admin/orders/:id" || e.action === "giris"));
    const all = (await s.req("GET", "/api/admin/audit?limit=500", undefined, admin)).json;
    assert.ok(all.entries.some((e) => e.action === "GET /api/admin/backup"), "birleşik listede güvenlik kaydı görünmeli");
    // Dosya boyutu sınırlı
    assert.ok(fs.statSync(path.join(s.dataDir, "audit.json")).size < 200 * 1024);
  } finally {
    await s.close();
  }
});

// ---------- A7: IPv6 /64 ----------
test("A7 hız sınırlayıcılar IPv6'yı /64'e gruplar; IPv4-eşlemeli adresler IPv4 sayılır", async () => {
  assert.equal(ipKey("2001:db8:1:2::1"), ipKey("2001:db8:1:2:ffff::9"));
  assert.notEqual(ipKey("2001:db8:1:2::1"), ipKey("2001:db8:1:3::1"));
  assert.equal(ipKey("::ffff:192.0.2.7"), "192.0.2.7");
  assert.equal(ipKey("::ffff:c000:0207"), "192.0.2.7");
  assert.equal(ipKey("[2001:db8:1:2::1]:443"), ipKey("2001:db8:1:2::1"));
  assert.equal(ipKey("192.0.2.7"), "192.0.2.7");
  const s = await start({ trustProxy: true, rateLimits: { orders: { windowMs: 60000, max: 2 } } });
  try {
    const order = (ip, phone) => s.req("POST", "/api/orders", orderBody({ phone }), undefined, { "X-Forwarded-For": ip });
    assert.equal((await order("2001:db8:1:2::1", "05320000101")).status, 201);
    assert.equal((await order("2001:db8:1:2::2", "05320000102")).status, 201);
    assert.equal((await order("2001:db8:1:2:abcd::3", "05320000103")).status, 429, "aynı /64 içinde adres değiştirerek sınır aşıldı");
    assert.equal((await order("2001:db8:9:9::1", "05320000104")).status, 201, "başka /64 etkilenmemeli");
    assert.equal((await order("::ffff:192.0.2.9", "05320000105")).status, 201);
    assert.equal((await order("::ffff:192.0.2.9", "05320000106")).status, 201);
    assert.equal((await order("192.0.2.9", "05320000107")).status, 429, "IPv4-eşlemeli adres ayrı sayıldı");
  } finally {
    await s.close();
  }
});

// ---------- A8: geri yüklemede "format" anahtarı ----------
test("A8 geri yükleme bilinmeyen üst düzey anahtarları atar; 'format' taşıyan düz db.json açılışı kilitlemez", async () => {
  const dir = tmpDir();
  const s = await start({ dataDir: dir });
  let s2;
  try {
    const admin = await s.login();
    const backup = JSON.parse((await s.req("GET", "/api/admin/backup", undefined, admin)).text);
    backup.format = "ulusoy-sifreli";
    backup.zararli = { a: 1 };
    const r = await s.req("POST", "/api/admin/restore", { data: backup }, admin);
    assert.equal(r.status, 200, r.text);
    assert.equal(s.app.db.format, undefined);
    assert.equal(s.app.db.zararli, undefined);
    await s.close(true);
    // Yeniden açılış
    s2 = createApp({ dataDir: dir, adminPassword: ADMIN_PASSWORD, publicUrl: "", log: () => {} });
    await s2.close();
    s2 = null;
    // Eski sürümün yazdığı zehirli dosya: açılış kendini kurtarır
    const dbFile = path.join(dir, "db.json");
    const poisoned = JSON.parse(fs.readFileSync(dbFile, "utf8"));
    poisoned.format = "ulusoy-sifreli";
    fs.writeFileSync(dbFile, JSON.stringify(poisoned, null, 2));
    s2 = createApp({ dataDir: dir, adminPassword: ADMIN_PASSWORD, publicUrl: "", log: () => {} });
    assert.equal(s2.app.db.format, undefined);
    assert.ok(s2.app.db.products.length > 0);
  } finally {
    if (s2) await s2.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- A9: telefon kâhini ----------
test("A9 sepet teklifi telefona göre farklılaşmaz; engelli/aktif sınır denetimi diğer doğrulamalardan sonra; teklif ucunda hız sınırı", async () => {
  const s = await start({ rateLimits: { orders: { windowMs: 60000, max: 1000 }, quote: { windowMs: 60000, max: 40 } } });
  try {
    const admin = await s.login();
    assert.equal((await s.req("POST", "/api/admin/coupons", { code: "BIRKEZ", type: "tutar", value: 10, minOrder: 0, perPhoneLimit: 1, active: true }, admin)).status, 201);
    const used = "05440000001";
    assert.equal((await s.req("POST", "/api/orders", orderBody({ phone: used, couponCode: "BIRKEZ" }))).status, 201);
    const q = (phone) => s.req("POST", "/api/cart/quote", { items: [{ productId: 13, qty: 5 }], type: "teslimat", zoneId: 1, couponCode: "BIRKEZ", phone });
    const a = (await q(used)).json;
    const b = (await q("05440000002")).json;
    assert.deepEqual(a.coupon, b.coupon, "kupon sonucu telefona göre değişiyor");
    assert.deepEqual(a.warnings, b.warnings);
    // Gerçek gönderimde kural uygulanır
    const again = await s.req("POST", "/api/orders", orderBody({ phone: used, couponCode: "BIRKEZ" }));
    assert.equal(again.status, 400);
    assert.equal(again.json.code, "KUPON");
    // Engelli numara: boş sepetle sorgulanamaz
    await s.req("PUT", "/api/admin/customers/05440000003/block", { blocked: true }, admin);
    let r = await s.req("POST", "/api/orders", orderBody({ phone: "05440000003", items: [] }));
    assert.equal(r.status, 400);
    assert.equal(r.json.code, "BOS_SEPET");
    r = await s.req("POST", "/api/orders", orderBody({ phone: "05440000003", zoneId: 999 }));
    assert.equal(r.json.code, "BOLGE_GECERSIZ");
    r = await s.req("POST", "/api/orders", orderBody({ phone: "05440000003" }));
    assert.equal(r.status, 403);
    assert.equal(r.json.code, "ENGELLI");
    // Aktif sipariş sınırı da boş sepetle sorgulanamaz
    for (let i = 0; i < 3; i++) await s.req("POST", "/api/orders", orderBody({ phone: "05440000009" }));
    r = await s.req("POST", "/api/orders", orderBody({ phone: "05440000009", items: [] }));
    assert.equal(r.json.code, "BOS_SEPET");
    // Teklif ucu hız sınırı
    let last;
    for (let i = 0; i < 45; i++) last = await q("05440000002");
    assert.equal(last.status, 429);
  } finally {
    await s.close();
  }
});

// ---------- B: dinleme adresi ----------
test("B HOST: varsayılan şifre kullanımdayken yalnızca 127.0.0.1; şifre değişince / HOST verilince tüm arayüzler", () => {
  assert.deepEqual(resolveListenHost({ host: "", defaultPasswordInUse: true }).host, "127.0.0.1");
  assert.equal(resolveListenHost({ host: "", defaultPasswordInUse: true }).localOnly, true);
  assert.equal(resolveListenHost({ host: "0.0.0.0", defaultPasswordInUse: true }).host, "127.0.0.1", "varsayılan şifreyle ağa açılmamalı");
  assert.equal(resolveListenHost({ host: "", defaultPasswordInUse: false }).host, undefined, "tüm arayüzler");
  assert.equal(resolveListenHost({ host: "0.0.0.0", defaultPasswordInUse: false }).host, "0.0.0.0");
  assert.equal(resolveListenHost({ host: "127.0.0.1", defaultPasswordInUse: false }).host, "127.0.0.1");
});

test("B HOST: panel güvenlik durumu yerel dinlemeyi açıkça yazar", async () => {
  const s = await start({ adminPassword: "admin123" });
  try {
    s.app.listenInfo = resolveListenHost({ host: "", defaultPasswordInUse: true });
    const tok = await s.login("admin", "admin123");
    const r = await s.req("GET", "/api/admin/security", undefined, tok);
    assert.ok(r.json.warnings.some((w) => w.code === "YEREL_DINLEME"), JSON.stringify(r.json.warnings.map((w) => w.code)));
    assert.equal(r.json.listen.localOnly, true);
  } finally {
    await s.close();
  }
});

// ---------- B: güvenilen vekiller ----------
test("B TRUST_PROXY: X-Forwarded-For yalnızca güvenilen vekilden gelirse kullanılır", async () => {
  const s = await start({ trustProxy: true, trustedProxies: "10.0.0.0/8", rateLimits: { login: { windowMs: 60000, max: 1 } } });
  try {
    // Bağlantı 127.0.0.1'den: güvenilen listede değil → başlık yok sayılır, iki istek aynı istemci
    const bad = (ip) => s.req("POST", "/api/admin/login", { password: "yanlis" }, null, { "X-Forwarded-For": ip, "X-Forwarded-Proto": "https" });
    assert.equal((await bad("9.9.9.9")).status, 401);
    const r = await bad("8.8.8.8");
    assert.equal(r.status, 429, "sahte X-Forwarded-For ile hız sınırı atlatıldı");
    assert.equal(r.headers.get("strict-transport-security"), null, "güvenilmeyen X-Forwarded-Proto kabul edildi");
  } finally {
    await s.close();
  }
  // Varsayılan: loopback güvenilir (Caddy/nginx aynı makinede)
  const t = await start({ trustProxy: true, rateLimits: { login: { windowMs: 60000, max: 1 } } });
  try {
    const bad = (ip) => t.req("POST", "/api/admin/login", { password: "yanlis" }, null, { "X-Forwarded-For": ip });
    assert.equal((await bad("9.9.9.9")).status, 401);
    assert.equal((await bad("8.8.8.8")).status, 401);
  } finally {
    await t.close();
  }
});

// ---------- B: DATA_KEY ve belgeler ----------
test("B DATA_KEY: kısa, $(...) içeren ya da örnek metin anahtar reddedilir", () => {
  const dir = tmpDir();
  try {
    for (const key of ["$(openssl rand -hex 32)", "`openssl rand -hex 32`", "buraya-uzun-rastgele-bir-deger-yazin", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "kisa"]) {
      assert.throws(() => createApp({ dataDir: dir, dataKey: key, log: () => {} }), /DATA_KEY/, key);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("B DEPLOY.md: anahtar tırnaklı heredoc'la sabit metin olarak yazılmaz; nginx örneği başlıkları akış bloğunda da iletir", () => {
  const md = fs.readFileSync(path.join(__dirname, "..", "docs", "DEPLOY.md"), "utf8");
  // <<'EOF' / <<"EOF" içinde $(...) genişlemez: dosyaya komutun kendisi yazılır
  const quoted = [...md.matchAll(/<<\s*(['"])(\w+)\1\n([\s\S]*?)\n\2\n/g)];
  for (const m of quoted) assert.ok(!/\$\(/.test(m[3]), `tırnaklı heredoc içinde $(...) var:\n${m[3]}`);
  const nginx = md.slice(md.indexOf("server {"), md.indexOf("}\n```", md.indexOf("server {")));
  const blocks = nginx.split(/location\s+/).slice(1);
  assert.ok(blocks.length >= 2, "nginx örneği bulunamadı");
  for (const b of blocks) {
    assert.match(b, /proxy_set_header\s+X-Forwarded-For/, `X-Forwarded-For eksik:\n${b}`);
    assert.match(b, /proxy_set_header\s+Host\s+\$host/, `Host eksik:\n${b}`);
  }
});

// ---------- C: ertelenen alanlar ----------
test("C jetonlu müşteri uçlarında hız sınırı (takip, iptal, belgeler, belge sayfası)", async () => {
  const s = await start({ rateLimits: { orders: { windowMs: 60000, max: 1000 }, track: { windowMs: 60000, max: 5 } } });
  try {
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await s.req("GET", `/api/orders/1?token=${"a".repeat(24)}`)).status);
    statuses.push((await s.req("POST", "/api/orders/1/cancel", { token: "b".repeat(24) })).status);
    statuses.push((await s.req("POST", "/api/orders/1/documents", { token: "c".repeat(24) })).status);
    statuses.push((await s.req("GET", `/siparis/1/belgeler?t=${"d".repeat(24)}`)).status);
    assert.ok(statuses.slice(5).every((x) => x === 429), String(statuses));
  } finally {
    await s.close();
  }
});

test("C gövde okunurken yetkisi alınan yöneticinin isteği reddedilir", async () => {
  const s = await start();
  try {
    const admin = await s.login();
    await s.req("POST", "/api/admin/users", { username: "ikinci", password: "ikinci1234", role: "yonetici" }, admin);
    const second = await s.login("ikinci", "ikinci1234");
    const u = new URL(s.base);
    const body = JSON.stringify({ code: "YAVAS10", type: "yuzde", value: 10, active: true });
    const done = new Promise((resolve, reject) => {
      const r = http.request({ host: u.hostname, port: u.port, path: "/api/admin/coupons", method: "POST", headers: { Authorization: `Bearer ${second}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
        let t = "";
        res.on("data", (c) => (t += c));
        res.on("end", () => resolve({ status: res.statusCode, text: t }));
      });
      r.on("error", reject);
      r.write(body.slice(0, 5));
      setTimeout(async () => {
        const id = s.app.db.users.find((x) => x.username === "ikinci").id;
        await s.req("PATCH", `/api/admin/users/${id}`, { role: "personel" }, admin);
        r.end(body.slice(5));
      }, 150);
    });
    const r = await done;
    assert.equal(r.status, 403, r.text);
    assert.ok(!s.app.db.coupons.some((c) => c.code === "YAVAS10"), "yetkisi alınan kullanıcı kupon ekledi");
  } finally {
    await s.close();
  }
});

test("C şifre değiştirme: mevcut şifre denemeleri sınırlı", async () => {
  const s = await start();
  try {
    const tok = await s.login();
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await s.req("POST", "/api/admin/password", { currentPassword: `yanlis${i}`, newPassword: "yeniSifre123" }, tok)).status);
    assert.ok(codes.includes(429), String(codes));
  } finally {
    await s.close();
  }
});

test("C personel teslim edilmiş siparişin kalemlerini değiştiremez (tutar sonradan oynanmaz); yönetici değiştirebilir", async () => {
  const s = await start(fast);
  try {
    const admin = await s.login();
    const staff = await staffSession(s, admin);
    const o = (await s.req("POST", "/api/orders", orderBody())).json;
    await s.req("PATCH", `/api/admin/orders/${o.id}`, { status: "Teslim edildi" }, admin);
    const r = await s.req("PUT", `/api/admin/orders/${o.id}/items`, { items: [{ productId: 13, qty: 1 }] }, staff);
    assert.equal(r.status, 403, r.text);
    assert.equal(s.app.db.orders.find((x) => x.id === o.id).total, o.total);
    assert.equal((await s.req("PUT", `/api/admin/orders/${o.id}/items`, { items: [{ productId: 13, qty: 4 }] }, admin)).status, 200);
  } finally {
    await s.close();
  }
});

test("C PUBLIC_URL yokken yasal metin sürümü Host başlığına bağlı değil (arşiv Host ile büyütülemez)", async () => {
  const s = await start(fast);
  try {
    const versions = async (host, phone) => {
      const r = await raw(s.base, "/api/orders", { method: "POST", headers: { Host: host, "Content-Type": "application/json" }, body: JSON.stringify(orderBody({ phone })) });
      assert.equal(r.status, 201, r.text);
      return s.app.db.orders.find((x) => x.id === r.json.id).consent.accepted.flatMap((c) => c.docs.map((d) => d.version)).sort();
    };
    const a = await versions("a.example", "05320000201");
    const before = Object.keys(s.app.db.legalArchive).length;
    const b = await versions("b.example", "05320000202");
    assert.deepEqual(a, b);
    assert.equal(Object.keys(s.app.db.legalArchive).length, before);
  } finally {
    await s.close();
  }
});

test("C cayma/iade talebi anonimleştirilmiş siparişte alınmaz; geri yükleme bekleyen akış biletlerini siler", async () => {
  const s = await start(fast);
  try {
    const admin = await s.login();
    const o = (await s.req("POST", "/api/orders", orderBody({ phone: "05320000301" }))).json;
    const t = (await s.req("POST", "/api/orders/stream-ticket", { orders: [{ id: o.id, token: o.token }] })).json;
    assert.ok(t.ticket);
    const backup = JSON.parse((await s.req("GET", "/api/admin/backup", undefined, admin)).text);
    assert.equal((await s.req("POST", "/api/admin/restore", backup, admin)).status, 200);
    assert.equal(s.app.events.tickets.size, 0, "geri yüklemeden önce verilen bilet kaldı");
    const admin2 = await s.login();
    await s.req("PATCH", `/api/admin/orders/${o.id}`, { status: "Teslim edildi" }, admin2);
    assert.equal((await s.req("POST", "/api/admin/customers/05320000301/anonymize", { confirm: true }, admin2)).status, 200);
    const r = await s.req("POST", `/api/orders/${o.id}/return-request`, { token: o.token, message: "iade" });
    assert.equal(r.status, 409, r.text);
  } finally {
    await s.close();
  }
});

test("C bozuk/zayıf şifre özeti (boş anahtar, düşük maliyet) hiçbir şifreyi kabul etmez", async () => {
  assert.equal(await verifyPassword("herhangi", "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$"), false);
  assert.equal(await verifyPassword("herhangi", "scrypt$2$1$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"), false);
});

test("C yükseltme öncesi yedekler budanır", async () => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, "backups"), { recursive: true });
    for (let i = 0; i < 25; i++) fs.writeFileSync(path.join(dir, "backups", `yukseltme-oncesi-${1000 + i}.json`), "{}");
    fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ meta: { schemaVersion: 1 }, products: [], categories: [], orders: [], users: [] }));
    const a = createApp({ dataDir: dir, adminPassword: ADMIN_PASSWORD, log: () => {} });
    await a.close();
    const n = fs.readdirSync(path.join(dir, "backups")).filter((f) => f.startsWith("yukseltme-oncesi-")).length;
    assert.ok(n <= 20, `${n} yükseltme yedeği kaldı`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
