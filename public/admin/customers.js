// Müşteriler: siparişlerden türetilen liste, arama, ayrıntı (sipariş geçmişi), engelle / engeli kaldır (tek ve toplu).
import { state, $, $$, esc, icon, api, tl, toast, toastErr, isAdmin, openModal, confirmDialog, showBulk, hideBulk, fmtDate, fmtDateTime, debounce, fmtPhone, waNumber, nav, download } from "./core.js";

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
      ${isAdmin() ? `<div class="callout">${icon("shield")}<div style="flex:1"><b>KVKK başvurusu</b> (30 gün içinde yanıtlayın): müşterinin verilerini dosya olarak verin ya da silin.
        <div class="row-flex mt"><button type="button" class="btn btn-sm" id="cuExport">${icon("download", "i-sm")} Verilerini dışa aktar</button><button type="button" class="btn btn-sm btn-danger-ghost" id="cuAnon">${icon("trash", "i-sm")} Verilerini sil / anonimleştir</button></div></div></div>` : ""}
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
  const ex = $("#cuExport");
  if (ex) ex.addEventListener("click", async () => {
    ex.disabled = true; ex.classList.add("is-busy");
    try {
      const n = await download(`/api/admin/customers/${encodeURIComponent(c.phone)}/export`, "musteri-verisi.json");
      toast(`${n} indirildi. Dosyayı yalnızca başvuru sahibine, güvenli bir yoldan iletin.`, "ok", { timeout: 8000 });
    } catch (e) { toastErr(e); } finally { ex.disabled = false; ex.classList.remove("is-busy"); }
  });
  const an = $("#cuAnon");
  if (an) an.addEventListener("click", () => anonymizeDialog(c, data.orders, () => { ctl.close(); load(); }));
  ctl.closed.then(() => { if (location.pathname.startsWith("/panel/musteriler/")) nav.replace("/panel/musteriler"); });
}

// KVKK silme başvurusu: geri alınamaz; onay için telefonun son 4 hanesi yazdırılır
function anonymizeDialog(c, orders, done) {
  const digits = String(c.phone).replace(/\D/g, "").slice(-4);
  const active = orders.filter((o) => ["Yeni", "Hazırlanıyor", "Yolda"].includes(o.status)).length;
  const done_ = orders.length - active;
  openModal({
    title: "Müşteri verileri silinsin mi?", size: "narrow", danger: true, submitLabel: "Kalıcı olarak anonimleştir", guard: false,
    body: `<div class="strong-confirm">
      <div class="callout danger">${icon("alert")}<div><b>Bu işlem geri alınamaz.</b> ${esc(c.name || fmtPhone(c.phone))} adlı müşterinin ${done_} tamamlanmış/iptal siparişinde ad, telefon, adres, notlar, iade talebi metni ve onay IP'si silinir. Tutar, ürünler ve bölge raporlar için kalır.</div></div>
      ${active ? `<div class="callout warn">${icon("info")}<div>${active} aktif sipariş atlanacak; önce tamamlayın ya da iptal edin, sonra tekrar çalıştırın.</div></div>` : ""}
      <p class="small" style="margin:0">Otomatik yedeklerdeki eski kopyalar süreleri dolunca silinir (günlük yedekler 14 gün). Gerekirse önce “Verilerini dışa aktar” ile kopyasını başvuru sahibine verin.</p>
      <label class="field"><span>Onaylamak için telefonun son 4 hanesini yazın: <span class="code">${esc(digits)}</span></span><input name="code" inputmode="numeric" maxlength="4" autocomplete="off" required></label>
    </div>`,
    onOpen: (f, ctl) => {
      const ok = ctl.dlg.querySelector("[data-ok]");
      ok.disabled = true;
      f.code.addEventListener("input", () => { ok.disabled = f.code.value.trim() !== digits; });
    },
    onSubmit: async (f) => {
      if (f.code.value.trim() !== digits) throw new Error("Son 4 hane eşleşmiyor.");
      const r = await api(`/api/admin/customers/${encodeURIComponent(c.phone)}/anonymize`, { method: "POST", body: { confirm: true } });
      const sk = r.skipped || [];
      toast(`${r.processed} siparişte müşteri verisi anonimleştirildi${sk.length ? `, ${sk.length} sipariş atlandı` : ""}.`, sk.length ? "warn" : "ok", { details: [...sk.map((s) => `#${s.id}: ${s.reason}`), ...(r.note ? [r.note] : [])], timeout: 10000 });
      done();
    },
  });
}
void state; void $$;
