"use strict";
// Statik dosya sunumu: ETag + 304, gzip (bellekte önbellekli), uygun Cache-Control

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { sendBody } = require("./http");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

const gzCache = new Map(); // dosya yolu → { key, buf }

function cacheControl(urlPath, ext) {
  if (urlPath.startsWith("/uploads/")) return "public, max-age=2592000, immutable"; // adlar benzersiz
  if (urlPath.startsWith("/fonts/")) return "public, max-age=2592000";
  if (urlPath.startsWith("/img/")) return "public, max-age=604800";
  if ([".html", ".js", ".css", ".webmanifest", ".json"].includes(ext)) return "no-cache"; // her açılışta ETag ile doğrulanır
  return "public, max-age=86400";
}

// Kök klasörler içinde güvenli dosya yolu çözümler (dizin dışına çıkış ve gizli dosyalar engellenir)
function resolveIn(root, urlPath) {
  const rel = urlPath.replace(/^\/+/, "");
  // "\" Windows'ta da ayraçtır; sonda nokta/boşluk ("panel.html.") ve ":" (NTFS akışı, sürücü) Windows'ta
  // aynı dosyaya çıkıp .html / gizli dosya denetimlerini atlatabilir
  if (rel.split(/[/\\]/).some((seg) => seg.startsWith(".") || /[.\s]$/.test(seg) || seg.includes(":") || seg.includes("\0"))) return null;
  const file = path.normalize(path.join(root, rel));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

/** Dosyayı sunar; bulunamazsa false döner (çağıran 404 üretir). */
function serveFile(req, res, file, urlPath) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const inm = String(req.headers["if-none-match"] || "");
  if (inm && inm.split(/\s*,\s*/).some((t) => t === etag || t === `W/${etag}`)) {
    res.writeHead(304, { ETag: etag, "Cache-Control": cacheControl(urlPath, ext) });
    res.end();
    return true;
  }
  const buf = fs.readFileSync(file);
  let gzipped;
  if (/^(text\/|application\/(json|javascript|xml|manifest)|image\/svg)/.test(type) && buf.length > 860) {
    const c = gzCache.get(file);
    if (c && c.key === etag) gzipped = c.buf;
    else {
      gzipped = zlib.gzipSync(buf, { level: 9 });
      gzCache.set(file, { key: etag, buf: gzipped });
    }
  }
  sendBody(req, res, 200, buf, type, { etag, gzipped, cache: cacheControl(urlPath, ext) });
  return true;
}

function serveFrom(req, res, roots, urlPath) {
  for (const root of roots) {
    const file = resolveIn(root, urlPath);
    if (file && serveFile(req, res, file, urlPath)) return true;
  }
  return false;
}

module.exports = { MIME, serveFile, serveFrom, resolveIn };
