"use strict";
// Sepet hesabı: ara toplam, kupon indirimi, teslimat ücreti, minimum tutar.
// Fiyatı her zaman sunucu hesaplar; istemcinin gönderdiği fiyat dikkate alınmaz.

const { round2, phoneKey, foldTr } = require("./util");
const { RULES } = require("./validate");
const { caymaOf, caymaLabel } = require("./cayma");

const isSoldOut = (p) => !!p.soldOut || (p.stock !== null && p.stock !== undefined && p.stock <= 0);

// Bir üründen tek siparişte en fazla kaç adet alınabilir
function maxQtyFor(p) {
  let m = RULES.QTY_MAX;
  if (p.maxPerOrder) m = Math.min(m, p.maxPerOrder);
  if (p.stock !== null && p.stock !== undefined) m = Math.min(m, Math.max(0, p.stock));
  return m;
}

function hiddenCategoryIds(db) {
  return new Set(db.categories.filter((c) => c.hidden).map((c) => c.id));
}
// Müşteriye görünür mü (ürün ya da kategorisi gizli değil)
function isVisible(p, hiddenCats) {
  return !!p && !p.hidden && !hiddenCats.has(p.categoryId);
}

// Kupon kodu karşılaştırması büyük/küçük harf ve Türkçe karakter duyarsızdır
// ("hosgeldin" = "HOSGELDIN" = "HOŞGELDİN")
function findCoupon(db, code) {
  const c = foldTr(code);
  if (!c) return null;
  return db.coupons.find((x) => foldTr(x.code) === c) || null;
}

// Kupon bu sepete uygulanabilir mi? Uygulanamıyorsa nedenini döner.
function couponProblem(db, coupon, { subtotal, phone, now, type }) {
  if (!coupon || !coupon.active) return "Kupon kodu geçersiz.";
  const t = now.getTime();
  if (coupon.startsAt && t < Date.parse(coupon.startsAt)) return "Bu kupon henüz başlamadı.";
  if (coupon.endsAt && t > Date.parse(coupon.endsAt)) return "Bu kuponun süresi doldu.";
  if (coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses)
    return "Bu kuponun kullanım sınırı doldu.";
  if (coupon.minOrder && subtotal < coupon.minOrder)
    return `Bu kupon ${coupon.minOrder.toLocaleString("tr-TR")} ₺ ve üzeri alışverişte geçerli.`;
  if (coupon.type === "ucretsizTeslimat" && type === "gelal") return "Bu kupon yalnızca eve teslim siparişlerinde geçerli.";
  if (phone) return couponPhoneProblem(db, coupon, phone);
  return null;
}

/**
 * Kuponun telefon başına kullanım sınırı. Yalnızca gerçek sipariş gönderiminde (createOrder, diğer doğrulamalardan sonra)
 * çağrılır; kimliksiz sepet teklifinde çağrılmaz (bir numaranın kuponu kullanıp kullanmadığı sızmasın).
 */
function couponPhoneProblem(db, coupon, phone) {
  if (!coupon || !coupon.perPhoneLimit || !phone) return null;
  const key = phoneKey(phone);
  const used = db.orders.filter((o) => o.couponCode === coupon.code && o.status !== "İptal" && phoneKey(o.customer.phone) === key).length;
  return used >= coupon.perPhoneLimit ? "Bu kuponu kullanım hakkınız doldu." : null;
}

function couponDiscount(coupon, subtotal) {
  if (!coupon) return 0;
  if (coupon.type === "yuzde") return round2(Math.min(subtotal, (subtotal * coupon.value) / 100));
  if (coupon.type === "tutar") return round2(Math.min(subtotal, coupon.value));
  return 0;
}

// Kalemleri birleştir (aynı ürün iki kez gelirse adetler toplanır)
function mergeItems(items) {
  const map = new Map();
  for (const it of Array.isArray(items) ? items.slice(0, RULES.ITEMS_MAX + 1) : []) {
    if (!it || typeof it !== "object") continue;
    const id = Number(it.productId);
    const qty = Math.floor(Number(it.qty));
    if (!Number.isInteger(id)) continue;
    map.set(id, (map.get(id) || 0) + (Number.isFinite(qty) ? qty : 0));
  }
  return [...map.entries()].map(([productId, qty]) => ({ productId, qty }));
}

/**
 * Sepet teklifi. Hata fırlatmaz; sorunları errors/warnings/removed/adjusted içinde bildirir.
 * input: { items:[{productId, qty}], type, zoneId, couponCode, phone }
 */
function quote(db, input, { now = new Date(), status = null } = {}) {
  const s = db.settings;
  const ord = s.ordering;
  const hiddenCats = hiddenCategoryIds(db);
  const type = input.type === "gelal" ? "gelal" : "teslimat";
  const errors = [];
  const warnings = [];
  const removed = [];
  const adjusted = [];
  const lines = [];

  const merged = mergeItems(input.items);
  if (merged.length > RULES.ITEMS_MAX) errors.push({ code: "COK_KALEM", message: "Sepette çok fazla ürün çeşidi var." });
  for (const it of merged.slice(0, RULES.ITEMS_MAX)) {
    const p = db.products.find((x) => x.id === it.productId);
    if (!isVisible(p, hiddenCats)) {
      removed.push({ productId: it.productId, name: p ? p.name : null, code: "SATISTA_DEGIL", reason: "Ürün artık satışta değil." });
      continue;
    }
    if (isSoldOut(p)) {
      removed.push({ productId: p.id, name: p.name, code: "TUKENDI", reason: `"${p.name}" tükendi.` });
      continue;
    }
    if (!(it.qty > 0)) {
      removed.push({ productId: p.id, name: p.name, code: "GECERSIZ_ADET", reason: "Geçersiz adet." });
      continue;
    }
    const max = maxQtyFor(p);
    let qty = it.qty;
    if (qty > max) {
      const stockLimited = p.stock !== null && p.stock !== undefined && p.stock < Math.min(p.maxPerOrder || RULES.QTY_MAX, RULES.QTY_MAX);
      const why = stockLimited
        ? `"${p.name}" için stokta ${max} ${p.unit} var.`
        : `"${p.name}" için tek siparişte en fazla ${max} ${p.unit} alınabilir.`;
      adjusted.push({ productId: p.id, name: p.name, requested: qty, qty: max, code: "ADET_SINIRI", reason: why });
      qty = max;
    }
    lines.push({
      productId: p.id,
      name: p.name,
      brand: p.brand || "",
      unit: p.unit,
      price: p.price,
      oldPrice: p.oldPrice || null,
      qty,
      lineTotal: round2(p.price * qty),
      image: p.image || null,
      emoji: p.emoji || "",
      maxQty: max,
      // Ürün ürün cayma hakkı durumu (ön bilgilendirme özet kutusu; YASAL.md §2.1)
      caymaDurumu: caymaOf(p, db.categories),
      caymaLabel: caymaLabel(caymaOf(p, db.categories)),
      weighed: p.unit === "kg",
    });
  }
  for (const r of removed) warnings.push(r.reason);
  for (const a of adjusted) warnings.push(a.reason);
  if (!lines.length) errors.push({ code: "BOS_SEPET", message: "Sepetiniz boş." });

  const subtotal = round2(lines.reduce((t, l) => t + l.lineTotal, 0));

  // Bölge
  let zone = null;
  if (type === "teslimat") {
    if (input.zoneId === undefined || input.zoneId === null || input.zoneId === "") {
      errors.push({ code: "BOLGE_SECIN", message: "Teslimat bölgesini seçin." });
    } else {
      zone = s.zones.find((z) => z.id === Number(input.zoneId) && z.active) || null;
      if (!zone) errors.push({ code: "BOLGE_GECERSIZ", message: "Seçilen bölgeye şu an teslimat yapılmıyor." });
    }
  } else if (!ord.pickupEnabled) {
    errors.push({ code: "GELAL_KAPALI", message: "Şu an gel-al siparişi alınmıyor." });
  }

  // Kupon
  let coupon = null;
  let discount = 0;
  let couponFreeDelivery = false;
  const code = String(input.couponCode || "").trim().slice(0, 40);
  if (code) {
    const c = findCoupon(db, code);
    const problem = couponProblem(db, c, { subtotal, phone: input.phone, now, type });
    if (problem) {
      coupon = { code: code.toUpperCase(), valid: false, message: problem };
      warnings.push(problem);
    } else {
      discount = couponDiscount(c, subtotal);
      couponFreeDelivery = c.type === "ucretsizTeslimat";
      const label =
        c.type === "yuzde" ? `%${c.value} indirim` : c.type === "tutar" ? `${c.value.toLocaleString("tr-TR")} ₺ indirim` : "Ücretsiz teslimat";
      coupon = { code: c.code, type: c.type, value: c.value, valid: true, message: `${c.code} uygulandı: ${label}.` };
    }
  }

  // Teslimat ücreti ve minimum tutar (minimum yalnızca eve teslimde)
  let deliveryFee = 0;
  let baseFee = 0;
  let freeDeliveryRemaining = null;
  let minOrder = 0;
  if (type === "teslimat") {
    baseFee = zone && zone.fee !== null && zone.fee !== undefined ? zone.fee : ord.deliveryFee;
    deliveryFee = baseFee;
    if (ord.freeDeliveryOver !== null && ord.freeDeliveryOver !== undefined && baseFee > 0) {
      if (subtotal >= ord.freeDeliveryOver) deliveryFee = 0;
      else freeDeliveryRemaining = round2(ord.freeDeliveryOver - subtotal);
    }
    if (couponFreeDelivery) deliveryFee = 0;
    minOrder = zone && zone.minOrder !== null && zone.minOrder !== undefined ? zone.minOrder : ord.minOrder || 0;
  }
  const minOrderRemaining = lines.length && subtotal < minOrder ? round2(minOrder - subtotal) : 0;
  if (minOrderRemaining > 0)
    errors.push({
      code: "MIN_TUTAR",
      message: `Minimum sipariş tutarı ${minOrder.toLocaleString("tr-TR")} ₺. Sepetinize ${minOrderRemaining.toLocaleString("tr-TR")} ₺ daha ekleyin.`,
    });

  if (status && !status.acceptingOrders)
    errors.push({ code: status.paused ? "DURDURULDU" : "KAPALI", message: status.message });

  const total = round2(subtotal - discount + deliveryFee);
  const etaMinutes = (zone && zone.etaMinutes) || ord.etaMinutes;
  return {
    type,
    items: lines,
    removed,
    adjusted,
    zone: zone ? { id: zone.id, name: zone.name, slug: zone.slug } : null,
    subtotal,
    discount,
    coupon,
    deliveryFee,
    baseDeliveryFee: baseFee,
    freeDelivery: type === "teslimat" && baseFee > 0 && deliveryFee === 0,
    freeDeliveryOver: type === "teslimat" ? ord.freeDeliveryOver : null,
    freeDeliveryRemaining: deliveryFee > 0 ? freeDeliveryRemaining : null,
    minOrder,
    minOrderRemaining,
    total,
    etaMinutes,
    preorder: !!(status && status.preorder),
    hasWeighed: lines.some((l) => l.unit === "kg"),
    canOrder: errors.length === 0,
    errors,
    warnings,
  };
}

module.exports = { quote, isSoldOut, maxQtyFor, isVisible, hiddenCategoryIds, findCoupon, couponProblem, couponPhoneProblem, couponDiscount, mergeItems };
