// Müşteriler: siparişlerden türetilen liste, arama, ayrıntı (sipariş geçmişi), engelle / engeli kaldır (tek ve toplu).
import { state, $, $$, esc, icon, api, tl, toast, toastErr, isAdmin, openModal, confirmDialog, showBulk, hideBulk, fmtDate, fmtDateTime, debounce, fmtPhone, waNumber, nav } from "./core.js";

const cs = { q: "", blocked: false, list: [], total: 0, page: 1, pages: 1, sel: new Set(), loading: false };
const BADGE = { Yeni: "b-new", Hazırlanıyor: "b-prep", Yolda: "b-road", "Teslim edildi": "b-done", İptal: "b-cancel" };

export const customersPage = {
  id: "musteriler", title: "Müşteriler", icon: "users",
  async render(el, sub) {
    el.innerHTML = `<div class="page">
      <div class="toolbar">
        <label class="search"><span class="sr-only">Müşteri ara</span>${icon("search")}<input class="input" type="search" id="cuSearch" placeholder="Ad, telefon (en az 3 hane) veya adres…" value="${esc(cs.q)}" autocomplete="off"></label>
        <label class="check"><input type="checkbox" id="cuBlocked" ${cs.blocked ? "checked" : ""}> Yalnızca engelliler</label>
        <span class="grow"></span>
        <span class="muted small" id="cuCount"></span>
      </div>
      <div class="list" id="cuList"><div class="skeleton" style="padding:10px">${"<div></div>".repeat(5)}</div></div>
      <div class="load-more" id="cuMore" hidden><button type="button" class="btn">Daha fazla göster</button></div>
    </div>`;
    const reload = debounce(() => { cs.sel.clear(); load(); }, 300);
    $("#cuSearch").addEventListener("input", (e) => { cs.q = e.target.value; reload(); });
    $("#cuBlocked").addEventListener("change", (e) => { cs.blocked = e.target.checked; cs.sel.clear(); load(); });
    $("#cuMore button").addEventListener("click", () => load(true));
    const list = $("#cuList");
    list.addEventListener("click", (e) => {
      const r = e.target.closest("[data-cu]");
      if (r) nav.go(`/panel/musteriler/${r.dataset.cu}`);
    });
    list.addEventListener("change", (e) => {
      const cb = e.target;
      if (cb.dataset.cusel) {
        if (cb.checked) cs.sel.add(cb.dataset.cusel); else cs.sel.delete(cb.dataset.cusel);
        cb.closest(".lrow").classList.toggle("is-selected", cb.checked);
        renderBulk();
      } else if (cb.id === "cuAll") {
        cs.list.forEach((c) => (cb.checked ? cs.sel.add(c.phone) : cs.sel.delete(c.phone)));
        renderList();
      }
    });
    await load();
    if (sub[0]) openCustomer(sub[0]);
  },
  async update(el, sub) { if (sub[0]) openCustomer(sub[0]); },
  leave() { cs.sel.clear(); hideBulk(); },
};

async function load(append = false) {
  const page = append ? cs.page + 1 : 1;
  const p = new URLSearchParams({ page, pageSize: 100 });
  if (cs.q.trim()) p.set("q", cs.q.trim());
  if (cs.blocked) p.set("blocked", "1");
  try {
    const r = await api(`/api/admin/customers?${p}`);
    cs.list = append ? [...cs.list, ...r.customers] : r.customers;
    cs.total = r.total; cs.page = r.page; cs.pages = r.pages;
    renderList();
  } catch (e) {
    toastErr(e);
    const l = $("#cuList");
    if (l && !cs.list.length) l.innerHTML = `<div class="empty">${icon("alert")}<b>Müşteriler yüklenemedi</b>${esc(e.message)}</div>`;
  }
}

function renderList() {
  const l = $("#cuList");
  if (!l) return;
  $("#cuCount").textContent = `${cs.total} müşteri`;
  $("#cuMore").hidden = cs.page >= cs.pages;
  if (!cs.list.length) {
    l.innerHTML = `<div class="empty">${icon("users")}<b>${cs.q || cs.blocked ? "Müşteri bulunamadı" : "Henüz müşteri yok"}</b>${cs.q || cs.blocked ? "Aramayı değiştirin." : "İlk siparişle birlikte müşteriler burada listelenir."}</div>`;
    renderBulk();
    return;
  }
  const all = cs.list.every((c) => cs.sel.has(c.phone));
  l.innerHTML = `<div class="list-head"><label class="cb-cell"><input type="checkbox" class="cb" id="cuAll" ${all ? "checked" : ""} aria-label="Listedekilerin tümünü seç"></label><span class="grow">Müşteri</span><span class="hide-phone" style="width:110px;text-align:right">Sipariş</span><span style="width:120px;text-align:right">Harcama</span></div>`
    + cs.list.map((c) => `<div class="lrow ${cs.sel.has(c.phone) ? "is-selected" : ""}">
      <label class="cb-cell"><input type="checkbox" class="cb" data-cusel="${esc(c.phone)}" ${cs.sel.has(c.phone) ? "checked" : ""} aria-label="${esc(c.name)} seç"></label>
      <button type="button" class="lrow-main clickable" data-cu="${esc(c.phone)}" style="border:0;background:none;text-align:left;padding:0">
        <div class="lrow-title">${esc(c.name || "—")}${c.blocked ? `<span class="badge b-danger">${icon("ban")} Engelli</span>` : ""}</div>
        <div class="lrow-sub"><span>${esc(fmtPhone(c.phone))}</span>${c.zoneName ? `<span>${esc(c.zoneName)}</span>` : ""}${c.lastOrderAt ? `<span>Son: ${fmtDate(c.lastOrderAt)}</span>` : ""}${c.cancelledCount ? `<span>${c.cancelledCount} iptal</span>` : ""}</div>
      </button>
      <span class="hide-phone num" style="width:110px;text-align:right">${c.orderCount}</span>
      <span class="num" style="width:120px;text-align:right;font-weight:700">${tl(c.totalSpent)}</span>
    </div>`).join("");
  renderBulk();
}

function renderBulk() {
  if (!isAdmin()) { hideBulk(); return; }
  showBulk({
    count: cs.sel.size, canSelectAll: cs.list.some((c) => !cs.sel.has(c.phone)), allCount: cs.list.length,
    onClear: () => { cs.sel.clear(); renderList(); },
    onSelectAll: () => { cs.list.forEach((c) => cs.sel.add(c.phone)); renderList(); },
    actions: [{ id: "block", label: "Engelle", icon: "ban", cls: "btn-danger" }, { id: "unblock", label: "Engeli kaldır" }],
    onAction: async (id) => {
      const phones = [...cs.sel];
      const block = id === "block";
      if (!(await confirmDialog({ title: block ? `${phones.length} müşteri engellensin mi?` : `${phones.length} müşterinin engeli kaldırılsın mı?`, message: block ? "Engellenen numaralarla online sipariş verilemez (telefonla sipariş paneldeki elle siparişle alınabilir)." : "Bu numaralar yeniden online sipariş verebilir.", okLabel: block ? "Engelle" : "Engeli kaldır", danger: block }))) return;
      let ok = 0; const skipped = [];
      for (const ph of phones) {
        try { await api(`/api/admin/customers/${encodeURIComponent(ph)}/block`, { method: "PUT", body: { blocked: block } }); ok++; } catch (e) { skipped.push(`${ph}: ${e.message}`); }
      }
      toast(`${ok} müşteri ${block ? "engellendi" : "engeli kaldırıldı"}${skipped.length ? `, ${skipped.length} atlandı` : ""}.`, skipped.length ? "warn" : "ok", { details: skipped });
      cs.sel.clear();
      load();
    },
  });
}

async function openCustomer(phone) {
  let data;
  try { data = await api(`/api/admin/customers/${encodeURIComponent(phone)}`); } catch (e) { toastErr(e); nav.replace("/panel/musteriler"); return; }
  const c = data.customer;
  const ctl = openModal({
    title: c.name || fmtPhone(c.phone), size: "wide", hideSubmit: true, cancelLabel: "Kapat", guard: false,
    body: `<div class="row-flex">${c.blocked ? `<span class="badge b-danger">${icon("ban")} Engelli</span>` : `<span class="badge b-ok">Sipariş verebilir</span>`}<span class="muted small">İlk sipariş ${fmtDate(c.firstOrderAt)} · son sipariş ${fmtDate(c.lastOrderAt)}</span></div>
      <div class="kpis" style="margin:0">
        <div class="kpi"><div class="k">Sipariş</div><div class="v">${c.orderCount}</div></div>
        <div class="kpi"><div class="k">Toplam harcama</div><div class="v">${tl(c.totalSpent)}</div></div>
        <div class="kpi"><div class="k">Ortalama</div><div class="v">${tl(c.orderCount ? c.totalSpent / c.orderCount : 0)}</div></div>
        <div class="kpi"><div class="k">İptal</div><div class="v">${c.cancelledCount}</div></div>
      </div>
      <dl class="kv"><dt>Telefon</dt><dd>${esc(fmtPhone(c.phone))}</dd>${c.zoneName ? `<dt>Bölge</dt><dd>${esc(c.zoneName)}</dd>` : ""}${c.address ? `<dt>Son adres</dt><dd>${esc(c.address)}</dd>` : ""}</dl>
      <div class="row-flex">
        <a class="btn" href="tel:${esc(c.phone)}">${icon("phone")} Ara</a>
        <a class="btn" href="https://wa.me/${waNumber(c.phone)}" target="_blank" rel="noopener">${icon("message")} WhatsApp</a>
        ${isAdmin() ? `<button type="button" class="btn ${c.blocked ? "" : "btn-danger-ghost"}" id="cuBlockBtn">${icon("ban")} ${c.blocked ? "Engeli kaldır" : "Engelle"}</button>` : ""}
      </div>
      <h4>Sipariş geçmişi (${data.orders.length})</h4>
      <div class="list">${data.orders.length ? data.orders.map((o) => `<a class="lrow" data-link href="/panel/siparisler/${o.id}" style="text-decoration:none;color:inherit">
        <div class="lrow-main"><div class="lrow-title">#${o.id} <span class="badge ${BADGE[o.status]}">${esc(o.status)}</span></div>
        <div class="lrow-sub"><span>${fmtDateTime(o.createdAt)}</span><span>${o.items.reduce((t, i) => t + i.qty, 0)} ürün</span><span>${o.type === "gelal" ? "Gel-al" : esc(o.customer.zoneName || "Eve teslim")}</span></div></div>
        <b class="num">${tl(o.total)}</b>${icon("right")}</a>`).join("") : `<div class="empty small">Sipariş yok.</div>`}</div>`,
  });
  ctl.dlg.addEventListener("click", (e) => { if (e.target.closest("a[data-link]")) ctl.close(); });
  const bb = $("#cuBlockBtn");
  if (bb) bb.addEventListener("click", async () => {
    const block = !c.blocked;
    if (!(await confirmDialog({ title: block ? "Müşteri engellensin mi?" : "Engel kaldırılsın mı?", message: block ? `${fmtPhone(c.phone)} numarasıyla online sipariş verilemeyecek.` : `${fmtPhone(c.phone)} yeniden online sipariş verebilir.`, okLabel: block ? "Engelle" : "Engeli kaldır", danger: block }))) return;
    try {
      await api(`/api/admin/customers/${encodeURIComponent(c.phone)}/block`, { method: "PUT", body: { blocked: block } });
      toast(block ? "Müşteri engellendi." : "Engel kaldırıldı.", block ? "warn" : "ok");
      ctl.close();
      load();
    } catch (e) { toastErr(e); }
  });
  ctl.closed.then(() => { if (location.pathname.startsWith("/panel/musteriler/")) nav.replace("/panel/musteriler"); });
}
void state; void $$;
