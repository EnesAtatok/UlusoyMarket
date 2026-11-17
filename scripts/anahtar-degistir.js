#!/usr/bin/env node
"use strict";
// DATA_KEY döndürme / şifreleme açma-kapama. Sunucu KAPALIYKEN çalıştırın.
//
//   DATA_KEY=<eski> NEW_DATA_KEY=<yeni> npm run anahtar-degistir          anahtarı değiştirir
//   NEW_DATA_KEY=<yeni> npm run anahtar-degistir                          şifresiz veriyi şifreler
//   DATA_KEY=<eski> npm run anahtar-degistir -- --sifresiz                şifrelemeyi kaldırır (önerilmez)
//
// DATA_DIR (varsayılan ./data) içindeki db.json, sessions.json, audit.json ve backups/*.json işlenir.
// Önce TÜM dosyalar eski anahtarla açılır; biri bile açılamazsa hiçbir dosyaya dokunulmaz.
// Yazma: her dosya önce geçici dosyaya yazılır, hepsi hazır olunca yeniden adlandırılır.
// Not: backups/ içindeki "*.tmp" dosyaları listelenmez (yalnızca .json).
// Yeniden adlandırma aşamasında kesilirse (elektrik vb.) aynı komut aynı anahtarlarla tekrar çalıştırılır: yeni anahtarla
// açılan dosyalar olduğu gibi kalır, kalanlar çevrilir.

const fs = require("fs");
const path = require("path");
const { createCipher, isEncrypted, CryptoError, dataKeyProblem } = require("../lib/secure-file");
const { writeFileAtomic } = require("../lib/util");

const args = process.argv.slice(2);
const decryptOnly = args.includes("--sifresiz");
const force = args.includes("--zorla");
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const oldKey = process.env.DATA_KEY || "";
const newKey = decryptOnly ? "" : process.env.NEW_DATA_KEY || "";

function die(msg) {
  console.error(`HATA: ${msg}`);
  process.exit(1);
}

if (!decryptOnly && !newKey) die("NEW_DATA_KEY verilmedi. Şifrelemeyi kaldırmak için --sifresiz kullanın.");
// Eski anahtar denetlenmez (zayıf bir eski anahtardan güçlü yenisine geçilebilsin); yeni anahtar zayıfsa durulur
if (newKey && dataKeyProblem(newKey, "NEW_DATA_KEY")) die(dataKeyProblem(newKey, "NEW_DATA_KEY"));
if (newKey && newKey === oldKey) die("Yeni anahtar eskisiyle aynı.");
if (!fs.existsSync(path.join(dataDir, "db.json"))) die(`${dataDir} içinde db.json yok.`);

// Sunucu çalışıyorsa (server.js kilit dosyası ve süreç canlı) dur: çalışan sunucu dosyaları eski anahtarla yeniden yazar
const lock = path.join(dataDir, "sunucu.kilit");
if (fs.existsSync(lock) && !force) {
  const pid = Number(fs.readFileSync(lock, "utf8").trim());
  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch (e) { alive = e.code === "EPERM"; }
  if (alive) die(`Sunucu çalışıyor görünüyor (pid ${pid}). Önce durdurun (ya da emin değilseniz --zorla).`);
}

const oldCipher = createCipher(oldKey);
const newCipher = createCipher(newKey);

const files = ["db.json", "sessions.json", "audit.json"].map((f) => path.join(dataDir, f)).filter((f) => fs.existsSync(f));
const bdir = path.join(dataDir, "backups");
if (fs.existsSync(bdir)) for (const f of fs.readdirSync(bdir)) if (/^[A-Za-z0-9._-]+\.json$/.test(f)) files.push(path.join(bdir, f));

// 1) Hepsini oku ve çöz (hiçbir şey yazılmaz)
const plain = new Map();
const problems = [];
for (const f of files) {
  const buf = fs.readFileSync(f);
  const rel = path.relative(dataDir, f);
  try {
    if (isEncrypted(buf)) {
      // Önceki çalıştırma yeniden adlandırma sırasında yarıda kaldıysa bazı dosyalar zaten yeni anahtarla şifrelidir:
      // aynı komutu tekrar çalıştırmak kaldığı yerden tamamlar (dosya yeni anahtarla açılıyorsa olduğu gibi yazılır)
      if (newCipher && newCipher.matches(buf)) plain.set(f, newCipher.decrypt(buf));
      else if (!oldCipher) throw new CryptoError("ANAHTAR_YOK", "şifreli ama DATA_KEY (eski anahtar) verilmedi");
      else plain.set(f, oldCipher.decrypt(buf));
    } else {
      const text = buf.toString("utf8").replace(/^﻿/, "");
      JSON.parse(text); // bozuk dosya şifrelenip saklanmasın
      plain.set(f, text);
    }
  } catch (e) {
    problems.push(`${rel}: ${e.message}`);
  }
}
if (problems.length) die(`Şu dosyalar açılamadı; hiçbir dosya değiştirilmedi:\n  ${problems.join("\n  ")}`);

// 2) Önce hepsi geçici dosyalara yazılır (yarıda kalırsa asıl dosyalar eski anahtarla durur), sonra yerlerine taşınır
const staged = [];
try {
  for (const [f, text] of plain) {
    const tmp = `${f}.yeni-anahtar.tmp`;
    writeFileAtomic(tmp, newCipher ? newCipher.encrypt(text) : text);
    staged.push([tmp, f]);
  }
} catch (e) {
  for (const [tmp] of staged) try { fs.rmSync(tmp, { force: true }); } catch {}
  die(`Yazılamadı (${e.message}); hiçbir dosya değiştirilmedi.`);
}
let n = 0;
for (const [tmp, f] of staged) {
  fs.renameSync(tmp, f);
  n++;
}
console.log(`${n} dosya ${newCipher ? "yeni anahtarla şifrelendi" : "şifresiz yazıldı"} (${dataDir}).`);
if (newCipher) console.log("Sunucuyu yeni DATA_KEY ile başlatın. Yeni anahtarı güvenli bir yerde (sunucu dışında) saklayın; kaybolursa veri kurtarılamaz.");
