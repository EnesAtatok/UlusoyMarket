"use strict";
// Yönetim paneli API'si. Rol: "personel" sipariş + stok/tükendi işlemleri; diğer her şey "yonetici".

const crypto = require("crypto");
const V = require("./validate");
const O = require("./orders");
const CSV = require("./csv");
const { report } = require("./reports");
const { upgrade, validateData, syncIdCounters, DB_KEYS } = require("./db");
const { LEGAL_TEMPLATES } = require("./defaults");
const { hashPassword, verifyPassword, checkNewPassword, DEFAULT_PASSWORD, Sessions } = require("./auth");
const { sendTelegram } = require("./notify");
const { LIMITS } = require("./http");
const { localDateStr, localDayStartMs, addDaysStr } = require("./hours");
const { fail, round2, nextId, allocId, idCounters, clone, isPlainObject, normalizePhone, phoneKey, foldTr } = require("./util");
const { Cipher, CryptoError, parseEnvelope } = require("./secure-file");
const L = require("./legal");
const PV = require("./privacy");
const PH = require("./price-history");
const P = require("./pages");
const { caymaFromName } = require("./cayma");

const ANY = { auth: true };
const ADMIN = { auth: true, role: "yonetici" };
// İndirme (veri dışarı çıkaran GET) uç noktaları da denetim kaydına yazılır
const ADMIN_AUDITED = { ...ADMIN, audit: true };
const BACKUP_PASSWORD_MIN = 10;

function backupPassword(v) {
  const s = typeof v === "string" ? v : "";
  if (s.length < BACKUP_PASSWORD_MIN) fail(400, `Yedek parolası en az ${BACKUP_PASSWORD_MIN} karakter olmalı.`, "DOGRULAMA");
  if (s.length > 200) fail(400, "Yedek parolası çok uzun.", "DOGRULAMA");
  return s;
}

// Denetim kaydında başarısız girişin kaynağı: ağ anahtarının kısa özeti (aynı kaynağı ayırt eder, IP adresi yazılmaz)
const netTag = (ipKey) => crypto.createHash("sha256").update(`ulusoy-ag|${ipKey}`).digest("hex").slice(0, 10);

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt });

// İstek gövdesindeki kimlik listesi
function idList(b, max = 5000) {
  if (!Array.isArray(b.ids) || !b.ids.length) fail(400, "En az bir kayıt seçin.", "DOGRULAMA");
  if (b.ids.length > max) fail(400, `Tek seferde en fazla ${max} kayıt işlenebilir.`, "DOGRULAMA");
  const ids = [...new Set(b.ids.map(Number))];
  if (ids.some((x) => !Number.isInteger(x) || x <= 0)) fail(400, "Geçersiz kayıt kimliği.", "DOGRULAMA");
  return ids;
}

// Onay kaydının karşılaştırma izi (anahtar sırasından bağımsız; IP hariç)
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}
function consentFingerprint(c) {
  if (!c || typeof c !== "object") return "null";
  const { ip, ...rest } = c;
  return stableJson(rest);
}

function attachmentName(prefix, ext, now) {
  return `${prefix}-${localDateStr(now)}.${ext}`;
}

function register(router, app) {
  const db = () => app.db;

  // ---------- Oturum ----------
  router.add("POST", "/api/admin/login", async (ctx) => {
    const b = await ctx.json();
    const username = String(b.username || "admin").trim().toLowerCase().slice(0, 64);
    const password = String(b.password || "").slice(0, 1024);
    // Denemeler şifre denetiminden ÖNCE sayılır (scrypt eşzamansız: aynı anda gönderilen istekler sınırı birlikte geçemesin).
    //  - login:     IP (/64) + kullanıcı adı. Başarılı giriş yalnızca kendi anahtarını sıfırlar: personelin kendi girişi
    //               yöneticiye karşı yapılan denemelerin sayacını silemez.
    //  - loginIp:   IP (/64) başına toplam (kullanıcı adı değiştirerek sınırsız scrypt yükü bindirilemesin)
    //  - loginUser: kullanıcı adı başına, IP'den bağımsız. Bu hesaba daha önce başarıyla giriş yapılmış ağlar muaf:
    //               başka yerlerden deneme yapan biri yöneticiyi kendi ağından kilitleyemez.
    const key = `${ctx.ipKey}|${username}`;
    const tooMany = (wait, msg) => fail(429, `${msg} ${Math.ceil(wait / 60)} dakika sonra tekrar deneyin.`, "HIZ_SINIRI", { retryAfter: wait });
    let wait = app.limiters.login.hit(key);
    if (wait) tooMany(wait, "Çok fazla hatalı giriş denemesi.");
    wait = app.limiters.loginIp.hit(ctx.ipKey);
    if (wait) tooMany(wait, "Bu ağdan çok fazla giriş denemesi yapıldı.");
    wait = app.limiters.loginUser.hit(username);
    const knownNet = app.loginTrust.has(username, ctx.ipKey);
    if (wait && !knownNet) tooMany(wait, "Bu hesap için çok fazla hatalı giriş denemesi yapıldı (hesap korumaya alındı). Bu hesaba daha önce giriş yapılan ağdan girebilir ya da");
    const user = db().users.find((u) => u.username === username && u.active);
    const verifiedHash = user ? user.passHash : null;
    const ok = await verifyPassword(password, verifiedHash);
    // Doğrulama sürerken şifre değişmiş / sıfırlanmış, kullanıcı pasifleşmiş, silinmiş ya da geri yüklemeyle değişmiş
    // olabilir: oturum yalnızca doğrulanan özet hâlâ kullanıcının güncel özetiyse verilir
    const current = user && db().users.find((u) => u.id === user.id && u.username === username && u.active);
    if (!ok || !user || !current || current.passHash !== verifiedHash) {
      // Yalnızca var olan kullanıcı adları yazılır; kişi + ağ başına saatlik tek kayıtta sayılır (IP'nin kendisi yazılmaz)
      if (user) app.auditLog.addFailedLogin(user.username, user.role, netTag(ctx.ipKey));
      fail(401, "Kullanıcı adı veya şifre hatalı.", "GIRIS");
    }
    app.limiters.login.reset(key);
    app.limiters.loginIp.undo(ctx.ipKey);
    app.limiters.loginUser.undo(username);
    app.loginTrust.add(username, ctx.ipKey);
    const s = app.sessions.create(current.id);
    if (password === DEFAULT_PASSWORD) app.markDefaultPassword(current, true);
    app.auditLog.add({ user: current.username, role: current.role, action: "giris", label: "Giriş" });
    return { token: s.token, expiresAt: s.expiresAt, user: publicUser(current), defaultPassword: app.usesDefaultPassword(current) };
  });

  // ---------- Canlı olaylar (SSE) ----------
  // 1) POST /api/admin/stream-ticket (Bearer) → { ticket, expiresAt, ttlSeconds }
  router.add("POST", "/api/admin/stream-ticket", { ...ANY, audit: false }, (ctx) => {
    const wait = app.limiters.stream.hit(ctx.ipKey);
    if (wait) fail(429, "Çok fazla canlı bağlantı denemesi. Panel yoklamayla güncellenmeye devam edecek.", "HIZ_SINIRI", { retryAfter: wait });
    const t = app.events.issueTicket({ kind: "panel", ip: ctx.ip, userId: ctx.user.id, sessionHash: Sessions.hash(ctx.token) });
    if (!t) fail(503, "Canlı bağlantı şu an açılamıyor. Panel yoklamayla güncellenmeye devam edecek.", "AKIS_DOLU");
    return ctx.send(201, t);
  });
  // 2) GET /api/admin/stream?ticket=… → text/event-stream (Bearer gerekmez; bilet oturuma bağlıdır)
  router.add("GET", "/api/admin/stream", (ctx) => app.openStream(ctx, "panel"));

  // ---------- Güvenlik durumu (panel uyarıları) ----------
  router.add("GET", "/api/admin/security", ANY, (ctx) => app.securityStatus(ctx.req, ctx.user));

  // ---------- Denetim kaydı ----------
  router.add("GET", "/api/admin/audit", ADMIN, (ctx) => {
    const limit = Math.min(500, Math.max(1, Number(ctx.query.get("limit")) || 200));
    const before = Number(ctx.query.get("before")) || undefined;
    return app.auditLog.list({ limit, before, user: ctx.query.get("user") || undefined, action: ctx.query.get("action") || undefined, section: ctx.query.get("section") || undefined });
  });

  router.add("POST", "/api/admin/logout", ANY, (ctx) => {
    app.sessions.destroy(ctx.token);
    app.events.closeWhere((s) => s.kind === "panel" && s.sessionHash === Sessions.hash(ctx.token), "oturum", { reason: "Çıkış yapıldı." });
    return { ok: true };
  });

  router.add("GET", "/api/admin/me", ANY, (ctx) => ({ user: publicUser(ctx.user), defaultPassword: app.usesDefaultPassword(ctx.user) }));

  router.add("POST", "/api/admin/password", ANY, async (ctx) => {
    const b = await ctx.json();
    // Çalınmış bir oturumla mevcut şifre çevrimiçi denenemesin: kullanıcı başına sınırlı deneme
    const limKey = `u${ctx.user.id}`;
    const wait = app.limiters.password.hit(limKey);
    if (wait) fail(429, `Çok fazla şifre değiştirme denemesi. ${Math.ceil(wait / 60)} dakika sonra tekrar deneyin.`, "HIZ_SINIRI", { retryAfter: wait });
    const verifiedHash = ctx.user.passHash;
    const ok = await verifyPassword(String(b.currentPassword || ""), verifiedHash);
    ctx.recheck(); // doğrulama sürerken oturum kapanmış / kullanıcı pasifleşmiş olabilir
    if (!ok) fail(400, "Mevcut şifre hatalı.", "DOGRULAMA");
    const problem = checkNewPassword(b.newPassword);
    if (problem) fail(400, problem, "DOGRULAMA");
    const newHash = await hashPassword(b.newPassword);
    ctx.recheck();
    // Bu istek sürerken şifre başka yerden (yönetici sıfırlaması, geri yükleme) değiştiyse eski şifreye dayanan değişiklik yazılmaz
    if (ctx.user.passHash !== verifiedHash) fail(409, "Şifreniz bu sırada değiştirildi. Lütfen tekrar giriş yapın.", "SIFRE_DEGISTI");
    ctx.user.passHash = newHash;
    app.markDefaultPassword(ctx.user, false); // yeni şifre varsayılan olamaz (checkNewPassword)
    app.save();
    app.limiters.password.reset(limKey);
    app.loginTrust.forget(ctx.user.username);
    app.sessions.destroyUser(ctx.user.id, ctx.token); // diğer cihazlardaki oturumlar kapanır
    return { ok: true };
  });

  // ---------- Görsel yükleme ----------
  router.add("POST", "/api/admin/uploads", ADMIN, async (ctx) => {
    const b = await ctx.json(LIMITS.upload);
    return ctx.send(201, { url: app.saveImage(b.image) });
  });

  // ---------- Ürünler ----------
  function productInput(b, existing) {
    const out = {};
    const has = (k) => b[k] !== undefined;
    if (!existing || has("name")) out.name = V.str(b.name, 120, "Ürün adı", { required: true });
    if (has("brand")) out.brand = V.str(b.brand, 60, "Marka");
    if (has("description")) out.description = V.str(b.description, 1000, "Açıklama", { multiline: true });
    if (!existing || has("price")) {
      const n = Number(typeof b.price === "string" ? b.price.replace(",", ".") : b.price);
      if (!(n > 0) || n > 1e6) fail(400, "Geçerli bir fiyat girin.", "DOGRULAMA");
      out.price = round2(n);
    }
    if (has("oldPrice")) out.oldPrice = V.money(b.oldPrice, "Eski fiyat", { allowNull: true, max: 1e6 }) || null;
    const price = out.price !== undefined ? out.price : existing.price;
    const oldPrice = out.oldPrice !== undefined ? out.oldPrice : existing ? existing.oldPrice : null;
    if (oldPrice !== null && oldPrice !== undefined && oldPrice <= price) {
      if (has("oldPrice")) fail(400, "Eski fiyat, satış fiyatından yüksek olmalı (indirim göstermek için).", "DOGRULAMA");
      out.oldPrice = null; // fiyat eski fiyatın üstüne çıktıysa indirim kalkar
    }
    if (!existing || has("unit")) out.unit = V.str(b.unit, 20, "Birim") || "adet";
    if (!existing || has("categoryId")) {
      const cid = Number(b.categoryId);
      if (!db().categories.some((c) => c.id === cid)) fail(400, "Kategori seçin.", "DOGRULAMA");
      out.categoryId = cid;
    }
    if (has("emoji")) out.emoji = String(b.emoji || "").trim().slice(0, 8) || "🛒";
    if (has("barcode")) {
      const bc = String(b.barcode || "").trim();
      if (bc && !/^[0-9A-Za-z-]{1,40}$/.test(bc)) fail(400, "Barkod yalnızca harf ve rakam içermeli.", "DOGRULAMA");
      const other = bc && db().products.find((p) => p.barcode === bc && (!existing || p.id !== existing.id));
      if (other) fail(409, `Bu barkod başka bir üründe kayıtlı: ${other.name}`, "BARKOD");
      out.barcode = bc;
    }
    for (const k of ["soldOut", "hidden", "featured"]) if (has(k)) out[k] = V.bool(b[k]);
    if (has("stock")) out.stock = V.int(b.stock, "Stok", { allowNull: true, min: 0, max: 1e6 });
    if (has("maxPerOrder")) out.maxPerOrder = V.int(b.maxPerOrder, "Sipariş başına en fazla", { allowNull: true, min: 1, max: V.RULES.QTY_MAX });
    if (has("caymaDurumu")) out.caymaDurumu = V.cayma(b.caymaDurumu, { allowNull: true });
    return out;
  }
  function applyImage(target, b) {
    if (b.image === undefined) return;
    if (b.image === null || b.image === "") {
      const old = target.image;
      target.image = null;
      app.deleteImageIfUnused(old);
    } else if (typeof b.image === "string" && b.image.startsWith("data:")) {
      const url = app.saveImage(b.image);
      const old = target.image;
      target.image = url;
      app.deleteImageIfUnused(old);
    } else if (b.image !== target.image) {
      target.image = V.imageUrl(b.image);
    }
  }

  router.add("GET", "/api/admin/products", ANY, () => db().products);

  router.add("POST", "/api/admin/products", ADMIN, async (ctx) => {
    const b = await ctx.json(LIMITS.upload);
    const fields = productInput(b, null);
    const product = {
      id: allocId(db(), "products", db().products),
      name: fields.name,
      brand: "",
      description: "",
      price: fields.price,
      oldPrice: null,
      unit: "adet",
      categoryId: fields.categoryId,
      image: null,
      emoji: "🛒",
      barcode: "",
      soldOut: false,
      hidden: false,
      featured: false,
      stock: null,
      maxPerOrder: null,
      caymaDurumu: null,
      ...fields,
      priceHistory: [{ price: fields.price, at: app.now().toISOString() }],
    };
    const { warnings } = PH.applyPriceChange(product, {}, { oldPriceSent: b.oldPrice !== undefined, now: app.now(), categories: db().categories });
    applyImage(product, b);
    db().products.push(product);
    app.save();
    return ctx.send(201, { ...product, warnings });
  });

  router.add("PATCH", "/api/admin/products/:id", ANY, async (ctx) => {
    const p = db().products.find((x) => x.id === Number(ctx.params.id));
    if (!p) fail(404, "Ürün bulunamadı.", "BULUNAMADI");
    const b = await ctx.json(LIMITS.upload);
    if (ctx.user.role !== "yonetici") {
      const extra = Object.keys(b).filter((k) => !["soldOut", "stock"].includes(k));
      if (extra.length) fail(403, "Personel yalnızca stok ve tükendi bilgisini değiştirebilir.", "YETKI");
    }
    const fields = productInput(b, p);
    // Fiyat geçmişi + indirim öncesi fiyat (son 10 günün en düşüğü); elle girilen yüksek eski fiyatta uyarı
    const { warnings } = PH.applyPriceChange(p, fields, { oldPriceSent: b.oldPrice !== undefined, now: app.now(), categories: db().categories });
    Object.assign(p, fields);
    applyImage(p, b);
    app.save();
    return { ...p, warnings };
  });

  router.add("DELETE", "/api/admin/products/:id", ADMIN, (ctx) => {
    const p = db().products.find((x) => x.id === Number(ctx.params.id));
    if (!p) fail(404, "Ürün bulunamadı.", "BULUNAMADI");
    db().products = db().products.filter((x) => x !== p);
    app.deleteImageIfUnused(p.image);
    app.save();
    return { ok: true };
  });

  router.add("POST", "/api/admin/products/:id/duplicate", ADMIN, (ctx) => {
    const p = db().products.find((x) => x.id === Number(ctx.params.id));
    if (!p) fail(404, "Ürün bulunamadı.", "BULUNAMADI");
    const copy = { ...clone(p), id: allocId(db(), "products", db().products), name: `${p.name} (kopya)`.slice(0, 120), barcode: "", hidden: true };
    const idx = db().products.indexOf(p);
    db().products.splice(idx + 1, 0, copy);
    app.save();
    return ctx.send(201, copy);
  });

  // Toplu işlem: { ids, action, categoryId?, percent? }
  const PERSONEL_BULK = ["soldOut", "available"];
  router.add("POST", "/api/admin/products/bulk", ANY, async (ctx) => {
    const b = await ctx.json();
    const ids = idList(b);
    const action = String(b.action || "");
    const actions = ["delete", "hide", "show", "soldOut", "available", "feature", "unfeature", "move", "price", "cayma", "undiscount"];
    if (!actions.includes(action)) fail(400, "Geçersiz toplu işlem.", "DOGRULAMA");
    if (ctx.user.role !== "yonetici" && !PERSONEL_BULK.includes(action))
      fail(403, "Bu işlem için yönetici yetkisi gerekiyor.", "YETKI");
    let categoryId;
    let percent;
    // Toplu cayma durumu: { action: "cayma", caymaDurumu: "yok_cabuk_bozulan"|"acilirsa_yok_hijyen"|"var"|null (kategoriden) }
    const caymaDurumu = action === "cayma" ? V.cayma(b.caymaDurumu ?? null, { allowNull: true }) : undefined;
    if (action === "move") {
      categoryId = Number(b.categoryId);
      if (!db().categories.some((c) => c.id === categoryId)) fail(400, "Taşınacak kategoriyi seçin.", "DOGRULAMA");
    }
    if (action === "price") {
      percent = Number(typeof b.percent === "string" ? b.percent.replace(",", ".") : b.percent);
      if (!Number.isFinite(percent) || percent === 0 || percent < -90 || percent > 500)
        fail(400, "Yüzde değeri -90 ile 500 arasında (0 hariç) olmalı.", "DOGRULAMA");
    }
    const skipped = [];
    let processed = 0;
    const removedImages = [];
    for (const id of ids) {
      const p = db().products.find((x) => x.id === id);
      if (!p) { skipped.push({ id, reason: "Ürün bulunamadı." }); continue; }
      switch (action) {
        case "delete":
          db().products = db().products.filter((x) => x !== p);
          if (p.image) removedImages.push(p.image);
          break;
        case "hide": p.hidden = true; break;
        case "show": p.hidden = false; break;
        case "soldOut": p.soldOut = true; break;
        case "available":
          p.soldOut = false;
          if (p.stock === 0) p.stock = null; // stok 0 iken "satışta" denirse stok takibi kapanır
          break;
        case "feature": p.featured = true; break;
        case "unfeature": p.featured = false; break;
        case "move": p.categoryId = categoryId; break;
        case "cayma": p.caymaDurumu = caymaDurumu; break;
        case "price": {
          const np = round2(p.price * (1 + percent / 100));
          if (!(np > 0)) { skipped.push({ id, reason: "Yeni fiyat sıfırın altına iniyor." }); continue; }
          const f = { price: np };
          if (p.oldPrice && p.oldPrice <= np) f.oldPrice = null;
          PH.applyPriceChange(p, f, { oldPriceSent: false, now: app.now(), categories: db().categories });
          Object.assign(p, f);
          break;
        }
        case "undiscount": {
          // İndirimi kaldır: satış fiyatı indirim öncesi fiyata döner, eski fiyat temizlenir
          if (!(p.oldPrice > p.price)) { skipped.push({ id, reason: "Üründe indirim yok." }); continue; }
          const f = { price: round2(p.oldPrice), oldPrice: null };
          PH.applyPriceChange(p, f, { oldPriceSent: true, now: app.now(), categories: db().categories });
          Object.assign(p, f);
          break;
        }
      }
      processed++;
    }
    for (const img of removedImages) app.deleteImageIfUnused(img);
    if (processed) app.save();
    else ctx.auditSkip = true;
    if (action === "delete" && processed) ctx.auditSecure = true;
    return { processed, skipped };
  });

  router.add("GET", "/api/admin/products/export", ADMIN_AUDITED, (ctx) => {
    const csv = CSV.productsToCsv(db());
    return ctx.download(csv, "text/csv; charset=utf-8", attachmentName("urunler", "csv", app.now()));
  });

  router.add("POST", "/api/admin/products/import", ADMIN, async (ctx) => {
    let text;
    let dryRun;
    if (/text\/(csv|plain)/.test(String(ctx.req.headers["content-type"] || ""))) {
      text = (await ctx.raw(LIMITS.large)).toString("utf8");
      dryRun = ["1", "true"].includes(ctx.query.get("dryRun"));
    } else {
      const b = await ctx.json(LIMITS.large);
      text = String(b.csv || "");
      dryRun = V.bool(b.dryRun);
    }
    if (!text.trim()) fail(400, "CSV dosyası boş.", "DOGRULAMA");
    const result = CSV.importProducts(db(), text, { dryRun });
    if (!dryRun && (result.added || result.updated)) app.save();
    return result;
  });

  // Sıralama: { categoryIds: [...] } veya { categoryId, productIds: [...] }
  router.add("PUT", "/api/admin/order", ADMIN, async (ctx) => {
    const b = await ctx.json();
    const d = db();
    if (Array.isArray(b.categoryIds)) {
      const ids = b.categoryIds.map(Number);
      if (ids.length !== d.categories.length || !d.categories.every((c) => ids.includes(c.id))) fail(400, "Geçersiz sıralama.", "DOGRULAMA");
      d.categories = ids.map((id) => d.categories.find((c) => c.id === id));
    } else if (Array.isArray(b.productIds)) {
      const cid = Number(b.categoryId);
      const mine = d.products.filter((p) => p.categoryId === cid);
      const ids = b.productIds.map(Number);
      if (ids.length !== mine.length || !mine.every((p) => ids.includes(p.id))) fail(400, "Geçersiz sıralama.", "DOGRULAMA");
      d.products = [...d.products.filter((p) => p.categoryId !== cid), ...ids.map((id) => mine.find((p) => p.id === id))];
    } else fail(400, "Geçersiz sıralama.", "DOGRULAMA");
    app.save();
    return { ok: true };
  });

  // ---------- Kategoriler ----------
  function categoryInput(b, existing) {
    const out = {};
    if (!existing || b.name !== undefined) out.name = V.str(b.name, 60, "Kategori adı", { required: true });
    if (b.emoji !== undefined) out.emoji = String(b.emoji || "").trim().slice(0, 8) || "📦";
    if (b.hidden !== undefined) out.hidden = V.bool(b.hidden);
    if (b.caymaDurumu !== undefined) out.caymaDurumu = V.cayma(b.caymaDurumu);
    else if (!existing && out.name) out.caymaDurumu = caymaFromName(out.name);
    const dup = out.name && db().categories.find((c) => foldTr(c.name) === foldTr(out.name) && (!existing || c.id !== existing.id));
    if (dup) fail(409, "Bu adla bir kategori zaten var.", "AYNI_AD");
    return out;
  }
  const withCount = (c) => ({ ...c, productCount: db().products.filter((p) => p.categoryId === c.id).length });

  router.add("GET", "/api/admin/categories", ANY, () => db().categories.map(withCount));

  router.add("POST", "/api/admin/categories", ADMIN, async (ctx) => {
    const b = await ctx.json(LIMITS.upload);
    const cat = { id: allocId(db(), "categories", db().categories), name: "", emoji: "📦", image: null, hidden: false, ...categoryInput(b, null) };
    applyImage(cat, b);
    db().categories.push(cat);
    app.save();
    return ctx.send(201, withCount(cat));
  });

  router.add("PATCH", "/api/admin/categories/:id", ADMIN, async (ctx) => {
    const c = db().categories.find((x) => x.id === Number(ctx.params.id));
    if (!c) fail(404, "Kategori bulunamadı.", "BULUNAMADI");
    const b = await ctx.json(LIMITS.upload);
    Object.assign(c, categoryInput(b, c));
    applyImage(c, b);
    app.save();
    return withCount(c);
  });

  router.add("DELETE", "/api/admin/categories/:id", ADMIN, (ctx) => {
    const c = db().categories.find((x) => x.id === Number(ctx.params.id));
    if (!c) fail(404, "Kategori bulunamadı.", "BULUNAMADI");
    const count = db().products.filter((p) => p.categoryId === c.id).length;
    if (count) fail(409, `Bu kategoride ${count} ürün var. Önce ürünleri silin veya başka kategoriye taşıyın.`, "DOLU_KATEGORI");
    db().categories = db().categories.filter((x) => x !== c);
    app.deleteImageIfUnused(c.image);
    app.save();
    return { ok: true };
  });

  router.add("POST", "/api/admin/categories/bulk-delete", ADMIN, async (ctx) => {
    const ids = idList(await ctx.json());
    const skipped = [];
    let processed = 0;
    for (const id of ids) {
      const c = db().categories.find((x) => x.id === id);
      if (!c) { skipped.push({ id, reason: "Kategori bulunamadı." }); continue; }
      const count = db().products.filter((p) => p.categoryId === id).length;
      if (count) { skipped.push({ id, name: c.name, reason: `Bu kategoride ${count} ürün var.` }); continue; }
      db().categories = db().categories.filter((x) => x !== c);
      app.deleteImageIfUnused(c.image);
      processed++;
    }
    if (processed) app.save();
    else ctx.auditSkip = true;
    return { processed, skipped };
  });

  // ---------- Siparişler ----------
  // Arşiv eşiğini (privacy.archiveDays) geçmiş tamamlanmış siparişlerde kişisel veri personele maskeli döner
  const isArchived = (o) => PV.isArchived(o, db().settings, app.now());
  const outFor = (ctx) => (o) => {
    const a = isArchived(o);
    return { ...O.adminOrder(a && ctx.user.role !== "yonetici" ? PV.maskOrder(o) : o), archived: a };
  };
  // Arşivlenmiş sipariş personel için salt okunurdur: durumu geri alınarak maske kaldırılamasın, maskeli notların üzerine yazılamasın
  const guardArchived = (ctx, o) => {
    if (ctx.user.role !== "yonetici" && isArchived(o)) fail(403, "Arşivlenmiş siparişi yalnızca yönetici değiştirebilir.", "ARSIV");
  };
  const viewDb = (ctx) => (ctx.user.role === "yonetici" ? db() : { ...db(), orders: db().orders.map((o) => (isArchived(o) ? PV.maskOrder(o) : o)) });

  router.add("GET", "/api/admin/orders", ANY, (ctx) => {
    const q = ctx.query;
    const d = viewDb(ctx);
    const serverTime = app.now().toISOString();
    const latestId = d.orders.reduce((m, o) => Math.max(m, o.id), 0);
    const filters = { from: q.get("from"), to: q.get("to"), q: q.get("q"), type: q.get("type"), payment: q.get("payment") };
    const base = O.filterOrders(d, filters);
    const counts = { aktif: 0 };
    for (const st of V.STATUSES) counts[st] = 0;
    for (const o of base) {
      counts[o.status]++;
      if (V.ACTIVE_STATUSES.includes(o.status)) counts.aktif++;
    }
    const since = q.get("since");
    if (since) {
      const t = Date.parse(since);
      if (!Number.isFinite(t)) fail(400, "since parametresi geçersiz (ISO tarih bekleniyor).", "DOGRULAMA");
      const list = d.orders.filter((o) => Date.parse(o.updatedAt || o.createdAt) > t).sort((a, b) => b.id - a.id);
      return { orders: list.map(outFor(ctx)), counts, latestId, serverTime };
    }
    const list = (q.get("status") ? O.filterOrders(d, { ...filters, status: q.get("status") }) : base).sort((a, b) => b.id - a.id);
    const pageSize = Math.min(200, Math.max(1, Number(q.get("pageSize")) || 50));
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number(q.get("page")) || 1));
    return {
      orders: list.slice((page - 1) * pageSize, page * pageSize).map(outFor(ctx)),
      total: list.length,
      page,
      pageSize,
      pages,
      counts,
      latestId,
      serverTime,
    };
  });

  router.add("GET", "/api/admin/orders/export", ADMIN_AUDITED, (ctx) => {
    const q = ctx.query;
    const list = O.filterOrders(db(), { from: q.get("from"), to: q.get("to"), q: q.get("q"), status: q.get("status") }).sort((a, b) => a.id - b.id);
    const csv = CSV.ordersToCsv(list, { typeLabel: O.TYPE_LABEL, paymentLabel: O.PAYMENT_LABEL });
    return ctx.download(csv, "text/csv; charset=utf-8", attachmentName("siparisler", "csv", app.now()));
  });

  // Panelden elle (telefonla gelen) sipariş
  router.add("POST", "/api/admin/orders", ANY, async (ctx) => {
    const b = await ctx.json();
    const { order, quote } = O.createOrder(db(), b, { source: "panel", now: app.now(), user: ctx.user });
    app.save();
    app.publishOrder(order, "yeni");
    ctx.auditDetails = { orderId: order.id };
    const warnings = quote.errors.filter((e) => e.code === "MIN_TUTAR").map((e) => e.message);
    return ctx.send(201, { ...O.adminOrder(order), warnings });
  });

  const findOrder = (id) => {
    const o = db().orders.find((x) => x.id === Number(id));
    if (!o) fail(404, "Sipariş bulunamadı.", "BULUNAMADI");
    return o;
  };

  router.add("GET", "/api/admin/orders/:id", ANY, (ctx) => outFor(ctx)(findOrder(ctx.params.id)));

  // Siparişin onay kaydı ve onayladığı metinler (sipariş bilgileriyle doldurulmuş, o anki sürümden).
  // ?format=html → yazdırılabilir "sipariş sözleşmesi + ön bilgilendirme" sayfası (fetch + Blob ile açın; Bearer gerekir)
  router.add("GET", "/api/admin/orders/:id/documents", ANY, (ctx) => {
    let o = findOrder(ctx.params.id);
    if (ctx.user.role !== "yonetici" && isArchived(o)) o = PV.maskOrder(o);
    const docs = L.orderDocuments(db(), o);
    if (ctx.query.get("format") === "html") {
      const page = P.orderDocumentsPage({ settings: db().settings, baseUrl: ctx.baseUrl, publicDir: app.opts.publicDir }, o, docs);
      ctx.res.setHeader("X-Robots-Tag", "noindex, nofollow");
      return ctx.download(page, "text/html; charset=utf-8", `siparis-${o.id}-sozlesme.html`);
    }
    return docs;
  });

  // Sipariş teyidi (E-ticaret Yön. m.9/1; YASAL.md §2.5): site dışı ikinci kanaldan teyit kaydı
  // { channel: "telefon"|"whatsapp"|"sms", result?: "ulasildi"|"ulasilamadi", note? }
  router.add("POST", "/api/admin/orders/:id/confirmation", ANY, async (ctx) => {
    const o = findOrder(ctx.params.id);
    const b = await ctx.json();
    guardArchived(ctx, o);
    if (!["telefon", "whatsapp", "sms"].includes(b.channel)) fail(400, "Teyit kanalı telefon, whatsapp ya da sms olmalı.", "DOGRULAMA");
    const result = b.result === undefined ? "ulasildi" : b.result;
    if (!["ulasildi", "ulasilamadi"].includes(result)) fail(400, "Teyit sonucu ulasildi ya da ulasilamadi olmalı.", "DOGRULAMA");
    const at = app.now().toISOString();
    const entry = { channel: b.channel, result, at, by: ctx.user.username };
    const note = b.note !== undefined ? V.note(b.note, 200, "Teyit notu") : "";
    if (note) entry.note = note;
    o.confirmations = [...(o.confirmations || []), entry].slice(-20);
    o.updatedAt = at;
    app.save();
    app.publishOrder(o, "guncellendi");
    ctx.auditDetails = { channel: b.channel, result };
    return outFor(ctx)(o);
  });

  // Müşterinin cayma/iade talebini işleme: { status: "Yeni"|"İnceleniyor"|"Sonuçlandı"|"Reddedildi", note? }
  router.add("PATCH", "/api/admin/orders/:id/return-requests/:rid", ANY, async (ctx) => {
    const o = findOrder(ctx.params.id);
    const r = (o.returnRequests || []).find((x) => x.id === Number(ctx.params.rid));
    if (!r) fail(404, "Talep bulunamadı.", "BULUNAMADI");
    const b = await ctx.json();
    guardArchived(ctx, o);
    if (!["Yeni", "İnceleniyor", "Sonuçlandı", "Reddedildi"].includes(b.status)) fail(400, "Talep durumu geçersiz.", "DOGRULAMA");
    r.status = b.status;
    if (b.note !== undefined) r.adminNote = V.note(b.note, 300, "Not");
    r.updatedAt = app.now().toISOString();
    r.by = ctx.user.username;
    o.updatedAt = r.updatedAt;
    app.save();
    app.publishOrder(o, "guncellendi");
    ctx.auditDetails = { status: b.status };
    return outFor(ctx)(o);
  });

  // { status?, cancelNote?, adminNote?, courier? }
  router.add("PATCH", "/api/admin/orders/:id", ANY, async (ctx) => {
    const o = findOrder(ctx.params.id);
    const b = await ctx.json();
    guardArchived(ctx, o);
    let cancelNote;
    if (b.cancelNote !== undefined) cancelNote = V.note(b.cancelNote, V.RULES.CANCEL_NOTE_MAX, "Not");
    const adminNote = b.adminNote !== undefined ? V.note(b.adminNote, V.RULES.ADMIN_NOTE_MAX, "Yönetici notu") : undefined;
    const courier = b.courier !== undefined ? V.str(b.courier, 60, "Kurye adı") : undefined;
    if (b.status !== undefined && !V.STATUSES.includes(b.status)) fail(400, "Geçersiz sipariş durumu.", "DOGRULAMA");
    const now = app.now();
    let changed = false;
    const before = o.status;
    if (b.status !== undefined) changed = O.setStatus(db(), o, b.status, { by: ctx.user.username, now }) || changed;
    if (cancelNote !== undefined && o.status === "İptal" && cancelNote !== o.cancelNote) { o.cancelNote = cancelNote; changed = true; }
    if (adminNote !== undefined && adminNote !== o.adminNote) { o.adminNote = adminNote; changed = true; }
    if (courier !== undefined && courier !== o.courier) { o.courier = courier; changed = true; }
    if (changed) {
      o.updatedAt = now.toISOString();
      app.save();
      app.publishOrder(o, "guncellendi");
    } else ctx.auditSkip = true; // etkisiz istek denetim kaydına yazılmaz
    // Denetim kaydı: yalnızca hangi alanların değiştiği (not içerikleri yazılmaz)
    ctx.auditDetails = { fields: ["status", "cancelNote", "adminNote", "courier"].filter((k) => b[k] !== undefined), ...(before !== o.status ? { from: before, to: o.status } : {}) };
    return outFor(ctx)(o);
  });

  // Kalem düzenleme: { items: [{ productId, qty }] } (qty 0 → çıkar; listede olmayan kalem değişmez)
  router.add("PUT", "/api/admin/orders/:id/items", ANY, async (ctx) => {
    const o = findOrder(ctx.params.id);
    const b = await ctx.json();
    guardArchived(ctx, o);
    // Teslim edilmiş / iptal siparişin tutarını personel sonradan değiştiremez (yalnızca hazırlık sürerken)
    if (ctx.user.role !== "yonetici" && !V.ACTIVE_STATUSES.includes(o.status))
      fail(403, "Teslim edilmiş ya da iptal edilmiş siparişin kalemlerini yalnızca yönetici değiştirebilir.", "YETKI");
    const { changed, warnings } = O.editItems(db(), o, b.items, { user: ctx.user, now: app.now() });
    if (changed) {
      app.save();
      app.publishOrder(o, "guncellendi");
    } else ctx.auditSkip = true;
    return { ...outFor(ctx)(o), warnings };
  });

  // Toplu: { ids, action: "status", status, cancelNote? } | { ids, action: "delete" }
  router.add("POST", "/api/admin/orders/bulk", ANY, async (ctx) => {
    const b = await ctx.json();
    const ids = idList(b);
    const skipped = [];
    let processed = 0;
    let backup = null;
    const touched = [];
    let deletedIds = [];
    if (b.action === "status") {
      if (!V.STATUSES.includes(b.status)) fail(400, "Geçersiz sipariş durumu.", "DOGRULAMA");
      const cancelNote = b.cancelNote !== undefined ? V.note(b.cancelNote, V.RULES.CANCEL_NOTE_MAX, "Not") : undefined;
      const now = app.now();
      for (const id of ids) {
        const o = db().orders.find((x) => x.id === id);
        if (!o) { skipped.push({ id, reason: "Sipariş bulunamadı." }); continue; }
        if (o.status === b.status) { skipped.push({ id, reason: "Sipariş zaten bu durumda." }); continue; }
        if (ctx.user.role !== "yonetici" && isArchived(o)) { skipped.push({ id, reason: "Arşivlenmiş siparişi yalnızca yönetici değiştirebilir." }); continue; }
        O.setStatus(db(), o, b.status, { by: ctx.user.username, now });
        if (b.status === "İptal" && cancelNote) o.cancelNote = cancelNote;
        touched.push(o);
        processed++;
      }
    } else if (b.action === "delete") {
      if (ctx.user.role !== "yonetici") fail(403, "Sipariş silmek için yönetici yetkisi gerekiyor.", "YETKI");
      const deletable = [];
      for (const id of ids) {
        const o = db().orders.find((x) => x.id === id);
        if (!o) skipped.push({ id, reason: "Sipariş bulunamadı." });
        else if (!["Teslim edildi", "İptal"].includes(o.status))
          skipped.push({ id, reason: `"${o.status}" durumundaki sipariş silinemez; yalnızca teslim edilen ya da iptal edilen siparişler silinebilir.` });
        else deletable.push(o);
      }
      if (deletable.length) {
        ctx.auditSecure = true; // veri silme: güvenlik bölmesine
        backup = app.store.backupNow("siparis-silme-oncesi");
        const set = new Set(deletable);
        db().orders = db().orders.filter((o) => !set.has(o));
        processed = deletable.length;
        deletedIds = deletable.map((o) => o.id);
      }
    } else fail(400, "Geçersiz toplu işlem.", "DOGRULAMA");
    if (processed) {
      app.save();
      for (const o of touched) app.publishOrder(o, "guncellendi");
      if (deletedIds.length) app.events.forgetOrders(deletedIds);
      app.publishDeleted(deletedIds);
    }
    ctx.auditDetails = { action: b.action, ...(b.action === "status" ? { status: b.status } : {}), ids: [...touched.map((o) => o.id), ...deletedIds].slice(0, 200), processed };
    if (!processed) ctx.auditSkip = true; // hiçbir kayıt değişmediyse denetim kaydına yazılmaz
    return backup ? { processed, skipped, backup } : { processed, skipped };
  });

  // ---------- Müşteriler ----------
  router.add("GET", "/api/admin/customers", ANY, (ctx) => {
    const q = String(ctx.query.get("q") || "").trim();
    let list = O.customers(viewDb(ctx));
    if (ctx.query.get("blocked") === "1") list = list.filter((c) => c.blocked);
    if (q) {
      const digits = q.replace(/\D/g, "");
      const f = foldTr(q);
      list = list.filter((c) => (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)) || foldTr(c.name).includes(f) || foldTr(c.address).includes(f));
    }
    const pageSize = Math.min(500, Math.max(1, Number(ctx.query.get("pageSize")) || 100));
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number(ctx.query.get("page")) || 1));
    return { customers: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize, pages };
  });

  router.add("GET", "/api/admin/customers/:phone", ANY, (ctx) => {
    const key = phoneKey(ctx.params.phone);
    if (key.length !== 10) fail(400, "Telefon numarası geçersiz.", "DOGRULAMA");
    const view = viewDb(ctx);
    const c = O.customers(view).find((x) => phoneKey(x.phone) === key);
    if (!c) fail(404, "Müşteri bulunamadı.", "BULUNAMADI");
    const orders = view.orders.filter((o) => phoneKey(o.customer.phone) === key).sort((a, b) => b.id - a.id).map(outFor(ctx));
    return { customer: c, orders };
  });

  // { blocked: true|false }
  router.add("PUT", "/api/admin/customers/:phone/block", ADMIN, async (ctx) => {
    const b = await ctx.json();
    const phone = normalizePhone(ctx.params.phone);
    if (!V.PHONE_RE.test(phone)) fail(400, "Telefon numarası geçersiz.", "DOGRULAMA");
    const list = db().settings.blockedPhones;
    const key = phoneKey(phone);
    const blocked = V.bool(b.blocked, true);
    const rest = list.filter((p) => phoneKey(p) !== key);
    db().settings.blockedPhones = blocked ? [...rest, phone] : rest;
    app.save();
    ctx.auditDetails = { blocked };
    return { phone, blocked };
  });

  // KVKK başvurusu: tek müşterinin tüm verisi (JSON indirme)
  router.add("GET", "/api/admin/customers/:phone/export", ADMIN_AUDITED, (ctx) => {
    const key = phoneKey(ctx.params.phone);
    if (key.length !== 10) fail(400, "Telefon numarası geçersiz.", "DOGRULAMA");
    const orders = PV.ordersOfPhone(db(), ctx.params.phone).sort((a, b) => a.id - b.id);
    const blocked = db().settings.blockedPhones.some((p) => phoneKey(p) === key);
    if (!orders.length && !blocked) fail(404, "Bu numaraya ait kayıt bulunamadı.", "BULUNAMADI");
    ctx.auditDetails = { orders: orders.length };
    const data = {
      exportedAt: app.now().toISOString(),
      dataController: { name: db().settings.store.name, title: db().settings.legal.companyTitle || null },
      phone: orders.length ? orders[orders.length - 1].customer.phone : normalizePhone(ctx.params.phone),
      blocked,
      orders: orders.map((o) => {
        const { stockHeld, token, ...rest } = o;
        return rest;
      }),
    };
    return ctx.download(JSON.stringify(data, null, 2), "application/json; charset=utf-8", `musteri-verisi-${localDateStr(app.now())}.json`);
  });

  // KVKK başvurusu: tamamlanmış/iptal siparişlerdeki kişisel veriyi anonimleştirir (aktif siparişler atlanır). Gövde: { confirm: true }
  router.add("POST", "/api/admin/customers/:phone/anonymize", ADMIN, async (ctx) => {
    const b = await ctx.json();
    if (b.confirm !== true) fail(400, "Anonimleştirme geri alınamaz; onaylamak için confirm: true gönderin.", "DOGRULAMA");
    const key = phoneKey(ctx.params.phone);
    if (key.length !== 10) fail(400, "Telefon numarası geçersiz.", "DOGRULAMA");
    const r = PV.anonymizeCustomer(db(), ctx.params.phone, app.now());
    if (!r.processed && !r.skipped.length) fail(404, "Bu numaraya ait anonimleştirilecek sipariş bulunamadı.", "BULUNAMADI");
    if (r.processed) {
      app.save();
      app.forgetAnonymized();
      app.events.publish("panel", "yenile", { reason: "Müşteri verisi anonimleştirildi." });
    }
    ctx.auditDetails = { processed: r.processed, skipped: r.skipped.length };
    const blocked = db().settings.blockedPhones.some((p) => phoneKey(p) === key);
    return { ...r, blocked, note: "Otomatik yedeklerdeki eski kopyalar süreleri dolunca silinir (günlük yedekler 14 gün)." };
  });

  // Saklama süresi işini hemen çalıştırır (normalde günde bir kez kendiliğinden çalışır)
  router.add("POST", "/api/admin/privacy/run", ADMIN, (ctx) => {
    const n = app.runRetention(true);
    ctx.auditDetails = { orders: n };
    return { processed: n, retentionDays: db().settings.privacy.retentionDays, lastRunAt: db().meta.retention.lastRunAt };
  });

  // ---------- Kuponlar ----------
  function dateInput(v, label, endOfDay) {
    if (v === null || v === undefined || v === "") return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const ms = endOfDay ? localDayStartMs(addDaysStr(s, 1)) - 1 : localDayStartMs(s);
      return new Date(ms).toISOString();
    }
    const t = Date.parse(s);
    if (!Number.isFinite(t)) fail(400, `${label} geçersiz (YYYY-AA-GG).`, "DOGRULAMA");
    return new Date(t).toISOString();
  }
  function couponInput(b, existing) {
    const merged = { ...(existing || {}), ...b };
    // Kod büyük harfe çevrilir (Türkçe "i" → "I"; karşılaştırma zaten harf duyarsız)
    const code = String(merged.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9ÇĞİÖŞÜ_-]{3,30}$/.test(code)) fail(400, "Kupon kodu 3-30 karakter olmalı; yalnızca harf, rakam, - ve _ kullanın.", "DOGRULAMA");
    const dup = db().coupons.find((c) => foldTr(c.code) === foldTr(code) && (!existing || c.id !== existing.id));
    if (dup) fail(409, "Bu kupon kodu zaten var.", "AYNI_KOD");
    const type = merged.type;
    if (!["yuzde", "tutar", "ucretsizTeslimat"].includes(type)) fail(400, "Kupon türünü seçin.", "DOGRULAMA");
    let value = 0;
    if (type === "yuzde") {
      value = V.money(merged.value, "İndirim yüzdesi");
      if (!(value >= 1 && value <= 100)) fail(400, "İndirim yüzdesi 1 ile 100 arasında olmalı.", "DOGRULAMA");
    } else if (type === "tutar") {
      value = V.money(merged.value, "İndirim tutarı");
      if (!(value > 0)) fail(400, "İndirim tutarı sıfırdan büyük olmalı.", "DOGRULAMA");
    }
    const startsAt = dateInput(merged.startsAt, "Başlangıç tarihi", false);
    const endsAt = dateInput(merged.endsAt, "Bitiş tarihi", true);
    if (startsAt && endsAt && endsAt < startsAt) fail(400, "Bitiş tarihi başlangıçtan önce olamaz.", "DOGRULAMA");
    return {
      code,
      type,
      value,
      minOrder: V.money(merged.minOrder ?? 0, "Minimum sepet tutarı"),
      maxUses: V.int(merged.maxUses, "Toplam kullanım sınırı", { allowNull: true, min: 1 }),
      perPhoneLimit: V.int(merged.perPhoneLimit, "Telefon başına kullanım", { allowNull: true, min: 1 }),
      startsAt,
      endsAt,
      active: V.bool(merged.active, true),
      description: V.str(merged.description, 200, "Açıklama"),
    };
  }
  router.add("GET", "/api/admin/coupons", ADMIN, () => db().coupons);
  router.add("POST", "/api/admin/coupons", ADMIN, async (ctx) => {
    const c = { id: allocId(db(), "coupons", db().coupons), usedCount: 0, ...couponInput(await ctx.json(), null) };
    db().coupons.push(c);
    app.save();
    return ctx.send(201, c);
  });
  router.add("PATCH", "/api/admin/coupons/:id", ADMIN, async (ctx) => {
    const c = db().coupons.find((x) => x.id === Number(ctx.params.id));
    if (!c) fail(404, "Kupon bulunamadı.", "BULUNAMADI");
    const b = await ctx.json();
    const fields = couponInput(b, c);
    // Kod değişirse eski siparişlerdeki kupon adı korunur; sayaç sıfırlanabilir
    Object.assign(c, fields);
    if (b.usedCount !== undefined) c.usedCount = V.int(b.usedCount, "Kullanım sayısı", { min: 0 });
    app.save();
    return c;
  });
  router.add("DELETE", "/api/admin/coupons/:id", ADMIN, (ctx) => {
    const c = db().coupons.find((x) => x.id === Number(ctx.params.id));
    if (!c) fail(404, "Kupon bulunamadı.", "BULUNAMADI");
    db().coupons = db().coupons.filter((x) => x !== c);
    app.save();
    return { ok: true };
  });
  router.add("POST", "/api/admin/coupons/bulk-delete", ADMIN, async (ctx) => {
    const ids = idList(await ctx.json());
    const skipped = [];
    const set = new Set();
    for (const id of ids) {
      const c = db().coupons.find((x) => x.id === id);
      if (!c) skipped.push({ id, reason: "Kupon bulunamadı." });
      else set.add(c);
    }
    if (set.size) {
      db().coupons = db().coupons.filter((c) => !set.has(c));
      app.save();
    } else ctx.auditSkip = true;
    return { processed: set.size, skipped };
  });

  // ---------- Ayarlar ----------
  router.add("GET", "/api/admin/settings", ADMIN, () => db().settings);
  router.add("GET", "/api/admin/settings/legal-templates", ADMIN, () => LEGAL_TEMPLATES);

  // Yasal belgelerin güncel sürümleri, kullanılabilir yer tutucular ve onaylanmış eski sürümlerin arşivi
  router.add("GET", "/api/admin/legal", ADMIN, (ctx) => {
    const docs = L.currentDocs(db().settings, app.legalBaseUrl(ctx.baseUrl), { all: true });
    const archive = Object.entries(db().legalArchive).map(([version, a]) => ({ version, key: a.key, title: a.title, at: a.at, current: docs.some((d) => d.version === version) }));
    archive.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return {
      docs: docs.map(({ key, title, path, lead, version }) => {
        const d = db().settings.legal.docs.find((x) => x.key === key) || {};
        return { key, title, path, lead, version, custom: !!d.text, updatedAt: d.updatedAt || null, active: d.active !== false, marketing: !!d.marketing, visible: L.docVisible(db().settings, d) };
      }),
      consents: db().settings.legal.consents,
      placeholders: { store: L.STORE_PLACEHOLDERS, order: L.ORDER_PLACEHOLDERS },
      archive,
    };
  });
  router.add("GET", "/api/admin/legal/versions/:version", ADMIN, (ctx) => {
    const a = /^[0-9a-f]{64}$/.test(ctx.params.version) ? db().legalArchive[ctx.params.version] : null;
    if (!a) fail(404, "Bu sürüm arşivde yok.", "BULUNAMADI");
    const orders = db().orders.filter((o) => o.consent && (o.consent.accepted || []).some((c) => (c.docs || []).some((d) => d.version === ctx.params.version))).length;
    return { version: ctx.params.version, ...a, html: L.textToHtml(L.genericFill(a.text, db().settings, ctx.params.version)), orders };
  });

  // Kısmi güncelleme: gönderilen her bölüm mevcut değerle birleştirilip doğrulanır.
  // Nesne bölümler (store, legal, hours, ordering, announcement, notify) alan alan birleşir;
  // liste bölümler (zones, banners, faq, blockedPhones) gönderilen listeyle tamamen değişir.
  async function updateSettings(ctx) {
    const b = await ctx.json();
    if (!isPlainObject(b) || !Object.keys(b).length) fail(400, "Değiştirilecek ayar gönderilmedi.", "DOGRULAMA");
    const cur = db().settings;
    const next = {};
    for (const [key, val] of Object.entries(b)) {
      // Yalnızca tanımlı bölümler ("constructor", "toString", "__proto__" gibi devralınan adlar değil)
      const fn = Object.prototype.hasOwnProperty.call(V.SETTINGS_SECTIONS, key) ? V.SETTINGS_SECTIONS[key] : null;
      if (!fn) fail(400, `Bilinmeyen ayar bölümü: ${String(key).slice(0, 40)}`, "DOGRULAMA");
      let merged = val;
      if (isPlainObject(cur[key]) && isPlainObject(val)) {
        merged = { ...cur[key], ...val };
        // Eski panel: yalnızca "texts" gönderirse belge metinlerine yazılır (docs gönderildiyse docs esastır)
        if (key === "legal" && isPlainObject(val.texts) && val.docs === undefined)
          merged.docs = cur.legal.docs.map((d) => (typeof val.texts[d.key] === "string" ? { ...d, text: val.texts[d.key] } : d));
        if (key === "ordering" && isPlainObject(val.payments)) merged.payments = { ...cur.ordering.payments, ...val.payments };
      }
      next[key] = fn(merged, cur[key]);
    }
    if (next.faq) {
      // SSS maddelerine kimlik ver (gönderilen kimlik korunur)
      const incoming = b.faq;
      let n = Math.max(nextId(cur.faq), nextId(incoming.filter((f) => isPlainObject(f) && Number.isInteger(Number(f.id)) && Number(f.id) > 0).map((f) => ({ id: Number(f.id) }))));
      const seen = new Set();
      next.faq = next.faq.map((f, i) => {
        let id = Number(incoming[i].id);
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) id = n++;
        seen.add(id);
        return { id, ...f };
      });
    }
    // Yeni eklenen bölge/afiş/SSS maddelerine kalıcı sayaçtan kimlik verilir (silinmişlerin numarası tekrar kullanılmaz;
    // eski siparişlerdeki bölge kimliği başka bir bölgeye kaymaz)
    for (const section of ["zones", "banners", "faq"]) {
      if (!next[section]) continue;
      const prevIds = new Set(cur[section].map((x) => x.id));
      for (const item of next[section]) if (!prevIds.has(item.id)) item.id = allocId(db(), section, cur[section]);
    }
    const oldBannerImages = next.banners ? cur.banners.map((x) => x.image).filter(Boolean) : [];
    // Değişen yasal metinlerin eski sürümü arşive alınır (mağaza/yasal bilgi ya da metin değişince sürüm değişir)
    const legalBase = app.legalBaseUrl(ctx.baseUrl);
    const docsBefore = L.currentDocs(cur, legalBase, { all: true });
    Object.assign(cur, next);
    const versionsAfter = new Set(L.currentDocs(cur, legalBase, { all: true }).map((d) => d.version));
    const at = app.now().toISOString();
    for (const d of docsBefore) {
      if (!versionsAfter.has(d.version) && !db().legalArchive[d.version]) db().legalArchive[d.version] = { key: d.key, title: d.title, text: d.text, at, replacedAt: at };
    }
    L.pruneArchive(db());
    for (const img of oldBannerImages) app.deleteImageIfUnused(img);
    app.save();
    // Saat / sipariş alımı / duyuru / bölgeler değiştiyse panele ve açık mağaza sayfalarına yeni durum gider
    if (next.hours || next.ordering || next.announcement || next.zones) app.publishStatus();
    ctx.auditDetails = { sections: Object.keys(next) };
    return { settings: cur, status: app.status() };
  }
  router.add("PATCH", "/api/admin/settings", ADMIN, updateSettings);
  router.add("PUT", "/api/admin/settings", ADMIN, updateSettings);

  // Afiş / SSS / bölge toplu silme: { ids }
  for (const [section, label] of [["banners", "Afiş"], ["faq", "Soru"], ["zones", "Bölge"]]) {
    router.add("POST", `/api/admin/settings/${section}/bulk-delete`, ADMIN, async (ctx) => {
      const ids = idList(await ctx.json());
      const list = db().settings[section];
      const skipped = [];
      const remove = new Set();
      for (const id of ids) {
        const item = list.find((x) => x.id === id);
        if (!item) skipped.push({ id, reason: `${label} bulunamadı.` });
        else remove.add(item);
      }
      if (remove.size) {
        db().settings[section] = list.filter((x) => !remove.has(x));
        if (section === "banners") for (const x of remove) app.deleteImageIfUnused(x.image);
        app.save();
      } else ctx.auditSkip = true;
      return { processed: remove.size, skipped };
    });
  }

  // Telegram deneme mesajı (gövdede token/chatId verilirse onlar, yoksa kayıtlı ayarlar kullanılır)
  router.add("POST", "/api/admin/settings/telegram-test", ADMIN, async (ctx) => {
    const b = await ctx.json();
    const n = db().settings.notify;
    const token = String(b.telegramBotToken || n.telegramBotToken || "").trim();
    const chatId = String(b.telegramChatId || n.telegramChatId || "").trim();
    if (!token || !chatId) fail(400, "Önce Telegram bot anahtarını ve sohbet kimliğini girin.", "DOGRULAMA");
    V.SETTINGS_SECTIONS.notify({ telegramBotToken: token, telegramChatId: chatId }); // kayıttaki biçim kuralları (adres yoluna girer)
    const r = await sendTelegram({ token, chatId, text: `✅ ${db().settings.store.name}: Telegram bildirimi çalışıyor.`, apiBase: app.telegramApiBase });
    if (!r.ok) fail(502, r.error, "TELEGRAM");
    return { ok: true };
  });

  // ---------- Kullanıcılar ----------
  const activeAdmins = (exceptId) => db().users.filter((u) => u.role === "yonetici" && u.active && u.id !== exceptId).length;

  router.add("GET", "/api/admin/users", ADMIN, () => db().users.map(publicUser));

  router.add("POST", "/api/admin/users", ADMIN, async (ctx) => {
    const b = await ctx.json();
    const username = String(b.username || "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) fail(400, "Kullanıcı adı 3-30 karakter olmalı; küçük harf, rakam, nokta, - ve _ kullanın.", "DOGRULAMA");
    if (db().users.some((u) => u.username === username)) fail(409, "Bu kullanıcı adı zaten var.", "AYNI_AD");
    const role = b.role === "yonetici" ? "yonetici" : b.role === "personel" || b.role === undefined ? "personel" : null;
    if (!role) fail(400, "Rol yonetici ya da personel olmalı.", "DOGRULAMA");
    const problem = checkNewPassword(b.password);
    if (problem) fail(400, problem, "DOGRULAMA");
    const name = V.str(b.name, 60, "Ad") || username;
    const passHash = await hashPassword(b.password);
    ctx.recheck(); // özet hesaplanırken yöneticinin yetkisi alınmış olabilir
    // Özet hesaplanırken aynı adla başka istek kullanıcı eklemiş olabilir
    if (db().users.some((u) => u.username === username)) fail(409, "Bu kullanıcı adı zaten var.", "AYNI_AD");
    const user = {
      id: allocId(db(), "users", db().users),
      username,
      name,
      role,
      passHash,
      active: V.bool(b.active, true),
      createdAt: app.now().toISOString(),
    };
    db().users.push(user);
    app.markDefaultPassword(user, false);
    app.save();
    return ctx.send(201, publicUser(user));
  });

  router.add("PATCH", "/api/admin/users/:id", ADMIN, async (ctx) => {
    const u = db().users.find((x) => x.id === Number(ctx.params.id));
    if (!u) fail(404, "Kullanıcı bulunamadı.", "BULUNAMADI");
    const b = await ctx.json();
    // Şifre özeti (eşzamansız) önce hesaplanır; "son yönetici" denetimi ve değişiklik ardından araya başka istek
    // girmeden yapılır (aynı anda gelen iki istek iki yöneticiyi birden düşürüp paneli kilitleyemesin)
    let passHash;
    if (b.password !== undefined && b.password !== "") {
      const problem = checkNewPassword(b.password);
      if (problem) fail(400, problem, "DOGRULAMA");
      passHash = await hashPassword(b.password);
      ctx.recheck(); // özet hesaplanırken yöneticinin yetkisi alınmış olabilir
      if (!db().users.includes(u)) fail(404, "Kullanıcı bulunamadı.", "BULUNAMADI");
    }
    const role = b.role === undefined ? u.role : b.role;
    if (!["yonetici", "personel"].includes(role)) fail(400, "Rol yonetici ya da personel olmalı.", "DOGRULAMA");
    const active = b.active === undefined ? u.active : V.bool(b.active);
    if (u.role === "yonetici" && u.active && (role !== "yonetici" || !active) && activeAdmins(u.id) === 0)
      fail(409, "Son yönetici pasifleştirilemez ya da personele çevrilemez. Önce başka bir yönetici ekleyin.", "SON_YONETICI");
    if (b.name !== undefined) u.name = V.str(b.name, 60, "Ad") || u.username;
    u.role = role;
    u.active = active;
    if (passHash) {
      u.passHash = passHash;
      app.markDefaultPassword(u, false);
    }
    app.save();
    if (!active || passHash) {
      app.sessions.destroyUser(u.id, u.id === ctx.user.id ? ctx.token : null);
      app.loginTrust.forget(u.username); // eski şifreyle giriş yapılmış ağlar artık "bilinen ağ" sayılmaz
    }
    return publicUser(u);
  });

  router.add("DELETE", "/api/admin/users/:id", ADMIN, (ctx) => {
    const u = db().users.find((x) => x.id === Number(ctx.params.id));
    if (!u) fail(404, "Kullanıcı bulunamadı.", "BULUNAMADI");
    if (u.role === "yonetici" && u.active && activeAdmins(u.id) === 0) fail(409, "Son yönetici silinemez.", "SON_YONETICI");
    db().users = db().users.filter((x) => x !== u);
    app.save();
    app.sessions.destroyUser(u.id);
    app.loginTrust.forget(u.username);
    return { ok: true };
  });

  // ---------- Raporlar ----------
  router.add("GET", "/api/admin/reports", ADMIN, (ctx) => report(db(), { from: ctx.query.get("from"), to: ctx.query.get("to"), now: app.now() }));

  // ---------- Yedek ----------
  const backupJson = () => JSON.stringify({ ...db(), meta: { ...db().meta, exportedAt: app.now().toISOString() } }, null, 2);
  // Parolalı yedek: aynı şifreli zarf biçimi (AES-256-GCM, anahtar scrypt(parola)); DATA_KEY'den bağımsızdır
  const sendEncrypted = (ctx, text, baseName) => {
    const password = backupPassword(ctx.body && ctx.body.password);
    const out = new Cipher(password).encrypt(text);
    return ctx.download(out, "application/json; charset=utf-8", baseName.replace(/\.json$/, "") + ".sifreli.json");
  };

  router.add("GET", "/api/admin/backup", ADMIN_AUDITED, (ctx) => {
    return ctx.download(backupJson(), "application/json; charset=utf-8", attachmentName("ulusoy-market-yedek", "json", app.now()));
  });
  // Parolayla şifrelenmiş yedek indirme: { password } (en az 10 karakter). Parola URL'de taşınmasın diye POST.
  router.add("POST", "/api/admin/backup", ADMIN, async (ctx) => {
    ctx.body = await ctx.json();
    return sendEncrypted(ctx, backupJson(), attachmentName("ulusoy-market-yedek", "json", app.now()));
  });

  router.add("GET", "/api/admin/backups", ADMIN, () => app.store.listBackups());

  const readServerBackup = (name) => {
    const file = app.store.backupPath(name);
    if (!file) fail(404, "Yedek bulunamadı.", "BULUNAMADI");
    try {
      return app.store.readBackupText(file);
    } catch (e) {
      if (e instanceof CryptoError) fail(409, `Bu yedek açılamıyor: ${e.message}`, "YEDEK_ACILAMIYOR");
      throw e;
    }
  };
  // Sunucudaki otomatik yedek: düz JSON olarak (DATA_KEY ile şifreliyse sunucu çözer)
  router.add("GET", "/api/admin/backups/:name", ADMIN_AUDITED, (ctx) => {
    return ctx.download(readServerBackup(ctx.params.name), "application/json; charset=utf-8", ctx.params.name);
  });
  // Sunucudaki otomatik yedeği parolayla şifreleyerek indir: { password }
  router.add("POST", "/api/admin/backups/:name", ADMIN, async (ctx) => {
    ctx.body = await ctx.json();
    const text = readServerBackup(ctx.params.name);
    return sendEncrypted(ctx, text, ctx.params.name);
  });

  // Gövde: yedek dosyasının kendisi (ya da { data: <yedek> }). Parolalı yedek: { file: <.sifreli.json içeriği>, password }
  // ya da dosyanın kendisi + "password" alanı.
  router.add("POST", "/api/admin/restore", ADMIN, async (ctx) => {
    let b = await ctx.json(LIMITS.large);
    // Zarf: { file: <zarf>, password } ya da zarfın kendisi + "password" alanı (zarf anahtar kümesi sabit; parola ayrılır)
    const { password: _pw, ...rest } = b;
    const env = parseEnvelope(isPlainObject(b.file) ? b.file : rest);
    if (env) {
      if (typeof b.password !== "string" || !b.password) fail(400, "Bu yedek parolayla şifrelenmiş. Parolayı girin.", "YEDEK_PAROLA");
      let text;
      try {
        text = new Cipher(b.password.slice(0, 200)).decrypt(env);
      } catch (e) {
        if (e instanceof CryptoError && e.reason === "YANLIS_ANAHTAR") fail(400, "Yedek parolası yanlış.", "YEDEK_PAROLA");
        if (e instanceof CryptoError) fail(400, `Şifreli yedek açılamadı: ${e.message}`, "DOGRULAMA");
        throw e;
      }
      try {
        b = JSON.parse(text);
      } catch {
        fail(400, "Şifreli yedeğin içeriği okunamadı.", "DOGRULAMA");
      }
    }
    const data = isPlainObject(b.data) && Array.isArray(b.data.products) ? b.data : b;
    if (!isPlainObject(data) || !Array.isArray(data.products) || !Array.isArray(data.categories) || !Array.isArray(data.orders || []))
      fail(400, "Yedek dosyası tanınmadı. Panelden indirilen .json yedeği seçin.", "DOGRULAMA");
    let upgraded;
    // Bilinmeyen üst düzey anahtarlar (ör. "format") atılır; upgrade() da atar, burada yanıtta bildirmek için sayılır
    const droppedKeys = Object.keys(data).filter((k) => !DB_KEYS.includes(k)).map((k) => String(k).slice(0, 40)).slice(0, 20);
    try {
      upgraded = upgrade(clone(data), app.store.readSeed()).db;
      validateData(upgraded);
    } catch (e) {
      fail(400, `Yedek dosyası okunamadı: ${e instanceof TypeError ? "dosya biçimi bozuk." : e.message}`, "DOGRULAMA");
    }
    // Ayarlar panelde kaydedilirken uygulanan kurallarla denetlenir (bozuk saat, ücret vb. mağazayı kilitlemesin).
    // Biçimi kayıt sırasındakiyle aynı kalan bölümlerde doğrulayıcının temizlenmiş çıktısı saklanır (ham değer değil);
    // kimlik taşıyan liste bölümleri (bölge, afiş, SSS) ve yasal belgeler yalnızca denetlenir.
    const NORMALIZED = ["store", "hours", "ordering", "announcement", "notify", "blockedPhones", "privacy"];
    for (const [key, fn] of Object.entries(V.SETTINGS_SECTIONS)) {
      try {
        const out = fn(clone(upgraded.settings[key]), []);
        if (NORMALIZED.includes(key)) upgraded.settings[key] = isPlainObject(out) && isPlainObject(upgraded.settings[key]) ? { ...upgraded.settings[key], ...out } : out;
      } catch (e) {
        fail(400, `Yedek dosyasındaki ayarlar geçersiz: ${e.message}`, "DOGRULAMA");
      }
    }
    // Onay kaydı bütünlüğü: sunucuda bulunan bir siparişin (aynı numara + aynı takip anahtarı) müşteri onayı —
    // onaylanan belge sürümleri, onay zamanı, sözleşmedeki sipariş özeti — yedekle değiştirilemez. Farklıysa yedek
    // kurcalanmış demektir: geri yükleme yapılmaz. (IP alanı karşılaştırılmaz: anonimleştirmede silinir.)
    const liveById = new Map(db().orders.map((o) => [o.id, o]));
    const consentDiff = [];
    const replacedOrders = [];
    for (const o of upgraded.orders) {
      const live = liveById.get(o.id);
      if (!live) continue;
      if (live.token !== o.token) {
        if (live.consent) replacedOrders.push(o.id); // başka bir sipariş (farklı kurulum / sıfırlama sonrası): raporlanır
        continue;
      }
      if (consentFingerprint(live.consent) !== consentFingerprint(o.consent)) consentDiff.push(o.id);
    }
    if (consentDiff.length)
      fail(409, `Yedek dosyasındaki ${consentDiff.length} siparişin müşteri onay kaydı sunucudakinden farklı (${consentDiff.slice(0, 10).map((x) => `#${x}`).join(", ")}${consentDiff.length > 10 ? " …" : ""}). Onaylanmış sözleşme kayıtları yedekle değiştirilemez; dosya değiştirilmiş olabilir. Geri yükleme yapılmadı.`, "ONAY_KAYDI", { orders: consentDiff.slice(0, 200) });
    // Kimlik sayaçları geri gitmez: yedek eskiyse de sonradan verilmiş numaralar tekrar kullanılmaz
    syncIdCounters(upgraded, idCounters(app.db));
    // Onaylanmış metin arşivi birleştirilir (yedekten sonra verilmiş onayların metinleri kaybolmasın)
    // Mevcut kayıt önceliklidir ve gelen her kaydın metni kendi sürüm özetini (SHA-256) tutmalıdır: kurcalanmış
    // bir yedekle müşterinin onayladığı metin değiştirilemesin. Tutmayan kayıtlar alınmaz.
    const incoming = {};
    let rejectedArchive = 0;
    for (const [h, a] of Object.entries(upgraded.legalArchive || {})) {
      if (L.versionOf(a.title || "", a.text) === h) incoming[h] = a;
      else rejectedArchive++;
    }
    upgraded.legalArchive = { ...incoming, ...db().legalArchive };
    const backup = app.store.backupNow("geri-yukleme-oncesi");
    app.store.db = upgraded;
    app.ensureAdminUser();
    app.save();
    // Kullanıcı kimlikleri değişmiş olabilir: tüm oturumlar kapanır, yeniden giriş gerekir; canlı akışlar yeniden bağlanır
    app.sessions.destroyAll();
    app.resetStreams();
    const counts = { products: upgraded.products.length, categories: upgraded.categories.length, orders: upgraded.orders.length };
    const extra = { ...(rejectedArchive ? { rejectedArchive } : {}), ...(replacedOrders.length ? { replacedOrders: replacedOrders.slice(0, 200) } : {}), ...(droppedKeys.length ? { droppedKeys } : {}) };
    ctx.auditDetails = { counts, encrypted: !!env, ...extra };
    return { ok: true, backup, relogin: true, counts, ...extra };
  });
}

module.exports = { register, publicUser };
