"use strict";
// Ortak yardımcılar: hata sınıfı, sayı/metin işlemleri, atomik dosya yazma

const fs = require("fs");
const crypto = require("crypto");

// İstemciye durum koduyla dönecek hata (mesaj her zaman Türkçe ve kullanıcıya gösterilebilir)
class HttpError extends Error {
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    this.code = code || null;
    this.extra = extra || null;
  }
}
function fail(status, message, code, extra) {
  throw new HttpError(status, message, code, extra);
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const newToken = (bytes = 12) => crypto.randomBytes(bytes).toString("hex");
const maxId = (list) => (Array.isArray(list) ? list : []).reduce((m, x) => Math.max(m, (x && Number(x.id)) || 0), 0);
const nextId = (list) => maxId(list) + 1;
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const isPlainObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);

// Kalıcı, yalnızca artan kimlik sayaçları (db.meta.idCounters). Silinen kaydın numarası bir daha verilmez:
// sipariş numarası tekrar etmez, eski siparişlerin kalemleri/stok kayıtları ve müşterinin
// cihazındaki favori/tekrar al listeleri başka bir ürüne kaymaz.
const ID_KINDS = ["orders", "products", "categories", "coupons", "users", "zones", "banners", "faq"];
function idCounters(db) {
  if (!isPlainObject(db.meta)) db.meta = {};
  if (!isPlainObject(db.meta.idCounters)) db.meta.idCounters = {};
  return db.meta.idCounters;
}
/** Yeni kimlik verir: sayaç ile listedeki en büyük kimliğin büyüğü + 1 (sayaç kaydedilir). */
function allocId(db, kind, list) {
  const c = idCounters(db);
  const n = Math.max(Number(c[kind]) || 0, maxId(list)) + 1;
  c[kind] = n;
  return n;
}

// Türkçe karakter ve büyük/küçük harf duyarsız karşılaştırma anahtarı ("Süt" → "sut")
function foldTr(s) {
  return String(s == null ? "" : s)
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function slugify(s) {
  return foldTr(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Denetim karakterlerini atar, satır sonlarını düzeltir, kenar boşluklarını kırpar
function cleanText(s, { multiline = false } = {}) {
  let t = String(s == null ? "" : s).replace(/\r\n?/g, "\n");
  t = t.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, multiline ? "" : " ");
  if (!multiline) t = t.replace(/\n/g, " ").replace(/\s+/g, " ");
  else t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TL_FMT = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 });
const formatTL = (n) => TL_FMT.format(Number(n) || 0);

// Telefonu "05XXXXXXXXX" biçimine getirir; tanınmazsa boşlukları atılmış hâliyle döner
function normalizePhone(s) {
  const raw = String(s == null ? "" : s).trim();
  let d = raw.replace(/[\s().-]/g, "");
  if (/^\+90\d{10}$/.test(d)) d = "0" + d.slice(3);
  else if (/^90\d{10}$/.test(d)) d = "0" + d.slice(2);
  else if (/^5\d{9}$/.test(d)) d = "0" + d;
  return d;
}
// Karşılaştırma için son 10 hane
const phoneKey = (s) => String(s == null ? "" : s).replace(/\D/g, "").slice(-10);

// "12,5" / "1.234,50" / 12.5 → sayı; geçersizse NaN
function parseNumber(v) {
  if (typeof v === "number") return v;
  let s = String(v == null ? "" : v).trim().replace(/\s|₺|TL/gi, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

// Geçici dosyaya yazıp yeniden adlandırır (yarım yazılmış dosya kalmaz)
function writeFileAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  // Windows'ta dosya kısa süreliğine kilitliyse (virüs tarayıcı vb.) birkaç kez dener
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      if (i >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) {
        try { fs.rmSync(tmp, { force: true }); } catch {}
        throw e;
      }
      const until = Date.now() + 30 * (i + 1);
      while (Date.now() < until) { /* kısa bekleme */ }
    }
  }
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  HttpError,
  fail,
  round2,
  newToken,
  nextId,
  maxId,
  ID_KINDS,
  idCounters,
  allocId,
  clone,
  isPlainObject,
  foldTr,
  slugify,
  cleanText,
  escapeHtml,
  formatTL,
  normalizePhone,
  phoneKey,
  parseNumber,
  writeFileAtomic,
  readJsonFile,
  ensureDir,
};
