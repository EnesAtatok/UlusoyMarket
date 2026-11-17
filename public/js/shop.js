// Ana sayfa, katalog, ürün kartı ve ürün ayrıntı penceresi.
import { esc, tl, icon, fold, telHref, waHref, $ } from "./lib.js";
import { S, qtyOf, status, storeInfo, zones } from "./state.js";
import { gaugeHtml } from "./hours.js";

// ---------- Görsel ve yer tutucu ----------
// Yüklenemeyen görsel adresleri: bir kez hata veren görsel sonraki çizimlerde doğrudan emojiye düşer
export const failedImgs = new Set();
const okImg = (src) => src && !failedImgs.has(src);
/** <img> + hata olursa yerine geçecek emoji (app.js'teki "error" dinleyicisi değiştirir) */
export function imgTag(src, fallback, { size = 300, eager = false, cls = "" } = {}) {
  return `<img${cls ? ` class="${cls}"` : ""} src="${esc(src)}" alt="" width="${size}" height="${size}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" data-fallback="${esc(fallback || "🛒")}">`;
}

export function media(p, big = false) {
  const cat = S.catById.get(p.categoryId);
  const emoji = p.emoji || cat?.emoji || "🛒";
  const has = okImg(p.image);
  const inner = has ? imgTag(p.image, emoji, { size: big ? 600 : 300, eager: big }) : `<span class="emoji" aria-hidden="true">${esc(emoji)}</span>`;
  return `<span class="media${has ? " has-img" : ""}${big ? " media-big" : ""}">${inner}</span>`;
}

/** Sepet, özet ve takip satırlarındaki küçük görsel (ürün artık satışta değilse emoji) */
export function thumb(productId, name = "") {
  const p = S.byId.get(Number(productId));
  if (p) return `<span class="thumb">${media(p)}</span>`;
  return `<span class="thumb"><span class="media"><span class="emoji" aria-hidden="true">🛒</span></span></span>`;
}

function catVisual(c, cls = "cat-vis") {
  const has = okImg(c.image);
  return `<span class="${cls}${has ? " has-img" : ""}">${has ? imgTag(c.image, c.emoji || "🛒", { size: 240 }) : `<span class="emoji" aria-hidden="true">${esc(c.emoji || "🛒")}</span>`}</span>`;
}

export function priceHtml(p) {
  const unit = p.unit && p.unit !== "adet" ? `<span class="price-unit">/${esc(p.unit)}</span>` : "";
  const old = p.oldPrice ? `<s class="price-old"><span class="sr-only">Eski fiyat </span>${tl(p.oldPrice)}</s>` : "";
  return `<p class="price"><span class="price-line"><span class="price-now">${tl(p.price)}</span>${unit}</span>${old}</p>`;
}

/** Adet denetimi: sepette yoksa "+" düğmesi, varsa − adet + */
export function qtyControl(p, { big = false } = {}) {
  if (p.soldOut || !p.maxQty) return big ? `<p class="soldout-note">Bu ürün şu an tükendi.</p>` : "";
  const q = qtyOf(p.id);
  const name = esc(p.name);
  if (!q) {
    return big
      ? `<button class="btn btn-primary btn-block" type="button" data-action="inc" data-id="${p.id}">${icon("plus")}Sepete ekle</button>`
      : `<button class="add-btn" type="button" data-action="inc" data-id="${p.id}" aria-label="Sepete ekle: ${name}">${icon("plus")}</button>`;
  }
  const atMax = q >= p.maxQty;
  return `<div class="stepper${big ? " stepper-big" : ""}" role="group" aria-label="${name} adedi">
    <button type="button" data-action="dec" data-id="${p.id}" aria-label="${q === 1 ? "Sepetten çıkar" : "Bir azalt"}: ${name}">${icon(q === 1 ? "trash" : "minus")}</button>
    <output aria-live="polite">${q}</output>
    <button type="button" data-action="inc" data-id="${p.id}" aria-label="Bir artır: ${name}"${atMax ? " disabled" : ""}>${icon("plus")}</button>
  </div>`;
}

export function productCard(p) {
  const fav = S.favs.has(p.id);
  const badge = p.soldOut
    ? `<span class="pbadge pbadge-out">Tükendi</span>`
    : p.discountPercent
      ? `<span class="pbadge">%${p.discountPercent} indirim</span>`
      : "";
  return `<article class="pcard${p.soldOut ? " is-out" : ""}" data-pid="${p.id}">
    <button class="pcard-media" type="button" data-action="product" data-id="${p.id}" aria-label="${esc(p.name)} ayrıntıları">${media(p)}${badge}</button>
    <button class="fav-btn" type="button" data-action="fav" data-id="${p.id}" aria-pressed="${fav}" aria-label="Favorilere ekle: ${esc(p.name)}">${icon("heart")}</button>
    <div class="pcard-body">
      ${p.brand ? `<p class="pcard-brand">${esc(p.brand)}</p>` : ""}
      <h3 class="pcard-name">${esc(p.name)}</h3>
      <div class="pcard-foot">
        ${priceHtml(p)}
        <div class="qty-slot" data-qty="${p.id}">${qtyControl(p)}</div>
      </div>
    </div>
  </article>`;
}

/** Sepet değişince yalnızca ilgili adet denetimlerini yeniler (odak korunur) */
export function refreshQty(id) {
  const p = S.byId.get(id);
  if (!p) return;
  for (const slot of document.querySelectorAll(`[data-qty="${id}"]`)) {
    const hadFocus = slot.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    slot.innerHTML = qtyControl(p, { big: slot.dataset.big === "1" });
    if (hadFocus) {
      const target = slot.querySelector(`[data-action="${hadFocus}"]:not([disabled])`) || slot.querySelector("button:not([disabled])");
      target?.focus();
    }
  }
}

// ---------- Karşılama ----------
function heroFacts() {
  const o = S.store.ordering || {};
  const facts = [];
  if (o.minOrder) facts.push(`En az ${tl(o.minOrder)} sipariş`);
  const zs = zones();
  const free = zs.filter((z) => !z.fee).length;
  if (o.freeDeliveryOver) facts.push(`${tl(o.freeDeliveryOver)} üzeri teslimat ücretsiz`);
  else if (zs.length && free === zs.length) facts.push("Teslimat ücretsiz");
  else if (free) facts.push(`${free} bölgede teslimat ücretsiz`);
  const pay = [o.payments?.nakit && "nakit", o.payments?.kart && "kart"].filter(Boolean).join(" ya da ");
  if (pay) facts.push(`Kapıda ${pay} ile ödeme`);
  return facts;
}

export function heroHtml() {
  const st = status();
  const info = storeInfo();
  const where = [info.district === "Merkez" ? "" : info.district, info.city].filter(Boolean).join(", ") || "Edirne";
  const facts = heroFacts();
  const primary = st.acceptingOrders ? "Alışverişe başla" : "Ürünlere göz at";
  return `<section class="hero" aria-labelledby="heroTitle" data-accepting="${st.acceptingOrders ? "acik" : "kapali"}">
    <div class="hero-inner">
      <div class="hero-copy">
        <div class="hero-brand">
          <img class="hero-logo" src="/img/logo-240.webp" alt="${esc(info.name || "Ulusoy Market")} logosu" width="120" height="120" fetchpriority="high">
          <p class="hero-name"><strong>${esc(info.name || "")}</strong><span>${esc(where)}</span></p>
        </div>
        <h1 class="hero-title" id="heroTitle">${esc(info.slogan || info.name)}</h1>
        <p class="hero-lead">Sepeti doldurun, adresi yazın; siparişiniz kapınıza gelsin. Hangi aşamada olduğunu bu sayfadan izlersiniz.</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="#/kategoriler">${primary}</a>
          ${info.whatsapp ? `<a class="btn btn-night btn-lg" href="${esc(waHref(info.whatsapp, "Merhaba, sipariş vermek istiyorum."))}" target="_blank" rel="noopener">${icon("wa")}WhatsApp</a>` : ""}
          ${info.phone ? `<a class="btn btn-night btn-lg" href="${esc(telHref(info.phone))}">${icon("phone")}<span>Ara<span class="hide-sm"> · ${esc(info.phone)}</span></span></a>` : ""}
        </div>
      </div>
      <div class="hero-side">
        ${gaugeHtml(st)}
        ${facts.length ? `<ul class="hero-facts">${facts.map((f) => `<li>${icon("check")}${esc(f)}</li>`).join("")}</ul>` : ""}
      </div>
    </div>
  </section>`;
}

function rail(title, list, moreHref, id, anchor = "") {
  if (!list.length) return "";
  return `<section class="section"${anchor ? ` id="${anchor}"` : ""} aria-labelledby="${id}">
    <div class="section-head">
      <h2 class="section-title" id="${id}">${esc(title)}</h2>
      ${moreHref ? `<a class="link-more" href="${moreHref}">Tümünü gör</a>` : ""}
    </div>
    <div class="rail" role="list">${list.map((p) => `<div class="rail-item" role="listitem">${productCard(p)}</div>`).join("")}</div>
  </section>`;
}

function categoryGrid() {
  return `<section class="section" id="reyonlar" aria-labelledby="catTitle">
    <div class="section-head"><h2 class="section-title" id="catTitle">Reyonlar</h2><a class="link-more" href="#/kategoriler">Tüm ürünler</a></div>
    <ul class="cat-grid">
      ${S.categories
        .map((c) => `<li><a class="cat-tile" href="#/kategori/${c.id}">${catVisual(c)}<span class="cat-text"><span class="cat-name">${esc(c.name)}</span><span class="cat-count">${c.productCount} ürün</span></span></a></li>`)
        .join("")}
    </ul>
  </section>`;
}

function bannersHtml() {
  const list = S.store.banners || [];
  if (!list.length) return "";
  return `<section class="section banners" aria-label="Duyurular ve kampanyalar">
    <div class="banner-row${list.length === 1 ? " is-single" : ""}">
      ${list
        .map((b) => {
          const tag = b.link ? "a" : "div";
          const ext = /^https?:/i.test(b.link || "");
          const attrs = b.link ? ` href="${esc(b.link)}"${ext ? ' target="_blank" rel="noopener"' : ""}` : "";
          const img = okImg(b.image);
          return `<${tag} class="banner${img ? " has-img" : ""}${b.link ? " is-link" : ""}"${attrs}>
            ${img ? `<span class="banner-media"><img class="banner-img" src="${esc(b.image)}" alt="" width="800" height="350" loading="lazy" decoding="async" data-fallback=""></span>` : ""}
            <span class="banner-text">
              ${b.title ? `<strong class="banner-title">${esc(b.title)}</strong>` : ""}
              ${b.text ? `<span class="banner-body">${esc(b.text)}</span>` : ""}
              ${b.link ? `<span class="banner-go">${ext ? "Ayrıntılar" : "Göz at"}${icon("right")}</span>` : ""}
            </span>
          </${tag}>`;
        })
        .join("")}
    </div>
  </section>`;
}

function reorderList() {
  const count = new Map();
  for (const o of S.orderData) {
    if (o.status === "İptal") continue;
    for (const it of o.items || []) count.set(it.productId, (count.get(it.productId) || 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => S.byId.get(id))
    .filter((p) => p && !p.soldOut)
    .slice(0, 12);
}

function stepsHtml() {
  const pay = S.store.ordering?.payments || {};
  const payTxt = pay.nakit && pay.kart ? "Ödemeyi kapıda nakit ya da kartla yaparsınız." : pay.kart ? "Ödemeyi kapıda kartla yaparsınız." : "Ödemeyi kapıda nakit yaparsınız.";
  const steps = [
    ["Sepeti doldurun", "Reyonlara göz atın ya da aradığınızı yazın. Sepetiniz bu cihazda saklanır."],
    ["Adresi yazın", `Bölgenizi seçin, adresinizi girin. ${payTxt}`],
    ["Kapınıza gelsin", "Sipariş hazırlanırken ve yola çıkınca bu sayfadan takip edersiniz."],
  ];
  return `<section class="section how" id="nasil" aria-labelledby="howTitle">
    <h2 class="section-title" id="howTitle">Nasıl sipariş verilir</h2>
    <ol class="how-list">${steps.map(([t, d]) => `<li><strong>${t}</strong><span>${esc(d)}</span></li>`).join("")}</ol>
  </section>`;
}

function zonesHtml() {
  const zs = zones();
  if (!zs.length) return "";
  return `<section class="section" id="bolgeler" aria-labelledby="zoneTitle">
    <div class="section-head"><h2 class="section-title" id="zoneTitle">Teslimat bölgeleri</h2><a class="link-more" href="/teslimat">Ayrıntılar</a></div>
    <ul class="zone-table">
      ${zs
        .map(
          (z) => `<li><a href="/teslimat/${esc(z.slug)}">
            <span class="zt-name">${esc(z.name)}</span>
            <span class="zt-meta"><span>${z.fee ? tl(z.fee) : "Ücretsiz"} teslimat</span><span>En az ${tl(z.minOrder || 0)}</span><span>~${z.etaMinutes} dk</span></span>
          </a></li>`,
        )
        .join("")}
    </ul>
  </section>`;
}

function hoursList() {
  return (S.store.hours?.summary || []).map((h) => `<span>${esc(h.days)}: ${esc(h.text)}</span>`).join("");
}

function shopInfoHtml() {
  const i = storeInfo();
  return `<section class="section shop-info" id="dukkan" aria-labelledby="shopTitle">
    <h2 class="section-title" id="shopTitle">Dükkân</h2>
    <div class="shop-grid">
      <div class="shop-block">
        <p class="shop-address">${icon("pin")}<span>${esc(i.address || "")}</span></p>
        ${i.mapsUrl ? `<a class="btn btn-ghost" href="${esc(i.mapsUrl)}" target="_blank" rel="noopener">Yol tarifi al</a>` : ""}
      </div>
      <div class="shop-block">
        <p class="shop-hours">${icon("clock")}<span>${hoursList()}</span></p>
        <p class="shop-contact">
          ${i.phone ? `<a class="btn btn-ghost" href="${esc(telHref(i.phone))}">${icon("phone")}${esc(i.phone)}</a>` : ""}
          ${i.whatsapp ? `<a class="btn btn-ghost" href="${esc(waHref(i.whatsapp))}" target="_blank" rel="noopener">${icon("wa")}WhatsApp</a>` : ""}
        </p>
      </div>
    </div>
  </section>`;
}

function faqHtml() {
  const list = S.store.faq || [];
  if (!list.length) return "";
  return `<section class="section faq" id="sss" aria-labelledby="faqTitle">
    <h2 class="section-title" id="faqTitle">Sık sorulanlar</h2>
    <div class="faq-list">${list.map((f) => `<details><summary>${esc(f.q)}${icon("down")}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>
  </section>`;
}

export function homeView() {
  const discounted = S.products.filter((p) => p.oldPrice && !p.soldOut).slice(0, 12);
  const featured = S.products.filter((p) => p.featured && !p.soldOut).slice(0, 12);
  return `${heroHtml()}
  <div class="page-pad">
    ${bannersHtml()}
    ${rail("Tekrar alın", reorderList(), "", "reTitle")}
    ${categoryGrid()}
    ${rail("İndirimdekiler", discounted, "#/kategoriler?indirim=1", "discTitle", "indirimler")}
    ${rail("Öne çıkanlar", featured, "", "featTitle", "one-cikanlar")}
    ${stepsHtml()}
    ${zonesHtml()}
    ${shopInfoHtml()}
    ${faqHtml()}
  </div>`;
}

// ---------- Katalog ----------
export const SORTS = [
  ["onerilen", "Önerilen"],
  ["artan", "Ucuzdan pahalıya"],
  ["azalan", "Pahalıdan ucuza"],
  ["ad", "A’dan Z’ye"],
];

let searchIndex = null;
function indexFor(p) {
  if (!searchIndex || searchIndex.size !== S.products.length || !searchIndex.has(p.id)) {
    searchIndex = new Map(S.products.map((x) => [x.id, fold(`${x.name} ${x.brand} ${S.catById.get(x.categoryId)?.name || ""}`)]));
  }
  return searchIndex.get(p.id) || "";
}
export function resetSearchIndex() {
  searchIndex = null;
}

export function filterProducts({ cat, q, onlyDiscount, favs, sort }) {
  const terms = fold(q).split(" ").filter(Boolean);
  let list = S.products.filter((p) => {
    if (cat && p.categoryId !== cat) return false;
    if (favs && !S.favs.has(p.id)) return false;
    if (onlyDiscount && !p.oldPrice) return false;
    if (terms.length) {
      const hay = indexFor(p);
      return terms.every((t) => hay.includes(t));
    }
    return true;
  });
  if (terms.length && sort === "onerilen") {
    // Adı terimle başlayanlar öne
    const first = terms[0];
    const score = (p) => {
      const words = fold(p.name).split(" ");
      if (words.includes(first)) return 0; // "süt" → "Tam Yağlı Süt 1 L"
      if (words[0].startsWith(first)) return 1;
      if (words.some((w) => w.startsWith(first))) return 2;
      return fold(p.name).includes(first) ? 3 : 4; // marka / reyon eşleşmesi en sonda
    };
    list = list.map((p, i) => [p, score(p), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
  }
  if (sort === "artan") list = [...list].sort((a, b) => a.price - b.price);
  else if (sort === "azalan") list = [...list].sort((a, b) => b.price - a.price);
  else if (sort === "ad") list = [...list].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  // Tükenenler sona
  return [...list.filter((p) => !p.soldOut), ...list.filter((p) => p.soldOut)];
}

export function catalogView(r) {
  const cat = r.cat ? S.catById.get(r.cat) : null;
  const list = filterProducts(r);
  const title = r.q ? `“${r.q}” için sonuçlar` : r.favs ? "Favorileriniz" : cat ? cat.name : r.onlyDiscount ? "İndirimdeki ürünler" : "Tüm ürünler";
  const base = r.favs ? "#/favoriler" : cat ? `#/kategori/${cat.id}` : r.q ? "#/ara" : "#/kategoriler";
  const qs = (extra) => {
    const p = new URLSearchParams();
    if (r.q) p.set("q", r.q);
    if (r.sort && r.sort !== "onerilen") p.set("sirala", r.sort);
    if (r.onlyDiscount) p.set("indirim", "1");
    for (const [k, v] of Object.entries(extra)) v === null ? p.delete(k) : p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const tabs = [
    `<a class="tab" href="#/kategoriler${qs({ q: null })}"${!cat && !r.favs && !r.q ? ' aria-current="page"' : ""}>Tümü</a>`,
    S.favs.size ? `<a class="tab" href="#/favoriler"${r.favs ? ' aria-current="page"' : ""}>${icon("heart")}Favoriler</a>` : "",
    ...S.categories.map(
      (c) => `<a class="tab" href="#/kategori/${c.id}${qs({ q: null })}"${cat && cat.id === c.id ? ' aria-current="page"' : ""}>${c.emoji ? `<span class="tab-emoji" aria-hidden="true">${esc(c.emoji)}</span>` : ""}${esc(c.name)}</a>`,
    ),
  ].join("");

  let body;
  if (!list.length) {
    const info = storeInfo();
    body = `<div class="empty">
      <p class="empty-title">${r.q ? `“${esc(r.q)}” ile eşleşen ürün yok.` : r.favs ? "Henüz favori ürününüz yok." : "Bu seçimle eşleşen ürün yok."}</p>
      <p>${r.q ? "Yazımı kontrol edin ya da daha kısa bir kelime deneyin. Aradığınız ürün listede yoksa marketi arayıp sorabilirsiniz." : r.favs ? "Ürün kartlarındaki kalp düğmesiyle favorilerinizi burada toplayın." : "Süzgeçleri kaldırıp yeniden deneyin."}</p>
      <p class="empty-actions">
        ${r.q ? `<button class="btn btn-primary" type="button" data-action="clear-search">Aramayı temizle</button>` : ""}
        ${r.onlyDiscount ? `<a class="btn btn-ghost" href="${base}${qs({ indirim: null })}">İndirim süzgecini kaldır</a>` : ""}
        ${r.q && info.phone ? `<a class="btn btn-ghost" href="${esc(telHref(info.phone))}">${icon("phone")}Marketi ara</a>` : ""}
      </p>
    </div>`;
  } else if (!r.q && !cat && !r.favs && !r.onlyDiscount && r.sort === "onerilen") {
    body = S.categories
      .map((c) => {
        const items = list.filter((p) => p.categoryId === c.id);
        if (!items.length) return "";
        return `<section class="cat-group" aria-labelledby="cg${c.id}">
          <h2 class="group-title" id="cg${c.id}"><a href="#/kategori/${c.id}">${esc(c.name)}</a><span class="group-count">${items.length}</span></h2>
          <div class="pgrid">${items.map(productCard).join("")}</div>
        </section>`;
      })
      .join("");
  } else {
    body = `<div class="pgrid">${list.map(productCard).join("")}</div>`;
  }

  return `<div class="page-pad catalog">
    <div class="catalog-head">
      <h1 class="page-h1">${esc(title)}</h1>
      <p class="result-count" role="status">${list.length} ürün</p>
    </div>
    <nav class="tabs" aria-label="Reyonlar"><div class="tabs-track">${tabs}</div></nav>
    <div class="toolbar">
      <a class="chip" href="${base}${qs({ indirim: r.onlyDiscount ? null : "1" })}" aria-pressed="${r.onlyDiscount}" role="button" aria-label="Yalnızca indirimdekiler">${icon("tag")}İndirimdekiler</a>
      <label class="sort"><span class="sr-only">Sıralama</span>
        <select data-action="sort">${SORTS.map(([v, t]) => `<option value="${v}"${r.sort === v ? " selected" : ""}>${t}</option>`).join("")}</select>
        ${icon("down")}
      </label>
    </div>
    ${body}
  </div>`;
}

// ---------- Ürün ayrıntısı ----------
export function productDialogHtml(p) {
  const cat = S.catById.get(p.categoryId);
  const fav = S.favs.has(p.id);
  const save = p.oldPrice ? Math.round((p.oldPrice - p.price) * 100) / 100 : 0;
  return `<div class="sheet-inner pd">
    <button class="icon-btn sheet-close" type="button" data-action="close-dialog" aria-label="Kapat">${icon("x")}</button>
    <div class="pd-media">${media(p, true)}${p.discountPercent && !p.soldOut ? `<span class="pbadge">%${p.discountPercent} indirim</span>` : ""}</div>
    <div class="pd-body">
      ${cat ? `<a class="pd-cat" href="#/kategori/${cat.id}" data-action="close-dialog-nav">${esc(cat.name)}</a>` : ""}
      ${p.brand ? `<p class="pcard-brand">${esc(p.brand)}</p>` : ""}
      <h2 class="pd-title" id="pdTitle">${esc(p.name)}</h2>
      <div class="pd-price">${priceHtml(p)}${save ? `<p class="pd-save">${tl(save)} daha ucuz</p>` : ""}</div>
      <p class="pd-unit">Satış birimi: ${esc(p.unit || "adet")}${p.maxQty && p.maxQty < 99 && !p.soldOut ? `. Tek siparişte en fazla ${p.maxQty}.` : ""}</p>
      ${p.description ? `<p class="pd-desc">${esc(p.description)}</p>` : ""}
      <div class="pd-actions">
        <div class="qty-slot" data-qty="${p.id}" data-big="1">${qtyControl(p, { big: true })}</div>
        <button class="icon-btn fav-btn-lg" type="button" data-action="fav" data-id="${p.id}" aria-pressed="${fav}" aria-label="Favorilere ekle: ${esc(p.name)}">${icon("heart")}</button>
      </div>
    </div>
  </div>`;
}

export function openProduct(id) {
  const p = S.byId.get(Number(id));
  const dlg = $("#productDialog");
  if (!p || !dlg) return;
  dlg.innerHTML = productDialogHtml(p);
  if (!dlg.open) {
    dlg.showModal();
    history.pushState({ dialog: "product" }, "");
  }
  dlg.querySelector(".pd-actions button")?.focus();
}
