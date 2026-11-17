// Canlı güncelleme (docs/API.md §2.5–2.7). Sekme başına TEK EventSource açılır (HTTP/1.1'de tarayıcının
// alan adı başına ~6 bağlantı sınırı sekmeler arasında paylaşılır):
// - Bu cihazda süren sipariş varsa (ya da takip/Siparişlerim açıksa) "sipariş" kipi: bilet al → /api/orders/stream.
//   Bu akış sipariş olaylarının yanında mağaza durumunu ("durum") da taşır.
// - Yoksa "durum" kipi: kimliksiz /api/store/stream; yalnızca herkese açık mağaza durumu (saat, sipariş alımı).
// Bilet tek kullanımlık olduğundan bağlantı kapanınca (readyState === CLOSED) yeniden, artan beklemeyle bağlanılır.
// Akış açık değilken (kurulamadı, sınır, çevrimdışı, sekme gizli) yoklama sürer; sekme görünür olunca ve
// "online" olayında hemen bir kez çekilip yeniden bağlanılır. Tüm zamanlayıcılar burada, tek yerde.
import { api } from "./lib.js";
import { S } from "./state.js";
import { fetchMyOrders, applyOrders, removeOrders, activeOrders } from "./orders.js";

const POLL_MS = 15000;
const IDLE_POLL_MS = 60000; // aktif sipariş yokken (yalnızca Siparişlerim/takip açıkken)
const BACKOFF = [2000, 5000, 15000, 30000];

let es = null;
let esKey = "";
let connecting = false;
let lastId = 0;
let boot = "";
let attempt = 0;
let retryTimer = null;
let pollTimer = null;
let started = false;
let watching = () => false; // takip/siparişlerim ekranı açık mı (app.js verir)
let onStatus = () => {}; // mağaza durumu değişti (app.js verir: /api/store yeniden çekilir)
let statusTimer = null;

export const liveState = { connected: false, mode: "" };

const pairs = () => S.myOrders.slice(0, 30).map((o) => ({ id: o.id, token: o.token }));
const keyOf = () => pairs().map((p) => p.id).sort((a, b) => a - b).join(",");
const enabled = () => S.store?.features?.liveUpdates !== false && typeof EventSource === "function";
/** Sipariş akışı gerekli mi: cihazda sipariş var ve en az biri sürüyor (ya da durumları henüz bilinmiyor) */
const wantedOrders = () => S.myOrders.length > 0 && (!S.ordersLoaded || activeOrders().length > 0 || watching());
const modeKey = () => (wantedOrders() ? `o:${keyOf()}` : "p");

function closeStream() {
  if (es) {
    es.close();
    es = null;
  }
  esKey = "";
  liveState.connected = false;
  liveState.mode = "";
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  const wait = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
  attempt++;
  retryTimer = setTimeout(connect, wait);
}

/** Durum olayı: çok sayıda açık sayfa aynı anda /api/store çekmesin diye küçük, rastgele gecikmeyle */
function statusChanged(status, force) {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => onStatus(status, force), force ? Math.round(Math.random() * 1200) : 0);
}

function listenCommon(src) {
  src.addEventListener("durum", (e) => {
    if (es !== src) return;
    if (e.lastEventId) lastId = Number(e.lastEventId) || lastId;
    let d = {};
    try { d = JSON.parse(e.data); } catch {}
    statusChanged(d.status, true);
  });
  for (const name of ["yenile", "kapanis"]) {
    src.addEventListener(name, () => {
      if (es !== src) return;
      closeStream();
      if (name === "yenile" && S.myOrders.length) fetchMyOrders().catch(() => {});
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, 3000);
    });
  }
  src.onerror = () => {
    if (es !== src) return;
    liveState.connected = false;
    if (src.readyState === EventSource.CLOSED) {
      closeStream();
      scheduleRetry();
    }
    // CONNECTING: tarayıcı kendisi deniyor; tek kullanımlık bilet reddedilince CLOSED olur ve yukarıya düşer
  };
}

function onHello(src, e) {
  if (es !== src) return null;
  attempt = 0;
  liveState.connected = true;
  let d = {};
  try { d = JSON.parse(e.data); } catch {}
  if (boot && d.boot && d.boot !== boot) lastId = 0; // sunucu yeniden başladı: olay numaraları sıfırlandı
  boot = d.boot || boot;
  if (d.status) statusChanged(d.status, false);
  return d;
}

function connectPublic() {
  const src = new EventSource("/api/store/stream");
  es = src;
  esKey = "p";
  liveState.mode = "durum";
  src.addEventListener("hello", (e) => onHello(src, e));
  listenCommon(src);
}

async function connect() {
  clearTimeout(retryTimer);
  if (connecting || document.hidden || !navigator.onLine || !enabled() || !S.store) return;
  const key = modeKey();
  if (es && esKey === key && es.readyState !== EventSource.CLOSED) return;
  closeStream();
  if (key === "p") return connectPublic();
  connecting = true;
  let ticket;
  try {
    ticket = await api("/api/orders/stream-ticket", { method: "POST", body: { orders: pairs() } });
  } catch (e) {
    connecting = false;
    if (e.status === 404) {
      // Hiçbir sipariş tutmadı (silinmiş): listeyi tazele; o arada durum akışına geç
      fetchMyOrders().catch(() => {}).finally(() => connect());
      return;
    }
    scheduleRetry();
    return;
  }
  connecting = false;
  if (document.hidden || modeKey() !== key) {
    // Beklerken sekme gizlendi ya da liste değişti: bileti harcamadan yeniden dene
    if (!document.hidden) connect();
    return;
  }
  const src = new EventSource(`/api/orders/stream?ticket=${encodeURIComponent(ticket.ticket)}${lastId ? `&lastEventId=${lastId}` : ""}`);
  es = src;
  esKey = key;
  liveState.mode = "siparis";
  src.addEventListener("hello", (e) => {
    const d = onHello(src, e);
    if (d && Array.isArray(d.orders)) applyOrders(d.orders, { source: "sse" });
  });
  src.addEventListener("siparis", (e) => {
    if (es !== src) return;
    lastId = Number(e.lastEventId) || lastId;
    try { applyOrders([JSON.parse(e.data)], { source: "sse" }); } catch {}
  });
  src.addEventListener("siparis.silindi", (e) => {
    if (es !== src) return;
    lastId = Number(e.lastEventId) || lastId;
    try { removeOrders([JSON.parse(e.data).id]); } catch {}
  });
  listenCommon(src);
}

function poll() {
  clearTimeout(pollTimer);
  // Akış açıkken de seyrek bir denetim yapılır (kaçan olay olursa düzelir)
  const sipLive = liveState.connected && liveState.mode === "siparis";
  const ms = sipLive ? POLL_MS * 4 : activeOrders().length || !S.ordersLoaded ? POLL_MS : IDLE_POLL_MS;
  pollTimer = setTimeout(async () => {
    if (!document.hidden && navigator.onLine && S.myOrders.length && (activeOrders().length || !S.ordersLoaded || watching())) {
      await fetchMyOrders().catch(() => {});
      if (!sipLive) connect();
    }
    poll();
  }, ms);
}

/** Cihazdaki sipariş listesi ya da ekran değişti: gerekirse kip değiştir (sipariş ↔ durum) */
export function refreshLive() {
  if (!started) return;
  if (modeKey() !== esKey) connect();
}

/** Ekrana dönüldü / ağ geldi: hemen çek ve bağlan */
export function wakeLive() {
  if (!S.myOrders.length) return connect();
  fetchMyOrders().catch(() => {}).finally(() => connect());
}

export function startLive({ isWatching, onStatusChange } = {}) {
  if (started) return;
  started = true;
  if (isWatching) watching = isWatching;
  if (onStatusChange) onStatus = onStatusChange;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      closeStream(); // pil: gizli sekmede akışı kapat, görünür olunca yeniden aç
      clearTimeout(retryTimer);
    } else wakeLive();
  });
  window.addEventListener("online", () => {
    attempt = 0;
    wakeLive();
  });
  window.addEventListener("offline", () => closeStream());
  window.addEventListener("pagehide", () => closeStream());
  connect();
  poll();
}
