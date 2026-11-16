# Ulusoy Market — Online Sipariş

Ulusoy Market (Edirne, Şükrüpaşa) için mahalle marketi online sipariş sistemi: müşteri telefondan ya da bilgisayardan ürünleri seçer, sepete ekler, kapıda nakit/kartla ödemek üzere sipariş verir ve siparişini canlı izler. Market sahibi ve personeli yönetim panelinden siparişleri, ürünleri, kampanyaları ve ayarları yönetir.

Yalnızca [Node.js](https://nodejs.org) 18 veya üzeri gerekir. **Harici paket yoktur, `npm install` gerekmez.**

Market sahibi için sade kullanım kılavuzu: [`docs/KULLANIM.md`](docs/KULLANIM.md) · Ekran görüntüleri: [`docs/ekranlar/`](docs/ekranlar/) · Sunucuya kurulum: [`docs/DEPLOY.md`](docs/DEPLOY.md) · API: [`docs/API.md`](docs/API.md)

## Çalıştırma

```bash
node server.js            # ya da: npm start
```

Windows'ta `Marketi Baslat.bat` dosyasına çift tıklamak yeterli: sunucuyu 3000 portunda başlatır, mağazayı ve paneli tarayıcıda açar. Pencere açık kaldığı sürece market çalışır.

| Sayfa | Adres |
|---|---|
| Mağaza | http://localhost:3000 |
| Yönetim paneli | http://localhost:3000/panel |
| Sağlık denetimi | http://localhost:3000/healthz |

### İlk giriş

İlk açılışta (kullanıcı listesi boşken) **`admin`** adlı bir yönetici oluşturulur; şifresi `ADMIN_PASSWORD` ortam değişkenidir, verilmediyse `admin123`. Panelde **Hesabım → Şifre değiştir** ile hemen değiştirin. `ADMIN_PASSWORD` yalnızca ilk kurulumda kullanılır; sonradan değiştirmek mevcut şifreyi değiştirmez. Bir hesabın şifresi `admin123` olduğu sürece sunucu her açılışta **GÜVENLİK UYARISI** yazar ve panel her ekranda kırmızı uyarı gösterir; `admin123` yeni şifre olarak kabul edilmez.

```powershell
# Windows (PowerShell)
$env:ADMIN_PASSWORD="guclu-bir-sifre"; node server.js
```
```bash
# macOS / Linux
ADMIN_PASSWORD="guclu-bir-sifre" node server.js
```

### Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `3000` | Dinlenen port |
| `ADMIN_PASSWORD` | `admin123` | İlk kurulumdaki `admin` kullanıcısının şifresi |
| `DATA_DIR` | `./data` | Canlı veri: `db.json`, `sessions.json`, `backups/`, `uploads/` |
| `PUBLIC_URL` | (boş) | Sitenin dış adresi (ör. `https://ulusoymarket.com`); sitemap, canonical, Open Graph adresleri ve Telegram mesajındaki panel bağlantısı bundan üretilir. Yayında verin |
| `TRUST_PROXY` | (boş) | `1`: ters vekil (Caddy/nginx) arkasındasınız; gerçek müşteri IP'si `X-Forwarded-For`'dan alınır, HTTPS'te HSTS eklenir. Vekil yoksa açmayın |
| `STORE_TZ` | `Europe/Istanbul` | Açık/kapalı hesabı ve raporlar için saat dilimi |

## Özellikler

**Mağaza (müşteri)**
- Telefona göre tasarlanmış arayüz (alt menü, yapışkan sepet çubuğu), masaüstünde yan sepet; açık/karanlık tema (sistem tercihi + elle), ana ekrana eklenebilir (PWA manifest + ikonlar).
- Üst şeritte açık/kapalı rozeti ("Açık · 02:00'ye kadar" / "Kapalı · 14:00'te açılır"), arama, telefon ve WhatsApp kısayolları, duyuru bandı.
- Ana sayfa: karşılama, afişler, reyonlar, indirimdekiler, öne çıkanlar, "Tekrar al" (bu cihazdaki eski siparişlerden), nasıl çalışır, teslimat bölgeleri, dükkân bilgisi ve yol tarifi, SSS.
- Katalog: reyon sekmeleri, Türkçe karakter duyarsız anlık arama ("sut" → "Süt"), sıralama, "yalnızca indirimdekiler", ürün ayrıntısı, favoriler, tükendi durumu, stok/sipariş başına sınır.
- Sepet: sunucuda hesaplanan ara toplam, kupon, teslimat ücreti, "ücretsiz teslimata X ₺ kaldı" çubuğu, minimum tutar uyarısı.
- Sipariş formu: eve teslim / gel-al, bölge, kayıtlı adresler (cihazda), kapıda nakit (para üstü) ya da kart, ürün yoksa tercihi, not, KVKK + mesafeli satış onayı, bot tuzağı (honeypot).
- Kapalıyken ürünler gezilebilir; sipariş yerine durum mesajı ve ara/WhatsApp. Panelden açılırsa **ön sipariş** alınır ve açıkça yazılır.
- Sipariş sonrası onay ekranı, canlı takip (adımlar + tahmini süre), "Yeni" durumdayken iptal, markete WhatsApp, aynı ürünleri tekrar sepete ekleme; "Siparişlerim" ve başka cihazdan **sipariş no + telefon** ile sorgu.
- Sunucuda üretilen sayfalar (SEO): KVKK, mesafeli satış, iade, çerez politikası, hakkımızda, teslimat bölgesi sayfaları (`/teslimat/<bölge>`; eski `/sukrupasa-tekel` gibi adresler 301 ile yönlenir), `robots.txt`, `sitemap.xml`.

**Yönetim paneli** (`/panel`, kullanıcı adı + şifre; `yonetici` ve `personel` rolleri)
- **Siparişler:** yeni siparişte sesli uyarı, sekme başlığında sayaç, tarayıcı bildirimi; otomatik yenileme; durum sekmeleri ve süzgeçler; tek dokunuşla sonraki duruma geçirme; müşteriyi ara / WhatsApp / haritada aç; kalem düzenleme (ürün çıkar/ekle, adet değiştir — toplam yeniden hesaplanır); kurye, yönetici notu; müşteriye notlu iptal; **80 mm fiş yazdırma** (tek ya da toplu); telefonla gelen siparişi elle girme; CSV indirme.
- **Ürünler:** reyon gruplu liste, sürükle-bırak sıralama, satır içi fiyat, satışta/tükendi, gizle/göster, fotoğraf (telefonda çekilen fotoğraf otomatik küçültülür), marka, açıklama, eski fiyat (indirim), barkod, stok, sipariş başına en fazla, öne çıkan, çoğaltma; toplu işlemler (sil, gizle/göster, tükendi/satışta, öne çıkar, reyona taşı, % fiyat güncelle); **CSV içe/dışa aktarma** (Excel uyumlu); reyon görseli ve gizleme. Alkol/tütün uyarısı.
- **Kampanyalar:** kuponlar (yüzde, tutar, ücretsiz teslimat; alt sınır, toplam ve telefon başına kullanım sınırı, tarih aralığı), afişler, duyuru bandı.
- **Müşteriler:** siparişlerden türetilen liste, arama, sipariş geçmişi, engelleme.
- **Raporlar:** ciro, sipariş sayısı, ortalama sepet; ödeme/teslimat tipi, bölge, saat dağılımı; en çok satanlar (kütüphanesiz SVG grafikler); siparişleri CSV indir.
- **Ayarlar:** mağaza bilgileri, gün gün çalışma saatleri, sipariş ayarları (tek tuşla "sipariş almıyoruz", minimum tutar, teslimat ücreti, ücretsiz teslimat eşiği, tahmini süre, gel-al, ödeme tipleri, ön sipariş), teslimat bölgeleri, SSS, yasal bilgiler ve metinler, Telegram bildirimi (+ deneme mesajı), kullanıcılar, yedek al / geri yükle.
- Her listede seçerek toplu işlem, yıkıcı işlemlerde onay, kaydedilmemiş değişiklik uyarısı.

**Sunucu**
- Bağımlılıksız Node.js; atomik kayıt (geçici dosya → yeniden adlandırma), günlük otomatik yedek (son 14 gün) ve riskli işlemler öncesi yedek.
- Sipariş numaraları ve kayıt kimlikleri **asla tekrar kullanılmaz** (kalıcı sayaç; silinen siparişin numarası yeni siparişe verilmez, yedek geri yüklenince sayaç geriye gitmez).
- Eski biçimli `db.json` açılışta kayıpsız yükseltilir; eski takip bağlantıları ve "Siparişlerim" listesi çalışmaya devam eder.
- Güvenlik: scrypt şifre özeti, dosyada kalıcı oturumlar (30 gün; sunucu yeniden başlasa da düşmez), rol denetimi, IP başına hız sınırı (giriş, sipariş, telefonla sorgu), CSP ve güvenlik başlıkları, gövde boyutu sınırı, görsel türü/imza denetimi, CSV formül enjeksiyonu koruması, yedek geri yüklemede içerik denetimi.
- gzip, ETag/304, `HEAD`, `/healthz`.
- Telegram'a yeni sipariş / müşteri iptali bildirimi (ayarlıysa; hata siparişi engellemez).

## Yapı

```
server.js            giriş noktası (yalnızca lib/app.js'i başlatır)
lib/
  app.js             yapılandırma, yönlendirme, sayfalar, görsel kaydetme
  db.js              db.json yükle / atomik kaydet / eski biçimden yükselt / yedek / kimlik sayaçları
  api-store.js       mağaza API'si          api-admin.js   panel API'si
  orders.js          sipariş kuralları       pricing.js     sepet, teslimat, kupon hesabı
  validate.js        giriş doğrulamaları     auth.js        şifre, oturum, hız sınırı
  hours.js           açık/kapalı saat mantığı (gece yarısını aşan aralıklar)
  pages.js           sunucuda üretilen sayfalar   csv.js  CSV okuma/yazma
  reports.js notify.js http.js static.js router.js util.js defaults.js
public/
  index.html app.js style.css js/        mağaza
  panel.html admin.js admin.css admin/   yönetim paneli
  img/ fonts/                            logo, ikonlar, yazı tipi (depo içinde, CDN yok)
data/seed.json       örnek katalog (14 reyon, 130+ ürün) ve varsayılan ayarlar
test/*.test.js       node:test ile testler
docs/                PLAN.md, API.md, DEPLOY.md, KULLANIM.md, ekranlar/
Dockerfile, docker-compose.yml, .dockerignore, Marketi Baslat.bat
```

`DATA_DIR` (varsayılan `data/`) içeriği depoya girmez: `db.json` (tüm canlı veri; ilk açılışta `seed.json`'dan oluşur), `sessions.json`, `backups/`, `uploads/`.

Örnek verilerle sıfırdan başlamak için (yalnızca deneme kurulumunda, sunucu kapalıyken): `npm run reset` — `data/db.json` silinmez, `data/backups/sifirlama-oncesi-*.json` olarak taşınır; sonraki açılışta `seed.json`'dan yeni veri oluşur.

## Test

```bash
node --test               # ya da: npm test
```

Testler geçici klasör ve boş port kullanır, gerçek veriye dokunmaz. Kapsam: eski veri yükseltme, sipariş doğrulamaları, fiyat/teslimat/kupon hesabı, açık-kapalı saat mantığı, stok, müşteri iptali, rol/yetki (her yönetim ucu), hız sınırları, CSV, kimliklerin tekrar kullanılmaması, eşzamanlı siparişler, yedek geri yükleme, güvenlik (dizin dışına çıkma, XSS kaçışlama, formül enjeksiyonu, hata yanıtları).

## Canlıya alma

Docker ya da VPS (systemd + Caddy ile HTTPS) kurulumu, yedekten dönme ve güncelleme adımları: [`docs/DEPLOY.md`](docs/DEPLOY.md). İnternete açılacaksa mutlaka HTTPS arkasında, `PUBLIC_URL` ve `TRUST_PROXY=1` ile çalıştırın.

## Bilinen sınırlamalar

- Veriler tek bir JSON dosyasında tutulur ve her değişiklikte dosyanın tamamı yazılır. Bir mahalle marketinin hacmi (günde yüzlerce sipariş, birkaç bin ürün) için yeterlidir; çok şubeli / çok yüksek hacimli kullanımda veritabanına geçilmelidir. Uygulama **tek süreç** olarak çalışmalıdır (aynı `DATA_DIR`'i iki sunucu paylaşmamalı).
- Online kartla ödeme yoktur (sanal POS sözleşmesi gerekir); ödeme kapıda nakit ya da kartla alınır.
- Müşteri üyeliği yoktur; siparişler cihazda hatırlanır, başka cihazdan sipariş no + telefonla sorgulanır.
- SMS gönderilmez; yeni sipariş bildirimi panelde (ses + tarayıcı bildirimi) ve isteğe bağlı Telegram'dan gelir.
- Hız sınırları bellektedir; sunucu yeniden başlayınca sıfırlanır.
- Örnek katalogdaki fiyatlar yaklaşıktır ve ürün fotoğrafı yoktur; gerçek ürünler/fiyatlar panelden ya da CSV ile girilmelidir.
- Panel oturum anahtarı tarayıcının `localStorage`'ında tutulur (mağaza ile aynı alan adı). Ortak kullanılan bir bilgisayarda panelden **Çıkış** yapın.
