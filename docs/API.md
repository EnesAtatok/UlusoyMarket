# Ulusoy Market — API ve Sunucu Sözleşmesi

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
- **Hız sınırları** (IP başına, bellekte; aşılırsa `429` + `Retry-After` başlığı + `retryAfter` alanı, kod `HIZ_SINIRI`):

  | Ne | Sınır |
  |---|---|
  | Hatalı panel girişi | 15 dakikada 8 (doğru şifre de bu sürede reddedilir) |
  | `POST /api/orders` (her deneme sayılır) | 10 dakikada 10 |
  | Telefonla sipariş sorgusu / iptali (`?phone=`) | 10 dakikada 30 (takip anahtarı tutmayan her telefon denemesi sayılır; yanlış `token` eklemek sınırı atlatmaz) |

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
| `ONAY` | 400 | KVKK / mesafeli satış onayı verilmedi |
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
  "legal": { "companyTitle": "", "taxOffice": "", "taxNo": "", "mersis": "", "kep": "" },
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
  "kvkk": true,
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
| `kvkk` | evet | Tam olarak `true` olmalı (KVKK + mesafeli satış onay kutusu) |
| `website` | — | **Gizli alan (honeypot).** Formda görünmez bir `<input name="website" tabindex="-1" autocomplete="off">` olarak bulunur ve boş gönderilir. Doluysa sunucu sipariş oluşturmadan `201 {"id":0,…}` döner |
| `items[]` | evet | `{ productId, qty }` |

Denetim sırası: honeypot → hız sınırı → mağaza durumu (`KAPALI`/`DURDURULDU`; ön sipariş açıksa kapalı saatte kabul) → gel-al açık mı → ad/telefon/adres → ödeme → not → KVKK → engelli telefon (`403 ENGELLI`) → telefon başına aktif ("Yeni", "Hazırlanıyor", "Yolda") sipariş sınırı (`429 AKTIF_SINIR`) → ürünler (`409 TUKENDI`/`SATISTA_DEGIL`/`ADET_SINIRI`, `400 GECERSIZ_ADET`) → bölge/minimum (`400`) → kupon (`400 KUPON`) → para üstü.

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

`id` + `token` cihazda saklanır (takip için). Örnek hatalar:

```json
{ "error": "Minimum sipariş tutarı 200 ₺. Sepetinize 153,5 ₺ daha ekleyin.", "code": "MIN_TUTAR", "quote": { "…": "…" } }
{ "error": "Şu an kapalıyız. Online sipariş bugün 14:00'te yeniden açılır.", "code": "KAPALI" }
{ "error": "\"Domates\" tükendi. Sepetinizden çıkarıldı, lütfen tekrar kontrol edin.", "code": "TUKENDI", "quote": { "…": "…" } }
{ "error": "Bu telefon numarasıyla online sipariş verilemiyor. Lütfen marketi arayın.", "code": "ENGELLI" }
{ "error": "Devam etmek için KVKK aydınlatma metnini ve mesafeli satış sözleşmesini onaylayın.", "code": "ONAY" }
```

Sipariş alınınca stok (takip ediliyorsa) düşer, kupon kullanım sayısı artar, Telegram ayarlıysa bildirim gider (hata siparişi engellemez).

### `GET /api/orders/:id?token=…` ya da `?phone=…` — Herkes

Sipariş takibi. `token` (aynı cihaz) ya da telefon (başka cihazdan sorgu; son 10 hane karşılaştırılır, `0532…`, `532…`, `+90 532…` hepsi olur). Önce `token` denenir; tutmazsa ve `phone` verilmişse telefonla eşleştirilir ve bu deneme hız sınırına sayılır. Yanıt, `POST /api/orders` yanıtındaki `order` nesnesiyle aynı şekildedir (yukarıya bakın); `token` her zaman döner (telefonla bulunan sipariş cihazda hatırlanabilsin). Müşterinin telefonu ve adresi **dönmez**.

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

Bulunamazsa `404 {"error":"Sipariş bulunamadı. Numara ve telefonu kontrol edin.","code":"BULUNAMADI"}`.

### `POST /api/orders/:id/cancel` — Herkes

Müşteri iptali; yalnızca `"Yeni"` durumunda. Gövde: `{ "token": "…" }` ya da `{ "phone": "05…" }`, isteğe bağlı `"reason"` (en fazla 200 karakter, panelde geçmişte görünür).

Yanıt `200`: güncel takip nesnesi (`"status": "İptal"`, `"statusLabel": "İptal"`, `"cancelledBy": "musteri"`, `"canCancel": false`). Stok ve kupon kullanımı geri alınır; Telegram'a bildirim gider.

Hatalar: `404 BULUNAMADI`; `409 IPTAL_EDILMIS` ("Bu sipariş zaten iptal edilmiş."); `409 IPTAL_EDILEMEZ` ("Siparişiniz hazırlanmaya başladığı için buradan iptal edilemiyor. Lütfen marketi arayın.").

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

Giriş hız sınırı: IP başına 15 dakikada 8 deneme. Deneme, şifre denetiminden önce sayılır (aynı anda gönderilen istekler sınırı aşamaz); başarılı giriş sayacı sıfırlar. Kullanıcı başına en fazla 20 açık oturum tutulur; yeni giriş en eski oturumu kapatır.

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

| Yöntem | Yol | Yetki | Gövde / Not | Yanıt |
|---|---|---|---|---|
| GET | `/api/admin/products` | Personel | — | Tüm ürünler (gizliler dahil), sıralı dizi |
| POST | `/api/admin/products` | Yönetici | Zorunlu: `name` (≤120), `price` (>0), `categoryId`. İsteğe bağlı: `brand`, `description` (≤1000), `oldPrice`, `unit` (varsayılan `adet`), `emoji`, `barcode` (harf/rakam/-, tekil), `soldOut`, `hidden`, `featured`, `stock`, `maxPerOrder`, `image` (data URL, `/uploads/…` yolu ya da `null`) | `201` ürün |
| PATCH | `/api/admin/products/:id` | Personel* | Yalnızca gönderilen alanlar değişir. `image: null` görseli kaldırır | `200` ürün |
| DELETE | `/api/admin/products/:id` | Yönetici | — | `{ "ok": true }` |
| POST | `/api/admin/products/:id/duplicate` | Yönetici | — | `201` kopya: ad sonuna " (kopya)", barkod boş, **gizli**, asıl ürünün hemen arkasında |
| POST | `/api/admin/products/bulk` | Personel* | `{ "ids": [..], "action": "…", "categoryId"?, "percent"? }` | Toplu yanıt |
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

```json
// POST /api/admin/products/bulk  {"ids":[137,9999],"action":"price","percent":10}
{ "processed": 1, "skipped": [ { "id": 9999, "reason": "Ürün bulunamadı." } ] }
```

#### CSV dışa aktarma

`GET /api/admin/products/export` → `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="urunler-2026-11-16.csv"`. UTF-8 BOM ile başlar, ayraç `;`, satır sonu CRLF, ondalık virgül (`46,5`), mantıksal alanlar `Evet`/`Hayır`. `=`, `+`, `-`, `@` ile başlayan metinlerin başına `'` eklenir (Excel formül koruması). Başlık:

```
ID;Barkod;Ürün adı;Marka;Kategori;Fiyat;Eski fiyat;Birim;Stok;Sipariş başına en fazla;Tükendi;Gizli;Öne çıkan;Açıklama;Emoji
```

#### CSV içe aktarma

- Ayraç otomatik (`;`, `,` ya da sekme), BOM ve tırnaklı alanlar desteklenir.
- Başlık adları Türkçe karakter/büyük harf duyarsız eşleşir; yukarıdaki başlıklar ve `barkod`, `ad`, `urun`, `fiyat`, `satis fiyati`, `stok`, `reyon` gibi eşanlamlılar tanınır. `ID` sütunu yok sayılır.
- Eşleştirme: önce **barkod**, yoksa **ürün adı** (harf duyarsız). Eşleşen ürün güncellenir; yalnızca dosyada **dolu** olan alanlar değişir (boş hücre = dokunma; `Stok`, `Sipariş başına en fazla` ve `Eski fiyat` hücresi boşsa `null` yapılır). Eşleşme yoksa yeni ürün eklenir (ad, fiyat, kategori zorunlu). Bilinmeyen kategori adı yeni kategori olarak oluşturulur.
- Hatalı satırlar atlanır, diğerleri işlenir. `dryRun: true` ise hiçbir şey kaydedilmez, aynı rapor döner.

```json
{ "added": 1, "updated": 1, "unchanged": 0, "createdCategories": [], "errors": [ { "row": 3, "message": "Yeni ürün için fiyat gerekli." } ], "dryRun": true }
```

`row` = dosyadaki satır numarası (başlık 1. satır).

### Kategoriler

Kategori: `{ "id", "name", "emoji", "image", "hidden", "productCount" }` (`productCount` yalnızca yanıtta).

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
  "statusLabel": "Hazırlanıyor"
}
```

- `source`: `"web"` \| `"panel"` (elle girilen). `consentAt`: KVKK onay zamanı (panel siparişinde `null`).
- `history[]`: `{ status, at, by?, note? }`. `by` = işlemi yapan kullanıcı adı ya da `"musteri"`. `note` = müşteri iptal nedeni ya da `"Kalemler düzenlendi: …"`. Kalem düzenlemesi durum değiştirmeden geçmişe yazılır (aynı `status` ile), bu satırları "not" olarak gösterin.
- `substitution`: `ara` = "Beni arayın", `benzer` = "Benzeriyle değiştirin", `cikar` = "Siparişten çıkarın".
- Eski (yükseltilmiş) siparişlerde `customer.zoneId` `null`, `zoneName` `""`, `source` `"web"`, `consentAt` yok olabilir.

| Yöntem | Yol | Yetki | Not |
|---|---|---|---|
| GET | `/api/admin/orders` | Personel | Liste (aşağıda) |
| GET | `/api/admin/orders/:id` | Personel | Tek sipariş; `404` "Sipariş bulunamadı." |
| POST | `/api/admin/orders` | Personel | Elle (telefonla gelen) sipariş |
| PATCH | `/api/admin/orders/:id` | Personel | Durum / iptal notu / yönetici notu / kurye |
| PUT | `/api/admin/orders/:id/items` | Personel | Kalem düzenleme |
| POST | `/api/admin/orders/bulk` | Personel (silme: Yönetici) | Toplu durum / toplu silme |
| GET | `/api/admin/orders/export` | Yönetici | CSV |

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

```json
{
  "customers": [
    { "phone": "05551234567", "name": "Mehmet Kaya", "address": "", "zoneName": "", "orderCount": 0, "cancelledCount": 1, "totalSpent": 0,
      "firstOrderAt": "2026-11-16T18:00:00.000Z", "lastOrderAt": "2026-11-16T18:00:00.000Z", "lastOrderId": 2, "blocked": false }
  ],
  "total": 1, "page": 1, "pageSize": 100, "pages": 1
}
```

`orderCount` ve `totalSpent` iptal edilmeyen siparişlerden; `address`/`zoneName` son dolu değer.

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
| GET | `/api/admin/settings/legal-templates` | `{ "kvkk", "mesafeliSatis", "iade", "cerez" }` varsayılan şablon metinleri (yasal metin alanı boşken panelde ön izleme / "şablonu yükle" için) |
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
| `legal` | `companyTitle` ≤200, `taxOffice` ≤100, `taxNo` ≤20, `mersis` ≤30, `kep` ≤120; `texts.{kvkk,mesafeliSatis,iade,cerez}` ≤30000 (boşsa şablon kullanılır) |
| `hours` | `days` tam 7 öğe (0 = Pazartesi), her biri `{ open: "SS:DD", close: "SS:DD", closed: bool }` |
| `ordering` | `enabled`, `allowPreorder`, `pickupEnabled` bool; `pausedMessage` ≤300; `minOrder`, `deliveryFee` ≥ 0; `freeDeliveryOver` ≥ 0 ya da `null`; `etaMinutes` 5–600; `payments.{nakit,kart}` en az biri true; `maxActiveOrdersPerPhone` 1–50 |
| `zones` | En fazla 100. Her öğe `{ id?, name (zorunlu ≤80), slug?, fee|null, minOrder|null, etaMinutes|null, active }`. `slug` verilmezse addan üretilir (`"Yeni Mahalle Çarşı"` → `yeni-mahalle-carsi`), çakışırsa `-2` eklenir. `id` verilmeyen yeni bölgeye yeni id atanır. Mevcut bölgeyi güncellerken `id`'yi geri gönderin |
| `announcement` | `{ text ≤300, active }` |
| `banners` | En fazla 20. `{ id?, title ≤100, text ≤300, image (null ya da /uploads/… ya da /img/…), link ("", /…, #…, https://…), active }`; başlık/metin/görselden biri zorunlu. Görsel önce `POST /api/admin/uploads` ile yüklenir |
| `faq` | En fazla 50. `{ id?, q ≤200 (zorunlu), a ≤2000 (zorunlu) }`; yeni maddelere id atanır |
| `notify` | `telegramBotToken` (`123456:ABC…` biçimi) ya da boş; `telegramChatId` (sayı, `-100…` ya da `@kanal`) ya da boş; `sound` bool (panel sesli uyarı tercihi) |
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
| GET | `/api/admin/backup` | Tüm veri (`db.json`'ın tamamı, kullanıcı şifre özetleri dahil; oturumlar hariç), `ulusoy-market-yedek-YYYY-AA-GG.json` olarak indirilir |
| POST | `/api/admin/restore` | Gövde: indirilen yedek dosyasının içeriği (ya da `{ "data": <yedek> }`). Önce mevcut veri `backups/geri-yukleme-oncesi-….json` olarak yedeklenir, yedek yükseltilir ve yüklenir. **Tüm oturumlar kapanır** → panel giriş ekranına dönmeli. Yanıt: `{ "ok": true, "backup": "geri-yukleme-oncesi-….json", "relogin": true, "counts": { "products", "categories", "orders" } }`. Tanınmayan dosya → `400` "Yedek dosyası tanınmadı. Panelden indirilen .json yedeği seçin." Bozuk içerik (aynı kimlik iki kez, geçersiz fiyat/tarih/rol, eksik müşteri bilgisi, ayarlarda geçersiz saat/ücret/bağlantı …) → `400 DOGRULAMA` "Yedek dosyası okunamadı: <neden>" ya da "Yedek dosyasındaki ayarlar geçersiz: <neden>"; bu durumda mevcut veriye dokunulmaz. Kimlik sayaçları geriye gitmez (bkz. §7). |
| GET | `/api/admin/backups` | Sunucudaki otomatik yedekler: `[ { "name", "size", "createdAt" } ]` (en yeni üstte) |
| GET | `/api/admin/backups/:name` | O yedeği indirir |

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

### Görsel dosya kuralları (Ajan B ekleyebilir)

Sunucu bu dosyaları **varsa** kullanır, yoksa `/img/logo.webp`'ye düşer:

| Dosya | Kullanıldığı yer |
|---|---|
| `public/img/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Manifest ikonları (maskable olan `purpose: "maskable"`); `icon-192.png` ayrıca sunucu sayfalarında favicon/apple-touch-icon |
| `public/img/favicon.png` ya da `favicon.svg` | `icon-192.png` yoksa sunucu sayfalarında favicon |
| `public/img/og.jpg` (ya da `.png`/`.webp`, önerilen 1200×630) | `og:image` (ana sayfa ve tüm sunucu sayfaları) |

### Yasal ve bilgi sayfaları

| Adres | İçerik | `body` sınıfı |
|---|---|---|
| `/kvkk` | KVKK Aydınlatma Metni | `page page-legal` |
| `/mesafeli-satis` | Mesafeli Satış Sözleşmesi | `page page-legal` |
| `/iade-kosullari` | İade ve Değişim Koşulları | `page page-legal` |
| `/cerez-politikasi` | Çerez Politikası | `page page-legal` |
| `/hakkimizda` | `store.about` + iletişim, saatler, bölgeler | `page page-about` |
| `/teslimat` | Aktif bölgelerin listesi | `page page-zones-index` |
| `/teslimat/<slug>` | Bölge tanıtımı (yalnızca aktif bölgeler; diğerleri 404) | `page page-zone` |
| (bulunamayan her sayfa) | 404 sayfası, `noindex` | `page page-notfound` (`data-status="404"`) |

Yasal metin: ayarlardaki metin boşsa varsayılan şablon kullanılır. Metinlerde `{{unvan}}`, `{{magaza}}`, `{{adres}}`, `{{telefon}}`, `{{eposta}}`, `{{kep}}`, `{{mersis}}`, `{{vergiDairesi}}`, `{{vergiNo}}`, `{{websitesi}}` yer tutucuları ayarlardan doldurulur; boş olanlar `[…]` olarak görünür. Metin biçimi (panelde kullanıcıya anlatın): boş satır = yeni paragraf, `## ` ile başlayan satır = ara başlık, `- ` ile başlayan satırlar = madde listesi; tek satır sonu `<br>` olur. HTML yazılamaz (kaçışlanır).

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
<meta name="theme-color" content="#F97330">
<link rel="icon" href="/img/logo.webp">
<link rel="apple-touch-icon" href="/img/logo.webp">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/style.css">
</head>
<body class="page page-legal">
<a class="skip-link" href="#icerik">İçeriğe geç</a>
<header class="page-header">
  <div class="page-header-inner">
    <a class="page-brand" href="/"><img class="page-logo" src="/img/logo.webp" alt="" width="40" height="42"><span class="page-brand-name">Ulusoy Market</span></a>
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

Sınıf listesi (style.css'te karşılanmalı): `page`, `page-legal`, `page-about`, `page-zone`, `page-zones-index`, `page-notfound`, `skip-link`, `page-header`, `page-header-inner`, `page-brand`, `page-logo`, `page-brand-name`, `page-cta`, `page-main`, `page-breadcrumb`, `page-article`, `page-title`, `page-lead`, `page-content` (içinde düz `h2`, `p`, `ul`, `li`), `page-section`, `store-info`, `zone-facts`, `info-list`, `info-item` (içinde `dt`, `dd`), `info-link`, `page-actions`, `page-button`, `page-button-ghost`, `page-zones`, `zone-links`, `zone-cards`, `zone-card`, `zone-card-name`, `zone-card-meta`, `page-footer`, `page-footer-inner`, `page-footer-contact`, `page-footer-address`, `page-footer-hours`, `page-footer-links`, `page-footer-legal`.

Karanlık tema: sayfalar tema düğmesi içermez; `style.css` `prefers-color-scheme` ile uyum sağlamalıdır (sunucu sayfalarında `localStorage` tema tercihi okunamaz, çünkü JS yoktur).

### `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`

- `robots.txt`: `Allow: /`, `Disallow: /panel`, `Disallow: /api/`, `Sitemap: <taban>/sitemap.xml`.
- `sitemap.xml`: `/`, `/hakkimizda`, `/teslimat`, her aktif `/teslimat/<slug>`, dört yasal sayfa.
- `manifest.webmanifest` (`application/manifest+json`): `name`, `short_name` (12 karakterden uzunsa ilk kelime: "Ulusoy"), `description` (slogan), `lang: "tr"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `orientation: "portrait"`, `background_color: "#FFFFFF"`, `theme_color: "#F97330"`, `categories`, `icons` (yukarıdaki dosya kuralları; hiçbiri yoksa `{ "src": "/img/logo.webp", "sizes": "873x924", "type": "image/webp" }`).
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
  | API | `no-store` |

- MIME türleri: html, css, js/mjs, json, webmanifest, txt, xml, svg, png, jpg/jpeg, webp, avif, gif, ico, woff2, woff, ttf, mp3, ogg, wav.

---

## 7. Veri modeli (`db.json`)

`DATA_DIR/db.json` (varsayılan `./data`). Her değişiklikte atomik yazılır (geçici dosya → yeniden adlandırma).

```
meta        { schemaVersion: 2, upgradedAt, idCounters { orders, products, categories, coupons, users, zones, banners, faq } }
settings {
  store        { name, slogan, phone, whatsapp, email, address, city, district, postalCode, mapsUrl, instagram, about }
  legal        { companyTitle, taxOffice, taxNo, mersis, kep, texts { kvkk, mesafeliSatis, iade, cerez } }
  hours        { days[7] { open, close, closed } }          // 0 = Pazartesi
  ordering     { enabled, pausedMessage, allowPreorder, minOrder, deliveryFee, freeDeliveryOver|null,
                 etaMinutes, pickupEnabled, payments { nakit, kart }, maxActiveOrdersPerPhone }
  zones[]      { id, name, slug, fee|null, minOrder|null, etaMinutes|null, active }
  announcement { text, active }
  banners[]    { id, title, text, image|null, link, active }
  faq[]        { id, q, a }
  notify       { telegramBotToken, telegramChatId, sound }
  blockedPhones[]
}
categories[] { id, name, emoji, image|null, hidden }
products[]   { id, name, brand, description, price, oldPrice|null, unit, categoryId, image|null, emoji,
               barcode, soldOut, hidden, featured, stock|null, maxPerOrder|null }
orders[]     { id, token, createdAt, updatedAt, source, type, payment, changeFor|null,
               customer { name, phone, address, zoneId|null, zoneName }, note, substitution,
               items[] { productId, name, unit, price, qty }, subtotal, discount, couponCode|null, deliveryFee, total,
               status, history[] { status, at, by?, note? }, cancelNote, cancelledBy|null, adminNote, courier,
               preorder, consentAt|null, stockHeld { productId: adet } }
coupons[]    { id, code, type, value, minOrder, maxUses|null, usedCount, perPhoneLimit|null, startsAt|null, endsAt|null, active, description }
users[]      { id, username, name, role, passHash (scrypt), active, createdAt }
```

**Kimlikler asla tekrar kullanılmaz.** Yeni kayıt kimliği `meta.idCounters` içindeki kalıcı sayaçtan verilir (sayaç ile listedeki en büyük kimliğin büyüğü + 1). Silinen siparişin numarası yeni siparişe, silinen ürünün kimliği yeni ürüne verilmez (eski siparişlerin kalemleri, `stockHeld` stok kayıtları ve müşterinin cihazındaki favori / "tekrar al" listeleri başka ürüne kaymaz). Eski verilerde sayaçlar açılışta mevcut en büyük kimlikten başlatılır; yedek geri yüklenince sayaç geriye gitmez (mevcut ve yedekteki sayaçların büyüğü korunur). Bölge/afiş/SSS listeleri `PATCH /api/admin/settings` ile gönderilirken mevcut listede olmayan kimlikler yeni kayıt sayılır ve sayaçtan kimlik alır. `store.city/district/postalCode` (JSON-LD adresi için), `faq[].id` (toplu silme için), `orders[].source/preorder/consentAt/stockHeld`, `coupons[].description`, `users[].createdAt`.

Eski biçimli `db.json` açılışta otomatik yükseltilir; önce `backups/yukseltme-oncesi-<zaman>.json` kopyası alınır. Siparişlerin `token`'ları korunur (takip bağlantıları çalışmaya devam eder), eksik alanlar varsayılanla dolar (`type: "teslimat"`, `payment: "nakit"`, `deliveryFee: 0`, `discount: 0`, `subtotal = total`, iptallerde `cancelledBy: "market"` …).
