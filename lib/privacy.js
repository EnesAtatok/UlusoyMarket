"use strict";
// En az veri: saklama süresi sonunda otomatik anonimleştirme, tek müşterinin verisini dışa aktarma / anonimleştirme.
// Anonimleştirmede ad, telefon, adres, notlar, müşteri iptal nedeni ve onay kaydındaki IP silinir;
// tutarlar, kalemler, bölge adı, durum geçmişi (zamanlar) ve onaylanan metin sürümleri kalır.

const V = require("./validate");
const { phoneKey } = require("./util");

const DONE = ["Teslim edildi", "İptal"];
const ANON_NAME = "Anonim";

function anonymizeOrder(o, now = new Date()) {
  if (o.anonymizedAt) return false;
  o.customer = { name: ANON_NAME, phone: "", address: "", zoneId: o.customer ? o.customer.zoneId : null, zoneName: o.customer ? o.customer.zoneName || "" : "" };
  o.note = "";
  o.adminNote = "";
  o.cancelNote = "";
  o.changeFor = o.changeFor === undefined ? null : o.changeFor;
  if (Array.isArray(o.history)) for (const h of o.history) if (h && h.by === "musteri" && h.note) delete h.note;
  if (o.consent && typeof o.consent === "object") o.consent.ip = "";
  if (Array.isArray(o.returnRequests)) for (const r of o.returnRequests) { r.message = ""; if (r.adminNote) r.adminNote = ""; }
  // Teyit notları personelin serbest metni: kişisel veri içerebilir ("eşi açtı" vb.)
  if (Array.isArray(o.confirmations)) for (const c of o.confirmations) if (c && c.note) delete c.note;
  o.anonymizedAt = now.toISOString();
  return true;
}

/** Saklama süresi dolan tamamlanmış/iptal siparişleri anonimleştirir. Dönüş: anonimleştirilen sipariş sayısı */
function runRetention(db, now = new Date()) {
  const days = db.settings.privacy && db.settings.privacy.retentionDays;
  if (!days) return 0;
  const limit = now.getTime() - days * 86400000;
  let n = 0;
  for (const o of db.orders) {
    if (o.anonymizedAt || !DONE.includes(o.status)) continue;
    if (Date.parse(o.createdAt) < limit && anonymizeOrder(o, now)) n++;
  }
  return n;
}

function ordersOfPhone(db, phone) {
  const key = phoneKey(phone);
  if (key.length !== 10) return [];
  return db.orders.filter((o) => phoneKey(o.customer.phone) === key);
}

/** Müşterinin tamamlanmış/iptal siparişlerini anonimleştirir; aktif siparişler atlanır */
function anonymizeCustomer(db, phone, now = new Date()) {
  const skipped = [];
  let processed = 0;
  for (const o of ordersOfPhone(db, phone)) {
    if (V.ACTIVE_STATUSES.includes(o.status)) {
      skipped.push({ id: o.id, reason: `"${o.status}" durumundaki sipariş anonimleştirilemez; önce tamamlayın ya da iptal edin.` });
      continue;
    }
    if (anonymizeOrder(o, now)) processed++;
  }
  return { processed, skipped };
}

/** Arşiv eşiğini geçmiş tamamlanmış/iptal sipariş mi (personel kişisel verisini göremez) */
function isArchived(o, settings, now = new Date()) {
  const days = settings.privacy && settings.privacy.archiveDays;
  if (!days || o.anonymizedAt || !DONE.includes(o.status)) return false;
  return Date.parse(o.createdAt) < now.getTime() - days * 86400000;
}

/** Personele gösterilecek maskeli kopya (asıl kayda dokunmaz) */
function maskOrder(o) {
  return {
    ...o,
    // Takip anahtarı da gizlenir: anahtarla açılan takip/sözleşme sayfası ad, telefon ve adresi gösterir
    token: "",
    customer: { ...o.customer, name: "Arşivlenmiş sipariş", phone: "", address: "" },
    note: o.note ? "[arşivde — yalnızca yönetici]" : "",
    adminNote: o.adminNote ? "[arşivde — yalnızca yönetici]" : "",
    cancelNote: o.cancelNote ? "[arşivde — yalnızca yönetici]" : "",
    history: (o.history || []).map((h) => (h && h.by === "musteri" && h.note ? { ...h, note: "[arşivde]" } : h)),
    consent: o.consent ? { ...o.consent, ip: "" } : o.consent,
    returnRequests: (o.returnRequests || []).map((r) => ({ ...r, message: r.message ? "[arşivde]" : "", adminNote: r.adminNote ? "[arşivde]" : r.adminNote })),
    confirmations: (o.confirmations || []).map((c) => (c && c.note ? { ...c, note: "[arşivde]" } : c)),
    archived: true,
    masked: true,
  };
}

module.exports = { anonymizeOrder, runRetention, ordersOfPhone, anonymizeCustomer, isArchived, maskOrder, ANON_NAME, DONE };
