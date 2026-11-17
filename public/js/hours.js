// Çalışma saati göstergesi (karşılama alanı). Veri: GET /api/store → status (today, week, nextOpenIso …).
// Çubuğun ekseni o günün vardiyasını ve "şimdi"yi kapsayacak şekilde seçilir; açılış ve kapanış saati dolu
// bandın başında ve sonunda yazar. Etiketlerin çakışmaması için yerleşim çizimden sonra ölçülerek düzeltilir.
import { esc, icon } from "./lib.js";

let clockOffset = 0; // sunucu saati - cihaz saati (ms)
export function syncClock(serverIso) {
  const t = Date.parse(serverIso);
  if (Number.isFinite(t)) clockOffset = t - Date.now();
}
export const serverNow = () => Date.now() + clockOffset;

const TZ = "Europe/Istanbul";
const HM = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const hm = (ms) => HM.format(new Date(ms));

/** 80 → "1 sa 20 dk", 45 → "45 dk", 180 → "3 sa" */
export function fmtDur(min) {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} dk`;
  if (m >= 1440) {
    const d = Math.floor(m / 1440);
    const hh = Math.floor((m % 1440) / 60);
    return hh ? `${d} gün ${hh} sa` : `${d} gün`;
  }
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} sa ${r} dk` : `${h} sa`;
}

const dayHours = (d) => (d.closed ? "Kapalı" : d.allDay ? "24 saat açık" : `${d.open} – ${d.close}${d.overnight ? " (gece)" : ""}`);

function weekList(st) {
  const week = st.week || [];
  if (!week.length) return "";
  return `<details class="gauge-week">
    <summary>Haftalık çalışma saatleri${icon("down")}</summary>
    <ul>${week
      .map(
        (d) => `<li${d.isToday ? ' class="is-today"' : ""}><span>${esc(d.dayName)}${d.isToday ? ' <span class="gauge-today">bugün</span>' : ""}</span><span>${esc(dayHours(d))}</span></li>`,
      )
      .join("")}</ul>
  </details>`;
}

/** Göstergenin anlık durumu: başlık metni, kalan süre, bant konumları */
function model(st, now) {
  const t = st.today || {};
  const paused = st.state === "durduruldu";
  const out = { paused, kind: "band", chip: "", chipState: st.state || "kapali", lead: "", sub: "" };
  const nextOpen = Date.parse(st.nextOpenIso || st.opensAtIso || "");
  if (st.alwaysOpen || t.allDay) {
    out.kind = "full";
    out.chip = paused ? "Sipariş alımı durduruldu" : "Açık";
    out.lead = paused ? st.message || "" : "Bugün 24 saat açık";
    return out;
  }
  if (t.closed || !t.startIso || !t.endIso) {
    out.kind = "closed";
    out.chip = paused ? "Sipariş alımı durduruldu" : "Kapalı";
    out.lead = "Bugün kapalıyız";
    if (Number.isFinite(nextOpen)) out.sub = `Açılışa ${fmtDur((nextOpen - now) / 60000)}${st.opensAt ? ` (${st.opensDay && st.opensDay !== "bugün" ? `${st.opensDay} ` : ""}${st.opensAt})` : ""}`;
    if (paused) out.sub = st.message || out.sub;
    return out;
  }
  const start = Date.parse(t.startIso);
  const end = Date.parse(t.endIso);
  out.start = start;
  out.end = end;
  out.now = now;
  out.openLabel = t.open;
  out.closeLabel = t.close;
  const open = now >= start && now < end;
  if (paused) {
    out.chip = "Sipariş alımı durduruldu";
    out.lead = "Sipariş alımına ara verdik";
    out.sub = [st.message, open ? `Dükkân açık, kapanışa ${fmtDur((end - now) / 60000)}.` : ""].filter(Boolean).join(" ");
  } else if (open) {
    out.chip = "Açık";
    out.chipState = "acik";
    out.lead = `Kapanışa ${fmtDur((end - now) / 60000)}`;
    out.sub = `Bugün ${t.open} – ${t.overnight ? "gece " : ""}${t.close}`;
  } else {
    out.chip = "Kapalı";
    out.chipState = "kapali";
    const target = now < start ? start : nextOpen;
    out.lead = Number.isFinite(target) ? `Açılışa ${fmtDur((target - now) / 60000)}` : "Şu an kapalıyız";
    const dayWord = st.opensDay === "yarın" ? "Yarın" : st.opensDay && st.opensDay !== "bugün" ? st.opensDay : "Bugün";
    out.sub = now < start ? `Bugün açılış ${t.open}` : st.opensAt ? `${dayWord} açılış ${st.opensAt}` : "";
  }
  // Eksen: vardiya + şimdi, iki yanda pay
  let a = Math.min(start, now);
  let b = Math.max(end, now);
  const pad = Math.max((b - a) * 0.07, 25 * 60000);
  a -= pad;
  b += pad;
  const pct = (x) => ((x - a) / (b - a)) * 100;
  out.bandL = pct(start);
  out.bandR = pct(end);
  out.nowP = pct(now);
  out.over = now >= end;
  return out;
}

export function gaugeHtml(st, now = serverNow()) {
  const m = model(st, now);
  const head = `<div class="gauge-head">
      <span class="gauge-chip" data-state="${esc(m.paused ? "durduruldu" : m.chipState)}"><span class="gauge-dot" aria-hidden="true"></span>${esc(m.chip)}</span>
      ${st.today?.dayName ? `<span class="gauge-day">${esc(st.today.dayName)}</span>` : ""}
    </div>
    <p class="gauge-lead">${esc(m.lead)}</p>
    ${m.sub ? `<p class="gauge-sub">${esc(m.sub)}</p>` : ""}`;
  let bar = "";
  if (m.kind === "band") {
    const f = (n) => n.toFixed(2);
    const label = `Bugünkü sipariş saatleri ${m.openLabel} ile ${m.closeLabel} arası. Şu an saat ${hm(now)}.`;
    bar = `<div class="gauge-bar${m.paused ? " is-paused" : ""}${m.over ? " is-over" : ""}" role="img" aria-label="${esc(label)}">
      <span class="gauge-now-label" data-at="${f(m.nowP)}" style="left:${f(m.nowP)}%">Şimdi ${esc(hm(now))}</span>
      <div class="gauge-track">
        <span class="gauge-band" style="left:${f(m.bandL)}%;width:${f(m.bandR - m.bandL)}%"></span>
        <span class="gauge-now" style="left:${f(m.nowP)}%"></span>
      </div>
      <div class="gauge-ends">
        <span class="gauge-end gauge-open" data-at="${f(m.bandL)}" style="left:${f(m.bandL)}%"><b>${esc(m.openLabel)}</b><small>açılış</small></span>
        <span class="gauge-end gauge-close" data-at="${f(m.bandR)}" style="left:${f(m.bandR)}%"><b>${esc(m.closeLabel)}</b><small>kapanış</small></span>
      </div>
    </div>`;
  } else if (m.kind === "full") {
    bar = `<div class="gauge-bar${m.paused ? " is-paused" : ""}" aria-hidden="true"><div class="gauge-track"><span class="gauge-band" style="left:0;width:100%"></span></div></div>`;
  } else {
    bar = `<div class="gauge-bar is-closed" aria-hidden="true"><div class="gauge-track"></div></div>`;
  }
  return `<div class="gauge" data-gauge>${head}${bar}${weekList(st)}</div>`;
}

/** Etiketleri ölçüp kaydırır: kenarlardan taşmaz, açılış ve kapanış birbirine binmez */
export function fitGauge(root = document) {
  for (const bar of root.querySelectorAll(".gauge-bar")) {
    const W = bar.clientWidth;
    if (!W) continue;
    const place = (el, center) => {
      const w = el.offsetWidth;
      const left = Math.min(Math.max(center - w / 2, 0), Math.max(0, W - w));
      el.style.left = `${left}px`;
      el.style.transform = "none";
      return [left, left + w];
    };
    const now = bar.querySelector(".gauge-now-label");
    if (now) place(now, (Number(now.dataset.at) / 100) * W);
    const o = bar.querySelector(".gauge-open");
    const c = bar.querySelector(".gauge-close");
    if (o && c) {
      const oc = (Number(o.dataset.at) / 100) * W;
      const cc = (Number(c.dataset.at) / 100) * W;
      // Açılış etiketi sola, kapanış sağa yaslanır (bant ucu etiketin iç kenarında)
      const ow = o.offsetWidth;
      const cw = c.offsetWidth;
      let ol = oc - Math.min(ow / 2, 6);
      let cl = cc - cw + Math.min(cw / 2, 6);
      const gap = 10;
      if (ol + ow + gap > cl) {
        // Bant kısa: ikisini bant ortasının iki yanına koy
        const mid = (oc + cc) / 2;
        ol = mid - gap / 2 - ow;
        cl = mid + gap / 2;
      }
      // Kenarlara sıkıştır, sonra çakışmayı yeniden çöz
      ol = Math.max(0, ol);
      cl = Math.min(W - cw, cl);
      if (ol + ow + gap > cl) {
        if (ol === 0) cl = ow + gap;
        else ol = cl - gap - ow;
      }
      o.style.left = `${ol}px`;
      c.style.left = `${cl}px`;
      o.style.transform = c.style.transform = "none";
    }
  }
}
