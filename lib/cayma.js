"use strict";
// Cayma hakkı durumu (Mesafeli Sözleşmeler Yönetmeliği m.15; YASAL.md §4.1.2).
// Ürünün caymaDurumu null ise kategorisininki geçerlidir; kategoride de yoksa adından türetilir.

const { foldTr } = require("./util");

const CAYMA = {
  yok_cabuk_bozulan: { label: "Yok – çabuk bozulan", short: "Cayma: Yok – çabuk bozulan" },
  acilirsa_yok_hijyen: { label: "Ambalajı açılırsa yok – hijyen", short: "Cayma: Ambalajı açılırsa yok – hijyen" },
  var: { label: "Var", short: "Cayma: Var" },
};
const VALUES = Object.keys(CAYMA);

/** Kategori adından makul varsayılan (son karar işletmenin; panelden değiştirilebilir) */
function caymaFromName(name) {
  const f = foldTr(name);
  if (/(meyve|sebze|sut|kahvalti|sarkuteri|firin|ekmek|dondurma|et |^et$|tavuk|balik|peynir|yogurt|donuk|dondurulmus|taze)/.test(f)) return "yok_cabuk_bozulan";
  if (/(kisisel bakim|bebek|kozmetik|hijyen|saglik)/.test(f)) return "acilirsa_yok_hijyen";
  return "var";
}

/** Ürünün geçerli cayma durumu */
function caymaOf(product, categories) {
  if (product && VALUES.includes(product.caymaDurumu)) return product.caymaDurumu;
  const c = product && (categories || []).find((x) => x.id === product.categoryId);
  if (c && VALUES.includes(c.caymaDurumu)) return c.caymaDurumu;
  return c ? caymaFromName(c.name) : "var";
}
const caymaLabel = (v) => (CAYMA[v] || CAYMA.var).label;

module.exports = { CAYMA, VALUES, caymaFromName, caymaOf, caymaLabel };
