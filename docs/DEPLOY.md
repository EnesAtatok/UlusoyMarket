# Ulusoy Market — Kurulum ve Yayına Alma

Uygulama yalnızca Node.js (18 veya üzeri) ister; `npm install` gerekmez, harici paket yoktur.

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `3000` | Dinlenen port |
| `ADMIN_PASSWORD` | `admin123` | **Yalnızca ilk kurulumda** (kullanıcı listesi boşken) oluşturulan `admin` kullanıcısının şifresi. Sonra şifre panelden değiştirilir; bu değişkeni değiştirmek mevcut şifreyi değiştirmez. Herhangi bir aktif hesabın şifresi `admin123` olduğu sürece sunucu her açılışta günlüğe **GÜVENLİK UYARISI** yazar ve panel her ekranda kırmızı uyarı gösterir; bu hâlde yayına almayın |
| `DATA_DIR` | `./data` | Canlı veri klasörü: `db.json`, `sessions.json`, `backups/`, `uploads/` |
| `PUBLIC_URL` | (boş) | Sitenin dış adresi, ör. `https://ulusoymarket.com`. Sitemap, canonical ve Open Graph adresleri ile Telegram mesajındaki panel bağlantısı bundan üretilir. **Yayında mutlaka verin**; boşsa sayfalardaki adresler isteğin `Host` başlığından üretilir (taklit edilebilir; Telegram mesajına panel bağlantısı eklenmez) |
| `TRUST_PROXY` | (boş) | `1` ise ters vekilin (Caddy/nginx) eklediği `X-Forwarded-For` (en sağdaki adres) ve `X-Forwarded-Proto` kullanılır. Hız sınırı gerçek müşteri IP'siyle çalışır, HTTPS'te HSTS başlığı eklenir. Vekil yoksa **açmayın** (IP taklit edilebilir) |
| `STORE_TZ` | `Europe/Istanbul` | Açık/kapalı hesabı ve raporlar için saat dilimi (değiştirmeye gerek yok) |

Veri klasörü:

```
DATA_DIR/
  db.json            tüm veri (ürünler, siparişler, ayarlar, kullanıcılar)
  sessions.json      panel oturumları (belirteçlerin SHA-256 özeti)
  uploads/           panelden yüklenen görseller (/uploads/... adresinden sunulur)
  backups/           otomatik yedekler
    db-YYYY-AA-GG.json               her günün ilk kaydında, son 14 gün
    yukseltme-oncesi-*.json          eski biçimli veri yükseltilmeden önce
    geri-yukleme-oncesi-*.json       panelden yedek yüklenmeden önce (son 20)
    siparis-silme-oncesi-*.json      toplu sipariş silmeden önce (son 20)
```

Eski kurulumdaki `public/uploads/` görselleri de sunulmaya devam eder; yeni yüklemeler `DATA_DIR/uploads/`'a gider.

## Yerelde çalıştırma (Windows)

`Marketi Baslat.bat` dosyasına çift tıklayın (3000 portunda başlatır, mağaza ve paneli açar) ya da:

```powershell
$env:ADMIN_PASSWORD="guclu-bir-sifre"; node server.js
```

Panel: `http://localhost:3000/panel` — kullanıcı `admin`, şifre `ADMIN_PASSWORD` (verilmediyse `admin123`; ilk girişte değiştirin).

Testler: `node --test` (geçici klasör ve boş port kullanır; gerçek veriye dokunmaz).

## Seçenek A — Docker

Depoda `Dockerfile`, `docker-compose.yml` ve `.dockerignore` hazır. İmaja canlı veri girmez; veri `market-data` adlı Docker biriminde (`/data`) kalır.

```bash
# Sunucuda, depo klasöründe
cat > .env <<'EOF'
ADMIN_PASSWORD=guclu-bir-sifre
PUBLIC_URL=https://ulusoymarket.com
TRUST_PROXY=1
EOF
docker compose up -d --build
docker compose logs -f market     # "Market çalışıyor" satırını görün
curl -s http://127.0.0.1:3000/healthz
```

`docker-compose.yml` portu yalnızca `127.0.0.1:3000`'e açar; dış dünyaya HTTPS ile Caddy açar (aşağıda). Kapsayıcı `node` kullanıcısıyla çalışır, kök dosya sistemi salt okunurdur (`read_only`; uygulama yalnızca `/data` birimine yazar), tüm Linux yetenekleri kaldırılmıştır (`cap_drop: ALL`, `no-new-privileges`), `/healthz` ile sağlık denetimi yapar.

`.env` dosyası şifre içerir: depoya girmez (`.gitignore`), imaja kopyalanmaz (`.dockerignore`). Sunucuda yalnızca sahibinin okuyabileceği hâle getirin: `chmod 600 .env`.

Mevcut bir `db.json`'ı Docker birimine aktarmak için:

```bash
docker compose up -d                       # birim oluşsun
docker compose stop market
docker run --rm -v ulusoymarket_market-data:/data -v "$PWD":/src alpine \
  sh -c "cp /src/data/db.json /data/db.json && chown 1000:1000 /data/db.json"
docker compose start market                # açılışta eski biçim otomatik yükseltilir
```

(Birim adı `docker volume ls` ile görülür; klasör adına göre `<klasör>_market-data` olur.)

## Seçenek B — VPS'te systemd + Caddy (HTTPS)

Ubuntu/Debian için örnek. Node.js 18+ kurulu olmalı (`node -v`).

1. Kullanıcı ve klasörler:

   ```bash
   sudo useradd --system --create-home --home-dir /opt/ulusoy-market --shell /usr/sbin/nologin market
   sudo -u market git clone <depo-adresi> /opt/ulusoy-market/app      # ya da dosyaları kopyalayın
   sudo mkdir -p /var/lib/ulusoy-market && sudo chown market:market /var/lib/ulusoy-market
   ```

2. `/etc/systemd/system/ulusoy-market.service`:

   ```ini
   [Unit]
   Description=Ulusoy Market
   After=network.target

   [Service]
   User=market
   WorkingDirectory=/opt/ulusoy-market/app
   Environment=PORT=3000
   Environment=DATA_DIR=/var/lib/ulusoy-market
   Environment=PUBLIC_URL=https://ulusoymarket.com
   Environment=TRUST_PROXY=1
   Environment=ADMIN_PASSWORD=guclu-bir-sifre
   ExecStart=/usr/bin/node server.js
   Restart=always
   RestartSec=3
   NoNewPrivileges=true
   ProtectSystem=strict
   ProtectHome=true
   ReadWritePaths=/var/lib/ulusoy-market
   PrivateTmp=true

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now ulusoy-market
   journalctl -u ulusoy-market -f
   ```

   Eski `data/db.json` varsa ilk başlatmadan önce `/var/lib/ulusoy-market/db.json` olarak kopyalayın (sahibi `market` olsun). Eski `public/uploads/` klasörü uygulama klasöründe kaldıkça görseller sunulur.

3. Caddy (otomatik Let's Encrypt sertifikası). `/etc/caddy/Caddyfile`:

   ```
   ulusoymarket.com, www.ulusoymarket.com {
       encode gzip
       reverse_proxy 127.0.0.1:3000
   }
   ```

   ```bash
   sudo systemctl reload caddy
   ```

   Alan adının A/AAAA kaydı sunucuyu göstermeli, 80 ve 443 portları açık olmalı. Caddy `X-Forwarded-For` ve `X-Forwarded-Proto` başlıklarını kendisi ekler; bu yüzden `TRUST_PROXY=1`. Uygulamanın 3000 portunu güvenlik duvarında dışarıya **açmayın** (`sudo ufw allow 80,443/tcp`, 3000 kapalı).

## Yedekler

- Otomatik: günde bir `backups/db-YYYY-AA-GG.json` (son 14 gün), yükseltme / geri yükleme / toplu silme öncesi ayrıca.
- Panelden: **Ayarlar → Yedek al** tüm veriyi `.json` olarak indirir. Haftada bir indirip sunucu dışında saklayın.
- Sunucu dışı kopya (öneri): `DATA_DIR` klasörünü (özellikle `db.json`, `uploads/`, `backups/`) günlük olarak başka bir yere eşitleyin, ör. cron ile `rsync -a /var/lib/ulusoy-market/ yedek-sunucu:/yedek/ulusoy/`.

### Yedekten dönme

**Panelden (önerilen):** Ayarlar → Yedekleme → yedek dosyasını seçip **Geri yükle**. Mevcut veri önce `backups/geri-yukleme-oncesi-*.json` olarak saklanır; yüklemeden sonra herkes yeniden giriş yapar. Dosya yüklenmeden önce denetlenir: bozuk ya da elle bozulmuş bir yedek (aynı kimlik iki kez, geçersiz fiyat/saat/rol vb.) reddedilir ve mevcut veriye dokunulmaz. Sipariş numaraları geri gitmez: eski bir yedek yüklense bile, yedekten sonra verilmiş numaralar yeni siparişlere tekrar verilmez.

**Elle (panel açılmıyorsa):**

```bash
sudo systemctl stop ulusoy-market                      # Docker: docker compose stop market
cd /var/lib/ulusoy-market
cp db.json db.json.bozuk-$(date +%F)                   # mevcut hâli sakla
cp backups/db-2026-11-15.json db.json                  # istenen yedeği koy
chown market:market db.json
sudo systemctl start ulusoy-market
```

`db.json` bozulursa sunucu **açılmaz** ve dosyanın üzerine yazmaz ("db.json okunamadı … backups/ klasöründen geri yükleyin" hatası); yukarıdaki adımlarla son yedeğe dönün.

### Yönetici şifresi unutulursa

Başka bir yönetici panelden şifreyi sıfırlayabilir (Kullanıcılar → şifre). Hiç yönetici giremiyorsa: sunucuyu durdurun, `db.json` içindeki `users` dizisinden `admin` kaydını silin (ya da `"users": []` yapın), `ADMIN_PASSWORD` ile yeniden başlatın — aktif yönetici kalmadığında `admin` kullanıcısı yeniden oluşturulur. Ardından eski kullanıcıları panelden yeniden ekleyin.

## Güncelleme

```bash
# systemd
cd /opt/ulusoy-market/app
sudo -u market git pull
sudo systemctl restart ulusoy-market
curl -s http://127.0.0.1:3000/healthz

# Docker
git pull
docker compose up -d --build
```

Veri biçimi değiştiyse açılışta otomatik yükseltilir (öncesinde `backups/yukseltme-oncesi-*.json` alınır). Güncellemeden önce panelden bir yedek indirmeniz önerilir. Sorun çıkarsa önceki sürüme dönün (`git checkout <önceki-etiket>`) ve gerekirse yükseltme öncesi yedeği geri yükleyin.

## Yayın öncesi kontrol listesi

- [ ] `PUBLIC_URL` doğru (sitemap/OG adresleri), `TRUST_PROXY=1` yalnızca vekil arkasında.
- [ ] `admin` şifresi değiştirildi (sunucu günlüğünde "GÜVENLİK UYARISI" ve panelde kırmızı şifre uyarısı yok); personel için ayrı `personel` hesapları açıldı.
- [ ] Ayarlar → Yasal bilgiler: şirket unvanı, vergi dairesi/no, MERSİS, KEP, e-posta dolduruldu (yasal sayfalarda `[…]` kalmamalı).
- [ ] Çalışma saatleri, bölgeler, minimum tutar ve teslimat ücretleri kontrol edildi.
- [ ] Telegram bildirimi kuruldu ve "deneme mesajı" geldi.
- [ ] `https://<alan-adı>/robots.txt` ve `/sitemap.xml` açılıyor; Google Search Console'a sitemap eklendi.
- [ ] Alkol ve tütün ürünü online katalogda yok.
