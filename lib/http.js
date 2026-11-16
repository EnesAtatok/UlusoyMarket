"use strict";
// HTTP yardımcıları: güvenlik başlıkları, JSON/metin yanıtı, gzip, ETag, gövde okuma, istemci IP'si

const zlib = require("zlib");
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

// TRUST_PROXY=1 ise ters vekil (Caddy/nginx) tarafından eklenen en sağdaki X-Forwarded-For adresi kullanılır
function clientIp(req, trustProxy) {
  if (trustProxy) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
}
function isHttps(req, trustProxy) {
  if (req.socket.encrypted) return true;
  return !!trustProxy && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

module.exports = { CSP, LIMITS, securityHeaders, sendBody, sendJson, sendError, redirect, localPath, readRaw, readJson, clientIp, isHttps };
