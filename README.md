# UlusoyMarket

Mahalle marketleri için web tabanlı sipariş uygulaması. Müşteriler ürünleri kategorilere göre inceleyip sepete ekler ve adres, isim, telefon bilgileriyle sipariş verir. Market sahibi admin panelinden ürünleri, siparişleri ve ciroyu yönetir.

Telefon, tablet ve bilgisayarda çalışır. Kurulum gerektirmez, yalnızca [Node.js](https://nodejs.org) (v18+) yeterlidir. Harici paket kullanılmaz.

## Çalıştırma

```bash
node server.js
```

Windows'ta `Marketi Baslat.bat` dosyasına çift tıklamak da yeterli. Sunucu açılır, mağaza ve admin paneli tarayıcıda otomatik açılır.

| Sayfa | Adres |
|---|---|
| Mağaza | http://localhost:3000 |
| Admin paneli | http://localhost:3000/panel |

Varsayılan admin şifresi `admin123`. **Gerçek kullanımda mutlaka değiştirin:**

```bash
# Windows (PowerShell)
$env:ADMIN_PASSWORD="guclu-bir-sifre"; node server.js
# macOS / Linux
ADMIN_PASSWORD="guclu-bir-sifre" node server.js
```

Port değiştirmek için `PORT` ortam değişkeni kullanılır (varsayılan 3000).

## Özellikler

**Müşteri tarafı**
- Kategorilere ayrılmış ürün listesi, kategori filtresi ve arama
- Sepet (sayfa yenilense de korunur)
- Sipariş formu: ad soyad, telefon (0 ile başlayan 11 hane), adres (en fazla 250 karakter / 5 satır). Hatalı karakterler yazılamaz.
- Sipariş takibi: Alındı → Hazırlanıyor → Yolda → Teslim edildi
- "Siparişlerim": aktif siparişler üstte, geçmiş siparişler açılır bölümde
- Başka cihazdan sipariş no + telefon ile sorgulama
- İptal edilen siparişlerde marketin notu müşteriye gösterilir

**Admin paneli**
- **Ürünler:** kategori gruplu liste, fotoğraflı ürün ekleme/düzenleme, *Satışta/Tükendi* ve *Gizle/Göster* tuşları, sürükle-bırak sıralama (fare ve dokunmatik), kategori yönetimi
- **Siparişler:** durum değiştirme, iptal ederken müşteriye not yazma, filtre ve arama
- **Ciro:** günlük ürün bazlı satış dökümü; haftalık, aylık, yıllık toplam ciro

## Yapı

| Dosya | İçerik |
|---|---|
| `server.js` | HTTP sunucu ve REST API (bağımlılıksız) |
| `public/index.html`, `app.js`, `style.css` | Mağaza (müşteri tarafı) |
| `public/panel.html`, `admin.js`, `admin.css` | Admin paneli |
| `data/seed.json` | Örnek ürün ve kategoriler |
| `data/db.json` | Canlı veriler. İlk çalıştırmada `seed.json`'dan oluşturulur, depoya eklenmez. |
| `public/uploads/` | Yüklenen ürün fotoğrafları (depoya eklenmez) |

Örnek verilere dönmek için: `npm run reset`

## Sınırlamalar (prototip)

- Veriler tek bir JSON dosyasında tutulur. Yoğun kullanım için gerçek bir veritabanına geçilmelidir.
- Admin oturumları bellekte tutulur, sunucu yeniden başlarsa tekrar giriş gerekir.
- Ödeme entegrasyonu yoktur, kapıda ödeme varsayılır.
- İnternette yayınlanacaksa HTTPS arkasında çalıştırılmalıdır.
