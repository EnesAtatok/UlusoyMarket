"use strict";
// Kimlik doğrulama: scrypt şifre özeti, dosyada kalıcı oturumlar, IP bazlı hız sınırı

const fs = require("fs");
const crypto = require("crypto");
const { readJsonData, writeDataFile, CryptoError } = require("./secure-file");

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
// ADMIN_PASSWORD verilmeden kurulursa kullanılan şifre; kullanımdaysa açılışta ve panelde uyarı verilir
const DEFAULT_PASSWORD = "admin123";
const SESSIONS_PER_USER = 20;

function scrypt(password, salt, opts = SCRYPT) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, opts.keylen, { N: opts.N, r: opts.r, p: opts.p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );
}
const encode = (opts, salt, key) => `scrypt$${opts.N}$${opts.r}$${opts.p}$${salt.toString("base64")}$${key.toString("base64")}`;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return encode(SCRYPT, salt, await scrypt(String(password), salt));
}
function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return encode(SCRYPT, salt, key);
}
// Kullanıcı bulunamasa bile aynı süre harcansın diye sahte özet
const DUMMY_HASH = hashPasswordSync(crypto.randomBytes(8).toString("hex"));

/**
 * Özet biçimi bu uygulamanın ürettiği gibi mi: scrypt, bilinen maliyet ayarları, ≥16 bayt tuz, ≥32 bayt anahtar.
 * Boş anahtarlı özet (timingSafeEqual(boş, boş) = true) ya da düşük maliyetli özet geri yüklemeyle / dosya
 * düzenlenerek sokulursa her şifreyi kabul etmesin.
 */
function parseHash(stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![16384, 32768, 65536].includes(N) || r !== 8 || p !== 1) return null;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (salt.length < 16 || expected.length < 32 || expected.length > 128) return null;
  return { N, r, p, salt, expected };
}
const isValidHash = (stored) => !!parseHash(stored);

async function verifyPassword(password, stored) {
  const h = parseHash(stored);
  // Kullanıcı yoksa / özet bozuksa da aynı süre harcanır
  const use = h || parseHash(DUMMY_HASH);
  const key = await scrypt(String(password), use.salt, { N: use.N, r: use.r, p: use.p, keylen: use.expected.length });
  return !!h && key.length === h.expected.length && crypto.timingSafeEqual(key, h.expected);
}

// Açılış denetimi için eşzamanlı doğrulama (yalnızca yerel, güvenilir özetlerle çağrılır)
function verifyPasswordSync(password, stored) {
  const parts = String(stored || "").split("$");
  if (!parseHash(stored)) return false;
  try {
    const expected = Buffer.from(parts[5], "base64");
    const key = crypto.scryptSync(String(password), Buffer.from(parts[4], "base64"), expected.length, {
      N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]), maxmem: 64 * 1024 * 1024,
    });
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Sabit zamanlı metin karşılaştırma
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb) && String(a) === String(b);
}

function checkNewPassword(pw) {
  const s = String(pw == null ? "" : pw);
  if (s.length < PASSWORD_MIN) return `Şifre en az ${PASSWORD_MIN} karakter olmalı.`;
  if (s.length > PASSWORD_MAX) return "Şifre çok uzun.";
  if (s === DEFAULT_PASSWORD) return "Bu şifre herkesçe bilinen varsayılan şifre. Başka bir şifre seçin.";
  return null;
}

// ---------- Oturumlar (sessions.json) ----------
// Dosyada belirtecin kendisi değil SHA-256 özeti tutulur.
class Sessions {
  constructor(file, ttlMs = 30 * 24 * 3600 * 1000, cipher = null) {
    this.file = file;
    this.ttlMs = ttlMs;
    this.cipher = cipher;
    this.map = new Map();
    this.encrypted = false;
    this.load();
  }
  static hash(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
  }
  // Dosyaya yazmaz (süresi dolanlar bellekten atılır, ilk kayıtta dosyaya yansır)
  load() {
    try {
      if (fs.existsSync(this.file)) {
        const { data, encrypted } = readJsonData(this.file, this.cipher, "sessions.json");
        this.encrypted = encrypted;
        for (const [k, v] of Object.entries(data || {})) this.map.set(k, v);
      }
    } catch (e) {
      // Şifre sorunu (anahtar yok/yanlış/kurcalanmış): sunucu açılmaz, dosyaya dokunulmaz
      if (e instanceof CryptoError) throw new Error(`${e.message} Dosyaya dokunulmadı.`);
      this.map.clear(); // bozuk oturum dosyası: herkes yeniden giriş yapar
    }
    const now = Date.now();
    for (const [k, v] of this.map) if (!v || v.expiresAt < now) this.map.delete(k);
  }
  needsEncrypt() {
    return !!this.cipher && !this.encrypted && fs.existsSync(this.file);
  }
  persist() {
    writeDataFile(this.file, JSON.stringify(Object.fromEntries(this.map)), this.cipher);
    this.encrypted = !!this.cipher;
  }
  /** Özeti verilen oturum (akış biletleri için; belirtecin kendisi saklanmaz) */
  getByHash(hash) {
    const s = this.map.get(hash);
    if (!s || s.expiresAt < Date.now()) return null;
    return s;
  }
  prune() {
    const now = Date.now();
    let changed = false;
    for (const [k, v] of this.map) if (!v || v.expiresAt < now) { this.map.delete(k); changed = true; }
    if (changed) this.persist();
  }
  create(userId) {
    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    // Kullanıcı başına en fazla SESSIONS_PER_USER oturum: en eskiler kapanır (sınırsız büyüyen oturum dosyası olmasın)
    const mine = [...this.map].filter(([, v]) => v && v.userId === userId).sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [k] of mine.slice(0, Math.max(0, mine.length - (SESSIONS_PER_USER - 1)))) this.map.delete(k);
    this.map.set(Sessions.hash(token), { userId, createdAt: now, expiresAt: now + this.ttlMs });
    this.persist();
    return { token, expiresAt: new Date(now + this.ttlMs).toISOString() };
  }
  get(token) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const s = this.map.get(Sessions.hash(token));
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      this.map.delete(Sessions.hash(token));
      this.persist();
      return null;
    }
    return s;
  }
  destroy(token) {
    if (this.map.delete(Sessions.hash(token))) this.persist();
  }
  destroyAll() {
    this.map.clear();
    this.persist();
  }
  // Kullanıcının (isteğe bağlı olarak biri hariç) tüm oturumlarını kapatır
  destroyUser(userId, exceptToken) {
    const keep = exceptToken ? Sessions.hash(exceptToken) : null;
    let changed = false;
    for (const [k, v] of this.map) if (v.userId === userId && k !== keep) { this.map.delete(k); changed = true; }
    if (changed) this.persist();
  }
}

// ---------- Hız sınırı (bellekte, sabit pencere) ----------
function createLimiter({ windowMs, max }) {
  const hits = new Map();
  function entry(key) {
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.resetAt <= now) {
      e = { count: 0, resetAt: now + windowMs };
      hits.set(key, e);
    }
    return e;
  }
  // Eski kayıtları ara ara temizle
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of hits) if (e.resetAt <= now) hits.delete(k);
  }, Math.max(60000, windowMs));
  if (timer.unref) timer.unref();
  return {
    // Sınır aşılmış mı (saymadan)
    blocked(key) {
      const e = entry(key);
      return e.count >= max ? Math.ceil((e.resetAt - Date.now()) / 1000) : 0;
    },
    // Bir deneme say; sınır aşıldıysa kalan saniyeyi döner
    hit(key) {
      const e = entry(key);
      e.count++;
      return e.count > max ? Math.ceil((e.resetAt - Date.now()) / 1000) : 0;
    },
    // Sayılmış bir denemeyi geri al (ör. başarılı giriş kullanıcı adı sayacından düşülür; saldırganın sayısı kalır)
    undo(key) {
      const e = hits.get(key);
      if (e && e.count > 0) e.count--;
    },
    reset(key) {
      hits.delete(key);
    },
    clear() {
      hits.clear();
    },
    stop() {
      clearInterval(timer);
    },
  };
}

module.exports = {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
  isValidHash,
  safeEqual,
  checkNewPassword,
  Sessions,
  createLimiter,
  PASSWORD_MIN,
  DEFAULT_PASSWORD,
  SESSIONS_PER_USER,
};
