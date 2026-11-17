"use strict";
// HTTP yardımcıları: güvenlik başlıkları, JSON/metin yanıtı, gzip, ETag, gövde okuma, istemci IP'si

const zlib = require("zlib");
const net = require("net");
const crypto = require("crypto");
const { HttpError } = require("./util");

const LIMITS = { json: 1e6, upload: 8e6, large: 30e6, hard: 60e6 };

// İçerik Güvenliği Politikası: satır içi script YOK; satır içi stil (style="") serbest;
// görseller yalnızca kendi alan adımızdan + data: + blob:
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function securityHeaders(req, res, { https = false } = {}) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (https) res.setHeader("Strict-Transport-Security", "max-age=31536000");
}

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|manifest\+json)|image\/svg\+xml)/;

function acceptsGzip(req) {
  return /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
}

/**
 * Gövdeyi gönderir. HEAD isteğinde gövde yazılmaz. gzip ve ETag (etag: true) desteklenir.
 * opts: { etag: string|true, gzipped: Buffer (önceden sıkıştırılmış), cache: "Cache-Control" değeri }
 */
function sendBody(req, res, status, body, contentType, opts = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  const headers = { "Content-Type": contentType, ...(opts.headers || {}) };
  if (opts.cache) headers["Cache-Control"] = opts.cache;
  let etag = opts.etag === true ? `"${crypto.createHash("sha1").update(buf).digest("base64url").slice(0, 27)}"` : opts.etag;
  if (etag && status === 200) {
    headers.ETag = etag;
    const inm = String(req.headers["if-none-match"] || "");
    if (inm && inm.split(/\s*,\s*/).some((t) => t === etag || t === `W/${etag}` || t === "*")) {
      delete headers["Content-Type"];
      res.writeHead(304, headers);
      return res.end();
    }
  }
  const compressible = COMPRESSIBLE.test(contentType) && buf.length > 860;
  if (compressible) {
    headers.Vary = "Accept-Encoding";
    if (acceptsGzip(req)) {
      buf = opts.gzipped || zlib.gzipSync(buf, { level: 6 });
      headers["Content-Encoding"] = "gzip";
    }
  }
  headers["Content-Length"] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : buf);
}

function sendJson(req, res, status, data, headers = {}) {
  sendBody(req, res, status, JSON.stringify(data), "application/json; charset=utf-8", { cache: "no-store", headers });
}

function sendError(req, res, err) {
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.code) body.code = err.code;
    if (err.extra) Object.assign(body, err.extra);
    const headers = {};
    if (err.status === 429 && err.extra && err.extra.retryAfter) headers["Retry-After"] = String(err.extra.retryAfter);
    return sendJson(req, res, err.status, body, headers);
  }
  return sendJson(req, res, 500, { error: "Sunucuda beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.", code: "SUNUCU" });
}

/** Yönlendirme hedefini her zaman bu sitenin içinde kalan bir yola çevirir ("//x", "/\x", "/%2F..." dahil) */
function localPath(p) {
  let s = String(p || "/").replace(/[\u0000-\u001F\u007F]/g, "");
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/^[/\\]+/, "/");
  return s || "/";
}

function redirect(req, res, location, status = 301) {
  res.writeHead(status, { Location: location, "Content-Length": 0, "Cache-Control": status === 301 ? "public, max-age=86400" : "no-store" });
  res.end();
}

/** Gövdeyi Buffer olarak okur; sınırı aşarsa 413 fırlatır (bağlantıyı koparmadan). */
function readRaw(req, limit = LIMITS.json) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    const chunks = [];
    let size = 0;
    let tooBig = declared > limit;
    req.on("data", (c) => {
      size += c.length;
      if (size > LIMITS.hard) return req.destroy();
      if (tooBig || size > limit) {
        tooBig = true;
        chunks.length = 0;
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (tooBig) return reject(new HttpError(413, "Gönderilen bilgi çok büyük. Lütfen alanları kısaltın ya da daha küçük bir dosya seçin.", "COK_BUYUK"));
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

async function readJson(req, limit = LIMITS.json) {
  const raw = (await readRaw(req, limit)).toString("utf8").replace(/^﻿/, "");
  if (!raw.trim()) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") throw new Error();
    return data;
  } catch {
    throw new HttpError(400, "Geçersiz istek (JSON okunamadı).", "GECERSIZ_JSON");
  }
}

// ---------- İstemci adresi ----------
// Adresi sadeleştirir: köşeli parantez / port / bölge (%eth0) atılır, IPv4-eşlemeli IPv6 (::ffff:a.b.c.d) IPv4'e döner.
function normalizeIp(ip) {
  let s = String(ip || "").trim().toLowerCase();
  const br = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (br) s = br[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.replace(/:\d+$/, "");
  s = s.replace(/%.*$/, "");
  if (net.isIPv6(s)) {
    const g = expandV6(s);
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  }
  return s;
}
// IPv6 → 8 adet 16 bitlik grup
function expandV6(s) {
  let t = s;
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t);
  if (v4) {
    const p = v4[1].split(".").map(Number);
    t = t.slice(0, -v4[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const [a, b] = t.split("::");
  const head = a ? a.split(":") : [];
  const tail = b === undefined ? [] : b ? b.split(":") : [];
  const groups = b === undefined ? head : [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail];
  return groups.map((x) => parseInt(x, 16) || 0);
}
/**
 * Hız sınırı / bağlantı sayımı anahtarı: IPv4 adresin kendisi, IPv6 /64 öneki ("2001:db8:1:2::/64").
 * Tek istemci kendi /64 ağından sınırsız adres üretebildiği için IPv6 adres adres sayılmaz.
 */
function ipKey(ip) {
  const s = normalizeIp(ip);
  if (net.isIPv4(s)) return s;
  if (net.isIPv6(s)) return expandV6(s).slice(0, 4).map((x) => x.toString(16)).join(":") + "::/64";
  return s.slice(0, 64); // tanınmayan değer (sınırlı uzunlukta) olduğu gibi
}

/** "127.0.0.1/8, ::1, 10.0.0.0/8, 192.168.1.5" → net.BlockList. Hatalı girdi açılışta hata verir. */
const DEFAULT_TRUSTED_PROXIES = "127.0.0.0/8, ::1";
function parseTrustedProxies(spec) {
  const list = new net.BlockList();
  const items = String(spec == null || spec === "" ? DEFAULT_TRUSTED_PROXIES : spec).split(",").map((x) => x.trim()).filter(Boolean);
  for (const item of items) {
    const [addr, bits] = item.split("/");
    const a = normalizeIp(addr);
    const type = net.isIPv4(a) ? "ipv4" : net.isIPv6(a) ? "ipv6" : null;
    if (!type) throw new Error(`TRUSTED_PROXIES geçersiz adres: ${item}`);
    if (bits === undefined) list.addAddress(a, type);
    else {
      const n = Number(bits);
      if (!Number.isInteger(n) || n < 0 || n > (type === "ipv4" ? 32 : 128)) throw new Error(`TRUSTED_PROXIES geçersiz önek: ${item}`);
      list.addSubnet(a, n, type);
    }
  }
  return list;
}
function isTrusted(list, ip) {
  const a = normalizeIp(ip);
  const type = net.isIPv4(a) ? "ipv4" : net.isIPv6(a) ? "ipv6" : null;
  return !!(list && type && list.check(a, type));
}

/**
 * İstemci adresi. TRUST_PROXY=1 ve bağlantı güvenilen bir vekilden (TRUSTED_PROXIES, varsayılan yalnızca bu makine)
 * geliyorsa X-Forwarded-For sağdan sola okunur, güvenilen vekiller atlanır, ilk güvenilmeyen adres istemcidir.
 * Bağlantı güvenilmeyen bir adresten geliyorsa başlık yok sayılır (doğrudan bağlanan biri adresini taklit edemez).
 * trusted: parseTrustedProxies çıktısı (verilmezse varsayılan liste).
 */
let defaultTrusted = null;
function clientIp(req, trustProxy, trusted) {
  const peer = normalizeIp(req.socket.remoteAddress);
  if (!trustProxy) return peer;
  const list = trusted || (defaultTrusted = defaultTrusted || parseTrustedProxies());
  if (!isTrusted(list, peer)) return peer;
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => normalizeIp(s)).filter(Boolean);
  let ip = peer;
  for (let i = xff.length - 1; i >= 0; i--) {
    ip = xff[i];
    if (!isTrusted(list, ip)) break;
  }
  return ip;
}
/** HTTPS mi: TLS bağlantı ya da (yalnızca güvenilen vekilden gelen) X-Forwarded-Proto. Ekleyen vekilde en sağdaki değer esas. */
function isHttps(req, trustProxy, trusted) {
  if (req.socket.encrypted) return true;
  if (!trustProxy) return false;
  const list = trusted || (defaultTrusted = defaultTrusted || parseTrustedProxies());
  if (!isTrusted(list, req.socket.remoteAddress)) return false;
  const parts = String(req.headers["x-forwarded-proto"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 && parts[parts.length - 1].toLowerCase() === "https";
}

module.exports = {
  CSP, LIMITS, securityHeaders, sendBody, sendJson, sendError, redirect, localPath, readRaw, readJson,
  clientIp, isHttps, ipKey, normalizeIp, parseTrustedProxies, isTrusted, DEFAULT_TRUSTED_PROXIES,
};
