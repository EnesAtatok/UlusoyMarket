# Ulusoy Market — 2. Revizyon (müşteri geri bildirimi, 17 Kas 2026)

`docs/PLAN.md` geçerliliğini korur (kesin kurallar dahil: bağımlılıksız Node.js, alkol/tütün online satılmaz, Türkçe arayüz, veri kaybı yok, 3000 portu ve gerçek `data/db.json` testte kullanılmaz). Bu belge onun üzerine gelen değişiklikleri tanımlar. Dal: `revizyon-2`. Ajanlar commit/push yapmaz.

## Geri bildirim → iş

| # | Müşterinin söylediği | Yapılacak |
|---|---|---|
| 1 | Sipariş takip adımları kendiliğinden güncellenmiyor, sayfayı yenilemek gerekiyor | Hata yeniden üretilip düzeltilir. Canlı güncelleme SSE (Server-Sent Events) ile anlık; bağlantı koparsa yoklamaya düşer. Panelde yeni sipariş de SSE ile anlık gelir. |
| 2 | Ürün ve kategori görselleri internetten bulunup eklensin, fotoğrafsız ürün kalmasın | §A |
| 3 | Renk paleti kesinlikle beğenilmedi; yeni logo verildi | §B — palet yeni logodan: siyah + altın sarısı + beyaz |
| 4 | Arama (telefon) ve WhatsApp simgeleri değişsin | Resmî WhatsApp logosu (yeşil, tanınır hâli) ve net bir telefon simgesi; depoya SVG olarak alınır |
| 5 | Müşteri bilgisi panele uçtan uca şifreli mi ulaşıyor, güvenlik açığı var mı | §C |
| 6 | Karşılama alanı olmamış: saat çubuğu ayrıntısız, ay şekli saçma, alttaki kartlar dandik | §B |
| 7 | Çalışma saati panelden değişince çubuğun başında ve sonunda saatler yazsın (ör. sonunda 02:00) | §B |
| 8 | Logolar verilen logoyla değişsin | `public/img/logo-yeni.png` (1254×1254, siyah daire, altın çerçeve). Tüm logo/ikon/OG görselleri bundan üretilir; eski `logo.webp` ve turuncu ikonlar kaldırılır. |
| 9 | "Siparişlerim" cihaza özel olsun, burger-qr'daki gibi | §D |
| 10 | Yasal olarak onaylatılması gerekenler araştırılsın; müşteri onaylamadan sipariş veremesin | §E |

## A. Görseller (Ajan G)

- 136 ürünün ve 14 kategorinin tamamına görsel. Dosyalar depoda: `public/img/urun/<slug>.webp|jpg`, `public/img/kategori/<slug>.webp|jpg`; `data/seed.json` içinde `image` alanı `/img/urun/...`.
- Kaynak önceliği: (1) Open Food Facts (açık lisans, markalı ürün fotoğrafları), (2) Wikimedia Commons (meyve-sebze ve genel ürünler), (3) üreticinin kendi resmî sitesindeki ürün görseli. Başka marketlerin/pazaryerlerinin filigranlı ya da kendilerine ait görselleri kullanılmaz.
- Markalı üründe doğru marka ve doğru ürün (gramaj/çeşit mümkün olduğunca); bulunamazsa aynı ürün türünün markasız, temiz bir görseli. Yanlış marka görseli konmaz.
- Kare, ürün ortada, en fazla 600 px, dosya başına ~80 KB altı. Her görsele gözle bakılır.
- `docs/GORSEL-KAYNAKLARI.md`: her dosya için kaynak adresi ve lisans/sahiplik notu.
- `lib/` dosyalarına dokunulmaz.

## B. Tasarım (Ajan B mağaza, Ajan C panel)

**Palet (yeni logodan):** siyah / kömür (`#0B0B0C` civarı) + altın sarısı (`#F5B301`–`#FFC61A` aralığı) + beyaz. Turuncu ve lacivert tamamen kalkar. Altın zemin üzerinde yazı siyah. Ürün alanları açık temada beyaz/çok açık sıcak gri, yazılar siyah, vurgular altın; üst şerit, karşılama ve alt bilgi siyah. Karanlık tema: siyah zemin, altın vurgu. WCAG AA korunur. Panel de aynı palete geçer.

**Karşılama alanı baştan:** ay şekli ve yıldız noktaları kalkar. Logo belirgin. Kısa başlık, tek ana eylem (alışverişe başla) + WhatsApp ve telefon. "Gece de açık" fikri süslemeyle değil bilgiyle anlatılır.

**Çalışma saati göstergesi baştan:** panelde girilen saatleri birebir yansıtır. Açılış ve kapanış saati çubuğun dolu kısmının başında ve sonunda etiket olarak yazar (ör. `12:00` … `02:00`); şu anki saat işaretlidir; "kapanışa 1 sa 20 dk" / "açılışa 3 sa" gibi kalan süre yazar; gece yarısını aşan aralık doğru çizilir; kapalı gün ve "sipariş alımı durduruldu" durumları ayrı gösterilir. Haftanın diğer günleri açılır bir listede görülebilir. Saatler `/api/store` yanıtından gelir; panelde değişince sayfa yenilenmeden (durum yenilemesiyle) güncellenir.

**Afiş kartları baştan:** hilal süsü kalkar; görselli/görselsiz iki durumda da özenli, yeni palete uygun.

**Simgeler:** WhatsApp resmî glifi (yeşil daire/beyaz telefonlu konuşma balonu) ve net telefon ahizesi; üst şeritte, karşılamada, alt bilgide, takip ekranında ve panelde aynı dosyalar.

**Ürün kartları** artık gerçek fotoğraflı: beyaz zeminli ürün fotoğrafı için kart düzeni gözden geçirilir (fotoğraf `contain`, taşma yok); kategori kartları kategori görselini kullanır.

## C. Güvenlik ve gizlilik (Ajan A)

Gerçek durum belgelenir ve iyileştirilir. "Uçtan uca şifreleme" bu tür bir sistemde uygulanamaz (sunucu siparişi işlemek zorunda); doğru hedef: yolda şifreleme + depoda şifreleme + en az veri.

- **Yolda:** `PUBLIC_URL` `https://` ise HTTP istekleri HTTPS'e yönlenir (vekil arkasında `X-Forwarded-Proto`), HSTS başlığı gönderilir. Açılış günlüğünde ve panelde HTTPS'siz çalışılıyorsa uyarı (localhost hariç).
- **Depoda:** `DATA_KEY` ortam değişkeni verilirse `db.json`, `sessions.json` ve tüm yedekler AES-256-GCM ile şifreli yazılır; anahtarsız eski dosya açılışta şifreliye çevrilir; yanlış/eksik anahtarla sunucu açılmaz ve dosyaya dokunmaz. Panelden indirilen yedek için ayrı bir parola ile şifreleme seçeneği. Anahtar kaybının veri kaybı demek olduğu belgelerde açıkça yazılır. `DATA_KEY` yoksa bugünkü gibi çalışır ve panelde "müşteri verisi şifresiz saklanıyor" uyarısı çıkar.
- **En az veri / saklama süresi:** ayarlanabilir süre (varsayılan 2 yıl) sonunda tamamlanmış siparişlerde ad, telefon, adres, not anonimleştirilir (ciro ve ürün verisi kalır). Panelde "bu müşterinin verilerini sil/anonimleştir" (KVKK başvurusu için) ve müşterinin verilerini dışa aktar.
- **Denetim kaydı:** panelde kim hangi siparişi/ayarı/kullanıcıyı ne zaman değiştirdi (son N kayıt), yönetici görür.
- Bu değişikliklerin tamamı için saldırı denemeli testler; önceki güvenlik testleri geçmeye devam eder.

## D. Cihaza özel "Siparişlerim" (Ajan A + B)

Örnek: `C:\Users\kerem\burger-qr` deposundaki müşteri tarafı "siparişlerim / sipariş takibi" akışı — önce o incelenir, aynı mantık ve kullanım hissi uyarlanır (kod kopyalanmaz; o proje Fastify/Next.js, bu proje bağımlılıksız).

- Siparişler cihazda saklanan gizli anahtarlarla (sipariş `token`'ı) bağlıdır; "Siparişlerim" yalnızca bu cihazdan verilenleri gösterir, her birinin canlı durumuyla.
- Numara + telefonla sorgu (başka cihazdan) kaldırılmaz ama panelde bir ayara bağlanır ve **varsayılan kapalı** olur (kapalıyken uç nokta 404 döner). Başka cihazdan takip için sipariş onay ekranında kopyalanabilir/paylaşılabilir gizli takip bağlantısı (`/?siparis=<id>&t=<token>`) verilir; bağlantı açılınca sipariş o cihazın listesine eklenir.
- Müşteri iptali yalnızca `token` ile yapılabilir (telefonla iptal kalkar).

## E. Yasal onaylar (Ajan Y araştırır → A ve B uygular)

Ajan Y güncel Türk mevzuatını kaynaklarıyla araştırır ve `docs/YASAL.md` yazar: mesafeli satışta (6502 sayılı Kanun, Mesafeli Sözleşmeler Yönetmeliği), KVKK'da (aydınlatma ≠ açık rıza), ticari elektronik iletide (6563, İYS), çerezlerde, yaş sınırında, cayma hakkı ve istisnalarında (çabuk bozulan/gıda), ETBİS ve işletme bilgisi gösterme yükümlülüklerinde bir mahalle marketinin online siparişte neyi **göstermek**, neyi **onaylatmak**, neyi **kayıt altında tutmak** zorunda olduğu; hangi onayların ayrı ve işaretsiz gelmesi gerektiği; metinlerin tam Türkçe taslakları (yer tutuculu); ve işletmeyi/yazılımı yapanı koruyan ek metinler (kullanım koşulları, sorumluluk sınırları, sahte sipariş, ürün değişimi, fiyat hatası).

Uygulama (araştırma sonucuna göre kesinleşir; asgari):
- Sipariş formunda zorunlu ve ayrı onaylar (ön işaretli gelmez), her biri tam metne bağlantılı; isteğe bağlı pazarlama izni ayrı.
- Sipariş onayından önce ön bilgilendirme özeti (satıcı, ürünler, toplam, teslimat, ödeme, cayma hakkı durumu) gösterilir.
- Her siparişle birlikte onay kaydı saklanır: hangi metinler, metin sürümü (özet değeri), zaman, IP. Panelde sipariş ayrıntısında görülür; siparişin o andaki sözleşme metni sonradan görüntülenebilir/yazdırılabilir.
- Yasal metinler panelden düzenlenebilir kalır; metin değişince sürüm değişir.
- İşletme bilgileri (unvan, vergi no, MERSİS, adres, iletişim) eksikken panelde "canlıya çıkmadan önce doldurun" uyarısı.

## Sıra

1. Paralel: **Ajan Y** (yasal araştırma, yalnızca `docs/YASAL.md`), **Ajan G** (görseller), **Ajan A** (backend: SSE, §C, §D, onay kaydı altyapısı, saat verisi, eksik görselleri seed'den tamamlama).
2. Paralel: **Ajan B** (mağaza: palet, karşılama, saat göstergesi, afişler, simgeler, logo/ikonlar, canlı takip, cihaza özel siparişlerim, onay akışı) ve **Ajan C** (panel: palet, logo, yeni ayarlar ve ekranlar).
3. **Ajan D**: uçtan uca test, güvenlik denemeleri, belgeler, ekran görüntüleri.
