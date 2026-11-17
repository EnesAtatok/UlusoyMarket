"use strict";
// Test yardımcıları: geçici DATA_DIR + boş port ile sunucu başlatır

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("../lib/app");

const ADMIN_PASSWORD = "test1234";
// Sipariş formundaki zorunlu onaylar (eski "kvkk: true" alanı artık kabul edilmez)
const REQUIRED_CONSENTS = require("../lib/defaults").DEFAULT_CONSENTS.filter((c) => c.required && c.active).map((c) => c.key);
// Pazartesi 16 Kasım 2026, 21:00 (Türkiye) — varsayılan saatlerle (14:00–02:00) açık
const OPEN_TIME = "2026-11-16T18:00:00.000Z";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ulusoy-test-"));
}

/** Sunucu başlatır. options: createApp seçenekleri + { dataDir, time } */
async function start(options = {}) {
  const dataDir = options.dataDir || tmpDir();
  const clock = { t: new Date(options.time || OPEN_TIME).getTime() };
  const inst = createApp({
    dataDir,
    adminPassword: ADMIN_PASSWORD,
    publicUrl: "",
    log: () => {},
    now: () => new Date(clock.t),
    ...options,
  });
  await new Promise((r) => inst.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${inst.server.address().port}`;

  async function req(method, url, body, token, headers = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    let payload;
    if (body !== undefined) {
      if (typeof body === "string" || Buffer.isBuffer(body)) payload = body;
      else {
        payload = JSON.stringify(body);
        h["Content-Type"] = "application/json";
      }
    }
    const res = await fetch(base + url, { method, headers: h, body: payload, redirect: "manual" });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, headers: res.headers, text, json, body: json };
  }
  async function login(username = "admin", password = ADMIN_PASSWORD) {
    const r = await req("POST", "/api/admin/login", { username, password });
    if (r.status !== 200) throw new Error(`Giriş başarısız: ${r.text}`);
    return r.json.token;
  }
  async function close(keep = false) {
    await inst.close();
    if (!keep && !options.dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  }
  return { inst, app: inst.app, base, dataDir, clock, req, login, close, setTime: (iso) => (clock.t = new Date(iso).getTime()) };
}

// Geçerli bir web siparişi gövdesi
function orderBody(extra = {}) {
  return {
    name: "Ayşe Yılmaz",
    phone: "05321234567",
    address: "Şükrüpaşa Mah. Deneme Sok. No:5 D:3",
    zoneId: 1,
    type: "teslimat",
    payment: "nakit",
    consents: REQUIRED_CONSENTS,
    items: [{ productId: 13, qty: 5 }], // Tam Yağlı Süt 1 L, 46,5 ₺ → 232,5 ₺
    ...extra,
  };
}

/** Numara + telefonla sorguyu açar (varsayılan kapalı) */
async function enablePhoneLookup(s) {
  const r = await s.req("PATCH", "/api/admin/settings", { privacy: { phoneLookup: true } }, await s.login());
  if (r.status !== 200) throw new Error(`Ayar kaydedilemedi: ${r.text}`);
}

module.exports = { start, tmpDir, orderBody, enablePhoneLookup, ADMIN_PASSWORD, OPEN_TIME, REQUIRED_CONSENTS };
