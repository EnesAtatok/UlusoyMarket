"use strict";
// Yasal onaylar (§E, YASAL.md §2–§5): veriyle tanımlı belgeler/onaylar, sürüm özetleri, onay kaydı, arşiv, sipariş sözleşmesi,
// ön bilgilendirme önizlemesi, cayma durumu, ödeme yükümlülüğü bildirimi, cayma/iade talebi; siparişlerim (§D)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { start, orderBody, REQUIRED_CONSENTS } = require("./helpers");

let s;
let admin;
before(async () => {
  s = await start({ rateLimits: { orders: { windowMs: 60000, max: 1000 } } });
  admin = await s.login();
});
after(() => s.close());
let seq = 0;
const phone = () => `0534${String(1000000 + ++seq).padStart(7, "0")}`;
const allDocs = (o) => o.consent.accepted.flatMap((a) => a.docs);

test("varsayılan onaylar YASAL.md §2.2: A, B, C zorunlu ve ayrı; D (ticari ileti) ayar kapalıyken gelmez", async () => {
  assert.deepEqual(REQUIRED_CONSENTS, ["onBilgilendirme", "mesafeliSozlesme", "kvkkAydinlatma"]);
  const r = await s.req("GET", "/api/store");
  const { docs, consents } = r.json.legal;
  assert.deepEqual(docs.map((d) => d.key).sort(), ["cerez", "iade", "iletisim", "islemRehberi", "kullanim", "kvkk", "mesafeliSatis", "onBilgilendirme", "teslimatKosullari"]);
  for (const d of docs) {
    assert.match(d.version, /^[0-9a-f]{64}$/);
    assert.match(d.path, /^\/[a-z0-9-]+$/);
    assert.equal(d.text, undefined, "metin /api/store'da gelmez");
  }
  assert.deepEqual(consents.map((c) => c.key), REQUIRED_CONSENTS);
  assert.ok(consents.every((c) => c.required));
  const [a, b, c] = consents;
  assert.deepEqual(a.labelParts[0], { text: "Ön Bilgilendirme Formu", doc: "onBilgilendirme", href: "/on-bilgilendirme" });
  assert.deepEqual(b.docs, ["mesafeliSatis", "teslimatKosullari", "iade", "kullanim"]);
  assert.match(c.text, /okudum ve anladım\.$/);
  assert.doesNotMatch(c.text, /onaylıyorum|kabul ediyorum|açık rıza/, "aydınlatma kutusunda onay/rıza ifadesi olmaz (Kurul 2026/347)");
  assert.equal(r.json.features.marketingConsent, false);
  // Ödeme yükümlülüğü düğmesi ve cayma etiketleri
  assert.equal(r.json.checkout.buttonLabel, "Siparişi onayla — ödeme yükümlülüğü doğurur");
  assert.match(r.json.checkout.paymentNotice, /\{\{toplam\}\}/);
  assert.equal(r.json.checkout.caymaLabels.yok_cabuk_bozulan, "Yok – çabuk bozulan");
  // Ürün ve kategori cayma durumu (kategoriden türetilmiş)
  const milk = r.json.products.find((p) => p.id === 13);
  assert.equal(milk.caymaDurumu, "yok_cabuk_bozulan");
  assert.equal(r.json.categories.find((x) => x.name === "Kişisel Bakım").caymaDurumu, "acilirsa_yok_hijyen");
  assert.equal(r.json.categories.find((x) => x.name === "Temizlik").caymaDurumu, "var");
  // Genel sayfa: sürüm /api/store'dakiyle aynı; siparişe özel alanlar açıklamalı; boş MERSİS/KEP satırı yok
  const page = await s.req("GET", "/mesafeli-satis");
  assert.match(page.text, new RegExp(`data-version="${docs.find((d) => d.key === "mesafeliSatis").version}"`));
  assert.match(page.text, /\[sipariş numarası\]/);
  assert.doesNotMatch(page.text, /MERSİS: \[…\]|KEP: \[…\]/);
  assert.doesNotMatch(page.text, /\{\{\w+\}\}/);
  assert.match(page.text, /<strong>/, "**kalın** biçimi");
  // Pazarlama belgeleri yayımda değil
  assert.equal((await s.req("GET", "/ticari-ileti-izni")).status, 404);
  assert.doesNotMatch((await s.req("GET", "/sitemap.xml")).text, /acik-riza/);
});

test("haksız şart riski taşıyan eski ifadeler varsayılan metinlerde yok", async () => {
  const iade = (await s.req("GET", "/iade-kosullari")).text;
  assert.doesNotMatch(iade, /24 saat içinde bildirmeniz/);
  assert.match(iade, /14 gün/);
  for (const p of ["/on-bilgilendirme", "/kvkk", "/kullanim-kosullari", "/teslimat-kosullari", "/islem-rehberi", "/iletisim", "/cerez-politikasi"]) {
    const r = await s.req("GET", p);
    assert.equal(r.status, 200, p);
    assert.doesNotMatch(r.text, /\{\{\w+\}\}|\[(B|İ|T)\]/, `${p} içinde doldurulmamış yer tutucu / araştırma işareti`);
  }
});

test("onaysız / eksik onaylı / eski kvkk alanlı sipariş reddedilir", async () => {
  for (const consents of [undefined, [], ["onBilgilendirme"], { onBilgilendirme: true, mesafeliSozlesme: true, kvkkAydinlatma: false }, ["ONBILGILENDIRME"], [{ $ne: 1 }]]) {
    const r = await s.req("POST", "/api/orders", orderBody({ phone: phone(), consents, kvkk: true }));
    assert.equal(r.status, 400, JSON.stringify(consents));
    assert.equal(r.json.code, "ONAY");
    assert.ok(Array.isArray(r.json.missing) && r.json.missing.length);
  }
  assert.equal(s.app.db.orders.length, 0);
  const ok = await s.req("POST", "/api/orders", orderBody({ phone: phone(), consents: { onBilgilendirme: true, mesafeliSozlesme: true, kvkkAydinlatma: true } }));
  assert.equal(ok.status, 201, ok.text);
});

test("onay kaydı: onaylar, belge sürümleri (SHA-256), zaman, IP; metin arşivde; kaleme cayma durumu kopyalanır", async () => {
  const st = (await s.req("GET", "/api/store")).json.legal;
  const versions = Object.fromEntries(st.docs.map((d) => [d.key, d.version]));
  const r = await s.req("POST", "/api/orders", orderBody({ phone: phone(), docVersions: versions }));
  assert.equal(r.status, 201, r.text);
  const o = s.app.db.orders.find((x) => x.id === r.json.id);
  assert.equal(o.consent.at, o.createdAt);
  assert.equal(o.consent.ip, "127.0.0.1");
  assert.deepEqual(o.consent.accepted.map((a) => a.key), REQUIRED_CONSENTS);
  assert.deepEqual(o.consent.declined, []);
  const md = allDocs(o).find((d) => d.key === "mesafeliSatis");
  assert.equal(md.version, versions.mesafeliSatis);
  const arch = s.app.db.legalArchive[md.version];
  assert.ok(arch, "metin arşivde");
  assert.equal(crypto.createHash("sha256").update(`${arch.title}\n\n${arch.text}`).digest("hex"), md.version, "özet metnin kendisinden");
  assert.equal(o.items[0].caymaDurumu, "yok_cabuk_bozulan");
  assert.equal(r.json.order.items[0].caymaDurumu, "yok_cabuk_bozulan");
  const ao = (await s.req("GET", `/api/admin/orders/${o.id}`, undefined, admin)).json;
  assert.equal(ao.consent.ip, "127.0.0.1");
  assert.equal(ao.consent.snapshot, undefined);
  assert.match(ao.trackPath, /^\/\?siparis=\d+&t=[a-f0-9]{24}$/);
  const p = await s.req("POST", "/api/admin/orders", orderBody({ phone: phone() }), admin);
  assert.equal(p.json.consent, null);
});

test("metin değişince sürüm değişir, eski sürüm arşivde kalır; sipariş sözleşmesi onaylandığı metinle, sipariş bilgileriyle dolu", async () => {
  const r = await s.req("POST", "/api/orders", orderBody({ phone: phone(), items: [{ productId: 13, qty: 6 }] }));
  const { id, token } = r.json;
  const oldVer = allDocs(s.app.db.orders.find((x) => x.id === id)).find((d) => d.key === "mesafeliSatis").version;
  const docs = s.app.db.settings.legal.docs.map((d) => (d.key === "mesafeliSatis" ? { ...d, text: "## Yeni sözleşme\nSipariş {{siparisNo}} toplamı {{toplam}}.\n\n{{urunTablosu}}" } : d));
  const u = await s.req("PATCH", "/api/admin/settings", { legal: { docs } }, admin);
  assert.equal(u.status, 200, u.text);
  const saved = u.json.settings.legal.docs.find((d) => d.key === "mesafeliSatis");
  assert.equal(u.json.settings.legal.texts.mesafeliSatis, saved.text, "eski texts alanı belgeyle eşit");
  assert.ok(saved.updatedAt, "metin değişince güncelleme tarihi");
  const newVer = (await s.req("GET", "/api/store")).json.legal.docs.find((d) => d.key === "mesafeliSatis").version;
  assert.notEqual(newVer, oldVer);
  const stale = await s.req("POST", "/api/orders", orderBody({ phone: phone(), docVersions: { mesafeliSatis: oldVer } }));
  assert.equal(stale.status, 409);
  assert.equal(stale.json.code, "METIN_DEGISTI");
  const dres = await s.req("POST", `/api/orders/${id}/documents`, { token });
  assert.equal(dres.status, 200);
  const md = dres.json.documents.find((d) => d.key === "mesafeliSatis");
  assert.equal(md.version, oldVer);
  assert.match(md.text, /Madde 1 – Taraflar/);
  assert.doesNotMatch(md.text, /Yeni sözleşme/);
  assert.match(md.text, new RegExp(`\\*\\*${id}\\*\\* numaralı siparişe`));
  assert.match(md.text, /Tam Yağlı Süt 1 L \(Sütaş\) · Miktar: 6 adet · Birim fiyat \(KDV dahil\): ₺46,50 · Tutar: ₺279,00 · Cayma: Yok – çabuk bozulan/);
  assert.match(md.text, /Alıcı:\*\* Ayşe Yılmaz/);
  assert.match(md.text, /Adrese teslim \(kurye\)/);
  assert.doesNotMatch(md.text, /\{\{\w+\}\}/, "doldurulmamış yer tutucu kaldı");
  assert.match(md.html, /<strong>/);
  assert.deepEqual(dres.json.documents.map((d) => d.key).sort(), ["iade", "kullanim", "kvkk", "mesafeliSatis", "onBilgilendirme", "teslimatKosullari"]);
  assert.equal(dres.json.consent.ip, undefined, "müşteriye IP gösterilmez");
  assert.equal((await s.req("POST", `/api/orders/${id}/documents`, { token: "0".repeat(24) })).status, 404);
  const r2 = await s.req("POST", "/api/orders", orderBody({ phone: phone() }));
  const d2 = (await s.req("POST", `/api/orders/${r2.json.id}/documents`, { token: r2.json.token })).json.documents.find((d) => d.key === "mesafeliSatis");
  assert.match(d2.text, new RegExp(`Sipariş ${r2.json.id} toplamı ₺232,50`));
  // Panel: JSON (IP dahil), yazdırılabilir HTML, arşiv listesi
  const ad = await s.req("GET", `/api/admin/orders/${id}/documents`, undefined, admin);
  assert.equal(ad.json.consent.ip, "127.0.0.1");
  const html = await s.req("GET", `/api/admin/orders/${id}/documents?format=html`, undefined, admin);
  assert.match(html.headers.get("content-type"), /text\/html/);
  assert.match(html.text, /Madde 1 – Taraflar/);
  const lg = await s.req("GET", "/api/admin/legal", undefined, admin);
  assert.ok(lg.json.archive.some((a) => a.version === oldVer && !a.current));
  assert.ok(lg.json.placeholders.order.urunTablosu);
  assert.equal(lg.json.docs.find((d) => d.key === "ticariIleti").visible, false);
  const v = await s.req("GET", `/api/admin/legal/versions/${oldVer}`, undefined, admin);
  assert.equal(v.status, 200);
  assert.ok(v.json.orders >= 1);
  const page = await s.req("GET", `/siparis/${id}/belgeler?t=${token}`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(page.headers.get("x-robots-tag"), /noindex/);
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(page.text, new RegExp(oldVer));
  assert.equal((await s.req("GET", `/siparis/${id}/belgeler?t=yanlis`)).status, 404);
  await s.req("PATCH", "/api/admin/settings", { legal: { docs: s.app.db.settings.legal.docs.map((d) => ({ ...d, text: d.key === "mesafeliSatis" ? "" : d.text })) } }, admin);
});

test("sipariş öncesi ön bilgilendirme önizlemesi: sepet ve form bilgileriyle dolu; teklif kalem bazında cayma ve ödeme bildirimi döner", async () => {
  const body = { type: "teslimat", zoneId: 1, payment: "kart", name: "Can <b>Kara</b>", phone: "05320000000", address: "Meydan Mah. No:3", items: [{ productId: 13, qty: 5 }] };
  const r = await s.req("POST", "/api/orders/preview-documents", body);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.docs.map((d) => d.key), ["onBilgilendirme", "mesafeliSatis"]);
  const ob = r.json.docs[0];
  assert.match(ob.text, /Alıcı: Can <b>Kara<\/b>/);
  assert.match(ob.html, /Can &lt;b&gt;Kara&lt;\/b&gt;/, "HTML kaçışlı");
  assert.match(ob.text, /kapıda kredi\/banka kartı/);
  assert.match(ob.text, /Cayma: Yok – çabuk bozulan/);
  assert.match(r.json.docs[1].text, /\[sipariş onaylanınca verilir\]/, "sözleşmede sipariş no henüz yok");
  assert.doesNotMatch(r.json.docs.map((d) => d.text).join(""), /\{\{\w+\}\}/);
  assert.match(r.json.paymentNotice, /teslimatta ₺232,50 tutarını .* ödeme yükümlülüğü altına girersiniz\. Ödeme kapıda kredi\/banka kartı ile yapılır\.$/);
  const q = await s.req("POST", "/api/cart/quote", { ...body, type: "gelal", zoneId: undefined, payment: "nakit" });
  assert.equal(q.json.items[0].caymaDurumu, "yok_cabuk_bozulan");
  assert.equal(q.json.items[0].caymaLabel, "Yok – çabuk bozulan");
  assert.match(q.json.paymentNotice, /dükkândan teslim alırken ₺232,50 tutarını/);
  assert.match(q.json.paymentNotice, /Ödeme dükkânda nakit ile yapılır\.$/);
});

test("pazarlama izni (D) ayarla açılır: kutu ve bağlı metinler yayımlanır, isteğe bağlıdır, zorunlu yapılamaz", async () => {
  const on = await s.req("PATCH", "/api/admin/settings", { privacy: { marketingConsent: true } }, admin);
  assert.equal(on.status, 200);
  const st = (await s.req("GET", "/api/store")).json;
  const d = st.legal.consents.find((c) => c.key === "ticariIleti");
  assert.ok(d);
  assert.equal(d.required, false);
  assert.match(d.text, /Ulusoy Market tarafından/, "{{isletmeAdi}} doldurulur");
  assert.equal((await s.req("GET", "/ticari-ileti-izni")).status, 200);
  const r1 = await s.req("POST", "/api/orders", orderBody({ phone: phone(), consents: [...REQUIRED_CONSENTS, "ticariIleti"] }));
  assert.deepEqual(s.app.db.orders.find((x) => x.id === r1.json.id).consent.accepted.map((a) => a.key).at(-1), "ticariIleti");
  const r2 = await s.req("POST", "/api/orders", orderBody({ phone: phone() }));
  assert.deepEqual(s.app.db.orders.find((x) => x.id === r2.json.id).consent.declined, ["ticariIleti"]);
  const consents = s.app.db.settings.legal.consents.map((c) => (c.key === "ticariIleti" ? { ...c, required: true } : c));
  assert.equal((await s.req("PATCH", "/api/admin/settings", { legal: { consents } }, admin)).status, 400);
  await s.req("PATCH", "/api/admin/settings", { privacy: { marketingConsent: false } }, admin);
  // Kapalıyken gönderilse de kaydedilmez
  const r3 = await s.req("POST", "/api/orders", orderBody({ phone: phone(), consents: [...REQUIRED_CONSENTS, "ticariIleti"] }));
  assert.ok(!s.app.db.orders.find((x) => x.id === r3.json.id).consent.accepted.some((a) => a.key === "ticariIleti"));
});

test("onay ve belge ayarları doğrulanır; yeni belge ve isteğe bağlı onay eklenebilir", async () => {
  const Lg = s.app.db.settings.legal;
  const patch = (legal) => s.req("PATCH", "/api/admin/settings", { legal }, admin);
  let r = await patch({ consents: [...Lg.consents, { key: "yeni", label: "X", docs: ["yokBoyle"], required: true }] });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /olmayan bir belgeye/);
  r = await patch({ docs: [...Lg.docs, { key: "panelX", title: "Panel", path: "/panel" }] });
  assert.equal(r.status, 400);
  r = await patch({ docs: [...Lg.docs, { key: "kvkk", title: "İkinci", path: "/ikinci" }] });
  assert.equal(r.status, 400);
  r = await patch({ docs: Lg.docs.filter((d) => d.key !== "kvkk") });
  assert.equal(r.status, 400, "onaya bağlı belge silinemez");
  r = await patch({
    docs: [...Lg.docs, { key: "ozel", title: "Özel Koşullar", path: "/ozel-kosullar", text: "## Koşullar\n{{isletmeAdi}} sitesi." }],
    consents: [...Lg.consents, { key: "ozelKosul", label: "[Özel koşulları](ozel) kabul ediyorum.", docs: ["ozel"], required: false, order: 9 }],
  });
  assert.equal(r.status, 200, r.text);
  const page = await s.req("GET", "/ozel-kosullar");
  assert.equal(page.status, 200);
  assert.match(page.text, /Ulusoy Market sitesi\./);
  assert.match((await s.req("GET", "/sitemap.xml")).text, /ozel-kosullar/);
  const o = await s.req("POST", "/api/orders", orderBody({ phone: phone() }));
  assert.equal(o.status, 201);
  assert.deepEqual(s.app.db.orders.find((x) => x.id === o.json.id).consent.declined, ["ozelKosul"]);
});

test("cayma/iade talebi: token ile; ekranda hemen teyit; panele düşer; panelden sonuçlandırılır", async () => {
  const o = (await s.req("POST", "/api/orders", orderBody({ phone: phone() }))).json;
  assert.equal((await s.req("POST", `/api/orders/${o.id}/return-request`, { token: "x".repeat(24), message: "iade" })).status, 404);
  assert.equal((await s.req("POST", `/api/orders/${o.id}/return-request`, { token: o.token, message: "" })).status, 400);
  const r = await s.req("POST", `/api/orders/${o.id}/return-request`, { token: o.token, message: "Sütlerden biri bozuk çıktı.", items: [{ productId: 13, qty: 1 }, { productId: 999, qty: 1 }] });
  assert.equal(r.status, 201, r.text);
  assert.match(r.json.message, /bize ulaştı \(talep no \d+-1\)/);
  assert.deepEqual(r.json.request.items, [{ productId: 13, qty: 1 }]);
  const ao = (await s.req("GET", `/api/admin/orders/${o.id}`, undefined, admin)).json;
  assert.equal(ao.returnRequests[0].message, "Sütlerden biri bozuk çıktı.");
  const p = await s.req("PATCH", `/api/admin/orders/${o.id}/return-requests/1`, { status: "Sonuçlandı", note: "Yenisi götürüldü" }, admin);
  assert.equal(p.status, 200);
  assert.equal(p.json.returnRequests[0].status, "Sonuçlandı");
  for (let i = 0; i < 4; i++) await s.req("POST", `/api/orders/${o.id}/return-request`, { token: o.token, message: `talep ${i}` });
  assert.equal((await s.req("POST", `/api/orders/${o.id}/return-request`, { token: o.token, message: "fazla" })).status, 429);
});

test("siparişlerim: toplu sorgu yalnızca doğru (id, token) çiftlerini döner; takip bağlantısı", async () => {
  const a = (await s.req("POST", "/api/orders", orderBody({ phone: phone() }))).json;
  const b = (await s.req("POST", "/api/orders", orderBody({ phone: phone() }))).json;
  assert.equal(a.trackPath, `/?siparis=${a.id}&t=${a.token}`);
  const r = await s.req("POST", "/api/orders/lookup", { orders: [{ id: a.id, token: a.token }, { id: b.id, token: a.token }, { id: 99999, token: "x" }, { id: b.id, token: b.token }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.orders.map((o) => o.id), [a.id]);
  assert.deepEqual(r.json.missing.sort(), [b.id, 99999].sort());
  assert.equal(r.json.orders[0].customer.phone, undefined);
  assert.equal((await s.req("POST", "/api/orders/lookup", { orders: "x" })).status, 400);
  assert.equal((await s.req("POST", "/api/orders/lookup", { orders: Array.from({ length: 31 }, (_, i) => ({ id: i + 1, token: "t" })) })).status, 400);
  const home = await s.req("GET", a.trackPath);
  assert.equal(home.status, 200);
  assert.equal(home.headers.get("cache-control"), "no-store");
  assert.equal(home.headers.get("etag"), null);
  assert.match(home.headers.get("x-robots-tag"), /noindex/);
  assert.equal(home.headers.get("referrer-policy"), "no-referrer");
  assert.equal((await s.req("GET", "/")).headers.get("cache-control"), "no-cache");
});

test("toplu sorgu hız sınırı", async () => {
  const t = await start({ rateLimits: { track: { windowMs: 60000, max: 2 } } });
  try {
    const body = { orders: [{ id: 1, token: "x" }] };
    await t.req("POST", "/api/orders/lookup", body);
    await t.req("POST", "/api/orders/lookup", body);
    const r = await t.req("POST", "/api/orders/lookup", body);
    assert.equal(r.status, 429);
  } finally {
    await t.close();
  }
});
