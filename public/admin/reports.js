// Raporlar: günlük/haftalık/aylık/yıllık ciro (dönem gezinmeli) + özel aralık, önceki döneme göre değişim,
// günlere ve saatlere göre SVG grafikler (kütüphanesiz), ödeme/teslimat/bölge dağılımı, en çok satanlar, ürün dökümü, CSV.
import { $, $$, esc, icon, api, tl, toastErr, toast, dayStr, addDays, fmtDayStr, download, numTr } from "./core.js";

const rs = { mode: "day", offset: 0, from: "", to: "" };
const MODES = [["day", "Günlük"], ["week", "Haftalık"], ["month", "Aylık"], ["year", "Yıllık"], ["custom", "Özel aralık"]];

const dow = (s) => { const [y, m, d] = s.split("-").map(Number); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; }; // 0 = Pazartesi
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
function monthStart(s, add = 0) { const [y, m] = s.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + add, 1)); return t.toISOString().slice(0, 10); }
function period() {
  const today = dayStr();
  let from, to, label;
  if (rs.mode === "day") {
    from = to = addDays(today, rs.offset);
    label = (rs.offset === 0 ? "Bugün · " : rs.offset === -1 ? "Dün · " : "") + fmtDayStr(from, { day: "numeric", month: "long", year: "numeric", weekday: "long" });
  } else if (rs.mode === "week") {
    from = addDays(today, -dow(today) + 7 * rs.offset);
    to = addDays(from, 6);
    label = `${rs.offset === 0 ? "Bu hafta · " : rs.offset === -1 ? "Geçen hafta · " : ""}${fmtDayStr(from)} – ${fmtDayStr(to, { day: "numeric", month: "short", year: "numeric" })}`;
  } else if (rs.mode === "month") {
    from = monthStart(today, rs.offset);
    to = addDays(monthStart(today, rs.offset + 1), -1);
    label = `${rs.offset === 0 ? "Bu ay · " : rs.offset === -1 ? "Geçen ay · " : ""}${fmtDayStr(from, { month: "long", year: "numeric" })}`;
  } else if (rs.mode === "year") {
    const y = Number(today.slice(0, 4)) + rs.offset;
    from = `${y}-01-01`; to = `${y}-12-31`;
    label = `${rs.offset === 0 ? "Bu yıl · " : rs.offset === -1 ? "Geçen yıl · " : ""}${y}`;
  } else {
    from = rs.from || addDays(today, -29); to = rs.to || today;
    if (from > to) [from, to] = [to, from];
    label = `${fmtDayStr(from, { day: "numeric", month: "short", year: "numeric" })} – ${fmtDayStr(to, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  // Devam eden dönemde karşılaştırma adil olsun: bugünden sonrası sayılmaz, önceki dönem aynı uzunlukta alınır
  const effTo = to > today ? today : to;
  const len = Math.max(1, daysBetween(from, effTo));
  let prevFrom, prevTo;
  if (rs.mode === "month") { prevFrom = monthStart(from, -1); prevTo = addDays(prevFrom, len - 1); }
  else if (rs.mode === "year") { prevFrom = `${Number(from.slice(0, 4)) - 1}-01-01`; prevTo = addDays(prevFrom, len - 1); }
  else { prevFrom = addDays(from, -(rs.mode === "week" ? 7 : len)); prevTo = addDays(prevFrom, len - 1); }
  return { from, to, effTo, label, prevFrom, prevTo, partial: effTo !== to };
}

export const reportsPage = {
  id: "raporlar", title: "Raporlar", icon: "chart", admin: true,
  async render(el) {
    el.innerHTML = `<div class="page">
      <div class="card totals-strip" id="rTotals"><div class="skeleton" style="grid-column:1/-1;padding:10px"><div></div></div></div>
      <div class="period-bar">
        <div class="seg" role="group" aria-label="Dönem türü" id="rModes">${MODES.map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${rs.mode === k}">${l}</button>`).join("")}</div>
        <div class="period-nav" id="rNav">
          <button type="button" class="icon-btn" id="rPrev" aria-label="Önceki dönem">${icon("left")}</button>
          <span class="lbl" id="rLabel" aria-live="polite"></span>
          <button type="button" class="icon-btn" id="rNext" aria-label="Sonraki dönem">${icon("right")}</button>
        </div>
        <span class="row-flex" id="rCustom" hidden><input type="date" class="input" id="rFrom" aria-label="Başlangıç"><span class="muted">–</span><input type="date" class="input" id="rTo" aria-label="Bitiş"></span>
        <span class="grow"></span>
        <button type="button" class="btn" id="rCsv">${icon("download")} Siparişleri CSV indir</button>
      </div>
      <div id="rBody"><div class="skeleton">${"<div></div>".repeat(4)}</div></div>
    </div>`;
    $("#rModes").addEventListener("click", (e) => {
      const b = e.target.closest("[data-mode]");
      if (!b) return;
      rs.mode = b.dataset.mode; rs.offset = 0;
      $$("#rModes [data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      load();
    });
    $("#rPrev").addEventListener("click", () => { rs.offset--; load(); });
    $("#rNext").addEventListener("click", () => { if (rs.offset < 0) { rs.offset++; load(); } });
    $("#rFrom").addEventListener("change", (e) => { rs.from = e.target.value; load(); });
    $("#rTo").addEventListener("change", (e) => { rs.to = e.target.value; load(); });
    $("#rCsv").addEventListener("click", async () => {
      const p = period();
      try { const n = await download(`/api/admin/orders/export?from=${p.from}&to=${p.to}`, "siparisler.csv"); toast(`${n} indirildi.`); } catch (e) { toastErr(e); }
    });
    await load();
  },
};

let seq = 0;
async function load() {
  const my = ++seq;
  const p = period();
  $("#rLabel").textContent = p.label;
  $("#rNav").hidden = rs.mode === "custom";
  $("#rCustom").hidden = rs.mode !== "custom";
  if (rs.mode === "custom") { $("#rFrom").value = p.from; $("#rTo").value = p.to; }
  $("#rNext").disabled = rs.offset >= 0;
  try {
    const [cur, prev] = await Promise.all([
      api(`/api/admin/reports?from=${p.from}&to=${p.to}`),
      api(`/api/admin/reports?from=${p.prevFrom}&to=${p.prevTo}`).catch(() => null),
    ]);
    if (my !== seq) return;
    renderTotals(cur.totals);
    renderBody(cur, prev, p);
  } catch (e) {
    toastErr(e);
    $("#rBody").innerHTML = `<div class="empty">${icon("alert")}<b>Rapor yüklenemedi</b>${esc(e.message)}</div>`;
  }
}

function renderTotals(t) {
  const cell = (k, x) => `<div><div class="k">${k}</div><div class="v">${tl(x.revenue)}</div><div class="s">${x.orders} sipariş</div></div>`;
  $("#rTotals").innerHTML = cell("Bugün", t.today) + cell("Bu hafta", t.week) + cell("Bu ay", t.month) + cell("Bu yıl", t.year);
}

function delta(cur, prev) {
  if (prev === null || prev === undefined) return "";
  if (!prev) return cur ? `<div class="d up">Önceki dönemde yok</div>` : `<div class="d muted">Değişim yok</div>`;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return `<div class="d muted">Önceki döneme göre aynı</div>`;
  return `<div class="d ${pct > 0 ? "up" : "down"}">${pct > 0 ? "▲" : "▼"} %${Math.abs(pct)} <span class="muted" style="font-weight:600">önceki döneme göre</span></div>`;
}

function renderBody(r, prev, p) {
  const s = r.summary;
  const ps = prev ? prev.summary : null;
  const bars = aggregateDays(r.byDay);
  const hasData = s.orders > 0;
  $("#rBody").innerHTML = `
    <div class="kpis">
      <div class="kpi accent"><div class="k">Ciro</div><div class="v">${tl(s.revenue)}</div>${ps ? delta(s.revenue, ps.revenue).replace('class="d', 'style="color:#C9D2E3" class="d') : ""}</div>
      <div class="kpi"><div class="k">Sipariş</div><div class="v">${s.orders}</div>${ps ? delta(s.orders, ps.orders) : ""}</div>
      <div class="kpi"><div class="k">Ortalama sepet</div><div class="v">${tl(s.avgBasket)}</div>${ps ? delta(s.avgBasket, ps.avgBasket) : ""}</div>
      <div class="kpi"><div class="k">Satılan ürün</div><div class="v">${numTr(s.itemsSold)}</div></div>
      <div class="kpi"><div class="k">İndirim / teslimat</div><div class="v" style="font-size:17px">${tl(s.discountTotal)} / ${tl(s.deliveryFeeTotal)}</div></div>
      <div class="kpi"><div class="k">İptal</div><div class="v" style="color:${s.cancelled ? "var(--danger)" : "inherit"}">${s.cancelled}</div></div>
    </div>
    ${p.partial ? `<p class="small muted" style="margin:-6px 0 12px">Dönem sürüyor: karşılaştırma önceki dönemin aynı uzunluktaki kısmıyla (${fmtDayStr(p.prevFrom)} – ${fmtDayStr(p.prevTo)}) yapılır.</p>` : ""}
    ${!hasData ? `<div class="card"><div class="empty">${icon("chart")}<b>Bu dönemde satış yok</b>İptal edilen siparişler ciroya katılmaz.</div></div>` : `
    <div class="charts">
      ${bars.length > 1 ? `<section class="card chart"><div class="card-head"><h3>${bars.monthly ? "Aylara" : "Günlere"} göre ciro</h3></div><div class="card-body">${columnChart(bars, { fmt: tl, id: "cDay" })}</div><div class="chart-tip" id="cDayTip" aria-live="polite">Çubuğa dokunun ya da üzerine gelin.</div></section>` : ""}
      <section class="card chart"><div class="card-head"><h3>Saatlere göre sipariş</h3></div><div class="card-body">${columnChart(r.byHour.map((x) => ({ label: String(x.hour).padStart(2, "0"), value: x.orders, tip: `${String(x.hour).padStart(2, "0")}:00–${String((x.hour + 1) % 24).padStart(2, "0")}:00 · ${x.orders} sipariş · ${tl(x.revenue)}` })), { fmt: (v) => String(v), id: "cHour", every: 3 })}</div><div class="chart-tip" id="cHourTip" aria-live="polite">En yoğun saat: ${peakHour(r.byHour)}</div></section>
    </div>
    <div class="charts">
      ${distCard("Ödeme tipi", r.byPayment, s.orders)}
      ${distCard("Teslimat tipi", r.byType, s.orders)}
      ${distCard("Bölge", r.byZone, s.orders)}
    </div>
    <section class="card" style="margin-bottom:14px"><div class="card-head"><h3>En çok satan ürünler</h3><span class="small muted">Ciroya göre ilk 20</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Ürün</th><th class="r">Miktar</th><th class="r">Tutar</th></tr></thead>
      <tbody>${r.topProducts.map((x, i) => `<tr><td class="muted">${i + 1}</td><td>${esc(x.name)}</td><td class="r nowrap">${numTr(x.qty)} ${esc(x.unit)}</td><td class="r nowrap"><b>${tl(x.revenue)}</b></td></tr>`).join("")}</tbody></table></div></section>
    <details class="card"><summary class="card-head" style="cursor:pointer;list-style:none"><h3>Ürün satış dökümü (${r.products.length} ürün)</h3>${icon("down")}</summary>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Ürün</th><th class="r">Satılan miktar</th><th class="r">Tutar</th></tr></thead>
      <tbody>${r.products.map((x) => `<tr><td>${esc(x.name)}</td><td class="r nowrap">${numTr(x.qty)} ${esc(x.unit)}</td><td class="r nowrap">${tl(x.revenue)}</td></tr>`).join("")}</tbody></table></div></details>`}
    <p class="small muted">İptal edilen siparişler ciroya ve dağılımlara katılmaz. Haftalar pazartesi başlar. Saatler Türkiye saatidir.</p>`;
  bindChart("cDay");
  bindChart("cHour");
}

function peakHour(byHour) {
  const top = byHour.reduce((a, b) => (b.orders > a.orders ? b : a), byHour[0]);
  return top && top.orders ? `${String(top.hour).padStart(2, "0")}:00 (${top.orders} sipariş)` : "—";
}

function aggregateDays(byDay) {
  if (byDay.length <= 62) {
    const out = byDay.map((d) => ({ label: fmtDayStr(d.date, byDay.length > 7 ? { day: "numeric" } : { weekday: "short", day: "numeric" }), value: d.revenue, tip: `${fmtDayStr(d.date, { weekday: "long", day: "numeric", month: "long" })} · ${tl(d.revenue)} · ${d.orders} sipariş` }));
    return out;
  }
  const m = new Map();
  for (const d of byDay) {
    const k = d.date.slice(0, 7);
    const x = m.get(k) || { revenue: 0, orders: 0 };
    x.revenue += d.revenue; x.orders += d.orders;
    m.set(k, x);
  }
  const out = [...m].map(([k, x]) => ({ label: fmtDayStr(`${k}-15`, { month: "short" }), value: Math.round(x.revenue * 100) / 100, tip: `${fmtDayStr(`${k}-15`, { month: "long", year: "numeric" })} · ${tl(x.revenue)} · ${x.orders} sipariş` }));
  out.monthly = true;
  return out;
}

/** Kütüphanesiz SVG sütun grafiği; her çubuk odaklanabilir ve açıklaması <title> ile okunur */
function columnChart(data, { fmt, id, every }) {
  const W = 640, H = 220, padL = 52, padB = 26, padT = 10, padR = 6;
  const max = Math.max(1, ...data.map((d) => d.value));
  // Adet grafiklerinde (sipariş sayısı) ara çizgiler tam sayı olsun: 4'ün katına yuvarlanır ("3,8 sipariş" görünmesin)
  const nice = fmt === tl ? niceMax(max) : Math.max(4, Math.ceil(niceMax(max) / 4) * 4);
  const cw = (W - padL - padR) / data.length;
  const bw = Math.max(2, Math.min(36, cw * 0.7));
  const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
  const step = every || Math.ceil(data.length / 12);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = nice * f, yy = y(v);
    return `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/><text x="${padL - 6}" y="${yy + 4}" text-anchor="end">${esc(short(v, fmt))}</text>`;
  }).join("");
  const bars = data.map((d, i) => {
    const x = padL + cw * i + (cw - bw) / 2;
    const yy = y(d.value);
    const hgt = Math.max(d.value ? 2 : 1, H - padB - yy);
    return `<rect class="bar ${d.value ? "" : "zero"}" x="${x.toFixed(1)}" y="${(H - padB - hgt).toFixed(1)}" width="${bw.toFixed(1)}" height="${hgt.toFixed(1)}" rx="2" tabindex="0" role="img" aria-label="${esc(d.tip)}" data-tip="${esc(d.tip)}"><title>${esc(d.tip)}</title></rect>`
      + (i % step === 0 ? `<text x="${(padL + cw * i + cw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>` : "");
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" id="${id}" role="group" aria-label="Grafik">${grid}<line class="axis" x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}"/>${bars}</svg>`;
}
function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
function short(v, fmt) {
  if (fmt === tl) return v >= 1000 ? `₺${numTr(v / 1000, 1)}B` : `₺${numTr(v, 0)}`;
  return numTr(v, 1);
}
function bindChart(id) {
  const svg = document.getElementById(id);
  const tip = document.getElementById(`${id}Tip`);
  if (!svg || !tip) return;
  const show = (e) => { const b = e.target.closest(".bar"); if (b) tip.textContent = b.dataset.tip; };
  svg.addEventListener("pointerover", show);
  svg.addEventListener("focusin", show);
  svg.addEventListener("click", show);
}
function distCard(title, rows, totalOrders) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return `<section class="card"><div class="card-head"><h3>${esc(title)}</h3></div><div class="card-body"><div class="hbars">
    ${rows.length ? rows.map((r) => `<div class="hbar"><span class="lbl" title="${esc(r.label)}">${esc(r.label)}</span><span class="track"><span class="fill" style="width:${((r.revenue / max) * 100).toFixed(1)}%;display:block"></span></span><span class="val">${tl(r.revenue)} <small>${r.orders} sip. · %${totalOrders ? Math.round((r.orders / totalOrders) * 100) : 0}</small></span></div>`).join("") : `<p class="muted small">Veri yok.</p>`}
  </div></div></section>`;
}
