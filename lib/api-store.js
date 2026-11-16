"use strict";
// Mağaza (müşteri) API'si

const { fail, newToken } = require("./util");
const { RULES } = require("./validate");
const { quote, isSoldOut, maxQtyFor, isVisible, hiddenCategoryIds } = require("./pricing");
const { hoursSummary } = require("./hours");
const O = require("./orders");
const { orderMessage, cancelMessage } = require("./notify");

// Müşteriye gösterilen ürün (stok adedi, barkod gibi iç alanlar hariç)
function publicProduct(p) {
  const soldOut = isSoldOut(p);
  return {
    id: p.id,
    name: p.name,
    brand: p.brand || "",
    description: p.description || "",
    price: p.price,
    oldPrice: p.oldPrice && p.oldPrice > p.price ? p.oldPrice : null,
    discountPercent: p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0,
    unit: p.unit,
    categoryId: p.categoryId,
    image: p.image || null,
    emoji: p.emoji || "",
    featured: !!p.featured,
    soldOut,
    maxQty: soldOut ? 0 : maxQtyFor(p),
  };
}
function visibleCatalog(db) {
  const hiddenCats = hiddenCategoryIds(db);
  const products = db.products.filter((p) => isVisible(p, hiddenCats)).map(publicProduct);
  const counts = new Map();
  for (const p of products) counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
  const categories = db.categories
    .filter((c) => !c.hidden)
    .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji || "", image: c.image || null, productCount: counts.get(c.id) || 0 }));
  return { categories, products };
}

function effectiveZone(z, ord) {
  return {
    id: z.id,
    name: z.name,
    slug: z.slug,
    fee: z.fee !== null && z.fee !== undefined ? z.fee : ord.deliveryFee,
    minOrder: z.minOrder !== null && z.minOrder !== undefined ? z.minOrder : ord.minOrder,
    etaMinutes: z.etaMinutes || ord.etaMinutes,
  };
}

function storePayload(app) {
  const db = app.db;
  const s = db.settings;
  const ord = s.ordering;
  const { categories, products } = visibleCatalog(db);
  return {
    store: { ...s.store },
    legal: { companyTitle: s.legal.companyTitle, taxOffice: s.legal.taxOffice, taxNo: s.legal.taxNo, mersis: s.legal.mersis, kep: s.legal.kep },
    hours: { days: s.hours.days, summary: hoursSummary(s.hours) },
    ordering: {
      enabled: ord.enabled,
      pausedMessage: ord.pausedMessage,
      allowPreorder: ord.allowPreorder,
      minOrder: ord.minOrder,
      deliveryFee: ord.deliveryFee,
      freeDeliveryOver: ord.freeDeliveryOver,
      etaMinutes: ord.etaMinutes,
      pickupEnabled: ord.pickupEnabled,
      payments: { ...ord.payments },
    },
    status: app.status(),
    zones: s.zones.filter((z) => z.active).map((z) => effectiveZone(z, ord)),
    announcement: s.announcement.active && s.announcement.text ? { text: s.announcement.text, active: true } : { text: "", active: false },
    banners: s.banners.filter((b) => b.active).map(({ id, title, text, image, link }) => ({ id, title, text, image, link })),
    faq: s.faq.map(({ id, q, a }) => ({ id, q, a })),
    categories,
    products,
    rules: {
      nameMax: RULES.NAME_MAX,
      addressMin: RULES.ADDR_MIN,
      addressMax: RULES.ADDR_MAX,
      addressMaxLines: RULES.ADDR_MAX_LINES,
      noteMax: RULES.NOTE_MAX,
      qtyMax: RULES.QTY_MAX,
      phonePattern: "^0\\d{10}$",
    },
    serverTime: app.now().toISOString(),
  };
}

function register(router, app) {
  router.add("GET", "/api/store", () => storePayload(app));

  // Eski uç noktalar (yalnızca görünür kategoriler/ürünler)
  router.add("GET", "/api/categories", () => visibleCatalog(app.db).categories);
  router.add("GET", "/api/products", () => visibleCatalog(app.db).products);

  router.add("POST", "/api/cart/quote", async (ctx) => {
    const b = await ctx.json();
    const q = quote(app.db, { items: b.items, type: b.type, zoneId: b.zoneId, couponCode: b.couponCode, phone: b.phone }, { now: app.now(), status: app.status() });
    return q;
  });

  router.add("POST", "/api/orders", async (ctx) => {
    const b = await ctx.json();
    // Gizli alan (honeypot) doluysa bot sayılır: başarılı gibi yanıt verilir ama sipariş oluşturulmaz
    if (typeof b.website === "string" && b.website.trim()) {
      app.log(`Honeypot dolu sipariş reddedildi (${ctx.ip}).`);
      return ctx.send(201, { id: 0, token: newToken(), total: 0, status: "Yeni" });
    }
    const wait = app.limiters.orders.hit(ctx.ip);
    if (wait) fail(429, "Çok fazla sipariş denemesi yapıldı. Lütfen biraz sonra tekrar deneyin.", "HIZ_SINIRI", { retryAfter: wait });
    const status = app.status();
    const { order } = O.createOrder(app.db, b, { source: "web", now: app.now(), status });
    app.save();
    // Panel bağlantısı yalnızca PUBLIC_URL'den: isteğin Host başlığı müşterinin elinde, sahte alan adına
    // ("http://ulusoymarket-panel.example/panel") yönlenen bir bağlantı yöneticinin Telegram'ına düşmesin.
    app.notify(orderMessage(order, app.opts.publicUrl));
    return ctx.send(201, { id: order.id, token: order.token, total: order.total, status: order.status, order: O.publicOrder(order, app.db.settings) });
  });

  // Sipariş arama. Takip anahtarı tutmazsa telefonla eşleştirme denenir; telefonla her deneme
  // (yanlış anahtarla birlikte gönderilse de) hız sınırına sayılır, yoksa sınır aşılabilirdi.
  function findLimited(ctx, id, token, phone, tooMany) {
    const byToken = token ? O.findForCustomer(app.db, id, { token: String(token) }) : null;
    if (byToken) return byToken;
    if (phone) {
      const wait = app.limiters.lookup.hit(ctx.ip);
      if (wait) fail(429, tooMany, "HIZ_SINIRI", { retryAfter: wait });
      return O.findForCustomer(app.db, id, { phone: String(phone) });
    }
    return null;
  }

  // Takip: ?token=... (aynı cihaz) veya ?phone=... (başka cihazdan sorgu)
  router.add("GET", "/api/orders/:id", (ctx) => {
    const token = ctx.query.get("token");
    const phone = ctx.query.get("phone");
    const o = findLimited(ctx, ctx.params.id, token, phone, "Çok fazla sorgu yapıldı. Lütfen biraz sonra tekrar deneyin.");
    if (!o) fail(404, "Sipariş bulunamadı. Numara ve telefonu kontrol edin.", "BULUNAMADI");
    return O.publicOrder(o, app.db.settings);
  });

  router.add("POST", "/api/orders/:id/cancel", async (ctx) => {
    const b = await ctx.json();
    const o = findLimited(ctx, ctx.params.id, b.token, b.phone, "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.");
    if (!o) fail(404, "Sipariş bulunamadı. Numara ve telefonu kontrol edin.", "BULUNAMADI");
    O.cancelByCustomer(app.db, o, { reason: b.reason, now: app.now() });
    app.save();
    app.notify(cancelMessage(o));
    return O.publicOrder(o, app.db.settings);
  });
}

module.exports = { register, publicProduct, storePayload };
