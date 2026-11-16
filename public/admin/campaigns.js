// Kampanyalar: kuponlar (CRUD + toplu sil), afişler (görselli, sıralama, toplu sil), duyuru bandı.
import {
  state, $, $$, esc, icon, api, tl, toast, toastErr, bulkResult, openModal, confirmDialog, showBulk, hideBulk,
  loadSettings, fmtDate, dayStr, parseNum, numTr, resizeImage, trackForm, TZ,
} from "./core.js";

const cs = { view: "kuponlar", coupons: [], csel: new Set(), bsel: new Set() };
const TYPE = { yuzde: "Yüzde indirim", tutar: "Tutar indirimi", ucretsizTeslimat: "Ücretsiz teslimat" };
const isoToDay = (iso) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : "");

export const campaignsPage = {
  id: "kampanyalar", title: "Kampanyalar", icon: "megaphone", admin: true,
  async render(el, sub) {
    cs.view = ["afisler", "duyuru"].includes(sub[0]) ? sub[0] : "kuponlar";
    el.innerHTML = `<div class="page">
      <nav class="tabs" aria-label="Kampanya ekranları">
        <a href="/panel/kampanyalar" data-link ${cs.view === "kuponlar" ? 'aria-current="page"' : ""}>${icon("tag", "i-sm")} Kuponlar</a>
        <a href="/panel/kampanyalar/afisler" data-link ${cs.view === "afisler" ? 'aria-current="page"' : ""}>${icon("image", "i-sm")} Afişler</a>
        <a href="/panel/kampanyalar/duyuru" data-link ${cs.view === "duyuru" ? 'aria-current="page"' : ""}>${icon("megaphone", "i-sm")} Duyuru bandı</a>
      </nav>
      <div id="kView"><div class="skeleton">${"<div></div>".repeat(4)}</div></div></div>`;
    if (cs.view === "kuponlar") { cs.coupons = await api("/api/admin/coupons"); renderCoupons(); }
    else { await loadSettings(true); if (cs.view === "afisler") renderBanners(); else renderAnnouncement(); }
  },
  leave() { cs.csel.clear(); cs.bsel.clear(); hideBulk(); },
};

// ======================= KUPONLAR =======================
function couponStatus(c) {
  const now = Date.now();
  if (!c.active) return ["Pasif", "b-muted"];
  if (c.startsAt && Date.parse(c.startsAt) > now) return ["Başlamadı", "b-warn"];
  if (c.endsAt && Date.parse(c.endsAt) < now) return ["Süresi doldu", "b-danger"];
  if (c.maxUses && c.usedCount >= c.maxUses) return ["Sınır doldu", "b-danger"];
  return ["Geçerli", "b-ok"];
}
const couponValue = (c) => (c.type === "yuzde" ? `%${numTr(c.value)}` : c.type === "tutar" ? tl(c.value) : "Teslimat ücretsiz");

function renderCoupons() {
  const v = $("#kView");
  v.innerHTML = `<div class="toolbar"><p class="muted small grow" style="margin:0">Müşteri sepette kodu girer. Kod büyük/küçük harf ve Türkçe karakter duyarsızdır.</p>
    <button type="button" class="btn btn-primary" id="kNew">${icon("plus")} Yeni kupon</button></div>
    <div class="list"><div class="table-wrap"><table class="tbl" id="kTbl"></table></div></div>`;
  $("#kNew").addEventListener("click", () => couponDialog(null));
  const t = $("#kTbl");
  t.addEventListener("change", async (e) => {
    const cb = e.target;
    if (cb.dataset.ksel) { const id = Number(cb.dataset.ksel); if (cb.checked) cs.csel.add(id); else cs.csel.delete(id); cb.closest("tr").classList.toggle("is-selected", cb.checked); bulkCoupons(); }
    else if (cb.id === "kAll") { cs.coupons.forEach((c) => (cb.checked ? cs.csel.add(c.id) : cs.csel.delete(c.id))); drawCoupons(); }
    else if (cb.dataset.kact) {
      const c = cs.coupons.find((x) => x.id === Number(cb.dataset.kact));
      try { const u = await api(`/api/admin/coupons/${c.id}`, { method: "PATCH", body: { active: cb.checked } }); Object.assign(c, u); drawCoupons(); toast(`${c.code} ${c.active ? "etkinleştirildi" : "pasifleştirildi"}.`); }
      catch (er) { toastErr(er); cb.checked = !cb.checked; }
    }
  });
  t.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.kedit) couponDialog(cs.coupons.find((x) => x.id === Number(b.dataset.kedit)));
    if (b.dataset.kdel) deleteCoupons([Number(b.dataset.kdel)]);
  });
  drawCoupons();
}
function drawCoupons() {
  const t = $("#kTbl");
  if (!t) return;
  if (!cs.coupons.length) { t.innerHTML = `<tbody><tr><td><div class="empty">${icon("tag")}<b>Henüz kupon yok</b>“Yeni kupon” ile ilk kampanyanızı oluşturun.</div></td></tr></tbody>`; bulkCoupons(); return; }
  const all = cs.coupons.every((c) => cs.csel.has(c.id));
  t.innerHTML = `<thead><tr><th class="cb"><input type="checkbox" class="cb" id="kAll" ${all ? "checked" : ""} aria-label="Tüm kuponları seç"></th><th>Kod</th><th>İndirim</th><th class="hide-phone">Min. sepet</th><th class="hide-phone">Kullanım</th><th class="hide-phone">Geçerlilik</th><th>Aktif</th><th></th></tr></thead>
    <tbody>${cs.coupons.map((c) => {
      const [st, cls] = couponStatus(c);
      return `<tr class="${cs.csel.has(c.id) ? "is-selected" : ""}">
        <td class="cb"><input type="checkbox" class="cb" data-ksel="${c.id}" ${cs.csel.has(c.id) ? "checked" : ""} aria-label="${esc(c.code)} seç"></td>
        <td><b style="font-family:var(--mono)">${esc(c.code)}</b> <span class="badge ${cls}">${st}</span>${c.description ? `<div class="small muted hide-phone">${esc(c.description)}</div>` : ""}</td>
        <td class="nowrap">${couponValue(c)}</td>
        <td class="hide-phone nowrap">${c.minOrder ? tl(c.minOrder) : "—"}</td>
        <td class="nowrap hide-phone">${c.usedCount}${c.maxUses ? ` / ${c.maxUses}` : ""}${c.perPhoneLimit ? `<div class="small muted">kişi başı ${c.perPhoneLimit}</div>` : ""}</td>
        <td class="hide-phone small">${c.startsAt || c.endsAt ? `${c.startsAt ? fmtDate(c.startsAt) : "…"} – ${c.endsAt ? fmtDate(c.endsAt) : "…"}` : "Süresiz"}</td>
        <td><label class="switch"><input type="checkbox" data-kact="${c.id}" ${c.active ? "checked" : ""} aria-label="${esc(c.code)} aktif"></label></td>
        <td class="nowrap r"><button type="button" class="icon-btn sm" data-kedit="${c.id}" aria-label="Düzenle">${icon("edit")}</button><button type="button" class="icon-btn sm danger" data-kdel="${c.id}" aria-label="Sil">${icon("trash")}</button></td>
      </tr>`;
    }).join("")}</tbody>`;
  bulkCoupons();
}
function bulkCoupons() {
  showBulk({
    count: cs.csel.size, canSelectAll: cs.csel.size < cs.coupons.length, allCount: cs.coupons.length,
    onClear: () => { cs.csel.clear(); drawCoupons(); },
    onSelectAll: () => { cs.coupons.forEach((c) => cs.csel.add(c.id)); drawCoupons(); },
    actions: [{ id: "delete", label: "Sil", icon: "trash", cls: "btn-danger" }],
    onAction: () => deleteCoupons([...cs.csel]),
  });
}
async function deleteCoupons(ids) {
  const codes = cs.coupons.filter((c) => ids.includes(c.id)).map((c) => c.code);
  if (!(await confirmDialog({ title: ids.length > 1 ? `${ids.length} kupon silinsin mi?` : `${codes[0]} silinsin mi?`, message: "Silinen kupon artık kullanılamaz. Eski siparişlerdeki indirim kayıtları korunur.", okLabel: "Sil", danger: true }))) return;
  try {
    const r = await api("/api/admin/coupons/bulk-delete", { method: "POST", body: { ids } });
    bulkResult(r, "kupon silindi");
    cs.csel.clear();
    cs.coupons = await api("/api/admin/coupons");
    drawCoupons();
  } catch (e) { toastErr(e); }
}
function couponDialog(c) {
  openModal({
    title: c ? `Kupon: ${c.code}` : "Yeni kupon", submitLabel: c ? "Kaydet" : "Kuponu oluştur",
    body: `<div class="grid-2">
      <label class="field"><span>Kupon kodu</span><input name="code" maxlength="30" value="${esc(c ? c.code : "")}" placeholder="Örn. HOSGELDIN" style="text-transform:uppercase;font-family:var(--mono)" required autofocus><span class="hint">3–30 karakter; harf, rakam, - ve _</span></label>
      <label class="field"><span>Tür</span><select name="type">${Object.entries(TYPE).map(([k, l]) => `<option value="${k}" ${c && c.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field" id="kValF"><span id="kValL">Değer</span><div class="affix"><input name="value" inputmode="decimal" value="${c ? esc(numTr(c.value)) : ""}"><span class="sfx" id="kValS">%</span></div></label>
      <label class="field"><span>Minimum sepet <span class="hint">(ara toplam)</span></span><div class="affix"><input name="minOrder" inputmode="decimal" value="${c && c.minOrder ? esc(numTr(c.minOrder)) : ""}" placeholder="0"><span class="sfx">₺</span></div></label>
      <label class="field"><span>Toplam kullanım sınırı</span><input name="maxUses" inputmode="numeric" value="${c && c.maxUses ? c.maxUses : ""}" placeholder="Sınırsız"></label>
      <label class="field"><span>Telefon başına kullanım</span><input name="perPhoneLimit" inputmode="numeric" value="${c && c.perPhoneLimit ? c.perPhoneLimit : ""}" placeholder="Sınırsız"></label>
      <label class="field"><span>Başlangıç</span><input type="date" name="startsAt" value="${c ? isoToDay(c.startsAt) : ""}"></label>
      <label class="field"><span>Bitiş</span><input type="date" name="endsAt" value="${c ? isoToDay(c.endsAt) : ""}"></label>
      <label class="field span-2"><span>Açıklama <span class="hint">(yalnızca panelde)</span></span><input name="description" maxlength="200" value="${esc(c ? c.description : "")}"></label>
    </div>
    <div class="row-flex" style="gap:18px"><label class="switch"><input type="checkbox" name="active" ${!c || c.active ? "checked" : ""}> Aktif</label>
    ${c ? `<label class="check"><input type="checkbox" name="resetUsed"> Kullanım sayacını sıfırla (şu an ${c.usedCount})</label>` : ""}</div>`,
    onOpen: (f) => {
      const upd = () => {
        const t = f.type.value;
        $("#kValF").hidden = t === "ucretsizTeslimat";
        $("#kValL").textContent = t === "yuzde" ? "İndirim yüzdesi" : "İndirim tutarı";
        $("#kValS").textContent = t === "yuzde" ? "%" : "₺";
      };
      f.type.addEventListener("change", upd); upd();
    },
    onSubmit: async (f) => {
      const intOrNull = (s) => (s.trim() ? Number(s.trim()) : null);
      const body = {
        code: f.code.value.trim(), type: f.type.value, value: f.type.value === "ucretsizTeslimat" ? 0 : parseNum(f.value.value),
        minOrder: parseNum(f.minOrder.value) || 0, maxUses: intOrNull(f.maxUses.value), perPhoneLimit: intOrNull(f.perPhoneLimit.value),
        startsAt: f.startsAt.value || null, endsAt: f.endsAt.value || null, description: f.description.value.trim(), active: f.active.checked,
      };
      if (body.type !== "ucretsizTeslimat" && !(body.value > 0)) throw new Error("İndirim değerini girin.");
      if (c && f.resetUsed && f.resetUsed.checked) body.usedCount = 0;
      const r = c ? await api(`/api/admin/coupons/${c.id}`, { method: "PATCH", body }) : await api("/api/admin/coupons", { method: "POST", body });
      cs.coupons = await api("/api/admin/coupons");
      drawCoupons();
      toast(c ? `${r.code} kaydedildi.` : `${r.code} kuponu oluşturuldu.`);
    },
  });
}

// ======================= AFİŞLER =======================
async function saveBanners(list, msg) {
  const r = await api("/api/admin/settings", { method: "PATCH", body: { banners: list.map(({ id, title, text, image, link, active }) => ({ id, title, text, image, link, active })) } });
  state.settings = r.settings;
  drawBanners();
  if (msg) toast(msg);
}
function renderBanners() {
  const v = $("#kView");
  v.innerHTML = `<div class="toolbar"><p class="muted small grow" style="margin:0">Afişler mağaza ana sayfasında sırayla gösterilir (en fazla 20). Görsel için yatay (ör. 1600×700) fotoğraf önerilir.</p>
    <button type="button" class="btn btn-primary" id="bNew">${icon("plus")} Yeni afiş</button></div>
    <div class="list" id="bList"></div>`;
  $("#bNew").addEventListener("click", () => bannerDialog(null));
  const l = $("#bList");
  l.addEventListener("change", async (e) => {
    const cb = e.target;
    const list = state.settings.banners;
    if (cb.dataset.bsel) { const id = Number(cb.dataset.bsel); if (cb.checked) cs.bsel.add(id); else cs.bsel.delete(id); cb.closest(".lrow").classList.toggle("is-selected", cb.checked); bulkBanners(); }
    else if (cb.id === "bAll") { list.forEach((b) => (cb.checked ? cs.bsel.add(b.id) : cs.bsel.delete(b.id))); drawBanners(); }
    else if (cb.dataset.bact) {
      const next = list.map((b) => (b.id === Number(cb.dataset.bact) ? { ...b, active: cb.checked } : b));
      try { await saveBanners(next, cb.checked ? "Afiş yayında." : "Afiş yayından kaldırıldı."); } catch (er) { toastErr(er); cb.checked = !cb.checked; }
    }
  });
  l.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const list = state.settings.banners;
    if (b.dataset.bedit) bannerDialog(list.find((x) => x.id === Number(b.dataset.bedit)));
    if (b.dataset.bdel) deleteBanners([Number(b.dataset.bdel)]);
    if (b.dataset.bmove) {
      const i = list.findIndex((x) => x.id === Number(b.dataset.bmove));
      const j = i + Number(b.dataset.d);
      if (j < 0 || j >= list.length) return;
      const next = list.slice();
      [next[i], next[j]] = [next[j], next[i]];
      try { await saveBanners(next, "Sıralama kaydedildi."); } catch (er) { toastErr(er); }
    }
  });
  drawBanners();
}
function drawBanners() {
  const l = $("#bList");
  if (!l) return;
  const list = state.settings.banners;
  if (!list.length) { l.innerHTML = `<div class="empty">${icon("image")}<b>Afiş yok</b>“Yeni afiş” ile kampanya duyurun.</div>`; bulkBanners(); return; }
  const all = list.every((b) => cs.bsel.has(b.id));
  l.innerHTML = `<div class="list-head"><label class="cb-cell"><input type="checkbox" class="cb" id="bAll" ${all ? "checked" : ""} aria-label="Tüm afişleri seç"></label><span>${list.length} afiş</span></div>`
    + list.map((b, i) => `<div class="lrow ${cs.bsel.has(b.id) ? "is-selected" : ""} ${b.active ? "" : "is-muted"}">
      <label class="cb-cell"><input type="checkbox" class="cb" data-bsel="${b.id}" ${cs.bsel.has(b.id) ? "checked" : ""} aria-label="${esc(b.title || "Afiş")} seç"></label>
      <div class="thumb" style="width:84px;height:48px">${b.image ? `<img src="${esc(b.image)}" alt="">` : icon("image")}</div>
      <div class="lrow-main"><div class="lrow-title">${esc(b.title || "(başlıksız)")}${b.active ? "" : ' <span class="badge b-muted">Yayında değil</span>'}</div><div class="lrow-sub"><span>${esc(b.text || "")}</span>${b.link ? `<span>${icon("external")} ${esc(b.link)}</span>` : ""}</div></div>
      <div class="lrow-acts">
        <label class="switch" title="Yayında"><input type="checkbox" data-bact="${b.id}" ${b.active ? "checked" : ""} aria-label="Yayında"></label>
        <button type="button" class="icon-btn sm" data-bmove="${b.id}" data-d="-1" ${i === 0 ? "disabled" : ""} aria-label="Yukarı taşı">${icon("up")}</button>
        <button type="button" class="icon-btn sm" data-bmove="${b.id}" data-d="1" ${i === list.length - 1 ? "disabled" : ""} aria-label="Aşağı taşı">${icon("down")}</button>
        <button type="button" class="icon-btn sm" data-bedit="${b.id}" aria-label="Düzenle">${icon("edit")}</button>
        <button type="button" class="icon-btn sm danger" data-bdel="${b.id}" aria-label="Sil">${icon("trash")}</button>
      </div></div>`).join("");
  bulkBanners();
}
function bulkBanners() {
  const list = state.settings ? state.settings.banners : [];
  showBulk({
    count: cs.bsel.size, canSelectAll: cs.bsel.size < list.length, allCount: list.length,
    onClear: () => { cs.bsel.clear(); drawBanners(); },
    onSelectAll: () => { list.forEach((b) => cs.bsel.add(b.id)); drawBanners(); },
    actions: [{ id: "delete", label: "Sil", icon: "trash", cls: "btn-danger" }],
    onAction: () => deleteBanners([...cs.bsel]),
  });
}
async function deleteBanners(ids) {
  if (!(await confirmDialog({ title: ids.length > 1 ? `${ids.length} afiş silinsin mi?` : "Afiş silinsin mi?", message: "Afiş ve görseli kalıcı olarak silinir.", okLabel: "Sil", danger: true }))) return;
  try {
    const r = await api("/api/admin/settings/banners/bulk-delete", { method: "POST", body: { ids } });
    bulkResult(r, "afiş silindi");
    cs.bsel.clear();
    await loadSettings(true);
    drawBanners();
  } catch (e) { toastErr(e); }
}
function bannerDialog(b) {
  let img = b ? b.image : null;
  let pending = null; // yüklenecek yeni data URL
  openModal({
    title: b ? "Afişi düzenle" : "Yeni afiş", submitLabel: b ? "Kaydet" : "Afişi ekle",
    body: `<label class="field"><span>Başlık</span><input name="title" maxlength="100" value="${esc(b ? b.title : "")}" autofocus></label>
      <label class="field"><span>Metin</span><textarea name="text" maxlength="300" rows="2">${esc(b ? b.text : "")}</textarea></label>
      <label class="field"><span>Bağlantı <span class="hint">(isteğe bağlı: /…, #indirimler ya da https://…)</span></span><input name="link" maxlength="300" value="${esc(b ? b.link : "")}"></label>
      <div class="img-pick"><div class="pv wide" id="bPv">${img ? `<img src="${esc(img)}" alt="">` : icon("image")}</div>
        <div class="btns"><label class="btn btn-sm" for="bImg">${icon("upload", "i-sm")} Görsel seç</label><input id="bImg" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <button type="button" class="btn btn-sm btn-danger-ghost" id="bImgRm" ${img ? "" : "hidden"}>Görseli kaldır</button></div></div>
      <label class="switch"><input type="checkbox" name="active" ${!b || b.active ? "checked" : ""}> Yayında</label>`,
    onOpen: () => {
      $("#bImg").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try { pending = await resizeImage(file, 1800, 0.85); $("#bPv").innerHTML = `<img src="${pending}" alt="">`; $("#bImgRm").hidden = false; } catch (er) { toast(er.message, "err"); }
      });
      $("#bImgRm").addEventListener("click", () => { pending = null; img = null; $("#bPv").innerHTML = icon("image"); $("#bImgRm").hidden = true; });
    },
    onSubmit: async (f) => {
      if (pending) { const up = await api("/api/admin/uploads", { method: "POST", body: { image: pending } }); img = up.url; pending = null; }
      const item = { title: f.title.value.trim(), text: f.text.value.trim(), link: f.link.value.trim(), image: img || null, active: f.active.checked };
      if (!item.title && !item.text && !item.image) throw new Error("Başlık, metin ya da görselden en az biri gerekli.");
      const list = state.settings.banners;
      const next = b ? list.map((x) => (x.id === b.id ? { ...x, ...item } : x)) : [...list, item];
      await saveBanners(next, b ? "Afiş kaydedildi." : "Afiş eklendi.");
    },
  });
}

// ======================= DUYURU =======================
function renderAnnouncement() {
  const a = state.settings.announcement;
  const v = $("#kView");
  v.innerHTML = `<form class="card page-narrow" id="anForm" novalidate style="margin:0">
    <div class="card-body stack">
      <p class="muted small" style="margin:0">Mağazanın en üstünde ince bir bant olarak görünür. Örn. “Bu akşam 23:00'e kadar tüm meyvelerde %10 indirim”.</p>
      <label class="switch big"><input type="checkbox" name="active" ${a.active ? "checked" : ""}> Duyuru bandı yayında</label>
      <label class="field"><span>Duyuru metni</span><textarea name="text" maxlength="300" rows="3">${esc(a.text)}</textarea><span class="counter hint"><span>Kısa tutun; telefonda tek satır okunur.</span><span id="anCount"></span></span></label>
      <div><span class="field-label">Ön izleme</span><div id="anPrev" style="margin-top:6px;padding:9px 14px;border-radius:8px;background:var(--navy);color:#fff;font-weight:600;font-size:14px"></div></div>
    </div>
    <div class="card-foot"><span class="small muted grow" id="anState"></span><button class="btn btn-primary" id="anSave">Kaydet</button></div>
  </form>`;
  const f = $("#anForm");
  const tr = trackForm(f, "settings-duyuru", "Duyuru");
  const upd = () => {
    $("#anCount").textContent = `${f.text.value.length} / 300`;
    $("#anPrev").textContent = f.text.value.trim() || "(boş)";
    $("#anPrev").style.opacity = f.active.checked ? "1" : ".45";
    $("#anState").textContent = tr.changed() ? "Kaydedilmemiş değişiklik var" : "";
  };
  f.addEventListener("input", upd); f.addEventListener("change", upd); upd();
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#anSave");
    if (f.active.checked && !f.text.value.trim()) { toast("Yayına almak için duyuru metni yazın.", "err"); return; }
    btn.disabled = true; btn.classList.add("is-busy");
    try {
      const r = await api("/api/admin/settings", { method: "PATCH", body: { announcement: { text: f.text.value.trim(), active: f.active.checked } } });
      state.settings = r.settings;
      tr.reset(); upd();
      toast(f.active.checked ? "Duyuru yayında." : "Duyuru kaydedildi (yayında değil).");
    } catch (er) { toastErr(er); } finally { btn.disabled = false; btn.classList.remove("is-busy"); }
  });
}
void $$; void dayStr;
