// ================= Yardımcılar =================
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const tl = (n) => n.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STATUSES = ["Yeni", "Hazırlanıyor", "Yolda", "Teslim edildi", "İptal"];

const state = {
  token: getToken(),
  categories: [],
  products: [],
  orders: [],
  page: "urunler",
  pFilter: "all",
  oFilter: "all",
  revMode: "day",
  editingId: null, // düzenlenen ürün (null = yeni)
  editingCatId: null,
  imgChange: undefined, // undefined: değişmedi, null: kaldırıldı, string: yeni görsel
};

function getToken() { try { return sessionStorage.getItem("adminToken"); } catch { return null; } }
function setToken(t) { state.token = t; try { t ? sessionStorage.setItem("adminToken", t) : sessionStorage.removeItem("adminToken"); } catch {} }

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2000);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.token}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (res.status === 401 && path !== "/api/admin/login") { logout(); throw new Error("Oturum sona erdi, tekrar giriş yapın."); }
  if (!res.ok) throw new Error(data.error || "Hata");
  return data;
}

// Seçilen fotoğrafı tarayıcıda en fazla 800px'e küçültüp JPEG (data URL) olarak döndürür
function resizeImage(file, max = 800) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("Lütfen JPG, PNG veya WEBP bir görsel seçin."));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Görsel okunamadı.")); };
    img.src = url;
  });
}
const thumb = (p) => (p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" />` : esc(p.emoji || "🛒"));

// ================= Giriş / çıkış =================
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginError").textContent = "";
  try {
    const { token } = await api("/api/admin/login", { method: "POST", body: { password: $("#pw").value } });
    setToken(token);
    $("#pw").value = "";
    await start();
  } catch (err) {
    $("#loginError").textContent = err.message;
  }
});
function logout() {
  setToken(null);
  $("#appView").hidden = true;
  $("#loginView").hidden = false;
}
$("#logout").addEventListener("click", logout);

async function start() {
  await loadAll();
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  go(pageFromPath(), false);
}

async function loadAll() {
  const [cats, prods, orders] = await Promise.all([
    fetch("/api/categories").then((r) => r.json()),
    api("/api/admin/products"),
    api("/api/admin/orders"),
  ]);
  state.categories = cats;
  state.products = prods;
  state.orders = orders;
  updateNavBadge();
}

// ================= Sayfa yönlendirme =================
const PAGES = { urunler: renderProducts, siparisler: renderOrders, ciro: renderRevenue };
const TITLES = { urunler: "Ürünler", siparisler: "Siparişler", ciro: "Ciro" };
const pageFromPath = () => location.pathname.split("/")[2] || "urunler";

function go(page, push = true) {
  if (!PAGES[page]) page = "urunler";
  state.page = page;
  $$("[data-page]").forEach((s) => (s.hidden = s.dataset.page !== page));
  $$(".nav-link[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === page));
  const url = `/panel/${page}`;
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
  document.title = `${TITLES[page]} · Market Yönetim`;
  PAGES[page]();
  window.scrollTo(0, 0);
  // Siparişler ve Ciro her açılışta güncel siparişlerle yeniden çizilir
  if (page === "siparisler" || page === "ciro") {
    refreshOrders()
      .then(() => state.page === page && PAGES[page]())
      .catch(() => {});
  }
}
async function refreshOrders() {
  state.orders = await api("/api/admin/orders");
  updateNavBadge();
}
window.addEventListener("popstate", () => state.token && go(pageFromPath(), false));

function updateNavBadge() {
  const n = state.orders.filter((o) => o.status === "Yeni").length;
  $("#navNew").hidden = !n;
  $("#navNew").textContent = n;
}

// ================= ÜRÜNLER =================
function matchesFilter(p) {
  const q = $("#pSearch").value.trim().toLocaleLowerCase("tr");
  const f = state.pFilter;
  const okF = f === "all" || (f === "sale" && !p.soldOut && !p.hidden) || (f === "soldout" && p.soldOut) || (f === "hidden" && p.hidden);
  return okF && (!q || p.name.toLocaleLowerCase("tr").includes(q));
}

function productRow(p) {
  return `
  <div class="row ${p.soldOut ? "soldout" : ""} ${p.hidden ? "hidden-p" : ""}" data-id="${p.id}">
    <span class="handle" data-handle="prod" title="Sürükleyerek sırala">⋮⋮</span>
    <button class="r-thumb" data-edit="${p.id}" title="Düzenle">${thumb(p)}</button>
    <div class="r-info">
      <div class="nm">${esc(p.name)}</div>
      <div class="sub"><b>${tl(p.price)}</b> / ${esc(p.unit)}
        ${p.soldOut ? `<span class="tag red">Tükendi</span>` : ""}
        ${p.hidden ? `<span class="tag amber">Mağazada gizli</span>` : ""}
      </div>
    </div>
    <div class="r-acts">
      <button class="b xs ${p.soldOut ? "sold-out" : "on-sale"}" data-stock="${p.id}"
        title="${p.soldOut ? "Tekrar satışa açmak için tıklayın" : "Tükendi olarak işaretlemek için tıklayın"}">
        <span class="dot"></span>${p.soldOut ? "Tükendi" : "Satışta"}</button>
      <button class="b xs ${p.hidden ? "is-hidden" : ""}" data-vis="${p.id}"
        title="${p.hidden ? "Mağazada tekrar göster" : "Mağazadan tamamen gizle"}">${p.hidden ? "👁 Göster" : "🚫 Gizle"}</button>
      <button class="b xs" data-edit="${p.id}">✎ Düzenle</button>
      <button class="b xs danger" data-del="${p.id}">🗑 Sil</button>
    </div>
  </div>`;
}

function renderProducts() {
  const filtering = $("#pSearch").value.trim() !== "" || state.pFilter !== "all";
  const html = state.categories
    .map((c) => {
      const all = state.products.filter((p) => p.categoryId === c.id);
      const items = all.filter(matchesFilter);
      if (filtering && !items.length) return "";
      return `
      <div class="group" data-cat="${c.id}">
        <div class="group-head">
          <span class="handle" data-handle="cat" title="Kategoriyi sürükleyerek sırala">⋮⋮</span>
          <span class="cat-dot"></span>
          <h2>${esc(c.emoji)} ${esc(c.name)}</h2>
          <span class="n">${all.length} ürün</span>
          <span class="rule"></span>
          <div class="acts">
            <button class="b xs" data-editcat="${c.id}">✎ Düzenle</button>
            <button class="b xs danger" data-delcat="${c.id}">🗑 Sil</button>
          </div>
        </div>
        <div class="group-body" data-cat="${c.id}">
          ${items.length ? items.map(productRow).join("") : `<div class="group-empty">Bu kategoride henüz ürün yok.</div>`}
        </div>
      </div>`;
    })
    .join("");
  const g = $("#groups");
  g.innerHTML = html || `<p class="empty">Bu filtreye uyan ürün yok.</p>`;
  g.classList.toggle("no-drag", filtering);
}

$("#pSearch").addEventListener("input", renderProducts);
$("#pFilter").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.pFilter = b.dataset.f;
  $$("#pFilter button").forEach((x) => x.classList.toggle("active", x === b));
  renderProducts();
});
$("#reloadBtn").addEventListener("click", async () => { await loadAll(); renderProducts(); toast("Liste yenilendi"); });

async function patchProduct(id, body) {
  const updated = await api(`/api/admin/products/${id}`, { method: "PATCH", body });
  Object.assign(state.products.find((x) => x.id === id), updated);
  return updated;
}

$("#groups").addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  const d = t.dataset;
  try {
    if (d.stock) {
      const p = state.products.find((x) => x.id === Number(d.stock));
      await patchProduct(p.id, { soldOut: !p.soldOut });
      renderProducts();
      toast(p.soldOut ? `"${p.name}" tükendi olarak işaretlendi` : `"${p.name}" tekrar satışta`);
    } else if (d.vis) {
      const p = state.products.find((x) => x.id === Number(d.vis));
      await patchProduct(p.id, { hidden: !p.hidden });
      renderProducts();
      toast(p.hidden ? `"${p.name}" mağazadan gizlendi` : `"${p.name}" mağazada görünüyor`);
    } else if (d.edit) {
      openProdDlg(state.products.find((x) => x.id === Number(d.edit)));
    } else if (d.del) {
      const p = state.products.find((x) => x.id === Number(d.del));
      if (!confirm(`"${p.name}" kalıcı olarak silinsin mi?`)) return;
      await api(`/api/admin/products/${p.id}`, { method: "DELETE" });
      state.products = state.products.filter((x) => x !== p);
      renderProducts();
      toast("Ürün silindi");
    } else if (d.editcat) {
      openCatDlg(state.categories.find((c) => c.id === Number(d.editcat)));
    } else if (d.delcat) {
      const c = state.categories.find((x) => x.id === Number(d.delcat));
      if (!confirm(`"${c.name}" kategorisi silinsin mi?`)) return;
      await api(`/api/admin/categories/${c.id}`, { method: "DELETE" });
      state.categories = state.categories.filter((x) => x !== c);
      renderProducts();
      toast("Kategori silindi");
    }
  } catch (err) {
    toast(err.message);
  }
});

// ---------- Sürükle-bırak sıralama ----------
// Fare, parmak (telefon/tablet) ve kalemle aynı şekilde çalışır (pointer olayları).
let drag = null; // { el, isRow, box, before, scroll }
const groupsEl = $("#groups");
const orderKey = (box, sel) => [...box.querySelectorAll(`:scope > ${sel}`)].map((x) => x.dataset.id || x.dataset.cat).join(",");

groupsEl.addEventListener("pointerdown", (e) => {
  const h = e.target.closest(".handle");
  if (!h || groupsEl.classList.contains("no-drag") || e.button > 0) return;
  e.preventDefault();
  const isRow = h.dataset.handle !== "cat";
  const el = isRow ? h.closest(".row") : h.closest(".group");
  const box = isRow ? el.parentElement : groupsEl;
  drag = { el, isRow, box, before: orderKey(box, isRow ? ".row" : ".group"), scroll: 0, y: e.clientY };
  el.classList.add("dragging");
  document.body.classList.add("sorting");
  drag.timer = setInterval(() => drag && drag.scroll && (window.scrollBy(0, drag.scroll), moveTo(drag.y)), 16);
});

function moveTo(y) {
  const { el, isRow, box } = drag;
  const siblings = [...box.children].filter((x) => x.matches(isRow ? ".row" : ".group") && x !== el);
  const next = siblings.find((s) => {
    const r = s.getBoundingClientRect();
    return y < r.top + r.height / 2;
  });
  if (next ? el.nextElementSibling !== next : box.lastElementChild !== el) box.insertBefore(el, next || null);
}
document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  e.preventDefault();
  drag.y = e.clientY;
  // Ekran kenarına yaklaşınca otomatik kaydır (uzun listelerde telefonda gerekli)
  const edge = 70;
  drag.scroll = e.clientY < edge ? -10 : e.clientY > window.innerHeight - edge ? 10 : 0;
  moveTo(e.clientY);
}, { passive: false });

async function endDrag() {
  if (!drag) return;
  const { el, isRow, box, before, timer } = drag;
  clearInterval(timer);
  drag = null;
  el.classList.remove("dragging");
  document.body.classList.remove("sorting");
  if (orderKey(box, isRow ? ".row" : ".group") === before) return; // yer değişmedi
  try {
    if (el.classList.contains("row")) {
      const box = el.parentElement;
      const cid = Number(box.dataset.cat);
      const ids = [...box.querySelectorAll(".row")].map((r) => Number(r.dataset.id));
      await api("/api/admin/order", { method: "PUT", body: { categoryId: cid, productIds: ids } });
      const mine = ids.map((id) => state.products.find((p) => p.id === id));
      state.products = [...state.products.filter((p) => p.categoryId !== cid), ...mine];
    } else {
      const ids = [...groupsEl.querySelectorAll(".group")].map((g) => Number(g.dataset.cat));
      await api("/api/admin/order", { method: "PUT", body: { categoryIds: ids } });
      state.categories = ids.map((id) => state.categories.find((c) => c.id === id));
    }
    toast("Sıralama kaydedildi");
  } catch (err) {
    toast(err.message);
  }
  renderProducts();
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

// ---------- Diyaloglar ----------
$$("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

function fillCatSelect(selected) {
  $("#fCat").innerHTML = state.categories.map((c) => `<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join("");
  if (selected) $("#fCat").value = selected;
}
function setPreview(html, hasImage) {
  $("#fPreview").innerHTML = html;
  $("#fRemoveImg").hidden = !hasImage;
}

function openProdDlg(p) {
  if (!state.categories.length) return toast("Önce bir kategori ekleyin.");
  state.editingId = p ? p.id : null;
  state.imgChange = undefined;
  $("#prodDlgTitle").textContent = p ? "Ürünü düzenle" : "Yeni ürün";
  $("#fName").value = p?.name ?? "";
  $("#fPrice").value = p?.price ?? "";
  $("#fUnit").value = p?.unit ?? "adet";
  fillCatSelect(p?.categoryId ?? state.lastCat ?? state.categories[0].id);
  $("#fImage").value = "";
  setPreview(p ? thumb(p) : "📷", !!p?.image);
  $("#prodError").textContent = "";
  $("#prodDlg").showModal();
  $("#fName").focus();
}
$("#newProdBtn").addEventListener("click", () => openProdDlg(null));

$("#fImage").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    state.imgChange = await resizeImage(file);
    setPreview(`<img src="${state.imgChange}" alt="" />`, true);
    $("#prodError").textContent = "";
  } catch (err) {
    $("#prodError").textContent = err.message;
  }
});
$("#fRemoveImg").addEventListener("click", () => {
  state.imgChange = null;
  $("#fImage").value = "";
  setPreview("📷", false);
});

$("#prodForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    name: $("#fName").value.trim(),
    price: Number($("#fPrice").value),
    unit: $("#fUnit").value,
    categoryId: Number($("#fCat").value),
  };
  if (state.imgChange !== undefined) body.image = state.imgChange;
  $("#prodSave").disabled = true;
  try {
    if (state.editingId) {
      await patchProduct(state.editingId, body);
      toast("Ürün güncellendi");
    } else {
      const p = await api("/api/admin/products", { method: "POST", body });
      state.products.push(p);
      toast(`"${p.name}" eklendi`);
    }
    state.lastCat = body.categoryId;
    $("#prodDlg").close();
    renderProducts();
  } catch (err) {
    $("#prodError").textContent = err.message;
  } finally {
    $("#prodSave").disabled = false;
  }
});

function openCatDlg(c) {
  state.editingCatId = c ? c.id : null;
  $("#catDlgTitle").textContent = c ? "Kategoriyi düzenle" : "Yeni kategori";
  $("#cName").value = c?.name ?? "";
  $("#cEmoji").value = c?.emoji ?? "📦";
  $("#catError").textContent = "";
  $("#catDlg").showModal();
  $("#cName").focus();
}
$("#newCatBtn").addEventListener("click", () => openCatDlg(null));
$("#catForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { name: $("#cName").value, emoji: $("#cEmoji").value };
  try {
    if (state.editingCatId) {
      const c = await api(`/api/admin/categories/${state.editingCatId}`, { method: "PATCH", body });
      Object.assign(state.categories.find((x) => x.id === c.id), c);
      toast("Kategori güncellendi");
    } else {
      const c = await api("/api/admin/categories", { method: "POST", body });
      state.categories.push(c);
      toast(`"${c.name}" kategorisi eklendi`);
    }
    $("#catDlg").close();
    renderProducts();
  } catch (err) {
    $("#catError").textContent = err.message;
  }
});

// ================= SİPARİŞLER =================
function renderOrders() {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, state.orders.filter((o) => o.status === s).length]));
  $("#oFilter").innerHTML =
    `<button data-o="all" class="${state.oFilter === "all" ? "active" : ""}">Tümü (${state.orders.length})</button>` +
    STATUSES.map((s) => `<button data-o="${s}" class="${state.oFilter === s ? "active" : ""}">${s} (${counts[s]})</button>`).join("");

  const q = $("#oSearch").value.trim().toLocaleLowerCase("tr");
  const list = state.orders.filter(
    (o) =>
      (state.oFilter === "all" || o.status === state.oFilter) &&
      (!q || String(o.id) === q.replace("#", "") || o.customer.name.toLocaleLowerCase("tr").includes(q) || o.customer.phone.includes(q))
  );
  $("#orderList").innerHTML = list.length
    ? list
        .map(
          (o) => `
      <div class="order ${o.status === "Yeni" ? "st-Yeni" : o.status === "İptal" ? "st-cancel" : ""}">
        <div class="order-head">
          <div><b>#${o.id}</b> · ${esc(o.customer.name)} · <b>${tl(o.total)}</b></div>
          <select data-status="${o.id}" aria-label="Sipariş durumu">${STATUSES.map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select>
        </div>
        <div class="meta">${new Date(o.createdAt).toLocaleString("tr-TR")} · 📞 ${esc(o.customer.phone)}</div>
        <div class="meta">📍 ${esc(o.customer.address)}</div>
        <ul>${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)} — ${tl(i.price * i.qty)}</li>`).join("")}</ul>
        ${
          o.status === "İptal"
            ? `<div class="cancel-note ${o.cancelNote ? "" : "empty-note"}">
                <span>${o.cancelNote ? `📝 <b>Müşteriye not:</b> ${esc(o.cancelNote)}` : "Müşteriye not yazılmamış."}</span>
                <button class="b xs" data-note="${o.id}">${o.cancelNote ? "✎ Notu düzenle" : "＋ Not ekle"}</button>
              </div>`
            : ""
        }
      </div>`
        )
        .join("")
    : `<p class="empty">Gösterilecek sipariş yok.</p>`;
}
$("#oSearch").addEventListener("input", renderOrders);
$("#oFilter").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.oFilter = b.dataset.o;
  renderOrders();
});
$("#reloadOrders").addEventListener("click", async () => { await loadAll(); renderOrders(); toast("Siparişler yenilendi"); });
async function updateOrder(id, body) {
  const o = await api(`/api/admin/orders/${id}`, { method: "PATCH", body });
  Object.assign(state.orders.find((x) => x.id === o.id), o);
  updateNavBadge();
  renderOrders();
  return o;
}

$("#orderList").addEventListener("change", async (e) => {
  const id = Number(e.target.dataset.status);
  if (!id) return;
  const o = state.orders.find((x) => x.id === id);
  if (e.target.value === "İptal") {
    e.target.value = o.status; // pencere onaylanana kadar eski durumda kalsın
    return openCancelDlg(o, true);
  }
  try {
    await updateOrder(id, { status: e.target.value });
    toast(`#${id} → ${e.target.value}`);
  } catch (err) {
    toast(err.message);
  }
});
$("#orderList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-note]");
  if (b) openCancelDlg(state.orders.find((x) => x.id === Number(b.dataset.note)), false);
});

// ---------- İptal penceresi ----------
let cancelTarget = null; // { id, isNew }
function updateCancelCount() {
  $("#cancelCount").textContent = `${$("#cancelNote").value.length} / 300`;
}
function openCancelDlg(o, isNew) {
  cancelTarget = { id: o.id, isNew };
  $("#cancelTitle").textContent = isNew ? `Sipariş #${o.id} iptal edilsin mi?` : `Sipariş #${o.id} · müşteriye not`;
  $("#cancelSave").textContent = isNew ? "Siparişi iptal et" : "Notu kaydet";
  $("#cancelSave").classList.toggle("danger-fill", isNew);
  $("#cancelNote").value = o.cancelNote || "";
  $("#cancelError").textContent = "";
  updateCancelCount();
  $("#cancelDlg").showModal();
  $("#cancelNote").focus();
}
$("#cancelNote").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\n{2,}/g, "\n").slice(0, 300);
  updateCancelCount();
});
$("#notePresets").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const ta = $("#cancelNote");
  ta.value = (ta.value.trim() ? ta.value.trim() + " " : "") + b.textContent + ".";
  ta.value = ta.value.slice(0, 300);
  updateCancelCount();
  ta.focus();
});
$("#cancelForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!cancelTarget) return;
  const body = { cancelNote: $("#cancelNote").value };
  if (cancelTarget.isNew) body.status = "İptal";
  $("#cancelSave").disabled = true;
  try {
    await updateOrder(cancelTarget.id, body);
    $("#cancelDlg").close();
    toast(cancelTarget.isNew ? `#${cancelTarget.id} iptal edildi` : "Not kaydedildi");
  } catch (err) {
    $("#cancelError").textContent = err.message;
  } finally {
    $("#cancelSave").disabled = false;
  }
});

// ================= CİRO =================
function startOf(unit, d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  if (unit === "week") x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // pazartesi
  if (unit === "month") x.setDate(1);
  if (unit === "year") x.setMonth(0, 1);
  return x;
}
function addUnit(unit, d, n) {
  const x = new Date(d);
  if (unit === "day") x.setDate(x.getDate() + n);
  if (unit === "week") x.setDate(x.getDate() + 7 * n);
  if (unit === "month") x.setMonth(x.getMonth() + n);
  if (unit === "year") x.setFullYear(x.getFullYear() + n);
  return x;
}
// Bir zaman aralığındaki (iptal hariç) siparişler
function ordersIn(from, to) {
  return state.orders.filter((o) => {
    if (o.status === "İptal") return false;
    const t = new Date(o.createdAt);
    return t >= from && t < to;
  });
}
const sumTotal = (orders) => Math.round(orders.reduce((s, o) => s + o.total, 0) * 100) / 100;

function periodTitle(unit, from, offset) {
  const rel = {
    day: ["Bugün", "Dün"],
    week: ["Bu hafta", "Geçen hafta"],
    month: ["Bu ay", "Geçen ay"],
    year: ["Bu yıl", "Geçen yıl"],
  }[unit][-offset];
  let label;
  if (unit === "day") label = from.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
  else if (unit === "week") {
    const end = addUnit("day", from, 6);
    label = `${from.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}`;
  } else if (unit === "month") label = from.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  else label = String(from.getFullYear());
  return rel ? `${rel} · ${label}` : label;
}

// O gün hangi üründen ne kadar satıldı
function productBreakdown(orders) {
  const map = new Map();
  for (const o of orders) {
    for (const i of o.items) {
      const row = map.get(i.productId) || { name: i.name, qty: 0, total: 0 };
      row.qty += i.qty;
      row.total += i.price * i.qty;
      map.set(i.productId, row);
    }
  }
  return [...map.entries()]
    .map(([id, r]) => ({ ...r, unit: state.products.find((p) => p.id === id)?.unit || "adet" }))
    .sort((a, b) => b.total - a.total);
}

state.revOffset = 0; // 0 = içinde bulunulan dönem, -1 = bir önceki...
function renderRevenue() {
  const unit = state.revMode;
  const from = addUnit(unit, startOf(unit, new Date()), state.revOffset);
  const to = addUnit(unit, from, 1);
  const orders = ordersIn(from, to);
  const total = sumTotal(orders);

  $("#revTitle").textContent = periodTitle(unit, from, state.revOffset);
  $("#revNext").disabled = state.revOffset >= 0;

  if (unit !== "day") {
    $("#revBody").innerHTML = `
      <div class="total-box">
        <div class="lbl">Toplam ciro</div>
        <div class="val">${tl(total)}</div>
        <div class="sub">${orders.length} sipariş</div>
      </div>`;
    return;
  }

  const rows = productBreakdown(orders);
  $("#revBody").innerHTML = `
    <div class="day-sum total-box">
      <div><div class="lbl">Günlük ciro</div><div class="val">${tl(total)}</div></div>
      <div><div class="lbl">Sipariş</div><div class="val">${orders.length}</div></div>
    </div>
    ${
      rows.length
        ? `<table class="rev">
            <thead><tr><th>Ürün</th><th>Satılan miktar</th><th>Tutar</th></tr></thead>
            <tbody>${rows
              .map((r) => `<tr><td>${esc(r.name)}</td><td>${r.qty} ${esc(r.unit)}</td><td>${tl(r.total)}</td></tr>`)
              .join("")}</tbody>
          </table>`
        : `<p class="empty">Bu gün satış yok.</p>`
    }`;
}
$("#revTabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.revMode = b.dataset.r;
  state.revOffset = 0;
  $$("#revTabs button").forEach((x) => x.classList.toggle("active", x === b));
  renderRevenue();
});
$("#revPrev").addEventListener("click", () => { state.revOffset--; renderRevenue(); });
$("#revNext").addEventListener("click", () => { if (state.revOffset < 0) { state.revOffset++; renderRevenue(); } });

// ================= Genel =================
// Menü bağlantıları sayfayı yenilemeden geçiş yapar
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-nav]");
  if (!a || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  go(a.dataset.nav);
});

// Yeni siparişleri 20 sn'de bir kontrol et (ürün sayfasını bozmadan)
let orderSig = "";
setInterval(async () => {
  if (!state.token || $("#appView").hidden) return;
  try {
    state.orders = await api("/api/admin/orders");
    const sig = state.orders.map((o) => `${o.id}:${o.status}`).join(",");
    if (sig !== orderSig) {
      orderSig = sig;
      updateNavBadge();
      if (state.page === "siparisler" && !document.activeElement?.matches("select, input")) renderOrders();
      if (state.page === "ciro") renderRevenue();
    }
  } catch {}
}, 20000);

if (state.token) start().catch(logout);
