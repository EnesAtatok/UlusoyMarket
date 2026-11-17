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

İlk açılışta (kullanıcı listesi boşken) **`admin`** adlı bir yönetici oluşturulur; şifresi `ADMIN_PASSWORD` ortam değişkenidir, verilmediyse `admin123`. Panelde **Hesabım → Şifre değiştir** ile hemen değiştirin. `ADMIN_PASSWORD` yalnızca ilk kurulumda kullanılır; sonradan değiştirmek mevcut şifreyi değiştirmez. Bir hesabın şifresi `admin123` olduğu sürece sunucu her açılışta **GÜVENLİK UYARISI** yazar, panel her ekranda kırmızı uyarı gösterir ve sunucu **yalnızca 127.0.0.1'de** (bu bilgisayardan) dinler; şifre değiştirilip sunucu yeniden başlatılınca `HOST`'a / tüm arayüzlere açılır. `admin123` yeni şifre olarak kabul edilmez.

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
| `ADMIN_PASSWORD` | `admin123` | İlk kurulumdaki `admin` kullanıcısının şifresi (en az 8 karakter) |
| `HOST` | (tüm arayüzler) | Dinlenen adres; varsayılan şifre kullanımdayken her durumda `127.0.0.1` |
| `TRUSTED_PROXIES` | `127.0.0.0/8, ::1` | `TRUST_PROXY=1` iken başlıklarına güvenilen vekiller |
| `DATA_DIR` | `./data` | Canlı veri: `db.json`, `sessions.json`, `audit.json`, `backups/`, `uploads/` |
| `DATA_KEY` | (boş) | Verilirse (en az 16 karakter) `db.json`, `sessions.json`, `audit.json` ve tüm sunucu yedekleri **AES-256-GCM ile şifreli** yazılır. Anahtar kaybolursa veri kurtarılamaz; yanlış anahtarla sunucu açılmaz ve dosyalara dokunmaz. Döndürme: `npm run anahtar-degistir` (DEPLOY.md) |
| `PUBLIC_URL` | (boş) | Sitenin dış adresi (ör. `https://ulusoymarket.com`); sitemap, canonical, Open Graph adresleri ve Telegram mesajındaki panel bağlantısı bundan üretilir. Yayında verin |
| `TRUST_PROXY` | (boş) | `1`: ters vekil (Caddy/nginx) arkasındasınız; gerçek müşteri IP'si `X-Forwarded-For`'dan, HTTPS bilgisi `X-Forwarded-Proto`'dan alınır. Vekil yoksa açmayın |
| `FORCE_HTTPS` | `1` | `PUBLIC_URL` `https://` ve `TRUST_PROXY=1` ise HTTP istekleri `PUBLIC_URL`'ye (HTTPS) yönlenir ve HSTS gönderilir (`/healthz` ve localhost hariç). `0` kapatır |
| `STORE_TZ` | `Europe/Istanbul` | Açık/kapalı hesabı ve raporlar için saat dilimi |

## Özellikler

**Mağaza (müşteri)**
- Telefona göre tasarlanmış arayüz (alt menü, yapışkan sepet çubuğu), masaüstünde yan sepet; açık/karanlık tema (sistem tercihi + elle), ana ekrana eklenebilir (PWA manifest + ikonlar).
- Üst şeritte açık/kapalı rozeti ("Açık · 02:00'ye kadar" / "Kapalı · 14:00'te açılır"), arama, telefon ve WhatsApp kısayolları, duyuru bandı.
- Ana sayfa: karşılama, afişler, reyonlar, indirimdekiler, öne çıkanlar, "Tekrar al" (bu cihazdaki eski siparişlerden), nasıl çalışır, teslimat bölgeleri, dükkân bilgisi ve yol tarifi, SSS.
- Katalog: reyon sekmeleri, Türkçe karakter duyarsız anlık arama ("sut" → "Süt"), sıralama, "yalnızca indirimdekiler", ürün ayrıntısı, favoriler, tükendi durumu, stok/sipariş başına sınır.
- Sepet: sunucuda hesaplanan ara toplam, kupon, teslimat ücreti, "ücretsiz teslimata X ₺ kaldı" çubuğu, minimum tutar uyarısı.
- Sipariş formu: eve teslim / gel-al, bölge, kayıtlı adresler (yalnızca "bilgilerimi bu cihazda sakla" işaretliyse), kapıda nakit (para üstü) ya da kart, ürün yoksa tercihi, not, bot tuzağı (honeypot).
- **Yasal onaylar** (docs/YASAL.md): ön bilgilendirme özeti (satıcı, ürünler ve her ürünün cayma hakkı durumu, toplam, teslimat, ödeme), ayrı ve işaretsiz zorunlu onay kutuları, sepete göre doldurulmuş Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi önizlemesi, düğmenin üstünde ödeme yükümlülüğü cümlesi. Her siparişle onay kaydı (hangi metin, SHA-256 sürüm, zaman, IP) saklanır; müşteri siparişinin sözleşmesini sonradan görüntüler/yazdırır/indirir.
- Kapalıyken ürünler gezilebilir; sipariş yerine durum mesajı ve ara/WhatsApp. Panelden açılırsa **ön sipariş** alınır ve açıkça yazılır.
- Sipariş sonrası onay ekranı, **canlı takip** (SSE ile anında; bağlantı koparsa yoklama), "Yeni" durumdayken iptal, teslimden sonra **cayma/iade talebi**, markete WhatsApp, aynı ürünleri tekrar sepete ekleme.
- **Cihaza özel "Siparişlerim":** yalnızca bu cihazdan verilen siparişler (cihazda saklanan gizli anahtarla). Başka cihazdan takip için paylaşılabilir **gizli takip bağlantısı** (`/?siparis=<no>&t=<anahtar>`); numara + telefonla sorgu panelde bir ayara bağlı, varsayılan kapalı ve açıkken yalnızca salt okunur durum gösterir (takip anahtarı vermez).
- Açık mağaza sayfası, panelde çalışma saati ya da sipariş alımı değişince **yenilemeden** güncellenir (kimliksiz, yalnızca herkese açık durumu taşıyan hafif canlı akış).
- Sunucuda üretilen sayfalar (SEO): KVKK, mesafeli satış, iade, çerez politikası, hakkımızda, teslimat bölgesi sayfaları (`/teslimat/<bölge>`; eski `/sukrupasa-tekel` gibi adresler 301 ile yönlenir), `robots.txt`, `sitemap.xml`.

**Yönetim paneli** (`/panel`, kullanıcı adı + şifre; `yonetici` ve `personel` rolleri)
- **Siparişler:** yeni sipariş **canlı** gelir (SSE; bağlantı koparsa 12 sn yoklama); sesli uyarı, sekme başlığında sayaç, tarayıcı bildirimi; **sipariş teyidi** (telefon/WhatsApp/SMS, kim ve ne zaman); **cayma/iade talepleri**; onay kaydı ve siparişin sözleşmesi; durum sekmeleri ve süzgeçler; tek dokunuşla sonraki duruma geçirme; müşteriyi ara / WhatsApp / haritada aç; kalem düzenleme (ürün çıkar/ekle, adet değiştir — toplam yeniden hesaplanır); kurye, yönetici notu; müşteriye notlu iptal; **80 mm fiş yazdırma** (tek ya da toplu); telefonla gelen siparişi elle girme; CSV indirme.
- **Ürünler:** reyon gruplu liste, sürükle-bırak sıralama, satır içi fiyat, satışta/tükendi, gizle/göster, fotoğraf (telefonda çekilen fotoğraf otomatik küçültülür), marka, açıklama, eski fiyat (indirim), barkod, stok, sipariş başına en fazla, öne çıkan, **cayma hakkı durumu**, **fiyat geçmişi** (indirim öncesi fiyat son 10 günün en düşüğünden; elle yüksek girilirse uyarı), çoğaltma; toplu işlemler (sil, gizle/göster, tükendi/satışta, öne çıkar, reyona taşı, % fiyat güncelle); **CSV içe/dışa aktarma** (Excel uyumlu); reyon görseli ve gizleme. Alkol/tütün uyarısı.
- **Kampanyalar:** kuponlar (yüzde, tutar, ücretsiz teslimat; alt sınır, toplam ve telefon başına kullanım sınırı, tarih aralığı), afişler, duyuru bandı.
- **Müşteriler:** siparişlerden türetilen liste, arama, sipariş geçmişi, engelleme; KVKK başvurusu için müşteri verisini **dışa aktarma** ve **anonimleştirme** (yalnızca yönetici).
- **Raporlar:** ciro, sipariş sayısı, ortalama sepet; ödeme/teslimat tipi, bölge, saat dağılımı; en çok satanlar (kütüphanesiz SVG grafikler); siparişleri CSV indir.
- **Ayarlar:** mağaza bilgileri, gün gün çalışma saatleri, sipariş ayarları (tek tuşla "sipariş almıyoruz", minimum tutar, teslimat ücreti, ücretsiz teslimat eşiği, tahmini süre, gel-al, ödeme tipleri, ön sipariş), teslimat bölgeleri, SSS; **güvenlik durumu ve gizlilik** (saklama süresi, arşiv eşiği, telefonla sorgu, pazarlama izni), **işletme bilgileri** (şahıs/şirket, vergi, MERSİS/KEP, ETBİS), **yasal belgeler** (sürümlü, arşivli), **onay kutuları**, site dışında yapılacaklar; Telegram bildirimi (+ deneme mesajı; müşteri kişisel verisi gönderilmez), kullanıcılar, **parolalı yedek** al / geri yükle, **denetim kaydı**.
- Her listede seçerek toplu işlem, yıkıcı işlemlerde onay, kaydedilmemiş değişiklik uyarısı.

**Sunucu**
- Bağımlılıksız Node.js; atomik kayıt (geçici dosya → yeniden adlandırma), günlük otomatik yedek (son 14 gün) ve riskli işlemler öncesi yedek.
- Sipariş numaraları ve kayıt kimlikleri **asla tekrar kullanılmaz** (kalıcı sayaç; silinen siparişin numarası yeni siparişe verilmez, yedek geri yüklenince sayaç geriye gitmez).
- Eski biçimli `db.json` açılışta kayıpsız yükseltilir; eski takip bağlantıları ve "Siparişlerim" listesi çalışmaya devam eder.
- Güvenlik: scrypt şifre özeti, dosyada kalıcı oturumlar (30 gün; sunucu yeniden başlasa da düşmez), rol denetimi (gövde okunduktan sonra yeniden denetlenir), hız sınırı (IPv6 /64 gruplu; giriş IP + kullanıcı adı, IP ve kullanıcı adı başına — bilinen ağdan giriş kilitlenmez; sipariş, sepet teklifi, sorgu, takip/iptal/belge, canlı akış), `X-Forwarded-For` yalnızca güvenilen vekilden (`TRUSTED_PROXIES`), CSP (satır içi script yok) ve güvenlik başlıkları, gövde boyutu sınırı, görsel türü/imza denetimi, CSV formül enjeksiyonu koruması, yedek geri yüklemede içerik denetimi (onaylanmış yasal metin arşivi ve sunucudaki siparişlerin onay kayıtları değiştirilemez; bilinmeyen alanlar atılır), iki bölmeli denetim kaydı (güvenlik kayıtları taşırılamaz).
- **Yolda şifreleme:** HTTP → HTTPS yönlendirmesi ve HSTS (PUBLIC_URL https + TRUST_PROXY). **Depoda şifreleme:** `DATA_KEY` ile AES-256-GCM (anahtar scrypt ile türetilir, başlık AAD ile korunur). **En az veri:** saklama süresi sonunda otomatik anonimleştirme, arşivdeki siparişlerde kişisel veri personele maskeli. **Denetim kaydı** (kişisel veri yazılmaz). "Uçtan uca şifreleme" bu tür bir sistemde uygulanamaz (sunucu siparişi işlemek zorunda).
- Canlı olaylar (SSE): tek kullanımlık, 60 sn'lik, IP'ye bağlı akış biletleri (token/oturum anahtarı adrese girmez); IP başına ve toplam bağlantı sınırı, okumayan istemcinin bağlantısı kesilir.
- gzip, ETag/304, `HEAD`, `/healthz`.
- Telegram'a yeni sipariş / müşteri iptali / iade talebi bildirimi (ayarlıysa; müşteri adı, telefonu, adresi ve notu yazılmaz; hata siparişi engellemez).

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
  events.js          canlı olaylar (SSE), akış biletleri, bağlantı sınırları
  secure-file.js     depoda şifreleme (AES-256-GCM zarfı), parolalı yedek
  legal.js legal-texts.js   yasal belgeler, onay kaydı, sözleşme doldurma
  privacy.js audit.js       anonimleştirme/maskeleme, denetim kaydı
  cayma.js price-history.js cayma hakkı durumu, fiyat geçmişi
  reports.js notify.js http.js static.js router.js util.js defaults.js
scripts/anahtar-degistir.js   DATA_KEY döndürme (sunucu kapalıyken)
public/
  index.html app.js style.css js/        mağaza
  panel.html admin.js admin.css admin/   yönetim paneli
  img/ fonts/                            logo, ikonlar, ürün/reyon fotoğrafları (img/urun, img/kategori), yazı tipi (depo içinde, CDN yok)
data/seed.json       örnek katalog (14 reyon, 130+ ürün) ve varsayılan ayarlar
test/*.test.js       node:test ile testler
docs/                PLAN.md, PLAN-2.md, API.md, DEPLOY.md, KULLANIM.md, YASAL.md, GORSEL-KAYNAKLARI.md, ekranlar/
Dockerfile, docker-compose.yml, .dockerignore, Marketi Baslat.bat
```

`DATA_DIR` (varsayılan `data/`) içeriği depoya girmez: `db.json` (tüm canlı veri; ilk açılışta `seed.json`'dan oluşur), `sessions.json`, `audit.json`, `sunucu.kilit`, `backups/` (günlük, işlem öncesi ve `yukseltme-oncesi-*` yedekleri), `uploads/`.

Örnek verilerle sıfırdan başlamak için (yalnızca deneme kurulumunda, sunucu kapalıyken): `npm run reset` — `data/db.json` silinmez, `data/backups/sifirlama-oncesi-*.json` olarak taşınır; sonraki açılışta `seed.json`'dan yeni veri oluşur.

## Test

```bash
node --test               # ya da: npm test
```

Testler geçici klasör ve boş port kullanır, gerçek veriye dokunmaz. Kapsam: eski veri yükseltme, sipariş doğrulamaları, fiyat/teslimat/kupon hesabı, açık-kapalı saat mantığı, stok, müşteri iptali, rol/yetki (her yönetim ucu), hız sınırları, CSV, kimliklerin tekrar kullanılmaması, eşzamanlı siparişler, yedek geri yükleme, güvenlik (dizin dışına çıkma, XSS kaçışlama, formül enjeksiyonu, hata yanıtları), canlı akış (bilet tekrar/süre/IP, başkasının siparişini dinleme, bağlantı sınırları, olay enjeksiyonu, oturum kapanınca kesilme), depoda şifreleme (kurcalama, yanlış anahtar, anahtar döndürme ve yarıda kalan döndürme), yasal onaylar ve onay kaydı, gizlilik (anonimleştirme, arşiv maskesi), denetim kaydı, HTTPS yönlendirmesi.

## Canlıya alma

Docker ya da VPS (systemd + Caddy ile HTTPS) kurulumu, yedekten dönme ve güncelleme adımları: [`docs/DEPLOY.md`](docs/DEPLOY.md). İnternete açılacaksa mutlaka HTTPS arkasında, `PUBLIC_URL` ve `TRUST_PROXY=1` ile çalıştırın.

## Bilinen sınırlamalar

- Veriler tek bir JSON dosyasında tutulur ve her değişiklikte dosyanın tamamı yazılır. Bir mahalle marketinin hacmi (günde yüzlerce sipariş, birkaç bin ürün) için yeterlidir; çok şubeli / çok yüksek hacimli kullanımda veritabanına geçilmelidir. Uygulama **tek süreç** olarak çalışmalıdır (aynı `DATA_DIR`'i iki sunucu paylaşmamalı).
- Online kartla ödeme yoktur (sanal POS sözleşmesi gerekir); ödeme kapıda nakit ya da kartla alınır.
- Müşteri üyeliği yoktur; siparişler cihazda gizli anahtarla hatırlanır. Başka cihazdan takip gizli takip bağlantısıyla yapılır (numara + telefonla sorgu isteğe bağlı, varsayılan kapalı).
- SMS gönderilmez; yeni sipariş bildirimi panelde (ses + tarayıcı bildirimi) ve isteğe bağlı Telegram'dan gelir.
- Hız sınırları bellektedir; sunucu yeniden başlayınca sıfırlanır.
- Örnek katalogdaki fiyatlar yaklaşıktır; fotoğraflar açık kaynaklardan alınmıştır (`docs/GORSEL-KAYNAKLARI.md`). Gerçek ürünler/fiyatlar panelden ya da CSV ile girilmelidir.
- Yasal metinler taslaktır; canlıya çıkmadan önce bir avukata onaylatılmalıdır (`docs/YASAL.md`).
- Canlı akışlar tek süreçte tutulur; bağlantı sınırı varsayılan 300 (müşteri + ziyaretçi; panel ayrı). Sınır dolarsa sayfalar yoklamaya düşer.
- Panel oturum anahtarı tarayıcının `localStorage`'ında tutulur (mağaza ile aynı alan adı). Ortak kullanılan bir bilgisayarda panelden **Çıkış** yapın.
