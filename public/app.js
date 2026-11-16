// ---------- Durum ----------
const state = {
  categories: [],
  products: [],
  activeCat: "all",
  query: "",
  cart: loadCart(), // { [productId]: qty }
  myOrders: loadMyOrders(), // [{ id, token }]
  view: "cart", // cart | checkout | done | orders
};
const STEPS = ["Yeni", "Hazırlanıyor", "Yolda", "Teslim edildi"];
const STEP_LABELS = { Yeni: "Alındı", Hazırlanıyor: "Hazırlanıyor", Yolda: "Yolda", "Teslim edildi": "Teslim edildi" };

const $ = (s) => document.querySelector(s);
const tl = (n) => n.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function loadCart() {
  try { return JSON.parse(localStorage.getItem("cart")) || {}; } catch { return {}; }
}
function saveCart() {
  try { localStorage.setItem("cart", JSON.stringify(state.cart)); } catch {}
}
function loadMyOrders() {
  try { return JSON.parse(localStorage.getItem("myOrders")) || []; } catch { return []; }
}
function saveMyOrders() {
  try { localStorage.setItem("myOrders", JSON.stringify(state.myOrders)); } catch {}
}
function rememberOrder(id, token) {
  state.myOrders = [{ id, token }, ...state.myOrders.filter((o) => o.id !== id)].slice(0, 20);
  saveMyOrders();
}

// Bu tarayıcıdan verilen siparişlerin güncel durumunu çeker, şeridi ve rozeti günceller
async function fetchMyOrders() {
  const results = await Promise.all(
    state.myOrders.map((o) =>
      fetch(`/api/orders/${o.id}?token=${encodeURIComponent(o.token)}`)
        .then((r) => (r.ok ? r.json() : r.status === 404 ? { missing: o.id } : null))
        .catch(() => null)
    )
  );
  // Sunucuda artık bulunmayan siparişleri listeden temizle
  const missing = results.filter((r) => r && r.missing).map((r) => r.missing);
  if (missing.length) {
    state.myOrders = state.myOrders.filter((o) => !missing.includes(o.id));
    saveMyOrders();
  }
  state.orderData = results.filter((r) => r && !r.missing);
  renderBanner();
  return state.orderData;
}

const isActive = (o) => o.status !== "Teslim edildi" && o.status !== "İptal";
// Son 2 gün içinde iptal edilen siparişler müşteriye ayrıca duyurulur
const isRecentCancel = (o) => o.status === "İptal" && Date.now() - new Date(o.updatedAt).getTime() < 2 * 24 * 3600 * 1000;
function renderBanner() {
  const active = (state.orderData || []).filter(isActive);
  const cancelled = (state.orderData || []).filter(isRecentCancel);
  const badge = $("#activeCount");
  badge.hidden = !active.length;
  badge.textContent = active.length;

  const banner = $("#orderBanner");
  const shown = [...cancelled, ...active];
  const sig = shown.map((o) => `${o.id}:${o.status}:${o.cancelNote || ""}`).join(",");
  let dismissed = "";
  try { dismissed = sessionStorage.getItem("bannerHidden") || ""; } catch {}
  if (!shown.length || dismissed === sig) { banner.hidden = true; return; }

  let text;
  if (cancelled.length) {
    const c = cancelled[0];
    text = `⚠️ Siparişiniz <b>#${c.id}</b> iptal edildi.${c.cancelNote ? ` <span class="why">${esc(c.cancelNote)}</span>` : ""}`;
  } else {
    const o = active[0];
    text =
      active.length === 1
        ? `📦 Siparişiniz <b>#${o.id}</b> · <b>${STEP_LABELS[o.status] || o.status}</b> · ${tl(o.total)}`
        : `📦 <b>${active.length} aktif siparişiniz</b> var · Son sipariş <b>#${o.id}</b>: <b>${STEP_LABELS[o.status] || o.status}</b>`;
  }
  banner.classList.toggle("cancel", cancelled.length > 0);
  banner.innerHTML = `
    <div class="order-banner-inner">
      <span class="txt">${text}</span>
      <button class="btn" id="bannerTrack">${cancelled.length ? "Ayrıntılar" : "Siparişi takip et"}</button>
      <button class="x" id="bannerClose" aria-label="Kapat" title="Gizle">×</button>
    </div>`;
  banner.dataset.sig = sig;
  banner.hidden = false;
}
// Ürün görseli: yüklenmiş fotoğraf varsa onu, yoksa emoji göster
function thumb(p) {
  return p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />` : esc(p.emoji || "🛒");
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 1800);
}

// ---------- Veri ----------
async function load() {
  const [cats, prods] = await Promise.all([
    fetch("/api/categories").then((r) => r.json()),
    fetch("/api/products").then((r) => r.json()),
  ]);
  state.categories = cats;
  state.products = prods;
  // Gizlenmiş / silinmiş / tükenmiş ürünleri sepetten temizle
  for (const id of Object.keys(state.cart)) {
    if (!prods.some((p) => p.id === Number(id) && !p.soldOut)) delete state.cart[id];
  }
  saveCart();
  render();
}

// ---------- Sepet işlemleri ----------
function setQty(id, qty) {
  const p = state.products.find((x) => x.id === Number(id));
  if (!p || p.soldOut) qty = 0;
  if (qty <= 0) delete state.cart[id];
  else state.cart[id] = Math.min(qty, 99);
  saveCart();
  render();
}
function cartLines() {
  return Object.entries(state.cart)
    .map(([id, qty]) => ({ product: state.products.find((p) => p.id === Number(id)), qty }))
    .filter((l) => l.product);
}
const cartTotal = () => cartLines().reduce((s, l) => s + l.product.price * l.qty, 0);
const cartCount = () => cartLines().reduce((s, l) => s + l.qty, 0);

// ---------- Görünüm ----------
function render() {
  renderCats();
  renderProducts();
  renderDrawer();
  $("#cartCount").textContent = cartCount();
}

function renderCats() {
  const used = state.categories.filter((c) => state.products.some((p) => p.categoryId === c.id));
  $("#cats").innerHTML =
    `<button class="chip ${state.activeCat === "all" ? "active" : ""}" data-cat="all">Tümü</button>` +
    used.map((c) => `<button class="chip ${state.activeCat === c.id ? "active" : ""}" data-cat="${c.id}">${esc(c.emoji)} ${esc(c.name)}</button>`).join("");
}

function qtyControl(p) {
  if (p.soldOut) return `<button class="btn w-100 btn-soldout" disabled>Tükendi</button>`;
  const q = state.cart[p.id] || 0;
  if (!q) return `<button class="btn w-100" data-add="${p.id}">Sepete ekle</button>`;
  return `<div class="qty"><button data-dec="${p.id}" aria-label="Azalt">−</button><span>${q}</span><button data-inc="${p.id}" aria-label="Artır">+</button></div>`;
}

function renderProducts() {
  const q = state.query.toLocaleLowerCase("tr");
  const visible = state.products.filter(
    (p) => (state.activeCat === "all" || p.categoryId === state.activeCat) && (!q || p.name.toLocaleLowerCase("tr").includes(q))
  );
  if (!visible.length) {
    $("#products").innerHTML = `<p class="empty">Aradığınız kriterde ürün bulunamadı.</p>`;
    return;
  }
  const groups = state.categories
    .map((c) => ({ cat: c, items: visible.filter((p) => p.categoryId === c.id) }))
    .filter((g) => g.items.length);

  $("#products").innerHTML = groups
    .map(
      (g) => `
      <h2 class="section-title">${esc(g.cat.emoji)} ${esc(g.cat.name)}</h2>
      <div class="grid">
        ${g.items
          .map(
            (p) => `
          <div class="card ${p.soldOut ? "soldout" : ""}">
            <div class="thumb ${p.image ? "has-img" : ""}">${thumb(p)}${p.soldOut ? `<span class="soldout-tag">Tükendi</span>` : ""}</div>
            <div class="name">${esc(p.name)}</div>
            <div class="price">${tl(p.price)} <span class="unit">/ ${esc(p.unit)}</span></div>
            ${qtyControl(p)}
          </div>`
          )
          .join("")}
      </div>`
    )
    .join("");
}

function renderDrawer() {
  const body = $("#drawerBody");
  const foot = $("#drawerFooter");
  const lines = cartLines();

  if (state.view === "done" || state.view === "orders") return; // bu ekranlar kendi fonksiyonlarında çizilir

  if (state.view === "checkout" && lines.length) {
    $("#drawerTitle").textContent = "Teslimat bilgileri";
    if (!body.querySelector("#orderForm")) {
      body.innerHTML = `
        <form id="orderForm" novalidate>
          <div class="field"><label for="name">Ad Soyad</label><input id="name" name="name" autocomplete="name" maxlength="60" placeholder="Örn. Ayşe Yılmaz" required /></div>
          <div class="field"><label for="phone">Telefon</label><input id="phone" name="phone" type="tel" inputmode="numeric" maxlength="11" placeholder="05321234567" autocomplete="tel" required />
            <small class="hint">0 ile başlayan 11 haneli numara</small></div>
          <div class="field"><label for="address">Adres</label><textarea id="address" name="address" rows="4" maxlength="${ADDR_MAX}" placeholder="Mahalle, sokak, bina no, daire…" autocomplete="street-address" required></textarea>
            <small class="hint counter"><span>Harf, rakam ve . , : ; / # ' ( ) - kullanılabilir</span><span id="addrCount">0 / ${ADDR_MAX}</span></small></div>
          <p id="formError" class="error"></p>
        </form>`;
    }
    foot.innerHTML = `
      <div class="total-row"><span>Toplam (${cartCount()} ürün)</span><span>${tl(cartTotal())}</span></div>
      <button class="btn w-100" id="submitOrder" type="submit" form="orderForm">Siparişi onayla</button>
      <button class="btn btn-ghost w-100" id="backToCart" style="margin-top:8px">Sepete dön</button>`;
    return;
  }

  state.view = "cart";
  $("#drawerTitle").textContent = "Sepetim";
  if (!lines.length) {
    body.innerHTML = `<p class="empty">Sepetiniz boş.<br/>Ürün ekleyerek başlayın.</p>`;
    foot.innerHTML = "";
    return;
  }
  body.innerHTML = lines
    .map(
      ({ product: p, qty }) => `
    <div class="cart-line">
      <div class="e">${thumb(p)}</div>
      <div class="info"><div class="n">${esc(p.name)}</div><div class="p">${tl(p.price)} × ${qty} = <b>${tl(p.price * qty)}</b></div></div>
      <div class="qty"><button data-dec="${p.id}">−</button><span>${qty}</span><button data-inc="${p.id}">+</button></div>
    </div>`
    )
    .join("");
  foot.innerHTML = `
    <div class="total-row"><span>Toplam</span><span>${tl(cartTotal())}</span></div>
    <button class="btn w-100" id="toCheckout">Siparişi tamamla</button>`;
}

function openDrawer() {
  if (state.view === "done" || state.view === "orders") state.view = "cart";
  renderDrawer();
  $("#drawer").classList.add("open");
  $("#overlay").classList.add("open");
}
function closeDrawer() {
  $("#drawer").classList.remove("open");
  $("#overlay").classList.remove("open");
  if (state.view === "done" || state.view === "orders") { state.view = "cart"; renderDrawer(); }
}

// ---------- Siparişlerim / takip ----------
function openOrders(showPast = false) {
  state.view = "orders";
  state.showPast = showPast === true; // normalde önce aktif siparişler; iptal şeridinden gelince geçmiş de açık
  $("#drawerTitle").textContent = "Siparişlerim";
  $("#drawerFooter").innerHTML = "";
  $("#drawer").classList.add("open");
  $("#overlay").classList.add("open");
  renderOrders();
}

// compact = geçmiş sipariş kartı (adım çizgisi yok, daha sade)
function trackCard(o, compact = false) {
  const cancelled = o.status === "İptal";
  const idx = STEPS.indexOf(o.status);
  const steps = cancelled
    ? ""
    : `<div class="steps">${STEPS.map(
        (s, i) => `<div class="step ${i <= idx ? "done" : ""} ${i === idx ? "current" : ""}"><div class="dot"></div>${STEP_LABELS[s]}</div>`
      ).join("")}</div>`;
  const last = o.history[o.history.length - 1];
  return `
    <div class="track ${compact ? "past" : ""}" data-track="${o.id}">
      <div class="track-head">
        <b>Sipariş #${o.id}</b>
        <span class="status-pill ${cancelled ? "cancel" : ""}">${cancelled ? "İptal edildi" : STEP_LABELS[o.status] || o.status}</span>
      </div>
      <div class="meta">${new Date(o.createdAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })} · ${tl(o.total)}</div>
      ${compact ? "" : steps}
      ${
        cancelled
          ? `<div class="cancel-box"><b>Siparişiniz iptal edildi.</b>${o.cancelNote ? `<div class="cancel-msg">📝 ${esc(o.cancelNote)}</div>` : ""}</div>`
          : ""
      }
      <div class="meta">Son güncelleme: ${new Date(last.at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</div>
      <details>
        <summary>Ürünler (${o.items.reduce((s, i) => s + i.qty, 0)})</summary>
        <ul>${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)} — ${tl(i.price * i.qty)}</li>`).join("")}</ul>
      </details>
    </div>`;
}

// Siparişlerim ekranı iki parçadan oluşur: sipariş listesi (#ordersList) + sorgulama formu.
// Otomatik yenilemede sadece liste yeniden çizilir; formda yazılanlar kaybolmaz.
function ensureOrdersShell() {
  const body = $("#drawerBody");
  if (!body.querySelector("#ordersList")) {
    body.innerHTML = `
      <div id="ordersList"></div>
      <form id="lookupForm" class="lookup">
        <h3>Sipariş sorgula</h3>
        <div class="row">
          <input id="lkId" inputmode="numeric" placeholder="Sipariş no" required style="max-width:110px" />
          <input id="lkPhone" type="tel" inputmode="numeric" maxlength="11" placeholder="05321234567" required />
          <button class="btn btn-sm">Sorgula</button>
        </div>
        <p id="lkError" class="error" style="margin:8px 0 0"></p>
      </form>`;
  }
  return $("#ordersList");
}

// Aktif siparişler üstte; teslim edilen / iptal edilenler "Geçmiş siparişler" altında (açılır-kapanır)
function paintOrders(orders) {
  const list = ensureOrdersShell();
  if (!orders.length) {
    list.innerHTML = `<p class="empty" style="padding:24px 0">Bu cihazdan verilmiş sipariş yok.</p>`;
    return;
  }
  const sorted = [...orders].sort((a, b) => b.id - a.id); // yeniden eskiye
  const active = sorted.filter(isActive);
  const past = sorted.filter((o) => !isActive(o));

  let html = `<h3 class="ord-h">Aktif siparişler</h3>`;
  html += active.length ? active.map((o) => trackCard(o)).join("") : `<p class="empty-sm">Şu an aktif siparişiniz yok.</p>`;
  if (past.length) {
    html += `
      <button class="past-toggle" id="pastToggle" aria-expanded="${state.showPast}">
        <span>🕘 Geçmiş siparişler <span class="past-n">${past.length}</span></span>
        <span class="chev">${state.showPast ? "▲" : "▼"}</span>
      </button>`;
    if (state.showPast) html += `<div class="past-list">${past.map((o) => trackCard(o, true)).join("")}</div>`;
  }
  list.innerHTML = html;
}

async function renderOrders() {
  const list = ensureOrdersShell();
  if (!state.myOrders.length) return paintOrders([]);
  if (!list.querySelector(".track, .empty-sm")) list.innerHTML = `<p class="empty">Yükleniyor…</p>`;
  const found = await fetchMyOrders();
  if (state.view !== "orders") return; // bu arada kullanıcı başka ekrana geçtiyse
  paintOrders(found);
}

async function lookupOrder(e) {
  e.preventDefault();
  const id = $("#lkId").value.replace(/\D/g, "");
  const phone = $("#lkPhone").value;
  const err = $("#lkError");
  err.textContent = "";
  if (!id) { err.textContent = "Sipariş numarasını girin."; return; }
  if (!/^0\d{10}$/.test(phone)) { err.textContent = "Telefon 0 ile başlamalı ve 11 haneli olmalı."; return; }
  try {
    const res = await fetch(`/api/orders/${id}?phone=${encodeURIComponent(phone)}`);
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error; return; }
    if (data.token) rememberOrder(data.id, data.token);
    // Bulunan siparişi hemen göster (yeniden sorgulamayı beklemeden)
    state.orderData = [data, ...(state.orderData || []).filter((o) => o.id !== data.id)];
    renderBanner();
    if (!isActive(data)) state.showPast = true; // bulunan sipariş geçmişteyse o bölümü aç
    paintOrders(state.orderData);
    $(`[data-track="${data.id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    $("#lookupForm").reset();
    toast(`Sipariş #${data.id} bulundu`);
  } catch {
    err.textContent = "Bağlantı hatası, tekrar deneyin.";
  }
}

// Sipariş durumunu 15 sn'de bir yenile (Siparişlerim açıksa kartlar, değilse üst şerit)
setInterval(() => {
  if (!state.myOrders.length) return;
  if (state.view === "orders" && $("#drawer").classList.contains("open")) renderOrders();
  else fetchMyOrders().catch(() => {});
}, 15000);

async function submitOrder(e) {
  e.preventDefault();
  const f = e.target;
  const err = $("#formError");
  const btn = $("#submitOrder");
  err.textContent = "";
  const problem = validateForm(f);
  if (problem) { err.textContent = problem; return; }
  btn.disabled = true;
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name.value,
        phone: f.phone.value,
        address: f.address.value,
        items: cartLines().map((l) => ({ productId: l.product.id, qty: l.qty })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      err.textContent = data.error || "Sipariş oluşturulamadı.";
      if (res.status === 409) load();
      return;
    }
    state.cart = {};
    saveCart();
    rememberOrder(data.id, data.token);
    fetchMyOrders().catch(() => {});
    state.view = "done";
    render();
    $("#drawerTitle").textContent = "Sipariş alındı";
    $("#drawerBody").innerHTML = `
      <div class="success">
        <div class="big">✅</div>
        <h3>Teşekkürler!</h3>
        <p>Sipariş numaranız <b>#${data.id}</b><br/>Toplam: <b>${tl(data.total)}</b></p>
        <p style="color:var(--muted)">Siparişiniz hazırlanmaya başlayacak. Ödeme kapıda yapılacaktır.<br/>
        Durumunu üstteki <b>📦 Siparişlerim</b> bölümünden takip edebilirsiniz.</p>
      </div>`;
    $("#drawerFooter").innerHTML = `
      <button class="btn w-100" id="trackNow">Siparişimi takip et</button>
      <button class="btn btn-ghost w-100" id="closeDone" style="margin-top:8px">Alışverişe devam et</button>`;
  } catch {
    err.textContent = "Bağlantı hatası, tekrar deneyin.";
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------- Form kuralları (sunucudakiyle aynı) ----------
const TR = "A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû";
const ADDR_MAX = 250;
const ADDR_MAX_LINES = 5;
const FILTERS = {
  name: new RegExp(`[^${TR} .'-]`, "g"),
  address: new RegExp(`[^0-9${TR} .,:;/#'()\\n-]`, "g"),
};
// Telefon: sadece rakam, başta 0, en fazla 11 hane
function cleanPhone(v) {
  let d = v.replace(/\D/g, "");
  if (d && d[0] !== "0") d = "0" + d;
  return d.slice(0, 11);
}
function cleanField(el) {
  const before = el.value;
  let after = before;
  if (el.name === "phone" || el.id === "lkPhone") after = cleanPhone(before);
  else if (FILTERS[el.name]) after = before.replace(FILTERS[el.name], "").replace(/ {2,}/g, " ");
  if (el.name === "address") {
    // Boş satırları ve fazla satırı engelle, uzunluğu sınırla (yapıştırma dahil)
    after = after.replace(/\n{2,}/g, "\n").split("\n").slice(0, ADDR_MAX_LINES).join("\n").slice(0, ADDR_MAX);
  }
  if (el.id === "lkId") after = before.replace(/\D/g, "").slice(0, 8);
  if (after !== before) {
    const pos = el.selectionStart - (before.length - after.length);
    el.value = after;
    try { el.setSelectionRange(pos, pos); } catch {}
  }
  if (el.name === "address") {
    const c = $("#addrCount");
    c.textContent = `${el.value.length} / ${ADDR_MAX}`;
    c.classList.toggle("limit", el.value.length >= ADDR_MAX);
  }
}
function validateForm(f) {
  const name = f.name.value.trim();
  if (!/\S\s+\S/.test(name) || name.length < 3) { f.name.focus(); return "Lütfen adınızı ve soyadınızı girin."; }
  if (!/^0\d{10}$/.test(f.phone.value)) { f.phone.focus(); return "Telefon 0 ile başlamalı ve 11 haneli olmalı."; }
  if (f.address.value.trim().length < 10) { f.address.focus(); return "Lütfen açık adres girin (en az 10 karakter)."; }
  return "";
}
document.addEventListener("input", (e) => {
  if (!e.target.closest("#orderForm, #lookupForm")) return;
  cleanField(e.target);
  // Kullanıcı düzeltmeye başlayınca eski hata mesajı kalksın
  const err = e.target.closest("form").querySelector(".error");
  if (err) err.textContent = "";
});

// ---------- Olaylar ----------
document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.cat) {
    state.activeCat = t.dataset.cat === "all" ? "all" : Number(t.dataset.cat);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (t.dataset.add) {
    setQty(t.dataset.add, 1);
    toast("Sepete eklendi");
  } else if (t.dataset.inc) {
    setQty(t.dataset.inc, (state.cart[t.dataset.inc] || 0) + 1);
  } else if (t.dataset.dec) {
    setQty(t.dataset.dec, (state.cart[t.dataset.dec] || 0) - 1);
  } else if (t.id === "toCheckout") {
    state.view = "checkout";
    renderDrawer();
    $("#name").focus();
  } else if (t.id === "backToCart") {
    state.view = "cart";
    renderDrawer();
  } else if (t.id === "closeDone") {
    closeDrawer();
  } else if (t.id === "trackNow" || t.id === "bannerTrack") {
    openOrders(t.id === "bannerTrack" && $("#orderBanner").classList.contains("cancel"));
  } else if (t.id === "pastToggle") {
    state.showPast = !state.showPast;
    paintOrders(state.orderData || []);
    if (state.showPast) $(".past-list")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  } else if (t.id === "bannerClose") {
    const banner = $("#orderBanner");
    try { sessionStorage.setItem("bannerHidden", banner.dataset.sig || ""); } catch {}
    banner.hidden = true;
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "orderForm") submitOrder(e);
  if (e.target.id === "lookupForm") lookupOrder(e);
});
$("#openOrders").addEventListener("click", () => openOrders());
$("#openCart").addEventListener("click", openDrawer);
$("#closeCart").addEventListener("click", closeDrawer);
$("#overlay").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());
$("#search").addEventListener("input", (e) => {
  state.query = e.target.value.trim();
  renderProducts();
});

// Sayfa açılınca (yenileme dahil) önceki siparişleri hemen göster
if (state.myOrders.length) fetchMyOrders().catch(() => {});

load().catch(() => {
  $("#products").innerHTML = `<p class="empty">Ürünler yüklenemedi. Sunucunun çalıştığından emin olun.</p>`;
});
