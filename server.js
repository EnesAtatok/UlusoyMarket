// Ulusoy Market — bağımlılıksız Node.js sunucusu (Node 18+)
// Çalıştırma: node server.js  →  http://localhost:3000  (yönetim paneli: /panel)
// Ortam değişkenleri: PORT, HOST, ADMIN_PASSWORD, DATA_DIR, PUBLIC_URL, TRUST_PROXY, TRUSTED_PROXIES, DATA_KEY, FORCE_HTTPS (ayrıntı: docs/DEPLOY.md)

"use strict";

const fs = require("fs");
const path = require("path");
const { createApp, resolveListenHost } = require("./lib/app");

const PORT = Number(process.env.PORT) || 3000;

let instance;
try {
  instance = createApp();
} catch (e) {
  console.error(`Sunucu başlatılamadı: ${e.message}`);
  process.exit(1);
}

// Kilit dosyası: anahtar döndürme betiği (npm run anahtar-degistir) sunucu çalışırken dosyalara dokunmasın
const lockFile = path.join(instance.app.opts.dataDir, "sunucu.kilit");
try { fs.writeFileSync(lockFile, String(process.pid)); } catch {}
const removeLock = () => {
  try {
    if (fs.readFileSync(lockFile, "utf8").trim() === String(process.pid)) fs.rmSync(lockFile, { force: true });
  } catch {}
};
process.on("exit", removeLock);

// Varsayılan şifre (admin123) kullanımdayken yalnızca bu bilgisayardan erişilir (HOST ne olursa olsun)
const listen = resolveListenHost({ host: process.env.HOST, defaultPasswordInUse: instance.app.defaultPasswordUsers.length > 0 });
instance.app.listenInfo = listen;

instance.server.listen(PORT, listen.host, () => {
  console.log(`Market çalışıyor:  http://localhost:${PORT}`);
  if (listen.forced) {
    console.log("");
    console.log("  !!! Varsayılan şifre kullanımda: sunucu YALNIZCA BU BİLGİSAYARDAN açılıyor (127.0.0.1).");
    console.log("  !!! Ağdaki diğer cihazlar ve internet erişemez. Panelde Hesabım → Şifre değiştir ile şifreyi");
    console.log("  !!! değiştirip sunucuyu yeniden başlatın; o zaman ağa açılır.");
    console.log("");
  } else console.log(`Dinlenen adres:    ${listen.host || "tüm ağ arayüzleri"}`);
  console.log(`Yönetim paneli:    http://localhost:${PORT}/panel  (ilk kurulumda kullanıcı "admin", şifre ${process.env.ADMIN_PASSWORD ? "ADMIN_PASSWORD" : "admin123"}; sonra panelde belirlediğiniz şifre)`);
  console.log(`Veri:              ${instance.app.opts.dataDir} (${instance.app.cipher ? "DATA_KEY ile şifreli" : "ŞİFRESİZ"})`);
  if (instance.app.defaultPasswordUsers.length) {
    console.log("");
    console.log("  !!! GÜVENLİK UYARISI: varsayılan şifre (admin123) hâlâ kullanımda: " + instance.app.defaultPasswordUsers.join(", "));
    console.log("  !!! Bu hâliyle internete açmayın. Panelde Hesabım → Şifre değiştir ile hemen değiştirin.");
    console.log("");
  }
});

// Docker / systemd durdurduğunda açık istekler bitirilip düzgün kapanır (canlı akışlar "kapanis" olayıyla kapanır)
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    instance.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
