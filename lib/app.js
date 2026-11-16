"use strict";
// Uygulama: yapılandırma, veri, oturumlar, yönlendirme, sayfalar. server.js yalnızca bunu başlatır.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Store } = require("./db");
const { Sessions, createLimiter, hashPasswordSync, verifyPasswordSync, DEFAULT_PASSWORD } = require("./auth");
const { Router } = require("./router");
const H = require("./http");
const { serveFrom } = require("./static");
const P = require("./pages");
const { storeStatus } = require("./hours");
const { sendTelegram } = require("./notify");
const { HttpError, fail, ensureDir, allocId } = require("./util");
const storeApi = require("./api-store");
const adminApi = require("./api-admin");

const ROOT = path.join(__dirname, "..");

const IMG_EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const IMAGE_MAX = 5 * 1024 * 1024;

/**
 * options: { dataDir, publicDir, seedFile, adminPassword, publicUrl, trustProxy, now, log,
 *            rateLimits: { login, orders, lookup } ({ windowMs, max }), telegramApiBase }
 */
function createApp(options = {}) {
  const opts = {
    dataDir: options.dataDir || process.env.DATA_DIR || path.join(ROOT, "data"),
    publicDir: options.publicDir || path.join(ROOT, "public"),
    seedFile: options.seedFile || path.join(ROOT, "data", "seed.json"),
    adminPassword: options.adminPassword || process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD,
    publicUrl: (options.publicUrl !== undefined ? options.publicUrl : process.env.PUBLIC_URL || "").replace(/\/+$/, ""),
    trustProxy: options.trustProxy !== undefined ? !!options.trustProxy : process.env.TRUST_PROXY === "1",
    now: options.now || (() => new Date()),
    log: options.log || ((msg) => console.log(`[${new Date().toISOString()}] ${msg}`)),
    rateLimits: {
      login: { windowMs: 15 * 60 * 1000, max: 8 },
      orders: { windowMs: 10 * 60 * 1000, max: 10 },
      lookup: { windowMs: 10 * 60 * 1000, max: 30 },
      ...(options.rateLimits || {}),
    },
    telegramApiBase: options.telegramApiBase || "https://api.telegram.org",
  };
  opts.dataDir = path.resolve(opts.dataDir);
  opts.publicDir = path.resolve(opts.publicDir);
  ensureDir(opts.dataDir);
  const uploadDir = ensureDir(path.join(opts.dataDir, "uploads"));
  const legacyUploadDir = path.join(opts.publicDir, "uploads");

  const store = new Store({ dataDir: opts.dataDir, seedFile: opts.seedFile, log: opts.log });
  const { changed } = store.load();
  const defaultPwCache = new Map(); // passHash → varsayılan şifre mi

  const app = {
    opts,
    store,
    get db() {
      return store.db;
    },
    now: () => opts.now(),
    log: opts.log,
    telegramApiBase: opts.telegramApiBase,
    sessions: new Sessions(path.join(opts.dataDir, "sessions.json")),
    limiters: {
      login: createLimiter(opts.rateLimits.login),
      orders: createLimiter(opts.rateLimits.orders),
      lookup: createLimiter(opts.rateLimits.lookup),
    },
    status: () => storeStatus(store.db.settings, opts.now()),
    save: () => store.save(),

    // İlk kurulumda (ya da kullanıcı listesi boşsa) admin / ADMIN_PASSWORD yöneticisi oluşturulur
    ensureAdminUser() {
      const users = store.db.users;
      if (users.some((u) => u.role === "yonetici" && u.active)) return false;
      const existing = users.find((u) => u.username === "admin");
      if (existing) {
        existing.role = "yonetici";
        existing.active = true;
      } else {
        users.push({
          id: allocId(store.db, "users", users),
          username: "admin",
          name: "Yönetici",
          role: "yonetici",
          passHash: hashPasswordSync(opts.adminPassword),
          active: true,
          createdAt: new Date().toISOString(),
        });
      }
      return true;
    },

    // data:image/...;base64,... → DATA_DIR/uploads içine kaydeder, URL döner
    saveImage(dataUrl) {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ""));
      if (!m) fail(400, "Görsel JPG, PNG veya WEBP olmalı.", "GORSEL");
      const buf = Buffer.from(m[2], "base64");
      if (!buf.length) fail(400, "Görsel okunamadı.", "GORSEL");
      if (buf.length > IMAGE_MAX) fail(400, "Görsel en fazla 5 MB olabilir.", "GORSEL");
      // İçerik gerçekten görsel mi (imza denetimi)
      const sig = buf.subarray(0, 12);
      const ok =
        (m[1] === "image/jpeg" && sig[0] === 0xff && sig[1] === 0xd8) ||
        (m[1] === "image/png" && sig.subarray(0, 4).toString("hex") === "89504e47") ||
        (m[1] === "image/webp" && sig.subarray(0, 4).toString() === "RIFF" && sig.subarray(8, 12).toString() === "WEBP");
      if (!ok) fail(400, "Görsel dosyası bozuk ya da türü yanlış.", "GORSEL");
      const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${IMG_EXT[m[1]]}`;
      fs.writeFileSync(path.join(uploadDir, name), buf);
      return `/uploads/${name}`;
    },
    // Başka bir kayıt (ürün, kategori, afiş) kullanmıyorsa yüklenen görseli siler
    deleteImageIfUnused(url) {
      if (!url || !String(url).startsWith("/uploads/")) return;
      const d = store.db;
      const used =
        d.products.some((p) => p.image === url) || d.categories.some((c) => c.image === url) || d.settings.banners.some((b) => b.image === url);
      if (used) return;
      const name = path.basename(url);
      for (const dir of [uploadDir, legacyUploadDir]) {
        try { fs.rmSync(path.join(dir, name), { force: true }); } catch {}
      }
    },
    // Kullanıcının şifresi herkesçe bilinen varsayılan şifre (admin123) mi? Özet başına bir kez hesaplanır.
    usesDefaultPassword(u) {
      if (!u || typeof u.passHash !== "string") return false;
      if (!defaultPwCache.has(u.passHash)) defaultPwCache.set(u.passHash, verifyPasswordSync(DEFAULT_PASSWORD, u.passHash));
      return defaultPwCache.get(u.passHash);
    },
    markDefaultPassword(u, value) {
      if (u && typeof u.passHash === "string") defaultPwCache.set(u.passHash, !!value);
    },
    // Telegram bildirimi (ayarlıysa). Hata siparişi engellemez.
    notify(text) {
      const n = store.db.settings.notify;
      if (!n.telegramBotToken || !n.telegramChatId) return;
      sendTelegram({ token: n.telegramBotToken, chatId: n.telegramChatId, text, apiBase: opts.telegramApiBase })
        .then((r) => { if (!r.ok) opts.log(`Telegram bildirimi gönderilemedi: ${r.error}`); })
        .catch((e) => opts.log(`Telegram bildirimi gönderilemedi: ${e.message}`));
    },
  };

  if (app.ensureAdminUser() || changed) store.save();
  else store.dailyBackup();
  // Her açılışta: varsayılan şifreyle giriş yapılabilen aktif hesap varsa belirgin uyarı (panelde de gösterilir)
  const weak = store.db.users.filter((u) => u.active && app.usesDefaultPassword(u));
  app.defaultPasswordUsers = weak.map((u) => u.username);
  if (weak.length)
    opts.log(`UYARI: "${weak.map((u) => u.username).join('", "')}" kullanıcısının şifresi herkesçe bilinen varsayılan şifre (${DEFAULT_PASSWORD}). Yayına almadan önce panelde Hesabım → Şifre değiştir ile hemen değiştirin.`);

  const router = new Router();
  storeApi.register(router, app);
  adminApi.register(router, app);

  function baseUrlOf(req) {
    if (opts.publicUrl) return opts.publicUrl;
    const host = String(req.headers.host || "localhost").replace(/[^A-Za-z0-9.:\-[\]]/g, "") || "localhost";
    return `${H.isHttps(req, opts.trustProxy) ? "https" : "http"}://${host}`;
  }

  // ---------- API ----------
  async function handleApi(req, res, url, ip) {
    const { route, params, allowed } = router.match(req.method, url.pathname);
    if (!route) {
      if (allowed && allowed.length) {
        res.setHeader("Allow", [...new Set(allowed)].join(", "));
        return H.sendJson(req, res, 405, { error: "Bu işlem bu adreste desteklenmiyor.", code: "YONTEM" });
      }
      return H.sendJson(req, res, 404, { error: "Bulunamadı", code: "BULUNAMADI" });
    }
    let sent = false;
    const ctx = {
      req,
      res,
      url,
      ip,
      params,
      query: url.searchParams,
      baseUrl: baseUrlOf(req),
      json: (limit) => H.readJson(req, limit),
      raw: (limit) => H.readRaw(req, limit),
      send(status, data) {
        sent = true;
        H.sendJson(req, res, status, data);
      },
      download(body, type, filename) {
        sent = true;
        H.sendBody(req, res, 200, body, type, {
          cache: "no-store",
          headers: { "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"` },
        });
      },
    };
    if (route.opts.auth) {
      const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ""));
      const token = m ? m[1] : "";
      const session = app.sessions.get(token);
      const user = session && store.db.users.find((u) => u.id === session.userId && u.active);
      if (!user) throw new HttpError(401, "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.", "OTURUM");
      if (route.opts.role === "yonetici" && user.role !== "yonetici")
        throw new HttpError(403, "Bu işlem için yönetici yetkisi gerekiyor.", "YETKI");
      ctx.user = user;
      ctx.token = token;
    }
    const result = await route.handler(ctx);
    if (!sent && !res.headersSent) H.sendJson(req, res, 200, result === undefined ? { ok: true } : result);
  }

  // ---------- Sayfalar ----------
  const htmlCache = new Map();
  function readPublicHtml(name) {
    const file = path.join(opts.publicDir, name);
    const st = fs.statSync(file);
    const c = htmlCache.get(file);
    if (c && c.mtime === st.mtimeMs && c.size === st.size) return c.text;
    const text = fs.readFileSync(file, "utf8");
    htmlCache.set(file, { mtime: st.mtimeMs, size: st.size, text });
    return text;
  }
  const sendHtml = (req, res, html, status = 200, extra = {}) =>
    H.sendBody(req, res, status, html, "text/html; charset=utf-8", { etag: status === 200, cache: "no-cache", headers: extra });

  function pageCtx(req) {
    return { settings: store.db.settings, baseUrl: baseUrlOf(req), publicDir: opts.publicDir };
  }
  function notFound(req, res) {
    return sendHtml(req, res, P.notFoundPage(pageCtx(req)), 404, { "X-Robots-Tag": "noindex" });
  }

  function handlePage(req, res, url) {
    let p;
    try {
      p = decodeURIComponent(url.pathname);
    } catch {
      return notFound(req, res);
    }
    // Sondaki "/" atılarak yönlendirilir. Çözülmemiş (yüzde kodlu) yol kullanılır ve baştaki çoklu "/" ya da "\"
    // teke indirilir: "/%2Fevil.com/" → "//evil.com" gibi başka siteye açık yönlendirme ve CRLF ile başlık bozma olmasın.
    if (p.length > 1 && p.endsWith("/") && !p.startsWith("/panel/"))
      return H.redirect(req, res, H.localPath(url.pathname.replace(/\/+$/, "")) + url.search);
    if (p === "/healthz") return H.sendJson(req, res, 200, { ok: true, time: new Date().toISOString(), uptime: Math.round(process.uptime()) });
    if (p === "/" || p === "/index.html") {
      if (p === "/index.html") return H.redirect(req, res, "/" + url.search);
      return sendHtml(req, res, P.injectHome(readPublicHtml("index.html"), pageCtx(req)));
    }
    if (p === "/panel.html") return H.redirect(req, res, "/panel");
    // /panel, /panel/siparisler ... → aynı sayfa (geçişler istemcide)
    if (p === "/panel" || p.startsWith("/panel/"))
      return sendHtml(req, res, P.injectNoindex(readPublicHtml("panel.html")), 200, { "X-Robots-Tag": "noindex, nofollow" });

    const legal = P.LEGAL_PAGES[p.slice(1)];
    if (legal) return sendHtml(req, res, P.legalPage(pageCtx(req), p.slice(1)));
    if (p === "/hakkimizda") return sendHtml(req, res, P.aboutPage(pageCtx(req)));
    if (p === "/teslimat") return sendHtml(req, res, P.zonesIndexPage(pageCtx(req)));
    const zm = /^\/teslimat\/([a-z0-9-]+)$/.exec(p);
    if (zm) {
      const z = store.db.settings.zones.find((x) => x.slug === zm[1] && x.active);
      return z ? sendHtml(req, res, P.zonePage(pageCtx(req), z)) : notFound(req, res);
    }
    // Eski sitenin mahalle sayfaları (/sukrupasa-tekel vb.) → yeni bölge sayfaları
    const legacy = /^\/([a-z0-9-]+?)-(tekel|market|marketi)$/i.exec(p);
    if (legacy) {
      const slug = legacy[1].toLowerCase();
      const zones = store.db.settings.zones.filter((z) => z.active);
      const z = zones.find((x) => x.slug === slug) || zones.find((x) => x.slug.startsWith(slug + "-") || x.slug.startsWith(slug));
      return H.redirect(req, res, z ? `/teslimat/${z.slug}` : "/teslimat", 301);
    }
    // PUBLIC_URL yoksa adresler Host başlığından gelir: paylaşımlı önbellekte saklanıp başka ziyaretçiye sahte adresle dönmesin
    const seoCache = opts.publicUrl ? "public, max-age=3600" : "no-cache";
    if (p === "/robots.txt") return H.sendBody(req, res, 200, P.robotsTxt(pageCtx(req)), "text/plain; charset=utf-8", { cache: seoCache, etag: true });
    if (p === "/sitemap.xml") return H.sendBody(req, res, 200, P.sitemapXml(pageCtx(req)), "application/xml; charset=utf-8", { cache: seoCache, etag: true });
    if (p === "/manifest.webmanifest")
      return H.sendBody(req, res, 200, P.manifestJson(pageCtx(req)), "application/manifest+json; charset=utf-8", { cache: "no-cache", etag: true });

    if (p.startsWith("/uploads/")) {
      const rel = p.slice("/uploads/".length);
      if (serveFrom(req, res, [uploadDir, legacyUploadDir], "/" + rel)) return;
      return H.sendBody(req, res, 404, "Bulunamadı", "text/plain; charset=utf-8", { cache: "no-store" });
    }
    if (/\.html?$/i.test(p)) return notFound(req, res); // diğer .html dosyaları doğrudan sunulmaz
    if (serveFrom(req, res, [opts.publicDir], p)) return;
    if (/\.[a-z0-9]{1,8}$/i.test(p)) return H.sendBody(req, res, 404, "Bulunamadı", "text/plain; charset=utf-8", { cache: "no-store" });
    return notFound(req, res);
  }

  async function handle(req, res) {
    const ip = H.clientIp(req, opts.trustProxy);
    H.securityHeaders(req, res, { https: H.isHttps(req, opts.trustProxy) });
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return H.sendJson(req, res, 400, { error: "Geçersiz adres.", code: "DOGRULAMA" });
    }
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url, ip);
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        return H.sendJson(req, res, 405, { error: "Bu işlem bu adreste desteklenmiyor.", code: "YONTEM" });
      }
      return handlePage(req, res, url);
    } catch (e) {
      if (!(e instanceof HttpError)) opts.log(`Hata: ${req.method} ${url.pathname}: ${e.stack || e.message}`);
      if (res.headersSent) return res.end();
      // Gövde okunmadan hata verildiyse kalan veri boşaltılır ki istemci yanıtı alabilsin
      if (!req.complete) req.resume();
      return H.sendError(req, res, e);
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res);
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 20000;

  function close() {
    for (const l of Object.values(app.limiters)) l.stop();
    return new Promise((resolve) => {
      server.close(() => resolve());
      if (server.closeAllConnections) server.closeAllConnections();
    });
  }

  return { app, server, close, handle, router };
}

module.exports = { createApp };
