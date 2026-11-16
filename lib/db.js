"use strict";
// Veri katmanı: db.json yükle / atomik kaydet / eski biçimden yükselt / günlük yedek

const fs = require("fs");
const path = require("path");
const { DEFAULT_SETTINGS } = require("./defaults");
const { STATUSES } = require("./validate");
const { round2, newToken, nextId, maxId, ID_KINDS, idCounters, clone, isPlainObject, slugify, normalizePhone, writeFileAtomic, readJsonFile, ensureDir } = require("./util");
const { localDateStr } = require("./hours");

const SCHEMA_VERSION = 2;
const BACKUP_KEEP_DAYS = 14;
const BACKUP_KEEP_MANUAL = 20;

// Hedefte eksik olan anahtarları varsayılandan doldurur (mevcut değerlere dokunmaz)
function fillDefaults(target, defaults) {
  let changed = false;
  for (const [k, dv] of Object.entries(defaults)) {
    if (target[k] === undefined) {
      target[k] = clone(dv);
      changed = true;
    } else if (isPlainObject(dv) && isPlainObject(target[k])) {
      if (fillDefaults(target[k], dv)) changed = true;
    }
  }
  return changed;
}

// Bir kaydın alanlarını varsayılanlarla tamamlar; değişiklik olduysa true döner
function complete(obj, defaults) {
  let changed = false;
  for (const [k, v] of Object.entries(defaults)) {
    if (obj[k] === undefined) {
      obj[k] = typeof v === "function" ? v(obj) : clone(v);
      changed = true;
    }
  }
  return changed;
}

function upgradeSettings(db) {
  let changed = false;
  if (!isPlainObject(db.settings)) {
    db.settings = {};
    changed = true;
  }
  const s = db.settings;
  if (fillDefaults(s, DEFAULT_SETTINGS)) changed = true;
  if (!Array.isArray(s.hours.days) || s.hours.days.length !== 7) {
    s.hours.days = clone(DEFAULT_SETTINGS.hours.days);
    changed = true;
  }
  s.hours.days.forEach((d, i) => {
    if (!isPlainObject(d)) {
      s.hours.days[i] = clone(DEFAULT_SETTINGS.hours.days[i]);
      changed = true;
    } else if (complete(d, DEFAULT_SETTINGS.hours.days[i])) changed = true;
  });
  for (const key of ["zones", "banners", "faq", "blockedPhones"]) {
    if (!Array.isArray(s[key])) {
      s[key] = clone(DEFAULT_SETTINGS[key]);
      changed = true;
    }
  }
  const zoneIdStart = nextId(s.zones);
  let zn = zoneIdStart;
  for (const z of s.zones) {
    if (!z.id) { z.id = zn++; changed = true; }
    if (complete(z, { name: "Bölge", slug: (x) => slugify(x.name) || `bolge-${x.id}`, fee: null, minOrder: null, etaMinutes: null, active: true }))
      changed = true;
  }
  let bn = nextId(s.banners);
  for (const b of s.banners) {
    if (!b.id) { b.id = bn++; changed = true; }
    if (complete(b, { title: "", text: "", image: null, link: "", active: true })) changed = true;
  }
  // SSS maddelerine toplu silme için kimlik verilir
  let fn = nextId(s.faq);
  for (const f of s.faq) {
    if (!f.id) { f.id = fn++; changed = true; }
    if (complete(f, { q: "", a: "" })) changed = true;
  }
  return changed;
}

const PRODUCT_DEFAULTS = {
  brand: "",
  description: "",
  oldPrice: null,
  unit: "adet",
  image: null,
  emoji: "🛒",
  barcode: "",
  soldOut: false,
  hidden: false,
  featured: false,
  stock: null,
  maxPerOrder: null,
};
const CATEGORY_DEFAULTS = { emoji: "📦", image: null, hidden: false };
const COUPON_DEFAULTS = {
  type: "yuzde",
  value: 0,
  minOrder: 0,
  maxUses: null,
  usedCount: 0,
  perPhoneLimit: null,
  startsAt: null,
  endsAt: null,
  active: false,
  description: "",
};

function upgradeOrder(o, db) {
  let changed = false;
  const nowIso = new Date().toISOString();
  if (!o.token) { o.token = newToken(); changed = true; }
  if (!o.createdAt) { o.createdAt = nowIso; changed = true; }
  if (!isPlainObject(o.customer)) { o.customer = {}; changed = true; }
  if (complete(o.customer, { name: "", phone: "", address: "", zoneId: null, zoneName: "" })) changed = true;
  if (!Array.isArray(o.items)) { o.items = []; changed = true; }
  for (const it of o.items) {
    const p = db.products.find((x) => x.id === it.productId);
    if (complete(it, { unit: () => (p && p.unit) || "adet", name: () => (p && p.name) || "Ürün", price: 0, qty: 1 })) changed = true;
  }
  const itemsSum = round2(o.items.reduce((t, l) => t + Number(l.price) * Number(l.qty), 0));
  if (complete(o, {
    updatedAt: (x) => x.createdAt,
    source: "web",
    type: "teslimat",
    payment: "nakit",
    changeFor: null,
    note: "",
    substitution: "ara",
    subtotal: () => (o.total !== undefined && o.discount === undefined && o.deliveryFee === undefined ? round2(o.total) : itemsSum),
    discount: 0,
    couponCode: null,
    deliveryFee: 0,
    total: (x) => round2(x.subtotal - x.discount + x.deliveryFee),
    status: "Yeni",
    cancelNote: "",
    cancelledBy: (x) => (x.status === "İptal" ? "market" : null),
    adminNote: "",
    courier: "",
    preorder: false,
    stockHeld: {},
  })) changed = true;
  if (!["teslimat", "gelal"].includes(o.type)) { o.type = "teslimat"; changed = true; }
  if (!["nakit", "kart"].includes(o.payment)) { o.payment = "nakit"; changed = true; }
  if (!["ara", "benzer", "cikar"].includes(o.substitution)) { o.substitution = "ara"; changed = true; }
  if (!STATUSES.includes(o.status)) { o.status = "Yeni"; changed = true; }
  if (!Array.isArray(o.history) || !o.history.length) {
    o.history = [{ status: "Yeni", at: o.createdAt }];
    if (o.status !== "Yeni") o.history.push({ status: o.status, at: o.updatedAt });
    changed = true;
  }
  return changed;
}

function upgradeUser(u) {
  return complete(u, { name: (x) => x.username || "", role: "personel", active: true, createdAt: () => new Date().toISOString() });
}

/** Eski (ya da eksik) veriyi güncel modele getirir. { db, changed } döner; veri silinmez. */
function upgrade(raw, seed = {}) {
  const db = isPlainObject(raw) ? raw : {};
  let changed = false;
  if (!isPlainObject(db.meta)) { db.meta = { schemaVersion: SCHEMA_VERSION, upgradedAt: new Date().toISOString() }; changed = true; }
  if (db.meta.schemaVersion !== SCHEMA_VERSION) { db.meta.schemaVersion = SCHEMA_VERSION; db.meta.upgradedAt = new Date().toISOString(); changed = true; }
  for (const key of ["categories", "products", "orders", "users"]) {
    if (!Array.isArray(db[key])) { db[key] = []; changed = true; }
  }
  if (!Array.isArray(db.coupons)) {
    db.coupons = clone(Array.isArray(seed.coupons) ? seed.coupons : []);
    changed = true;
  }
  if (!isPlainObject(db.settings) && isPlainObject(seed.settings)) {
    db.settings = clone(seed.settings);
    changed = true;
  }
  if (upgradeSettings(db)) changed = true;
  for (const c of db.categories) if (complete(c, CATEGORY_DEFAULTS)) changed = true;
  for (const p of db.products) {
    if (complete(p, PRODUCT_DEFAULTS)) changed = true;
    if (p.barcode === null) { p.barcode = ""; changed = true; }
  }
  let cn = nextId(db.coupons);
  for (const c of db.coupons) {
    if (!c.id) { c.id = cn++; changed = true; }
    if (complete(c, COUPON_DEFAULTS)) changed = true;
    if (!c.code) { c.code = `KUPON${c.id}`; changed = true; }
  }
  for (const o of db.orders) if (upgradeOrder(o, db)) changed = true;
  for (const u of db.users) if (upgradeUser(u)) changed = true;
  const blocked = db.settings.blockedPhones.map(normalizePhone);
  if (blocked.join() !== db.settings.blockedPhones.join()) { db.settings.blockedPhones = blocked; changed = true; }
  if (syncIdCounters(db)) changed = true;
  return { db, changed };
}

/**
 * Yükseltilmiş verinin temel tutarlılık denetimi (geri yüklenen dosya bozuk ya da elle değiştirilmişse
 * sunucunun sonradan çökmesini önler). Sorun varsa Türkçe açıklamalı Error fırlatır.
 */
function validateData(db) {
  const problem = (msg) => { throw new Error(msg); };
  const posInt = (v) => Number.isInteger(v) && v > 0;
  const isStr = (v) => typeof v === "string";
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  const uniqueIds = (list, label) => {
    const seen = new Set();
    list.forEach((x, i) => {
      if (!isPlainObject(x) || !posInt(x.id)) problem(`${label} listesinde ${i + 1}. kaydın kimliği geçersiz.`);
      if (seen.has(x.id)) problem(`${label} listesinde aynı kimlik iki kez var (${x.id}).`);
      seen.add(x.id);
    });
  };
  uniqueIds(db.categories, "Kategori");
  for (const c of db.categories) if (!isStr(c.name)) problem(`Kategori ${c.id}: ad geçersiz.`);
  uniqueIds(db.products, "Ürün");
  for (const p of db.products) {
    if (!isStr(p.name) || !num(p.price) || p.price < 0) problem(`Ürün ${p.id}: ad ya da fiyat geçersiz.`);
    if (p.stock !== null && !(Number.isInteger(p.stock) && p.stock >= 0)) problem(`Ürün ${p.id}: stok geçersiz.`);
    for (const k of ["unit", "brand", "description", "barcode", "emoji"]) if (p[k] !== null && !isStr(p[k])) problem(`Ürün ${p.id}: ${k} alanı geçersiz.`);
    if (p.image !== null && !isStr(p.image)) problem(`Ürün ${p.id}: görsel geçersiz.`);
  }
  uniqueIds(db.orders, "Sipariş");
  for (const o of db.orders) {
    if (!isStr(o.createdAt) || !Number.isFinite(Date.parse(o.createdAt))) problem(`Sipariş ${o.id}: tarih geçersiz.`);
    if (!isStr(o.token)) problem(`Sipariş ${o.id}: takip anahtarı geçersiz.`);
    for (const k of ["name", "phone", "address"]) if (!isStr(o.customer[k])) problem(`Sipariş ${o.id}: müşteri bilgisi geçersiz.`);
    for (const k of ["subtotal", "discount", "deliveryFee", "total"]) if (!num(o[k])) problem(`Sipariş ${o.id}: tutar geçersiz.`);
    for (const it of o.items) {
      if (!isPlainObject(it) || !num(it.price) || !Number.isInteger(it.qty) || !isStr(it.name)) problem(`Sipariş ${o.id}: kalem geçersiz.`);
    }
    if (!o.history.every((h) => isPlainObject(h) && isStr(h.status))) problem(`Sipariş ${o.id}: geçmiş geçersiz.`);
  }
  uniqueIds(db.coupons, "Kupon");
  for (const c of db.coupons) if (!isStr(c.code) || !num(c.value)) problem(`Kupon ${c.id}: kod ya da değer geçersiz.`);
  uniqueIds(db.users, "Kullanıcı");
  for (const u of db.users) {
    if (!isStr(u.username) || !isStr(u.passHash) || !["yonetici", "personel"].includes(u.role)) problem(`Kullanıcı ${u.id}: bilgiler geçersiz.`);
  }
  for (const key of ["zones", "banners", "faq"]) uniqueIds(db.settings[key], "Ayar");
  if (!db.settings.blockedPhones.every(isStr)) problem("Engelli numaralar listesi geçersiz.");
  return db;
}

const idListOf = (db, kind) => (["zones", "banners", "faq"].includes(kind) ? db.settings[kind] : db[kind]);

/** Kimlik sayaçlarını en az mevcut en büyük kimliğe getirir (floor: dışarıdan gelen alt sınırlar, ör. geri yüklemede eski sayaçlar). */
function syncIdCounters(db, floor = {}) {
  const c = idCounters(db);
  let changed = false;
  for (const kind of ID_KINDS) {
    const v = Math.max(Number(c[kind]) || 0, Number(floor[kind]) || 0, maxId(idListOf(db, kind)));
    if (c[kind] !== v) { c[kind] = v; changed = true; }
  }
  return changed;
}

class Store {
  constructor({ dataDir, seedFile, log = () => {} }) {
    this.dataDir = ensureDir(dataDir);
    this.backupDir = path.join(dataDir, "backups");
    this.file = path.join(dataDir, "db.json");
    this.seedFile = seedFile;
    this.log = log;
    this.db = null;
  }

  readSeed() {
    try {
      return readJsonFile(this.seedFile);
    } catch (e) {
      this.log(`Örnek veri okunamadı (${e.message}); boş katalogla başlanıyor.`);
      return { categories: [], products: [], coupons: [], orders: [], users: [] };
    }
  }

  load() {
    const seed = this.readSeed();
    let raw;
    let fresh = false;
    if (fs.existsSync(this.file)) {
      try {
        raw = readJsonFile(this.file);
      } catch (e) {
        // Bozuk dosyanın üzerine yazılmaz; sunucu açılmaz ki veri kaybolmasın
        throw new Error(`db.json okunamadı (${e.message}). Dosyayı düzeltin ya da backups/ klasöründen geri yükleyin.`);
      }
    } else {
      raw = clone(seed);
      raw.orders = [];
      raw.users = [];
      fresh = true;
    }
    const before = fresh ? 0 : (raw.meta && raw.meta.schemaVersion) || 1;
    const { db, changed } = upgrade(raw, seed);
    this.db = db;
    if (!fresh && changed && before !== SCHEMA_VERSION) {
      // Yükseltmeden önce eski dosyanın kopyası alınır
      ensureDir(this.backupDir);
      const name = `yukseltme-oncesi-${Date.now()}.json`;
      fs.copyFileSync(this.file, path.join(this.backupDir, name));
      this.log(`Eski veri biçimi yükseltildi (yedek: backups/${name}).`);
    }
    return { fresh, changed: fresh || changed };
  }

  save() {
    writeFileAtomic(this.file, JSON.stringify(this.db, null, 2));
    this.dailyBackup();
  }

  // Günde bir kez (ilk kayıtta) yedek alır, en yeni 14 günlük yedeği tutar
  dailyBackup(now = new Date()) {
    try {
      ensureDir(this.backupDir);
      const name = `db-${localDateStr(now)}.json`;
      const target = path.join(this.backupDir, name);
      if (fs.existsSync(target) || !fs.existsSync(this.file)) return;
      fs.copyFileSync(this.file, target);
      this.prune(/^db-\d{4}-\d{2}-\d{2}\.json$/, BACKUP_KEEP_DAYS);
    } catch (e) {
      this.log(`Günlük yedek alınamadı: ${e.message}`);
    }
  }

  // Elle / işlem öncesi yedek (geri yükleme, toplu sipariş silme vb.)
  backupNow(label = "elle") {
    ensureDir(this.backupDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `${label}-${stamp}.json`;
    writeFileAtomic(path.join(this.backupDir, name), JSON.stringify(this.db, null, 2));
    this.prune(new RegExp(`^${label}-.*\\.json$`), BACKUP_KEEP_MANUAL);
    return name;
  }

  prune(re, keep) {
    const files = fs.readdirSync(this.backupDir).filter((f) => re.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - keep))) {
      try { fs.rmSync(path.join(this.backupDir, f), { force: true }); } catch {}
    }
  }

  listBackups() {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs
      .readdirSync(this.backupDir)
      .filter((f) => /^[A-Za-z0-9._-]+\.json$/.test(f))
      .map((f) => {
        const st = fs.statSync(path.join(this.backupDir, f));
        return { name: f, size: st.size, createdAt: st.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  backupPath(name) {
    if (!/^[A-Za-z0-9._-]+\.json$/.test(name)) return null;
    const p = path.join(this.backupDir, name);
    return fs.existsSync(p) ? p : null;
  }
}

module.exports = { Store, upgrade, validateData, syncIdCounters, SCHEMA_VERSION, PRODUCT_DEFAULTS, CATEGORY_DEFAULTS, COUPON_DEFAULTS };
