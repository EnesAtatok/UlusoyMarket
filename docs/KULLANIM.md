# Ulusoy Market — Kullanım Kılavuzu

Bu kılavuz market sahibi ve çalışanlar içindir. Teknik bilgi gerekmez. Ekran görüntüleri `docs/ekranlar/` klasöründedir.

- **Mağaza (müşterilerin gördüğü site):** `https://<alan-adınız>` (bilgisayarda deneme için `http://localhost:3000`)
- **Yönetim paneli (sizin kullandığınız ekran):** aynı adresin sonuna `/panel` ekleyin

Panel telefonda, tablette ve bilgisayarda çalışır. Telefonda alt menüden, bilgisayarda soldaki menüden ekranlar arasında geçersiniz.

---

## 1. İlk kurulumda yapılacaklar

Siteyi müşterilere duyurmadan önce aşağıdakileri **sırayla** yapın.

### 1.1 Giriş ve şifre değiştirme
1. `/panel` adresini açın. Kullanıcı adı **admin**, şifre size kurulumu yapan kişinin verdiği şifredir (verilmediyse `admin123`).
2. Soldaki menüden (telefonda **Daha fazla**) **Hesabım**'a girin, **Şifre değiştir** ile en az 8 karakterli, tahmin edilmesi zor bir şifre belirleyin. Şifre `admin123` olduğu sürece panelin üstünde kırmızı bir **Güvenlik uyarısı** görünür; şifreyi değiştirince kaybolur. `admin123` yeni şifre olarak kabul edilmez.
3. Şifreyi kimseyle paylaşmayın. Çalışanlarınız için ayrı hesap açın (bkz. Bölüm 5).

### 1.2 Mağaza bilgileri
**Ayarlar → Mağaza bilgileri:** mağaza adı, slogan, telefon, WhatsApp numarası (başında 90 ile, ör. `905373119696`), e-posta, Instagram adresi, açık adres, harita bağlantısı (Google Haritalar'da dükkânı bulup **Paylaş → Bağlantıyı kopyala**) ve "Hakkımızda" metni. **Kaydet**'e basın.

### 1.3 Çalışma saatleri
**Ayarlar → Çalışma saatleri:** her gün için sipariş alınacak saatleri girin. Gece yarısını geçen saatler olur: açılış `14:00`, kapanış `02:00` yazarsanız sistem ertesi gece 02:00'ye kadar açık sayar. Kapalı olduğunuz günü **Kapalı** olarak işaretleyin.

Kapalı saatlerde müşteriler ürünlere bakabilir ama sipariş veremez; ekranda "Kapalı · 14:00'te açılır" yazar. İsterseniz **Ayarlar → Sipariş ayarları → Kapalı saatlerde ön sipariş alınsın** ile kapalıyken de sipariş alabilirsiniz; bu siparişler panelde **Ön sipariş** etiketiyle gelir.

### 1.4 Teslimat bölgeleri ve ücretler
**Ayarlar → Sipariş ayarları:**
- **Minimum sipariş:** bu tutarın altındaki sepetlerde müşteri sipariş veremez (yalnızca eve teslimde geçerlidir).
- **Teslimat ücreti:** genel ücret (0 = ücretsiz).
- **Ücretsiz teslimat eşiği:** bu tutarın üzerindeki siparişlerde teslimat ücretsiz olur (boş bırakırsanız uygulanmaz).
- **Tahmini süre:** müşteriye gösterilen yaklaşık teslim süresi.
- **Gel-al:** müşterinin siparişi dükkândan almasına izin verir.
- **Ödeme:** kapıda nakit ve/veya kart.

**Ayarlar → Teslimat bölgeleri:** teslimat yaptığınız mahalleleri ekleyin. Bir bölgeye özel ücret, minimum tutar ya da süre yazabilirsiniz; boş bırakılan değerlerde genel ayar geçerli olur. Geçici olarak gitmediğiniz bölgeyi silmek yerine **pasif** yapın.

### 1.5 Yasal bilgiler (zorunlu)
**Ayarlar → Yasal bilgiler:** şirket/şahıs **unvanı**, **vergi dairesi**, **vergi numarası**, varsa MERSİS ve KEP adresi. Bu bilgiler KVKK, mesafeli satış sözleşmesi, iade koşulları ve çerez politikası sayfalarına otomatik yerleşir. Boş bırakılan yerlerde sitede `[…]` görünür — **site yayına girmeden önce bu sayfalarda `[…]` kalmamalı.** Her metnin yanındaki **Sitede gör** ile kontrol edin. Hazır metinler genel şablondur; bir hukukçuya ya da mali müşavirinize göstermeniz önerilir.

### 1.6 Gerçek ürünler ve fiyatlar
Sistem örnek bir katalogla gelir (yaklaşık fiyatlar, fotoğrafsız). Gerçek ürünlerinizi iki yoldan girebilirsiniz:

**a) Tek tek (Ürünler → Yeni ürün):** ürün adı, reyon (kategori), satış fiyatı zorunludur. İsteğe bağlı: marka, eski fiyat (indirimi göstermek için; satış fiyatından yüksek olmalı), birim (adet, kg, paket…), barkod, stok, sipariş başına en fazla adet, açıklama, **Öne çıkan** (ana sayfada gösterilir), **Mağazada gizli**.
- **Fotoğraf:** **Fotoğraf seç** ile telefonla çektiğiniz fotoğrafı yükleyin; sistem otomatik küçültür. Ürün beyaz/açık bir zeminde, yakından ve net çekilirse en iyi görünür. Fotoğraf yoksa reyon renginde bir simge gösterilir.
- **Stok:** boş bırakırsanız stok takibi yapılmaz. Sayı yazarsanız her siparişte düşer, sipariş iptal edilince geri eklenir, 0 olunca ürün otomatik "tükendi" olur.

**b) Toplu (CSV / Excel):** **Ürünler → CSV → Dışa aktar** ile mevcut listeyi indirin, Excel'de açıp düzenleyin (fiyatları değiştirin, yeni satırlar ekleyin), **farklı kaydet → CSV UTF-8** olarak kaydedin ve **CSV → İçe aktar** ile yükleyin. Kurallar:
- Ürünler önce **barkoda**, barkod yoksa **ürün adına** göre eşleşir. Eşleşen ürün güncellenir, eşleşmeyen yeni ürün olarak eklenir.
- Boş bıraktığınız hücreler mevcut değeri değiştirmez.
- Listede olmayan bir reyon adı yazarsanız yeni reyon açılır.
- Yüklemeden önce sistem ne yapacağını gösterir (kaç ürün eklenecek/güncellenecek, hangi satırlar hatalı); onaylarsanız uygulanır.
- Örnek ürünleri kaldırmak için **Ürünler** listesinde **tümünü seç** kutusunu işaretleyip **Sil**'e basabilirsiniz.

> **Alkol ve tütün ürünleri internetten satılamaz.** Bu ürünleri online kataloğa eklemeyin.

### 1.7 Son kontrol
Mağaza sitesini telefonunuzdan açın, bir ürün sepete ekleyip deneme siparişi verin, panelde göründüğünü kontrol edin, sonra siparişi panelden **iptal** edin. Ardından **Ayarlar → Yedekleme → Yedeği indir** ile ilk yedeğinizi alın.

---

## 2. Günlük kullanım

### 2.1 Sipariş geldiğinde
Panel **Siparişler** ekranı açıkken yeni sipariş gelince:
- **sesli uyarı** çalar (üstteki hoparlör simgesiyle açıp kapatırsınız),
- tarayıcı sekmesinde sayaç görünür, ör. "(1) Yeni sipariş",
- izin verdiyseniz bilgisayar/telefon **bildirimi** çıkar (üstteki zil simgesi),
- Telegram kurduysanız telefonunuza mesaj gelir (bkz. Bölüm 6).

Panel kendini yaklaşık 12 saniyede bir yeniler; sayfayı yenilemeniz gerekmez. Sesli uyarının çalması için panel sekmesi açık kalmalı ve sayfaya en az bir kez dokunmuş/tıklamış olmalısınız (tarayıcı kuralı).

### 2.2 Siparişi ilerletme
Her siparişin yanında tek dokunuşluk düğme vardır: **Hazırlamaya başla → Yola çıkar → Teslim edildi**. Müşterinin takip ekranı bu adımları kendiliğinden gösterir. Gel-al siparişlerinde "Yola çıkar" müşteriye **"Hazır, teslim alabilirsiniz"** olarak görünür.

Siparişe dokununca ayrıntı açılır:
- **Ara / WhatsApp / Harita:** müşteriyi arar, WhatsApp'tan hazır mesajla yazar, adresi haritada açar.
- **Ödeme ve tercihler:** kapıda nakit/kart, nakitte "500 ₺ verecek · para üstü 209,48 ₺" gibi bilgi, ürün yoksa ne yapılacağı (beni arayın / benzeriyle değiştirin / çıkarın), müşteri notu.
- **Düzenle:** ürün çıkarma, adet değiştirme, ürün ekleme (ör. müşteri telefonla bir şey eklettiyse). Toplam yeniden hesaplanır, müşteri yeni toplamı takip ekranında görür.
- **Kurye ve not:** teslim edecek kişi ve yalnızca panelde görünen not.

### 2.3 Sipariş iptali
Ayrıntıdaki **Siparişi iptal et** ile iptal edin ve müşteriye kısa bir not yazın (hazır notlar vardır: "Ürünler stokta kalmadı" vb.). Not müşterinin takip ekranında görünür. İptalde stoklar ve kupon kullanımı geri alınır.

Müşteri de siparişini **yalnızca "Yeni" durumdayken** kendisi iptal edebilir; hazırlamaya başladıktan sonra iptal için sizi araması gerekir.

### 2.4 Fiş yazdırma
Ayrıntıdaki yazıcı simgesi (**Fiş yazdır**) 80 mm termal yazıcıya uygun fiş açar; tarayıcının yazdırma penceresinde yazıcınızı seçin. Birden çok siparişi seçip toplu yazdırabilirsiniz. İlk seferde yazdırma ayarlarında **kenar boşluğu: yok**, **ölçek: %100** seçin.

### 2.5 Telefonla gelen sipariş
**Siparişler → Elle sipariş:** müşteri bilgilerini ve ürünleri girin. Bu siparişler de listede, raporlarda ve stokta normal sipariş gibi işlenir (minimum tutar ve saat kısıtı uygulanmaz).

### 2.6 Ürün tükendi / fiyat değişti
**Ürünler** listesinde:
- **Satışta / Tükendi** düğmesiyle ürünü anında tükendi yapın (müşteri göremez ama ürün listede kalır).
- Göz simgesiyle ürünü mağazadan gizleyin/gösterin.
- Fiyat kutusuna yeni fiyatı yazıp Enter'a basın.
- Birden çok ürünü seçerek toplu işlem yapın: tükendi/satışta, gizle/göster, öne çıkar, reyona taşı, **% fiyat güncelle** (ör. +10), sil.

### 2.7 Sipariş alımını durdurma
Yoğunluk, kurye yokluğu, dükkânı erken kapatma gibi durumlarda üstteki **Açık · 02:00** düğmesine dokunun → **Sipariş alımını durdur**. Müşteriye gösterilecek mesajı yazabilirsiniz. Sitede sipariş düğmesi kapanır; müşteriler ürünlere bakmaya ve sizi aramaya devam edebilir. Yeniden açmak için aynı düğmeye dokunun. (Aynı ayar **Ayarlar → Sipariş ayarları → Online sipariş alınıyor** anahtarındadır.)

### 2.8 Müşteriler
**Müşteriler** ekranında siparişlerden oluşan müşteri listesi, sipariş sayısı ve toplam harcama görünür. Sorun çıkaran (sahte sipariş veren vb.) bir numarayı **Engelle** ile engelleyebilirsiniz; o numarayla online sipariş verilemez, müşteriye "marketi arayın" mesajı çıkar.

### 2.9 Raporlar
**Raporlar** ekranında günlük/haftalık/aylık/yıllık ciro, sipariş sayısı, ortalama sepet, ödeme ve teslimat tipi, bölge ve saat dağılımı ile en çok satan ürünler görünür. İptal edilen siparişler ciroya katılmaz. **Siparişleri CSV indir** ile listeyi Excel'e alabilirsiniz.

---

## 3. Kampanya, kupon, afiş, duyuru

**Kampanyalar** ekranında üç bölüm vardır:

- **Kuponlar:** müşterinin sepette yazdığı kod. Tür: **yüzde** (%10), **tutar** (50 ₺) ya da **ücretsiz teslimat**. Minimum sepet tutarı, toplam kullanım sınırı (ör. ilk 100 sipariş), **telefon başına** kullanım sınırı (ör. her müşteri 1 kez) ve başlangıç/bitiş tarihi verebilirsiniz. Kod büyük/küçük harf ve Türkçe karakter fark etmez (`hosgeldin` = `HOŞGELDİN`). Kuponu silmek yerine **Aktif** anahtarını kapatabilirsiniz. Örnek `HOSGELDIN` kuponu kapalı gelir.
- **Afişler:** ana sayfanın üstünde kayan kampanya kartları (başlık, kısa metin, isteğe bağlı görsel ve bağlantı).
- **Duyuru bandı:** sitenin en üstündeki turuncu şerit (ör. "Bu akşam 23:00'e kadar teslimat ücretsiz"). Açıp kapatmak tek dokunuştur.

**Ayarlar → Sık sorulan sorular** bölümünden ana sayfadaki soru-cevapları düzenleyebilirsiniz.

---

## 4. Ürün ve reyon düzeni

- **Ürünler → Kategoriler:** reyon ekleyin, adını/simgesini/görselini değiştirin, gizleyin. İçinde ürün olan reyon silinemez; önce ürünleri başka reyona taşıyın.
- Reyonları ve reyon içindeki ürünleri soldaki tutamaktan **sürükleyerek** sıralayın; mağazada aynı sırayla görünür.
- **Çoğalt:** benzer bir ürünü (ör. farklı gramaj) hızlıca eklemek için ürünün **⋮** menüsünden çoğaltın; kopya gizli olarak oluşur, düzenleyip gösterin.

---

## 5. Personel ekleme

**Ayarlar → Kullanıcılar → Yeni kullanıcı:** kullanıcı adı, ad, şifre ve rol seçin.
- **Personel:** siparişleri görür ve yönetir (ilerletme, iptal, kalem düzenleme, fiş, elle sipariş), ürünleri tükendi/satışta yapar ve stok girer. Fiyat, ayarlar, kupon, rapor, yedek ve kullanıcılara erişemez.
- **Yönetici:** her şeyi yapar.

Ayrılan bir çalışanın hesabını **pasif** yapın ya da silin; açık oturumları hemen kapanır. Son yönetici silinemez.

---

## 6. Telegram bildirimi kurulumu (isteğe bağlı, ücretsiz)

Panel kapalıyken de yeni siparişlerden haberdar olmak için:
1. Telefonda Telegram'ı açın, **@BotFather** ile yazışın, `/newbot` yazın, bota bir ad verin. BotFather size `123456789:AA...` gibi bir **anahtar (token)** verir.
2. Telegram'da bir grup açın (ör. "Ulusoy Siparişler"), oluşturduğunuz botu ve bildirim almak isteyen kişileri gruba ekleyin. Gruba bir mesaj yazın.
3. Grubun **sohbet kimliğini** öğrenin: tarayıcıda `https://api.telegram.org/bot<ANAHTAR>/getUpdates` adresini açın (`<ANAHTAR>` yerine token), çıkan yazıda `"chat":{"id":-100...` kısmındaki eksi işaretli sayıyı alın.
4. Panelde **Ayarlar → Bildirimler**'e anahtarı ve sohbet kimliğini girin, **Deneme mesajı gönder**'e basın. Gruba "Telegram bildirimi çalışıyor" mesajı gelirse **Kaydet**'e basın.

Her yeni siparişte müşteri adı, telefonu, adresi, ürünler, toplam ve ödeme bilgisi gruba gelir; müşteri siparişini iptal ederse de mesaj gelir. Telegram'a ulaşılamazsa sipariş yine alınır, yalnızca mesaj gitmez.

---

## 7. Yedek

- Sistem her gün otomatik yedek alır ve son 14 günü saklar; ayrıca yedek geri yükleme ve toplu sipariş silme öncesinde de yedek alır.
- Bunlar aynı sunucuda durur. Bilgisayar/sunucu bozulursa kaybolmaması için **haftada bir** **Ayarlar → Yedekleme → Yedeği indir** ile dosyayı indirip başka bir yerde (USB bellek, e-posta, bulut) saklayın.
- **Geri yükleme:** Ayarlar → Yedekleme → yedek dosyasını seçin → **Geri yükle**. Mevcut veri önce otomatik yedeklenir, sonra seçtiğiniz yedek yüklenir ve herkes yeniden giriş yapar. Bozuk bir dosya yüklenmez, mevcut veriniz korunur.
- Sipariş numaraları hiçbir zaman tekrar kullanılmaz; eski bir yedek yükleseniz bile yeni siparişler kaldığı numaradan devam eder.

---

## 8. Sık sorunlar

| Sorun | Çözüm |
|---|---|
| Panelde ses gelmiyor | Üstteki hoparlör simgesi açık mı? Panel sekmesi açık mı? Sayfaya bir kez dokunun/tıklayın. Bilgisayarın sesi açık mı? |
| Tarayıcı bildirimi gelmiyor | Üstteki zil simgesine basıp izin verin. Tarayıcı ayarlarında site bildirimleri engellenmiş olabilir. |
| Müşteri "sipariş veremiyorum" diyor | Saat çalışma saatleri dışında mı? Sipariş alımı durdurulmuş mu (üstteki düğme)? Sepet minimum tutarın altında mı? Bölgesi pasif mi? Numarası engelli mi? Aynı numarayla çok fazla aktif siparişi var mı (Ayarlar → Sipariş ayarları → telefon başına en fazla aktif sipariş)? |
| "Çok fazla deneme yapıldı" uyarısı | Aynı internet bağlantısından kısa sürede çok sayıda sipariş/sorgu ya da hatalı şifre denemesi yapıldı; birkaç dakika (girişte 15 dakika) bekleyin. |
| Şifremi unuttum | Başka bir yönetici **Ayarlar → Kullanıcılar**'dan şifrenizi değiştirebilir. Hiç yönetici giremiyorsa kurulumu yapan kişiye başvurun (`docs/DEPLOY.md` → "Yönetici şifresi unutulursa"). |
| Fiş çok küçük/büyük çıkıyor | Yazdırma penceresinde kağıt boyutu 80 mm, ölçek %100, kenar boşluğu "yok" seçin. |
| Kuponu müşteri kullanamıyor | Kupon aktif mi, tarihi geçerli mi, kullanım sınırı dolmuş mu, sepet minimum kupon tutarının altında mı? Telefon başına sınır varsa müşteri hakkını kullanmış olabilir. |
| Ürün sitede görünmüyor | Ürün ya da reyonu gizli mi? Tükendi mi? Stok 0 mı? |
| Yanlışlıkla bir şey sildim | Ayarlar → Yedekleme'den son yedeği geri yükleyebilirsiniz (yedekten sonraki değişiklikler kaybolur). Emin değilseniz önce kurulumu yapan kişiye danışın. |
| Bilgisayarda "Marketi Baslat" penceresi kapanıyor | Pencerede yazan hatayı okuyun. "db.json okunamadı" yazıyorsa veri dosyası bozulmuştur; `data\backups` klasöründeki son yedekle değiştirilmesi gerekir (kurulumu yapan kişiye başvurun). |

---

## Ekran görüntüleri (`docs/ekranlar/`)

| Dosya | Ne gösteriyor |
|---|---|
| `01-magaza-ana-sayfa-telefon.png` | Mağaza ana sayfası, telefonda (duyuru bandı, açık/kapalı rozeti) |
| `02-magaza-reyon-telefon.png` | Reyon sayfası, sepete ekleme, alttaki sepet çubuğu |
| `03-magaza-sepet-kupon-telefon.png` | Sepet özeti, bölge seçimi, uygulanmış kupon |
| `04-magaza-siparis-formu-telefon.png` | Sipariş formu (teslimat şekli, bölge, adres) |
| `05-magaza-siparis-takip-telefon.png` | Müşterinin sipariş takip ekranı |
| `06-magaza-karanlik-tema-telefon.png` | Karanlık tema |
| `07-magaza-ana-sayfa-masaustu.png` | Ana sayfa, bilgisayarda (sağda sepet) |
| `08-magaza-reyon-sepet-masaustu.png` | Reyon ve yan sepet, bilgisayarda |
| `09-panel-siparisler-masaustu.png` | Panel sipariş listesi ve sipariş ayrıntısı |
| `10-panel-fis-80mm.png` | 80 mm termal yazıcı fişi |
| `11-panel-urunler-masaustu.png` | Ürün listesi (satır içi fiyat, satışta/tükendi, gizle) |
| `12-panel-raporlar-masaustu.png` | Raporlar |
| `13-panel-ayarlar-siparis-masaustu.png` | Sipariş ayarları (sipariş alımı, minimum tutar, ücretler) |
| `14-panel-siparisler-telefon.png` | Panel sipariş listesi, telefonda |