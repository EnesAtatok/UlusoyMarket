# Ulusoy Market — API ve Sunucu Sözleşmesi

> **2. revizyon (17 Kasım 2026):** canlı güncelleme (SSE, §2.7 ve §3.1), cihaza özel siparişlerim ve takip bağlantısı (§2.5–2.6), saat göstergesi verisi (durum nesnesi), yasal belgeler/onay kaydı (YASAL.md'den; §2.3, §2.8, §4), cayma durumu ve ödeme yükümlülüğü bildirimi, cayma/iade talebi, depoda şifreleme (DATA_KEY), HTTPS yönlendirme, denetim kaydı, saklama süresi/arşiv, güvenlik durumu ucu, fiyat geçmişi ve sipariş teyidi eklendi. **Kırıcı değişiklikler:** sipariş gövdesinde `kvkk: true` artık kabul edilmez, `consents` zorunlu; numara + telefonla sorgu varsayılan kapalı (404 `SORGU_KAPALI`); müşteri iptali yalnızca `token` ile; Telegram mesajında müşteri bilgisi yok; tema rengi `#0B0B0C`.

Bu belge `lib/` içindeki kodun yaptığını anlatır; ön yüz (mağaza: `public/index.html`, `app.js`, `style.css`; panel: `public/panel.html`, `admin.js`, `admin.css`) yalnızca buna dayanır. Örnek yanıtların tamamı çalışan sunucudan alınmış gerçek JSON'dur (uzun listeler `…` ile kısaltıldı).

İçindekiler: [1. Genel kurallar](#1-genel-kurallar) · [2. Mağaza API'si](#2-mağaza-apisi) · [3. Panel API'si](#3-panel-apisi) · [4. Sunucuda üretilen sayfalar](#4-sunucuda-üretilen-sayfalar) · [5. Güvenlik başlıkları ve CSP](#5-güvenlik-başlıkları-ve-csp) · [6. Statik dosyalar ve önbellek](#6-statik-dosyalar-ve-önbellek) · [7. Veri modeli](#7-veri-modeli-dbjson)

---

## 1. Genel kurallar

- **Biçim:** İstek ve yanıt gövdeleri JSON (`Content-Type: application/json`). Gövdesiz istekte `{}` varsayılır. Yanıtlar `Cache-Control: no-store`.
- **Para:** sayı (TL), iki ondalığa yuvarlanmış (`46.5`, `342`). Biçimlendirme istemcide (`tr-TR`, `TRY`). Panel giriş alanlarında `"59,90"` gibi virgüllü metin de kabul edilir.
- **Tarih/saat:** ISO 8601, UTC (`"2026-11-16T18:00:00.000Z"`). Saat dilimi mantığı (açık/kapalı, raporların gün sınırları, `from`/`to`) **Türkiye saati** (`Europe/Istanbul`) ile yapılır. Tarih parametreleri `YYYY-AA-GG`.
- **Hata yanıtı:** her zaman
  ```json
  { "error": "Kullanıcıya gösterilebilir Türkçe mesaj.", "code": "MAKINE_KODU" }
  ```
  Bazı hatalarda ek alan olur (`quote`, `retryAfter`). İstemci `error` metnini doğrudan gösterebilir; dallanma için `code` kullanın.
- **Oturum (panel):** `POST /api/admin/login` yanıtındaki `token`, sonraki isteklerde `Authorization: Bearer <token>` başlığıyla gönderilir. Çerez kullanılmaz. Oturum 30 gün geçerlidir, sunucu yeniden başlasa da düşmez (`DATA_DIR/sessions.json`). İndirme uç noktaları da (CSV, yedek) bu başlığı ister: `fetch` ile alıp `Blob` → `URL.createObjectURL` → `<a download>` ile indirin.
- **Roller:** `personel` ve `yonetici`. Aşağıda her uç noktanın yetkisi yazılıdır: **Herkes** (oturumsuz), **Personel** (oturum açmış herkes), **Yönetici**.
- **Hız sınırları** (IP başına — IPv6 adresler /64 ağ olarak, IPv4-eşlemeli adresler IPv4 olarak sayılır —, bellekte; aşılırsa `429` + `Retry-After` başlığı + `retryAfter` alanı, kod `HIZ_SINIRI`):

  | Ne | Sınır |
  |---|---|
  | Panel girişi (IP + kullanıcı adı) | 15 dakikada 8 (doğru şifre de bu sürede reddedilir; başarılı giriş yalnızca o IP + kullanıcı adının sayacını sıfırlar) |
  | Panel girişi (IP başına, tüm kullanıcı adları) | 15 dakikada 30 (başarılı girişler sayılmaz) |
  | Panel girişi (kullanıcı adı başına, IP'den bağımsız) | 15 dakikada 30 başarısız deneme; aşılınca yalnızca bu hesaba son 30 günde başarıyla giriş yapılmış ağlardan giriş kabul edilir (hesap kalıcı kilitlenmez) |
  | Şifre değiştirme (`POST /api/admin/password`, kullanıcı başına) | 15 dakikada 8 |
  | Sepet teklifi (`POST /api/cart/quote`) | 10 dakikada 600 |
  | `POST /api/orders` (her deneme sayılır) | 10 dakikada 10 |
  | Telefonla sipariş sorgusu (`?phone=`; yalnızca `privacy.phoneLookup` açıkken) | 10 dakikada 30 (takip anahtarı tutmayan her telefon denemesi sayılır; yanlış `token` eklemek sınırı atlatmaz) |
  | Toplu sipariş sorgusu, `GET /api/orders/:id?token=`, müşteri iptali, sipariş belgeleri (`POST /api/orders/:id/documents`, `/siparis/:id/belgeler`), belge önizlemesi, cayma/iade talebi | 10 dakikada 300 (ortak) |
  | Canlı akış bileti (müşteri + panel) | 10 dakikada 120 |
  | Açık canlı akış (SSE) bağlantısı | IP başına 8, toplam 300 (aşılırsa `429 AKIS_SINIRI`) |

- **Gövde boyutu:** varsayılan 1 MB; görsel içeren uç noktalar 8 MB (görsel en fazla 5 MB); CSV içe aktarma ve yedek geri yükleme 30 MB. Aşılırsa `413`, kod `COK_BUYUK`.
- **HEAD** her GET uç noktasında çalışır (gövdesiz). Desteklenmeyen yöntem → `405` (`YONTEM`), bilinmeyen `/api/…` → `404` `{"error":"Bulunamadı","code":"BULUNAMADI"}`.
- **Sıkıştırma:** `Accept-Encoding: gzip` gönderen istemciye 860 bayttan büyük JSON/HTML/CSS/JS gzip ile döner (tarayıcı bunu kendisi yapar).

### Hata kodları

| Kod | HTTP | Anlamı |
|---|---|---|
| `DOGRULAMA` | 400 | Alan doğrulaması (mesaj hangi alan olduğunu söyler) |
| `GECERSIZ_JSON` | 400 | Gövde JSON değil |
| `COK_BUYUK` | 413 | Gövde sınırı aşıldı |
| `BOS_SEPET` | 400 | Sepet boş / tüm kalemler çıkarılmak istendi |
| `BOLGE_SECIN` / `BOLGE_GECERSIZ` | 400 | Eve teslimde bölge yok / bölge pasif ya da yok |
| `MIN_TUTAR` | 400 | Minimum sipariş tutarı altında (yalnızca eve teslim) |
| `KUPON` | 400 | Kupon uygulanamıyor (mesaj nedenini söyler) |
| `ODEME` | 400 | Seçilen ödeme yöntemi kapalı |
| `GELAL_KAPALI` | 400 | Gel-al kapalı |
| `ONAY` | 400 | Zorunlu onay kutularından biri işaretlenmedi; yanıtta `missing: [onay anahtarları]` |
| `METIN_DEGISTI` | 409 | `docVersions` gönderildi ama yasal metin bu arada değişti; yanıtta `stale`, `docs` (güncel sürümler). Sayfayı yenileyip onayı tekrar alın |
| `SORGU_KAPALI` | 404 | Numara + telefonla sorgu panelde kapalı (varsayılan) |
| `BILET_GECERSIZ` | 403 | SSE akış bileti yok / uydurma / kullanılmış / başka IP'den |
| `BILET_SURESI_DOLDU` | 410 | SSE akış biletinin 60 sn'lik süresi doldu |
| `AKIS_SINIRI` | 429 | Açık canlı bağlantı sınırı (IP ya da toplam) dolu → yoklamaya düşün |
| `AKIS_DOLU` | 503 | Bilet verilemiyor (bellek sınırı) → yoklamaya düşün |
| `TALEP_SINIRI` | 429 | Siparişte en fazla 5 cayma/iade talebi |
| `YEDEK_PAROLA` | 400 | Parolalı yedek: parola yok ya da yanlış |
| `YEDEK_ACILAMIYOR` | 409 | Sunucudaki yedek bu DATA_KEY ile açılamıyor |
| `GECERSIZ_ADET` | 400 | Adet 1–99 değil |
| `GORSEL` | 400 | Görsel türü/boyutu/içeriği hatalı |
| `KAPALI` | 409 | Mağaza kapalı (ön sipariş kapalı) |
| `DURDURULDU` | 409 | Sipariş alımı panelden durdurulmuş |
| `TUKENDI` | 409 | Sepetteki bir ürün tükendi |
| `SATISTA_DEGIL` | 409 | Sepetteki bir ürün gizlendi/silindi |
| `ADET_SINIRI` | 409 | `maxPerOrder` ya da stok aşıldı |
| `IPTAL_EDILEMEZ` | 409 | Sipariş "Yeni" değil, müşteri iptal edemez |
| `IPTAL_EDILMIS` | 409 | Sipariş zaten iptal |
| `ENGELLI` | 403 | Telefon engelli |
| `AKTIF_SINIR` | 429 | Telefon başına aktif sipariş sınırı dolu |
| `HIZ_SINIRI` | 429 | IP hız sınırı |
| `BULUNAMADI` | 404 | Kayıt yok |
| `GIRIS` | 401 | Kullanıcı adı / şifre hatalı |
| `OTURUM` | 401 | Oturum yok ya da süresi doldu → giriş ekranına dönün |
| `YETKI` | 403 | Rol yetmiyor |
| `BARKOD`, `AYNI_AD`, `AYNI_KOD` | 409 | Tekillik çakışması |
| `DOLU_KATEGORI` | 409 | Kategoride ürün var |
| `SON_YONETICI` | 409 | Son aktif yönetici silinemez/pasifleştirilemez/personele çevrilemez |
| `TELEGRAM` | 502 | Telegram deneme mesajı gönderilemedi |
| `YONTEM` | 405 | Yöntem desteklenmiyor |
| `SUNUCU` | 500 | Beklenmeyen hata |

### Ortak doğrulama kuralları (istemcide de aynısı uygulanmalı)

`GET /api/store` → `rules` alanında da döner.

| Alan | Kural | Hata mesajı |
|---|---|---|
| Ad soyad | Harfle başlar; harf, boşluk, `.`, `'`, `-`; en az iki kelime; en fazla 60 | "Ad soyad yalnızca harflerden oluşmalı (örn. Ayşe Yılmaz)." / "Ad soyad en fazla 60 karakter olabilir." |
| Telefon | Boşluk, `-`, `()` atılır; `+90…`, `90…`, `5…` biçimleri `0…`'a çevrilir; sonuç `^0\d{10}$` | "Telefon 0 ile başlamalı ve 11 haneli olmalı (örn. 05321234567)." |
| Adres | 10–250 karakter, en fazla 5 satır; rakam, harf, boşluk, `.,:;/#'()-` ve satır sonu | "Lütfen açık adres girin (en az 10 karakter)." / "Adres en fazla 250 karakter olabilir." / "Adres en fazla 5 satır olabilir." / "Adreste izin verilmeyen karakter var." |
| Sipariş notu | En fazla 300 karakter | "Sipariş notu en fazla 300 karakter olabilir." |
| Adet | Tam sayı 1–99 (ürünün `maxQty` değeri daha düşük olabilir) | — |

---

## 2. Mağaza API'si

### `GET /api/store` — Herkes

Mağazanın ihtiyacı olan her şey tek çağrıda. Kategoriler ve ürünler **panel sırasıyla** gelir; gizli kategoriler ve gizli kategorideki ürünler hiç gelmez. Gizli ayarlar (Telegram, engelli numaralar, yasal metinler, telefon başına sınır) gelmez.

```json
{
  "store": {
    "name": "Ulusoy Market",
    "slogan": "Gece de açık mahalle marketi",
    "phone": "0537 311 96 96",
    "whatsapp": "905373119696",
    "email": "",
    "address": "Doğa Apt, Şükrüpaşa Mah. Şehit Cem Dilay Kerman Bulvarı No:5, 22000 Merkez/Edirne",
    "city": "Edirne",
    "district": "Merkez",
    "postalCode": "22000",
    "mapsUrl": "https://www.google.com/maps/search/?api=1&query=Ulusoy+Market+%C5%9E%C3%BCkr%C3%BCpa%C5%9Fa+Edirne",
    "instagram": "https://www.instagram.com/ulusoymarkettekel/",
    "about": "Ulusoy Market, Edirne Şükrüpaşa'da gece geç saate kadar açık olan bir mahalle marketidir. …"
  },
  "legal": { "businessType": "", "companyTitle": "", "taxOffice": "", "taxNo": "", "mersis": "", "kep": "" },
  "hours": {
    "days": [
      { "open": "14:00", "close": "02:00", "closed": false },
      "… 7 gün, 0 = Pazartesi … 6 = Pazar"
    ],
    "summary": [ { "days": "Her gün", "text": "14:00–02:00" } ]
  },
  "ordering": {
    "enabled": true,
    "pausedMessage": "Şu an online sipariş alamıyoruz. Telefonla veya WhatsApp'tan ulaşabilirsiniz.",
    "allowPreorder": false,
    "minOrder": 200,
    "deliveryFee": 20,
    "freeDeliveryOver": 500,
    "etaMinutes": 30,
    "pickupEnabled": true,
    "payments": { "nakit": true, "kart": true }
  },
  "status": {
    "isOpen": true,
    "acceptingOrders": true,
    "preorder": false,
    "paused": false,
    "state": "acik",
    "label": "Açık · 02:00'ye kadar",
    "hoursLabel": "Açık · 02:00'ye kadar",
    "message": "Siparişleriniz hemen hazırlanır.",
    "alwaysOpen": false,
    "closesAt": "02:00",
    "closesAtIso": "2026-11-16T23:00:00.000Z",
    "opensAt": null,
    "opensAtIso": null,
    "opensDay": null,
    "serverTime": "2026-11-16T18:00:00.000Z"
  },
  "zones": [
    { "id": 1, "name": "Şükrüpaşa", "slug": "sukrupasa", "fee": 20, "minOrder": 200, "etaMinutes": 20 },
    { "id": 2, "name": "Meydan", "slug": "meydan", "fee": 20, "minOrder": 200, "etaMinutes": 30 },
    { "id": 7, "name": "Diğer (Edirne Merkez)", "slug": "edirne-merkez", "fee": 40, "minOrder": 400, "etaMinutes": 45 }
  ],
  "announcement": { "text": "", "active": false },
  "banners": [
    { "id": 1, "title": "Gece de kapınızdayız", "text": "Her gün 14:00–02:00 arası eve teslim. Kapıda nakit veya kartla ödeyin.", "image": null, "link": "" }
  ],
  "faq": [
    { "id": 1, "q": "Hangi saatlerde sipariş verebilirim?", "a": "Online siparişleri her gün 14:00 ile 02:00 arasında alıyoruz. Dükkânımız da gece 02:00'ye kadar açık." }
  ],
  "categories": [
    { "id": 1, "name": "Meyve & Sebze", "emoji": "🥦", "image": null, "productCount": 12 },
    { "id": 2, "name": "Süt & Kahvaltılık", "emoji": "🥛", "image": null, "productCount": 12 }
  ],
  "products": [
    { "id": 5, "name": "Muz (İthal)", "brand": "", "description": "", "price": 79.9, "oldPrice": 89.9, "discountPercent": 11, "unit": "kg", "categoryId": 1, "image": null, "emoji": "🍌", "featured": false, "soldOut": false, "maxQty": 99 },
    { "id": 13, "name": "Tam Yağlı Süt 1 L", "brand": "Sütaş", "description": "", "price": 46.5, "oldPrice": null, "discountPercent": 0, "unit": "adet", "categoryId": 2, "image": null, "emoji": "🥛", "featured": true, "soldOut": false, "maxQty": 99 }
  ],
  "rules": { "nameMax": 60, "addressMin": 10, "addressMax": 250, "addressMaxLines": 5, "noteMax": 300, "qtyMax": 99, "phonePattern": "^0\\d{10}$" },
  "serverTime": "2026-11-16T18:00:00.000Z"
}
```

Alan notları:

- `zones[]`: yalnızca aktif bölgeler; `fee`, `minOrder`, `etaMinutes` **etkin** değerlerdir (bölgede boşsa genel ayar yazılmıştır). Fiyatı gösterirken yine de `POST /api/cart/quote` sonucunu esas alın.
- `ordering.freeDeliveryOver`: `null` ise ücretsiz teslimat eşiği yok.
- `banners[]`: yalnızca aktif afişler. `image` `null` ya da `/uploads/…`; `link` boş, `/…`, `#…` ya da `https://…` olabilir.
- `announcement.active` false ise bant gösterilmez.
- `products[].soldOut`: elle "tükendi" **ya da** stok takibi açık ve stok 0. `maxQty` = min(99, sipariş başına en fazla, kalan stok); tükendiyse 0. Stok adedi ve barkod müşteriye gönderilmez.
- `products[].oldPrice` yalnızca `price`'tan büyükse dolu; `discountPercent` tam sayı.
- `products[].image` `null` ise `emoji` ve kategori rengiyle yer tutucu çizin.
- **2. revizyonla gelen alanlar** (örnekler çalışan sunucudan):
  - `products[].caymaDurumu` / `caymaLabel` — ürünün cayma hakkı durumu: `"yok_cabuk_bozulan"` ("Yok – çabuk bozulan"), `"acilirsa_yok_hijyen"` ("Ambalajı açılırsa yok – hijyen"), `"var"`. Ürüne özel değer yoksa kategorininki geçerlidir. Sipariş onayından önceki özet kutusunda **ürün ürün** gösterilmeli (YASAL.md §2.1).
  - `categories[].caymaDurumu` — kategorinin varsayılanı.
  - `legal.docs[]` — yayımdaki yasal belgeler: `{ key, title, path, lead, version }` (`version` = metnin SHA-256 özeti; metnin kendisi gelmez, sayfası `path`'tedir). `legal.consents[]` — sipariş formundaki onay kutuları (sırayla). Ayrıntı §2.3.
  - `legal.chamber` — meslek odası.
  - `checkout` — sipariş onayı ekranının metinleri (§2.3).
  - `features`: `{ phoneLookup, marketingConsent, returnRequests, liveUpdates, liveStatus }` (`liveStatus`: §2.7a kimliksiz durum akışı var) — `phoneLookup: false` iken numara + telefonla sorgu formunu **göstermeyin**.
  - `rules.trackMax` (30) — toplu sorgu ve akışta en fazla sipariş.

```json
"products": [ { "id": 13, "name": "Tam Yağlı Süt 1 L", "brand": "Sütaş", "price": 46.5, "oldPrice": null, "discountPercent": 0, "unit": "adet", "categoryId": 2, "image": null, "emoji": "🥛", "featured": true, "soldOut": false, "maxQty": 99, "caymaDurumu": "yok_cabuk_bozulan", "caymaLabel": "Yok – çabuk bozulan" } ],
"categories": [ { "id": 1, "name": "Meyve & Sebze", "emoji": "🥦", "image": null, "caymaDurumu": "yok_cabuk_bozulan", "productCount": 12 } ],
"features": { "phoneLookup": false, "marketingConsent": false, "returnRequests": true, "liveUpdates": true, "liveStatus": true }
```

#### Durum (`status`) nesnesi

`GET /api/store` içinde ve `PATCH /api/admin/settings` yanıtında döner. Her istekte o anki Türkiye saatine göre hesaplanır (sayfa açık kaldıkça ara ara yeniden çekin).

| Alan | Tür | Anlamı |
|---|---|---|
| `isOpen` | bool | Çalışma saatleri içinde mi |
| `acceptingOrders` | bool | **Şu an sipariş verilebilir mi** (sipariş düğmesi bunu esas alır) |
| `preorder` | bool | Kapalı ama ön sipariş açık → sipariş verilebilir, "ön sipariş" olarak işaretlenir |
| `paused` | bool | Panelden "sipariş almıyoruz" tuşu basılı (`ordering.enabled=false`). Ön sipariş açık olsa da sipariş alınmaz |
| `state` | `"acik"` \| `"kapali"` \| `"durduruldu"` | Rozet rengi için |
| `label` | metin | Rozet metni: `"Açık · 02:00'ye kadar"`, `"Kapalı · 14:00'te açılır"`, `"Kapalı · Yarın 14:00'te açılır"`, `"Kapalı · Cuma 14:00'te açılır"`, `"Açık · 7/24"`, `"Kapalı"`, durdurulmuşsa `"Sipariş alımı durduruldu"` |
| `hoursLabel` | metin | Durdurma olsa da saat bilgisini veren rozet metni |
| `message` | metin | Uzun açıklama (kapalıyken/durdurulmuşken sipariş düğmesi yerine gösterilir). Durdurulmuşsa `ordering.pausedMessage` |
| `closesAt` / `closesAtIso` | `"02:00"` / ISO \| null | Açıkken kapanış |
| `opensAt` / `opensAtIso` | `"14:00"` / ISO \| null | Kapalıyken bir sonraki açılış |
| `opensDay` | `"bugün"` \| `"yarın"` \| gün adı \| null | Açılış günü |
| `alwaysOpen` | bool | 7/24 açık |
| `serverTime` | ISO | Sunucu saati |
| `timezone` | metin | Hep `"Europe/Istanbul"` (`STORE_TZ`) — saatleri bu dilimde çizin |
| `today` | nesne | **İş günü mantığıyla bugün**: gece yarısından sonra dünkü vardiya sürüyorsa o vardiya. `{ date, dayIndex (0=Pzt), dayName, open, close, closed, allDay, overnight (kapanış ertesi gün), startIso, endIso (vardiyanın gerçek anları; kapalı günde null), phase }` |
| `today.phase` | `"once"` | `"acik"` | `"sonra"` | `"kapali-gun"` | Vardiyaya göre şu an (açılmadı / açık / bitti / bugün kapalı) |
| `week[7]` | dizi | Haftanın 7 günü (0 = Pazartesi): `{ dayIndex, dayName, open, close, closed, allDay, overnight, isToday }` — açılır listede gösterin |
| `nextOpenIso` | ISO \| null | Bir sonraki açılış anı (açıkken: şimdiki aralık bittikten sonraki ilk açılış) |
| `nextCloseIso` | ISO \| null | Bir sonraki kapanış anı (açıkken bu vardiyanın kapanışı) |
| `minutesUntilClose` | sayı \| null | Açıkken kapanışa kalan dakika ("kapanışa 1 sa 20 dk") |
| `minutesUntilOpen` | sayı \| null | Kapalıyken açılışa kalan dakika ("açılışa 3 sa") |

Saat göstergesi: çubuğun başında `today.open`, sonunda `today.close` yazar; dolu kısım `today.startIso` → `today.endIso`; "şimdi" işareti `serverTime` (istemci saatine güvenmeyin, farkı `serverTime` ile düzeltin). Panelde saat değişince bir sonraki `GET /api/store` yanıtı yeni saatleri taşır (önbellek yok); panel akışına da `durum` olayı gider.

Örnek (çalışan sunucudan, saatler 10:00–02:00, Salı 13:03):

```json
{
  "isOpen": true, "acceptingOrders": true, "preorder": false, "paused": false, "state": "acik",
  "label": "Açık · 02:00'ye kadar", "hoursLabel": "Açık · 02:00'ye kadar", "message": "Siparişleriniz hemen hazırlanır.",
  "alwaysOpen": false, "closesAt": "02:00", "closesAtIso": "2026-11-17T23:00:00.000Z", "opensAt": null, "opensAtIso": null, "opensDay": null,
  "serverTime": "2026-11-17T10:03:12.527Z",
  "timezone": "Europe/Istanbul",
  "today": { "date": "2026-11-17", "dayIndex": 1, "dayName": "Salı", "open": "10:00", "close": "02:00", "closed": false, "allDay": false, "overnight": true,
             "startIso": "2026-11-17T07:00:00.000Z", "endIso": "2026-11-17T23:00:00.000Z", "phase": "acik" },
  "week": [ { "dayIndex": 0, "dayName": "Pazartesi", "open": "10:00", "close": "02:00", "closed": false, "allDay": false, "overnight": true, "isToday": false }, "… 7 gün" ],
  "nextOpenIso": "2026-11-18T07:00:00.000Z", "nextCloseIso": "2026-11-17T23:00:00.000Z",
  "minutesUntilClose": 777, "minutesUntilOpen": null
}
```

Salı 01:00'de (Pazartesi 14:00–02:00 vardiyası sürerken) `today.dayName` = "Pazartesi", `today.date` = Pazartesi'nin tarihi; 03:00'te vardiya bitmiştir, `today` Salı olur (`phase: "once"`).

Kapalı saatte örnek (`10:00`):

```json
{
  "isOpen": false, "acceptingOrders": false, "preorder": false, "paused": false, "state": "kapali",
  "label": "Kapalı · 14:00'te açılır", "hoursLabel": "Kapalı · 14:00'te açılır",
  "message": "Şu an kapalıyız. Online sipariş bugün 14:00'te yeniden açılır.",
  "alwaysOpen": false, "closesAt": null, "closesAtIso": null,
  "opensAt": "14:00", "opensAtIso": "2026-11-17T11:00:00.000Z", "opensDay": "bugün",
  "serverTime": "2026-11-17T07:00:00.000Z"
}
```

Durdurulmuşken: `"state": "durduruldu"`, `"label": "Sipariş alımı durduruldu"`, `"isOpen": true`, `"acceptingOrders": false`, `"message": "<pausedMessage>"`.

Saat kuralı: `days[i].close <= days[i].open` ise kapanış ertesi güne sarkar (14:00–02:00 → Pazartesi 14:00'ten Salı 02:00'ye). `open === close` ise o gün 24 saat açık. Kapanış anı dahil değildir (02:00'de kapalı).

### `GET /api/categories`, `GET /api/products` — Herkes

Eski uç noktalar. `/api/store` içindeki `categories` ve `products` dizilerinin aynısını döner.

### `POST /api/cart/quote` — Herkes

Sepet tutarlarını sunucu hesaplar. **Hata kodu döndürmez** (geçersiz JSON hariç); sorunları alanlarda bildirir. İstemcinin gönderdiği fiyat yok sayılır.

İstek:

```json
{ "items": [ { "productId": 13, "qty": 8 } ], "type": "teslimat", "zoneId": 1, "couponCode": "hosgeldin", "phone": "05321234567" }
```

| Alan | Zorunlu | Not |
|---|---|---|
| `items[]` | evet | `{ productId, qty }`; aynı ürün iki kez gelirse adetler toplanır |
| `type` | hayır | `"teslimat"` (varsayılan) ya da `"gelal"` |
| `zoneId` | eve teslimde | `/api/store` `zones[].id` |
| `couponCode` | hayır | Büyük/küçük harf ve Türkçe karakter duyarsız (`hosgeldin` = `HOSGELDIN`) |
| `phone` | hayır | Verilirse kuponun telefon başına sınırı da denetlenir |

Yanıt (kupon geçerli):

```json
{
  "type": "teslimat",
  "items": [
    { "productId": 13, "name": "Tam Yağlı Süt 1 L", "brand": "Sütaş", "unit": "adet", "price": 46.5, "oldPrice": null, "qty": 8, "lineTotal": 372, "image": null, "emoji": "🥛", "maxQty": 99 }
  ],
  "removed": [],
  "adjusted": [],
  "zone": { "id": 1, "name": "Şükrüpaşa", "slug": "sukrupasa" },
  "subtotal": 372,
  "discount": 50,
  "coupon": { "code": "HOSGELDIN", "type": "tutar", "value": 50, "valid": true, "message": "HOSGELDIN uygulandı: 50 ₺ indirim." },
  "deliveryFee": 20,
  "baseDeliveryFee": 20,
  "freeDelivery": false,
  "freeDeliveryOver": 500,
  "freeDeliveryRemaining": 128,
  "minOrder": 200,
  "minOrderRemaining": 0,
  "total": 342,
  "etaMinutes": 20,
  "preorder": false,
  "canOrder": true,
  "errors": [],
  "warnings": []
}
```

Yanıt (sorunlu sepet — olmayan ürün, pasif kupon; ara toplam eşiği aştığı için teslimat ücretsiz):

```json
{
  "type": "teslimat",
  "items": [
    { "productId": 13, "name": "Tam Yağlı Süt 1 L", "brand": "Sütaş", "unit": "adet", "price": 46.5, "oldPrice": null, "qty": 2, "lineTotal": 93, "image": null, "emoji": "🥛", "maxQty": 99 },
    { "productId": 5, "name": "Muz (İthal)", "brand": "", "unit": "kg", "price": 79.9, "oldPrice": 89.9, "qty": 30, "lineTotal": 2397, "image": null, "emoji": "🍌", "maxQty": 99 }
  ],
  "removed": [ { "productId": 999, "name": null, "code": "SATISTA_DEGIL", "reason": "Ürün artık satışta değil." } ],
  "adjusted": [],
  "zone": { "id": 1, "name": "Şükrüpaşa", "slug": "sukrupasa" },
  "subtotal": 2490,
  "discount": 0,
  "coupon": { "code": "HOSGELDIN", "valid": false, "message": "Kupon kodu geçersiz." },
  "deliveryFee": 0,
  "baseDeliveryFee": 20,
  "freeDelivery": true,
  "freeDeliveryOver": 500,
  "freeDeliveryRemaining": null,
  "minOrder": 200,
  "minOrderRemaining": 0,
  "total": 2490,
  "etaMinutes": 20,
  "preorder": false,
  "canOrder": true,
  "errors": [],
  "warnings": [ "Ürün artık satışta değil.", "Kupon kodu geçersiz." ]
}
```

Alanlar:

| Alan | Anlamı |
|---|---|
| `items[]` | Sipariş edilebilecek kalemler (adetler gerekirse düşürülmüş). Sepeti buna göre güncelleyin |
| `removed[]` | Çıkarılan kalemler: `code` = `TUKENDI` \| `SATISTA_DEGIL` \| `GECERSIZ_ADET`, `reason` gösterilebilir |
| `adjusted[]` | Adedi düşürülenler: `{ productId, name, requested, qty, code: "ADET_SINIRI", reason }` (ör. `"\"X\" için stokta 2 adet var."`, `"\"X\" için tek siparişte en fazla 3 adet alınabilir."`) |
| `subtotal` | Kalemler toplamı |
| `discount` | Kupon indirimi (yüzde/tutar; ara toplamı geçmez) |
| `coupon` | `null` (kod yok) ya da `{ code, valid:false, message }` ya da `{ code, type, value, valid:true, message }` |
| `deliveryFee` | Uygulanan teslimat ücreti. Gel-al'da 0. Bölge ücreti yoksa genel ücret. `subtotal >= freeDeliveryOver` ya da `ucretsizTeslimat` kuponu → 0 |
| `baseDeliveryFee` | İndirimsiz teslimat ücreti |
| `freeDelivery` | Ücret normalde > 0 iken ücretsiz olduysa true |
| `freeDeliveryRemaining` | "Ücretsiz teslimata X ₺ kaldı" için; eşik yoksa ya da ücret zaten 0 ise `null` |
| `minOrder` / `minOrderRemaining` | Minimum tutar (yalnızca eve teslim; gel-al'da 0) ve **ara toplama** göre eksik |
| `total` | `subtotal - discount + deliveryFee` |
| `etaMinutes` | Bölgenin (yoksa genel) tahmini süresi |
| `preorder` | Şu an kapalı + ön sipariş açık |
| `errors[]` | Siparişi engelleyen sorunlar `{ code, message }`: `BOS_SEPET`, `COK_KALEM`, `BOLGE_SECIN`, `BOLGE_GECERSIZ`, `GELAL_KAPALI`, `MIN_TUTAR`, `KAPALI`, `DURDURULDU` |
| `canOrder` | `errors` boşsa true. Kupon geçersizliği `errors`'a girmez ama siparişte kod gönderilirse sipariş reddedilir — geçersiz kuponu sepetten kaldırın |
| `warnings[]` | `removed`, `adjusted` ve geçersiz kupon mesajlarının düz listesi |

Not: Bölge seçilmeden yapılan teklifte `BOLGE_SECIN` hatası her zaman bulunur; sepet ekranında bunu yok sayıp yalnızca sipariş formunda gösterebilirsiniz.

**2. revizyon:** istekte isteğe bağlı `payment` (`"nakit"`|`"kart"`) gönderilirse yanıttaki `paymentNotice` ona göre yazılır. Yeni alanlar:

| Alan | Anlamı |
|---|---|
| `items[].caymaDurumu`, `items[].caymaLabel` | Kalemin cayma durumu (özet kutusunda her satırda gösterin) |
| `items[].weighed`, `hasWeighed` | Tartılı (kg) ürün var mı → `checkout.weighedNotice` cümlesini gösterin |
| `paymentNotice` | **Düğmenin hemen üstünde** gösterilecek hazır cümle (MSY m.8/1), ör. "«Siparişi onayla» düğmesine bastığınızda siparişiniz kesinleşir ve teslimatta ₺232,50 tutarını (tartılı ürünlerde kesin tutarı) ödeme yükümlülüğü altına girersiniz. Ödeme kapıda nakit ile yapılır." |

### `POST /api/orders` — Herkes

İstek:

```json
{
  "type": "teslimat",
  "name": "Ayşe Yılmaz",
  "phone": "0532 123 45 67",
  "address": "Şükrüpaşa Mah. Deneme Sok. No:5 D:3",
  "zoneId": 1,
  "payment": "nakit",
  "changeFor": 500,
  "note": "Zile basmayın, bebek uyuyor",
  "substitution": "benzer",
  "couponCode": "HOSGELDIN",
  "consents": ["onBilgilendirme", "mesafeliSozlesme", "kvkkAydinlatma"],
  "docVersions": { "onBilgilendirme": "a9d0865e…", "mesafeliSatis": "d7089667…", "kvkk": "aa55f911…" },
  "website": "",
  "items": [ { "productId": 13, "qty": 8 } ]
}
```

| Alan | Zorunlu | Not |
|---|---|---|
| `type` | hayır | `"teslimat"` (varsayılan) \| `"gelal"` |
| `name`, `phone` | evet | Bkz. doğrulama kuralları |
| `address` | eve teslimde | Gel-al'da boş bırakılabilir (doluysa doğrulanır) |
| `zoneId` | eve teslimde | Aktif bölge |
| `payment` | hayır | `"nakit"` (varsayılan) \| `"kart"`; ayarlarda kapalı olan reddedilir |
| `changeFor` | hayır | Yalnızca nakitte; "kaç TL'lik banknotla ödeyeceğim". Toplamdan küçükse 400. Kartta yok sayılır |
| `note` | hayır | En fazla 300 karakter |
| `substitution` | hayır | Ürün yoksa: `"ara"` (varsayılan, beni arayın) \| `"benzer"` (benzeriyle değiştirin) \| `"cikar"` (siparişten çıkarın) |
| `couponCode` | hayır | Geçersizse **400 `KUPON`** (sessizce düşürülmez) |
| `consents` | evet | İşaretlenen onay kutularının anahtarları: dizi (`["onBilgilendirme", …]`) ya da nesne (`{ "onBilgilendirme": true, … }`). `GET /api/store` → `legal.consents` içindeki **tüm `required: true` anahtarlar** bulunmalı; yoksa `400 ONAY` + `missing`. Eski `kvkk: true` alanı **kabul edilmez**. Gösterilmeyen (pasif ya da pazarlama kapalıyken pazarlama) onay gönderilse de kaydedilmez |
| `docVersions` | önerilir | Formu çizerken kullandığınız `legal.docs[].version` değerleri `{ anahtar: sürüm }`. Metin bu arada panelden değiştiyse `409 METIN_DEGISTI` (müşteri eski metni onaylamış sayılmasın) |
| `website` | — | **Gizli alan (honeypot).** Formda görünmez bir `<input name="website" tabindex="-1" autocomplete="off">` olarak bulunur ve boş gönderilir. Doluysa sunucu sipariş oluşturmadan `201 {"id":0,…}` döner |
| `items[]` | evet | `{ productId, qty }` |

Denetim sırası: honeypot → hız sınırı → mağaza durumu (`KAPALI`/`DURDURULDU`; ön sipariş açıksa kapalı saatte kabul) → gel-al açık mı → ad/telefon/adres → ödeme → not → onaylar (`400 ONAY`, `409 METIN_DEGISTI`) → boş sepet (`400 BOS_SEPET`) → ürünler (`409 TUKENDI`/`SATISTA_DEGIL`/`ADET_SINIRI`, `400 GECERSIZ_ADET`) → bölge/minimum (`400`) → kupon (`400 KUPON`) → para üstü → **telefona bağlı denetimler en sonda:** engelli telefon (`403 ENGELLI`) → telefon başına aktif ("Yeni", "Hazırlanıyor", "Yolda") sipariş sınırı (`429 AKTIF_SINIR`) → kuponun telefon başına sınırı (`400 KUPON`, "Bu kuponu kullanım hakkınız doldu."). Böylece eksik/geçersiz bir istekle başkasının numarasının engelli olup olmadığı, aktif sipariş sayısı ya da kuponu kullanıp kullanmadığı öğrenilemez. `POST /api/cart/quote` ve belge önizlemesi telefona bağlı hiçbir denetim yapmaz (yanıt telefona göre değişmez).

Ürün/bölge/minimum/kupon hatalarının yanıtında güncel teklif de bulunur: `{ "error", "code", "quote": { …/api/cart/quote yanıtı… } }`. 409 alınca sepeti `quote.items` ile yenileyin.

Başarılı yanıt `201`:

```json
{
  "id": 1,
  "token": "d95a56fd864e9aa52330756d",
  "total": 342,
  "status": "Yeni",
  "order": {
    "id": 1,
    "token": "d95a56fd864e9aa52330756d",
    "createdAt": "2026-11-16T18:00:00.000Z",
    "updatedAt": "2026-11-16T18:00:00.000Z",
    "status": "Yeni",
    "statusLabel": "Alındı",
    "history": [ { "status": "Yeni", "at": "2026-11-16T18:00:00.000Z" } ],
    "type": "teslimat",
    "payment": "nakit",
    "changeFor": 500,
    "preorder": false,
    "items": [ { "productId": 13, "name": "Tam Yağlı Süt 1 L", "unit": "adet", "price": 46.5, "qty": 8 } ],
    "subtotal": 372,
    "discount": 50,
    "couponCode": "HOSGELDIN",
    "deliveryFee": 20,
    "total": 342,
    "customer": { "name": "Ayşe Yılmaz", "zoneName": "Şükrüpaşa" },
    "note": "Zile basmayın, bebek uyuyor",
    "substitution": "benzer",
    "cancelNote": "",
    "cancelledBy": null,
    "canCancel": true,
    "etaMinutes": 20
  }
}
```

Yanıtta ayrıca `trackPath` (`"/?siparis=1&t=28c683a6dc58e577f31a9e61"`) — paylaşılabilir gizli takip bağlantısı (§2.6); `order.items[].caymaDurumu` (o anki cayma durumu siparişe kopyalanır), `order.hasDocuments` (onay kaydı var → §2.8), `order.anonymized`.

`id` + `token` cihazda saklanır (takip için). Örnek hatalar:

```json
{ "error": "Minimum sipariş tutarı 200 ₺. Sepetinize 153,5 ₺ daha ekleyin.", "code": "MIN_TUTAR", "quote": { "…": "…" } }
{ "error": "Şu an kapalıyız. Online sipariş bugün 14:00'te yeniden açılır.", "code": "KAPALI" }
{ "error": "\"Domates\" tükendi. Sepetinizden çıkarıldı, lütfen tekrar kontrol edin.", "code": "TUKENDI", "quote": { "…": "…" } }
{ "error": "Bu telefon numarasıyla online sipariş verilemiyor. Lütfen marketi arayın.", "code": "ENGELLI" }
{ "error": "Devam etmek için şu onayları verin: Ön Bilgilendirme Formu'nu okudum; … Mesafeli Satış Sözleşmesi'ni … Kişisel verilerimin işlenmesine ilişkin KVKK Aydınlatma Metni'ni okudum ve anladım.", "code": "ONAY", "missing": ["onBilgilendirme", "mesafeliSozlesme", "kvkkAydinlatma"] }
{ "error": "Yasal metinler siz sayfadayken güncellendi. Lütfen sayfayı yenileyip onayları tekrar verin.", "code": "METIN_DEGISTI", "stale": ["mesafeliSatis"], "docs": [ { "key": "mesafeliSatis", "version": "…" } ] }
```

Sipariş alınınca stok (takip ediliyorsa) düşer, kupon kullanım sayısı artar, onay kaydı yazılır (§2.8), panel akışına `siparis.yeni` gider, Telegram ayarlıysa **kişisel verisiz** bildirim gider (hata siparişi engellemez).

### `GET /api/orders/:id?token=…` ya da `?phone=…` — Herkes

Tek sipariş takibi (yoklama yedek yolu). `token` (bu cihaz ya da paylaşılan takip bağlantısı) ya da telefon. **Telefonla sorgu yalnızca panelde `privacy.phoneLookup` açıkken çalışır (varsayılan kapalı); kapalıyken `404 SORGU_KAPALI`** ("Telefon numarasıyla sipariş sorgulama kapalı. Siparişi verdiğiniz cihazdan ya da takip bağlantısıyla görüntüleyin."). Açıkken: son 10 hane karşılaştırılır (`0532…`, `532…`, `+90 532…`); önce `token` denenir, tutmazsa telefonla eşleştirilir ve bu deneme hız sınırına sayılır. Bu cihazdaki birden çok sipariş için §2.5'teki toplu sorguyu kullanın. Yanıt `Cache-Control: no-store`, ETag yok (304 dönmez). 

- **`token` ile:** yanıt, `POST /api/orders` yanıtındaki `order` nesnesiyle aynı şekildedir (aşağıdaki alanlar). Müşterinin telefonu ve adresi dönmez.
- **`phone` ile (salt okunur, en az veri):** `{ "id", "readOnly": true, "createdAt", "updatedAt", "status", "statusLabel", "history", "type", "itemCount", "total", "cancelNote", "cancelledBy", "etaMinutes" }`. **`token`, `trackPath`, ad, adres, not ve kalemler dönmez**: telefonu ve sipariş numarasını bilen biri siparişi iptal edemez, sözleşmeyi (ad/telefon/adres içerir) açamaz, cayma/iade talebi gönderemez — bunlar yalnızca takip anahtarı sahibine. Arşiv eşiğini (`privacy.archiveDays`) geçmiş ya da anonimleştirilmiş sipariş telefonla bulunmaz (`404`). İstemci bu yanıtı cihazın sipariş listesine eklemez; yalnızca durumu gösterir.

| Alan | Not |
|---|---|
| `status` | `"Yeni"`, `"Hazırlanıyor"`, `"Yolda"`, `"Teslim edildi"`, `"İptal"` (değişmez değerler) |
| `statusLabel` | Gösterilecek metin: `Yeni` → `"Alındı"`; gel-al'da `Yolda` → `"Hazır, teslim alabilirsiniz"`; diğerleri durumun kendisi |
| `history[]` | `{ status, at }` — adım zaman çizelgesi |
| `canCancel` | `status === "Yeni"` |
| `cancelNote` | Market iptal ettiyse müşteriye notu (yalnızca İptal'de dolu) |
| `cancelledBy` | `"musteri"` \| `"market"` \| `null` |
| `etaMinutes` | Bölgenin tahmini süresi (`createdAt` + bu süre = tahmini teslim) |
| `preorder` | Ön sipariş olarak verildi |

Ek alanlar: `trackPath`, `hasDocuments`, `anonymized`, `items[].caymaDurumu`.

Bulunamazsa `404 {"error":"Sipariş bulunamadı.","code":"BULUNAMADI"}` (telefonla sorguda "Sipariş bulunamadı. Numara ve telefonu kontrol edin.").

### `POST /api/orders/:id/cancel` — Herkes

Müşteri iptali; yalnızca `"Yeni"` durumunda. Gövde: `{ "token": "…" }` — **yalnızca token** (telefonla iptal kaldırıldı; `phone` gönderilirse yok sayılır, token yoksa `404`), isteğe bağlı `"reason"` (en fazla 200 karakter, panelde geçmişte görünür).

Yanıt `200`: güncel takip nesnesi (`"status": "İptal"`, `"statusLabel": "İptal"`, `"cancelledBy": "musteri"`, `"canCancel": false`). Stok ve kupon kullanımı geri alınır; Telegram'a bildirim gider.

Hatalar: `404 BULUNAMADI`; `409 IPTAL_EDILMIS` ("Bu sipariş zaten iptal edilmiş."); `409 IPTAL_EDILEMEZ` ("Siparişiniz hazırlanmaya başladığı için buradan iptal edilemiyor. Lütfen marketi arayın.").

### 2.3 Yasal onaylar ve sipariş onayı ekranı (YASAL.md §2)

Belgeler ve onay kutuları **veriyle tanımlıdır** (`settings.legal.docs` / `settings.legal.consents`, panelden düzenlenir); mağaza bunları `GET /api/store` → `legal` alanından okur, sabit kodlamaz. Varsayılan liste YASAL.md §2.2'den:

| Anahtar | Zorunlu | Bağlı belgeler | Not |
|---|---|---|---|
| `onBilgilendirme` (A) | evet | `onBilgilendirme` | Ön bilgileri edindiğini teyit |
| `mesafeliSozlesme` (B) | evet | `mesafeliSatis`, `teslimatKosullari`, `iade`, `kullanim` | Sözleşme + ekleri |
| `kvkkAydinlatma` (C) | evet | `kvkk` | "okudum ve anladım" — onay/rıza değildir |
| `ticariIleti` (D) | hayır | `ticariIleti`, `acikRiza` | Yalnızca `privacy.marketingConsent` açıkken listede gelir (varsayılan kapalı). Zorunlu yapılamaz |

"Bu cihazda hatırla" (E) hukuki onay değildir; yalnızca istemcide tutulur, sunucuya gönderilmez.

```json
"legal": {
  "businessType": "sahis", "companyTitle": "", "taxOffice": "", "taxNo": "", "mersis": "", "kep": "", "chamber": "",
  "docs": [
    { "key": "onBilgilendirme", "title": "Ön Bilgilendirme Formu", "path": "/on-bilgilendirme", "lead": "Siparişinizi onaylamadan önce bilmeniz gerekenler.", "version": "a9d0865e9117062098ccde5220363d1328b624f507bfa28253387a582eaf49d6" },
    { "key": "mesafeliSatis", "title": "Mesafeli Satış Sözleşmesi", "path": "/mesafeli-satis", "lead": "Online siparişlerinize uygulanan satış sözleşmesi.", "version": "d7089667e62a67da64573f59385ae3fc7967da4045bed69dbafb2b147a09857b" },
    "… kvkk, iade, teslimatKosullari, kullanim, cerez, islemRehberi, iletisim"
  ],
  "consents": [
    {
      "key": "onBilgilendirme",
      "label": "[Ön Bilgilendirme Formu](onBilgilendirme)'nu okudum; siparişimle ilgili ön bilgileri (…) edindiğimi teyit ediyorum.",
      "text": "Ön Bilgilendirme Formu'nu okudum; siparişimle ilgili ön bilgileri (…) edindiğimi teyit ediyorum.",
      "labelParts": [
        { "text": "Ön Bilgilendirme Formu", "doc": "onBilgilendirme", "href": "/on-bilgilendirme" },
        { "text": "'nu okudum; siparişimle ilgili ön bilgileri (…) edindiğimi teyit ediyorum." }
      ],
      "required": true, "docs": ["onBilgilendirme"], "order": 1
    },
    "… mesafeliSozlesme, kvkkAydinlatma"
  ]
}
```

- Kutu etiketini `labelParts` ile çizin: `doc`/`href` olan parça belgeye bağlantıdır (siparişi kaybettirmeden yeni sekme/pencere). `text` düz hâli, `label` ham hâli (`[metin](belge)` işaretli).
- Kutular **ayrı ayrı ve işaretsiz** gelir; "tümünü kabul et" yoktur. Zorunlular işaretlenmeden düğme pasif kalır; sunucu da reddeder (`400 ONAY`, `missing`).
- Siparişte `consents` (işaretli anahtarlar) ve formu çizerken kullandığınız sürümler `docVersions` gönderilir (bkz. `POST /api/orders`).

`checkout` (ödeme yükümlülüğü ve özet kutusu metinleri; YASAL.md §2.1–2.3):

```json
"checkout": {
  "buttonLabel": "Siparişi onayla — ödeme yükümlülüğü doğurur",
  "buttonLabelShort": "Ödeme yükümlülüğüyle sipariş ver",
  "paymentNotice": "«Siparişi onayla» düğmesine bastığınızda siparişiniz kesinleşir ve teslimatta {{toplam}} tutarını (tartılı ürünlerde kesin tutarı) ödeme yükümlülüğü altına girersiniz. Ödeme {{odemeSekli}} ile yapılır.",
  "paymentNoticePickup": "«Siparişi onayla» düğmesine bastığınızda siparişiniz kesinleşir ve dükkândan teslim alırken {{toplam}} tutarını (tartılı ürünlerde kesin tutarı) ödeme yükümlülüğü altına girersiniz. Ödeme dükkânda {{odemeSekli}} ile yapılır.",
  "weighedNotice": "Tartılı ürünlerde tutar, teslimde tartılan gerçek miktara göre kesinleşir; fark ±%10'u aşarsa sizi ararız.",
  "noteHint": "Sağlık bilgisi gibi özel bilgiler yazmayın.",
  "seller": { "title": "", "name": "Ulusoy Market" },
  "caymaLabels": { "yok_cabuk_bozulan": "Yok – çabuk bozulan", "acilirsa_yok_hijyen": "Ambalajı açılırsa yok – hijyen", "var": "Var" },
  "previewDocs": ["onBilgilendirme", "mesafeliSatis"]
}
```

Hazır doldurulmuş `paymentNotice` `POST /api/cart/quote` yanıtında da gelir (tercih edin). Özet kutusu (düğmenin hemen üstü): satıcı (`seller`), kalemler + temel nitelikler + **ürün ürün cayma durumu** (`quote.items[].caymaLabel`), KDV dahil toplam, teslimat, ödeme, `paymentNotice`; tartılı ürün varsa `weighedNotice`. Ön Bilgilendirme Formu ve Sözleşme bu sepete göre doldurulmuş olarak §2.8'deki önizleme ucundan alınır.

### 2.5 Cihaza özel "Siparişlerim": toplu sorgu — `POST /api/orders/lookup` — Herkes

Cihazda `[{ id, token }]` listesi saklanır (sipariş verince ve takip bağlantısı açılınca eklenir); "Siparişlerim" yalnızca bu listedeki siparişleri gösterir. Tek istekte en fazla 30 çift. Yalnızca `token` ile çalışır (telefon yok).

```json
// İstek
{ "orders": [ { "id": 1, "token": "28c683a6dc58e577f31a9e61" }, { "id": 999, "token": "x" } ] }
// Yanıt 200
{ "orders": [ { "id": 1, "token": "28c683a6dc58e577f31a9e61", "status": "Yeni", "statusLabel": "Alındı", "trackPath": "/?siparis=1&t=28c683a6dc58e577f31a9e61", "…": "GET /api/orders/:id ile aynı nesne" } ],
  "missing": [999],
  "serverTime": "2026-11-17T10:03:12.600Z" }
```

- `orders` en yeni üstte. `missing`: bulunamayan **ya da token'ı tutmayan** kimlikler (ikisi ayırt edilmez) → cihaz listesinden silinebilir (silinmiş/eski veri).
- Aynı kimlik iki kez gelirse ilki kullanılır. `orders` dizi değilse, boşsa ya da 30'dan fazlaysa `400 DOGRULAMA`. Hız sınırı: 10 dakikada 300.
- Yanıt `Cache-Control: no-store`.

### 2.6 Paylaşılabilir gizli takip bağlantısı

`POST /api/orders` yanıtındaki ve her takip nesnesindeki `trackPath` (`/?siparis=<id>&t=<token>`) — onay ekranında kopyala/paylaş (Web Share API) için `location.origin + trackPath`. Bağlantıyı açan cihaz `siparis` ve `t` parametrelerini okuyup siparişi kendi listesine eklemeli, sonra adresi `history.replaceState` ile temizlemeli (token adres çubuğunda/geçmişte kalmasın). Sunucu bu adres için `no-store`, `noindex` ve `Referrer-Policy: no-referrer` döner. Token 96 bit rastgeledir; eski siparişlerin token'ları yükseltmede korunur. Panel sipariş nesnesinde de `trackPath` vardır (telefonla gelen siparişe bağlantı vermek için). **Arşivlenmiş siparişin personele giden maskeli kopyasında `token` boş ve `trackPath: null` döner** (bağlantıyla açılan takip/sözleşme sayfası ad, telefon ve adres gösterdiği için).

### 2.7 Canlı takip (SSE) — müşteri

Durum değişiklikleri anında gelir. `EventSource` özel başlık gönderemediği ve token'ın URL'ye girmesi istenmediği için **iki adım**:

1. `POST /api/orders/stream-ticket` — gövde `{ "orders": [ { "id", "token" }, … ] }` (en fazla 30) → `201`:
   ```json
   { "ticket": "8hhtQ0daDQ3ZVheUzA49pBU956PzvNyG", "expiresAt": "2026-11-17T10:04:12.578Z", "ttlSeconds": 60, "orders": [1], "missing": [] }
   ```
   Hiçbir çift tutmazsa `404 BULUNAMADI`. Hız sınırı 10 dakikada 120 (`429`).
2. `new EventSource("/api/orders/stream?ticket=" + ticket)` — isteğe bağlı `&lastEventId=<son olay id'si>`.

Bilet **tek kullanımlık**, **60 saniye** geçerli ve **aynı IP'ye** bağlıdır. Akış yalnızca bilette doğrulanmış siparişlerin olaylarını taşır (başka siparişin olayı asla gelmez).

Yanıt başlıkları: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-store, no-transform`, `X-Accel-Buffering: no`, `Connection: keep-alive`; gzip uygulanmaz.

Olaylar (gerçek akıştan):

```
retry: 5000
: bağlandı

event: hello
data: {"boot":"c67ec88d6242","lastId":4,"serverTime":"2026-11-17T10:03:12.581Z","orders":[{"id":1,"status":"Yeni","statusLabel":"Alındı","history":[…],"items":[…],"total":232.5,"canCancel":true,"hasDocuments":true,"…":"takip nesnesi, token ve trackPath hariç"}]}

id: 6
event: siparis
data: {"id":1,"updatedAt":"2026-11-17T10:03:12.881Z","status":"Hazırlanıyor","statusLabel":"Hazırlanıyor","history":[…],"canCancel":false,"…":"…"}

: ping 1763374015000
```

| Olay | `id` | Veri | Ne yapılır |
|---|---|---|---|
| `hello` | yok | `{ boot, lastId, serverTime, orders: [güncel takip nesneleri], status: {durum nesnesi} }` | Bağlanınca hemen güncel durum; ekranı bununla tazeleyin. `boot` değiştiyse sunucu yeniden başlamıştır (olay numaraları sıfırlanmıştır) |
| `siparis` | var | Takip nesnesi (`GET /api/orders/:id` ile aynı; `token`, `trackPath` yok) | Siparişi güncelleyin (durum, iptal notu, kalem düzenlemesi, cayma talebi…) |
| `siparis.silindi` | var | `{ id }` | Sipariş panelden silindi → listeden çıkarın |
| `durum` | var | `{ status }` (`/api/store` `status` alanıyla aynı, herkese açık) | Panelde saat / sipariş alımı / duyuru / bölge değişti → `GET /api/store`'u yeniden çekin (çok sayıda sayfa aynı anda çekmesin diye 0–1,2 sn rastgele bekleme önerilir) |
| `yenile` | yok | `{ reason }` | Veri yedekten geri yüklendi; akış kapanır → yeni biletle bağlanın ve listeyi yeniden çekin |
| `kapanis` | yok | `{ reason }` | Sunucu kapanıyor; akış kapanır → birkaç saniye sonra yeni biletle bağlanın |
| (yorum) `: ping …` | — | — | 25 sn'de bir kalp atışı (vekiller bağlantıyı kesmesin) |

**İstemci kuralları (önemli):**
- Bilet tek kullanımlık olduğu için `EventSource`'un kendi yeniden bağlanması **çalışmaz** (aynı biletle `403 BILET_GECERSIZ` alır ve `readyState === CLOSED` olur). `error` olayında `es.readyState === EventSource.CLOSED` ise kapatın, **yeni bilet alıp** yeniden bağlanın (`lastEventId` ile; 2 sn, 5 sn, 15 sn, 30 sn gibi artan bekleme).
- **Yoklama yedek yolu her zaman dursun:** akış açık değilken (bağlanamadı, `429 AKIS_SINIRI`, `503`, çevrimdışı, sekme gizli) 15–20 sn'de bir `POST /api/orders/lookup` ile çekin; sayfa görünür olunca ve `online` olayında hemen bir kez çekin ve yeniden bağlanın.
- Sekme gizlenince akışı kapatmak serbesttir (pil); görünür olunca yeni biletle açın.
- Hatalar: `403 BILET_GECERSIZ` (biletsiz/uydurma/kullanılmış/başka IP), `410 BILET_SURESI_DOLDU`, `429 AKIS_SINIRI` (IP başına 8 — IPv6'da /64 öneki başına —, müşteri + kimliksiz akışlar toplamı 300; panel akışları bu havuzdan sayılmaz).
- Sunucu, yazma tamponu 64 KB'ı aşan (okumayan) istemcinin bağlantısını keser. Olay verisi tek satır JSON'dur (metindeki satır sonları kaçışlanır; olay enjeksiyonu olmaz).
- **Sekme başına tek akış önerilir:** cihazda süren sipariş varsa sipariş akışı (durum olaylarını da taşır), yoksa §2.7a'daki kimliksiz durum akışı. (HTTP/1.1'de tarayıcı alan adı başına ~6 bağlantı açar ve bu sekmeler arasında paylaşılır.)

Örnek:

```js
async function canliTakip(pairs, onOrder) {
  let es, last = 0, wait = 2000, stopped = false;
  async function baglan() {
    const r = await fetch("/api/orders/stream-ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orders: pairs }) });
    if (!r.ok) return setTimeout(baglan, (wait = Math.min(wait * 2, 30000)));
    const { ticket } = await r.json();
    es = new EventSource(`/api/orders/stream?ticket=${ticket}${last ? `&lastEventId=${last}` : ""}`);
    es.addEventListener("hello", (e) => { wait = 2000; JSON.parse(e.data).orders.forEach(onOrder); });
    es.addEventListener("siparis", (e) => { last = Number(e.lastEventId) || last; onOrder(JSON.parse(e.data)); });
    for (const ev of ["yenile", "kapanis"]) es.addEventListener(ev, () => { es.close(); setTimeout(baglan, 3000); });
    es.onerror = () => { if (es.readyState === EventSource.CLOSED && !stopped) setTimeout(baglan, (wait = Math.min(wait * 2, 30000))); };
  }
  baglan();
  return () => { stopped = true; es && es.close(); };
}
```

**"Takip adımları sayfa yenilenmeden güncellenmiyor" incelemesi (sunucu tarafı):** takip yanıtları (`GET /api/orders/:id`, toplu sorgu) `Cache-Control: no-store` ile döner, ETag/`Last-Modified` yoktur, `If-None-Match`/`If-Modified-Since` gönderilse de `304` değil güncel `200` döner (testli). Sunucuda bayat yanıta yol açan bir önbellek bulunmadı; servis çalışanı (sw.js) da yok. Sorun istemcideydi: önceki `app.js` sürümünde (1) takip ekranının ilk isteği başarısız olursa 15 sn'lik yoklama hiç kurulmuyordu (sayfa yenilenene kadar donuk kalıyordu), (2) sekme görünür olunca ve `online` olayında yalnızca şerit ve liste tazeleniyor, açık takip ekranı yeniden çizilmiyordu, (3) `showTrack` beklerken araya giren yeniden çizimde zamanlayıcı sızıntısı oluşabiliyordu. Yeni istemci SSE + yukarıdaki yoklama kurallarıyla bunları gidermeli.

### 2.7a Mağaza durumu akışı (kimliksiz) — `GET /api/store/stream` — Herkes

Siparişi olmayan ziyaretçinin açık sayfası, panelde çalışma saati / sipariş alımı / duyuru / bölge değişince yenilemeden güncellensin diye. Bilet gerekmez; **yalnızca herkese açık mağaza durumu** taşır (sipariş, kişisel veri yok).

```
event: hello
data: {"boot":"…","lastId":12,"serverTime":"…","status":{"isOpen":true,"acceptingOrders":true,"state":"acik","closesAt":"02:00","today":{…},"week":[…],"…":"…"}}

id: 13
event: durum
data: {"status":{"paused":true,"acceptingOrders":false,"state":"durduruldu","…":"…"}}
```

Olaylar: `hello` (güncel `status`), `durum` (değişiklik → `/api/store`'u yeniden çekin), `kapanis`, `yenile`. Sınırlar: hız sınırı 10 dakikada 120 bağlanma (`429 HIZ_SINIRI`, akış biletleriyle ortak), IP başına 8 açık akış (müşteri akışlarıyla ortak), kimliksiz akışlar en fazla 200 (müşteri + kimliksiz toplam 300) → `429 AKIS_SINIRI`; bu durumda 45 sn'lik `/api/store` yoklaması sürer. `features.liveStatus: true` bu ucun var olduğunu söyler.

### 2.8 Siparişin belgeleri ve ön bilgilendirme önizlemesi

**Sipariş vermeden önce — `POST /api/orders/preview-documents` — Herkes.** Gövde sipariş gövdesiyle aynı (items, type, zoneId, couponCode, payment, substitution, name, phone, address, changeFor) + isteğe bağlı `docs: [anahtar]` (varsayılan `["onBilgilendirme", "mesafeliSatis"]`). Sipariş oluşturmaz, doğrulama yapmaz (eksik alanlar `[…]`). Hız sınırı 10 dakikada 300.

```json
{
  "docs": [
    { "key": "onBilgilendirme", "title": "Ön Bilgilendirme Formu", "version": "a9d0865e…", "text": "Bu form, 6502 sayılı …", "html": "<p>Bu form, 6502 sayılı …" },
    { "key": "mesafeliSatis", "title": "Mesafeli Satış Sözleşmesi", "version": "d7089667…", "text": "## Madde 1 – Taraflar\n1.1. **Satıcı:** […] (Ulusoy Market) · …", "html": "<h2>Madde 1 – Taraflar</h2>\n<p>1.1. <strong>Satıcı:</strong>…" }
  ],
  "total": 232.5,
  "paymentNotice": "«Siparişi onayla» düğmesine bastığınızda … Ödeme kapıda nakit ile yapılır.",
  "canOrder": true
}
```

`html` sunucuda kaçışlanmış güvenli HTML'dir (`<p>`, `<h2>`, `<ul><li>`, `<strong>`, `<br>`); `innerHTML` ile gösterilebilir. Sipariş numarası henüz yoksa metinde "[sipariş onaylanınca verilir]" yazar.

**Sipariş verildikten sonra — `POST /api/orders/:id/documents` — Herkes.** Gövde `{ "token": "…" }` (yanlışsa `404`). Siparişin onay kaydı ve onayladığı metinler, **onaylandığı sürümün arşivdeki metniyle** ve sipariş anındaki kalem/tutarlarla doldurulmuş (metin sonradan panelde değişse de aynen kalır):

```json
{
  "orderId": 1,
  "consent": { "at": "2026-11-17T10:03:12.554Z", "accepted": [ { "key": "onBilgilendirme", "label": "Ön Bilgilendirme Formu'nu okudum; …", "required": true, "docs": [ { "key": "onBilgilendirme", "title": "Ön Bilgilendirme Formu", "version": "a9d0865e…" } ] }, "…" ], "declined": [] },
  "documents": [ { "key": "onBilgilendirme", "title": "Ön Bilgilendirme Formu", "version": "a9d0865e…", "archived": true, "text": "…", "html": "…" }, "… mesafeliSatis, teslimatKosullari, iade, kullanim, kvkk" ]
}
```

Müşteriye IP gösterilmez (panel ucu gösterir). Onay kaydı olmayan siparişte (`hasDocuments: false`) `consent: null`, `documents: []`. **Yazdırılabilir sayfa:** `/siparis/<id>/belgeler?t=<token>` (§4) — onay ekranında "Sözleşmeyi görüntüle / yazdır" bağlantısı buraya verilebilir (kalıcı veri saklayıcısı, YASAL.md §2.4).

### 2.9 Cayma / iade talebi — `POST /api/orders/:id/return-request` — Herkes

"Siparişlerim > Cayma/iade talebi" formu (yasal metinler bu formdan söz eder). Gövde:

```json
{ "token": "…", "message": "Sütlerden biri bozuk çıktı.", "items": [ { "productId": 13, "qty": 1 } ] }
```

`message` zorunlu, en fazla 500; `items` isteğe bağlı (siparişte olmayan ürünler atlanır). Kişisel verisi anonimleştirilmiş siparişte `409 ANONIM` (talep marketi arayarak iletilir). Yanıt `201` — ekranda **hemen teyit** olarak gösterin (MSY m.11/2):

```json
{ "ok": true, "request": { "id": 1, "at": "2026-11-17T10:03:15.610Z", "status": "Yeni", "items": [ { "productId": 13, "qty": 1 } ] },
  "message": "Cayma/iade talebiniz 17 Kasım 2026 13:03 itibarıyla bize ulaştı (talep no 2-1)." }
```

Hatalar: `404` (token), `400` (boş metin), `429 TALEP_SINIRI` (siparişte en fazla 5 talep), `429 HIZ_SINIRI`. Talep panelde `returnRequests[]` içinde görünür, panel akışına `siparis.guncellendi` ve (ayarlıysa) Telegram'a kişisel verisiz bildirim gider.

### `GET /healthz` — Herkes

`{"ok":true,"time":"…","uptime":12}` — izleme / Docker sağlık denetimi.

---

## 3. Panel API'si

Tüm uç noktalar `/api/admin/…`. Oturumsuz istek → `401 OTURUM` ("Oturumunuz sona erdi. Lütfen tekrar giriş yapın."). Rol yetmezse → `403 YETKI` ("Bu işlem için yönetici yetkisi gerekiyor.").

**Toplu işlem yanıtı (her listede aynı):**

```json
{ "processed": 1, "skipped": [ { "id": 99, "reason": "Sipariş bulunamadı." } ] }
```

`processed` = işlenen kayıt sayısı; `skipped[]` = atlananlar ve nedenleri (bazılarında `name` de vardır). İstekte `ids` boşsa ya da 5000'den fazlaysa `400`.

### Oturum

| Yöntem | Yol | Yetki | Gövde | Yanıt |
|---|---|---|---|---|
| POST | `/api/admin/login` | Herkes | `{ "username": "admin", "password": "…" }` (`username` verilmezse `admin`; büyük/küçük harf duyarsız) | `200` aşağıda; `401 GIRIS`; `429 HIZ_SINIRI` |
| POST | `/api/admin/logout` | Personel | — | `{ "ok": true }` |
| GET | `/api/admin/me` | Personel | — | `{ "user": {…}, "defaultPassword": false }` |
| POST | `/api/admin/password` | Personel | `{ "currentPassword", "newPassword" }` (en az 8) | `{ "ok": true }`; diğer cihazlardaki oturumlar kapanır. `400` "Mevcut şifre hatalı." / "Şifre en az 8 karakter olmalı." / varsayılan şifre `admin123` seçilemez |

```json
{
  "token": "0e6d684b5353e67ab8b71de5d8be8dc52ddd12f080ec99319a9a35e793e858d5",
  "expiresAt": "2026-12-16T20:22:53.733Z",
  "user": { "id": 1, "username": "admin", "name": "Yönetici", "role": "yonetici", "active": true, "createdAt": "2026-11-16T20:22:53.625Z" },
  "defaultPassword": false
}
```

İlk kurulumda kullanıcı `admin`, şifre `ADMIN_PASSWORD` ortam değişkeni (yoksa `admin123`). `defaultPassword: true` ise hesabın şifresi herkesçe bilinen `admin123`'tür: panel her ekranda kapanmayan bir uyarı gösterir, sunucu da her açılışta günlüğe uyarı yazar. Yeni şifre olarak (kullanıcı ekleme/sıfırlama dahil) `admin123` kabul edilmez.

Giriş hız sınırı (§1): IP + kullanıcı adı başına 15 dakikada 8, IP başına toplam 30, kullanıcı adı başına (IP'den bağımsız) 30 başarısız deneme — sonuncusu aşılınca bu hesaba son 30 günde giriş yapılmış ağlar dışından gelen denemeler `429` alır; yönetici kendi ağından kilitlenmez. Denemeler şifre denetiminden önce sayılır (aynı anda gönderilen istekler sınırı aşamaz); başarılı giriş yalnızca kendi IP + kullanıcı adı sayacını sıfırlar (başka bir hesabın başarılı girişi, bu hesaba yapılan denemeleri silmez). Oturum yalnızca doğrulanan şifre özeti doğrulama bittiğinde hâlâ kullanıcının güncel özetiyse ve kullanıcı aktifse verilir (giriş sürerken şifre değiştirilir/sıfırlanır, kullanıcı pasifleştirilir/silinir ya da yedek geri yüklenirse `401`). Kullanıcı başına en fazla 20 açık oturum tutulur; yeni giriş en eski oturumu kapatır.

### 3.1 Canlı olaylar (SSE) — panel

Yeni sipariş ve sipariş değişiklikleri anında gelir (yoklama `?since=` yedek yol olarak kalır). Bearer belirteci URL'ye konmaz:

1. `POST /api/admin/stream-ticket` — **Personel**, `Authorization: Bearer …` → `201 { "ticket": "eZTKcq8fdhonL3ELdsHuumeslQQEpvIa", "expiresAt": "…", "ttlSeconds": 60 }`. Bilet oturuma ve IP'ye bağlı, tek kullanımlık, 60 sn.
2. `new EventSource("/api/admin/stream?ticket=" + ticket)` (Bearer gerekmez; isteğe bağlı `&lastEventId=`).

| Olay | `id` | Veri |
|---|---|---|
| `hello` | yok | `{ boot, lastId, serverTime, latestId, status: {durum nesnesi} }` |
| `siparis.yeni` | var | Panel sipariş nesnesi (yeni web ya da elle sipariş) — sesli uyarı / bildirim için |
| `siparis.guncellendi` | var | Panel sipariş nesnesi (durum, not, kurye, kalem, müşteri iptali, teyit, cayma talebi…) |
| `siparis.silindi` | var | `{ ids: [..] }` (toplu silme) |
| `durum` | var | `{ status }` — saatler, sipariş alımı, duyuru ya da bölgeler değişti (aynı olay mağaza akışlarına da gider) |
| `yenile` | var/yok | `{ reason }` — toplu değişiklik (anonimleştirme, geri yükleme); listeyi yeniden çekin. Geri yüklemede akış kapanır |
| `oturum` | yok | `{ reason }` — oturum kapandı (çıkış, şifre değişikliği, kullanıcı pasifleştirildi/silindi); akış kapanır → giriş ekranı |
| `kapanis` | yok | Sunucu kapanıyor |

Kalp atışı 25 sn'de bir; her kalp atışında ve olayda oturumun hâlâ geçerli olduğu denetlenir. Müşteri anonimleştirilince ya da sipariş silinince o siparişin kişisel veri taşıyan eski olayları olay tamponundan atılır (`lastEventId` ile geri gönderilmez); geri yüklemede tampon boşaltılır. Arşivlenmiş (bkz. Siparişler) siparişin olayı herkese maskeli gider. Yeniden bağlanma ve yoklama kuralları müşteri akışıyla aynıdır (§2.7): bilet tek kullanımlık olduğundan `CLOSED` olunca yeni bilet alın; bağlantı yokken 12 sn'lik `?since=` yoklaması sürsün. `401 OTURUM` → giriş ekranı.

### 3.2 Güvenlik durumu — `GET /api/admin/security` — Personel

Panelde kalıcı uyarı bandı için. `warnings[].level`: `kritik` (kırmızı), `uyari` (sarı), `bilgi` (gri). `defaultPassword.users` yalnızca yöneticiye döner.

```json
{
  "https": { "ok": true, "requestHttps": false, "local": true, "publicUrl": null, "publicUrlHttps": false, "trustProxy": false, "forced": false, "hsts": false },
  "dataKey": { "enabled": true },
  "defaultPassword": { "inUse": false, "users": [] },
  "legal": { "ok": false, "businessType": "", "missing": [ { "field": "legal.companyTitle", "label": "Ad soyad (ya da unvan)" }, { "field": "legal.taxOffice", "label": "Vergi dairesi" }, { "field": "legal.taxNo", "label": "Vergi / TC kimlik numarası" }, { "field": "store.email", "label": "E-posta (cayma bildirimi ve KVKK başvuruları için)" } ],
             "requiredConsents": ["onBilgilendirme", "mesafeliSozlesme", "kvkkAydinlatma"] },
  "etbis": { "ok": false },
  "telegram": { "enabled": false, "personalData": false },
  "privacy": { "retentionDays": 3650, "archiveDays": 730, "phoneLookup": false, "marketingConsent": false, "lastRetentionRun": "2026-11-17T10:03:12.269Z" },
  "streams": { "total": 0, "musteri": 0, "panel": 0, "durum": 0, "tickets": 0 },
  "warnings": [
    { "code": "PUBLIC_URL_YOK", "level": "uyari", "message": "PUBLIC_URL verilmemiş: sayfa adresleri isteğin Host başlığından üretiliyor, yasal metinlerde site adresi \"[…]\" görünüyor." },
    { "code": "ISLETME_TURU_YOK", "level": "uyari", "message": "İşletme türünü seçin (şahıs işletmesi / şirket). …" },
    { "code": "ISLETME_BILGISI_EKSIK", "level": "uyari", "message": "Canlıya çıkmadan önce işletme bilgilerini doldurun: … Yasal metinlerde \"[…]\" görünüyor. (Şahıs işletmesinde MERSİS ve KEP zorunlu değil; boşsa metinlerden kendiliğinden çıkarılır.)" },
    { "code": "ETBIS_YOK", "level": "uyari", "message": "ETBİS kaydı girilmemiş. Kendi sitesinden satış yapan işletme satışa başlamadan önce e-Devlet üzerinden ETBİS'e kaydolmalı (YASAL.md §4.2.3)." }
  ]
}
```

Uyarı kodları: `HTTPS_YOK` (kritik; site HTTP ile açılıyor, localhost hariç), `VARSAYILAN_SIFRE` (kritik), `YEREL_DINLEME` (uyarı; varsayılan şifre kullanımda olduğu için sunucu yalnızca 127.0.0.1'de dinliyor — yanıtta `listen: { localOnly, forced }`), `VEKIL_AYARI` (PUBLIC_URL https ama TRUST_PROXY yok), `PUBLIC_URL_YOK`, `SIFRESIZ_DEPO` (DATA_KEY yok: "Müşteri verisi sunucuda şifresiz saklanıyor"), `ISLETME_TURU_YOK` (şahıs/şirket seçilmemiş), `ISLETME_BILGISI_EKSIK` (şahısta MERSİS/KEP aranmaz, şirkette aranır), `ETBIS_YOK`, `ONAY_YOK` (zorunlu onay kutusu yok), `TELEFON_SORGU_ACIK` (bilgi), `SAKLAMA_KAPALI` / `SAKLAMA_KISA` (bilgi; 10 yıldan kısa), `TELEGRAM_ACIK` (bilgi; kişisel veri gönderilmediğini söyler), `PAZARLAMA_IZNI_ACIK` (bilgi; İYS hatırlatması).

### 3.3 Denetim kaydı — `GET /api/admin/audit?limit=&before=&user=&action=&section=` — Yönetici

Panelde kim, ne zaman, hangi işlemi yaptı. Her değiştirici panel işlemi (POST/PATCH/PUT/DELETE), veri indiren GET'ler (yedek, CSV, müşteri verisi), giriş ve var olan kullanıcı adıyla hatalı giriş denemesi yazılır. **Kişisel veri yazılmaz** (müşteri adı/telefonu/adresi, not içerikleri, IP yok; telefon içeren adreslerde hedef boş). `DATA_DIR/audit.json` (DATA_KEY varsa şifreli), en yeni üstte; geri yüklemeden etkilenmez. İki bölme: **genel** (son 2000) ve **güvenlik** (son 5000; kayıtta `secure: true`): yedek indirme/geri yükleme, kullanıcı ekleme/düzenleme/silme, şifre değişikliği, ayar değişikliği, silme işlemleri (ürün/kategori/kupon/afiş/SSS/bölge, toplu sipariş/ürün silme), dışa aktarma (CSV, müşteri verisi), anonimleştirme, numara engelleme ve saklama işi. Güvenlik bölmesini yalnızca yönetici işlemleri doldurur; personelin ya da kimliksiz hatalı girişlerin doldurabildiği genel bölme bu kayıtları sildiremez. Hiçbir şeyi değiştirmeyen istek (ör. `processed: 0` toplu işlem, değişiklik içermeyen `PATCH`) yazılmaz; ardışık aynı kayıtlar (10 dakika içinde) birleştirilir ve `count` / `lastAt` alır. Hatalı girişler kullanıcı + kaynak ağ başına saatte tek kayıtta sayılır (`count`; `source`: ağın kısa özeti, IP yazılmaz). `section=guvenlik` yalnızca güvenlik bölmesini döner. `limit` 1–500 (varsayılan 200), `before` = bu `seq`'ten eskiler (sayfalama).

```json
{ "entries": [
    { "seq": 4, "at": "2026-11-17T10:03:12.886Z", "user": "admin", "role": "yonetici", "action": "PATCH /api/admin/orders/:id", "method": "PATCH", "path": "/api/admin/orders/:id",
      "target": "#1", "details": { "fields": ["status"], "from": "Yeni", "to": "Hazırlanıyor" }, "label": "Sipariş güncelledi" },
    { "seq": 3, "at": "2026-11-17T10:03:12.508Z", "user": "admin", "role": "yonetici", "action": "PATCH /api/admin/settings", "method": "PATCH", "path": "/api/admin/settings", "details": { "sections": ["hours"] }, "label": "Ayarları değiştirdi" }
  ],
  "total": 5, "max": 2000, "secure": { "total": 1, "max": 5000 } }
```

Özel `action` değerleri: `giris`, `giris.basarisiz`, `saklama.anonimlestir` (`user: "sistem"`). Gösterim için `label` kullanın.

### 3.4 Sipariş: teyit, cayma/iade talebi, belgeler

**Sipariş teyidi (ikinci kanal, E-ticaret Yön. m.9/1; YASAL.md §2.5)** — `POST /api/admin/orders/:id/confirmation` — Personel. Gövde `{ "channel": "telefon"|"whatsapp"|"sms", "result"?: "ulasildi"|"ulasilamadi" (varsayılan ulasildi), "note"? (≤200) }`. Siparişe `confirmations[]` olarak eklenir (`{ channel, result, at, by }`, son 20), `updatedAt` güncellenir, akışa ve denetim kaydına gider. Yanıt: panel sipariş nesnesi. Panelde sipariş kartına "Teyit araması yapıldı / ulaşılamadı" düğmeleri.

**Cayma/iade talebi işleme** — `PATCH /api/admin/orders/:id/return-requests/:rid` — Personel. `{ "status": "Yeni"|"İnceleniyor"|"Sonuçlandı"|"Reddedildi", "note"? }`. Yanıt: panel sipariş nesnesi.

**Belgeler** — `GET /api/admin/orders/:id/documents` — Personel. §2.8'deki yanıtın aynısı, `consent.ip` dahil. `?format=html` → yazdırılabilir "sipariş sözleşmesi + ön bilgilendirme" HTML dosyası (`siparis-<id>-sozlesme.html`; Bearer gerektiği için `fetch` → `Blob` → `URL.createObjectURL` ile yeni sekmede açın ya da indirin). Arşivlenmiş siparişte personel için kişisel veriler maskelidir.

### 3.5 Yasal belgeler ve onay ayarları — Yönetici

`PATCH /api/admin/settings` ile `{ "legal": { "docs": [...], "consents": [...] } }` gönderilir (liste tamamen değişir; diğer `legal` alanları korunur).

| Alan | Kural |
|---|---|
| `docs[]` | 1–20 belge. `key` harfle başlar, 2–40 harf/rakam/`-`, tekil. `title` zorunlu ≤120. `path` `/küçük-harf-rakam-tire` (boşsa başlıktan), tekil; `/panel`, `/api`, `/teslimat`, `/hakkimizda`, `/siparis`, `/img`… ve `-tekel/-market` ile bitenler yasak. `lead` ≤300. `text` ≤60000 (**boş = varsayılan şablon**, YASAL.md §5). `active` (varsayılan true), `marketing` (true ise yalnızca `privacy.marketingConsent` açıkken yayımlanır). `updatedAt` sunucu tutar (metin değişince) |
| `consents[]` | En fazla 20. `key` tekil; `label` zorunlu ≤500, `[görünen metin](belge-anahtarı)` bağlantı, `{{isletmeAdi}}` doldurulur; `required`; `docs` var olan belge anahtarları (yoksa `400 "… onayı olmayan bir belgeye bağlı"`; onaya bağlı belge silinemez); `order`; `active`; `marketing` (true ise zorunlu yapılamaz) |

Metin ya da metne giren mağaza/yasal bilgi değişince belgenin `version`'ı değişir; eski sürüm `legalArchive`'e alınır (onaylanmış siparişin metni aynen gösterilebilsin). Arşiv sınırsız büyümez: bir siparişin onayladığı sürümler hiç silinmez; hiçbir siparişte onaylanmamış eski sürümlerden en yeni 60 tanesi tutulur (saat/adres her değişince tüm belgelerin sürümü değiştiği için).

`GET /api/admin/legal`:

```json
{
  "docs": [ { "key": "onBilgilendirme", "title": "Ön Bilgilendirme Formu", "path": "/on-bilgilendirme", "lead": "…", "version": "a9d0865e…", "custom": false, "updatedAt": null, "active": true, "marketing": false, "visible": true }, "…" ],
  "consents": [ "… settings.legal.consents …" ],
  "placeholders": { "store": ["unvan", "isletmeAdi", "…"], "order": { "siparisNo": "sipariş numarası", "urunTablosu": "sipariş edilen ürünler, miktar, fiyat ve cayma durumu", "…": "…" } },
  "archive": [ { "version": "a9d0865e…", "key": "onBilgilendirme", "title": "Ön Bilgilendirme Formu", "at": "2026-11-17T10:03:12.554Z", "current": true } ]
}
```

`GET /api/admin/legal/versions/:version` → `{ version, key, title, text, at, replacedAt?, html, orders }` (`orders`: bu sürümü onaylamış sipariş sayısı); yoksa `404`.

### Görsel yükleme

`POST /api/admin/uploads` — **Yönetici** — `{ "image": "data:image/webp;base64,…" }` → `201 { "url": "/uploads/1763316173000-a1b2c3d4.webp" }`.
JPG/PNG/WEBP, en fazla 5 MB, içerik imzası denetlenir (`400 GORSEL`: "Görsel JPG, PNG veya WEBP olmalı." / "Görsel en fazla 5 MB olabilir." / "Görsel dosyası bozuk ya da türü yanlış."). Afiş görselleri için kullanılır (dönen `url` afişin `image` alanına yazılır). Ürün ve kategori formları görseli doğrudan kendi gövdelerinde de gönderebilir.

Kayıtlardan kalkan görsel, başka bir kayıt (ürün/kategori/afiş) kullanmıyorsa diskten silinir.

### Ürünler

Ürün nesnesi (panelde tüm alanlar):

```json
{
  "id": 137, "name": "Organik Süt 1 L", "brand": "Sütaş", "description": "", "price": 59.9, "oldPrice": 64.9,
  "unit": "adet", "categoryId": 2, "image": null, "emoji": "🛒", "barcode": "8690000000999",
  "soldOut": false, "hidden": false, "featured": true, "stock": 12, "maxPerOrder": 4
}
```

- `stock`: `null` = stok takibi yok; sayı ise siparişte düşer, iptalde geri eklenir, 0 olunca mağazada "tükendi" görünür (`soldOut` alanı değişmez; panel "tükendi" rozetini `soldOut || stock === 0` ile göstermeli).
- `oldPrice`: `null` ya da `price`'tan büyük (indirim gösterimi). Fiyat eski fiyatın üstüne çıkarsa eski fiyat otomatik `null` olur.
- `maxPerOrder`: `null` ya da 1–99.
- `caymaDurumu`: `null` (kategoriden) ya da `"yok_cabuk_bozulan"` \| `"acilirsa_yok_hijyen"` \| `"var"` (yalnızca yönetici değiştirir; geçersiz değer `400`).
- `priceHistory[]`: `{ price, at, assumed? }` — her fiyat değişikliği (panel, toplu yüzde, CSV) kayda geçer; 45 günden eski kayıtlar atılır (sonuncusu kalır). Yalnızca panelde döner, müşteriye gitmez.
- **İndirim öncesi fiyat (Fiyat Etiketi Yönetmeliği m.11):** fiyat düşürülür ve istekte `oldPrice` **gönderilmezse**, `oldPrice` otomatik olarak **son 10 gün içinde uygulanan en düşük fiyat** olur (Meyve & Sebze kategorisinde bir önceki fiyat). `oldPrice` elle gönderilir ve bu değerden yüksekse kayıt **reddedilmez**, yanıtta `warnings` döner — panel uyarıyı göstermeli:

```json
// PATCH /api/admin/products/13  {"oldPrice": 49.9}   (fiyat 42,5; son 10 günde en düşük 46,5)
{ "id": 13, "price": 42.5, "oldPrice": 49.9, "priceHistory": [ { "price": 46.5, "at": "2026-11-07T10:03:15.639Z", "assumed": true }, { "price": 42.5, "at": "2026-11-17T10:03:15.639Z" } ],
  "warnings": [ "İndirim öncesi fiyat ₺49,90 girildi; son 10 günde uygulanan en düşük fiyat ₺46,50. Fiyat Etiketi Yönetmeliği m.11'e göre indirim öncesi fiyat olarak ₺46,50 gösterilmeli." ], "…": "…" }
```

  `POST` ve `PATCH /api/admin/products…` yanıtları her zaman `warnings: []` alanını taşır. `assumed: true`: geçmişi olmayan üründe değişiklikten önceki fiyatın zamanı bilinmediği için 10 gün önceye konmuş kayıt.

| Yöntem | Yol | Yetki | Gövde / Not | Yanıt |
|---|---|---|---|---|
| GET | `/api/admin/products` | Personel | — | Tüm ürünler (gizliler dahil), sıralı dizi |
| POST | `/api/admin/products` | Yönetici | Zorunlu: `name` (≤120), `price` (>0), `categoryId`. İsteğe bağlı: `brand`, `description` (≤1000), `oldPrice`, `unit` (varsayılan `adet`), `emoji`, `barcode` (harf/rakam/-, tekil), `soldOut`, `hidden`, `featured`, `stock`, `maxPerOrder`, `image` (data URL, `/uploads/…` yolu ya da `null`) | `201` ürün |
| PATCH | `/api/admin/products/:id` | Personel* | Yalnızca gönderilen alanlar değişir. `image: null` görseli kaldırır | `200` ürün |
| DELETE | `/api/admin/products/:id` | Yönetici | — | `{ "ok": true }` |
| POST | `/api/admin/products/:id/duplicate` | Yönetici | — | `201` kopya: ad sonuna " (kopya)", barkod boş, **gizli**, asıl ürünün hemen arkasında |
| POST | `/api/admin/products/bulk` | Personel* | `{ "ids": [..], "action": "…", "categoryId"?, "percent"?, "caymaDurumu"? }` | Toplu yanıt |
| GET | `/api/admin/products/export` | Yönetici | — | CSV dosyası (aşağıda) |
| POST | `/api/admin/products/import` | Yönetici | `{ "csv": "<dosya metni>", "dryRun": true }` ya da ham `Content-Type: text/csv` gövde + `?dryRun=1` | İçe aktarma sonucu |
| PUT | `/api/admin/order` | Yönetici | Sürükle-bırak sıralama: `{ "categoryIds": [tüm kategori id'leri] }` ya da `{ "categoryId": 4, "productIds": [o kategorideki tüm ürün id'leri] }` | `{ "ok": true }`; eksik/fazla id → `400` "Geçersiz sıralama." |

\* **Personel** `PATCH /api/admin/products/:id` ile yalnızca `soldOut` ve `stock` gönderebilir (başka alan → `403` "Personel yalnızca stok ve tükendi bilgisini değiştirebilir."); toplu işlemde yalnızca `soldOut` ve `available` eylemleri.

Doğrulama hataları (400): "Ürün adı gerekli.", "Geçerli bir fiyat girin.", "Kategori seçin.", "Eski fiyat, satış fiyatından yüksek olmalı (indirim göstermek için).", "Barkod yalnızca harf ve rakam içermeli.", "Stok 0 ile 1000000 arasında tam sayı olmalı."; `409 BARKOD` "Bu barkod başka bir üründe kayıtlı: <ad>".

Toplu eylemler (`action`):

| `action` | Etki |
|---|---|
| `delete` | Sil (görselleri de silinir, başka kayıt kullanmıyorsa) |
| `hide` / `show` | Gizle / göster |
| `soldOut` / `available` | Tükendi / satışta (`available`, stok 0 ise stok takibini kapatır: `stock = null`) |
| `feature` / `unfeature` | Öne çıkar / çıkarma |
| `move` | `categoryId` kategorisine taşı |
| `price` | `percent` kadar fiyat değiştir (−90…500, 0 hariç; `10` = %10 zam, `-15` = %15 indirim), iki ondalığa yuvarlanır |
| `cayma` | `caymaDurumu` değerini yaz: `"yok_cabuk_bozulan"` \| `"acilirsa_yok_hijyen"` \| `"var"` ya da `null` (kategoriden). Geçersiz değer `400`. Yalnızca yönetici |

```json
// POST /api/admin/products/bulk  {"ids":[137,9999],"action":"price","percent":10}
{ "processed": 1, "skipped": [ { "id": 9999, "reason": "Ürün bulunamadı." } ] }
```

#### CSV dışa aktarma

`GET /api/admin/products/export` → `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="urunler-2026-11-16.csv"`. UTF-8 BOM ile başlar, ayraç `;`, satır sonu CRLF, ondalık virgül (`46,5`), mantıksal alanlar `Evet`/`Hayır`. `=`, `+`, `-`, `@` ile başlayan metinlerin başına `'` eklenir (Excel formül koruması). Başlık:

```
ID;Barkod;Ürün adı;Marka;Kategori;Fiyat;Eski fiyat;Birim;Stok;Sipariş başına en fazla;Tükendi;Gizli;Öne çıkan;Açıklama;Emoji;Cayma hakkı
```

`Cayma hakkı`: ürünün kendi değeri etiketle (`Var`, `Yok – çabuk bozulan`, `Ambalajı açılırsa yok – hijyen`); kendi değeri yoksa `Kategoriden (<geçerli değer>)`.

#### CSV içe aktarma

- Ayraç otomatik (`;`, `,` ya da sekme), BOM ve tırnaklı alanlar desteklenir.
- Başlık adları Türkçe karakter/büyük harf duyarsız eşleşir; yukarıdaki başlıklar ve `barkod`, `ad`, `urun`, `fiyat`, `satis fiyati`, `stok`, `reyon` gibi eşanlamlılar tanınır. `ID` sütunu yok sayılır.
- Eşleştirme: önce **barkod**, yoksa **ürün adı** (harf duyarsız). Eşleşen ürün güncellenir; yalnızca dosyada **dolu** olan alanlar değişir (boş hücre = dokunma; `Stok`, `Sipariş başına en fazla` ve `Eski fiyat` hücresi boşsa `null` yapılır). Eşleşme yoksa yeni ürün eklenir (ad, fiyat, kategori zorunlu). Bilinmeyen kategori adı yeni kategori olarak oluşturulur.
- `Cayma hakkı` (`cayma`, `cayma durumu` da tanınır): etiket ya da kod (`var`, `yok_cabuk_bozulan`, `acilirsa_yok_hijyen`); `Kategoriden…` → `null` (kategorininki geçerli); boş = dokunma; anlaşılmayan değer satır hatası.
- **Fiyat kuralları panelle aynıdır:** fiyat değişikliği fiyat geçmişine yazılır; fiyat düşer ve `Eski fiyat` sütunu yoksa indirim öncesi fiyat son 10 günün en düşüğünden konur; elle girilen eski fiyat bundan yüksekse satır alınır ama `warnings[]`'e `{ row, name, message }` eklenir.
- Hatalı satırlar atlanır, diğerleri işlenir. `dryRun: true` ise hiçbir şey kaydedilmez, aynı rapor (uyarılar dahil) döner.

```json
{ "added": 1, "updated": 1, "unchanged": 0, "createdCategories": [],
  "warnings": [ { "row": 2, "name": "Tam Yağlı Süt 1 L", "message": "İndirim öncesi fiyat ₺60,00 girildi; son 10 günde uygulanan en düşük fiyat ₺46,50. …" } ],
  "errors": [ { "row": 3, "message": "Yeni ürün için fiyat gerekli." } ], "dryRun": true }
```

`row` = dosyadaki satır numarası (başlık 1. satır).

### Kategoriler

Kategori: `{ "id", "name", "emoji", "image", "hidden", "caymaDurumu", "productCount" }` (`productCount` yalnızca yanıtta). `caymaDurumu` yeni kategoride addan türetilir (Meyve/Süt/Şarküteri/Fırın/Dondurma… → `yok_cabuk_bozulan`; Kişisel Bakım/Bebek → `acilirsa_yok_hijyen`; diğerleri `var`), `PATCH` ile değiştirilir; mevcut veride yükseltmede aynı kuralla doldurulur.

| Yöntem | Yol | Yetki | Gövde | Yanıt / Hata |
|---|---|---|---|---|
| GET | `/api/admin/categories` | Personel | — | Dizi (gizliler dahil, sıralı) |
| POST | `/api/admin/categories` | Yönetici | `name` (zorunlu, ≤60, tekil), `emoji`, `hidden`, `image` (data URL / yol / null) | `201`; `409 AYNI_AD` "Bu adla bir kategori zaten var." |
| PATCH | `/api/admin/categories/:id` | Yönetici | Aynı alanlar, kısmi | `200` |
| DELETE | `/api/admin/categories/:id` | Yönetici | — | `{ "ok": true }`; `409 DOLU_KATEGORI` "Bu kategoride 12 ürün var. Önce ürünleri silin veya başka kategoriye taşıyın." |
| POST | `/api/admin/categories/bulk-delete` | Yönetici | `{ "ids": [..] }` | Toplu yanıt; dolu olanlar atlanır |

```json
{ "processed": 0, "skipped": [ { "id": 1, "name": "Meyve & Sebze", "reason": "Bu kategoride 12 ürün var." }, { "id": 999, "reason": "Kategori bulunamadı." } ] }
```

Gizli kategori ve içindeki tüm ürünler mağazada görünmez.

### Siparişler

Panel sipariş nesnesi (iç alan `stockHeld` hariç her şey):

```json
{
  "id": 1,
  "token": "d95a56fd864e9aa52330756d",
  "createdAt": "2026-11-16T18:00:00.000Z",
  "updatedAt": "2026-11-16T18:00:00.000Z",
  "source": "web",
  "type": "teslimat",
  "payment": "nakit",
  "changeFor": 500,
  "customer": { "name": "Ayşe Yılmaz", "phone": "05321234567", "address": "Şükrüpaşa Mah. Deneme Sok. No:5 D:3", "zoneId": 1, "zoneName": "Şükrüpaşa" },
  "note": "Zile basmayın, bebek uyuyor",
  "substitution": "benzer",
  "items": [ { "productId": 13, "name": "Tam Yağlı Süt 1 L", "unit": "adet", "price": 46.5, "qty": 8 } ],
  "subtotal": 372,
  "discount": 50,
  "couponCode": "HOSGELDIN",
  "deliveryFee": 20,
  "total": 342,
  "status": "Hazırlanıyor",
  "history": [
    { "status": "Yeni", "at": "2026-11-16T18:00:00.000Z" },
    { "status": "Hazırlanıyor", "at": "2026-11-16T18:00:00.000Z", "by": "admin" }
  ],
  "cancelNote": "",
  "cancelledBy": null,
  "adminNote": "Kapıcıya bırakılabilir",
  "courier": "Murat",
  "preorder": false,
  "consentAt": "2026-11-16T18:00:00.000Z",
  "consent": { "at": "2026-11-16T18:00:00.000Z", "ip": "127.0.0.1", "accepted": [ { "key": "onBilgilendirme", "label": "Ön Bilgilendirme Formu'nu okudum; …", "required": true, "docs": [ { "key": "onBilgilendirme", "title": "Ön Bilgilendirme Formu", "version": "a9d0865e…" } ] }, "…" ], "declined": [] },
  "confirmations": [ { "channel": "telefon", "result": "ulasildi", "at": "2026-11-17T10:03:15.603Z", "by": "admin" } ],
  "returnRequests": [ { "id": 1, "at": "…", "message": "Sütlerden biri bozuk çıktı.", "items": [ { "productId": 13, "qty": 1 } ], "status": "Yeni" } ],
  "statusLabel": "Hazırlanıyor",
  "trackPath": "/?siparis=1&t=d95a56fd864e9aa52330756d",
  "archived": false
}
```

- `source`: `"web"` \| `"panel"` (elle girilen). `consentAt`: KVKK onay zamanı (panel siparişinde `null`).
- `history[]`: `{ status, at, by?, note? }`. `by` = işlemi yapan kullanıcı adı ya da `"musteri"`. `note` = müşteri iptal nedeni ya da `"Kalemler düzenlendi: …"`. Kalem düzenlemesi durum değiştirmeden geçmişe yazılır (aynı `status` ile), bu satırları "not" olarak gösterin.
- `substitution`: `ara` = "Beni arayın", `benzer` = "Benzeriyle değiştirin", `cikar` = "Siparişten çıkarın".
- Eski (yükseltilmiş) siparişlerde `customer.zoneId` `null`, `zoneName` `""`, `source` `"web"`, `consentAt` yok olabilir.
- `consent`: onay kaydı özeti (IP dahil; yalnızca panelde). Web siparişinde dolu, panel ve eski siparişlerde `null`. Belgelerin kendisi: `GET /api/admin/orders/:id/documents`.
- `confirmations[]`: sipariş teyidi kayıtları (§3.4). `returnRequests[]`: müşterinin cayma/iade talepleri (`status`: `Yeni` \| `İnceleniyor` \| `Sonuçlandı` \| `Reddedildi`, `adminNote`, `by`, `updatedAt`).
- `items[].caymaDurumu` (ve `brand`): sipariş anındaki değer.
- `trackPath`: müşteriye verilebilecek gizli takip bağlantısı (telefonla gelen siparişte de).
- **`archived`**: tamamlanmış/iptal sipariş `privacy.archiveDays`'i (varsayılan 730 gün) geçmiş. **Personel bu siparişi değiştiremez**: durum (tekil `PATCH` → `403 ARSIV`; toplu durum değişikliğinde `skipped` içinde "Arşivlenmiş siparişi yalnızca yönetici değiştirebilir."), kalemler, notlar, kurye, teyit ve cayma/iade talebi işleme yöneticiye kalır (durum geri alınarak maske kaldırılamaz). Personel kalemleri yalnızca aktif ("Yeni", "Hazırlanıyor", "Yolda") siparişte düzenleyebilir; teslim edilmiş/iptal siparişte `403 YETKI`. **Personel** bu siparişlerde kişisel veriyi maskeli görür (`customer.name: "Arşivlenmiş sipariş"`, `phone`/`address` boş, notlar `"[arşivde — yalnızca yönetici]"`, `masked: true`); listede telefon/ad aramasıyla da bulamaz, müşteri listesinde görünmez. Yönetici her şeyi görür. Canlı akıştaki (SSE) arşivli sipariş olayı herkese maskeli gider.
- `anonymizedAt`: saklama süresi (`privacy.retentionDays`, varsayılan 3650 gün) dolup kişisel verisi silinmiş sipariş (ad "Anonim").

| Yöntem | Yol | Yetki | Not |
|---|---|---|---|
| GET | `/api/admin/orders` | Personel | Liste (aşağıda) |
| GET | `/api/admin/orders/:id` | Personel | Tek sipariş; `404` "Sipariş bulunamadı." |
| POST | `/api/admin/orders` | Personel | Elle (telefonla gelen) sipariş |
| PATCH | `/api/admin/orders/:id` | Personel | Durum / iptal notu / yönetici notu / kurye |
| PUT | `/api/admin/orders/:id/items` | Personel | Kalem düzenleme |
| POST | `/api/admin/orders/bulk` | Personel (silme: Yönetici) | Toplu durum / toplu silme |
| GET | `/api/admin/orders/export` | Yönetici | CSV |
| GET | `/api/admin/orders/:id/documents` | Personel | Onay kaydı + onaylanan metinler (§3.4); `?format=html` yazdırılabilir sayfa |
| POST | `/api/admin/orders/:id/confirmation` | Personel | Sipariş teyidi kaydı (§3.4) |
| PATCH | `/api/admin/orders/:id/return-requests/:rid` | Personel | Cayma/iade talebini güncelle (§3.4) |

**Liste** — `GET /api/admin/orders?status=&from=&to=&q=&type=&payment=&page=&pageSize=`

| Parametre | Not |
|---|---|
| `status` | Tek durum (`Yeni`), virgüllü liste (`Yeni,Hazırlanıyor`) ya da `aktif` (Yeni+Hazırlanıyor+Yolda) |
| `from`, `to` | `YYYY-AA-GG`, Türkiye saatine göre, iki uç dahil (`createdAt`'e göre) |
| `q` | Sipariş no (`12` ya da `#12`), telefonun en az 4 hanesi, ad, adres, bölge, not, kurye, ürün adı (Türkçe karakter duyarsız) |
| `type` | `teslimat` \| `gelal` |
| `payment` | `nakit` \| `kart` |
| `page`, `pageSize` | 1'den başlar; `pageSize` varsayılan 50, en fazla 200 |
| `since` | **Yoklama:** ISO zaman. Verilirse sayfalama/süzgeç yok sayılır; `updatedAt`'i bu zamandan sonra olan **tüm** siparişler (yeni gelenler + müşteri iptalleri + başka cihazdaki değişiklikler) döner. Bir sonraki yoklamada yanıttaki `serverTime`'ı gönderin. Yeni sipariş tespiti: `createdAt > since` ya da `id > önceki latestId` |

```json
{
  "orders": [ { "…": "panel sipariş nesnesi" } ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "pages": 1,
  "counts": { "aktif": 1, "Yeni": 1, "Hazırlanıyor": 0, "Yolda": 0, "Teslim edildi": 0, "İptal": 1 },
  "latestId": 2,
  "serverTime": "2026-11-16T18:00:00.000Z"
}
```

`counts` durum süzgeci uygulanmadan (tarih/arama süzgeçleriyle) sayılır — sekme rozetleri için. `since` yanıtı: `{ "orders": [...], "counts": {...}, "latestId": n, "serverTime": "…" }` (en yeni üstte).

**Elle sipariş** — `POST /api/admin/orders`: gövde `POST /api/orders` ile aynı. Farklar: saat/durdurma, KVKK, honeypot, engelli numara, aktif sipariş sınırı, kapalı ödeme yöntemi ve **minimum tutar** denetlenmez (minimum altıysa uyarı döner). Bölge, ürün ve kupon kuralları geçerlidir. Yanıt `201`: panel sipariş nesnesi + `warnings`:

```json
{ "id": 3, "source": "panel", "total": 66.5, "warnings": [ "Minimum sipariş tutarı 200 ₺. Sepetinize 153,5 ₺ daha ekleyin." ], "…": "diğer alanlar" }
```

Yanıttaki `token` ile müşteriye takip bağlantısı verilebilir.

**Durum / not** — `PATCH /api/admin/orders/:id`, gövdede istenen alanlar:

```json
{ "status": "Hazırlanıyor", "courier": "Murat", "adminNote": "Kapıcıya bırakılabilir" }
```

| Alan | Not |
|---|---|
| `status` | 5 durumdan biri; her geçiş serbest (geri alma dahil). `İptal`'e geçişte stok ve kupon geri alınır, `cancelledBy: "market"`; İptal'den çıkışta stok yeniden ayrılır, `cancelNote` temizlenir |
| `cancelNote` | En fazla 300; yalnızca sipariş (bu istekten sonra) `İptal` ise yazılır; müşteri takip ekranında görür |
| `adminNote` | En fazla 500; yalnızca panelde |
| `courier` | En fazla 60 |

Yanıt: güncel panel sipariş nesnesi. `400` "Geçersiz sipariş durumu." / "Not en fazla 300 karakter olabilir."

**Kalem düzenleme** — `PUT /api/admin/orders/:id/items`:

```json
{ "items": [ { "productId": 13, "qty": 6 }, { "productId": 1, "qty": 1 } ] }
```

- Listedeki her kalem için yeni adet; `qty: 0` = çıkar. **Listede olmayan mevcut kalemler değişmez.** Siparişte olmayan ürün eklenirse güncel fiyatıyla eklenir (gizli ürün de eklenebilir).
- Mevcut kalemler sipariş anındaki fiyatını korur. `subtotal`, kupon indirimi (yüzde yeniden hesaplanır; alt sınırın altına inerse indirim kalkar ve `warnings` döner) ve `total` yeniden hesaplanır; **teslimat ücreti değişmez**. Stok farkı düşülür/eklenir. Geçmişe "Kalemler düzenlendi: Tam Yağlı Süt 1 L: 8 → 6, Domates eklendi (1)" yazılır.
- Yanıt: panel sipariş nesnesi + `"warnings": []`.
- Hatalar: `400 BOS_SEPET` "Siparişte en az bir ürün kalmalı. Tüm ürünleri çıkarmak için siparişi iptal edin."; `409 IPTAL_EDILMIS` (iptal edilmiş sipariş).

**Toplu** — `POST /api/admin/orders/bulk`:

- Durum: `{ "ids": [1, 99], "action": "status", "status": "Teslim edildi", "cancelNote"? }` → `{ "processed": 1, "skipped": [ { "id": 99, "reason": "Sipariş bulunamadı." } ] }`. Zaten o durumdakiler "Sipariş zaten bu durumda." ile atlanır.
- Silme (yalnızca Yönetici): `{ "ids": [1, 3], "action": "delete" }`. Yalnızca "Teslim edildi" ve "İptal" durumundakiler silinir; silmeden önce `backups/` içine otomatik yedek alınır ve adı döner:

```json
{ "processed": 1, "skipped": [ { "id": 3, "reason": "\"Yeni\" durumundaki sipariş silinemez; yalnızca teslim edilen ya da iptal edilen siparişler silinebilir." } ], "backup": "siparis-silme-oncesi-2026-11-16T20-22-53-857Z.json" }
```

**CSV** — `GET /api/admin/orders/export?from=&to=&status=&q=` → `siparisler-YYYY-AA-GG.csv` (BOM, `;`). Sütunlar: `Sipariş no;Tarih;Durum;Tür;Ödeme;Para üstü;Ad soyad;Telefon;Bölge;Adres;Ürünler;Ara toplam;İndirim;Kupon;Teslimat;Toplam;Kurye;Sipariş notu;Yönetici notu;Kaynak`.

### Müşteriler

Siparişlerden türetilir (telefonun son 10 hanesine göre). Engelli olup siparişi olmayan numaralar da listelenir.

| Yöntem | Yol | Yetki | Not |
|---|---|---|---|
| GET | `/api/admin/customers?q=&blocked=1&page=&pageSize=` | Personel | `q`: ad, adres ya da telefonun en az 3 hanesi. `pageSize` varsayılan 100, en fazla 500. Son siparişi en yeni olan üstte |
| GET | `/api/admin/customers/:phone` | Personel | `{ "customer": {...}, "orders": [panel sipariş nesneleri, yeniden eskiye] }` |
| PUT | `/api/admin/customers/:phone/block` | Yönetici | `{ "blocked": true }` engelle, `{ "blocked": false }` kaldır → `{ "phone": "05551234567", "blocked": true }` |
| GET | `/api/admin/customers/:phone/export` | Yönetici | **KVKK başvurusu — veriyi dışa aktar:** `musteri-verisi-YYYY-AA-GG.json` indirilir: `{ exportedAt, dataController, phone, blocked, orders: [tam sipariş kayıtları, token hariç] }`. Kayıt yoksa `404` |
| POST | `/api/admin/customers/:phone/anonymize` | Yönetici | **KVKK başvurusu — sil/anonimleştir:** gövde `{ "confirm": true }` (yoksa `400`). Tamamlanmış/iptal siparişlerde ad, telefon, adres, notlar, müşteri iptal nedeni, iade talebi metni ve onay IP'si silinir; tutar/kalem/bölge kalır. Aktif siparişler atlanır. Yanıt: `{ "processed": 1, "skipped": [ { "id": 7, "reason": "\"Yeni\" durumundaki sipariş anonimleştirilemez; önce tamamlayın ya da iptal edin." } ], "blocked": false, "note": "Otomatik yedeklerdeki eski kopyalar süreleri dolunca silinir (günlük yedekler 14 gün)." }`. Geri alınamaz |

```json
{
  "customers": [
    { "phone": "05551234567", "name": "Mehmet Kaya", "address": "", "zoneName": "", "orderCount": 0, "cancelledCount": 1, "totalSpent": 0,
      "firstOrderAt": "2026-11-16T18:00:00.000Z", "lastOrderAt": "2026-11-16T18:00:00.000Z", "lastOrderId": 2, "blocked": false }
  ],
  "total": 1, "page": 1, "pageSize": 100, "pages": 1
}
```

`orderCount` ve `totalSpent` iptal edilmeyen siparişlerden; `address`/`zoneName` son dolu değer. Personel için arşivlenmiş siparişler müşteri listesine/ayrıntısına katılmaz (yalnızca onlardan oluşan müşteri personele görünmez).

### Kuponlar — Yönetici

Kupon: `{ "id", "code", "type", "value", "minOrder", "maxUses", "usedCount", "perPhoneLimit", "startsAt", "endsAt", "active", "description" }`.

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/admin/coupons` | — | Dizi |
| POST | `/api/admin/coupons` | aşağıda | `201` kupon |
| PATCH | `/api/admin/coupons/:id` | Kısmi; `usedCount` da ayarlanabilir (sıfırlama) | `200` kupon |
| DELETE | `/api/admin/coupons/:id` | — | `{ "ok": true }` |
| POST | `/api/admin/coupons/bulk-delete` | `{ "ids": [..] }` | Toplu yanıt ("Kupon bulunamadı.") |

| Alan | Kural |
|---|---|
| `code` | 3–30 karakter, harf/rakam/`-`/`_`; büyük harfe çevrilir (`yaz25` → `YAZ25`, `indirim` → `INDIRIM`); harf duyarsız tekil (`409 AYNI_KOD` "Bu kupon kodu zaten var.") |
| `type` | `yuzde` (`value` 1–100) \| `tutar` (`value` > 0 TL) \| `ucretsizTeslimat` (`value` 0; yalnızca eve teslim) |
| `minOrder` | Ara toplam alt sınırı (varsayılan 0) |
| `maxUses` | Toplam kullanım sınırı, `null` = sınırsız. İptal edilen sipariş kullanımı geri verir |
| `perPhoneLimit` | Telefon başına (iptal edilmemiş siparişlerde) kullanım, `null` = sınırsız |
| `startsAt`, `endsAt` | `YYYY-AA-GG` (Türkiye saatiyle gün başı / gün sonu olarak saklanır) ya da ISO; `null` = sınırsız |
| `active` | Varsayılan `true` |
| `description` | ≤ 200, yalnızca panel |

```json
// POST {"code":"yaz25","type":"yuzde","value":25,"minOrder":300,"startsAt":"2026-11-01","endsAt":"2026-12-31","perPhoneLimit":1}
{ "id": 2, "usedCount": 0, "code": "YAZ25", "type": "yuzde", "value": 25, "minOrder": 300, "maxUses": null, "perPhoneLimit": 1,
  "startsAt": "2026-10-31T21:00:00.000Z", "endsAt": "2026-12-31T20:59:59.999Z", "active": true, "description": "" }
```

Müşteriye dönen kupon hata mesajları: "Kupon kodu geçersiz." (yok ya da pasif), "Bu kupon henüz başlamadı.", "Bu kuponun süresi doldu.", "Bu kuponun kullanım sınırı doldu.", "Bu kupon 300 ₺ ve üzeri alışverişte geçerli.", "Bu kupon yalnızca eve teslim siparişlerinde geçerli.", "Bu kuponu kullanım hakkınız doldu."

### Ayarlar — Yönetici

| Yöntem | Yol | Not |
|---|---|---|
| GET | `/api/admin/settings` | Tüm ayarlar (§7'deki `settings` nesnesi, gizli alanlar dahil) |
| PATCH (ya da PUT) | `/api/admin/settings` | Kısmi güncelleme → `{ "settings": {tüm ayarlar}, "status": {durum nesnesi} }` |
| GET | `/api/admin/settings/legal-templates` | Varsayılan şablon metinleri, belge anahtarına göre (11 belge: `onBilgilendirme`, `mesafeliSatis`, `kvkk`, `acikRiza`, `ticariIleti`, `cerez`, `iade`, `kullanim`, `teslimatKosullari`, `islemRehberi`, `iletisim`; YASAL.md §5). Belgenin `text` alanı boşken bunlar kullanılır |
| GET | `/api/admin/legal` | Belgelerin güncel sürümleri, onaylar, yer tutucu listesi ve onaylanmış eski sürümlerin arşivi (§3.5) |
| GET | `/api/admin/legal/versions/:version` | Arşivdeki bir sürümün metni (+ `html`) ve o sürümü onaylayan sipariş sayısı (§3.5) |
| POST | `/api/admin/privacy/run` | Saklama süresi anonimleştirmesini hemen çalıştır → `{ "processed": 0, "retentionDays": 3650, "lastRunAt": "…" }` (normalde açılışta ve günde bir kendiliğinden) |
| POST | `/api/admin/settings/telegram-test` | Gövde boş ya da `{ "telegramBotToken", "telegramChatId" }` (kaydetmeden denemek için). `{ "ok": true }` ya da `502 TELEGRAM` (Telegram'ın hata metniyle) / `400` "Önce Telegram bot anahtarını ve sohbet kimliğini girin." |
| POST | `/api/admin/settings/banners/bulk-delete` | `{ "ids" }` → toplu yanıt ("Afiş bulunamadı."); afiş görselleri silinir |
| POST | `/api/admin/settings/faq/bulk-delete` | `{ "ids" }` → toplu yanıt ("Soru bulunamadı.") |
| POST | `/api/admin/settings/zones/bulk-delete` | `{ "ids" }` → toplu yanıt ("Bölge bulunamadı."). Eski siparişler bölge adını kendileri saklar, etkilenmez |

**PATCH kuralları:** Gövdede yalnızca değiştirilecek bölümler gönderilir. Nesne bölümleri (`store`, `legal`, `hours`, `ordering`, `announcement`, `notify`) mevcut değerle **alan alan birleşir** (`legal.texts` ve `ordering.payments` de); liste bölümleri (`zones`, `banners`, `faq`, `blockedPhones`) gönderilen **listeyle tamamen değişir**. Her bölüm birleştirildikten sonra bütünüyle doğrulanır; bir hata varsa hiçbir şey kaydedilmez. Bilinmeyen bölüm → `400` "Bilinmeyen ayar bölümü: x".

Örnek — tek tuşla sipariş alımını durdurma:

```json
// PATCH /api/admin/settings
{ "ordering": { "enabled": false, "pausedMessage": "Bu akşam 1 saatliğine ara verdik." } }
// yanıt (kısaltılmış)
{ "settings": { "ordering": { "enabled": false, "pausedMessage": "Bu akşam 1 saatliğine ara verdik.", "allowPreorder": false, "minOrder": 200, "deliveryFee": 20, "freeDeliveryOver": 500, "etaMinutes": 30, "pickupEnabled": true, "payments": { "nakit": true, "kart": true }, "maxActiveOrdersPerPhone": 3 }, "…": "…" },
  "status": { "isOpen": true, "acceptingOrders": false, "paused": true, "state": "durduruldu", "label": "Sipariş alımı durduruldu", "hoursLabel": "Açık · 02:00'ye kadar", "message": "Bu akşam 1 saatliğine ara verdik.", "…": "…" } }
```

Bölüm doğrulamaları:

| Bölüm | Kurallar |
|---|---|
| `store` | `name` zorunlu (≤80); `slogan` ≤140; `phone` ≤30 (serbest metin, gösterim için); `whatsapp` ülke kodlu rakam (10–15, ör. `905321234567`); `email` geçerli ya da boş; `address` ≤300; `city`, `district` ≤60; `postalCode` ≤10; `mapsUrl`, `instagram` `https://…` ya da boş; `about` ≤2000 (çok satırlı) |
| `legal` | `businessType` (`"sahis"` \| `"sirket"` \| `""` — şahısta MERSİS/KEP zorunlu sayılmaz ve boşsa metinden çıkarılır; şirkette zorunludur, boşsa `[…]` kalır ve güvenlik durumu eksik der; başka değer `400`), `companyTitle` ≤200, `taxOffice` ≤100, `taxNo` ≤20, `mersis` ≤30, `kep` ≤120, `chamber` (meslek odası) ≤200, `etbisNo` (ETBİS kayıt no) ≤60; `docs[]` ve `consents[]` (§3.5). `texts` eski alandır: yalnızca `texts` gönderilirse aynı anahtarlı belgelerin metnine yazılır; yanıtta belgelerden üretilmiş hâli döner |
| `privacy` | `retentionDays` (30–7300 ya da `null` = kapalı; **varsayılan 3650**, 6563 m.11 gereği 10 yıl) — tamamlanmış/iptal siparişlerde kişisel veriler bu süre sonunda anonimleşir (günlük iş). `archiveDays` (1–7300 ya da `null`; **varsayılan 730**) — bu süreyi geçen tamamlanmış siparişlerde kişisel veri personele maskelenir; `retentionDays`'ten büyük olamaz. `phoneLookup` (varsayılan `false`) — numara + telefonla sorgu. `marketingConsent` (varsayılan `false`) — ticari ileti izni kutusu (D) ve bağlı metinler; İYS kurulmadan açmayın |
| `hours` | `days` tam 7 öğe (0 = Pazartesi), her biri `{ open: "SS:DD", close: "SS:DD", closed: bool }` |
| `ordering` | `enabled`, `allowPreorder`, `pickupEnabled` bool; `pausedMessage` ≤300; `minOrder`, `deliveryFee` ≥ 0; `freeDeliveryOver` ≥ 0 ya da `null`; `etaMinutes` 5–600; `payments.{nakit,kart}` en az biri true; `maxActiveOrdersPerPhone` 1–50 |
| `zones` | En fazla 100. Her öğe `{ id?, name (zorunlu ≤80), slug?, fee|null, minOrder|null, etaMinutes|null, active }`. `slug` verilmezse addan üretilir (`"Yeni Mahalle Çarşı"` → `yeni-mahalle-carsi`), çakışırsa `-2` eklenir. `id` verilmeyen yeni bölgeye yeni id atanır. Mevcut bölgeyi güncellerken `id`'yi geri gönderin |
| `announcement` | `{ text ≤300, active }` |
| `banners` | En fazla 20. `{ id?, title ≤100, text ≤300, image (null ya da /uploads/… ya da /img/…), link ("", /…, #…, https://…), active }`; başlık/metin/görselden biri zorunlu. Görsel önce `POST /api/admin/uploads` ile yüklenir |
| `faq` | En fazla 50. `{ id?, q ≤200 (zorunlu), a ≤2000 (zorunlu) }`; yeni maddelere id atanır |
| `notify` | `telegramBotToken` (`123456:ABC…` biçimi) ya da boş; `telegramChatId` (sayı, `-100…` ya da `@kanal`) ya da boş; `sound` bool (panel sesli uyarı tercihi) |

**Telegram bildirimi (2. revizyon):** müşteri adı, telefonu, adresi ve notu **gönderilmez** (Telegram yurt dışında; YASAL.md §4.3.4). Yeni sipariş: `🛒 Yeni sipariş #12 (ÖN SİPARİŞ)` / `Eve teslim · Şükrüpaşa` / `1 kalem, 5 ürün · Toplam: ₺232,50` / (PUBLIC_URL varsa) panel bağlantısı. İptal: `❌ Sipariş #12 müşteri tarafından iptal edildi · ₺232,50`. Cayma/iade talebi: `↩️ Sipariş #12 için cayma/iade talebi (#1). Ayrıntı panelde.`
| `blockedPhones` | Telefon listesi (normalleştirilir). Tek numara için müşteriler uç noktasını kullanın |

### Kullanıcılar — Yönetici

Kullanıcı: `{ "id", "username", "name", "role", "active", "createdAt" }` (şifre özeti hiç dönmez).

| Yöntem | Yol | Gövde | Not |
|---|---|---|---|
| GET | `/api/admin/users` | — | Dizi |
| POST | `/api/admin/users` | `{ "username", "name"?, "role": "personel"|"yonetici", "password", "active"? }` | `201`. `username`: 3–30, küçük harf/rakam/`.`/`-`/`_` (büyük harf küçültülür); `409 AYNI_AD` "Bu kullanıcı adı zaten var."; şifre en az 8 |
| PATCH | `/api/admin/users/:id` | `name`, `role`, `active`, `password` (yönetici sıfırlaması) | Pasifleştirilen ya da şifresi değişen kullanıcının oturumları kapanır (kendisi değiştiriyorsa mevcut oturumu hariç) |
| DELETE | `/api/admin/users/:id` | — | `{ "ok": true }` |

Son aktif yönetici silinemez, pasifleştirilemez, personele çevrilemez: `409 SON_YONETICI` ("Son yönetici silinemez." / "Son yönetici pasifleştirilemez ya da personele çevrilemez. Önce başka bir yönetici ekleyin.").

### Raporlar — Yönetici

`GET /api/admin/reports?from=2026-11-01&to=2026-11-16` — iki uç dahil, Türkiye saati. `to` verilmezse bugün, `from` verilmezse `to`'dan 6 gün öncesi. **İptal edilen siparişler ciroya ve dağılımlara katılmaz** (yalnızca `summary.cancelled` ve `byStatus`'ta sayılır).

```json
{
  "from": "2026-11-16",
  "to": "2026-11-16",
  "summary": { "revenue": 66.5, "orders": 1, "cancelled": 1, "avgBasket": 66.5, "itemsSold": 1, "discountTotal": 0, "deliveryFeeTotal": 20 },
  "byDay": [ { "date": "2026-11-16", "orders": 1, "revenue": 66.5 } ],
  "byHour": [ { "hour": 0, "orders": 0, "revenue": 0 }, "… 24 öğe …", { "hour": 21, "orders": 1, "revenue": 66.5 } ],
  "byPayment": [ { "key": "nakit", "label": "Kapıda nakit", "orders": 1, "revenue": 66.5 } ],
  "byType": [ { "key": "teslimat", "label": "Eve teslim", "orders": 1, "revenue": 66.5 } ],
  "byZone": [ { "key": "Sabuni", "label": "Sabuni", "orders": 1, "revenue": 66.5 } ],
  "byStatus": { "İptal": 1, "Yeni": 1 },
  "topProducts": [ { "productId": 13, "name": "Tam Yağlı Süt 1 L", "unit": "adet", "qty": 1, "revenue": 46.5 } ],
  "products": [ "… tüm ürün satışları, topProducts ile aynı biçim …" ],
  "totals": {
    "today": { "from": "2026-11-16", "revenue": 66.5, "orders": 1 },
    "week": { "from": "2026-11-16", "revenue": 66.5, "orders": 1 },
    "month": { "from": "2026-11-01", "revenue": 66.5, "orders": 1 },
    "year": { "from": "2026-01-01", "revenue": 66.5, "orders": 1 }
  }
}
```

- `byDay`: aralıktaki **her gün** (siparişsiz günler 0), en fazla 1100 gün. `byHour`: her zaman 24 öğe (0–23, Türkiye saati).
- `byZone`: gel-al siparişleri `key: "gelal"`, `label: "Gel-al"`; bölgesiz eski siparişler "Belirtilmemiş".
- `topProducts`: ciroya göre ilk 20; `products`: tamamı (eski "günlük ürün dökümü" ekranı için).
- `totals`: seçilen aralıktan bağımsız, bugün / bu hafta (Pazartesi'den) / bu ay / bu yıl.
- Önceki dönem karşılaştırması gerekiyorsa aynı uç noktayı farklı `from`/`to` ile çağırın.

### Yedek — Yönetici

| Yöntem | Yol | Not |
|---|---|---|
| GET | `/api/admin/backup` | Tüm veri (`db.json`'ın tamamı, kullanıcı şifre özetleri dahil; oturumlar hariç), **şifresiz** `ulusoy-market-yedek-YYYY-AA-GG.json` olarak indirilir |
| POST | `/api/admin/backup` | **Parolalı yedek:** gövde `{ "password": "…" }` (en az 10 karakter; URL'ye girmesin diye POST). `ulusoy-market-yedek-YYYY-AA-GG.sifreli.json` indirilir: AES-256-GCM şifreli zarf (biçim §7), anahtar `scrypt(parola)`. Parola sunucuda saklanmaz; **unutulursa yedek açılamaz** |
| POST | `/api/admin/backups/:name` | Sunucudaki otomatik yedeği parolayla şifreleyerek indir (`{ "password" }`) |
| POST | `/api/admin/restore` | Gövde: indirilen yedek dosyasının içeriği (ya da `{ "data": <yedek> }`). **Parolalı yedek:** `{ "file": <.sifreli.json içeriği>, "password": "…" }` ya da dosyanın kendisi + `"password"` alanı; parola yok/yanlış → `400 YEDEK_PAROLA` ("Yedek parolası yanlış."), dosya kurcalanmış → `400 DOGRULAMA` ("Şifreli yedek açılamadı: … bozulmuş ya da değiştirilmiş …"). Onaylanmış metin arşivi (`legalArchive`) mevcut olanla birleştirilir: **mevcut kayıt önceliklidir** ve yedekten gelen her kaydın metni kendi sürüm özetini (SHA-256 başlık+metin) tutmalıdır; tutmayan (kurcalanmış) kayıtlar alınmaz ve yanıtta `rejectedArchive: <sayı>` döner. **Onay kaydı bütünlüğü:** sunucuda bulunan bir siparişin (aynı numara **ve** aynı takip anahtarı) onay kaydı — onaylanan belge sürümleri, onay zamanı, sözleşmedeki sipariş özeti (`consent.snapshot`); IP hariç — yedektekinden farklıysa geri yükleme **yapılmaz**: `409 ONAY_KAYDI`, `orders: [numaralar]`. Yani sunucudaki bir siparişin müşteriye onaylatılan metni ve tutarları yedekle değiştirilemez. Sınır: sunucuda olmayan siparişler (silinmiş ya da başka kurulumdan) ve aynı numaralı ama farklı anahtarlı siparişler yedekteki hâliyle alınır; ikincisi yanıtta `replacedOrders: [numaralar]` olarak bildirilir — bu kayıtların doğruluğu yedeği saklayanın sorumluluğundadır (parolalı yedek AES-GCM ile korunur, değiştirilemez). Bilinmeyen üst düzey alanlar (ör. `format`) atılır, yanıtta `droppedKeys`. Biçimi korunan ayar bölümleri (mağaza, saatler, sipariş, duyuru, bildirim, engelli numaralar, gizlilik) panel kaydındaki temizleme kurallarından geçirilerek saklanır. Kullanıcı şifre özetleri bu uygulamanın biçiminde olmalı (boş/düşük maliyetli özet `400`), aynı kullanıcı adı iki kez olamaz; tüm canlı akışlar `yenile` olayıyla kapanır. Önce mevcut veri `backups/geri-yukleme-oncesi-….json` olarak yedeklenir, yedek yükseltilir ve yüklenir. **Tüm oturumlar kapanır** → panel giriş ekranına dönmeli. Yanıt: `{ "ok": true, "backup": "geri-yukleme-oncesi-….json", "relogin": true, "counts": { "products", "categories", "orders" } }`. Tanınmayan dosya → `400` "Yedek dosyası tanınmadı. Panelden indirilen .json yedeği seçin." Bozuk içerik (aynı kimlik iki kez, geçersiz fiyat/tarih/rol, eksik müşteri bilgisi, ayarlarda geçersiz saat/ücret/bağlantı …) → `400 DOGRULAMA` "Yedek dosyası okunamadı: <neden>" ya da "Yedek dosyasındaki ayarlar geçersiz: <neden>"; bu durumda mevcut veriye dokunulmaz. Kimlik sayaçları geriye gitmez (bkz. §7). |
| GET | `/api/admin/backups` | Sunucudaki otomatik yedekler: `[ { "name", "size", "createdAt" } ]` (en yeni üstte) |
| GET | `/api/admin/backups/:name` | O yedeği indirir (DATA_KEY ile şifreliyse sunucu çözer, düz JSON gelir; açılamıyorsa `409 YEDEK_ACILAMIYOR`) |

Otomatik yedekler (`DATA_DIR/backups/`): `db-YYYY-AA-GG.json` (günün ilk kaydında, son 14 gün), `yukseltme-oncesi-*.json` (eski biçim yükseltilirken), `geri-yukleme-oncesi-*.json` ve `siparis-silme-oncesi-*.json` (her biri için son 20).

---

## 4. Sunucuda üretilen sayfalar

### Ana sayfa `/` — SEO enjeksiyonu (yer tutucu sözleşmesi)

Sunucu `public/index.html` dosyasını okur ve:

1. İlk `<title>…</title>` etiketinin içeriğini değiştirir (yoksa `</head>` öncesine ekler): `Ulusoy Market · Gece de açık mahalle marketi | Edirne`.
2. `</head>` kapanışından hemen önce şunları ekler (`<!-- sunucu: SEO -->` yorumuyla başlar):
   `<meta name="description">`, `<link rel="canonical">`, `og:type`, `og:locale` (`tr_TR`), `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image`, `<meta name="twitter:card" content="summary_large_image">` ve `<script type="application/ld+json">` (`GroceryStore`: ad, adres, telefon, çalışma saatleri, hizmet bölgeleri, Instagram).

**Bu yüzden `index.html` içinde şunlar YAZILMAMALI** (çift olur): `meta description`, `canonical`, `og:*`, `twitter:*`, JSON-LD. Şunları ise `index.html` kendisi koymalı: `<meta charset>`, `viewport`, bir `<title>` (yedek), `<meta name="theme-color">`, favicon / `apple-touch-icon`, `<link rel="manifest" href="/manifest.webmanifest">`, stil ve script bağlantıları.

`/index.html` → `/` (301). Yanıt `Cache-Control: no-cache` + ETag.

Mağaza için sorgu parametresi: bölge sayfalarındaki "Sipariş vermeye başla" düğmesi `/?bolge=<slug>` adresine gider; mağaza bu parametreyle bölgeyi önceden seçebilir.

Takip bağlantısı `/?siparis=<id>&t=<token>` (§2.6): bu sorgu parametrelerinden biri varsa ana sayfa `Cache-Control: no-store` (ETag yok), `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` ile döner.

### Görsel dosya kuralları (Ajan B ekleyebilir)

Sunucu bu dosyaları **varsa** kullanır, yoksa yeni logoya (`/img/logo-yeni.png`) düşer:

| Dosya | Kullanıldığı yer |
|---|---|
| `public/img/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Manifest ikonları (maskable olan `purpose: "maskable"`); `icon-192.png` ayrıca sunucu sayfalarında favicon/apple-touch-icon |
| `public/img/favicon.png` ya da `favicon.svg` | `icon-192.png` yoksa sunucu sayfalarında favicon |
| `public/img/og.jpg` (ya da `.png`/`.webp`, önerilen 1200×630) | `og:image` (ana sayfa ve tüm sunucu sayfaları) |

### Yasal ve bilgi sayfaları

| Adres | İçerik | `body` sınıfı |
|---|---|---|
| `settings.legal.docs[].path` (varsayılan: `/on-bilgilendirme`, `/mesafeli-satis`, `/kvkk`, `/iade-kosullari`, `/teslimat-kosullari`, `/kullanim-kosullari`, `/cerez-politikasi`, `/islem-rehberi`, `/iletisim`; pazarlama izni açıksa `/acik-riza`, `/ticari-ileti-izni`) | Yasal belge (genel hâli; siparişe özel alanlar `[sipariş numarası]` gibi açıklamayla) | `page page-legal` |
| `/siparis/<id>/belgeler?t=<token>` | **Bu siparişin sözleşmesi:** onaylanan metinler, onaylandığı sürümle, sipariş bilgileriyle dolu; yazdırılabilir. `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`; yanlış token → 404 | `page page-legal page-order-docs` |
| `/hakkimizda` | `store.about` + iletişim, saatler, bölgeler | `page page-about` |
| `/teslimat` | Aktif bölgelerin listesi | `page page-zones-index` |
| `/teslimat/<slug>` | Bölge tanıtımı (yalnızca aktif bölgeler; diğerleri 404) | `page page-zone` |
| (bulunamayan her sayfa) | 404 sayfası, `noindex` | `page page-notfound` (`data-status="404"`) |

Yasal metin: belgenin `text` alanı boşsa varsayılan şablon (YASAL.md §5 taslakları, `lib/legal-texts.js`) kullanılır. Biçim (panelde kullanıcıya anlatın): boş satır = yeni paragraf, `## ` ile başlayan satır = ara başlık, `- ` ile başlayan satırlar = madde listesi, `**kalın**`; tek satır sonu `<br>` olur. HTML yazılamaz (kaçışlanır).

**Mağaza yer tutucuları** (sürümü belirleyen metne girer; boş olanlar `[…]`): `{{unvan}}`, `{{isletmeAdi}}` (= `{{magaza}}`), `{{adres}}`, `{{telefon}}`, `{{eposta}}`, `{{kep}}`, `{{mersis}}`, `{{vergiDairesi}}`, `{{vergiNo}}`, `{{meslekOdasi}}`, `{{siteAdresi}}` (= `{{websitesi}}`; yalnızca PUBLIC_URL'den — boşsa `[…]`, isteğin Host başlığı kullanılmaz), `{{saklamaSuresi}}`, `{{teslimatBolgeleri}}`, `{{calismaSaatleri}}`, `{{minTutar}}`, `{{guncellemeTarihi}}`. `{{mersis}}`, `{{kep}}`, `{{meslekOdasi}}` boşsa "Etiket: {{alan}}" parçası metinden tamamen çıkarılır (şahıs esnafında MERSİS/KEP yoktur). `legal.businessType` `"sirket"` ise `{{mersis}}` ve `{{kep}}` çıkarılmaz: boşsa `[…]` görünür. Yer tutucular tek geçişte doldurulur (doldurulan değerin içindeki `{{…}}` yeniden işlenmez; `$&` gibi diziler özel anlam taşımaz); metin HTML'e çevrilirken her şey kaçışlanır.

**Sipariş yer tutucuları** (yalnızca siparişin belgelerinde ve önizlemede dolar; genel sayfada `[sipariş numarası]` gibi açıklama görünür): `{{siparisNo}}`, `{{tarih}}` (= `{{siparisTarihi}}`), `{{onayTarihi}}`, `{{aliciAd}}` (= `{{aliciAdi}}`), `{{aliciTelefon}}`, `{{teslimatAdresi}}`, `{{teslimatBolgesi}}`, `{{teslimatSekli}}` ("Adrese teslim (kurye)" / "Dükkândan teslim (gel-al)"), `{{teslimatTuru}}`, `{{odemeSekli}}` ("kapıda nakit" / "kapıda kredi/banka kartı"), `{{urunTablosu}}` (her kalem bir madde: ürün (marka) · miktar (kg ürünlerde "≈ 1 kg (tartılarak)") · KDV dahil birim fiyat · tutar · cayma durumu), `{{araToplam}}`, `{{indirim}}`, `{{teslimatUcreti}}`, `{{toplam}}`, `{{urunYoksaTercihi}}` (= `{{urunYoksa}}`), `{{tahminiTeslimSuresi}}` (= `{{tahminiSure}}`; genel sayfada genel tahmini süre), `{{metinSurumu}}` (sürüm özetinin ilk 12 hanesi).

Sürüm (`version`): `SHA-256(başlık + "\n\n" + mağaza bilgileriyle doldurulmuş metin)`. Sayfa altında `Metin sürümü: <ilk 12 hane>`; `data-version` özniteliğinde tamamı.

Eski site adresleri: `/<ad>-tekel`, `/<ad>-market`, `/<ad>-marketi` → slug'ı eşleşen ya da onunla başlayan aktif bölgenin sayfasına, yoksa `/teslimat`'a **301** (ör. `/sukrupasa-tekel` → `/teslimat/sukrupasa`, `/edirne-tekel` → `/teslimat/edirne-merkez`). Sondaki `/` atılarak 301 yapılır (`/teslimat/` → `/teslimat`).

### HTML iskeleti ve sınıf adları

Tüm sunucu sayfaları aynı iskeleti kullanır; görünümleri **`/style.css`** ile verilir (satır içi stil/script yoktur, sayfa JavaScript yüklemez):

```html
<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KVKK Aydınlatma Metni · Ulusoy Market</title>
<meta name="description" content="…">
<link rel="canonical" href="https://…/kvkk">            <!-- 404'te bunun yerine <meta name="robots" content="noindex"> -->
<meta property="og:…" content="…">                        <!-- type, locale, site_name, title, description, url, image -->
<meta name="theme-color" content="#0B0B0C">
<link rel="icon" href="/img/icon-192.png">                  <!-- yoksa favicon.png/svg, logo.svg/png/webp, logo-yeni.png -->
<link rel="apple-touch-icon" href="/img/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/style.css">
</head>
<body class="page page-legal">
<a class="skip-link" href="#icerik">İçeriğe geç</a>
<header class="page-header">
  <div class="page-header-inner">
    <a class="page-brand" href="/"><img class="page-logo" src="/img/logo.png" alt="" width="40" height="40">   <!-- ilk bulunan: img/logo.svg, logo.png, logo.webp (40×42), icon-192.png, logo-yeni.png --><span class="page-brand-name">Ulusoy Market</span></a>
    <a class="page-cta" href="/">Sipariş ver</a>
  </div>
</header>
<main class="page-main" id="icerik">
  <nav class="page-breadcrumb" aria-label="Sayfa yolu"><a href="/">Ana sayfa</a> <span aria-hidden="true">›</span> <span aria-current="page">KVKK Aydınlatma Metni</span></nav>
  <article class="page-article">
    <h1 class="page-title">KVKK Aydınlatma Metni</h1>
    <p class="page-lead">Kişisel verilerinizin nasıl işlendiğine dair bilgilendirme.</p>
    <div class="page-content">
      <p>…</p>
      <h2>Veri sorumlusu</h2>
      <ul><li>Unvan: […]</li>…</ul>
    </div>
  </article>
</main>
<footer class="page-footer">
  <div class="page-footer-inner">
    <p class="page-footer-contact"><span class="page-footer-address">Doğa Apt, …</span> · <a href="tel:05373119696">0537 311 96 96</a> · <a href="https://wa.me/905373119696" rel="noopener">WhatsApp</a> · <a href="https://www.instagram.com/…" rel="noopener">Instagram</a></p>
    <p class="page-footer-hours">Sipariş saatleri: Her gün 14:00–02:00</p>
    <nav class="page-footer-links" aria-label="Kurumsal"><a href="/hakkimizda">Hakkımızda</a><a href="/teslimat">Teslimat bölgeleri</a><a href="/kvkk">KVKK</a><a href="/mesafeli-satis">Mesafeli satış sözleşmesi</a><a href="/iade-kosullari">İade koşulları</a><a href="/cerez-politikasi">Çerez politikası</a></nav>
    <p class="page-footer-legal">© 2026 Ulusoy Market</p>
  </div>
</footer>
</body>
</html>
```

Sayfaya özgü bölümler (`<article class="page-article">` içinde):

```html
<!-- /hakkimizda -->
<section class="page-section store-info">
  <h2>İletişim ve saatler</h2>
  <dl class="info-list">
    <div class="info-item"><dt>Adres</dt><dd>… <a class="info-link" href="https://www.google.com/maps/…" rel="noopener">Yol tarifi</a></dd></div>
    <div class="info-item"><dt>Telefon</dt><dd><a href="tel:…">…</a></dd></div>
    <div class="info-item"><dt>WhatsApp</dt><dd><a href="https://wa.me/…">Mesaj gönder</a></dd></div>
    <div class="info-item"><dt>Sipariş saatleri</dt><dd>Her gün: 14:00–02:00</dd></div>
  </dl>
</section>
<section class="page-section page-zones">
  <h2>Teslimat bölgeleri</h2>
  <ul class="zone-links"><li><a href="/teslimat/sukrupasa">Şükrüpaşa</a></li>…</ul>
</section>

<!-- /teslimat/<slug> -->
<h1 class="page-title">Şükrüpaşa · Eve market teslimatı</h1>
<p class="page-lead">…</p>
<section class="page-section zone-facts">
  <h2>Teslimat bilgileri</h2>
  <dl class="info-list">
    <div class="info-item"><dt>Teslimat ücreti</dt><dd>Ücretsiz</dd></div>
    <div class="info-item"><dt>Minimum sipariş</dt><dd>₺200,00</dd></div>
    <div class="info-item"><dt>Tahmini süre</dt><dd>~20 dakika</dd></div>
    <div class="info-item"><dt>Ödeme</dt><dd>Kapıda nakit veya kart</dd></div>
  </dl>
  <p class="page-actions"><a class="page-button" href="/?bolge=sukrupasa">Sipariş vermeye başla</a> <a class="page-button page-button-ghost" href="tel:05373119696">Ara: 0537 311 96 96</a></p>
</section>
<section class="page-section page-zones"> <h2>Diğer teslimat bölgeleri</h2> <ul class="zone-links">…</ul> </section>

<!-- /teslimat -->
<ul class="zone-cards">
  <li class="zone-card"><a href="/teslimat/sukrupasa"><span class="zone-card-name">Şükrüpaşa</span><span class="zone-card-meta">Teslimat ücreti: Ücretsiz · Minimum sipariş: ₺200,00 · Tahmini süre: ~20 dakika</span></a></li>
</ul>

<!-- 404 -->
<p class="page-actions"><a class="page-button" href="/">Alışverişe dön</a></p>
```

Yasal sayfa ekleri: `<article class="page-article" data-doc="<anahtar>" data-version="<sha256>">`, makale sonunda `<p class="page-version">Metin sürümü: <code>…</code></p>`; sipariş belgeleri sayfasında her belge `<section class="page-section order-doc" data-doc data-version>` + `<h2 class="order-doc-title">`, onay listesi `<ul class="order-doc-consents">`. Metinlerde `<strong>` (\*\*kalın\*\*) bulunur.

Sınıf listesi (style.css'te karşılanmalı): `page`, `page-legal`, `page-order-docs`, `page-version`, `order-doc`, `order-doc-title`, `order-doc-consents`, `page-about`, `page-zone`, `page-zones-index`, `page-notfound`, `skip-link`, `page-header`, `page-header-inner`, `page-brand`, `page-logo`, `page-brand-name`, `page-cta`, `page-main`, `page-breadcrumb`, `page-article`, `page-title`, `page-lead`, `page-content` (içinde düz `h2`, `p`, `ul`, `li`), `page-section`, `store-info`, `zone-facts`, `info-list`, `info-item` (içinde `dt`, `dd`), `info-link`, `page-actions`, `page-button`, `page-button-ghost`, `page-zones`, `zone-links`, `zone-cards`, `zone-card`, `zone-card-name`, `zone-card-meta`, `page-footer`, `page-footer-inner`, `page-footer-contact`, `page-footer-address`, `page-footer-hours`, `page-footer-links`, `page-footer-legal`.

Karanlık tema: sayfalar tema düğmesi içermez; `style.css` `prefers-color-scheme` ile uyum sağlamalıdır (sunucu sayfalarında `localStorage` tema tercihi okunamaz, çünkü JS yoktur).

### `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`

- `robots.txt`: `Allow: /`, `Disallow: /panel`, `Disallow: /api/`, `Sitemap: <taban>/sitemap.xml`.
- `sitemap.xml`: `/`, `/hakkimizda`, `/teslimat`, her aktif `/teslimat/<slug>`, yayımdaki yasal belgeler.
- `manifest.webmanifest` (`application/manifest+json`): `name`, `short_name` (12 karakterden uzunsa ilk kelime: "Ulusoy"), `description` (slogan), `lang: "tr"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `orientation: "portrait"`, `background_color: "#0B0B0C"`, `theme_color: "#0B0B0C"` (yeni palet), `categories`, `icons` (yukarıdaki dosya kuralları; hiçbiri yoksa `img/logo-yeni.png` 1254×1254, o da yoksa `img/logo.webp`). JSON-LD `logo`/`image`: ilk bulunan `img/icon-512.png`, `img/logo.png`, `img/logo-yeni.png`, `img/icon-192.png`, `img/logo.webp`.
- Mutlak adresler (`canonical`, `og:url`, `og:image`, sitemap) `PUBLIC_URL` ortam değişkeninden; yoksa isteğin `Host` başlığından üretilir. `PUBLIC_URL` yoksa `robots.txt` ve `sitemap.xml` `Cache-Control: no-cache` ile döner (Host'a göre değişen yanıt paylaşımlı önbellekte saklanmasın); varsa `public, max-age=3600`.
- Telegram sipariş mesajındaki panel bağlantısı yalnızca `PUBLIC_URL` verildiyse eklenir (Host başlığı müşterinin elinde olduğundan sahte alan adına yönlenen bağlantı üretilmez).
- Sondaki `/` atılarak yapılan yönlendirme (`/kvkk/` → `/kvkk`) her zaman site içinde kalır: `/%2Fevil.com/` gibi istekler `//evil.com`'a değil `/%2Fevil.com`'a yönlenir.

### Panel `/panel`

`/panel` ve `/panel/<her şey>` → `public/panel.html` (geçişler istemcide). `/panel.html` → `/panel` (301). Yanıta `X-Robots-Tag: noindex, nofollow` başlığı ve `</head>` öncesine `<meta name="robots" content="noindex, nofollow">` eklenir.

---

## 5. Güvenlik başlıkları ve CSP

Her yanıtta:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' data: blob:; manifest-src 'self'; worker-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), payment=(), usb=(), geolocation=(self)
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Strict-Transport-Security: max-age=31536000      (yalnızca HTTPS'te: TRUST_PROXY=1 ve vekil "X-Forwarded-Proto: https" gönderiyorsa)
```

**HTTPS yönlendirme:** `PUBLIC_URL` `https://` ile başlıyor **ve** `TRUST_PROXY=1` ise, `X-Forwarded-Proto` `https` olmayan her istek `PUBLIC_URL` + aynı yol/sorguya yönlenir: GET/HEAD `301`, diğerleri `308` (gövde korunur). Hedef her zaman `PUBLIC_URL`'dir (Host başlığı kullanılmaz; `//evil.com` gibi yollar site içinde kalır). Hariç: `Host` localhost/127.0.0.1/::1 olan istekler ve `/healthz`. `TRUST_PROXY` kapalıysa şema bilinemeyeceği için yönlendirme yapılmaz (sonsuz döngü olmasın) ve güvenlik durumu ucu uyarı verir. `FORCE_HTTPS=0` ile kapatılabilir.

**CSP:** değişmedi. `EventSource` aynı kökene bağlandığı için `connect-src 'self'` yeterlidir; ek izin gerekmez. Akış bileti ve canlı akış adresleri de `/api/…` altındadır.

Ön yüz için anlamı:

| İzinli | İzinsiz |
|---|---|
| Kendi alan adımızdan `.js` dosyaları (`<script src="/app.js">`), `type="module"` dahil | **Satır içi script** (`<script>…</script>`), `onclick="…"` gibi HTML olay öznitelikleri, `javascript:` bağlantıları, `eval`/`new Function`. Olayları `addEventListener` ile bağlayın |
| Kendi `.css` dosyalarımız, **satır içi stil** (`style="…"` özniteliği ve `<style>` etiketi), JS ile `el.style.x = …` | Dış CDN stil/yazı tipi (Google Fonts vb.) — yazı tiplerini `public/fonts/` altına koyun |
| Görsel: kendi alan adımız, `data:` (ör. SVG/PNG data URL, panelde seçilen dosyanın ön izlemesi), `blob:` (`URL.createObjectURL`) | Dış alan adından görsel (ör. https://… ürün görseli). Görseller yüklenip `/uploads/…` olur |
| Ses: kendi alan adımız, `data:`, `blob:`; Web Audio API (CSP'ye tabi değil) | — |
| `fetch`/XHR yalnızca kendi alan adımıza | Dış API çağrısı (Telegram sunucu tarafında yapılır) |
| `navigator.serviceWorker.register("/sw.js")` (aynı köken) | `<iframe>` (Google Maps gömme dahil — harita için `mapsUrl` bağlantısı verin), `<object>/<embed>` |
| `tel:`, `https://wa.me/…`, `mailto:` bağlantıları (gezinme CSP'ye tabi değil) | Sitenin başka sitede çerçeve içinde açılması |
| Konum (`geolocation`) yalnızca kendi sayfamızda | Kamera, mikrofon, Payment Request |

`<script type="application/ld+json">` veri bloğudur, CSP tarafından engellenmez (sunucu ekler; ön yüz eklemesin).

---

## 6. Statik dosyalar ve önbellek

- `public/` altındaki dosyalar olduğu gibi sunulur (doğrudan `.html` dosyaları hariç; `/` ve `/panel` özel). Nokta ile başlayan yollar ve dizin dışına çıkma engellenir. Bulunamayan uzantılı dosya → düz metin `404 Bulunamadı`; uzantısız yol → HTML 404 sayfası.
- `/uploads/…` → önce `DATA_DIR/uploads/`, sonra eski `public/uploads/`.
- Tüm statik dosyalarda `ETag` (boyut + değişiklik zamanı) ve `If-None-Match` → `304`.
- `Cache-Control`:

  | Yol | Değer |
  |---|---|
  | `.html`, `.js`, `.css`, `.json`, `.webmanifest` | `no-cache` (her açılışta ETag ile doğrulanır; dosya adlarına sürüm eklemek gerekmez) |
  | `/img/…` | `public, max-age=604800` (7 gün) — değişen görsele yeni ad verin |
  | `/fonts/…` | `public, max-age=2592000` |
  | `/uploads/…` | `public, max-age=2592000, immutable` (adlar benzersiz) |
  | Diğer | `public, max-age=86400` |
  | Sunucu sayfaları | `no-cache` + ETag |
  | API | `no-store` (ETag yok, 304 dönmez) |
  | SSE akışı | `no-cache, no-store, no-transform` + `X-Accel-Buffering: no`; sıkıştırılmaz |
  | Takip bağlantılı ana sayfa, `/siparis/<id>/belgeler` | `no-store` |

- MIME türleri: html, css, js/mjs, json, webmanifest, txt, xml, svg, png, jpg/jpeg, webp, avif, gif, ico, woff2, woff, ttf, mp3, ogg, wav.

---

## 7. Veri modeli (`db.json`)

`DATA_DIR/db.json` (varsayılan `./data`). Her değişiklikte atomik yazılır (geçici dosya → yeniden adlandırma).

```
meta        { schemaVersion: 3, upgradedAt, idCounters { … }, seedImages? { appliedAt, products, categories }, retention? { lastRun, lastRunAt, lastCount } }
settings {
  store        { name, slogan, phone, whatsapp, email, address, city, district, postalCode, mapsUrl, instagram, about }
  legal        { businessType, companyTitle, taxOffice, taxNo, mersis, kep, chamber, etbisNo, docs[], consents[], texts { kvkk, mesafeliSatis, iade, cerez } }
  hours        { days[7] { open, close, closed } }          // 0 = Pazartesi
  ordering     { enabled, pausedMessage, allowPreorder, minOrder, deliveryFee, freeDeliveryOver|null,
                 etaMinutes, pickupEnabled, payments { nakit, kart }, maxActiveOrdersPerPhone }
  zones[]      { id, name, slug, fee|null, minOrder|null, etaMinutes|null, active }
  announcement { text, active }
  banners[]    { id, title, text, image|null, link, active }
  faq[]        { id, q, a }
  notify       { telegramBotToken, telegramChatId, sound }
  blockedPhones[]
  privacy      { retentionDays|null (3650), archiveDays|null (730), phoneLookup (false), marketingConsent (false) }
}
// settings.legal ek alanları: chamber, etbisNo,
//   docs[]     { key, title, path, lead, text (boş = varsayılan şablon), active, marketing, updatedAt|null }
//   consents[] { key, label ([metin](belge) bağlantılı), required, docs[belge anahtarları], order, active, marketing }
legalArchive { "<sha256>": { key, title, text (mağaza bilgileriyle doldurulmuş, sipariş alanları yer tutucu), at, replacedAt? } }
categories[] { id, name, emoji, image|null, hidden, caymaDurumu }
products[]   { id, name, brand, description, price, oldPrice|null, unit, categoryId, image|null, emoji,
               barcode, soldOut, hidden, featured, stock|null, maxPerOrder|null, caymaDurumu|null, priceHistory[] { price, at, assumed? } }
orders[]     { id, token, createdAt, updatedAt, source, type, payment, changeFor|null,
               customer { name, phone, address, zoneId|null, zoneName }, note, substitution,
               items[] { productId, name, unit, price, qty }, subtotal, discount, couponCode|null, deliveryFee, total,
               status, history[] { status, at, by?, note? }, cancelNote, cancelledBy|null, adminNote, courier,
               preorder, consentAt|null, stockHeld { productId: adet },
               consent|null { at, ip, accepted[] { key, label, required, docs[] { key, title, version } }, declined[], snapshot { …onay anındaki kalemler/tutarlar } },
               confirmations[] { channel, result, at, by, note? }, returnRequests[] { id, at, message, items[], status, adminNote?, by?, updatedAt? },
               anonymizedAt? }   // items[] ayrıca brand, caymaDurumu
coupons[]    { id, code, type, value, minOrder, maxUses|null, usedCount, perPhoneLimit|null, startsAt|null, endsAt|null, active, description }
users[]      { id, username, name, role, passHash (scrypt), active, createdAt }
```

**Kimlikler asla tekrar kullanılmaz.** Yeni kayıt kimliği `meta.idCounters` içindeki kalıcı sayaçtan verilir (sayaç ile listedeki en büyük kimliğin büyüğü + 1). Silinen siparişin numarası yeni siparişe, silinen ürünün kimliği yeni ürüne verilmez (eski siparişlerin kalemleri, `stockHeld` stok kayıtları ve müşterinin cihazındaki favori / "tekrar al" listeleri başka ürüne kaymaz). Eski verilerde sayaçlar açılışta mevcut en büyük kimlikten başlatılır; yedek geri yüklenince sayaç geriye gitmez (mevcut ve yedekteki sayaçların büyüğü korunur). Bölge/afiş/SSS listeleri `PATCH /api/admin/settings` ile gönderilirken mevcut listede olmayan kimlikler yeni kayıt sayılır ve sayaçtan kimlik alır. `store.city/district/postalCode` (JSON-LD adresi için), `faq[].id` (toplu silme için), `orders[].source/preorder/consentAt/stockHeld`, `coupons[].description`, `users[].createdAt`.

Eski biçimli `db.json` açılışta otomatik yükseltilir; önce `backups/yukseltme-oncesi-<zaman>.json` kopyası alınır. **Şema 3 (2. revizyon):** eski `legal.texts` içindeki özel metinler aynı anahtarlı belgelere taşınır; kategorilere addan `caymaDurumu`, ürünlere `caymaDurumu: null`, `priceHistory: []`, siparişlere `consent: null`, `confirmations: []`, `returnRequests: []` eklenir. **Örnek veriden görsel tamamlama:** görseli olmayan ürün/kategori, `data/seed.json`'da aynı kimlik ve aynı ada (harf/Türkçe karakter duyarsız) sahip kaydın `/img/...` görselini alır; kullanıcının yüklediği görsele dokunulmaz; bir kez çalışır (`meta.seedImages`), örnek veride hiç görsel yoksa işaretlenmez. `/img/...` görselleri silme işlemlerinde diskten silinmez (yalnızca `/uploads/...` silinir). Siparişlerin `token`'ları korunur (takip bağlantıları çalışmaya devam eder), eksik alanlar varsayılanla dolar (`type: "teslimat"`, `payment: "nakit"`, `deliveryFee: 0`, `discount: 0`, `subtotal = total`, iptallerde `cancelledBy: "market"` …).

### Depoda şifreleme ve şifreli dosya biçimi

`DATA_KEY` ortam değişkeni (en az 16 karakter; `$(…)`/ters tırnak içeren, örnek/yer tutucu gibi görünen ya da çok tekdüze anahtar reddedilir) verilirse `db.json`, `sessions.json`, `audit.json` ve `backups/*.json` AES-256-GCM ile şifreli yazılır; açılışta şifresiz dosyalar (yedekler dahil) şifreliye çevrilir. Anahtar yoksa/yanlışsa ya da dosya kurcalanmışsa sunucu **açılmaz ve hiçbir dosyaya dokunmaz** (ayrıntı: DEPLOY.md). Panelden indirilen parolalı yedek aynı biçimi kullanır (anahtar `scrypt(parola)`).

```json
{"format":"ulusoy-sifreli","v":1,"alg":"aes-256-gcm","kdf":{"name":"scrypt","N":32768,"r":8,"p":1,"salt":"<16 bayt base64>"},
 "kcv":"<anahtar denetim değeri, 16 hex>","iv":"<12 bayt base64>","tag":"<16 bayt base64>","data":"<şifreli JSON, base64>"}
```

- Anahtar: `scrypt(DATA_KEY ya da parola, salt, N=32768, r=8, p=1)` → 32 bayt. `N` yalnızca 16384/32768/65536 olabilir (kaynak tüketme denemesine karşı).
- `kcv` = `HMAC-SHA256(anahtar, "ulusoy-kcv")` ilk 8 bayt: yanlış anahtarı "dosya bozulmuş"tan ayırmak için.
- Başlık alanları GCM'e ek doğrulanmış veri (AAD) olarak girer; IV her yazımda rastgele. Tek bayt değişse dosya açılmaz.
- Anahtar döndürme: `npm run anahtar-degistir` (DEPLOY.md).
