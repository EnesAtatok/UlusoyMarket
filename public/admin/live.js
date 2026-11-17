// Canlı olaylar (SSE, docs/API.md §3.1): yeni/güncellenen siparişler, mağaza durumu, oturum kapanışı.
// Akış bileti tek kullanımlık olduğu için EventSource'un kendi yeniden bağlanması kullanılmaz:
// her kopuşta yeni bilet alınır (artan bekleme). Akış yokken siparişler ?since= yoklamasıyla gelir (orders.js).
import { api, state } from "./core.js";

const WAITS = [2000, 5000, 15000, 30000];
const handlers = new Map(); // olay adı → [fn]
let es = null;
let timer = null;
let tries = 0;
let lastId = 0;
let boot = null;
let running = false;
let current = "poll"; // "live" | "connecting" | "poll"

/** Olay dinleyicisi: "siparis.yeni", "siparis.guncellendi", "siparis.silindi", "durum", "yenile", "state", "connected" */
export function onLive(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
}
function emit(name, data) { for (const fn of handlers.get(name) || []) { try { fn(data); } catch (e) { console.error(e); } } }

export const liveState = () => current;
function setState(s) {
  if (s === current) return;
  current = s;
  renderIndicator();
  emit("state", s);
}

function renderIndicator() {
  const el = document.getElementById("liveInd");
  if (!el) return;
  el.dataset.state = current;
  const txt = { live: "Canlı", connecting: "Yeniden bağlanıyor…", poll: "Yoklama" }[current];
  const title = {
    live: "Canlı bağlantı açık: yeni siparişler anında gelir.",
    connecting: "Canlı bağlantı koptu, yeniden bağlanılıyor. Bu sırada siparişler 12 saniyede bir kontrol edilir.",
    poll: "Canlı bağlantı kurulamadı: siparişler 12 saniyede bir kontrol ediliyor. Yeniden denemek için dokunun.",
  }[current];
  el.querySelector(".lbl").textContent = txt;
  el.title = title;
  el.setAttribute("aria-label", `Bağlantı: ${txt}. ${title}`);
}

function closeStream() {
  if (es) { es.onerror = null; es.close(); es = null; }
}

function schedule(ms) {
  clearTimeout(timer);
  if (!running) return;
  const wait = ms ?? WAITS[Math.min(tries, WAITS.length - 1)];
  tries++;
  // İlk denemeler "yeniden bağlanıyor", uzun süre kurulamazsa "yoklama" görünür
  setState(tries > 2 ? "poll" : "connecting");
  timer = setTimeout(connect, wait);
}

async function connect() {
  clearTimeout(timer);
  if (!running || !state.token) return;
  closeStream();
  if (typeof EventSource === "undefined") { setState("poll"); return; }
  let ticket;
  try {
    ({ ticket } = await api("/api/admin/stream-ticket", { method: "POST" }));
  } catch (e) {
    if (e && e.status === 401) return; // giriş ekranına dönülüyor
    schedule();
    return;
  }
  if (!running) return;
  const src = new EventSource(`/api/admin/stream?ticket=${encodeURIComponent(ticket)}${lastId ? `&lastEventId=${lastId}` : ""}`);
  es = src;
  const track = (e) => { const n = Number(e.lastEventId); if (n > lastId) lastId = n; };
  src.addEventListener("hello", (e) => {
    let d = {};
    try { d = JSON.parse(e.data); } catch { /* boş */ }
    const restarted = boot && d.boot !== boot;
    if (restarted) lastId = 0; // sunucu yeniden başladı: olay numaraları sıfırlandı
    boot = d.boot;
    tries = 0;
    setState("live");
    emit("connected", { restarted, status: d.status });
  });
  for (const name of ["siparis.yeni", "siparis.guncellendi", "siparis.silindi", "durum"]) {
    src.addEventListener(name, (e) => {
      track(e);
      let d = null;
      try { d = JSON.parse(e.data); } catch { return; }
      emit(name, d);
    });
  }
  src.addEventListener("yenile", (e) => {
    track(e);
    let d = {};
    try { d = JSON.parse(e.data); } catch { /* boş */ }
    emit("yenile", d);
  });
  src.addEventListener("oturum", (e) => {
    let d = {};
    try { d = JSON.parse(e.data); } catch { /* boş */ }
    stopLive();
    document.dispatchEvent(new CustomEvent("forcelogin", { detail: d.reason ? `${d.reason} Lütfen yeniden giriş yapın.` : "Oturumunuz kapandı. Lütfen yeniden giriş yapın." }));
  });
  src.addEventListener("kapanis", () => {
    if (es !== src) return;
    closeStream();
    tries = 0;
    schedule(3000);
  });
  src.onerror = () => {
    if (es !== src) return;
    // Bilet harcandığı için tarayıcının kendi yeniden denemesi işe yaramaz: kapat, yeni biletle bağlan
    closeStream();
    schedule();
  };
}

export function startLive() {
  running = true;
  tries = 0;
  setState("connecting");
  connect();
}
export function stopLive() {
  running = false;
  clearTimeout(timer);
  closeStream();
  setState("poll");
}
/** Bağlantı yoksa hemen dene (gösterge tıklaması, çevrimiçi olunca) */
export function reconnectNow() {
  if (!running || current === "live") return;
  tries = 0;
  connect();
}

window.addEventListener("online", reconnectNow);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reconnectNow(); });
document.addEventListener("click", (e) => {
  if (!e.target.closest("#liveInd")) return;
  if (current === "live") return;
  reconnectNow();
});
renderIndicator();
