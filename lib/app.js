"use strict";
// Uygulama: yapılandırma, veri, oturumlar, yönlendirme, sayfalar. server.js yalnızca bunu başlatır.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Store } = require("./db");
const { Sessions, createLimiter, hashPasswordSync, verifyPasswordSync, DEFAULT_PASSWORD, PASSWORD_MIN } = require("./auth");
const { Router } = require("./router");
const H = require("./http");
const { serveFrom } = require("./static");
const P = require("./pages");
const L = require("./legal");
const O = require("./orders");
const { storeStatus, localDateStr } = require("./hours");
const { sendTelegram } = require("./notify");
const { HttpError, fail, ensureDir, allocId } = require("./util");
const { createCipher, dataKeyProblem } = require("./secure-file");
const { EventHub } = require("./events");
const { AuditLog, SECURE_ACTIONS } = require("./audit");
const { runRetention, isArchived, maskOrder } = require("./privacy");
const storeApi = require("./api-store");
const adminApi = require("./api-admin");

const ROOT = path.join(__dirname, "..");

const IMG_EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const IMAGE_MAX = 5 * 1024 * 1024;
const LOGIN_TRUST_MS = 30 * 24 * 3600 * 1000; // başarılı giriş yapılan ağ bu süre "bilinen ağ" sayılır

const isLocalHost = (req) => {
  const host = String(req.headers.host || "").toLowerCase().replace(/:\d+$/, "");
  return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "[::1]" || host === "::1";
};

const isLoopbackHost = (h) => /^(127\.\d+\.\d+\.\d+|localhost|::1|\[::1\])$/i.test(String(h || ""));
/**
 * Dinleme adresi. Varsayılan şifre (admin123) kullanımdayken sunucu yalnızca bu bilgisayara (127.0.0.1) açılır;
 * HOST ağa açık bir adres istese bile. Şifre değiştirilince (ya da ADMIN_PASSWORD ile kurulunca) HOST verilmemişse
 * tüm arayüzlerde dinlenir (host: undefined), verilmişse HOST'ta.
 */
function resolveListenHost({ host = "", defaultPasswordInUse = false } = {}) {
  const h = String(host || "").trim();
  if (defaultPasswordInUse && !isLoopbackHost(h))
    return { host: "127.0.0.1", localOnly: true, forced: true, requested: h || null };
  return { host: h || undefined, localOnly: isLoopbackHost(h), forced: false, requested: h || null };
}

/**
 * options: { dataDir, publicDir, seedFile, adminPassword, publicUrl, trustProxy, now, log, dataKey, forceHttps,
 *            rateLimits: { login, orders, lookup, track, stream } ({ windowMs, max }), telegramApiBase,
 *            sse: { ticketTtlMs, heartbeatMs, retryMs, maxPerIp, maxTotal } }
 */
function createApp(options = {}) {
  const opts = {
    dataDir: options.dataDir || process.env.DATA_DIR || path.join(ROOT, "data"),
    publicDir: options.publicDir || path.join(ROOT, "public"),
    seedFile: options.seedFile || path.join(ROOT, "data", "seed.json"),
    adminPassword: options.adminPassword || process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD,
    publicUrl: (options.publicUrl !== undefined ? options.publicUrl : process.env.PUBLIC_URL || "").replace(/\/+$/, ""),
    trustProxy: options.trustProxy !== undefined ? !!options.trustProxy : process.env.TRUST_PROXY === "1",
    dataKey: options.dataKey !== undefined ? options.dataKey : process.env.DATA_KEY || "",
    forceHttps: options.forceHttps !== undefined ? !!options.forceHttps : process.env.FORCE_HTTPS !== "0",
    now: options.now || (() => new Date()),
    log: options.log || ((msg) => console.log(`[${new Date().toISOString()}] ${msg}`)),
    rateLimits: {
      login: { windowMs: 15 * 60 * 1000, max: 8 }, // IP (/64) + kullanıcı adı başına
      loginIp: { windowMs: 15 * 60 * 1000, max: 30 }, // IP (/64) başına toplam deneme (kullanıcı adı değiştirerek scrypt yükü olmasın)
      loginUser: { windowMs: 15 * 60 * 1000, max: 30 }, // kullanıcı adı başına, IP'den bağımsız (bilinen ağdan giriş muaf)
      password: { windowMs: 15 * 60 * 1000, max: 8 }, // şifre değiştirmede mevcut şifre denemesi (kullanıcı başına)
      orders: { windowMs: 10 * 60 * 1000, max: 10 },
      lookup: { windowMs: 10 * 60 * 1000, max: 30 },
      track: { windowMs: 10 * 60 * 1000, max: 300 },
      quote: { windowMs: 10 * 60 * 1000, max: 600 },
      stream: { windowMs: 10 * 60 * 1000, max: 120 },
      ...(options.rateLimits || {}),
    },
    trustedProxies: options.trustedProxies !== undefined ? options.trustedProxies : process.env.TRUSTED_PROXIES || "",
    audit: options.audit || {},
    sse: options.sse || {},
    telegramApiBase: options.telegramApiBase || "https://api.telegram.org",
  };
  opts.dataDir = path.resolve(opts.dataDir);
  opts.publicDir = path.resolve(opts.publicDir);
  if (opts.dataKey) {
    const problem = dataKeyProblem(opts.dataKey);
    if (problem)
      throw new Error(`${problem} Mevcut veri bu anahtarla şifrelenmişse: sunucu kapalıyken DATA_KEY='<şimdiki değer>' NEW_DATA_KEY='<yeni rastgele anahtar>' npm run anahtar-degistir ile yeni anahtara geçin.`);
  }
  // ADMIN_PASSWORD yalnızca ilk yönetici oluşturulurken kullanılır; verilmişse en az kural uzunluğunda olmalı
  if (opts.adminPassword !== DEFAULT_PASSWORD && String(opts.adminPassword).length < PASSWORD_MIN)
    throw new Error(`ADMIN_PASSWORD en az ${PASSWORD_MIN} karakter olmalı.`);
  const trusted = H.parseTrustedProxies(opts.trustedProxies);
  const publicUrlHttps = /^https:\/\//i.test(opts.publicUrl);
  ensureDir(opts.dataDir);
  const uploadDir = ensureDir(path.join(opts.dataDir, "uploads"));
  const legacyUploadDir = path.join(opts.publicDir, "uploads");
  const cipher = createCipher(opts.dataKey);

  // ---------- Okuma (hiçbir dosyaya yazılmaz; şifre sorununda burada durulur) ----------
  const store = new Store({ dataDir: opts.dataDir, seedFile: opts.seedFile, log: opts.log, cipher });
  const { changed } = store.load();
  const sessions = new Sessions(path.join(opts.dataDir, "sessions.json"), undefined, cipher);
  const auditLog = new AuditLog(path.join(opts.dataDir, "audit.json"), cipher, { log: opts.log, ...opts.audit });
  const defaultPwCache = new Map(); // passHash → varsayılan şifre mi
  const events = new EventHub(opts.sse);

  const app = {
    opts,
    store,
    cipher,
    events,
    auditLog,
    get db() {
      return store.db;
    },
    now: () => opts.now(),
    log: opts.log,
    telegramApiBase: opts.telegramApiBase,
    sessions,
    limiters: Object.fromEntries(
      ["login", "loginIp", "loginUser", "password", "orders", "lookup", "track", "quote", "stream"].map((k) => [k, createLimiter(opts.rateLimits[k])])
    ),
    // Başarılı giriş yapılan ağlar (kullanıcı adı → ağ anahtarı → son geçerlilik). Kullanıcı adı başına yavaşlatma
    // bu ağlara uygulanmaz: başka yerden şifre deneyen biri yöneticiyi kendi ağından kilitleyemesin. Yalnızca bellekte.
    loginTrust: {
      map: new Map(),
      has(username, net) {
        const m = this.map.get(username);
        const t = m && m.get(net);
        return !!t && t > Date.now();
      },
      add(username, net) {
        let m = this.map.get(username);
        if (!m) this.map.set(username, (m = new Map()));
        m.delete(net);
        m.set(net, Date.now() + LOGIN_TRUST_MS);
        while (m.size > 50) m.delete(m.keys().next().value);
      },
      forget(username) {
        this.map.delete(username);
      },
    },
    listenInfo: null, // server.js atar: { host, localOnly, forced, requested }
    status: () => storeStatus(store.db.settings, opts.now()),
    save: () => store.save(),
    // Yasal metinlerdeki {{websitesi}} ve sürüm özetleri için taban adres: yalnızca PUBLIC_URL. İsteğin Host başlığı
    // kullanılmaz (müşterinin elinde: her farklı Host yeni metin sürümü ve arşiv kaydı üretirdi); boşsa metinde "[…]".
    legalBaseUrl: () => opts.publicUrl || "",

    // İlk kurulumda (ya da kullanıcı listesi boşsa) admin / ADMIN_PASSWORD yöneticisi oluşturulur
    ensureAdminUser() {
      const users = store.db.users;
      if (users.some((u) => u.role === "yonetici" && u.active)) return false;
      const existing = users.find((u) => u.username === "admin");
      if (existing) {
        existing.role = "yonetici";
        existing.active = true;
      } else {
        users.push({
          id: allocId(store.db, "users", users),
          username: "admin",
          name: "Yönetici",
          role: "yonetici",
          passHash: hashPasswordSync(opts.adminPassword),
          active: true,
          createdAt: new Date().toISOString(),
        });
      }
      return true;
    },

    // data:image/...;base64,... → DATA_DIR/uploads içine kaydeder, URL döner
    saveImage(dataUrl) {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ""));
      if (!m) fail(400, "Görsel JPG, PNG veya WEBP olmalı.", "GORSEL");
      const buf = Buffer.from(m[2], "base64");
      if (!buf.length) fail(400, "Görsel okunamadı.", "GORSEL");
      if (buf.length > IMAGE_MAX) fail(400, "Görsel en fazla 5 MB olabilir.", "GORSEL");
      // İçerik gerçekten görsel mi (imza denetimi)
      const sig = buf.subarray(0, 12);
      const ok =
        (m[1] === "image/jpeg" && sig[0] === 0xff && sig[1] === 0xd8) ||
        (m[1] === "image/png" && sig.subarray(0, 4).toString("hex") === "89504e47") ||
        (m[1] === "image/webp" && sig.subarray(0, 4).toString() === "RIFF" && sig.subarray(8, 12).toString() === "WEBP");
      if (!ok) fail(400, "Görsel dosyası bozuk ya da türü yanlış.", "GORSEL");
      const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${IMG_EXT[m[1]]}`;
      fs.writeFileSync(path.join(uploadDir, name), buf, { flag: "wx" }); // aynı adlı dosyanın üzerine asla yazılmaz
      return `/uploads/${name}`;
    },
    // Başka bir kayıt (ürün, kategori, afiş) kullanmıyorsa yüklenen görseli siler.
    // Yalnızca /uploads/ altındakiler silinir; depodaki /img/... görsellerine (örnek katalog) asla dokunulmaz.
    deleteImageIfUnused(url) {
      if (!url || !String(url).startsWith("/uploads/")) return;
      const d = store.db;
      const used =
        d.products.some((p) => p.image === url) || d.categories.some((c) => c.image === url) || d.settings.banners.some((b) => b.image === url);
      if (used) return;
      const name = path.basename(url);
      for (const dir of [uploadDir, legacyUploadDir]) {
        try { fs.rmSync(path.join(dir, name), { force: true }); } catch {}
      }
    },
    // Kullanıcının şifresi herkesçe bilinen varsayılan şifre (admin123) mi? Özet başına bir kez hesaplanır.
    usesDefaultPassword(u) {
      if (!u || typeof u.passHash !== "string") return false;
      if (!defaultPwCache.has(u.passHash)) defaultPwCache.set(u.passHash, verifyPasswordSync(DEFAULT_PASSWORD, u.passHash));
      return defaultPwCache.get(u.passHash);
    },
    markDefaultPassword(u, value) {
      if (u && typeof u.passHash === "string") defaultPwCache.set(u.passHash, !!value);
    },
    // Telegram bildirimi (ayarlıysa). Hata siparişi engellemez.
    notify(text) {
      const n = store.db.settings.notify;
      if (!n.telegramBotToken || !n.telegramChatId) return;
      sendTelegram({ token: n.telegramBotToken, chatId: n.telegramChatId, text, apiBase: opts.telegramApiBase })
        .then((r) => { if (!r.ok) opts.log(`Telegram bildirimi gönderilemedi: ${r.error}`); })
        .catch((e) => opts.log(`Telegram bildirimi gönderilemedi: ${e.message}`));
    },

    // ---------- Canlı olaylar ----------
    publishOrder(o, kind = "guncellendi") {
      // Arşivlenmiş siparişin kişisel verisi akışa maskeli gider (personel de dinliyor; yönetici ayrıntıyı ayrıca çeker)
      const archived = isArchived(o, store.db.settings, opts.now());
      events.publish("panel", kind === "yeni" ? "siparis.yeni" : "siparis.guncellendi", { ...O.adminOrder(archived ? maskOrder(o) : o), archived });
      events.publish("musteri", "siparis", O.streamOrder(o, store.db.settings), o.id);
    },
    publishDeleted(ids) {
      if (!ids.length) return;
      events.publish("panel", "siparis.silindi", { ids });
      for (const id of ids) events.publish("musteri", "siparis.silindi", { id }, id);
    },
    // Saat / sipariş alımı değişti: panele ve açık mağaza sayfalarına (müşteri + kimliksiz durum akışı) gider.
    // Mağaza olayı yalnızca herkese açık durumu taşır (/api/store "status" alanıyla aynı); istemci /api/store'u yeniden çeker.
    publishStatus() {
      const status = app.status();
      events.publish("panel", "durum", { status });
      events.publish("herkes", "durum", { status });
    },
    // Anonimleştirilen siparişlerin eski olayları (ad/adres taşıyan) yeniden bağlanmada (lastEventId) geri gönderilmesin
    forgetAnonymized() {
      events.forgetOrders(store.db.orders.filter((o) => o.anonymizedAt).map((o) => o.id));
    },
    // Toplu veri değişikliği (geri yükleme): tüm akışlar "yenile" ile kapanır, istemci yeni biletle bağlanır
    resetStreams() {
      events.history = []; // eski verinin olayları yeni veriyle karışmasın
      events.tickets.clear(); // eski veriye göre verilmiş biletler (aynı numaralı başka siparişe) bağlanamasın
      events.closeAll(null, "yenile", { reason: "Veri yeniden yüklendi." });
    },

    // ---------- Denetim kaydı ----------
    audit(ctx, action, details, { secure = false } = {}) {
      auditLog.add({
        user: ctx && ctx.user ? ctx.user.username : (details && details.user) || "sistem",
        role: ctx && ctx.user ? ctx.user.role : null,
        action,
        details: details && Object.keys(details).length ? details : undefined,
      }, { secure });
    },

    // ---------- Saklama süresi ----------
    runRetention(force = false) {
      const now = opts.now();
      const today = localDateStr(now);
      const meta = store.db.meta;
      if (!force && meta.retention && meta.retention.lastRun === today) return null;
      const n = runRetention(store.db, now);
      meta.retention = { lastRun: today, lastRunAt: now.toISOString(), lastCount: n };
      store.save();
      if (n) {
        app.forgetAnonymized();
        opts.log(`Saklama süresi: ${n} siparişteki kişisel veriler anonimleştirildi.`);
        auditLog.add({ user: "sistem", role: null, action: "saklama.anonimlestir", label: "Saklama süresi dolan siparişler anonimleştirildi", details: { orders: n } }, { secure: true });
        events.publish("panel", "yenile", { reason: "Eski siparişler anonimleştirildi." });
      }
      return n;
    },

    // ---------- Güvenlik durumu (panel uyarıları) ----------
    securityStatus(req, user) {
      const s = store.db.settings;
      const requestHttps = H.isHttps(req, opts.trustProxy, trusted);
      const local = isLocalHost(req);
      const warnings = [];
      const w = (code, level, message) => warnings.push({ code, level, message });
      if (!requestHttps && !local)
        w("HTTPS_YOK", "kritik", "Site şifresiz (HTTP) bağlantıyla açılıyor: müşteri bilgileri yolda okunabilir. HTTPS (ör. Caddy) kurun ve PUBLIC_URL'yi https:// ile verin.");
      if (publicUrlHttps && !opts.trustProxy)
        w("VEKIL_AYARI", "uyari", "PUBLIC_URL https:// ama TRUST_PROXY=1 değil: HTTP → HTTPS yönlendirmesi ve HSTS çalışmaz.");
      if (!opts.publicUrl) w("PUBLIC_URL_YOK", "uyari", "PUBLIC_URL verilmemiş: sayfa adresleri isteğin Host başlığından üretiliyor, yasal metinlerde site adresi \"[…]\" görünüyor.");
      const li = app.listenInfo;
      if (li && li.forced)
        w("YEREL_DINLEME", "uyari", "Varsayılan şifre (admin123) kullanımda olduğu için sunucu yalnızca bu bilgisayardan açılıyor (127.0.0.1); ağdaki diğer cihazlar ve internet erişemez. Hesabım → Şifre değiştir ile şifreyi değiştirip sunucuyu yeniden başlatınca ağa açılır.");
      if (!cipher) w("SIFRESIZ_DEPO", "uyari", "Müşteri verisi sunucuda şifresiz saklanıyor. DATA_KEY ortam değişkeniyle depoda şifrelemeyi açın (bkz. DEPLOY.md).");
      const weak = store.db.users.filter((u) => u.active && app.usesDefaultPassword(u)).map((u) => u.username);
      if (weak.length) w("VARSAYILAN_SIFRE", "kritik", "Varsayılan şifre (admin123) hâlâ kullanımda. Hemen değiştirin.");
      const missing = [];
      // Şahıs işletmesinde (esnaf/şahıs tacir) ad soyad + VKN yeterli; MERSİS ve KEP yalnızca şirkette zorunlu (YASAL.md §4.2)
      const bt = s.legal.businessType || "";
      const company = bt === "sirket";
      const need = [
        ["legal.companyTitle", company ? "Şirket unvanı" : "Ad soyad (ya da unvan)", s.legal.companyTitle],
        ["legal.taxOffice", "Vergi dairesi", s.legal.taxOffice],
        ["legal.taxNo", company ? "Vergi numarası" : "Vergi / TC kimlik numarası", s.legal.taxNo],
        ...(company ? [["legal.mersis", "MERSİS numarası", s.legal.mersis], ["legal.kep", "KEP adresi", s.legal.kep]] : []),
        ["store.address", "Açık adres", s.store.address],
        ["store.phone", "Telefon", s.store.phone],
        ["store.email", "E-posta (cayma bildirimi ve KVKK başvuruları için)", s.store.email],
      ];
      for (const [field, label, v] of need) if (!String(v || "").trim()) missing.push({ field, label });
      if (!bt) w("ISLETME_TURU_YOK", "uyari", "İşletme türünü seçin (şahıs işletmesi / şirket). Sitede hangi kimlik bilgilerinin zorunlu olduğu buna bağlı: şahısta ad soyad ve vergi numarası, şirkette ayrıca MERSİS ve KEP.");
      if (missing.length)
        w("ISLETME_BILGISI_EKSIK", "uyari", `Canlıya çıkmadan önce işletme bilgilerini doldurun: ${missing.map((m) => m.label).join(", ")}. Yasal metinlerde "[…]" görünüyor.${company ? "" : " (Şahıs işletmesinde MERSİS ve KEP zorunlu değil; boşsa metinlerden kendiliğinden çıkarılır.)"}`);
      if (!String(s.legal.etbisNo || "").trim())
        w("ETBIS_YOK", "uyari", "ETBİS kaydı girilmemiş. Kendi sitesinden satış yapan işletme satışa başlamadan önce e-Devlet üzerinden ETBİS'e kaydolmalı (YASAL.md §4.2.3).");
      const consents = L.activeConsents(s);
      if (!consents.some((c) => c.required)) w("ONAY_YOK", "uyari", "Sipariş formunda zorunlu onay kutusu yok. Mesafeli satış ve ön bilgilendirme onayı alınmalı.");
      if (s.privacy.phoneLookup) w("TELEFON_SORGU_ACIK", "bilgi", "Numara + telefonla sipariş sorgulama açık: telefonu ve sipariş numarasını bilen herkes siparişin durumunu (salt okunur) görebilir.");
      if (!s.privacy.retentionDays) w("SAKLAMA_KAPALI", "bilgi", "Otomatik anonimleştirme kapalı: eski siparişlerdeki kişisel veriler süresiz kalır.");
      else if (s.privacy.retentionDays < 3650)
        w("SAKLAMA_KISA", "bilgi", "Anonimleştirme süresi 10 yıldan kısa. 6563 sayılı Kanun m.11 e-ticaret kayıtlarının 10 yıl saklanmasını istiyor; avukatınıza danışın (YASAL.md §4.3.6).");
      if (s.notify.telegramBotToken && s.notify.telegramChatId)
        w("TELEGRAM_ACIK", "bilgi", "Telegram bildirimi açık. Telegram yurt dışında olduğu için bildirimlere müşteri adı, telefon, adres ve not yazılmaz; yalnızca sipariş no, tür, bölge, ürün sayısı ve tutar gider.");
      if (s.privacy.marketingConsent)
        w("PAZARLAMA_IZNI_ACIK", "bilgi", "Ticari ileti izni kutusu açık. İYS kaydı ve İYS'ye bağlı bir SMS sağlayıcısı olmadan kampanya mesajı göndermeyin; izinleri 3 iş günü içinde İYS'ye işleyin.");
      return {
        https: {
          ok: requestHttps || local,
          requestHttps,
          local,
          publicUrl: opts.publicUrl || null,
          publicUrlHttps,
          trustProxy: opts.trustProxy,
          forced: opts.forceHttps && publicUrlHttps && opts.trustProxy,
          hsts: requestHttps,
        },
        dataKey: { enabled: !!cipher },
        listen: li ? { localOnly: !!li.localOnly, forced: !!li.forced } : null,
        defaultPassword: { inUse: weak.length > 0, users: user && user.role === "yonetici" ? weak : undefined },
        legal: { ok: missing.length === 0 && !!bt, businessType: bt, missing, requiredConsents: consents.filter((c) => c.required).map((c) => c.key) },
        etbis: { ok: !!String(s.legal.etbisNo || "").trim() },
        telegram: { enabled: !!(s.notify.telegramBotToken && s.notify.telegramChatId), personalData: false },
        privacy: {
          retentionDays: s.privacy.retentionDays,
          archiveDays: s.privacy.archiveDays,
          phoneLookup: !!s.privacy.phoneLookup,
          marketingConsent: !!s.privacy.marketingConsent,
          lastRetentionRun: (store.db.meta.retention && store.db.meta.retention.lastRunAt) || null,
        },
        streams: events.stats(),
        warnings,
      };
    },
  };

  // Panel akışı: bileti alan oturum hâlâ açık ve kullanıcı aktif mi
  events.validatePanel = (sub) => {
    const sess = sessions.getByHash(sub.sessionHash);
    return !!sess && sess.userId === sub.userId && store.db.users.some((u) => u.id === sub.userId && u.active);
  };

  // ---------- Yazma (tüm dosyalar okunabildi) ----------
  store.commitLoad();
  const backupState = store.probeBackups();
  if (app.ensureAdminUser() || changed) store.save();
  else store.dailyBackup();
  if (sessions.needsEncrypt()) sessions.persist();
  if (auditLog.needsEncrypt()) auditLog.persist();
  if (cipher) store.encryptPlainBackups();
  else if (backupState.some((b) => b.encrypted)) opts.log("UYARI: backups/ içinde şifreli yedekler var ama DATA_KEY verilmedi; bu yedekler açılamaz.");

  // Her açılışta: varsayılan şifreyle giriş yapılabilen aktif hesap varsa belirgin uyarı (panelde de gösterilir)
  const weak = store.db.users.filter((u) => u.active && app.usesDefaultPassword(u));
  app.defaultPasswordUsers = weak.map((u) => u.username);
  if (weak.length)
    opts.log(`UYARI: "${weak.map((u) => u.username).join('", "')}" kullanıcısının şifresi herkesçe bilinen varsayılan şifre (${DEFAULT_PASSWORD}). Yayına almadan önce panelde Hesabım → Şifre değiştir ile hemen değiştirin.`);
  if (!cipher) opts.log("UYARI: DATA_KEY verilmedi; müşteri verisi (db.json, yedekler) diskte şifresiz saklanıyor.");
  if (opts.publicUrl && !publicUrlHttps && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(opts.publicUrl))
    opts.log("UYARI: PUBLIC_URL https:// değil; müşteri bilgileri yolda şifresiz gider. Yayında HTTPS kullanın.");
  if (publicUrlHttps && !opts.trustProxy) opts.log("UYARI: PUBLIC_URL https:// ama TRUST_PROXY=1 değil; HTTP → HTTPS yönlendirmesi ve HSTS devre dışı.");

  // Saklama süresi: açılışta ve saatte bir denetlenir, günde bir kez çalışır
  try { app.runRetention(); } catch (e) { opts.log(`Saklama süresi işi çalışmadı: ${e.message}`); }
  const retentionTimer = setInterval(() => {
    try { app.runRetention(); } catch (e) { opts.log(`Saklama süresi işi çalışmadı: ${e.message}`); }
  }, 60 * 60 * 1000);
  if (retentionTimer.unref) retentionTimer.unref();

  const router = new Router();
  storeApi.register(router, app);
  adminApi.register(router, app);

  function baseUrlOf(req) {
    if (opts.publicUrl) return opts.publicUrl;
    const host = String(req.headers.host || "localhost").replace(/[^A-Za-z0-9.:\-[\]]/g, "") || "localhost";
    return `${H.isHttps(req, opts.trustProxy, trusted) ? "https" : "http"}://${host}`;
  }

  // ---------- SSE akışı (bilet tüketilir) ----------
  app.openStream = (ctx, kind) => {
    const r = events.consumeTicket(ctx.query.get("ticket"), kind, ctx.ip);
    if (r.error === "SURE") fail(410, "Akış biletinin süresi doldu. Yeni bilet alın.", "BILET_SURESI_DOLDU");
    if (r.error) fail(403, "Akış bileti geçersiz ya da daha önce kullanılmış. Yeni bilet alın.", "BILET_GECERSIZ");
    const busy = events.canOpen(ctx.ip, kind);
    if (busy) fail(429, busy.message, "AKIS_SINIRI", { retryAfter: 30 });
    const lastEventId = ctx.query.get("lastEventId") || ctx.req.headers["last-event-id"];
    if (kind === "musteri") {
      const list = r.info.orderIds.map((id) => store.db.orders.find((o) => o.id === id)).filter(Boolean);
      events.open(ctx.req, ctx.res, { kind, ip: ctx.ip, orderIds: new Set(list.map((o) => o.id)) }, {
        hello: { orders: list.map((o) => O.streamOrder(o, store.db.settings)), status: app.status() },
        lastEventId,
      });
    } else {
      const sub = { kind, ip: ctx.ip, userId: r.info.userId, sessionHash: r.info.sessionHash };
      if (!events.validatePanel(sub)) fail(401, "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.", "OTURUM");
      const latestId = store.db.orders.reduce((m, o) => Math.max(m, o.id), 0);
      events.open(ctx.req, ctx.res, sub, { hello: { latestId, status: app.status() }, lastEventId });
    }
  };

  // Kimliksiz durum akışı (siparişi olmayan ziyaretçi): yalnızca herkese açık mağaza durumu ("durum" olayı).
  // Bilet gerekmez; hız sınırı, IP başına ve toplam (ayrı) bağlantı sınırı uygulanır.
  app.openPublicStream = (ctx) => {
    const wait = app.limiters.stream.hit(ctx.ipKey);
    if (wait) fail(429, "Çok fazla canlı bağlantı denemesi. Sayfa yoklamayla güncellenmeye devam edecek.", "HIZ_SINIRI", { retryAfter: wait });
    const busy = events.canOpen(ctx.ip, "durum");
    if (busy) fail(429, busy.message, "AKIS_SINIRI", { retryAfter: 30 });
    events.open(ctx.req, ctx.res, { kind: "durum", ip: ctx.ip }, { hello: { status: app.status() } });
  };

  // ---------- API ----------
  // Bearer oturumundan güncel kullanıcı (istek başında ve gövde okunduktan sonra yeniden okunur)
  function authUser(token, role) {
    const session = app.sessions.get(token);
    const user = session && store.db.users.find((u) => u.id === session.userId && u.active);
    if (!user) throw new HttpError(401, "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.", "OTURUM");
    if (role === "yonetici" && user.role !== "yonetici") throw new HttpError(403, "Bu işlem için yönetici yetkisi gerekiyor.", "YETKI");
    return user;
  }

  async function handleApi(req, res, url, ip) {
    const { route, params, allowed } = router.match(req.method, url.pathname);
    if (!route) {
      if (allowed && allowed.length) {
        res.setHeader("Allow", [...new Set(allowed)].join(", "));
        return H.sendJson(req, res, 405, { error: "Bu işlem bu adreste desteklenmiyor.", code: "YONTEM" });
      }
      return H.sendJson(req, res, 404, { error: "Bulunamadı", code: "BULUNAMADI" });
    }
    let sent = false;
    const ctx = {
      req,
      res,
      url,
      ip,
      ipKey: H.ipKey(ip), // hız sınırı anahtarı (IPv6 /64)
      params,
      query: url.searchParams,
      baseUrl: baseUrlOf(req),
      // Gövde okunurken (await) oturum kapanmış, kullanıcı pasifleşmiş ya da yetkisi alınmış olabilir: okumadan sonra yeniden denetlenir
      json: async (limit) => {
        const b = await H.readJson(req, limit);
        ctx.recheck();
        return b;
      },
      raw: async (limit) => {
        const b = await H.readRaw(req, limit);
        ctx.recheck();
        return b;
      },
      // Oturumlu uçlarda: oturum hâlâ açık, kullanıcı aktif ve rolü yeterli mi (her await sonrası çağrılır)
      recheck() {
        if (route.opts.auth) ctx.user = authUser(ctx.token, route.opts.role);
      },
      send(status, data) {
        sent = true;
        H.sendJson(req, res, status, data);
      },
      download(body, type, filename) {
        sent = true;
        H.sendBody(req, res, 200, body, type, {
          cache: "no-store",
          headers: { "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"` },
        });
      },
    };
    if (route.opts.auth) {
      const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ""));
      ctx.token = m ? m[1] : "";
      ctx.user = authUser(ctx.token, route.opts.role);
    }
    const result = await route.handler(ctx);
    // Denetim kaydı: paneldeki her değiştirici işlem (ve audit: true işaretli indirmeler). Müşteri verisi yazılmaz.
    // Etkisiz işlem (hiçbir şey değişmedi: ctx.auditSkip) yazılmaz; güvenlik açısından önemli işlemler ayrı, taşırılamayan bölmeye gider.
    const mutating = req.method !== "GET" && req.method !== "HEAD";
    if (ctx.user && !ctx.auditSkip && route.opts.audit !== false && (mutating || route.opts.audit) && url.pathname.startsWith("/api/admin/")) {
      const target = params.id !== undefined ? `#${params.id}` : params.name !== undefined ? params.name : undefined;
      const method = req.method === "HEAD" ? "GET" : req.method;
      const secure = !!ctx.auditSecure || SECURE_ACTIONS.has(`${method} ${route.pattern}`);
      auditLog.add({
        user: ctx.user.username,
        role: ctx.user.role,
        action: route.opts.auditAction || `${req.method === "HEAD" ? "GET" : req.method} ${route.pattern}`,
        method: req.method === "HEAD" ? "GET" : req.method,
        path: route.pattern,
        target,
        details: ctx.auditDetails,
      }, { secure });
    }
    if (!sent && !res.headersSent) H.sendJson(req, res, 200, result === undefined ? { ok: true } : result);
  }

  // ---------- Sayfalar ----------
  const htmlCache = new Map();
  function readPublicHtml(name) {
    const file = path.join(opts.publicDir, name);
    const st = fs.statSync(file);
    const c = htmlCache.get(file);
    if (c && c.mtime === st.mtimeMs && c.size === st.size) return c.text;
    const text = fs.readFileSync(file, "utf8");
    htmlCache.set(file, { mtime: st.mtimeMs, size: st.size, text });
    return text;
  }
  const sendHtml = (req, res, html, status = 200, extra = {}, cache = "no-cache") =>
    H.sendBody(req, res, status, html, "text/html; charset=utf-8", { etag: status === 200 && cache !== "no-store", cache, headers: extra });

  function pageCtx(req) {
    return { settings: store.db.settings, baseUrl: baseUrlOf(req), publicDir: opts.publicDir };
  }
  function notFound(req, res) {
    return sendHtml(req, res, P.notFoundPage(pageCtx(req)), 404, { "X-Robots-Tag": "noindex" });
  }
  // Gizli anahtar taşıyan adresler (takip bağlantısı, sipariş belgeleri): önbelleğe alınmaz, dizine eklenmez, yönlendiren bilgisi gitmez
  const SECRET_PAGE_HEADERS = { "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

  function handlePage(req, res, url, ip) {
    let p;
    try {
      p = decodeURIComponent(url.pathname);
    } catch {
      return notFound(req, res);
    }
    // Sondaki "/" atılarak yönlendirilir. Çözülmemiş (yüzde kodlu) yol kullanılır ve baştaki çoklu "/" ya da "\"
    // teke indirilir: "/%2Fevil.com/" → "//evil.com" gibi başka siteye açık yönlendirme ve CRLF ile başlık bozma olmasın.
    if (p.length > 1 && p.endsWith("/") && !p.startsWith("/panel/"))
      return H.redirect(req, res, H.localPath(url.pathname.replace(/\/+$/, "")) + url.search);
    if (p === "/healthz") return H.sendJson(req, res, 200, { ok: true, time: new Date().toISOString(), uptime: Math.round(process.uptime()) });
    if (p === "/" || p === "/index.html") {
      if (p === "/index.html") return H.redirect(req, res, "/" + url.search);
      // Takip bağlantısı (/?siparis=<id>&t=<token>): token adreste olduğu için önbelleğe alınmaz ve dizine eklenmez
      const secret = url.searchParams.has("t") || url.searchParams.has("siparis");
      const html = P.injectHome(readPublicHtml("index.html"), pageCtx(req));
      return secret ? sendHtml(req, res, html, 200, SECRET_PAGE_HEADERS, "no-store") : sendHtml(req, res, html);
    }
    if (p === "/panel.html") return H.redirect(req, res, "/panel");
    // /panel, /panel/siparisler ... → aynı sayfa (geçişler istemcide)
    if (p === "/panel" || p.startsWith("/panel/"))
      return sendHtml(req, res, P.injectNoindex(readPublicHtml("panel.html")), 200, { "X-Robots-Tag": "noindex, nofollow" });

    // Siparişin onayladığı yasal metinler: /siparis/<id>/belgeler?t=<token>
    const od = /^\/siparis\/(\d{1,10})\/belgeler$/.exec(p);
    if (od) {
      // Jetonla açılan sayfa: takip uçlarıyla aynı hız sınırı (jeton tahmini mümkün olmasa da)
      if (app.limiters.track.hit(H.ipKey(ip))) {
        return sendHtml(req, res, P.notFoundPage(pageCtx(req)), 429, { ...SECRET_PAGE_HEADERS, "Retry-After": "60" }, "no-store");
      }
      const token = url.searchParams.get("t") || "";
      const o = token ? O.findForCustomer(store.db, od[1], { token }) : null;
      if (!o) return sendHtml(req, res, P.notFoundPage(pageCtx(req)), 404, SECRET_PAGE_HEADERS, "no-store");
      return sendHtml(req, res, P.orderDocumentsPage(pageCtx(req), o, L.orderDocuments(store.db, o)), 200, SECRET_PAGE_HEADERS, "no-store");
    }

    const doc = P.legalDocByPath(store.db.settings, p);
    if (doc) return sendHtml(req, res, P.legalPage({ ...pageCtx(req), baseUrl: app.legalBaseUrl(baseUrlOf(req)) }, doc));
    if (p === "/hakkimizda") return sendHtml(req, res, P.aboutPage(pageCtx(req)));
    if (p === "/teslimat") return sendHtml(req, res, P.zonesIndexPage(pageCtx(req)));
    const zm = /^\/teslimat\/([a-z0-9-]+)$/.exec(p);
    if (zm) {
      const z = store.db.settings.zones.find((x) => x.slug === zm[1] && x.active);
      return z ? sendHtml(req, res, P.zonePage(pageCtx(req), z)) : notFound(req, res);
    }
    // Eski sitenin mahalle sayfaları (/sukrupasa-tekel vb.) → yeni bölge sayfaları
    const legacy = /^\/([a-z0-9-]+?)-(tekel|market|marketi)$/i.exec(p);
    if (legacy) {
      const slug = legacy[1].toLowerCase();
      const zones = store.db.settings.zones.filter((z) => z.active);
      const z = zones.find((x) => x.slug === slug) || zones.find((x) => x.slug.startsWith(slug + "-") || x.slug.startsWith(slug));
      return H.redirect(req, res, z ? `/teslimat/${z.slug}` : "/teslimat", 301);
    }
    // PUBLIC_URL yoksa adresler Host başlığından gelir: paylaşımlı önbellekte saklanıp başka ziyaretçiye sahte adresle dönmesin
    const seoCache = opts.publicUrl ? "public, max-age=3600" : "no-cache";
    if (p === "/robots.txt") return H.sendBody(req, res, 200, P.robotsTxt(pageCtx(req)), "text/plain; charset=utf-8", { cache: seoCache, etag: true });
    if (p === "/sitemap.xml") return H.sendBody(req, res, 200, P.sitemapXml(pageCtx(req)), "application/xml; charset=utf-8", { cache: seoCache, etag: true });
    if (p === "/manifest.webmanifest")
      return H.sendBody(req, res, 200, P.manifestJson(pageCtx(req)), "application/manifest+json; charset=utf-8", { cache: "no-cache", etag: true });

    if (p.startsWith("/uploads/")) {
      const rel = p.slice("/uploads/".length);
      if (serveFrom(req, res, [uploadDir, legacyUploadDir], "/" + rel)) return;
      return H.sendBody(req, res, 404, "Bulunamadı", "text/plain; charset=utf-8", { cache: "no-store" });
    }
    if (/\.html?$/i.test(p)) return notFound(req, res); // diğer .html dosyaları doğrudan sunulmaz
    if (serveFrom(req, res, [opts.publicDir], p)) return;
    if (/\.[a-z0-9]{1,8}$/i.test(p)) return H.sendBody(req, res, 404, "Bulunamadı", "text/plain; charset=utf-8", { cache: "no-store" });
    return notFound(req, res);
  }

  // PUBLIC_URL https ise ve vekil arkasındaysak (TRUST_PROXY=1) HTTP istekleri HTTPS'e yönlenir.
  // Yerel adresler (localhost) ve /healthz hariç. Hedef her zaman PUBLIC_URL'dir (Host başlığı kullanılmaz).
  function httpsRedirect(req, res) {
    if (!opts.forceHttps || !publicUrlHttps || !opts.trustProxy) return false;
    if (H.isHttps(req, true, trusted) || isLocalHost(req)) return false;
    const raw = String(req.url || "/");
    if (/^\/healthz(\?|$)/.test(raw)) return false;
    const status = req.method === "GET" || req.method === "HEAD" ? 301 : 308;
    res.writeHead(status, { Location: opts.publicUrl + H.localPath(raw), "Content-Length": 0, "Cache-Control": "no-store" });
    res.end();
    return true;
  }

  async function handle(req, res) {
    const ip = H.clientIp(req, opts.trustProxy, trusted);
    H.securityHeaders(req, res, { https: H.isHttps(req, opts.trustProxy, trusted) });
    if (httpsRedirect(req, res)) return;
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return H.sendJson(req, res, 400, { error: "Geçersiz adres.", code: "DOGRULAMA" });
    }
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url, ip);
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        return H.sendJson(req, res, 405, { error: "Bu işlem bu adreste desteklenmiyor.", code: "YONTEM" });
      }
      return handlePage(req, res, url, ip);
    } catch (e) {
      if (!(e instanceof HttpError)) opts.log(`Hata: ${req.method} ${url.pathname}: ${e.stack || e.message}`);
      if (res.headersSent) return res.end();
      // Gövde okunmadan hata verildiyse kalan veri boşaltılır ki istemci yanıtı alabilsin
      if (!req.complete) req.resume();
      return H.sendError(req, res, e);
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      opts.log(`İşlenmeyen hata: ${e && (e.stack || e.message)}`);
      try { if (!res.headersSent) H.sendError(req, res, e); else res.end(); } catch {}
    });
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 20000;

  function close() {
    for (const l of Object.values(app.limiters)) l.stop();
    clearInterval(retentionTimer);
    events.stop();
    return new Promise((resolve) => {
      server.close(() => resolve());
      if (server.closeAllConnections) server.closeAllConnections();
    });
  }

  return { app, server, close, handle, router };
}

module.exports = { createApp, isLocalHost, resolveListenHost };
