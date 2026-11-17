# Ulusoy Market — Kurulum ve Yayına Alma

Uygulama yalnızca Node.js (18 veya üzeri) ister; `npm install` gerekmez, harici paket yoktur.

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `3000` | Dinlenen port |
| `HOST` | (boş = tüm ağ arayüzleri) | Dinlenen adres (ör. `127.0.0.1` yalnızca bu makine). **Herhangi bir aktif hesabın şifresi hâlâ `admin123` ise sunucu `HOST` ne olursa olsun yalnızca `127.0.0.1`'de dinler** (ağdaki diğer cihazlar ve internet erişemez); açılış mesajı ve panel bunu yazar. Şifreyi panelden değiştirip sunucuyu yeniden başlatınca (ya da ilk kurulumda `ADMIN_PASSWORD` verilince) `HOST`'a / tüm arayüzlere açılır |
| `ADMIN_PASSWORD` | `admin123` | **Yalnızca ilk kurulumda** (kullanıcı listesi boşken) oluşturulan `admin` kullanıcısının şifresi (en az 8 karakter). Sonra şifre panelden değiştirilir; bu değişkeni değiştirmek mevcut şifreyi değiştirmez. Herhangi bir aktif hesabın şifresi `admin123` olduğu sürece sunucu her açılışta günlüğe **GÜVENLİK UYARISI** yazar, panel her ekranda kırmızı uyarı gösterir ve sunucu yalnızca `127.0.0.1`'de dinler (bkz. `HOST`) |
| `DATA_DIR` | `./data` | Canlı veri klasörü: `db.json`, `sessions.json`, `backups/`, `uploads/` |
| `PUBLIC_URL` | (boş) | Sitenin dış adresi, ör. `https://ulusoymarket.com`. Sitemap, canonical ve Open Graph adresleri ile Telegram mesajındaki panel bağlantısı bundan üretilir. **Yayında mutlaka verin**; boşsa sayfalardaki adresler isteğin `Host` başlığından üretilir (taklit edilebilir; Telegram mesajına panel bağlantısı eklenmez) |
| `TRUST_PROXY` | (boş) | `1` ise ters vekilin (Caddy/nginx) eklediği `X-Forwarded-For` ve `X-Forwarded-Proto` kullanılır — **yalnızca bağlantı `TRUSTED_PROXIES` listesindeki bir adresten geliyorsa**. `X-Forwarded-For` sağdan sola okunur, güvenilen vekiller atlanır. Hız sınırı gerçek müşteri IP'siyle çalışır (IPv6 adresler /64 ağ olarak sayılır), HTTPS'te HSTS başlığı eklenir. Vekil yoksa açmayın |
| `TRUSTED_PROXIES` | `127.0.0.0/8, ::1` | `TRUST_PROXY=1` iken başlıklarına güvenilen vekil adresleri (virgülle; tek adres ya da `10.0.0.0/8` gibi ağ). Vekil aynı makinedeyse (Caddy/nginx) varsayılan yeterli. Docker'da vekil köprü ağından bağlanır: `docker-compose.yml` bunu `172.16.0.0/12` ile ekler. Listede olmayan bir adresten doğrudan gelen istekte başlıklar yok sayılır (taklit edilemez) |
| `STORE_TZ` | `Europe/Istanbul` | Açık/kapalı hesabı ve raporlar için saat dilimi (değiştirmeye gerek yok) |
| `DATA_KEY` | (boş) | **Depoda şifreleme anahtarı** (en az 16 karakter; rastgele 32+ karakter önerilir; aşağıdaki komutla üretin). `$(…)` ya da ters tırnak içeren (komut çalışmamış, metni yazılmış), örnek/yer tutucu gibi görünen ya da çok tekdüze anahtarla sunucu açılmaz. Verilirse `db.json`, `sessions.json`, `audit.json` ve tüm yedekler AES-256-GCM ile şifreli yazılır. Boşsa veri şifresiz saklanır ve panel "müşteri verisi şifresiz saklanıyor" uyarısı gösterir. **Anahtar kaybolursa veri geri getirilemez** — aşağıdaki "Depoda şifreleme" bölümünü okuyun |
| `FORCE_HTTPS` | (açık) | `0` verilirse HTTP → HTTPS yönlendirmesi kapanır. Yönlendirme yalnızca `PUBLIC_URL` `https://` ve `TRUST_PROXY=1` iken yapılır |

Veri klasörü:

```
DATA_DIR/
  db.json            tüm veri (ürünler, siparişler, ayarlar, kullanıcılar)
  sessions.json      panel oturumları (belirteçlerin SHA-256 özeti)
  audit.json         denetim kaydı (kim, ne zaman, hangi işlem; kişisel veri ve IP içermez): genel bölme son 2000 kayıt,
                     güvenlik bölmesi (yedek, geri yükleme, kullanıcı/şifre, silme, ayar) ayrı, son 5000 kayıt
  sunucu.kilit       çalışan sunucunun süreç numarası (anahtar döndürme betiği sunucu açıkken çalışmasın diye)
  uploads/           panelden yüklenen görseller (/uploads/... adresinden sunulur)
  backups/           otomatik yedekler
    db-YYYY-AA-GG.json               her günün ilk kaydında, son 14 gün
    yukseltme-oncesi-*.json          eski biçimli veri yükseltilmeden önce (son 20)
    geri-yukleme-oncesi-*.json       panelden yedek yüklenmeden önce (son 20)
    siparis-silme-oncesi-*.json      toplu sipariş silmeden önce (son 20)
```

`DATA_KEY` verildiyse `db.json`, `sessions.json`, `audit.json` ve `backups/*.json` şifrelidir (içleri `{"format":"ulusoy-sifreli",…}` biçiminde tek satırdır). `uploads/` (ürün görselleri) şifrelenmez.

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
# Sunucuda, depo klasöründe. Anahtar önce üretilir, sonra dosyaya yazılır.
# (Tırnaklı heredoc — <<'EOF' — içinde $(...) ÇALIŞMAZ, komutun metni olduğu gibi yazılır; sunucu böyle bir anahtarla açılmaz.)
DATA_KEY="$(openssl rand -base64 32)"   # openssl yoksa: DATA_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
cat > .env <<EOF
ADMIN_PASSWORD=guclu-bir-sifre
PUBLIC_URL=https://ulusoymarket.com
TRUST_PROXY=1
DATA_KEY=$DATA_KEY
EOF
chmod 600 .env
grep DATA_KEY .env      # rastgele bir değer görmelisiniz; ŞİMDİ sunucu dışında güvenli bir yere (parola yöneticisi) kopyalayın
docker compose up -d --build
docker compose logs -f market     # "Market çalışıyor" satırını görün
curl -s http://127.0.0.1:3000/healthz
```

`docker-compose.yml` portu yalnızca `127.0.0.1:3000`'e açar; dış dünyaya HTTPS ile Caddy açar (aşağıda). Vekil kapsayıcıya Docker köprü ağından bağlandığı için compose `TRUSTED_PROXIES`'e `172.16.0.0/12` ekler. `ADMIN_PASSWORD` zorunludur. Birimdeki eski bir kurulumda bir hesabın şifresi hâlâ `admin123` ise uygulama kapsayıcı içinde yalnızca `127.0.0.1`'de dinler ve dışarıdan erişilemez (günlükte yazar); bu durumda aşağıdaki "Şifre unutulursa" adımıyla yöneticiyi `ADMIN_PASSWORD` ile yeniden oluşturun. Kapsayıcıya bellek ve süreç sınırı verilmiştir (`mem_limit`, `pids_limit`).

İmaj `node:22-alpine` etiketinden kurulur. Tekrarlanabilir kurulum için `Dockerfile`'daki `FROM` satırını özete sabitleyebilirsiniz: `docker pull node:22-alpine && docker inspect --format '{{index .RepoDigests 0}}' node:22-alpine` çıktısını `FROM node:22-alpine@sha256:…` olarak yazın (güvenlik güncellemeleri için ara ara yenileyin).

Kapsayıcı `node` kullanıcısıyla çalışır, kök dosya sistemi salt okunurdur (`read_only`; uygulama yalnızca `/data` birimine yazar), tüm Linux yetenekleri kaldırılmıştır (`cap_drop: ALL`, `no-new-privileges`), `/healthz` ile sağlık denetimi yapar.

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
   # Gizli değerler birim dosyasına değil (herkes okuyabilir, systemctl show gösterir) ortam dosyasına:
   EnvironmentFile=/etc/ulusoy-market.env        # içinde: ADMIN_PASSWORD=…  DATA_KEY=…  (chmod 600, sahibi root)
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
       # Canlı akışlar (SSE) sıkıştırılmaz ve tamponlanmaz
       @diger not path /api/orders/stream /api/admin/stream /api/store/stream
       encode @diger gzip
       reverse_proxy 127.0.0.1:3000 {
           flush_interval -1
       }
   }
   ```

   `flush_interval -1`: Caddy yanıtı tamponlamadan iletir (canlı sipariş takibi, paneldeki anlık yeni sipariş bildirimi ve açık mağaza sayfasının saat/sipariş alımı değişikliğini yenilemeden görmesi için gerekli). Üç akış yolu: `/api/orders/stream` (müşteri, biletli), `/api/admin/stream` (panel, biletli), `/api/store/stream` (kimliksiz, yalnızca herkese açık mağaza durumu). Uygulama akışlarda ayrıca `Cache-Control: no-transform` ve `X-Accel-Buffering: no` gönderir; Caddy HTTP'den HTTPS'e kendisi yönlendirir, uygulama da `PUBLIC_URL` https iken vekilden gelen HTTP isteklerini 301/308 ile `PUBLIC_URL`'ye yönlendirir ve HTTPS yanıtlarına HSTS (`max-age=31536000`) ekler.

   **nginx kullanılırsa** (her `location` bloğu başlıkları kendisi vermeli: bir blokta `proxy_set_header` yazılınca üst düzeydekiler o bloğa geçmez; `Host` verilmezse uygulama her isteği `127.0.0.1` sanar ve HTTPS yönlendirmesi/uyarısı çalışmaz):

   ```nginx
   server {
       listen 443 ssl;
       server_name ulusoymarket.com;
       # ssl_certificate ... ;

       # Canlı akışlar (SSE): tamponlama ve sıkıştırma kapalı
       location ~ ^/api/(orders|admin|store)/stream {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Connection "";
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_buffering off;
           proxy_read_timeout 1h;
           gzip off;
       }
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   ```bash
   sudo systemctl reload caddy
   ```

   Alan adının A/AAAA kaydı sunucuyu göstermeli, 80 ve 443 portları açık olmalı. Caddy `X-Forwarded-For` ve `X-Forwarded-Proto` başlıklarını kendisi ekler; bu yüzden `TRUST_PROXY=1`. Uygulamanın 3000 portunu güvenlik duvarında dışarıya **açmayın** (`sudo ufw allow 80,443/tcp`, 3000 kapalı).

## Depoda şifreleme (DATA_KEY)

Müşteri adı, telefonu ve adresi diskte okunamasın diye `DATA_KEY` verin. "Uçtan uca şifreleme" bu tür bir sistemde mümkün değildir (sunucu siparişi işlemek zorunda); doğru hedef: **yolda HTTPS + depoda şifreleme + en az veri**.

- **Anahtar üretme:** `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. En az 16 karakter (kısa anahtarla sunucu açılmaz).
- **İlk açılış:** mevcut şifresiz `db.json`, `sessions.json`, `audit.json` ve `backups/` içindeki yedekler otomatik olarak şifreliye çevrilir (günlükte "… DATA_KEY ile şifrelenerek yeniden yazılıyor").
- **Yanlış ya da eksik anahtar:** sunucu **açılmaz ve hiçbir dosyaya dokunmaz**; hata iletisi nedeni söyler ("db.json şifreli ama DATA_KEY verilmedi", "Anahtar (ya da parola) yanlış", "Şifreli dosya bozulmuş ya da değiştirilmiş"). Doğru anahtarla yeniden başlatın.
- **⚠ ANAHTAR KAYBI = VERİ KAYBI.** Anahtar kaybolursa `db.json` ve **tüm otomatik yedekler** kalıcı olarak açılamaz; kurtarmanın yolu yoktur. Anahtarı sunucu dışında en az iki yerde saklayın (parola yöneticisi + kâğıt/kasa). Sunucu dışı yedekleri (rsync vb.) anahtarla birlikte saklamayın.
- **Panelden yedek:** "Yedek al" düz JSON indirir (bilgisayarınıza şifresiz iner). **Parolalı yedek** seçeneği (`POST /api/admin/backup`) aynı AES-256-GCM biçiminde, sizin belirlediğiniz parolayla şifreli dosya verir (`…sifreli.json`); geri yüklerken parola sorulur. Parola sunucuda tutulmaz; unutulursa o yedek açılamaz. Sunucudaki şifreli otomatik yedekler panelden indirilirken sunucu çözüp düz JSON verir (ya da parolayla yeniden şifreler).
- **Elle geri yükleme:** şifreli yedek dosyası aynı `DATA_KEY` ile şifreli olduğundan yukarıdaki "Elle" adımları aynen geçerlidir (`cp backups/db-….json db.json`).
- **Anahtar döndürme / şifrelemeyi açıp kapama** — sunucu **durmuşken**:

  ```bash
  sudo systemctl stop ulusoy-market                 # Docker: docker compose stop market
  cd /opt/ulusoy-market/app
  sudo -u market env DATA_DIR=/var/lib/ulusoy-market DATA_KEY='eski-anahtar' NEW_DATA_KEY='yeni-anahtar' npm run anahtar-degistir
  # şifresiz kurulumu şifrelemek:   … NEW_DATA_KEY='yeni-anahtar' npm run anahtar-degistir
  # şifrelemeyi kaldırmak (önerilmez): … DATA_KEY='eski' npm run anahtar-degistir -- --sifresiz
  # yeni anahtarı ortam dosyasına yazın, sonra:
  sudo systemctl start ulusoy-market
  ```

  Docker'da: `docker compose stop market && docker compose run --rm -e DATA_KEY='eski' -e NEW_DATA_KEY='yeni' market node scripts/anahtar-degistir.js`, sonra `.env`'de `DATA_KEY`'i güncelleyip `docker compose up -d`.

  Betik önce **tüm** dosyaları eski anahtarla açar; biri bile açılamazsa hiçbir dosyayı değiştirmez. Sonra hepsini geçici dosyalara yazıp yerlerine taşır. Sunucu çalışıyorsa (`sunucu.kilit` içindeki süreç canlıysa) durur (`--zorla` ile geçilebilir; Windows'ta süreç zorla sonlandırılırsa kilit dosyası kalabilir, süreç ölü olduğu için betik yine çalışır). Yeni anahtarla başarıyla açıldığını görmeden eski anahtarı silmeyin. Betik taşıma sırasında kesilirse (elektrik, `Ctrl+C`) bazı dosyalar yeni, bazıları eski anahtarla kalabilir: **aynı komutu aynı iki anahtarla tekrar çalıştırın**; yeni anahtarla açılan dosyalar olduğu gibi bırakılır, kalanlar çevrilir. Kesintiden kalan `*.yeni-anahtar.tmp` dosyaları zaten şifrelidir, silinebilir.

## HTTPS

`PUBLIC_URL=https://…` ve `TRUST_PROXY=1` iken uygulama, vekilden `X-Forwarded-Proto: http` ile gelen istekleri `PUBLIC_URL`'ye yönlendirir (GET/HEAD 301, diğerleri 308) ve HTTPS yanıtlarına HSTS ekler. `localhost` ve `/healthz` hariçtir (sağlık denetimleri çalışsın). `TRUST_PROXY` kapalıyken yönlendirme yapılmaz; panelin "Güvenlik durumu" uyarısı bunu söyler. Panel, site HTTP ile açılıyorsa (yerel ağ hariç) kırmızı uyarı gösterir.

## Kişisel veri: saklama, arşiv, başvurular

- **Saklama süresi** (Ayarlar → Gizlilik, `privacy.retentionDays`, varsayılan **3650 gün = 10 yıl**, 6563 sayılı Kanun m.11): süresi dolan tamamlanmış/iptal siparişlerde ad, telefon, adres, notlar ve onay IP'si silinir (tutar, ürünler, bölge kalır). Açılışta ve saatlik denetimle günde bir kez çalışır; denetim kaydına "sistem" olarak yazılır. Süreyi kısaltmadan önce YASAL.md §4.3.6'ya bakın ve avukata danışın.
- **Arşiv eşiği** (`privacy.archiveDays`, varsayılan **730 gün**): bu süreyi geçen tamamlanmış siparişlerde kişisel veriler personele maskeli görünür, yalnızca yönetici görür.
- **KVKK başvuruları:** Müşteriler ekranında "verisini dışa aktar" (JSON) ve "sil/anonimleştir". Anonimleştirilen veri otomatik yedeklerde süreleri dolana kadar (günlük yedek 14 gün, işlem öncesi yedekler son 20) kalır.
- **Telegram** bildirimine müşteri adı, telefonu, adresi ve notu yazılmaz (Telegram yurt dışında; YASAL.md §4.3.4).
- **Denetim kaydı** (`audit.json`): panelde Yönetici → Denetim kaydı.

## Yedekler

- Otomatik: günde bir `backups/db-YYYY-AA-GG.json` (son 14 gün), yükseltme / geri yükleme / toplu silme öncesi ayrıca. `DATA_KEY` varsa hepsi şifreli.
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

- [ ] `PUBLIC_URL` `https://…` ile doğru (sitemap/OG adresleri, HTTPS yönlendirmesi), `TRUST_PROXY=1` yalnızca vekil arkasında; `http://alan-adı` adresi HTTPS'e yönleniyor.
- [ ] `DATA_KEY` verildi, sunucu günlüğünde "DATA_KEY ile şifreli" yazıyor ve **anahtar sunucu dışında iki ayrı yerde saklandı**.
- [ ] Panelde **Güvenlik durumu** uyarısı kalmadı (HTTPS, şifreleme, varsayılan şifre, işletme bilgileri, ETBİS).
- [ ] ETBİS kaydı yapıldı ve numarası Ayarlar → İşletme bilgileri'ne girildi; meslek odası, e-posta (cayma bildirimleri için) dolduruldu.
- [ ] Yasal metinler (YASAL.md §5 taslakları) bir avukata onaylatıldı; panelde gerekiyorsa düzenlendi.
- [ ] Sunucu Türkiye'de barındırılıyor (değilse YASAL.md §4.3.4: standart sözleşme + Kurula bildirim).
- [ ] Caddy'de canlı akışlar için `flush_interval -1` ve üç akış yolunda (`/api/orders/stream`, `/api/admin/stream`, `/api/store/stream`) `encode` kapalı (sipariş takibi ve saat değişikliği sayfa yenilemeden görünüyor).
- [ ] `admin` şifresi değiştirildi (sunucu günlüğünde "GÜVENLİK UYARISI" ve panelde kırmızı şifre uyarısı yok); personel için ayrı `personel` hesapları açıldı.
- [ ] Ayarlar → İşletme bilgileri: **işletme türü** (şahıs / şirket), unvan (şahısta ad soyad), vergi dairesi/no, şirketse MERSİS ve KEP, e-posta dolduruldu (yasal sayfalarda `[…]` kalmamalı; şahıs işletmesinde boş MERSİS/KEP satırları kendiliğinden gizlenir, şirkette gizlenmez ve uyarı verir).
- [ ] Çalışma saatleri, bölgeler, minimum tutar ve teslimat ücretleri kontrol edildi.
- [ ] Telegram bildirimi kuruldu ve "deneme mesajı" geldi.
- [ ] `https://<alan-adı>/robots.txt` ve `/sitemap.xml` açılıyor; Google Search Console'a sitemap eklendi.
- [ ] Alkol ve tütün ürünü online katalogda yok.
