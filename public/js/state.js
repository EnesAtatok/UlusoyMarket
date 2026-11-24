// Uygulama durumu, sepet işlemleri ve sunucu teklifi (POST /api/cart/quote).
import { load, save, api, debounce, roundQty } from "./lib.js";

const listeners = {};
export const on = (ev, fn) => (listeners[ev] ||= []).push(fn);
export const emit = (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data));

const profile = load("profile", {}) || {};
// "Bilgilerimi bu cihazda sakla" (YASAL.md §2.2 E): varsayılan kapalı. Önceki sürümde bilgileri zaten saklanmış
// cihazlarda tercih açık sayılır (veri kaybolmasın); kutu kaldırılırsa ad, telefon ve adresler silinir.
if (typeof profile.remember !== "boolean") profile.remember = !!(profile.name || profile.phone || (load("addresses", []) || []).length);
const PERSONAL = ["name", "phone"];

export const S = {
  store: null, // GET /api/store yanıtı
  products: [],
  byId: new Map(),
  categories: [],
  catById: new Map(),
  cart: sanitizeCartShape(load("cart", {})), // { productId: adet } — eski prototiple aynı anahtar
  favs: new Set(load("favs", [])),
  myOrders: sanitizeMyOrders(load("myOrders", [])), // [{ id, token }] — eski prototiple aynı anahtar
  orderData: [], // takip nesneleri
  ordersLoaded: false,
  profile, // { name, phone, payment, substitution }
  // [{ id, zoneId, address }] — id HTML özniteliğine/seçiciye girdiği için biçimi denetlenir
  addresses: (Array.isArray(load("addresses", [])) ? load("addresses", []) : []).filter(
    (a) => a && /^[a-z0-9]{1,20}$/.test(String(a.id)) && typeof a.address === "string"
  ),
  delivery: { type: profile.type === "gelal" ? "gelal" : "teslimat", zoneId: profile.zoneId ?? null },
  coupon: load("coupon", ""), // uygulanmış kupon kodu
  couponMsg: null, // { valid, message, code }
  quote: null,
  quoteError: null,
  quoteLoading: false,
  notices: [], // sepetten çıkarılan / adedi düşürülen ürün mesajları
  offline: !navigator.onLine,
};

function sanitizeMyOrders(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .map((o) => ({ id: Number(o && o.id), token: String((o && o.token) || "") }))
    .filter((o) => o.id > 0 && o.token && !seen.has(o.id) && seen.add(o.id))
    .slice(0, 30);
}

function sanitizeCartShape(c) {
  const out = {};
  if (c && typeof c === "object" && !Array.isArray(c)) {
    for (const [k, v] of Object.entries(c)) {
      const q = Math.round(Number(v) * 10) / 10; // ürün henüz bilinmiyor: 100 g'a yuvarla, setStore ürüne göre düzeltir
      if (Number(k) > 0 && q > 0) out[k] = Math.min(q, 99);
    }
  }
  return out;
}

export function setStore(data) {
  S.store = data;
  S.products = data.products || [];
  S.byId = new Map(S.products.map((p) => [p.id, p]));
  S.categories = (data.categories || []).filter((c) => S.products.some((p) => p.categoryId === c.id));
  S.catById = new Map((data.categories || []).map((c) => [c.id, c]));
  // Artık satılmayan ürünleri sepetten çıkar, adetleri sınıra çek
  let changed = false;
  for (const id of Object.keys(S.cart)) {
    const p = S.byId.get(Number(id));
    const fixed = p ? Math.min(roundQty(S.cart[id], p), p.maxQty || 0) : 0;
    if (!p || p.soldOut || !p.maxQty || fixed <= 0) {
      delete S.cart[id];
      changed = true;
    } else if (S.cart[id] !== fixed) {
      S.cart[id] = fixed; // sınıra çekilir; adetle satılan üründe kesirli miktar tam sayıya iner
      changed = true;
    }
  }
  // Bölge artık yoksa seçimi kaldır
  if (S.delivery.zoneId && !zones().some((z) => z.id === S.delivery.zoneId)) S.delivery.zoneId = null;
  if (S.delivery.type === "gelal" && !data.ordering?.pickupEnabled) S.delivery.type = "teslimat";
  if (changed) saveCart();
}

export const zones = () => S.store?.zones || [];
export const zoneById = (id) => zones().find((z) => z.id === Number(id)) || null;
export const status = () => S.store?.status || {};
export const storeInfo = () => S.store?.store || {};

// ---------- Sepet ----------
export function saveCart() {
  save("cart", S.cart);
}
export const qtyOf = (id) => S.cart[id] || 0;
export function setQty(id, qty, { silent = false } = {}) {
  const p = S.byId.get(Number(id));
  let q = Math.max(0, p && p.unit === "kg" ? roundQty(qty, p) : Math.floor(qty));
  if (!p || p.soldOut) q = 0;
  else q = Math.min(q, p.maxQty || 99);
  if (q <= 0) delete S.cart[id];
  else S.cart[id] = q;
  saveCart();
  if (!silent) emit("cart", { id: Number(id), qty: q });
  return q;
}
export function clearCart() {
  S.cart = {};
  saveCart();
  emit("cart", {});
}
export const cartLines = () =>
  Object.entries(S.cart)
    .map(([id, qty]) => ({ product: S.byId.get(Number(id)), qty }))
    .filter((l) => l.product);
// Rozetteki sayı: kiloluk ürün miktarından bağımsız 1 kalem sayılır (1,5 kg muz → 1)
export const cartCount = () => cartLines().reduce((s, l) => s + (l.product.unit === "kg" ? 1 : l.qty), 0);
/** Yalnızca anlık gösterim için; ödeme öncesi tutarı sunucu teklifi belirler */
export const cartLocalTotal = () => Math.round(cartLines().reduce((s, l) => s + l.product.price * l.qty, 0) * 100) / 100;

export function toggleFav(id) {
  if (S.favs.has(id)) S.favs.delete(id);
  else S.favs.add(id);
  save("favs", [...S.favs]);
  emit("favs", id);
  return S.favs.has(id);
}

export function setDelivery(patch) {
  Object.assign(S.delivery, patch);
  S.profile.type = S.delivery.type;
  S.profile.zoneId = S.delivery.zoneId;
  persistProfile();
  emit("delivery");
  requestQuote();
}
export function saveProfile(patch) {
  Object.assign(S.profile, patch);
  persistProfile();
}
function persistProfile() {
  const p = { ...S.profile };
  if (!p.remember) for (const k of PERSONAL) delete p[k];
  save("profile", p);
}
/** "Bu cihazdaki bilgilerimi sil": ad, telefon ve kayıtlı adresler cihazdan silinir */
export function forgetPersonal() {
  for (const k of PERSONAL) delete S.profile[k];
  S.profile.remember = false;
  S.addresses = [];
  save("addresses", null);
  persistProfile();
}

export function setCoupon(code) {
  S.coupon = String(code || "").trim();
  S.couponMsg = null;
  save("coupon", S.coupon || null);
  requestQuote.flush();
}

// ---------- Sunucu teklifi ----------
let quoteCtl = null;
let quoteSeq = 0;
export function quoteBody() {
  return {
    items: cartLines().map((l) => ({ productId: l.product.id, qty: l.qty })),
    type: S.delivery.type,
    zoneId: S.delivery.type === "teslimat" ? S.delivery.zoneId : undefined,
    couponCode: S.coupon || undefined,
    phone: /^0\d{10}$/.test(S.profile.phone || "") ? S.profile.phone : undefined,
    payment: S.profile.payment === "kart" || S.profile.payment === "nakit" ? S.profile.payment : undefined,
  };
}

async function runQuote() {
  if (!S.store) return;
  if (!cartLines().length) {
    S.quote = null;
    S.quoteLoading = false;
    emit("quote");
    return;
  }
  quoteCtl?.abort();
  quoteCtl = new AbortController();
  const seq = ++quoteSeq;
  S.quoteLoading = true;
  emit("quoteLoading");
  try {
    const q = await api("/api/cart/quote", { method: "POST", body: quoteBody(), signal: quoteCtl.signal });
    if (seq !== quoteSeq) return;
    applyQuote(q);
    S.quoteError = null;
  } catch (e) {
    if (e.name === "AbortError") return;
    S.quoteError = e.message;
  } finally {
    if (seq === quoteSeq) {
      S.quoteLoading = false;
      emit("quote");
    }
  }
}

/** Teklifi uygular: sunucunun çıkardığı/düşürdüğü kalemleri sepete yansıtır, geçersiz kuponu kaldırır */
export function applyQuote(q) {
  S.quote = q;
  const notices = [];
  for (const r of q.removed || []) {
    if (S.cart[r.productId]) {
      delete S.cart[r.productId];
      const name = r.name || S.byId.get(r.productId)?.name;
      // Sunucu nedeni ürün adını zaten içeriyorsa ("X" tükendi.) ad tekrar yazılmaz
      notices.push(name && !String(r.reason).includes(name) ? `${name}: ${r.reason}` : r.reason);
    }
  }
  for (const a of q.adjusted || []) {
    if (S.cart[a.productId] && S.cart[a.productId] !== a.qty) {
      S.cart[a.productId] = a.qty;
      notices.push(a.reason);
    }
  }
  if (notices.length) {
    S.notices = notices;
    saveCart();
    emit("cart", {});
  }
  if (q.coupon) {
    S.couponMsg = { valid: !!q.coupon.valid, message: q.coupon.message, code: q.coupon.code };
    if (!q.coupon.valid) {
      // Geçersiz kupon siparişi reddettirir: sepetten kaldır, mesajı göster
      S.coupon = "";
      save("coupon", null);
    }
  }
}

export const requestQuote = debounce(runQuote, 250);

/** Sepet ekranında yok sayılabilecek hata (bölge henüz seçilmedi) */
export const blockingErrors = (q, { ignoreZone = false } = {}) =>
  (q?.errors || []).filter((e) => !(ignoreZone && e.code === "BOLGE_SECIN"));
