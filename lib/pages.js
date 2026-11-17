"use strict";
// Sunucuda üretilen sayfalar (SEO): ana sayfaya meta enjeksiyonu, yasal sayfalar, bölge sayfaları,
// robots.txt, sitemap.xml, manifest. HTML iskeleti ve sınıf adları docs/API.md içinde belgelidir.

const fs = require("fs");
const path = require("path");
const { escapeHtml: esc, formatTL } = require("./util");
const { hoursSummary, DAY_NAMES } = require("./hours");
const L = require("./legal");

// Yeni palet (siyah + altın). Tarayıcı üst çubuğu ve PWA açılış ekranı rengi.
const THEME_COLOR = "#0B0B0C";
const BACKGROUND_COLOR = "#0B0B0C";

// Mevcutsa üretilmiş ikonlar kullanılır, yoksa logo (mağaza ajanı public/img altına ekler/yeniden üretir)
// Sayfa başlığında 40 px gösterilir: önce küçük (96 px, ~7 KB) webp; eski logo.webp kaldırıldı
const LOGO_CANDIDATES = ["img/logo-96.webp", "img/logo.svg", "img/logo.png", "img/icon-192.png", "img/logo-yeni.png"];
function asset(publicDir, candidates, fallback = "/img/logo-yeni.png") {
  for (const c of candidates) if (fs.existsSync(path.join(publicDir, c))) return "/" + c.replace(/\\/g, "/");
  return fallback;
}
const logoUrl = (publicDir) => asset(publicDir, LOGO_CANDIDATES);
const iconUrl = (publicDir) => asset(publicDir, ["img/icon-192.png", "img/favicon.png", "img/favicon.svg", ...LOGO_CANDIDATES]);
const ogImageUrl = (publicDir) => asset(publicDir, ["img/og.jpg", "img/og.png", "img/og.webp", "img/icon-512.png", ...LOGO_CANDIDATES]);
const jsonLdLogoUrl = (publicDir) => asset(publicDir, ["img/icon-512.png", "img/logo-240.webp", "img/logo.png", "img/icon-192.png", "img/logo-yeni.png"]);

// Geriye dönük: eski sabit yasal sayfa tablosu yerine ayarlardaki belgeler (settings.legal.docs) kullanılır
function legalDocByPath(settings, p) {
  return (settings.legal.docs || []).find((d) => d.path === p && L.docVisible(settings, d)) || null;
}
function fillTemplate(text, ctx) {
  return L.fill(text, L.storePlaceholders(ctx.settings, ctx.baseUrl));
}
const textToHtml = L.textToHtml;

/** Genel (siparişsiz) gösterim: mağaza bilgileri dolu, siparişe özel alanlar açıklamalı */
function legalText(ctx, key) {
  const doc = L.findDoc(ctx.settings, key);
  if (!doc) return "";
  const text = L.storeText(ctx.settings, doc, ctx.baseUrl);
  return L.genericFill(text, ctx.settings, L.versionOf(doc.title, text));
}

const telHref = (phone) => "tel:" + String(phone || "").replace(/[^\d+]/g, "");

function footer(ctx) {
  const s = ctx.settings;
  const st = s.store;
  const hours = hoursSummary(s.hours).map((h) => `${esc(h.days)} ${esc(h.text)}`).join(" · ");
  const contact = [];
  if (st.address) contact.push(`<span class="page-footer-address">${esc(st.address)}</span>`);
  if (st.phone) contact.push(`<a href="${esc(telHref(st.phone))}">${esc(st.phone)}</a>`);
  if (st.whatsapp) contact.push(`<a href="https://wa.me/${esc(st.whatsapp)}" rel="noopener">WhatsApp</a>`);
  if (st.instagram) contact.push(`<a href="${esc(st.instagram)}" rel="noopener">Instagram</a>`);
  const links = [
    ["/hakkimizda", "Hakkımızda"],
    ["/teslimat", "Teslimat bölgeleri"],
    ...(s.legal.docs || []).filter((d) => L.docVisible(s, d)).map((d) => [d.path, d.title]),
  ];
  const year = new Date().getFullYear();
  return `<footer class="page-footer">
  <div class="page-footer-inner">
    <p class="page-footer-contact">${contact.join(" · ")}</p>
    <p class="page-footer-hours">Sipariş saatleri: ${hours}</p>
    <nav class="page-footer-links" aria-label="Kurumsal">${links.map(([h, t]) => `<a href="${esc(h)}">${esc(t)}</a>`).join("")}</nav>
    <p class="page-footer-legal">© ${year} ${esc(s.legal.companyTitle || st.name)}</p>
  </div>
</footer>`;
}

/** Ortak sayfa iskeleti */
function layout(ctx, { pathName, title, description, bodyClass, crumb, main, noindex = false, status }) {
  const st = ctx.settings.store;
  const fullTitle = `${title} · ${st.name}`;
  const canonical = ctx.baseUrl + pathName;
  const icon = iconUrl(ctx.publicDir);
  const logo = logoUrl(ctx.publicDir);
  const logoSize = 'width="40" height="40"';
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta property="og:type" content="website">
<meta property="og:locale" content="tr_TR">
<meta property="og:site_name" content="${esc(st.name)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ctx.baseUrl + ogImageUrl(ctx.publicDir))}">
<meta name="theme-color" content="${THEME_COLOR}">
<link rel="icon" href="${icon}">
<link rel="apple-touch-icon" href="${icon}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/style.css">
</head>
<body class="page ${bodyClass}"${status ? ` data-status="${status}"` : ""}>
<a class="skip-link" href="#icerik">İçeriğe geç</a>
<header class="page-header">
  <div class="page-header-inner">
    <a class="page-brand" href="/"><img class="page-logo" src="${esc(logo)}" alt="" ${logoSize}><span class="page-brand-name">${esc(st.name)}</span></a>
    <a class="page-cta" href="/">Sipariş ver</a>
  </div>
</header>
<main class="page-main" id="icerik">
  <nav class="page-breadcrumb" aria-label="Sayfa yolu"><a href="/">Ana sayfa</a>${crumb.map((c) => (c.href ? ` <span aria-hidden="true">›</span> <a href="${c.href}">${esc(c.text)}</a>` : ` <span aria-hidden="true">›</span> <span aria-current="page">${esc(c.text)}</span>`)).join("")}</nav>
${main}
</main>
${footer(ctx)}
</body>
</html>`;
}

/** doc: settings.legal.docs öğesi */
function legalPage(ctx, doc) {
  const raw = L.storeText(ctx.settings, doc, ctx.baseUrl);
  const version = L.versionOf(doc.title, raw);
  const text = L.genericFill(raw, ctx.settings, version);
  return layout(ctx, {
    pathName: doc.path,
    title: doc.title,
    description: `${ctx.settings.store.name} — ${doc.title}.${doc.lead ? ` ${doc.lead}` : ""}`,
    bodyClass: "page-legal",
    crumb: [{ text: doc.title }],
    main: `  <article class="page-article" data-doc="${esc(doc.key)}" data-version="${version}">
    <h1 class="page-title">${esc(doc.title)}</h1>
    ${doc.lead ? `<p class="page-lead">${esc(doc.lead)}</p>` : ""}
    <div class="page-content">
${textToHtml(text)}
    </div>
    <p class="page-version">Metin sürümü: <code>${version.slice(0, 12)}</code></p>
  </article>`,
  });
}

/** "Bu siparişin sözleşmesi": siparişin onayladığı metinler, sipariş bilgileriyle doldurulmuş (yazdırılabilir) */
function orderDocumentsPage(ctx, order, docs) {
  const c = docs.consent;
  const when = c ? L.orderPlaceholders(order).onayTarihi : "";
  const sections = docs.documents.length
    ? docs.documents
        .map(
          (d) => `    <section class="page-section order-doc" data-doc="${esc(d.key)}" data-version="${esc(d.version)}">
      <h2 class="order-doc-title">${esc(d.title)}</h2>
      <div class="page-content">
${d.archived ? d.html : "<p>Bu metnin onaylanan sürümü arşivde bulunamadı.</p>"}
      </div>
      <p class="page-version">Metin sürümü (SHA-256): <code>${esc(d.version)}</code></p>
    </section>`
        )
        .join("\n")
    : `    <p class="page-lead">Bu sipariş için kayıtlı onay yok (panelden girilmiş ya da eski bir sipariş).</p>`;
  const accepted = c
    ? `<ul class="order-doc-consents">${c.accepted.map((a) => `<li>${esc(a.label)}</li>`).join("")}</ul>`
    : "";
  return layout(ctx, {
    pathName: `/siparis/${order.id}/belgeler`,
    title: `Sipariş #${order.id} — sözleşme ve onaylar`,
    description: `Sipariş #${order.id} için onaylanan yasal metinler.`,
    bodyClass: "page-legal page-order-docs",
    crumb: [{ text: `Sipariş #${order.id} belgeleri` }],
    noindex: true,
    main: `  <article class="page-article">
    <h1 class="page-title">Sipariş #${order.id} — sözleşme ve onaylar</h1>
    ${c ? `<p class="page-lead">Onay zamanı: ${esc(when)}. Onaylanan maddeler:</p>${accepted}` : ""}
${sections}
    <p class="page-actions"><a class="page-button page-button-ghost" href="/#/siparis/${order.id}">Siparişe dön</a></p>
  </article>`,
  });
}

function aboutPage(ctx) {
  const s = ctx.settings;
  const st = s.store;
  const hours = hoursSummary(s.hours);
  const zones = s.zones.filter((z) => z.active);
  return layout(ctx, {
    pathName: "/hakkimizda",
    title: "Hakkımızda",
    description: (st.about || `${st.name} — ${st.slogan}`).slice(0, 160),
    bodyClass: "page-about",
    crumb: [{ text: "Hakkımızda" }],
    main: `  <article class="page-article">
    <h1 class="page-title">${esc(st.name)}</h1>
    <p class="page-lead">${esc(st.slogan)}</p>
    <div class="page-content">
${textToHtml(st.about)}
    </div>
    <section class="page-section store-info">
      <h2>İletişim ve saatler</h2>
      <dl class="info-list">
        ${st.address ? `<div class="info-item"><dt>Adres</dt><dd>${esc(st.address)}${st.mapsUrl ? ` <a class="info-link" href="${esc(st.mapsUrl)}" rel="noopener">Yol tarifi</a>` : ""}</dd></div>` : ""}
        ${st.phone ? `<div class="info-item"><dt>Telefon</dt><dd><a href="${esc(telHref(st.phone))}">${esc(st.phone)}</a></dd></div>` : ""}
        ${st.whatsapp ? `<div class="info-item"><dt>WhatsApp</dt><dd><a href="https://wa.me/${esc(st.whatsapp)}" rel="noopener">Mesaj gönder</a></dd></div>` : ""}
        ${st.email ? `<div class="info-item"><dt>E-posta</dt><dd><a href="mailto:${esc(st.email)}">${esc(st.email)}</a></dd></div>` : ""}
        <div class="info-item"><dt>Sipariş saatleri</dt><dd>${hours.map((h) => `${esc(h.days)}: ${esc(h.text)}`).join("<br>")}</dd></div>
      </dl>
    </section>
    ${zones.length ? `<section class="page-section page-zones">
      <h2>Teslimat bölgeleri</h2>
      <ul class="zone-links">${zones.map((z) => `<li><a href="/teslimat/${esc(z.slug)}">${esc(z.name)}</a></li>`).join("")}</ul>
    </section>` : ""}
  </article>`,
  });
}

function zoneFacts(ctx, z) {
  const ord = ctx.settings.ordering;
  const fee = z.fee !== null && z.fee !== undefined ? z.fee : ord.deliveryFee;
  const min = z.minOrder !== null && z.minOrder !== undefined ? z.minOrder : ord.minOrder;
  const eta = z.etaMinutes || ord.etaMinutes;
  const facts = [
    ["Teslimat ücreti", fee > 0 ? formatTL(fee) : "Ücretsiz"],
    ["Minimum sipariş", min > 0 ? formatTL(min) : "Yok"],
    ["Tahmini süre", `~${eta} dakika`],
  ];
  if (fee > 0 && ord.freeDeliveryOver) facts.push(["Ücretsiz teslimat", `${formatTL(ord.freeDeliveryOver)} ve üzeri`]);
  const pays = [ord.payments.nakit && "nakit", ord.payments.kart && "kart"].filter(Boolean).join(" veya ");
  facts.push(["Ödeme", `Kapıda ${pays}`]);
  return facts;
}

function zonePage(ctx, z) {
  const s = ctx.settings;
  const st = s.store;
  // Cümle ortasında geçtiği için "Her gün" / "Hafta içi" küçük harfle başlar (gün adları özel isim, olduğu gibi kalır)
  const hours = hoursSummary(s.hours)
    .map((h) => `${h.days.replace(/^(Her|Hafta)\b/, (m) => m.toLocaleLowerCase("tr"))} ${h.text}`)
    .join(", ");
  const others = s.zones.filter((x) => x.active && x.id !== z.id);
  const facts = zoneFacts(ctx, z);
  return layout(ctx, {
    pathName: `/teslimat/${z.slug}`,
    title: `${z.name} market siparişi`,
    description: `${st.name}, ${z.name} bölgesine eve market teslimatı yapar. ${hours}. Kapıda nakit veya kartla ödeme.`.slice(0, 200),
    bodyClass: "page-zone",
    crumb: [{ text: "Teslimat bölgeleri", href: "/teslimat" }, { text: z.name }],
    main: `  <article class="page-article">
    <h1 class="page-title">${esc(z.name)} · Eve market teslimatı</h1>
    <p class="page-lead">${esc(st.name)}, ${esc(z.name)} bölgesindeki adreslere ${esc(hours)} arasında sipariş teslim eder. Meyve-sebze, kahvaltılık, temel gıda, içecek, temizlik ve kişisel bakım ürünlerini online sipariş verin, kapıda ödeyin.</p>
    <section class="page-section zone-facts">
      <h2>Teslimat bilgileri</h2>
      <dl class="info-list">
        ${facts.map(([k, v]) => `<div class="info-item"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("\n        ")}
      </dl>
      <p class="page-actions"><a class="page-button" href="/?bolge=${encodeURIComponent(z.slug)}">Sipariş vermeye başla</a>${st.phone ? ` <a class="page-button page-button-ghost" href="${esc(telHref(st.phone))}">Ara: ${esc(st.phone)}</a>` : ""}</p>
    </section>
    ${others.length ? `<section class="page-section page-zones">
      <h2>Diğer teslimat bölgeleri</h2>
      <ul class="zone-links">${others.map((x) => `<li><a href="/teslimat/${esc(x.slug)}">${esc(x.name)}</a></li>`).join("")}</ul>
    </section>` : ""}
  </article>`,
  });
}

function zonesIndexPage(ctx) {
  const s = ctx.settings;
  const zones = s.zones.filter((z) => z.active);
  return layout(ctx, {
    pathName: "/teslimat",
    title: "Teslimat bölgeleri",
    description: `${s.store.name} eve teslimat bölgeleri: ${zones.map((z) => z.name).join(", ")}.`.slice(0, 200),
    bodyClass: "page-zones-index",
    crumb: [{ text: "Teslimat bölgeleri" }],
    main: `  <article class="page-article">
    <h1 class="page-title">Teslimat bölgeleri</h1>
    <p class="page-lead">Aşağıdaki bölgelere eve teslimat yapıyoruz. Bölgenizi seçerek teslimat ücretini ve tahmini süreyi görebilirsiniz.</p>
    <ul class="zone-cards">
      ${zones.map((z) => `<li class="zone-card"><a href="/teslimat/${esc(z.slug)}"><span class="zone-card-name">${esc(z.name)}</span><span class="zone-card-meta">${esc(zoneFacts(ctx, z).slice(0, 3).map((f) => `${f[0]}: ${f[1]}`).join(" · "))}</span></a></li>`).join("\n      ")}
    </ul>
  </article>`,
  });
}

function notFoundPage(ctx) {
  return layout(ctx, {
    pathName: "/404",
    title: "Sayfa bulunamadı",
    description: "Aradığınız sayfa bulunamadı.",
    bodyClass: "page-notfound",
    crumb: [{ text: "Sayfa bulunamadı" }],
    noindex: true,
    status: 404,
    main: `  <article class="page-article">
    <h1 class="page-title">Sayfa bulunamadı</h1>
    <p class="page-lead">Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.</p>
    <p class="page-actions"><a class="page-button" href="/">Alışverişe dön</a></p>
  </article>`,
  });
}

// ---------- Ana sayfa SEO enjeksiyonu ----------
function homeMeta(ctx) {
  const s = ctx.settings;
  const st = s.store;
  const zones = s.zones.filter((z) => z.active);
  const hours = hoursSummary(s.hours).map((h) => `${h.days} ${h.text}`).join(", ");
  const title = `${st.name} · ${st.slogan || "Online market siparişi"}${st.city ? ` | ${st.city}` : ""}`;
  const description = `${st.name} online market siparişi: meyve-sebze, kahvaltılık, temel gıda, içecek ve temizlik ürünleri kapınızda. ${zones.length ? `${zones.slice(0, 6).map((z) => z.name).join(", ")} bölgelerine teslimat. ` : ""}${hours}. Kapıda ödeme.`.slice(0, 300);
  return { title, description };
}

function jsonLd(ctx) {
  const s = ctx.settings;
  const st = s.store;
  const dayUri = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const data = {
    "@context": "https://schema.org",
    "@type": "GroceryStore",
    name: st.name,
    description: st.about || st.slogan,
    url: ctx.baseUrl + "/",
    image: ctx.baseUrl + jsonLdLogoUrl(ctx.publicDir),
    logo: ctx.baseUrl + jsonLdLogoUrl(ctx.publicDir),
    telephone: st.whatsapp ? `+${st.whatsapp}` : st.phone,
    priceRange: "₺",
    currenciesAccepted: "TRY",
    paymentAccepted: [s.ordering.payments.nakit && "Nakit", s.ordering.payments.kart && "Kredi kartı"].filter(Boolean).join(", "),
    address: {
      "@type": "PostalAddress",
      streetAddress: st.address,
      addressLocality: st.district || st.city,
      addressRegion: st.city,
      postalCode: st.postalCode,
      addressCountry: "TR",
    },
    openingHoursSpecification: s.hours.days
      .map((d, i) => (d.closed ? null : { "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${dayUri[i]}`, opens: d.open, closes: d.close }))
      .filter(Boolean),
    areaServed: s.zones.filter((z) => z.active).map((z) => ({ "@type": "Place", name: z.name })),
  };
  if (st.mapsUrl) data.hasMap = st.mapsUrl;
  if (st.instagram) data.sameAs = [st.instagram];
  if (st.email) data.email = st.email;
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * index.html'e SEO etiketleri yerleştirir: <title> değiştirilir (yoksa eklenir), diğerleri </head> öncesine eklenir.
 * index.html içinde description/OG/canonical/JSON-LD YAZILMAMALIDIR (çift olur).
 */
function injectHome(html, ctx) {
  const { title, description } = homeMeta(ctx);
  const st = ctx.settings.store;
  const tags = `<!-- sunucu: SEO -->
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(ctx.baseUrl + "/")}">
<meta property="og:type" content="website">
<meta property="og:locale" content="tr_TR">
<meta property="og:site_name" content="${esc(st.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(ctx.baseUrl + "/")}">
<meta property="og:image" content="${esc(ctx.baseUrl + ogImageUrl(ctx.publicDir))}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd(ctx)}</script>
`;
  // Değiştirme metni işlevle verilir: ayarlardaki "$'", "$`", "$&" gibi diziler String.replace'te özel anlam
  // taşır ve sayfanın parçalarını kopyalayıp başlığı/JSON-LD'yi bozuyordu.
  const titleTag = `<title>${esc(title)}</title>`;
  let out = /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, () => titleTag)
    : html.replace(/<\/head>/i, () => `${titleTag}\n</head>`);
  out = out.replace(/<\/head>/i, () => `${tags}</head>`);
  return out;
}

function injectNoindex(html) {
  return html.replace(/<\/head>/i, () => `<meta name="robots" content="noindex, nofollow">\n</head>`);
}

// ---------- robots / sitemap / manifest ----------
function robotsTxt(ctx) {
  return `User-agent: *\nAllow: /\nDisallow: /panel\nDisallow: /api/\n\nSitemap: ${ctx.baseUrl}/sitemap.xml\n`;
}

function sitemapXml(ctx) {
  const urls = ["/", "/hakkimizda", "/teslimat", ...ctx.settings.zones.filter((z) => z.active).map((z) => `/teslimat/${z.slug}`), ...(ctx.settings.legal.docs || []).filter((d) => L.docVisible(ctx.settings, d)).map((d) => d.path)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(ctx.baseUrl + u)}</loc>${u === "/" ? "<priority>1.0</priority>" : ""}</url>`).join("\n")}
</urlset>
`;
}

function manifestJson(ctx) {
  const st = ctx.settings.store;
  const icons = [];
  const pub = ctx.publicDir;
  const add = (file, sizes, type, purpose) => {
    if (fs.existsSync(path.join(pub, file))) icons.push({ src: "/" + file, sizes, type, ...(purpose ? { purpose } : {}) });
  };
  add("img/icon-192.png", "192x192", "image/png");
  add("img/icon-512.png", "512x512", "image/png");
  add("img/icon-maskable-512.png", "512x512", "image/png", "maskable");
  if (!icons.length) add("img/logo-yeni.png", "1254x1254", "image/png");
  return JSON.stringify(
    {
      name: st.name,
      short_name: st.name.length > 12 ? st.name.split(" ")[0] : st.name,
      description: st.slogan || st.name,
      lang: "tr",
      dir: "ltr",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: BACKGROUND_COLOR,
      theme_color: THEME_COLOR,
      categories: ["shopping", "food"],
      icons,
    },
    null,
    2
  );
}

module.exports = {
  THEME_COLOR,
  legalDocByPath,
  legalPage,
  orderDocumentsPage,
  legalText,
  logoUrl,
  aboutPage,
  zonePage,
  zonesIndexPage,
  notFoundPage,
  injectHome,
  injectNoindex,
  robotsTxt,
  sitemapXml,
  manifestJson,
  textToHtml,
  fillTemplate,
  homeMeta,
  DAY_NAMES,
};
