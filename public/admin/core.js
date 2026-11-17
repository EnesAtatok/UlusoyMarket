// Ortak yardımcılar: API, durum, biçimlendirme, bildirim, pencere, menü, toplu seçim, indirme, görsel küçültme.

export const STATUSES = ["Yeni", "Hazırlanıyor", "Yolda", "Teslim edildi", "İptal"];
export const ACTIVE = ["Yeni", "Hazırlanıyor", "Yolda"];
export const TZ = "Europe/Istanbul";

export const state = {
  token: readLS("panelToken"),
  user: null,
  store: null,        // GET /api/store (durum, bölgeler)
  settings: null,     // GET /api/admin/settings (yalnızca yönetici)
  products: [],
  categories: [],
  loaded: { products: false, categories: false },
};

export const isAdmin = () => state.user && state.user.role === "yonetici";

export function readLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function writeLS(k, v) { try { v === null || v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* özel sekme */ } }

// ---------- DOM ----------
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const icon = (name, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export function h(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

// ---------- Biçimlendirme ----------
const moneyFmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
export const tl = (n) => moneyFmt.format(Number(n) || 0);
export const numTr = (n, d = 2) => (n === null || n === undefined || n === "" ? "" : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: d === 2 && Number(n) % 1 ? 2 : 0, maximumFractionDigits: d, useGrouping: false }));
/** "59,90" / "1.234,5" / "12.5" → sayı; boşsa null; geçersizse NaN */
export function parseNum(v) {
  const s = String(v ?? "").trim().replace(/\s|₺|TL/gi, "");
  if (!s) return null;
  let t = s;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
const dtFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const tFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export const fmtDateTime = (iso) => (iso ? dtFmt.format(new Date(iso)) : "");
export const fmtDate = (iso) => (iso ? dFmt.format(new Date(iso)) : "");
export const fmtTime = (iso) => (iso ? tFmt.format(new Date(iso)) : "");
/** Türkiye saatine göre YYYY-AA-GG */
export const dayStr = (d = new Date()) => isoDay.format(d);
export function addDays(str, n) {
  const [y, m, d] = str.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export function fmtDayStr(str, opts = { day: "numeric", month: "short" }) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("tr-TR", { timeZone: "UTC", ...opts });
}
export function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "az önce";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk önce`;
  const hh = Math.floor(m / 60);
  if (hh < 24) return `${hh} sa önce`;
  return fmtDate(iso);
}
export const minutesSince = (iso) => (Date.now() - Date.parse(iso)) / 60000;
/** Türkçe karakter ve büyük/küçük harf duyarsız arama anahtarı */
export function fold(s) {
  return String(s ?? "").toLocaleLowerCase("tr").replace(/[çğıöşüâîû]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" }[c])).normalize("NFD").replace(/[̀-ͯ]/g, "");
}
export const plural = (n, word) => `${n} ${word}`;

// ---------- API ----------
export class ApiError extends Error {
  constructor(message, status, code, data) { super(message); this.status = status; this.code = code; this.data = data; }
}
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function api(path, { method = "GET", body, raw, contentType, signal } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let payload;
  if (raw !== undefined) { payload = raw; headers["Content-Type"] = contentType || "application/json"; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload, signal, cache: "no-store" });
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    throw new ApiError("Sunucuya ulaşılamadı. İnternet bağlantısını kontrol edip tekrar deneyin.", 0, "AG");
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (res.status === 401 && path !== "/api/admin/login") {
    onUnauthorized((data && data.error) || "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.");
    throw new ApiError((data && data.error) || "Oturumunuz sona erdi.", 401, "OTURUM", data);
  }
  if (!res.ok) {
    let msg = (data && data.error) || `Beklenmeyen hata (${res.status}).`;
    if (res.status === 403 && !(data && data.error)) msg = "Bu işlem için yetkiniz yok.";
    if (res.status === 413) msg = (data && data.error) || "Dosya çok büyük.";
    throw new ApiError(msg, res.status, data && data.code, data);
  }
  return data;
}

/** Yetkili dosya isteği (Bearer başlığıyla); hata JSON'unu ApiError'a çevirir */
async function fetchFile(path, { method = "GET", body } = {}) {
  let res;
  const headers = { Authorization: `Bearer ${state.token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  } catch {
    throw new ApiError("Sunucuya ulaşılamadı.", 0, "AG");
  }
  if (res.status === 401) { onUnauthorized("Oturumunuz sona erdi. Lütfen tekrar giriş yapın."); throw new ApiError("Oturumunuz sona erdi.", 401); }
  if (!res.ok) {
    let msg = `İndirme başarısız (${res.status}).`;
    let code;
    try { const j = await res.json(); msg = j.error || msg; code = j.code; } catch { /* boş */ }
    throw new ApiError(msg, res.status, code);
  }
  return res;
}

/** Yetkili sayfayı (ör. sipariş sözleşmesi HTML'i) yeni sekmede açar; açılamazsa indirir */
export async function openAuthed(path, fallbackName, { print = false } = {}) {
  // Açılır pencere engellenmesin diye sekme kullanıcı tıklamasıyla hemen açılır, içerik sonra yüklenir
  const win = window.open("", "_blank");
  try {
    const res = await fetchFile(path);
    let blob = await res.blob();
    if (/text\/html/i.test(blob.type)) {
      // blob: adresinde "/style.css" gibi yollar çözülemez; sayfaya kendi kökenimizi taban adres olarak ekle
      // (<head …> yalnızca; <header> ile karışmasın.) Belge yalnızca metin: içine script çalıştırılmasın diye ek CSP
      const html = (await blob.text()).replace(/<head(\s[^>]*)?>/i, (m, attrs = "") => `<head${attrs}><meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'"><base href="${location.origin}/">`);
      blob = new Blob([html], { type: "text/html;charset=utf-8" });
    }
    const url = URL.createObjectURL(blob);
    if (win) {
      win.location.href = url;
      if (print) {
        // Blob adresi aynı kökenden: yüklenince yazdırma penceresini açanın kendisi tetikler (CSP iframe'e izin vermez)
        let n = 0;
        const t = setInterval(() => {
          n++;
          try {
            if (win.closed || n > 60) { clearInterval(t); return; }
            if (win.location.href === url && win.document.readyState === "complete") { clearInterval(t); win.focus(); win.print(); }
          } catch { /* yükleniyor */ }
        }, 200);
      }
    } else {
      const a = document.createElement("a");
      a.href = url; a.download = fallbackName; document.body.append(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) {
    if (win) win.close();
    throw e;
  }
}

/** Yetkili indirme: fetch → Blob → <a download> (body verilirse POST) */
export async function download(path, fallbackName, body) {
  const res = await fetchFile(path, body === undefined ? {} : { method: "POST", body });
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
  const name = m ? decodeURIComponent(m[1] || m[2]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}

// ---------- Veri yükleme ----------
export async function loadCatalog(force = false) {
  const jobs = [];
  if (force || !state.loaded.products) jobs.push(api("/api/admin/products").then((p) => { state.products = p; state.loaded.products = true; }));
  if (force || !state.loaded.categories) jobs.push(api("/api/admin/categories").then((c) => { state.categories = c; state.loaded.categories = true; }));
  await Promise.all(jobs);
}
export async function loadSettings(force = false) {
  if (!isAdmin()) return null;
  if (force || !state.settings) state.settings = await api("/api/admin/settings");
  return state.settings;
}
export const isSoldOut = (p) => !!(p.soldOut || p.stock === 0);
/** Cayma hakkı durumu (MSY m.15); ürün null ise kategorininki geçerlidir */
export const CAYMA = { yok_cabuk_bozulan: "Yok – çabuk bozulan", acilirsa_yok_hijyen: "Ambalajı açılırsa yok – hijyen", var: "Var" };
export const caymaOf = (p) => {
  if (p && CAYMA[p.caymaDurumu]) return p.caymaDurumu;
  const c = p && state.categories.find((x) => x.id === p.categoryId);
  return c && CAYMA[c.caymaDurumu] ? c.caymaDurumu : "var";
};
export const catName = (id) => { const c = state.categories.find((x) => x.id === id); return c ? c.name : "—"; };

// ---------- Bildirim (toast) ----------
const ICONS = { ok: "check", err: "alert", warn: "alert", info: "info", order: "bell" };
export function toast(msg, type = "ok", { details, timeout, action } = {}) {
  const box = $("#toasts");
  const el = h(`<div class="toast ${type}" role="${type === "err" ? "alert" : "status"}">
    ${icon(ICONS[type] || "info")}
    <div class="t-body"><div>${esc(msg)}</div>${details && details.length ? `<ul>${details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}</div>
    ${action ? `<button type="button" class="btn btn-sm t-act">${esc(action.label)}</button>` : ""}
    <button type="button" class="t-close" aria-label="Kapat">${icon("x", "i-sm")}</button>
  </div>`);
  const close = () => { el.remove(); };
  el.querySelector(".t-close").addEventListener("click", close);
  if (action) el.querySelector(".t-act").addEventListener("click", () => { close(); action.onClick(); });
  box.append(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  const ms = timeout ?? (type === "err" ? 7000 : details && details.length ? 9000 : action ? 7000 : 3500);
  if (ms > 0) setTimeout(close, ms);
  return el;
}
export const toastErr = (e) => { if (e && e.status !== 401 && e.name !== "AbortError") toast(e.message || String(e), "err"); };

/** Toplu işlem sonucu: "12 silindi, 2 atlandı (neden)" */
export function bulkResult(res, verb) {
  const skipped = res.skipped || [];
  const reasons = new Map();
  for (const s of skipped) {
    const key = s.reason || "Bilinmeyen neden";
    if (!reasons.has(key)) reasons.set(key, []);
    reasons.get(key).push(s.name || `#${s.id}`);
  }
  const details = [...reasons].map(([r, names]) => `${names.slice(0, 4).join(", ")}${names.length > 4 ? ` +${names.length - 4}` : ""}: ${r}`);
  const msg = skipped.length ? `${res.processed} ${verb}, ${skipped.length} atlandı.` : `${res.processed} ${verb}.`;
  toast(msg, res.processed ? (skipped.length ? "warn" : "ok") : "warn", { details });
}

// ---------- Kaydedilmemiş değişiklik takibi ----------
const dirty = new Map(); // anahtar → açıklama
export function setDirty(key, on, label = "") { if (on) dirty.set(key, label); else dirty.delete(key); document.dispatchEvent(new CustomEvent("dirtychange")); }
export const isDirty = (prefix = "") => [...dirty.keys()].some((k) => k.startsWith(prefix));
export function clearDirty(prefix = "") { for (const k of [...dirty.keys()]) if (k.startsWith(prefix)) dirty.delete(k); document.dispatchEvent(new CustomEvent("dirtychange")); }
export async function confirmLeave(prefix = "") {
  if (!isDirty(prefix)) return true;
  const ok = await confirmDialog({ title: "Kaydedilmemiş değişiklikler", message: "Yaptığınız değişiklikler kaydedilmedi. Kaydetmeden çıkılsın mı?", okLabel: "Kaydetmeden çık", danger: true });
  if (ok) clearDirty(prefix);
  return ok;
}
window.addEventListener("beforeunload", (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ""; } });

/** Form değerlerinin anlık görüntüsü (değişiklik takibi için) */
export function snapshot(root) {
  return JSON.stringify($$("input, select, textarea", root).filter((el) => el.name || el.id).map((el) => (el.type === "checkbox" || el.type === "radio" ? el.checked : el.type === "file" ? "" : el.value)));
}
/** Form içinde değişiklik olunca anahtarı kirli işaretler */
export function trackForm(root, key, label) {
  let base = snapshot(root);
  const check = () => setDirty(key, snapshot(root) !== base, label);
  root.addEventListener("input", check);
  root.addEventListener("change", check);
  return { reset() { base = snapshot(root); setDirty(key, false); }, check, changed: () => snapshot(root) !== base };
}

// ---------- Pencere (dialog) ----------
let modalSeq = 0;
/**
 * openModal({ title, body, submitLabel, cancelLabel, size, danger, onSubmit, guard, hideSubmit, extraFoot })
 * onSubmit(form, ctl) → true/undefined kapatır, false açık bırakır. Hata atarsa mesaj pencerede gösterilir.
 */
export function openModal(opts) {
  const id = `m${++modalSeq}`;
  const dlg = h(`<dialog class="modal ${opts.size || ""}" aria-labelledby="${id}t">
    <form class="modal-form" novalidate>
      <div class="modal-head"><h3 id="${id}t">${esc(opts.title)}</h3>
        <button type="button" class="icon-btn" data-x aria-label="Kapat">${icon("x")}</button></div>
      <div class="modal-body">${opts.body || ""}</div>
      <div class="modal-foot"><p class="form-error" role="alert"></p>${opts.extraFoot || ""}
        <button type="button" class="btn" data-x>${esc(opts.cancelLabel || "Vazgeç")}</button>
        ${opts.hideSubmit ? "" : `<button type="submit" class="btn ${opts.danger ? "btn-danger" : "btn-primary"}" data-ok>${esc(opts.submitLabel || "Kaydet")}</button>`}
      </div>
    </form></dialog>`);
  document.body.append(dlg);
  const form = dlg.querySelector("form");
  const err = dlg.querySelector(".form-error");
  const okBtn = dlg.querySelector("[data-ok]");
  let base = "";
  let resolveClosed;
  const closed = new Promise((r) => (resolveClosed = r));
  const ctl = {
    dlg, form, closed,
    setError(m) { err.textContent = m || ""; },
    busy(on) { if (okBtn) { okBtn.disabled = on; okBtn.classList.toggle("is-busy", on); } },
    markClean() { base = snapshot(form); },
    close(result) { if (dlg.open) dlg.close(); dlg.remove(); resolveClosed(result); },
  };
  async function tryClose() {
    if (opts.guard !== false && base && snapshot(form) !== base) {
      const ok = await confirmDialog({ title: "Değişiklikler kaydedilmedi", message: "Pencereyi kapatırsanız yaptığınız değişiklikler kaybolur.", okLabel: "Kapat", danger: true });
      if (!ok) return;
    }
    ctl.close(null);
  }
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); tryClose(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) tryClose(); });
  $$("[data-x]", dlg).forEach((b) => b.addEventListener("click", tryClose));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!opts.onSubmit) return ctl.close(true);
    ctl.setError("");
    ctl.busy(true);
    try {
      const r = await opts.onSubmit(form, ctl);
      if (r !== false) ctl.close(r === undefined ? true : r);
    } catch (ex) {
      if (ex && ex.status !== 401) ctl.setError(ex.message || String(ex));
    } finally {
      ctl.busy(false);
    }
  });
  dlg.showModal();
  if (opts.onOpen) opts.onOpen(form, ctl);
  base = snapshot(form);
  const first = form.querySelector("[autofocus]") || form.querySelector(".modal-body input:not([type=hidden]):not([type=checkbox]), .modal-body select, .modal-body textarea");
  if (matchMedia("(max-width: 699px)").matches) {
    // Telefonda klavye kendiliğinden açılmasın: pencerenin kendisine odaklan
    if (document.activeElement && dlg.contains(document.activeElement)) document.activeElement.blur();
    dlg.querySelector(".modal-head h3").setAttribute("tabindex", "-1");
    dlg.querySelector(".modal-head h3").focus({ preventScroll: true });
  } else if (first) first.focus();
  return ctl;
}

export function confirmDialog({ title, message, okLabel = "Evet", cancelLabel = "Vazgeç", danger = false, details }) {
  const ctl = openModal({
    title, size: "narrow confirm", danger, submitLabel: okLabel, cancelLabel, guard: false,
    body: `<p style="margin:0">${esc(message)}</p>${details ? `<div class="callout warn">${icon("alert")}<div>${esc(details)}</div></div>` : ""}`,
    onSubmit: () => true,
  });
  return ctl.closed.then((r) => r === true);
}

// ---------- Açılır menü ----------
let openMenuEl = null;
export function closeMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
export function openMenu(anchor, items) {
  closeMenu();
  const m = h(`<div class="menu" role="menu">${items.map((it, i) => (it === "-" ? "<hr>" : it.href
    ? `<a role="menuitem" href="${esc(it.href)}" target="_blank" rel="noopener" data-i="${i}" class="${it.danger ? "danger" : ""}">${it.icon ? icon(it.icon) : ""}${esc(it.label)}</a>`
    : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? "danger" : ""}">${it.icon ? icon(it.icon) : ""}${esc(it.label)}</button>`)).join("")}</div>`);
  document.body.append(m);
  openMenuEl = m;
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let left = Math.min(window.innerWidth - mw - 8, Math.max(8, r.right - mw));
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  m.style.left = `${left}px`; m.style.top = `${top}px`;
  m.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    const it = items[Number(b.dataset.i)];
    closeMenu();
    if (it.onClick) { e.preventDefault(); it.onClick(); }
  });
  const first = m.querySelector("[data-i]");
  if (first) first.focus();
  m.addEventListener("keydown", (e) => {
    const all = $$("[data-i]", m);
    const i = all.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); all[(i + 1) % all.length].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); all[(i - 1 + all.length) % all.length].focus(); }
    if (e.key === "Escape") { closeMenu(); anchor.focus(); }
  });
}
document.addEventListener("pointerdown", (e) => { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); }, true);
window.addEventListener("resize", closeMenu);
window.addEventListener("scroll", closeMenu, true);

// ---------- Toplu işlem çubuğu ----------
let bulkEl = null;
/**
 * showBulk({ count, canSelectAll, allCount, onSelectAll, onClear, actions: [{ id, label, icon, cls, title }], onAction })
 * count 0 ise çubuk gizlenir.
 */
export function showBulk(cfg) {
  if (!cfg || !cfg.count) { hideBulk(); return; }
  if (!bulkEl) {
    bulkEl = h(`<div class="bulkbar" role="region" aria-label="Toplu işlem"></div>`);
    document.body.append(bulkEl);
  }
  document.body.classList.add("has-bulk");
  bulkEl.innerHTML = `
    <button type="button" class="icon-btn sm" data-bulk="clear" aria-label="Seçimi kaldır">${icon("x")}</button>
    <span class="sel-count" role="status">${cfg.count} seçili</span>
    ${cfg.canSelectAll ? `<button type="button" class="sel-all" data-bulk="all">Tümünü seç (${cfg.allCount})</button>` : ""}
    <div class="acts">${cfg.actions.map((a) => `<button type="button" class="btn ${a.cls || ""}" data-bulk="${a.id}" ${a.title ? `title="${esc(a.title)}"` : ""}>${a.icon ? icon(a.icon, "i-sm") : ""}${esc(a.label)}</button>`).join("")}</div>`;
  bulkEl.onclick = (e) => {
    const b = e.target.closest("[data-bulk]");
    if (!b) return;
    const id = b.dataset.bulk;
    if (id === "clear") cfg.onClear();
    else if (id === "all") cfg.onSelectAll();
    else cfg.onAction(id, b);
  };
}
export function hideBulk() {
  if (bulkEl) { bulkEl.remove(); bulkEl = null; }
  document.body.classList.remove("has-bulk");
}

// ---------- Görsel küçültme (istemcide) ----------
export function resizeImage(file, max = 1000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("Lütfen JPG, PNG veya WEBP bir görsel seçin."));
    if (file.size > 25 * 1024 * 1024) return reject(new Error("Görsel çok büyük (en fazla 25 MB)."));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let data = c.toDataURL("image/webp", quality);
      if (!data.startsWith("data:image/webp")) data = c.toDataURL("image/jpeg", quality);
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Görsel okunamadı.")); };
    img.src = url;
  });
}

/** Dosyayı metin olarak okur; UTF-8 değilse Windows-1254 (Excel TR) olarak çözer */
export async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1254").decode(buf);
  }
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Telefonu WhatsApp biçimine çevirir: 05321234567 → 905321234567 */
export function waNumber(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) return "9" + d;
  if (d.length === 10) return "90" + d;
  return d;
}
export function fmtPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  return p || "";
}

/** Sayfa içi gezinme (main.js atar) */
export const nav = { go: (path) => { location.href = path; } };
