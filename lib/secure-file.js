"use strict";
// Depoda şifreleme: db.json, sessions.json, audit.json ve yedekler DATA_KEY verilirse AES-256-GCM ile şifreli yazılır.
// Aynı zarf biçimi panelden indirilen parolalı yedekte de kullanılır.
//
// Dosya biçimi (tek satır JSON, sürüm 1):
//   {"format":"ulusoy-sifreli","v":1,"alg":"aes-256-gcm",
//    "kdf":{"name":"scrypt","N":32768,"r":8,"p":1,"salt":"<16 bayt b64>"},
//    "kcv":"<anahtar denetim değeri, 16 hex>","iv":"<12 bayt b64>","tag":"<16 bayt b64>","data":"<şifreli metin b64>"}
// - Anahtar: scrypt(DATA_KEY ya da parola, salt) → 32 bayt. Aynı süreçte aynı salt kullanılır (türetme önbelleklenir),
//   her yazımda IV rastgeledir.
// - kcv = HMAC-SHA256(anahtar, "ulusoy-kcv") ilk 8 bayt: yanlış anahtarı "dosya bozulmuş"tan ayırt etmek için.
// - Başlık alanları (biçim, sürüm, alg, kdf, kcv) GCM'e ek doğrulanmış veri (AAD) olarak girer: değiştirilirse açılmaz.

const crypto = require("crypto");
const fs = require("fs");
const { writeFileAtomic } = require("./util");

const FORMAT = "ulusoy-sifreli";
const VERSION = 1;
const ALG = "aes-256-gcm";
const KDF_DEFAULT = { N: 32768, r: 8, p: 1 };
const KDF_ALLOWED_N = [16384, 32768, 65536];

class CryptoError extends Error {
  /** reason: "ANAHTAR_YOK" | "YANLIS_ANAHTAR" | "BOZUK" | "BICIM" */
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

function deriveKey(secret, salt, kdf) {
  return crypto.scryptSync(Buffer.from(String(secret), "utf8"), salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 160 * 1024 * 1024 });
}
const kcvOf = (key) => crypto.createHmac("sha256", key).update("ulusoy-kcv").digest().subarray(0, 8).toString("hex");
const aadOf = (env) => Buffer.from(`${env.format}|${env.v}|${env.alg}|scrypt|${env.kdf.N}|${env.kdf.r}|${env.kdf.p}|${env.kdf.salt}|${env.kcv}`, "utf8");

/** Metin ya da Buffer şifreli zarf mı? (JSON olarak ayrıştırılabilir ve biçim alanı tutuyorsa) */
function parseEnvelope(input) {
  let obj = input;
  if (Buffer.isBuffer(input) || typeof input === "string") {
    const s = (Buffer.isBuffer(input) ? input.toString("utf8") : input).replace(/^﻿/, "").trimStart();
    if (!s.startsWith("{") || !s.includes(`"${FORMAT}"`)) return null;
    try {
      obj = JSON.parse(s);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || obj.format !== FORMAT) return null;
  // Zarfın anahtar kümesi sabittir; "format" taşıyan düz veri (ör. geri yüklenen yedek) zarf sanılmasın
  const keys = Object.keys(obj);
  if (keys.length !== ENVELOPE_KEYS.length || !ENVELOPE_KEYS.every((k) => keys.includes(k)) || typeof obj.data !== "string") return null;
  return obj;
}
const ENVELOPE_KEYS = ["format", "v", "alg", "kdf", "kcv", "iv", "tag", "data"];

/**
 * DATA_KEY bariz zayıf / yer tutucu mu? Sorun varsa Türkçe açıklama, yoksa null.
 * (Ör. tırnaklı heredoc yüzünden dosyaya "$(openssl rand …)" metni yazılmışsa ya da belgedeki örnek kopyalanmışsa.)
 */
const DATA_KEY_MIN = 16;
function dataKeyProblem(key, name = "DATA_KEY") {
  const k = String(key || "");
  if (k.length < DATA_KEY_MIN) return `${name} en az ${DATA_KEY_MIN} karakter olmalı (uzun, rastgele bir değer kullanın; bkz. docs/DEPLOY.md).`;
  if (/\$\(|\$\{|`/.test(k)) return `${name} bir kabuk komutu metni içeriyor ("$(...)" ya da ters tırnak): komut çalışmamış, metnin kendisi yazılmış. Anahtarı docs/DEPLOY.md'deki komutla üretin.`;
  if (/^<.*>$|buraya|ornek|örnek|uzun-rastgele|changeme|placeholder|xxxxxx/i.test(k))
    return `${name} örnek / yer tutucu bir metin gibi görünüyor. Rastgele bir anahtar üretin (bkz. docs/DEPLOY.md).`;
  if (new Set(k).size < 8) return `${name} çok tekdüze (en az 8 farklı karakter). Rastgele bir anahtar üretin (bkz. docs/DEPLOY.md).`;
  return null;
}
function isEncrypted(input) {
  return !!parseEnvelope(input);
}

function checkEnvelope(env) {
  const b64 = (v, len) => {
    if (typeof v !== "string" || !/^[A-Za-z0-9+/=]*$/.test(v)) return null;
    const b = Buffer.from(v, "base64");
    return len === undefined || b.length === len ? b : null;
  };
  if (env.v !== VERSION) throw new CryptoError("BICIM", `Şifreli dosyanın sürümü desteklenmiyor (${String(env.v).slice(0, 10)}).`);
  if (env.alg !== ALG) throw new CryptoError("BICIM", "Şifreli dosyanın algoritması desteklenmiyor.");
  const k = env.kdf || {};
  if (k.name !== "scrypt" || !KDF_ALLOWED_N.includes(k.N) || k.r !== 8 || k.p !== 1) throw new CryptoError("BICIM", "Şifreli dosyanın anahtar türetme ayarları geçersiz.");
  const salt = b64(k.salt, 16);
  const iv = b64(env.iv, 12);
  const tag = b64(env.tag, 16);
  const data = b64(env.data);
  if (!salt || !iv || !tag || !data || typeof env.kcv !== "string" || !/^[0-9a-f]{16}$/.test(env.kcv))
    throw new CryptoError("BICIM", "Şifreli dosya bozuk (başlık alanları geçersiz).");
  return { salt, iv, tag, data, kdf: { N: k.N, r: k.r, p: k.p } };
}

/**
 * Bir sır (DATA_KEY ya da yedek parolası) için şifreleyici. Türetilen anahtarlar salt'a göre önbelleklenir.
 */
class Cipher {
  constructor(secret, { kdf = KDF_DEFAULT } = {}) {
    if (!secret) throw new Error("Şifreleme anahtarı boş olamaz.");
    this.secret = String(secret);
    this.kdf = { ...kdf };
    this.cache = new Map(); // salt(b64)|N → key
    this.writeSalt = crypto.randomBytes(16);
  }
  keyFor(salt, kdf) {
    const id = `${salt.toString("base64")}|${kdf.N}`;
    let key = this.cache.get(id);
    if (!key) {
      key = deriveKey(this.secret, salt, kdf);
      this.cache.set(id, key);
      if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
    }
    return key;
  }
  /** Metni şifreli zarf metnine çevirir */
  encrypt(plain) {
    const key = this.keyFor(this.writeSalt, this.kdf);
    const env = { format: FORMAT, v: VERSION, alg: ALG, kdf: { name: "scrypt", ...this.kdf, salt: this.writeSalt.toString("base64") }, kcv: kcvOf(key) };
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv(ALG, key, iv);
    c.setAAD(aadOf(env));
    const data = Buffer.concat([c.update(Buffer.isBuffer(plain) ? plain : Buffer.from(String(plain), "utf8")), c.final()]);
    return JSON.stringify({ ...env, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") });
  }
  /** Zarfı (metin/Buffer/nesne) çözer; yanlış anahtar / kurcalanmış dosyada CryptoError fırlatır */
  decrypt(input) {
    const env = parseEnvelope(input);
    if (!env) throw new CryptoError("BICIM", "Dosya şifreli biçimde değil.");
    const p = checkEnvelope(env);
    const key = this.keyFor(p.salt, p.kdf);
    if (!crypto.timingSafeEqual(Buffer.from(kcvOf(key)), Buffer.from(env.kcv))) throw new CryptoError("YANLIS_ANAHTAR", "Anahtar (ya da parola) yanlış.");
    try {
      const d = crypto.createDecipheriv(ALG, key, p.iv);
      d.setAAD(aadOf(env));
      d.setAuthTag(p.tag);
      return Buffer.concat([d.update(p.data), d.final()]).toString("utf8");
    } catch {
      throw new CryptoError("BOZUK", "Şifreli dosya bozulmuş ya da değiştirilmiş (doğrulama etiketi tutmuyor).");
    }
  }
  /** Zarfı çözmeden yalnızca anahtarın doğru olup olmadığını söyler (true/false); biçim bozuksa CryptoError */
  matches(input) {
    const env = parseEnvelope(input);
    if (!env) return false;
    const p = checkEnvelope(env);
    return kcvOf(this.keyFor(p.salt, p.kdf)) === env.kcv;
  }
}

function createCipher(secret, opts) {
  return secret ? new Cipher(secret, opts) : null;
}

/**
 * Veri dosyasını okur (şifreli ya da düz). Dönüş: { text, encrypted }.
 * Şifreli dosya + anahtar yok → CryptoError("ANAHTAR_YOK"); yanlış anahtar / bozuk → CryptoError.
 */
function readDataFile(file, cipher, label = file) {
  const buf = fs.readFileSync(file);
  if (isEncrypted(buf)) {
    if (!cipher) throw new CryptoError("ANAHTAR_YOK", `${label} şifreli ama DATA_KEY verilmedi.`);
    try {
      return { text: cipher.decrypt(buf), encrypted: true };
    } catch (e) {
      if (e instanceof CryptoError) throw new CryptoError(e.reason, `${label}: ${e.message}`);
      throw e;
    }
  }
  return { text: buf.toString("utf8").replace(/^﻿/, ""), encrypted: false };
}
function readJsonData(file, cipher, label) {
  const { text, encrypted } = readDataFile(file, cipher, label);
  return { data: JSON.parse(text), encrypted };
}
/** Atomik yazar; anahtar varsa şifreli */
function writeDataFile(file, text, cipher) {
  writeFileAtomic(file, cipher ? cipher.encrypt(text) : text);
}

/** Dosya şifreli mi, anahtar tutuyor mu — dosyaya dokunmadan */
function probeFile(file, cipher) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return { exists: false };
  }
  if (!isEncrypted(buf)) return { exists: true, encrypted: false };
  if (!cipher) return { exists: true, encrypted: true, ok: false, reason: "ANAHTAR_YOK" };
  try {
    cipher.decrypt(buf);
    return { exists: true, encrypted: true, ok: true };
  } catch (e) {
    return { exists: true, encrypted: true, ok: false, reason: e.reason || "BOZUK", message: e.message };
  }
}

module.exports = { FORMAT, VERSION, DATA_KEY_MIN, dataKeyProblem, Cipher, CryptoError, createCipher, isEncrypted, parseEnvelope, readDataFile, readJsonData, writeDataFile, probeFile };
