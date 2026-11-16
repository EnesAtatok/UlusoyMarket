// Sepet (sayfa + masaüstü yan panel + mobil yapışkan özet) ve sipariş formu.
import { $, esc, tl, icon, telHref, waHref, api, save, toast } from "./lib.js";
import {
  S, emit, cartLines, cartCount, cartLocalTotal, zones, zoneById, status, storeInfo, setDelivery, setCoupon,
  saveProfile, requestQuote, applyQuote, blockingErrors, clearCart, quoteBody,
} from "./state.js";
import { media, qtyControl } from "./shop.js";
import { rememberOrder } from "./orders.js";

// ---------- Form karakter kuralları (sunucudakiyle aynı; eski prototipten korunur) ----------
const TR = "A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû";
export const RULES = { nameMax: 60, addressMin: 10, addressMax: 250, addressMaxLines: 5, noteMax: 300 };
const FILTERS = {
  name: new RegExp(`[^${TR} .'-]`, "g"),
  address: new RegExp(`[^0-9${TR} .,:;/#'()\\n-]`, "g"),
};
const NAME_RE = new RegExp(`^[${TR}][${TR} .'-]+$`);
const ADDR_RE = new RegExp(`^[0-9${TR} .,:;/#'()\\n-]+$`);

/** Telefon: yalnızca rakam; +90/90/5… biçimleri 0… olur; en fazla 11 hane */
export function cleanPhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.startsWith("90") && d.length > 11) d = d.slice(2);
  if (d && d[0] !== "0") d = "0" + d;
  return d.slice(0, 11);
}
/** Yazarken izin verilmeyen karakterleri atar (yapıştırma dahil), imleci korur */
export function cleanField(el) {
  const before = el.value;
  let after = before;
  const kind = el.dataset.clean;
  if (kind === "phone") after = cleanPhone(before);
  else if (kind === "digits") after = before.replace(/\D/g, "").slice(0, Number(el.dataset.max) || 8);
  else if (FILTERS[kind]) after = before.replace(FILTERS[kind], "").replace(/ {2,}/g, " ");
  if (kind === "address") {
    after = after.replace(/\n{2,}/g, "\n").split("\n").slice(0, RULES.addressMaxLines).join("\n").slice(0, RULES.addressMax);
  }
  if (kind === "name") after = after.slice(0, RULES.nameMax);
  if (after !== before) {
    const pos = Math.max(0, (el.selectionStart ?? after.length) - (before.length - after.length));
    el.value = after;
    try { el.setSelectionRange(pos, pos); } catch {}
  }
  const counter = el.id && document.querySelector(`[data-counter-for="${el.id}"]`);
  if (counter) {
    const max = Number(el.getAttribute("maxlength")) || 0;
    counter.textContent = `${el.value.length} / ${max}`;
    counter.classList.toggle("at-limit", el.value.length >= max);
  }
}

// ---------- Ortak parçalar ----------
const quoteLine = (id) => S.quote?.items?.find((i) => i.productId === id);

function lineHtml({ product: p, qty }) {
  const ql = quoteLine(p.id);
  const lineTotal = ql && ql.qty === qty ? ql.lineTotal : p.price * qty;
  return `<li class="cline" data-pid="${p.id}">
    <button class="cline-media" type="button" data-action="product" data-id="${p.id}" aria-label="${esc(p.name)} ayrıntıları">${media(p)}</button>
    <div class="cline-info">
      <p class="cline-name">${esc(p.name)}</p>
      <p class="cline-unit">${tl(p.price)}${p.unit && p.unit !== "adet" ? ` / ${esc(p.unit)}` : ""}</p>
    </div>
    <div class="cline-qty qty-slot" data-qty="${p.id}">${qtyControl(p)}</div>
    <p class="cline-total">${tl(lineTotal)}</p>
  </li>`;
}

function deliveryPicker() {
  const o = S.store.ordering || {};
  const zs = zones();
  const z = zoneById(S.delivery.zoneId);
  const type = S.delivery.type;
  return `<div class="delivery-pick">
    ${o.pickupEnabled ? `<div class="seg" role="radiogroup" aria-label="Teslimat şekli">
      <label class="seg-opt"><input type="radio" name="dtype" value="teslimat" data-action="dtype"${type === "teslimat" ? " checked" : ""}><span>${icon("truck")}Eve teslim</span></label>
      <label class="seg-opt"><input type="radio" name="dtype" value="gelal" data-action="dtype"${type === "gelal" ? " checked" : ""}><span>${icon("store")}Gelip alırım</span></label>
    </div>` : ""}
    ${type === "teslimat" ? `<label class="field field-inline"><span class="field-label">Teslimat bölgesi</span>
      <span class="select-wrap"><select data-action="zone" name="zoneSel">
        <option value="">Bölge seçin</option>
        ${zs.map((x) => `<option value="${x.id}"${z && z.id === x.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}
      </select>${icon("down")}</span></label>
      ${z ? `<p class="zone-note">${z.fee ? `${tl(z.fee)} teslimat ücreti` : "Teslimat ücretsiz"}, en az ${tl(z.minOrder || 0)} sipariş, yaklaşık ${z.etaMinutes} dakikada kapınızda.</p>` : ""}`
    : `<p class="zone-note">Siparişinizi dükkândan alırsınız: ${esc(storeInfo().address || "")}</p>`}
  </div>`;
}

function couponForm() {
  const m = S.couponMsg;
  const applied = S.coupon && m && m.valid;
  if (applied) {
    return `<div class="coupon coupon-applied">${icon("tag")}<p><strong>${esc(m.message)}</strong></p>
      <button class="btn btn-text" type="button" data-action="coupon-remove">Kaldır</button></div>`;
  }
  return `<form class="coupon" data-form="coupon" novalidate>
    <label class="sr-only" for="couponInput">Kupon kodu</label>
    <input id="couponInput" name="code" placeholder="Kupon kodu" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="30" value="${esc(S.coupon || (m && !m.valid ? m.code || "" : ""))}" ${m && !m.valid ? 'aria-invalid="true" aria-describedby="couponErr"' : ""}>
    <button class="btn btn-ghost" type="submit">Uygula</button>
    ${m && !m.valid ? `<p class="field-error" id="couponErr">${esc(m.message)}</p>` : ""}
  </form>`;
}

function progressHtml(q) {
  if (!q) return "";
  const out = [];
  if (q.type === "teslimat" && q.minOrderRemaining > 0) {
    const pct = Math.min(100, (q.subtotal / q.minOrder) * 100);
    out.push(`<div class="meter meter-min"><p>Minimum sipariş tutarı ${tl(q.minOrder)}. Sepetinize <strong>${tl(q.minOrderRemaining)}</strong> daha ekleyin.</p><span class="meter-bar" aria-hidden="true"><span style="width:${pct.toFixed(1)}%"></span></span></div>`);
  } else if (q.freeDeliveryRemaining > 0 && q.freeDeliveryOver) {
    const pct = Math.min(100, (q.subtotal / q.freeDeliveryOver) * 100);
    out.push(`<div class="meter"><p>Ücretsiz teslimata <strong>${tl(q.freeDeliveryRemaining)}</strong> kaldı.</p><span class="meter-bar" aria-hidden="true"><span style="width:${pct.toFixed(1)}%"></span></span></div>`);
  } else if (q.freeDelivery) {
    out.push(`<div class="meter meter-done"><p>${icon("check")}Teslimat ücretsiz.</p></div>`);
  }
  return out.join("");
}

function totalsHtml(q) {
  if (!q) {
    return `<dl class="totals is-loading" aria-busy="true"><div><dt>Ara toplam</dt><dd>${tl(cartLocalTotal())}</dd></div><div class="totals-total"><dt>Toplam</dt><dd>Hesaplanıyor</dd></div></dl>`;
  }
  const zoneMissing = q.type === "teslimat" && (q.errors || []).some((e) => e.code === "BOLGE_SECIN");
  let fee;
  if (q.type === "gelal") fee = "Gel-al";
  else if (zoneMissing) fee = "Bölge seçince";
  else if (q.deliveryFee === 0) fee = q.freeDelivery ? `<s>${tl(q.baseDeliveryFee)}</s> Ücretsiz` : "Ücretsiz";
  else fee = tl(q.deliveryFee);
  return `<dl class="totals${S.quoteLoading ? " is-loading" : ""}">
    <div><dt>Ara toplam</dt><dd>${tl(q.subtotal)}</dd></div>
    ${q.discount ? `<div class="totals-discount"><dt>İndirim${q.coupon?.code ? ` (${esc(q.coupon.code)})` : ""}</dt><dd>−${tl(q.discount)}</dd></div>` : ""}
    <div><dt>Teslimat</dt><dd>${fee}</dd></div>
    <div class="totals-total"><dt>Toplam</dt><dd>${tl(q.total)}</dd></div>
  </dl>`;
}

/** Kapalı / durdurulmuş durumda sipariş düğmesinin yerine geçen kutu */
export function closedBox() {
  const st = status();
  const i = storeInfo();
  return `<div class="closed-box" role="status">
    <p class="closed-title">${icon("moon")}${esc(st.label || "Şu an sipariş alamıyoruz")}</p>
    <p>${esc(st.message || "")}</p>
    <p class="closed-actions">
      ${i.phone ? `<a class="btn btn-primary" href="${esc(telHref(i.phone))}">${icon("phone")}Ara</a>` : ""}
      ${i.whatsapp ? `<a class="btn btn-ghost" href="${esc(waHref(i.whatsapp, "Merhaba, sipariş vermek istiyorum."))}" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a>` : ""}
    </p>
  </div>`;
}

function preorderNote() {
  const st = status();
  if (!st.preorder) return "";
  return `<p class="note note-info">${icon("clock")}<span>Şu an kapalıyız; siparişiniz <strong>ön sipariş</strong> olarak alınır ve ${esc(st.opensDay || "")} ${esc(st.opensAt || "")} açılışta hazırlanır.</span></p>`;
}

function noticesHtml() {
  if (!S.notices.length) return "";
  return `<div class="note note-warn" role="alert">${icon("alert")}<div><p>Sepetiniz güncellendi:</p><ul>${S.notices.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>
    <button class="icon-btn" type="button" data-action="dismiss-notices" aria-label="Uyarıyı kapat">${icon("x")}</button></div>`;
}

function ctaHtml(q, { compact = false } = {}) {
  const st = status();
  if (!st.acceptingOrders) return closedBox();
  const errs = blockingErrors(q, { ignoreZone: true });
  // Minimum tutar eksiği zaten ilerleme çubuğunda yazıyor; tekrar etme
  const msg = S.quoteError ? S.quoteError : errs.length && errs[0].code !== "MIN_TUTAR" ? errs[0].message : "";
  const disabled = !q || errs.length > 0 || !!S.quoteError;
  return `${preorderNote()}
    ${msg ? `<p class="cta-msg" role="status">${esc(msg)}</p>` : ""}
    <a class="btn btn-primary btn-block btn-lg${disabled ? " is-disabled" : ""}" href="#/odeme"${disabled ? ' aria-disabled="true" data-action="noop"' : ""}>Siparişe geç${q && !compact ? `<span class="btn-amount">${tl(q.total)}</span>` : ""}</a>`;
}

function emptyCart() {
  return `<div class="empty empty-cart">
    <span class="empty-art" aria-hidden="true"><img src="/img/logo.webp" alt="" width="72" height="76"></span>
    <p class="empty-title">Sepetiniz boş.</p>
    <p>Reyonlara göz atın ya da aradığınız ürünü yukarıdan yazın.</p>
    <p class="empty-actions"><a class="btn btn-primary" href="#/kategoriler">Alışverişe başla</a></p>
  </div>`;
}

// ---------- Sepet sayfası ----------
export function cartView() {
  const lines = cartLines();
  if (!lines.length) return `<div class="page-pad narrow"><h1 class="page-h1">Sepet</h1>${noticesHtml()}${emptyCart()}</div>`;
  return `<div class="page-pad cart-page">
    <div class="catalog-head"><h1 class="page-h1">Sepet</h1><p class="result-count">${cartCount()} ürün</p></div>
    <div class="cart-cols">
      <div class="cart-main">
        <div data-region="notices">${noticesHtml()}</div>
        <ul class="clines" data-region="lines">${lines.map(lineHtml).join("")}</ul>
        <p class="cart-more"><a class="btn btn-text" href="#/kategoriler">${icon("plus")}Ürün eklemeye devam et</a>
          <button class="btn btn-text btn-danger" type="button" data-action="cart-clear">${icon("trash")}Sepeti boşalt</button></p>
      </div>
      <div class="cart-side summary-card" data-region="summary">${summaryInner()}</div>
    </div>
  </div>`;
}
function summaryInner() {
  const q = S.quote;
  return `<h2 class="sum-title">Sipariş özeti</h2>
    ${deliveryPicker()}
    ${couponForm()}
    ${progressHtml(q)}
    ${totalsHtml(q)}
    ${ctaHtml(q)}`;
}

/** Sepet sayfasında yalnızca değişen bölgeleri yeniler (giriş alanlarındaki odak korunur) */
export function refreshCartView() {
  const main = $("#main");
  if (!cartLines().length) {
    main.innerHTML = cartView();
    return;
  }
  const lines = main.querySelector('[data-region="lines"]');
  if (!lines) {
    main.innerHTML = cartView();
    return;
  }
  const ids = cartLines().map((l) => String(l.product.id));
  const shown = [...lines.children].map((li) => li.dataset.pid);
  if (ids.join() !== shown.join()) {
    const focusId = document.activeElement?.closest?.(".cline")?.dataset.pid;
    lines.innerHTML = cartLines().map(lineHtml).join("");
    if (focusId) lines.querySelector(`[data-pid="${focusId}"] button`)?.focus();
  } else {
    for (const l of cartLines()) {
      const li = lines.querySelector(`[data-pid="${l.product.id}"] .cline-total`);
      const ql = quoteLine(l.product.id);
      if (li) li.textContent = tl(ql && ql.qty === l.qty ? ql.lineTotal : l.product.price * l.qty);
    }
  }
  const count = main.querySelector(".result-count");
  if (count) count.textContent = `${cartCount()} ürün`;
  const notices = main.querySelector('[data-region="notices"]');
  if (notices) notices.innerHTML = noticesHtml();
  refreshSummary(main.querySelector('[data-region="summary"]'), summaryInner);
}

/** Özet bölgesini yeniler; kupon alanında yazılan metin ve odak korunur */
function refreshSummary(el, fn) {
  if (!el) return;
  const active = document.activeElement;
  const keep = el.contains(active) ? (active.name || active.dataset.action || "") : "";
  const typed = el.querySelector("#couponInput")?.value;
  el.innerHTML = fn();
  const ci = el.querySelector("#couponInput");
  if (ci && typed !== undefined && !S.couponMsg) ci.value = typed;
  if (keep) (el.querySelector(`[name="${keep}"]`) || el.querySelector(`[data-action="${keep}"]`))?.focus?.();
}

// ---------- Masaüstü yan panel ----------
export function renderAside(visible) {
  const el = $("#cartAside");
  if (!el) return;
  el.hidden = !visible;
  if (!visible) {
    el.innerHTML = "";
    return;
  }
  const lines = cartLines();
  if (!lines.length) {
    el.innerHTML = `<div class="aside-inner"><h2 class="sum-title">Sepet</h2><p class="aside-empty">Sepetiniz boş. Ürün kartlarındaki + düğmesiyle ekleyin.</p></div>`;
    return;
  }
  const q = S.quote;
  refreshSummary(el, () => `<div class="aside-inner">
    <h2 class="sum-title">Sepet <span class="result-count">${cartCount()} ürün</span></h2>
    <ul class="clines clines-compact">${lines.map(lineHtml).join("")}</ul>
    ${deliveryPicker()}
    ${progressHtml(q)}
    ${totalsHtml(q)}
    ${ctaHtml(q, { compact: true })}
  </div>`);
}

// ---------- Mobil yapışkan özet ----------
export function renderCartBar(visible, mode = "shop") {
  const bar = $("#cartBar");
  const n = cartCount();
  if (!visible || !n) {
    bar.hidden = true;
    document.body.classList.remove("has-cartbar");
    return;
  }
  bar.hidden = false;
  document.body.classList.add("has-cartbar");
  if (mode === "cart") {
    // Sepet ekranında: sunucu toplamı + siparişe geç (özet aşağıda kaldığında)
    const q = S.quote;
    const st = status();
    const errs = blockingErrors(q, { ignoreZone: true });
    const ok = q && !errs.length && st.acceptingOrders && !S.quoteError;
    bar.innerHTML = `<div class="cart-bar-link">
      <span class="cart-bar-count"><span>Toplam</span></span>
      <span class="cart-bar-total">${q ? tl(q.total) : "…"}</span>
      ${ok ? `<a class="cart-bar-go" href="#/odeme">Siparişe geç</a>` : `<button class="cart-bar-go" type="button" data-action="to-summary">${st.acceptingOrders ? "Eksikleri gör" : "Durumu gör"}</button>`}
    </div>`;
    return;
  }
  bar.innerHTML = `<a class="cart-bar-link" href="#/sepet">
    <span class="cart-bar-count">${icon("basket")}<span>${n} ürün</span></span>
    <span class="cart-bar-total">${tl(cartLocalTotal())}</span>
    <span class="cart-bar-go">Sepete git</span>
  </a>`;
}

// ---------- Sipariş formu ----------
const field = (id, label, control, { hint = "", counter = "" } = {}) => `<div class="field" data-field="${id}">
  <label class="field-label" for="${id}">${label}</label>
  ${control}
  ${hint || counter ? `<p class="field-hint" id="${id}Hint"><span>${hint}</span>${counter}</p>` : ""}
  <p class="field-error" id="${id}Err" hidden></p>
</div>`;

function savedAddresses() {
  const list = S.addresses.filter((a) => zoneById(a.zoneId));
  if (!list.length) return "";
  return `<fieldset class="saved-addr"><legend class="field-label">Kayıtlı adresleriniz</legend>
    ${list
      .map(
        (a) => `<div class="addr-opt"><label><input type="radio" name="savedAddr" value="${a.id}" data-action="saved-addr"><span><strong>${esc(zoneById(a.zoneId)?.name || "")}</strong>${esc(a.address)}</span></label>
        <button class="icon-btn" type="button" data-action="addr-delete" data-id="${a.id}" aria-label="Bu adresi sil">${icon("trash")}</button></div>`,
      )
      .join("")}
    <div class="addr-opt"><label><input type="radio" name="savedAddr" value="" data-action="saved-addr" checked><span><strong>Yeni adres</strong>Aşağıya yazacağım</span></label></div>
  </fieldset>`;
}

export function checkoutView() {
  const lines = cartLines();
  if (!lines.length) return null;
  const o = S.store.ordering || {};
  const pf = S.profile;
  const type = S.delivery.type;
  const pay = pf.payment && o.payments?.[pf.payment] ? pf.payment : o.payments?.nakit ? "nakit" : "kart";
  const sub = ["ara", "benzer", "cikar"].includes(pf.substitution) ? pf.substitution : "ara";
  const st = status();
  return `<div class="page-pad checkout">
    <a class="back-link" href="#/sepet">${icon("left")}Sepete dön</a>
    <h1 class="page-h1">Siparişi tamamla</h1>
    <div class="cart-cols">
      <form class="checkout-form" id="orderForm" novalidate>
        <div class="form-alert" id="formAlert" role="alert" hidden></div>
        ${!st.acceptingOrders ? closedBox() : preorderNote()}

        <fieldset class="fs">
          <legend>Teslimat</legend>
          <div data-region="delivery">${deliveryPicker()}</div>
          <p class="field-error" id="zoneErr" hidden></p>
          <div class="addr-block" data-region="address"${type === "gelal" ? " hidden" : ""}>
            ${savedAddresses()}
            ${field("address", "Açık adres", `<textarea id="address" name="address" rows="3" maxlength="${RULES.addressMax}" data-clean="address" autocomplete="street-address" placeholder="Sokak, bina no, daire, kat; varsa tarif" aria-describedby="addressHint addressErr"></textarea>`, { hint: "Harf, rakam ve . , : ; / # ' ( ) - kullanılabilir", counter: `<span class="counter" data-counter-for="address">0 / ${RULES.addressMax}</span>` })}
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>İletişim</legend>
          ${field("name", "Ad soyad", `<input id="name" name="name" autocomplete="name" maxlength="${RULES.nameMax}" data-clean="name" placeholder="Örn. Ayşe Yılmaz" value="${esc(pf.name || "")}" aria-describedby="nameErr">`)}
          ${field("phone", "Telefon", `<input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" data-clean="phone" placeholder="05XX XXX XX XX" value="${esc(pf.phone || "")}" aria-describedby="phoneHint phoneErr">`, { hint: "0 ile başlayan 11 haneli numara. Kurye gerekirse bu numarayı arar." })}
        </fieldset>

        <fieldset class="fs">
          <legend>Ödeme <span class="opt">(teslimatta)</span></legend>
          <div class="seg seg-wrap" role="radiogroup" aria-label="Ödeme yöntemi">
            ${o.payments?.nakit ? `<label class="seg-opt"><input type="radio" name="payment" value="nakit"${pay === "nakit" ? " checked" : ""}><span>Nakit</span></label>` : ""}
            ${o.payments?.kart ? `<label class="seg-opt"><input type="radio" name="payment" value="kart"${pay === "kart" ? " checked" : ""}><span>Kart</span></label>` : ""}
          </div>
          <div class="change-block" data-region="change"${pay !== "nakit" ? " hidden" : ""}>
            ${field("changeFor", "Para üstü için kaç TL ile ödeyeceksiniz? <span class=\"opt\">(isteğe bağlı)</span>", `<input id="changeFor" name="changeFor" inputmode="numeric" data-clean="digits" data-max="6" placeholder="Örn. 500" aria-describedby="changeForErr">`)}
            <div class="chips" data-region="change-chips"></div>
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Bir ürün bulunamazsa</legend>
          <div class="radio-list">
            <label class="radio"><input type="radio" name="substitution" value="ara"${sub === "ara" ? " checked" : ""}><span>Beni arayın</span></label>
            <label class="radio"><input type="radio" name="substitution" value="benzer"${sub === "benzer" ? " checked" : ""}><span>Benzeriyle değiştirin</span></label>
            <label class="radio"><input type="radio" name="substitution" value="cikar"${sub === "cikar" ? " checked" : ""}><span>Siparişten çıkarın</span></label>
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Sipariş notu <span class="opt">(isteğe bağlı)</span></legend>
          ${field("note", '<span class="sr-only">Sipariş notu</span>', `<textarea id="note" name="note" rows="2" maxlength="${RULES.noteMax}" placeholder="Örn. Zili çalmayın, kapıya bırakın" aria-describedby="noteHint"></textarea>`, { counter: `<span class="counter" data-counter-for="note">0 / ${RULES.noteMax}</span>` })}
        </fieldset>

        <div class="consent field" data-field="kvkk">
          <label class="check"><input type="checkbox" name="kvkk" id="kvkk" aria-describedby="kvkkErr"><span><a href="/kvkk" target="_blank" rel="noopener">KVKK aydınlatma metnini</a> okudum, <a href="/mesafeli-satis" target="_blank" rel="noopener">mesafeli satış sözleşmesini</a> onaylıyorum.</span></label>
          <p class="field-error" id="kvkkErr" hidden></p>
        </div>
        <div class="hp" aria-hidden="true"><label for="website">Web sitesi</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>

        <div class="submit-row" data-region="submit">${submitHtml()}</div>
      </form>
      <aside class="cart-side summary-card" data-region="co-summary" aria-label="Sipariş özeti">${coSummary()}</aside>
    </div>
  </div>`;
}

function submitHtml() {
  const q = S.quote;
  const st = status();
  if (!st.acceptingOrders) return "";
  const errs = blockingErrors(q).filter((e) => e.code !== "BOLGE_SECIN");
  return `${errs.length ? `<p class="cta-msg" role="status">${esc(errs[0].message)}</p>` : ""}
    <button class="btn btn-primary btn-block btn-lg" type="submit" id="submitOrder"${errs.length ? ' aria-disabled="true" data-blocked="1"' : ""}>${st.preorder ? "Ön siparişi onayla" : "Siparişi onayla"}${q ? `<span class="btn-amount">${tl(q.total)}</span>` : ""}</button>
    <p class="submit-note">Ödemeyi teslimatta yaparsınız. Onayladıktan sonra siparişi bu sayfadan takip edebilirsiniz.</p>`;
}

function coSummary() {
  const q = S.quote;
  const lines = cartLines();
  return `<h2 class="sum-title">Sepetiniz <span class="result-count">${cartCount()} ürün</span></h2>
    <ul class="co-lines">${lines
      .map((l) => {
        const ql = quoteLine(l.product.id);
        return `<li><span class="co-q">${l.qty}×</span><span class="co-n">${esc(l.product.name)}</span><span class="co-t">${tl(ql && ql.qty === l.qty ? ql.lineTotal : l.product.price * l.qty)}</span></li>`;
      })
      .join("")}</ul>
    <a class="btn btn-text" href="#/sepet">Sepeti düzenle</a>
    ${noticesHtml()}
    ${couponForm()}
    ${progressHtml(q)}
    ${totalsHtml(q)}`;
}

export function refreshCheckout() {
  const form = $("#orderForm");
  if (!form) return;
  refreshSummary(document.querySelector('[data-region="co-summary"]'), coSummary);
  const sub = form.querySelector('[data-region="submit"]');
  const btn = sub.querySelector("#submitOrder");
  if (!btn || !btn.disabled) sub.innerHTML = submitHtml();
  refreshSummary(form.querySelector('[data-region="delivery"]'), deliveryPicker);
  form.querySelector('[data-region="address"]').hidden = S.delivery.type === "gelal";
  renderChangeChips();
}

function renderChangeChips() {
  const box = document.querySelector('[data-region="change-chips"]');
  const total = S.quote?.total;
  if (!box) return;
  if (!total) {
    box.innerHTML = "";
    return;
  }
  const opts = new Set();
  for (const step of [50, 100, 200, 500, 1000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total) opts.add(v);
  }
  const list = [...opts].sort((a, b) => a - b).slice(0, 4);
  box.innerHTML = list.map((v) => `<button class="chip" type="button" data-action="change-chip" data-value="${v}">${tl(v)}</button>`).join("");
}

export function initCheckout() {
  const form = $("#orderForm");
  if (!form) return;
  // Son kullanılan adresi önceden doldur
  const last = S.addresses.find((a) => a.zoneId === S.delivery.zoneId) || null;
  if (last && S.delivery.type === "teslimat") {
    form.address.value = last.address;
    const r = form.querySelector(`input[name="savedAddr"][value="${last.id}"]`);
    if (r) r.checked = true;
  }
  for (const el of form.querySelectorAll("[data-clean]")) cleanField(el);
  cleanField(form.note);
  renderChangeChips();
  requestQuote.flush();
}

function showFieldError(form, name, msg) {
  const err = form.querySelector(`#${name}Err`);
  const input = form.querySelector(`[name="${name === "zone" ? "zoneSel" : name}"]`);
  if (err) {
    err.textContent = msg;
    err.hidden = !msg;
  }
  if (input) {
    if (msg) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }
}
export function clearFieldError(el) {
  const form = el.form || el.closest("form");
  if (!form || form.id !== "orderForm" || !el.name) return;
  showFieldError(form, el.name, "");
  const alert = form.querySelector("#formAlert");
  if (alert) alert.hidden = true;
}

function validate(form) {
  // Alanlar sayfadaki sırayla denetlenir (ilk hataya odaklanılır)
  const errs = [];
  if (S.delivery.type === "teslimat") {
    if (!S.delivery.zoneId) errs.push(["zone", "Teslimat bölgenizi seçin."]);
    const a = form.address.value.trim();
    if (a.length < RULES.addressMin) errs.push(["address", `Lütfen açık adres girin (en az ${RULES.addressMin} karakter).`]);
    else if (!ADDR_RE.test(a)) errs.push(["address", "Adreste izin verilmeyen karakter var."]);
  }
  const name = form.name.value.trim().replace(/\s+/g, " ");
  if (!name) errs.push(["name", "Adınızı ve soyadınızı yazın."]);
  else if (!NAME_RE.test(name) || !/\S\s+\S/.test(name)) errs.push(["name", "Ad soyad yalnızca harflerden oluşmalı (örn. Ayşe Yılmaz)."]);
  if (!/^0\d{10}$/.test(form.phone.value)) errs.push(["phone", "Telefon 0 ile başlamalı ve 11 haneli olmalı (örn. 05321234567)."]);
  const payment = form.querySelector('input[name="payment"]:checked')?.value;
  if (payment === "nakit" && form.changeFor.value) {
    const v = Number(form.changeFor.value);
    if (S.quote && v < S.quote.total) errs.push(["changeFor", `Para üstü tutarı sipariş toplamından (${tl(S.quote.total)}) az olamaz.`]);
  }
  if (!form.kvkk.checked) errs.push(["kvkk", "Devam etmek için KVKK aydınlatma metnini ve mesafeli satış sözleşmesini onaylayın."]);
  return errs;
}

let submitting = false;
export async function submitOrder(form, navigate, reloadStore) {
  if (submitting) return;
  const alert = form.querySelector("#formAlert");
  alert.hidden = true;
  for (const n of ["name", "phone", "address", "changeFor", "kvkk", "zone"]) showFieldError(form, n, "");
  const blocked = blockingErrors(S.quote).filter((e) => e.code !== "BOLGE_SECIN");
  if (blocked.length) {
    alert.innerHTML = `<p>${esc(blocked[0].message)}</p><p><a href="#/sepet">Sepete dönüp ürün ekleyin</a></p>`;
    alert.hidden = false;
    alert.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  const errs = validate(form);
  if (errs.length) {
    for (const [n, m] of errs) showFieldError(form, n, m);
    alert.innerHTML = errs.length > 1 ? `<p>Lütfen ${errs.length} alanı düzeltin.</p>` : `<p>${esc(errs[0][1])}</p>`;
    alert.hidden = false;
    const first = errs[0][0] === "zone" ? form.querySelector('select[name="zoneSel"]') : form.querySelector(`[name="${errs[0][0]}"]`);
    first?.focus();
    return;
  }
  const payment = form.querySelector('input[name="payment"]:checked')?.value || "nakit";
  const substitution = form.querySelector('input[name="substitution"]:checked')?.value || "ara";
  const body = {
    ...quoteBody(),
    name: form.name.value.trim().replace(/\s+/g, " "),
    phone: form.phone.value,
    address: S.delivery.type === "teslimat" ? form.address.value.trim() : "",
    payment,
    changeFor: payment === "nakit" && form.changeFor.value ? Number(form.changeFor.value) : undefined,
    note: form.note.value.trim(),
    substitution,
    kvkk: form.kvkk.checked === true,
    website: form.website.value,
  };
  if (S.couponMsg && !S.couponMsg.valid) delete body.couponCode;
  const btn = form.querySelector("#submitOrder");
  submitting = true;
  if (btn) {
    btn.disabled = true;
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>Sipariş gönderiliyor`;
  }
  saveProfile({ name: body.name, phone: body.phone, payment, substitution });
  try {
    const res = await api("/api/orders", { method: "POST", body });
    if (!res.id) throw new Error("Sipariş alınamadı. Lütfen marketi arayın.");
    rememberOrder(res.id, res.token, res.order);
    if (S.delivery.type === "teslimat") rememberAddress(S.delivery.zoneId, body.address);
    setCoupon("");
    S.couponMsg = null;
    S.notices = [];
    clearCart();
    navigate(`#/siparis/${res.id}?yeni=1`);
  } catch (e) {
    const data = e.data || {};
    if (data.quote) {
      applyQuote(data.quote);
      emit("quote");
    }
    if (e.code === "KUPON") {
      S.couponMsg = { valid: false, message: e.message, code: S.coupon };
      S.coupon = "";
      save("coupon", null);
      emit("quote");
    }
    if (["KAPALI", "DURDURULDU", "TUKENDI", "SATISTA_DEGIL", "ADET_SINIRI"].includes(e.code)) reloadStore();
    if (e.code === "BOLGE_SECIN" || e.code === "BOLGE_GECERSIZ") showFieldError(form, "zone", e.message);
    alert.innerHTML = `<p>${esc(e.message)}</p>${e.code === "ENGELLI" || e.code === "AKTIF_SINIR" ? `<p><a href="${esc(telHref(storeInfo().phone))}">Marketi arayın: ${esc(storeInfo().phone || "")}</a></p>` : ""}`;
    alert.hidden = false;
    alert.scrollIntoView({ block: "center", behavior: "smooth" });
    toast(e.message, { tone: "error", ms: 4000 });
  } finally {
    submitting = false;
    const b = form.querySelector("#submitOrder");
    if (b) {
      b.disabled = false;
      if (b.dataset.label) b.innerHTML = b.dataset.label;
      refreshCheckout();
    }
  }
}

function rememberAddress(zoneId, address) {
  if (!zoneId || !address) return;
  const key = address.replace(/\s+/g, " ").toLocaleLowerCase("tr");
  const rest = S.addresses.filter((a) => a.address.replace(/\s+/g, " ").toLocaleLowerCase("tr") !== key);
  S.addresses = [{ id: Date.now().toString(36), zoneId, address }, ...rest].slice(0, 5);
  save("addresses", S.addresses);
}
export function deleteAddress(id) {
  S.addresses = S.addresses.filter((a) => a.id !== id);
  save("addresses", S.addresses);
}

export { setDelivery, setCoupon };
