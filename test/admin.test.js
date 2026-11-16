"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { start, tmpDir, orderBody, ADMIN_PASSWORD } = require("./helpers");

// 1x1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let s;
let admin;
let staff;
before(async () => {
  s = await start({ rateLimits: { orders: { windowMs: 60000, max: 1000 } } });
  admin = await s.login();
  const r = await s.req("POST", "/api/admin/users", { username: "kasa", name: "Kasa Personeli", role: "personel", password: "personel1" }, admin);
  assert.equal(r.status, 201, r.text);
  staff = await s.login("kasa", "personel1");
});
after(() => s.close());

test("giriş: kullanıcı adı + şifre, hatalı giriş, me, çıkış", async () => {
  let r = await s.req("POST", "/api/admin/login", { username: "admin", password: "yanlis" });
  assert.equal(r.status, 401);
  assert.equal(r.json.error, "Kullanıcı adı veya şifre hatalı.");
  r = await s.req("POST", "/api/admin/login", { username: "ADMIN", password: ADMIN_PASSWORD });
  assert.equal(r.status, 200);
  assert.match(r.json.token, /^[a-f0-9]{64}$/);
  assert.equal(r.json.user.role, "yonetici");
  assert.equal(r.json.user.passHash, undefined);
  const tok = r.json.token;
  r = await s.req("GET", "/api/admin/me", undefined, tok);
  assert.equal(r.json.user.username, "admin");
  r = await s.req("POST", "/api/admin/logout", {}, tok);
  assert.equal(r.status, 200);
  r = await s.req("GET", "/api/admin/me", undefined, tok);
  assert.equal(r.status, 401);
  assert.equal(r.json.code, "OTURUM");
  r = await s.req("GET", "/api/admin/products");
  assert.equal(r.status, 401);
});

test("oturum dosyada kalıcı: sunucu yeniden başlayınca düşmez", async () => {
  const dir = tmpDir();
  const a = await start({ dataDir: dir });
  const token = await a.login();
  await a.close(true);
  const b = await start({ dataDir: dir });
  try {
    const r = await b.req("GET", "/api/admin/me", undefined, token);
    assert.equal(r.status, 200);
    const raw = fs.readFileSync(path.join(dir, "sessions.json"), "utf8");
    assert.ok(!raw.includes(token), "belirteç düz metin saklanmaz");
  } finally {
    await b.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("roller: personel sipariş ve stok işlemlerini yapar, ayar/kupon/rapor/yedek/kullanıcı yapamaz", async () => {
  for (const [m, u, body] of [
    ["GET", "/api/admin/settings"],
    ["PATCH", "/api/admin/settings", { announcement: { text: "x", active: true } }],
    ["GET", "/api/admin/coupons"],
    ["GET", "/api/admin/reports"],
    ["GET", "/api/admin/backup"],
    ["GET", "/api/admin/users"],
    ["POST", "/api/admin/products", { name: "X", price: 1, categoryId: 1 }],
    ["DELETE", "/api/admin/products/1"],
    ["POST", "/api/admin/categories", { name: "Yeni" }],
    ["GET", "/api/admin/products/export"],
    ["PUT", "/api/admin/customers/05321234567/block", { blocked: true }],
  ]) {
    const r = await s.req(m, u, body, staff);
    assert.equal(r.status, 403, `${m} ${u}`);
    assert.equal(r.json.error, "Bu işlem için yönetici yetkisi gerekiyor.");
  }
  // İzin verilenler
  assert.equal((await s.req("GET", "/api/admin/orders", undefined, staff)).status, 200);
  assert.equal((await s.req("GET", "/api/admin/products", undefined, staff)).status, 200);
  assert.equal((await s.req("GET", "/api/admin/customers", undefined, staff)).status, 200);
  let r = await s.req("PATCH", "/api/admin/products/1", { soldOut: true, stock: 5 }, staff);
  assert.equal(r.status, 200);
  assert.equal(r.json.soldOut, true);
  assert.equal(r.json.stock, 5);
  r = await s.req("PATCH", "/api/admin/products/1", { price: 1 }, staff);
  assert.equal(r.status, 403);
  r = await s.req("POST", "/api/admin/products/bulk", { ids: [1, 2], action: "available" }, staff);
  assert.equal(r.status, 200);
  r = await s.req("POST", "/api/admin/products/bulk", { ids: [1], action: "delete" }, staff);
  assert.equal(r.status, 403);
  await s.req("PATCH", "/api/admin/products/1", { stock: null }, admin);
});

test("şifre değiştirme: diğer oturumlar kapanır", async () => {
  await s.req("POST", "/api/admin/users", { username: "ayse", role: "personel", password: "ilksifre1" }, admin);
  const t1 = await s.login("ayse", "ilksifre1");
  const t2 = await s.login("ayse", "ilksifre1");
  let r = await s.req("POST", "/api/admin/password", { currentPassword: "yanlis", newPassword: "yenisifre1" }, t1);
  assert.equal(r.status, 400);
  r = await s.req("POST", "/api/admin/password", { currentPassword: "ilksifre1", newPassword: "kisa" }, t1);
  assert.equal(r.status, 400);
  assert.match(r.json.error, /en az 8/);
  r = await s.req("POST", "/api/admin/password", { currentPassword: "ilksifre1", newPassword: "yenisifre1" }, t1);
  assert.equal(r.status, 200);
  assert.equal((await s.req("GET", "/api/admin/me", undefined, t1)).status, 200);
  assert.equal((await s.req("GET", "/api/admin/me", undefined, t2)).status, 401);
  assert.equal((await s.req("POST", "/api/admin/login", { username: "ayse", password: "yenisifre1" })).status, 200);
});

test("kullanıcılar: son yönetici silinemez/pasifleştirilemez/personele çevrilemez", async () => {
  const users = (await s.req("GET", "/api/admin/users", undefined, admin)).json;
  const me = users.find((u) => u.username === "admin");
  assert.equal(me.passHash, undefined);
  let r = await s.req("DELETE", `/api/admin/users/${me.id}`, undefined, admin);
  assert.equal(r.status, 409);
  assert.equal(r.json.code, "SON_YONETICI");
  r = await s.req("PATCH", `/api/admin/users/${me.id}`, { active: false }, admin);
  assert.equal(r.status, 409);
  r = await s.req("PATCH", `/api/admin/users/${me.id}`, { role: "personel" }, admin);
  assert.equal(r.status, 409);
  r = await s.req("POST", "/api/admin/users", { username: "admin", password: "abcdefgh" }, admin);
  assert.equal(r.status, 409);
  r = await s.req("POST", "/api/admin/users", { username: "Ş!", password: "abcdefgh" }, admin);
  assert.equal(r.status, 400);
  // İkinci yönetici varken ilki pasifleştirilebilir
  r = await s.req("POST", "/api/admin/users", { username: "patron", role: "yonetici", password: "patron123" }, admin);
  assert.equal(r.status, 201);
  const patron = await s.login("patron", "patron123");
  r = await s.req("PATCH", `/api/admin/users/${r.json.id}`, { active: false }, admin);
  assert.equal(r.status, 200);
  assert.equal((await s.req("GET", "/api/admin/me", undefined, patron)).status, 401, "pasif kullanıcının oturumu kapanır");
});

test("ürünler: ekle (görselli), düzenle, eski fiyat kuralı, barkod tekilliği, çoğalt, sil", async () => {
  let r = await s.req("POST", "/api/admin/products", { name: "Deneme Ürünü", price: "12,50", categoryId: 1, brand: "Marka", barcode: "8690000000001", stock: 10, maxPerOrder: 5, featured: true, image: PNG }, admin);
  assert.equal(r.status, 201, r.text);
  const p = r.json;
  assert.equal(p.price, 12.5);
  assert.equal(p.stock, 10);
  assert.equal(p.featured, true);
  assert.match(p.image, /^\/uploads\/.+\.png$/);
  const imgFile = path.join(s.dataDir, "uploads", path.basename(p.image));
  assert.ok(fs.existsSync(imgFile));
  const img = await fetch(s.base + p.image);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/png");

  r = await s.req("PATCH", `/api/admin/products/${p.id}`, { oldPrice: 10 }, admin);
  assert.equal(r.status, 400);
  assert.match(r.json.error, /Eski fiyat/);
  r = await s.req("PATCH", `/api/admin/products/${p.id}`, { oldPrice: 15, description: "Açıklama" }, admin);
  assert.equal(r.json.oldPrice, 15);
  r = await s.req("POST", "/api/admin/products", { name: "Başka", price: 5, categoryId: 1, barcode: "8690000000001" }, admin);
  assert.equal(r.status, 409);
  assert.equal(r.json.code, "BARKOD");
  r = await s.req("POST", "/api/admin/products", { name: "", price: 5, categoryId: 1 }, admin);
  assert.equal(r.status, 400);
  r = await s.req("POST", "/api/admin/products", { name: "X", price: 0, categoryId: 1 }, admin);
  assert.equal(r.json.error, "Geçerli bir fiyat girin.");
  r = await s.req("POST", "/api/admin/products", { name: "X", price: 3, categoryId: 999 }, admin);
  assert.equal(r.json.error, "Kategori seçin.");
  r = await s.req("POST", "/api/admin/products", { name: "X", price: 3, categoryId: 1, image: "data:image/png;base64,AAAA" }, admin);
  assert.equal(r.status, 400);
  assert.equal(r.json.code, "GORSEL");

  r = await s.req("POST", `/api/admin/products/${p.id}/duplicate`, {}, admin);
  assert.equal(r.status, 201);
  const copy = r.json;
  assert.equal(copy.name, "Deneme Ürünü (kopya)");
  assert.equal(copy.barcode, "");
  assert.equal(copy.hidden, true);
  assert.equal(copy.image, p.image);
  // Kopya görseli kullandığı için asıl ürün silinince görsel kalır
  r = await s.req("DELETE", `/api/admin/products/${p.id}`, undefined, admin);
  assert.equal(r.status, 200);
  assert.ok(fs.existsSync(imgFile));
  r = await s.req("DELETE", `/api/admin/products/${copy.id}`, undefined, admin);
  assert.ok(!fs.existsSync(imgFile));
  r = await s.req("DELETE", `/api/admin/products/${copy.id}`, undefined, admin);
  assert.equal(r.status, 404);
});

test("ürün toplu işlemleri: gizle/göster/tükendi/öne çıkar/taşı/fiyat/sil + atlananlar", async () => {
  const mk = async (name, price) => (await s.req("POST", "/api/admin/products", { name, price, categoryId: 2, image: PNG }, admin)).json;
  const a = await mk("Toplu A", 100);
  const b = await mk("Toplu B", 50);
  const ids = [a.id, b.id];
  const prod = (id) => s.app.db.products.find((x) => x.id === id);
  let r = await s.req("POST", "/api/admin/products/bulk", { ids: [...ids, 99999], action: "hide" }, admin);
  assert.deepEqual(r.json, { processed: 2, skipped: [{ id: 99999, reason: "Ürün bulunamadı." }] });
  assert.ok(ids.every((id) => prod(id).hidden));
  await s.req("POST", "/api/admin/products/bulk", { ids, action: "show" }, admin);
  await s.req("POST", "/api/admin/products/bulk", { ids, action: "soldOut" }, admin);
  assert.ok(ids.every((id) => prod(id).soldOut && !prod(id).hidden));
  await s.req("POST", "/api/admin/products/bulk", { ids, action: "feature" }, admin);
  assert.ok(ids.every((id) => prod(id).featured));
  r = await s.req("POST", "/api/admin/products/bulk", { ids, action: "move", categoryId: 3 }, admin);
  assert.equal(r.json.processed, 2);
  assert.ok(ids.every((id) => prod(id).categoryId === 3));
  r = await s.req("POST", "/api/admin/products/bulk", { ids, action: "price", percent: 10 }, admin);
  assert.equal(prod(a.id).price, 110);
  assert.equal(prod(b.id).price, 55);
  r = await s.req("POST", "/api/admin/products/bulk", { ids, action: "price", percent: -95 }, admin);
  assert.equal(r.status, 400);
  r = await s.req("POST", "/api/admin/products/bulk", { ids: [], action: "hide" }, admin);
  assert.equal(r.status, 400);
  r = await s.req("POST", "/api/admin/products/bulk", { ids, action: "uçur" }, admin);
  assert.equal(r.status, 400);
  const files = ids.map((id) => path.join(s.dataDir, "uploads", path.basename(prod(id).image)));
  r = await s.req("POST", "/api/admin/products/bulk", { ids, action: "delete" }, admin);
  assert.equal(r.json.processed, 2);
  assert.ok(ids.every((id) => !prod(id)));
  assert.ok(files.every((f) => !fs.existsSync(f)), "silinen ürünlerin görselleri de silinir");
});

test("kategoriler: ekle (görsel, gizli), dolu kategori silinemez, toplu silmede dolular atlanır", async () => {
  let r = await s.req("POST", "/api/admin/categories", { name: "Mevsimlik", emoji: "🎃", image: PNG, hidden: true }, admin);
  assert.equal(r.status, 201);
  const cat = r.json;
  assert.equal(cat.hidden, true);
  assert.equal(cat.productCount, 0);
  r = await s.req("POST", "/api/admin/categories", { name: "mevsimlik" }, admin);
  assert.equal(r.status, 409);
  // Gizli kategori mağazada görünmez, ürünleri de görünmez
  const p = (await s.req("POST", "/api/admin/products", { name: "Balkabağı", price: 30, categoryId: cat.id }, admin)).json;
  let store = (await s.req("GET", "/api/store")).json;
  assert.ok(!store.categories.some((c) => c.id === cat.id));
  assert.ok(!store.products.some((x) => x.id === p.id));
  r = await s.req("PATCH", `/api/admin/categories/${cat.id}`, { hidden: false }, admin);
  assert.equal(r.json.productCount, 1);
  store = (await s.req("GET", "/api/store")).json;
  assert.ok(store.products.some((x) => x.id === p.id));
  r = await s.req("DELETE", `/api/admin/categories/${cat.id}`, undefined, admin);
  assert.equal(r.status, 409);
  const empty = (await s.req("POST", "/api/admin/categories", { name: "Boş Kategori" }, admin)).json;
  r = await s.req("POST", "/api/admin/categories/bulk-delete", { ids: [cat.id, empty.id, 9999] }, admin);
  assert.equal(r.json.processed, 1);
  assert.deepEqual(r.json.skipped, [
    { id: cat.id, name: "Mevsimlik", reason: "Bu kategoride 1 ürün var." },
    { id: 9999, reason: "Kategori bulunamadı." },
  ]);
  const catImg = path.join(s.dataDir, "uploads", path.basename(cat.image));
  await s.req("DELETE", `/api/admin/products/${p.id}`, undefined, admin);
  r = await s.req("DELETE", `/api/admin/categories/${cat.id}`, undefined, admin);
  assert.equal(r.status, 200);
  assert.ok(!fs.existsSync(catImg));
});

test("sıralama (sürükle-bırak) korunur", async () => {
  const cats = s.app.db.categories.map((c) => c.id);
  const rev = [...cats].reverse();
  let r = await s.req("PUT", "/api/admin/order", { categoryIds: rev }, admin);
  assert.equal(r.status, 200);
  assert.deepEqual(s.app.db.categories.map((c) => c.id), rev);
  r = await s.req("PUT", "/api/admin/order", { categoryIds: [1] }, admin);
  assert.equal(r.status, 400);
  await s.req("PUT", "/api/admin/order", { categoryIds: cats }, admin);
  const mine = s.app.db.products.filter((p) => p.categoryId === 4).map((p) => p.id).reverse();
  r = await s.req("PUT", "/api/admin/order", { categoryId: 4, productIds: mine }, admin);
  assert.deepEqual(s.app.db.products.filter((p) => p.categoryId === 4).map((p) => p.id), mine);
});

test("kuponlar: CRUD, kod tekilliği, doğrulama, toplu silme", async () => {
  let r = await s.req("POST", "/api/admin/coupons", { code: "yaz25", type: "yuzde", value: 25, minOrder: 100, endsAt: "2026-12-31" }, admin);
  assert.equal(r.status, 201, r.text);
  const c = r.json;
  assert.equal(c.code, "YAZ25");
  assert.equal(c.usedCount, 0);
  assert.equal(c.active, true);
  assert.equal(c.endsAt, "2026-12-31T20:59:59.999Z"); // gün sonu, Türkiye saati
  r = await s.req("POST", "/api/admin/coupons", { code: "YAZ25", type: "tutar", value: 5 }, admin);
  assert.equal(r.status, 409);
  r = await s.req("POST", "/api/admin/coupons", { code: "indirim", type: "tutar", value: 5, active: false }, admin);
  assert.equal(r.json.code, "INDIRIM", "Türkçe büyük İ yerine I");
  await s.req("DELETE", `/api/admin/coupons/${r.json.id}`, undefined, admin);
  r = await s.req("POST", "/api/admin/coupons", { code: "X1", type: "tutar", value: 5 }, admin);
  assert.equal(r.status, 400);
  r = await s.req("POST", "/api/admin/coupons", { code: "ASIRI", type: "yuzde", value: 150 }, admin);
  assert.equal(r.status, 400);
  r = await s.req("PATCH", `/api/admin/coupons/${c.id}`, { active: false, value: 30 }, admin);
  assert.equal(r.json.active, false);
  assert.equal(r.json.value, 30);
  assert.equal(r.json.code, "YAZ25");
  const c2 = (await s.req("POST", "/api/admin/coupons", { code: "KARGO", type: "ucretsizTeslimat" }, admin)).json;
  r = await s.req("POST", "/api/admin/coupons/bulk-delete", { ids: [c.id, c2.id, 777] }, admin);
  assert.deepEqual(r.json, { processed: 2, skipped: [{ id: 777, reason: "Kupon bulunamadı." }] });
});

test("ayarlar: kısmi güncelleme + doğrulama; mağazaya yansır", async () => {
  let r = await s.req("PATCH", "/api/admin/settings", { ordering: { minOrder: 300, deliveryFee: "15,5" }, announcement: { text: "Bugün karpuz indirimi", active: true } }, admin);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.settings.ordering.minOrder, 300);
  assert.equal(r.json.settings.ordering.deliveryFee, 15.5);
  assert.equal(r.json.settings.ordering.etaMinutes, 30, "gönderilmeyen alan korunur");
  let store = (await s.req("GET", "/api/store")).json;
  assert.equal(store.ordering.minOrder, 300);
  assert.deepEqual(store.announcement, { text: "Bugün karpuz indirimi", active: true });
  assert.equal(store.notify, undefined, "gizli ayarlar mağazaya gönderilmez");
  assert.equal(store.blockedPhones, undefined);

  // Tek tuşla sipariş alımını durdur
  r = await s.req("PATCH", "/api/admin/settings", { ordering: { enabled: false } }, admin);
  assert.equal(r.json.status.state, "durduruldu");
  store = (await s.req("GET", "/api/store")).json;
  assert.equal(store.status.acceptingOrders, false);
  await s.req("PATCH", "/api/admin/settings", { ordering: { enabled: true, minOrder: 200, deliveryFee: 0 } }, admin);

  for (const [body, re] of [
    [{ hours: { days: [{ open: "25:00", close: "02:00" }] } }, /7 gün/],
    [{ ordering: { payments: { nakit: false, kart: false } } }, /En az bir ödeme/],
    [{ store: { name: "" } }, /Mağaza adı gerekli/],
    [{ notify: { telegramBotToken: "olmaz" } }, /Telegram bot/],
    [{ bilinmeyen: 1 }, /Bilinmeyen ayar/],
    [{ banners: [{ title: "x", image: "http://dis.site/a.jpg" }] }, /görsel yükleyin/],
  ]) {
    r = await s.req("PATCH", "/api/admin/settings", body, admin);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.json.error, re);
  }
  // Bölge listesi: slug üretilir, kimlik verilir
  const zones = s.app.db.settings.zones.map((z) => ({ ...z }));
  zones.push({ name: "Yeni Mahalle Çarşı", fee: 20 });
  r = await s.req("PATCH", "/api/admin/settings", { zones }, admin);
  const nz = r.json.settings.zones.at(-1);
  assert.equal(nz.slug, "yeni-mahalle-carsi");
  assert.equal(nz.id, 8);
  assert.equal(nz.minOrder, null);
  // Yasal metin alan alan birleşir
  r = await s.req("PATCH", "/api/admin/settings", { legal: { companyTitle: "Ulusoy Gıda Ltd. Şti.", texts: { iade: "Özel iade metni" } } }, admin);
  assert.equal(r.json.settings.legal.texts.iade, "Özel iade metni");
  assert.equal(r.json.settings.legal.texts.kvkk, "");
  const legal = (await s.req("GET", "/api/admin/settings/legal-templates", undefined, admin)).json;
  assert.match(legal.kvkk, /6698/);
});

test("afiş / SSS / bölge toplu silme; afiş görseli yükleme ve temizliği", async () => {
  let r = await s.req("POST", "/api/admin/uploads", { image: PNG }, admin);
  assert.equal(r.status, 201);
  const url = r.json.url;
  const banners = [...s.app.db.settings.banners, { title: "Görselli", image: url }];
  r = await s.req("PATCH", "/api/admin/settings", { banners }, admin);
  const added = r.json.settings.banners.at(-1);
  assert.ok(added.id > 0);
  const faqIds = s.app.db.settings.faq.slice(0, 2).map((f) => f.id);
  r = await s.req("POST", "/api/admin/settings/faq/bulk-delete", { ids: [...faqIds, 555] }, admin);
  assert.deepEqual(r.json, { processed: 2, skipped: [{ id: 555, reason: "Soru bulunamadı." }] });
  assert.ok(!s.app.db.settings.faq.some((f) => faqIds.includes(f.id)));
  r = await s.req("POST", "/api/admin/settings/banners/bulk-delete", { ids: [added.id] }, admin);
  assert.equal(r.json.processed, 1);
  assert.ok(!fs.existsSync(path.join(s.dataDir, "uploads", path.basename(url))));
  const zoneId = s.app.db.settings.zones.at(-1).id;
  r = await s.req("POST", "/api/admin/settings/zones/bulk-delete", { ids: [zoneId] }, admin);
  assert.equal(r.json.processed, 1);
  // Yeni SSS eklenince kimlik verilir
  r = await s.req("PATCH", "/api/admin/settings", { faq: [...s.app.db.settings.faq, { q: "Yeni soru?", a: "Cevap." }] }, admin);
  assert.ok(r.json.settings.faq.every((f) => f.id > 0));
  assert.equal(new Set(r.json.settings.faq.map((f) => f.id)).size, r.json.settings.faq.length);
});

test("siparişler: liste/süzgeç/sayfa, since, durum, notlar, kurye, kalem düzenleme, elle sipariş", async () => {
  const mk = async (extra) => (await s.req("POST", "/api/orders", orderBody(extra))).json;
  const o1 = await mk({ phone: "05551110001", name: "Hasan Demir" });
  const o2 = await mk({ phone: "05551110002", name: "Elif Şahin", items: [{ productId: 13, qty: 5 }, { productId: 1, qty: 2 }] });
  let r = await s.req("GET", "/api/admin/orders?status=Yeni&pageSize=1", undefined, staff);
  assert.equal(r.status, 200);
  assert.equal(r.json.orders.length, 1);
  assert.equal(r.json.orders[0].id, o2.id, "en yeni üstte");
  assert.equal(r.json.pageSize, 1);
  assert.ok(r.json.pages >= 2);
  assert.ok(r.json.counts.Yeni >= 2);
  assert.equal(r.json.orders[0].stockHeld, undefined);
  r = await s.req("GET", "/api/admin/orders?q=elif", undefined, staff);
  assert.deepEqual(r.json.orders.map((o) => o.id), [o2.id]);
  r = await s.req("GET", `/api/admin/orders?q=${o1.id}`, undefined, staff);
  assert.ok(r.json.orders.some((o) => o.id === o1.id));
  r = await s.req("GET", "/api/admin/orders?from=2026-11-16&to=2026-11-16", undefined, staff);
  assert.ok(r.json.total >= 2);
  r = await s.req("GET", "/api/admin/orders?from=2026-11-17", undefined, staff);
  assert.equal(r.json.total, 0);

  const since = r.json.serverTime;
  s.setTime("2026-11-16T18:05:00.000Z");
  r = await s.req("PATCH", `/api/admin/orders/${o1.id}`, { status: "Hazırlanıyor", adminNote: "Kapıcıya bırak", courier: "Murat" }, staff);
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "Hazırlanıyor");
  assert.equal(r.json.courier, "Murat");
  assert.equal(r.json.history.at(-1).by, "kasa");
  r = await s.req("GET", `/api/admin/orders?since=${encodeURIComponent(since)}`, undefined, staff);
  assert.deepEqual(r.json.orders.map((o) => o.id), [o1.id]);
  r = await s.req("PATCH", `/api/admin/orders/${o1.id}`, { status: "Bilinmez" }, staff);
  assert.equal(r.status, 400);

  // Kalem düzenleme: adet değiştir + ürün çıkar + yeni ürün ekle
  r = await s.req("PUT", `/api/admin/orders/${o2.id}/items`, { items: [{ productId: 13, qty: 4 }, { productId: 1, qty: 0 }, { productId: 2, qty: 1 }] }, staff);
  assert.equal(r.status, 200, r.text);
  const lines = Object.fromEntries(r.json.items.map((i) => [i.productId, i.qty]));
  assert.deepEqual(lines, { 13: 4, 2: 1 });
  const p2 = s.app.db.products.find((p) => p.id === 2);
  assert.equal(r.json.subtotal, Math.round((4 * 46.5 + p2.price) * 100) / 100);
  assert.equal(r.json.total, r.json.subtotal - r.json.discount + r.json.deliveryFee);
  assert.match(r.json.history.at(-1).note, /Kalemler düzenlendi/);
  r = await s.req("PUT", `/api/admin/orders/${o2.id}/items`, { items: [{ productId: 13, qty: 0 }, { productId: 2, qty: 0 }] }, staff);
  assert.equal(r.status, 400);

  // İptal + not (müşteriye görünür), iptali geri alma
  r = await s.req("PATCH", `/api/admin/orders/${o2.id}`, { status: "İptal", cancelNote: "Ürün kalmadı" }, staff);
  assert.equal(r.json.cancelledBy, "market");
  const t = await s.req("GET", `/api/orders/${o2.id}?token=${o2.token}`);
  assert.equal(t.json.cancelNote, "Ürün kalmadı");
  r = await s.req("PATCH", `/api/admin/orders/${o2.id}`, { status: "Yeni" }, staff);
  assert.equal(r.json.cancelNote, "");
  assert.equal(r.json.cancelledBy, null);

  // Elle sipariş: saat/KVKK/minimum denetlenmez, uyarı döner
  s.setTime("2026-11-17T07:00:00.000Z"); // kapalı saat
  r = await s.req("POST", "/api/admin/orders", { name: "Telefon Müşterisi", phone: "05559998877", address: "Sabuni Mah. Telefon Sok. No:9", zoneId: 5, items: [{ productId: 13, qty: 1 }] }, staff);
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.source, "panel");
  assert.equal(r.json.history[0].by, "kasa");
  assert.match(r.json.warnings[0], /Minimum sipariş/);
  assert.match(r.json.token, /^[a-f0-9]{24}$/);
  s.setTime("2026-11-16T18:00:00.000Z");
  r = await s.req("GET", `/api/admin/orders/${r.json.id}`, undefined, staff);
  assert.equal(r.status, 200);
  assert.equal((await s.req("GET", "/api/admin/orders/99999", undefined, staff)).status, 404);
});

test("toplu sipariş: durum değiştirme (personel), silme yalnızca yönetici + yalnızca teslim/iptal + yedek", async () => {
  const mk = async () => (await s.req("POST", "/api/orders", orderBody({ phone: `0552${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}` }))).json.id;
  const a = await mk();
  const b = await mk();
  const c = await mk();
  let r = await s.req("POST", "/api/admin/orders/bulk", { ids: [a, b, 99999], action: "status", status: "Teslim edildi" }, staff);
  assert.equal(r.status, 200);
  assert.equal(r.json.processed, 2);
  assert.deepEqual(r.json.skipped, [{ id: 99999, reason: "Sipariş bulunamadı." }]);
  r = await s.req("POST", "/api/admin/orders/bulk", { ids: [a], action: "status", status: "Teslim edildi" }, staff);
  assert.deepEqual(r.json.skipped, [{ id: a, reason: "Sipariş zaten bu durumda." }]);
  r = await s.req("POST", "/api/admin/orders/bulk", { ids: [a], action: "delete" }, staff);
  assert.equal(r.status, 403);
  r = await s.req("POST", "/api/admin/orders/bulk", { ids: [a, b, c], action: "delete" }, admin);
  assert.equal(r.status, 200);
  assert.equal(r.json.processed, 2);
  assert.equal(r.json.skipped.length, 1);
  assert.equal(r.json.skipped[0].id, c);
  assert.match(r.json.skipped[0].reason, /"Yeni" durumundaki sipariş silinemez/);
  assert.match(r.json.backup, /^siparis-silme-oncesi-.+\.json$/);
  assert.ok(fs.existsSync(path.join(s.dataDir, "backups", r.json.backup)));
  assert.ok(!s.app.db.orders.some((o) => o.id === a || o.id === b));
});

test("müşteriler: siparişlerden türetilir, ayrıntı, engelle/kaldır", async () => {
  await s.req("POST", "/api/orders", orderBody({ phone: "05447770000", name: "Musa Kara" }));
  await s.req("POST", "/api/orders", orderBody({ phone: "05447770000", name: "Musa Kara", address: "Yeni adres Sok. No:12 Meydan" }));
  let r = await s.req("GET", "/api/admin/customers?q=musa", undefined, staff);
  assert.equal(r.json.total, 1);
  const c = r.json.customers[0];
  assert.equal(c.phone, "05447770000");
  assert.equal(c.orderCount, 2);
  assert.equal(c.totalSpent, 465);
  assert.equal(c.address, "Yeni adres Sok. No:12 Meydan");
  assert.equal(c.blocked, false);
  r = await s.req("GET", "/api/admin/customers/05447770000", undefined, staff);
  assert.equal(r.json.orders.length, 2);
  r = await s.req("PUT", "/api/admin/customers/0544%20777%2000%2000/block", { blocked: true }, admin);
  assert.deepEqual(r.json, { phone: "05447770000", blocked: true });
  assert.equal((await s.req("POST", "/api/orders", orderBody({ phone: "05447770000" }))).status, 403);
  r = await s.req("GET", "/api/admin/customers?blocked=1", undefined, staff);
  assert.ok(r.json.customers.some((x) => x.phone === "05447770000"));
  await s.req("PUT", "/api/admin/customers/05447770000/block", { blocked: false }, admin);
  assert.ok(!s.app.db.settings.blockedPhones.includes("05447770000"));
});

test("raporlar", async () => {
  const r = await s.req("GET", "/api/admin/reports?from=2026-11-16&to=2026-11-16", undefined, admin);
  assert.equal(r.status, 200);
  const rep = r.json;
  const valid = s.app.db.orders.filter((o) => o.status !== "İptal" && o.createdAt.startsWith("2026-11-16"));
  assert.equal(rep.summary.orders, valid.length);
  assert.equal(rep.summary.revenue, Math.round(valid.reduce((t, o) => t + o.total, 0) * 100) / 100);
  assert.equal(rep.byDay.length, 1);
  assert.equal(rep.byHour.length, 24);
  assert.equal(rep.byHour[21].orders, valid.length, "21:00 Türkiye saati");
  assert.ok(rep.byPayment.some((x) => x.key === "nakit" && x.label === "Kapıda nakit"));
  assert.ok(rep.byZone.length >= 1);
  assert.equal(rep.topProducts[0].productId, 13);
  assert.ok(rep.totals.today.orders >= 1);
  const csv = await fetch(`${s.base}/api/admin/orders/export?from=2026-11-16&to=2026-11-16`, { headers: { Authorization: `Bearer ${admin}` } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-disposition"), /attachment; filename="siparisler-2026-11-16\.csv"/);
  const buf = Buffer.from(await csv.arrayBuffer());
  assert.equal(buf.subarray(0, 3).toString("hex"), "efbbbf", "UTF-8 BOM");
  assert.ok(buf.toString("utf8").startsWith("﻿Sipariş no;Tarih;Durum"));
});

test("yedek indir ve geri yükle (öncesinde otomatik yedek, oturumlar kapanır)", async () => {
  const res = await fetch(`${s.base}/api/admin/backup`, { headers: { Authorization: `Bearer ${admin}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition"), /ulusoy-market-yedek-/);
  const backup = await res.json();
  assert.ok(Array.isArray(backup.products));
  const count = backup.products.length;
  // Veriyi değiştir, sonra geri yükle
  await s.req("POST", "/api/admin/products", { name: "Geçici", price: 1, categoryId: 1 }, admin);
  assert.equal(s.app.db.products.length, count + 1);
  let r = await s.req("POST", "/api/admin/restore", { foo: 1 }, admin);
  assert.equal(r.status, 400);
  r = await s.req("POST", "/api/admin/restore", backup, admin);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.relogin, true);
  assert.equal(s.app.db.products.length, count);
  assert.match(r.json.backup, /^geri-yukleme-oncesi-/);
  assert.equal((await s.req("GET", "/api/admin/me", undefined, admin)).status, 401);
  admin = await s.login();
  staff = await s.login("kasa", "personel1");
  const list = (await s.req("GET", "/api/admin/backups", undefined, admin)).json;
  assert.ok(list.some((b) => b.name === r.json.backup));
  const dl = await fetch(`${s.base}/api/admin/backups/${r.json.backup}`, { headers: { Authorization: `Bearer ${admin}` } });
  assert.equal(dl.status, 200);
  assert.equal((await s.req("GET", "/api/admin/backups/..%2Fdb.json", undefined, admin)).status, 404);
});

test("Telegram deneme: ayar yoksa anlaşılır hata", async () => {
  s.app.db.settings.notify.telegramBotToken = "";
  const r = await s.req("POST", "/api/admin/settings/telegram-test", {}, admin);
  assert.equal(r.status, 400);
  assert.match(r.json.error, /Telegram/);
});
