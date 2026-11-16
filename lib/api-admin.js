"use strict";
// Yönetim paneli API'si. Rol: "personel" sipariş + stok/tükendi işlemleri; diğer her şey "yonetici".

const V = require("./validate");
const O = require("./orders");
const CSV = require("./csv");
const { report } = require("./reports");
const { upgrade, validateData, syncIdCounters } = require("./db");
const { LEGAL_TEMPLATES } = require("./defaults");
const { hashPassword, verifyPassword, checkNewPassword, DEFAULT_PASSWORD } = require("./auth");
const { sendTelegram } = require("./notify");
const { LIMITS } = require("./http");
const { localDateStr, localDayStartMs, addDaysStr } = require("./hours");
const { fail, round2, nextId, allocId, idCounters, clone, isPlainObject, normalizePhone, phoneKey, foldTr } = require("./util");

const ANY = { auth: true };
const ADMIN = { auth: true, role: "yonetici" };

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt });

// İstek gövdesindeki kimlik listesi
function idList(b, max = 5000) {
  if (!Array.isArray(b.ids) || !b.ids.length) fail(400, "En az bir kayıt seçin.", "DOGRULAMA");
  if (b.ids.length > max) fail(400, `Tek seferde en fazla ${max} kayıt işlenebilir.`, "DOGRULAMA");
  const ids = [...new Set(b.ids.map(Number))];
  if (ids.some((x) => !Number.isInteger(x) || x <= 0)) fail(400, "Geçersiz kayıt kimliği.", "DOGRULAMA");
  return ids;
}

function attachmentName(prefix, ext, now) {
  return `${prefix}-${localDateStr(now)}.${ext}`;
}

function register(router, app) {
  const db = () => app.db;

  // ---------- Oturum ----------
  router.add("POST", "/api/admin/login", async (ctx) => {
    const b = await ctx.json();
    // Deneme, şifre denetiminden ÖNCE sayılır: scrypt eşzamansız olduğundan aynı anda gönderilen
    // yüzlerce istek "sınır aşıldı mı" denetimini birlikte geçip sınırı aşabiliyordu. Başarılı girişte sayaç sıfırlanır.
    const wait = app.limiters.login.hit(ctx.ip);
    if (wait) fail(429, `Çok fazla hatalı giriş denemesi. ${Math.ceil(wait / 60)} dakika sonra tekrar deneyin.`, "HIZ_SINIRI", { retryAfter: wait });
    const username = String(b.username || "admin").trim().toLowerCase();
    const password = String(b.password || "").slice(0, 1024);
    const user = db().users.find((u) => u.username === username && u.active);
    const ok = await verifyPassword(password, user ? user.passHash : null);
    if (!ok || !user) fail(401, "Kullanıcı adı veya şifre hatalı.", "GIRIS");
    app.limiters.login.reset(ctx.ip);
    const s = app.sessions.create(user.id);
    if (password === DEFAULT_PASSWORD) app.markDefaultPassword(user, true);
    return { token: s.token, expiresAt: s.expiresAt, user: publicUser(user), defaultPassword: app.usesDefaultPassword(user) };
  });

  router.add("POST", "/api/admin/logout", ANY, (ctx) => {
    app.sessions.destroy(ctx.token);
    return { ok: true };
  });

  router.add("GET", "/api/admin/me", ANY, (ctx) => ({ user: publicUser(ctx.user), defaultPassword: app.usesDefaultPassword(ctx.user) }));

  router.add("POST", "/api/admin/password", ANY, async (ctx) => {
    const b = await ctx.json();
    const ok = await verifyPassword(String(b.currentPassword || ""), ctx.user.passHash);
    if (!ok) fail(400, "Mevcut şifre hatalı.", "DOGRULAMA");
    const problem = checkNewPassword(b.newPassword);
    if (problem) fail(400, problem, "DOGRULAMA");
    ctx.user.passHash = await hashPassword(b.newPassword);
    app.markDefaultPassword(ctx.user, false); // yeni şifre varsayılan olamaz (checkNewPassword)
    app.save();
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
      ...fields,
    };
    applyImage(product, b);
    db().products.push(product);
    app.save();
    return ctx.send(201, product);
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
    Object.assign(p, fields);
    applyImage(p, b);
    app.save();
    return p;
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
    const actions = ["delete", "hide", "show", "soldOut", "available", "feature", "unfeature", "move", "price"];
    if (!actions.includes(action)) fail(400, "Geçersiz toplu işlem.", "DOGRULAMA");
    if (ctx.user.role !== "yonetici" && !PERSONEL_BULK.includes(action))
      fail(403, "Bu işlem için yönetici yetkisi gerekiyor.", "YETKI");
    let categoryId;
    let percent;
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
        case "price": {
          const np = round2(p.price * (1 + percent / 100));
          if (!(np > 0)) { skipped.push({ id, reason: "Yeni fiyat sıfırın altına iniyor." }); continue; }
          p.price = np;
          if (p.oldPrice && p.oldPrice <= np) p.oldPrice = null;
          break;
        }
      }
      processed++;
    }
    for (const img of removedImages) app.deleteImageIfUnused(img);
    if (processed) app.save();
    return { processed, skipped };
  });

  router.add("GET", "/api/admin/products/export", ADMIN, (ctx) => {
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
    return { processed, skipped };
  });

  // ---------- Siparişler ----------
  router.add("GET", "/api/admin/orders", ANY, (ctx) => {
    const q = ctx.query;
    const d = db();
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
      return { orders: list.map(O.adminOrder), counts, latestId, serverTime };
    }
    const list = (q.get("status") ? O.filterOrders(d, { ...filters, status: q.get("status") }) : base).sort((a, b) => b.id - a.id);
    const pageSize = Math.min(200, Math.max(1, Number(q.get("pageSize")) || 50));
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number(q.get("page")) || 1));
    return {
      orders: list.slice((page - 1) * pageSize, page * pageSize).map(O.adminOrder),
      total: list.length,
      page,
      pageSize,
      pages,
      counts,
      latestId,
      serverTime,
    };
  });

  router.add("GET", "/api/admin/orders/export", ADMIN, (ctx) => {
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
    const warnings = quote.errors.filter((e) => e.code === "MIN_TUTAR").map((e) => e.message);
    return ctx.send(201, { ...O.adminOrder(order), warnings });
  });

  const findOrder = (id) => {
    const o = db().orders.find((x) => x.id === Number(id));
    if (!o) fail(404, "Sipariş bulunamadı.", "BULUNAMADI");
    return o;
  };

  router.add("GET", "/api/admin/orders/:id", ANY, (ctx) => O.adminOrder(findOrder(ctx.params.id)));

  // { status?, cancelNote?, adminNote?, courier? }
  router.add("PATCH", "/api/admin/orders/:id", ANY, async (ctx) => {
    const o = findOrder(ctx.params.id);
    const b = await ctx.json();
    let cancelNote;
    if (b.cancelNote !== undefined) cancelNote = V.note(b.cancelNote, V.RULES.CANCEL_NOTE_MAX, "Not");
    const adminNote = b.adminNote !== undefined ? V.note(b.adminNote, V.RULES.ADMIN_NOTE_MAX, "Yönetici notu") : undefined;
    const courier = b.courier !== undefined ? V.str(b.courier, 60, "Kurye adı") : undefined;
    if (b.status !== undefined && !V.STATUSES.includes(b.status)) fail(400, "Geçersiz sipariş durumu.", "DOGRULAMA");
    const now = app.now();
    let changed = false;
    if (b.status !== undefined) changed = O.setStatus(db(), o, b.status, { by: ctx.user.username, now }) || changed;
    if (cancelNote !== undefined && o.status === "İptal" && cancelNote !== o.cancelNote) { o.cancelNote = cancelNote; changed = true; }
    if (adminNote !== undefined && adminNote !== o.adminNote) { o.adminNote = adminNote; changed = true; }
    if (courier !== undefined && courier !== o.courier) { o.courier = courier; changed = true; }
    if (changed) {
      o.updatedAt = now.toISOString();
      app.save();
    }
    return O.adminOrder(o);
  });

  // Kalem düzenleme: { items: [{ productId, qty }] } (qty 0 → çıkar; listede olmayan kalem değişmez)
  router.add("PUT", "/api/admin/orders/:id/items", ANY, async (ctx) => {
    const o = findOrder(ctx.params.id);
    const b = await ctx.json();
    const { changed, warnings } = O.editItems(db(), o, b.items, { user: ctx.user, now: app.now() });
    if (changed) app.save();
    return { ...O.adminOrder(o), warnings };
  });

  // Toplu: { ids, action: "status", status, cancelNote? } | { ids, action: "delete" }
  router.add("POST", "/api/admin/orders/bulk", ANY, async (ctx) => {
    const b = await ctx.json();
    const ids = idList(b);
    const skipped = [];
    let processed = 0;
    let backup = null;
    if (b.action === "status") {
      if (!V.STATUSES.includes(b.status)) fail(400, "Geçersiz sipariş durumu.", "DOGRULAMA");
      const cancelNote = b.cancelNote !== undefined ? V.note(b.cancelNote, V.RULES.CANCEL_NOTE_MAX, "Not") : undefined;
      const now = app.now();
      for (const id of ids) {
        const o = db().orders.find((x) => x.id === id);
        if (!o) { skipped.push({ id, reason: "Sipariş bulunamadı." }); continue; }
        if (o.status === b.status) { skipped.push({ id, reason: "Sipariş zaten bu durumda." }); continue; }
        O.setStatus(db(), o, b.status, { by: ctx.user.username, now });
        if (b.status === "İptal" && cancelNote) o.cancelNote = cancelNote;
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
        backup = app.store.backupNow("siparis-silme-oncesi");
        const set = new Set(deletable);
        db().orders = db().orders.filter((o) => !set.has(o));
        processed = deletable.length;
      }
    } else fail(400, "Geçersiz toplu işlem.", "DOGRULAMA");
    if (processed) app.save();
    return backup ? { processed, skipped, backup } : { processed, skipped };
  });

  // ---------- Müşteriler ----------
  router.add("GET", "/api/admin/customers", ANY, (ctx) => {
    const q = String(ctx.query.get("q") || "").trim();
    let list = O.customers(db());
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
    const c = O.customers(db()).find((x) => phoneKey(x.phone) === key);
    if (!c) fail(404, "Müşteri bulunamadı.", "BULUNAMADI");
    const orders = db().orders.filter((o) => phoneKey(o.customer.phone) === key).sort((a, b) => b.id - a.id).map(O.adminOrder);
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
    return { phone, blocked };
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
    }
    return { processed: set.size, skipped };
  });

  // ---------- Ayarlar ----------
  router.add("GET", "/api/admin/settings", ADMIN, () => db().settings);
  router.add("GET", "/api/admin/settings/legal-templates", ADMIN, () => LEGAL_TEMPLATES);

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
        if (key === "legal" && isPlainObject(val.texts)) merged.texts = { ...cur.legal.texts, ...val.texts };
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
    Object.assign(cur, next);
    for (const img of oldBannerImages) app.deleteImageIfUnused(img);
    app.save();
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
      }
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
    if (!active || passHash) app.sessions.destroyUser(u.id, u.id === ctx.user.id ? ctx.token : null);
    return publicUser(u);
  });

  router.add("DELETE", "/api/admin/users/:id", ADMIN, (ctx) => {
    const u = db().users.find((x) => x.id === Number(ctx.params.id));
    if (!u) fail(404, "Kullanıcı bulunamadı.", "BULUNAMADI");
    if (u.role === "yonetici" && u.active && activeAdmins(u.id) === 0) fail(409, "Son yönetici silinemez.", "SON_YONETICI");
    db().users = db().users.filter((x) => x !== u);
    app.save();
    app.sessions.destroyUser(u.id);
    return { ok: true };
  });

  // ---------- Raporlar ----------
  router.add("GET", "/api/admin/reports", ADMIN, (ctx) => report(db(), { from: ctx.query.get("from"), to: ctx.query.get("to"), now: app.now() }));

  // ---------- Yedek ----------
  router.add("GET", "/api/admin/backup", ADMIN, (ctx) => {
    const data = { ...db(), meta: { ...db().meta, exportedAt: app.now().toISOString() } };
    return ctx.download(JSON.stringify(data, null, 2), "application/json; charset=utf-8", attachmentName("ulusoy-market-yedek", "json", app.now()));
  });

  router.add("GET", "/api/admin/backups", ADMIN, () => app.store.listBackups());

  router.add("GET", "/api/admin/backups/:name", ADMIN, (ctx) => {
    const file = app.store.backupPath(ctx.params.name);
    if (!file) fail(404, "Yedek bulunamadı.", "BULUNAMADI");
    return ctx.download(require("fs").readFileSync(file), "application/json; charset=utf-8", ctx.params.name);
  });

  // Gövde: yedek dosyasının kendisi (ya da { data: <yedek> })
  router.add("POST", "/api/admin/restore", ADMIN, async (ctx) => {
    const b = await ctx.json(LIMITS.large);
    const data = isPlainObject(b.data) && Array.isArray(b.data.products) ? b.data : b;
    if (!isPlainObject(data) || !Array.isArray(data.products) || !Array.isArray(data.categories) || !Array.isArray(data.orders || []))
      fail(400, "Yedek dosyası tanınmadı. Panelden indirilen .json yedeği seçin.", "DOGRULAMA");
    let upgraded;
    try {
      upgraded = upgrade(clone(data), app.store.readSeed()).db;
      validateData(upgraded);
    } catch (e) {
      fail(400, `Yedek dosyası okunamadı: ${e instanceof TypeError ? "dosya biçimi bozuk." : e.message}`, "DOGRULAMA");
    }
    // Ayarlar panelde kaydedilirken uygulanan kurallarla denetlenir (bozuk saat, ücret vb. mağazayı kilitlemesin)
    for (const [key, fn] of Object.entries(V.SETTINGS_SECTIONS)) {
      try {
        fn(clone(upgraded.settings[key]), []);
      } catch (e) {
        fail(400, `Yedek dosyasındaki ayarlar geçersiz: ${e.message}`, "DOGRULAMA");
      }
    }
    // Kimlik sayaçları geri gitmez: yedek eskiyse de sonradan verilmiş numaralar tekrar kullanılmaz
    syncIdCounters(upgraded, idCounters(app.db));
    const backup = app.store.backupNow("geri-yukleme-oncesi");
    app.store.db = upgraded;
    app.ensureAdminUser();
    app.save();
    // Kullanıcı kimlikleri değişmiş olabilir: tüm oturumlar kapanır, yeniden giriş gerekir
    app.sessions.destroyAll();
    return { ok: true, backup, relogin: true, counts: { products: upgraded.products.length, categories: upgraded.categories.length, orders: upgraded.orders.length } };
  });
}

module.exports = { register, publicUser };
