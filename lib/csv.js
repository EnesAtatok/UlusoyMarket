"use strict";
// CSV okuma/yazma (Excel TR uyumlu: UTF-8 BOM, ";" ayraç, virgüllü ondalık)

const { foldTr, parseNumber, round2, cleanText, allocId, idCounters, isPlainObject } = require("./util");
const { PRODUCT_DEFAULTS } = require("./db");
const { RULES } = require("./validate");

const BOM = "﻿";

// Formül enjeksiyonuna karşı (=, +, -, @ ile başlayan metinler Excel'de formül sayılır)
function safeText(v) {
  const s = String(v == null ? "" : v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
function cell(v) {
  const s = String(v == null ? "" : v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const num = (n) => (n === null || n === undefined || n === "" ? "" : String(round2(n)).replace(".", ","));
const yesNo = (b) => (b ? "Evet" : "Hayır");

function stringify(header, rows) {
  const lines = [header.map(cell).join(";")];
  for (const r of rows) lines.push(r.map(cell).join(";"));
  return BOM + lines.join("\r\n") + "\r\n";
}

// Tırnaklı alanları, satır içi satır sonlarını ve ";" / "," / tab ayracını destekler
function parse(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const counts = { ";": (firstLine.match(/;/g) || []).length, ",": (firstLine.match(/,/g) || []).length, "\t": (firstLine.match(/\t/g) || []).length };
  const sep = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ";";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

// ---------- Ürünler ----------
const PRODUCT_COLUMNS = [
  ["id", "ID"],
  ["barcode", "Barkod"],
  ["name", "Ürün adı"],
  ["brand", "Marka"],
  ["category", "Kategori"],
  ["price", "Fiyat"],
  ["oldPrice", "Eski fiyat"],
  ["unit", "Birim"],
  ["stock", "Stok"],
  ["maxPerOrder", "Sipariş başına en fazla"],
  ["soldOut", "Tükendi"],
  ["hidden", "Gizli"],
  ["featured", "Öne çıkan"],
  ["description", "Açıklama"],
  ["emoji", "Emoji"],
];
// İçe aktarmada tanınan başlık adları (Türkçe karakter/büyük harf duyarsız)
const HEADER_ALIASES = {
  id: ["id", "no", "urun no"],
  barcode: ["barkod", "barcode", "barkod no"],
  name: ["urun adi", "urun", "ad", "adi", "name", "isim"],
  brand: ["marka", "brand"],
  category: ["kategori", "category", "reyon"],
  price: ["fiyat", "satis fiyati", "price", "fiyat (tl)"],
  oldPrice: ["eski fiyat", "indirimsiz fiyat", "oldprice", "liste fiyati"],
  unit: ["birim", "unit"],
  stock: ["stok", "stock", "stok adedi"],
  maxPerOrder: ["siparis basina en fazla", "en fazla", "maxperorder", "max adet"],
  soldOut: ["tukendi", "soldout"],
  hidden: ["gizli", "hidden"],
  featured: ["one cikan", "featured", "one cikar"],
  description: ["aciklama", "description"],
  emoji: ["emoji"],
};

function productsToCsv(db) {
  const cats = new Map(db.categories.map((c) => [c.id, c.name]));
  const rows = db.products.map((p) => [
    p.id,
    safeText(p.barcode),
    safeText(p.name),
    safeText(p.brand),
    safeText(cats.get(p.categoryId) || ""),
    num(p.price),
    num(p.oldPrice),
    safeText(p.unit),
    p.stock === null || p.stock === undefined ? "" : p.stock,
    p.maxPerOrder || "",
    yesNo(p.soldOut),
    yesNo(p.hidden),
    yesNo(p.featured),
    safeText(p.description),
    safeText(p.emoji || ""),
  ]);
  return stringify(PRODUCT_COLUMNS.map((c) => c[1]), rows);
}

function parseBool(v) {
  const f = foldTr(v);
  if (["evet", "e", "1", "true", "var", "x"].includes(f)) return true;
  if (["hayir", "h", "0", "false", "yok", ""].includes(f)) return false;
  return null;
}
const unquoteText = (s) => cleanText(String(s).replace(/^'(?=[=+\-@])/, ""));

/**
 * CSV'den ürün içe aktarır. Barkod, yoksa ürün adıyla eşleşen ürünü günceller; eşleşme yoksa ekler.
 * Boş bırakılan / sütunu olmayan alanlar mevcut üründe değiştirilmez. Bilinmeyen kategori oluşturulur.
 * dryRun: true ise veriye dokunmadan ne olacağını raporlar.
 */
function importProducts(db, text, { dryRun = false } = {}) {
  const rows = parse(text);
  if (!rows.length) return { added: 0, updated: 0, unchanged: 0, createdCategories: [], errors: [{ row: 0, message: "Dosya boş." }], dryRun };
  const header = rows[0].map((h) => foldTr(h));
  const col = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = header.findIndex((h) => aliases.includes(h));
    if (idx >= 0) col[key] = idx;
  }
  if (col.name === undefined && col.barcode === undefined)
    return { added: 0, updated: 0, unchanged: 0, createdCategories: [], errors: [{ row: 1, message: "Başlık satırında \"Ürün adı\" ya da \"Barkod\" sütunu bulunamadı." }], dryRun };

  // Kuru çalıştırmada kopya üzerinde çalışılır
  const work = dryRun ? { categories: db.categories.map((c) => ({ ...c })), products: db.products.map((p) => ({ ...p })), meta: { idCounters: { ...idCounters(db) } } } : db;
  const result = { added: 0, updated: 0, unchanged: 0, createdCategories: [], errors: [], dryRun };
  const get = (r, key) => (col[key] === undefined ? undefined : String(r[col[key]] == null ? "" : r[col[key]]).trim());

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 1;
    try {
      const name = get(r, "name") !== undefined ? unquoteText(get(r, "name")) : undefined;
      const barcode = get(r, "barcode") !== undefined ? unquoteText(get(r, "barcode")) : undefined;
      let p = null;
      if (barcode) p = work.products.find((x) => x.barcode && x.barcode === barcode) || null;
      if (!p && name) p = work.products.find((x) => foldTr(x.name) === foldTr(name)) || null;

      const patch = {};
      if (name) {
        if (name.length > 120) throw new Error("Ürün adı en fazla 120 karakter olabilir.");
        patch.name = name;
      }
      if (barcode !== undefined && barcode !== "") {
        if (!/^[0-9A-Za-z-]{1,40}$/.test(barcode)) throw new Error("Barkod yalnızca harf ve rakam içermeli.");
        patch.barcode = barcode;
      }
      for (const key of ["brand", "unit", "description"]) {
        const v = get(r, key);
        if (v !== undefined && v !== "") patch[key] = unquoteText(v).slice(0, key === "description" ? 1000 : 60);
      }
      const emoji = get(r, "emoji");
      if (emoji) patch.emoji = unquoteText(emoji).slice(0, 8);
      const price = get(r, "price");
      if (price !== undefined && price !== "") {
        const n = parseNumber(price);
        if (!(n > 0) || n > 1e6) throw new Error(`Fiyat geçersiz: "${price}"`);
        patch.price = round2(n);
      }
      const oldPrice = get(r, "oldPrice");
      if (oldPrice !== undefined) {
        if (oldPrice === "") { if (p) patch.oldPrice = null; }
        else {
          const n = parseNumber(oldPrice);
          if (!(n > 0) || n > 1e6) throw new Error(`Eski fiyat geçersiz: "${oldPrice}"`);
          patch.oldPrice = round2(n);
        }
      }
      for (const key of ["stock", "maxPerOrder"]) {
        const v = get(r, key);
        if (v === undefined) continue;
        if (v === "") { patch[key] = null; continue; }
        const n = parseNumber(v);
        if (!Number.isInteger(n) || n < 0 || n > 1e6 || (key === "maxPerOrder" && (n < 1 || n > RULES.QTY_MAX)))
          throw new Error(`${key === "stock" ? "Stok" : "Sipariş başına en fazla"} değeri geçersiz: "${v}"`);
        patch[key] = n;
      }
      for (const key of ["soldOut", "hidden", "featured"]) {
        const v = get(r, key);
        if (v === undefined || v === "") continue;
        const b = parseBool(v);
        if (b === null) throw new Error(`"${v}" değeri anlaşılamadı (Evet/Hayır yazın).`);
        patch[key] = b;
      }
      const catName = get(r, "category") !== undefined ? unquoteText(get(r, "category")) : "";
      if (catName) {
        let c = work.categories.find((x) => foldTr(x.name) === foldTr(catName));
        if (!c) {
          c = { id: allocId(work, "categories", work.categories), name: catName.slice(0, 60), emoji: "📦", image: null, hidden: false };
          work.categories.push(c);
          result.createdCategories.push(c.name);
        }
        patch.categoryId = c.id;
      }

      if (p) {
        if (patch.oldPrice && patch.oldPrice <= (patch.price ?? p.price)) patch.oldPrice = null;
        const changed = Object.keys(patch).some((k) => JSON.stringify(p[k]) !== JSON.stringify(patch[k]));
        if (changed) {
          Object.assign(p, patch);
          result.updated++;
        } else result.unchanged++;
      } else {
        if (!patch.name) throw new Error("Yeni ürün için ürün adı gerekli.");
        if (!patch.price) throw new Error("Yeni ürün için fiyat gerekli.");
        if (!patch.categoryId) throw new Error("Yeni ürün için kategori gerekli.");
        const np = { id: allocId(work, "products", work.products), ...PRODUCT_DEFAULTS, ...patch };
        if (np.oldPrice && np.oldPrice <= np.price) np.oldPrice = null;
        if (!isPlainObject(np)) throw new Error("Geçersiz satır.");
        work.products.push(np);
        result.added++;
      }
    } catch (e) {
      result.errors.push({ row: rowNo, message: e.message });
    }
  }
  return result;
}

// ---------- Siparişler ----------
function ordersToCsv(orders, { typeLabel, paymentLabel }) {
  const header = ["Sipariş no", "Tarih", "Durum", "Tür", "Ödeme", "Para üstü", "Ad soyad", "Telefon", "Bölge", "Adres", "Ürünler", "Ara toplam", "İndirim", "Kupon", "Teslimat", "Toplam", "Kurye", "Sipariş notu", "Yönetici notu", "Kaynak"];
  const fmtDate = (iso) =>
    new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const rows = orders.map((o) => [
    o.id,
    fmtDate(o.createdAt),
    o.status,
    typeLabel[o.type] || o.type,
    paymentLabel[o.payment] || o.payment,
    num(o.changeFor),
    safeText(o.customer.name),
    safeText(o.customer.phone),
    safeText(o.customer.zoneName),
    safeText(o.customer.address),
    safeText(o.items.map((i) => `${i.qty} x ${i.name}`).join(", ")),
    num(o.subtotal),
    num(o.discount),
    safeText(o.couponCode || ""),
    num(o.deliveryFee),
    num(o.total),
    safeText(o.courier),
    safeText(o.note),
    safeText(o.adminNote),
    o.source === "panel" ? "Panel" : "Web",
  ]);
  return stringify(header, rows);
}

module.exports = { parse, stringify, productsToCsv, importProducts, ordersToCsv, PRODUCT_COLUMNS };
