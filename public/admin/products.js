// Ürünler ve kategoriler: satır içi fiyat, satışta/tükendi, gizle/göster, sürükle-bırak sıralama (fare + dokunmatik),
// fotoğraflı ekleme/düzenleme (istemcide küçültme), çoğaltma, toplu işlemler, CSV içe/dışa aktarma.
import {
  state, $, $$, esc, icon, api, tl, toast, toastErr, isAdmin, bulkResult, openModal, confirmDialog, openMenu,
  showBulk, hideBulk, fold, debounce, parseNum, numTr, loadCatalog, resizeImage, readTextFile, download, isSoldOut, nav,
} from "./core.js";

const ps = { view: "urunler", q: "", cat: "", filter: "all", sel: new Set(), catSel: new Set() };
const FILTERS = [["all", "Tümü"], ["sale", "Satışta"], ["soldout", "Tükendi"], ["hidden", "Gizli"], ["featured", "Öne çıkan"], ["discount", "İndirimli"], ["lowstock", "Az stok"]];
const UNITS = ["adet", "kg", "g", "paket", "litre", "kutu", "şişe", "demet", "bağ"];

const thumb = (x, fallback = "🛒") => (x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy">` : esc(x.emoji || fallback));
const filtering = () => !!(ps.q.trim() || ps.filter !== "all" || ps.cat);
function matches(p) {
  const f = ps.filter;
  const ok = f === "all" || (f === "sale" && !isSoldOut(p) && !p.hidden) || (f === "soldout" && isSoldOut(p)) || (f === "hidden" && p.hidden)
    || (f === "featured" && p.featured) || (f === "discount" && p.oldPrice) || (f === "lowstock" && p.stock !== null && p.stock !== undefined && p.stock <= 5);
  if (!ok) return false;
  if (ps.cat && p.categoryId !== Number(ps.cat)) return false;
  const q = ps.q.trim();
  if (!q) return true;
  const fq = fold(q);
  return fold(p.name).includes(fq) || fold(p.brand).includes(fq) || (p.barcode && p.barcode.includes(q));
}
const visibleProducts = () => state.categories.flatMap((c) => state.products.filter((p) => p.categoryId === c.id && matches(p)));

export const productsPage = {
  id: "urunler", title: "Ürünler", icon: "box",
  async render(el, sub) {
    ps.view = sub[0] === "kategoriler" && isAdmin() ? "kategoriler" : "urunler";
    el.innerHTML = `<div class="page">
      <nav class="tabs" aria-label="Ürün ekranları">
        <a href="/panel/urunler" data-link ${ps.view === "urunler" ? 'aria-current="page"' : ""}>${icon("box", "i-sm")} Ürünler</a>
        ${isAdmin() ? `<a href="/panel/urunler/kategoriler" data-link ${ps.view === "kategoriler" ? 'aria-current="page"' : ""}>${icon("tag", "i-sm")} Kategoriler</a>` : ""}
      </nav>
      <div id="pView"><div class="skeleton">${"<div></div>".repeat(6)}</div></div>
    </div>`;
    await loadCatalog(true);
    if (ps.view === "kategoriler") renderCategoriesView(); else renderProductsView();
  },
  leave() { ps.sel.clear(); ps.catSel.clear(); hideBulk(); },
};

// ======================= ÜRÜNLER =======================
function renderProductsView() {
  const v = $("#pView");
  v.innerHTML = `
    <div class="toolbar">
      <label class="search"><span class="sr-only">Ürün ara</span>${icon("search")}<input class="input" type="search" id="pSearch" placeholder="Ad, marka veya barkod…" value="${esc(ps.q)}" autocomplete="off"></label>
      <select class="input" id="pCat" aria-label="Kategori"><option value="">Tüm kategoriler</option>${state.categories.map((c) => `<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join("")}</select>
      <select class="input" id="pFilter" aria-label="Durum">${FILTERS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>
      <span class="grow hide-phone"></span>
      <button type="button" class="icon-btn" id="pReload" aria-label="Yenile" title="Yenile">${icon("refresh")}</button>
      ${isAdmin() ? `<button type="button" class="btn" id="pCsv" aria-haspopup="menu">${icon("file")} CSV ${icon("down", "i-sm")}</button>
      <button type="button" class="btn btn-primary" id="pNew">${icon("plus")} Yeni ürün</button>` : ""}
    </div>
    ${!isAdmin() ? `<div class="callout mt" style="margin:0 0 12px">${icon("info")}<div>Personel olarak ürünleri <b>tükendi / satışta</b> işaretleyebilir ve stok güncelleyebilirsiniz. Diğer değişiklikler yönetici yetkisi ister.</div></div>` : ""}
    <div id="groups"></div>`;
  $("#pCat").value = ps.cat;
  $("#pFilter").value = ps.filter;
  const rerender = debounce(renderGroups, 120);
  $("#pSearch").addEventListener("input", (e) => { ps.q = e.target.value; rerender(); });
  $("#pCat").addEventListener("change", (e) => { ps.cat = e.target.value; renderGroups(); });
  $("#pFilter").addEventListener("change", (e) => { ps.filter = e.target.value; renderGroups(); });
  $("#pReload").addEventListener("click", async () => { try { await loadCatalog(true); renderGroups(); toast("Ürünler yenilendi."); } catch (e) { toastErr(e); } });
  if (isAdmin()) {
    $("#pNew").addEventListener("click", () => productDialog(null));
    $("#pCsv").addEventListener("click", (e) => openMenu(e.currentTarget, [
      { label: "Dışa aktar (Excel uyumlu CSV)", icon: "download", onClick: exportCsv },
      { label: "İçe aktar…", icon: "upload", onClick: importCsv },
    ]));
  }
  const g = $("#groups");
  g.addEventListener("click", onGroupsClick);
  g.addEventListener("change", onGroupsChange);
  g.addEventListener("keydown", onGroupsKey);
  g.addEventListener("focusout", onPriceBlur);
  bindDrag(g);
  renderGroups();
}

function productRow(p) {
  const out = isSoldOut(p);
  const sel = ps.sel.has(p.id);
  const disc = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  return `<div class="lrow prow ${sel ? "is-selected" : ""} ${p.hidden ? "is-muted" : ""}" data-id="${p.id}">
    <label class="cb-cell"><input type="checkbox" class="cb" data-psel="${p.id}" ${sel ? "checked" : ""} aria-label="${esc(p.name)} seç"></label>
    ${isAdmin() ? `<button type="button" class="handle" data-handle="prod" aria-label="Sürükleyerek sırala" title="Sürükleyerek sırala">${icon("grip")}</button>` : ""}
    <button type="button" class="thumb" ${isAdmin() ? `data-edit="${p.id}" aria-label="${esc(p.name)} düzenle"` : 'tabindex="-1" aria-hidden="true"'}>${thumb(p)}</button>
    <div class="lrow-main">
      <div class="lrow-title"><span class="nm">${esc(p.name)}</span>
        ${p.hidden ? `<span class="badge b-warn">${icon("eye-off")} Gizli</span>` : ""}
        ${out ? `<span class="badge b-danger">Tükendi${!p.soldOut && p.stock === 0 ? " (stok 0)" : ""}</span>` : ""}
        ${p.featured ? `<span class="badge b-navy">${icon("star")} Öne çıkan</span>` : ""}
        ${disc ? `<span class="badge b-ok">%${disc} indirim</span>` : ""}
      </div>
      <div class="lrow-sub">${p.brand ? `<span>${esc(p.brand)}</span>` : ""}<span>${esc(p.unit)}</span>${p.stock !== null && p.stock !== undefined ? `<span class="${p.stock <= 5 ? "age-hot" : ""}">Stok: ${p.stock}</span>` : ""}${p.maxPerOrder ? `<span>En fazla ${p.maxPerOrder}/sipariş</span>` : ""}${p.barcode ? `<span class="hide-phone">${esc(p.barcode)}</span>` : ""}</div>
    </div>
    <div class="price-cell">
      ${isAdmin() ? `<input class="input input-sm price-in" data-price="${p.id}" value="${esc(numTr(p.price))}" inputmode="decimal" aria-label="${esc(p.name)} fiyatı" title="Fiyatı değiştirip Enter'a basın">` : `<b>${tl(p.price)}</b>`}
      ${p.oldPrice ? `<span class="old">${tl(p.oldPrice)}</span>` : ""}
    </div>
    <div class="lrow-acts">
      <button type="button" class="btn btn-sm toggle-sale ${out ? "off" : "on"}" data-sale="${p.id}" aria-pressed="${!out}" title="${out ? "Satışa açmak için dokunun" : "Tükendi işaretlemek için dokunun"}"><span class="dot"></span>${out ? "Tükendi" : "Satışta"}</button>
      ${isAdmin() ? `<button type="button" class="icon-btn sm" data-vis="${p.id}" aria-label="${p.hidden ? "Mağazada göster" : "Mağazadan gizle"}" title="${p.hidden ? "Mağazada göster" : "Mağazadan gizle"}">${icon(p.hidden ? "eye-off" : "eye")}</button>` : ""}
      <button type="button" class="icon-btn sm" data-pmore="${p.id}" aria-label="${esc(p.name)} için diğer işlemler">${icon("more")}</button>
    </div>
  </div>`;
}

function renderGroups() {
  const g = $("#groups");
  if (!g) return;
  const f = filtering();
  const html = state.categories.map((c) => {
    const all = state.products.filter((p) => p.categoryId === c.id);
    const items = all.filter(matches);
    if (f && !items.length) return "";
    const allSel = items.length && items.every((p) => ps.sel.has(p.id));
    return `<section class="cat-group list" data-cat="${c.id}">
      <div class="cat-head">
        <label class="cb-cell"><input type="checkbox" class="cb" data-gsel="${c.id}" ${allSel ? "checked" : ""} ${items.length ? "" : "disabled"} aria-label="${esc(c.name)} kategorisindeki ürünleri seç"></label>
        ${isAdmin() ? `<button type="button" class="handle" data-handle="cat" aria-label="Kategoriyi sürükleyerek sırala" title="Kategoriyi sürükleyerek sırala">${icon("grip")}</button>` : ""}
        <h3><span class="emo" aria-hidden="true">${esc(c.emoji)}</span>${esc(c.name)}</h3>
        ${c.hidden ? `<span class="badge b-warn">${icon("eye-off")} Gizli kategori</span>` : ""}
        <span class="muted small">${f ? `${items.length} / ` : ""}${all.length} ürün</span>
        <span class="grow"></span>
        ${isAdmin() ? `<button type="button" class="icon-btn sm" data-addin="${c.id}" aria-label="${esc(c.name)} kategorisine ürün ekle" title="Bu kategoriye ürün ekle">${icon("plus")}</button>
        <button type="button" class="icon-btn sm" data-editcat="${c.id}" aria-label="${esc(c.name)} kategorisini düzenle" title="Kategoriyi düzenle">${icon("edit")}</button>` : ""}
      </div>
      <div class="cat-body" data-cat="${c.id}">${items.length ? items.map(productRow).join("") : `<div class="empty small" style="padding:14px">Bu kategoride ürün yok.</div>`}</div>
    </section>`;
  }).join("");
  g.innerHTML = html || `<div class="list"><div class="empty">${icon("search")}<b>Ürün bulunamadı</b>Aramayı veya süzgeci değiştirin.</div></div>`;
  g.classList.toggle("no-drag", f || !isAdmin());
  renderBulk();
}
function refreshRow(id) {
  const p = state.products.find((x) => x.id === id);
  const row = $(`.prow[data-id="${id}"]`);
  if (!row) return;
  if (!p || !matches(p)) { renderGroups(); return; }
  row.replaceWith(document.createRange().createContextualFragment(productRow(p)));
}

async function patchProduct(id, body) {
  const updated = await api(`/api/admin/products/${id}`, { method: "PATCH", body });
  const i = state.products.findIndex((x) => x.id === id);
  if (i >= 0) state.products[i] = updated;
  return updated;
}

async function onGroupsClick(e) {
  const t = e.target.closest("button");
  if (!t) return;
  const d = t.dataset;
  try {
    if (d.sale) {
      const p = state.products.find((x) => x.id === Number(d.sale));
      const out = isSoldOut(p);
      t.disabled = true;
      const body = out ? (p.stock === 0 ? { soldOut: false, stock: null } : { soldOut: false }) : { soldOut: true };
      const u = await patchProduct(p.id, body);
      refreshRow(p.id);
      toast(out ? `"${u.name}" tekrar satışta${p.stock === 0 ? " (stok takibi kapatıldı)" : ""}.` : `"${u.name}" tükendi olarak işaretlendi.`, out ? "ok" : "warn", { action: { label: "Geri al", onClick: async () => { try { await patchProduct(p.id, out ? { soldOut: p.soldOut, stock: p.stock } : { soldOut: false }); refreshRow(p.id); } catch (er) { toastErr(er); } } } });
    } else if (d.vis) {
      const p = state.products.find((x) => x.id === Number(d.vis));
      const u = await patchProduct(p.id, { hidden: !p.hidden });
      refreshRow(p.id);
      toast(u.hidden ? `"${u.name}" mağazadan gizlendi.` : `"${u.name}" mağazada görünüyor.`);
    } else if (d.edit) {
      productDialog(state.products.find((x) => x.id === Number(d.edit)));
    } else if (d.pmore) {
      const p = state.products.find((x) => x.id === Number(d.pmore));
      const items = [{ label: "Stok güncelle", icon: "box", onClick: () => stockDialog(p) }];
      if (isAdmin()) items.unshift({ label: "Düzenle", icon: "edit", onClick: () => productDialog(p) });
      if (isAdmin()) items.push({ label: "Çoğalt", icon: "copy", onClick: () => duplicate(p) }, { label: p.featured ? "Öne çıkarmayı kaldır" : "Öne çıkar", icon: "star", onClick: () => patchProduct(p.id, { featured: !p.featured }).then(() => { refreshRow(p.id); toast(p.featured ? "Öne çıkarılanlardan kaldırıldı." : "Öne çıkarıldı."); }).catch(toastErr) }, "-", { label: "Sil", icon: "trash", danger: true, onClick: () => deleteProducts([p.id]) });
      openMenu(t, items);
    } else if (d.editcat) {
      categoryDialog(state.categories.find((c) => c.id === Number(d.editcat)));
    } else if (d.addin) {
      productDialog(null, Number(d.addin));
    }
  } catch (err) { toastErr(err); renderGroups(); }
}
function onGroupsChange(e) {
  const cb = e.target;
  if (cb.dataset.psel) {
    const id = Number(cb.dataset.psel);
    if (cb.checked) ps.sel.add(id); else ps.sel.delete(id);
    cb.closest(".prow").classList.toggle("is-selected", cb.checked);
    syncGroupBoxes();
    renderBulk();
  } else if (cb.dataset.gsel) {
    const cid = Number(cb.dataset.gsel);
    state.products.filter((p) => p.categoryId === cid && matches(p)).forEach((p) => (cb.checked ? ps.sel.add(p.id) : ps.sel.delete(p.id)));
    renderGroups();
  }
}
function syncGroupBoxes() {
  $$("[data-gsel]").forEach((cb) => {
    const ids = state.products.filter((p) => p.categoryId === Number(cb.dataset.gsel) && matches(p)).map((p) => p.id);
    const n = ids.filter((id) => ps.sel.has(id)).length;
    cb.checked = n > 0 && n === ids.length;
    cb.indeterminate = n > 0 && n < ids.length;
  });
}

// Satır içi fiyat: Enter / alandan çıkınca kaydeder, Esc geri alır
function onGroupsKey(e) {
  const inp = e.target.closest("[data-price]");
  if (!inp) return;
  if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
  if (e.key === "Escape") { const p = state.products.find((x) => x.id === Number(inp.dataset.price)); inp.value = numTr(p.price); inp.blur(); }
}
async function onPriceBlur(e) {
  const inp = e.target.closest && e.target.closest("[data-price]");
  if (!inp) return;
  const p = state.products.find((x) => x.id === Number(inp.dataset.price));
  if (!p) return;
  const n = parseNum(inp.value);
  if (n === null || Number.isNaN(n) || n <= 0) { if (inp.value.trim() !== numTr(p.price)) toast("Geçerli bir fiyat girin (örn. 59,90).", "err"); inp.value = numTr(p.price); return; }
  if (Math.round(n * 100) === Math.round(p.price * 100)) { inp.value = numTr(p.price); return; }
  const old = p.price;
  inp.disabled = true;
  try {
    const u = await patchProduct(p.id, { price: n });
    refreshRow(p.id);
    toast(`"${u.name}" fiyatı ${tl(old)} → ${tl(u.price)}${old < u.price && p.oldPrice && !u.oldPrice ? " (indirim kaldırıldı)" : ""}.`, "ok", { action: { label: "Geri al", onClick: () => patchProduct(p.id, { price: old, ...(p.oldPrice ? { oldPrice: p.oldPrice } : {}) }).then(() => refreshRow(p.id)).catch(toastErr) } });
  } catch (err) { toastErr(err); inp.value = numTr(p.price); inp.disabled = false; }
}

// ---------- Toplu işlem ----------
function renderBulk() {
  if (ps.view !== "urunler") return;
  const vis = visibleProducts();
  const n = ps.sel.size;
  const actions = [
    { id: "soldOut", label: "Tükendi" },
    { id: "available", label: "Satışta" },
  ];
  if (isAdmin()) actions.push(
    { id: "hide", label: "Gizle", icon: "eye-off" },
    { id: "show", label: "Göster", icon: "eye" },
    { id: "move", label: "Kategoriye taşı" },
    { id: "price", label: "Fiyat %" },
    { id: "more", label: "Diğer", icon: "more" },
    { id: "delete", label: "Sil", icon: "trash", cls: "btn-danger" },
  );
  showBulk({
    count: n, canSelectAll: vis.some((p) => !ps.sel.has(p.id)), allCount: vis.length,
    onClear: () => { ps.sel.clear(); renderGroups(); },
    onSelectAll: () => { vis.forEach((p) => ps.sel.add(p.id)); renderGroups(); },
    actions, onAction: bulkAction,
  });
}
const BULK_VERB = { soldOut: "ürün tükendi yapıldı", available: "ürün satışa açıldı", hide: "ürün gizlendi", show: "ürün gösteriliyor", feature: "ürün öne çıkarıldı", unfeature: "ürün öne çıkanlardan kaldırıldı", move: "ürün taşındı", price: "ürünün fiyatı güncellendi", delete: "ürün silindi" };
async function runBulk(action, extra = {}) {
  const ids = [...ps.sel];
  const r = await api("/api/admin/products/bulk", { method: "POST", body: { ids, action, ...extra } });
  bulkResult(r, BULK_VERB[action]);
  if (action === "delete") ps.sel.clear();
  await loadCatalog(true);
  renderGroups();
  return r;
}
async function bulkAction(id, btn) {
  const ids = [...ps.sel];
  try {
    if (["soldOut", "available", "hide", "show"].includes(id)) return await runBulk(id);
    if (id === "more") {
      return openMenu(btn, [
        { label: "Öne çıkar", icon: "star", onClick: () => runBulk("feature").catch(toastErr) },
        { label: "Öne çıkarmayı kaldır", icon: "star", onClick: () => runBulk("unfeature").catch(toastErr) },
        "-",
        { label: "Seçimi kaldır", icon: "x", onClick: () => { ps.sel.clear(); renderGroups(); } },
      ]);
    }
    if (id === "delete") return deleteProducts(ids);
    if (id === "move") {
      return openModal({
        title: `${ids.length} ürünü kategoriye taşı`, size: "narrow", submitLabel: "Taşı",
        body: `<label class="field"><span>Hedef kategori</span><select name="cat">${state.categories.map((c) => `<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join("")}</select></label>`,
        onSubmit: (f) => runBulk("move", { categoryId: Number(f.cat.value) }),
      });
    }
    if (id === "price") {
      const sample = state.products.filter((p) => ps.sel.has(p.id)).slice(0, 4);
      return openModal({
        title: `${ids.length} ürünün fiyatını değiştir`, size: "narrow", submitLabel: "Fiyatları güncelle",
        body: `<label class="field"><span>Değişim yüzdesi</span><div class="affix"><input name="pct" inputmode="decimal" placeholder="Örn. 10 (zam) veya -15 (indirim)" required><span class="sfx">%</span></div>
          <span class="hint">−90 ile 500 arası. Fiyatlar iki ondalığa yuvarlanır. Eski fiyatı yeni fiyattan düşük kalan indirimler kaldırılır.</span></label>
          <div class="seg" role="group" aria-label="Hazır değerler">${[-20, -10, -5, 5, 10, 20].map((v) => `<button type="button" data-pct="${v}">${v > 0 ? "+" : ""}${v}%</button>`).join("")}</div>
          <div id="pctPrev" class="small"></div>`,
        onOpen: (f) => {
          const prev = () => {
            const v = parseNum(f.pct.value);
            $("#pctPrev").innerHTML = v && !Number.isNaN(v) ? `<b>Örnek:</b><br>${sample.map((p) => `${esc(p.name)}: ${tl(p.price)} → <b>${tl(Math.round(p.price * (1 + v / 100) * 100) / 100)}</b>`).join("<br>")}${ids.length > sample.length ? `<br>… ve ${ids.length - sample.length} ürün daha` : ""}` : "";
          };
          f.pct.addEventListener("input", prev);
          f.addEventListener("click", (e) => { const b = e.target.closest("[data-pct]"); if (b) { f.pct.value = b.dataset.pct; prev(); } });
        },
        onSubmit: async (f) => {
          const v = parseNum(f.pct.value);
          if (v === null || Number.isNaN(v) || v === 0 || v < -90 || v > 500) throw new Error("Yüzde −90 ile 500 arasında (0 hariç) olmalı.");
          if (!(await confirmDialog({ title: "Fiyatlar değişsin mi?", message: `${ids.length} ürünün fiyatı %${numTr(v)} ${v > 0 ? "artırılacak" : "düşürülecek"}.`, okLabel: "Uygula" }))) return false;
          await runBulk("price", { percent: v });
        },
      });
    }
  } catch (e) { toastErr(e); }
}
async function deleteProducts(ids) {
  const names = state.products.filter((p) => ids.includes(p.id)).map((p) => p.name);
  const ok = await confirmDialog({
    title: ids.length > 1 ? `${ids.length} ürün silinsin mi?` : `"${names[0]}" silinsin mi?`, danger: true, okLabel: ids.length > 1 ? `${ids.length} ürünü sil` : "Sil",
    message: `${ids.length > 1 ? `${ids.length} ürün` : "Ürün"} kalıcı olarak silinecek; görselleri de silinir. Geçmiş siparişler etkilenmez.`,
  });
  if (!ok) return;
  try {
    const r = await api("/api/admin/products/bulk", { method: "POST", body: { ids, action: "delete" } });
    bulkResult(r, "ürün silindi");
    ids.forEach((id) => ps.sel.delete(id));
    await loadCatalog(true);
    renderGroups();
  } catch (e) { toastErr(e); }
}
async function duplicate(p) {
  try {
    const c = await api(`/api/admin/products/${p.id}/duplicate`, { method: "POST" });
    await loadCatalog(true);
    renderGroups();
    toast(`"${c.name}" oluşturuldu (gizli). Düzenleyip yayına alın.`, "ok", { action: { label: "Düzenle", onClick: () => productDialog(state.products.find((x) => x.id === c.id)) } });
  } catch (e) { toastErr(e); }
}

function stockDialog(p) {
  openModal({
    title: `Stok · ${p.name}`, size: "narrow", submitLabel: "Kaydet",
    body: `<label class="field"><span>Stok adedi</span><input name="stock" inputmode="numeric" value="${p.stock ?? ""}" placeholder="Boş = stok takibi yok">
      <span class="hint">Boş bırakırsanız stok takibi kapanır. 0 olunca ürün mağazada "tükendi" görünür; siparişte düşer, iptalde geri eklenir.</span></label>`,
    onSubmit: async (f) => {
      const v = f.stock.value.trim();
      const n = v === "" ? null : Number(v);
      if (n !== null && (!Number.isInteger(n) || n < 0)) throw new Error("Stok 0 veya daha büyük bir tam sayı olmalı.");
      await patchProduct(p.id, { stock: n });
      refreshRow(p.id);
      toast(n === null ? "Stok takibi kapatıldı." : `Stok ${n} olarak güncellendi.`);
    },
  });
}

// ---------- Ürün formu ----------
function productDialog(p, presetCat) {
  if (!state.categories.length) { toast("Önce bir kategori ekleyin.", "warn"); return; }
  let img; // undefined: değişmedi, null: kaldırıldı, string: yeni data URL
  const v = (k, d = "") => (p && p[k] !== null && p[k] !== undefined ? p[k] : d);
  const cat = p ? p.categoryId : presetCat || Number(ps.cat) || ps.lastCat || state.categories[0].id;
  openModal({
    title: p ? "Ürünü düzenle" : "Yeni ürün", size: "wide", submitLabel: p ? "Kaydet" : "Ürünü ekle",
    body: `<div class="callout warn">${icon("alert")}<div><b>Alkol ve tütün ürünleri internetten satılamaz.</b> Bu ürünleri online kataloğa eklemeyin.</div></div>
      <div class="img-pick">
        <div class="pv" id="fPv">${p ? thumb(p) : icon("image")}</div>
        <div class="btns">
          <label class="btn btn-sm" for="fImg">${icon("upload", "i-sm")} Fotoğraf seç</label>
          <input id="fImg" type="file" accept="image/jpeg,image/png,image/webp" hidden>
          <button type="button" class="btn btn-sm btn-danger-ghost" id="fImgRm" ${p && p.image ? "" : "hidden"}>${icon("trash", "i-sm")} Fotoğrafı kaldır</button>
          <span class="hint">Telefonla çekilen fotoğraf otomatik küçültülür.</span>
        </div>
      </div>
      <div class="grid-2">
        <label class="field span-2"><span>Ürün adı</span><input name="name" maxlength="120" value="${esc(v("name"))}" required autofocus></label>
        <label class="field"><span>Marka</span><input name="brand" maxlength="60" value="${esc(v("brand"))}"></label>
        <label class="field"><span>Kategori</span><select name="categoryId">${state.categories.map((c) => `<option value="${c.id}" ${c.id === cat ? "selected" : ""}>${esc(c.emoji)} ${esc(c.name)}</option>`).join("")}</select></label>
      </div>
      <div class="grid-4 keep-2">
        <label class="field"><span>Satış fiyatı</span><div class="affix"><input name="price" inputmode="decimal" value="${esc(numTr(v("price", "")))}" required><span class="sfx">₺</span></div></label>
        <label class="field"><span>Eski fiyat <span class="hint">(indirim)</span></span><div class="affix"><input name="oldPrice" inputmode="decimal" value="${esc(numTr(v("oldPrice", "")))}"><span class="sfx">₺</span></div><span class="discount-hint" id="fDisc"></span></label>
        <label class="field"><span>Birim</span><input name="unit" list="unitList" maxlength="20" value="${esc(v("unit", "adet"))}"><datalist id="unitList">${UNITS.map((u) => `<option value="${u}">`).join("")}</datalist></label>
        <label class="field"><span>Simge (emoji)</span><input name="emoji" maxlength="8" value="${esc(v("emoji", "🛒"))}"></label>
      </div>
      <div class="grid-3">
        <label class="field"><span>Barkod</span><input name="barcode" maxlength="40" inputmode="numeric" value="${esc(v("barcode"))}"></label>
        <label class="field"><span>Stok <span class="hint">(boş = takip yok)</span></span><input name="stock" inputmode="numeric" value="${esc(v("stock", ""))}"></label>
        <label class="field"><span>Sipariş başına en fazla</span><input name="maxPerOrder" inputmode="numeric" value="${esc(v("maxPerOrder", ""))}" placeholder="Sınırsız"></label>
      </div>
      <label class="field"><span>Açıklama</span><textarea name="description" maxlength="1000" rows="3">${esc(v("description"))}</textarea></label>
      <div class="row-flex" style="gap:18px">
        <label class="switch"><input type="checkbox" name="featured" ${v("featured", false) ? "checked" : ""}> Öne çıkan</label>
        <label class="switch"><input type="checkbox" name="soldOut" ${v("soldOut", false) ? "checked" : ""}> Tükendi</label>
        <label class="switch"><input type="checkbox" name="hidden" ${v("hidden", false) ? "checked" : ""}> Mağazada gizli</label>
      </div>`,
    onOpen: (f) => {
      const disc = () => {
        const pr = parseNum(f.price.value), op = parseNum(f.oldPrice.value);
        $("#fDisc").textContent = pr > 0 && op > pr ? `%${Math.round((1 - pr / op) * 100)} indirim gösterilir` : op && pr && op <= pr ? "Eski fiyat satış fiyatından yüksek olmalı" : "";
      };
      f.price.addEventListener("input", disc); f.oldPrice.addEventListener("input", disc); disc();
      $("#fImg").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          img = await resizeImage(file, 1000);
          $("#fPv").innerHTML = `<img src="${img}" alt="">`;
          $("#fImgRm").hidden = false;
        } catch (er) { toast(er.message, "err"); }
      });
      $("#fImgRm").addEventListener("click", () => { img = null; $("#fImg").value = ""; $("#fPv").innerHTML = icon("image"); $("#fImgRm").hidden = true; });
    },
    onSubmit: async (f) => {
      const price = parseNum(f.price.value);
      if (!f.name.value.trim()) throw new Error("Ürün adı gerekli.");
      if (!(price > 0)) throw new Error("Geçerli bir satış fiyatı girin (örn. 59,90).");
      const oldPrice = parseNum(f.oldPrice.value);
      if (Number.isNaN(oldPrice)) throw new Error("Eski fiyat geçersiz.");
      const intOrNull = (s, label) => { const t = s.trim(); if (!t) return null; const n = Number(t); if (!Number.isInteger(n) || n < 0) throw new Error(`${label} tam sayı olmalı.`); return n; };
      const body = {
        name: f.name.value.trim(), brand: f.brand.value.trim(), categoryId: Number(f.categoryId.value), price, oldPrice: oldPrice || null,
        unit: f.unit.value.trim() || "adet", emoji: f.emoji.value.trim(), barcode: f.barcode.value.trim(),
        stock: intOrNull(f.stock.value, "Stok"), maxPerOrder: intOrNull(f.maxPerOrder.value, "Sipariş başına en fazla"),
        description: f.description.value.trim(), featured: f.featured.checked, soldOut: f.soldOut.checked, hidden: f.hidden.checked,
      };
      if (img !== undefined) body.image = img;
      if (p) {
        await patchProduct(p.id, body);
        toast("Ürün güncellendi.");
      } else {
        const c = await api("/api/admin/products", { method: "POST", body });
        state.products.push(c);
        toast(`"${c.name}" eklendi.`);
      }
      ps.lastCat = body.categoryId;
      await loadCatalog(true);
      renderGroups();
    },
  });
}

// ---------- CSV ----------
async function exportCsv() {
  try { const n = await download("/api/admin/products/export", "urunler.csv"); toast(`${n} indirildi. Excel ile açabilirsiniz.`); } catch (e) { toastErr(e); }
}
function importCsv() {
  let text = "";
  openModal({
    title: "CSV ile ürün içe aktar", size: "wide", submitLabel: "İçe aktar",
    body: `<div class="callout">${icon("info")}<div>Önce <b>dışa aktar</b> ile örnek dosyayı indirip Excel'de düzenleyebilirsiniz. Ürünler önce <b>barkoda</b>, yoksa <b>ada</b> göre eşleşir: eşleşen güncellenir, eşleşmeyen yeni eklenir. Boş hücreler değiştirilmez. Bilinmeyen kategori adı yeni kategori olarak açılır.</div></div>
      <label class="field"><span>CSV dosyası</span><input type="file" name="file" accept=".csv,text/csv,text/plain"></label>
      <div id="csvReport"></div>`,
    onOpen: (f, ctl) => {
      const okBtn = ctl.dlg.querySelector("[data-ok]");
      okBtn.disabled = true;
      f.file.addEventListener("change", async () => {
        const file = f.file.files[0];
        $("#csvReport").innerHTML = "";
        okBtn.disabled = true;
        if (!file) return;
        try {
          text = await readTextFile(file);
          const r = await api("/api/admin/products/import", { method: "POST", body: { csv: text, dryRun: true } });
          $("#csvReport").innerHTML = `<h4 style="margin-bottom:8px">Ön izleme (henüz kaydedilmedi)</h4>${reportHtml(r)}`;
          okBtn.disabled = !(r.added || r.updated);
          if (!(r.added || r.updated)) ctl.setError("Dosyada eklenecek ya da güncellenecek ürün yok.");
          else ctl.setError("");
        } catch (e) { ctl.setError(e.message); }
      });
    },
    onSubmit: async () => {
      if (!text) throw new Error("Önce bir CSV dosyası seçin.");
      const r = await api("/api/admin/products/import", { method: "POST", body: { csv: text, dryRun: false } });
      await loadCatalog(true);
      if (ps.view === "urunler") renderGroups();
      toast(`İçe aktarma tamam: ${r.added} eklendi, ${r.updated} güncellendi${r.errors.length ? `, ${r.errors.length} satır atlandı` : ""}.`, r.errors.length ? "warn" : "ok", { details: r.errors.slice(0, 6).map((e) => `Satır ${e.row}: ${e.message}`) });
    },
  });
}
function reportHtml(r) {
  return `<div class="kpis" style="margin-bottom:10px">
    <div class="kpi"><div class="k">Yeni eklenecek</div><div class="v">${r.added}</div></div>
    <div class="kpi"><div class="k">Güncellenecek</div><div class="v">${r.updated}</div></div>
    <div class="kpi"><div class="k">Değişmeyecek</div><div class="v">${r.unchanged}</div></div>
    <div class="kpi"><div class="k">Hatalı satır</div><div class="v" style="color:${r.errors.length ? "var(--danger)" : "inherit"}">${r.errors.length}</div></div>
  </div>
  ${r.createdCategories && r.createdCategories.length ? `<p class="small">Yeni kategori: <b>${r.createdCategories.map(esc).join(", ")}</b></p>` : ""}
  ${r.errors.length ? `<div class="callout danger">${icon("alert")}<div>${r.errors.slice(0, 20).map((e) => `Satır ${e.row}: ${esc(e.message)}`).join("<br>")}${r.errors.length > 20 ? `<br>… ${r.errors.length - 20} hata daha` : ""}</div></div>` : ""}`;
}

// ======================= KATEGORİLER =======================
function renderCategoriesView() {
  const v = $("#pView");
  v.innerHTML = `<div class="toolbar"><p class="muted small grow" style="margin:0">Kategorileri tutamaktan sürükleyerek sıralayın. Gizli kategori ve içindeki ürünler mağazada görünmez.</p>
    <button type="button" class="btn btn-primary" id="cNew">${icon("plus")} Yeni kategori</button></div>
    <div class="list" id="catList"></div>`;
  $("#cNew").addEventListener("click", () => categoryDialog(null));
  const list = $("#catList");
  list.addEventListener("click", onCatClick);
  list.addEventListener("change", (e) => {
    const cb = e.target;
    if (cb.dataset.csel) {
      const id = Number(cb.dataset.csel);
      if (cb.checked) ps.catSel.add(id); else ps.catSel.delete(id);
      cb.closest(".lrow").classList.toggle("is-selected", cb.checked);
      renderCatBulk();
    } else if (cb.id === "catAll") {
      state.categories.forEach((c) => (cb.checked ? ps.catSel.add(c.id) : ps.catSel.delete(c.id)));
      renderCatList();
    }
  });
  bindDrag(list);
  renderCatList();
}
function renderCatList() {
  const list = $("#catList");
  if (!list) return;
  const all = state.categories.length && state.categories.every((c) => ps.catSel.has(c.id));
  list.innerHTML = `<div class="list-head"><label class="cb-cell"><input type="checkbox" class="cb" id="catAll" ${all ? "checked" : ""} aria-label="Tüm kategorileri seç"></label><span>${state.categories.length} kategori</span></div>
    <div id="catRows">${state.categories.map((c) => `<div class="lrow crow ${ps.catSel.has(c.id) ? "is-selected" : ""} ${c.hidden ? "is-muted" : ""}" data-id="${c.id}">
      <label class="cb-cell"><input type="checkbox" class="cb" data-csel="${c.id}" ${ps.catSel.has(c.id) ? "checked" : ""} aria-label="${esc(c.name)} seç"></label>
      <button type="button" class="handle" data-handle="crow" aria-label="Sürükleyerek sırala">${icon("grip")}</button>
      <button type="button" class="thumb" data-cedit="${c.id}" aria-label="${esc(c.name)} düzenle">${thumb(c, "📦")}</button>
      <div class="lrow-main"><div class="lrow-title">${esc(c.name)}${c.hidden ? `<span class="badge b-warn">${icon("eye-off")} Gizli</span>` : ""}</div><div class="lrow-sub">${c.productCount} ürün</div></div>
      <div class="lrow-acts">
        <button type="button" class="icon-btn sm" data-chide="${c.id}" aria-label="${c.hidden ? "Mağazada göster" : "Mağazadan gizle"}" title="${c.hidden ? "Mağazada göster" : "Mağazadan gizle"}">${icon(c.hidden ? "eye-off" : "eye")}</button>
        <button type="button" class="icon-btn sm" data-cedit="${c.id}" aria-label="Düzenle">${icon("edit")}</button>
        <button type="button" class="icon-btn sm danger" data-cdel="${c.id}" aria-label="Sil">${icon("trash")}</button>
      </div></div>`).join("")}</div>`;
  renderCatBulk();
}
function renderCatBulk() {
  if (ps.view !== "kategoriler") return;
  showBulk({
    count: ps.catSel.size, canSelectAll: ps.catSel.size < state.categories.length, allCount: state.categories.length,
    onClear: () => { ps.catSel.clear(); renderCatList(); },
    onSelectAll: () => { state.categories.forEach((c) => ps.catSel.add(c.id)); renderCatList(); },
    actions: [{ id: "delete", label: "Sil", icon: "trash", cls: "btn-danger", title: "Yalnızca boş kategoriler silinir" }],
    onAction: () => deleteCategories([...ps.catSel]),
  });
}
async function onCatClick(e) {
  const t = e.target.closest("button");
  if (!t) return;
  const d = t.dataset;
  if (d.cedit) categoryDialog(state.categories.find((c) => c.id === Number(d.cedit)));
  else if (d.cdel) deleteCategories([Number(d.cdel)]);
  else if (d.chide) {
    const c = state.categories.find((x) => x.id === Number(d.chide));
    try {
      await api(`/api/admin/categories/${c.id}`, { method: "PATCH", body: { hidden: !c.hidden } });
      await loadCatalog(true);
      renderCatList();
      toast(c.hidden ? `"${c.name}" mağazada görünüyor.` : `"${c.name}" ve içindeki ürünler mağazadan gizlendi.`);
    } catch (er) { toastErr(er); }
  }
}
async function deleteCategories(ids) {
  const cats = state.categories.filter((c) => ids.includes(c.id));
  const full = cats.filter((c) => c.productCount > 0);
  const ok = await confirmDialog({
    title: ids.length > 1 ? `${ids.length} kategori silinsin mi?` : `"${cats[0].name}" silinsin mi?`, danger: true, okLabel: "Sil",
    message: `${ids.length - full.length} kategori silinecek.`,
    details: full.length ? `İçinde ürün olan ${full.length} kategori atlanacak (${full.map((c) => c.name).slice(0, 4).join(", ")}). Önce ürünleri taşıyın ya da silin.` : "",
  });
  if (!ok) return;
  try {
    const r = await api("/api/admin/categories/bulk-delete", { method: "POST", body: { ids } });
    bulkResult(r, "kategori silindi");
    ps.catSel.clear();
    await loadCatalog(true);
    if (ps.view === "kategoriler") renderCatList(); else renderGroups();
  } catch (e) { toastErr(e); }
}
function categoryDialog(c) {
  let img;
  openModal({
    title: c ? "Kategoriyi düzenle" : "Yeni kategori", size: "narrow", submitLabel: c ? "Kaydet" : "Ekle",
    body: `<div class="grid-2" style="grid-template-columns:90px 1fr">
        <label class="field"><span>Simge</span><input name="emoji" maxlength="8" value="${esc(c ? c.emoji : "📦")}"></label>
        <label class="field"><span>Kategori adı</span><input name="name" maxlength="60" value="${esc(c ? c.name : "")}" required autofocus></label>
      </div>
      <div class="img-pick"><div class="pv" id="cPv">${c && c.image ? `<img src="${esc(c.image)}" alt="">` : icon("image")}</div>
        <div class="btns"><label class="btn btn-sm" for="cImg">${icon("upload", "i-sm")} Görsel seç</label><input id="cImg" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <button type="button" class="btn btn-sm btn-danger-ghost" id="cImgRm" ${c && c.image ? "" : "hidden"}>Görseli kaldır</button><span class="hint">İsteğe bağlı; yoksa simge kullanılır.</span></div></div>
      <label class="switch"><input type="checkbox" name="hidden" ${c && c.hidden ? "checked" : ""}> Mağazada gizli</label>
      ${c && c.productCount ? `<p class="hint" style="margin:0">Bu kategoride ${c.productCount} ürün var.</p>` : ""}`,
    onOpen: () => {
      $("#cImg").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try { img = await resizeImage(file, 800); $("#cPv").innerHTML = `<img src="${img}" alt="">`; $("#cImgRm").hidden = false; } catch (er) { toast(er.message, "err"); }
      });
      $("#cImgRm").addEventListener("click", () => { img = null; $("#cPv").innerHTML = icon("image"); $("#cImgRm").hidden = true; });
    },
    onSubmit: async (f) => {
      if (!f.name.value.trim()) throw new Error("Kategori adı gerekli.");
      const body = { name: f.name.value.trim(), emoji: f.emoji.value.trim(), hidden: f.hidden.checked };
      if (img !== undefined) body.image = img;
      if (c) await api(`/api/admin/categories/${c.id}`, { method: "PATCH", body });
      else await api("/api/admin/categories", { method: "POST", body });
      await loadCatalog(true);
      toast(c ? "Kategori güncellendi." : `"${body.name}" kategorisi eklendi.`);
      if (ps.view === "kategoriler") renderCatList(); else renderProductsView();
    },
  });
}

// ======================= SÜRÜKLE-BIRAK =======================
// Fare, parmak ve kalemle aynı şekilde çalışır (pointer olayları). Ekran kenarında otomatik kaydırır.
let drag = null;
function bindDrag(root) {
  root.addEventListener("pointerdown", (e) => {
    const hnd = e.target.closest(".handle");
    if (!hnd || !isAdmin() || root.classList.contains("no-drag") || e.button > 0) return;
    e.preventDefault();
    const kind = hnd.dataset.handle; // prod | cat | crow
    const sel = kind === "prod" ? ".prow" : kind === "cat" ? ".cat-group" : ".crow";
    const el = hnd.closest(sel);
    const box = el.parentElement;
    drag = { el, sel, box, kind, before: order(box, sel), y: e.clientY, scroll: 0, pid: e.pointerId };
    try { hnd.setPointerCapture(e.pointerId); } catch { /* yok */ }
    el.classList.add("dragging");
    document.body.classList.add("sorting");
    drag.timer = setInterval(() => { if (drag && drag.scroll) { window.scrollBy(0, drag.scroll); moveTo(drag.y); } }, 16);
  });
}
const order = (box, sel) => [...box.children].filter((x) => x.matches(sel)).map((x) => x.dataset.id || x.dataset.cat).join(",");
function moveTo(y) {
  const { el, sel, box } = drag;
  const sibs = [...box.children].filter((x) => x.matches(sel) && x !== el);
  const next = sibs.find((s) => { const r = s.getBoundingClientRect(); return y < r.top + r.height / 2; });
  if (next ? el.nextElementSibling !== next : box.lastElementChild !== el) box.insertBefore(el, next || null);
}
document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  e.preventDefault();
  drag.y = e.clientY;
  const edge = 80;
  const top = (document.querySelector(".topbar") || { offsetHeight: 0 }).offsetHeight;
  drag.scroll = e.clientY < top + edge ? -12 : e.clientY > window.innerHeight - edge ? 12 : 0;
  moveTo(e.clientY);
}, { passive: false });
async function endDrag() {
  if (!drag) return;
  const { el, sel, box, kind, before, timer } = drag;
  clearInterval(timer);
  drag = null;
  el.classList.remove("dragging");
  document.body.classList.remove("sorting");
  if (order(box, sel) === before) return;
  try {
    if (kind === "prod") {
      const cid = Number(box.dataset.cat);
      const ids = [...box.querySelectorAll(".prow")].map((r) => Number(r.dataset.id));
      await api("/api/admin/order", { method: "PUT", body: { categoryId: cid, productIds: ids } });
      const mine = ids.map((id) => state.products.find((p) => p.id === id));
      state.products = [...state.products.filter((p) => p.categoryId !== cid), ...mine];
    } else {
      const ids = [...box.querySelectorAll(kind === "cat" ? ".cat-group" : ".crow")].map((g) => Number(g.dataset.cat || g.dataset.id));
      await api("/api/admin/order", { method: "PUT", body: { categoryIds: ids } });
      state.categories = ids.map((id) => state.categories.find((c) => c.id === id));
    }
    toast("Sıralama kaydedildi.");
  } catch (err) {
    toastErr(err);
    await loadCatalog(true).catch(() => {});
    if (ps.view === "kategoriler") renderCatList(); else renderGroups();
  }
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

export { productDialog };
void nav;
