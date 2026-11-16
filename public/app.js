// Ulusoy Market — mağaza ön yüzü (bağımlılıksız, ES modülleri). Tek dayanak: docs/API.md
import { $, $$, esc, icon, api, toast, telHref, waHref } from "./js/lib.js";
import {
  S, on, emit, setStore, setQty, toggleFav, setDelivery, setCoupon, saveProfile, requestQuote, cartCount, status,
  storeInfo, zones,
} from "./js/state.js";
import { homeView, heroHtml, catalogView, openProduct, refreshQty, syncClock, resetSearchIndex } from "./js/shop.js";
import {
  cartView, refreshCartView, renderAside, renderCartBar, checkoutView, refreshCheckout, initCheckout, submitOrder,
  cleanField, clearFieldError, deleteAddress,
} from "./js/cart.js";
import {
  fetchMyOrders, activeOrders, renderStrip, dismissStrip, trackHtml, loadOrder, myOrdersView, lookupOrder, lookupHtml,
  openCancelDialog, confirmCancel, reorder, isActive,
} from "./js/orders.js";

const main = $("#main");
const desktop = window.matchMedia("(min-width: 1080px)");
let route = { name: "boot" };
let loadFailed = false;

// ---------- Yönlendirme (#/…) ----------
function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";
  // "#indirimler" gibi sayfa içi çapalar (panelde afiş bağlantısı) ana sayfadaki bölüme gider
  if (!raw.startsWith("/")) return { name: "home", anchor: raw };
  const [path, query = ""] = raw.split("?");
  const qp = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean);
  const common = { q: qp.get("q") || "", sort: qp.get("sirala") || "onerilen", onlyDiscount: qp.get("indirim") === "1" };
  switch (parts[0] || "") {
    case "": return { name: "home" };
    case "kategoriler": return { name: "catalog", ...common };
    case "kategori": return { name: "catalog", ...common, cat: Number(parts[1]) || null };
    case "ara": return { name: "catalog", ...common };
    case "favoriler": return { name: "catalog", ...common, favs: true };
    case "sepet": return { name: "cart" };
    case "odeme": return { name: "checkout" };
    case "siparislerim": return { name: "orders" };
    case "siparis": return { name: "track", id: Number(parts[1]) || 0, fresh: qp.get("yeni") === "1" };
    default: return { name: "notfound" };
  }
}
export function navigate(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(history.state, "", hash);
    render();
  } else if (location.hash === hash) render();
  else location.hash = hash;
}

const TITLES = { home: "", catalog: "Ürünler", cart: "Sepet", checkout: "Siparişi tamamla", orders: "Siparişlerim", track: "Sipariş takibi", notfound: "Sayfa bulunamadı" };
const NAV_OF = { home: "home", catalog: "kategoriler", cart: "sepet", checkout: "sepet", orders: "siparislerim", track: "siparislerim" };

let trackTimer = null;
function render({ keepScroll = false } = {}) {
  if (!S.store) return;
  const prev = route;
  route = parseRoute();
  clearInterval(trackTimer);
  const sameView = prev.name === route.name && prev.name === "catalog";
  const searchFocused = document.activeElement === $("#q");

  // Arama kutusu rotayla eşleşsin
  const qInput = $("#q");
  if (!searchFocused) qInput.value = route.name === "catalog" ? route.q : "";
  $("#qClear").hidden = !qInput.value;

  let html;
  switch (route.name) {
    case "home": html = homeView(); break;
    case "catalog":
      if (route.cat && !S.catById.has(route.cat)) { html = notFound(); break; }
      html = catalogView(route);
      break;
    case "cart": html = cartView(); break;
    case "checkout": {
      if (!status().acceptingOrders && !cartCount()) { html = cartView(); break; }
      html = checkoutView();
      if (html === null) { navigate("#/sepet", { replace: true }); return; }
      break;
    }
    case "orders": html = myOrdersView(); break;
    case "track": html = trackPlaceholder(); break;
    default: html = notFound();
  }
  main.innerHTML = html;
  main.dataset.view = route.name;
  document.body.dataset.view = route.name;

  const cat = route.cat && S.catById.get(route.cat);
  const t = cat ? cat.name : TITLES[route.name];
  document.title = `${t ? `${t} · ` : ""}${storeInfo().name || "Ulusoy Market"}${t ? "" : ` · ${storeInfo().slogan || ""}`}`;

  for (const a of $$("[data-nav]")) {
    if (a.dataset.nav === NAV_OF[route.name]) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }

  updateChrome();
  if (route.name === "checkout") initCheckout();
  if (route.name === "cart" || route.name === "checkout") requestQuote.flush();
  if (route.name === "track") showTrack(route);
  if (route.name === "orders" && S.myOrders.length) fetchMyOrders().catch(() => {});

  if (route.anchor) {
    const target = document.getElementById(route.anchor) || (/indirim/.test(route.anchor) ? document.getElementById("indirimler") : null);
    if (target) {
      target.scrollIntoView({ block: "start" });
      return;
    }
  }
  if (!sameView && !keepScroll) {
    window.scrollTo({ top: 0, behavior: "instant" });
    if (prev.name !== "boot" && !searchFocused) main.focus({ preventScroll: true });
  }
  if (route.name === "catalog") scrollActiveTab();
}

function updateChrome() {
  const v = route.name;
  const shopping = v === "home" || v === "catalog" || v === "notfound";
  renderAside(desktop.matches && shopping);
  if (desktop.matches && shopping && cartCount()) requestQuote();
  renderCartBar(!desktop.matches && (shopping || v === "cart"), v === "cart" ? "cart" : "shop");
  renderStrip(v === "track" || v === "orders" || v === "checkout");
  updateBadges();
}

function scrollActiveTab() {
  const tab = main.querySelector('.tab[aria-current="page"]');
  if (tab && tab.parentElement) {
    const track = tab.parentElement;
    track.scrollLeft = tab.offsetLeft - 16;
  }
}

function notFound() {
  return `<div class="page-pad narrow"><div class="empty"><p class="empty-title">Bu sayfa bulunamadı.</p><p>Bağlantı eskimiş olabilir.</p><p class="empty-actions"><a class="btn btn-primary" href="#/">Ana sayfaya dön</a></p></div></div>`;
}

// ---------- Sipariş takibi ----------
function trackPlaceholder() {
  return `<div class="page-pad narrow"><div class="sk sk-hero"></div><div class="sk sk-card"></div></div>`;
}
async function showTrack(r) {
  const known = S.myOrders.some((o) => o.id === r.id);
  if (!known) {
    main.innerHTML = `<div class="page-pad narrow"><a class="back-link" href="#/siparislerim">${icon("left")}Siparişlerim</a>
      <h1 class="page-h1">Sipariş #${r.id || ""}</h1>
      <p class="muted">Bu sipariş bu cihazda kayıtlı değil. Telefon numaranızla sorgulayın.</p>${lookupHtml(r.id ? String(r.id) : "")}</div>`;
    return;
  }
  const cached = S.orderData.find((o) => o.id === r.id);
  if (cached) paintTrack(cached, r);
  try {
    const o = await loadOrder(r.id);
    if (route.name === "track" && route.id === r.id) paintTrack(o, r);
  } catch (e) {
    if (route.name !== "track" || route.id !== r.id) return;
    if (!cached) main.innerHTML = errorView(e.message, "track-retry");
    return;
  }
  trackTimer = setInterval(async () => {
    if (document.hidden || route.name !== "track" || route.id !== r.id) return;
    try {
      const o = await loadOrder(r.id);
      if (route.name === "track" && route.id === r.id && !$("#confirmDialog").open) paintTrack(o, r);
      if (!isActive(o)) clearInterval(trackTimer);
    } catch {}
  }, 15000);
}
let lastTrackSig = "";
function paintTrack(o, r) {
  const sig = `${o.id}:${o.status}:${o.updatedAt}:${r.fresh}`;
  const el = main.querySelector(`[data-order="${o.id}"]`);
  if (el && sig === lastTrackSig) return;
  lastTrackSig = sig;
  const hadFocus = el && el.contains(document.activeElement) ? document.activeElement.dataset.action : null;
  main.innerHTML = trackHtml(o, { fresh: r.fresh });
  if (hadFocus) main.querySelector(`[data-action="${hadFocus}"]`)?.focus();
}

function errorView(msg, action = "retry-load") {
  return `<div class="page-pad narrow"><div class="empty empty-error" role="alert">
    <span class="empty-art" aria-hidden="true">${icon("offline")}</span>
    <p class="empty-title">Mağaza yüklenemedi.</p>
    <p>${esc(msg)}</p>
    <p class="empty-actions"><button class="btn btn-primary" type="button" data-action="${action}">${icon("refresh")}Yeniden dene</button>
    <a class="btn btn-ghost" href="tel:05373119696">${icon("phone")}Telefonla sipariş</a></p>
  </div></div>`;
}

// ---------- Başlık, duyuru, alt bilgi ----------
function renderHeader() {
  const st = status();
  const pill = $("#statusPill");
  pill.dataset.state = st.state || "kapali";
  pill.querySelector(".status-text").textContent = st.label || "";
  pill.title = st.message || "";
  const i = storeInfo();
  if (i.phone) $("#topCall").href = telHref(i.phone);
  if (i.whatsapp) $("#topWa").href = waHref(i.whatsapp);
  const a = S.store.announcement;
  const ann = $("#announce");
  if (a && a.active && a.text) {
    ann.textContent = a.text;
    ann.hidden = false;
  } else ann.hidden = true;
}

function renderFooter() {
  const i = storeInfo();
  const year = new Date().getFullYear();
  const hours = (S.store.hours?.summary || []).map((h) => `<li>${esc(h.days)}: ${esc(h.text)}</li>`).join("");
  $("#footer").innerHTML = `<div class="footer-inner">
    <div class="footer-brand">
      <img src="/img/logo.webp" alt="" width="44" height="47" loading="lazy">
      <p><strong>${esc(i.name)}</strong><span>${esc(i.slogan || "")}</span></p>
    </div>
    <div class="footer-col footer-contact">
      <h2>İletişim</h2>
      <ul>
        ${i.address ? `<li>${esc(i.address)}</li>` : ""}
        ${i.phone ? `<li><a href="${esc(telHref(i.phone))}">${esc(i.phone)}</a></li>` : ""}
        ${i.whatsapp ? `<li><a href="${esc(waHref(i.whatsapp))}" target="_blank" rel="noopener">WhatsApp'tan yazın</a></li>` : ""}
        ${i.instagram ? `<li><a href="${esc(i.instagram)}" target="_blank" rel="noopener">${icon("insta")}Instagram</a></li>` : ""}
        ${i.mapsUrl ? `<li><a href="${esc(i.mapsUrl)}" target="_blank" rel="noopener">Haritada göster</a></li>` : ""}
      </ul>
    </div>
    <div class="footer-col">
      <h2>Sipariş saatleri</h2>
      <ul>${hours}</ul>
    </div>
    <div class="footer-col">
      <h2>Teslimat bölgeleri</h2>
      <ul class="footer-zones">${zones().map((z) => `<li><a href="/teslimat/${esc(z.slug)}">${esc(z.name)}</a></li>`).join("")}</ul>
    </div>
    <div class="footer-col">
      <h2>Kurumsal</h2>
      <ul>
        <li><a href="/hakkimizda">Hakkımızda</a></li>
        <li><a href="/kvkk">KVKK aydınlatma metni</a></li>
        <li><a href="/mesafeli-satis">Mesafeli satış sözleşmesi</a></li>
        <li><a href="/iade-kosullari">İade koşulları</a></li>
        <li><a href="/cerez-politikasi">Çerez politikası</a></li>
      </ul>
    </div>
    <p class="footer-legal">© ${year} ${esc(S.store.legal?.companyTitle || i.name)}. Alkollü içki ve tütün ürünleri internetten satılmaz.</p>
  </div>`;
}

function updateBadges() {
  const n = cartCount();
  for (const b of $$('[data-badge="cart"]')) {
    b.hidden = !n;
    b.textContent = n > 99 ? "99+" : n;
  }
  const a = activeOrders().length;
  for (const b of $$('[data-badge="orders"]')) {
    b.hidden = !a;
    b.textContent = a;
  }
  for (const l of $$('[data-nav="sepet"]')) l.setAttribute("aria-label", n ? `Sepet, ${n} ürün` : "Sepet, boş");
}

// ---------- Tema ----------
const THEMES = ["", "dark", "light"];
const THEME_LABEL = { "": "sistem", dark: "koyu", light: "açık" };
const THEME_ICON = { "": "auto", dark: "moon", light: "sun" };
function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "";
}
function paintThemeBtn() {
  const t = currentTheme();
  const btn = $("#themeBtn");
  btn.setAttribute("aria-label", `Tema: ${THEME_LABEL[t]}. Değiştirmek için dokunun`);
  btn.title = `Tema: ${THEME_LABEL[t]}`;
  btn.innerHTML = icon(THEME_ICON[t]);
}
function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  if (next) document.documentElement.setAttribute("data-theme", next);
  else document.documentElement.removeAttribute("data-theme");
  try {
    if (next) localStorage.setItem("theme", next);
    else localStorage.removeItem("theme");
  } catch {}
  paintThemeBtn();
  toast(`Tema: ${THEME_LABEL[next]}`);
}

// ---------- Veri yükleme ----------
async function loadStore({ silent = false } = {}) {
  const data = await api("/api/store");
  syncClock(data.serverTime);
  const firstLoad = !S.store;
  setStore(data);
  resetSearchIndex();
  loadFailed = false;
  renderHeader();
  if (firstLoad) {
    renderFooter();
    applyZoneParam();
  }
  if (!silent || firstLoad) render({ keepScroll: !firstLoad });
  else {
    // Sessiz yenilemede yalnızca durum alanlarını tazele
    const hero = main.querySelector(".hero");
    if (hero && route.name === "home") hero.outerHTML = heroHtml();
    if (route.name === "cart") refreshCartView();
    if (route.name === "checkout") refreshCheckout();
    updateChrome();
    requestQuote();
  }
}

/** /?bolge=<slug> (bölge sayfalarındaki düğme) → bölgeyi önceden seç */
function applyZoneParam() {
  const p = new URLSearchParams(location.search);
  const slug = p.get("bolge");
  if (!slug) return;
  const z = zones().find((x) => x.slug === slug);
  if (z) {
    setDelivery({ type: "teslimat", zoneId: z.id });
    toast(`Teslimat bölgesi: ${z.name}`);
  }
  history.replaceState(null, "", location.pathname + location.hash);
}

async function boot() {
  paintThemeBtn();
  updateNet();
  if (S.myOrders.length) fetchMyOrders().catch(() => {});
  try {
    await loadStore();
  } catch (e) {
    loadFailed = true;
    main.innerHTML = errorView(e.message);
  }
}

// ---------- Ağ durumu ----------
function updateNet() {
  S.offline = !navigator.onLine;
  $("#netBanner").hidden = !S.offline;
}
window.addEventListener("online", () => {
  updateNet();
  if (loadFailed || !S.store) boot();
  else loadStore({ silent: true }).catch(() => {});
  if (S.myOrders.length) fetchMyOrders().catch(() => {});
});
window.addEventListener("offline", updateNet);

// ---------- Durum olayları ----------
on("cart", (d) => {
  updateBadges();
  if (d && d.id) refreshQty(d.id);
  else for (const slot of $$("[data-qty]")) refreshQty(Number(slot.dataset.qty));
  if (route.name === "cart") refreshCartView();
  if (route.name === "checkout") {
    if (!cartCount()) return navigate("#/sepet", { replace: true });
    refreshCheckout();
  }
  updateChrome();
  requestQuote();
});
on("quote", () => {
  if (route.name === "cart") {
    refreshCartView();
    if (!desktop.matches) renderCartBar(true, "cart");
  }
  if (route.name === "checkout") refreshCheckout();
  if (desktop.matches) renderAside(!$("#cartAside").hidden);
});
on("quoteLoading", () => {
  for (const t of $$(".totals")) t.classList.add("is-loading");
});
on("favs", (id) => {
  for (const b of $$(`[data-action="fav"][data-id="${id}"]`)) b.setAttribute("aria-pressed", S.favs.has(id));
});
on("orders", () => {
  updateBadges();
  renderStrip(route.name === "track" || route.name === "orders" || route.name === "checkout");
  if (route.name === "orders") {
    const region = main.querySelector('[data-region="orders"]');
    if (region) {
      const tmp = document.createElement("div");
      tmp.innerHTML = myOrdersView();
      region.replaceWith(tmp.querySelector('[data-region="orders"]'));
    }
  }
});

// ---------- Kullanıcı olayları ----------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const id = Number(el.dataset.id);
  switch (action) {
    case "inc": {
      const p = S.byId.get(id);
      const before = S.cart[id] || 0;
      const q = setQty(id, before + 1);
      if (!before && q) toast(`Sepete eklendi: ${p.name}`);
      else if (q === before) toast(`Bu üründen en fazla ${q} adet alınabilir.`, { tone: "warn" });
      break;
    }
    case "dec": {
      const before = S.cart[id] || 0;
      setQty(id, before - 1);
      if (before === 1) toast(`Sepetten çıkarıldı: ${S.byId.get(id)?.name || ""}`);
      break;
    }
    case "fav": {
      const now = toggleFav(id);
      toast(now ? "Favorilere eklendi" : "Favorilerden çıkarıldı");
      if (route.name === "catalog" && route.favs) render({ keepScroll: true });
      break;
    }
    case "product":
      openProduct(id);
      break;
    case "close-dialog":
      el.closest("dialog")?.close();
      break;
    case "close-dialog-nav": {
      e.preventDefault();
      const dlg = el.closest("dialog");
      pendingNav = el.getAttribute("href");
      dlg.close();
      break;
    }
    case "clear-search":
      $("#q").value = "";
      navigate("#/kategoriler");
      break;
    case "cart-clear":
      confirmBox("Sepet boşaltılsın mı?", "Sepetinizdeki tüm ürünler çıkarılır.", "Sepeti boşalt").then((ok) => {
        if (!ok) return;
        S.cart = {};
        S.notices = [];
        emit("cart", {});
        toast("Sepet boşaltıldı");
      });
      break;
    case "dismiss-notices":
      S.notices = [];
      if (route.name === "cart") refreshCartView();
      else refreshCheckout();
      break;
    case "coupon-remove":
      setCoupon("");
      break;
    case "strip-close":
      dismissStrip();
      break;
    case "cancel-order":
      openCancelDialog(id);
      break;
    case "reorder": {
      const r = reorder(id);
      if (r.added) {
        toast(r.missing ? `${r.added} ürün sepete eklendi, ${r.missing} ürün artık satışta değil.` : "Ürünler sepete eklendi");
        navigate("#/sepet");
      } else toast("Bu siparişteki ürünler artık satışta değil.", { tone: "warn" });
      break;
    }
    case "addr-delete": {
      deleteAddress(el.dataset.id);
      el.closest(".addr-opt")?.remove();
      const fs = $(".saved-addr");
      if (fs && fs.querySelectorAll(".addr-opt").length <= 1) fs.remove();
      toast("Adres silindi");
      break;
    }
    case "change-chip": {
      const input = $("#changeFor");
      if (input) {
        input.value = el.dataset.value;
        clearFieldError(input);
      }
      break;
    }
    case "to-summary":
      main.querySelector('[data-region="summary"]')?.scrollIntoView({ block: "start", behavior: "smooth" });
      break;
    case "noop":
      e.preventDefault();
      break;
    case "retry-load":
      main.innerHTML = trackPlaceholder();
      boot();
      break;
    case "track-retry":
      render();
      break;
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  const action = el.dataset.action;
  if (action === "dtype") setDelivery({ type: el.value });
  else if (action === "zone") {
    setDelivery({ zoneId: el.value ? Number(el.value) : null });
    const err = $("#zoneErr");
    if (err) err.hidden = true;
  } else if (action === "sort") {
    const p = new URLSearchParams((location.hash.split("?")[1] || ""));
    if (el.value === "onerilen") p.delete("sirala");
    else p.set("sirala", el.value);
    const base = location.hash.split("?")[0] || "#/kategoriler";
    navigate(`${base}${p.toString() ? `?${p}` : ""}`, { replace: true });
    $(".sort select")?.focus();
  } else if (action === "saved-addr") {
    const a = S.addresses.find((x) => x.id === el.value);
    const ta = $("#address");
    if (a) {
      ta.value = a.address;
      setDelivery({ zoneId: a.zoneId });
    } else {
      ta.value = "";
      ta.focus();
    }
    cleanField(ta);
    clearFieldError(ta);
  } else if (el.name === "payment") {
    const box = $('[data-region="change"]');
    if (box) box.hidden = el.value !== "nakit";
    saveProfile({ payment: el.value });
  } else if (el.name === "substitution") saveProfile({ substitution: el.value });
  else if (el.id === "phone" && /^0\d{10}$/.test(el.value)) {
    saveProfile({ phone: el.value });
    if (S.coupon) requestQuote();
  }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.clean || el.id === "note") cleanField(el);
  clearFieldError(el);
  if (el.id === "lkId" || el.id === "lkPhone") {
    const err = $("#lkError");
    if (err) err.hidden = true;
  }
});

document.addEventListener("submit", (e) => {
  const f = e.target;
  if (f.id === "searchForm") {
    e.preventDefault();
    $("#q").blur();
    return;
  }
  if (f.id === "orderForm") {
    e.preventDefault();
    submitOrder(f, navigate, () => loadStore({ silent: true }).catch(() => {}));
    return;
  }
  const kind = f.dataset.form;
  if (kind === "coupon") {
    e.preventDefault();
    const code = f.code.value.trim();
    if (!code) {
      f.code.focus();
      return;
    }
    setCoupon(code.toLocaleUpperCase("tr"));
  } else if (kind === "lookup") {
    e.preventDefault();
    lookupOrder(f, navigate);
  } else if (kind === "cancel") {
    e.preventDefault();
    confirmCancel(f).then((o) => {
      if (o) {
        toast(`Sipariş #${o.id} iptal edildi`);
        if (route.name === "track") paintTrack(o, route);
      }
    });
  }
});

// ---------- Arama ----------
const q = $("#q");
q.addEventListener("input", () => {
  const v = q.value.trim();
  $("#qClear").hidden = !q.value;
  if (v) {
    const target = `#/ara?q=${encodeURIComponent(v)}`;
    if (route.name === "catalog" && route.q) navigate(target, { replace: true });
    else navigate(target);
  } else if (route.name === "catalog" && route.q) navigate("#/kategoriler", { replace: true });
});
q.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && q.value) {
    q.value = "";
    q.dispatchEvent(new Event("input"));
  }
});
$("#qClear").addEventListener("click", () => {
  q.value = "";
  q.dispatchEvent(new Event("input"));
  q.focus();
});

// ---------- Pencereler ----------
let pendingNav = null;
const productDialog = $("#productDialog");
productDialog.addEventListener("close", () => {
  if (history.state && history.state.dialog) history.back();
  else if (pendingNav) {
    location.hash = pendingNav;
    pendingNav = null;
  }
});
productDialog.addEventListener("click", (e) => {
  if (e.target === productDialog) productDialog.close(); // arka plana dokununca kapan
});
window.addEventListener("popstate", () => {
  if (productDialog.open) productDialog.close();
  if (pendingNav) {
    const to = pendingNav;
    pendingNav = null;
    location.hash = to;
  }
});
const confirmDialog = $("#confirmDialog");
confirmDialog.addEventListener("click", (e) => {
  if (e.target === confirmDialog) confirmDialog.close();
});

function confirmBox(title, text, okLabel) {
  return new Promise((resolve) => {
    confirmDialog.innerHTML = `<form class="sheet-inner" method="dialog">
      <h2 class="sheet-title" id="cdTitle">${esc(title)}</h2>
      <p>${esc(text)}</p>
      <div class="sheet-actions">
        <button class="btn btn-ghost" value="no" type="submit">Vazgeç</button>
        <button class="btn btn-danger-solid" value="ok" type="submit">${esc(okLabel)}</button>
      </div>
    </form>`;
    confirmDialog.returnValue = "";
    confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue === "ok"), { once: true });
    confirmDialog.showModal();
    confirmDialog.querySelector('[value="no"]').focus();
  });
}

$("#themeBtn").addEventListener("click", cycleTheme);
// "İçeriğe geç": adres çubuğundaki rotayı bozmadan ana içeriğe odaklan
$(".skip-link").addEventListener("click", (e) => {
  e.preventDefault();
  main.focus();
});
window.addEventListener("hashchange", () => {
  if (productDialog.open) productDialog.close();
  render();
});
desktop.addEventListener("change", () => updateChrome());

// ---------- Yoklama ----------
setInterval(() => {
  if (document.hidden || !S.store) return;
  loadStore({ silent: true }).catch(() => {});
}, 90000);
setInterval(() => {
  if (document.hidden || !S.myOrders.length || route.name === "track") return;
  if (activeOrders().length || route.name === "orders") fetchMyOrders().catch(() => {});
}, 20000);
// Saat şeridindeki "şimdi" işareti dakikada bir ilerlesin
setInterval(() => {
  if (route.name !== "home" || document.hidden) return;
  const hero = main.querySelector(".hero");
  if (hero) hero.outerHTML = heroHtml();
}, 60000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !S.store) return;
  loadStore({ silent: true }).catch(() => {});
  if (S.myOrders.length) fetchMyOrders().catch(() => {});
});

// Yapışkan reyon sekmeleri başlığın hemen altında dursun
const topbar = $("#topbar");
new ResizeObserver(() => document.documentElement.style.setProperty("--header-h", `${topbar.offsetHeight}px`)).observe(topbar);

boot();
