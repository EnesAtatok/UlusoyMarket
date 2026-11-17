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
2. Soldaki menüden (telefonda **Daha fazla**) **Hesabım**'a girin, **Şifre değiştir** ile en az 8 karakterli, tahmin edilmesi zor bir şifre belirleyin. Şifre `admin123` olduğu sürece panelin üstünde kırmızı bir **Güvenlik uyarısı** görünür ve **sunucu yalnızca kurulu olduğu bilgisayardan açılır** (ağdaki telefonlar, tabletler ve internet erişemez). Şifreyi değiştirip sunucuyu yeniden başlatınca (Marketi Baslat penceresini kapatıp tekrar açın) diğer cihazlara açılır. `admin123` yeni şifre olarak kabul edilmez.
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

### 1.5 İşletme bilgileri ve yasal belgeler (zorunlu)
**Ayarlar → İşletme bilgileri:**
- **İşletme türü:** *Şahıs işletmesi* (esnaf / şahıs tacir) ya da *Şirket*. Şahısta **ad soyad** ve **vergi numarası** yeterlidir; MERSİS ve KEP zorunlu değildir, boş bırakırsanız yasal metinlerden o satırlar kendiliğinden çıkar. Şirkette **ticaret unvanı, MERSİS ve KEP** zorunludur.
- Ad soyad / unvan, vergi dairesi, vergi (ya da TC kimlik) numarası, varsa meslek odası, **ETBİS kayıt numarası** ve **e-posta** (cayma bildirimleri ve KVKK başvuruları buraya gelir; düzenli baktığınız bir adres olsun). Adres ve telefon **Mağaza bilgileri**'nden gelir.
- Eksik bilgi varsa ekranın üstünde sarı **"Canlıya çıkmadan önce doldurun"** kutusu neyin eksik olduğunu yazar. Boş alanlar yasal metinlerde `[…]` olarak görünür — **site yayına girmeden önce hiçbir sayfada `[…]` kalmamalı.**

**Ayarlar → Yasal belgeler:** sitedeki yasal sayfalar (Ön Bilgilendirme Formu, Mesafeli Satış Sözleşmesi, KVKK Aydınlatma Metni, İptal-İade-Cayma Koşulları, Teslimat Koşulları, Kullanım Koşulları, Çerez Politikası…). Metinler `docs/YASAL.md`'deki taslaklardan gelir ve mağaza bilgilerinizle doldurulur. Her belgeyi açıp sitede nasıl göründüğüne bakabilir, düzenleyebilirsiniz. **Bu taslakları canlıya çıkmadan önce bir avukata onaylatın.**
- Bir metni (ya da metne giren bir mağaza bilgisini: adres, telefon, saatler…) değiştirdiğinizde belgenin **yeni sürümü** oluşur. Daha önce sipariş vermiş müşterinin onayladığı **eski sürüm aynen saklanır**; o siparişin sözleşmesi hep o metinle gösterilir.
- **Ayarlar → Onay kutuları:** sipariş formunda müşterinin işaretlediği kutular. Hepsi ayrı ve işaretsiz gelir; **zorunlu** olanlar işaretlenmeden sipariş verilemez (sunucu da reddeder). Pazarlama (kampanya SMS'i) izni zorunlu yapılamaz.
- **Ayarlar → Site dışında yapılacaklar:** ETBİS kaydı, İYS, avukat onayı gibi sitenin yapamayacağı, sizin yapmanız gereken işlerin listesi.

### 1.6 Gerçek ürünler ve fiyatlar
Sistem örnek bir katalogla gelir (yaklaşık fiyatlar; her ürünün ve reyonun fotoğrafı var, kaynakları `docs/GORSEL-KAYNAKLARI.md`'de). Gerçek ürünlerinizi iki yoldan girebilirsiniz:

**a) Tek tek (Ürünler → Yeni ürün):** ürün adı, reyon (kategori), satış fiyatı zorunludur. İsteğe bağlı: marka, eski fiyat (indirimi göstermek için; satış fiyatından yüksek olmalı), birim (adet, kg, paket…), barkod, stok, sipariş başına en fazla adet, açıklama, **Öne çıkan** (ana sayfada gösterilir), **Mağazada gizli**, **cayma hakkı** (boşsa reyonunki geçerli).
- **İndirim ve eski fiyat:** Fiyat Etiketi Yönetmeliği gereği indirimde gösterilen eski fiyat, **son 10 günde uygulanan en düşük fiyat** olmalıdır (meyve-sebzede bir önceki fiyat). Fiyatı düşürüp eski fiyatı boş bırakırsanız sistem bunu fiyat geçmişinden kendisi yazar. Elle daha yüksek bir eski fiyat girerseniz kayıt yapılır ama **uyarı** çıkar. Ürünün **⋮ → Fiyat geçmişi** menüsünden geçmişi görebilirsiniz.
- **Cayma hakkı:** her reyonun (ve gerekirse ürünün) cayma durumu vardır: *Yok – çabuk bozulan* (meyve-sebze, süt, ekmek…), *Ambalajı açılırsa yok – hijyen* (kişisel bakım, bebek…), *Var*. Müşteri sipariş özetinde ve sözleşmede her ürünün durumunu görür. Birden çok ürünü seçip **toplu** değiştirebilirsiniz.
- **Fotoğraf:** **Fotoğraf seç** ile telefonla çektiğiniz fotoğrafı yükleyin; sistem otomatik küçültür. Ürün beyaz/açık bir zeminde, yakından ve net çekilirse en iyi görünür. Fotoğraf yoksa reyon renginde bir simge gösterilir.
- **Stok:** boş bırakırsanız stok takibi yapılmaz. Sayı yazarsanız her siparişte düşer, sipariş iptal edilince geri eklenir, 0 olunca ürün otomatik "tükendi" olur.

**b) Toplu (CSV / Excel):** **Ürünler → CSV → Dışa aktar** ile mevcut listeyi indirin, Excel'de açıp düzenleyin (fiyatları değiştirin, yeni satırlar ekleyin), **farklı kaydet → CSV UTF-8** olarak kaydedin ve **CSV → İçe aktar** ile yükleyin. Kurallar:
- Ürünler önce **barkoda**, barkod yoksa **ürün adına** göre eşleşir. Eşleşen ürün güncellenir, eşleşmeyen yeni ürün olarak eklenir.
- Boş bıraktığınız hücreler mevcut değeri değiştirmez.
- Listede olmayan bir reyon adı yazarsanız yeni reyon açılır.
- **Cayma hakkı** sütunu: "Var", "Yok – çabuk bozulan", "Ambalajı açılırsa yok – hijyen" ya da "Kategoriden" yazın; boş bırakılırsa değişmez.
- Yüklemeden önce sistem ne yapacağını gösterir (kaç ürün eklenecek/güncellenecek, hangi satırlar hatalı); onaylarsanız uygulanır. Eski fiyatı son 10 günün en düşük fiyatından yüksek olan satırlar için **eski fiyat uyarısı** listelenir (satır yine alınır). Fiyatı düşen ve eski fiyat sütunu olmayan satırlarda eski fiyat geçmişten kendiliğinden konur.
- Örnek ürünleri kaldırmak için **Ürünler** listesinde **tümünü seç** kutusunu işaretleyip **Sil**'e basabilirsiniz.

> **Alkol ve tütün ürünleri internetten satılamaz.** Bu ürünleri online kataloğa eklemeyin.

### 1.7 Son kontrol
Mağaza sitesini telefonunuzdan açın, bir ürün sepete ekleyip deneme siparişi verin, panelde göründüğünü kontrol edin, sonra siparişi panelden **iptal** edin. Ardından **Ayarlar → Yedekleme** ile ilk yedeğinizi (parolalı) alın. Yayına çıkmadan önce **Bölüm 9 — Canlıya çıkmadan önce** listesini tamamlayın.

---

## 2. Günlük kullanım

### 2.1 Sipariş geldiğinde
Panel **Siparişler** ekranı açıkken yeni sipariş gelince:
- **sesli uyarı** çalar (üstteki hoparlör simgesiyle açıp kapatırsınız),
- tarayıcı sekmesinde sayaç görünür, ör. "(1) Yeni sipariş",
- izin verdiyseniz bilgisayar/telefon **bildirimi** çıkar (üstteki zil simgesi),
- Telegram kurduysanız telefonunuza mesaj gelir (bkz. Bölüm 6).

Siparişler **canlı** gelir: müşteri siparişi verdiği anda panelde görünür, sayfayı yenilemeniz gerekmez. Üst çubuktaki **Canlı** yazısı bağlantının açık olduğunu gösterir; bağlantı koparsa **Yeniden bağlanıyor…** ya da **Yoklama** yazar ve panel siparişleri 12 saniyede bir kendisi kontrol eder. Sesli uyarının çalması için panel sekmesi açık kalmalı ve sayfaya en az bir kez dokunmuş/tıklamış olmalısınız (tarayıcı kuralı).

### 2.1a Sipariş teyidi (müşteriyi arama)
Yeni online siparişlerin yanında **Teyit bekliyor** yazar. Müşteriyi arayıp (ya da WhatsApp/SMS ile) siparişi doğruladığınızda ayrıntıdaki **Teyit** bölümünden kanalı ve sonucu (**ulaşıldı / ulaşılamadı**) işaretleyin. Kim, ne zaman, hangi kanaldan teyit ettiği kayda geçer (E-ticaret Yönetmeliği'nin "site dışı ikinci kanal" teyidi; sahte siparişe karşı da korur).

### 2.2 Siparişi ilerletme
Her siparişin yanında tek dokunuşluk düğme vardır: **Hazırlamaya başla → Yola çıkar → Teslim edildi**. Müşterinin takip ekranı bu adımları **yenilemeden, yaklaşık bir saniye içinde** gösterir ve ekranda kısa bir bildirim çıkar. Gel-al siparişlerinde "Yola çıkar" müşteriye **"Hazır, teslim alabilirsiniz"** olarak görünür.

Siparişe dokununca ayrıntı açılır:
- **Ara / WhatsApp / Harita:** müşteriyi arar, WhatsApp'tan hazır mesajla yazar, adresi haritada açar.
- **Ödeme ve tercihler:** kapıda nakit/kart, nakitte "500 ₺ verecek · para üstü 209,48 ₺" gibi bilgi, ürün yoksa ne yapılacağı (beni arayın / benzeriyle değiştirin / çıkarın), müşteri notu.
- **Düzenle:** ürün çıkarma, adet değiştirme, ürün ekleme (ör. müşteri telefonla bir şey eklettiyse). Toplam yeniden hesaplanır, müşteri yeni toplamı takip ekranında görür.
- **Kurye ve not:** teslim edecek kişi ve yalnızca panelde görünen not.
- **Onay kaydı ve sözleşme:** müşterinin sipariş verirken işaretlediği onaylar, zamanı, IP adresi ve onayladığı metinlerin sürümü. **Sözleşmeyi görüntüle** o siparişin bilgileriyle doldurulmuş Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi'ni açar (yazdırılabilir).

### 2.2a Cayma / iade talepleri
Teslim edilen siparişte müşteri takip ekranından **Cayma / iade talebi** gönderebilir; talebin ulaştığı ekranda hemen teyit edilir. Talep panelde siparişin ayrıntısında sarı kutuda ve canlı olarak görünür (Telegram kuruluysa kişisel veri içermeyen bir bildirim de gider). **İşle** ile durumunu (*İnceleniyor / Sonuçlandı / Reddedildi*) ve kısa notunuzu girin. Talepleri **14 gün içinde** sonuçlandırın. Çabuk bozulan ürünlerde cayma hakkı yoktur ama ayıplı (bozuk, yırtık) ürün talebi yine değerlendirilir.

### 2.3 Sipariş iptali
Ayrıntıdaki **Siparişi iptal et** ile iptal edin ve müşteriye kısa bir not yazın (hazır notlar vardır: "Ürünler stokta kalmadı" vb.). Not müşterinin takip ekranında görünür. İptalde stoklar ve kupon kullanımı geri alınır.

Müşteri de siparişini **yalnızca "Yeni" durumdayken** ve yalnızca siparişi verdiği cihazdan (ya da kendisine verilen gizli takip bağlantısından) iptal edebilir; hazırlamaya başladıktan sonra iptal için sizi araması gerekir.

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
Yoğunluk, kurye yokluğu, dükkânı erken kapatma gibi durumlarda üstteki **Açık · 02:00** düğmesine dokunun → **Sipariş alımını durdur**. Müşteriye gösterilecek mesajı yazabilirsiniz. Sitede sipariş düğmesi, **açık duran sayfalarda da yenilemeden birkaç saniye içinde** kapanır (çalışma saatlerini değiştirdiğinizde saat göstergesi de aynı şekilde güncellenir); müşteriler ürünlere bakmaya ve sizi aramaya devam edebilir. Yeniden açmak için aynı düğmeye dokunun. (Aynı ayar **Ayarlar → Sipariş ayarları → Online sipariş alınıyor** anahtarındadır.)

### 2.8 Müşteriler
**Müşteriler** ekranında siparişlerden oluşan müşteri listesi, sipariş sayısı ve toplam harcama görünür. Sorun çıkaran (sahte sipariş veren vb.) bir numarayı **Engelle** ile engelleyebilirsiniz; o numarayla online sipariş verilemez, müşteriye "marketi arayın" mesajı çıkar.

**KVKK başvurusu** (yalnızca yönetici): müşteri "hakkımdaki verileri istiyorum" derse müşteri ayrıntısında **Verilerini dışa aktar** tüm siparişlerini bir dosya olarak indirir. "Verilerimi silin" derse **Anonimleştir**: tamamlanmış/iptal siparişlerdeki ad, telefon, adres, notlar, teyit notları ve talep metinleri silinir; tutarlar ve ürünler (ciro için) kalır. Süren siparişler atlanır. Bu işlem geri alınamaz. Sunucudaki otomatik yedeklerde eski kopya, yedeğin süresi dolana kadar (günlük yedeklerde 14 gün) durur; indirdiğiniz yedeklerde ise siz silene kadar durur.

### 2.9 Raporlar
**Raporlar** ekranında günlük/haftalık/aylık/yıllık ciro, sipariş sayısı, ortalama sepet, ödeme ve teslimat tipi, bölge ve saat dağılımı ile en çok satan ürünler görünür. İptal edilen siparişler ciroya katılmaz. **Siparişleri CSV indir** ile listeyi Excel'e alabilirsiniz.

---

## 3. Kampanya, kupon, afiş, duyuru

**Kampanyalar** ekranında üç bölüm vardır:

- **Kuponlar:** müşterinin sepette yazdığı kod. Tür: **yüzde** (%10), **tutar** (50 ₺) ya da **ücretsiz teslimat**. Minimum sepet tutarı, toplam kullanım sınırı (ör. ilk 100 sipariş), **telefon başına** kullanım sınırı (ör. her müşteri 1 kez) ve başlangıç/bitiş tarihi verebilirsiniz. Kod büyük/küçük harf ve Türkçe karakter fark etmez (`hosgeldin` = `HOŞGELDİN`). Kuponu silmek yerine **Aktif** anahtarını kapatabilirsiniz. Örnek `HOSGELDIN` kuponu kapalı gelir.
- **Afişler:** ana sayfanın üstünde kayan kampanya kartları (başlık, kısa metin, isteğe bağlı görsel ve bağlantı).
- **Duyuru bandı:** sitenin en üstündeki şerit (ör. "Bu akşam 23:00'e kadar teslimat ücretsiz"). Açıp kapatmak tek dokunuştur.

**Ayarlar → Sık sorulan sorular** bölümünden ana sayfadaki soru-cevapları düzenleyebilirsiniz.

---

## 4. Ürün ve reyon düzeni

- **Ürünler → Kategoriler:** reyon ekleyin, adını/simgesini/görselini değiştirin, gizleyin. İçinde ürün olan reyon silinemez; önce ürünleri başka reyona taşıyın.
- Reyonları ve reyon içindeki ürünleri soldaki tutamaktan **sürükleyerek** sıralayın; mağazada aynı sırayla görünür.
- **Çoğalt:** benzer bir ürünü (ör. farklı gramaj) hızlıca eklemek için ürünün **⋮** menüsünden çoğaltın; kopya gizli olarak oluşur, düzenleyip gösterin.

---

## 5. Personel ekleme

**Ayarlar → Kullanıcılar → Yeni kullanıcı:** kullanıcı adı, ad, şifre ve rol seçin.
- **Personel:** siparişleri görür ve yönetir (ilerletme, iptal, kalem düzenleme, teyit, iade talebi işleme, fiş, elle sipariş), ürünleri tükendi/satışta yapar ve stok girer. Fiyat, ayarlar, kupon, rapor, yedek, denetim kaydı ve kullanıcılara erişemez. **Arşiv:** arşiv eşiğini (varsayılan 2 yıl) geçen tamamlanmış siparişlerde müşterinin adı, telefonu, adresi, notları ve takip bağlantısı personele gizlenir; yönetici görür.
- **Yönetici:** her şeyi yapar.

Ayrılan bir çalışanın hesabını **pasif** yapın ya da silin; açık oturumları hemen kapanır. Son yönetici silinemez.

---

## 6. Telegram bildirimi kurulumu (isteğe bağlı, ücretsiz)

Panel kapalıyken de yeni siparişlerden haberdar olmak için:
1. Telefonda Telegram'ı açın, **@BotFather** ile yazışın, `/newbot` yazın, bota bir ad verin. BotFather size `123456789:AA...` gibi bir **anahtar (token)** verir.
2. Telegram'da bir grup açın (ör. "Ulusoy Siparişler"), oluşturduğunuz botu ve bildirim almak isteyen kişileri gruba ekleyin. Gruba bir mesaj yazın.
3. Grubun **sohbet kimliğini** öğrenin: tarayıcıda `https://api.telegram.org/bot<ANAHTAR>/getUpdates` adresini açın (`<ANAHTAR>` yerine token), çıkan yazıda `"chat":{"id":-100...` kısmındaki eksi işaretli sayıyı alın.
4. Panelde **Ayarlar → Bildirimler**'e anahtarı ve sohbet kimliğini girin, **Deneme mesajı gönder**'e basın. Gruba "Telegram bildirimi çalışıyor" mesajı gelirse **Kaydet**'e basın.

Her yeni siparişte sipariş numarası, teslimat türü, bölge, ürün sayısı, toplam ve ödeme bilgisi gruba gelir; müşteri siparişini iptal ederse ya da iade talebi gönderirse de mesaj gelir. **Müşterinin adı, telefonu, adresi ve notu Telegram'a yazılmaz** (Telegram yurt dışında bir hizmettir; KVKK). Ayrıntıya panelden bakın. Telegram'a ulaşılamazsa sipariş yine alınır, yalnızca mesaj gitmez.

---

## 7. Yedek

- Sistem her gün otomatik yedek alır ve son 14 günü saklar; ayrıca yedek geri yükleme ve toplu sipariş silme öncesinde de yedek alır.
- Bunlar aynı sunucuda durur. Bilgisayar/sunucu bozulursa kaybolmaması için **haftada bir** **Ayarlar → Yedekleme** ile yedeği indirip başka bir yerde (USB bellek, bulut) saklayın.
- **Parolalı yedek (önerilen):** yedek dosyasında müşterilerin adı, telefonu ve adresi vardır. İndirirken en az 10 karakterli bir **yedek parolası** girin; dosya bu parolayla şifrelenir (`.sifreli.json`). Parolayı unutursanız yedek **açılamaz**; parolayı yedekten ayrı bir yerde saklayın. Şifresiz indirme de mümkündür ama o dosyayı e-postayla göndermeyin, ortak klasörlere koymayın.
- **Geri yükleme:** Ayarlar → Yedekleme → yedek dosyasını seçin (parolalıysa parolasını girin) → **Geri yükle**. Mevcut veri önce otomatik yedeklenir, sonra seçtiğiniz yedek yüklenir ve herkes yeniden giriş yapar. Bozuk bir dosya yüklenmez, mevcut veriniz korunur. Sunucuda bulunan bir siparişin müşteri onay kaydı (onaylanan sözleşme sürümü, tutarlar) yedektekinden farklıysa — yedek dosyası sonradan değiştirilmiş demektir — geri yükleme yapılmaz ve hangi siparişler olduğu yazılır.
- Sipariş numaraları hiçbir zaman tekrar kullanılmaz; eski bir yedek yükleseniz bile yeni siparişler kaldığı numaradan devam eder.

---

## 8. Güvenlik ve gizlilik

### 8.1 Güvenlik uyarıları ne anlama geliyor?
Panelin üstündeki şerit ve **Ayarlar → Güvenlik ve gizlilik → Güvenlik durumu** kutuları:

| Uyarı | Anlamı | Ne yapılmalı |
|---|---|---|
| **Varsayılan şifre kullanılıyor** (kırmızı) | Bir hesabın şifresi herkesin bildiği `admin123` | Hemen **Hesabım → Şifre değiştir** |
| **Site şifresiz (HTTP) açılıyor** (kırmızı) | Müşteri bilgileri internette şifresiz gidiyor | Kurulumu yapan kişi HTTPS'i açmalı (DEPLOY.md) |
| **Müşteri verisi şifresiz saklanıyor** | Sunucudaki veri dosyası `DATA_KEY` olmadan, düz metin | Kurulumda `DATA_KEY` verilmeli (DEPLOY.md) |
| **Site adresi (PUBLIC_URL) verilmemiş** | Sayfa adresleri tarayıcının gönderdiği adresten üretiliyor | Kurulumda `PUBLIC_URL=https://alanadiniz` |
| **PUBLIC_URL https ama TRUST_PROXY=1 değil** | HTTP→HTTPS yönlendirmesi çalışmıyor | Kurulumda `TRUST_PROXY=1` |
| **İşletme türü seçilmemiş / işletme bilgileri eksik** | Yasal metinlerde `[…]` var | **Ayarlar → İşletme bilgileri** |
| **ETBİS kaydı girilmemiş** | Kendi sitesinden satan işletme ETBİS'e kayıtlı olmalı | e-Devlet → ETBİS; numarayı İşletme bilgileri'ne girin |
| **Telefonla sipariş sorgusu açık** (bilgi) | Numarayı ve telefonu bilen herkes siparişin durumunu görebilir (ad, adres, ürünler gösterilmez; iptal edemez) | Gerekmiyorsa kapatın |
| **Sunucu yalnızca bu bilgisayardan açılıyor** (uyarı) | Varsayılan şifre (`admin123`) kullanımda; sunucu ağa açılmadı | **Hesabım → Şifre değiştir**, sonra sunucuyu yeniden başlatın |
| **Anonimleştirme süresi 10 yıldan kısa / kapalı** (bilgi) | Kişisel verinin saklama süresi | Avukatınıza danışın |
| **Pazarlama izni kutusu açık** (bilgi) | Sipariş formunda kampanya SMS izni soruluyor | İYS kaydınız yoksa kapatın |
| **Telegram bildirimi açık** (bilgi) | Bildirimlerde müşteri bilgisi yok, yalnızca sipariş özeti | Bilgi amaçlı |

Her uyarının altındaki **Ne yapılmalı** satırı ayrıntıyı anlatır. Personel yalnızca HTTPS uyarısını görür.

### 8.2 Gizlilik ayarları (Ayarlar → Güvenlik ve gizlilik)
- **Telefonla sipariş sorgusu (başka cihazdan):** varsayılan **kapalı**. Müşteri siparişini yalnızca verdiği cihazdaki **Siparişlerim**'de ya da kendisine verilen **gizli takip bağlantısıyla** görür. Bağlantı sipariş onay ekranında ve Siparişlerim'de **Bağlantı / Paylaş** düğmesindedir; bağlantıyı açan cihaz siparişi kendi listesine ekler. Bağlantıyı yalnızca sipariş sahibine verin (bağlantıyı bilen kişi siparişi, sözleşmeyi ve teslimat adresini görebilir, siparişi iptal edebilir). Bu ayarı açarsanız sipariş numarası ve telefonla başka cihazdan **yalnızca siparişin durumu** görülür (tarih, ürün sayısı, tutar); ad, adres ve ürünler gösterilmez, iptal / sözleşme / iade talebi yapılamaz. Arşivlenmiş siparişler telefonla bulunmaz.
- **Anonimleştirme süresi:** tamamlanmış siparişlerdeki kişisel veriler bu süre sonunda kendiliğinden silinir (varsayılan **10 yıl**; 6563 sayılı Kanun e-ticaret kayıtlarının 10 yıl saklanmasını istiyor — kısaltmadan önce avukatınıza danışın).
- **Arşiv eşiği:** bu süreyi (varsayılan 2 yıl) geçen tamamlanmış siparişlerde kişisel veri personele gizlenir ve personel bu siparişleri değiştiremez (durum, ürünler, notlar yalnızca yöneticide). Personel teslim edilmiş ya da iptal edilmiş siparişin ürünlerini de değiştiremez.
- **Pazarlama izni kutusu:** varsayılan kapalı. İYS kaydınız ve İYS'ye bağlı bir SMS sağlayıcınız olmadan açmayın.

### 8.3 Denetim kaydı (Ayarlar → Denetim kaydı, yalnızca yönetici)
Panelde kim, ne zaman, hangi işlemi yaptı: giriş, hatalı şifre denemesi, sipariş durumu, ürün/ayar değişikliği, yedek indirme, geri yükleme, anonimleştirme… Müşterinin kişisel verisi, notlar, şifreler ve IP adresleri kayda yazılmaz. Genel kayıtta son 2000 işlem tutulur; hiçbir şeyi değiştirmeyen istekler yazılmaz, aynı işlemin art arda tekrarları ve hatalı şifre denemeleri tek satırda sayılır (×5 gibi). Yedek indirme, geri yükleme, kullanıcı ve şifre değişiklikleri, silme, dışa aktarma ve ayar değişiklikleri ayrıca **güvenlik kaydında** (son 5000) saklanır; genel kayıt dolsa da bunlar silinmez. Üstteki seçimle yalnızca güvenlik kayıtlarını görebilirsiniz.

### 8.4 Veri anahtarı (DATA_KEY)
Kurulumda `DATA_KEY` verildiyse sunucudaki tüm veri (siparişler, oturumlar, denetim kaydı, otomatik yedekler) şifreli saklanır; Güvenlik durumu ekranında **"Şifreli — DATA_KEY"** yazar. **Bu anahtar kaybolursa veri kurtarılamaz.** Anahtarın bir kopyasını sunucu dışında (şifre yöneticisi ya da kasadaki kâğıt) saklayın. Panelden indirdiğiniz yedekler bu anahtarla değil, sizin girdiğiniz yedek parolasıyla şifrelenir.

---

## 9. Canlıya çıkmadan önce kontrol listesi

- [ ] **Yönetici şifresi** değiştirildi (`admin123` değil); her çalışanın ayrı hesabı var.
- [ ] **İşletme bilgileri** tam: işletme türü, ad soyad/unvan, vergi dairesi ve numarası, (şirketse MERSİS ve KEP), e-posta, adres, telefon. Hiçbir yasal sayfada `[…]` yok.
- [ ] **ETBİS** kaydı yapıldı ve numarası girildi.
- [ ] **Yasal belgeler bir avukata onaylatıldı** (Ön Bilgilendirme, Mesafeli Satış Sözleşmesi, KVKK Aydınlatma, İptal-İade-Cayma, Teslimat ve Kullanım Koşulları, Çerez Politikası).
- [ ] Reyonların **cayma hakkı** durumları doğru.
- [ ] Site **HTTPS** ile açılıyor (adres çubuğunda kilit), `PUBLIC_URL` `https://` ile ve `TRUST_PROXY=1` verildi.
- [ ] **DATA_KEY** verildi (Güvenlik durumu: "Şifreli") ve **anahtarın yedeği** sunucu dışında güvenli bir yerde.
- [ ] İlk **parolalı yedek** indirildi, parolası ayrı saklanıyor.
- [ ] **Güvenlik durumu** ekranında kırmızı ya da sarı uyarı kalmadı.
- [ ] Telefondan deneme siparişi verildi, panelde canlı geldi, takip ekranı yenilemeden güncellendi; sonra sipariş iptal edildi.

---

## 10. Sık sorunlar

| Sorun | Çözüm |
|---|---|
| Panelde ses gelmiyor | Üstteki hoparlör simgesi açık mı? Panel sekmesi açık mı? Sayfaya bir kez dokunun/tıklayın. Bilgisayarın sesi açık mı? |
| Tarayıcı bildirimi gelmiyor | Üstteki zil simgesine basıp izin verin. Tarayıcı ayarlarında site bildirimleri engellenmiş olabilir. |
| Müşteri "sipariş veremiyorum" diyor | Zorunlu onay kutularının hepsi işaretli mi? "Yasal metinler güncellendi" uyarısı aldıysa sayfayı yenileyip onayları tekrar versin. Saat çalışma saatleri dışında mı? Sipariş alımı durdurulmuş mu (üstteki düğme)? Sepet minimum tutarın altında mı? Bölgesi pasif mi? Numarası engelli mi? Aynı numarayla çok fazla aktif siparişi var mı (Ayarlar → Sipariş ayarları → telefon başına en fazla aktif sipariş)? |
| "Çok fazla deneme yapıldı" uyarısı | Aynı internet bağlantısından kısa sürede çok sayıda sipariş/sorgu ya da hatalı şifre denemesi yapıldı; birkaç dakika (girişte 15 dakika) bekleyin. |
| Şifremi unuttum | Başka bir yönetici **Ayarlar → Kullanıcılar**'dan şifrenizi değiştirebilir. Hiç yönetici giremiyorsa kurulumu yapan kişiye başvurun (`docs/DEPLOY.md` → "Yönetici şifresi unutulursa"). |
| Müşteri siparişini başka telefondan göremiyor | Telefonla sorgu varsayılan kapalıdır. Siparişin **gizli takip bağlantısını** (panelde siparişin ⋮ menüsü → Gizli takip bağlantısını kopyala) yalnızca müşteriye gönderin. |
| Sunucu "DATA_KEY yanlış" diyerek açılmıyor | Veri yanlış anahtarla açılmaya çalışılıyor; dosyalara dokunulmadı. Doğru anahtarla başlatın (DEPLOY.md). |
| Fiş çok küçük/büyük çıkıyor | Yazdırma penceresinde kağıt boyutu 80 mm, ölçek %100, kenar boşluğu "yok" seçin. |
| Kuponu müşteri kullanamıyor | Kupon aktif mi, tarihi geçerli mi, kullanım sınırı dolmuş mu, sepet minimum kupon tutarının altında mı? Telefon başına sınır varsa müşteri hakkını kullanmış olabilir. |
| Ürün sitede görünmüyor | Ürün ya da reyonu gizli mi? Tükendi mi? Stok 0 mı? |
| Yanlışlıkla bir şey sildim | Ayarlar → Yedekleme'den son yedeği geri yükleyebilirsiniz (yedekten sonraki değişiklikler kaybolur). Emin değilseniz önce kurulumu yapan kişiye danışın. |
| Bilgisayarda "Marketi Baslat" penceresi kapanıyor | Pencerede yazan hatayı okuyun. "db.json okunamadı" yazıyorsa veri dosyası bozulmuştur; `data\backups` klasöründeki son yedekle değiştirilmesi gerekir (kurulumu yapan kişiye başvurun). |

---

## Ekran görüntüleri (`docs/ekranlar/`)

| Dosya | Ne gösteriyor |
|---|---|
| `01-magaza-ana-sayfa-telefon.png` | Mağaza ana sayfası, telefonda (açık/kapalı rozeti, saat göstergesi: açılış–kapanış saati, şu an, kalan süre) |
| `02-magaza-reyon-telefon.png` | Reyon sayfası, fotoğraflı ürün kartları |
| `03-magaza-sepet-telefon.png` | Sepet, alttaki toplam çubuğu, süren sipariş şeridi |
| `04-magaza-siparis-onaylari-telefon.png` | Sipariş özeti (cayma hakkı notu) ve ayrı, işaretsiz onay kutuları |
| `05-magaza-canli-takip-telefon.png` | Canlı sipariş takibi (yenilemeden güncellenir) |
| `06-magaza-siparislerim-telefon.png` | Siparişlerim: yalnızca bu cihazdan verilen siparişler, takip bağlantısı, sözleşme |
| `07-magaza-karanlik-tema-telefon.png` | Karanlık tema |
| `08-magaza-ana-sayfa-masaustu.png` | Ana sayfa, bilgisayarda (sağda sepet) |
| `09-magaza-siparis-sozlesmesi-masaustu.png` | Siparişin onaylanan sözleşme ve ön bilgilendirme metni (yazdırılabilir) |
| `10-panel-canli-siparisler-masaustu.png` | Panel sipariş listesi, "Canlı" bağlantı, teyit bekleyen sipariş |
| `11-panel-siparis-ayrintisi-iade-talebi-masaustu.png` | Sipariş ayrıntısı ve müşterinin cayma/iade talebi |
| `12-panel-urunler-masaustu.png` | Fotoğraflı ürün listesi (satır içi fiyat, satışta/tükendi) |
| `13-panel-guvenlik-ve-gizlilik-masaustu.png` | Güvenlik durumu ve gizlilik ayarları |
| `14-panel-isletme-bilgileri-masaustu.png` | İşletme bilgileri (işletme türü, vergi, ETBİS) |
| `15-panel-yasal-belgeler-masaustu.png` | Yasal belgeler ve sürümleri |
| `16-panel-siparisler-telefon.png` | Panel sipariş listesi, telefonda |
