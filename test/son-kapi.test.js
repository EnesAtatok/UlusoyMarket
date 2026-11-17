"use strict";
// Son kapı (2. revizyon doğrulaması): bulunan açıkların ve bilinen pürüzlerin düzeltmelerini yakalayan testler
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { start, orderBody } = require("./helpers");
const { openSse, sleep } = require("./sse-client");
const { EventHub, ipGroup } = require("../lib/events");
const L = require("../lib/legal");

test("arşiv maskesi: personel siparişin takip anahtarını (token/trackPath) görmez; anahtarla açılan belgeler kişisel veri gösterirdi", async () => {
  const s = await start();
  try {
    const admin = await s.login();
    await s.req("POST", "/api/admin/users", { username: "kasa", password: "kasa12345", role: "personel" }, admin);
    const o = (await s.req("POST", "/api/orders", orderBody({ phone: "05556667788", name: "Gizli Kişi" }))).json;
    await s.req("POST", `/api/admin/orders/${o.id}/confirmation`, { channel: "telefon", note: "Eşi açtı, Gizli Kişi evde yok" }, admin);
    await s.req("POST", `/api/orders/${o.id}/return-request`, { token: o.token, message: "Süt bozuk çıktı" });
    await s.req("PATCH", `/api/admin/orders/${o.id}/return-requests/1`, { status: "Sonuçlandı", note: "Gizli Kişi'ye nakit iade" }, admin);
    await s.req("PATCH", `/api/admin/orders/${o.id}`, { status: "Teslim edildi" }, admin);
    s.setTime("2028-12-01T12:00:00.000Z");
    const staff = await s.login("kasa", "kasa12345");
    const views = [
      (await s.req("GET", `/api/admin/orders/${o.id}`, undefined, staff)).json,
      (await s.req("GET", "/api/admin/orders?status=Teslim%20edildi", undefined, staff)).json.orders.find((x) => x.id === o.id),
    ];
    for (const v of views) {
      assert.equal(v.archived, true);
      assert.ok(!v.token, "personel arşivdeki siparişin token'ını gördü");
      assert.equal(v.trackPath, null);
      assert.ok(!JSON.stringify(v).includes("Gizli Kişi"), "maskeli yanıtta kişisel veri kaldı");
    }
    // Yönetici token'ı görür; token ile sayfa gerçekten kişisel veri gösterir (maskenin neden gerekli olduğu)
    const full = (await s.req("GET", `/api/admin/orders/${o.id}`, undefined, admin)).json;
    assert.equal(full.token, o.token);
    const page = await s.req("GET", `/siparis/${o.id}/belgeler?t=${o.token}`);
    assert.match(page.text, /Gizli Kişi/);
  } finally {
    await s.close();
  }
});

test("anonimleştirme: teyit notu ve iade talebi yönetici notu da silinir; olay tamponundaki eski kişisel veri yeniden gönderilmez", async () => {
  const s = await start({ rateLimits: { orders: { windowMs: 60000, max: 1000 } } });
  try {
    const admin = await s.login();
    const o = (await s.req("POST", "/api/orders", orderBody({ phone: "05557778899", name: "Silinecek Kişi" }))).json;
    await s.req("POST", `/api/admin/orders/${o.id}/confirmation`, { channel: "whatsapp", note: "Silinecek Kişi onayladı" }, admin);
    await s.req("POST", `/api/orders/${o.id}/return-request`, { token: o.token, message: "iade" });
    await s.req("PATCH", `/api/admin/orders/${o.id}/return-requests/1`, { status: "İnceleniyor", note: "Silinecek Kişi aranacak" }, admin);
    await s.req("PATCH", `/api/admin/orders/${o.id}`, { status: "Teslim edildi" }, admin);
    assert.ok(s.app.events.history.some((e) => JSON.stringify(e.data).includes("Silinecek Kişi")));
    const r = await s.req("POST", "/api/admin/customers/05557778899/anonymize", { confirm: true }, admin);
    assert.equal(r.json.processed, 1);
    const ord = s.app.db.orders.find((x) => x.id === o.id);
    assert.ok(!JSON.stringify(ord).includes("Silinecek Kişi"), "siparişte kişisel veri kaldı");
    assert.ok(!s.app.events.history.some((e) => JSON.stringify(e.data).includes("Silinecek Kişi")), "olay tamponunda kişisel veri kaldı");
    // Panel akışı lastEventId=1 ile bağlanınca eski olaylar (ad/adres) gelmez
    const tk = (await s.req("POST", "/api/admin/stream-ticket", {}, admin)).json.ticket;
    const es = await openSse(s.base, `/api/admin/stream?ticket=${tk}&lastEventId=1`);
    await es.waitEvent("hello");
    await sleep(100);
    es.close();
    assert.ok(!es.raw.includes("Silinecek Kişi"));
  } finally {
    await s.close();
  }
});

test("kimliksiz durum akışı: siparişi olmayan ziyaretçiye saat / sipariş alımı değişikliği anında gider; kişisel veri ve sipariş olayı gitmez", async () => {
  const s = await start({ rateLimits: { orders: { windowMs: 60000, max: 1000 } } });
  try {
    const admin = await s.login();
    const es = await openSse(s.base, "/api/store/stream");
    try {
      assert.equal(es.status, 200);
      assert.match(es.headers["content-type"], /^text\/event-stream/);
      const hello = await es.waitEvent("hello");
      assert.equal(hello.json.status.isOpen, true);
      assert.equal(hello.json.orders, undefined);
      // Sipariş olayları bu akışa gelmez
      const o = (await s.req("POST", "/api/orders", orderBody({ name: "Komşu Kişi" }))).json;
      await s.req("PATCH", `/api/admin/orders/${o.id}`, { status: "Hazırlanıyor" }, admin);
      // Sipariş alımı durdurulunca "durum"
      const n = es.events.length;
      const t0 = Date.now();
      await s.req("PATCH", "/api/admin/settings", { ordering: { enabled: false } }, admin);
      const ev = await es.waitFor((e) => e.event === "durum", 2000, n);
      assert.ok(ev, "durum olayı gelmedi");
      assert.ok(Date.now() - t0 < 1000);
      assert.equal(ev.json.status.paused, true);
      assert.equal(ev.json.status.acceptingOrders, false);
      // Saat değişikliği
      const days = s.app.db.settings.hours.days.map((d) => ({ ...d, close: "03:00" }));
      await s.req("PATCH", "/api/admin/settings", { hours: { days } }, admin);
      const ev2 = await es.waitFor((e) => e.event === "durum" && e.json.status.today.close === "03:00", 2000, n);
      assert.ok(ev2);
      assert.ok(!es.raw.includes("Komşu Kişi"), "durum akışına sipariş verisi sızdı");
      assert.ok(!es.events.some((e) => /^siparis/.test(e.event)));
    } finally {
      es.close();
    }
    // Müşteri (sipariş) akışı da "durum" olayını taşır: sekme başına tek bağlantı yeter
    await s.req("PATCH", "/api/admin/settings", { ordering: { enabled: true } }, admin);
    const o = (await s.req("POST", "/api/orders", orderBody({ phone: "05329998877" }))).json;
    const tk = (await s.req("POST", "/api/orders/stream-ticket", { orders: [{ id: o.id, token: o.token }] })).json.ticket;
    const cs = await openSse(s.base, `/api/orders/stream?ticket=${tk}`);
    try {
      const h = await cs.waitEvent("hello");
      assert.ok(h.json.status, "müşteri hello'su mağaza durumunu taşır");
      const n = cs.events.length;
      await s.req("PATCH", "/api/admin/settings", { ordering: { enabled: false } }, admin);
      assert.ok(await cs.waitFor((e) => e.event === "durum" && e.json.status.paused === true, 2000, n));
    } finally {
      cs.close();
    }
  } finally {
    await s.close();
  }
});

test("durum akışı sınırları: IP başına, toplamda ayrı tavan; dolu havuz panel akışını engellemez; hız sınırı", async () => {
  const s = await start({ sse: { maxPerIp: 3, maxTotal: 4, maxPublic: 2 }, rateLimits: { stream: { windowMs: 60000, max: 6 } } });
  const open = [];
  try {
    const admin = await s.login();
    for (let i = 0; i < 2; i++) {
      const es = await openSse(s.base, "/api/store/stream");
      assert.equal(es.status, 200);
      open.push(es);
    }
    const third = await openSse(s.base, "/api/store/stream");
    assert.equal(third.status, 429, "kimliksiz akış tavanı aşıldı");
    assert.equal(third.json.code, "AKIS_SINIRI");
    // Panel akışı bu havuza takılmaz
    const tk = (await s.req("POST", "/api/admin/stream-ticket", {}, admin)).json.ticket;
    const panel = await openSse(s.base, `/api/admin/stream?ticket=${tk}`);
    assert.equal(panel.status, 200, "kimliksiz bağlantılar panel akışını engelledi");
    open.push(panel);
    // Hız sınırı (dakikada 6 deneme): 4. ve sonraki denemeler 429 HIZ_SINIRI
    let limited = null;
    for (let i = 0; i < 6 && !limited; i++) {
      const r = await openSse(s.base, "/api/store/stream");
      if (r.status === 429 && r.json.code === "HIZ_SINIRI") limited = r;
      else if (r.status === 200) open.push(r);
    }
    assert.ok(limited, "hız sınırı yok");
  } finally {
    for (const es of open) es.close();
    await s.close();
  }
});

test("SSE iç birimler: IPv6 /64 gruplama; okumayan istemcinin tamponu büyüyünce bağlantı kesilir; olay verisinde satır sonu enjeksiyonu yok", () => {
  assert.equal(ipGroup("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64");
  assert.equal(ipGroup("2001:db8:1:2:bbbb:cccc:dddd:eeee"), "2001:db8:1:2::/64");
  assert.equal(ipGroup("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(ipGroup("10.0.0.5"), "10.0.0.5");
  const hub = new EventHub({ heartbeatMs: 1e6, maxBuffered: 100 });
  try {
    const writes = [];
    let destroyed = false;
    const res = { writableEnded: false, destroyed: false, writableLength: 0, write: (x) => writes.push(x), destroy: () => { destroyed = true; }, end() {} };
    const sub = { kind: "durum", ip: "1.1.1.1", res };
    hub.subs.add(sub);
    hub.publish("herkes", "durum", { status: { message: "a\n\nevent: siparis\ndata: {}" } });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].split("\n\n").length, 2, "olay verisi yeni olay başlattı");
    assert.ok(!/\ndata: \{\}/.test(writes[0]));
    res.writableLength = 1000; // istemci okumuyor
    hub.publish("herkes", "durum", { status: {} });
    assert.equal(destroyed, true);
    assert.equal(hub.subs.has(sub), false);
    // IPv6 aynı /64'ten gelen bağlantılar tek IP gibi sayılır
    const h2 = new EventHub({ heartbeatMs: 1e6, maxPerIp: 2 });
    const fake = (ip) => ({ kind: "durum", ip, res: { writableEnded: true, destroyed: false, end() {} } });
    h2.subs.add(fake("2001:db8:1:2::a"));
    h2.subs.add(fake("2001:db8:1:2::b"));
    assert.ok(h2.canOpen("2001:db8:1:2::c", "durum"), "aynı /64 sınırı aşıldı");
    assert.equal(h2.canOpen("2001:db8:9:9::c", "durum"), null);
    h2.stop();
  } finally {
    hub.stop();
  }
});

test("geri yükleme: kurcalanmış yedek onaylanmış sözleşme metnini değiştiremez; özet tutmayan arşiv kaydı alınmaz", async () => {
  const s = await start();
  try {
    const admin = await s.login();
    const o = (await s.req("POST", "/api/orders", orderBody())).json;
    const backup = JSON.parse((await s.req("GET", "/api/admin/backup", undefined, admin)).text);
    const ver = Object.keys(backup.legalArchive)[0];
    const original = s.app.db.legalArchive[ver].text;
    backup.legalArchive[ver].text = "SAHTE: Alıcı cayma hakkından feragat etmiştir.";
    const fake = "f".repeat(64);
    backup.legalArchive[fake] = { key: "kvkk", title: "x", text: "uydurma", at: new Date().toISOString() };
    const r = await s.req("POST", "/api/admin/restore", backup, admin);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.rejectedArchive, 2);
    assert.equal(s.app.db.legalArchive[ver].text, original, "onaylanan metin değişti");
    assert.equal(s.app.db.legalArchive[fake], undefined);
    const page = await s.req("GET", `/siparis/${o.id}/belgeler?t=${o.token}`);
    assert.ok(!page.text.includes("SAHTE"));
  } finally {
    await s.close();
  }
});

test("yasal arşiv sınırsız büyümez: onaylanmamış eski sürümler en fazla N tutulur, siparişin onayladığı sürüm hiç silinmez", async () => {
  const s = await start();
  try {
    const admin = await s.login();
    const o = (await s.req("POST", "/api/orders", orderBody())).json;
    const accepted = s.app.db.orders.find((x) => x.id === o.id).consent.accepted.flatMap((c) => c.docs.map((d) => d.version));
    for (let i = 0; i < 25; i++) {
      const r = await s.req("PATCH", "/api/admin/settings", { store: { phone: `0537 311 ${String(1000 + i)}` } }, admin);
      assert.equal(r.status, 200);
    }
    const arch = s.app.db.legalArchive;
    for (const v of accepted) assert.ok(arch[v], "onaylanan sürüm silindi");
    const free = Object.keys(arch).filter((h) => !accepted.includes(h));
    assert.ok(free.length <= L.ARCHIVE_KEEP_UNREFERENCED, `arşiv ${free.length} kayda büyüdü`);
    const page = await s.req("GET", `/siparis/${o.id}/belgeler?t=${o.token}`);
    assert.ok(!page.text.includes("arşivde bulunamadı"));
  } finally {
    await s.close();
  }
});

test("anahtar döndürme yarıda kesildiyse (bazı dosyalar yeni, bazıları eski anahtarla) aynı komut kaldığı yerden tamamlar", async () => {
  const fs = require("fs");
  const path = require("path");
  const { execFileSync } = require("child_process");
  const { Cipher, isEncrypted } = require("../lib/secure-file");
  const OLD = "eski-anahtar-1234567890";
  const NEW = "yeni-anahtar-0987654321";
  const s = await start({ dataKey: OLD });
  const dir = s.dataDir;
  await s.req("POST", "/api/orders", orderBody());
  await s.login();
  await s.close(true);
  // Kesinti benzetimi: sessions.json yeni anahtarla yazılmış, db.json hâlâ eski anahtarla
  const sf = path.join(dir, "sessions.json");
  const plain = new Cipher(OLD).decrypt(fs.readFileSync(sf));
  fs.writeFileSync(sf, new Cipher(NEW).encrypt(plain));
  const script = path.join(__dirname, "..", "scripts", "anahtar-degistir.js");
  const out = execFileSync(process.execPath, [script], { env: { ...process.env, DATA_DIR: dir, DATA_KEY: OLD, NEW_DATA_KEY: NEW }, encoding: "utf8" });
  assert.match(out, /yeni anahtarla şifrelendi/);
  for (const f of ["db.json", "sessions.json", "audit.json"]) {
    const buf = fs.readFileSync(path.join(dir, f));
    assert.ok(isEncrypted(buf) && new Cipher(NEW).matches(buf), `${f} yeni anahtarla değil`);
  }
  const s2 = await start({ dataDir: dir, dataKey: NEW });
  assert.equal(s2.app.db.orders.length, 1);
  await s2.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("belgelerde enjeksiyon yok: müşteri adındaki yer tutucu ve HTML, yönetici metnindeki <script> kaçışlanır; yer tutucu tek geçişte dolar", async () => {
  const s = await start();
  try {
    const admin = await s.login();
    const store = (await s.req("GET", "/api/store")).json;
    const docs = s.app.db.settings.legal.docs.map((d) => (d.key === "kvkk" ? { ...d, text: "## Başlık\n<script>alert(1)</script> {{unvan}} $& $' **kalın**" } : d));
    assert.equal((await s.req("PATCH", "/api/admin/settings", { legal: { docs, companyTitle: "Ali <b>Ulusoy</b> {{toplam}}" } }, admin)).status, 200);
    const page = await s.req("GET", "/kvkk");
    assert.ok(!page.text.includes("<script>alert(1)"), "yasal sayfada çalışır script");
    assert.match(page.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(page.text, /Ali &lt;b&gt;Ulusoy&lt;\/b&gt; \{⁠\{toplam\}\} \$&amp; \$&#39;/, "değer içindeki yer tutucu yeniden doldurulmamalı");
    assert.ok(!page.text.includes("[toplam tutar]"));
    const r = await s.req("POST", "/api/orders/preview-documents", { ...orderBody(), name: "<img src=x onerror=alert(1)> {{toplam}}", address: "{{aliciTelefon}} </p><script>x</script>" });
    assert.equal(r.status, 200);
    const html = r.json.docs.map((d) => d.html).join("\n");
    assert.ok(!/<img|<script/.test(html), "önizleme HTML'inde etiket");
    assert.ok(store.legal.docs.length > 0);
  } finally {
    await s.close();
  }
});

test("işletme türü: şahısta MERSİS/KEP eksik sayılmaz; şirkette zorunlu ve metinde '[…]' kalır; seçilmezse uyarı", async () => {
  const s = await start();
  try {
    const admin = await s.login();
    const sec = async () => (await s.req("GET", "/api/admin/security", undefined, admin)).json;
    let st = await sec();
    assert.equal(st.legal.businessType, "");
    assert.ok(st.warnings.some((w) => w.code === "ISLETME_TURU_YOK"));
    assert.ok(!st.legal.missing.some((m) => m.field === "legal.mersis"));
    assert.equal((await s.req("PATCH", "/api/admin/settings", { legal: { businessType: "kooperatif" } }, admin)).status, 400);
    const base = { companyTitle: "Ali Ulusoy", taxOffice: "Edirne", taxNo: "1234567890", mersis: "", kep: "" };
    await s.req("PATCH", "/api/admin/settings", { legal: { ...base, businessType: "sahis" }, store: { email: "a@b.co" } }, admin);
    st = await sec();
    assert.ok(!st.warnings.some((w) => w.code === "ISLETME_TURU_YOK"));
    assert.deepEqual(st.legal.missing, []);
    assert.ok(!st.warnings.some((w) => w.code === "ISLETME_BILGISI_EKSIK"));
    let page = await s.req("GET", "/on-bilgilendirme");
    if (page.status === 404) page = await s.req("GET", "/mesafeli-satis");
    assert.ok(!/MERSİS:?\s*\[…\]/.test(page.text), "şahısta boş MERSİS satırı kalmamalı");
    await s.req("PATCH", "/api/admin/settings", { legal: { businessType: "sirket" } }, admin);
    st = await sec();
    assert.deepEqual(st.legal.missing.map((m) => m.field).sort(), ["legal.kep", "legal.mersis"]);
    page = await s.req("GET", "/mesafeli-satis");
    assert.match(page.text, /MERSİS:?\s*\[…\]/);
    assert.equal((await s.req("GET", "/api/store")).json.legal.businessType, "sirket");
  } finally {
    await s.close();
  }
});
