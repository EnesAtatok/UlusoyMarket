"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { storeStatus, timeWithSuffix, hoursSummary } = require("../lib/hours");
const { DEFAULT_SETTINGS } = require("../lib/defaults");
const { clone } = require("../lib/util");

const settings = (mut) => {
  const s = clone(DEFAULT_SETTINGS);
  if (mut) mut(s);
  return s;
};
// Türkiye saati UTC+3: "2026-11-16 21:00" yerel → 18:00Z. 16 Kasım 2026 Pazartesi.
const at = (local) => new Date(local.replace(" ", "T") + ":00+03:00");

test("açık saatte: kapanış saati ve doğru Türkçe ek", () => {
  const st = storeStatus(settings(), at("2026-11-16 21:00"));
  assert.equal(st.isOpen, true);
  assert.equal(st.acceptingOrders, true);
  assert.equal(st.state, "acik");
  assert.equal(st.closesAt, "02:00");
  assert.equal(st.label, "Açık · 02:00'ye kadar");
  assert.equal(st.closesAtIso, "2026-11-16T23:00:00.000Z");
});

test("gece yarısını aşan aralık: 01:30'da hâlâ açık (önceki günün aralığı)", () => {
  const st = storeStatus(settings(), at("2026-11-17 01:30"));
  assert.equal(st.isOpen, true);
  assert.equal(st.closesAt, "02:00");
});

test("02:00'de kapanır; 10:00'da 'bugün 14:00'te açılır'", () => {
  const s = settings();
  assert.equal(storeStatus(s, at("2026-11-17 02:00")).isOpen, false);
  const st = storeStatus(s, at("2026-11-17 10:00"));
  assert.equal(st.isOpen, false);
  assert.equal(st.acceptingOrders, false);
  assert.equal(st.opensAt, "14:00");
  assert.equal(st.opensDay, "bugün");
  assert.equal(st.label, "Kapalı · 14:00'te açılır");
});

test("ertesi gün kapalıysa sonraki açık güne atlar", () => {
  const s = settings((x) => { x.hours.days[1].closed = true; }); // Salı kapalı
  const st = storeStatus(s, at("2026-11-17 10:00")); // Salı sabahı
  assert.equal(st.isOpen, false);
  assert.equal(st.opensDay, "yarın");
  assert.equal(st.label, "Kapalı · Yarın 14:00'te açılır");
  const s2 = settings((x) => { x.hours.days[1].closed = true; x.hours.days[2].closed = true; });
  const st2 = storeStatus(s2, at("2026-11-17 10:00"));
  assert.equal(st2.opensDay, "Perşembe");
  // Pazartesi aralığı Salı 02:00'ye kadar sürer (Salı kapalı olsa bile)
  assert.equal(storeStatus(s, at("2026-11-17 01:00")).isOpen, true);
});

test("sipariş alımı durdurulduysa kabul edilmez; ön sipariş kapalı saatte kabul edilir", () => {
  const paused = storeStatus(settings((x) => { x.ordering.enabled = false; x.ordering.allowPreorder = true; }), at("2026-11-16 21:00"));
  assert.equal(paused.isOpen, true);
  assert.equal(paused.acceptingOrders, false);
  assert.equal(paused.state, "durduruldu");
  const pre = storeStatus(settings((x) => { x.ordering.allowPreorder = true; }), at("2026-11-17 10:00"));
  assert.equal(pre.isOpen, false);
  assert.equal(pre.preorder, true);
  assert.equal(pre.acceptingOrders, true);
  assert.match(pre.message, /Ön sipariş/);
});

test("24 saat açık gün ve 7/24", () => {
  const s = settings((x) => x.hours.days.forEach((d) => { d.open = "00:00"; d.close = "00:00"; }));
  const st = storeStatus(s, at("2026-11-16 05:00"));
  assert.equal(st.isOpen, true);
  assert.equal(st.alwaysOpen, true);
  assert.equal(st.label, "Açık · 7/24");
});

test("normal (aynı gün) aralık", () => {
  const s = settings((x) => x.hours.days.forEach((d) => { d.open = "09:30"; d.close = "21:00"; }));
  assert.equal(storeStatus(s, at("2026-11-16 09:29")).isOpen, false);
  assert.equal(storeStatus(s, at("2026-11-16 09:30")).isOpen, true);
  assert.equal(storeStatus(s, at("2026-11-16 21:00")).isOpen, false);
  assert.equal(storeStatus(s, at("2026-11-16 22:00")).label, "Kapalı · Yarın 09:30'da açılır");
});

test("Türkçe saat ekleri", () => {
  assert.equal(timeWithSuffix("02:00", "dative"), "02:00'ye");
  assert.equal(timeWithSuffix("14:00", "dative"), "14:00'e");
  assert.equal(timeWithSuffix("14:00", "locative"), "14:00'te");
  assert.equal(timeWithSuffix("09:00", "dative"), "09:00'a");
  assert.equal(timeWithSuffix("10:00", "locative"), "10:00'da");
  assert.equal(timeWithSuffix("16:00", "locative"), "16:00'da");
  assert.equal(timeWithSuffix("22:30", "dative"), "22:30'a");
  assert.equal(timeWithSuffix("23:40", "locative"), "23:40'ta");
  assert.equal(timeWithSuffix("00:00", "dative"), "00:00'a");
});

test("saat özeti", () => {
  assert.deepEqual(hoursSummary(DEFAULT_SETTINGS.hours), [{ days: "Her gün", text: "14:00–02:00" }]);
  const s = settings((x) => { x.hours.days[6].closed = true; });
  assert.deepEqual(hoursSummary(s.hours), [
    { days: "Pazartesi–Cumartesi", text: "14:00–02:00" },
    { days: "Pazar", text: "Kapalı" },
  ]);
});
