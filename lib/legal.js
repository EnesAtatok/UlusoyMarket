"use strict";
// Yasal belgeler ve onay kaydı: belge metinleri (settings.legal.docs), sürüm özetleri (SHA-256), onay kutuları
// (settings.legal.consents), sipariş anındaki onay kaydı, onaylanan metinlerin arşivi (db.legalArchive) ve
// "bu siparişin sözleşmesi" metninin sipariş verileriyle doldurulması. Metin ve onay listesi: docs/YASAL.md.

const crypto = require("crypto");
const { LEGAL_TEMPLATES, TEMPLATE_DATE, CHECKOUT_TEXTS } = require("./defaults");
const { fail, formatTL, isPlainObject, escapeHtml: esc, clone } = require("./util");
const { TIMEZONE, hoursSummary } = require("./hours");
const { caymaLabel } = require("./cayma");

const TYPE_LABEL = { teslimat: "Eve teslim", gelal: "Gel-al (mağazadan teslim)" };
const DELIVERY_LABEL = { teslimat: "Adrese teslim (kurye)", gelal: "Dükkândan teslim (gel-al)" };
const PAYMENT_LABEL = { nakit: "Kapıda nakit", kart: "Kapıda kredi/banka kartı" };
const PAYMENT_SHORT = { nakit: "kapıda nakit", kart: "kapıda kredi/banka kartı" };
const SUBST_LABEL = { ara: "Beni arayın", benzer: "Benzeriyle (muadil) değiştirin", cikar: "Siparişten çıkarın" };

// Siparişe özel yer tutucular (eş anlamlılar dahil). Sipariş dışında (genel yasal sayfada) köşeli parantezli açıklama gösterilir.
const ORDER_PLACEHOLDERS = {
  siparisNo: "sipariş numarası",
  tarih: "sipariş tarihi",
  siparisTarihi: "sipariş tarihi",
  onayTarihi: "onay tarihi",
  aliciAd: "alıcının adı soyadı",
  aliciAdi: "alıcının adı soyadı",
  aliciTelefon: "alıcının telefonu",
  teslimatAdresi: "teslimat adresi",
  teslimatBolgesi: "teslimat bölgesi",
  teslimatSekli: "teslimat şekli",
  teslimatTuru: "teslimat şekli",
  odemeSekli: "ödeme şekli",
  odemeYontemi: "ödeme şekli",
  urunTablosu: "sipariş edilen ürünler, miktar, fiyat ve cayma durumu",
  araToplam: "ara toplam",
  indirim: "indirim",
  teslimatUcreti: "teslimat ücreti",
  toplam: "toplam tutar",
  urunYoksa: "ürün bulunamazsa tercih",
  urunYoksaTercihi: "ürün bulunamazsa tercih",
  tahminiSure: "tahmini teslim süresi",
  tahminiTeslimSuresi: "tahmini teslim süresi",
  metinSurumu: "metin sürümü",
};
// Mağaza ayarlarından dolan yer tutucular (sürümü belirleyen metne girer)
const STORE_PLACEHOLDERS = [
  "unvan", "isletmeAdi", "magaza", "adres", "telefon", "eposta", "kep", "mersis", "vergiDairesi", "vergiNo", "meslekOdasi",
  "siteAdresi", "websitesi", "saklamaSuresi", "teslimatBolgeleri", "calismaSaatleri", "minTutar", "guncellemeTarihi",
];
// Boşsa bulunduğu "Etiket: {{x}}" parçası metinden çıkarılan alanlar (şahıs esnafında MERSİS/KEP yok; YASAL.md §5)
const OPTIONAL = ["mersis", "kep", "meslekOdasi"];

const DATE_FMT = new Intl.DateTimeFormat("tr-TR", { timeZone: TIMEZONE, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const DAY_FMT = new Intl.DateTimeFormat("tr-TR", { timeZone: TIMEZONE, day: "numeric", month: "long", year: "numeric" });
const fmtDate = (iso) => (iso ? DATE_FMT.format(new Date(iso)) : "");

function retentionText(days) {
  if (!days) return "ilgili mevzuatta öngörülen süreler";
  const years = days / 365;
  return Number.isInteger(years) ? `${years} yıl` : `${days} gün`;
}
const etaText = (min) => (min ? `yaklaşık ${min} dakika` : "sipariş onayında bildirilen süre");

function storePlaceholders(settings, baseUrl, doc) {
  const s = settings;
  const v = (x) => (x && String(x).trim() ? String(x).trim() : "[…]");
  const site = v(String(baseUrl || "").replace(/^https?:\/\//, ""));
  const zones = (s.zones || []).filter((z) => z.active).map((z) => z.name);
  const updated = doc && doc.text && doc.updatedAt ? doc.updatedAt : TEMPLATE_DATE;
  // Mağaza değerleri ikinci geçişte (siparişe özel doldurma) yer tutucu sayılmasın: "{{" görünmez bir karakterle bölünür
  // (ör. unvana "{{aliciTelefon}}" yazılırsa sözleşmeye müşterinin telefonu girmesin)
  return neutralize({
    unvan: v(s.legal.companyTitle || ""),
    isletmeAdi: v(s.store.name),
    magaza: v(s.store.name),
    adres: v(s.store.address),
    telefon: v(s.store.phone),
    eposta: v(s.store.email),
    kep: v(s.legal.kep),
    mersis: v(s.legal.mersis),
    vergiDairesi: v(s.legal.taxOffice),
    vergiNo: v(s.legal.taxNo),
    meslekOdasi: v(s.legal.chamber),
    siteAdresi: site,
    websitesi: site,
    saklamaSuresi: retentionText(s.privacy && s.privacy.retentionDays),
    teslimatBolgeleri: zones.length ? zones.join(", ") : "[…]",
    calismaSaatleri: hoursSummary(s.hours).map((h) => `${h.days} ${h.text}`).join(", "),
    minTutar: formatTL(s.ordering.minOrder || 0),
    guncellemeTarihi: DAY_FMT.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(updated) ? `${updated}T12:00:00Z` : updated)),
  });
}
function neutralize(map) {
  for (const k of Object.keys(map)) map[k] = String(map[k]).replace(/\{\{/g, "{⁠{");
  return map;
}

function fill(text, map) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : m));
}

// Boş isteğe bağlı alanların "Etiket: {{alan}}" parçalarını çıkarır ("· KEP: {{kep}}", "; KEP: {{kep}}")
function dropEmptyOptional(text, settings) {
  const val = { mersis: settings.legal.mersis, kep: settings.legal.kep, meslekOdasi: settings.legal.chamber };
  let out = String(text);
  // Şirkette MERSİS ve KEP zorunlu: boşsa satır kalır ve "[…]" görünür (eksik olduğu belli olsun)
  const required = settings.legal.businessType === "sirket" ? ["mersis", "kep"] : [];
  for (const k of OPTIONAL) {
    if (required.includes(k)) continue;
    if (val[k] && String(val[k]).trim()) continue;
    // "Etiket: {{k}}" ve "Etiket ({{k}})" biçimleri; satır/parça başında ayraç yoksa sonraki ayraç da temizlenir
    const label = "[^\\s·;,()\\n:\\-][^·;,()\\n:\\-]{0,59}";
    for (const re of [new RegExp(`(\\s*[·;,]\\s*)?${label}:\\s*\\{\\{${k}\\}\\}`, "g"), new RegExp(`(\\s*[·;,]\\s*)?${label}\\s\\(\\{\\{${k}\\}\\}\\)`, "g")]) {
      out = out.replace(re, (m, sep) => (sep ? "" : "\u0000"));
    }
    out = out.replace(/\u0000\s*[·;,]\s*/g, "").replace(/\u0000/g, "");
  }
  // İçi boşalan madde satırları atılır
  return out
    .split("\n")
    .filter((l) => !/^\s*-\s*$/.test(l))
    .join("\n");
}

/** Sipariş dışında gösterilen metin: siparişe özel yer tutucular açıklamayla (tahmini süre genel ayardan) değişir */
function genericFill(text, settings, version) {
  const map = {};
  for (const [k, label] of Object.entries(ORDER_PLACEHOLDERS)) map[k] = `[${label}]`;
  if (settings) map.tahminiTeslimSuresi = map.tahminiSure = etaText(settings.ordering.etaMinutes);
  if (version) map.metinSurumu = version.slice(0, 12);
  return fill(text, map);
}

// ---------- Belgeler ----------
const docList = (settings) => (Array.isArray(settings.legal.docs) ? settings.legal.docs : []);
const marketingOn = (settings) => !!(settings.privacy && settings.privacy.marketingConsent);
/** Yayımdaki belge mi (pasif ya da pazarlama kapalıyken pazarlama belgesi değil) */
const docVisible = (settings, d) => d.active !== false && (!d.marketing || marketingOn(settings));
const findDoc = (settings, key) => docList(settings).find((d) => d.key === key) || null;

/** Belgenin ham metni (özel metin boşsa varsayılan şablon) */
function rawText(doc) {
  if (doc.text && String(doc.text).trim()) return String(doc.text);
  // Yalnızca kendi şablonları ("constructor" gibi devralınan adlar değil)
  return Object.prototype.hasOwnProperty.call(LEGAL_TEMPLATES, doc.key) ? LEGAL_TEMPLATES[doc.key] : "";
}
/** Mağaza bilgileriyle doldurulmuş, siparişe özel yer tutucuları duran metin (sürümü belirleyen metin budur) */
function storeText(settings, doc, baseUrl) {
  return fill(dropEmptyOptional(rawText(doc), settings), storePlaceholders(settings, baseUrl, doc));
}
const versionOf = (title, text) => crypto.createHash("sha256").update(`${title}\n\n${text}`, "utf8").digest("hex");

/** Güncel belgeler: [{ key, title, path, lead, text, version }]. all: pasif/pazarlama belgeleri de */
function currentDocs(settings, baseUrl, { all = false } = {}) {
  return docList(settings)
    .filter((d) => all || docVisible(settings, d))
    .map((d) => {
      const text = storeText(settings, d, baseUrl);
      return { key: d.key, title: d.title, path: d.path, lead: d.lead || "", text, version: versionOf(d.title, text) };
    });
}

// "[metin](anahtar)" → parçalar
const LINK_RE = /\[([^\]\n]{1,200})\]\(([A-Za-z][A-Za-z0-9-]{0,39})\)/g;
function labelParts(label, docsByKey) {
  const parts = [];
  let last = 0;
  let m;
  const s = String(label || "");
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(s))) {
    if (m.index > last) parts.push({ text: s.slice(last, m.index) });
    const d = docsByKey.get(m[2]);
    parts.push(d ? { text: m[1], doc: d.key, href: d.path } : { text: m[1] });
    last = LINK_RE.lastIndex;
  }
  if (last < s.length) parts.push({ text: s.slice(last) });
  return parts;
}
const labelPlain = (label) => String(label || "").replace(LINK_RE, "$1");
// Onay metnindeki mağaza yer tutucuları ({{isletmeAdi}} vb.)
const labelFill = (settings, label) => fill(label, { isletmeAdi: settings.store.name, magaza: settings.store.name, unvan: settings.legal.companyTitle || settings.store.name });

/** Sipariş formunda gösterilen onaylar: aktif; pazarlama onayı yalnızca ayar açıkken */
function activeConsents(settings) {
  return (Array.isArray(settings.legal.consents) ? settings.legal.consents : [])
    .filter((c) => c.active && (!c.marketing || marketingOn(settings)))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** /api/store için: belgeler (metinsiz, sürümlü) + gösterilecek onay kutuları + ödeme yükümlülüğü metinleri */
function publicLegal(settings, baseUrl) {
  const docs = currentDocs(settings, baseUrl);
  const byKey = new Map(docs.map((d) => [d.key, d]));
  return {
    docs: docs.map(({ key, title, path, lead, version }) => ({ key, title, path, lead, version })),
    consents: activeConsents(settings).map((c) => {
      const label = labelFill(settings, c.label);
      return {
        key: c.key,
        label,
        text: labelPlain(label),
        labelParts: labelParts(label, byKey),
        required: !!c.required,
        docs: c.docs.filter((k) => byKey.has(k)),
        order: c.order || 0,
      };
    }),
  };
}

/** Ödeme yükümlülüğü bildirimi (düğmenin hemen üstü; YASAL.md §2.3) */
function paymentNotice(total, payment, type) {
  const t = type === "gelal" ? CHECKOUT_TEXTS.paymentNoticePickup : CHECKOUT_TEXTS.paymentNotice;
  const pay = type === "gelal" ? (payment === "kart" ? "kredi/banka kartı" : "nakit") : PAYMENT_SHORT[payment] || PAYMENT_SHORT.nakit;
  return fill(t, { toplam: formatTL(total), odemeSekli: pay });
}

// ---------- Siparişte onay ----------
function acceptedKeys(body) {
  const c = body && body.consents;
  if (Array.isArray(c)) return new Set(c.filter((x) => typeof x === "string").map((x) => x.slice(0, 40)));
  if (isPlainObject(c)) return new Set(Object.keys(c).filter((k) => c[k] === true));
  return new Set();
}

/**
 * Sipariş gövdesindeki onayları denetler. Eksik zorunlu onayda 400 ONAY (missing: [anahtarlar]).
 * docVersions ({ anahtar: sürüm }) gönderildiyse ve güncel sürümle tutmuyorsa 409 METIN_DEGISTI.
 * Gösterilmeyen (pasif / pazarlama kapalı) onaylar gönderilse de kaydedilmez.
 */
function checkConsents(settings, body, baseUrl) {
  const accepted = acceptedKeys(body);
  const list = activeConsents(settings);
  const missing = list.filter((c) => c.required && !accepted.has(c.key));
  if (missing.length) {
    fail(400, `Devam etmek için şu onayları verin: ${missing.map((c) => labelPlain(labelFill(settings, c.label))).join(" ")}`.slice(0, 900), "ONAY", { missing: missing.map((c) => c.key) });
  }
  const docs = currentDocs(settings, baseUrl);
  const byKey = new Map(docs.map((d) => [d.key, d]));
  if (isPlainObject(body.docVersions)) {
    const stale = Object.entries(body.docVersions).filter(([k, v]) => byKey.has(k) && byKey.get(k).version !== v).map(([k]) => k);
    if (stale.length)
      fail(409, "Yasal metinler siz sayfadayken güncellendi. Lütfen sayfayı yenileyip onayları tekrar verin.", "METIN_DEGISTI", {
        stale,
        docs: docs.map(({ key, version }) => ({ key, version })),
      });
  }
  return {
    accepted: list.filter((c) => accepted.has(c.key)).map((c) => ({
      key: c.key,
      label: labelPlain(labelFill(settings, c.label)),
      required: !!c.required,
      docs: c.docs.filter((k) => byKey.has(k)).map((k) => ({ key: k, title: byKey.get(k).title, version: byKey.get(k).version })),
    })),
    declined: list.filter((c) => !c.required && !accepted.has(c.key)).map((c) => c.key),
    docsByKey: byKey,
  };
}

function snapshotOf(order, etaMinutes) {
  return {
    type: order.type,
    payment: order.payment,
    changeFor: order.changeFor,
    substitution: order.substitution,
    zoneName: order.customer.zoneName || "",
    items: clone(order.items),
    subtotal: order.subtotal,
    discount: order.discount,
    couponCode: order.couponCode,
    deliveryFee: order.deliveryFee,
    total: order.total,
    preorder: !!order.preorder,
    etaMinutes: etaMinutes || null,
  };
}

/** Onay kaydını siparişe yazar, onaylanan metinleri arşive ekler (aynı sürüm bir kez saklanır) */
function recordConsent(db, order, check, { at, ip, etaMinutes }) {
  for (const c of check.accepted) {
    for (const d of c.docs) {
      if (!db.legalArchive[d.version]) {
        const cur = check.docsByKey.get(d.key);
        db.legalArchive[d.version] = { key: d.key, title: cur.title, text: cur.text, at };
      }
    }
  }
  order.consent = {
    at,
    ip: ip || "",
    accepted: check.accepted,
    declined: check.declined,
    // Sözleşmede gösterilen sipariş bilgileri onay anındaki hâliyle (kişisel veri içermez; ad/adres siparişin kendisinden gelir)
    snapshot: snapshotOf(order, etaMinutes),
  };
}

/**
 * Arşiv sınırsız büyümesin: bir siparişin onayladığı sürümler HİÇ silinmez; hiçbir siparişte onaylanmamış
 * "değiştirilen eski sürüm" kayıtlarından yalnızca en yeni `keep` tanesi tutulur (saat/adres her değiştiğinde
 * tüm belgelerin sürümü değişir). Dönüş: atılan kayıt sayısı.
 */
const ARCHIVE_KEEP_UNREFERENCED = 60;
function pruneArchive(db, keep = ARCHIVE_KEEP_UNREFERENCED) {
  const arch = db.legalArchive || {};
  const used = new Set();
  for (const o of db.orders || []) for (const c of (o.consent && o.consent.accepted) || []) for (const d of c.docs || []) used.add(d.version);
  const free = Object.entries(arch).filter(([h]) => !used.has(h)).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at)));
  let n = 0;
  for (const [h] of free.slice(keep)) {
    delete arch[h];
    n++;
  }
  return n;
}

function productTable(items) {
  if (!items.length) return "- [ürün yok]";
  return items
    .map((i) => {
      const qty = i.unit === "kg" ? `≈ ${i.qty} kg (tartılarak)` : `${i.qty} ${i.unit || "adet"}`;
      return `- ${i.name}${i.brand ? ` (${i.brand})` : ""} · Miktar: ${qty} · Birim fiyat (KDV dahil): ${formatTL(i.price)} · Tutar: ${formatTL(i.price * i.qty)} · Cayma: ${caymaLabel(i.caymaDurumu)}`;
    })
    .join("\n");
}

/** order: sipariş ya da önizleme için sipariş benzeri nesne { id, createdAt, customer, consent?, items, … } */
function orderPlaceholders(order) {
  const snap = (order.consent && order.consent.snapshot) || order;
  const c = order.customer || {};
  const items = Array.isArray(snap.items) ? snap.items : [];
  const anon = !!order.anonymizedAt;
  // Müşterinin yazdığı değer tek satıra indirilir: çok satırlı adres sözleşmede "## başlık" / madde olarak işlenmesin
  const val = (x, gone = "[silindi]") => (x ? String(x).replace(/\s*\n\s*/g, ", ") : anon ? gone : "[…]");
  const pay = `${PAYMENT_SHORT[snap.payment] || PAYMENT_SHORT.nakit}${snap.payment === "nakit" && snap.changeFor ? ` (${formatTL(snap.changeFor)} ile ödenecek)` : ""}`;
  const subst = SUBST_LABEL[snap.substitution] || SUBST_LABEL.ara;
  const map = {
    siparisNo: order.id ? String(order.id) : "[sipariş onaylanınca verilir]",
    siparisTarihi: fmtDate(order.createdAt),
    onayTarihi: fmtDate(order.consent && order.consent.at),
    aliciAdi: val(c.name),
    aliciTelefon: val(c.phone),
    teslimatAdresi: snap.type === "gelal" ? "Dükkândan teslim alınacak (gel-al)" : val(c.address),
    teslimatBolgesi: snap.zoneName || (snap.type === "gelal" ? "Gel-al" : "[…]"),
    teslimatSekli: DELIVERY_LABEL[snap.type] || DELIVERY_LABEL.teslimat,
    teslimatTuru: TYPE_LABEL[snap.type] || TYPE_LABEL.teslimat,
    odemeSekli: pay,
    odemeYontemi: pay,
    urunTablosu: productTable(items),
    araToplam: formatTL(snap.subtotal),
    indirim: snap.discount ? `${formatTL(snap.discount)}${snap.couponCode ? ` (${snap.couponCode})` : ""}` : formatTL(0),
    teslimatUcreti: snap.type === "gelal" ? "Yok (gel-al)" : formatTL(snap.deliveryFee),
    toplam: formatTL(snap.total),
    urunYoksa: subst,
    urunYoksaTercihi: subst,
    tahminiSure: etaText(snap.etaMinutes),
    tahminiTeslimSuresi: etaText(snap.etaMinutes),
  };
  map.tarih = map.siparisTarihi;
  map.aliciAd = map.aliciAdi;
  return map;
}

function renderForOrder(text, order, version) {
  return fill(text, { ...orderPlaceholders(order), metinSurumu: version ? version.slice(0, 12) : "" });
}

/**
 * Siparişin onayladığı belgeler, sipariş verileriyle doldurulmuş olarak (arşivdeki o anki sürümden).
 * Onay kaydı yoksa (panel siparişi, eski sipariş) documents boş döner.
 */
function orderDocuments(db, order) {
  const consent = order.consent || null;
  const documents = [];
  if (consent) {
    const seen = new Set();
    for (const c of consent.accepted || []) {
      for (const d of c.docs || []) {
        if (seen.has(d.version)) continue;
        seen.add(d.version);
        const arch = db.legalArchive[d.version];
        const text = arch ? renderForOrder(arch.text, order, d.version) : "";
        documents.push({ key: d.key, title: (arch && arch.title) || d.title, version: d.version, archived: !!arch, text, html: textToHtml(text) });
      }
    }
  }
  return {
    orderId: order.id,
    consent: consent ? { at: consent.at, ip: consent.ip || "", accepted: consent.accepted || [], declined: consent.declined || [] } : null,
    documents,
  };
}

/** Sipariş vermeden önce: sepete ve form bilgilerine göre doldurulmuş belgeler (ön bilgilendirme, sözleşme vb.) */
function previewDocuments(settings, baseUrl, pseudoOrder, keys) {
  const docs = currentDocs(settings, baseUrl).filter((d) => !keys || keys.includes(d.key));
  return docs.map((d) => {
    const text = renderForOrder(d.text, pseudoOrder, d.version);
    return { key: d.key, title: d.title, version: d.version, text, html: textToHtml(text) };
  });
}

// Basit metin biçimi → HTML ("## " ara başlık, "- " madde, boş satır paragraf, **kalın**). Her şey kaçışlanır.
const inline = (s) => esc(s).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
function textToHtml(text) {
  const blocks = String(text || "").replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let para = [];
    let list = [];
    const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
    const flushList = () => { if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`); list = []; };
    for (const line of lines) {
      if (line.startsWith("## ")) { flushPara(); flushList(); out.push(`<h2>${inline(line.slice(3))}</h2>`); }
      else if (/^[-•] /.test(line)) { flushPara(); list.push(line.slice(2)); }
      else { flushList(); para.push(line); }
    }
    flushPara();
    flushList();
  }
  return out.join("\n");
}

module.exports = {
  ORDER_PLACEHOLDERS,
  STORE_PLACEHOLDERS,
  PAYMENT_LABEL,
  storePlaceholders,
  fill,
  genericFill,
  findDoc,
  docVisible,
  rawText,
  storeText,
  versionOf,
  currentDocs,
  labelParts,
  labelPlain,
  activeConsents,
  publicLegal,
  paymentNotice,
  checkConsents,
  recordConsent,
  pruneArchive,
  ARCHIVE_KEEP_UNREFERENCED,
  orderPlaceholders,
  orderDocuments,
  previewDocuments,
  renderForOrder,
  textToHtml,
};
