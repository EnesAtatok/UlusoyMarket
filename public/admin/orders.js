// Siparişler: liste + ayrıntı, durum ilerletme, kalem düzenleme, iptal notu, fiş yazdırma, elle sipariş,
// "since" ile yoklama, sesli uyarı (Web Audio), sekme sayacı, tarayıcı bildirimi.
import {
  state, $, $$, esc, icon, h, api, tl, toast, toastErr, isAdmin, bulkResult, openModal, confirmDialog, openMenu,
  showBulk, hideBulk, fmtTime, fmtDateTime, ago, minutesSince, dayStr, addDays, fold, debounce, waNumber, fmtPhone,
  download, setDirty, readLS, writeLS, loadCatalog, nav, parseNum, ACTIVE, isSoldOut, openAuthed, CAYMA,
} from "./core.js";
import { onLive, startLive, stopLive, liveState } from "./live.js";

// ---------- Etiketler ----------
const TABS = [["aktif", "Aktif"], ["Yeni", "Yeni"], ["Hazırlanıyor", "Hazırlanıyor"], ["Yolda", "Yolda"], ["Teslim edildi", "Teslim edildi"], ["İptal", "İptal"], ["", "Tümü"]];
// Miktar: kiloluk üründe düğmeler yarım kilo, elle 100 g hassasiyet (1,3 kg); diğerlerinde tam adet
const qStep = (unit) => (unit === "kg" ? 0.5 : 1);
const qRound = (n, unit) => (unit === "kg" ? Math.round(n * 10) / 10 : Math.floor(n));
const fq = (q) => String(q).replace(".", ",");
const unitOf = (id) => (state.products.find((x) => x.id === id) || {}).unit;
const BADGE = { Yeni: "b-new", Hazırlanıyor: "b-prep", Yolda: "b-road", "Teslim edildi": "b-done", İptal: "b-cancel" };
const SUBST = { ara: "Beni arayın", benzer: "Benzeriyle değiştirin", cikar: "Siparişten çıkarın" };
const FLOW = ["Yeni", "Hazırlanıyor", "Yolda", "Teslim edildi"];
const statusText = (o, s = o.status) => (s === "Yolda" && o.type === "gelal" ? "Hazır (gel-al)" : s);
const badge = (o) => `<span class="badge ${BADGE[o.status] || ""}">${esc(statusText(o))}</span>`;
function nextStep(o) {
  if (o.status === "Yeni") return { status: "Hazırlanıyor", label: "Hazırlamaya başla" };
  if (o.status === "Hazırlanıyor") return o.type === "gelal" ? { status: "Yolda", label: "Hazır, teslim alınabilir" } : { status: "Yolda", label: "Yola çıkar" };
  if (o.status === "Yolda") return { status: "Teslim edildi", label: o.type === "gelal" ? "Teslim alındı" : "Teslim edildi" };
  return null;
}
const payLabel = (o) => (o.payment === "kart" ? "Kapıda kart" : "Kapıda nakit");
const CHANNEL = { telefon: "Telefon araması", whatsapp: "WhatsApp", sms: "SMS" };
const RR_STATUS = ["Yeni", "İnceleniyor", "Sonuçlandı", "Reddedildi"];
const RR_BADGE = { Yeni: "b-new", İnceleniyor: "b-info", Sonuçlandı: "b-ok", Reddedildi: "b-muted" };
const openReturns = (o) => (o.returnRequests || []).filter((r) => r.status === "Yeni" || r.status === "İnceleniyor").length;
// Web siparişinde ikinci kanaldan teyit (E-ticaret Yön. m.9/1) henüz kaydedilmediyse
const needsConfirm = (o) => o.source === "web" && ["Yeni", "Hazırlanıyor"].includes(o.status) && !(o.confirmations || []).length;
const isMasked = (o) => !!o.masked;
const shortName = (n) => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || ""; };
const itemCount = (o) => o.items.reduce((t, i) => t + i.qty, 0);

// ---------- Ses (Web Audio ile üretilen uyarı) ----------
export const audio = {
  ctx: null,
  get enabled() { return readLS("panelSound") !== "0"; },
  set enabled(v) { writeLS("panelSound", v ? "1" : "0"); renderSoundBtn(); },
  unlock() {
    try {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC(); }
      if (this.ctx.state === "suspended") this.ctx.resume();
    } catch { /* desteklenmiyor */ }
    setTimeout(updateAudioHint, 50);
  },
  get ready() { return !!(this.ctx && this.ctx.state === "running"); },
  chime() {
    if (!this.enabled) return false;
    this.unlock();
    if (!this.ready) { updateAudioHint(true); return false; }
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    // İki kez çalan üç notalı "ding-dong-ding": tezgâhta duyulacak kadar belirgin, rahatsız etmeyecek kadar kısa
    const notes = [[880, 0], [1175, 0.16], [1568, 0.32], [880, 0.9], [1175, 1.06], [1568, 1.22]];
    for (const [f, dt] of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + dt);
      o.stop(t0 + dt + 0.55);
    }
    return true;
  },
};
function renderSoundBtn() {
  const b = $("#soundBtn");
  if (!b) return;
  const on = audio.enabled;
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", on ? "Sesli uyarı açık (kapatmak için dokunun)" : "Sesli uyarı kapalı (açmak için dokunun)");
  b.title = on ? "Yeni sipariş sesi açık" : "Yeni sipariş sesi kapalı";
  b.querySelector("use").setAttribute("href", on ? "#i-volume" : "#i-volume-x");
  updateAudioHint();
}
let needHint = false;
function updateAudioHint(force) {
  if (force) needHint = true;
  const el = $("#audioHint");
  if (el) el.hidden = !(audio.enabled && state.user && !audio.ready && (needHint || !audio.ctx));
}
$("#soundBtn").addEventListener("click", () => {
  audio.unlock();
  audio.enabled = !audio.enabled;
  if (audio.enabled) { audio.chime(); toast("Yeni sipariş sesi açık."); } else toast("Yeni sipariş sesi kapatıldı.", "warn");
});
$("#audioHintBtn").addEventListener("click", () => { audio.unlock(); setTimeout(() => { if (audio.ready) { audio.chime(); toast("Ses etkin. Yeni siparişte bu sesi duyacaksınız."); } }, 80); });
// İlk dokunuşta ses bağlamını aç (tarayıcılar kullanıcı hareketi olmadan sese izin vermez)
for (const ev of ["pointerdown", "keydown"]) document.addEventListener(ev, () => { if (state.user && !audio.ready) audio.unlock(); }, { capture: true });
renderSoundBtn();

// ---------- Tarayıcı bildirimi ----------
export function notifyPermissionUI() {
  const b = $("#notifyBtn");
  b.hidden = !("Notification" in window) || Notification.permission !== "default";
}
$("#notifyBtn").addEventListener("click", async () => {
  try {
    const p = await Notification.requestPermission();
    toast(p === "granted" ? "Bildirimler açık: yeni siparişte bildirim gelecek." : "Bildirim izni verilmedi. Tarayıcı ayarlarından açabilirsiniz.", p === "granted" ? "ok" : "warn");
  } catch { /* eski tarayıcı */ }
  notifyPermissionUI();
});

// ---------- Okunmamış sayaç (sekme başlığı) ----------
let unseen = 0;
function setUnseen(n) { unseen = n; document.dispatchEvent(new CustomEvent("unseen", { detail: n })); }
export function resetUnseen() {
  if (unseen && document.visibilityState === "visible" && nav.current && nav.current() === ordersPage) setUnseen(0);
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resetUnseen(); });
window.addEventListener("focus", resetUnseen);

function setNavCount(n) {
  $$("[data-new-count]").forEach((el) => { el.hidden = !n; el.textContent = n; });
}

// ---------- Canlı akış (SSE) + yedek yoklama ----------
// Akış açıkken her olay hemen bir "since" yoklamasını tetikler (liste, sayaçlar ve açık ayrıntı tek yerden ve
// yöneticiye maskesiz güncellenir). Akış yokken 12 sn'de bir, akış açıkken güvenlik için 60 sn'de bir yoklanır.
let pollTimer = null;
let since = null;
let latestId = 0;
let polling = false;
let pollAgain = false;
let ticks = 0;
const announced = new Set();
const annKey = (o) => `${o.id}|${o.createdAt}`;
export async function startPolling() {
  stopPolling();
  try {
    const r = await api("/api/admin/orders?pageSize=1");
    since = r.serverTime;
    latestId = r.latestId;
    setNavCount(r.counts.Yeni);
  } catch { return; }
  pollTimer = setInterval(() => {
    ticks++;
    if (liveState() !== "live" || ticks % 5 === 0) poll();
  }, 12000);
  startLive();
}
export function stopPolling() { clearInterval(pollTimer); pollTimer = null; stopLive(); }
const pollSoon = debounce(() => poll(), 120);
async function poll() {
  if (!state.user || !since) return;
  if (polling) { pollAgain = true; return; }
  polling = true;
  try {
    const r = await api(`/api/admin/orders?since=${encodeURIComponent(since)}`);
    const prevSince = Date.parse(since);
    since = r.serverTime;
    setNavCount(r.counts.Yeni);
    // Yeni sipariş: önceki yoklamadan sonra oluşturulan ya da numarası daha büyük olan (silinen numaralar yeniden kullanılabilir)
    const fresh = r.orders.filter((o) => (Date.parse(o.createdAt) > prevSince || o.id > latestId) && o.source !== "panel" && !announced.has(annKey(o))).sort((a, b) => a.id - b.id);
    fresh.forEach((o) => announced.add(annKey(o)));
    latestId = Math.max(latestId, r.latestId);
    if (fresh.length) announce(fresh);
    if (r.orders.length) document.dispatchEvent(new CustomEvent("orderschanged", { detail: { orders: r.orders, fresh: fresh.map((o) => o.id), counts: r.counts } }));
  } catch { /* ağ hatası: bir sonraki turda tekrar dener */ }
  finally {
    polling = false;
    if (pollAgain) { pollAgain = false; pollSoon(); }
  }
}
async function refreshCounts() {
  try {
    const r = await api("/api/admin/orders?pageSize=1");
    setNavCount(r.counts.Yeni);
    latestId = Math.max(latestId, r.latestId);
    document.dispatchEvent(new CustomEvent("ordersreload"));
  } catch { /* sessiz */ }
}

// Aynı anda gelen birden çok sipariş tek uyarıda toplanır (tek ses, tek bildirim)
let pendingNew = [];
const flushNew = debounce(() => {
  const list = pendingNew.sort((a, b) => a.id - b.id);
  pendingNew = [];
  if (!list.length) return;
  announce(list);
  // Bu siparişler yoklamada "yeni" diye ikinci kez duyurulmaz ama satırları yine de parlasın
  setTimeout(() => list.forEach((o) => { const row = $(`.order-row[data-id="${o.id}"]`); if (row) row.classList.add("flash"); }), 700);
}, 250);
onLive("siparis.yeni", (o) => {
  // Ses ve bildirim olay gelir gelmez; liste/sayaç ardından gelen yoklamayla
  if (o && o.id && o.source !== "panel" && !announced.has(annKey(o))) {
    announced.add(annKey(o));
    latestId = Math.max(latestId, o.id);
    pendingNew.push(o);
    flushNew();
  }
  pollSoon();
});
onLive("siparis.guncellendi", () => pollSoon());
onLive("siparis.silindi", (d) => {
  const ids = (d && d.ids) || [];
  document.dispatchEvent(new CustomEvent("ordersdeleted", { detail: ids }));
  refreshCounts();
});
onLive("durum", (d) => { if (d && d.status) document.dispatchEvent(new CustomEvent("storestatus", { detail: d.status })); });
onLive("yenile", () => { pollSoon(); refreshCounts(); });
onLive("connected", (d) => {
  if (d && d.status) document.dispatchEvent(new CustomEvent("storestatus", { detail: d.status }));
  pollSoon(); // kopukken kaçanlar
  if (d && d.restarted) refreshCounts();
});
function announce(list) {
  const onOrders = nav.current && nav.current() === ordersPage;
  if (!(onOrders && document.visibilityState === "visible" && document.hasFocus())) setUnseen(unseen + list.length);
  audio.chime();
  const o = list[list.length - 1];
  const text = list.length > 1 ? `${list.length} yeni sipariş geldi` : `Yeni sipariş #${o.id} · ${shortName(o.customer.name)} · ${tl(o.total)}`;
  toast(text, "order", { timeout: 12000, action: { label: "Aç", onClick: () => nav.go(`/panel/siparisler/${o.id}`) } });
  if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
    try {
      const n = new Notification(list.length > 1 ? `${list.length} yeni sipariş` : `Yeni sipariş #${o.id}`, {
        body: `${o.customer.name} · ${o.type === "gelal" ? "Gel-al" : o.customer.zoneName || "Eve teslim"} · ${tl(o.total)}`,
        icon: "/img/icon-192.png", tag: `siparis-${o.id}`,
      });
      n.onclick = () => { window.focus(); nav.go(`/panel/siparisler/${o.id}`); n.close(); };
    } catch { /* bazı mobil tarayıcılar yalnızca service worker ile bildirim gösterir */ }
  }
}

// ---------- Sayfa durumu ----------
const os = {
  tab: "aktif", q: "", range: "all", from: "", to: "", type: "", payment: "",
  page: 1, pages: 1, total: 0, list: [], counts: {}, openId: null, detail: null,
  sel: new Set(), editing: null, loading: false, filtersOpen: false, ctrl: null,
};

function rangeDates() {
  const today = dayStr();
  switch (os.range) {
    case "today": return [today, today];
    case "yesterday": { const y = addDays(today, -1); return [y, y]; }
    case "7": return [addDays(today, -6), today];
    case "month": return [today.slice(0, 8) + "01", today];
    case "custom": return [os.from, os.to];
    default: return ["", ""];
  }
}
function query(extra = {}) {
  const [from, to] = rangeDates();
  const p = new URLSearchParams();
  if (os.tab) p.set("status", os.tab);
  if (os.q.trim()) p.set("q", os.q.trim());
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  if (os.type) p.set("type", os.type);
  if (os.payment) p.set("payment", os.payment);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p;
}
const matchesTab = (o) => !os.tab || (os.tab === "aktif" ? ACTIVE.includes(o.status) : o.status === os.tab);

async function loadList({ append = false, silent = false } = {}) {
  if (os.ctrl) os.ctrl.abort();
  const ctrl = new AbortController();
  os.ctrl = ctrl;
  const page = append ? os.page + 1 : 1;
  // Sessiz yenilemede yüklü satırları koru (en fazla 200)
  const pageSize = silent && !append ? Math.min(200, Math.max(50, os.list.length)) : 50;
  if (!silent && !append) { os.loading = true; renderList(); }
  try {
    const r = await api(`/api/admin/orders?${query({ page, pageSize })}`, { signal: ctrl.signal });
    os.list = append ? [...os.list, ...r.orders.filter((o) => !os.list.some((x) => x.id === o.id))] : r.orders;
    os.page = silent && !append ? Math.ceil(os.list.length / 50) || 1 : r.page;
    os.pages = silent && !append ? Math.ceil(r.total / 50) || 1 : r.pages;
    os.total = r.total;
    os.counts = r.counts;
    os.loading = false;
    for (const id of [...os.sel]) if (!os.list.some((o) => o.id === id) && !os.selAllIds) os.sel.delete(id);
    renderTabs();
    renderList();
  } catch (e) {
    if (e.name === "AbortError") return;
    os.loading = false;
    renderList(e);
    if (!silent) toastErr(e);
  }
}

// ---------- Sayfa ----------
export const ordersPage = {
  id: "siparisler", title: "Siparişler", icon: "orders",
  async render(el, sub) {
    el.innerHTML = `<div class="page">
      <div class="tabs" role="tablist" aria-label="Sipariş durumu" id="oTabs"></div>
      <div class="filters-row" id="oFilters">
        <label class="search"><span class="sr-only">Sipariş ara</span>${icon("search")}<input class="input" type="search" id="oSearch" placeholder="No, ad, telefon, ürün…" value="${esc(os.q)}" autocomplete="off"></label>
        <button type="button" class="btn filter-toggle" id="oFilterToggle" aria-expanded="false">${icon("filter")} Süzgeç</button>
        <div class="adv">
          <select class="input" id="oRange" aria-label="Tarih">
            <option value="all">Tüm tarihler</option><option value="today">Bugün</option><option value="yesterday">Dün</option>
            <option value="7">Son 7 gün</option><option value="month">Bu ay</option><option value="custom">Tarih aralığı…</option>
          </select>
          <span class="row-flex" id="oCustom" hidden>
            <input class="input" type="date" id="oFrom" aria-label="Başlangıç"><span class="muted">–</span><input class="input" type="date" id="oTo" aria-label="Bitiş">
          </span>
          <select class="input" id="oType" aria-label="Teslimat türü"><option value="">Tüm türler</option><option value="teslimat">Eve teslim</option><option value="gelal">Gel-al</option></select>
          <select class="input" id="oPay" aria-label="Ödeme"><option value="">Tüm ödemeler</option><option value="nakit">Nakit</option><option value="kart">Kart</option></select>
        </div>
        <span class="grow hide-phone"></span>
        <button type="button" class="icon-btn" id="oReload" aria-label="Yenile" title="Yenile">${icon("refresh")}</button>
        ${isAdmin() ? `<button type="button" class="btn hide-phone" id="oCsv">${icon("download")} CSV</button>` : ""}
        <button type="button" class="btn btn-accent" id="oNew">${icon("plus")} Elle sipariş</button>
      </div>
      <div class="orders-layout" id="oLayout">
        <div><div class="list" id="oList"></div><div class="load-more" id="oMore" hidden></div></div>
        <div id="oDetailSlot"></div>
      </div>
    </div>`;
    $("#oRange").value = os.range;
    $("#oCustom").hidden = os.range !== "custom";
    $("#oFrom").value = os.from; $("#oTo").value = os.to;
    $("#oType").value = os.type; $("#oPay").value = os.payment;
    bindPage();
    renderTabs();
    await loadList();
    if (!state.loaded.products) loadCatalog().catch(() => {});
    if (sub[0]) openDetail(Number(sub[0]), false);
  },
  async update(el, sub) {
    if (sub[0]) openDetail(Number(sub[0]), false);
    else closeDetail(false);
  },
  leave() { closeDetail(false); os.sel.clear(); os.selAllIds = null; },
};

function bindPage() {
  $("#oTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    os.tab = b.dataset.tab;
    clearSel();
    loadList();
  });
  $("#oTabs").addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
    const tabs = $$("[data-tab]", e.currentTarget);
    const i = tabs.indexOf(document.activeElement);
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    n.focus(); n.click();
  });
  const reload = debounce(() => { clearSel(); loadList(); }, 300);
  $("#oSearch").addEventListener("input", (e) => { os.q = e.target.value; reload(); });
  $("#oFilterToggle").addEventListener("click", (e) => {
    const f = $("#oFilters");
    f.classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", String(f.classList.contains("open")));
  });
  $("#oRange").addEventListener("change", (e) => {
    os.range = e.target.value;
    $("#oCustom").hidden = os.range !== "custom";
    if (os.range === "custom" && !os.from) { os.from = addDays(dayStr(), -6); os.to = dayStr(); $("#oFrom").value = os.from; $("#oTo").value = os.to; }
    reload();
  });
  $("#oFrom").addEventListener("change", (e) => { os.from = e.target.value; reload(); });
  $("#oTo").addEventListener("change", (e) => { os.to = e.target.value; reload(); });
  $("#oType").addEventListener("change", (e) => { os.type = e.target.value; reload(); });
  $("#oPay").addEventListener("change", (e) => { os.payment = e.target.value; reload(); });
  $("#oReload").addEventListener("click", () => loadList().then(() => toast("Siparişler yenilendi.")));
  const csv = $("#oCsv");
  if (csv) csv.addEventListener("click", async () => {
    const p = query();
    p.delete("type"); p.delete("payment");
    if (p.get("status") === "aktif") p.set("status", "Yeni,Hazırlanıyor,Yolda");
    try { const n = await download(`/api/admin/orders/export?${p}`, "siparisler.csv"); toast(`${n} indirildi.`); } catch (e) { toastErr(e); }
  });
  $("#oNew").addEventListener("click", () => manualOrder());

  const list = $("#oList");
  list.addEventListener("click", (e) => {
    const nx = e.target.closest("[data-next]");
    if (nx) { const o = os.list.find((x) => x.id === Number(nx.dataset.next)); if (o) advance(o, nx); return; }
    const op = e.target.closest("[data-open]");
    if (op) { nav.go(`/panel/siparisler/${op.dataset.open}`); return; }
    const more = e.target.closest("[data-more-orders]");
    if (more) loadList({ append: true });
  });
  list.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-sel]");
    if (cb) {
      const id = Number(cb.dataset.sel);
      if (cb.checked) os.sel.add(id); else os.sel.delete(id);
      os.selAllIds = null;
      cb.closest(".order-row").classList.toggle("is-selected", cb.checked);
      syncSelAll();
      renderBulk();
      return;
    }
    if (e.target.id === "oSelAll") {
      const on = e.target.checked;
      os.list.forEach((o) => (on ? os.sel.add(o.id) : os.sel.delete(o.id)));
      os.selAllIds = null;
      renderList();
    }
  });
}

document.addEventListener("orderschanged", (e) => {
  if (!(nav.current && nav.current() === ordersPage) || !$("#oList")) return;
  loadList({ silent: true }).then(() => {
    for (const id of e.detail.fresh) { const row = $(`.order-row[data-id="${id}"]`); if (row) row.classList.add("flash"); }
  });
  if (os.openId && e.detail.orders.some((o) => o.id === os.openId)) {
    const o = e.detail.orders.find((x) => x.id === os.openId);
    if (!os.editing && !notesDirty()) { os.detail = o; renderDetail(); }
    else toast(`#${o.id} başka bir yerde güncellendi. Kaydetmeden önce kontrol edin.`, "warn");
  }
});
document.addEventListener("ordersreload", () => {
  if (!(nav.current && nav.current() === ordersPage) || !$("#oList")) return;
  loadList({ silent: true });
  if (os.openId && !os.editing && !notesDirty()) refreshDetail(true);
});
document.addEventListener("ordersdeleted", (e) => {
  if (!(nav.current && nav.current() === ordersPage) || !$("#oList")) return;
  const ids = e.detail || [];
  if (os.openId && ids.includes(os.openId)) { toast(`#${os.openId} silindi.`, "warn"); closeDetail(); }
  ids.forEach((id) => os.sel.delete(id));
  loadList({ silent: true });
});

function renderTabs() {
  const el = $("#oTabs");
  if (!el) return;
  const c = os.counts || {};
  const all = ["Yeni", "Hazırlanıyor", "Yolda", "Teslim edildi", "İptal"].reduce((t, s) => t + (c[s] || 0), 0);
  el.innerHTML = TABS.map(([k, label]) => {
    const n = k === "" ? all : c[k];
    const hot = (k === "Yeni" || k === "aktif") && n;
    return `<button type="button" role="tab" data-tab="${esc(k)}" aria-selected="${os.tab === k}" tabindex="${os.tab === k ? 0 : -1}">${esc(label)}${n !== undefined ? ` <span class="count ${k === "Yeni" && hot ? "hot" : ""}">${n}</span>` : ""}</button>`;
  }).join("");
}

function rowHtml(o) {
  const nx = nextStep(o);
  const mins = minutesSince(o.createdAt);
  const hot = o.status === "Yeni" && mins > 10;
  const sel = os.sel.has(o.id);
  return `<div class="order-row ${sel ? "is-selected" : ""} ${os.openId === o.id ? "is-open" : ""}" data-id="${o.id}" data-status="${esc(o.status)}">
    <label class="cb-cell"><input type="checkbox" class="cb" data-sel="${o.id}" ${sel ? "checked" : ""} aria-label="#${o.id} seç"></label>
    <button type="button" class="order-main" data-open="${o.id}" aria-label="Sipariş #${o.id} ayrıntısı">
      <span class="order-line1"><span class="order-id">#${o.id}</span>${badge(o)}${o.preorder ? `<span class="badge b-warn">Ön sipariş</span>` : ""}${o.source === "panel" ? `<span class="badge b-outline">Telefon</span>` : ""}${openReturns(o) ? `<span class="badge b-danger">${icon("undo")} İade talebi</span>` : ""}${o.masked || o.archived ? `<span class="badge b-muted">${icon("lock")} Arşiv</span>` : ""}
        <span class="order-name">${esc(o.customer.name)}</span><span class="order-total">${tl(o.total)}</span></span>
      <span class="order-line2">
        <span class="${hot ? "age-hot" : ""}">${icon("clock")} ${fmtTime(o.createdAt)} · ${ago(o.createdAt)}</span>
        <span>${o.type === "gelal" ? `${icon("bag")} Gel-al` : `${icon("truck")} ${esc(o.customer.zoneName || "Eve teslim")}`}</span>
        <span>${o.payment === "kart" ? `${icon("card")} Kart` : `${icon("cash")} Nakit${o.changeFor ? ` · ${tl(o.changeFor)} verecek` : ""}`}</span>
        <span>${itemCount(o)} ürün</span>
        ${o.note ? `<span title="${esc(o.note)}">${icon("message")} Not</span>` : ""}
        ${o.courier ? `<span>${icon("user")} ${esc(o.courier)}</span>` : ""}
        ${needsConfirm(o) ? `<span class="teyit-hint">${icon("phone")} Teyit bekliyor</span>` : ""}
      </span>
    </button>
    ${nx ? `<div class="order-act"><button type="button" class="btn ${o.status === "Yeni" ? "btn-accent" : ""}" data-next="${o.id}">${esc(nx.label)} ${icon("arrow-right", "i-sm")}</button></div>` : ""}
  </div>`;
}

function renderList(err) {
  const el = $("#oList");
  if (!el) return;
  if (os.loading && !os.list.length) { el.innerHTML = `<div class="skeleton" style="padding:10px">${"<div></div>".repeat(5)}</div>`; return; }
  if (err && !os.list.length) {
    el.innerHTML = `<div class="empty">${icon("alert")}<b>Siparişler yüklenemedi</b>${esc(err.message)}<div class="mt"><button type="button" class="btn" id="oRetry">Tekrar dene</button></div></div>`;
    $("#oRetry").addEventListener("click", () => loadList());
    return;
  }
  if (!os.list.length) {
    const filtered = os.q || os.range !== "all" || os.type || os.payment;
    el.innerHTML = `<div class="empty">${icon("orders")}<b>${os.tab === "aktif" && !filtered ? "Bekleyen sipariş yok" : "Sipariş bulunamadı"}</b>${filtered ? "Süzgeçleri değiştirmeyi deneyin." : os.tab === "aktif" ? "Yeni sipariş gelince burada görünür ve sesli uyarı çalar." : ""}</div>`;
    $("#oMore").hidden = true;
    renderBulk();
    return;
  }
  const allSel = os.list.every((o) => os.sel.has(o.id));
  el.innerHTML = `<div class="list-head"><label class="cb-cell"><input type="checkbox" class="cb" id="oSelAll" ${allSel ? "checked" : ""} aria-label="Listedekilerin tümünü seç"></label><span>${os.total} sipariş</span></div>`
    + os.list.map(rowHtml).join("");
  const more = $("#oMore");
  more.hidden = os.page >= os.pages;
  more.innerHTML = `<button type="button" class="btn" data-more-orders>Daha fazla göster (${os.total - os.list.length} kaldı)</button>`;
  more.onclick = (e) => { if (e.target.closest("[data-more-orders]")) loadList({ append: true }); };
  syncSelAll();
  renderBulk();
}
function syncSelAll() {
  const a = $("#oSelAll");
  if (!a) return;
  const n = os.list.filter((o) => os.sel.has(o.id)).length;
  a.checked = n > 0 && n === os.list.length;
  a.indeterminate = n > 0 && n < os.list.length;
}
function clearSel() { os.sel.clear(); os.selAllIds = null; hideBulk(); }

// ---------- Toplu işlem ----------
function renderBulk() {
  const n = os.sel.size;
  const canAll = os.total > n;
  const actions = [
    { id: "st-Hazırlanıyor", label: "Hazırlanıyor" },
    { id: "st-Yolda", label: "Yolda" },
    { id: "st-Teslim edildi", label: "Teslim edildi", icon: "check" },
    { id: "status", label: "Diğer durum…" },
    { id: "print", label: "Fiş yazdır", icon: "printer" },
  ];
  if (isAdmin()) actions.push({ id: "delete", label: "Sil", icon: "trash", cls: "btn-danger", title: "Yalnızca teslim edilen ve iptal edilen siparişler silinir" });
  showBulk({
    count: n, canSelectAll: canAll, allCount: os.total,
    onClear: () => { clearSel(); renderList(); },
    onSelectAll: selectAllFiltered,
    actions,
    onAction: bulkAction,
  });
}
async function selectAllFiltered() {
  try {
    const ids = [];
    let page = 1, pages = 1;
    do {
      const r = await api(`/api/admin/orders?${query({ page, pageSize: 200 })}`);
      r.orders.forEach((o) => ids.push(o.id));
      pages = r.pages; page++;
    } while (page <= pages && page <= 50);
    ids.forEach((id) => os.sel.add(id));
    os.selAllIds = ids;
    renderList();
    toast(`Süzgece uyan ${ids.length} siparişin tümü seçildi.`, "info");
  } catch (e) { toastErr(e); }
}
async function bulkAction(id) {
  const ids = [...os.sel];
  if (id.startsWith("st-")) return bulkStatus(ids, id.slice(3));
  if (id === "status") {
    openModal({
      title: `${ids.length} siparişin durumunu değiştir`, size: "narrow", submitLabel: "Uygula",
      body: `<label class="field"><span>Yeni durum</span><select name="status">${["Yeni", "Hazırlanıyor", "Yolda", "Teslim edildi", "İptal"].map((s) => `<option>${s}</option>`).join("")}</select></label>
        <label class="field" id="bcNote" hidden><span>Müşteriye iptal notu (isteğe bağlı)</span><textarea name="note" maxlength="300" rows="3"></textarea></label>`,
      onOpen: (f) => f.status.addEventListener("change", () => { $("#bcNote").hidden = f.status.value !== "İptal"; }),
      onSubmit: async (f) => {
        if (f.status.value === "İptal" && !(await confirmDialog({ title: "Toplu iptal", message: `${ids.length} sipariş iptal edilecek. Stoklar ve kupon kullanımları geri alınır.`, okLabel: "İptal et", danger: true }))) return false;
        await bulkStatus(ids, f.status.value, f.note.value.trim());
      },
    });
    return;
  }
  if (id === "print") {
    try {
      const have = new Map(os.list.map((o) => [o.id, o]));
      const orders = [];
      for (const oid of ids.sort((a, b) => a - b)) orders.push(have.get(oid) || (await api(`/api/admin/orders/${oid}`)));
      printReceipts(orders);
    } catch (e) { toastErr(e); }
    return;
  }
  if (id === "delete") {
    const known = ids.map((x) => os.list.find((o) => o.id === x)).filter(Boolean);
    const blocked = known.filter((o) => !["Teslim edildi", "İptal"].includes(o.status)).length;
    const ok = await confirmDialog({
      title: "Siparişleri sil", danger: true, okLabel: `${ids.length} siparişi sil`,
      message: `${ids.length} sipariş kalıcı olarak silinecek. Silmeden önce sunucuda otomatik yedek alınır.`,
      details: blocked ? `${blocked} sipariş henüz tamamlanmadığı için atlanacak (yalnızca teslim edilen ya da iptal edilenler silinir).` : "",
    });
    if (!ok) return;
    try {
      const r = await api("/api/admin/orders/bulk", { method: "POST", body: { ids, action: "delete" } });
      bulkResult(r, "sipariş silindi");
      clearSel();
      if (os.openId && ids.includes(os.openId)) closeDetail();
      loadList();
    } catch (e) { toastErr(e); }
  }
}
async function bulkStatus(ids, status, cancelNote) {
  try {
    const body = { ids, action: "status", status };
    if (status === "İptal" && cancelNote) body.cancelNote = cancelNote;
    const r = await api("/api/admin/orders/bulk", { method: "POST", body });
    bulkResult(r, `sipariş "${status}" yapıldı`);
    clearSel();
    await loadList({ silent: true });
    if (os.openId && ids.includes(os.openId)) refreshDetail();
  } catch (e) { toastErr(e); }
}

// ---------- Tek sipariş işlemleri ----------
async function patchOrder(id, body) {
  const o = await api(`/api/admin/orders/${id}`, { method: "PATCH", body });
  const prev = os.list.find((x) => x.id === id);
  if (prev && prev.status !== o.status && os.counts) {
    os.counts[prev.status] = Math.max(0, (os.counts[prev.status] || 0) - 1);
    os.counts[o.status] = (os.counts[o.status] || 0) + 1;
    os.counts.aktif = Math.max(0, (os.counts.aktif || 0) + (ACTIVE.includes(o.status) ? 1 : 0) - (ACTIVE.includes(prev.status) ? 1 : 0));
    if (prev.status === "Yeni" || o.status === "Yeni") setNavCount(os.counts.Yeni);
  }
  const i = os.list.findIndex((x) => x.id === id);
  if (i >= 0) os.list[i] = o;
  if (os.detail && os.detail.id === id) os.detail = o;
  return o;
}
async function setStatus(o, status, extra = {}) {
  const old = o.status;
  try {
    const n = await patchOrder(o.id, { status, ...extra });
    if (!matchesTab(n)) {
      const row = $(`.order-row[data-id="${n.id}"]`);
      if (row && !(os.openId === n.id)) { os.list = os.list.filter((x) => x.id !== n.id); os.total = Math.max(0, os.total - 1); }
    }
    renderTabs();
    renderList();
    if (os.openId === n.id) renderDetail();
    toast(`#${n.id} → ${statusText(n)}`, "ok", status === "İptal" ? {} : { action: { label: "Geri al", onClick: () => setStatus(n, old) } });
  } catch (e) { toastErr(e); }
}
function advance(o, btn) {
  const nx = nextStep(o);
  if (!nx) return;
  if (btn) { btn.disabled = true; btn.classList.add("is-busy"); }
  setStatus(o, nx.status);
}

// ---------- Ayrıntı paneli ----------
const notesDirty = () => {
  const c = $("#odCourier"), n = $("#odNote");
  return !!(os.detail && c && n && (c.value !== (os.detail.courier || "") || n.value !== (os.detail.adminNote || "")));
};
async function openDetail(id, push = true) {
  if (!id) return;
  if (push) { nav.go(`/panel/siparisler/${id}`); return; } // değişiklik onayı gezinmede sorulur
  os.openId = id;
  os.editing = null;
  setDirty("order-notes", false);
  setDirty("order-items", false);
  $$(".order-row").forEach((r) => r.classList.toggle("is-open", Number(r.dataset.id) === id));
  const cached = os.list.find((o) => o.id === id);
  os.detail = cached || null;
  renderDetail();
  try {
    os.detail = await api(`/api/admin/orders/${id}`);
    if (os.openId === id) renderDetail();
  } catch (e) {
    toastErr(e);
    if (!cached) closeDetail();
  }
}
async function refreshDetail(silent = false) {
  if (!os.openId) return;
  try { os.detail = await api(`/api/admin/orders/${os.openId}`); renderDetail(); } catch (e) { if (!silent) toastErr(e); }
}
function closeDetail(pushUrl = true) {
  os.openId = null; os.detail = null; os.editing = null;
  setDirty("order-notes", false);
  setDirty("order-items", false);
  const slot = $("#oDetailSlot");
  if (slot) slot.innerHTML = "";
  const lay = $("#oLayout");
  if (lay) lay.classList.remove("has-detail");
  $$(".order-row.is-open").forEach((r) => r.classList.remove("is-open"));
  document.body.style.overflow = "";
  if (pushUrl && location.pathname !== "/panel/siparisler") history.pushState(null, "", "/panel/siparisler");
}
async function tryCloseDetail() {
  if (os.editing || notesDirty()) {
    if (!(await confirmDialog({ title: "Kaydedilmemiş değişiklikler", message: "Kaydetmeden kapatılsın mı?", okLabel: "Kapat", danger: true }))) return;
  }
  closeDetail();
}

function renderDetail() {
  const slot = $("#oDetailSlot");
  const o = os.detail;
  if (!slot) return;
  if (!o) { slot.innerHTML = `<aside class="detail"><div class="detail-body"><div class="skeleton"><div></div><div></div><div></div></div></div></aside>`; return; }
  $("#oLayout").classList.add("has-detail");
  const mobile = matchMedia("(max-width: 1279px)").matches;
  document.body.style.overflow = mobile ? "hidden" : "";
  const prevBody = slot.querySelector(".detail-body");
  const keepScroll = prevBody && slot.dataset.oid === String(o.id) ? prevBody.scrollTop : 0;
  slot.dataset.oid = String(o.id);
  const nx = nextStep(o);
  const cancelled = o.status === "İptal";
  const c = o.customer;
  const stepIdx = FLOW.indexOf(o.status);
  const changeBack = o.payment === "nakit" && o.changeFor ? Math.round((o.changeFor - o.total) * 100) / 100 : null;
  const mapsQ = encodeURIComponent([c.address, c.zoneName, (state.store && state.store.store.city) || "Edirne"].filter(Boolean).join(", "));
  slot.innerHTML = `<div class="detail-backdrop" data-dclose></div>
  <aside class="detail" aria-label="Sipariş #${o.id}">
    <div class="detail-head">
      <h3>#${o.id}</h3>${badge(o)}${o.preorder ? `<span class="badge b-warn">Ön sipariş</span>` : ""}
      <span class="grow"></span>
      <button type="button" class="icon-btn" data-dprint aria-label="Fiş yazdır" title="Fiş yazdır">${icon("printer")}</button>
      <button type="button" class="icon-btn" data-dmore aria-label="Diğer işlemler">${icon("more")}</button>
      <button type="button" class="icon-btn" data-dclose aria-label="Kapat">${icon("x")}</button>
    </div>
    <div class="detail-body">
      <div class="detail-sec">
        <div class="small muted">${fmtDateTime(o.createdAt)} · ${ago(o.createdAt)} · ${o.source === "panel" ? "Panelden girildi" : "Online sipariş"}</div>
      </div>
      ${isMasked(o) ? `<div class="detail-sec"><div class="callout">${icon("lock")}<div><b>${esc(statusText(o, o.status))}</b> · Arşivlenmiş siparişin durumunu, kalemlerini ve notlarını yalnızca yönetici değiştirebilir.</div></div></div>`
      : cancelled ? `<div class="callout danger cancelled-banner"><div>${icon("ban")} <b>İptal edildi</b> ${o.cancelledBy === "musteri" ? "(müşteri iptal etti)" : "(market iptal etti)"}${o.cancelNote ? `<div class="mt" style="margin-top:4px">Müşteriye not: ${esc(o.cancelNote)}</div>` : ""}</div>
          <div class="row-flex"><button type="button" class="btn btn-sm" data-dcnote>${icon("edit", "i-sm")} ${o.cancelNote ? "Notu düzenle" : "Not ekle"}</button><button type="button" class="btn btn-sm" data-dreopen>İptali geri al</button></div></div>`
      : `<div class="detail-sec">
          <div class="stepper" role="group" aria-label="Durum">${FLOW.map((s, i) => `<button type="button" class="step ${i < stepIdx ? "done" : ""} ${i === stepIdx ? "current" : ""}" data-dstatus="${s}" ${i === stepIdx ? 'aria-current="step"' : ""}>${esc(statusText(o, s))}</button>`).join("")}</div>
          ${nx ? `<button type="button" class="btn btn-accent next-btn mt" data-dnext>${esc(nx.label)} ${icon("arrow-right")}</button>` : ""}
        </div>`}

      <div class="detail-sec">
        <h4>Müşteri</h4>
        ${isMasked(o) ? `<div class="callout mb">${icon("lock")}<div><b>Arşivlenmiş sipariş.</b> Saklama kuralı gereği müşterinin adı, telefonu, adresi ve notları yalnızca yöneticiye görünür. Arama ve mesaj düğmeleri kapalıdır.</div></div>`
          : o.archived ? `<div class="callout mb">${icon("lock")}<div>Arşivlenmiş sipariş: kişisel veriler personele maskeli görünür, siz yönetici olarak görüyorsunuz.</div></div>` : ""}
        <dl class="kv">
          <dt>Ad</dt><dd>${esc(c.name)}</dd>
          <dt>Telefon</dt><dd>${isMasked(o) || !c.phone ? `<span class="muted">${isMasked(o) ? "Gizli" : "—"}</span>` : `<a href="tel:${esc(c.phone)}">${esc(fmtPhone(c.phone))}</a>`}</dd>
          ${o.type === "gelal" ? `<dt>Teslimat</dt><dd>${icon("bag", "i-sm")} Gel-al (mağazadan)</dd>` : `<dt>Bölge</dt><dd>${esc(c.zoneName || "—")}</dd><dt>Adres</dt><dd style="white-space:pre-line">${isMasked(o) ? `<span class="muted">Gizli</span>` : esc(c.address)}</dd>`}
        </dl>
        <div class="contact-btns">
          ${isMasked(o) || !c.phone
            ? `<button type="button" class="btn is-off" disabled aria-disabled="true" title="Arşivlenmiş siparişte kapalı">${icon("phone")} Ara</button><button type="button" class="btn is-off" disabled aria-disabled="true" title="Arşivlenmiş siparişte kapalı">${icon("message")} WhatsApp</button><button type="button" class="btn is-off" disabled aria-disabled="true">${icon(o.type !== "gelal" ? "pin" : "user")} ${o.type !== "gelal" ? "Harita" : "Geçmiş"}</button>`
            : `<a class="btn" href="tel:${esc(c.phone)}">${icon("phone")} Ara</a>
          <button type="button" class="btn" data-dwa>${icon("message")} WhatsApp</button>
          ${o.type !== "gelal" && c.address ? `<a class="btn" href="https://www.google.com/maps/search/?api=1&query=${mapsQ}" target="_blank" rel="noopener">${icon("pin")} Harita</a>` : `<a class="btn" data-link href="/panel/musteriler/${esc(c.phone)}">${icon("user")} Geçmiş</a>`}`}
        </div>
      </div>

      ${confirmHtml(o)}
      ${returnsHtml(o)}

      <div class="detail-sec">
        <h4>Ödeme ve tercihler</h4>
        <div class="pay-box">
          <span class="pay-chip ${o.payment === "kart" ? "card" : "cash"}">${icon(o.payment === "kart" ? "card" : "cash")} ${payLabel(o)}</span>
          ${changeBack !== null ? `<span class="pay-chip change">${tl(o.changeFor)} verecek · para üstü ${tl(Math.max(0, changeBack))}</span>` : ""}
        </div>
        <p class="small" style="margin:8px 0 0"><b>Ürün yoksa:</b> ${esc(SUBST[o.substitution] || "Beni arayın")}</p>
        ${o.note ? `<div class="callout note mt">${icon("message")}<div><b>Müşteri notu:</b> ${esc(o.note)}</div></div>` : ""}
      </div>

      <div class="detail-sec" id="odItems">${itemsHtml(o)}</div>

      <div class="detail-sec">
        <h4>Kurye ve not</h4>
        <div class="stack">
          <label class="field"><span>Kurye</span><input id="odCourier" maxlength="60" value="${esc(o.courier || "")}" placeholder="Teslim edecek kişi" autocomplete="off"></label>
          <label class="field"><span>Yönetici notu <span class="hint">(yalnızca panelde görünür)</span></span><textarea id="odNote" maxlength="500" rows="2">${esc(o.adminNote || "")}</textarea></label>
          <div class="row-flex"><button type="button" class="btn btn-primary btn-sm" id="odSaveNotes" disabled>Kaydet</button><span class="small muted" id="odNotesHint"></span></div>
        </div>
      </div>

      <div class="detail-sec">
        <h4>Geçmiş</h4>
        <ol class="timeline">${o.history.slice().reverse().map((x, i, arr) => {
          const prev = arr[i + 1];
          const isStatus = !x.note || (prev && prev.status !== x.status);
          return `<li class="${isStatus && !x.note ? "st" : ""}"><div><b>${x.note && (!prev || prev.status === x.status) ? "Not" : esc(statusText(o, x.status))}</b>${x.by ? ` <span class="muted">· ${esc(x.by === "musteri" ? "müşteri" : x.by)}</span>` : ""}${x.note ? `<div>${esc(x.note)}</div>` : ""}<div class="when">${fmtDateTime(x.at)}</div></div></li>`;
        }).join("")}</ol>
      </div>
      ${consentHtml(o)}
      ${!cancelled ?`<div class="detail-sec"><button type="button" class="btn btn-danger-ghost btn-block" data-dcancel>${icon("ban")} Siparişi iptal et</button></div>` : ""}
    </div>
  </aside>`;
  const body = slot.querySelector(".detail-body");
  body.scrollTop = keepScroll;
  bindDetail(slot, o);
}

// ---------- Sipariş teyidi, cayma/iade talepleri, onay kaydı ----------
function confirmHtml(o) {
  const list = (o.confirmations || []).slice().reverse();
  const active = ACTIVE.includes(o.status);
  const canAct = !isMasked(o) && active;
  if (!list.length && !canAct) return "";
  const waiting = !list.length && o.source === "web";
  return `<div class="detail-sec">
    <h4>Sipariş teyidi ${list.length ? `<span class="badge b-ok">${icon("check")} Kaydedildi</span>` : waiting ? `<span class="badge b-warn">Bekliyor</span>` : ""}</h4>
    ${waiting ? `<p class="small" style="margin:0 0 8px">Müşteriyi kısaca arayıp siparişin alındığını bildirin ve buraya işaretleyin (E-ticaret Yönetmeliği m.9: siparişin ikinci bir kanaldan teyidi).</p>` : ""}
    ${list.length ? `<div class="mini-list">${list.map((x) => `<div class="mini-row">${icon(x.result === "ulasilamadi" ? "x" : "check", "i-sm")}<b>${esc(CHANNEL[x.channel] || x.channel)}</b><span>${x.result === "ulasilamadi" ? "ulaşılamadı" : "ulaşıldı, teyit edildi"}</span>${x.note ? `<span class="muted">· ${esc(x.note)}</span>` : ""}<span class="when">${esc(x.by || "")} · ${fmtDateTime(x.at)}</span></div>`).join("")}</div>` : ""}
    ${canAct ? `<div class="row-flex mt"><button type="button" class="btn btn-sm" data-dconfirm="ulasildi">${icon("check", "i-sm")} Teyit araması yapıldı</button><button type="button" class="btn btn-sm" data-dconfirm="ulasilamadi">${icon("x", "i-sm")} Ulaşılamadı</button></div>` : ""}
  </div>`;
}
function returnsHtml(o) {
  const list = o.returnRequests || [];
  if (!list.length) return "";
  const nm = (pid) => { const it = o.items.find((i) => i.productId === pid); return it ? it.name : `Ürün #${pid}`; };
  return `<div class="detail-sec">
    <h4>Cayma / iade talepleri (${list.length})</h4>
    <div class="mini-list">${list.slice().reverse().map((r) => `<div class="rr-card ${r.status === "Yeni" ? "is-new" : ""}">
      <div class="row-flex"><b>Talep ${o.id}-${r.id}</b><span class="badge ${RR_BADGE[r.status] || ""}">${esc(r.status)}</span><span class="grow"></span><button type="button" class="btn btn-sm" data-drr="${r.id}">${icon("edit", "i-sm")} İşle</button></div>
      <div class="msg">${esc(r.message || "")}</div>
      ${(r.items || []).length ? `<div class="small">${r.items.map((i) => `${fq(i.qty)} × ${esc(nm(i.productId))}`).join(", ")}</div>` : ""}
      ${r.adminNote ? `<div class="small"><b>Not:</b> ${esc(r.adminNote)}</div>` : ""}
      <div class="meta"><span>Geldi: ${fmtDateTime(r.at)}</span>${r.updatedAt ? `<span>Son işlem: ${esc(r.by || "")} · ${fmtDateTime(r.updatedAt)}</span>` : ""}</div>
    </div>`).join("")}</div>
    <p class="small muted" style="margin:8px 0 0">Talepleri 14 gün içinde sonuçlandırın. Çabuk bozulan ürünlerde cayma hakkı yoktur; ayıplı ürün talebi yine değerlendirilir.</p>
  </div>`;
}
function consentHtml(o) {
  const c = o.consent;
  const short = (v) => String(v || "").slice(0, 12);
  return `<div class="detail-sec">
    <h4>Onay kaydı ve sözleşme</h4>
    ${c ? `<div class="consent-log">
        <div class="small muted">Onay zamanı: <b class="num" style="color:var(--ink)">${fmtDateTime(c.at)}</b>${c.ip ? ` · IP: <span class="ver">${esc(c.ip)}</span>` : ""}</div>
        ${(c.accepted || []).map((a) => `<div class="c-item">${icon("check-square")}<div>${esc(a.label)}${a.required ? "" : ` <span class="badge b-muted">isteğe bağlı</span>`}
          <div class="c-docs">${(a.docs || []).map((d) => `${esc(d.title)} <span class="ver" title="Metin sürümü (SHA-256): ${esc(d.version)}">${esc(short(d.version))}</span>`).join(" · ")}</div></div></div>`).join("")}
        ${(c.declined || []).map((a) => `<div class="c-item no">${icon("x")}<div class="muted">İşaretlenmedi: ${esc(a.label || a.key || "")}</div></div>`).join("")}
      </div>
      <div class="row-flex mt"><button type="button" class="btn btn-sm" data-ddoc="open">${icon("file", "i-sm")} Sipariş sözleşmesini aç</button><button type="button" class="btn btn-sm" data-ddoc="print">${icon("printer", "i-sm")} Yazdır</button></div>`
    : `<p class="small muted" style="margin:0">Bu sipariş için onay kaydı yok (telefonla girilmiş ya da eski bir sipariş).</p>`}
  </div>`;
}
function confirmDialogFor(o, result) {
  openModal({
    title: result === "ulasilamadi" ? `#${o.id} · müşteriye ulaşılamadı` : `#${o.id} · teyit kaydı`, size: "narrow",
    submitLabel: result === "ulasilamadi" ? "Ulaşılamadı olarak kaydet" : "Teyit edildi olarak kaydet",
    body: `<div class="seg" role="radiogroup" aria-label="Kanal">${Object.entries(CHANNEL).map(([k, l], i) => `<label class="check" style="padding:0 10px"><input type="radio" name="channel" value="${k}" ${i === 0 ? "checked" : ""}> ${l}</label>`).join("")}</div>
      <label class="field"><span>Not <span class="hint">(isteğe bağlı, kişisel bilgi yazmayın)</span></span><input name="note" maxlength="200" autocomplete="off"></label>
      <p class="hint" style="margin:0">Kayıt zaman ve kullanıcı adınızla siparişe ve denetim kaydına yazılır.</p>`,
    onSubmit: async (f) => {
      const body = { channel: f.querySelector("[name=channel]:checked").value, result };
      if (f.note.value.trim()) body.note = f.note.value.trim();
      const n = await api(`/api/admin/orders/${o.id}/confirmation`, { method: "POST", body });
      replaceOrder(n);
      renderList(); renderDetail();
      toast(result === "ulasilamadi" ? `#${o.id}: ulaşılamadı kaydedildi.` : `#${o.id} teyit edildi.`);
    },
  });
}
function returnDialog(o, rid) {
  const r = (o.returnRequests || []).find((x) => x.id === rid);
  if (!r) return;
  openModal({
    title: `Talep ${o.id}-${r.id}`, size: "narrow", submitLabel: "Kaydet",
    body: `<div class="callout">${icon("message")}<div style="white-space:pre-line">${esc(r.message || "")}</div></div>
      <label class="field"><span>Durum</span><select name="status">${RR_STATUS.map((s) => `<option ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <label class="field"><span>Not <span class="hint">(yalnızca panelde)</span></span><textarea name="note" maxlength="300" rows="3">${esc(r.adminNote || "")}</textarea></label>`,
    onSubmit: async (f) => {
      const n = await api(`/api/admin/orders/${o.id}/return-requests/${r.id}`, { method: "PATCH", body: { status: f.status.value, note: f.note.value.trim() } });
      replaceOrder(n);
      renderList(); renderDetail();
      toast(`Talep ${o.id}-${r.id}: ${f.status.value}.`);
    },
  });
}
function replaceOrder(n) {
  const i = os.list.findIndex((x) => x.id === n.id);
  if (i >= 0) os.list[i] = n;
  if (os.detail && os.detail.id === n.id) os.detail = n;
}
async function openDocuments(o, print) {
  try { await openAuthed(`/api/admin/orders/${o.id}/documents?format=html`, `siparis-${o.id}-sozlesme.html`, { print }); } catch (e) { toastErr(e); }
}

function itemsHtml(o) {
  if (os.editing) return editItemsHtml(o);
  // Personel yalnızca hazırlık süren (aktif) siparişin kalemlerini düzenler; teslim edilmiş / arşivlenmiş sipariş yöneticide
  const canEdit = o.status !== "İptal" && !isMasked(o) && (isAdmin() || ACTIVE.includes(o.status));
  return `<h4>Ürünler (${itemCount(o)}) ${canEdit ? `<button type="button" class="btn btn-sm" data-dedit>${icon("edit", "i-sm")} Düzenle</button>` : ""}</h4>
    <table class="items-tbl"><tbody>${o.items.map((i) => `<tr><td class="q">${fq(i.qty)} ${i.unit === "kg" ? "kg" : "×"}</td><td>${esc(i.name)}<div class="small muted">${tl(i.price)} / ${esc(i.unit)}</div></td><td class="p">${tl(i.price * i.qty)}</td></tr>`).join("")}</tbody></table>
    <div class="totals">
      <div><span>Ara toplam</span><span>${tl(o.subtotal)}</span></div>
      ${o.discount ? `<div><span>İndirim${o.couponCode ? ` (${esc(o.couponCode)})` : ""}</span><span>−${tl(o.discount)}</span></div>` : ""}
      ${o.type !== "gelal" ? `<div><span>Teslimat</span><span>${o.deliveryFee ? tl(o.deliveryFee) : "Ücretsiz"}</span></div>` : ""}
      <div class="grand"><span>Toplam</span><span>${tl(o.total)}</span></div>
    </div>`;
}
function editItemsHtml() {
  const ed = os.editing;
  const sub = ed.lines.reduce((t, l) => t + l.price * l.qty, 0);
  return `<h4>Ürünleri düzenle</h4>
    <div class="edit-items">${ed.lines.map((l, i) => `<div class="edit-item">
      <div class="nm ${l.qty === 0 ? "muted" : ""}" style="${l.qty === 0 ? "text-decoration:line-through" : ""}">${esc(l.name)}${l.isNew ? ' <span class="badge b-ok">yeni</span>' : ""}<div class="small muted">${tl(l.price)} / ${esc(l.unit)}</div></div>
      <div class="qty-step"><button type="button" data-q="${i}" data-d="-1" aria-label="Azalt">${icon("minus", "i-sm")}</button><input inputmode="${l.unit === "kg" ? "decimal" : "numeric"}" data-qi="${i}" value="${fq(l.qty)}" aria-label="${esc(l.name)} adet"><button type="button" data-q="${i}" data-d="1" aria-label="Artır">${icon("plus", "i-sm")}</button></div>
      <button type="button" class="icon-btn sm danger" data-qrm="${i}" aria-label="Çıkar">${icon("trash", "i-sm")}</button>
    </div>`).join("")}</div>
    <div class="picker mt">
      <label class="search" style="max-width:none"><span class="sr-only">Ürün ekle</span>${icon("search")}<input class="input" id="odAdd" placeholder="Ürün ekle: ad veya barkod…" autocomplete="off"></label>
      <div class="picker-results" id="odAddRes" hidden></div>
    </div>
    <p class="small muted" style="margin:8px 0 0">Mevcut ürünler sipariş anındaki fiyatını korur; eklenen ürün güncel fiyatla gelir. Teslimat ücreti değişmez, kupon indirimi yeniden hesaplanır.</p>
    <div class="totals"><div><span>Yeni ara toplam (yaklaşık)</span><span>${tl(sub)}</span></div></div>
    <div class="row-flex mt"><button type="button" class="btn btn-primary" data-dsaveitems>Kaydet</button><button type="button" class="btn" data-dcanceledit>Vazgeç</button></div>`;
}

function bindDetail(slot, o) {
  slot.onclick = async (e) => {
    const t = e.target.closest("button, [data-dclose]");
    if (!t) return;
    if (t.hasAttribute("data-dclose")) return tryCloseDetail();
    if (t.hasAttribute("data-dnext")) { t.disabled = true; t.classList.add("is-busy"); return advance(o); }
    if (t.dataset.dstatus) {
      if (t.dataset.dstatus === o.status) return;
      return setStatus(o, t.dataset.dstatus);
    }
    if (t.hasAttribute("data-dcancel")) return cancelDialog(o, true);
    if (t.hasAttribute("data-dcnote")) return cancelDialog(o, false);
    if (t.hasAttribute("data-dreopen")) {
      if (await confirmDialog({ title: "İptal geri alınsın mı?", message: `#${o.id} yeniden "Yeni" durumuna alınır, stok yeniden ayrılır.`, okLabel: "Geri al" })) setStatus(o, "Yeni");
      return;
    }
    if (t.hasAttribute("data-dprint")) return printReceipts([o]);
    if (t.hasAttribute("data-dmore")) {
      return openMenu(t, [
        { label: "Fiş yazdır", icon: "printer", onClick: () => printReceipts([o]) },
        ...(o.consent ? [{ label: "Sipariş sözleşmesini aç", icon: "file", onClick: () => openDocuments(o, false) }] : []),
        ...(isMasked(o) || !o.customer.phone ? [] : [{ label: "Müşteri geçmişi", icon: "user", onClick: () => nav.go(`/panel/musteriler/${o.customer.phone}`) }]),
        ...(o.trackPath ? [{ label: "Gizli takip bağlantısını kopyala", icon: "copy", onClick: () => copyText(location.origin + o.trackPath) }] : []),
        { label: "Sipariş numarasını kopyala", icon: "copy", onClick: () => copyText(`Sipariş no: ${o.id}`) },
        ...(isAdmin() && ["Teslim edildi", "İptal"].includes(o.status) ? ["-", { label: "Siparişi sil", icon: "trash", danger: true, onClick: () => deleteOne(o) }] : []),
      ]);
    }
    if (t.hasAttribute("data-dwa")) return waMenu(t, o);
    if (t.dataset.dconfirm) return confirmDialogFor(o, t.dataset.dconfirm);
    if (t.dataset.drr) return returnDialog(o, Number(t.dataset.drr));
    if (t.dataset.ddoc) return openDocuments(o, t.dataset.ddoc === "print");
    if (t.hasAttribute("data-dedit")) {
      if (!state.loaded.products) await loadCatalog().catch(() => {});
      os.editing = { lines: o.items.map((i) => ({ ...i, orig: i.qty })) };
      setDirty("order-items", true, "Sipariş kalemleri");
      return rerenderItems(o);
    }
    if (t.hasAttribute("data-dcanceledit")) { os.editing = null; setDirty("order-items", false); return rerenderItems(o); }
    if (t.hasAttribute("data-dsaveitems")) return saveItems(o, t);
    if (t.dataset.q !== undefined) {
      const l = os.editing.lines[Number(t.dataset.q)];
      l.qty = Math.max(0, Math.min(99, qRound(l.qty + Number(t.dataset.d) * qStep(l.unit), l.unit)));
      return rerenderItems(o);
    }
    if (t.dataset.qrm !== undefined) {
      const i = Number(t.dataset.qrm);
      const l = os.editing.lines[i];
      if (l.isNew) os.editing.lines.splice(i, 1); else l.qty = 0;
      return rerenderItems(o);
    }
    if (t.dataset.addp) {
      const p = state.products.find((x) => x.id === Number(t.dataset.addp));
      const ex = os.editing.lines.find((l) => l.productId === p.id);
      if (ex) ex.qty = Math.min(99, ex.qty + qStep(ex.unit));
      else os.editing.lines.push({ productId: p.id, name: p.name, unit: p.unit, price: p.price, qty: 1, isNew: true, orig: 0 });
      return rerenderItems(o, true);
    }
    if (t.id === "odSaveNotes") return saveNotes(o, t);
  };
  slot.oninput = (e) => {
    if (e.target.id === "odCourier" || e.target.id === "odNote") {
      const d = notesDirty();
      $("#odSaveNotes").disabled = !d;
      $("#odNotesHint").textContent = d ? "Kaydedilmemiş değişiklik" : "";
      setDirty("order-notes", d, "Kurye / not");
    }
    if (e.target.dataset.qi !== undefined) {
      const l = os.editing.lines[Number(e.target.dataset.qi)];
      const n = qRound(Number(String(e.target.value).replace(",", ".")), l.unit);
      if (Number.isFinite(n)) l.qty = Math.max(0, Math.min(99, n));
    }
    if (e.target.id === "odAdd") searchProducts(e.target.value);
  };
  slot.onchange = (e) => { if (e.target.dataset.qi !== undefined) rerenderItems(o); };
  slot.onkeydown = (e) => {
    if (e.key === "Escape" && !e.target.closest("input, textarea")) tryCloseDetail();
    if (e.key === "Enter" && e.target.id === "odAdd") { e.preventDefault(); const first = $("#odAddRes button"); if (first) first.click(); }
  };
}
function rerenderItems(o, focusAdd) {
  $("#odItems").innerHTML = itemsHtml(o);
  if (focusAdd || os.editing) { const a = $("#odAdd"); if (a && focusAdd) a.focus(); }
}
function searchProducts(q) {
  const box = $("#odAddRes");
  const f = fold(q.trim());
  if (!f) { box.hidden = true; return; }
  const res = state.products.filter((p) => fold(p.name).includes(f) || fold(p.brand).includes(f) || (p.barcode && p.barcode.includes(q.trim()))).slice(0, 12);
  box.hidden = false;
  box.innerHTML = res.length ? res.map((p) => `<button type="button" data-addp="${p.id}">${esc(p.emoji || "")} ${esc(p.name)}${isSoldOut(p) ? ' <span class="badge b-danger">Tükendi</span>' : ""}<span class="pr">${tl(p.price)}</span></button>`).join("") : `<div class="empty small" style="padding:12px">Ürün bulunamadı.</div>`;
}
async function saveItems(o, btn) {
  const items = [];
  for (const l of os.editing.lines) if (l.qty !== l.orig) items.push({ productId: l.productId, qty: l.qty });
  if (!items.length) { os.editing = null; setDirty("order-items", false); rerenderItems(o); return; }
  if (!os.editing.lines.some((l) => l.qty > 0)) { toast("Siparişte en az bir ürün kalmalı. Tümünü çıkarmak için siparişi iptal edin.", "err"); return; }
  btn.disabled = true; btn.classList.add("is-busy");
  try {
    const r = await api(`/api/admin/orders/${o.id}/items`, { method: "PUT", body: { items } });
    const { warnings, ...n } = r;
    os.editing = null;
    setDirty("order-items", false);
    os.detail = n;
    const i = os.list.findIndex((x) => x.id === n.id);
    if (i >= 0) os.list[i] = n;
    renderDetail(); renderList();
    toast(`#${n.id} ürünleri güncellendi. Yeni toplam ${tl(n.total)}.`, warnings && warnings.length ? "warn" : "ok", { details: warnings });
  } catch (e) { toastErr(e); btn.disabled = false; btn.classList.remove("is-busy"); }
}
async function saveNotes(o, btn) {
  btn.disabled = true; btn.classList.add("is-busy");
  try {
    await patchOrder(o.id, { courier: $("#odCourier").value.trim(), adminNote: $("#odNote").value.trim() });
    setDirty("order-notes", false);
    renderDetail(); renderList();
    toast("Kurye ve not kaydedildi.");
  } catch (e) { toastErr(e); btn.disabled = false; btn.classList.remove("is-busy"); }
}
async function deleteOne(o) {
  if (!(await confirmDialog({ title: `#${o.id} silinsin mi?`, message: "Sipariş kalıcı olarak silinir. Silmeden önce otomatik yedek alınır.", okLabel: "Sil", danger: true }))) return;
  try {
    const r = await api("/api/admin/orders/bulk", { method: "POST", body: { ids: [o.id], action: "delete" } });
    bulkResult(r, "sipariş silindi");
    closeDetail();
    loadList();
  } catch (e) { toastErr(e); }
}
function copyText(t) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("Kopyalandı.")).catch(() => toast(t, "info"));
}

// WhatsApp hazır mesajlar
function waMenu(anchor, o) {
  const store = (state.store && state.store.store.name) || "Ulusoy Market";
  const first = String(o.customer.name || "").split(/\s+/)[0];
  const hi = `Merhaba ${first}, ${store}'ten yazıyoruz.`;
  const msgs = [
    ["Sipariş alındı", `${hi} #${o.id} numaralı siparişinizi aldık, hemen hazırlıyoruz. Toplam: ${tl(o.total)}.`],
    o.type === "gelal"
      ? ["Sipariş hazır", `${hi} #${o.id} numaralı siparişiniz hazır, mağazamızdan teslim alabilirsiniz.`]
      : ["Yola çıktı", `${hi} #${o.id} numaralı siparişiniz yola çıktı, birazdan kapınızda.`],
    ["Ürün yok", `${hi} #${o.id} numaralı siparişinizdeki bazı ürünler stokta kalmadı. Benzeriyle değiştirmemizi ister misiniz?`],
    ["Adres teyidi", `${hi} #${o.id} numaralı siparişiniz için adresinizi teyit edebilir misiniz?`],
    ["Gecikme", `${hi} #${o.id} numaralı siparişiniz yoğunluk nedeniyle birkaç dakika gecikecek, anlayışınız için teşekkürler.`],
    ["Boş mesaj", ""],
  ];
  const num = waNumber(o.customer.phone);
  openMenu(anchor, msgs.map(([label, text]) => ({ label, icon: "message", href: `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}` })));
}

// İptal + müşteriye not
function cancelDialog(o, isNew) {
  const presets = ["Ürünler stokta kalmadı", "Adrese teslimat yapılamıyor", "Telefonla ulaşılamadı", "Müşteri talebiyle iptal edildi", "Çalışma saatleri dışında"];
  openModal({
    title: isNew ? `#${o.id} iptal edilsin mi?` : `#${o.id} · müşteriye not`,
    danger: isNew, submitLabel: isNew ? "Siparişi iptal et" : "Notu kaydet",
    body: `<label class="field"><span>Müşteriye not <span class="hint">(takip ekranında görünür)</span></span>
        <textarea name="note" maxlength="300" rows="4" placeholder="Örn. Siparişinizdeki ürünler stokta kalmadığı için iptal edildi.">${esc(o.cancelNote || "")}</textarea>
        <span class="counter hint"><span>Kısa ve açık yazın.</span><span id="cnCount">0 / 300</span></span></label>
      <div class="preset-row">${presets.map((p) => `<button type="button" class="btn btn-sm" data-preset="${esc(p)}">${esc(p)}</button>`).join("")}</div>
      ${isNew ? `<div class="callout warn">${icon("alert")}<div>Stoktan düşülen ürünler ve kupon kullanımı geri alınır.</div></div>` : ""}`,
    onOpen: (f) => {
      const ta = f.note;
      const upd = () => ($("#cnCount").textContent = `${ta.value.length} / 300`);
      upd();
      ta.addEventListener("input", upd);
      f.addEventListener("click", (e) => {
        const b = e.target.closest("[data-preset]");
        if (!b) return;
        ta.value = ((ta.value.trim() ? ta.value.trim() + " " : "") + b.dataset.preset + ".").slice(0, 300);
        upd(); ta.focus();
      });
    },
    onSubmit: async (f) => {
      const body = { cancelNote: f.note.value.trim() };
      if (isNew) body.status = "İptal";
      await patchOrder(o.id, body);
      renderTabs(); renderList(); renderDetail();
      toast(isNew ? `#${o.id} iptal edildi.` : "Not kaydedildi.", isNew ? "warn" : "ok");
    },
  });
}

// ---------- Fiş (80 mm) ----------
// Fişle birlikte verilen basılı nüsha (YASAL.md §2.4 yöntem 3): satıcı bilgileri, ürün ürün cayma durumu,
// sözleşmenin tam metnine bağlantı.
const CAYMA_SHORT = { yok_cabuk_bozulan: "Cayma yok (çabuk bozulan)", acilirsa_yok_hijyen: "Ambalaj açılırsa cayma yok", var: "Cayma hakkı var (14 gün)" };
function sellerHtml() {
  const st = (state.store && state.store.store) || {};
  const lg = (state.store && state.store.legal) || {};
  const rows = [
    lg.companyTitle ? `Satıcı: ${esc(lg.companyTitle)}` : "",
    lg.taxOffice || lg.taxNo ? `${lg.taxOffice ? `${esc(lg.taxOffice)} V.D.` : "VKN"}${lg.taxNo ? ` ${esc(lg.taxNo)}` : ""}` : "",
    lg.mersis ? `MERSİS: ${esc(lg.mersis)}` : "",
    st.address ? esc(st.address) : "",
    [st.phone ? `Tel: ${esc(st.phone)}` : "", st.email ? esc(st.email) : ""].filter(Boolean).join(" · "),
    lg.etbisNo ? `ETBİS: ${esc(lg.etbisNo)}` : "",
  ].filter(Boolean);
  return rows.length ? `<div class="rc-small">${rows.join("<br>")}</div>` : "";
}
export function printReceipts(orders) {
  const s = (state.store && state.store.store) || { name: "Ulusoy Market", phone: "" };
  const line = (a, b) => `<div class="rc-row"><span>${a}</span><span>${b}</span></div>`;
  const seller = sellerHtml();
  $("#printArea").innerHTML = orders.map((o) => {
    const c = o.customer;
    const changeBack = o.payment === "nakit" && o.changeFor ? Math.max(0, o.changeFor - o.total) : null;
    return `<section class="receipt">
      <div class="rc-center"><div class="rc-store">${esc(s.name)}</div><div>${esc(s.phone || "")}</div></div>
      <hr class="rc-hr">
      <div class="rc-center"><div class="rc-big">SİPARİŞ #${o.id}</div><div>${fmtDateTime(o.createdAt)}</div>
        <div class="rc-label">${o.type === "gelal" ? "GEL-AL (MAĞAZADAN)" : "EVE TESLİM"}${o.preorder ? " · ÖN SİPARİŞ" : ""}</div></div>
      <hr class="rc-hr">
      <p class="rc-label">${esc(c.name)}</p>
      <p>Tel: ${esc(fmtPhone(c.phone))}</p>
      ${o.type !== "gelal" ? `<p>Bölge: ${esc(c.zoneName || "-")}</p><p style="white-space:pre-line">${esc(c.address)}</p>` : ""}
      <hr class="rc-hr">
      ${o.items.map((i) => `<div class="rc-item"><span class="q">${fq(i.qty)}${i.unit === "kg" ? "kg" : "x"}</span><span>${esc(i.name)}</span><span>${tl(i.price * i.qty)}</span></div>${CAYMA_SHORT[i.caymaDurumu] ? `<div class="rc-cay">${CAYMA_SHORT[i.caymaDurumu]}</div>` : ""}`).join("")}
      <hr class="rc-hr">
      ${line("Ara toplam", tl(o.subtotal))}
      ${o.discount ? line(`İndirim${o.couponCode ? ` (${esc(o.couponCode)})` : ""}`, `-${tl(o.discount)}`) : ""}
      ${o.type !== "gelal" ? line("Teslimat", o.deliveryFee ? tl(o.deliveryFee) : "Ücretsiz") : ""}
      <div class="rc-row rc-total"><span>TOPLAM</span><span>${tl(o.total)}</span></div>
      <div class="rc-box">ÖDEME: ${o.payment === "kart" ? "KAPIDA KART" : "KAPIDA NAKİT"}${changeBack !== null ? `<br>${tl(o.changeFor)} verecek<br>Para üstü: ${tl(changeBack)}` : ""}</div>
      <p><b>Ürün yoksa:</b> ${esc(SUBST[o.substitution] || "Beni arayın")}</p>
      ${o.note ? `<div class="rc-box">NOT: ${esc(o.note)}</div>` : ""}
      ${o.adminNote ? `<p><b>Market notu:</b> ${esc(o.adminNote)}</p>` : ""}
      ${o.courier ? `<p><b>Kurye:</b> ${esc(o.courier)}</p>` : ""}
      ${o.status === "İptal" ? `<div class="rc-box rc-center">İPTAL EDİLDİ</div>` : ""}
      <hr class="rc-hr">
      ${seller}
      <p class="rc-small">Cayma hakkı olan ürünlerde teslimden itibaren 14 gün içinde cayma bildirebilirsiniz; çabuk bozulan ürünlerde cayma hakkı yoktur, ayıplı ürün her zaman değiştirilir. Bu belge mali fiş/fatura yerine geçmez.</p>
      ${o.consent && o.token ? `<p class="rc-small">Sözleşmeniz ve ön bilgilendirme formu:</p><p class="rc-url">${esc(location.origin)}/siparis/${o.id}/belgeler?t=${esc(o.token)}</p>` : ""}
      <hr class="rc-hr">
      <div class="rc-center">Teşekkür ederiz!</div>
    </section>`;
  }).join("");
  // Yazdırınca fiş alanı (müşteri adı, telefon, adres) DOM'da bekletilmez
  window.addEventListener("afterprint", () => { const pa = $("#printArea"); if (pa) pa.innerHTML = ""; }, { once: true });
  setTimeout(() => window.print(), 50);
}

// ---------- Elle (telefonla gelen) sipariş ----------
async function manualOrder() {
  try {
    await loadCatalog();
    if (!state.store) state.store = await api("/api/store");
  } catch (e) { toastErr(e); return; }
  const zones = state.store.zones || [];
  const cart = new Map(); // productId → qty
  let quoteCtrl = null;
  let ctl = null;
  const requote = debounce(async () => {
    if (!ctl) return;
    const f = ctl.form;
    const box = $("#moQuote");
    if (!box) return;
    if (!cart.size) { box.innerHTML = ""; return; }
    if (quoteCtrl) quoteCtrl.abort();
    quoteCtrl = new AbortController();
    try {
      const q = await api("/api/cart/quote", { method: "POST", signal: quoteCtrl.signal, body: {
        items: [...cart].map(([productId, qty]) => ({ productId, qty })), type: f.type.value,
        zoneId: f.zoneId.value ? Number(f.zoneId.value) : undefined, couponCode: f.couponCode.value.trim() || undefined, phone: f.phone.value.trim() || undefined,
      } });
      const notes = [...q.warnings, ...q.errors.filter((e) => !["KAPALI", "DURDURULDU", "BOLGE_SECIN"].includes(e.code)).map((e) => e.code === "MIN_TUTAR" ? `${e.message} (Elle siparişte yalnızca uyarıdır.)` : e.message)];
      box.innerHTML = `<div class="totals card card-pad">
        <div><span>Ara toplam</span><span>${tl(q.subtotal)}</span></div>
        ${q.discount ? `<div><span>İndirim</span><span>−${tl(q.discount)}</span></div>` : ""}
        ${f.type.value === "teslimat" ? `<div><span>Teslimat</span><span>${q.deliveryFee ? tl(q.deliveryFee) : "Ücretsiz"}</span></div>` : ""}
        <div class="grand"><span>Toplam</span><span>${tl(q.total)}</span></div></div>
        ${notes.length ? `<div class="callout warn mt">${icon("alert")}<div>${notes.map(esc).join("<br>")}</div></div>` : ""}`;
    } catch (e) { if (e.name !== "AbortError") box.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
  }, 300);
  ctl = openModal({
    title: "Elle sipariş (telefonla gelen)", size: "wide", submitLabel: "Siparişi oluştur",
    body: `<div class="seg" role="group" aria-label="Teslimat türü"><button type="button" data-mtype="teslimat" aria-pressed="true">${icon("truck", "i-sm")} Eve teslim</button><button type="button" data-mtype="gelal" aria-pressed="false">${icon("bag", "i-sm")} Gel-al</button></div>
      <input type="hidden" name="type" value="teslimat">
      <div class="grid-2">
        <label class="field"><span>Ad soyad</span><input name="name" maxlength="60" autocomplete="off" required></label>
        <label class="field"><span>Telefon</span><input name="phone" inputmode="tel" maxlength="20" placeholder="05xx xxx xx xx" autocomplete="off" required></label>
        <label class="field m-deliv"><span>Bölge</span><select name="zoneId"><option value="">Bölge seçin</option>${zones.map((z) => `<option value="${z.id}">${esc(z.name)}</option>`).join("")}</select></label>
        <label class="field"><span>Ödeme</span><select name="payment"><option value="nakit">Kapıda nakit</option><option value="kart">Kapıda kart</option></select></label>
        <label class="field span-2 m-deliv"><span>Adres</span><textarea name="address" maxlength="250" rows="2"></textarea></label>
        <label class="field m-cash"><span>Kaç TL'lik banknotla ödeyecek? <span class="hint">(isteğe bağlı)</span></span><input name="changeFor" inputmode="decimal" placeholder="Örn. 500"></label>
        <label class="field"><span>Ürün yoksa</span><select name="substitution"><option value="ara">Beni arayın</option><option value="benzer">Benzeriyle değiştirin</option><option value="cikar">Siparişten çıkarın</option></select></label>
        <label class="field"><span>Kupon <span class="hint">(isteğe bağlı)</span></span><input name="couponCode" maxlength="30" autocomplete="off" style="text-transform:uppercase"></label>
        <label class="field"><span>Sipariş notu</span><input name="note" maxlength="300" autocomplete="off"></label>
      </div>
      <div class="field"><span class="field-label">Ürünler</span>
        <div class="picker"><label class="search" style="max-width:none"><span class="sr-only">Ürün ara</span>${icon("search")}<input class="input" id="moSearch" placeholder="Ürün adı veya barkod yazın…" autocomplete="off"></label><div class="picker-results" id="moRes" hidden></div></div>
      </div>
      <div id="moCart"></div>
      <div id="moQuote"></div>`,
    onOpen: (f) => {
      const setType = (t) => {
        f.type.value = t;
        $$("[data-mtype]", f).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mtype === t)));
        $$(".m-deliv", f).forEach((x) => (x.hidden = t === "gelal"));
        requote();
      };
      const setPay = () => { $$(".m-cash", f).forEach((x) => (x.hidden = f.payment.value !== "nakit")); };
      f.addEventListener("click", (e) => {
        const tb = e.target.closest("[data-mtype]");
        if (tb) return setType(tb.dataset.mtype);
        const ap = e.target.closest("[data-mop]");
        if (ap) {
          const id = Number(ap.dataset.mop);
          cart.set(id, Math.min(99, cart.has(id) ? cart.get(id) + qStep(unitOf(id)) : 1));
          $("#moSearch").value = ""; $("#moRes").hidden = true; $("#moSearch").focus();
          renderCart(); requote();
          return;
        }
        const q = e.target.closest("[data-mq]");
        if (q) {
          const id = Number(q.dataset.mq);
          const n = (cart.get(id) || 0) + Number(q.dataset.d) * qStep(unitOf(id));
          if (n <= 0) cart.delete(id); else cart.set(id, Math.min(99, n));
          renderCart(); requote();
        }
      });
      f.payment.addEventListener("change", setPay);
      f.zoneId.addEventListener("change", requote);
      f.couponCode.addEventListener("change", requote);
      f.phone.addEventListener("change", requote);
      $("#moSearch").addEventListener("input", (e) => {
        const q = e.target.value.trim();
        const fq = fold(q);
        const box = $("#moRes");
        if (!fq) { box.hidden = true; return; }
        const hiddenCats = new Set(state.categories.filter((c) => c.hidden).map((c) => c.id));
        const res = state.products.filter((p) => !p.hidden && !hiddenCats.has(p.categoryId) && (fold(p.name).includes(fq) || fold(p.brand).includes(fq) || (p.barcode && p.barcode.includes(q)))).slice(0, 12);
        box.hidden = false;
        box.innerHTML = res.length ? res.map((p) => `<button type="button" data-mop="${p.id}" ${isSoldOut(p) ? "disabled" : ""}>${esc(p.emoji || "")} ${esc(p.name)} ${isSoldOut(p) ? '<span class="badge b-danger">Tükendi</span>' : ""}<span class="pr">${tl(p.price)}</span></button>`).join("") : `<div class="empty small" style="padding:12px">Ürün bulunamadı.</div>`;
      });
      $("#moSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const b = $("#moRes button:not([disabled])"); if (b) b.click(); } });
      setPay();
      renderCart();
    },
    onSubmit: async (f) => {
      if (!cart.size) throw new Error("En az bir ürün ekleyin.");
      const body = {
        type: f.type.value, name: f.name.value.trim(), phone: f.phone.value.trim(), payment: f.payment.value,
        substitution: f.substitution.value, note: f.note.value.trim(),
        items: [...cart].map(([productId, qty]) => ({ productId, qty })),
      };
      if (body.type === "teslimat") { body.address = f.address.value.trim(); body.zoneId = f.zoneId.value ? Number(f.zoneId.value) : null; }
      const cf = parseNum(f.changeFor.value);
      if (body.payment === "nakit" && cf) body.changeFor = cf;
      if (f.couponCode.value.trim()) body.couponCode = f.couponCode.value.trim();
      const r = await api("/api/admin/orders", { method: "POST", body });
      toast(`Sipariş #${r.id} oluşturuldu (${tl(r.total)}).`, r.warnings && r.warnings.length ? "warn" : "ok", { details: r.warnings });
      latestId = Math.max(latestId, r.id);
      os.tab = "aktif";
      loadList();
      setTimeout(() => nav.go(`/panel/siparisler/${r.id}`), 0);
      return true;
    },
  });
  function renderCart() {
    const box = $("#moCart");
    if (!box) return;
    box.innerHTML = cart.size ? `<table class="items-tbl"><tbody>${[...cart].map(([id, q]) => {
      const p = state.products.find((x) => x.id === id) || { name: `#${id}`, price: 0, unit: "adet" };
      return `<tr><td>${esc(p.name)}<div class="small muted">${tl(p.price)} / ${esc(p.unit)}</div></td><td class="p"><div class="qty-step"><button type="button" data-mq="${id}" data-d="-1" aria-label="Azalt">${icon("minus", "i-sm")}</button><input value="${fq(q)}${p.unit === "kg" ? " kg" : ""}" readonly aria-label="Miktar"><button type="button" data-mq="${id}" data-d="1" aria-label="Artır">${icon("plus", "i-sm")}</button></div></td></tr>`;
    }).join("")}</tbody></table>` : `<div class="callout">${icon("info")}<div>Sepet boş. Yukarıdan ürün arayıp ekleyin.</div></div>`;
  }
}
