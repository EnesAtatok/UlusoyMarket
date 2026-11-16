"use strict";
// Raporlar: ciro ve dağılımlar (iptal edilen siparişler ciroya katılmaz)

const { round2 } = require("./util");
const { localDateStr, addDaysStr, zonedParts, localDayStartMs } = require("./hours");
const { dateRange, TYPE_LABEL, PAYMENT_LABEL } = require("./orders");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function summarize(list) {
  const valid = list.filter((o) => o.status !== "İptal");
  const revenue = round2(valid.reduce((t, o) => t + o.total, 0));
  return {
    revenue,
    orders: valid.length,
    cancelled: list.length - valid.length,
    avgBasket: valid.length ? round2(revenue / valid.length) : 0,
    itemsSold: valid.reduce((t, o) => t + o.items.reduce((s, i) => s + i.qty, 0), 0),
    discountTotal: round2(valid.reduce((t, o) => t + (o.discount || 0), 0)),
    deliveryFeeTotal: round2(valid.reduce((t, o) => t + (o.deliveryFee || 0), 0)),
  };
}

function group(list, keyFn, labelFn) {
  const map = new Map();
  for (const o of list) {
    const key = keyFn(o);
    const g = map.get(key) || { key, label: labelFn ? labelFn(key, o) : key, orders: 0, revenue: 0 };
    g.orders++;
    g.revenue = round2(g.revenue + o.total);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

function inRange(orders, startMs, endMs) {
  return orders.filter((o) => {
    const t = Date.parse(o.createdAt);
    return t >= startMs && t < endMs;
  });
}

function report(db, { from, to, now = new Date() } = {}) {
  const today = localDateStr(now);
  if (!DATE_RE.test(to || "")) to = today;
  if (!DATE_RE.test(from || "")) from = addDaysStr(to, -6);
  if (from > to) [from, to] = [to, from];
  // Aşırı uzun aralıklarda gün listesi 1100 günle sınırlı
  const { start, end } = dateRange(from, to);
  const all = inRange(db.orders, start, end);
  const valid = all.filter((o) => o.status !== "İptal");

  const byDay = [];
  const dayMap = new Map();
  for (let d = from, n = 0; d <= to && n < 1100; d = addDaysStr(d, 1), n++) {
    const row = { date: d, orders: 0, revenue: 0 };
    byDay.push(row);
    dayMap.set(d, row);
  }
  for (const o of valid) {
    const row = dayMap.get(localDateStr(new Date(o.createdAt)));
    if (row) { row.orders++; row.revenue = round2(row.revenue + o.total); }
  }

  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, revenue: 0 }));
  for (const o of valid) {
    const h = zonedParts(new Date(o.createdAt)).hour;
    byHour[h].orders++;
    byHour[h].revenue = round2(byHour[h].revenue + o.total);
  }

  const prod = new Map();
  for (const o of valid) {
    for (const i of o.items) {
      const r = prod.get(i.productId) || { productId: i.productId, name: i.name, unit: i.unit || "adet", qty: 0, revenue: 0 };
      r.qty += i.qty;
      r.revenue = round2(r.revenue + i.price * i.qty);
      prod.set(i.productId, r);
    }
  }
  const products = [...prod.values()].sort((a, b) => b.revenue - a.revenue || b.qty - a.qty);

  const byStatus = {};
  for (const o of all) byStatus[o.status] = (byStatus[o.status] || 0) + 1;

  // Sabit dönem toplamları (seçili aralıktan bağımsız): bugün, bu hafta (Pzt), bu ay, bu yıl
  const p = zonedParts(now);
  const weekStart = addDaysStr(today, -p.weekday);
  const monthStart = today.slice(0, 8) + "01";
  const yearStart = today.slice(0, 5) + "01-01";
  const endToday = localDayStartMs(addDaysStr(today, 1));
  const period = (startDate) => {
    const s = summarize(inRange(db.orders, localDayStartMs(startDate), endToday));
    return { from: startDate, revenue: s.revenue, orders: s.orders };
  };

  return {
    from,
    to,
    summary: summarize(all),
    byDay,
    byHour,
    byPayment: group(valid, (o) => o.payment, (k) => PAYMENT_LABEL[k] || k),
    byType: group(valid, (o) => o.type, (k) => TYPE_LABEL[k] || k),
    byZone: group(valid, (o) => (o.type === "gelal" ? "gelal" : o.customer.zoneName || "Belirtilmemiş"), (k) => (k === "gelal" ? "Gel-al" : k)),
    byStatus,
    topProducts: products.slice(0, 20),
    products,
    totals: { today: period(today), week: period(weekStart), month: period(monthStart), year: period(yearStart) },
  };
}

module.exports = { report };
