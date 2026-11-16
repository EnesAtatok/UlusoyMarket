// Ulusoy Market — bağımlılıksız Node.js sunucusu (Node 18+)
// Çalıştırma: node server.js  →  http://localhost:3000  (yönetim paneli: /panel)
// Ortam değişkenleri: PORT, ADMIN_PASSWORD, DATA_DIR, PUBLIC_URL, TRUST_PROXY (ayrıntı: docs/DEPLOY.md)

"use strict";

const { createApp } = require("./lib/app");

const PORT = Number(process.env.PORT) || 3000;

let instance;
try {
  instance = createApp();
} catch (e) {
  console.error(`Sunucu başlatılamadı: ${e.message}`);
  process.exit(1);
}

instance.server.listen(PORT, () => {
  console.log(`Market çalışıyor:  http://localhost:${PORT}`);
  console.log(`Yönetim paneli:    http://localhost:${PORT}/panel  (ilk giriş: kullanıcı "admin", şifre ${process.env.ADMIN_PASSWORD ? "ADMIN_PASSWORD" : "admin123"})`);
  if (instance.app.defaultPasswordUsers.length) {
    console.log("");
    console.log("  !!! GÜVENLİK UYARISI: varsayılan şifre (admin123) hâlâ kullanımda: " + instance.app.defaultPasswordUsers.join(", "));
    console.log("  !!! Bu hâliyle internete açmayın. Panelde Hesabım → Şifre değiştir ile hemen değiştirin.");
    console.log("");
  }
});

// Docker / systemd durdurduğunda açık istekler bitirilip düzgün kapanır
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    instance.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
