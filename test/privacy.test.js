"use strict";
// §C: HTTPS yönlendirme + HSTS, güvenlik durumu, saklama süresi, müşteri verisi dışa aktarma/anonimleştirme, denetim kaydı;
// saat verisi; örnek veriden görsel tamamlama
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { start, tmpDir, orderBody } = require("./helpers");
const { AuditLog } = require("../lib/audit");
const { upgrade } = require("../lib/db");
const { storeStatus } = require("../lib/hours");
const { DEFAULT_SETTINGS } = require("../lib/defaults");
const { clone } = require("../lib/util");

// fetch "Host" başlığını değiştirmeye izin vermez; ham http istemcisi
function raw(base, p, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + p, { method, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, json });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("HTTPS: vekil arkasında HTTP → PUBLIC_URL'ye 301/308 (yol korunur, başka siteye gidilmez); localhost ve /healthz hariç; HSTS", async () => {
  const s = await start({ publicUrl: "https://ulusoymarket.com", trustProxy: true });
  try {
    const h = { Host: "ulusoymarket.com", "X-Forwarded-Proto": "http", "X-Forwarded-For": "1.2.3.4" };
    let r = await raw(s.base, "/teslimat?x=1", { headers: h });
    assert.equal(r.status, 301);
    assert.equal(r.headers.location, "https://ulusoymarket.com/teslimat?x=1");
    r = await raw(s.base, "//evil.com/a", { headers: h });
    assert.equal(r.headers.location, "https://ulusoymarket.com/evil.com/a");
    r = await raw(s.base, "/api/orders", { method: "POST", headers: h });
    assert.equal(r.status, 308, "POST gövdesi korunarak yönlenir");
    // Sahte Host başlığı yönlendirme hedefini değiştiremez
    r = await raw(s.base, "/", { headers: { ...h, Host: "kotu.example" } });
    assert.equal(r.headers.location, "https://ulusoymarket.com/");
    assert.equal((await raw(s.base, "/healthz", { headers: h })).status, 200);
    assert.equal((await raw(s.base, "/", { headers: { ...h, Host: "localhost:3000" } })).status, 200);
    r = await raw(s.base, "/", { headers: { ...h, "X-Forwarded-Proto": "https" } });
    assert.equal(r.status, 200);
    assert.match(r.headers["strict-transport-security"], /max-age=31536000/);
    assert.equal((await raw(s.base, "/", { headers: h })).headers["strict-transport-security"], undefined);
  } finally {
    await s.close();
  }
  // TRUST_PROXY yoksa şemayı bilemeyiz: yönlendirme yapılmaz (sonsuz döngü olmasın)
  const t = await start({ publicUrl: "https://ulusoymarket.com", trustProxy: false });
  try {
    assert.equal((await raw(t.base, "/", { headers: { Host: "ulusoymarket.com" } })).status, 200);
    const sec = await raw(t.base, "/api/admin/security", { headers: { Authorization: `Bearer ${await t.login()}`, Host: "ulusoymarket.com" } });
    assert.ok(sec.json.warnings.some((w) => w.code === "VEKIL_AYARI"));
  } finally {
    await t.close();
  }
});

test("güvenlik durumu: HTTPS yok, DATA_KEY yok, işletme bilgisi eksik uyarıları; yerelde HTTPS uyarısı yok", async () => {
  const s = await start({ adminPassword: "admin123" });
  try {
    const tok = await s.login("admin", "admin123");
    let r = await raw(s.base, "/api/admin/security", { headers: { Authorization: `Bearer ${tok}`, Host: "market.example" } });
    assert.equal(r.status, 200);
    const codes = r.json.warnings.map((w) => w.code);
    for (const c of ["HTTPS_YOK", "SIFRESIZ_DEPO", "ISLETME_BILGISI_EKSIK", "VARSAYILAN_SIFRE", "PUBLIC_URL_YOK"]) assert.ok(codes.includes(c), c);
    assert.equal(r.json.https.ok, false);
    assert.equal(r.json.dataKey.enabled, false);
    assert.deepEqual(r.json.defaultPassword.users, ["admin"]);
    assert.ok(r.json.legal.missing.some((m) => m.field === "legal.companyTitle"));
    r = await raw(s.base, "/api/admin/security", { headers: { Authorization: `Bearer ${tok}`, Host: "localhost:3000" } });
    assert.ok(!r.json.warnings.some((w) => w.code === "HTTPS_YOK"));
    assert.equal((await s.req("GET", "/api/admin/security")).status, 401);
  } finally {
    await s.close();
  }
});

test("saklama süresi: süresi dolan tamamlanmış siparişte kişisel veri silinir, tutar/kalem kalır; aktif sipariş dokunulmaz; açılışta da çalışır", async () => {
  const dir = tmpDir();
  let s = await start({ dataDir: dir });
  const tok = await s.login();
  // Varsayılan 10 yıl (6563 m.11, YASAL.md §4.3.6); test için 2 yıl
  assert.equal(s.app.db.settings.privacy.retentionDays, 3650);
  assert.equal((await s.req("PATCH", "/api/admin/settings", { privacy: { retentionDays: 730 } }, tok)).status, 200);
  const done = (await s.req("POST", "/api/orders", orderBody({ name: "Eski Müşteri", note: "Zile basmayın" }))).json;
  const active = (await s.req("POST", "/api/orders", orderBody({ phone: "05551112299" }))).json;
  await s.req("PATCH", `/api/admin/orders/${done.id}`, { status: "İptal", cancelNote: "Adres bulunamadı", adminNote: "Kapıcı Ahmet" }, tok);
  await s.close(true);
  // 731 gün sonra yeniden açılış → günlük iş açılışta çalışır
  s = await start({ dataDir: dir, time: "2028-11-17T18:00:00.000Z" });
  try {
    const o = s.app.db.orders.find((x) => x.id === done.id);
    assert.equal(o.customer.name, "Anonim");
    assert.equal(o.customer.phone, "");
    assert.equal(o.customer.address, "");
    assert.equal(o.note, "");
    assert.equal(o.adminNote, "");
    assert.equal(o.cancelNote, "");
    assert.equal(o.consent.ip, "");
    assert.ok(o.anonymizedAt);
    assert.equal(o.total, 232.5);
    assert.equal(o.items.length, 1);
    assert.equal(o.customer.zoneName, "Şükrüpaşa");
    assert.equal(s.app.db.orders.find((x) => x.id === active.id).customer.name, "Ayşe Yılmaz", "aktif sipariş anonimleşmez");
    assert.ok(s.app.db.meta.retention.lastRun);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, "db.json"), "utf8"), /Eski Müşteri|Kapıcı Ahmet/);
    // Denetim kaydında sistem işi
    const tok2 = await s.login();
    const audit = (await s.req("GET", "/api/admin/audit", undefined, tok2)).json.entries;
    assert.ok(audit.some((e) => e.action === "saklama.anonimlestir" && e.details.orders === 1));
    // Elle çalıştırma, ayar kapalıyken hiçbir şey yapmaz
    await s.req("PATCH", "/api/admin/settings", { privacy: { retentionDays: null } }, tok2);
    const r = await s.req("POST", "/api/admin/privacy/run", {}, tok2);
    assert.equal(r.json.processed, 0);
    assert.equal((await s.req("PATCH", "/api/admin/settings", { privacy: { retentionDays: 5 } }, tok2)).status, 400);
  } finally {
    await s.close();
  }
});

test("KVKK başvurusu: müşterinin verisini dışa aktar ve anonimleştir (aktif sipariş atlanır); denetim kaydında kişisel veri yok", async () => {
  const s = await start();
  try {
    const tok = await s.login();
    const ph = "05557776655";
    const o1 = (await s.req("POST", "/api/orders", orderBody({ phone: ph, name: "Fatma Demir", address: "Sabuni Mah. Gül Sok. No:7 Edirne" }))).json;
    const o2 = (await s.req("POST", "/api/orders", orderBody({ phone: ph, name: "Fatma Demir" }))).json;
    await s.req("PATCH", `/api/admin/orders/${o1.id}`, { status: "Teslim edildi" }, tok);
    let r = await s.req("GET", `/api/admin/customers/${ph}/export`, undefined, tok);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-disposition"), /attachment; filename="musteri-verisi-/);
    assert.equal(r.json.orders.length, 2);
    assert.equal(r.json.orders[0].customer.name, "Fatma Demir");
    assert.equal(r.json.orders[0].token, undefined);
    assert.equal((await s.req("GET", "/api/admin/customers/05000000000/export", undefined, tok)).status, 404);
    assert.equal((await s.req("POST", `/api/admin/customers/${ph}/anonymize`, {}, tok)).status, 400, "onaysız");
    r = await s.req("POST", `/api/admin/customers/${ph}/anonymize`, { confirm: true }, tok);
    assert.equal(r.status, 200);
    assert.equal(r.json.processed, 1);
    assert.deepEqual(r.json.skipped.map((x) => x.id), [o2.id]);
    assert.equal(s.app.db.orders.find((x) => x.id === o1.id).customer.name, "Anonim");
    // Müşteri artık anonim siparişle listelenmez; personel yapamaz
    await s.req("POST", "/api/admin/users", { username: "kasa", password: "kasa12345", role: "personel" }, tok);
    const staff = await s.login("kasa", "kasa12345");
    assert.equal((await s.req("POST", `/api/admin/customers/${ph}/anonymize`, { confirm: true }, staff)).status, 403);
    assert.equal((await s.req("GET", `/api/admin/customers/${ph}/export`, undefined, staff)).status, 403);
    assert.equal((await s.req("GET", "/api/admin/audit", undefined, staff)).status, 403);
    // Denetim kaydı: kim/ne/ne zaman var; telefon/ad/adres yok
    const audit = (await s.req("GET", "/api/admin/audit", undefined, tok)).json;
    const text = JSON.stringify(audit);
    assert.doesNotMatch(text, /05557776655|5557776655|Fatma|Sabuni/);
    const acts = audit.entries.map((e) => e.label);
    for (const a of ["Giriş", "Sipariş güncelledi", "Müşteri verisini dışa aktardı", "Müşteri verisini anonimleştirdi", "Kullanıcı ekledi"]) assert.ok(acts.includes(a), a);
    const upd = audit.entries.find((e) => e.label === "Sipariş güncelledi");
    assert.equal(upd.user, "admin");
    assert.equal(upd.target, `#${o1.id}`);
    assert.deepEqual(upd.details, { fields: ["status"], from: "Yeni", to: "Teslim edildi" });
    assert.ok(audit.entries[0].seq > audit.entries.at(-1).seq, "en yeni üstte");
    // Hatalı giriş (var olan kullanıcı) yazılır
    await s.req("POST", "/api/admin/login", { username: "admin", password: "yanlis-sifre" });
    assert.equal((await s.req("GET", "/api/admin/audit?limit=1", undefined, tok)).json.entries[0].action, "giris.basarisiz");
  } finally {
    await s.close();
  }
});

test("denetim kaydı en fazla N kayıt tutar, dosyada kalıcıdır", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ulusoy-audit-"));
  const file = path.join(dir, "audit.json");
  const a = new AuditLog(file, null, { max: 5 });
  for (let i = 0; i < 8; i++) a.add({ user: "u", action: `x${i}` });
  assert.equal(a.entries.length, 5);
  const b = new AuditLog(file, null, { max: 5 });
  assert.deepEqual(b.list({ limit: 10 }).entries.map((e) => e.action), ["x7", "x6", "x5", "x4", "x3"]);
  b.add({ user: "u", action: "y" });
  assert.equal(b.list({ limit: 1 }).entries[0].seq, 9);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("saat verisi: iş günü mantığı (gece yarısından sonra dünkü vardiya), sonraki açılış/kapanış, kalan dakika, 7 gün", () => {
  const st = clone(DEFAULT_SETTINGS);
  st.hours.days[1] = { open: "10:00", close: "18:00", closed: false }; // Salı
  st.hours.days[2] = { open: "14:00", close: "02:00", closed: true }; // Çarşamba kapalı
  // Salı 17 Kas 2026 01:00 (TR) → Pazartesi vardiyası (14:00–02:00) sürüyor
  let s = storeStatus(st, new Date("2026-11-16T22:00:00Z"));
  assert.equal(s.timezone, "Europe/Istanbul");
  assert.equal(s.today.dayIndex, 0);
  assert.equal(s.today.dayName, "Pazartesi");
  assert.equal(s.today.date, "2026-11-16");
  assert.equal(s.today.open, "14:00");
  assert.equal(s.today.close, "02:00");
  assert.equal(s.today.overnight, true);
  assert.equal(s.today.phase, "acik");
  assert.equal(s.today.startIso, "2026-11-16T11:00:00.000Z");
  assert.equal(s.today.endIso, "2026-11-16T23:00:00.000Z");
  assert.equal(s.minutesUntilClose, 60);
  assert.equal(s.minutesUntilOpen, null);
  assert.equal(s.nextCloseIso, "2026-11-16T23:00:00.000Z");
  assert.equal(s.nextOpenIso, "2026-11-17T07:00:00.000Z", "Salı 10:00");
  assert.equal(s.week.length, 7);
  assert.equal(s.week[0].isToday, true);
  assert.equal(s.week[2].closed, true);
  // Salı 03:00 → vardiya bitti; bugün Salı, açılışa 7 saat
  s = storeStatus(st, new Date("2026-11-17T00:00:00Z"));
  assert.equal(s.today.dayName, "Salı");
  assert.equal(s.today.phase, "once");
  assert.equal(s.today.overnight, false);
  assert.equal(s.minutesUntilOpen, 420);
  assert.equal(s.nextOpenIso, "2026-11-17T07:00:00.000Z");
  assert.equal(s.nextCloseIso, "2026-11-17T15:00:00.000Z");
  assert.equal(s.week[1].isToday, true);
  // Çarşamba (kapalı gün) öğlen → bugün kapalı, sonraki açılış Perşembe 14:00
  s = storeStatus(st, new Date("2026-11-18T09:00:00Z"));
  assert.equal(s.today.phase, "kapali-gun");
  assert.equal(s.today.closed, true);
  assert.equal(s.today.startIso, null);
  assert.equal(s.nextOpenIso, "2026-11-19T11:00:00.000Z");
  // Salı 18:30 → vardiya bitti ("sonra")
  s = storeStatus(st, new Date("2026-11-17T15:30:00Z"));
  assert.equal(s.today.phase, "sonra");
});

test("/api/store durumu panelde saat değişince bir sonraki istekte yansır", async () => {
  const s = await start();
  try {
    const tok = await s.login();
    const days = s.app.db.settings.hours.days.map((d) => ({ ...d, open: "12:00", close: "03:30" }));
    await s.req("PATCH", "/api/admin/settings", { hours: { days } }, tok);
    const st = (await s.req("GET", "/api/store")).json.status;
    assert.equal(st.today.open, "12:00");
    assert.equal(st.today.close, "03:30");
    assert.equal(st.closesAt, "03:30");
    assert.ok(st.minutesUntilClose > 0);
    assert.equal(st.week.length, 7);
  } finally {
    await s.close();
  }
});

test("örnek veriden görsel tamamlama: aynı id + aynı ad, kullanıcı görseline dokunmaz, bir kez", () => {
  const seed = {
    categories: [{ id: 1, name: "Meyve & Sebze", image: "/img/kategori/meyve-sebze.webp" }],
    products: [
      { id: 1, name: "Domates", image: "/img/urun/domates.webp" },
      { id: 2, name: "Salatalık", image: "/img/urun/salatalik.webp" },
      { id: 3, name: "Biber", image: "/img/urun/biber.webp" },
    ],
  };
  const db = {
    meta: { schemaVersion: 2 },
    categories: [{ id: 1, name: "meyve & sebze" }],
    products: [
      { id: 1, name: "Domates", price: 10, categoryId: 1, image: null },
      { id: 2, name: "Salatalık", price: 10, categoryId: 1, image: "/uploads/kendi.jpg" },
      { id: 3, name: "Kırmızı Biber", price: 10, categoryId: 1 },
    ],
    orders: [],
  };
  let r = upgrade(db, seed).db;
  assert.equal(r.products[0].image, "/img/urun/domates.webp");
  assert.equal(r.products[1].image, "/uploads/kendi.jpg", "kullanıcı görseli korunur");
  assert.equal(r.products[2].image, null, "ad farklıysa alınmaz");
  assert.equal(r.categories[0].image, "/img/kategori/meyve-sebze.webp");
  assert.deepEqual([r.meta.seedImages.products, r.meta.seedImages.categories], [1, 1]);
  // Kullanıcı görseli sonradan kaldırırsa tekrar doldurulmaz
  r.products[0].image = null;
  r = upgrade(r, seed).db;
  assert.equal(r.products[0].image, null);
  // Örnek veride hiç görsel yoksa işaretlenmez (görseller sonra gelince yine uygulanabilsin)
  const d2 = upgrade({ products: [{ id: 1, name: "Domates", price: 1, categoryId: 1 }], categories: [], orders: [] }, { products: [{ id: 1, name: "Domates", image: null }] }).db;
  assert.equal(d2.meta.seedImages, undefined);
});

test("/img/... görselli ürün ve kategori silinince depodaki dosya silinmez", async () => {
  const s = await start();
  try {
    const tok = await s.login();
    const file = path.join(__dirname, "..", "public", "img", "logo-yeni.png");
    assert.ok(fs.existsSync(file));
    const p = (await s.req("POST", "/api/admin/products", { name: "Görselli", price: 5, categoryId: 1, image: "/img/logo-yeni.png" }, tok)).json;
    assert.equal(p.image, "/img/logo-yeni.png");
    await s.req("DELETE", `/api/admin/products/${p.id}`, undefined, tok);
    const p2 = (await s.req("POST", "/api/admin/products", { name: "Görselli 2", price: 5, categoryId: 1, image: "/img/logo-yeni.png" }, tok)).json;
    await s.req("POST", "/api/admin/products/bulk", { ids: [p2.id], action: "delete" }, tok);
    const c = (await s.req("POST", "/api/admin/categories", { name: "Boş reyon", image: "/img/logo-yeni.png" }, tok)).json;
    await s.req("DELETE", `/api/admin/categories/${c.id}`, undefined, tok);
    assert.ok(fs.existsSync(file), "depodaki görsel silindi");
  } finally {
    await s.close();
  }
});
