"use strict";
// Fiyat geçmişi ve "indirim öncesi fiyat" (Fiyat Etiketi Yönetmeliği m.11, RG 11/10/2025; YASAL.md §4.6):
// indirimden önceki fiyat = indirimin uygulandığı tarihten önceki 10 gün içinde uygulanan EN DÜŞÜK fiyat;
// meyve-sebze gibi çabuk bozulan ürünlerde bir önceki fiyat.

const { foldTr, formatTL, round2 } = require("./util");

const WINDOW_MS = 10 * 86400000;
const KEEP_MS = 45 * 86400000;

const isProduce = (product, categories) => {
  const c = (categories || []).find((x) => x.id === product.categoryId);
  return !!c && /(meyve|sebze)/.test(foldTr(c.name));
};

/** Fiyat değişikliğini kaydeder (dizi her seferinde yeniden oluşturulur; eski kayıtlar 45 günden sonra atılır, sonuncusu kalır) */
function recordPrice(p, price, at) {
  const list = Array.isArray(p.priceHistory) ? p.priceHistory.slice() : [];
  // Geçmişi olmayan ürün: değişiklikten önceki fiyat bilinen ilk kayıt olur (zamanı bilinmez → pencere başına konur)
  if (!list.length && typeof p.price === "number" && p.price !== price) list.push({ price: p.price, at: new Date(Date.parse(at) - WINDOW_MS).toISOString(), assumed: true });
  list.push({ price, at });
  const cutoff = Date.parse(at) - KEEP_MS;
  let firstKeep = list.findIndex((e) => Date.parse(e.at) >= cutoff);
  if (firstKeep === -1) firstKeep = list.length - 1;
  p.priceHistory = list.slice(Math.max(0, firstKeep - 1));
}

/**
 * changeAtMs anındaki indirim için başvuru fiyatı: o andan önceki 10 günde uygulanan en düşük fiyat
 * (meyve-sebzede bir önceki fiyat). Geçmiş bilinmiyorsa (kayıt yoksa) currentPrice döner.
 */
function referencePrice(p, changeAtMs, categories, currentPrice = p.price) {
  const hist = (Array.isArray(p.priceHistory) ? p.priceHistory : []).filter((e) => Date.parse(e.at) < changeAtMs);
  if (!hist.length) return typeof currentPrice === "number" ? currentPrice : null;
  if (isProduce(p, categories)) return hist[hist.length - 1].price;
  const from = changeAtMs - WINDOW_MS;
  // Pencere başında geçerli olan fiyat + pencere içindeki fiyatlar
  let startIdx = -1;
  for (let i = 0; i < hist.length; i++) if (Date.parse(hist[i].at) <= from) startIdx = i;
  const inWindow = hist.slice(Math.max(0, startIdx));
  return Math.min(...inWindow.map((e) => e.price));
}

/** Şu anki fiyatın (indirimin) başladığı an: son geçmiş kaydı; yoksa null */
function currentPriceSince(p) {
  const h = Array.isArray(p.priceHistory) ? p.priceHistory : [];
  const last = h[h.length - 1];
  return last && last.price === p.price ? Date.parse(last.at) : null;
}

/**
 * Fiyat/eski fiyat değişikliğini uygular. fields: doğrulanmış alanlar (price?, oldPrice?), oldPriceSent: istekte oldPrice var mı.
 * - Fiyat değişirse geçmişe yazılır.
 * - Fiyat düşerse (indirim) ve eski fiyat gönderilmediyse: oldPrice = son 10 günün en düşük fiyatı (yeni fiyattan yüksekse).
 * - Elle girilen oldPrice başvuru fiyatından yüksekse kayıt reddedilmez, uyarı döner.
 * Dönüş: { warnings: [metin], reference: sayı|null }
 */
function applyPriceChange(p, fields, { oldPriceSent, now = new Date(), categories } = {}) {
  const warnings = [];
  const at = now.toISOString();
  const nowMs = now.getTime();
  let reference = null;
  const newPrice = fields.price !== undefined ? fields.price : p.price;
  if (fields.price !== undefined && fields.price !== p.price) {
    reference = referencePrice(p, nowMs, categories, p.price);
    recordPrice(p, fields.price, at);
    if (!oldPriceSent && reference !== null && fields.price < reference) {
      fields.oldPrice = round2(reference);
    }
  } else {
    const since = currentPriceSince(p);
    reference = since !== null ? referencePrice(p, since, categories, null) : null;
  }
  const op = fields.oldPrice !== undefined ? fields.oldPrice : p.oldPrice;
  if (oldPriceSent && op && reference !== null && op > reference + 0.004 && op > newPrice) {
    warnings.push(
      `İndirim öncesi fiyat ${formatTL(op)} girildi; son 10 günde uygulanan en düşük fiyat ${formatTL(reference)}. Fiyat Etiketi Yönetmeliği m.11'e göre indirim öncesi fiyat olarak ${formatTL(reference)} gösterilmeli.`
    );
  }
  return { warnings, reference };
}

module.exports = { WINDOW_MS, recordPrice, referencePrice, applyPriceChange, isProduce };
