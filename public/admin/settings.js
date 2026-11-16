// Ayarlar (yönetici): mağaza, saatler, sipariş, bölgeler, SSS, yasal, bildirim, kullanıcılar, yedek.
// Hesabım (herkes): şifre değiştirme, bu cihazın ses/bildirim tercihi, çıkış.
import {
  state, $, $$, esc, icon, api, tl, toast, toastErr, isAdmin, bulkResult, openModal, confirmDialog, showBulk, hideBulk,
  loadSettings, parseNum, numTr, trackForm, confirmLeave, clearDirty, isDirty, download, fmtDateTime, nav, readLS,
} from "./core.js";
import { audio } from "./orders.js";

const SECTIONS = [
  ["magaza", "Mağaza bilgileri", "store"],
  ["saatler", "Çalışma saatleri", "clock"],
  ["siparis", "Sipariş ayarları", "orders"],
  ["bolgeler", "Teslimat bölgeleri", "pin"],
  ["sss", "Sık sorulan sorular", "info"],
  ["yasal", "Yasal bilgiler", "file"],
  ["bildirim", "Bildirimler", "bell"],
  ["kullanicilar", "Kullanıcılar", "users"],
  ["yedek", "Yedekleme", "download"],
];
const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
let section = "magaza";
let tracker = null;

export const settingsPage = {
  id: "ayarlar", title: "Ayarlar", icon: "settings", admin: true,
  async render(el, sub) {
    section = SECTIONS.some(([k]) => k === sub[0]) ? sub[0] : "magaza";
    el.innerHTML = `<div class="page settings-layout">
      <nav class="settings-nav" id="sNav" aria-label="Ayar bölümleri">${SECTIONS.map(([k, l, ic]) => `<a href="/panel/ayarlar/${k}" data-link ${k === section ? 'aria-current="page"' : ""} data-sec="${k}">${icon(ic, "i-sm")}<span>${l}</span></a>`).join("")}</nav>
      <div id="sBody"><div class="skeleton">${"<div></div>".repeat(4)}</div></div>
    </div>`;
    await loadSettings(true);
    renderSection();
  },
  async update(el, sub) {
    section = SECTIONS.some(([k]) => k === sub[0]) ? sub[0] : "magaza";
    $$("#sNav a").forEach((a) => (a.dataset.sec === section ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    renderSection();
    window.scrollTo(0, 0);
  },
  leave() { hideBulk(); tracker = null; },
};
document.addEventListener("settingsupdated", () => {
  if (!(nav.current && nav.current() === settingsPage) || !$("#sBody") || ["kullanicilar", "yedek"].includes(section)) return;
  if (!isDirty(`settings-${section}`)) renderSection();
  else toast("Ayarlar başka bir yerden değişti. Bu formu kaydederseniz o değişikliğin üzerine yazılır.", "warn");
});
document.addEventListener("dirtychange", () => {
  $$("#sNav a").forEach((a) => {
    const d = isDirty(`settings-${a.dataset.sec}`);
    const dot = a.querySelector(".dirty-dot");
    if (d && !dot) a.insertAdjacentHTML("beforeend", '<span class="dirty-dot" title="Kaydedilmedi"></span>');
    if (!d && dot) dot.remove();
  });
});

function renderSection() {
  hideBulk();
  const s = state.settings;
  const body = $("#sBody");
  const fn = { magaza: storeForm, saatler: hoursForm, siparis: orderingForm, bolgeler: zonesForm, sss: faqForm, yasal: legalForm, bildirim: notifyForm, kullanicilar: usersView, yedek: backupView }[section];
  body.innerHTML = "";
  fn(body, s);
}

/** Ortak bölüm kartı: form + Kaydet; collect() → PATCH gövdesi */
function sectionCard(body, { title, desc, inner, collect, after, saveLabel = "Kaydet" }) {
  body.innerHTML = `<form class="card" id="sForm" novalidate>
    <div class="card-head"><div><h3>${esc(title)}</h3>${desc ? `<p class="small muted" style="margin:2px 0 0">${desc}</p>` : ""}</div></div>
    <div class="card-body">${inner}</div>
    <div class="card-foot"><p class="form-error grow" id="sErr" role="alert"></p><span class="small muted" id="sState"></span><button class="btn btn-primary" id="sSave">${esc(saveLabel)}</button></div>
  </form>`;
  const f = $("#sForm");
  if (after) after(f);
  tracker = trackForm(f, `settings-${section}`, title);
  const upd = () => { $("#sState").textContent = tracker.changed() ? "Kaydedilmemiş değişiklik var" : ""; };
  f.addEventListener("input", upd);
  f.addEventListener("change", upd);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#sErr").textContent = "";
    const btn = $("#sSave");
    let patch;
    try { patch = collect(f); } catch (er) { $("#sErr").textContent = er.message; return; }
    btn.disabled = true; btn.classList.add("is-busy");
    try {
      const r = await api("/api/admin/settings", { method: "PATCH", body: patch });
      state.settings = r.settings;
      document.dispatchEvent(new CustomEvent("storestatus", { detail: r.status }));
      clearDirty(`settings-${section}`);
      toast(`${title} kaydedildi.`);
      renderSection();
    } catch (er) {
      $("#sErr").textContent = er.message;
      toastErr(er);
    } finally { btn.disabled = false; btn.classList.remove("is-busy"); }
  });
  return f;
}
const val = (v) => esc(v ?? "");
const moneyOrNull = (s, label) => { const n = parseNum(s); if (n === null) return null; if (Number.isNaN(n) || n < 0) throw new Error(`${label} geçerli bir tutar olmalı.`); return n; };
const intOrNull = (s, label, min, max) => { const t = String(s).trim(); if (!t) return null; const n = Number(t); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} ${min}–${max} arasında tam sayı olmalı.`); return n; };

// ---------- Mağaza ----------
function storeForm(body, s) {
  const st = s.store;
  sectionCard(body, {
    title: "Mağaza bilgileri", desc: "Sitede, fişte, sunucu sayfalarında ve Google bilgilerinde kullanılır.",
    inner: `<div class="grid-2">
      <label class="field"><span>Mağaza adı</span><input name="name" maxlength="80" value="${val(st.name)}" required></label>
      <label class="field"><span>Slogan</span><input name="slogan" maxlength="140" value="${val(st.slogan)}"></label>
      <label class="field"><span>Telefon <span class="hint">(gösterim için)</span></span><input name="phone" maxlength="30" value="${val(st.phone)}"></label>
      <label class="field"><span>WhatsApp <span class="hint">(ülke kodlu, ör. 905321234567)</span></span><input name="whatsapp" inputmode="numeric" maxlength="15" value="${val(st.whatsapp)}"></label>
      <label class="field"><span>E-posta</span><input name="email" type="email" maxlength="120" value="${val(st.email)}"></label>
      <label class="field"><span>Instagram adresi</span><input name="instagram" maxlength="300" value="${val(st.instagram)}" placeholder="https://www.instagram.com/…"></label>
      <label class="field span-2"><span>Adres</span><textarea name="address" maxlength="300" rows="2">${val(st.address)}</textarea></label>
      <label class="field"><span>İl</span><input name="city" maxlength="60" value="${val(st.city)}"></label>
      <label class="field"><span>İlçe</span><input name="district" maxlength="60" value="${val(st.district)}"></label>
      <label class="field"><span>Posta kodu</span><input name="postalCode" maxlength="10" value="${val(st.postalCode)}"></label>
      <label class="field"><span>Harita bağlantısı</span><input name="mapsUrl" maxlength="500" value="${val(st.mapsUrl)}" placeholder="https://maps.google.com/…"></label>
      <label class="field span-2"><span>Hakkımızda metni</span><textarea name="about" maxlength="2000" rows="4">${val(st.about)}</textarea></label>
    </div>`,
    collect: (f) => ({ store: Object.fromEntries(["name", "slogan", "phone", "whatsapp", "email", "instagram", "address", "city", "district", "postalCode", "mapsUrl", "about"].map((k) => [k, f[k].value.trim()])) }),
  });
}

// ---------- Saatler ----------
function hoursForm(body, s) {
  const days = s.hours.days;
  sectionCard(body, {
    title: "Çalışma saatleri", desc: "Online sipariş bu saatlerde alınır. Kapanış açılıştan önceyse ertesi güne sarkar (14:00–02:00). Açılış = kapanış ise o gün 24 saat açık.",
    inner: `<div class="hours-tbl">${days.map((d, i) => `<div class="hours-row ${d.closed ? "is-closed" : ""}" data-day="${i}">
        <span class="day">${DAYS[i]}<label class="check only-phone"><input type="checkbox" name="closed${i}" data-mirror="closed${i}" ${d.closed ? "checked" : ""}> Kapalı</label></span>
        <label class="field"><span class="sr-only">${DAYS[i]} açılış</span><input type="time" name="open${i}" value="${val(d.open)}" ${d.closed ? "disabled" : ""}></label>
        <label class="field"><span class="sr-only">${DAYS[i]} kapanış</span><input type="time" name="close${i}" value="${val(d.close)}" ${d.closed ? "disabled" : ""}></label>
        <label class="check hide-phone"><input type="checkbox" id="closedD${i}" data-mirror="closed${i}" ${d.closed ? "checked" : ""}> Kapalı</label>
        <span class="note" id="hn${i}"></span>
      </div>`).join("")}</div>
      <div class="row-flex mt"><button type="button" class="btn btn-sm" id="hCopy">${icon("copy", "i-sm")} Pazartesi saatlerini tüm günlere uygula</button></div>`,
    after: (f) => {
      const note = (i) => {
        const o = f[`open${i}`].value, c = f[`close${i}`].value;
        const closed = f[`closed${i}`].checked;
        $(`#hn${i}`).textContent = closed ? "Bu gün online sipariş alınmaz" : o && c ? (o === c ? "24 saat açık" : c < o ? `Ertesi gün ${c}'ye kadar` : "") : "";
        $(`.hours-row[data-day="${i}"]`).classList.toggle("is-closed", closed);
        f[`open${i}`].disabled = closed; f[`close${i}`].disabled = closed;
      };
      f.addEventListener("change", (e) => {
        const m = e.target.dataset.mirror;
        if (m) $$(`[data-mirror="${m}"]`, f).forEach((x) => (x.checked = e.target.checked));
        DAYS.forEach((_, i) => note(i));
      });
      f.addEventListener("input", () => DAYS.forEach((_, i) => note(i)));
      $("#hCopy").addEventListener("click", () => {
        for (let i = 1; i < 7; i++) { f[`open${i}`].value = f.open0.value; f[`close${i}`].value = f.close0.value; $$(`[data-mirror="closed${i}"]`, f).forEach((x) => (x.checked = f.closed0.checked)); }
        DAYS.forEach((_, i) => note(i));
        f.dispatchEvent(new Event("change"));
      });
      DAYS.forEach((_, i) => note(i));
    },
    collect: (f) => ({ hours: { days: DAYS.map((_, i) => {
      const open = f[`open${i}`].value, close = f[`close${i}`].value;
      if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close)) throw new Error(`${DAYS[i]} için saatleri SS:DD biçiminde girin.`);
      return { open, close, closed: f[`closed${i}`].checked };
    }) } }),
  });
}

// ---------- Sipariş ----------
function orderingForm(body, s) {
  const o = s.ordering;
  sectionCard(body, {
    title: "Sipariş ayarları", desc: "Tutarlar TL. Bölgeye özel ücret/minimum tanımlanmamışsa buradaki genel değerler kullanılır.",
    inner: `<div class="big-toggle ${o.enabled ? "" : "off"}" id="oEnBox"><div><b id="oEnTitle">${o.enabled ? "Online sipariş alınıyor" : "Sipariş alımı durduruldu"}</b><span>Kapatınca mağazada sipariş düğmesi yerine aşağıdaki mesaj görünür.</span></div>
        <label class="switch big"><input type="checkbox" name="enabled" ${o.enabled ? "checked" : ""} aria-label="Online sipariş alımı"></label></div>
      <label class="field mt"><span>Sipariş alınmıyorken gösterilecek mesaj</span><textarea name="pausedMessage" maxlength="300" rows="2">${val(o.pausedMessage)}</textarea></label>
      <div class="form-sec"><h4>Tutarlar ve süre</h4><div class="grid-4 keep-2">
        <label class="field"><span>Minimum sipariş</span><div class="affix"><input name="minOrder" inputmode="decimal" value="${val(numTr(o.minOrder))}"><span class="sfx">₺</span></div></label>
        <label class="field"><span>Teslimat ücreti</span><div class="affix"><input name="deliveryFee" inputmode="decimal" value="${val(numTr(o.deliveryFee))}"><span class="sfx">₺</span></div></label>
        <label class="field"><span>Ücretsiz teslimat eşiği</span><div class="affix"><input name="freeDeliveryOver" inputmode="decimal" value="${val(numTr(o.freeDeliveryOver))}" placeholder="Yok"><span class="sfx">₺</span></div></label>
        <label class="field"><span>Tahmini süre</span><div class="affix"><input name="etaMinutes" inputmode="numeric" value="${val(o.etaMinutes)}"><span class="sfx">dk</span></div></label>
      </div></div>
      <div class="form-sec"><h4>Seçenekler</h4>
        <label class="switch"><input type="checkbox" name="pickupEnabled" ${o.pickupEnabled ? "checked" : ""}> Gel-al (mağazadan teslim) açık</label>
        <label class="switch"><input type="checkbox" name="allowPreorder" ${o.allowPreorder ? "checked" : ""}> Kapalı saatlerde ön sipariş alınsın</label>
        <div class="row-flex" style="gap:18px"><span class="field-label">Ödeme:</span>
          <label class="check"><input type="checkbox" name="nakit" ${o.payments.nakit ? "checked" : ""}> Kapıda nakit</label>
          <label class="check"><input type="checkbox" name="kart" ${o.payments.kart ? "checked" : ""}> Kapıda kart</label></div>
        <label class="field" style="max-width:280px"><span>Telefon başına en fazla aktif sipariş</span><input name="maxActiveOrdersPerPhone" inputmode="numeric" value="${val(o.maxActiveOrdersPerPhone)}"></label>
      </div>`,
    after: (f) => f.enabled.addEventListener("change", () => {
      $("#oEnBox").classList.toggle("off", !f.enabled.checked);
      $("#oEnTitle").textContent = f.enabled.checked ? "Online sipariş alınıyor" : "Sipariş alımı durduruldu (kaydedince)";
    }),
    collect: (f) => {
      if (!f.nakit.checked && !f.kart.checked) throw new Error("En az bir ödeme yöntemi açık olmalı.");
      return { ordering: {
        enabled: f.enabled.checked, pausedMessage: f.pausedMessage.value.trim(),
        minOrder: moneyOrNull(f.minOrder.value, "Minimum sipariş") ?? 0, deliveryFee: moneyOrNull(f.deliveryFee.value, "Teslimat ücreti") ?? 0,
        freeDeliveryOver: moneyOrNull(f.freeDeliveryOver.value, "Ücretsiz teslimat eşiği"), etaMinutes: intOrNull(f.etaMinutes.value, "Tahmini süre", 5, 600) ?? 30,
        pickupEnabled: f.pickupEnabled.checked, allowPreorder: f.allowPreorder.checked, payments: { nakit: f.nakit.checked, kart: f.kart.checked },
        maxActiveOrdersPerPhone: intOrNull(f.maxActiveOrdersPerPhone.value, "Aktif sipariş sınırı", 1, 50) ?? 3,
      } };
    },
  });
}

// ---------- Bölgeler (düzenlenebilir liste) ----------
let zsel = new Set();
function zonesForm(body, s) {
  zsel = new Set();
  let rows = s.zones.map((z) => ({ ...z, key: `z${z.id}` }));
  let n = 0;
  const general = s.ordering;
  const f = sectionCard(body, {
    title: "Teslimat bölgeleri", desc: `Boş bırakılan ücret/minimum/süre için genel değer geçerlidir (ücret ${tl(general.deliveryFee)}, minimum ${tl(general.minOrder)}, ${general.etaMinutes} dk). Pasif bölge sitede seçilemez.`,
    inner: `<div class="edit-rows" id="zRows"></div><div class="row-flex mt"><button type="button" class="btn btn-sm" id="zAdd">${icon("plus", "i-sm")} Bölge ekle</button></div>`,
    after: (form) => {
      const draw = () => {
        $("#zRows").innerHTML = `<div class="zone-row head"><span></span><span>Bölge adı</span><span>Ücret (₺)</span><span>Minimum (₺)</span><span>Süre (dk)</span><span>Aktif</span><span></span></div>`
          + rows.map((z) => `<div class="zone-row" data-key="${z.key}">
            <label class="cb-cell"><input type="checkbox" class="cb" data-zsel="${z.key}" ${zsel.has(z.key) ? "checked" : ""} aria-label="${val(z.name)} seç"></label>
            <label class="field z-name"><span class="sr-only">Bölge adı</span><input name="zn_${z.key}" maxlength="80" value="${val(z.name)}" placeholder="Bölge adı"></label>
            <label class="field z-fee"><span class="zl">Ücret (₺)</span><input name="zf_${z.key}" inputmode="decimal" value="${val(numTr(z.fee))}" placeholder="Genel: ${val(numTr(general.deliveryFee))}"></label>
            <label class="field z-min"><span class="zl">Minimum (₺)</span><input name="zm_${z.key}" inputmode="decimal" value="${val(numTr(z.minOrder))}" placeholder="Genel: ${val(numTr(general.minOrder))}"></label>
            <label class="field z-eta"><span class="zl">Süre (dk)</span><input name="ze_${z.key}" inputmode="numeric" value="${val(z.etaMinutes)}" placeholder="Genel: ${general.etaMinutes}"></label>
            <label class="switch z-act"><input type="checkbox" name="za_${z.key}" ${z.active !== false ? "checked" : ""} aria-label="Aktif"><span class="only-phone">Aktif</span></label>
            <button type="button" class="icon-btn sm danger z-del" data-zdel="${z.key}" aria-label="Sil">${icon("trash")}</button>
          </div>`).join("");
        bulk();
      };
      const sync = () => { rows = rows.map((z) => ({ ...z, name: form[`zn_${z.key}`].value, fee: form[`zf_${z.key}`].value, minOrder: form[`zm_${z.key}`].value, etaMinutes: form[`ze_${z.key}`].value, active: form[`za_${z.key}`].checked })); };
      const bulk = () => showBulk({
        count: zsel.size, canSelectAll: zsel.size < rows.length, allCount: rows.length,
        onClear: () => { zsel.clear(); sync(); draw(); },
        onSelectAll: () => { rows.forEach((z) => zsel.add(z.key)); sync(); draw(); },
        actions: [{ id: "delete", label: "Sil", icon: "trash", cls: "btn-danger" }],
        onAction: () => removeZones([...zsel]),
      });
      const removeZones = async (keys) => {
        sync();
        const wasDirty = !!(tracker && tracker.changed());
        const saved = rows.filter((z) => keys.includes(z.key) && z.id);
        if (!(await confirmDialog({ title: `${keys.length} bölge silinsin mi?`, message: "Bu bölgeler sitede seçilemez olur. Eski siparişler bölge adını kendileri sakladığı için etkilenmez.", okLabel: "Sil", danger: true }))) return;
        rows = rows.filter((z) => !keys.includes(z.key) || z.id); // kaydedilmemiş yeni satırlar yerelde silinir
        if (saved.length) {
          try {
            const r = await api("/api/admin/settings/zones/bulk-delete", { method: "POST", body: { ids: saved.map((z) => z.id) } });
            bulkResult(r, "bölge silindi");
            state.settings.zones = state.settings.zones.filter((z) => !saved.some((x) => x.id === z.id));
            rows = rows.filter((z) => !saved.some((x) => x.key === z.key));
          } catch (e) { toastErr(e); }
        } else toast(`${keys.length} bölge kaldırıldı (kaydedilmemişti).`);
        keys.forEach((k) => zsel.delete(k));
        draw();
        if (tracker) { if (saved.length && !wasDirty) tracker.reset(); else tracker.check(); }
      };
      form.addEventListener("change", (e) => {
        const k = e.target.dataset.zsel;
        if (k) { if (e.target.checked) zsel.add(k); else zsel.delete(k); bulk(); }
      });
      form.addEventListener("click", (e) => {
        const d = e.target.closest("[data-zdel]");
        if (d) removeZones([d.dataset.zdel]);
      });
      $("#zAdd").addEventListener("click", () => {
        sync();
        rows.push({ key: `n${++n}`, name: "", fee: null, minOrder: null, etaMinutes: null, active: true });
        draw();
        const last = $$("#zRows .zone-row:last-child input[name^=zn_]")[0];
        if (last) last.focus();
        tracker && tracker.check();
      });
      draw();
    },
    collect: (form) => ({ zones: [...$$("#zRows .zone-row[data-key]")].map((row) => {
      const k = row.dataset.key;
      const z = rows.find((x) => x.key === k) || {};
      const name = form[`zn_${k}`].value.trim();
      if (!name) throw new Error("Bölge adı boş olamaz.");
      return { ...(z.id ? { id: z.id, slug: z.slug } : {}), name, fee: moneyOrNull(form[`zf_${k}`].value, `"${name}" ücreti`), minOrder: moneyOrNull(form[`zm_${k}`].value, `"${name}" minimumu`), etaMinutes: intOrNull(form[`ze_${k}`].value, `"${name}" süresi`, 5, 600), active: form[`za_${k}`].checked };
    }) }),
  });
  void f;
}

// ---------- SSS ----------
let fsel = new Set();
function faqForm(body, s) {
  fsel = new Set();
  let items = s.faq.map((x) => ({ ...x, key: `f${x.id}` }));
  let n = 0;
  sectionCard(body, {
    title: "Sık sorulan sorular", desc: "Mağaza ana sayfasında gösterilir. Okları kullanarak sıralayın.",
    inner: `<div id="fRows"></div><div class="row-flex mt"><button type="button" class="btn btn-sm" id="fAdd">${icon("plus", "i-sm")} Soru ekle</button></div>`,
    after: (form) => {
      const sync = () => { items = items.map((x) => ({ ...x, q: form[`fq_${x.key}`].value, a: form[`fa_${x.key}`].value })); };
      const draw = () => {
        $("#fRows").innerHTML = items.length ? items.map((x, i) => `<div class="faq-item" data-key="${x.key}">
          <div class="move"><input type="checkbox" class="cb" data-fsel="${x.key}" ${fsel.has(x.key) ? "checked" : ""} aria-label="Soru ${i + 1} seç" style="margin:8px auto">
            <button type="button" class="icon-btn sm" data-fmove="${x.key}" data-d="-1" ${i === 0 ? "disabled" : ""} aria-label="Yukarı">${icon("up")}</button>
            <button type="button" class="icon-btn sm" data-fmove="${x.key}" data-d="1" ${i === items.length - 1 ? "disabled" : ""} aria-label="Aşağı">${icon("down")}</button></div>
          <div class="stack" style="gap:6px"><label class="field"><span>Soru ${i + 1}</span><input name="fq_${x.key}" maxlength="200" value="${val(x.q)}"></label>
            <label class="field"><span class="sr-only">Cevap</span><textarea name="fa_${x.key}" maxlength="2000" rows="2" placeholder="Cevap">${val(x.a)}</textarea></label></div>
          <button type="button" class="icon-btn sm danger" data-fdel="${x.key}" aria-label="Sil">${icon("trash")}</button></div>`).join("") : `<div class="empty small">Soru yok.</div>`;
        bulk();
      };
      const bulk = () => showBulk({
        count: fsel.size, canSelectAll: fsel.size < items.length, allCount: items.length,
        onClear: () => { fsel.clear(); sync(); draw(); },
        onSelectAll: () => { items.forEach((x) => fsel.add(x.key)); sync(); draw(); },
        actions: [{ id: "delete", label: "Sil", icon: "trash", cls: "btn-danger" }],
        onAction: () => remove([...fsel]),
      });
      const remove = async (keys) => {
        sync();
        const wasDirty = !!(tracker && tracker.changed());
        if (!(await confirmDialog({ title: `${keys.length} soru silinsin mi?`, message: "Seçilen sorular mağazadan kaldırılır.", okLabel: "Sil", danger: true }))) return;
        const saved = items.filter((x) => keys.includes(x.key) && x.id);
        if (saved.length) {
          try {
            const r = await api("/api/admin/settings/faq/bulk-delete", { method: "POST", body: { ids: saved.map((x) => x.id) } });
            bulkResult(r, "soru silindi");
            state.settings.faq = state.settings.faq.filter((x) => !saved.some((y) => y.id === x.id));
          } catch (e) { toastErr(e); return; }
        } else toast(`${keys.length} soru kaldırıldı (kaydedilmemişti).`);
        items = items.filter((x) => !keys.includes(x.key));
        keys.forEach((k) => fsel.delete(k));
        draw();
        if (tracker) { if (saved.length && !wasDirty) tracker.reset(); else tracker.check(); }
      };
      form.addEventListener("change", (e) => { const k = e.target.dataset.fsel; if (k) { if (e.target.checked) fsel.add(k); else fsel.delete(k); bulk(); } });
      form.addEventListener("click", (e) => {
        const del = e.target.closest("[data-fdel]");
        if (del) return remove([del.dataset.fdel]);
        const mv = e.target.closest("[data-fmove]");
        if (mv) {
          sync();
          const i = items.findIndex((x) => x.key === mv.dataset.fmove);
          const j = i + Number(mv.dataset.d);
          [items[i], items[j]] = [items[j], items[i]];
          draw();
          tracker && tracker.check();
        }
      });
      $("#fAdd").addEventListener("click", () => { sync(); items.push({ key: `n${++n}`, q: "", a: "" }); draw(); const qs = $$("#fRows input[name^=fq_]"); if (qs.length) qs[qs.length - 1].focus(); tracker && tracker.check(); });
      draw();
    },
    collect: (form) => ({ faq: items.map((x) => {
      const q = form[`fq_${x.key}`].value.trim(), a = form[`fa_${x.key}`].value.trim();
      if (!q || !a) throw new Error("Her sorunun hem sorusu hem cevabı dolu olmalı.");
      return { ...(x.id ? { id: x.id } : {}), q, a };
    }) }),
  });
}

// ---------- Yasal ----------
const LEGAL = [["kvkk", "KVKK aydınlatma metni", "/kvkk"], ["mesafeliSatis", "Mesafeli satış sözleşmesi", "/mesafeli-satis"], ["iade", "İade ve değişim koşulları", "/iade-kosullari"], ["cerez", "Çerez politikası", "/cerez-politikasi"]];
function legalForm(body, s) {
  const l = s.legal;
  sectionCard(body, {
    title: "Yasal bilgiler ve metinler", desc: "Şirket bilgileri yasal metinlerdeki yer tutuculara yazılır; boş olanlar sitede “[…]” görünür.",
    inner: `<div class="grid-2">
        <label class="field span-2"><span>Ticari unvan</span><input name="companyTitle" maxlength="200" value="${val(l.companyTitle)}"></label>
        <label class="field"><span>Vergi dairesi</span><input name="taxOffice" maxlength="100" value="${val(l.taxOffice)}"></label>
        <label class="field"><span>Vergi no</span><input name="taxNo" maxlength="20" value="${val(l.taxNo)}"></label>
        <label class="field"><span>MERSİS no</span><input name="mersis" maxlength="30" value="${val(l.mersis)}"></label>
        <label class="field"><span>KEP adresi</span><input name="kep" maxlength="120" value="${val(l.kep)}"></label>
      </div>
      <div class="form-sec"><h4>Metinler</h4>
        <div class="callout">${icon("info")}<div>Boş bırakılan metin için hazır şablon kullanılır. Biçim: boş satır = yeni paragraf, <code>## </code> ile başlayan satır = ara başlık, <code>- </code> ile başlayan satır = madde. Yer tutucular: <code>{{unvan}}</code>, <code>{{magaza}}</code>, <code>{{adres}}</code>, <code>{{telefon}}</code>, <code>{{eposta}}</code>, <code>{{vergiDairesi}}</code>, <code>{{vergiNo}}</code>, <code>{{mersis}}</code>, <code>{{kep}}</code>, <code>{{websitesi}}</code>.</div></div>
        ${LEGAL.map(([k, label, href]) => `<div class="field"><div class="row-flex"><span class="field-label grow">${label}</span><a class="btn btn-sm btn-ghost" href="${href}" target="_blank" rel="noopener">${icon("external", "i-sm")} Sitede gör</a><button type="button" class="btn btn-sm" data-tpl="${k}">Şablonu yükle</button></div>
          <textarea class="input legal-text" name="t_${k}" maxlength="30000" rows="8" placeholder="Boş: hazır şablon kullanılır">${val(l.texts[k])}</textarea></div>`).join("")}
      </div>`,
    after: (f) => f.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-tpl]");
      if (!b) return;
      const ta = f[`t_${b.dataset.tpl}`];
      if (ta.value.trim() && !(await confirmDialog({ title: "Şablon yüklensin mi?", message: "Alandaki metin şablonla değiştirilecek (kaydedene kadar sitede değişmez).", okLabel: "Yükle" }))) return;
      try {
        const t = await api("/api/admin/settings/legal-templates");
        ta.value = t[b.dataset.tpl] || "";
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (er) { toastErr(er); }
    }),
    collect: (f) => ({ legal: {
      ...Object.fromEntries(["companyTitle", "taxOffice", "taxNo", "mersis", "kep"].map((k) => [k, f[k].value.trim()])),
      texts: Object.fromEntries(LEGAL.map(([k]) => [k, f[`t_${k}`].value.trim()])),
    } }),
  });
}

// ---------- Bildirim ----------
function notifyForm(body, s) {
  const n = s.notify;
  sectionCard(body, {
    title: "Bildirimler", desc: "Yeni sipariş ve müşteri iptallerinde Telegram mesajı gönderilir (isteğe bağlı).",
    inner: `<div class="grid-2">
        <label class="field"><span>Telegram bot anahtarı</span><input name="telegramBotToken" maxlength="100" value="${val(n.telegramBotToken)}" placeholder="123456:ABC…" autocomplete="off" spellcheck="false"></label>
        <label class="field"><span>Telegram sohbet kimliği</span><input name="telegramChatId" maxlength="60" value="${val(n.telegramChatId)}" placeholder="-100… ya da @kanal" autocomplete="off"></label>
      </div>
      <div class="row-flex mt"><button type="button" class="btn btn-sm" id="tgTest">${icon("message", "i-sm")} Deneme mesajı gönder</button><span class="small muted">Kaydetmeden de deneyebilirsiniz.</span></div>
      <p class="hint">Kurulum: Telegram'da @BotFather ile bot oluşturun, anahtarı buraya yapıştırın; botu gruba ekleyip grubun kimliğini girin.</p>
      <div class="form-sec"><h4>Panel sesi</h4>
        <label class="switch"><input type="checkbox" name="sound" ${n.sound ? "checked" : ""}> Yeni siparişte sesli uyarı (varsayılan tercih)</label>
        <p class="hint" style="margin:0">Her cihaz kendi tercihini üst çubuktaki hoparlör düğmesiyle de değiştirebilir. Bu cihazda şu an: <b>${readLS("panelSound") === "0" ? "kapalı" : "açık"}</b>. Tarayıcı bildirimi izni: <b>${"Notification" in window ? { granted: "verildi", denied: "reddedildi", default: "sorulmadı" }[Notification.permission] : "desteklenmiyor"}</b>.</p>
      </div>`,
    after: (f) => $("#tgTest").addEventListener("click", async (e) => {
      const b = e.currentTarget;
      b.disabled = true; b.classList.add("is-busy");
      try {
        await api("/api/admin/settings/telegram-test", { method: "POST", body: { telegramBotToken: f.telegramBotToken.value.trim(), telegramChatId: f.telegramChatId.value.trim() } });
        toast("Deneme mesajı gönderildi. Telegram'ı kontrol edin.");
      } catch (er) { toastErr(er); } finally { b.disabled = false; b.classList.remove("is-busy"); }
    }),
    collect: (f) => ({ notify: { telegramBotToken: f.telegramBotToken.value.trim(), telegramChatId: f.telegramChatId.value.trim(), sound: f.sound.checked } }),
  });
}

// ---------- Kullanıcılar ----------
async function usersView(body) {
  body.innerHTML = `<div class="card"><div class="card-head"><div><h3>Kullanıcılar</h3><p class="small muted" style="margin:2px 0 0"><b>Personel</b> siparişleri yönetir, ürünleri tükendi/satışta yapar ve stok girer. <b>Yönetici</b> her şeyi yapar.</p></div>
    <button type="button" class="btn btn-primary" id="uNew">${icon("plus")} Kullanıcı ekle</button></div><div id="uList"><div class="skeleton" style="padding:10px"><div></div><div></div></div></div></div>`;
  const draw = async () => {
    const users = await api("/api/admin/users");
    $("#uList").innerHTML = users.map((u) => `<div class="lrow ${u.active ? "" : "is-muted"}" style="padding-left:16px">
      <div class="lrow-main"><div class="lrow-title">${esc(u.name || u.username)} <span class="badge ${u.role === "yonetici" ? "b-navy" : "b-muted"}">${u.role === "yonetici" ? "Yönetici" : "Personel"}</span>${u.active ? "" : ' <span class="badge b-danger">Pasif</span>'}${u.id === state.user.id ? ' <span class="badge b-outline">Siz</span>' : ""}</div>
        <div class="lrow-sub"><span>@${esc(u.username)}</span><span>Ekleniş: ${fmtDateTime(u.createdAt)}</span></div></div>
      <div class="lrow-acts"><button type="button" class="icon-btn sm" data-uedit="${u.id}" aria-label="Düzenle">${icon("edit")}</button>${u.id !== state.user.id ? `<button type="button" class="icon-btn sm danger" data-udel="${u.id}" aria-label="Sil">${icon("trash")}</button>` : ""}</div></div>`).join("");
    $("#uList").onclick = async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const u = users.find((x) => x.id === Number(b.dataset.uedit || b.dataset.udel));
      if (b.dataset.uedit) userDialog(u, draw);
      if (b.dataset.udel) {
        if (!(await confirmDialog({ title: `${u.username} silinsin mi?`, message: "Kullanıcı ve açık oturumları silinir.", okLabel: "Sil", danger: true }))) return;
        try { await api(`/api/admin/users/${u.id}`, { method: "DELETE" }); toast("Kullanıcı silindi."); draw(); } catch (er) { toastErr(er); }
      }
    };
  };
  $("#uNew").addEventListener("click", () => userDialog(null, draw));
  await draw().catch(toastErr);
}
function userDialog(u, done) {
  openModal({
    title: u ? `Kullanıcı: ${u.username}` : "Yeni kullanıcı", size: "narrow", submitLabel: u ? "Kaydet" : "Ekle",
    body: `<label class="field"><span>Kullanıcı adı</span><input name="username" maxlength="30" value="${val(u ? u.username : "")}" ${u ? "disabled" : "required autofocus"} autocapitalize="none" spellcheck="false" autocomplete="off"><span class="hint">Küçük harf, rakam, nokta, - ve _ (3–30)</span></label>
      <label class="field"><span>Ad</span><input name="name" maxlength="60" value="${val(u ? u.name : "")}"></label>
      <label class="field"><span>Rol</span><select name="role"><option value="personel" ${u && u.role === "personel" ? "selected" : ""}>Personel</option><option value="yonetici" ${u && u.role === "yonetici" ? "selected" : ""}>Yönetici</option></select></label>
      <label class="field"><span>${u ? "Yeni şifre (değiştirmek için)" : "Şifre"}</span><input name="password" type="password" minlength="8" autocomplete="new-password" ${u ? 'placeholder="Boş bırakılırsa değişmez"' : "required"}><span class="hint">En az 8 karakter.${u ? " Değişirse kullanıcının açık oturumları kapanır." : ""}</span></label>
      <label class="switch"><input type="checkbox" name="active" ${!u || u.active ? "checked" : ""}> Aktif (giriş yapabilir)</label>`,
    onSubmit: async (f) => {
      const body = { name: f.name.value.trim(), role: f.role.value, active: f.active.checked };
      if (f.password.value) { if (f.password.value.length < 8) throw new Error("Şifre en az 8 karakter olmalı."); body.password = f.password.value; }
      if (u) await api(`/api/admin/users/${u.id}`, { method: "PATCH", body });
      else { if (!body.password) throw new Error("Şifre girin."); await api("/api/admin/users", { method: "POST", body: { ...body, username: f.username.value.trim() } }); }
      toast(u ? "Kullanıcı güncellendi." : "Kullanıcı eklendi.");
      done();
    },
  });
}

// ---------- Yedek ----------
async function backupView(body) {
  body.innerHTML = `<div class="card"><div class="card-head"><h3>Yedek al</h3></div><div class="card-body stack">
      <p style="margin:0">Ürünler, kategoriler, siparişler, ayarlar ve kullanıcıların tamamı tek bir <b>.json</b> dosyası olarak indirilir. Düzenli olarak indirip güvenli bir yerde saklayın.</p>
      <div><button type="button" class="btn btn-primary" id="bkDown">${icon("download")} Yedeği indir</button></div></div></div>
    <div class="card mt"><div class="card-head"><h3>Yedekten geri yükle</h3></div><div class="card-body stack">
      <div class="callout danger">${icon("alert")}<div><b>Mevcut verinin tamamı seçtiğiniz yedekle değiştirilir.</b> Geri yüklemeden önce sunucuda otomatik yedek alınır. İşlemden sonra herkesin yeniden giriş yapması gerekir.</div></div>
      <label class="field"><span>Yedek dosyası (.json)</span><input type="file" id="bkFile" accept=".json,application/json"></label>
      <div><button type="button" class="btn btn-danger" id="bkRestore" disabled>${icon("upload")} Geri yükle</button></div></div></div>
    <div class="card mt"><div class="card-head"><h3>Sunucudaki otomatik yedekler</h3><span class="small muted">Günlük (son 14 gün) ve işlem öncesi yedekler</span></div><div id="bkList"><div class="skeleton" style="padding:10px"><div></div></div></div></div>`;
  $("#bkDown").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.classList.add("is-busy");
    try { const n = await download("/api/admin/backup", "ulusoy-market-yedek.json"); toast(`${n} indirildi.`); } catch (er) { toastErr(er); } finally { b.disabled = false; b.classList.remove("is-busy"); }
  });
  let parsed = null;
  $("#bkFile").addEventListener("change", async (e) => {
    parsed = null;
    $("#bkRestore").disabled = true;
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const d = data && data.data && Array.isArray(data.data.products) ? data.data : data;
      if (!d || !Array.isArray(d.products) || !Array.isArray(d.categories)) throw new Error();
      parsed = { text, counts: { products: d.products.length, categories: d.categories.length, orders: (d.orders || []).length } };
      $("#bkRestore").disabled = false;
      toast(`Yedek okundu: ${parsed.counts.products} ürün, ${parsed.counts.categories} kategori, ${parsed.counts.orders} sipariş.`, "info");
    } catch { toast("Yedek dosyası tanınmadı. Panelden indirilen .json yedeği seçin.", "err"); }
  });
  $("#bkRestore").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    if (!parsed) return;
    const ok = await confirmDialog({ title: "Yedekten geri yüklensin mi?", danger: true, okLabel: "Geri yükle",
      message: `Mevcut veri, ${parsed.counts.products} ürün, ${parsed.counts.categories} kategori ve ${parsed.counts.orders} sipariş içeren yedekle değiştirilecek.`, details: "Bu işlemden sonra yeniden giriş yapmanız gerekir." });
    if (!ok) return;
    b.disabled = true; b.classList.add("is-busy");
    try {
      const r = await api("/api/admin/restore", { method: "POST", raw: parsed.text, contentType: "application/json" });
      toast(`Geri yüklendi (${r.counts.products} ürün, ${r.counts.orders} sipariş). Önceki veri ${r.backup} olarak saklandı.`, "ok", { timeout: 12000 });
      clearDirty();
      setTimeout(() => { state.token = "x"; document.dispatchEvent(new CustomEvent("forcelogin", { detail: "Yedek geri yüklendi. Lütfen yeniden giriş yapın." })); }, 400);
    } catch (er) { toastErr(er); b.disabled = false; b.classList.remove("is-busy"); }
  });
  try {
    const list = await api("/api/admin/backups");
    $("#bkList").innerHTML = list.length ? list.map((x) => `<div class="lrow" style="padding-left:16px"><div class="lrow-main"><div class="lrow-title" style="font-family:var(--mono);font-size:13.5px;font-weight:600">${esc(x.name)}</div><div class="lrow-sub"><span>${fmtDateTime(x.createdAt)}</span><span>${(x.size / 1024).toFixed(0)} KB</span></div></div>
      <button type="button" class="btn btn-sm" data-bk="${esc(x.name)}">${icon("download", "i-sm")} İndir</button></div>`).join("") : `<div class="empty small">Henüz otomatik yedek yok. İlk değişiklikle birlikte günlük yedek oluşur.</div>`;
    $("#bkList").onclick = async (e) => {
      const b = e.target.closest("[data-bk]");
      if (!b) return;
      try { await download(`/api/admin/backups/${encodeURIComponent(b.dataset.bk)}`, b.dataset.bk); } catch (er) { toastErr(er); }
    };
  } catch (er) { toastErr(er); }
}

// ======================= HESABIM =======================
export const accountPage = {
  id: "hesap", title: "Hesabım", short: "Hesabım", icon: "user",
  render(el) {
    const u = state.user;
    el.innerHTML = `<div class="page-narrow stack">
      <section class="card"><div class="card-body row-flex" style="gap:14px">
        <div class="thumb" style="width:52px;height:52px;border-radius:50%;background:var(--navy);color:#fff;font-weight:800;font-size:20px">${esc((u.name || u.username).slice(0, 1).toLocaleUpperCase("tr"))}</div>
        <div class="grow"><b style="font-size:17px">${esc(u.name || u.username)}</b><div class="muted small">@${esc(u.username)} · ${u.role === "yonetici" ? "Yönetici" : "Personel"}</div></div>
        <button type="button" class="btn" data-action="logout">${icon("logout")} Çıkış yap</button>
      </div></section>
      <section class="card"><div class="card-head"><h3>Bu cihaz</h3></div><div class="card-body stack">
        <label class="switch"><input type="checkbox" id="acSound" ${readLS("panelSound") === "0" ? "" : "checked"}> Yeni siparişte sesli uyarı</label>
        <div class="row-flex"><button type="button" class="btn btn-sm" id="acTest">${icon("volume", "i-sm")} Sesi dene</button>
          ${"Notification" in window ? (Notification.permission === "granted" ? `<span class="badge b-ok">Tarayıcı bildirimleri açık</span>` : Notification.permission === "denied" ? `<span class="badge b-danger">Bildirim izni reddedilmiş (tarayıcı ayarlarından açın)</span>` : `<button type="button" class="btn btn-sm" id="acNotify">${icon("bell", "i-sm")} Tarayıcı bildirimlerine izin ver</button>`) : `<span class="muted small">Bu tarayıcı bildirim desteklemiyor.</span>`}</div>
        <p class="hint" style="margin:0">Panel açık kaldıkça yeni siparişler her 12 saniyede bir kontrol edilir. Sekme başlığında okunmamış sipariş sayısı görünür.</p>
      </div></section>
      <form class="card" id="pwForm" novalidate><div class="card-head"><h3>Şifre değiştir</h3></div><div class="card-body stack">
        <label class="field"><span>Mevcut şifre</span><input type="password" name="currentPassword" autocomplete="current-password" required></label>
        <label class="field"><span>Yeni şifre</span><input type="password" name="newPassword" autocomplete="new-password" minlength="8" required><span class="hint">En az 8 karakter. Diğer cihazlardaki oturumlarınız kapanır.</span></label>
        <label class="field"><span>Yeni şifre (tekrar)</span><input type="password" name="again" autocomplete="new-password" required></label>
      </div><div class="card-foot"><p class="form-error grow" id="pwErr" role="alert"></p><button class="btn btn-primary" id="pwSave">Şifreyi değiştir</button></div></form>
    </div>`;
    $("#acSound").addEventListener("change", (e) => { audio.unlock(); audio.enabled = e.target.checked; toast(e.target.checked ? "Yeni sipariş sesi açık." : "Yeni sipariş sesi kapatıldı.", e.target.checked ? "ok" : "warn"); });
    $("#acTest").addEventListener("click", () => { audio.unlock(); setTimeout(() => { if (!audio.enabled) toast("Ses kapalı. Önce sesli uyarıyı açın.", "warn"); else if (!audio.chime()) toast("Tarayıcı sesi engelledi. Sayfaya bir kez dokunup tekrar deneyin.", "warn"); }, 60); });
    const nb = $("#acNotify");
    if (nb) nb.addEventListener("click", () => { $("#notifyBtn").click(); setTimeout(() => accountPage.render(el), 1500); });
    $("#pwForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      $("#pwErr").textContent = "";
      if (f.newPassword.value.length < 8) { $("#pwErr").textContent = "Yeni şifre en az 8 karakter olmalı."; return; }
      if (f.newPassword.value !== f.again.value) { $("#pwErr").textContent = "Yeni şifreler aynı değil."; return; }
      const b = $("#pwSave");
      b.disabled = true; b.classList.add("is-busy");
      try {
        await api("/api/admin/password", { method: "POST", body: { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value } });
        f.reset();
        document.dispatchEvent(new CustomEvent("passwordchanged"));
        toast("Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.");
      } catch (er) { $("#pwErr").textContent = er.message; } finally { b.disabled = false; b.classList.remove("is-busy"); }
    });
  },
};
void confirmLeave; void nav; void openModal;
