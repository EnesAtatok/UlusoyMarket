// Sipariş takibi, Siparişlerim, numara + telefonla sorgu, müşteri iptali, üst şerit.
import { $, esc, tl, icon, api, save, fmtTime, fmtDateTime, telHref, waHref } from "./lib.js";
import { S, emit, storeInfo, setQty } from "./state.js";

const STEPS = ["Yeni", "Hazırlanıyor", "Yolda", "Teslim edildi"];
export const isActive = (o) => o.status !== "Teslim edildi" && o.status !== "İptal";
// Yalnızca marketin iptal ettiği siparişler duyurulur (müşteri kendi iptalini zaten biliyor)
const isRecentCancel = (o) => o.status === "İptal" && o.cancelledBy !== "musteri" && Date.now() - new Date(o.updatedAt).getTime() < 2 * 24 * 3600 * 1000;
const stepLabel = (o, s) => (s === "Yeni" ? "Alındı" : s === "Yolda" && o.type === "gelal" ? "Hazır" : s);
const PAY = { nakit: "Nakit, teslimatta", kart: "Kart, teslimatta" };
const SUBST = { ara: "Beni arayın", benzer: "Benzeriyle değiştirin", cikar: "Siparişten çıkarın" };

export function rememberOrder(id, token, data) {
  S.myOrders = [{ id, token }, ...S.myOrders.filter((o) => o.id !== id)].slice(0, 30);
  save("myOrders", S.myOrders);
  if (data) upsert(data);
}
function upsert(o) {
  S.orderData = [o, ...S.orderData.filter((x) => x.id !== o.id)].sort((a, b) => b.id - a.id);
}

/** Bu cihazdan verilen siparişlerin güncel durumunu çeker; sunucuda olmayanları listeden atar */
export async function fetchMyOrders() {
  if (!S.myOrders.length) {
    S.orderData = [];
    S.ordersLoaded = true;
    emit("orders");
    return [];
  }
  const results = await Promise.all(
    S.myOrders.map((o) =>
      fetch(`/api/orders/${o.id}?token=${encodeURIComponent(o.token)}`)
        .then((r) => (r.ok ? r.json() : r.status === 404 ? { missing: o.id } : null))
        .catch(() => null),
    ),
  );
  const missing = results.filter((r) => r && r.missing).map((r) => r.missing);
  if (missing.length) {
    S.myOrders = S.myOrders.filter((o) => !missing.includes(o.id));
    save("myOrders", S.myOrders);
  }
  const ok = results.filter((r) => r && !r.missing);
  // Ağ hatasında eldeki veriyi koru
  const failed = results.some((r) => r === null);
  S.orderData = failed ? mergeKeep(ok) : ok.sort((a, b) => b.id - a.id);
  S.ordersLoaded = true;
  emit("orders");
  return S.orderData;
}
function mergeKeep(fresh) {
  const map = new Map(S.orderData.map((o) => [o.id, o]));
  for (const o of fresh) map.set(o.id, o);
  return [...map.values()].filter((o) => S.myOrders.some((m) => m.id === o.id)).sort((a, b) => b.id - a.id);
}

export const activeOrders = () => S.orderData.filter(isActive);

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
function stepsHtml(o) {
  if (o.status === "İptal") return "";
  const idx = STEPS.indexOf(o.status);
  const at = (s) => o.history?.filter((h) => h.status === s).at(0)?.at;
  return `<ol class="steps" aria-label="Sipariş aşamaları">${STEPS.map((s, i) => {
    const state = i < idx ? "done" : i === idx ? "current" : "todo";
    const t = at(s);
    return `<li class="step is-${state}"${i === idx ? ' aria-current="step"' : ""}>
      <span class="step-dot" aria-hidden="true">${i < idx || (i === idx && s === "Teslim edildi") ? icon("check") : ""}</span>
      <span class="step-label">${esc(stepLabel(o, s))}</span>
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

function orderDetails(o) {
  return `<dl class="kv">
      <div><dt>Teslimat</dt><dd>${o.type === "gelal" ? "Gelip alacağım" : `Eve teslim${o.customer?.zoneName ? `, ${esc(o.customer.zoneName)}` : ""}`}</dd></div>
      <div><dt>Ödeme</dt><dd>${PAY[o.payment] || esc(o.payment)}${o.payment === "nakit" && o.changeFor ? `, ${tl(o.changeFor)} ile ödenecek` : ""}</dd></div>
      ${o.substitution ? `<div><dt>Ürün bulunamazsa</dt><dd>${SUBST[o.substitution] || esc(o.substitution)}</dd></div>` : ""}
      ${o.note ? `<div><dt>Not</dt><dd>${esc(o.note)}</dd></div>` : ""}
    </dl>
    <ul class="co-lines">${(o.items || []).map((i) => `<li><span class="co-q">${i.qty}×</span><span class="co-n">${esc(i.name)}</span><span class="co-t">${tl(i.price * i.qty)}</span></li>`).join("")}</ul>
    <dl class="totals">
      <div><dt>Ara toplam</dt><dd>${tl(o.subtotal)}</dd></div>
      ${o.discount ? `<div class="totals-discount"><dt>İndirim${o.couponCode ? ` (${esc(o.couponCode)})` : ""}</dt><dd>−${tl(o.discount)}</dd></div>` : ""}
      ${o.type !== "gelal" ? `<div><dt>Teslimat</dt><dd>${o.deliveryFee ? tl(o.deliveryFee) : "Ücretsiz"}</dd></div>` : ""}
      <div class="totals-total"><dt>Toplam</dt><dd>${tl(o.total)}</dd></div>
    </dl>`;
}

export function trackHtml(o, { fresh = false } = {}) {
  const info = storeInfo();
  const waText = `Merhaba, ${o.id} numaralı siparişim hakkında yazıyorum.`;
  const head = fresh
    ? `<div class="confirm night">
        <img class="confirm-logo" src="/img/logo.webp" alt="" width="56" height="59">
        <p class="confirm-kicker">Siparişiniz alındı</p>
        <p class="confirm-no"><span class="sr-only">Sipariş numarası </span>#${o.id}</p>
        <p class="confirm-text">${o.preorder ? "Ön siparişiniz kaydedildi; dükkân açılınca hazırlanır." : "Siparişiniz markete iletildi. Hazırlanmaya başlayınca bu sayfa kendiliğinden güncellenir."} Bu numarayı not alın; başka bir cihazdan telefon numaranızla da sorgulayabilirsiniz.</p>
      </div>`
    : `<a class="back-link" href="#/siparislerim">${icon("left")}Siparişlerim</a>
       <h1 class="page-h1">Sipariş #${o.id}</h1>`;
  return `<div class="page-pad narrow track" data-order="${o.id}">
    ${head}
    <section class="track-card" aria-labelledby="trackStatus">
      <div class="track-head">
        <h2 class="track-status" id="trackStatus"${fresh ? "" : ""}>${esc(o.statusLabel || o.status)}</h2>
        <p class="track-date">${fmtDateTime(o.createdAt)}</p>
      </div>
      ${stepsHtml(o)}
      ${etaHtml(o)}
      ${cancelBoxHtml(o)}
      <div class="track-actions">
        ${o.canCancel ? `<button class="btn btn-ghost btn-danger" type="button" data-action="cancel-order" data-id="${o.id}">${icon("x")}Siparişi iptal et</button>` : ""}
        ${info.whatsapp ? `<a class="btn btn-ghost" href="${esc(waHref(info.whatsapp, waText))}" target="_blank" rel="noopener">${icon("chat")}Markete yaz</a>` : ""}
        ${info.phone ? `<a class="btn btn-ghost" href="${esc(telHref(info.phone))}">${icon("phone")}Ara</a>` : ""}
      </div>
    </section>
    <section class="track-card" aria-labelledby="trackItems">
      <h2 class="sum-title" id="trackItems">Sipariş ayrıntısı</h2>
      ${orderDetails(o)}
      <button class="btn btn-primary btn-block" type="button" data-action="reorder" data-id="${o.id}">${icon("repeat")}Aynı ürünleri sepete ekle</button>
    </section>
    ${fresh ? `<p class="track-more"><a class="btn btn-text" href="#/">Alışverişe dön</a></p>` : ""}
  </div>`;
}

export async function loadOrder(id) {
  const mine = S.myOrders.find((o) => o.id === id);
  if (!mine) return null;
  const o = await api(`/api/orders/${id}?token=${encodeURIComponent(mine.token)}`);
  upsert(o);
  emit("orders");
  return o;
}

export function lookupHtml(prefillId = "") {
  return `<form class="lookup" data-form="lookup" novalidate>
    <h2 class="sum-title">Sipariş sorgula</h2>
    <p class="lookup-help">Başka bir cihazdan verdiğiniz siparişi sipariş numarası ve telefonunuzla bulun.</p>
    <div class="lookup-row">
      <div class="field"><label class="field-label" for="lkId">Sipariş no</label><input id="lkId" name="id" inputmode="numeric" data-clean="digits" data-max="8" value="${esc(prefillId)}" autocomplete="off"></div>
      <div class="field"><label class="field-label" for="lkPhone">Telefon</label><input id="lkPhone" name="phone" type="tel" inputmode="tel" maxlength="20" data-clean="phone" placeholder="05XX XXX XX XX" value="${esc(S.profile.phone || "")}" autocomplete="tel"></div>
      <button class="btn btn-primary" type="submit">Sorgula</button>
    </div>
    <p class="field-error" id="lkError" role="alert" hidden></p>
  </form>`;
}

function orderRow(o) {
  const n = (o.items || []).reduce((s, i) => s + i.qty, 0);
  return `<li><a class="order-row${o.status === "İptal" ? " is-cancel" : ""}" href="#/siparis/${o.id}">
    <span class="or-no">#${o.id}</span>
    <span class="or-main"><span class="or-status">${esc(o.statusLabel || o.status)}</span><span class="or-meta">${fmtDateTime(o.createdAt)}, ${n} ürün</span>
      ${o.status === "İptal" && o.cancelNote ? `<span class="or-note">Marketin notu: ${esc(o.cancelNote)}</span>` : ""}</span>
    <span class="or-total">${tl(o.total)}</span>${icon("right")}
  </a></li>`;
}

export function myOrdersView() {
  const list = S.orderData;
  const active = list.filter(isActive);
  const past = list.filter((o) => !isActive(o));
  let body;
  if (!S.ordersLoaded && S.myOrders.length) body = `<div class="sk sk-card"></div><div class="sk sk-card"></div>`;
  else if (!list.length) body = `<div class="empty"><p class="empty-title">Bu cihazdan verilmiş sipariş yok.</p><p>Verdiğiniz siparişler burada listelenir. Başka cihazdan verdiyseniz aşağıdan sorgulayın.</p></div>`;
  else {
    body = `<h2 class="group-title">Aktif siparişler</h2>
      ${active.length ? `<ul class="order-list">${active.map(orderRow).join("")}</ul>` : `<p class="muted">Şu an aktif siparişiniz yok.</p>`}
      ${past.length ? `<details class="past"${active.length ? "" : " open"}><summary>Geçmiş siparişler <span class="count-chip">${past.length}</span>${icon("down")}</summary><ul class="order-list">${past.map(orderRow).join("")}</ul></details>` : ""}`;
  }
  return `<div class="page-pad narrow">
    <h1 class="page-h1">Siparişlerim</h1>
    <div data-region="orders">${body}</div>
    ${lookupHtml()}
  </div>`;
}

export async function lookupOrder(form, navigate) {
  const id = form.id.value.replace(/\D/g, "");
  const phone = form.phone.value;
  const err = form.querySelector("#lkError");
  err.hidden = true;
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
    if (o.token) rememberOrder(o.id, o.token, o);
    emit("orders");
    navigate(`#/siparis/${o.id}`);
  } catch (e) {
    fail(e.message);
  } finally {
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
  const mine = S.myOrders.find((o) => o.id === id);
  const err = form.querySelector("#cancelErr");
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const o = await api(`/api/orders/${id}/cancel`, { method: "POST", body: { token: mine?.token, reason: form.reason.value.trim() || undefined } });
    upsert(o);
    emit("orders");
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
