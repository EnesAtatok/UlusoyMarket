"use strict";
// Depoda şifreleme (DATA_KEY), parolalı yedek, anahtar döndürme — saldırı/kurcalama denemeleri dahil
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { start, tmpDir, orderBody } = require("./helpers");
const { createApp } = require("../lib/app");
const { isEncrypted, Cipher } = require("../lib/secure-file");

const KEY = "test-anahtari-0123456789-abcdef";
const KEY2 = "ikinci-anahtar-9876543210-zyxwvu";
const files = (dir) => {
  const out = ["db.json", "sessions.json", "audit.json"].map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
  const b = path.join(dir, "backups");
  if (fs.existsSync(b)) for (const f of fs.readdirSync(b)) out.push(path.join(b, f));
  return out;
};
const snapshot = (dir) => Object.fromEntries(files(dir).map((f) => [f, crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")]));
const tryStart = (dir, dataKey) => createApp({ dataDir: dir, dataKey, log: () => {}, publicUrl: "" });

test("düz veri DATA_KEY ile açılınca db, oturum, denetim kaydı ve yedekler şifrelenir; aynı anahtarla veri aynen gelir", async () => {
  const dir = tmpDir();
  // 1) Şifresiz kurulum: sipariş + oturum + yedek oluşsun
  let s = await start({ dataDir: dir, dataKey: "" });
  await s.req("POST", "/api/orders", orderBody({ name: "Gizli Müşteri" }));
  const tok = await s.login();
  await s.req("POST", "/api/admin/orders/bulk", { ids: [1], action: "status", status: "Hazırlanıyor" }, tok);
  s.app.store.backupNow("elle");
  await s.close(true);
  assert.match(fs.readFileSync(path.join(dir, "db.json"), "utf8"), /Gizli Müşteri/);

  // 2) Aynı veri DATA_KEY ile: tüm dosyalar şifreli yazılır
  s = await start({ dataDir: dir, dataKey: KEY });
  try {
    for (const f of files(dir)) {
      const buf = fs.readFileSync(f);
      assert.ok(isEncrypted(buf), `${path.basename(f)} şifreli değil`);
      assert.doesNotMatch(buf.toString("utf8"), /Gizli Müşteri|05321234567/, `${path.basename(f)} içinde düz kişisel veri`);
    }
    assert.equal(s.app.db.orders[0].customer.name, "Gizli Müşteri");
    // Eski oturum yeni şifreli dosyada geçerli kalır
    assert.equal((await s.req("GET", "/api/admin/me", undefined, tok)).status, 200);
    // Sunucudaki şifreli yedek panelden düz JSON olarak indirilir
    const name = (await s.req("GET", "/api/admin/backups", undefined, tok)).json[0].name;
    const dl = await s.req("GET", `/api/admin/backups/${name}`, undefined, tok);
    assert.equal(dl.status, 200);
    assert.ok(Array.isArray(dl.json.orders));
    // Güvenlik durumu: şifreleme açık
    assert.equal((await s.req("GET", "/api/admin/security", undefined, tok)).json.dataKey.enabled, true);
  } finally {
    await s.close(true);
  }
  // 3) Yeniden başlatma (aynı anahtar)
  s = await start({ dataDir: dir, dataKey: KEY });
  assert.equal(s.app.db.orders[0].customer.name, "Gizli Müşteri");
  await s.close(true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("anahtar yoksa / yanlışsa / dosya kurcalanmışsa sunucu açılmaz ve hiçbir dosyaya dokunulmaz", async () => {
  const dir = tmpDir();
  let s = await start({ dataDir: dir, dataKey: KEY });
  await s.req("POST", "/api/orders", orderBody());
  await s.login();
  await s.close(true);
  const before = snapshot(dir);

  assert.throws(() => tryStart(dir, ""), /şifreli ama DATA_KEY verilmedi/);
  assert.throws(() => tryStart(dir, KEY2), /yanlış/i);
  assert.deepEqual(snapshot(dir), before, "yanlış/eksik anahtarda dosya değişti");

  // Şifreli metin kurcalanır (tek bayt) → doğrulama etiketi tutmaz
  const dbFile = path.join(dir, "db.json");
  const original = fs.readFileSync(dbFile, "utf8");
  const env = JSON.parse(original);
  const data = Buffer.from(env.data, "base64");
  data[10] ^= 1;
  fs.writeFileSync(dbFile, JSON.stringify({ ...env, data: data.toString("base64") }));
  let tampered = snapshot(dir);
  assert.throws(() => tryStart(dir, KEY), /bozulmuş ya da değiştirilmiş/);
  assert.deepEqual(snapshot(dir), tampered);
  // IV / etiket değiştirilir
  fs.writeFileSync(dbFile, JSON.stringify({ ...env, tag: Buffer.alloc(16).toString("base64") }));
  assert.throws(() => tryStart(dir, KEY), /bozulmuş ya da değiştirilmiş/);
  // Başlık (AAD) değiştirilir: anahtar denetim değeri → yanlış anahtar gibi reddedilir
  fs.writeFileSync(dbFile, JSON.stringify({ ...env, kcv: "0".repeat(16) }));
  assert.throws(() => tryStart(dir, KEY), /yanlış/i);
  // Türetme ayarı büyütülerek kaynak tüketme denemesi → biçim hatası
  fs.writeFileSync(dbFile, JSON.stringify({ ...env, kdf: { ...env.kdf, N: 2 ** 22 } }));
  assert.throws(() => tryStart(dir, KEY), /türetme ayarları geçersiz/);
  // Sürüm alanı
  fs.writeFileSync(dbFile, JSON.stringify({ ...env, v: 99 }));
  assert.throws(() => tryStart(dir, KEY), /sürümü desteklenmiyor/);
  tampered = snapshot(dir);
  assert.throws(() => tryStart(dir, KEY), /desteklenmiyor/);
  assert.deepEqual(snapshot(dir), tampered);

  // Asıl dosya geri konunca açılır
  fs.writeFileSync(dbFile, original);
  s = await start({ dataDir: dir, dataKey: KEY });
  assert.equal(s.app.db.orders.length, 1);
  await s.close(true);

  // Oturum dosyası başka anahtarla şifrelenmişse de açılmaz
  fs.writeFileSync(path.join(dir, "sessions.json"), new Cipher(KEY2).encrypt("{}"));
  const b2 = snapshot(dir);
  assert.throws(() => tryStart(dir, KEY), /sessions\.json/);
  assert.deepEqual(snapshot(dir), b2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("DATA_KEY çok kısaysa sunucu açılmaz", () => {
  const dir = tmpDir();
  assert.throws(() => tryStart(dir, "kisa"), /en az 16 karakter/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("anahtar döndürme betiği: tüm dosyalar yeni anahtarla; yanlış eski anahtarda hiçbir dosya değişmez", async () => {
  const dir = tmpDir();
  let s = await start({ dataDir: dir, dataKey: KEY });
  await s.req("POST", "/api/orders", orderBody());
  await s.login();
  s.app.store.backupNow("elle");
  await s.close(true);
  const script = path.join(__dirname, "..", "scripts", "anahtar-degistir.js");
  const run = (env) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [script], { env: { ...process.env, DATA_DIR: dir, DATA_KEY: "", NEW_DATA_KEY: "", ...env }, encoding: "utf8", stdio: "pipe" }) };
    } catch (e) {
      return { code: e.status, out: String(e.stderr) + String(e.stdout) };
    }
  };
  const before = snapshot(dir);
  let r = run({ DATA_KEY: KEY2, NEW_DATA_KEY: "ucuncu-anahtar-0000000000" });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /hiçbir dosya değiştirilmedi/);
  assert.deepEqual(snapshot(dir), before);
  // Sunucu çalışıyorsa (canlı kilit) betik durur
  fs.writeFileSync(path.join(dir, "sunucu.kilit"), String(process.pid));
  r = run({ DATA_KEY: KEY, NEW_DATA_KEY: KEY2 });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /Sunucu çalışıyor/);
  fs.rmSync(path.join(dir, "sunucu.kilit"));
  // Doğru eski anahtarla
  r = run({ DATA_KEY: KEY, NEW_DATA_KEY: KEY2 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /yeni anahtarla şifrelendi/);
  assert.throws(() => tryStart(dir, KEY), /yanlış/i);
  s = await start({ dataDir: dir, dataKey: KEY2 });
  assert.equal(s.app.db.orders.length, 1);
  const list = s.app.store.probeBackups();
  assert.ok(list.length >= 2 && list.every((b) => b.encrypted && b.ok), "yedekler yeni anahtarla açılmalı");
  await s.close(true);
  // Şifrelemeyi kaldırma
  r = execFileSync(process.execPath, [script, "--sifresiz"], { env: { ...process.env, DATA_DIR: dir, DATA_KEY: KEY2 }, encoding: "utf8" });
  assert.match(r, /şifresiz yazıldı/);
  assert.ok(!isEncrypted(fs.readFileSync(path.join(dir, "db.json"))));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("parolalı yedek: indir, yanlış parola / parolasız / kurcalanmış dosya reddedilir, doğru parolayla geri yüklenir", async () => {
  const s = await start({ dataKey: KEY });
  try {
    const tok = await s.login();
    await s.req("POST", "/api/orders", orderBody({ name: "Yedek Müşteri" }));
    assert.equal((await s.req("POST", "/api/admin/backup", { password: "kisa" }, tok)).status, 400);
    const dl = await s.req("POST", "/api/admin/backup", { password: "yedek-parolasi-123" }, tok);
    assert.equal(dl.status, 200);
    assert.match(dl.headers.get("content-disposition"), /\.sifreli\.json"/);
    assert.ok(isEncrypted(dl.text));
    assert.doesNotMatch(dl.text, /Yedek Müşteri/);
    const env = JSON.parse(dl.text);

    // Veri değişsin, sonra yedekten dönülsün
    await s.req("POST", "/api/orders", orderBody({ phone: "05329998877" }));
    assert.equal(s.app.db.orders.length, 2);
    let r = await s.req("POST", "/api/admin/restore", env, tok);
    assert.equal(r.status, 400);
    assert.equal(r.json.code, "YEDEK_PAROLA");
    r = await s.req("POST", "/api/admin/restore", { file: env, password: "yanlis-parola-000" }, tok);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /parolası yanlış/);
    const bad = JSON.parse(dl.text);
    const d = Buffer.from(bad.data, "base64");
    d[5] ^= 0xff;
    bad.data = d.toString("base64");
    r = await s.req("POST", "/api/admin/restore", { file: bad, password: "yedek-parolasi-123" }, tok);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /bozulmuş/);
    assert.equal(s.app.db.orders.length, 2, "başarısız geri yüklemede veri değişti");
    r = await s.req("POST", "/api/admin/restore", { ...env, password: "yedek-parolasi-123" }, tok);
    assert.equal(r.status, 200, r.text);
    assert.equal(s.app.db.orders.length, 1);
    assert.equal(s.app.db.orders[0].customer.name, "Yedek Müşteri");
    // Sunucudaki otomatik yedek de parolayla indirilebilir
    const tok2 = await s.login();
    const name = (await s.req("GET", "/api/admin/backups", undefined, tok2)).json[0].name;
    const enc = await s.req("POST", `/api/admin/backups/${name}`, { password: "yedek-parolasi-123" }, tok2);
    assert.equal(enc.status, 200);
    assert.equal(new Cipher("yedek-parolasi-123").decrypt(enc.text).startsWith("{"), true);
  } finally {
    await s.close();
  }
});

test("eski biçimli düz veri DATA_KEY ile yükseltilirken yükseltme öncesi kopya da şifreli yazılır", async () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ categories: [], products: [], orders: [{ id: 1, token: "a".repeat(24), createdAt: "2026-11-01T10:00:00.000Z", customer: { name: "Eski Kayıt", phone: "05551112233", address: "Meydan Mah. No:1 Edirne" }, items: [], total: 0, status: "Yeni" }] }));
  const s = await start({ dataDir: dir, dataKey: KEY });
  try {
    const b = fs.readdirSync(path.join(dir, "backups")).find((f) => f.startsWith("yukseltme-oncesi-"));
    assert.ok(b);
    const buf = fs.readFileSync(path.join(dir, "backups", b));
    assert.ok(isEncrypted(buf));
    assert.match(new Cipher(KEY).decrypt(buf), /Eski Kayıt/);
  } finally {
    await s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
