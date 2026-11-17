"use strict";
// A3: eski şifreyle başlamış giriş, şifre değişikliği / sıfırlama / geri yükleme araya girerse oturum almamalı.
// Yarış belirlenimci olsun diye şifre doğrulaması (scrypt) bu dosyada isteğe bağlı bir kapıda bekletilir.
// node --test her test dosyasını ayrı süreçte çalıştırır; bu değişiklik diğer dosyaları etkilemez.
const test = require("node:test");
const assert = require("node:assert/strict");

const auth = require("../lib/auth");
const realVerify = auth.verifyPassword;
let gate = null; // { username → Promise } bekletilecek girişler
auth.verifyPassword = async (password, stored) => {
  const g = gate && gate.get(password); // kapı çağrı anında yakalanır
  const ok = await realVerify(password, stored);
  if (g) await g;
  return ok;
};

const { start } = require("./helpers");

function hold(password) {
  let release;
  const p = new Promise((r) => (release = r));
  gate = gate || new Map();
  gate.set(password, p);
  return () => { gate.delete(password); release(); };
}
const tick = () => new Promise((r) => setTimeout(r, 80));

async function setup() {
  const s = await start();
  const admin = await s.login();
  const r = await s.req("POST", "/api/admin/users", { username: "kasa", password: "eskiSifre1", role: "personel" }, admin);
  assert.equal(r.status, 201);
  return { s, admin, kasaId: r.json.id };
}

test("A3 yönetici sıfırlaması sırasında eski şifreyle süren giriş oturum almaz", async () => {
  const { s, admin, kasaId } = await setup();
  try {
    const release = hold("eskiSifre1");
    const login = s.req("POST", "/api/admin/login", { username: "kasa", password: "eskiSifre1" });
    await tick();
    assert.equal((await s.req("PATCH", `/api/admin/users/${kasaId}`, { password: "yeniSifre12" }, admin)).status, 200);
    release();
    const r = await login;
    assert.equal(r.status, 401, `eski şifreyle oturum verildi: ${r.text}`);
    assert.ok(![...s.app.sessions.map.values()].some((v) => v.userId === kasaId), "kasa için oturum kaldı");
  } finally {
    await s.close();
  }
});

test("A3 kendi şifresini değiştirme sırasında eski şifreyle süren giriş oturum almaz", async () => {
  const { s, kasaId } = await setup();
  try {
    const own = await s.login("kasa", "eskiSifre1");
    const release = hold("eskiSifre1");
    const login = s.req("POST", "/api/admin/login", { username: "kasa", password: "eskiSifre1" });
    await tick();
    // Kendi şifre değişikliği de verifyPassword'den geçer; mevcut şifre kapıda beklemesin diye kapı yalnızca giriş için
    gate.delete("eskiSifre1");
    const ch = await s.req("POST", "/api/admin/password", { currentPassword: "eskiSifre1", newPassword: "yeniSifre12" }, own);
    assert.equal(ch.status, 200, ch.text);
    release();
    const r = await login;
    assert.equal(r.status, 401, `eski şifreyle oturum verildi: ${r.text}`);
    const sessions = [...s.app.sessions.map.values()].filter((v) => v.userId === kasaId);
    assert.equal(sessions.length, 1, "yalnızca şifreyi değiştiren oturum kalmalı");
  } finally {
    await s.close();
  }
});

test("A3 kullanıcı pasifleştirilirken / silinirken süren giriş oturum almaz", async () => {
  const { s, admin, kasaId } = await setup();
  try {
    const release = hold("eskiSifre1");
    const login = s.req("POST", "/api/admin/login", { username: "kasa", password: "eskiSifre1" });
    await tick();
    assert.equal((await s.req("DELETE", `/api/admin/users/${kasaId}`, undefined, admin)).status, 200);
    release();
    assert.equal((await login).status, 401);
    assert.equal(s.app.sessions.map.size, 1, "yalnızca yöneticinin oturumu kalmalı");
  } finally {
    await s.close();
  }
});

test("A3 geri yükleme sırasında süren giriş oturum almaz", async () => {
  const { s, admin } = await setup();
  try {
    const backup = JSON.parse((await s.req("GET", "/api/admin/backup", undefined, admin)).text);
    // Yedekte kasa farklı şifreli
    backup.users.find((u) => u.username === "kasa").passHash = await auth.hashPassword("baskaSifre9");
    const release = hold("eskiSifre1");
    const login = s.req("POST", "/api/admin/login", { username: "kasa", password: "eskiSifre1" });
    await tick();
    assert.equal((await s.req("POST", "/api/admin/restore", backup, admin)).status, 200);
    release();
    assert.equal((await login).status, 401);
    assert.equal(s.app.sessions.map.size, 0);
  } finally {
    await s.close();
  }
});

test("A3 şifre değiştirme sırasında şifre başka yerden sıfırlanırsa eski isteğin sonucu yazılmaz", async () => {
  const { s, admin, kasaId } = await setup();
  try {
    const own = await s.login("kasa", "eskiSifre1");
    const release = hold("eskiSifre1");
    const change = s.req("POST", "/api/admin/password", { currentPassword: "eskiSifre1", newPassword: "saldirganSifre1" }, own);
    await tick();
    assert.equal((await s.req("PATCH", `/api/admin/users/${kasaId}`, { password: "yoneticiSifre1" }, admin)).status, 200);
    release();
    const r = await change;
    assert.notEqual(r.status, 200, r.text);
    assert.equal((await s.req("POST", "/api/admin/login", { username: "kasa", password: "yoneticiSifre1" })).status, 200);
  } finally {
    await s.close();
  }
});
