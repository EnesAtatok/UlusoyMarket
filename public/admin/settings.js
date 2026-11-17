// Ayarlar (yönetici): mağaza, saatler, sipariş, bölgeler, SSS, yasal, bildirim, kullanıcılar, yedek.
// Hesabım (herkes): şifre değiştirme, bu cihazın ses/bildirim tercihi, çıkış.
import {
  state, $, $$, esc, icon, api, tl, toast, toastErr, isAdmin, bulkResult, openModal, confirmDialog, showBulk, hideBulk,
  loadSettings, parseNum, numTr, trackForm, confirmLeave, clearDirty, isDirty, download, fmtDateTime, fmtDate, nav, readLS, writeLS,
} from "./core.js";
import { audio } from "./orders.js";
import { WARN_INFO, LEVEL_LABEL, loadSecurity } from "./security.js";

// [anahtar, başlık, simge, grup]
const SECTIONS = [
  ["magaza", "Mağaza bilgileri", "store", "Mağaza"],
  ["saatler", "Çalışma saatleri", "clock", "Mağaza"],
  ["siparis", "Sipariş ayarları", "orders", "Mağaza"],
  ["bolgeler", "Teslimat bölgeleri", "pin", "Mağaza"],
  ["sss", "Sık sorulan sorular", "info", "Mağaza"],
  ["guvenlik", "Güvenlik ve gizlilik", "shield", "Gizlilik ve yasal"],
  ["isletme", "İşletme bilgileri", "building", "Gizlilik ve yasal"],
  ["yasal", "Yasal belgeler", "file", "Gizlilik ve yasal"],
  ["onaylar", "Onay kutuları", "check-square", "Gizlilik ve yasal"],
  ["yapilacaklar", "Site dışında yapılacaklar", "list-check", "Gizlilik ve yasal"],
  ["bildirim", "Bildirimler", "bell", "Sistem"],
  ["kullanicilar", "Kullanıcılar", "users", "Sistem"],
  ["yedek", "Yedekleme", "download", "Sistem"],
  ["denetim", "Denetim kaydı", "history", "Sistem"],
];
const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
let section = "magaza";
let tracker = null;

function navHtml() {
  let grp = "";
  return SECTIONS.map(([k, l, ic, g]) => {
    const head = g !== grp ? `<div class="grp" role="presentation">${esc(g)}</div>` : "";
    grp = g;
    return `${head}<a href="/panel/ayarlar/${k}" data-link ${k === section ? 'aria-current="page"' : ""} data-sec="${k}">${icon(ic, "i-sm")}<span>${l}</span></a>`;
  }).join("");
}
// Bölüm adının yanında uyarı noktası (güvenlik durumundan)
const SECTION_WARN = { guvenlik: ["HTTPS_YOK", "SIFRESIZ_DEPO", "VARSAYILAN_SIFRE", "PUBLIC_URL_YOK", "VEKIL_AYARI"], isletme: ["ISLETME_BILGISI_EKSIK", "ETBIS_YOK"], onaylar: ["ONAY_YOK"] };
function markNavWarnings() {
  const w = (state.security && state.security.warnings) || [];
  $$("#sNav a").forEach((a) => {
    const codes = SECTION_WARN[a.dataset.sec] || [];
    const hit = w.filter((x) => codes.includes(x.code) && x.level !== "bilgi");
    let dot = a.querySelector(".warn-dot");
    if (!hit.length) { if (dot) dot.remove(); return; }
    if (!dot) { dot = document.createElement("span"); dot.className = "warn-dot"; a.append(dot); }
    dot.classList.toggle("kritik", hit.some((x) => x.level === "kritik"));
    dot.title = hit.map((x) => (WARN_INFO[x.code] || {}).title || x.message).join(" · ");
  });
}
document.addEventListener("securityupdated", () => {
  markNavWarnings();
  if (nav.current && nav.current() === settingsPage && ["guvenlik", "isletme", "yapilacaklar"].includes(section) && !isDirty(`settings-${section}`)) {
    const st = $("#secStatus");
    if (st && section === "guvenlik") renderSecurityStatus(st);
    const m = $("#bizMissing");
    if (m) m.innerHTML = missingHtml();
  }
});

export const settingsPage = {
  id: "ayarlar", title: "Ayarlar", icon: "settings", admin: true,
  async render(el, sub) {
    section = SECTIONS.some(([k]) => k === sub[0]) ? sub[0] : "magaza";
    el.innerHTML = `<div class="page settings-layout">
      <nav class="settings-nav" id="sNav" aria-label="Ayar bölümleri">${navHtml()}</nav>
      <div id="sBody"><div class="skeleton">${"<div></div>".repeat(4)}</div></div>
    </div>`;
    await loadSettings(true);
    renderSection();
    markNavWarnings();
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
  if (!(nav.current && nav.current() === settingsPage) || !$("#sBody") || ["kullanicilar", "yedek", "denetim", "yasal"].includes(section)) return;
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
  const fn = {
    magaza: storeForm, saatler: hoursForm, siparis: orderingForm, bolgeler: zonesForm, sss: faqForm,
    guvenlik: securityView, isletme: businessForm, yasal: legalDocsView, onaylar: consentsForm, yapilacaklar: todoView,
    bildirim: notifyForm, kullanicilar: usersView, yedek: backupView, denetim: auditView,
  }[section];
  body.innerHTML = "";
  fn(body, s);
}

/** Ortak bölüm kartı: form + Kaydet; collect() → PATCH gövdesi */
function sectionCard(body, { title, desc, inner, collect, after, saveLabel = "Kaydet", saved }) {
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
      if (saved) saved(r, patch); else toast(`${title} kaydedildi.`);
      loadSecurity(); // işletme bilgisi, gizlilik vb. değişince uyarılar tazelenir
      document.dispatchEvent(new CustomEvent("storerefresh")); // fişteki satıcı bilgileri için
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

// ======================= GİZLİLİK VE YASAL =======================
const dayHint = (d) => {
  const n = Number(d);
  if (!d || !Number.isFinite(n) || n <= 0) return "Kapalı";
  const y = n / 365;
  return `${n} gün ≈ ${y >= 1 ? `${numTr(Math.round(y * 10) / 10, 1)} yıl` : `${Math.round(n / 30)} ay`}`;
};

// ---------- Güvenlik ve gizlilik ----------
function securityView(body, s) {
  body.innerHTML = `<div class="stack">
    <section class="card" aria-labelledby="secH">
      <div class="card-head"><div><h3 id="secH">Güvenlik durumu</h3><p class="small muted" style="margin:2px 0 0">Sunucunun ve ayarların şu anki durumu; her uyarının altında ne yapılacağı yazar.</p></div>
        <button type="button" class="btn btn-sm" id="secReload">${icon("refresh", "i-sm")} Yenile</button></div>
      <div id="secStatus"><div class="skeleton" style="padding:12px"><div></div><div></div></div></div>
    </section>
    <div id="secForm"></div>
  </div>`;
  $("#secReload").addEventListener("click", async () => { await loadSecurity(); toast("Güvenlik durumu yenilendi."); });
  if (state.security) renderSecurityStatus($("#secStatus"));
  loadSecurity(); // her açılışta güncel durum (gelince "securityupdated" ile yeniden çizilir)
  privacyForm($("#secForm"), s);
}

function renderSecurityStatus(el) {
  const sec = state.security;
  if (!sec) { el.innerHTML = `<div class="empty small">Güvenlik durumu alınamadı.</div>`; return; }
  const tile = (cls, k, v, ic) => `<div class="status-tile ${cls}"><span class="k">${k}</span><span class="v">${icon(ic)}${v}</span></div>`;
  const h = sec.https;
  const tiles = [
    h.requestHttps ? tile("ok", "Bağlantı (yolda)", "HTTPS — şifreli", "lock")
      : h.local ? tile("mid", "Bağlantı (yolda)", "Yerel (localhost) — canlıda HTTPS şart", "info") : tile("bad", "Bağlantı (yolda)", "HTTP — şifresiz", "alert"),
    sec.dataKey.enabled ? tile("ok", "Veri (depoda)", "Şifreli — DATA_KEY", "lock") : tile("bad", "Veri (depoda)", "Şifresiz", "alert"),
    sec.defaultPassword.inUse ? tile("bad", "Varsayılan şifre", "Kullanımda", "alert") : tile("ok", "Varsayılan şifre", "Kullanılmıyor", "shield-check"),
    sec.legal.ok ? tile("ok", "İşletme bilgileri", "Tam", "check") : tile("mid", "İşletme bilgileri", `${sec.legal.missing.length} alan eksik`, "alert"),
    sec.etbis.ok ? tile("ok", "ETBİS", "Kayıt no girildi", "check") : tile("mid", "ETBİS", "Girilmedi", "alert"),
    tile(sec.telegram.enabled ? "ok" : "", "Telegram", sec.telegram.enabled ? "Açık · kişisel veri gitmez" : "Kapalı", "message"),
    tile("", "Anonimleştirme", dayHint(sec.privacy.retentionDays), "clock"),
    tile("", "Canlı bağlantılar", `${sec.streams.panel} panel · ${sec.streams.musteri} müşteri`, "wifi"),
  ];
  const rank = { kritik: 0, uyari: 1, bilgi: 2 };
  const list = sec.warnings.slice().sort((a, b) => (rank[a.level] ?? 3) - (rank[b.level] ?? 3));
  const users = sec.defaultPassword.users || [];
  el.innerHTML = `<div class="card-body"><div class="status-grid">${tiles.join("")}</div></div>
    ${list.length ? `<div class="sec-list" style="border-top:1px solid var(--line)">${list.map((w) => {
      const inf = WARN_INFO[w.code] || {};
      return `<div class="sec-item"><span class="lvl ${esc(w.level)}">${esc(LEVEL_LABEL[w.level] || w.level)}</span><div>
        <h5>${esc(inf.title || w.code)}</h5><p>${esc(w.message)}</p>
        ${w.code === "VARSAYILAN_SIFRE" && users.length ? `<div class="todo">Hesap: <b>${users.map(esc).join(", ")}</b></div>` : ""}
        ${inf.todo ? `<div class="todo"><b>Ne yapılmalı:</b> ${esc(inf.todo)}</div>` : ""}
        ${inf.link && inf.link !== location.pathname ? `<div class="row-flex"><a class="btn btn-sm" href="${inf.link}" data-link>${esc(inf.linkLabel)} ${icon("arrow-right", "i-sm")}</a></div>` : ""}
      </div></div>`;
    }).join("")}</div>`
    : `<div class="card-body" style="padding-top:0"><div class="callout ok">${icon("shield-check")}<div>Açık uyarı yok.</div></div></div>`}
    <div class="card-body" style="border-top:1px solid var(--line)"><p class="small muted" style="margin:0"><b>Not:</b> Bu tür bir sistemde “uçtan uca şifreleme” uygulanamaz (sunucu siparişi işlemek zorunda). Doğru hedef: yolda şifreleme (HTTPS) + depoda şifreleme (DATA_KEY) + en az veri (saklama süresi ve arşiv maskesi). Telegram bildirimlerine müşteri bilgisi yazılmaz.</p></div>`;
}

function privacyForm(el, s) {
  const p = s.privacy;
  sectionCard(el, {
    title: "Gizlilik ve saklama", desc: "Müşteri verisinin kimlere, ne kadar süre görüneceği.",
    inner: `<div class="stack" style="gap:6px">
        <label class="switch"><input type="checkbox" name="phoneLookup" ${p.phoneLookup ? "checked" : ""}> Telefonla sipariş sorgusu (başka cihazdan)</label>
        <p class="hint" style="margin:0 0 6px 52px">Kapalıyken (önerilen) müşteri siparişini yalnızca sipariş verdiği cihazdan ya da kendisine verilen gizli takip bağlantısıyla görür. Açarsanız sipariş numarasını ve telefonu bilen herkes siparişin durumunu başka bir cihazdan görebilir (yalnızca durum, tarih, ürün sayısı ve tutar; ad, adres ve ürünler gösterilmez; iptal, sözleşme ve iade işlemi yapılamaz). Arşivlenmiş siparişler telefonla bulunmaz.</p>
        <label class="switch"><input type="checkbox" name="marketingConsent" ${p.marketingConsent ? "checked" : ""}> Pazarlama izni kutusu (ticari ileti)</label>
        <p class="hint" style="margin:0 0 6px 52px">Açıkken sipariş formunda isteğe bağlı ve işaretsiz bir “kampanya SMS'i ve arama izni” kutusu ile bağlı metinler (Ticari Elektronik İleti İzni, Açık Rıza Metni) görünür.</p>
        <div class="callout warn" id="iysWarn">${icon("alert")}<div><b>İYS kaydı olmadan açmayın.</b> Kampanya mesajı göndermeden önce iys.org.tr'ye kaydolun ve İYS'ye bağlı bir SMS sağlayıcısı seçin; toplanan izinleri 3 iş günü içinde İYS'ye işleyin. İYS'ye işlenmeyen izin geçersizdir. Sipariş bildirimleri (alındı, yolda) için izin gerekmez.</div></div>
      </div>
      <div class="form-sec" style="margin-top:18px"><h4>Saklama süreleri</h4>
        <div class="grid-2">
          <label class="field"><span>Kişisel verileri anonimleştir</span><div class="affix"><input name="retentionDays" inputmode="numeric" value="${val(p.retentionDays)}" placeholder="Boş = kapalı"><span class="sfx">gün</span></div><span class="hint" id="retHint"></span></label>
          <label class="field"><span>Personele maskele (arşiv)</span><div class="affix"><input name="archiveDays" inputmode="numeric" value="${val(p.archiveDays)}" placeholder="Boş = kapalı"><span class="sfx">gün</span></div><span class="hint" id="arcHint"></span></label>
        </div>
        <p class="hint" style="margin:0">Teslim edilmiş ya da iptal edilmiş siparişlerde süre dolunca ad, telefon, adres ve notlar silinir; tutar ve ürün bilgisi raporlar için kalır. Önerilen: <b>3650 gün</b> (10 yıl, 6563 sayılı Kanun m.11). Arşiv süresini geçen siparişlerde kişisel veri yalnızca yöneticiye görünür (önerilen <b>730 gün</b>); arşiv süresi anonimleştirme süresinden uzun olamaz.</p>
        <div class="row-flex"><button type="button" class="btn btn-sm" id="retRun">${icon("refresh", "i-sm")} Anonimleştirmeyi şimdi çalıştır</button><span class="small muted" id="retLast"></span></div>
      </div>`,
    after: (f) => {
      const upd = () => {
        $("#retHint").textContent = dayHint(f.retentionDays.value.trim());
        $("#arcHint").textContent = dayHint(f.archiveDays.value.trim());
        $("#iysWarn").classList.toggle("danger", f.marketingConsent.checked);
        $("#iysWarn").classList.toggle("warn", !f.marketingConsent.checked);
      };
      f.addEventListener("input", upd);
      f.marketingConsent.addEventListener("change", async () => {
        if (!f.marketingConsent.checked) return upd();
        const ok = await confirmDialog({ title: "Pazarlama izni kutusu açılsın mı?", okLabel: "İYS kaydım var, aç", message: "Bu kutu yalnızca İYS kaydınız ve İYS'ye bağlı bir SMS sağlayıcınız varsa açılmalı.", details: "İYS'ye işlenmeyen izinlerle kampanya mesajı göndermek idari para cezası gerektirir." });
        if (!ok) { f.marketingConsent.checked = false; tracker && tracker.check(); }
        upd();
      });
      const last = state.security && state.security.privacy.lastRetentionRun;
      $("#retLast").textContent = last ? `Son çalışma: ${fmtDateTime(last)} (günde bir kendiliğinden çalışır)` : "Günde bir kendiliğinden çalışır.";
      $("#retRun").addEventListener("click", async (e) => {
        const b = e.currentTarget;
        if (!(await confirmDialog({ title: "Anonimleştirme çalıştırılsın mı?", okLabel: "Çalıştır", danger: true, message: "Kayıtlı saklama süresi dolmuş tamamlanmış siparişlerdeki ad, telefon, adres ve notlar kalıcı olarak silinir.", details: "Bu işlem geri alınamaz. Formda kaydedilmemiş değişiklik varsa önce kaydedin." }))) return;
        b.disabled = true; b.classList.add("is-busy");
        try {
          const r = await api("/api/admin/privacy/run", { method: "POST" });
          toast(r.processed ? `${r.processed} siparişte kişisel veriler anonimleştirildi.` : "Süresi dolmuş sipariş yok; hiçbir şey değişmedi.");
          $("#retLast").textContent = `Son çalışma: ${fmtDateTime(r.lastRunAt)}`;
          loadSecurity();
        } catch (er) { toastErr(er); } finally { b.disabled = false; b.classList.remove("is-busy"); }
      });
      upd();
    },
    collect: (f) => {
      const rd = intOrNull(f.retentionDays.value, "Anonimleştirme süresi", 30, 7300);
      const ad = intOrNull(f.archiveDays.value, "Arşiv süresi", 1, 7300);
      if (rd && ad && ad > rd) throw new Error("Arşiv süresi anonimleştirme süresinden uzun olamaz.");
      return { privacy: { phoneLookup: f.phoneLookup.checked, marketingConsent: f.marketingConsent.checked, retentionDays: rd, archiveDays: ad } };
    },
  });
}

// ---------- İşletme bilgileri ----------
function missingHtml() {
  const sec = state.security;
  if (!sec) return "";
  const miss = sec.legal.missing.map((m) => esc(m.label));
  if (!sec.etbis.ok) miss.push("ETBİS kayıt numarası");
  const bt = sec.legal.businessType || "";
  if (!bt) miss.unshift("İşletme türü (şahıs / şirket)");
  if (!miss.length) return `<div class="callout ok">${icon("check")}<div>İşletme bilgileri tam. Yasal metinlerde, sözleşmede ve fişte bu bilgiler kullanılıyor.</div></div>`;
  const tail = bt === "sirket" ? "Şirkette MERSİS ve KEP zorunludur." : "Şahıs işletmesinde MERSİS ve KEP zorunlu değil; boş bırakırsanız metinlerden kendiliğinden çıkarılır.";
  return `<div class="callout warn">${icon("alert")}<div><b>Canlıya çıkmadan önce doldurun:</b> ${miss.join(", ")}. Boş alanlar yasal metinlerde “[…]” olarak görünür. ${tail}</div></div>`;
}
function businessForm(body, s) {
  const l = s.legal;
  const st = s.store;
  sectionCard(body, {
    title: "İşletme bilgileri", desc: "Satıcı bilgileri yasal metinlere, sipariş sözleşmesine, sitenin iletişim sayfasına ve fişe yazılır (6563 sayılı Kanun m.3, E-ticaret Yönetmeliği m.5).",
    inner: `<div id="bizMissing">${missingHtml()}</div>
      <div class="grid-2 mt">
        <label class="field span-2"><span>İşletme türü</span><select name="businessType">
          <option value="" ${!l.businessType ? "selected" : ""}>Seçin…</option>
          <option value="sahis" ${l.businessType === "sahis" ? "selected" : ""}>Şahıs işletmesi (esnaf / şahıs tacir)</option>
          <option value="sirket" ${l.businessType === "sirket" ? "selected" : ""}>Şirket (Ltd., A.Ş. …)</option>
        </select><span class="hint">Şahısta ad soyad ve vergi numarası yeterli; şirkette ticaret unvanı, MERSİS ve KEP zorunlu.</span></label>
        <label class="field span-2"><span>Ticari unvan ya da ad soyad</span><input name="companyTitle" maxlength="200" value="${val(l.companyTitle)}" autocomplete="organization"><span class="hint">Şirketse ticaret unvanı; şahıs esnafıysa işletme sahibinin adı soyadı.</span></label>
        <label class="field"><span>Vergi dairesi</span><input name="taxOffice" maxlength="100" value="${val(l.taxOffice)}"></label>
        <label class="field"><span>Vergi / TC kimlik numarası</span><input name="taxNo" maxlength="20" inputmode="numeric" value="${val(l.taxNo)}"></label>
        <label class="field"><span>MERSİS numarası <span class="hint">(şirketse zorunlu)</span></span><input name="mersis" maxlength="30" inputmode="numeric" value="${val(l.mersis)}"></label>
        <label class="field"><span>KEP adresi <span class="hint">(şirketse zorunlu)</span></span><input name="kep" maxlength="120" value="${val(l.kep)}"></label>
        <label class="field"><span>Meslek odası</span><input name="chamber" maxlength="200" value="${val(l.chamber)}" placeholder="Ör. Edirne Bakkallar ve Bayiler Odası"></label>
        <label class="field"><span>ETBİS kayıt numarası</span><input name="etbisNo" maxlength="60" value="${val(l.etbisNo)}"><span class="hint">e-Devlet → ETBİS kaydından sonra verilen numara.</span></label>
        <label class="field span-2"><span>E-posta <span class="hint">(cayma bildirimleri ve KVKK başvuruları için; düzenli bakılan bir adres)</span></span><input name="email" type="email" maxlength="120" value="${val(st.email)}" autocomplete="email"></label>
      </div>
      <p class="hint" style="margin:0">Adres ve telefon <a href="/panel/ayarlar/magaza" data-link>Mağaza bilgileri</a> bölümünden gelir: ${esc(st.address || "—")} · ${esc(st.phone || "—")}</p>
      <div class="callout">${icon("info")}<div>Bu bilgiler yasal metinlere girdiği için değiştirdiğinizde ilgili belgelerin <b>yeni sürümü</b> oluşur; önceki sürüm, onu onaylamış siparişler için arşivde aynen saklanır.</div></div>`,
    collect: (f) => {
      const email = f.email.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Geçerli bir e-posta adresi girin.");
      return {
        legal: Object.fromEntries(["businessType", "companyTitle", "taxOffice", "taxNo", "mersis", "kep", "chamber", "etbisNo"].map((k) => [k, f[k].value.trim()])),
        store: { email },
      };
    },
  });
}

// ---------- Yasal belgeler ----------
let legalInfo = null;
let legalTemplates = null;
async function legalDocsView(body) {
  body.innerHTML = `<div class="card">
    <div class="card-head"><div><h3>Yasal belgeler</h3><p class="small muted" style="margin:2px 0 0">Sitedeki yasal sayfalar ve sipariş formunda onaylatılan metinler. Taslaklar docs/YASAL.md'den gelir; canlıya çıkmadan önce bir avukata onaylatın.</p></div></div>
    <div id="docList"><div class="skeleton" style="padding:10px"><div></div><div></div><div></div></div></div>
  </div>`;
  try { legalInfo = await api("/api/admin/legal"); } catch (e) { toastErr(e); $("#docList").innerHTML = `<div class="empty small">Belgeler yüklenemedi.</div>`; return; }
  drawDocs();
}
function drawDocs() {
  const list = $("#docList");
  if (!list || !legalInfo) return;
  list.innerHTML = legalInfo.docs.map((d) => {
    const old = legalInfo.archive.filter((a) => a.key === d.key).length;
    return `<div class="lrow doc-row" style="padding-left:16px">
      <div class="lrow-main">
        <div class="lrow-title">${esc(d.title)} ${d.custom ? `<span class="badge b-gold">Özel metin</span>` : `<span class="badge b-muted">Varsayılan metin</span>`}${d.active ? "" : ` <span class="badge b-danger">Pasif</span>`}${d.active && !d.visible ? ` <span class="badge b-warn" title="Yalnızca pazarlama izni açıkken yayımlanır">Yayında değil</span>` : ""}</div>
        <div class="lrow-sub"><span>${esc(d.path)}</span><span>Sürüm <code title="${esc(d.version)}">${esc(d.version.slice(0, 12))}</code></span><span>Son değişiklik: ${d.updatedAt ? fmtDateTime(d.updatedAt) : "yok (şablon)"}</span>${old ? `<span>${old} arşiv kaydı</span>` : ""}</div>
      </div>
      <div class="lrow-acts">
        ${d.visible ? `<a class="icon-btn sm" href="${esc(d.path)}" target="_blank" rel="noopener" aria-label="${esc(d.title)}: sitede gör" title="Sitede gör">${icon("external")}</a>` : ""}
        ${old ? `<button type="button" class="icon-btn sm" data-dver="${esc(d.key)}" aria-label="${esc(d.title)}: sürümler" title="Sürümler">${icon("history")}</button>` : ""}
        <button type="button" class="btn btn-sm" data-dedit="${esc(d.key)}">${icon("edit", "i-sm")} Düzenle</button>
      </div></div>`;
  }).join("");
  list.onclick = (e) => {
    const b = e.target.closest("[data-dedit], [data-dver]");
    if (!b) return;
    if (b.dataset.dedit) docDialog(b.dataset.dedit); else versionsDialog(b.dataset.dver);
  };
}
async function docDialog(key) {
  const d = legalInfo.docs.find((x) => x.key === key);
  const raw = state.settings.legal.docs.find((x) => x.key === key) || {};
  try { if (!legalTemplates) legalTemplates = await api("/api/admin/settings/legal-templates"); } catch (e) { toastErr(e); return; }
  const tpl = legalTemplates[key] || "";
  const ph = legalInfo.placeholders || { store: [], order: {} };
  openModal({
    title: d.title, size: "wide", submitLabel: "Kaydet — yeni sürüm oluştur",
    body: `<div class="callout info">${icon("info")}<div>Kaydettiğinizde bu belgenin <b>yeni sürümü</b> oluşur ve sitede hemen yayımlanır. Önceki sürüm silinmez: onu onaylamış siparişlerin sözleşmesi arşivden aynen gösterilir.<br>Şu anki sürüm <span class="ver">${esc(d.version.slice(0, 12))}</span> · son değişiklik: ${d.updatedAt ? fmtDateTime(d.updatedAt) : "yok (şablon metni)"}.</div></div>
      <div class="grid-2">
        <label class="field"><span>Başlık</span><input name="title" maxlength="120" value="${val(raw.title || d.title)}" required></label>
        <label class="field"><span>Sayfa adresi</span><input name="path" value="${val(d.path)}" disabled></label>
        <label class="field span-2"><span>Kısa açıklama</span><input name="lead" maxlength="300" value="${val(raw.lead || "")}"></label>
      </div>
      <label class="switch"><input type="checkbox" name="active" ${raw.active !== false ? "checked" : ""}> Yayında (sitede sayfası açık)</label>
      <div class="field">
        <div class="row-flex"><span class="field-label grow">Metin</span><span class="badge" id="docMode"></span><button type="button" class="btn btn-sm" id="docReset">${icon("undo", "i-sm")} Varsayılan metne dön</button></div>
        <textarea class="input legal-text" name="text" maxlength="60000" rows="16" aria-label="Belge metni">${esc(raw.text || tpl)}</textarea>
        <span class="hint">Biçim: boş satır = yeni paragraf, <code>## </code> ile başlayan satır = ara başlık, <code>- </code> = madde, <code>**kalın**</code>. Varsayılan metin bırakılırsa ileride şablon güncellenince belge de güncellenir.</span>
      </div>
      <details class="field"><summary class="field-label" style="cursor:pointer">Yer tutucular — tıklayınca imlecin olduğu yere eklenir</summary>
        <p class="hint" style="margin:8px 0 4px">Mağaza ve işletme bilgilerinden dolanlar:</p>
        <div class="placeholder-help">${(ph.store || []).map((k) => `<code data-ph="${esc(k)}" role="button" tabindex="0">{{${esc(k)}}}</code>`).join("")}</div>
        <p class="hint" style="margin:10px 0 4px">Siparişe özel (sözleşmede siparişin bilgisiyle dolar; genel sayfada açıklaması görünür):</p>
        <div class="placeholder-help">${Object.entries(ph.order || {}).map(([k, l]) => `<code data-ph="${esc(k)}" role="button" tabindex="0" title="${esc(l)}">{{${esc(k)}}}</code>`).join("")}</div>
      </details>`,
    onOpen: (f) => {
      const mode = () => {
        const def = f.text.value.trim() === tpl.trim();
        const m = $("#docMode");
        m.textContent = def ? "Varsayılan metin" : "Özel metin";
        m.className = `badge ${def ? "b-muted" : "b-gold"}`;
        $("#docReset").disabled = def;
      };
      f.text.addEventListener("input", mode);
      mode();
      $("#docReset").addEventListener("click", async () => {
        if (!(await confirmDialog({ title: "Varsayılan metne dönülsün mü?", okLabel: "Varsayılana dön", message: "Alandaki özel metin, docs/YASAL.md'deki varsayılan taslakla değiştirilir (kaydedene kadar sitede değişmez)." }))) return;
        f.text.value = tpl;
        f.text.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const insert = (c) => {
        const ta = f.text;
        const st = ta.selectionStart ?? ta.value.length;
        ta.setRangeText(`{{${c.dataset.ph}}}`, st, ta.selectionEnd ?? st, "end");
        ta.focus();
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      };
      f.addEventListener("click", (e) => { const c = e.target.closest("[data-ph]"); if (c) insert(c); });
      f.addEventListener("keydown", (e) => { const c = e.target.closest("[data-ph]"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); insert(c); } });
    },
    onSubmit: async (f) => {
      const title = f.title.value.trim();
      if (!title) throw new Error("Başlık gerekli.");
      const text = f.text.value.trim() === tpl.trim() ? "" : f.text.value;
      const docs = state.settings.legal.docs.map((x) => (x.key === key ? { ...x, title, lead: f.lead.value.trim(), active: f.active.checked, text } : x));
      const r = await api("/api/admin/settings", { method: "PATCH", body: { legal: { docs } } });
      state.settings = r.settings;
      legalInfo = await api("/api/admin/legal");
      const nd = legalInfo.docs.find((x) => x.key === key);
      drawDocs();
      toast(nd && nd.version !== d.version ? `${nd.title} kaydedildi. Yeni sürüm: ${nd.version.slice(0, 12)}.` : `${title} kaydedildi (metin aynı kaldı, sürüm değişmedi).`);
      loadSecurity();
    },
  });
}
async function versionsDialog(key) {
  const d = legalInfo.docs.find((x) => x.key === key);
  const list = legalInfo.archive.filter((a) => a.key === key);
  const ctl = openModal({
    title: `Sürümler · ${d ? d.title : key}`, size: "wide", hideSubmit: true, cancelLabel: "Kapat", guard: false,
    body: `<p class="small muted" style="margin:0">Onaylanmış metinler silinmez; bir sürümle verilen siparişlerin sözleşmesi o sürümün metniyle gösterilir.</p>
      <div class="list">${list.map((a) => `<div class="lrow" style="padding-left:14px"><div class="lrow-main"><div class="lrow-title"><span class="ver">${esc(a.version.slice(0, 12))}</span>${a.current ? ' <span class="badge b-ok">Güncel</span>' : ""}</div>
        <div class="lrow-sub"><span>Kayıt: ${fmtDateTime(a.at)}</span></div></div><button type="button" class="btn btn-sm" data-v="${esc(a.version)}">Görüntüle</button></div>`).join("")}</div>
      <div id="verView"></div>`,
  });
  ctl.dlg.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-v]");
    if (!b) return;
    try {
      const v = await api(`/api/admin/legal/versions/${b.dataset.v}`);
      // html sunucuda kaçışlanmış güvenli HTML'dir (docs/API.md §2.8)
      $("#verView").innerHTML = `<h4 style="margin:6px 0 8px">Sürüm ${esc(v.version.slice(0, 12))} · ${v.orders} sipariş bu sürümü onayladı</h4><div class="card card-pad legal-preview">${v.html}</div>`;
    } catch (er) { toastErr(er); }
  });
}

// ---------- Onay kutuları ----------
function consentsForm(body, s) {
  const docs = s.legal.docs;
  let rows = s.legal.consents.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((c, i) => ({ ...c, rk: `c${i}`, isNew: false }));
  let n = 0;
  const f = sectionCard(body, {
    title: "Onay kutuları", desc: "Sipariş formunda müşterinin işaretlediği kutular. Her kutu ayrı ve işaretsiz gelir; zorunlular işaretlenmeden sipariş verilemez (sunucu da reddeder).",
    inner: `<div class="callout">${icon("info")}<div>Etikette belgeye bağlantı için <code>[görünen metin](belge-anahtarı)</code> yazın, ör. <code>[Ön Bilgilendirme Formu](onBilgilendirme)</code>; <code>{{isletmeAdi}}</code> mağaza adıyla dolar. KVKK kutusunda “onaylıyorum / açık rıza veriyorum” değil, <b>“okudum ve anladım”</b> denmelidir. Pazarlama (ticari ileti) kutusu zorunlu yapılamaz. Metni değiştirince sipariş onay kaydında yeni metin saklanır.</div></div>
      <div id="cRows"></div>
      <div class="row-flex mt"><button type="button" class="btn btn-sm" id="cAdd">${icon("plus", "i-sm")} Onay kutusu ekle</button><span class="hint">Belge anahtarları: ${docs.map((d) => `<code>${esc(d.key)}</code>`).join(" ")}</span></div>`,
    after: (form) => {
      const sync = () => {
        rows = rows.map((r) => ({
          ...r,
          key: r.isNew && form[`ck_${r.rk}`] ? form[`ck_${r.rk}`].value.trim() : r.key,
          label: form[`cl_${r.rk}`] ? form[`cl_${r.rk}`].value : r.label,
          required: form[`cr_${r.rk}`] ? form[`cr_${r.rk}`].checked : r.required,
          active: form[`ca_${r.rk}`] ? form[`ca_${r.rk}`].checked : r.active,
          docs: docs.filter((d) => { const cb = form[`cd_${r.rk}_${d.key}`]; return cb ? cb.checked : (r.docs || []).includes(d.key); }).map((d) => d.key),
        }));
      };
      const draw = () => {
        $("#cRows").innerHTML = rows.length ? rows.map((r, i) => `<div class="consent-row" data-rk="${r.rk}">
          <div class="move">
            <button type="button" class="icon-btn sm" data-cmove="${r.rk}" data-d="-1" ${i === 0 ? "disabled" : ""} aria-label="${i + 1}. kutuyu yukarı taşı">${icon("up")}</button>
            <button type="button" class="icon-btn sm" data-cmove="${r.rk}" data-d="1" ${i === rows.length - 1 ? "disabled" : ""} aria-label="${i + 1}. kutuyu aşağı taşı">${icon("down")}</button>
          </div>
          <div class="stack" style="gap:8px;min-width:0">
            <div class="row-flex" style="flex-wrap:wrap;min-width:0"><b>${i + 1}.</b>
              ${r.isNew ? `<label class="field" style="width:220px"><span class="sr-only">Anahtar</span><input name="ck_${r.rk}" maxlength="40" value="${val(r.key)}" placeholder="anahtar, ör. ozelOnay" spellcheck="false" autocomplete="off"></label>` : `<span class="consent-key">${esc(r.key)}</span>`}
              ${r.marketing ? `<span class="badge b-warn" style="white-space:normal;height:auto">Pazarlama — yalnızca pazarlama izni açıkken görünür</span>` : ""}</div>
            <label class="field"><span class="sr-only">${i + 1}. kutunun metni</span><textarea name="cl_${r.rk}" maxlength="500" rows="3">${val(r.label)}</textarea></label>
            <div class="opts">
              <label class="switch"><input type="checkbox" name="cr_${r.rk}" ${r.required && !r.marketing ? "checked" : ""} ${r.marketing ? "disabled" : ""}> Zorunlu</label>
              <label class="switch"><input type="checkbox" name="ca_${r.rk}" ${r.active !== false ? "checked" : ""}> Aktif</label>
            </div>
            <div><span class="field-label">Bağlı belgeler</span><div class="docs-pick">${docs.map((d) => `<label class="check"><input type="checkbox" name="cd_${r.rk}_${esc(d.key)}" ${(r.docs || []).includes(d.key) ? "checked" : ""}> ${esc(d.title)}</label>`).join("")}</div></div>
          </div>
          <button type="button" class="icon-btn sm danger" data-cdel="${r.rk}" aria-label="${i + 1}. kutuyu sil">${icon("trash")}</button>
        </div>`).join("") : `<div class="empty small">Onay kutusu yok. En az ön bilgilendirme, mesafeli satış sözleşmesi ve KVKK aydınlatma kutuları olmalı.</div>`;
      };
      form.addEventListener("click", async (e) => {
        const mv = e.target.closest("[data-cmove]");
        if (mv) {
          sync();
          const i = rows.findIndex((r) => r.rk === mv.dataset.cmove);
          const j = i + Number(mv.dataset.d);
          [rows[i], rows[j]] = [rows[j], rows[i]];
          draw();
          if (tracker) tracker.check();
          return;
        }
        const del = e.target.closest("[data-cdel]");
        if (del) {
          sync();
          const r = rows.find((x) => x.rk === del.dataset.cdel);
          const ok = await confirmDialog({ title: "Onay kutusu kaldırılsın mı?", okLabel: "Kaldır", danger: true, message: "Kutu kaydettiğinizde sipariş formundan kalkar.", details: r.required ? "Bu zorunlu bir onay. Yasal olarak gerekiyorsa siparişler eksik onayla alınır." : "" });
          if (!ok) return;
          rows = rows.filter((x) => x !== r);
          draw();
          if (tracker) tracker.check();
        }
      });
      $("#cAdd").addEventListener("click", () => {
        sync();
        rows.push({ rk: `n${++n}`, key: "", label: "", required: false, active: true, docs: [], marketing: false, isNew: true });
        draw();
        const k = $(`[name="ck_n${n}"]`);
        if (k) k.focus();
        if (tracker) tracker.check();
      });
      draw();
      form.consentsState = () => { sync(); return rows; };
    },
    collect: (form) => ({ legal: { consents: form.consentsState().map((r, i) => {
      if (!r.key) throw new Error(`${i + 1}. kutu için bir anahtar girin (harfle başlayan, ör. ozelOnay).`);
      if (!r.label.trim()) throw new Error(`${i + 1}. kutunun metni boş.`);
      return { key: r.key, label: r.label.trim(), required: r.marketing ? false : !!r.required, docs: r.docs, order: i + 1, active: r.active !== false, marketing: !!r.marketing };
    }) } }),
  });
  void f;
}

// ---------- Site dışında yapılacaklar (YASAL.md §6) ----------
const TODO = [
  ["Canlıya çıkmadan önce (zorunlu)", [
    ["isletme", "İşletme türünü netleştirin, işletme bilgilerini doldurun", "Şahıs esnafı / şahıs tacir / şirket: sitede gösterilecek kimlik bilgileri (VKN mi MERSİS mi, KEP) buna bağlı.", (s, sec) => sec && sec.legal.ok, "/panel/ayarlar/isletme"],
    ["etbis", "ETBİS kaydı", "e-Devlet → Ticaret Bakanlığı → ETBİS; ücretsiz, satışa başlamadan önce. Değişiklikleri 30 gün içinde güncelleyin.", (s, sec) => sec && sec.etbis.ok, "/panel/ayarlar/isletme"],
    ["avukat", "Yasal metinleri bir avukata onaylatın", "docs/YASAL.md taslakları ve paneldeki doldurulmuş hâlleri (Yasal belgeler).", null, "/panel/ayarlar/yasal"],
    ["barindirma", "Sunucuyu Türkiye'de barındırın", "Yurt dışındaysa barındırma firmasıyla KVKK standart sözleşmesini imzalayıp 5 iş günü içinde Kurul'a bildirin."],
    ["https", "HTTPS ve depoda şifreleme", "Site HTTPS ile açılmalı, veriler DATA_KEY ile şifreli saklanmalı (sunucuyu kuran kişi yapar).", (s, sec) => sec && sec.https.requestHttps && sec.dataKey.enabled, "/panel/ayarlar/guvenlik"],
    ["telegram", "Telegram bildirimini kişisel verisiz kullanın", "Yazılım bunu yapıyor: bildirimlere müşteri adı, telefon, adres ve not yazılmaz. Kuryeye adresi WhatsApp'tan değil panelden ya da fişten verin.", () => true],
    ["vis", "Veri işleme sözleşmeleri", "Barındırma firması, yazılımı yapan/bakımını yapan kişi, dışarıdan kurye firması (varsa), mali müşavir."],
    ["teyit", "Sipariş teyidi prosedürü", "Her web siparişinde müşteriyi kısaca arayıp sipariş ayrıntısında “Teyit araması yapıldı” işaretleyin (ya da yurt içi bir SMS sağlayıcısı)."],
    ["fis", "Fatura/fiş düzeni", "Kapıda satışta ÖKC fişi / e-Arşiv; kuryeye mobil POS. E-Arşiv eşiklerini mali müşavirle kontrol edin."],
    ["basili", "Basılı sipariş özeti", "Panelden yazdırılan fişte satıcı bilgileri, ürün ürün cayma durumu ve sözleşme bağlantısı var; fişle birlikte müşteriye verin.", () => true],
    ["urun", "Ürün verisi", "Her ürüne cayma durumu; ön ambalajlı gıdalara etiket bilgisi (bileşen, alerjen, net miktar, üretici); tartılı ürünlere birim fiyat; indirimde son 10 günün en düşük fiyatı.", null, "/panel/urunler"],
    ["alkol", "Alkol ve tütün", "Sitede, afişte, ürün görsellerinde ve sosyal medyada alkol ürünü/marka/şişe görseli kullanmayın; bu ürünleri online satmayın."],
  ]],
  ["Gerekirse", [
    ["verbis", "VERBİS", "Çalışan sayısı 50'den az (ve yıllık bilanço 100 milyon TL'den az) ise muaf olmanız beklenir; sınır aşılırsa kayıt olun."],
    ["iys", "İYS", "Kampanya SMS'i, arama ya da WhatsApp mesajı göndermeden önce iys.org.tr'ye kaydolun; sitedeki pazarlama izni kutusunu ancak bundan sonra açın.", (s) => (s.privacy.marketingConsent ? null : true), null, "Pazarlama izni kapalı — kampanya mesajı göndermiyorsanız gerekmez."],
    ["eposta", "E-posta / KEP", "Cayma bildirimleri ve KVKK başvuruları için düzenli bakılan bir e-posta. Şirketseniz KEP zorunlu.", (s) => !!s.store.email, "/panel/ayarlar/isletme"],
  ]],
  ["Süregelen işler", [
    ["kvkk30", "KVKK başvurularını 30 gün içinde yanıtlayın", "Müşteriler → müşteri → “Verilerini dışa aktar” / “Verilerini sil”."],
    ["ihlal", "Veri ihlali şüphesinde 72 saat içinde Kurul'a bildirin", "Olayı belgeleyin."],
    ["cayma14", "Cayma/iade taleplerini 14 gün içinde sonuçlandırın", "Talepler sipariş ayrıntısında görünür ve orada işlenir."],
    ["yetki", "Panel kullanıcılarını en az yetkiyle tanımlayın", "Ayrılan personelin hesabını kapatın.", null, "/panel/ayarlar/kullanicilar"],
    ["yillik", "Metinleri yılda en az bir kez gözden geçirin", "Mevzuat değiştiğinde de."],
  ]],
];
function todoView(body, s) {
  let marks = {};
  try { marks = JSON.parse(readLS("panelTodo") || "{}") || {}; } catch { marks = {}; }
  const draw = () => {
    const sec = state.security;
    body.innerHTML = `<div class="card">
      <div class="card-head"><div><h3>Site dışında yapılacaklar</h3><p class="small muted" style="margin:2px 0 0">docs/YASAL.md §6 kontrol listesi. Bilgi amaçlıdır, hukuki danışmanlık yerine geçmez. Elle koyduğunuz işaretler yalnızca bu cihazda saklanır.</p></div></div>
      <div class="card-body stack" style="gap:18px">${TODO.map(([g, items]) => `<div><h4 style="font-size:14.5px;margin-bottom:4px">${esc(g)}</h4><ul class="check-list">${items.map(([id, t, d, auto, link, autoNote]) => {
        const raw = auto ? auto(s, sec) : null;
        const a = raw === null || raw === undefined ? null : !!raw;
        const done = a === true || (a === null && !!marks[id]);
        return `<li><button type="button" class="mark ${done ? "done" : ""}" data-todo="${id}" aria-pressed="${done}" ${a !== null ? `disabled title="Panel verisine göre ${a ? "tamam" : "eksik"}"` : ""} aria-label="${esc(t)}: ${done ? "yapıldı" : "yapılmadı"}">${done ? icon("check") : ""}</button>
          <div><b>${esc(t)}</b>${a === true ? ` <span class="badge b-ok">${autoNote ? "Gerekmiyor" : "Tamam"}</span>` : a === false ? ` <span class="badge b-warn">Eksik</span>` : ""}<div class="sub">${esc(a === true && autoNote ? autoNote : d)}</div>${link && a !== true ? `<a class="small" href="${link}" data-link>İlgili ekrana git</a>` : ""}</div></li>`;
      }).join("")}</ul></div>`).join("")}</div></div>`;
  };
  draw();
  body.onclick = (e) => {
    const b = e.target.closest("[data-todo]");
    if (!b || b.disabled) return;
    marks[b.dataset.todo] = !marks[b.dataset.todo];
    writeLS("panelTodo", JSON.stringify(marks));
    draw();
    const nb = body.querySelector(`[data-todo="${b.dataset.todo}"]`);
    if (nb) nb.focus();
  };
}

// ---------- Denetim kaydı ----------
const AUDIT_ACTIONS = [
  ["giris", "Giriş"], ["giris.basarisiz", "Hatalı giriş denemesi"],
  ["PATCH /api/admin/orders/:id", "Sipariş güncelleme"], ["POST /api/admin/orders/bulk", "Siparişlerde toplu işlem"],
  ["POST /api/admin/orders", "Elle sipariş"], ["PUT /api/admin/orders/:id/items", "Sipariş kalemleri"],
  ["POST /api/admin/orders/:id/confirmation", "Sipariş teyidi"], ["PATCH /api/admin/orders/:id/return-requests/:rid", "Cayma/iade talebi"],
  ["PATCH /api/admin/products/:id", "Ürün düzenleme"], ["POST /api/admin/products/bulk", "Ürünlerde toplu işlem"],
  ["PATCH /api/admin/settings", "Ayar değişikliği"], ["PUT /api/admin/customers/:phone/block", "Müşteri engeli"],
  ["GET /api/admin/customers/:phone/export", "Müşteri verisi dışa aktarma"], ["POST /api/admin/customers/:phone/anonymize", "Müşteri anonimleştirme"],
  ["GET /api/admin/orders/export", "Sipariş CSV indirme"], ["GET /api/admin/backup", "Yedek indirme (şifresiz)"], ["POST /api/admin/backup", "Yedek indirme (parolalı)"],
  ["POST /api/admin/restore", "Yedekten geri yükleme"], ["POST /api/admin/users", "Kullanıcı ekleme"], ["PATCH /api/admin/users/:id", "Kullanıcı düzenleme"],
  ["DELETE /api/admin/users/:id", "Kullanıcı silme"], ["POST /api/admin/password", "Şifre değiştirme"], ["saklama.anonimlestir", "Otomatik anonimleştirme"],
];
const SECTION_NAMES = { store: "Mağaza", legal: "Yasal", hours: "Saatler", ordering: "Sipariş", zones: "Bölgeler", announcement: "Duyuru", banners: "Afişler", faq: "SSS", notify: "Bildirim", blockedPhones: "Engelli numaralar", privacy: "Gizlilik" };
function auditDetails(e) {
  const d = e.details || {};
  const parts = [];
  if (e.target) parts.push(e.target);
  if (d.from !== undefined || d.to !== undefined) parts.push(`${d.from ?? "—"} → ${d.to ?? "—"}`);
  if (Array.isArray(d.sections)) parts.push(d.sections.map((x) => SECTION_NAMES[x] || x).join(", "));
  if (Array.isArray(d.fields)) parts.push(`alanlar: ${d.fields.join(", ")}`);
  if (d.status && d.from === undefined) parts.push(`durum: ${d.status}`);
  if (d.action) parts.push(`işlem: ${d.action}`);
  if (Array.isArray(d.ids)) parts.push(`${d.ids.length} kayıt${d.ids.length <= 6 ? ` (${d.ids.map((x) => `#${x}`).join(", ")})` : ""}`);
  const known = new Set(["from", "to", "sections", "fields", "status", "action", "ids"]);
  const KEYS = { channel: "kanal", result: "sonuç", orders: "sipariş", processed: "işlenen", skipped: "atlanan", name: "ad", role: "rol" };
  const VALS = { ulasildi: "ulaşıldı", ulasilamadi: "ulaşılamadı", telefon: "telefon", whatsapp: "WhatsApp", sms: "SMS", yonetici: "yönetici" };
  for (const [k, v] of Object.entries(d)) {
    if (known.has(k) || v === undefined || v === null || v === "") continue;
    const t = typeof v === "object" ? JSON.stringify(v) : VALS[v] || String(v);
    parts.push(`${KEYS[k] || k}: ${t.length > 80 ? `${t.slice(0, 80)}…` : t}`);
  }
  return parts.join(" · ");
}
async function auditView(body) {
  const st = { user: "", action: "", section: "", entries: [], before: null, more: false, total: 0 };
  body.innerHTML = `<div class="card">
    <div class="card-head"><div><h3>Denetim kaydı</h3><p class="small muted" style="margin:2px 0 0">Panelde kim, ne zaman, hangi işlemi yaptı. Müşterinin kişisel verisi ve IP adresi bu kayda yazılmaz. Genel kayıtta son 2000 işlem tutulur (aynı işlemin tekrarları ve hatalı girişler tek satırda sayılır); yedek, geri yükleme, kullanıcı/şifre, silme ve ayar değişiklikleri ayrı bir güvenlik kaydında saklanır ve genel kaydın dolmasıyla silinmez.</p></div>
      <button type="button" class="icon-btn" id="auReload" aria-label="Yenile" title="Yenile">${icon("refresh")}</button></div>
    <div class="audit-filters">
      <select class="input" id="auSection" aria-label="Bölüm"><option value="">Tüm kayıtlar</option><option value="guvenlik">Yalnızca güvenlik kayıtları</option></select>
      <select class="input" id="auUser" aria-label="Kullanıcı"><option value="">Tüm kullanıcılar</option><option value="sistem">sistem</option></select>
      <select class="input" id="auAction" aria-label="İşlem"><option value="">Tüm işlemler</option>${AUDIT_ACTIONS.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join("")}</select>
      <span class="grow"></span><span class="small muted" id="auCount"></span>
    </div>
    <div class="table-wrap"><table class="tbl audit-tbl"><thead><tr><th>Zaman</th><th>Kullanıcı</th><th>İşlem</th><th>Ayrıntı</th></tr></thead><tbody id="auRows"><tr><td colspan="4"><div class="skeleton"><div></div><div></div></div></td></tr></tbody></table></div>
    <div class="load-more" id="auMore" hidden><button type="button" class="btn">Daha eski kayıtlar</button></div>
  </div>`;
  api("/api/admin/users").then((users) => {
    const sel = $("#auUser");
    if (sel) sel.insertAdjacentHTML("beforeend", users.map((u) => `<option value="${esc(u.username)}">${esc(u.name || u.username)} (@${esc(u.username)})</option>`).join(""));
  }).catch(() => {});
  const draw = () => {
    const rows = $("#auRows");
    if (!rows) return;
    rows.innerHTML = st.entries.length ? st.entries.map((e) => `<tr>
        <td class="when" title="${esc(e.at)}">${fmtDateTime(e.at)}</td>
        <td class="who">${esc(e.user || "—")}${e.role === "personel" ? ` <span class="badge b-muted">personel</span>` : ""}</td>
        <td class="lbl">${esc(e.label || e.action)}${e.count > 1 ? ` <span class="badge b-muted" title="${esc(e.lastAt ? `son: ${fmtDateTime(e.lastAt)}` : "")}">×${Number(e.count)}</span>` : ""}${e.secure ? ` <span class="badge b-outline">güvenlik</span>` : ""}</td>
        <td class="det">${esc(auditDetails(e))}</td></tr>`).join("")
      : `<tr><td colspan="4"><div class="empty small">Kayıt yok.</div></td></tr>`;
    $("#auCount").textContent = `${st.entries.length} kayıt gösteriliyor · toplam ${st.total}`;
    $("#auMore").hidden = !st.more;
  };
  const load = async (append = false) => {
    const p = new URLSearchParams({ limit: "50" });
    if (append && st.before) p.set("before", String(st.before));
    if (st.user) p.set("user", st.user);
    if (st.action) p.set("action", st.action);
    if (st.section) p.set("section", st.section);
    try {
      const r = await api(`/api/admin/audit?${p}`);
      st.entries = append ? [...st.entries, ...r.entries] : r.entries;
      st.total = r.total;
      st.more = r.entries.length === 50;
      st.before = st.entries.length ? st.entries[st.entries.length - 1].seq : null;
      draw();
    } catch (e) { toastErr(e); }
  };
  $("#auSection").addEventListener("change", (e) => { st.section = e.target.value; load(); });
  $("#auUser").addEventListener("change", (e) => { st.user = e.target.value; load(); });
  $("#auAction").addEventListener("change", (e) => { st.action = e.target.value; load(); });
  $("#auReload").addEventListener("click", () => load());
  $("#auMore button").addEventListener("click", () => load(true));
  await load();
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
      <div class="lrow-main"><div class="lrow-title">${esc(u.name || u.username)} <span class="badge ${u.role === "yonetici" ? "b-dark" : "b-muted"}">${u.role === "yonetici" ? "Yönetici" : "Personel"}</span>${u.active ? "" : ' <span class="badge b-danger">Pasif</span>'}${u.id === state.user.id ? ' <span class="badge b-outline">Siz</span>' : ""}</div>
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
      loadSecurity(); // varsayılan şifre uyarısı kalkmış olabilir
    },
  });
}

// ---------- Yedek ----------
async function backupView(body) {
  const sec = state.security;
  body.innerHTML = `<div class="card"><div class="card-head"><h3>Yedek al</h3></div><div class="card-body stack">
      <p style="margin:0">Ürünler, kategoriler, siparişler (müşteri bilgileri dahil), ayarlar ve kullanıcıların tamamı tek bir <b>.json</b> dosyası olarak indirilir. Düzenli olarak indirip güvenli bir yerde saklayın.</p>
      <div class="callout info">${icon("lock")}<div><b>Parolalı yedek önerilir.</b> Yedek, müşterilerin ad, telefon ve adreslerini içerir. Parolalı yedek AES-256 ile şifrelenir; parola sunucuda saklanmaz, <b>unutulursa yedek açılamaz</b>.</div></div>
      <div class="row-flex"><button type="button" class="btn btn-primary" id="bkDownEnc">${icon("lock")} Parolalı yedek indir</button><button type="button" class="btn" id="bkDown">${icon("download")} Şifresiz indir</button></div>
      ${sec && !sec.dataKey.enabled ? `<p class="hint" style="margin:0">Sunucudaki veriler ve otomatik yedekler şu an şifresiz (DATA_KEY yok). Bkz. <a href="/panel/ayarlar/guvenlik" data-link>Güvenlik ve gizlilik</a>.</p>` : ""}</div></div>
    <div class="card mt"><div class="card-head"><h3>Yedekten geri yükle</h3></div><div class="card-body stack">
      <div class="callout danger">${icon("alert")}<div><b>Mevcut verinin tamamı seçtiğiniz yedekle değiştirilir.</b> Geri yüklemeden önce sunucuda otomatik yedek alınır. İşlemden sonra herkesin yeniden giriş yapması gerekir.</div></div>
      <label class="field"><span>Yedek dosyası (.json ya da .sifreli.json)</span><input type="file" id="bkFile" accept=".json,application/json"></label>
      <p class="small" id="bkInfo" style="margin:0" role="status"></p>
      <div><button type="button" class="btn btn-danger" id="bkRestore" disabled>${icon("upload")} Geri yükle</button></div></div></div>
    <div class="card mt"><div class="card-head"><h3>Sunucudaki otomatik yedekler</h3><span class="small muted">Günlük (son 14 gün) ve işlem öncesi yedekler</span></div><div id="bkList"><div class="skeleton" style="padding:10px"><div></div></div></div></div>`;
  $("#bkDown").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    if (!(await confirmDialog({ title: "Şifresiz yedek indirilsin mi?", okLabel: "Şifresiz indir", message: "Dosya müşteri bilgilerini açık metin olarak içerir. Kaybolursa ya da paylaşılırsa kişisel veri ihlali sayılır.", details: "Mümkünse parolalı yedeği kullanın." }))) return;
    b.disabled = true; b.classList.add("is-busy");
    try { const n = await download("/api/admin/backup", "ulusoy-market-yedek.json"); toast(`${n} indirildi.`); } catch (er) { toastErr(er); } finally { b.disabled = false; b.classList.remove("is-busy"); }
  });
  $("#bkDownEnc").addEventListener("click", () => passwordBackupDialog("/api/admin/backup", "ulusoy-market-yedek.sifreli.json"));
  let parsed = null;
  $("#bkFile").addEventListener("change", async (e) => {
    parsed = null;
    $("#bkRestore").disabled = true;
    $("#bkInfo").textContent = "";
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data && data.format === "ulusoy-sifreli") {
        parsed = { text, encrypted: true, data };
        $("#bkInfo").innerHTML = `${icon("lock", "i-sm")} Parolalı yedek. Geri yüklerken parolası sorulacak.`;
      } else {
        const d = data && data.data && Array.isArray(data.data.products) ? data.data : data;
        if (!d || !Array.isArray(d.products) || !Array.isArray(d.categories)) throw new Error();
        parsed = { text, counts: { products: d.products.length, categories: d.categories.length, orders: (d.orders || []).length } };
        $("#bkInfo").textContent = `Yedek okundu: ${parsed.counts.products} ürün, ${parsed.counts.categories} kategori, ${parsed.counts.orders} sipariş.`;
      }
      $("#bkRestore").disabled = false;
    } catch { toast("Yedek dosyası tanınmadı. Panelden indirilen .json yedeği seçin.", "err"); }
  });
  const done = (r) => {
    toast(`Geri yüklendi (${r.counts.products} ürün, ${r.counts.orders} sipariş). Önceki veri ${r.backup} olarak saklandı.`, "ok", { timeout: 12000 });
    clearDirty();
    setTimeout(() => { state.token = "x"; document.dispatchEvent(new CustomEvent("forcelogin", { detail: "Yedek geri yüklendi. Lütfen yeniden giriş yapın." })); }, 400);
  };
  $("#bkRestore").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    if (!parsed) return;
    if (parsed.encrypted) {
      openModal({
        title: "Parolalı yedeği geri yükle", size: "narrow", danger: true, submitLabel: "Geri yükle",
        body: `<div class="callout danger">${icon("alert")}<div>Mevcut verinin tamamı bu yedekle değiştirilecek. İşlemden sonra yeniden giriş yapmanız gerekir.</div></div>
          <label class="field"><span>Yedek parolası</span><input name="password" type="password" autocomplete="off" required></label>`,
        onSubmit: async (f) => {
          if (!f.password.value) throw new Error("Yedek parolasını girin.");
          const r = await api("/api/admin/restore", { method: "POST", body: { file: parsed.data, password: f.password.value } });
          done(r);
        },
      });
      return;
    }
    const ok = await confirmDialog({ title: "Yedekten geri yüklensin mi?", danger: true, okLabel: "Geri yükle",
      message: `Mevcut veri, ${parsed.counts.products} ürün, ${parsed.counts.categories} kategori ve ${parsed.counts.orders} sipariş içeren yedekle değiştirilecek.`, details: "Bu işlemden sonra yeniden giriş yapmanız gerekir." });
    if (!ok) return;
    b.disabled = true; b.classList.add("is-busy");
    try {
      done(await api("/api/admin/restore", { method: "POST", raw: parsed.text, contentType: "application/json" }));
    } catch (er) { toastErr(er); b.disabled = false; b.classList.remove("is-busy"); }
  });
  try {
    const list = await api("/api/admin/backups");
    $("#bkList").innerHTML = list.length ? list.map((x) => `<div class="lrow" style="padding-left:16px"><div class="lrow-main"><div class="lrow-title" style="font-family:var(--mono);font-size:13.5px;font-weight:600;overflow-wrap:anywhere">${esc(x.name)}</div><div class="lrow-sub"><span>${fmtDateTime(x.createdAt)}</span><span>${(x.size / 1024).toFixed(0)} KB</span></div></div>
      <div class="lrow-acts"><button type="button" class="btn btn-sm" data-bkenc="${esc(x.name)}">${icon("lock", "i-sm")} Parolayla</button><button type="button" class="btn btn-sm" data-bk="${esc(x.name)}">${icon("download", "i-sm")} İndir</button></div></div>`).join("") : `<div class="empty small">Henüz otomatik yedek yok. İlk değişiklikle birlikte günlük yedek oluşur.</div>`;
    $("#bkList").onclick = async (e) => {
      const enc = e.target.closest("[data-bkenc]");
      if (enc) return passwordBackupDialog(`/api/admin/backups/${encodeURIComponent(enc.dataset.bkenc)}`, enc.dataset.bkenc.replace(/\.json$/, ".sifreli.json"));
      const b = e.target.closest("[data-bk]");
      if (!b) return;
      try { await download(`/api/admin/backups/${encodeURIComponent(b.dataset.bk)}`, b.dataset.bk); } catch (er) { toastErr(er); }
    };
  } catch (er) { toastErr(er); }
}
/** Parolayla şifrelenmiş yedek indirme (POST { password }; parola URL'ye girmez) */
function passwordBackupDialog(path, fallback) {
  openModal({
    title: "Parolalı yedek indir", size: "narrow", submitLabel: "Şifrele ve indir",
    body: `<p style="margin:0">Yedek bu parolayla AES-256 ile şifrelenir. Geri yüklerken aynı parola istenir.</p>
      <label class="field"><span>Parola</span><input name="password" type="password" minlength="10" autocomplete="new-password" required><span class="hint">En az 10 karakter. Birkaç kelimeden oluşan uzun bir parola seçin.</span></label>
      <label class="field"><span>Parola (tekrar)</span><input name="again" type="password" autocomplete="new-password" required></label>
      <div class="callout warn">${icon("alert")}<div><b>Parolayı unutursanız yedek açılamaz.</b> Sunucu parolayı saklamaz; parolayı yedekten ayrı, güvenli bir yerde tutun.</div></div>`,
    onSubmit: async (f) => {
      if (f.password.value.length < 10) throw new Error("Parola en az 10 karakter olmalı.");
      if (f.password.value !== f.again.value) throw new Error("Parolalar aynı değil.");
      const n = await download(path, fallback, { password: f.password.value });
      toast(`${n} indirildi (parolalı).`);
    },
  });
}

// ======================= HESABIM =======================
export const accountPage = {
  id: "hesap", title: "Hesabım", short: "Hesabım", icon: "user",
  render(el) {
    const u = state.user;
    el.innerHTML = `<div class="page-narrow stack">
      <section class="card"><div class="card-body row-flex" style="gap:14px">
        <div class="thumb" style="width:52px;height:52px;border-radius:50%;background:var(--gold);color:var(--coal);font-weight:800;font-size:20px">${esc((u.name || u.username).slice(0, 1).toLocaleUpperCase("tr"))}</div>
        <div class="grow"><b style="font-size:17px">${esc(u.name || u.username)}</b><div class="muted small">@${esc(u.username)} · ${u.role === "yonetici" ? "Yönetici" : "Personel"}</div></div>
        <button type="button" class="btn" data-action="logout">${icon("logout")} Çıkış yap</button>
      </div></section>
      <section class="card"><div class="card-head"><h3>Bu cihaz</h3></div><div class="card-body stack">
        <label class="switch"><input type="checkbox" id="acSound" ${readLS("panelSound") === "0" ? "" : "checked"}> Yeni siparişte sesli uyarı</label>
        <div class="row-flex"><button type="button" class="btn btn-sm" id="acTest">${icon("volume", "i-sm")} Sesi dene</button>
          ${"Notification" in window ? (Notification.permission === "granted" ? `<span class="badge b-ok">Tarayıcı bildirimleri açık</span>` : Notification.permission === "denied" ? `<span class="badge b-danger">Bildirim izni reddedilmiş (tarayıcı ayarlarından açın)</span>` : `<button type="button" class="btn btn-sm" id="acNotify">${icon("bell", "i-sm")} Tarayıcı bildirimlerine izin ver</button>`) : `<span class="muted small">Bu tarayıcı bildirim desteklemiyor.</span>`}</div>
        <p class="hint" style="margin:0">Panel açık kaldıkça yeni siparişler canlı bağlantıyla anında gelir (üst çubukta “Canlı”). Bağlantı koparsa kendiliğinden yeniden bağlanır; bu sırada siparişler 12 saniyede bir kontrol edilir. Sekme başlığında okunmamış sipariş sayısı görünür.</p>
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
