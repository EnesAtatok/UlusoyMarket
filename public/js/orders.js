// Sipariş takibi, cihaza özel Siparişlerim, takip bağlantısı, belgeler, iptal, cayma/iade talebi, üst şerit.
// Siparişler bu cihazda saklanan gizli anahtarla (token) bağlıdır: localStorage "myOrders" = [{ id, token }].
import { $, esc, tl, icon, api, save, toast, fmtTime, fmtDateTime, telHref, waHref, fmtQty } from "./lib.js";
import { S, emit, storeInfo, setQty } from "./state.js";
import { thumb } from "./shop.js";

const STEPS = ["Yeni", "Hazırlanıyor", "Yolda", "Teslim edildi"];
export const isActive = (o) => o.status !== "Teslim edildi" && o.status !== "İptal";
// Yalnızca marketin iptal ettiği siparişler duyurulur (müşteri kendi iptalini zaten biliyor)
const isRecentCancel = (o) => o.status === "İptal" && o.cancelledBy !== "musteri" && Date.now() - new Date(o.updatedAt).getTime() < 2 * 24 * 3600 * 1000;
const stepLabel = (o, s) => (s === "Yeni" ? "Alındı" : s === "Yolda" && o.type === "gelal" ? "Hazır" : s);
const PAY = { nakit: "Nakit, teslimatta", kart: "Kart, teslimatta" };
const SUBST = { ara: "Beni arayın", benzer: "Benzeriyle değiştirin", cikar: "Siparişten çıkarın" };
const tokenOf = (id) => S.myOrders.find((o) => o.id === id)?.token || "";
export const trackUrl = (id) => `${location.origin}/?siparis=${id}&t=${encodeURIComponent(tokenOf(id))}`;
export const docsUrl = (id) => `/siparis/${id}/belgeler?t=${encodeURIComponent(tokenOf(id))}`;

// ---------- Cihaz listesi ----------
export function rememberOrder(id, token, data) {
  id = Number(id);
  if (!id || !token) return;
  const before = S.myOrders.find((o) => o.id === id);
  S.myOrders = [{ id, token }, ...S.myOrders.filter((o) => o.id !== id)].slice(0, 30);
  save("myOrders", S.myOrders);
  if (data) upsert(data);
  if (!before || before.token !== token) emit("myOrders");
}
function upsert(o) {
  const prev = S.orderData.find((x) => x.id === o.id);
  const merged = prev ? { ...prev, ...o } : o;
  S.orderData = [merged, ...S.orderData.filter((x) => x.id !== o.id)].sort((a, b) => b.id - a.id);
  return { prev, merged };
}

/** Sunucudan (SSE, toplu sorgu, tek sipariş) gelen takip nesnelerini uygular; durum değişince duyurur */
export function applyOrders(list, { source = "" } = {}) {
  const changed = [];
  for (const o of list || []) {
    if (!o || !S.myOrders.some((m) => m.id === o.id)) continue;
    const { prev, merged } = upsert(o);
    if (prev && prev.status !== merged.status) {
      changed.push(merged.id);
      toast(`Sipariş #${merged.id}: ${merged.statusLabel || merged.status}`, { tone: merged.status === "İptal" ? "warn" : "info", ms: 4200 });
    } else if (prev && prev.updatedAt !== merged.updatedAt) changed.push(merged.id);
  }
  S.ordersLoaded = true;
  emit("orders", { changed, source });
  return changed;
}
export function removeOrders(ids) {
  const set = new Set(ids.map(Number));
  if (!set.size) return;
  S.myOrders = S.myOrders.filter((o) => !set.has(o.id));
  save("myOrders", S.myOrders);
  S.orderData = S.orderData.filter((o) => !set.has(o.id));
  emit("orders", { changed: [...set], removed: true });
  emit("myOrders");
}

/** Bu cihazdan verilen siparişlerin güncel durumu (POST /api/orders/lookup, 30'luk parçalar) */
let fetching = null;
export function fetchMyOrders() {
  if (fetching) return fetching;
  fetching = (async () => {
    if (!S.myOrders.length) {
      S.orderData = [];
      S.ordersLoaded = true;
      emit("orders", { changed: [] });
      return [];
    }
    const pairs = S.myOrders.map((o) => ({ id: o.id, token: o.token }));
    const found = [];
    const missing = [];
    for (let i = 0; i < pairs.length; i += 30) {
      const r = await api("/api/orders/lookup", { method: "POST", body: { orders: pairs.slice(i, i + 30) } });
      found.push(...(r.orders || []));
      missing.push(...(r.missing || []));
    }
    if (missing.length) removeOrders(missing);
    applyOrders(found, { source: "lookup" });
    return S.orderData;
  })().finally(() => {
    fetching = null;
  });
  return fetching;
}

export const activeOrders = () => S.orderData.filter(isActive);

/** /?siparis=<id>&t=<token> (paylaşılan takip bağlantısı): siparişi bu cihazın listesine ekler, adresi temizler */
export function takeTrackParam() {
  const p = new URLSearchParams(location.search);
  const id = Number(p.get("siparis"));
  const token = p.get("t");
  if (!p.has("siparis") && !p.has("t")) return null;
  p.delete("siparis");
  p.delete("t");
  const rest = p.toString();
  if (id > 0 && token && /^[A-Za-z0-9_-]{8,64}$/.test(token)) {
    rememberOrder(id, token);
    history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}#/siparis/${id}`);
    return id;
  }
  history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
  return null;
}

// ---------- Üst şerit (aktif sipariş / yakın zamanda iptal) ----------
export function renderStrip(hidden) {
  const el = $("#orderStrip");
  const active = activeOrders();
  const cancelled = S.orderData.filter(isRecentCancel);
  const shown = [...cancelled, ...active];
  const sig = shown.map((o) => `${o.id}:${o.status}:${o.cancelNote || ""}`).join(",");
  let dismissed = "";
  try { dismissed = sessionStorage.getItem("stripHidden") || ""; } catch {}
  if (hidden || !shown.length || dismissed === sig) {
    el.hidden = true;
    return;
  }
  if (el.dataset.sig === sig && !el.hidden) return;
  let text;
  const target = cancelled[0] || active[0];
  if (cancelled.length) {
    const c = cancelled[0];
    text = `<strong>Sipariş #${c.id} iptal edildi.</strong>${c.cancelNote ? ` <span class="strip-why">${esc(c.cancelNote)}</span>` : ""}`;
  } else if (active.length === 1) {
    text = `<strong>Sipariş #${target.id}</strong> <span class="strip-status">${esc(target.statusLabel || target.status)}</span>`;
  } else {
    text = `<strong>${active.length} aktif siparişiniz var.</strong> <span class="strip-status">Son: #${target.id} ${esc(target.statusLabel || target.status)}</span>`;
  }
  el.dataset.sig = sig;
  el.classList.toggle("is-cancel", cancelled.length > 0);
  el.innerHTML = `<div class="strip-inner">
    <span class="strip-icon">${icon(cancelled.length ? "alert" : "package")}</span>
    <p class="strip-text">${text}</p>
    <a class="btn btn-small" href="#/siparis/${target.id}">${cancelled.length ? "Ayrıntılar" : "Takip et"}</a>
    <button class="icon-btn" type="button" data-action="strip-close" aria-label="Şeridi gizle">${icon("x")}</button>
  </div>`;
  el.hidden = false;
}
export function dismissStrip() {
  const el = $("#orderStrip");
  try { sessionStorage.setItem("stripHidden", el.dataset.sig || ""); } catch {}
  el.hidden = true;
}

// ---------- Takip ----------
function stepsHtml(o, { animate = false } = {}) {
  if (o.status === "İptal") return "";
  const idx = STEPS.indexOf(o.status);
  const at = (s) => o.history?.filter((h) => h.status === s).at(0)?.at;
  return `<ol class="steps${animate ? " is-advancing" : ""}" aria-label="Sipariş aşamaları" data-step="${idx}">${STEPS.map((s, i) => {
    const state = i < idx ? "done" : i === idx ? "current" : "todo";
    const t = at(s);
    return `<li class="step is-${state}"${i === idx ? ' aria-current="step"' : ""}>
      <span class="step-dot" aria-hidden="true">${i < idx || (i === idx && s === "Teslim edildi") ? icon("check") : ""}</span>
      <span class="step-label">${esc(stepLabel(o, s))}<span class="sr-only">${state === "done" ? " (tamamlandı)" : state === "current" ? " (şu anki aşama)" : ""}</span></span>
      ${t && i <= idx ? `<span class="step-time">${fmtTime(t)}</span>` : ""}
    </li>`;
  }).join("")}</ol>`;
}

function etaHtml(o) {
  if (!isActive(o)) return "";
  if (o.preorder && o.status === "Yeni") return `<p class="eta">${icon("clock")}<span>Ön sipariş: dükkân açılınca hazırlanmaya başlar.</span></p>`;
  if (!o.etaMinutes) return "";
  const eta = new Date(new Date(o.createdAt).getTime() + o.etaMinutes * 60000);
  if (o.type === "gelal") {
    if (o.status === "Yolda") return `<p class="eta eta-ready">${icon("store")}<span>Siparişiniz hazır, dükkândan teslim alabilirsiniz.</span></p>`;
    return `<p class="eta">${icon("clock")}<span>Tahmini hazır olma: <strong>${fmtTime(eta.toISOString())}</strong> civarı</span></p>`;
  }
  const late = Date.now() > eta.getTime();
  return `<p class="eta">${icon("clock")}<span>${late ? "Siparişiniz birazdan kapınızda." : `Tahmini teslim: <strong>${fmtTime(eta.toISOString())}</strong> civarı`}</span></p>`;
}

function cancelBoxHtml(o) {
  if (o.status !== "İptal") return "";
  const by = o.cancelledBy === "musteri" ? "Siparişi siz iptal ettiniz." : "Siparişiniz market tarafından iptal edildi.";
  return `<div class="cancel-box">${icon("alert")}<div><p><strong>${by}</strong></p>${o.cancelNote ? `<p class="cancel-note">Marketin notu: ${esc(o.cancelNote)}</p>` : ""}</div></div>`;
}

function itemsHtml(o) {
  return `<ul class="co-lines co-lines-img">${(o.items || [])
    .map(
      (i) => `<li>${thumb(i.productId, i.name)}<span class="co-q">${i.unit === "kg" ? `${fmtQty(i.qty)} kg` : `${i.qty}×`}</span><span class="co-n">${esc(i.name)}</span><span class="co-t">${tl(i.price * i.qty)}</span></li>`,
    )
    .join("")}</ul>`;
}

function orderDetails(o) {
  return `<dl class="kv">
      <div><dt>Teslimat</dt><dd>${o.type === "gelal" ? "Gelip alacağım" : `Eve teslim${o.customer?.zoneName ? `, ${esc(o.customer.zoneName)}` : ""}`}</dd></div>
      <div><dt>Ödeme</dt><dd>${PAY[o.payment] || esc(o.payment)}${o.payment === "nakit" && o.changeFor ? `, ${tl(o.changeFor)} ile ödenecek` : ""}</dd></div>
      ${o.substitution ? `<div><dt>Ürün bulunamazsa</dt><dd>${SUBST[o.substitution] || esc(o.substitution)}</dd></div>` : ""}
      ${o.note ? `<div><dt>Not</dt><dd>${esc(o.note)}</dd></div>` : ""}
    </dl>
    ${itemsHtml(o)}
    <dl class="totals">
      <div><dt>Ara toplam</dt><dd>${tl(o.subtotal)}</dd></div>
      ${o.discount ? `<div class="totals-discount"><dt>İndirim${o.couponCode ? ` (${esc(o.couponCode)})` : ""}</dt><dd>−${tl(o.discount)}</dd></div>` : ""}
      ${o.type !== "gelal" ? `<div><dt>Teslimat</dt><dd>${o.deliveryFee ? tl(o.deliveryFee) : "Ücretsiz"}</dd></div>` : ""}
      <div class="totals-total"><dt>Toplam</dt><dd>${tl(o.total)}</dd></div>
    </dl>`;
}

/** Takip bağlantısı + sözleşme bağlantıları (onay ekranı ve takip ekranı) */
function linksHtml(o, { fresh = false } = {}) {
  const docs = o.hasDocuments !== false;
  return `<section class="track-card track-links" aria-labelledby="linksTitle${o.id}">
    <h2 class="sum-title" id="linksTitle${o.id}">${fresh ? "Siparişinizi kaydedin" : "Bağlantılar ve belgeler"}</h2>
    <div class="link-block">
      <p>Bu sipariş yalnızca bu cihazda listelenir. Başka bir telefondan izlemek için gizli takip bağlantısını kendinize gönderin; bağlantıyı bilen herkes siparişin durumunu görebilir.</p>
      <div class="link-row">
        <input class="link-input" id="trackLink${o.id}" value="${esc(trackUrl(o.id))}" readonly aria-label="Gizli takip bağlantısı">
        <button class="btn btn-ghost" type="button" data-action="share-link" data-id="${o.id}">${icon("share")}<span>Paylaş</span></button>
      </div>
    </div>
    ${docs ? `<div class="link-block">
      <p>Onayladığınız Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi, sipariş anındaki haliyle:</p>
      <p class="doc-actions">
        <a class="btn btn-ghost" href="${esc(docsUrl(o.id))}" target="_blank" rel="noopener noreferrer">${icon("doc")}Sözleşmeyi görüntüle / yazdır</a>
        <button class="btn btn-ghost" type="button" data-action="docs-download" data-id="${o.id}">${icon("download")}İndir</button>
      </p>
    </div>` : ""}
  </section>`;
}

function returnHtml(o) {
  if (o.status !== "Teslim edildi" || S.store?.features?.returnRequests === false) return "";
  const items = (o.items || [])
    .map(
      (i, n) => `<label class="check check-small"><input type="checkbox" name="ret" value="${i.productId}" data-qty="${i.qty}" id="ret${o.id}-${n}"><span>${esc(i.name)} <span class="muted">(${fmtQty(i.qty)} ${esc(i.unit || "adet")})</span></span></label>`,
    )
    .join("");
  return `<details class="track-card return-box">
    <summary><span>Cayma / iade talebi</span>${icon("down")}</summary>
    <form class="return-form" data-form="return" data-id="${o.id}" novalidate>
      <p class="muted">Ürünle ilgili sorunu yazın; talebiniz kayda geçer ve market sizinle iletişime geçer. Çabuk bozulan ürünlerde ve ambalajı açılmış hijyen ürünlerinde cayma hakkı yoktur; ayıplı ürün için her zaman başvurabilirsiniz. <a href="/iade-kosullari" target="_blank" rel="noopener">İptal, iade ve cayma koşulları</a></p>
      ${items ? `<fieldset class="ret-items"><legend class="field-label">İlgili ürünler <span class="opt">(isteğe bağlı)</span></legend>${items}</fieldset>` : ""}
      <div class="field"><label class="field-label" for="retMsg${o.id}">Talebiniz</label>
        <textarea id="retMsg${o.id}" name="message" rows="3" maxlength="500" placeholder="Örn. Sütlerden biri bozuk çıktı." aria-describedby="retErr${o.id}"></textarea></div>
      <p class="field-error" id="retErr${o.id}" role="alert" hidden></p>
      <button class="btn btn-primary" type="submit">Talebi gönder</button>
      <div class="ret-done" role="status"></div>
    </form>
  </details>`;
}

export function trackHtml(o, { fresh = false, animate = false } = {}) {
  const info = storeInfo();
  const waText = `Merhaba, ${o.id} numaralı siparişim hakkında yazıyorum.`;
  const head = fresh
    ? `<div class="confirm night">
        <img class="confirm-logo" src="/img/logo-96.webp" alt="" width="56" height="56">
        <div class="confirm-copy">
          <p class="confirm-kicker">${o.preorder ? "Ön siparişiniz alındı" : "Siparişiniz alındı"}</p>
          <p class="confirm-no"><span class="sr-only">Sipariş numarası </span>#${o.id}</p>
          <p class="confirm-text">${o.preorder ? "Dükkân açılınca hazırlanır." : "Markete iletildi."} Aşamalar bu sayfada kendiliğinden güncellenir; sayfayı yenilemeniz gerekmez.</p>
        </div>
      </div>`
    : `<a class="back-link" href="#/siparislerim">${icon("left")}Siparişlerim</a>
       <h1 class="page-h1">Sipariş #${o.id}</h1>`;
  return `<div class="page-pad narrow track" data-order="${o.id}">
    ${head}
    <section class="track-card" aria-labelledby="trackStatus">
      <div class="track-head">
        <h2 class="track-status" id="trackStatus">${esc(o.statusLabel || o.status)}</h2>
        <p class="track-date">${fmtDateTime(o.createdAt)}</p>
      </div>
      ${stepsHtml(o, { animate })}
      ${etaHtml(o)}
      ${cancelBoxHtml(o)}
      <div class="track-actions">
        ${o.canCancel ? `<button class="btn btn-ghost btn-danger" type="button" data-action="cancel-order" data-id="${o.id}">${icon("x")}Siparişi iptal et</button>` : ""}
        ${info.whatsapp ? `<a class="btn btn-ghost" href="${esc(waHref(info.whatsapp, waText))}" target="_blank" rel="noopener">${icon("wa")}Markete yaz</a>` : ""}
        ${info.phone ? `<a class="btn btn-ghost" href="${esc(telHref(info.phone))}">${icon("phone")}Ara</a>` : ""}
      </div>
    </section>
    ${fresh ? linksHtml(o, { fresh }) : ""}
    <section class="track-card" aria-labelledby="trackItems">
      <h2 class="sum-title" id="trackItems">Sipariş ayrıntısı</h2>
      ${orderDetails(o)}
      <button class="btn btn-ghost btn-block" type="button" data-action="reorder" data-id="${o.id}">${icon("repeat")}Aynı ürünleri sepete ekle</button>
    </section>
    ${fresh ? "" : linksHtml(o)}
    ${returnHtml(o)}
    ${fresh ? `<p class="track-more"><a class="btn btn-primary" href="#/">Alışverişe dön</a></p>` : ""}
  </div>`;
}

/** Tek siparişi tazeler (takip ekranı açılırken) */
export async function loadOrder(id) {
  const token = tokenOf(id);
  if (!token) return null;
  const r = await api("/api/orders/lookup", { method: "POST", body: { orders: [{ id, token }] } });
  if ((r.missing || []).includes(id)) {
    removeOrders([id]);
    return null;
  }
  applyOrders(r.orders || [], { source: "lookup" });
  return S.orderData.find((o) => o.id === id) || null;
}

// ---------- Numara + telefonla sorgu (yalnızca panelde açıksa) ----------
export const phoneLookupOn = () => S.store?.features?.phoneLookup === true;
export function lookupHtml(prefillId = "") {
  if (!phoneLookupOn()) return "";
  return `<form class="lookup" data-form="lookup" novalidate>
    <h2 class="sum-title">Başka cihazdan verdiğiniz sipariş</h2>
    <p class="lookup-help">Sipariş numarası ve telefonunuzla siparişin durumunu görün. İptal, sözleşme ve iade işlemleri yalnızca siparişi verdiğiniz cihazdan ya da takip bağlantısıyla yapılabilir.</p>
    <div class="lookup-row">
      <div class="field"><label class="field-label" for="lkId">Sipariş no</label><input id="lkId" name="id" inputmode="numeric" data-clean="digits" data-max="8" value="${esc(prefillId)}" autocomplete="off"></div>
      <div class="field"><label class="field-label" for="lkPhone">Telefon</label><input id="lkPhone" name="phone" type="tel" inputmode="tel" maxlength="20" data-clean="phone" placeholder="05XX XXX XX XX" value="${esc(S.profile.phone || "")}" autocomplete="tel"></div>
      <button class="btn btn-primary" type="submit">Sorgula</button>
    </div>
    <p class="field-error" id="lkError" role="alert" hidden></p>
    <div class="lookup-result" id="lkResult" aria-live="polite" hidden></div>
  </form>`;
}

// Telefonla sorgu salt okunurdur: sunucu takip anahtarı vermez; yalnızca durum gösterilir (cihaz listesine eklenmez)
function lookupResultHtml(o) {
  const hist = o.history || [];
  const last = hist[hist.length - 1];
  return `<div class="lr-head"><b>Sipariş #${o.id}</b> <span class="lr-status">${esc(o.statusLabel || o.status)}</span></div>
    <p class="lr-meta">${fmtDateTime(o.createdAt)} · ${Number(o.itemCount) || 0} ürün · ${tl(o.total)}${last ? ` · son güncelleme ${fmtDateTime(last.at)}` : ""}</p>
    ${o.status === "İptal" && o.cancelNote ? `<p class="lr-meta">Marketin notu: ${esc(o.cancelNote)}</p>` : ""}
    <p class="lookup-help">Bu ekran yalnızca durumu gösterir. Siparişi iptal etmek, sözleşmeyi görmek ya da iade talebi için siparişi verdiğiniz cihazı veya takip bağlantısını kullanın; ya da marketi arayın.</p>`;
}

export async function lookupOrder(form, navigate) {
  const id = form.id.value.replace(/\D/g, "");
  const phone = form.phone.value;
  const err = form.querySelector("#lkError");
  const out = form.querySelector("#lkResult");
  err.hidden = true;
  if (out) { out.hidden = true; out.innerHTML = ""; }
  const fail = (m) => {
    err.textContent = m;
    err.hidden = false;
  };
  if (!id) return fail("Sipariş numarasını yazın.");
  if (!/^0\d{10}$/.test(phone)) return fail("Telefon 0 ile başlamalı ve 11 haneli olmalı (örn. 05321234567).");
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const o = await api(`/api/orders/${id}?phone=${encodeURIComponent(phone)}`);
    if (out) {
      out.innerHTML = lookupResultHtml(o);
      out.hidden = false;
    }
  } catch (e) {
    fail(e.message);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Siparişlerim ----------
function orderRow(o) {
  const n = (o.items || []).reduce((s, i) => s + i.qty, 0);
  const tone = o.status === "İptal" ? "cancel" : isActive(o) ? "active" : "done";
  return `<li class="order-row is-${tone}" data-order-row="${o.id}">
    <a class="or-link" href="#/siparis/${o.id}">
      <span class="or-no">#${o.id}</span>
      <span class="or-main"><span class="or-status">${esc(o.statusLabel || o.status)}</span><span class="or-meta">${fmtDateTime(o.createdAt)}, ${n} ürün, ${tl(o.total)}</span>
        ${o.status === "İptal" && o.cancelNote ? `<span class="or-note">Marketin notu: ${esc(o.cancelNote)}</span>` : ""}</span>
      ${icon("right")}
    </a>
    <div class="or-actions">
      <a class="btn btn-small" href="#/siparis/${o.id}">${isActive(o) ? "Takip et" : "Ayrıntılar"}</a>
      <button class="btn btn-small btn-quiet" type="button" data-action="share-link" data-id="${o.id}">${icon("share")}Bağlantı</button>
      ${o.hasDocuments !== false ? `<a class="btn btn-small btn-quiet" href="${esc(docsUrl(o.id))}" target="_blank" rel="noopener noreferrer">${icon("doc")}Sözleşme</a>` : ""}
      ${o.status === "Teslim edildi" && S.store?.features?.returnRequests !== false ? `<a class="btn btn-small btn-quiet" href="#/siparis/${o.id}?iade=1">${icon("undo")}Cayma / iade</a>` : ""}
    </div>
  </li>`;
}

export function myOrdersRegion() {
  const list = S.orderData.filter((o) => S.myOrders.some((m) => m.id === o.id));
  const active = list.filter(isActive);
  const past = list.filter((o) => !isActive(o));
  if (!S.ordersLoaded && S.myOrders.length) return `<div class="sk sk-card"></div><div class="sk sk-card"></div>`;
  if (!list.length) {
    return `<div class="empty"><p class="empty-title">Bu cihazdan verilmiş sipariş yok.</p>
      <p>Bu cihazdan verdiğiniz siparişler burada, canlı durumlarıyla listelenir. Başka bir cihazdan verdiğiniz siparişi görmek için o siparişin takip bağlantısını bu cihazda açın.</p>
      <p class="empty-actions"><a class="btn btn-primary" href="#/kategoriler">Alışverişe başla</a></p></div>`;
  }
  return `<h2 class="group-title">Süren siparişler</h2>
    ${active.length ? `<ul class="order-list">${active.map(orderRow).join("")}</ul>` : `<p class="muted">Şu an süren siparişiniz yok.</p>`}
    ${past.length ? `<details class="past"${active.length ? "" : " open"}><summary>Geçmiş siparişler <span class="count-chip">${past.length}</span>${icon("down")}</summary><ul class="order-list">${past.map(orderRow).join("")}</ul></details>` : ""}`;
}

export function myOrdersView() {
  return `<div class="page-pad narrow">
    <h1 class="page-h1">Siparişlerim</h1>
    <p class="page-sub">Yalnızca bu cihazdan verilen siparişler. Durumlar kendiliğinden güncellenir.</p>
    <div data-region="orders">${myOrdersRegion()}</div>
    <p class="device-note">${icon("alert")}<span>Liste bu tarayıcıda saklanır. Tarayıcı verilerini silerseniz liste kaybolur; siparişin kendisi kaybolmaz, takip bağlantısıyla yeniden ekleyebilirsiniz.</span></p>
    ${lookupHtml()}
  </div>`;
}

// ---------- Paylaş / kopyala ----------
export async function shareLink(id) {
  const url = trackUrl(id);
  try {
    if (navigator.share) {
      await navigator.share({ title: `Sipariş #${id} takibi`, text: `${storeInfo().name || "Market"} sipariş #${id} takip bağlantısı`, url });
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Takip bağlantısı kopyalandı");
  } catch {
    const input = document.getElementById(`trackLink${id}`);
    if (input) {
      input.focus();
      input.select();
      toast("Bağlantı seçildi; kopyalayıp kendinize gönderin.");
    } else toast(url, { ms: 6000 });
  }
}

// ---------- Belgeler (indirilebilir tek dosya) ----------
export async function downloadDocs(id) {
  try {
    const d = await api(`/api/orders/${id}/documents`, { method: "POST", body: { token: tokenOf(id) } });
    if (!d.documents?.length) {
      toast("Bu sipariş için kayıtlı belge yok.", { tone: "warn" });
      return;
    }
    const info = storeInfo();
    const when = d.consent?.at ? new Date(d.consent.at).toLocaleString("tr-TR") : "";
    const consents = (d.consent?.accepted || []).map((c) => `<li>${esc(c.label)}</li>`).join("");
    const body = d.documents
      .map((doc) => `<section><h2>${esc(doc.title)}</h2>${doc.html}<p class="v">Metin sürümü: ${esc(String(doc.version || "").slice(0, 12))}</p></section>`)
      .join("");
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Sipariş #${id} sözleşme ve ön bilgilendirme · ${esc(info.name || "")}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;color:#121212;max-width:760px;margin:24px auto;padding:0 16px}h1{font-size:26px}h2{font-size:20px;margin-top:28px;border-top:2px solid #121212;padding-top:14px}.v{color:#5b5750;font-size:13px}</style></head>
<body><h1>${esc(info.name || "")} · Sipariş #${id}</h1><p>Onay zamanı: ${esc(when)}</p>${consents ? `<p>Verilen onaylar:</p><ul>${consents}</ul>` : ""}${body}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `siparis-${id}-sozlesme.html`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("Sözleşme indirildi");
  } catch (e) {
    toast(e.message, { tone: "error" });
  }
}

// ---------- Cayma / iade talebi ----------
export async function sendReturn(form) {
  const id = Number(form.dataset.id);
  const err = form.querySelector(".field-error");
  const msg = form.message.value.trim();
  err.hidden = true;
  if (!msg) {
    err.textContent = "Talebinizi birkaç kelimeyle yazın.";
    err.hidden = false;
    form.message.setAttribute("aria-invalid", "true");
    form.message.focus();
    return;
  }
  form.message.removeAttribute("aria-invalid");
  const items = [...form.querySelectorAll('input[name="ret"]:checked')].map((c) => ({ productId: Number(c.value), qty: Number(c.dataset.qty) || 1 }));
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  // Yanıt gelmeden canlı akış ekranı yeniden çizebilir: sonucu o anki forma yaz
  const live = () => document.querySelector(`.return-form[data-id="${id}"]`) || form;
  try {
    const r = await api(`/api/orders/${id}/return-request`, { method: "POST", body: { token: tokenOf(id), message: msg, items } });
    const f = live();
    f.querySelector(".ret-done").innerHTML = `<p class="note note-ok">${icon("check")}<span>${esc(r.message || "Talebiniz alındı.")}</span></p>`;
    f.message.value = "";
    for (const c of f.querySelectorAll('input[name="ret"]')) c.checked = false;
  } catch (e) {
    const f = live();
    const er = f.querySelector(".field-error");
    er.textContent = e.message;
    er.hidden = false;
  } finally {
    const b = live().querySelector('button[type="submit"]');
    if (b) b.disabled = false;
    btn.disabled = false;
  }
}

// ---------- İptal ----------
export function openCancelDialog(id) {
  const dlg = $("#confirmDialog");
  dlg.innerHTML = `<form class="sheet-inner" method="dialog" data-form="cancel" data-id="${id}">
    <h2 class="sheet-title" id="cdTitle">Sipariş #${id} iptal edilsin mi?</h2>
    <p>Sipariş henüz hazırlanmaya başlamadı, şimdi iptal edebilirsiniz. Bu işlem geri alınamaz.</p>
    <div class="field"><label class="field-label" for="cancelReason">İptal nedeni <span class="opt">(isteğe bağlı)</span></label>
      <textarea id="cancelReason" name="reason" rows="2" maxlength="200" placeholder="Örn. Yanlış adres yazdım"></textarea></div>
    <p class="field-error" id="cancelErr" role="alert" hidden></p>
    <div class="sheet-actions">
      <button class="btn btn-ghost" type="button" data-action="close-dialog">Vazgeç</button>
      <button class="btn btn-danger-solid" type="submit" value="ok">İptal et</button>
    </div>
  </form>`;
  dlg.showModal();
  dlg.querySelector("#cancelReason").focus();
}

export async function confirmCancel(form) {
  const id = Number(form.dataset.id);
  const err = form.querySelector("#cancelErr");
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const o = await api(`/api/orders/${id}/cancel`, { method: "POST", body: { token: tokenOf(id), reason: form.reason.value.trim() || undefined } });
    upsert(o);
    emit("orders", { changed: [id] });
    form.closest("dialog").close();
    return o;
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    if (e.code === "IPTAL_EDILEMEZ" || e.code === "IPTAL_EDILMIS") loadOrder(id).catch(() => {});
    return null;
  } finally {
    btn.disabled = false;
  }
}

/** Siparişteki ürünleri (hâlâ satıştaysa) sepete ekler */
export function reorder(id) {
  const o = S.orderData.find((x) => x.id === id);
  if (!o) return { added: 0, missing: 0 };
  let added = 0;
  let missing = 0;
  for (const it of o.items || []) {
    const p = S.byId.get(it.productId);
    if (!p || p.soldOut) {
      missing++;
      continue;
    }
    const q = setQty(p.id, (S.cart[p.id] || 0) + it.qty, { silent: true });
    if (q) added++;
  }
  emit("cart", {});
  return { added, missing };
}
