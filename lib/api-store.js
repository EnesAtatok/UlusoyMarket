"use strict";
// Mağaza (müşteri) API'si

const { fail, newToken, isPlainObject } = require("./util");
const { RULES } = require("./validate");
const { quote, isSoldOut, maxQtyFor, isVisible, hiddenCategoryIds } = require("./pricing");
const { hoursSummary } = require("./hours");
const O = require("./orders");
const L = require("./legal");
const { orderMessage, cancelMessage, returnRequestMessage } = require("./notify");
const { CAYMA, caymaOf, caymaLabel } = require("./cayma");
const { CHECKOUT_TEXTS } = require("./defaults");
const V = require("./validate");
const { cleanText } = require("./util");
const PV = require("./privacy");

const MAX_TRACKED = 30; // tek istekte sorgulanabilecek / dinlenebilecek sipariş sayısı

// Müşteriye gösterilen ürün (stok adedi, barkod gibi iç alanlar hariç)
function publicProduct(p, categories) {
  const soldOut = isSoldOut(p);
  const cayma = caymaOf(p, categories);
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
    // Cayma hakkı durumu (ön bilgilendirme özet kutusu, ürün ürün): yok_cabuk_bozulan | acilirsa_yok_hijyen | var
    caymaDurumu: cayma,
    caymaLabel: caymaLabel(cayma),
  };
}
function visibleCatalog(db) {
  const hiddenCats = hiddenCategoryIds(db);
  const products = db.products.filter((p) => isVisible(p, hiddenCats)).map((p) => publicProduct(p, db.categories));
  const counts = new Map();
  for (const p of products) counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
  const categories = db.categories
    .filter((c) => !c.hidden)
    .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji || "", image: c.image || null, caymaDurumu: c.caymaDurumu || "var", productCount: counts.get(c.id) || 0 }));
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

function storePayload(app, baseUrl = "") {
  const db = app.db;
  const s = db.settings;
  const ord = s.ordering;
  const { categories, products } = visibleCatalog(db);
  const legal = L.publicLegal(s, app.legalBaseUrl(baseUrl));
  return {
    store: { ...s.store },
    legal: {
      businessType: s.legal.businessType || "",
      companyTitle: s.legal.companyTitle,
      taxOffice: s.legal.taxOffice,
      taxNo: s.legal.taxNo,
      mersis: s.legal.mersis,
      kep: s.legal.kep,
      chamber: s.legal.chamber,
      docs: legal.docs,
      consents: legal.consents,
    },
    // Sipariş onayı ekranı için (YASAL.md §2.1–2.3): düğme metni, ödeme yükümlülüğü bildirimi, cayma etiketleri.
    // paymentNotice içindeki {{toplam}} ve {{odemeSekli}} istemcide doldurulur; hazır hâli POST /api/cart/quote yanıtında.
    checkout: {
      ...CHECKOUT_TEXTS,
      seller: { title: s.legal.companyTitle || "", name: s.store.name },
      caymaLabels: Object.fromEntries(Object.entries(CAYMA).map(([k, v]) => [k, v.label])),
      previewDocs: ["onBilgilendirme", "mesafeliSatis"],
    },
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
    features: {
      phoneLookup: !!s.privacy.phoneLookup, // false iken numara + telefonla sorgu 404 döner; formu göstermeyin
      marketingConsent: !!s.privacy.marketingConsent, // ticari ileti izni kutusu (legal.consents içinde yalnızca açıkken gelir)
      returnRequests: true, // POST /api/orders/:id/return-request (cayma/iade talebi)
      liveUpdates: true, // SSE: POST /api/orders/stream-ticket → GET /api/orders/stream
      liveStatus: true, // SSE (kimliksiz): GET /api/store/stream → "durum" olayları
    },
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
      trackMax: MAX_TRACKED,
    },
    serverTime: app.now().toISOString(),
  };
}

/** { orders: [{ id, token }] } → geçerli çiftler. Biçim hatasında 400. */
function trackedPairs(b) {
  const list = b && Array.isArray(b.orders) ? b.orders : null;
  if (!list || !list.length) fail(400, "Sorgulanacak sipariş yok.", "DOGRULAMA");
  if (list.length > MAX_TRACKED) fail(400, `Tek seferde en fazla ${MAX_TRACKED} sipariş sorgulanabilir.`, "DOGRULAMA");
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const id = Number(isPlainObject(x) ? x.id : NaN);
    const token = isPlainObject(x) && typeof x.token === "string" ? x.token.slice(0, 100) : "";
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, token });
  }
  return out;
}

function register(router, app) {
  router.add("GET", "/api/store", (ctx) => storePayload(app, ctx.baseUrl));

  // Eski uç noktalar (yalnızca görünür kategoriler/ürünler)
  router.add("GET", "/api/categories", () => visibleCatalog(app.db).categories);
  router.add("GET", "/api/products", () => visibleCatalog(app.db).products);

  // Kimliksiz uçlarda telefona bağlı denetim yapılmaz (kuponun bu numarayla kullanılıp kullanılmadığı, engelli numara,
  // aktif sipariş sınırı): yanıt telefona göre değişirse başkasının numarası hakkında bilgi sızar. Bunlar yalnızca
  // gerçek sipariş gönderiminde, diğer tüm doğrulamalardan sonra denetlenir (lib/orders.js createOrder).
  router.add("POST", "/api/cart/quote", async (ctx) => {
    const wait = app.limiters.quote.hit(ctx.ipKey);
    if (wait) fail(429, "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.", "HIZ_SINIRI", { retryAfter: wait });
    const b = await ctx.json();
    const q = quote(app.db, { items: b.items, type: b.type, zoneId: b.zoneId, couponCode: b.couponCode }, { now: app.now(), status: app.status() });
    // Düğmenin hemen üstünde gösterilecek ödeme yükümlülüğü cümlesi (ödeme: istekteki payment, yoksa nakit)
    q.paymentNotice = L.paymentNotice(q.total, b.payment === "kart" ? "kart" : "nakit", q.type);
    return q;
  });

  router.add("POST", "/api/orders", async (ctx) => {
    const b = await ctx.json();
    // Gizli alan (honeypot) doluysa bot sayılır: başarılı gibi yanıt verilir ama sipariş oluşturulmaz
    if (typeof b.website === "string" && b.website.trim()) {
      app.log(`Honeypot dolu sipariş reddedildi (${ctx.ip}).`);
      return ctx.send(201, { id: 0, token: newToken(), total: 0, status: "Yeni" });
    }
    const wait = app.limiters.orders.hit(ctx.ipKey);
    if (wait) fail(429, "Çok fazla sipariş denemesi yapıldı. Lütfen biraz sonra tekrar deneyin.", "HIZ_SINIRI", { retryAfter: wait });
    const status = app.status();
    const { order } = O.createOrder(app.db, b, { source: "web", now: app.now(), status, baseUrl: app.legalBaseUrl(ctx.baseUrl), ip: ctx.ip });
    app.save();
    app.publishOrder(order, "yeni");
    // Panel bağlantısı yalnızca PUBLIC_URL'den: isteğin Host başlığı müşterinin elinde, sahte alan adına
    // ("http://ulusoymarket-panel.example/panel") yönlenen bir bağlantı yöneticinin Telegram'ına düşmesin.
    app.notify(orderMessage(order, app.opts.publicUrl));
    const pub = O.publicOrder(order, app.db.settings);
    return ctx.send(201, { id: order.id, token: order.token, total: order.total, status: order.status, trackPath: pub.trackPath, order: pub });
  });

  // ---------- Cihaza özel "Siparişlerim": toplu sorgu ----------
  // Gövde: { orders: [{ id, token }, …] } (en fazla 30). Yanlış token ile var olmayan sipariş ayırt edilmez (ikisi de missing).
  router.add("POST", "/api/orders/lookup", async (ctx) => {
    const wait = app.limiters.track.hit(ctx.ipKey);
    if (wait) fail(429, "Çok fazla sorgu yapıldı. Lütfen biraz sonra tekrar deneyin.", "HIZ_SINIRI", { retryAfter: wait });
    const pairs = trackedPairs(await ctx.json());
    const orders = [];
    const missing = [];
    for (const p of pairs) {
      const o = p.token ? O.findForCustomer(app.db, p.id, { token: p.token }) : null;
      if (o) orders.push(O.publicOrder(o, app.db.settings));
      else missing.push(p.id);
    }
    orders.sort((a, b) => b.id - a.id);
    return { orders, missing, serverTime: app.now().toISOString() };
  });

  // ---------- Canlı takip (SSE) ----------
  // 1) POST /api/orders/stream-ticket { orders: [{ id, token }] } → { ticket, expiresAt, orders: [id], missing: [id] }
  router.add("POST", "/api/orders/stream-ticket", async (ctx) => {
    const wait = app.limiters.stream.hit(ctx.ipKey);
    if (wait) fail(429, "Çok fazla canlı bağlantı denemesi. Sayfa yoklamayla güncellenmeye devam edecek.", "HIZ_SINIRI", { retryAfter: wait });
    const pairs = trackedPairs(await ctx.json());
    const ok = [];
    const missing = [];
    for (const p of pairs) {
      const o = p.token ? O.findForCustomer(app.db, p.id, { token: p.token }) : null;
      (o ? ok : missing).push(p.id);
    }
    if (!ok.length) fail(404, "Sipariş bulunamadı.", "BULUNAMADI");
    const t = app.events.issueTicket({ kind: "musteri", ip: ctx.ip, orderIds: ok });
    if (!t) fail(503, "Canlı bağlantı şu an açılamıyor. Sayfa yoklamayla güncellenmeye devam edecek.", "AKIS_DOLU");
    return ctx.send(201, { ...t, orders: ok, missing });
  });

  // 2) GET /api/orders/stream?ticket=…[&lastEventId=n] → text/event-stream
  router.add("GET", "/api/orders/stream", (ctx) => app.openStream(ctx, "musteri"));

  // Siparişi olmayan ziyaretçi için kimliksiz durum akışı: GET /api/store/stream → hello { status } + "durum" olayları
  router.add("GET", "/api/store/stream", (ctx) => app.openPublicStream(ctx));

  // Sipariş vermeden önce: sepete ve form bilgilerine göre doldurulmuş Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi
  // (YASAL.md §2.2: "o sepete ve o bilgilere göre doldurulmuş hâlde gösterilir"). Gövde: sipariş gövdesi + docs?: [anahtar]
  router.add("POST", "/api/orders/preview-documents", async (ctx) => {
    const wait = app.limiters.track.hit(ctx.ipKey);
    if (wait) fail(429, "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.", "HIZ_SINIRI", { retryAfter: wait });
    const b = await ctx.json();
    const type = b.type === "gelal" ? "gelal" : "teslimat";
    const q = quote(app.db, { items: b.items, type, zoneId: b.zoneId, couponCode: b.couponCode }, { now: app.now(), status: app.status() });
    const zone = q.zone ? app.db.settings.zones.find((z) => z.id === q.zone.id) : null;
    const payment = b.payment === "kart" ? "kart" : "nakit";
    const pseudo = {
      id: null,
      createdAt: app.now().toISOString(),
      customer: {
        name: cleanText(b.name).slice(0, V.RULES.NAME_MAX),
        phone: cleanText(b.phone).slice(0, 20),
        address: cleanText(b.address).slice(0, V.RULES.ADDR_MAX),
        zoneName: zone ? zone.name : "",
      },
      type,
      payment,
      changeFor: payment === "nakit" && Number(b.changeFor) > 0 ? Number(b.changeFor) : null,
      substitution: ["ara", "benzer", "cikar"].includes(b.substitution) ? b.substitution : "ara",
      zoneName: zone ? zone.name : "",
      items: q.items.map((l) => ({ productId: l.productId, name: l.name, brand: l.brand, unit: l.unit, price: l.price, qty: l.qty, caymaDurumu: l.caymaDurumu })),
      subtotal: q.subtotal,
      discount: q.discount,
      couponCode: q.coupon && q.coupon.valid ? q.coupon.code : null,
      deliveryFee: q.deliveryFee,
      total: q.total,
      etaMinutes: q.etaMinutes,
    };
    const keys = Array.isArray(b.docs) && b.docs.length ? b.docs.map(String).slice(0, 20) : ["onBilgilendirme", "mesafeliSatis"];
    return {
      docs: L.previewDocuments(app.db.settings, app.legalBaseUrl(ctx.baseUrl), pseudo, keys),
      total: q.total,
      paymentNotice: L.paymentNotice(q.total, payment, type),
      canOrder: q.canOrder,
    };
  });

  // Cayma/iade talebi (MSY m.11; YASAL.md §4.1.2): { token, message (≤500), items?: [{ productId, qty }] }
  // Talebin ulaştığı yanıtla hemen teyit edilir; panel akışına ve (ayarlıysa) Telegram'a kişisel verisiz bildirim gider.
  router.add("POST", "/api/orders/:id/return-request", async (ctx) => {
    const wait = app.limiters.track.hit(ctx.ipKey);
    if (wait) fail(429, "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.", "HIZ_SINIRI", { retryAfter: wait });
    const b = await ctx.json();
    const o = typeof b.token === "string" && b.token ? O.findForCustomer(app.db, ctx.params.id, { token: b.token }) : null;
    if (!o) fail(404, "Sipariş bulunamadı.", "BULUNAMADI");
    // Kişisel verisi silinmiş siparişe yeni serbest metin (kişisel veri içerebilir) eklenmez
    if (o.anonymizedAt) fail(409, "Bu siparişin kayıtları anonimleştirildi; talebinizi lütfen marketi arayarak iletin.", "ANONIM");
    const message = V.note(b.message, 500, "Talep metni");
    if (!message) fail(400, "Talebinizi kısaca yazın (hangi ürün, cayma mı iade mi).", "DOGRULAMA");
    if (!Array.isArray(o.returnRequests)) o.returnRequests = [];
    const list = o.returnRequests;
    if (list.length >= 5) fail(429, "Bu sipariş için en fazla 5 talep gönderilebilir. Lütfen marketi arayın.", "TALEP_SINIRI");
    const items = Array.isArray(b.items)
      ? b.items
          .map((x) => {
            const productId = Number(x && x.productId);
            const line = o.items.find((i) => i.productId === productId);
            return { productId, qty: V.qty(x && x.qty, line && line.unit) };
          })
          .filter((x) => o.items.some((i) => i.productId === x.productId) && x.qty > 0 && x.qty <= V.RULES.QTY_MAX)
          .slice(0, 50)
      : [];
    const at = app.now().toISOString();
    const r = { id: list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1, at, message, items, status: "Yeni" };
    list.push(r);
    o.updatedAt = at;
    app.save();
    app.publishOrder(o, "guncellendi");
    app.notify(returnRequestMessage(o, r));
    const when = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "long", timeStyle: "short" }).format(new Date(at));
    return ctx.send(201, {
      ok: true,
      request: { id: r.id, at: r.at, status: r.status, items: r.items },
      message: `Cayma/iade talebiniz ${when} itibarıyla bize ulaştı (talep no ${o.id}-${r.id}).`,
    });
  });

  // Takip: ?token=... (aynı cihaz / paylaşılan bağlantı). ?phone=... yalnızca panelde açıksa (varsayılan kapalı → 404)
  // Jetonlu müşteri uçları (takip, iptal, belgeler): takip sınırıyla aynı hız sınırı
  const trackLimit = (ctx) => {
    const wait = app.limiters.track.hit(ctx.ipKey);
    if (wait) fail(429, "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.", "HIZ_SINIRI", { retryAfter: wait });
  };

  // Takip: ?token=... (aynı cihaz / paylaşılan bağlantı) → tam takip nesnesi.
  // ?phone=... yalnızca panelde açıksa (varsayılan kapalı → 404) ve yalnızca salt okunur, en az veriyle durum döner:
  // takip anahtarı, takip bağlantısı, ad, adres, kalemler dönmez. İptal, belge ve cayma/iade yalnızca anahtar sahibine.
  router.add("GET", "/api/orders/:id", (ctx) => {
    const token = ctx.query.get("token");
    const phone = ctx.query.get("phone");
    if (token) {
      trackLimit(ctx);
      const byToken = O.findForCustomer(app.db, ctx.params.id, { token: String(token) });
      if (byToken) return O.publicOrder(byToken, app.db.settings);
    }
    if (phone) {
      if (!app.db.settings.privacy.phoneLookup)
        fail(404, "Telefon numarasıyla sipariş sorgulama kapalı. Siparişi verdiğiniz cihazdan ya da takip bağlantısıyla görüntüleyin.", "SORGU_KAPALI");
      // Telefonla her deneme (yanlış anahtarla birlikte gönderilse de) hız sınırına sayılır
      const wait = app.limiters.lookup.hit(ctx.ipKey);
      if (wait) fail(429, "Çok fazla sorgu yapıldı. Lütfen biraz sonra tekrar deneyin.", "HIZ_SINIRI", { retryAfter: wait });
      const o = O.findForCustomer(app.db, ctx.params.id, { phone: String(phone) });
      // Arşiv eşiğini geçmiş (ya da anonimleştirilmiş) sipariş telefonla bulunmaz
      if (o && !o.anonymizedAt && !PV.isArchived(o, app.db.settings, app.now())) return O.phoneLookupOrder(o, app.db.settings);
      fail(404, "Sipariş bulunamadı. Numara ve telefonu kontrol edin.", "BULUNAMADI");
    }
    fail(404, "Sipariş bulunamadı.", "BULUNAMADI");
  });

  // Müşteri iptali: yalnızca token ile (telefonla iptal kaldırıldı)
  router.add("POST", "/api/orders/:id/cancel", async (ctx) => {
    trackLimit(ctx);
    const b = await ctx.json();
    const o = typeof b.token === "string" && b.token ? O.findForCustomer(app.db, ctx.params.id, { token: b.token }) : null;
    if (!o) fail(404, "Sipariş bulunamadı.", "BULUNAMADI");
    O.cancelByCustomer(app.db, o, { reason: b.reason, now: app.now() });
    app.save();
    app.publishOrder(o, "guncellendi");
    app.notify(cancelMessage(o));
    return O.publicOrder(o, app.db.settings);
  });

  // Siparişin onay kaydı ve onaylanan metinler (sipariş bilgileriyle doldurulmuş): { token }
  router.add("POST", "/api/orders/:id/documents", async (ctx) => {
    trackLimit(ctx);
    const b = await ctx.json();
    const o = typeof b.token === "string" && b.token ? O.findForCustomer(app.db, ctx.params.id, { token: b.token }) : null;
    if (!o) fail(404, "Sipariş bulunamadı.", "BULUNAMADI");
    const out = L.orderDocuments(app.db, o);
    if (out.consent) delete out.consent.ip; // müşteriye IP gösterilmez
    return out;
  });
}

module.exports = { register, publicProduct, storePayload, MAX_TRACKED };
