// Ulusoy Market yönetim paneli — giriş noktası (ES modülü; CSP: satır içi script yok)
import {
  state, $, $$, esc, icon, api, toast, toastErr, isAdmin, writeLS, setUnauthorizedHandler,
  confirmLeave, clearDirty, hideBulk, closeMenu, openMenu, confirmDialog, openModal, nav, loadCatalog,
} from "./admin/core.js";
import { ordersPage, startPolling, stopPolling, audio, notifyPermissionUI, resetUnseen } from "./admin/orders.js";
import { productsPage } from "./admin/products.js";
import { customersPage } from "./admin/customers.js";
import { campaignsPage } from "./admin/campaigns.js";
import { reportsPage } from "./admin/reports.js";
import { settingsPage, accountPage } from "./admin/settings.js";

const PAGES = [ordersPage, productsPage, customersPage, campaignsPage, reportsPage, settingsPage, accountPage];
let current = null;

// ---------- Oturum ----------
function showLogin(notice) {
  stopPolling();
  hideBulk();
  closeMenu();
  $$("dialog.modal").forEach((d) => d.remove());
  state.token = null;
  state.user = null;
  state.defaultPassword = false;
  $("#defaultPwWarn").hidden = true;
  state.settings = null;
  state.loaded = { products: false, categories: false };
  writeLS("panelToken", null);
  clearDirty();
  $("#app").hidden = true;
  $("#loginView").hidden = false;
  $("#loginNotice").hidden = !notice;
  $("#loginNotice").textContent = notice || "";
  document.title = "Giriş · Ulusoy Market Panel";
  setTimeout(() => $("#loginPass").focus(), 30);
}
setUnauthorizedHandler((msg) => { if (state.token) showLogin(msg); });
document.addEventListener("forcelogin", (e) => showLogin(e.detail));

$("#loginPwToggle").addEventListener("click", () => {
  const i = $("#loginPass");
  const show = i.type === "password";
  i.type = show ? "text" : "password";
  $("#loginPwToggle").setAttribute("aria-label", show ? "Şifreyi gizle" : "Şifreyi göster");
  $("#loginPwToggle use").setAttribute("href", show ? "#i-eye-off" : "#i-eye");
});

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#loginError");
  err.textContent = "";
  const username = $("#loginUser").value.trim();
  const password = $("#loginPass").value;
  if (!username || !password) { err.textContent = "Kullanıcı adı ve şifre girin."; return; }
  const btn = $("#loginBtn");
  btn.disabled = true; btn.classList.add("is-busy");
  try {
    const r = await api("/api/admin/login", { method: "POST", body: { username, password } });
    state.token = r.token;
    state.user = r.user;
    state.defaultPassword = !!r.defaultPassword;
    writeLS("panelToken", r.token);
    $("#loginPass").value = "";
    audio.unlock(); // giriş tıklaması bir kullanıcı hareketi: ses bağlamı açılabilir
    await startApp();
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false; btn.classList.remove("is-busy");
  }
});

async function logout() {
  if (!(await confirmLeave())) return;
  try { await api("/api/admin/logout", { method: "POST" }); } catch { /* yine de çık */ }
  showLogin("Çıkış yapıldı.");
}

// ---------- Uygulama ----------
async function startApp() {
  if (!state.user) {
    const me = await api("/api/admin/me");
    state.user = me.user;
    state.defaultPassword = !!me.defaultPassword;
  }
  renderPwWarn();
  $("#loginView").hidden = true;
  $("#app").hidden = false;
  document.body.dataset.role = state.user.role;
  $("#userChip").textContent = state.user.name || state.user.username;
  buildNav();
  refreshStore();
  loadCatalog().catch(toastErr);
  startPolling();
  notifyPermissionUI();
  route(location.pathname, false);
}

// Varsayılan (herkesçe bilinen) şifreyle giriş yapıldıysa her ekranda kapanmayan uyarı
function renderPwWarn() { $("#defaultPwWarn").hidden = !state.defaultPassword; }
document.addEventListener("passwordchanged", () => { state.defaultPassword = false; renderPwWarn(); });

function allowedPages() { return PAGES.filter((p) => !p.admin || isAdmin()); }

function buildNav() {
  const pages = allowedPages();
  $("#sideNav").innerHTML = pages.map((p) => `<a class="side-link" href="/panel/${p.id}" data-nav="${p.id}">${icon(p.icon)}<span>${esc(p.short || p.title)}</span>${p.id === "siparisler" ? `<span class="count hot" data-new-count hidden></span>` : ""}</a>`).join("");
  // Telefonda alt gezinme en fazla 5 öğe: fazlası "Daha fazla" menüsüne
  const primary = isAdmin() ? ["siparisler", "urunler", "musteriler", "raporlar"] : pages.map((p) => p.id);
  const items = pages.filter((p) => primary.includes(p.id));
  $("#bottomNav").innerHTML = items.map((p) => `<a href="/panel/${p.id}" data-nav="${p.id}">${icon(p.icon)}<span>${esc(p.short || p.title)}</span>${p.id === "siparisler" ? `<span class="count hot" data-new-count hidden></span>` : ""}</a>`).join("")
    + (isAdmin() ? `<button type="button" id="moreNav" aria-haspopup="menu">${icon("menu")}<span>Daha fazla</span></button>` : "");
  const more = $("#moreNav");
  if (more) more.addEventListener("click", () => openMenu(more, [
    ...pages.filter((p) => !primary.includes(p.id)).map((p) => ({ label: p.title, icon: p.icon, onClick: () => go(`/panel/${p.id}`) })),
    "-",
    { label: "Mağazayı aç", icon: "store", href: "/" },
    { label: "Çıkış yap", icon: "logout", danger: true, onClick: logout },
  ]));
}

function markNav(id) {
  $$("[data-nav]").forEach((a) => {
    if (a.classList.contains("brand")) return;
    if (a.dataset.nav === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const more = $("#moreNav");
  if (more) {
    const inMore = !["siparisler", "urunler", "musteriler", "raporlar"].includes(id);
    if (inMore) more.setAttribute("aria-current", "page"); else more.removeAttribute("aria-current");
  }
}

/** /panel/<sayfa>/<alt yol> */
async function route(path, push = true) {
  const parts = path.replace(/^\/panel\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  let page = allowedPages().find((p) => p.id === parts[0]);
  if (!page) {
    const exists = PAGES.find((p) => p.id === parts[0]);
    if (exists) toast("Bu ekran için yönetici yetkisi gerekiyor.", "warn");
    page = ordersPage;
    parts.length = 0;
  }
  const sub = parts.slice(1);
  const url = `/panel/${[page.id, ...sub].map(encodeURIComponent).join("/")}`;
  if (push) history.pushState(null, "", url); else history.replaceState(null, "", url);
  hideBulk();
  closeMenu();
  const same = current === page;
  if (!same && current && current.leave) current.leave();
  current = page;
  markNav(page.id);
  $("#pageTitle").textContent = page.title;
  setTitle();
  const content = $("#content");
  if (same && page.update) {
    await page.update(content, sub);
  } else {
    content.innerHTML = "";
    window.scrollTo(0, 0);
    try {
      await page.render(content, sub);
    } catch (e) {
      toastErr(e);
      if (e && e.status !== 401) content.innerHTML = `<div class="empty">${icon("alert")}<b>Ekran yüklenemedi</b>${esc(e.message)}<div class="mt"><button type="button" class="btn" id="retryPage">${icon("refresh")} Tekrar dene</button></div></div>`;
      const r = $("#retryPage");
      if (r) r.addEventListener("click", () => { current = null; route(location.pathname, false); });
    }
  }
  if (page.id === "siparisler") resetUnseen();
}

export async function go(path) {
  if (path === location.pathname) return;
  if (!(await confirmLeave())) return;
  route(path, true);
}
nav.go = go;
nav.replace = (path) => history.replaceState(null, "", path);
nav.current = () => current;
nav.setTitle = () => setTitle();

let unseenCount = 0;
document.addEventListener("unseen", (e) => { unseenCount = e.detail; setTitle(); });
function setTitle() {
  const base = current ? `${current.title} · Ulusoy Panel` : "Ulusoy Panel";
  document.title = unseenCount ? `(${unseenCount}) Yeni sipariş · ${base}` : base;
}

window.addEventListener("popstate", async () => {
  if (!state.user) return;
  if (!(await confirmLeave())) { history.pushState(null, "", `/panel/${current ? current.id : ""}`); return; }
  route(location.pathname, false);
});

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-nav], a[data-link]");
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  go(a.getAttribute("href"));
});
document.addEventListener("click", (e) => { if (e.target.closest("[data-action=logout]")) logout(); });

// ---------- Mağaza durumu rozeti + tek tuşla sipariş alımını durdurma ----------
async function refreshStore() {
  try {
    state.store = await api("/api/store");
    renderStorePill(state.store.status);
  } catch { /* sessiz */ }
}
export function renderStorePill(status) {
  if (!status) return;
  const pill = $("#storePill");
  pill.dataset.state = status.state;
  pill.querySelector(".lbl").textContent = status.state === "durduruldu" ? "Sipariş alımı durdu" : status.label;
  pill.querySelector(".lbl-s").textContent = status.state === "durduruldu" ? "Durduruldu" : status.state === "acik" ? `Açık${status.closesAt ? " · " + status.closesAt : ""}` : "Kapalı";
  pill.title = isAdmin() ? `${status.label} — değiştirmek için dokunun` : status.label;
}
document.addEventListener("storestatus", (e) => { if (state.store) state.store.status = e.detail; renderStorePill(e.detail); });
setInterval(() => { if (state.user && document.visibilityState === "visible") refreshStore(); }, 120000);

$("#storePill").addEventListener("click", async () => {
  const st = state.store && state.store.status;
  if (!st) return;
  if (!isAdmin()) { toast(`${st.label}. ${st.message || ""}`.trim(), "info"); return; }
  const paused = st.paused;
  if (paused) {
    const ok = await confirmDialog({ title: "Sipariş alımı açılsın mı?", message: "Online siparişler yeniden alınmaya başlar (çalışma saatleri içinde).", okLabel: "Sipariş almaya başla" });
    if (!ok) return;
    try {
      const r = await api("/api/admin/settings", { method: "PATCH", body: { ordering: { enabled: true } } });
      state.settings = r.settings;
      document.dispatchEvent(new CustomEvent("storestatus", { detail: r.status }));
      document.dispatchEvent(new CustomEvent("settingsupdated"));
      toast("Online sipariş alımı açıldı.");
    } catch (e) { toastErr(e); }
  } else {
    const msg = (state.settings && state.settings.ordering.pausedMessage) || (state.store && state.store.ordering && state.store.ordering.pausedMessage) || "";
    openModal({
      title: "Sipariş alımını durdur", size: "narrow", danger: true, submitLabel: "Durdur",
      body: `<p style="margin:0">Mağaza sitesinde sipariş düğmesi kapanır, müşteriler aşağıdaki mesajı görür. İstediğiniz an yeniden açabilirsiniz.</p>
        <label class="field"><span>Müşteriye gösterilecek mesaj</span><textarea name="msg" maxlength="300" rows="3">${esc(msg)}</textarea></label>`,
      onSubmit: async (form) => {
        const r = await api("/api/admin/settings", { method: "PATCH", body: { ordering: { enabled: false, pausedMessage: form.msg.value.trim() || msg } } });
        state.settings = r.settings;
        document.dispatchEvent(new CustomEvent("storestatus", { detail: r.status }));
      document.dispatchEvent(new CustomEvent("settingsupdated"));
        toast("Online sipariş alımı durduruldu.", "warn");
      },
    });
  }
});

// ---------- Başlat ----------
if (state.token) {
  startApp().catch((e) => { if (e && e.status !== 401) showLogin(e.message); });
} else {
  showLogin();
}
