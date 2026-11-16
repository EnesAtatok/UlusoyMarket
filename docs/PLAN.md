# Ulusoy Market — Online Sipariş Sistemi: Kapsam ve İş Planı

Bu belge işin tek kaynağıdır. Her ajan kendi bölümünü uygular; kapsam dışına çıkmaz, buradaki kararları yeniden tartışmaz.
Backend bittiğinde gerçek uç noktalar `docs/API.md` içinde yazılı olur; ön yüz ajanları onu esas alır.

## 1. Müşteri ve bağlam

- **İşletme:** Ulusoy Market (Edirne, Şükrüpaşa Mah.). Mahalle marketi; gece geç saate kadar açık, eve paket servis yapıyor.
- **Adres:** Doğa Apt, Şükrüpaşa Mah. Şehit Cem Dilay Kerman Bulvarı No:5, 22000 Merkez/Edirne
- **Telefon / WhatsApp:** 0537 311 96 96 (`+905373119696`)
- **Instagram:** https://www.instagram.com/ulusoymarkettekel/
- **Saatler:** Dükkân gece 02:00'ye kadar açık (eski site "7/24" diyor), Instagram'a göre paket servis 14:00–02:00. Varsayılan: online sipariş her gün 14:00–02:00; panelden değiştirilebilir.
- **Mevcut durum:** Siparişler bugün telefon/WhatsApp ile alınıyor. Bu proje gerçek online sipariş (sepet → sipariş → takip) + yönetim paneli sağlar.
- **Teslimat bölgeleri (varsayılan):** Şükrüpaşa, Meydan, İstiklal, Cumhuriyet, Sabuni, Medrese Alibey + "Diğer (Edirne Merkez)".
- **Ödeme:** Kapıda nakit veya kapıda kart. Online ödeme yok.
- **Logo:** `public/img/logo.webp` (turuncu sepet + hilal). Marka rengi turuncu `#F97330` civarı.

### Kesin kurallar
1. **Bağımlılıksız Node.js kalır.** `npm install` gerektiren hiçbir paket eklenmez (çalışma zamanı ve test dahil; test için `node:test`). Node >= 18.
2. **Alkol ve tütün online satılmaz.** Türkiye'de internetten satışı yasak. Örnek katalogda yer almaz; sitede "tekel" vurgusu yapılmaz; panelde ürün formunda kısa bir uyarı bulunur.
3. **Mevcut veri kaybolmaz.** Eski biçimli `data/db.json` açılışta otomatik yükseltilir (eksik alanlar varsayılanla dolar). Mevcut API davranışları (sipariş verme, takip, panel) çalışmaya devam eder.
4. **Tüm arayüz Türkçe**, para `tr-TR` / TRY biçiminde.
5. Mevcut özelliklerin hiçbiri kaldırılmaz (sürükle-bırak sıralama, ciro, iptal notu, telefonla sorgu vb.).
6. Ajanlar `git commit` / `git push` yapmaz. Canlı `data/db.json` ve 3000 portu test için kullanılmaz (bkz. §7).

## 2. Mimari

```
server.js            giriş noktası (ince): http sunucu, yönlendirme
lib/                 db.js (yükle/kaydet/yükselt/yedek), auth.js, validate.js, orders.js,
                     pricing.js (sepet/teslimat/kupon hesabı), pages.js (sunucuda üretilen sayfalar), notify.js ...
public/              index.html app.js style.css        → mağaza
                     panel.html admin.js admin.css      → yönetim paneli
                     img/ fonts/ manifest.webmanifest sw.js(yalnızca gerekirse)
data/seed.json       örnek katalog + varsayılan ayarlar
test/*.test.js       node:test ile API testleri
docs/                PLAN.md, API.md, DEPLOY.md, KULLANIM.md
```

Ortam değişkenleri: `PORT` (3000), `ADMIN_PASSWORD` (ilk kurulumda yönetici şifresi), `DATA_DIR` (varsayılan `./data`; `db.json`, `sessions.json`, `backups/`, `uploads/` burada), `PUBLIC_URL` (sitemap/OG için), `TRUST_PROXY` (1 ise `X-Forwarded-For` kullanılır).

Yüklenen görseller `DATA_DIR/uploads` altına yazılır ve `/uploads/...` adresinden sunulur; eski `public/uploads` içindekiler de sunulmaya devam eder.

## 3. Veri modeli (`db.json`)

```
settings {
  store      { name, slogan, phone, whatsapp, email, address, mapsUrl, instagram, about }
  legal      { companyTitle, taxOffice, taxNo, mersis, kep, texts { kvkk, mesafeliSatis, iade, cerez } }  // metinler panelden düzenlenir
  hours      { days[7] { open:"14:00", close:"02:00", closed:false } }   // close < open ise ertesi güne sarkar; 0=Pazartesi
  ordering   { enabled, pausedMessage, allowPreorder, minOrder, deliveryFee, freeDeliveryOver,
               etaMinutes, pickupEnabled, payments { nakit, kart }, maxActiveOrdersPerPhone }
  zones[]    { id, name, slug, fee|null, minOrder|null, etaMinutes|null, active }   // null = genel ayar geçerli
  announcement { text, active }
  banners[]  { id, title, text, image, link, active }
  faq[]      { q, a }
  notify     { telegramBotToken, telegramChatId, sound }
  blockedPhones[]
}
categories[] { id, name, emoji, image, hidden }
products[]   { id, name, brand, description, price, oldPrice|null, unit, categoryId, image, emoji,
               barcode, soldOut, hidden, featured, stock|null, maxPerOrder|null }
orders[]     { id, token, createdAt, updatedAt,
               type:"teslimat"|"gelal", payment:"nakit"|"kart", changeFor|null,
               customer { name, phone, address, zoneId, zoneName },
               note, substitution:"ara"|"benzer"|"cikar",
               items[] { productId, name, unit, price, qty },
               subtotal, discount, couponCode, deliveryFee, total,
               status, history[], cancelNote, cancelledBy:"musteri"|"market", adminNote, courier }
coupons[]    { id, code, type:"yuzde"|"tutar"|"ucretsizTeslimat", value, minOrder, maxUses|null, usedCount,
               perPhoneLimit|null, startsAt|null, endsAt|null, active }
users[]      { id, username, name, role:"yonetici"|"personel", passHash, active }
```

Sipariş durumları değişmez: `Yeni, Hazırlanıyor, Yolda, Teslim edildi, İptal`. Gel-al siparişinde "Yolda" arayüzde "Hazır, teslim alabilirsiniz" olarak gösterilir.

`stock` doluysa sipariş verildiğinde düşer, iptalde geri eklenir, 0 olunca ürün otomatik "tükendi" sayılır. `null` ise stok takibi yoktur.

## 4. Backend işleri (Ajan A)

**Altyapı**
- `server.js` modüllere bölünür (§2). Atomik kayıt (geçici dosyaya yaz → yeniden adlandır), günlük otomatik yedek (`backups/`, son 14 gün).
- Şema yükseltme: eski `db.json` → yeni model, veri kaybı olmadan. Siparişlerde eksik alanlar (subtotal, deliveryFee=0, type=teslimat, payment=nakit ...) doldurulur.
- Güvenlik: şifreler `crypto.scrypt` ile; ilk açılışta `users` boşsa `admin` / `ADMIN_PASSWORD` yöneticisi oluşur. Oturumlar dosyada kalıcı (30 gün), sunucu yeniden başlayınca düşmez. Giriş denemesi ve sipariş için IP bazlı hız sınırı. Sabit zamanlı karşılaştırma. Güvenlik başlıkları (CSP dahil, mağaza/panel çalışacak şekilde), gövde boyutu sınırı, `HEAD` desteği, gzip (zlib), statik dosyalarda ETag.
- `GET /healthz`.

**Mağaza API'si**
- `GET /api/store`: tek çağrıda mağazanın ihtiyacı olan her şey — herkese açık ayarlar (gizli alanlar hariç), şu an açık mı / ne zaman açılacak, duyuru, afişler, bölgeler, SSS, kategoriler, ürünler. (`/api/categories`, `/api/products` de çalışmaya devam eder.)
- `POST /api/cart/quote`: sepet + bölge + teslimat tipi + kupon → ara toplam, indirim, teslimat ücreti, toplam, minimum tutar eksiği, uyarılar. Fiyatı her zaman sunucu hesaplar.
- `POST /api/orders`: yeni alanlarla (tip, ödeme, para üstü, bölge, not, ürün yoksa tercihi, kupon, KVKK onayı). Doğrulamalar: kapalıyken / sipariş alımı durdurulmuşken red (ön sipariş açıksa kabul), minimum tutar, bölge geçerliliği, engelli telefon, telefon başına aktif sipariş sınırı, stok ve `maxPerOrder`, kupon kuralları. Gel-al'da adres zorunlu değil. Gizli alan (honeypot) doluysa sessizce reddet.
- `GET /api/orders/:id` (mevcut takip) + `POST /api/orders/:id/cancel` (müşteri yalnızca "Yeni" durumundayken iptal edebilir).
- Sipariş gelince Telegram bildirimi (ayar doluysa, hata siparişi engellemez).

**Panel API'si** (rol denetimli: `personel` sipariş ve stok/tükendi işlemlerini yapar; ayarlar, kullanıcılar, kuponlar, ciro, yedek yalnızca `yonetici`)
- Giriş/çıkış, oturum bilgisi, kendi şifresini değiştirme.
- Ürünler: mevcutlar + yeni alanlar, çoğaltma, toplu işlem (seçilenleri **sil**/gizle/göster/tükendi/satışta/öne çıkar/kategori taşı/yüzde fiyat güncelle — tek istekte id listesiyle; silinen ürünlerin görselleri de silinir), CSV içe/dışa aktarma (UTF-8 BOM, `;` ayraç — Excel TR uyumlu; barkod veya ada göre eşleştirip günceller, yoksa ekler).
- Kategoriler: mevcutlar + görsel, gizleme.
- Siparişler: sayfalı/filtreli liste (durum, tarih aralığı, arama), `since` parametresiyle yeni siparişleri yoklama, durum değiştirme, iptal notu, yönetici notu, kurye adı, sipariş kalemini düzenleme (ürün çıkar / adet değiştir → toplam yeniden hesaplanır, geçmişe yazılır), panelden elle (telefonla gelen) sipariş oluşturma.
- Müşteriler: siparişlerden türetilen liste (telefon, ad, son adres, sipariş sayısı, toplam harcama, son sipariş), engelle/engeli kaldır.
- Kuponlar: CRUD.
- **Toplu silme her listede vardır:** ürünler, kategoriler (içi boş olanlar; dolu olanlar atlanır ve yanıtta bildirilir), kuponlar, afişler, SSS maddeleri, bölgeler ve siparişler (yalnızca yönetici; yalnızca "Teslim edildi"/"İptal" durumundakiler silinebilir, silmeden önce otomatik yedek alınır). Yanıt: kaç kayıt silindi, hangileri neden atlandı.
- Ayarlar: tümünü oku/yaz (doğrulamalı), afiş görseli yükleme.
- Kullanıcılar: CRUD (son yönetici silinemez/pasifleştirilemez).
- Raporlar: tarih aralığına göre ciro, sipariş sayısı, ortalama sepet, ödeme tipi ve teslimat tipi dağılımı, bölge dağılımı, en çok satan ürünler, saatlik dağılım; siparişleri CSV indir.
- Yedek: tüm veriyi JSON indir / geri yükle (geri yüklemeden önce otomatik yedek).

**Sunucuda üretilen sayfalar** (SEO; `lib/pages.js`)
- `/` için `index.html` içine başlık, açıklama, Open Graph ve `LocalBusiness` JSON-LD ayarlardan yerleştirilir.
- `/kvkk`, `/mesafeli-satis`, `/iade-kosullari`, `/cerez-politikasi`, `/hakkimizda`: ayarlardaki metinlerden üretilir. Varsayılan metinler makul Türkçe şablonlardır; unvan/vergi no gibi alanlar ayarlardan gelir, boşsa "[…]" yer tutucusu kalır.
- `/teslimat/<bolge-slug>`: her aktif bölge için kısa tanıtım sayfası (eski sitedeki mahalle sayfalarının karşılığı). Eski adresler (`/sukrupasa-tekel` vb.) yeni sayfalara 301 ile yönlenir.
- `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`. `/panel` aramaya kapalı (`noindex`).
- Bu sayfaların ortak görünümü için mağaza ajanının yazacağı `public/style.css` kullanılır; A ajanı sade, anlamlı HTML iskeleti ve sınıf adlarını `docs/API.md` içinde belgeleyerek bırakır.

**Örnek veri (`seed.json`)**: gerçekçi mahalle marketi kataloğu — yaklaşık 12 kategori, 120+ ürün (Meyve & Sebze, Süt & Kahvaltılık, Şarküteri, Fırın, Temel Gıda, Soğuk İçecekler, Sıcak İçecekler, Atıştırmalık & Çerez, Çikolata & Şekerleme, Dondurma & Tatlı, Temizlik, Kişisel Bakım, Bebek, Ev & Pratik). Fiyatlar 2026 Türkiye piyasasına göre yaklaşık; bir kısmında `oldPrice` (indirim), bir kısmı `featured`. Varsayılan ayarlar §1'e göre; birkaç SSS; 1 örnek kupon (`HOSGELDIN`, pasif).

**Testler** (`node --test`): yükseltme, sipariş doğrulamaları, fiyat/teslimat/kupon hesabı, açık-kapalı saat mantığı (gece yarısını aşan aralık dahil), stok düş/geri ekle, müşteri iptali, yetki/rol denetimi, hız sınırı, CSV içe/dışa aktarma. Testler geçici `DATA_DIR` ve boş port kullanır.

**Teslim:** `docs/API.md` (her uç nokta: yöntem, yol, yetki, istek/yanıt örneği, hata kodları) ve `docs/DEPLOY.md` (Dockerfile + docker-compose, VPS'te systemd + Caddy ile HTTPS, ortam değişkenleri, yedekten dönme, güncelleme adımları). `Dockerfile`, `docker-compose.yml`, `.dockerignore` dosyaları eklenir. `Marketi Baslat.bat` çalışmaya devam eder.

## 5. Mağaza ön yüzü (Ajan B) — `public/index.html`, `app.js`, `style.css`, `img/`, `fonts/`

**Tasarım yönü.** Önce `ui-ux-pro-max` ve `frontend-design` skillerini yükle ve uygula. Kimlik: *"Gece de açık mahalle marketi."* Logodaki turuncu ana vurgu; ikinci renk gece laciverti/koyu mürekkep; ürün alanları açık ve ferah (okunabilirlik önce gelir), karşılama alanı ve alt bilgi gece temalı. Hilal motifi ölçülü kullanılır. Şablon görünümlü, mor degradeli, her yeri kartlı "yapay zekâ işi" görünümden kaçın. Eski sitenin (ulusoymarket.com) tasarımı örnek alınmaz. Yazı tipleri depo içine (`public/fonts`, woff2) alınır, dış CDN'e bağlanılmaz. Karanlık tema desteği olur (sistem tercihine uyar + elle değiştirme).

**Önce mobil.** Müşterilerin çoğu telefondan gelir: 360 px'te kusursuz, alt gezinme çubuğu (Ana sayfa / Kategoriler / Sepet / Siparişlerim), yapışkan sepet özeti, en az 44 px dokunma alanı. Masaüstünde sepet yan panelde. WCAG AA karşıtlık, klavye ile kullanılabilirlik, `prefers-reduced-motion`.

**Ekranlar ve özellikler**
- Üst şerit: logo, arama, açık/kapalı rozeti ("Açık · 02:00'ye kadar" / "Kapalı · 14:00'te açılır"), telefon ve WhatsApp kısayolları, duyuru bandı.
- Ana sayfa: karşılama (kısa, sipariş vermeye yönlendiren), afişler/kampanyalar, kategori ızgarası, "İndirimdekiler", "Öne çıkanlar", "Tekrar al" (bu cihazdaki eski siparişlerden), nasıl çalışır (3 adım), teslimat bölgeleri, dükkân bilgisi + yol tarifi, SSS, alt bilgi (iletişim, saatler, bölgeler, yasal sayfa bağlantıları, Instagram).
- Katalog: kategori sekmeleri, anlık arama (Türkçe karakter duyarsız: "sut" → "Süt"), sıralama (önerilen / fiyat artan-azalan / ada göre), "yalnızca indirimdekiler" süzgeci, ürün kartı (görsel ya da kategori renkli yer tutucu, marka, ad, birim, fiyat, eski fiyat + indirim yüzdesi, tükendi durumu, adet düğmeleri), ürün ayrıntı penceresi, favoriler.
- Sepet: adet değiştirme, ürün notu yok ama genel sipariş notu var, kupon alanı, ara toplam / indirim / teslimat / toplam, "ücretsiz teslimata X ₺ kaldı" çubuğu, minimum tutar uyarısı. Tutarlar `POST /api/cart/quote` ile sunucudan doğrulanır.
- Sipariş formu: teslimat tipi (eve teslim / gel al), bölge seçimi, ad, telefon, adres (mevcut karakter kuralları korunur), kayıtlı adresler (bu cihazda, birden çok), ödeme (nakit / kapıda kart; nakitte "para üstü kaç TL için" seçeneği), ürün yoksa tercihi, sipariş notu, KVKK ve mesafeli satış onayı (bağlantılı), honeypot. Bilgiler cihazda hatırlanır.
- Kapalıyken: ürünler gezilebilir; sipariş düğmesi yerine durum mesajı + ara / WhatsApp; ön sipariş açıksa sipariş verilebilir ve bu açıkça yazılır.
- Sipariş sonrası: onay ekranı, canlı takip (mevcut adımlar + tahmini süre), "Yeni" durumundayken iptal, WhatsApp'tan markete yaz, tekrar sipariş ver; "Siparişlerim" ve numara + telefonla sorgu (mevcut) korunur.
- Durumlar: yükleniyor iskeleti, boş sepet / boş arama, ağ hatası + yeniden dene, çevrimdışı uyarısı.
- PWA: ana ekrana eklenebilir (manifest + ikonlar); favicon ve Open Graph görseli logodan üretilir.
- Yasal ve bölge sayfaları sunucudan gelir; görünümleri `style.css` ile uyumlu olmalı (sınıf adları `docs/API.md` içinde).

## 6. Yönetim paneli (Ajan C) — `public/panel.html`, `admin.js`, `admin.css`

Önce `ui-ux-pro-max` skilini yükle. Panel işlevseldir: yoğun, hızlı, tezgâh arkasındaki telefonda ve tablette rahat kullanılır. Mağazanın turuncu/lacivert kimliğiyle uyumlu ama sade. Mevcut tüm işlevler korunur.

- **Giriş:** kullanıcı adı + şifre; rol bazlı menü. Şifre değiştirme.
- **Siparişler (açılış ekranı):** yeni sipariş sesli uyarısı + sekme başlığında sayaç + tarayıcı bildirimi (izin verilirse), otomatik yenileme; durum sütunlu ya da süzgeçli liste; tek dokunuşla sonraki duruma geçirme; ayrıntıda müşteriyi ara / WhatsApp'tan yaz (hazır mesajlarla) / adresi haritada aç; ödeme tipi, para üstü, not, ürün yoksa tercihi belirgin; kalem düzenleme; kurye adı; yönetici notu; iptal + not; **fiş yazdır** (80 mm termal yazıcıya uygun yazdırma görünümü, tarayıcı yazdırma penceresiyle); elle sipariş oluşturma; tarih/durum/arama süzgeçleri.
- **Ürünler:** mevcut ekran + yeni alanlar (marka, açıklama, eski fiyat/indirim, barkod, stok, sipariş başına en fazla, öne çıkan), çoğalt, toplu seçim işlemleri, CSV içe/dışa aktarma, hızlı fiyat düzenleme (satır içinde), kategori görseli ve gizleme. Alkol/tütün uyarısı.
- **Kampanyalar:** afişler, duyuru bandı, kuponlar.
- **Müşteriler:** liste, arama, ayrıntı (sipariş geçmişi), engelle.
- **Raporlar:** mevcut ciro ekranı + §4'teki dağılımlar (grafikler SVG ile, kütüphanesiz), CSV indir.
- **Ayarlar:** mağaza bilgileri, çalışma saatleri (gün gün), sipariş ayarları (aç/kapa — "şu an sipariş almıyoruz" tek tuş, minimum tutar, teslimat ücreti, ücretsiz teslimat eşiği, tahmini süre, gel-al, ödeme tipleri, ön sipariş), teslimat bölgeleri, SSS, yasal bilgiler ve metinler, Telegram bildirimi (+ deneme mesajı), kullanıcılar, yedek al / geri yükle.
- **Seçerek toplu işlem her listede:** satır başında onay kutusu, "tümünü seç" (süzülmüş listeyi / kategoriyi), seçim sayacı ve yapışkan işlem çubuğu. Ürünlerde: toplu sil, gizle/göster, tükendi/satışta, öne çıkar, kategoriye taşı, yüzde fiyat güncelle. Siparişlerde: toplu durum değiştir, toplu fiş yazdır, toplu sil (yalnızca yönetici, tamamlanmış/iptal). Kupon, afiş, SSS, bölge, kategori listelerinde toplu sil. Toplu silmede kaç kaydın silineceğini söyleyen onay penceresi; sonuçta "12 silindi, 2 atlandı (neden)" bildirimi.
- Kaydedilmemiş değişiklik uyarısı, işlem sonrası bildirim, yıkıcı işlemlerde onay, hata mesajları anlaşılır Türkçe.

## 7. Doğrulama (Ajan D)

- Test sunucusu: `PORT=3410`, `DATA_DIR=<geçici klasör>`, `ADMIN_PASSWORD=test1234`. 3000 portu ve gerçek `data/db.json` kullanılmaz. İş bitince süreç kapatılır.
- `node --test` tamamı geçmeli.
- `playwright-cli` skili ile gerçek tarayıcıda uçtan uca: (1) telefonda (390×844) ürün ara → sepete ekle → kupon → sipariş ver → takip et → iptal et; (2) panelde giriş → siparişi ilerlet → fiş görünümü → ürün ekle/düzenle → ayar değiştir (minimum tutar, kapat/aç) ve mağazaya yansıdığını gör; (3) kapalı saat ve minimum tutar altı senaryoları; (4) masaüstü (1440×900) ve karanlık tema görünümü. Konsol hatası olmamalı.
- Ekran görüntüleri `docs/ekranlar/` altına. Bulunan hatalar düzeltilir, düzeltilemeyenler raporlanır.
- `README.md` ve `docs/KULLANIM.md` (market sahibi için sade kullanım kılavuzu) güncellenir.

## 8. Sıra

1. Ajan A (backend) → `docs/API.md` hazır.
2. Ajan B (mağaza) ve Ajan C (panel) aynı anda. Dosya alanları ayrıdır; biri diğerinin dosyasına dokunmaz. Backend'de eksik/hatalı uç nokta görürlerse `lib/` içinde düzeltir ve `docs/API.md`'yi günceller, raporda belirtir.
3. Ajan D (doğrulama + belgeler).

## 9. Kapsam dışı (bilinçli)

Online kartla ödeme (sanal POS sözleşmesi gerekir), üyelik/şifreli müşteri hesabı (telefonla sorgu + cihazda hatırlama yeterli), SMS gönderimi (ücretli sağlayıcı gerekir), gerçek ürün fotoğrafları ve gerçek fiyat listesi (market sahibinden gelecek; panelden ya da CSV ile girilir).
