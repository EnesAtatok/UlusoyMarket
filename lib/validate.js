"use strict";
// Giriş doğrulamaları. Hatalarda HttpError (400) fırlatır; başarılıysa temizlenmiş değeri döner.

const { fail, cleanText, normalizePhone, parseNumber, round2, slugify, isPlainObject, nextId } = require("./util");

// Sipariş formu kuralları (istemcide de aynı kurallar uygulanır)
const TR = "A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû";
const RULES = {
  NAME_MAX: 60,
  ADDR_MIN: 10,
  ADDR_MAX: 250,
  ADDR_MAX_LINES: 5,
  NOTE_MAX: 300,
  CANCEL_NOTE_MAX: 300,
  ADMIN_NOTE_MAX: 500,
  QTY_MAX: 99,
  ITEMS_MAX: 200,
};
const NAME_RE = new RegExp(`^[${TR}][${TR} .'-]+$`);
const ADDR_RE = new RegExp(`^[0-9${TR} .,:;/#'()\\n-]+$`);
const PHONE_RE = /^0\d{10}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = ["Yeni", "Hazırlanıyor", "Yolda", "Teslim edildi", "İptal"];
const ACTIVE_STATUSES = ["Yeni", "Hazırlanıyor", "Yolda"];

const bad = (msg) => fail(400, msg, "DOGRULAMA");

function customerName(v) {
  const name = String(v || "").trim().replace(/\s+/g, " ");
  if (name.length > RULES.NAME_MAX) bad(`Ad soyad en fazla ${RULES.NAME_MAX} karakter olabilir.`);
  if (!NAME_RE.test(name) || !/\S\s+\S/.test(name)) bad("Ad soyad yalnızca harflerden oluşmalı (örn. Ayşe Yılmaz).");
  return name;
}
function phone(v) {
  const p = normalizePhone(v);
  if (!PHONE_RE.test(p)) bad("Telefon 0 ile başlamalı ve 11 haneli olmalı (örn. 05321234567).");
  return p;
}
function address(v) {
  const a = String(v || "")
    .trim()
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n");
  if (a.length < RULES.ADDR_MIN) bad(`Lütfen açık adres girin (en az ${RULES.ADDR_MIN} karakter).`);
  if (a.length > RULES.ADDR_MAX) bad(`Adres en fazla ${RULES.ADDR_MAX} karakter olabilir.`);
  if (a.split("\n").length > RULES.ADDR_MAX_LINES) bad(`Adres en fazla ${RULES.ADDR_MAX_LINES} satır olabilir.`);
  if (!ADDR_RE.test(a)) bad("Adreste izin verilmeyen karakter var.");
  return a;
}
function note(v, max = RULES.NOTE_MAX, label = "Not") {
  const t = cleanText(v, { multiline: true });
  if (t.length > max) bad(`${label} en fazla ${max} karakter olabilir.`);
  return t;
}

// Para tutarı: boş → null (izin verilirse), negatif olamaz
function money(v, label, { allowNull = false, min = 0, max = 1e7 } = {}) {
  if (v === null || v === undefined || v === "") {
    if (allowNull) return null;
    bad(`${label} girin.`);
  }
  const n = parseNumber(v);
  if (!Number.isFinite(n) || n < min || n > max) bad(`${label} geçerli bir tutar olmalı.`);
  return round2(n);
}
function int(v, label, { allowNull = false, min = 0, max = 1e9 } = {}) {
  if (v === null || v === undefined || v === "") {
    if (allowNull) return null;
    bad(`${label} girin.`);
  }
  const n = parseNumber(v);
  if (!Number.isInteger(n) || n < min || n > max) bad(`${label} ${min} ile ${max} arasında tam sayı olmalı.`);
  return n;
}
function bool(v, def = false) {
  if (typeof v === "boolean") return v;
  if (v === undefined || v === null) return def;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return def;
}
function str(v, max, label, { required = false, multiline = false } = {}) {
  const t = cleanText(v, { multiline });
  if (required && !t) bad(`${label} gerekli.`);
  if (t.length > max) bad(`${label} en fazla ${max} karakter olabilir.`);
  return t;
}
function url(v, label, { allowRelative = true } = {}) {
  const t = cleanText(v);
  if (!t) return "";
  if (t.length > 500) bad(`${label} çok uzun.`);
  if (/^https?:\/\/[^\s]+$/i.test(t)) return t;
  if (allowRelative && /^(\/(?!\/)|#)[^\s]*$/.test(t)) return t;
  bad(`${label} geçerli bir adres olmalı (https://… ya da / ile başlayan).`);
}
const CAYMA_VALUES = ["yok_cabuk_bozulan", "acilirsa_yok_hijyen", "var"];
function cayma(v, { allowNull = false } = {}) {
  if ((v === null || v === "") && allowNull) return null;
  if (!CAYMA_VALUES.includes(v)) bad(`Cayma durumu ${CAYMA_VALUES.join(" / ")}${allowNull ? " ya da boş (kategoriden)" : ""} olmalı.`);
  return v;
}
function imageUrl(v, label = "Görsel") {
  if (v === null || v === undefined || v === "") return null;
  const t = String(v).trim();
  if (/^\/(uploads|img)\/[A-Za-z0-9._\-/]+$/.test(t) && !t.includes("..")) return t;
  bad(`${label} için önce görsel yükleyin.`);
}

// ---------- Ayarlar ----------
function settingsStore(v) {
  if (!isPlainObject(v)) bad("Mağaza bilgileri geçersiz.");
  const phoneTxt = str(v.phone, 30, "Telefon");
  const wa = String(v.whatsapp || "").replace(/\D/g, "");
  if (wa && !/^\d{10,15}$/.test(wa)) bad("WhatsApp numarası ülke koduyla, yalnızca rakam olmalı (örn. 905321234567).");
  const email = str(v.email, 120, "E-posta");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad("E-posta adresi geçersiz.");
  return {
    name: str(v.name, 80, "Mağaza adı", { required: true }),
    slogan: str(v.slogan, 140, "Slogan"),
    phone: phoneTxt,
    whatsapp: wa,
    email,
    address: str(v.address, 300, "Adres"),
    city: str(v.city, 60, "Şehir"),
    district: str(v.district, 60, "İlçe"),
    postalCode: str(v.postalCode, 10, "Posta kodu"),
    mapsUrl: url(v.mapsUrl, "Harita bağlantısı", { allowRelative: false }),
    instagram: url(v.instagram, "Instagram adresi", { allowRelative: false }),
    about: str(v.about, 2000, "Hakkımızda", { multiline: true }),
  };
}
// Yasal belge sayfası adresi olarak kullanılamayacak yollar (sitenin kendi sayfaları ve dosya klasörleri)
const RESERVED_PATHS = new Set([
  "panel", "api", "teslimat", "hakkimizda", "healthz", "img", "js", "fonts", "uploads", "admin", "siparis", "index", "style", "app",
]);
const DOC_KEY_RE = /^[A-Za-z][A-Za-z0-9-]{1,39}$/;
const TEXT_KEYS = ["kvkk", "mesafeliSatis", "iade", "cerez"];

function legalDocs(v, prevDocs = []) {
  if (!Array.isArray(v) || !v.length) bad("En az bir yasal belge tanımlı olmalı.");
  if (v.length > 20) bad("En fazla 20 yasal belge tanımlanabilir.");
  const keys = new Set();
  const paths = new Set();
  return v.map((d) => {
    if (!isPlainObject(d)) bad("Yasal belge geçersiz.");
    const key = String(d.key || "").trim();
    if (!DOC_KEY_RE.test(key)) bad("Belge anahtarı harfle başlamalı; 2-40 harf, rakam ya da - olmalı.");
    if (keys.has(key)) bad(`Aynı belge anahtarı iki kez kullanılmış: ${key}`);
    keys.add(key);
    const title = str(d.title, 120, "Belge başlığı", { required: true });
    let p = String(d.path || "").trim().toLowerCase();
    if (!p) p = "/" + slugify(title);
    if (!p.startsWith("/")) p = "/" + p;
    if (!/^\/[a-z0-9][a-z0-9-]{1,59}$/.test(p)) bad(`"${title}" için sayfa adresi geçersiz (örn. /mesafeli-satis).`);
    if (RESERVED_PATHS.has(p.slice(1)) || /-(tekel|market|marketi)$/.test(p)) bad(`"${p}" adresi sitenin başka bir sayfası için ayrılmış.`);
    if (paths.has(p)) bad(`Aynı sayfa adresi iki belgede kullanılmış: ${p}`);
    paths.add(p);
    const text = str(d.text, 60000, `"${title}" metni`, { multiline: true });
    // Metin değişince güncelleme tarihi ({{guncellemeTarihi}}) yenilenir
    const prev = (prevDocs || []).find((x) => x && x.key === key);
    let updatedAt = prev ? prev.updatedAt || null : typeof d.updatedAt === "string" ? d.updatedAt : null;
    if (prev && (prev.text || "") !== text) updatedAt = new Date().toISOString();
    if (!prev && text) updatedAt = updatedAt || new Date().toISOString();
    return {
      key,
      title,
      path: p,
      lead: str(d.lead, 300, "Belge açıklaması"),
      text,
      active: bool(d.active, true),
      marketing: bool(d.marketing, false),
      updatedAt,
    };
  });
}
function legalConsents(v, docs) {
  if (!Array.isArray(v)) bad("Onay listesi geçersiz.");
  if (v.length > 20) bad("En fazla 20 onay kutusu tanımlanabilir.");
  const docKeys = new Set(docs.map((d) => d.key));
  const keys = new Set();
  return v.map((c, i) => {
    if (!isPlainObject(c)) bad("Onay kutusu geçersiz.");
    const key = String(c.key || "").trim();
    if (!DOC_KEY_RE.test(key)) bad("Onay anahtarı harfle başlamalı; 2-40 harf, rakam ya da - olmalı.");
    if (keys.has(key)) bad(`Aynı onay anahtarı iki kez kullanılmış: ${key}`);
    keys.add(key);
    const label = str(c.label, 500, "Onay metni", { required: true });
    const list = Array.isArray(c.docs) ? [...new Set(c.docs.map((x) => String(x)))] : [];
    for (const k of list) if (!docKeys.has(k)) bad(`"${key}" onayı olmayan bir belgeye bağlı: ${k.slice(0, 40)}`);
    const order = c.order === undefined || c.order === null || c.order === "" ? i + 1 : int(c.order, "Onay sırası", { min: 0, max: 1000 });
    const marketing = bool(c.marketing, false);
    const required = bool(c.required);
    if (marketing && required) bad("Pazarlama (ticari ileti) onayı zorunlu yapılamaz; hizmet bu izne bağlanamaz.");
    return { key, label, required, docs: list, order, active: bool(c.active, true), marketing };
  });
}
function settingsLegal(v, prev) {
  if (!isPlainObject(v)) bad("Yasal bilgiler geçersiz.");
  const docs = legalDocs(v.docs, prev && Array.isArray(prev.docs) ? prev.docs : []);
  const consents = legalConsents(v.consents === undefined ? [] : v.consents, docs);
  // Eski "texts" alanı belgelerden üretilir (eski panel sürümleri okuyabilsin)
  const texts = {};
  for (const k of TEXT_KEYS) {
    const d = docs.find((x) => x.key === k);
    texts[k] = d ? d.text : "";
  }
  const businessType = v.businessType === undefined || v.businessType === null ? "" : String(v.businessType);
  if (!["", "sahis", "sirket"].includes(businessType)) bad("İşletme türü şahıs ya da şirket olmalı.");
  return {
    businessType,
    companyTitle: str(v.companyTitle, 200, "Şirket unvanı"),
    taxOffice: str(v.taxOffice, 100, "Vergi dairesi"),
    taxNo: str(v.taxNo, 20, "Vergi numarası"),
    mersis: str(v.mersis, 30, "MERSİS numarası"),
    kep: str(v.kep, 120, "KEP adresi"),
    chamber: str(v.chamber, 200, "Meslek odası"),
    etbisNo: str(v.etbisNo, 60, "ETBİS kayıt numarası"),
    texts,
    docs,
    consents,
  };
}
function settingsPrivacy(v) {
  if (!isPlainObject(v)) bad("Gizlilik ayarları geçersiz.");
  const out = {
    retentionDays: int(v.retentionDays, "Anonimleştirme süresi (gün)", { allowNull: true, min: 30, max: 7300 }),
    archiveDays: int(v.archiveDays, "Arşiv eşiği (gün)", { allowNull: true, min: 1, max: 7300 }),
    phoneLookup: bool(v.phoneLookup, false),
    marketingConsent: bool(v.marketingConsent, false),
  };
  if (out.retentionDays && out.archiveDays && out.archiveDays > out.retentionDays) bad("Arşiv eşiği anonimleştirme süresinden uzun olamaz.");
  return out;
}
function settingsHours(v) {
  if (!isPlainObject(v) || !Array.isArray(v.days) || v.days.length !== 7) bad("Çalışma saatleri 7 gün için girilmeli.");
  return {
    days: v.days.map((d, i) => {
      if (!isPlainObject(d)) bad("Çalışma saatleri geçersiz.");
      const closed = bool(d.closed);
      const open = String(d.open || "").trim();
      const close = String(d.close || "").trim();
      if (!HHMM_RE.test(open) || !HHMM_RE.test(close))
        bad(`${["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"][i]} için saatler SS:DD biçiminde olmalı (örn. 14:00).`);
      return { open, close, closed };
    }),
  };
}
function settingsOrdering(v) {
  if (!isPlainObject(v)) bad("Sipariş ayarları geçersiz.");
  const payments = isPlainObject(v.payments) ? v.payments : {};
  const out = {
    enabled: bool(v.enabled, true),
    pausedMessage: str(v.pausedMessage, 300, "Durdurma mesajı"),
    allowPreorder: bool(v.allowPreorder),
    minOrder: money(v.minOrder ?? 0, "Minimum sipariş tutarı"),
    deliveryFee: money(v.deliveryFee ?? 0, "Teslimat ücreti"),
    freeDeliveryOver: money(v.freeDeliveryOver, "Ücretsiz teslimat eşiği", { allowNull: true }),
    etaMinutes: int(v.etaMinutes ?? 30, "Tahmini teslimat süresi", { min: 5, max: 600 }),
    pickupEnabled: bool(v.pickupEnabled, true),
    payments: { nakit: bool(payments.nakit, true), kart: bool(payments.kart, true) },
    maxActiveOrdersPerPhone: int(v.maxActiveOrdersPerPhone ?? 3, "Telefon başına aktif sipariş sınırı", { min: 1, max: 50 }),
  };
  if (!out.payments.nakit && !out.payments.kart) bad("En az bir ödeme yöntemi açık olmalı.");
  return out;
}
function settingsZones(v, prev = []) {
  if (!Array.isArray(v)) bad("Teslimat bölgeleri geçersiz.");
  if (v.length > 100) bad("En fazla 100 teslimat bölgesi tanımlanabilir.");
  const out = [];
  const slugs = new Set();
  for (const z of v) {
    if (!isPlainObject(z)) bad("Teslimat bölgesi geçersiz.");
    const name = str(z.name, 80, "Bölge adı", { required: true });
    let slug = slugify(z.slug || name) || "bolge";
    let base = slug;
    for (let i = 2; slugs.has(slug); i++) slug = `${base}-${i}`;
    slugs.add(slug);
    let id = Number(z.id);
    if (!Number.isInteger(id) || id <= 0 || out.some((x) => x.id === id)) id = null;
    out.push({
      id,
      name,
      slug,
      fee: money(z.fee, `"${name}" teslimat ücreti`, { allowNull: true }),
      minOrder: money(z.minOrder, `"${name}" minimum tutarı`, { allowNull: true }),
      etaMinutes: int(z.etaMinutes, `"${name}" tahmini süresi`, { allowNull: true, min: 5, max: 600 }),
      active: bool(z.active, true),
    });
  }
  // Yeni bölgelere kimlik ver (silinmiş eski kimlikler tekrar kullanılmaz)
  let n = Math.max(nextId(out.filter((z) => z.id)), nextId(prev));
  for (const z of out) if (!z.id) z.id = n++;
  return out;
}
function settingsAnnouncement(v) {
  if (!isPlainObject(v)) bad("Duyuru geçersiz.");
  return { text: str(v.text, 300, "Duyuru metni"), active: bool(v.active) };
}
function settingsBanners(v, prev = []) {
  if (!Array.isArray(v)) bad("Afişler geçersiz.");
  if (v.length > 20) bad("En fazla 20 afiş eklenebilir.");
  const out = v.map((b) => {
    if (!isPlainObject(b)) bad("Afiş geçersiz.");
    let id = Number(b.id);
    if (!Number.isInteger(id) || id <= 0) id = null;
    return {
      id,
      title: str(b.title, 100, "Afiş başlığı"),
      text: str(b.text, 300, "Afiş metni"),
      image: imageUrl(b.image, "Afiş görseli"),
      link: url(b.link, "Afiş bağlantısı"),
      active: bool(b.active, true),
    };
  });
  const seen = new Set();
  let n = Math.max(nextId(out.filter((b) => b.id)), nextId(prev));
  for (const b of out) {
    if (!b.id || seen.has(b.id)) b.id = n++;
    seen.add(b.id);
    if (!b.title && !b.text && !b.image) bad("Afişte başlık, metin ya da görselden en az biri olmalı.");
  }
  return out;
}
function settingsFaq(v) {
  if (!Array.isArray(v)) bad("SSS geçersiz.");
  if (v.length > 50) bad("En fazla 50 soru eklenebilir.");
  return v.map((f) => {
    if (!isPlainObject(f)) bad("SSS geçersiz.");
    return { q: str(f.q, 200, "Soru", { required: true }), a: str(f.a, 2000, "Cevap", { required: true, multiline: true }) };
  });
}
function settingsNotify(v) {
  if (!isPlainObject(v)) bad("Bildirim ayarları geçersiz.");
  const token = String(v.telegramBotToken || "").trim();
  if (token && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) bad("Telegram bot anahtarı geçersiz görünüyor (örn. 123456:ABC...).");
  const chat = String(v.telegramChatId || "").trim();
  if (chat && !/^(-?\d{1,20}|@[A-Za-z0-9_]{4,64})$/.test(chat)) bad("Telegram sohbet kimliği geçersiz (örn. 123456789 ya da -100...).");
  return { telegramBotToken: token, telegramChatId: chat, sound: bool(v.sound, true) };
}
function settingsBlocked(v) {
  if (!Array.isArray(v)) bad("Engelli numaralar listesi geçersiz.");
  const out = [];
  for (const p of v) {
    const n = normalizePhone(p);
    if (!PHONE_RE.test(n)) bad(`Engelli numara geçersiz: ${String(p).slice(0, 20)}`);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

const SETTINGS_SECTIONS = {
  store: settingsStore,
  legal: settingsLegal,
  hours: settingsHours,
  ordering: settingsOrdering,
  zones: settingsZones,
  announcement: settingsAnnouncement,
  banners: settingsBanners,
  faq: settingsFaq,
  notify: settingsNotify,
  blockedPhones: settingsBlocked,
  privacy: settingsPrivacy,
};

/**
 * Sipariş miktarı: kiloyla satılan üründe 100 gram hassasiyet (1,5 kg = 1 kg 500 g), diğerlerinde tam adet (aşağı yuvarlanır).
 * Sayı değilse NaN döner; sınır denetimini çağıran yapar.
 */
function qty(raw, unit) {
  const n = Number(typeof raw === "string" ? raw.replace(",", ".") : raw);
  if (!Number.isFinite(n)) return NaN;
  return unit === "kg" ? Math.round(n * 10) / 10 : Math.floor(n);
}
/** Kayıtlı miktar geçerli mi (≥ 0, en fazla 100 g hassasiyet) */
const isQty = (q) => typeof q === "number" && Number.isFinite(q) && q >= 0 && Math.abs(q * 10 - Math.round(q * 10)) < 1e-6;

module.exports = {
  RULES,
  qty,
  isQty,
  STATUSES,
  ACTIVE_STATUSES,
  PHONE_RE,
  customerName,
  phone,
  address,
  note,
  money,
  int,
  bool,
  str,
  url,
  imageUrl,
  cayma,
  CAYMA_VALUES,
  SETTINGS_SECTIONS,
};
