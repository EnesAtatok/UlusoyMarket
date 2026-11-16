"use strict";
// Çalışma saatleri: şu an açık mı, ne zaman kapanır/açılır (Türkiye saatiyle)
// days[0] = Pazartesi ... days[6] = Pazar. close <= open ise kapanış ertesi güne sarkar.
// open === close ise o gün 24 saat açıktır.

const TIMEZONE = process.env.STORE_TZ || "Europe/Istanbul";
const DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const WEEKDAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const DAY_MS = 86400000;

const fmtCache = new Map();
function formatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(
      tz,
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "short",
        hourCycle: "h23",
      })
    );
  }
  return fmtCache.get(tz);
}

// Bir anın yerel (mağaza saat dilimi) parçaları
function zonedParts(date, tz = TIMEZONE) {
  const o = {};
  for (const p of formatter(tz).formatToParts(date)) o[p.type] = p.value;
  const hour = Number(o.hour) % 24;
  return {
    year: Number(o.year),
    month: Number(o.month),
    day: Number(o.day),
    hour,
    minute: Number(o.minute),
    second: Number(o.second),
    weekday: WEEKDAY[o.weekday],
  };
}
function offsetMs(ms, tz) {
  const p = zonedParts(new Date(ms), tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (ms - (((ms % 1000) + 1000) % 1000));
}
// Yerel tarih + dakika → gerçek zaman (ms)
function localToMs(y, m, d, minutes, tz = TIMEZONE) {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let t = guess - offsetMs(guess, tz);
  const off2 = offsetMs(t, tz);
  if (guess - off2 !== t) t = guess - off2;
  return t;
}
// Yerel takvim günü (YYYY-MM-DD)
function localDateStr(date, tz = TIMEZONE) {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
// "YYYY-MM-DD" yerel günün başlangıcı (ms)
function localDayStartMs(dateStr, tz = TIMEZONE) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return localToMs(y, m, d, 0, tz);
}
function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fromMin = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// Türkçe ek: saatin okunuşundaki son kelimeye göre ("02:00" → "'ye", "14:00" → "'te")
const LAST_WORD = {
  0: "sıfır", 1: "bir", 2: "iki", 3: "üç", 4: "dört", 5: "beş", 6: "altı", 7: "yedi", 8: "sekiz", 9: "dokuz",
  10: "on", 20: "yirmi", 30: "otuz", 40: "kırk", 50: "elli",
};
function lastWord(n) {
  if (n === 0) return LAST_WORD[0];
  return n % 10 ? LAST_WORD[n % 10] : LAST_WORD[n];
}
function timeWithSuffix(hhmm, kind) {
  const [h, m] = hhmm.split(":").map(Number);
  const word = m ? lastWord(m) : lastWord(h);
  const vowels = word.match(/[aeıioöuü]/g) || ["a"];
  const v = vowels[vowels.length - 1];
  const back = "aıou".includes(v);
  const endsVowel = /[aeıioöuü]$/.test(word);
  if (kind === "dative") return `${hhmm}'${endsVowel ? "y" : ""}${back ? "a" : "e"}`;
  const hard = /[çfhkpsşt]$/.test(word);
  return `${hhmm}'${hard ? "t" : "d"}${back ? "a" : "e"}`;
}

// Önümüzdeki günlerin açık aralıkları (bitişik aralıklar birleştirilir)
function openIntervals(hours, now, tz = TIMEZONE, spanDays = 8) {
  const days = (hours && Array.isArray(hours.days) && hours.days) || [];
  const today = localDateStr(now, tz);
  const todayIdx = zonedParts(now, tz).weekday;
  const list = [];
  for (let k = -1; k <= spanDays; k++) {
    const idx = (((todayIdx + k) % 7) + 7) % 7;
    const day = days[idx];
    if (!day || day.closed) continue;
    const o = toMin(day.open);
    const c = toMin(day.close);
    if (o === null || c === null) continue;
    const date = addDaysStr(today, k);
    const [y, m, d] = date.split("-").map(Number);
    const start = localToMs(y, m, d, o, tz);
    let end;
    if (o === c) end = localToMs(y, m, d + 1, o, tz);
    else if (c < o) end = localToMs(y, m, d + 1, c, tz);
    else end = localToMs(y, m, d, c, tz);
    list.push({ start, end, dayIdx: idx, date });
  }
  list.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const it of list) {
    const last = merged[merged.length - 1];
    if (last && it.start <= last.end) last.end = Math.max(last.end, it.end);
    else merged.push({ ...it });
  }
  return merged;
}

// Mağazanın şu anki durumu. Ön yüz ve sipariş doğrulaması bunu kullanır.
function storeStatus(settings, now = new Date(), tz = TIMEZONE) {
  const ordering = settings.ordering || {};
  const nowMs = now.getTime();
  const intervals = openIntervals(settings.hours, now, tz);
  const current = intervals.find((i) => i.start <= nowMs && nowMs < i.end);
  const next = intervals.find((i) => i.start > nowMs);
  const today = localDateStr(now, tz);
  const alwaysOpen = !!current && current.end - nowMs >= 6 * DAY_MS;
  const isOpen = !!current;
  const paused = ordering.enabled === false;
  const preorder = !isOpen && !paused && !!ordering.allowPreorder && !!next;
  const acceptingOrders = !paused && (isOpen || preorder);

  const hhmm = (ms) => {
    const p = zonedParts(new Date(ms), tz);
    return fromMin(p.hour * 60 + p.minute);
  };
  let closesAt = null;
  let opensAt = null;
  let opensDay = null;
  if (current && !alwaysOpen) closesAt = hhmm(current.end);
  if (!current && next) {
    opensAt = hhmm(next.start);
    const openDate = localDateStr(new Date(next.start), tz);
    if (openDate === today) opensDay = "bugün";
    else if (openDate === addDaysStr(today, 1)) opensDay = "yarın";
    else opensDay = DAY_NAMES[zonedParts(new Date(next.start), tz).weekday];
  }

  let label;
  let message;
  if (isOpen) {
    label = alwaysOpen ? "Açık · 7/24" : `Açık · ${timeWithSuffix(closesAt, "dative")} kadar`;
  } else if (opensAt) {
    const when = opensDay === "bugün" ? "" : `${opensDay === "yarın" ? "Yarın" : opensDay} `;
    label = `Kapalı · ${when}${timeWithSuffix(opensAt, "locative")} açılır`;
  } else {
    label = "Kapalı";
  }
  if (paused) {
    message = ordering.pausedMessage || "Şu an online sipariş alamıyoruz. Telefonla ulaşabilirsiniz.";
  } else if (isOpen) {
    message = "Siparişleriniz hemen hazırlanır.";
  } else if (preorder) {
    const when = opensDay === "bugün" ? "" : `${opensDay === "yarın" ? "yarın" : opensDay} `;
    message = `Şu an kapalıyız. Ön sipariş verebilirsiniz; siparişiniz ${when}${timeWithSuffix(opensAt, "locative")} hazırlanmaya başlar.`;
  } else if (opensAt) {
    const when = opensDay === "bugün" ? "bugün" : opensDay === "yarın" ? "yarın" : opensDay;
    message = `Şu an kapalıyız. Online sipariş ${when} ${timeWithSuffix(opensAt, "locative")} yeniden açılır.`;
  } else {
    message = "Şu an online sipariş alamıyoruz.";
  }

  return {
    isOpen,
    acceptingOrders,
    preorder,
    paused,
    state: paused ? "durduruldu" : isOpen ? "acik" : "kapali",
    label: paused ? "Sipariş alımı durduruldu" : label,
    hoursLabel: label,
    message,
    alwaysOpen,
    closesAt,
    closesAtIso: current && !alwaysOpen ? new Date(current.end).toISOString() : null,
    opensAt,
    opensAtIso: !current && next ? new Date(next.start).toISOString() : null,
    opensDay,
    serverTime: now.toISOString(),
  };
}

// "Her gün 14:00–02:00" ya da gün gün özet (alt bilgi ve SEO için)
function hoursSummary(hours) {
  const days = (hours && hours.days) || [];
  const txt = (d) => (!d || d.closed ? "Kapalı" : d.open === d.close ? "24 saat" : `${d.open}–${d.close}`);
  const all = days.map(txt);
  if (all.length === 7 && all.every((t) => t === all[0])) return [{ days: "Her gün", text: all[0] }];
  const out = [];
  for (let i = 0; i < 7; i++) {
    const last = out[out.length - 1];
    if (last && last.text === all[i]) last.to = i;
    else out.push({ from: i, to: i, text: all[i] });
  }
  return out.map((g) => ({
    days: g.from === g.to ? DAY_NAMES[g.from] : `${DAY_NAMES[g.from]}–${DAY_NAMES[g.to]}`,
    text: g.text,
  }));
}

module.exports = {
  TIMEZONE,
  DAY_NAMES,
  storeStatus,
  hoursSummary,
  openIntervals,
  timeWithSuffix,
  zonedParts,
  localDateStr,
  localDayStartMs,
  addDaysStr,
  toMin,
};
