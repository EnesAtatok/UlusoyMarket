// Ortak yardımcılar: biçimlendirme, kaçışlama, arama normalleştirme, kalıcı kayıt, API çağrısı, bildirim.

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const TL = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
/** Para: ₺1.234,50 */
export const tl = (n) => TL.format(Number(n) || 0);

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** Türkçe karakter ve büyük/küçük harf duyarsız arama anahtarı ("Süt" → "sut") */
const FOLD = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
export function fold(s) {
  return String(s ?? "")
    .toLocaleLowerCase("tr")
    .replace(/̇/g, "")
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] || c)
    .replace(/\s+/g, " ")
    .trim();
}

export const icon = (name, cls = "") => `<svg class="i${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export const telHref = (phone) => "tel:" + String(phone || "").replace(/[^\d+]/g, "");
export const waHref = (num, text) => `https://wa.me/${String(num || "").replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export const fmtTime = (iso) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

// ---------- Kalıcı kayıt (localStorage; erişilemezse sessizce bellekte kalır) ----------
export function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
export function save(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ---------- API ----------
export class ApiError extends Error {
  constructor(message, { status = 0, code = "", data = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}
/** JSON isteği; hata durumunda sunucunun Türkçe mesajıyla ApiError fırlatır */
export async function api(path, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError("Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.", { code: "AG" });
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    throw new ApiError((data && data.error) || "Beklenmeyen bir sorun oluştu. Lütfen tekrar deneyin.", {
      status: res.status,
      code: (data && data.code) || "",
      data,
    });
  }
  return data;
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = (...a) => {
    clearTimeout(t);
    fn(...a);
  };
  return d;
}

// ---------- Bildirim ----------
export function toast(msg, { tone = "info", ms = 2600 } = {}) {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = `toast toast-${tone}`;
  el.textContent = msg;
  box.append(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, ms);
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Miktar: kiloyla satılan üründe 100 gram hassasiyet (1,5 kg = 1 kg 500 g), diğerlerinde tam adet
export const qtyStep = (p) => (p && p.unit === "kg" ? 0.1 : 1);
/** Miktarı ürünün adımına yuvarlar (kayan nokta kalıntısı kalmaz) */
export const roundQty = (q, p) => (p && p.unit === "kg" ? Math.round((Number(q) || 0) * 10) / 10 : Math.floor(Number(q) || 0));
export const fmtQty = (q) => (Number(q) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
/** "1,5 kg" / "3 adet" */
export const qtyText = (q, unit) => `${fmtQty(q)} ${unit || "adet"}`;
