"use strict";
// Sipariş iş kuralları: oluşturma, durum değişimi, stok, müşteri iptali, kalem düzenleme, müşteri listesi

const V = require("./validate");
const { quote, findCoupon, couponDiscount, couponPhoneProblem } = require("./pricing");
const { fail, round2, newToken, allocId, phoneKey, foldTr, cleanText } = require("./util");
const { safeEqual } = require("./auth");
const { localDayStartMs, addDaysStr } = require("./hours");
const { checkConsents, recordConsent } = require("./legal");
const { caymaOf } = require("./cayma");

const SUBSTITUTIONS = ["ara", "benzer", "cikar"];
const TYPE_LABEL = { teslimat: "Eve teslim", gelal: "Gel-al" };
const PAYMENT_LABEL = { nakit: "Kapıda nakit", kart: "Kapıda kart" };
const SUBST_LABEL = { ara: "Beni arayın", benzer: "Benzeriyle değiştirin", cikar: "Siparişten çıkarın" };

// Müşteriye gösterilen durum adı (gel-al'da "Yolda" → hazır)
function statusLabel(o) {
  if (o.type === "gelal" && o.status === "Yolda") return "Hazır, teslim alabilirsiniz";
  if (o.status === "Yeni") return "Alındı";
  return o.status;
}

// Müşteriye (takip ekranına) gösterilen sipariş
function publicOrder(o, settings) {
  const zone = settings && o.customer.zoneId ? settings.zones.find((z) => z.id === o.customer.zoneId) : null;
  return {
    id: o.id,
    token: o.token,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt || o.createdAt,
    status: o.status,
    statusLabel: statusLabel(o),
    history: (o.history || []).map((h) => ({ status: h.status, at: h.at })),
    type: o.type,
    payment: o.payment,
    changeFor: o.changeFor,
    preorder: !!o.preorder,
    items: o.items.map((i) => ({ productId: i.productId, name: i.name, unit: i.unit, price: i.price, qty: i.qty, caymaDurumu: i.caymaDurumu || null })),
    subtotal: o.subtotal,
    discount: o.discount,
    couponCode: o.couponCode,
    deliveryFee: o.deliveryFee,
    total: o.total,
    customer: { name: o.customer.name, zoneName: o.customer.zoneName || "" },
    note: o.note || "",
    substitution: o.substitution,
    cancelNote: o.status === "İptal" ? o.cancelNote || "" : "",
    cancelledBy: o.status === "İptal" ? o.cancelledBy || "market" : null,
    canCancel: o.status === "Yeni",
    etaMinutes: (zone && zone.etaMinutes) || (settings ? settings.ordering.etaMinutes : null),
    // Paylaşılabilir gizli takip bağlantısı (site köküne göre); açan cihaz siparişi kendi listesine ekler
    trackPath: `/?siparis=${o.id}&t=${encodeURIComponent(o.token)}`,
    hasDocuments: !!o.consent,
    anonymized: !!o.anonymizedAt,
  };
}

/**
 * Numara + telefonla sorgu (başka cihazdan; ayar açıkken) yanıtı: salt okunur, en az veri.
 * Takip anahtarı ve bağlantısı, ad, adres, not, kalemler YOK: telefonu ve sipariş numarasını bilen biri
 * siparişi iptal edemez, sözleşmeyi (ad/telefon/adres) açamaz, iade talebi gönderemez.
 */
function phoneLookupOrder(o, settings) {
  const zone = settings && o.customer.zoneId ? settings.zones.find((z) => z.id === o.customer.zoneId) : null;
  return {
    id: o.id,
    readOnly: true,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt || o.createdAt,
    status: o.status,
    statusLabel: statusLabel(o),
    history: (o.history || []).map((h) => ({ status: h.status, at: h.at })),
    type: o.type,
    itemCount: o.items.reduce((t, i) => t + i.qty, 0),
    total: o.total,
    cancelNote: o.status === "İptal" ? o.cancelNote || "" : "",
    cancelledBy: o.status === "İptal" ? o.cancelledBy || "market" : null,
    etaMinutes: (zone && zone.etaMinutes) || (settings ? settings.ordering.etaMinutes : null),
  };
}

/** SSE ile müşteriye giden sipariş: takip nesnesi, token hariç (dinleyen zaten biliyor) */
function streamOrder(o, settings) {
  const { token, trackPath, ...rest } = publicOrder(o, settings);
  return rest;
}

// Panelde gösterilen sipariş (iç alanlar hariç)
function adminOrder(o) {
  const { stockHeld, consent, ...rest } = o;
  return {
    ...rest,
    consent: consent ? { at: consent.at, ip: consent.ip || "", accepted: consent.accepted || [], declined: consent.declined || [] } : null,
    statusLabel: statusLabel(o),
    // Maskeli (arşiv) kopyada token boştur: personel takip bağlantısıyla kişisel veriye ulaşamasın
    trackPath: o.token ? `/?siparis=${o.id}&t=${encodeURIComponent(o.token)}` : null,
  };
}

// ---------- Stok ----------
function holdStock(db, o) {
  o.stockHeld = {};
  for (const it of o.items) {
    const p = db.products.find((x) => x.id === it.productId);
    if (!p || p.stock === null || p.stock === undefined) continue;
    // Stok tam sayı tutulur: kiloluk üründe 1,5 kg stoktan 2 düşer (iptalde aynısı geri eklenir)
    const take = Math.min(Math.ceil(it.qty), Math.max(0, p.stock));
    p.stock -= take;
    if (take) o.stockHeld[it.productId] = (o.stockHeld[it.productId] || 0) + take;
  }
}
function releaseStock(db, o) {
  for (const [id, qty] of Object.entries(o.stockHeld || {})) {
    const p = db.products.find((x) => x.id === Number(id));
    if (p && p.stock !== null && p.stock !== undefined) p.stock += qty;
  }
  o.stockHeld = {};
}
function adjustCouponUse(db, o, delta) {
  if (!o.couponCode) return;
  const c = db.coupons.find((x) => x.code === o.couponCode);
  if (c) c.usedCount = Math.max(0, (c.usedCount || 0) + delta);
}

/** Durum değiştirir; iptalde stok/kupon geri alınır, iptalden dönüşte yeniden ayrılır. */
function setStatus(db, o, status, { by, byCustomer = false, note, now = new Date() } = {}) {
  if (!V.STATUSES.includes(status)) fail(400, "Geçersiz sipariş durumu.", "DOGRULAMA");
  if (status === o.status) return false;
  const at = now.toISOString();
  const wasCancelled = o.status === "İptal";
  if (status === "İptal") {
    releaseStock(db, o);
    adjustCouponUse(db, o, -1);
    o.cancelledBy = byCustomer ? "musteri" : "market";
  } else if (wasCancelled) {
    holdStock(db, o);
    adjustCouponUse(db, o, +1);
    o.cancelNote = "";
    o.cancelledBy = null;
  }
  o.status = status;
  o.updatedAt = at;
  const h = { status, at };
  if (by) h.by = by;
  if (note) h.note = note;
  o.history.push(h);
  return true;
}

function cleanSubstitution(v) {
  return SUBSTITUTIONS.includes(v) ? v : "ara";
}

/**
 * Yeni sipariş. source "web" (müşteri) ya da "panel" (elle sipariş).
 * Panel siparişinde saat, minimum tutar, KVKK, engelli numara ve aktif sipariş sınırı denetlenmez.
 */
function createOrder(db, body, { source = "web", now = new Date(), status = null, user = null, baseUrl = "", ip = "" } = {}) {
  const s = db.settings;
  const ord = s.ordering;
  const web = source === "web";
  const type = body.type === "gelal" ? "gelal" : "teslimat";

  if (web && status && !status.acceptingOrders)
    fail(409, status.message, status.paused ? "DURDURULDU" : "KAPALI");
  if (type === "gelal" && !ord.pickupEnabled && web) fail(400, "Şu an gel-al siparişi alınmıyor.", "GELAL_KAPALI");

  const name = V.customerName(body.name);
  const phone = V.phone(body.phone);
  let address = "";
  if (type === "teslimat") address = V.address(body.address);
  else if (String(body.address || "").trim()) address = V.address(body.address);

  const payment = body.payment === "kart" ? "kart" : body.payment === "nakit" || body.payment === undefined ? "nakit" : null;
  if (!payment) fail(400, "Ödeme yöntemini seçin.", "DOGRULAMA");
  if (web && !ord.payments[payment])
    fail(400, payment === "kart" ? "Şu an kapıda kartla ödeme alınmıyor." : "Şu an kapıda nakit ödeme alınmıyor.", "ODEME");

  const note = V.note(body.note, V.RULES.NOTE_MAX, "Sipariş notu");
  const substitution = cleanSubstitution(body.substitution);

  // Zorunlu onaylar (eski "kvkk": true alanı kabul edilmez; "consents" zorunlu)
  const consentCheck = web ? checkConsents(s, body, baseUrl) : null;

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) fail(400, "Sepetiniz boş.", "BOS_SEPET");

  // Telefona bağlı denetimler (engelli numara, aktif sipariş sınırı, kuponun numara başına sınırı) en sonda:
  // geçersiz/boş bir istekle başkasının numarası hakkında bilgi edinilemesin
  const q = quote(db, { items, type, zoneId: body.zoneId, couponCode: body.couponCode }, { now });

  // Ürün sorunlarında sipariş verilmez; müşteri sepetini yeniler (409)
  if (q.removed.length) {
    const r = q.removed[0];
    const msg =
      r.code === "TUKENDI"
        ? `${r.reason} Sepetinizden çıkarıldı, lütfen tekrar kontrol edin.`
        : r.code === "GECERSIZ_ADET"
          ? "Geçersiz adet."
          : "Bir ürün artık satışta değil. Sepetinizi kontrol edin.";
    fail(r.code === "GECERSIZ_ADET" ? 400 : 409, msg, r.code, { quote: q });
  }
  if (q.adjusted.length) fail(409, q.adjusted[0].reason, "ADET_SINIRI", { quote: q });
  const blocking = q.errors.filter((e) => !(source === "panel" && e.code === "MIN_TUTAR"));
  if (blocking.length) {
    const e = blocking[0];
    fail(e.code === "BOLGE_GECERSIZ" || e.code === "BOLGE_SECIN" || e.code === "MIN_TUTAR" ? 400 : 409, e.message, e.code, { quote: q });
  }
  if (q.coupon && !q.coupon.valid) fail(400, q.coupon.message, "KUPON", { quote: q });

  let changeFor = null;
  if (payment === "nakit" && body.changeFor !== undefined && body.changeFor !== null && body.changeFor !== "") {
    changeFor = V.money(body.changeFor, "Para üstü tutarı", { max: 100000 });
    if (changeFor < q.total) fail(400, "Para üstü için yazdığınız tutar sipariş toplamından az olamaz.", "DOGRULAMA");
  }

  if (web && s.blockedPhones.some((p) => phoneKey(p) === phoneKey(phone)))
    fail(403, "Bu telefon numarasıyla online sipariş verilemiyor. Lütfen marketi arayın.", "ENGELLI");
  if (web) {
    const active = db.orders.filter((o) => V.ACTIVE_STATUSES.includes(o.status) && phoneKey(o.customer.phone) === phoneKey(phone)).length;
    if (active >= ord.maxActiveOrdersPerPhone)
      fail(429, `Bu numarayla ${active} aktif siparişiniz var. Yeni sipariş için önceki siparişlerinizin teslim edilmesini bekleyin ya da marketi arayın.`, "AKTIF_SINIR");
  }
  if (q.coupon && q.coupon.valid) {
    const problem = couponPhoneProblem(db, findCoupon(db, q.coupon.code), phone);
    if (problem) fail(400, problem, "KUPON", { quote: { ...q, coupon: { code: q.coupon.code, valid: false, message: problem } } });
  }

  const zoneObj = q.zone ? s.zones.find((z) => z.id === q.zone.id) : null;
  const at = now.toISOString();
  const order = {
    id: allocId(db, "orders", db.orders),
    token: newToken(),
    createdAt: at,
    updatedAt: at,
    source,
    type,
    payment,
    changeFor,
    customer: {
      name,
      phone,
      address,
      zoneId: zoneObj ? zoneObj.id : null,
      zoneName: zoneObj ? zoneObj.name : "",
    },
    note,
    substitution,
    // Kaleme o anki cayma durumu kopyalanır (ürün sonradan değişse de siparişin sözleşmesi değişmez)
    items: q.items.map((l) => ({ productId: l.productId, name: l.name, brand: l.brand || "", unit: l.unit, price: l.price, qty: l.qty, caymaDurumu: l.caymaDurumu })),
    subtotal: q.subtotal,
    discount: q.discount,
    couponCode: q.coupon && q.coupon.valid ? q.coupon.code : null,
    deliveryFee: q.deliveryFee,
    total: q.total,
    status: "Yeni",
    history: [user ? { status: "Yeni", at, by: user.username } : { status: "Yeni", at }],
    cancelNote: "",
    cancelledBy: null,
    adminNote: "",
    courier: "",
    preorder: web && !!(status && status.preorder),
    consentAt: web ? at : null,
    consent: null,
    confirmations: [],
    returnRequests: [],
    stockHeld: {},
  };
  if (consentCheck) {
    recordConsent(db, order, consentCheck, { at, ip });
    order.consent.snapshot.etaMinutes = q.etaMinutes || null;
  }
  holdStock(db, order);
  adjustCouponUse(db, order, +1);
  db.orders.push(order);
  return { order, quote: q };
}

// Takip: ?token= (aynı cihaz) ya da ?phone= (başka cihazdan sorgu)
function findForCustomer(db, id, { token, phone }) {
  const o = db.orders.find((x) => x.id === Number(id));
  if (!o) return null;
  if (token && typeof token === "string" && o.token && safeEqual(o.token, token)) return o;
  const key = phoneKey(phone);
  if (key.length === 10 && phoneKey(o.customer.phone) === key) return o;
  return null;
}

function cancelByCustomer(db, o, { reason, now = new Date() } = {}) {
  if (o.status === "İptal") fail(409, "Bu sipariş zaten iptal edilmiş.", "IPTAL_EDILMIS");
  if (o.status !== "Yeni")
    fail(409, "Siparişiniz hazırlanmaya başladığı için buradan iptal edilemiyor. Lütfen marketi arayın.", "IPTAL_EDILEMEZ");
  const why = cleanText(reason).slice(0, 200);
  setStatus(db, o, "İptal", { byCustomer: true, by: "musteri", note: why || undefined, now });
}

/** Panelden kalem düzenleme: items tam liste olarak gelir; qty 0 olan kalem çıkarılır. */
function editItems(db, o, items, { user, now = new Date() } = {}) {
  if (o.status === "İptal") fail(409, "İptal edilmiş siparişin kalemleri değiştirilemez.", "IPTAL_EDILMIS");
  if (!Array.isArray(items)) fail(400, "Kalem listesi gerekli.", "DOGRULAMA");
  const wanted = new Map();
  for (const it of items) {
    const id = Number(it && it.productId);
    if (!Number.isInteger(id)) fail(400, "Geçersiz ürün.", "DOGRULAMA");
    const line = o.items.find((x) => x.productId === id) || db.products.find((x) => x.id === id);
    const qty = V.qty(it && it.qty, line && line.unit);
    if (!V.isQty(qty) || qty > V.RULES.QTY_MAX) fail(400, "Geçersiz adet.", "DOGRULAMA");
    wanted.set(id, (wanted.get(id) || 0) + qty);
  }
  const lines = [];
  const changes = [];
  for (const old of o.items) {
    const q = wanted.has(old.productId) ? wanted.get(old.productId) : old.qty;
    wanted.delete(old.productId);
    if (q === 0) changes.push(`${old.name} çıkarıldı`);
    else {
      if (q !== old.qty) changes.push(`${old.name}: ${old.qty} → ${q}`);
      lines.push({ ...old, qty: q });
    }
  }
  // Siparişte olmayan yeni ürünler güncel fiyatla eklenir (gizli ürünler de eklenebilir; telefonla gelen istekler için)
  for (const [id, q] of wanted) {
    if (!q) continue;
    const p = db.products.find((x) => x.id === id);
    if (!p) fail(400, "Eklenmek istenen ürün bulunamadı.", "DOGRULAMA");
    lines.push({ productId: p.id, name: p.name, brand: p.brand || "", unit: p.unit, price: p.price, qty: q, caymaDurumu: caymaOf(p, db.categories) });
    changes.push(`${p.name} eklendi (${q})`);
  }
  if (!lines.length) fail(400, "Siparişte en az bir ürün kalmalı. Tüm ürünleri çıkarmak için siparişi iptal edin.", "BOS_SEPET");
  if (!changes.length) return { changed: false, warnings: [] };

  releaseStock(db, o);
  o.items = lines;
  holdStock(db, o);
  const warnings = [];
  o.subtotal = round2(lines.reduce((t, l) => t + l.price * l.qty, 0));
  if (o.couponCode) {
    const c = findCoupon(db, o.couponCode);
    if (c && c.type !== "ucretsizTeslimat") {
      if (c.minOrder && o.subtotal < c.minOrder) {
        o.discount = 0;
        warnings.push(`Ara toplam ${o.couponCode} kuponunun alt sınırının altına indi; indirim kaldırıldı.`);
      } else o.discount = couponDiscount(c, o.subtotal);
    } else if (!c) o.discount = Math.min(o.discount, o.subtotal);
  }
  o.total = round2(o.subtotal - o.discount + o.deliveryFee);
  const at = now.toISOString();
  o.updatedAt = at;
  o.history.push({ status: o.status, at, by: user ? user.username : undefined, note: `Kalemler düzenlendi: ${changes.join(", ")}` });
  return { changed: true, warnings };
}

// ---------- Panel listesi ----------
function matchesQuery(o, q) {
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (/^#?\d+$/.test(q.trim()) && String(o.id) === digits) return true;
  if (digits.length >= 4 && o.customer.phone.replace(/\D/g, "").includes(digits)) return true;
  const f = foldTr(q);
  return (
    foldTr(o.customer.name).includes(f) ||
    foldTr(o.customer.address).includes(f) ||
    foldTr(o.customer.zoneName).includes(f) ||
    foldTr(o.note).includes(f) ||
    foldTr(o.courier).includes(f) ||
    o.items.some((i) => foldTr(i.name).includes(f))
  );
}

// from/to: "YYYY-MM-DD" (Türkiye saatiyle, iki uç dahil)
function dateRange(from, to) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const start = from && re.test(from) ? localDayStartMs(from) : -Infinity;
  const end = to && re.test(to) ? localDayStartMs(addDaysStr(to, 1)) : Infinity;
  return { start, end };
}

function filterOrders(db, { status, from, to, q, type, payment } = {}) {
  const { start, end } = dateRange(from, to);
  let statuses = null;
  if (status) {
    statuses = status === "aktif" ? V.ACTIVE_STATUSES : String(status).split(",").map((x) => x.trim()).filter(Boolean);
  }
  const query = String(q || "").trim();
  return db.orders.filter((o) => {
    const t = Date.parse(o.createdAt);
    if (t < start || t >= end) return false;
    if (statuses && !statuses.includes(o.status)) return false;
    if (type && o.type !== type) return false;
    if (payment && o.payment !== payment) return false;
    return matchesQuery(o, query);
  });
}

// ---------- Müşteriler (siparişlerden türetilir) ----------
function customers(db) {
  const map = new Map();
  const sorted = [...db.orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const o of sorted) {
    const key = phoneKey(o.customer.phone);
    if (!key) continue;
    let c = map.get(key);
    if (!c) {
      c = { phone: o.customer.phone, name: "", address: "", zoneName: "", orderCount: 0, cancelledCount: 0, totalSpent: 0, firstOrderAt: o.createdAt, lastOrderAt: o.createdAt, lastOrderId: o.id, blocked: false };
      map.set(key, c);
    }
    c.name = o.customer.name || c.name;
    c.phone = o.customer.phone;
    if (o.customer.address) c.address = o.customer.address;
    if (o.customer.zoneName) c.zoneName = o.customer.zoneName;
    c.lastOrderAt = o.createdAt;
    c.lastOrderId = o.id;
    if (o.status === "İptal") c.cancelledCount++;
    else {
      c.orderCount++;
      c.totalSpent = round2(c.totalSpent + o.total);
    }
  }
  const blocked = new Set(db.settings.blockedPhones.map(phoneKey));
  for (const c of map.values()) c.blocked = blocked.has(phoneKey(c.phone));
  // Siparişi olmayan engelli numaralar da listelenir
  for (const p of db.settings.blockedPhones) {
    if (!map.has(phoneKey(p)))
      map.set(phoneKey(p), { phone: p, name: "", address: "", zoneName: "", orderCount: 0, cancelledCount: 0, totalSpent: 0, firstOrderAt: null, lastOrderAt: null, lastOrderId: null, blocked: true });
  }
  return [...map.values()].sort((a, b) => String(b.lastOrderAt || "").localeCompare(String(a.lastOrderAt || "")));
}

module.exports = {
  TYPE_LABEL,
  PAYMENT_LABEL,
  SUBST_LABEL,
  statusLabel,
  publicOrder,
  phoneLookupOrder,
  streamOrder,
  adminOrder,
  holdStock,
  releaseStock,
  setStatus,
  createOrder,
  findForCustomer,
  cancelByCustomer,
  editItems,
  filterOrders,
  dateRange,
  customers,
};
