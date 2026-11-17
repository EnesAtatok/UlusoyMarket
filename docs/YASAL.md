# Ulusoy Market — Online Siparişte Yasal Yükümlülükler, Onaylar ve Metin Taslakları

> **Önemli uyarı — bu belge hukuki görüş değildir.** Yazılım ekibi için, güncel Türk mevzuatının birincil kaynaklarından (mevzuat.gov.tr, resmigazete.gov.tr, kvkk.gov.tr, ticaret.gov.tr) ve ikincil kaynaklardan (hukuk bürosu yazıları, mesleki yayınlar) derlenmiş bir **uygulama rehberidir**. Aşağıdaki metin taslakları **canlıya çıkmadan önce mutlaka bir avukata (tercihen tüketici hukuku ve KVKK alanında çalışan) gösterilmelidir.** Mevzuat sık değişiyor; belge **17 Kasım 2026** itibarıyla bulunabilen en güncel duruma göre yazıldı.
>
> **Kaynak işaretleri:** **[B]** = birincil kaynağın güncel (konsolide) metni okundu · **[İ]** = ikincil kaynaktan (hukuk bürosu / haber / ticari blog) alındı, birincil metinle doğrulanamadı · **[T]** = yorum/çıkarım ya da teyit edilemedi; avukata sorulmalı.

Bağlam (PLAN.md, PLAN-2.md §E): Edirne'de bir mahalle marketi; üyeliksiz sipariş (ad, telefon, adres, not); gıda/içecek/temizlik/kişisel bakım; **alkol ve tütün online satılmıyor**; aynı gün kurye ile teslim veya gel-al; ödeme yalnızca **kapıda nakit / kapıda kart**; sunucu ad, telefon, adres, not, IP saklıyor; tarayıcıda localStorage (sepet, sipariş anahtarları, tema, kayıtlı adres/profil); analitik/reklam çerezi yok; isteğe bağlı Telegram bildirimi.

---

## 0. En önemli 10 bulgu (kısa)

1. **Mesafeli Sözleşmeler Yönetmeliği uygulanacak gibi davranın.** Yönetmelik m.2/2-ğ "yiyecek ve içecekler gibi günlük tüketim maddelerinin, satıcının *düzenli teslimatları çerçevesinde* tüketicinin meskenine götürülmesi"ni kapsam dışı bırakıyor; ama tek seferlik, müşterinin istediği an verdiği web siparişlerinin bu istisnaya girdiği çok tartışmalı (§4.1.1). Temkinli yol: ön bilgilendirme + teyit + sözleşme + cayma bilgisi tam yapılsın. Ayrıca 6563 sayılı e-ticaret kanununun bilgi verme ve teyit yükümlülükleri bu istisnadan bağımsız olarak zaten uygulanır.
2. **Sipariş formunda üç zorunlu, işaretsiz kutu:** (A) Ön Bilgilendirme Formu'nun teyidi, (B) Mesafeli Satış Sözleşmesi'nin kabulü, (C) KVKK Aydınlatma Metni için **"okudum ve anladım"** (KVKK Kurulu'nun 18.02.2026 tarihli ve 2026/347 sayılı ilke kararı "okudum ve kabul ediyorum/onaylıyorum" ifadesini sorunlu sayıyor). Pazarlama izni yalnızca **isteğe bağlı ve ayrı** bir kutu olabilir, o da İYS kurulmadan gösterilmemeli. Yaş beyanı ya da Telegram için kutu **önerilmiyor** (§2).
3. **Düğmenin hemen üstünde** ürünlerin temel nitelikleri, KDV dahil toplam fiyat, teslimat ücreti ve ürün ürün **cayma hakkı durumu** tek bir özet kutusunda gösterilmeli (MSY m.6/2-a). Düğmede ya da hemen üstünde **"siparişin ödeme yükümlülüğü doğurduğu"** açıkça yazmalı (MSY m.8/1). Bu bildirim yapılmazsa tüketici siparişle bağlı sayılmaz.
4. **Sipariş teyidi tek kanal yetmez.** E-ticaret yönetmeliği m.9/1'e göre sipariş, sitedeki teyidin yanında **e-posta, SMS veya telefon aramasından en az biriyle** de gecikmeksizin teyit edilmeli. E-posta ve SMS yoksa en ucuz yol, personelin müşteriyi arayıp panelde "teyit araması yapıldı" kaydı tutması [İ].
5. **Kalıcı veri saklayıcısı:** E-posta toplamadığımız için ön bilgilendirme ve sözleşme şu yollarla verilmeli: (a) onay ekranında **indir/yazdır**, (b) gizli takip bağlantısında siparişin **o anki, değiştirilemez sürümüne** erişim, (c) en güçlüsü olarak **teslimatta basılı nüsha** (fiş ile birlikte). İşletmenin kendi WhatsApp hesabından göndermek, yurt dışına veri aktarımı sorunu doğurur (§2.4).
6. **Telegram bildirimi bugünkü haliyle KVKK'ya aykırı olma riski taşıyor.** Bildirimde ad, telefon, adres ve not Telegram'ın yurt dışı sunucularına gidiyor. 7499 sayılı Kanunla değişen KVKK m.9'a göre açık rıza artık yalnızca **arızi** (düzenli olmayan, tek tük) aktarımlarda dayanak olabiliyor; her siparişte otomatik giden bildirim arızi sayılmaz. Öneri: Telegram'a **kişisel veri göndermeyin** (yalnızca sipariş no, bölge, tutar ve panel bağlantısı). Aynı sorun **sunucu yurt dışındaysa** barındırma için de geçerli (§4.3.4).
7. **Saklama süresi çelişkisi:** 6563 m.11 ve e-ticaret yönetmeliği m.33/6, e-ticaret iş ve işlemlerine ilişkin kayıtların **10 yıl** saklanmasını istiyor [B/İ]. Mesafeli yönetmelik en az **3 yıl** (m.20) istiyor. PLAN-2 §C'deki "2 yılda anonimleştir" varsayılanı bununla çelişiyor. Öneri: varsayılanı 10 yıla çekin, 2 yıldan sonra kayıtlar yalnızca yöneticinin görebildiği arşive geçsin. Avukata sorulmalı.
8. **ETBİS kaydı** (e-Devlet, ücretsiz) kendi sitesinden satış yapan herkes için, **satışa başlamadan önce** zorunlu [İ]. **VERBİS** kaydı, 50'den az çalışanı olan (bilanço esasında ayrıca bilançosu 100 milyon TL'nin altında olan) bir market için büyük olasılıkla **gerekmiyor** [İ]. **İYS** yalnızca kampanya mesajı gönderilecekse gerekli.
9. **Fiyat ve indirim:** Fiyatlar KDV dahil ve birim fiyatlı gösterilmeli. **11.10.2025'ten beri** indirimden önceki fiyat, indirimden önceki **on gün** içindeki en düşük fiyat olmalı; meyve-sebzede bir önceki fiyat esas alınıyor (Fiyat Etiketi Yönetmeliği m.11, RG 11/10/2025-33044) [B]. Eski "30 gün" kuralını anlatan haberler artık güncel değil.
10. **Mevcut varsayılan metinlerde haksız şart riski var:** `lib/defaults.js` içindeki "ayıplı ürünü en geç 24 saat içinde bildirin" kuralı 6502'ye aykırı (kanunda kısa ihbar süresi yok, 2 yıllık zamanaşımı ve 6 aylık ispat karinesi var). Ek bulgular: (a) ön ambalajlı gıdalarda etiket bilgilerinin (bileşenler, alerjenler vb.) **satın almadan önce** sitede bulunması gerekiyor (Gıda Etiketleme Yönetmeliği, uzaktan satış maddesi); (b) **20.06.2026'da yürürlüğe giren 7584 sayılı Kanun**, alkol firmalarının isim/marka/logolarını işyerinin içinde ve dışında yasakladı; Instagram adındaki ve tabeladaki "tekel" vurgusu ayrıca değerlendirilmeli.

---

## 1. Özet tablo

Sitedeki karşılık sütununun anlamı: **G** = sitede gösterim · **ZK** = zorunlu onay kutusu · **İK** = isteğe bağlı onay kutusu · **K** = kayıt/saklama · **D** = site dışı iş.

| # | Yükümlülük | Dayanak | Sitede karşılığı | Öncelik |
|---|---|---|---|---|
| 1 | Sözleşmeden önce ön bilgilendirme (satıcı kimliği, MERSİS/VKN, adres-telefon, ürün nitelikleri, KDV dahil toplam fiyat, ek masraflar, ödeme, teslim süresi, cayma şartları ve istisnaları, hakem heyeti/arabulucu bilgisi) | 6502 m.48/2; MSY m.5/1 (a–k) [B] | G: siparişe özel "Ön Bilgilendirme Formu" sayfası/penceresi | Zorunlu |
| 2 | (a)(d)(g)(h) bentlerinin **bir bütün olarak**, ödeme yükümlülüğünden hemen önce ayrıca gösterilmesi | MSY m.6/2-a [B] | G: düğmenin hemen üstünde özet kutusu | Zorunlu |
| 3 | Gönderim kısıtlamaları (bölge, minimum tutar, saat) ve kabul edilen ödeme araçlarının en geç sipariş öncesi bildirilmesi | MSY m.6/2-b [B] | G: sepet/formda bölge, min. tutar, "kapıda nakit/kart" | Zorunlu |
| 4 | En az 12 punto, açık, sade, okunabilir metin | 6502 m.4/1; MSY m.6/1 [B] | G: yasal metinlerde en az 16 px gövde yazısı (12 pt ≈ 16 px) | Zorunlu |
| 5 | Tüketicinin ön bilgileri edindiğini **teyit etmesi**; yapılmazsa "sözleşme kurulmamış sayılır" | MSY m.7 [B] | ZK-A | Zorunlu |
| 6 | "Siparişin ödeme yükümlülüğü anlamına geldiği" bildirimi; yapılmazsa tüketici siparişle bağlı değil | 6502 m.48/2; MSY m.8/1 [B] | G: düğme metni ve üstündeki cümle | Zorunlu |
| 7 | Sözleşmenin ve bilgilendirmenin bir nüshasının kâğıtta veya kalıcı veri saklayıcısıyla verilmesi | 6502 m.4/1 [B]; MSY m.4/1-c (tanım: SMS, e-posta, internet, disk...) [B]; E-ticaret Yön. m.8/1-d [İ] | G + K: indir/yazdır, değişmez bağlantı, basılı nüsha | Zorunlu |
| 8 | Sözleşmenin kabulü | 6502 m.48; TBK m.1, m.21 (genel işlem koşullarının sözleşmeye katılması) | ZK-B | Zorunlu |
| 9 | Ek ücretli seçeneklerin önceden seçili gelmemesi; ek bedel için açık onay | MSY m.19 [B] | G: ek ücretli seçenek varsa işaretsiz; "ürün yoksa muadil getir" varsayılan olmasın | Zorunlu |
| 10 | Teslim/ifa: taahhüt edilen sürede, mal satışında en geç 30 gün; ifa imkânsızsa 3 gün içinde bildirim ve 14 gün içinde iade; **stok yokluğu imkânsızlık sayılmaz** | 6502 m.48/3; MSY m.16 [B] | G: tahmini süre; panel: iptal/iade akışı | Zorunlu |
| 11 | Cayma hakkı (14 gün) ve istisnaları; cayma bildirim adresi (açık adres, faks veya **e-posta**) | 6502 m.48/4; MSY m.5/1-g,ğ,h, m.9–15 [B] | G: ön bilgilendirme ve sözleşmede, ürün bazında | Zorunlu |
| 12 | Cayma halinde teslimat ücreti dahil 14 gün içinde iade; iade masrafı tüketiciye yüklenemez | MSY m.12 (RG 24/5/2025 değişiklikleri **1/1/2026'da** yürürlüğe girdi) [B] | Metin + panel iade süreci | Zorunlu |
| 13 | Ön bilgilendirme ve cayma bilgisinin ispat yükü satıcıda; ilgili bilgi ve belgeler 3 yıl saklanır | MSY m.5/6, m.10, m.20 [B] | K: onay kaydı ve metin sürümü | Zorunlu |
| 14 | Sitede tanıtıcı bilgiler: ana sayfadan doğrudan erişilen "İletişim" başlığı altında esnafsa ad-soyad, VKN, merkez adres; tacirse unvan, MERSİS, merkez adres; KEP, e-posta, telefon, işletme adı/marka, meslek odası | 6563 m.3/1-a; E-ticaret Yön. (RG 29.12.2022/32058) m.5/1 [İ] | G: footer + "İletişim / Satıcı Bilgileri" sayfası | Zorunlu |
| 15 | "İşlem Rehberi": teknik adımlar, sözleşmenin saklanıp saklanmadığı ve erişim, hata düzeltme araçları, alternatif uyuşmazlık çözümü | 6563 m.3; E-ticaret Yön. m.7/1 [İ] | G: ana sayfadan erişilen "İşlem Rehberi" sayfası (§5.10) | Zorunlu |
| 16 | Ödeme bilgisinden/onaydan önce toplam bedelin ve şartların görülmesi; hata düzeltme araçları (özet sipariş, geri dönüp düzelt) | 6563 m.4/1; E-ticaret Yön. m.8/1 [İ] | G: "Siparişi gözden geçir" adımı | Zorunlu |
| 17 | Siparişin alındığının **site üzerinden ve ek olarak e-posta, SMS veya telefon aramasından en az biriyle** gecikmeksizin teyidi | 6563 m.4/1-b; E-ticaret Yön. m.9/1 [İ] | G: onay ekranı + D/K: teyit araması ya da SMS ve panelde kayıt | Zorunlu |
| 18 | ETBİS kaydı (satışa başlamadan önce); değişiklikleri 30 gün içinde bildirme | ETBİS ve Bildirim Yükümlülükleri Tebliği (RG 11/8/2017-30151) m.5, m.7 [İ] | D | Zorunlu |
| 19 | E-ticaret kayıtlarının 10 yıl saklanması | 6563 m.11; E-ticaret Yön. m.33/6 [B/İ] | K | Zorunlu (kapsamı §4.3.6'da tartışılıyor) |
| 20 | KVKK aydınlatması (veri sorumlusu, amaçlar, aktarım, toplama yöntemi ve hukuki sebep, m.11 hakları) — işleme başlamadan önce | KVKK m.10; Aydınlatma Tebliği (RG 10/3/2018-30356) m.5 [B/İ] | G + ZK-C ("okudum ve anladım") | Zorunlu |
| 21 | Aydınlatma metni ile açık rıza metninin ayrı olması; açık rıza dışındaki şarta dayanan işleme için açık rıza **istenmemesi** | Aydınlatma Tebliği m.5/1-f; Kurul ilke kararı 2026/347 (RG 24/3/2026-33203) [İ] | G: ayrı metinler, ayrı kutular | Zorunlu |
| 22 | Pazarlama mesajı için önceden onay; onay kutusu önceden işaretli olamaz; hizmet şartına bağlanamaz; İYS'ye 3 iş günü içinde yükleme; elektronik ortamda alınan onayın 24 saat içinde alıcıya bildirilmesi | 6563 m.6; TEİ Yön. m.5, 7, 9, 10, 13 [B] | İK-D (yalnız İYS hazırsa) | Kampanya varsa zorunlu |
| 23 | Yurt dışına aktarım: yeterlilik kararı yoksa standart sözleşme (imzadan sonra 5 iş günü içinde Kurula bildirim) veya **arızi** hallerde açık rıza | KVKK m.9 (7499 ile değişik, 1/6/2024); Yurt Dışı Aktarım Yön. (RG 10/7/2024-32598) m.14, 16 [B] | Telegram'a kişisel veri yok; Türkiye'de barındırma | Zorunlu |
| 24 | Veri güvenliği; veri işleyenle müşterek sorumluluk | KVKK m.12/1-2 [B] | D: veri işleme sözleşmeleri; K: denetim kaydı | Zorunlu |
| 25 | Veri ihlalini Kurula 72 saat içinde, ilgililere makul en kısa sürede bildirmek | KVKK m.12/5; Kurul kararı 2019/10 [B/İ] | D: ihlal prosedürü | Zorunlu |
| 26 | İlgili kişi başvurularını en geç 30 gün içinde ücretsiz yanıtlamak | KVKK m.11, m.13 [B] | Panel: dışa aktar/sil/anonimleştir | Zorunlu |
| 27 | VERBİS kaydı (istisna yoksa) | KVKK m.16; Kurul kararları 2023/1154, 2025/1572, 2025/2393 [İ] | D: muafiyet kontrolü | Muhtemelen muaf |
| 28 | Zorunlu çerez/yerel depolama için bilgilendirme (açık rıza gerekmez); analitik/reklam için önceden rıza | KVKK m.5/2-c,f; KVKK Çerez Rehberi (2022, güncelleme 2025) [İ] | G: Çerez/Yerel Depolama Bilgilendirmesi, footer bağlantısı | Zorunlu (bilgilendirme) |
| 29 | Fiyat: KDV dahil satış fiyatı + birim fiyat; tartılı üründe dara düşülmesi; indirimde önceki fiyat = son 10 gündeki en düşük fiyat | 6502 m.54; Fiyat Etiketi Yön. m.5, 9/2, 11 [B] | G: ürün kartı ve sepet | Zorunlu |
| 30 | Ön ambalajlı gıdada zorunlu etiket bilgileri (TETT/SKT hariç) satın almadan önce ve teslimde | TGK Gıda Etiketleme ve Tüketicileri Bilgilendirme Yön. (RG 26/1/2017-29960 mük.) m.17 [İ] | G: ürün sayfasında "Etiket bilgileri" alanı ya da etiket fotoğrafı | Güçlü öneri / uyum riski |
| 31 | Alkol ve tütünü online satmamak; alkol reklamı/tanıtımı yok; işyerinde alkol firması isim/marka/logosu yok | 4250 m.6 (7584 ile değişik, RG 20/6/2026); TAPDK/TADAB satış yönetmeliği [B/İ] | G: alkol görseli/marka yok; "tekel" vurgusu yok | Zorunlu |
| 32 | Fatura/fiş (ÖKC fişi ya da e-Arşiv) | VUK m.232, 509 Sıra No.lu VUK Genel Tebliği [İ] | D: mali müşavir | Zorunlu |
| 33 | Haksız şart içermeyen sözleşme (ör. 24 saatlik ayıp ihbarı, satıcı kayıtlarının "kesin delil" sayılması, cezai şart) | 6502 m.5; TBK m.20–25, m.115 [B] | Metinler (§4.7) | Zorunlu |
| 34 | Kullanım koşulları, sahte sipariş, muadil ürün, tartı farkı vb. koruyucu hükümler | Sözleşme serbestisi, haksız şart sınırı içinde | G: Kullanım/Teslimat Koşulları | Güçlü öneri |
| 35 | 18 yaş beyanı | Zorunlu değil (TMK m.11, m.16) [T] | Kutu yok; Kullanım Koşullarında tek cümle | İyi olur |

---

## 2. Sipariş formunda bulunacak onaylar — kesin liste

### 2.1 Akış (sırası önemli)

1. **Sepet:** ürünler, KDV dahil fiyat, birim fiyat (₺/kg, ₺/L), indirimde eski ve yeni fiyat, teslimat ücreti, minimum tutar, ücretsiz teslimat eşiği.
2. **Bilgi formu:** teslimat tipi, bölge, ad, telefon, adres, ödeme, para üstü, **ürün yoksa tercihi** (zorunlu seçim; varsayılan "Beni arayın" ya da "Ürünü çıkarın"; **"Muadil ürün getirin" varsayılan olamaz**, çünkü fiyat farkı doğurabilir: MSY m.19), sipariş notu (yer tutucu yazısı: "Sağlık bilgisi gibi özel bilgiler yazmayın").
3. **"Siparişi gözden geçir" adımı (ödeme yükümlülüğünden hemen önce)**, tek kutu içinde (MSY m.6/2-a):
   - Satıcı: `{{unvan}}` (`{{isletmeAdi}}`). Bu, m.6/2'nin istediği dört bent arasında yok ama kimin satıcı olduğunu netleştirir; önerilir.
   - Ürünler ve **temel nitelikleri**: ad, marka, gramaj/hacim/adet, miktar, birim fiyat, tutar.
   - **KDV dahil toplam**: ara toplam, indirim, teslimat ücreti, toplam. Tartılı ürün varsa: "Tartılı ürünlerde tutar, teslimde tartılan gerçek miktara göre kesinleşir; fark ±%10'u aşarsa sizi ararız."
   - **Cayma hakkı durumu, ürün ürün:** her satırda "Cayma: Yok (çabuk bozulan)", "Cayma: Var (ambalajı açılmamışsa)" gibi bir etiket, altında tek cümlelik açıklama ve "İptal-İade-Cayma Koşulları" bağlantısı.
   - Teslimat: tip, adres veya dükkân adresi, tahmini süre. Ödeme: kapıda nakit/kart.
   - Hata düzeltme: "Düzenle" bağlantıları (6563 m.4, E-ticaret Yön. m.8/1-c).
4. **Onay kutuları** (§2.2).
5. **Ödeme yükümlülüğü bildirimi** (§2.3) ve **düğme**.
6. **Onay ekranı** (§2.4): sipariş no, teyit, sözleşme nüshası, gizli takip bağlantısı.
7. **Ek kanal teyidi** (§2.5): telefon araması ya da SMS, panelde kayıt.

### 2.2 Onay kutuları

Ortak teknik kurallar (hepsi için):
- Kutular **ayrı ayrı** gelir, hiçbiri **önceden işaretli gelmez**, tek bir "tümünü kabul et" kutusu **olmaz** (TEİ Yön. m.7/8; Kurul 2026/347; MSY m.19 ruhu).
- Bağlantılı metin **siparişi kaybettirmeden** açılır (pencere ya da yeni sekme). Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi **o sepete ve o bilgilere göre doldurulmuş** halde gösterilir.
- Zorunlu kutular işaretlenmeden düğme pasif kalır **ve sunucu da reddeder**. İstemci tarafı denetimi tek başına ispat sağlamaz.
- Sunucu her siparişle bir **onay kaydı** saklar (§3): kutu kimliği, işaretli/işaretsiz, metin türü, metin sürümü (şablon sürümü + işlenmiş metnin SHA-256 özeti), sunucu zamanı, IP. İşlenmiş tam metnin anlık kopyası da saklanırsa ispat en güçlü hale gelir.
- Yazı boyutu en az 16 px. Kutu ve etiket `<label for>` ile bağlı, 44 px dokunma alanı.

| Kod | Zorunlu mu | Ön işaretli gelebilir mi | Bağlandığı belge | Kutunun tam metni |
|---|---|---|---|---|
| **A** `onBilgilendirme` | **Evet** (MSY m.7: teyit yoksa sözleşme kurulmamış sayılır) | **Hayır** | Ön Bilgilendirme Formu (§5.1) — siparişe özel | **"[Ön Bilgilendirme Formu]'nu okudum; siparişimle ilgili ön bilgileri (satıcı bilgileri, ürünlerin temel nitelikleri, vergiler dahil toplam fiyat, teslimat, ödeme ve cayma hakkı koşulları) edindiğimi teyit ediyorum."** |
| **B** `mesafeliSozlesme` | **Evet** | **Hayır** | Mesafeli Satış Sözleşmesi (§5.2) ve ekleri: Teslimat Koşulları (§5.9), İptal-İade-Cayma Koşulları (§5.7), Kullanım Koşulları (§5.8) | **"[Mesafeli Satış Sözleşmesi]'ni ekleri olan [Teslimat Koşulları], [İptal-İade-Cayma Koşulları] ve [Kullanım Koşulları] ile birlikte okudum ve kabul ediyorum."** |
| **C** `kvkkAydinlatma` | **Evet** (amacı onay değil, aydınlatmanın yapıldığını ispat etmek) | **Hayır** | KVKK Aydınlatma Metni (§5.3) | **"Kişisel verilerimin işlenmesine ilişkin [KVKK Aydınlatma Metni]'ni okudum ve anladım."** — *"onaylıyorum", "kabul ediyorum", "açık rıza veriyorum" kelimeleri KULLANILMAZ* (Kurul ilke kararı 2026/347). |
| **D** `ticariIleti` | **Hayır, isteğe bağlı.** Hizmet bu kutuya bağlanamaz (TEİ Yön. m.7/9). | **Hayır** (TEİ Yön. m.7/8) | Ticari Elektronik İleti İzni (§5.5) + Açık Rıza Metni (§5.4) | **"[Ticari Elektronik İleti İzni] kapsamında {{isletmeAdi}} tarafından kampanya, indirim ve duyurularla ilgili ticari elektronik iletilerin telefon numarama SMS ve arama yoluyla gönderilmesine ve bu amaçla [Açık Rıza Metni]'nde açıklandığı şekilde ad ve telefon numaramın işlenmesine izin veriyorum. İzni dilediğim zaman ücretsiz geri alabilirim."** — **Bu kutu, İYS kaydı ve SMS altyapısı hazır olana kadar gösterilmez** (§4.2.4). Panelde "Pazarlama izni topla" ayarı varsayılan kapalı olur. |
| **E** `cihazdaHatirla` | Hayır (hukuki onay değil, kolaylık tercihi) | Önerilmez (ortak kullanılan cihazlar). Kullanıcı bir kez işaretlerse tercih hatırlanabilir. | Çerez/Yerel Depolama Bilgilendirmesi (§5.6) | **"Ad, telefon ve adres bilgilerimi sonraki siparişlerde kolaylık için yalnızca bu cihazda sakla."** Yanında: "Bu cihazdaki bilgilerimi sil" bağlantısı. |

**Bilinçli olarak eklenmeyen kutular:**
- **"18 yaşından büyüğüm" kutusu:** Kanuni zorunluluk yok, alkol/tütün satılmıyor ve kutu bir şey ispatlamıyor. Bunun yerine Kullanım Koşulları m.3'te bir cümle var (§4.5).
- **"Telegram'a aktarıma açık rıza" kutusu:** Düzenli aktarımda açık rıza KVKK m.9/6'ya göre dayanak olamaz. Çözüm teknik (§4.3.4).
- **Çerez onay penceresi:** Yalnızca zorunlu depolama kullanıldığı sürece gerekmez. Footer'daki bilgilendirme bağlantısı yeterli (§4.4). Analitik eklenirse bu değişir.
- **"Kullanım koşullarını kabul ediyorum" için ayrı kutu:** B kutusuna ek olarak dahil edildi. İstenirse ayrı bir kutu da yapılabilir, ama kutu sayısını artırmak hukuken bir şey kazandırmıyor [T].

> **Sadeleştirme seçeneği [T]:** A ve B tek bir kutuda birleştirilebilir: *"Ön Bilgilendirme Formu'nu ve ekleriyle birlikte Mesafeli Satış Sözleşmesi'ni okudum; ön bilgileri edindiğimi teyit ediyor ve sözleşmeyi kabul ediyorum."* Uygulamada yaygın ve hukuken savunulabilir bir yol. Ayrı tutmak MSY m.7'deki "teyit" ile sözleşmenin kabulünü daha net ayırır. PLAN-2 §E "ayrı onaylar" dediği için ayrı tutulması önerilir; nihai karar avukatın.

### 2.3 Ödeme yükümlülüğü bildirimi ve düğme (MSY m.8/1)

- Düğmenin **hemen üstünde**, en az 16 px ve kalın: **"«Siparişi onayla» düğmesine bastığınızda siparişiniz kesinleşir ve teslimatta {{toplam}} tutarını (tartılı ürünlerde kesin tutarı) ödeme yükümlülüğü altına girersiniz. Ödeme kapıda {{odemeSekli}} ile yapılır."**
- **Düğme metni:** **"Siparişi onayla — ödeme yükümlülüğü doğurur"**. Mobilde sığmazsa **"Ödeme yükümlülüğüyle sipariş ver"** kullanılabilir. Yalnızca "Gönder", "Devam" ya da "Tamam" **kullanılmamalı**. Bu ayrıntı mevzuatta açıkça yazmıyor; AB'deki karşılık hükmün uygulamasından türetilmiş temkinli bir öneri [T].
- Gel-al siparişinde: "...dükkândan teslim alırken ödeme yükümlülüğü...".

### 2.4 Onay ekranı ve kalıcı veri saklayıcısı

Mevzuatın istediği:
- Ön bilgilendirme **yazılı olarak veya kalıcı veri saklayıcısı ile** yapılır (MSY m.6/1).
- Tüketici sözleşmesi ve bilgilendirmelerden bir nüsha **kâğıt üzerinde veya kalıcı veri saklayıcısıyla** tüketiciye verilir (6502 m.4/1).
- Kalıcı veri saklayıcısının tanımı: bilgiyi amacına uygun makul süre inceleme, **değiştirilmeden kopyalama ve aynen ulaşma** imkânı veren "kısa mesaj, elektronik posta, internet, disk, CD, DVD, hafıza kartı ve benzeri her türlü araç veya ortam" (MSY m.4/1-c) [B].

E-posta toplamadan bunu karşılamanın yolları (birlikte uygulanması önerilir):

| Yöntem | Ne yapılır | Güç |
|---|---|---|
| 1. İndir / Yazdır | Onay ekranında "Ön Bilgilendirme Formu ve Sözleşmeyi indir" (tek dosya HTML ya da PDF) ve "Yazdır" düğmeleri | Orta-güçlü. Müşteri kendi cihazına değiştirilemez bir kopya alır. |
| 2. Değişmez çevrimiçi kopya | Gizli takip bağlantısında (`/?siparis=<id>&t=<token>`) "Sözleşmem" sekmesi. Siparişin **o anki** işlenmiş metni gösterilir, sürüm özeti yazılır, metin sonradan değişmez. | Orta. Tanımda "internet" sayılıyor. Ancak AB içtihadında, satıcının kontrolündeki bir web sayfasına bağlantının tek başına kalıcı veri saklayıcısı sayılmadığı görüşü var (CJEU C-49/11 *Content Services*; bu çalışmada ayrıca doğrulanmadı) [T]. Bu yüzden tek başına bırakılmamalı. |
| 3. Basılı nüsha | Fiş/sipariş fişiyle birlikte A5 veya termal çıktı: sipariş özeti, satıcı bilgileri, cayma özeti, sözleşmenin tam metnine QR/bağlantı | **Güçlü** (6502 m.4/1 "kâğıt üzerinde"). Panelde zaten fiş görünümü var; ona eklenmesi yeterli. |
| 4. Müşterinin kendisine göndermesi | "Bağlantıyı kendinize SMS/WhatsApp ile gönderin" (Web Share API) | Destekleyici. Paylaşımı müşterinin kendisi yaptığı için işletme yurt dışı aktarım yapmış olmaz [T]. |
| 5. SMS (ileride) | Yurt içi bir SMS sağlayıcısıyla sipariş teyidi ve bağlantı. İşlem bildirimi olduğu için İYS onayı gerekmez (TEİ Yön. m.6/2), içinde tanıtım olmaması şartıyla. | Güçlü + §2.5'i de karşılar. Ücretli. |

**İşletmenin kendi WhatsApp hesabından sözleşme göndermesi önerilmez:** WhatsApp yurt dışı sunuculu bir hizmettir ve düzenli kullanım KVKK m.9 sorununu doğurur (Telegram ile aynı mantık) [T].

### 2.5 Sipariş teyidi için ek kanal (E-ticaret Yön. m.9/1)

Yönetmelik, siparişin alındığının **işlemin yapıldığı ortam üzerinden ve ayrıca** "elektronik posta, kısa mesaj veya telefon araması" araçlarından **en az biriyle** gecikmeksizin bildirilmesini istiyor [İ — lexpera konsolide metninden; birincil metin açılamadı].

- **E-posta ve SMS yokken:** personel her siparişte müşteriyi kısaca arar ("Ulusoy Market, #123 numaralı siparişinizi aldık"). Panelde sipariş kartına **"Teyit araması yapıldı"** düğmesi eklenir; zaman ve personel adı denetim kaydına yazılır. Ulaşılamazsa "arandı, ulaşılamadı" kaydı da delildir.
- **Önerilen kalıcı çözüm:** yurt içi SMS sağlayıcısı (işlem SMS'i). İsteğe bağlı bir e-posta alanı da eklenebilir (doldurulursa teyit ve sözleşme e-postayla gider).

---

## 3. Saklanacak kayıtlar

| Kayıt | İçerik | Süre (öneri) | Dayanak | Not |
|---|---|---|---|---|
| Sipariş kaydı | Sipariş no, tarih-saat, ürünler (ad, birim fiyat, miktar, tartılan gerçek miktar), ara toplam, indirim, kupon, teslimat ücreti, toplam, ödeme şekli, teslimat tipi/bölge/adres, alıcı adı ve telefonu, durum geçmişi, iptal/iade bilgisi | **10 yıl** (işlem tarihinden) | 6563 m.11; E-ticaret Yön. m.33/6 (10 yıl) [B/İ]; MSY m.20 (en az 3 yıl) [B]; TTK m.82 / VUK m.253 (defter-belge) | 2 yıldan sonra yalnızca yöneticinin erişebildiği "arşiv"e taşınması önerilir. PLAN-2 §C'deki 2 yıllık anonimleştirme varsayılanı bu süreyle çelişir (§4.3.6). |
| Onay kaydı | Her kutu için: kod, işaretli mi, metin türü, şablon sürümü, işlenmiş metnin SHA-256 özeti, sunucu zamanı (ISO, Europe/Istanbul), IP; isteğe bağlı olarak tarayıcı tanımlayıcısı (User-Agent) | Sipariş kaydıyla aynı (10 yıl) | MSY m.5/6, m.7, m.10, m.20 (ispat yükü satıcıda); KVKK m.5/2-ç, e | İspat için şart. |
| Siparişe özel işlenmiş metinler | Ön bilgilendirme + sözleşmenin o anki tam metni (veya şablon sürümü + sipariş verisinden aynen yeniden üretilebilirlik) | Sipariş kaydıyla aynı | MSY m.20; 6502 m.4/1 | Panelde "o anki sözleşmeyi görüntüle/yazdır". |
| Yasal metin sürümleri | Her şablonun her sürümü (metin, yürürlük zamanı, özet) | O sürümle verilen son siparişin süresi dolana kadar | İspat | Panelden metin değişince yeni sürüm oluşur, eskisi silinmez. |
| Sipariş teyidi kaydı | Teyit kanalı (arama/SMS/e-posta), zaman, personel, sonuç | Sipariş kaydıyla aynı | E-ticaret Yön. m.9 [İ] | |
| Cayma, iade, şikâyet yazışmaları | Bildirim tarihi, kanal, içerik, iade tarihi ve tutarı, iade yöntemi | Sipariş kaydıyla aynı (en az 3 yıl) | MSY m.11, 12, 20 | Cayma bildiriminin ispat yükü tüketicide (MSY m.11/4), ama satıcı da kaydını tutmalı. |
| Ticari ileti onay ve ret kayıtları | Onay metni, zaman, kanal, telefon, ad-soyad; İYS'ye yükleme zamanı; ret bildirimleri | Onay sona erdikten sonra **3 yıl**; diğer ileti kayıtları kayıt tarihinden 3 yıl | TEİ Yön. m.13/2 [B] | Yalnız kampanya yapılırsa. |
| Fatura/fiş | ÖKC fişi, e-Arşiv faturası | VUK: 5 yıl; TTK (tacirse): 10 yıl | VUK m.253; TTK m.82 | Mali müşavir. |
| Sunucu güvenlik günlükleri | IP, zaman, uç nokta, hız sınırı olayları | **6 ay – 1 yıl** arası, döngüsel | KVKK m.5/2-f (güvenlik, dolandırıcılığı önleme) [T] | 5651 sayılı Kanun'daki trafik bilgisi saklama yükümlülüğü yer sağlayıcıya (barındırma firması) aittir. İşletmenin kendisi için kısa tutulması önerilir [T]. |
| Engelli telefon listesi | Telefon, gerekçe, tarih, kim ekledi | Gerekçe sürdükçe; yılda bir gözden geçirilmeli | KVKK m.5/2-f; 6502 m.6 (haklı sebep) | Gerekçe kısa ve olgusal yazılmalı (ör. "3 kez kapıda teslim almadı"). |
| KVKK başvuruları ve yanıtları | Başvuru, kimlik doğrulama, yanıt, tarih | Sonuçlandıktan sonra en az 3 yıl [T] | KVKK m.13; ispat | |
| Veri ihlali kayıtları | Olgular, etkiler, alınan önlemler, bildirimler | Süresiz/uzun [T] | Kurul kararı 2019/10 (belgeleme) [İ] | |
| Panel denetim kaydı | Kim, neyi, ne zaman değiştirdi | 2 yıl [T] | KVKK m.12 (idari tedbir) | |
| Tarayıcıdaki localStorage | Sepet, profil, kayıtlı adresler, sipariş anahtarları, tema, favoriler, kupon | Kullanıcı silene kadar (cihazda) | — | "Bu cihazdaki bilgilerimi sil" düğmesi önerilir. |

**İmha:** VERBİS'e kayıt yükümlüsü olmayan veri sorumlusu için "kişisel veri saklama ve imha politikası" hazırlamak zorunlu değil (Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik, RG 28/10/2017-30224) [T]. Yine de süresi dolan kayıtlar için en az 6 ayda bir çalışan otomatik anonimleştirme işi önerilir.

---

## 4. Konu konu değerlendirme

### 4.1 6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği (MSY)

**Güncellik [B]:** MSY'nin mevzuat.gov.tr'deki konsolide metni okundu. Değişiklikler: RG 9/2/2019-30681; **23/8/2022-31932**; 4/11/2023-32359; **10/8/2024-32628** (geçiş hükmü 1/1/2026'ya uzatıldı); **24/5/2025-32909** (1/1/2026'da yürürlüğe girdi: m.5/1-g ve k, m.12/4-5 değişti, m.13/3 ve m.15/1-i yürürlükten kalktı). Danıştay 10. Dairesi'nin **6/5/2026** tarihli kararı m.15/1-ı, j, k bentlerini iptal etti (araç, müzayede, kurulumlu mallar; bu market için önemsiz).

#### 4.1.1 Kapsam dışı istisnası: "düzenli teslimat" (MSY m.2/2-ğ) uygulanır mı?

Metin [B]: *"Yiyecek ve içecekler gibi günlük tüketim maddelerinin, satıcının düzenli teslimatları çerçevesinde tüketicinin meskenine veya işyerine götürülmesi, ile ilgili sözleşmelere uygulanmaz."* Dayanağı 6502 m.48/7: kapsam dışı sözleşmeleri yönetmelik belirler [B].

**Lehte (istisna uygulanır) görüş:**
- Ürünlerin büyük kısmı tam olarak "yiyecek, içecek, günlük tüketim maddesi" ve teslim yeri tüketicinin meskeni.
- Market, belirli bölgelere, belirli saatlerde **her gün** kendi kuryesiyle teslimat yapıyor; bu bir "düzenli teslimat" sistemi olarak savunulabilir.
- Amaç bakımından: düşük tutarlı, hemen tüketilen ürünlerde ağır usul yükümlülükleri orantısız.

**Aleyhte (istisna uygulanmaz) görüş — daha güçlü görünüyor [T]:**
- Lafız "satıcının düzenli teslimatları **çerçevesinde**" diyor. Bu, belli aralıklarla tekrarlanan bir teslimat ilişkisini (süt, ekmek, damacana su, gazete dağıtımı gibi) anlatıyor. Müşterinin istediği an verdiği tek seferlik sipariş, bir "düzenli teslimat çerçevesi" içinde değil.
- Hükmün AB'deki kaynağı, Tüketici Hakları Direktifi 2011/83/AB m.3(3)(j), açıkça *"frequent and regular rounds"* (sık ve düzenli dağıtım turları) diyor ([legislation.gov.uk'daki AB metni](https://www.legislation.gov.uk/eudr/2011/83/chapter/I/data.htm?view=plain)). Komisyonun 2021 tarihli yorum kılavuzuna (2021/C 525/01) ulaşılamadı.
- Yönetmelik kendi içinde ayrım yapıyor: m.9/3-c "belirli bir süre boyunca malın **düzenli tesliminin** yapıldığı sözleşmeler"den söz ediyor. Yani "düzenli teslim" belirli bir sözleşme tipini anlatıyor.
- Sistematik yorum: MSY m.15/1-c zaten "çabuk bozulabilen veya son kullanma tarihi geçebilecek mallar" için cayma istisnası getiriyor. Eve gıda teslimatının tamamı kapsam dışı olsaydı bu bendin gıda bakımından anlamı büyük ölçüde kalmazdı.
- İstisnalar dar, tüketici lehine yorumlanır.
- **6563 sayılı Kanunun bilgi verme (m.3) ve sipariş-teyit (m.4) yükümlülükleri bu istisnadan bağımsız olarak uygulanır**, çünkü 6563'te böyle bir istisna yok.
- Bu istisnayı yorumlayan bir Yargıtay/Danıştay kararına ya da Bakanlık açıklamasına **ulaşılamadı**.

**Temkinli öneri:** MSY uygulanıyormuş gibi tam uyum (ön bilgilendirme, teyit, sözleşme, cayma bilgisi, 3 yıl saklama). Maliyeti düşük (bir kerelik metin ve iki kutu), uyumsuzluk riski ise MSY m.7 ("sözleşme kurulmamış sayılır"), m.8 ("tüketici siparişi ile bağlı değildir") ve 6502 m.77 kapsamında her işlem için idari para cezası.

#### 4.1.2 Cayma hakkı ve istisnaları (MSY m.9, m.15) [B]

- Süre **14 gün**. Mal satışında tüketicinin malı teslim aldığı gün başlar. Teslimden önce de kullanılabilir (m.9/2).
- Cayma bilgisi gerektiği gibi verilmezse 14 günle bağlı değildir; süre en fazla 1 yıl uzar (m.10).
- İstisnalar (m.15/1, "taraflarca aksi kararlaştırılmadıkça"):
  - **c)** "Çabuk bozulabilen veya son kullanma tarihi geçebilecek malların teslimine ilişkin sözleşmeler": meyve-sebze, süt ürünleri, şarküteri, et, fırın, taze ve soğuk zincir ürünleri, dondurma ve donuk ürünler.
  - **ç)** "Tesliminden sonra ambalaj, bant, mühür, paket gibi koruyucu unsurları açılmış olan mallardan; iadesi sağlık ve hijyen açısından uygun olmayanlar": açılmış kişisel bakım ürünleri, açılmış bebek bezi/ıslak mendil, diş fırçası vb.
  - **d)** Başka ürünlerle karışıp ayrıştırılamayanlar.
  - (f) Gazete/dergi (abonelik dışı).
- **Yorum sorunu [T]:** "Son kullanma tarihi geçebilecek mal" ifadesi geniş okunursa SKT'si olan her paketli gıdayı (2 yıl raf ömürlü makarna, konserve) kapsar. Dar okunursa yalnız cayma süresi içinde tarihi geçebilecek kısa ömürlü ürünleri kapsar. AB metni (CRD m.16(d)) "hızla bozulan veya süresi hızla dolacak" diyor. **Temkinli öneri:** uzun raf ömürlü, ambalajı açılmamış kuru gıda, temizlik, kâğıt ve açılmamış kişisel bakım ürünlerinde cayma hakkı **tanınsın**. Kısa ömürlü/taze/soğuk ürünlerde ve ambalajı açılmış hijyen ürünlerinde tanınmasın. Market için ekonomik etkisi küçük, uyuşmazlık riskini azaltır.
- **Ürün bazında uygulama önerisi (panel):** ürüne `caymaDurumu` alanı: `yok_cabuk_bozulan` / `acilirsa_yok_hijyen` / `var`. Kategori varsayılanı: Meyve & Sebze, Süt & Kahvaltılık, Şarküteri, Fırın, Dondurma & Tatlı → `yok_cabuk_bozulan`; Kişisel Bakım, Bebek (bez, ıslak mendil) → `acilirsa_yok_hijyen`; Temizlik, Ev & Pratik, Temel Gıda (kuru), Atıştırmalık, İçecekler (uzun ömürlü) → `var`. Son karar işletmenin ve avukatın.
- **Gel-al siparişi** de uzaktan iletişim aracıyla kurulduğu için mesafeli sözleşmedir [T]. Cayma kuralları aynen uygulanır.
- **İade taşıyıcısı ve masraf (2026'dan itibaren) [B]:** Satıcı ön bilgilendirmede iade için bir taşıyıcı belirtmezse tüketiciden **iade masrafı istenemez**. Belirtilen taşıyıcının tüketicinin bulunduğu yerde şubesi yoksa satıcı malı ücretsiz aldırmakla yükümlüdür (m.12/5). Öneri: "İade için taşıyıcı: Satıcının kendi kuryesi (ücretsiz) ya da dilerseniz dükkâna getirebilirsiniz."
- **Geri ödeme [B]:** Mal satıcıya/kuryeye teslim edilince **14 gün içinde**, **teslimat ücreti dahil**, tüketicinin kullandığı ödeme aracına uygun şekilde, masrafsız ve tek seferde (m.12/1, 12/4). Kapıda nakitte nakit ya da tüketicinin bildirdiği IBAN'a havale; kapıda kartta POS üzerinden karta iade.
- **Cayma bildirimi:** Yazılı olarak veya kalıcı veri saklayıcısıyla (m.11/1). Ön bilgilendirmede "açık adres, faks numarası veya **elektronik posta**" verilmeli (m.5/1-ğ). **İşletmenin bir e-posta adresi olmalı.** Site üzerinden cayma formu sunulursa, talebin ulaştığına dair teyit "derhal" iletilmeli (m.11/2). Öneri (iyi olur): "Siparişlerim" ekranında, sipariş anahtarıyla çalışan bir "Cayma/iade talebi" formu; panele düşer ve ekranda anında teyit verir.

#### 4.1.3 Teslim süresi ve ifa imkânsızlığı (MSY m.16) [B]

- Taahhüt edilen sürede, her halükârda en geç 30 gün. Ön bilgilendirmedeki süre reklamlarda taahhüt edilenle uyumlu olmalı (m.5/1-f).
- Öneri: "Tahmini teslim süresi {{tahminiTeslimSuresi}}; **en geç sipariş günü içinde**." Gece 02:00'ye kadar açık bir dükkânda "aynı gün" ifadesi gece yarısını aşan siparişlerde belirsizleşir; "en geç siparişin verildiği çalışma vardiyası kapanışına kadar" daha net [T]. Süre aşılırsa tüketici sözleşmeyi feshedebilir, ödeme varsa 14 gün içinde kanuni faiziyle iade edilir (m.16/2-3).
- **Stok:** "Malın stokta bulunmaması durumu, mal ediminin yerine getirilmesinin imkânsızlaşması olarak kabul edilmez" (m.16/4). Satıcı "stok yok" diyerek tek taraflı ve sorumsuz iptal yapamaz. Bu nedenle siparişte **tüketicinin önceden seçtiği** "ürün yoksa" tercihi kritik: ara / ürünü çıkar / muadil getir. Muadil ürün yalnızca tüketici bunu seçtiyse getirilir, kapıda reddedilebilir ve reddedilirse ücret alınmaz.

#### 4.1.4 Ayıplı mal (6502 m.8–12) [B]

- Kanunda ayıp için **kısa bir ihbar süresi yok**. Teslimden itibaren 6 ay içinde ortaya çıkan ayıbın teslimde var olduğu kabul edilir (m.10). Zamanaşımı 2 yıl (m.12). Seçimlik haklar: sözleşmeden dönme, bedel indirimi, ücretsiz onarım, ayıpsız misliyle değiştirme (m.11).
- **Mevcut `lib/defaults.js` iade metnindeki "teslimat anında ya da en geç 24 saat içinde bildirmeniz hâlinde" şartı haksız şart riski taşır (6502 m.5).** Bunun yerine "Teslimatta kontrol etmenizi **rica ederiz**; sonradan fark ettiğiniz ayıplar için de kanuni haklarınız saklıdır" denmeli.
- Taze ürünlerde pratik öneri: "Ürünün bozuk/çürük olduğunu fark ettiğinizde **mümkünse fotoğrafla birlikte** en kısa sürede bildirin". Bu bir rica ve ispat kolaylığıdır, hak düşürücü süre değildir.

### 4.2 6563 sayılı Elektronik Ticaret Kanunu ve ilgili düzenlemeler

#### 4.2.1 Marketin konumu: hizmet sağlayıcı, aracı değil

- 6563 m.2'deki tanımlarla [B]: market, **kendi elektronik ticaret ortamında** sipariş alan bir **"elektronik ticaret hizmet sağlayıcı" (ETHS)**. "Aracı hizmet sağlayıcı / pazar yeri" değil, çünkü başkalarının satışına aracılık etmiyor. MSY'deki aracı hizmet sağlayıcı yükümlülükleri (m.5/7, m.12/A vb.) uygulanmaz. Ön bilgilendirmede "Aracı hizmet sağlayıcı: yoktur" yazılabilir.
- **Yazılımı geliştiren / barındıran kişi:** Siteyi yalnızca işletme adına kurup barındıran kişi satıcı da aracı da değil. KVKK bakımından büyük olasılıkla **veri işleyen** (m.12/2). Bunun için işletme ile yazılım geliştiren arasında bir veri işleme sözleşmesi olmalı. Aynı yazılım birden çok işletmeye ortak bir platform/pazar yeri olarak sunulursa aracı hizmet sağlayıcılık tartışması doğabilir [T].

#### 4.2.2 Sitede bulunması zorunlu tanıtıcı bilgiler [İ]

E-ticaret Yönetmeliği (RG 29/12/2022-32058; değişiklikler RG 8/3/2025-32835 ve 15/3/2025-32842) m.5/1. **Ana sayfadan doğrudan ulaşılabilen "İletişim" başlığı** altında:
- **(a)** Tacir ise ticaret unvanı, MERSİS numarası, merkez adresi. **Esnaf ise ad-soyad, vergi kimlik numarası, merkez adresi.**
- **(b)** KEP adresi, e-posta, telefon; varsa işletme adı ve tescilli marka. (Şahıs esnafının KEP edinme zorunluluğu yoksa "KEP: yoktur" yazılması tartışmalı [T]; sermaye şirketleri için KEP zorunlu.)
- **(c)** Meslek odası, meslek davranış kuralları ve bunlara elektronik ortamda ulaşma yolu (ilgili ise).

Ayrıca 6563 m.3 (sözleşme öncesi: tanıtıcı bilgiler, teknik adımlar, sözleşmenin saklanıp saklanmadığı, hata düzeltme araçları, gizlilik kuralları, alternatif uyuşmazlık çözümü) [B]. Yönetmelik bunları ana sayfadan erişilen **"İşlem Rehberi"** başlığı altında istiyor (m.7/1) [İ]. Taslağı §5.10'da.

5651 sayılı Kanun m.3 ayrıca içerik sağlayıcıların tanıtıcı bilgilerini sitede güncel bulundurmasını istiyor [T: güncel metin bu çalışmada açılmadı]. Aynı "İletişim / Satıcı Bilgileri" sayfası bunu da karşılar.

#### 4.2.3 ETBİS kaydı [İ]

- Dayanak: 6563 m.2 (ETBİS tanımı) [B] ve **Elektronik Ticaret Bilgi Sistemi ve Bildirim Yükümlülükleri Hakkında Tebliğ** (RG 11/8/2017-30151; 2019'da değişti) m.5/1-a: **kendi elektronik ticaret ortamında** (alan adı, mobil uygulama) mal/hizmet satan hizmet sağlayıcılar kayıt olur. Ciro eşiği yok. **Faaliyete başlamadan önce**, e-Devlet üzerinden, ücretsiz. Değişiklikler ve faaliyetin sona ermesi 30 gün içinde bildirilir (m.7/2-3). Yalnız telefon/e-posta gibi bireysel iletişimle kurulan sözleşmeler kapsam dışı (m.2/2).
- **Bu market için:** web sitesinden sipariş alındığı için **kayıt gerekli**. Esnafın girişi ESBİS kaydı üzerinden yapılıyor [İ].
- **Sitede ETBİS karekodu/numarası:** Kaynaklar çelişkili. Bazı ikincil kaynaklar karekod zorunluluğunun **2 Eylül 2025'ten beri** aranmadığını söylüyor; bunu doğrulayan birincil metin bulunamadı [T]. Öneri: kayıt yapılsın; karekod/numara sitede gösterilirse zararı yok.

#### 4.2.4 Ticari elektronik ileti ve İYS (kampanya SMS/WhatsApp gönderilecekse) [B]

Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik (RG 15/7/2015-29417; değişiklikler 4/1/2020-30998, 28/8/2020-31227) konsolide metni okundu:
- Tanıtım, pazarlama, işletme tanıtımı, "kutlama ve temenni" iletileri için **önceden onay** (m.5/1). Ticari ileti göndermek isteyen **İYS'ye kaydolur** (m.5/2). **İYS'de onayı olmayan alıcıya ileti gönderilemez** (m.5/3).
- **Onay gerektirmeyenler (m.6/2):** "satın alma ve teslimat veya benzeri durumlara ilişkin bildirimler" — sipariş teyidi, "yola çıktı", "teslim edildi" mesajları. **İçlerine tanıtım konmamalı** (ör. "%10 indirim kodunuz" eklenirse ileti ticari olur).
- **Onayın içeriği (m.7):** olumlu irade beyanı, ad-soyad, elektronik iletişim adresi (telefon). Elektronik ortamda alınan onayın alındığı bilgisi, **reddetme imkânıyla birlikte 24 saat içinde** alıcının telefonuna/e-postasına iletilir (m.7/3; İYS üzerinden alınanlarda gerekmez). Onay bir satış sözleşmesine dahil edilerek alınıyorsa sözleşmenin sonunda, "Ticari Elektronik İleti" kenar başlığı altında, ret imkânı tanınarak, en az 12 punto (m.7/5). **Olumlu beyan önceden seçili olamaz** (m.7/8). **Hizmet şartı yapılamaz** (m.7/9). İYS dışında alınan onaylar **3 iş günü içinde İYS'ye kaydedilir, kaydedilmeyen onay geçersizdir** (m.7/11-12).
- **Ret:** her iletide ücretsiz ret imkânı (m.9/3-4); ret 3 iş günü içinde uygulanır ve İYS'ye bildirilir (m.9/6, m.10).
- **İçerik:** esnaf ise ad-soyad + TCKN/VKN; tacir ise MERSİS (SMS'te) (m.8/2-3).
- **Saklama:** onay kayıtları onayın bitiminden itibaren 3 yıl (m.13/2).
- **WhatsApp:** Yönetmelik tanımı "telefon, ... kısa mesaj hizmeti **gibi** vasıtalar" diyor (m.4/1-o). WhatsApp'tan gönderilen kampanya mesajının da kapsamda sayılması güçlü olasılık [T]. İYS'nin WhatsApp'ı hangi kanal türüyle karşıladığı doğrulanamadı (iys.org.tr SSS sayfası JavaScript ile yüklendiği için okunamadı).
- **Sonuç ve öneri:** Kampanya mesajı göndermek **ilk sürümde hedeflenmiyorsa** pazarlama izni **hiç toplanmasın** (D kutusu gizli). Toplanacaksa önce İYS kaydı, İYS entegrasyonu olan bir SMS sağlayıcısı, 24 saatlik onay bildirimi ve 3 iş günü içinde yükleme kurulmalı. Aksi halde toplanan onaylar zaten geçersiz olur.

### 4.3 KVKK (6698)

**Güncellik [B]:** 7499 sayılı Kanun (RG 12/3/2024) m.6, m.9, m.18'i değiştirdi; yürürlük 1/6/2024. Yurt dışı aktarım yönetmeliği RG 10/7/2024-32598 [B]. KVKK Kurulu'nun aydınlatma/açık rıza ilke kararı 2026/347 (RG 24/3/2026-33203) [İ]. VERBİS istisna kararları 2025/1572 (RG 1/10/2025-33034) ve 2025/2393 [İ].

#### 4.3.1 Hukuki sebepler — hangi işlemede açık rıza GEREKMEZ, hangisinde gerekir

| İşleme | Veriler | Hukuki sebep | Açık rıza? |
|---|---|---|---|
| Siparişin alınması, hazırlanması, teslimi, sipariş takibi, müşteriyle iletişim | Ad, telefon, adres, bölge, sipariş içeriği, not, ürün yoksa tercihi, ödeme şekli, para üstü, sipariş anahtarı | m.5/2-c (sözleşmenin kurulması/ifası) | **Gerekmez** |
| Fatura/fiş, mesafeli satış ve e-ticaret kayıtlarının saklanması, resmi taleplere yanıt | Sipariş ve kimlik/iletişim verisi | m.5/2-ç (hukuki yükümlülük: 6502/MSY m.20, 6563 m.11, VUK) | **Gerekmez** |
| Onay kayıtları, IP ve zaman damgası, uyuşmazlıkta ispat | IP, zaman, metin sürümü | m.5/2-ç ve **e** (hakkın tesisi/korunması) | **Gerekmez** |
| Güvenlik: hız sınırı, sahte sipariş önleme, engelli telefon listesi, panel denetim kaydı | IP, telefon, olay kaydı | m.5/2-f (meşru menfaat) | **Gerekmez** |
| Kampanya/indirim SMS'i, arama | Ad, telefon | **m.5/1 açık rıza** + 6563 m.6 onayı | **Gerekir** (isteğe bağlı, ayrı) |
| Telegram'a sipariş bildirimi (kişisel veriyle) | Ad, telefon, adres, not | Yurt dışı aktarım: düzenli olduğu için m.9/6-a açık rızası dayanak **olamaz** | **Yapılmamalı** → kişisel verisiz bildirim |
| Sunucu yurt dışındaysa barındırma | Tüm veriler | m.9/4-c standart sözleşme + 5 iş gününde bildirim | Açık rıza çözüm değil |

**Kurul 2026/347 [İ]:** Açık rıza dışındaki bir şarta dayanılan işlemede **ayrıca açık rıza metni sunulmamalı**. Sözleşmenin ifası için yapılan işleme için "açık rıza veriyorum" kutusu koymak hatalı. Aydınlatma metni sözleşme değil; sonunda "okudum ve kabul ediyorum / onaylıyorum / açık rıza veriyorum" yerine **"okudum ve anladım"** beyanı kullanılmalı. Açık rızaya dayalı işlemede aydınlatma metni ile açık rıza metni **ayrı** düzenlenir; aynı sayfada olsalar bile ayrı başlıklarla ve ayrı beyanla sunulur. Aydınlatmanın yapıldığını ispat yükü veri sorumlusundadır. (Kararın tam metnine ödeme duvarı nedeniyle ulaşılamadı; görünen kısım ve alomaliye.com özeti kullanıldı.)

#### 4.3.2 Aydınlatma metninin zorunlu unsurları [B/İ]

KVKK m.10: (a) veri sorumlusunun ve varsa temsilcisinin kimliği, (b) işleme amaçları, (c) kimlere, hangi amaçla aktarılabileceği, (ç) toplama yöntemi ve hukuki sebebi, (d) m.11'deki haklar. Aydınlatma Tebliği m.5: amaçlar ve hukuki sebepler belirli ve açık olmalı; "vb.", "gibi" ile genişletilmemeli; açık rızaya dayanılıyorsa aydınlatma ve rıza ayrı yapılmalı (m.5/1-f) [İ]. Taslak §5.3'te.

#### 4.3.3 İlgili kişi başvuruları [B]

- Haklar m.11. Başvuru yazılı ya da Kurulun belirlediği yöntemle (m.13/1); **en geç 30 gün içinde, ücretsiz** (m.13/2).
- Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e göre başvuru yolları: yazılı, KEP, güvenli elektronik imza, mobil imza, ilgili kişinin daha önce bildirdiği ve sistemde kayıtlı e-posta [T: Tebliğ metni bu çalışmada açılmadı]. E-posta toplamadığımız için metinde "yazılı başvuru, KEP; e-posta ile de başvurabilirsiniz, kimliğinizi doğrulamak için telefonla arayabiliriz" denmesi önerilir.
- **Silme talebi ile kanuni saklama çatışırsa:** kanuni süre dolana kadar silinmez, yalnızca işleme kısıtlanır ve gerekçesiyle yanıt verilir. Panelde "sil/anonimleştir" düğmesi, kanuni süresi dolmamış siparişlerde uyarı göstermeli.

#### 4.3.4 Yurt dışına aktarım: Telegram ve barındırma [B]

- KVKK m.9 (1/6/2024'ten beri) sırası: (1) **yeterlilik kararı** (bugüne kadar ilan edilmiş bir karar bilinmiyor [T]); (2) yoksa **uygun güvence**: Kurul ilanlı **standart sözleşme** (imzadan sonra **5 iş günü** içinde Kurula bildirim; bildirmemenin cezası m.18/1-d), bağlayıcı şirket kuralları, taahhütname; (3) bunlar da yoksa **yalnızca arızi** aktarım ve sınırlı haller: (a) risklerden haberdar edilmiş ilgilinin açık rızası, (b) sözleşmenin ifası için zorunlu olması vb.
- Yönetmelik m.16/1: arızi = *"düzenli olmayan, tek veya birkaç kez gerçekleşen, süreklilik arz etmeyen ve olağan faaliyet akışı içinde bulunmayan"* aktarım [B]. Kurulun Ocak 2025 rehberi de olağan faaliyet akışındaki aktarımları arızi saymıyor [İ].
- **Telegram:** Her siparişte otomatik giden bildirim olağan faaliyet akışı içinde ve düzenli. Arızi değil, dolayısıyla açık rıza ile yapılamaz. Telegram'la standart sözleşme imzalamak pratikte mümkün görünmüyor [T]. **Öneri (zorunlu nitelikte):** `lib/notify.js` bugün ad, telefon, adres, ürünler ve notu gönderiyor. Mesaj şu hale getirilmeli: *"Yeni sipariş #123 · Şükrüpaşa · 4 ürün · 412,50 ₺ · Kapıda kart — panelde açın: https://…/admin"*. İptal bildiriminde de ad/telefon olmamalı. Ürün adları tek başına kişisel veri sayılmayabilir, ama sipariş numarasıyla birlikte kişiye bağlanabilir; en temkinlisi ürün sayısı ve tutar [T]. Panelde "Telegram'a müşteri bilgisi gönder" seçeneği **olmamalı**.
- **Barındırma:** Sunucu (VPS, bulut) yurt dışındaysa (ör. AB veri merkezi) bu da düzenli bir yurt dışı aktarım. Çözümler: **Türkiye'de barındırma** (en kolayı) ya da sağlayıcıyla Kurul'un standart sözleşmesi + 5 iş günü içinde bildirim. Aydınlatma metni buna göre yazılmalı (§5.3'te iki seçenekli paragraf var).
- **WhatsApp/telefon:** Müşterinin kendisinin WhatsApp'tan yazması onun tercihi. Ancak işletmenin müşteri verisini (adres, sipariş) WhatsApp üzerinden düzenli olarak paylaşması (ör. kuryeye WhatsApp'tan adres atmak) aynı aktarım sorununu doğurur [T]. Kuryeye adres panelden ya da basılı fişle verilmeli.

#### 4.3.5 VERBİS [İ]

- KVKK m.16/2: Kurul objektif kriterlerle istisna getirebilir [B].
- Kurulun 2018/87 kararı, 2023/1154 kararıyla güncellenen eşik: **yıllık çalışan sayısı 50'den az ve yıllık mali bilanço toplamı 100 milyon TL'den az** olan, **ana faaliyeti özel nitelikli kişisel veri işleme olmayan** veri sorumluları kayıttan muaf. 2025/2393 sayılı kararla açıklık getirildi: **bilanço esasına göre defter tutanlarda iki kriter birlikte**, işletme hesabı esasında (ve muhtemelen basit usulde) **yalnızca çalışan sayısı** dikkate alınır. 2025/1572 sayılı kararla getirilen 10 çalışan / 10 milyon TL kriteri yalnızca ana faaliyeti özel nitelikli veri işleme olanlar (ör. eczaneler) için.
- **Bu market için:** büyük olasılıkla **muaf**. Muafiyet aydınlatma, güvenlik, başvuru, ihlal bildirimi ve yurt dışı aktarım yükümlülüklerini **kaldırmaz**.

#### 4.3.6 Saklama süreleri — PLAN ile çelişki [B/İ/T]

- 6563 m.11 (mevzuat.gov.tr metninden alıntı): hizmet sağlayıcılar Kanun kapsamındaki iş ve işlemlere ilişkin bilgi, belge, defter ve elektronik kayıtları "iş veya işlemin gerçekleştiği tarihten itibaren on yıl süreyle saklamakla yükümlüdür". E-ticaret Yön. m.33/6 aynı yönde [İ].
- Bu yükümlülüğün müşteri adı/telefonu/adresi gibi alanları da kapsayıp kapsamadığı tartışmalı [T]. "İşleme ilişkin kayıt" geniş okunursa kapsar.
- **Öneri:** sipariş + onay kaydı + kimlik/iletişim için varsayılan saklama **10 yıl**. 2 yıldan sonra panel listelerinden çekilip arşivlensin; yalnızca yönetici, gerekçe yazarak açabilsin. Sipariş notu gibi ispat için gerekmeyen serbest alanlar 3 yıl sonra temizlenebilir [T]. PLAN-2 §C'deki "2 yıl sonra anonimleştir" ayarının varsayılanı **10 yıl** yapılmalı ve ayar açıklamasında bu gerekçe yazmalı. **Avukata sorulmalı.**

#### 4.3.7 Veri ihlali [B/İ]

KVKK m.12/5 "en kısa sürede"; Kurul 2019/10: Kurula **72 saat** içinde (gecikme gerekçesiyle), ilgili kişilere makul en kısa sürede (iletişim bilgisi varsa doğrudan, yoksa web sitesinden ilanla). Tüm ihlaller belgelenir. Veri işleyen (barındırma, yazılım geliştiren) ihlali veri sorumlusuna gecikmeksizin bildirir. Kurul 2025/2451 sayılı kararıyla ihlal ilanlarının yayında kalma süresi 60 günle sınırlandı [İ].

#### 4.3.8 Veri işleyenler [B]

KVKK m.12/2: veri, veri sorumlusu adına başkası tarafından işleniyorsa ikisi güvenlik tedbirlerinden **müştereken sorumlu**. Yazılı **veri işleme sözleşmesi** önerilir: barındırma firması, yazılımı geliştiren/bakımını yapan kişi (sunucuya veya yedeklere erişimi varsa), dışarıdan kurye firması, mali müşavir (fatura verisi). Sözleşmede: talimatla işleme, gizlilik, güvenlik tedbirleri, alt işleyen kullanımı, ihlali gecikmeksizin bildirme, iş bitince silme/iade, yurt dışı aktarım yasağı veya koşulu.

### 4.4 Çerezler ve yerel depolama [İ]

- Türkiye'de AB'deki ePrivacy düzenlemesine benzer ayrı bir çerez kanunu yok. Değerlendirme KVKK üzerinden yapılıyor. KVKK **Çerez Uygulamaları Hakkında Rehber** (Haziran 2022; 2025'te güncellendi [İ]): **zorunlu çerezler** (sitenin çalışması, kullanıcının talep ettiği hizmet: sepet, oturum, form) için açık rıza aranmaz, aydınlatma yeterli. Analitik, reklam ve kişiselleştirme çerezleri için **önceden açık rıza**; ön işaretli kutu geçerli rıza değil.
- localStorage/sessionStorage aynı mantıkla değerlendirilir ("benzeri teknolojiler") [T].
- **Bu sitede (kod incelemesi, 17.11.2026):** `localStorage`: `cart`, `favs`, `myOrders` ([{id, token}]), `addresses`, `profile` ({name, phone, payment, substitution, ...}), `coupon`, `theme`; panelde oturum anahtarı. `sessionStorage`: `stripHidden`. Hiçbiri sunucuya izleme amacıyla gönderilmiyor; tamamı kullanıcının istediği hizmet için. **Onay penceresi gerekmez**, footer'da "Çerez ve Yerel Depolama" bağlantısı yeterli (§5.6).
- Dikkat: `profile` ve `addresses` kişisel veri içeriyor ve cihazda kalıyor. Ortak cihaz riskine karşı E kutusu ve "bu cihazdaki bilgilerimi sil" düğmesi önerilir.
- **İleride** analitik (Google Analytics, Meta Pixel vb.) ya da harici harita/yazı tipi eklenirse durum değişir: önceden rıza, ret seçeneği ve muhtemelen yurt dışı aktarım sorunu. Harici kaynak (CDN yazı tipi vb.) kullanılmaması bu açıdan da iyi.

### 4.5 Yaş, alkol ve tütün

- **18 yaş altı sipariş [T]:** Erginlik 18 yaşla başlar (TMK m.11). Ayırt etme gücüne sahip küçükler yasal temsilcinin rızası olmadan kendi işlemleriyle borç altına giremez (TMK m.16). Gündelik küçük alışverişlerde rızanın örtülü verildiği kabul edilir. Alkol/tütün satılmadığı için **yaş beyanı zorunlu değil** ve önerilmiyor. Kullanım Koşulları'nda tek cümle yeterli: "18 yaşından küçükseniz siparişi velinizin bilgisi ve izniyle verin."
- **Enerji içeceği:** Türkiye'de satış için yaş sınırı getiren yürürlükte bir düzenleme bulunamadı. TGK Enerji İçecekleri Tebliği (2017/4) etikette çocuk/18 yaş altı uyarısı öngörüyor [İ]. Bazı haberler yasağın "geleceğinden" söz ediyor, bu yüzden takip edilmeli.
- **Alkol online satış yasağı (bilgi notu):** 4250 sayılı Kanun m.6/5: alkollü içkiler "basın ve yayın yoluyla tüketicilere satılamaz ve posta ile satış yöntemi kullanılarak gönderilemez" [B]. Satış yönetmeliğinde (Tütün Mamulleri ve Alkollü İçkilerin Satışına ve Sunumuna İlişkin Usul ve Esaslar Hakkında Yönetmelik, 2011 değişikliği) **bilgi toplumu hizmetleri** ya da posta ile sipariş yöntemiyle tüketiciye satış sistemi kurulamayacağı düzenlenmiş [İ]. Tütün mamullerinin bilgi toplumu hizmetleri veya posta yoluyla satışı ve teslimi de yasak [İ]. Yönetmeliğin güncel adı ve madde numarası birincil metinden teyit edilemedi [T]. Yaptırım: 4250 m.7 / 4733 m.8 [B].
- **Alkol reklamı ve "tekel" ibaresi:** 4250 m.6/1: alkollü içkilerin reklamı ve tüketiciye yönelik tanıtımı yasak [B]. **7584 sayılı Kanunla (RG 20/6/2026)** eklenen cümle: *"Alkollü içkilerin veya alkollü içkileri üreten, ithal eden ve pazarlayan firmaların isim, marka, logo, amblemleri ile arz ambalajında yer alan ifade, şekil, isim, işaret ve görseller iş yerlerinin içinde, dışında, vitrinlerinde, satış ünitelerinde ve hiçbir etkinlik alanında bulundurulamaz."* [B] Geçici m.2 ile perakende satış yerlerine **bir yıl** uyum süresi verildi (yürürlük 20/6/2026 olarak görünüyor; bir kaynak "yayımından bir ay sonra" diyor [İ]; buna göre son tarih yaklaşık **Haziran–Temmuz 2027**).
  - **Site için risk:** Sitede, logoda, afişlerde, ürün görsellerinde ve sosyal medyada alkol ürünü, şişe, bardak ya da marka görseli **bulunmamalı**. "Tekel" kelimesi tek başına bir alkol markası değil (eski devlet tekelinin adı), ama tüketici algısında alkol/tütün satış yerini çağrıştırıyor. "Tekel" kelimesinin bazı alkol markalarının parçası olarak kullanıldığı da biliniyor [T]. Sitede ya da logoda "tekel" vurgusu, site alkol satmadığı halde **alkolün tanıtımı** gibi yorumlanabilir. PLAN.md'deki "sitede tekel vurgusu yapılmaz" kuralı doğru ve korunmalı. Eski adreslerin (`/sukrupasa-tekel` vb.) 301 ile yönlendirilmesinde sakınca görünmüyor, ama yeni sayfa başlıklarında/meta açıklamalarında "tekel" kullanılmamalı [T]. Instagram hesap adındaki (`ulusoymarkettekel`) "tekel" ibaresi ve dükkân tabelası işletmenin kendi değerlendirmesine kalıyor; 7584 sonrası tabelada alkol markası/logosu kesinlikle olmamalı.
  - Haberlere göre kişisel sosyal medya paylaşımlarına bile alkol görseli nedeniyle ceza kesilmiş [İ]. İşletme hesabında alkol görseli paylaşılmamalı.

### 4.6 Fiyat, indirim, gıda etiketi, fatura (kısa)

- **Fiyat [B]:** 6502 m.54 ve Fiyat Etiketi Yönetmeliği (RG 28/6/2014-29044; son değişiklikler 11/10/2025-33044 ve 30/1/2026-33153): satış fiyatı **tüm vergiler dahil** (m.4/1-h, m.5/2-c), **birim fiyat** (₺/kg, ₺/L, ₺/adet; satış fiyatıyla aynıysa gerekmez, m.5/6). Fiyatlar "TL", "Türk Lirası" ya da ₺ simgesiyle yazılır (m.9/4). Etiketle kasa fiyatı farklıysa **tüketici lehine olan** uygulanır (m.10/1): sitedeki fiyat bağlayıcıdır, düşük görünen fiyat kapıda yükseltilemez (bariz hata için §4.7). Tartılı satışta **dara düşülür** (m.9/2, 2025).
- **İndirim [B]:** İndirimli fiyat ile önceki fiyat birlikte gösterilir (m.11/2). **Önceki fiyat, indirimin uygulandığı tarihten önceki 10 gün içinde uygulanan en düşük fiyattır** (m.11/1, RG 11/10/2025 ile 30 günden 10 güne değişti). Meyve-sebze gibi çabuk bozulan mallarda bir önceki fiyat esas alınır. İspat satıcıda. **Uygulama önerisi:** panelde `oldPrice` elle girilmesin. Sistem fiyat geçmişini tutsun ve "önceki fiyat"ı son 10 günün en düşüğü olarak hesaplasın; indirimli fiyat bundan düşük değilse indirim etiketi gösterilmesin.
- **Gıda etiket bilgisi [İ]:** TGK Gıda Etiketleme ve Tüketicileri Bilgilendirme Yönetmeliği m.17 (uzaktan satış): ön ambalajlı gıdalarda m.9/1'deki zorunlu bilgiler (gıdanın adı, bileşenler, **alerjenler**, net miktar, saklama/kullanım koşulları, işletmeci adı-adresi, gerektiğinde menşe, beslenme bildirimi vb.; **TETT/SKT hariç**) **satın alma tamamlanmadan önce** uzaktan satış materyalinde ya da açıkça belirtilen başka uygun araçla, ek masrafsız sunulur. Teslimatta tüm zorunlu bilgiler bulunur. Bakanlık kılavuzuna göre başkasının ürettiği gıda için de satış öncesi bilgilendirmeden mesafeli satışı yapan işletme sorumlu [İ]. **Öneri:** ürün sayfasına "Etiket bilgileri / İçindekiler ve alerjenler" alanı ya da arka etiket fotoğrafı. Open Food Facts'tan görsel alınan ürünlerde içerik verisi de oradan alınabilir (lisans ve doğruluk kontrolüyle). Madde numarası güncel sürümde teyit edilmeli [T].
- **Fatura/fiş [İ]:** Fatura düzenleme sınırının altında kalan perakende satışlarda ÖKC (yazar kasa) fişi verilebilir (VUK m.232; 2026 sınırı ikincil kaynaklarda 12.000 TL). İnternetten satış yapanlar için e-Fatura/e-Arşiv geçişinde **500 bin TL brüt satış hasılatı** özel eşiği (509 Sıra No.lu VUK Genel Tebliği) ve 2026 itibarıyla e-Arşiv kapsamının genişlediği bildiriliyor. Kurye ile kapıda satışta fişin/faturanın nasıl kesileceği (mobil ÖKC/POS, e-Arşiv) **mali müşavirle** netleştirilmeli. GİB birincil kaynağına ulaşılamadı.

### 4.7 İşletmeyi ve yazılımı yapanı koruyan hükümler — ve haksız şartın sınırı

**Yazılabilecekler (taslaklarda var):**
- **Bilgilerin doğruluğu:** alıcı ad, telefon ve adresi doğru vermekle yükümlü; yanlış adres nedeniyle teslim edilemeyen sipariş için tekrar gönderimde **önceden ilan edilen** teslimat ücreti istenebilir (MSY m.5/1-d: ek masrafın önceden bildirilmesi şartıyla).
- **Sahte/asılsız sipariş:** satıcı makul şüphede siparişi telefonla doğrulayabilir; doğrulanamayan siparişi hazırlamadan iptal edebilir (ödeme alınmadığı için iade sorunu yok); kapıda tekrar tekrar teslim almama halinde ileride kapıda ödemeli sipariş kabul etmeyebilir. 6502 m.6 haklı sebep olmadan satıştan kaçınmayı yasaklıyor [B]; tekrarlanan ödeme reddi haklı sebep sayılabilir [T].
- **Stokta olmayan ürün / muadil:** tüketicinin siparişte seçtiği tercihe göre hareket edilir; muadil yalnızca tüketici seçmişse getirilir, kapıda reddedilebilir; çıkarılan ürün faturaya yansımaz; sipariş tutarı minimumun altına düşerse tüketici siparişi iptal edebilir.
- **Tartı farkı:** ₺/kg ürünlerde tutar teslimde tartılan gerçek miktara göre kesinleşir (MSY m.5/1-d "fiyatın hesaplanma usulü"); %±10'u aşan farkta tüketici aranır, kabul etmezse o ürün çıkarılır.
- **Teslim süresi tahminidir**, ama taahhüt edilen dış sınır (sipariş günü) aşılırsa tüketicinin fesih hakkı saklıdır.
- **Teslim alınmayan sipariş / ulaşılamama:** kurye adreste makul süre bekler (ör. 10 dk) ve iki kez arar; sonra sipariş dükkâna döner, tüketici aynı gün dükkândan alabilir ya da yeniden gönderim isteyebilir.
- **Bariz fiyat/bilgi hatası:** Sistem hatasıyla oluşan, herkesin hata olduğunu anlayacağı fiyatlarda (ör. 1.000 ₺'lik ürünün 1 ₺ görünmesi) satıcı, teslimattan önce tüketiciye bildirerek siparişin o kalemini iptal edebilir ya da doğru fiyatla devam etmeyi önerebilir. Dayanak TBK'daki esaslı yanılma (m.30 vd.). **Sınır [T]:** bariz olmayan fiyat farklarında Fiyat Etiketi Yön. m.10/1 gereği tüketici lehine fiyat uygulanır; bu hüküm "her türlü fiyat hatasında iptal hakkı" şeklinde genişletilmemeli.
- **Site kesintisi, üçüncü taraf bağlantılar, görsellerin temsilî olması:** sorumluluk sınırlanabilir, **ama** teslim edilen ürün açıklamaya/ambalaja aykırıysa ayıplı mal hükümleri saklıdır.
- **Yazılım geliştiricisi:** Sitede "Satıcı yalnızca {{unvan}}'dır; sitenin yazılım/barındırma hizmetini veren kişi satış sözleşmesinin tarafı değildir" cümlesi. Geliştiricinin asıl koruması tüketiciye karşı değil, **işletme ile yapacağı B2B sözleşmede**: veri işleme sözleşmesi, yasal metinlerin içerik ve güncelliğinden işletmenin sorumlu olduğu, avukat onayı şartı, `DATA_KEY`/yedek sorumluluğu, sorumluluğun sınırlanması.

**Yazılmaması gerekenler (haksız şart riski, 6502 m.5; TBK m.20–25, m.115) [B/T]:**
- Cayma hakkını istisnalar dışında kaldırmak ya da 14 günden kısa tutmak; cayma için ceza/masraf.
- Ayıp ihbarını 24 saat gibi kısa bir süreye bağlamak ve sonrası için hak düşürmek.
- "Satıcının kayıtları kesin delildir" (tüketicinin aksini ispat hakkını kaldırır).
- Kapıda teslim almama için cezai şart ya da sonraki siparişe ek ücret yansıtmak.
- Fiyatı sipariş sonrasında tek taraflı artırma yetkisi (tartı farkı dışında).
- "Satıcı hiçbir şekilde sorumlu değildir"; kişinin ölümü/yaralanması ya da ağır kusur için sorumsuzluk (TBK m.115/1 ağır kusurdan önceden sorumsuzluk anlaşmasını kesin hükümsüz sayar).
- Yetkili mahkemeyi yalnız satıcının bulunduğu yer olarak belirlemek (tüketicinin kendi yerleşim yerinde başvuru hakkı var).
- Koşulların tek taraflı değiştirilip **geçmiş siparişlere** uygulanması.
- Muadil ürünün tüketici seçmeden getirilip ücretlendirilmesi.

---

## 5. Tam metin taslakları

**Yer tutucular.** İstenenler: `{{unvan}}`, `{{adres}}`, `{{vergiDairesi}}`, `{{vergiNo}}`, `{{mersis}}`, `{{telefon}}`, `{{eposta}}`, `{{kep}}`, `{{siteAdresi}}`; sipariş bazlı: `{{siparisNo}}`, `{{tarih}}`, `{{aliciAd}}`, `{{aliciTelefon}}`, `{{teslimatAdresi}}`, `{{urunTablosu}}`, `{{araToplam}}`, `{{teslimatUcreti}}`, `{{indirim}}`, `{{toplam}}`, `{{odemeSekli}}`, `{{teslimatSekli}}`.

Taslaklarda **ek** olarak kullanılanlar (yazılım bunları ayarlardan/siparişten doldurmalı ya da metinden çıkarmalı):

| Yer tutucu | Anlamı | Kaynak |
|---|---|---|
| `{{isletmeAdi}}` | Tabeladaki ad ("Ulusoy Market") | Ayarlar |
| `{{meslekOdasi}}` | Kayıtlı olunan oda (esnaf odası / ticaret odası) | Ayarlar |
| `{{teslimatBolgeleri}}` | Aktif bölgeler listesi | Ayarlar |
| `{{calismaSaatleri}}` | Online sipariş saatleri | Ayarlar |
| `{{minTutar}}` | Minimum sipariş tutarı | Ayarlar |
| `{{tahminiTeslimSuresi}}` | Ör. "30–60 dakika" | Ayarlar |
| `{{urunYoksaTercihi}}` | Siparişte seçilen tercih | Sipariş |
| `{{metinSurumu}}` | Şablon sürümü + kısa özet | Sistem |
| `{{guncellemeTarihi}}` | Metnin son güncellenme tarihi | Sistem |
| `{{ulke}}` | Sunucunun bulunduğu ülke (yalnız aydınlatma metninin Seçenek B paragrafında) | Ayarlar |

- `{{urunTablosu}}` şu sütunları içermeli: **Ürün (marka, ad, gramaj/hacim) · Miktar · Birim fiyat (KDV dahil) · Tutar · Cayma hakkı** (Var / Yok – çabuk bozulan / Ambalajı açılırsa yok – hijyen). Tartılı ürünlerde miktar "≈ 1 kg (tartılarak)" gibi gösterilir.
- Şahıs esnafında `{{mersis}}` yoksa "MERSİS No" satırı gizlenmeli ve VKN gösterilmeli. Şirkette MERSİS zorunlu. `{{kep}}` yoksa satır gizlenmeli [T].
- `{{odemeSekli}}`: "kapıda nakit" / "kapıda kredi/banka kartı". `{{teslimatSekli}}`: "Adrese teslim (kurye)" / "Dükkândan teslim (gel-al)".

---

### 5.1 Ön Bilgilendirme Formu

> *(Siparişe özel üretilir; en az 16 px; sipariş onaylanmadan önce gösterilir ve sipariş kaydıyla birlikte saklanır. Metin sürümü: {{metinSurumu}})*

**ÖN BİLGİLENDİRME FORMU**

Bu form, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca, siparişinizi onaylamadan önce sizi bilgilendirmek amacıyla hazırlanmıştır. Bu formdaki bilgiler, aramızda kurulacak Mesafeli Satış Sözleşmesi'nin ayrılmaz parçasıdır.

**1. Satıcı bilgileri**
- Satıcı: {{unvan}} ({{isletmeAdi}})
- MERSİS No: {{mersis}} · Vergi Dairesi / Vergi Kimlik No: {{vergiDairesi}} / {{vergiNo}}
- Adres: {{adres}}
- Telefon: {{telefon}} · E-posta: {{eposta}} · KEP: {{kep}}
- İnternet sitesi: {{siteAdresi}}
- Şikâyet ve talepleriniz için ayrı bir iletişim kanalı yoktur; yukarıdaki telefon, e-posta ve adres kullanılır.
- Aracı hizmet sağlayıcı: Yoktur. Sipariş doğrudan Satıcının kendi internet sitesi üzerinden verilmektedir.

**2. Sipariş bilgileri**
- Sipariş tarihi: {{tarih}}
- Alıcı: {{aliciAd}} · Telefon: {{aliciTelefon}}
- Teslimat şekli: {{teslimatSekli}}
- Teslimat adresi: {{teslimatAdresi}}

**3. Ürünlerin temel nitelikleri ve fiyatları**

{{urunTablosu}}

- Ara toplam: {{araToplam}}
- İndirim: {{indirim}}
- Teslimat ücreti: {{teslimatUcreti}}
- **Toplam (tüm vergiler dahil): {{toplam}}**

Fiyatlara KDV dahildir. Bu tutar dışında hiçbir ek masraf, depozito ya da teminat istenmez. Kilogramla satılan (tartılı) ürünlerde tutar, teslimattan önce tartılan gerçek miktar ve ürünün kilogram fiyatı üzerinden hesaplanır (dara düşülür). Tartılan miktar siparişteki miktardan %10'dan fazla saparsa sizi arayıp onayınızı alırız; onay vermezseniz o ürün siparişten çıkarılır.

Sipariş verdiğiniz bir ürün stokta kalmamışsa, siparişte seçtiğiniz tercih uygulanır: **{{urunYoksaTercihi}}**. Muadil ürün yalnızca bu seçeneği seçtiyseniz getirilir; muadil ürünü teslimatta ücretsiz olarak reddedebilirsiniz.

**4. Ödeme**
- Ödeme şekli: **{{odemeSekli}}**. Ödeme yalnızca teslimat sırasında (gel-al siparişinde dükkânda teslim alırken) nakit ya da kredi/banka kartıyla yapılır.
- Sitede online ödeme alınmaz; kart bilgileriniz sitede istenmez ve saklanmaz.
- Siparişi onaylamanız, teslimatta yukarıdaki toplam tutarı (tartılı ürünlerde kesinleşen tutarı) **ödeme yükümlülüğü** doğurur.

**5. Teslimat**
- Teslimat yalnızca şu bölgelere yapılır: {{teslimatBolgeleri}}. Online sipariş saatleri: {{calismaSaatleri}}. Minimum sipariş tutarı: {{minTutar}}.
- Tahmini teslim süresi: **{{tahminiTeslimSuresi}}**. Siparişiniz **en geç sipariş verdiğiniz gün (gece yarısından sonra verilen siparişlerde aynı çalışma vardiyasının kapanışı) içinde** teslim edilir. Bu süre içinde teslim edemeyeceğimizi anlarsak sizi ararız. Siparişi ücretsiz iptal edebilir ya da sizin onayınızla başka bir zamana erteleyebiliriz. Teslim süresi aşılırsa sözleşmeyi feshedebilirsiniz.
- Teslimat Satıcının kendi kuryesiyle yapılır. Gel-al siparişinde ürünler {{adres}} adresindeki dükkândan teslim alınır.
- Ayrıntılar: Teslimat Koşulları.

**6. Cayma hakkı**
- Cayma hakkı bulunan ürünlerde (yukarıdaki tabloda "Cayma: Var" yazanlar), ürünü teslim aldığınız günden itibaren **14 gün** içinde hiçbir gerekçe göstermeden ve cezai şart ödemeden sözleşmeden cayabilirsiniz. Teslimattan önce de cayabilirsiniz.
- Cayma bildiriminizi süre dolmadan **yazılı olarak veya kalıcı veri saklayıcısıyla** (e-posta, SMS, WhatsApp yazılı mesajı ya da sitedeki "Siparişlerim > Cayma/iade talebi" formu) şu adreslerden birine iletmeniz yeterlidir: Adres: {{adres}} · E-posta: {{eposta}} · KEP: {{kep}}. Mesafeli Sözleşmeler Yönetmeliği ekindeki örnek cayma formunu da kullanabilirsiniz.
- **İade taşıyıcısı:** Ürünü Satıcının kendi kuryesi ücretsiz olarak adresinizden alır ya da dilerseniz dükkâna getirebilirsiniz. İade için sizden hiçbir masraf istenmez.
- Cayma bildiriminden itibaren 14 gün içinde ürünü kuryemize teslim etmeniz ya da dükkâna getirmeniz gerekir. Ürün kuryeye teslim edildiği ya da dükkâna ulaştığı tarihten itibaren 14 gün içinde, **teslimat ücreti dahil** ödediğiniz tutar tek seferde ve masrafsız iade edilir: nakit ödemelerde nakit ya da bildireceğiniz banka hesabına havale; kartla ödemelerde ödeme yapılan karta.
- Ürünü olağan şekilde kullandığınız için ortaya çıkan değişiklik ve bozulmalardan sorumlu değilsiniz.

**7. Cayma hakkının kullanılamadığı ürünler**

Mesafeli Sözleşmeler Yönetmeliği m.15 uyarınca şu ürünlerde **cayma hakkı yoktur**:
- **Çabuk bozulabilen veya son kullanma tarihi geçebilecek ürünler:** meyve-sebze, süt ve süt ürünleri, et ve şarküteri, ekmek ve fırın ürünleri, dondurma ve donuk ürünler, soğuk zincirle saklanan ve kısa raf ömürlü diğer ürünler. Tabloda "Cayma: Yok – çabuk bozulan" ile gösterilir.
- **Teslimden sonra ambalajı, bandı, mührü açılmış ve iadesi sağlık ve hijyen açısından uygun olmayan ürünler:** kişisel bakım ve kozmetik ürünleri, bebek bezi, ıslak mendil, hijyenik ped, diş fırçası vb. Bu ürünlerde ambalaj açılmadıysa cayma hakkı vardır. Tabloda "Cayma: Ambalajı açılırsa yok – hijyen" ile gösterilir.
- Teslimden sonra başka ürünlerle karışan ve ayrıştırılamayan ürünler; abonelik dışı gazete ve dergi.

Bu ürünlerde cayma hakkı olmaması, **ayıplı (bozuk, hasarlı, tarihi geçmiş, yanlış ya da eksik) ürünlere ilişkin kanuni haklarınızı ortadan kaldırmaz.**

**8. Siparişin iptali**
Siparişiniz "Yeni" durumundayken (hazırlanmaya başlanmadan önce) sitedeki "Siparişlerim" ekranından ücretsiz iptal edebilirsiniz. Sonrasında iptal ve iade için {{telefon}} numarasından bize ulaşın; cayma hakkı ve istisnaları yukarıdaki gibidir.

**9. Şikâyet ve uyuşmazlık çözümü**
Şikâyetlerinizi {{telefon}}, {{eposta}} ya da {{adres}} üzerinden iletebilirsiniz. Uyuşmazlık halinde, Ticaret Bakanlığınca her yıl ilan edilen parasal sınırlar dahilinde yerleşim yerinizdeki ya da işlemin yapıldığı yerdeki **Tüketici Hakem Heyetine** (e-Devlet üzerinden de) başvurabilirsiniz. Bu sınırları aşan uyuşmazlıklarda, 6502 sayılı Kanun m.73/A uyarınca dava açmadan önce **arabulucuya başvurulması şartıyla** Tüketici Mahkemesinde dava açabilirsiniz.

**10. Sözleşmenin saklanması ve erişim**
Bu form ve Mesafeli Satış Sözleşmesi, siparişinizle birlikte Satıcı tarafından en az 3 yıl (elektronik ticaret kayıtları için 10 yıl) saklanır. Sipariş onay ekranından metinleri indirebilir veya yazdırabilirsiniz; sipariş takip bağlantınızdan siparişin verildiği andaki değiştirilemez sürüme ulaşabilirsiniz. Basılı bir özet teslimatta ürünlerle birlikte verilir.

**11. Diğer**
Sözleşme Türkçe kurulur. Siparişin internet üzerinden verilmesi için olağan internet kullanım ücreti dışında bir maliyet yoktur. Dijital içerik satılmamaktadır.

---

### 5.2 Mesafeli Satış Sözleşmesi

> *(Siparişe özel üretilir. Metin sürümü: {{metinSurumu}})*

**MESAFELİ SATIŞ SÖZLEŞMESİ**

**Madde 1 – Taraflar**
1.1. **Satıcı:** {{unvan}} ({{isletmeAdi}}) · Adres: {{adres}} · Telefon: {{telefon}} · E-posta: {{eposta}} · KEP: {{kep}} · Vergi Dairesi / No: {{vergiDairesi}} / {{vergiNo}} · MERSİS: {{mersis}} · İnternet sitesi: {{siteAdresi}} · Meslek odası: {{meslekOdasi}}
1.2. **Alıcı:** {{aliciAd}} · Telefon: {{aliciTelefon}} · Teslimat adresi: {{teslimatAdresi}}
1.3. Sitenin yazılım ve barındırma hizmetlerini sağlayan kişiler bu sözleşmenin tarafı değildir; satış sözleşmesinin tek satıcısı {{unvan}}'dır.

**Madde 2 – Konu**
Bu sözleşme, Alıcının {{siteAdresi}} internet sitesi üzerinden {{tarih}} tarihinde verdiği **{{siparisNo}}** numaralı siparişe konu ürünlerin satışı ve teslimine ilişkin olarak, 6502 sayılı Tüketicinin Korunması Hakkında Kanun, Mesafeli Sözleşmeler Yönetmeliği ve 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun uyarınca tarafların hak ve yükümlülüklerini düzenler. Alıcıya sipariş öncesinde sunulan **Ön Bilgilendirme Formu**, ekleri olan **Teslimat Koşulları**, **İptal-İade-Cayma Koşulları** ve **Kullanım Koşulları** bu sözleşmenin ayrılmaz parçasıdır. Çelişki halinde bu sözleşme ve Ön Bilgilendirme Formu esas alınır; her durumda tüketici lehine olan hüküm uygulanır.

**Madde 3 – Ürünler ve bedel**
3.1. Ürünler, miktarları ve tüm vergiler dahil fiyatları:

{{urunTablosu}}

Ara toplam: {{araToplam}} · İndirim: {{indirim}} · Teslimat ücreti: {{teslimatUcreti}} · **Toplam (KDV dahil): {{toplam}}**

3.2. Kilogramla satılan ürünlerde bedel, teslimattan önce tartılan gerçek net miktar (dara düşülerek) ile ürünün kilogram fiyatının çarpımıdır. Fark %10'u aşarsa Satıcı Alıcıyı arar; Alıcı kabul etmezse ürün siparişten çıkarılır. Kesin tutar teslimatta verilen fişte gösterilir.
3.3. Sitede ilan edilen fiyat esastır; satıcı sipariş sonrasında fiyatı tek taraflı artıramaz. Ancak sitede herkesçe hata olduğu açıkça anlaşılabilecek bir fiyat ya da ürün bilgisi hatası bulunursa (örneğin sistem hatasıyla bir ürünün gerçek fiyatının çok altında görünmesi), Satıcı teslimattan önce Alıcıyı bilgilendirerek o ürünü siparişten çıkarabilir ya da doğru fiyatla devam etmeyi önerebilir. Alıcı kabul etmezse siparişini ücretsiz iptal edebilir. Bu hüküm, bariz olmayan fiyat farklarında tüketici lehine fiyatın uygulanması kuralını ortadan kaldırmaz.

**Madde 4 – Sözleşmenin kurulması ve teyit**
4.1. Sözleşme, Alıcının Ön Bilgilendirme Formu'nu teyit edip bu sözleşmeyi kabul ederek "Siparişi onayla" düğmesine basmasıyla kurulur. Alıcı, düğmeye basmanın ödeme yükümlülüğü doğurduğu konusunda bilgilendirilmiştir.
4.2. Satıcı, siparişin alındığını site üzerinden derhal ve ayrıca telefonla ya da kısa mesajla gecikmeksizin teyit eder.
4.3. Bu sözleşme ve Ön Bilgilendirme Formu, sipariş onay ekranında indirilebilir ve yazdırılabilir; sipariş takip bağlantısında siparişin verildiği andaki değiştirilemez sürümüyle erişilebilir; basılı özeti teslimatta verilir.

**Madde 5 – Ödeme**
Bedel teslimat sırasında **{{odemeSekli}}** ile ödenir. Online ödeme alınmaz. Nakit ödemede Alıcı siparişte para üstü tercihini belirtebilir. Ödeme sonrasında Alıcıya fiş veya fatura verilir.

**Madde 6 – Teslimat**
6.1. Teslimat şekli: **{{teslimatSekli}}**. Tahmini teslim süresi {{tahminiTeslimSuresi}}; teslimat en geç sipariş günü (gece yarısından sonra verilen siparişlerde aynı çalışma vardiyası) içinde yapılır. Bu süre aşılırsa Alıcı sözleşmeyi feshedebilir.
6.2. Satıcı, siparişi bu süre içinde ifa edemeyeceğini anlarsa Alıcıyı derhal bilgilendirir. Ödeme yapılmışsa iade, Mesafeli Sözleşmeler Yönetmeliği m.16 uyarınca yapılır.
6.3. Ürünler, Alıcıya ya da adreste Alıcı adına teslim alan kişiye teslim edilinceye kadar oluşan kayıp ve hasardan Satıcı sorumludur.
6.4. Teslimat, adres hatası, ulaşılamama ve teslim alınmama hallerine ilişkin ayrıntılar Teslimat Koşulları'ndadır.

**Madde 7 – Stokta bulunmayan ürünler**
Sipariş edilen ürün stokta yoksa, Alıcının siparişte seçtiği tercih uygulanır ({{urunYoksaTercihi}}). Muadil ürün yalnızca Alıcı bu seçeneği seçtiyse getirilir. Alıcı muadil ürünü teslimatta ücretsiz reddedebilir; reddedilen ya da çıkarılan ürünün bedeli alınmaz. Ürün çıkarılınca sipariş minimum tutarın altına düşerse Alıcı siparişi ücretsiz iptal edebilir.

**Madde 8 – Cayma hakkı**
8.1. Alıcı, cayma hakkı bulunan ürünlerde, ürünü teslim aldığı günden itibaren 14 gün içinde gerekçe göstermeden ve cezai şart ödemeden sözleşmeden cayabilir. Teslimattan önce de cayabilir.
8.2. Cayma bildirimi süre dolmadan yazılı olarak veya kalıcı veri saklayıcısıyla (e-posta: {{eposta}}; adres: {{adres}}; KEP: {{kep}}; WhatsApp yazılı mesajı ya da sitedeki "Siparişlerim > Cayma/iade talebi" formu) Satıcıya yöneltilir. Site üzerinden gönderilen bildirimin ulaştığı Alıcıya derhal teyit edilir.
8.3. Alıcı, cayma bildiriminden itibaren 14 gün içinde ürünü Satıcının kuryesine teslim eder ya da dükkâna getirir. İade için Alıcıdan hiçbir masraf istenmez.
8.4. Satıcı, ürün kuryesine teslim edildiği ya da dükkâna ulaştığı tarihten itibaren (teslimattan önce caymada cayma bildiriminin ulaştığı tarihten itibaren) 14 gün içinde, teslimat ücreti dahil tahsil ettiği tüm tutarı, Alıcının ödeme aracına uygun şekilde, masrafsız ve tek seferde iade eder.
8.5. Alıcı, cayma süresi içinde ürünü olağan şekilde kullanmasından doğan değişiklik ve bozulmalardan sorumlu değildir.

**Madde 9 – Cayma hakkının istisnaları**
Mesafeli Sözleşmeler Yönetmeliği m.15 uyarınca çabuk bozulabilen veya son kullanma tarihi geçebilecek ürünlerde; teslimden sonra koruyucu ambalajı açılmış ve iadesi sağlık ve hijyen açısından uygun olmayan ürünlerde; başka ürünlerle karışıp ayrıştırılamayan ürünlerde cayma hakkı yoktur. Her ürünün cayma durumu Madde 3'teki tabloda gösterilmiştir.

**Madde 10 – Ayıplı ürünler**
10.1. Teslim edilen ürün bozuk, hasarlı, son kullanma tarihi geçmiş, siparişten farklı ya da eksikse Alıcı, 6502 sayılı Kanun m.11 uyarınca dilediğini seçebilir: ürünün ayıpsız misliyle değiştirilmesi, bedel indirimi, sözleşmeden dönme (bedel iadesi) ya da mümkünse ücretsiz onarım.
10.2. Alıcının ürünleri teslimatta kontrol etmesi **rica edilir**; teslimden sonra fark edilen ayıplar için de kanuni hakları saklıdır. Taze ürünlerde, mümkünse fotoğrafla birlikte en kısa sürede bildirim yapılması sorunun hızla çözülmesini sağlar.
10.3. Bu madde, cayma hakkı bulunmayan ürünler için de geçerlidir.

**Madde 11 – Alıcının yükümlülükleri**
Alıcı, sipariş formundaki bilgileri doğru ve eksiksiz vermeyi, teslimat sırasında telefonla ulaşılabilir olmayı ve kendi adına başkasının bilgileriyle izinsiz sipariş vermemeyi kabul eder. 18 yaşından küçük Alıcılar siparişi velilerinin bilgisi ve izniyle verir.

**Madde 12 – Kişisel veriler**
Alıcının kişisel verileri, KVKK Aydınlatma Metni'nde açıklandığı şekilde işlenir. Pazarlama iletileri yalnızca Alıcının ayrıca vereceği isteğe bağlı izinle gönderilir.

**Madde 13 – Kayıtlar**
Satıcının elektronik kayıtları ve sipariş onay kayıtları, 6100 sayılı Hukuk Muhakemeleri Kanunu çerçevesinde delil olarak kullanılabilir. Alıcının aksini her türlü delille ispat hakkı saklıdır.

**Madde 14 – Uyuşmazlık çözümü**
Uyuşmazlıklarda Ticaret Bakanlığınca her yıl ilan edilen parasal sınırlar dahilinde Alıcının yerleşim yerindeki ya da işlemin yapıldığı yerdeki Tüketici Hakem Heyetleri; bu sınırları aşan uyuşmazlıklarda, dava açmadan önce arabulucuya başvurulması şartıyla, Tüketici Mahkemeleri yetkilidir.

**Madde 15 – Yürürlük**
Bu sözleşme, Alıcının elektronik ortamda onay vermesiyle {{tarih}} tarihinde kurulmuştur. Bir nüshası Satıcıda saklanır, bir nüshası Madde 4.3'teki yollarla Alıcıya verilir.

---

### 5.3 KVKK Aydınlatma Metni

> *(Genel metin; sipariş formunda C kutusuna bağlanır. Son güncelleme: {{guncellemeTarihi}})*

**KİŞİSEL VERİLERİN İŞLENMESİNE İLİŞKİN AYDINLATMA METNİ**

Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") m.10 ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, {{siteAdresi}} internet sitesi, telefon ve WhatsApp üzerinden verilen siparişler kapsamında kişisel verilerinizin nasıl işlendiğini açıklamak için hazırlanmıştır. Bu metin bir sözleşme değildir ve sizden onay istemez; amacı sizi bilgilendirmektir.

**1. Veri sorumlusu**
{{unvan}} ({{isletmeAdi}}) · Adres: {{adres}} · Telefon: {{telefon}} · E-posta: {{eposta}} · KEP: {{kep}}

**2. Hangi verileri işliyoruz?**
- **Kimlik:** ad-soyad.
- **İletişim:** telefon numarası, teslimat adresi ve bölge.
- **Müşteri işlem:** sipariş içeriği, tutarlar, kupon, ödeme şekli (nakit/kart) ve para üstü tercihi, ürün yoksa tercihi, sipariş notu, sipariş durumu ve geçmişi, sipariş ve takip anahtarı; cayma, iade ve şikâyet yazışmaları.
- **İşlem güvenliği:** IP adresi, işlem tarih ve saati, onay kayıtları (hangi metni hangi sürümüyle ne zaman onayladığınız), güvenlik günlükleri.
- **Pazarlama** (yalnızca ayrıca izin verirseniz): ticari ileti izin durumu.

Kart bilgileriniz sitede istenmez; kapıda kartla ödemede işlem bankanın POS cihazıyla yapılır. Sipariş notuna sağlık bilgisi gibi özel nitelikli veriler yazmamanızı rica ederiz.

**3. Hangi amaçlarla ve hangi hukuki sebeplerle işliyoruz?**

| Amaç | Hukuki sebep (KVKK) |
|---|---|
| Siparişinizi almak, hazırlamak, teslim etmek; sipariş takibi; sizinle siparişiniz hakkında iletişim kurmak (teyit araması, adres tarifi, ürün yoksa tercihiniz) | m.5/2-c: sözleşmenin kurulması ve ifası |
| Fiş/fatura düzenlemek; mesafeli satış ve elektronik ticaret kayıtlarını saklamak; yetkili kurumların taleplerini karşılamak | m.5/2-ç: hukuki yükümlülük (6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği, 6563 sayılı Kanun, vergi mevzuatı) |
| Ön bilgilendirme ve sözleşme onaylarınızı ispat etmek; cayma, iade, şikâyet ve uyuşmazlık süreçlerini yürütmek | m.5/2-ç ve m.5/2-e: bir hakkın tesisi, kullanılması veya korunması |
| Sitenin ve verilerin güvenliği; sahte ve kötüye kullanım amaçlı siparişlerin önlenmesi (istek sınırlama, tekrarlanan teslim almama nedeniyle telefon numarasının sipariş dışı bırakılması), yönetim paneli işlem kayıtları | m.5/2-f: temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru menfaatimiz |
| Kampanya ve duyuruların SMS/arama ile gönderilmesi (yalnızca ayrıca izin verirseniz) | m.5/1: açık rıza + 6563 sayılı Kanun m.6 onayı |

**4. Verilerinizi kimlere aktarıyoruz?**
- **Kurye:** teslimat için ad, telefon ve adresiniz (Satıcının çalışanı kurye ya da hizmet alınan kurye işletmesi), m.5/2-c ve m.8.
- **Barındırma ve yazılım hizmeti sağlayıcıları:** sitenin çalışması, bakımı ve yedeklenmesi için, Satıcı adına ve talimatıyla veri işleyen sıfatıyla.
- **Mali müşavir:** fatura ve muhasebe işlemleri için.
- **Yetkili kamu kurum ve kuruluşları ile yargı mercileri:** Ticaret Bakanlığı, vergi daireleri, tüketici hakem heyetleri, mahkemeler, kolluk; kanuni yükümlülük ve talep halinde.

*[Seçenek A — sunucu Türkiye'de ve Telegram'a kişisel veri gitmiyorsa]* Kişisel verileriniz yurt dışına aktarılmaz.

*[Seçenek B — sunucu yurt dışındaysa; yalnızca standart sözleşme imzalanıp Kurula bildirildiyse kullanın]* Sitenin barındırıldığı sunucular {{ulke}} ülkesinde bulunduğundan verileriniz, KVKK m.9/4-c uyarınca Kişisel Verileri Koruma Kurulu'nca ilan edilen standart sözleşme imzalanarak ve Kurula bildirilerek bu hizmet sağlayıcıya aktarılır.

**5. Verilerinizi nasıl topluyoruz?**
Sipariş formunu doldurmanızla elektronik ortamda; IP adresi ve işlem kayıtları sitenin kullanımı sırasında otomatik yollarla; telefon veya WhatsApp ile verdiğiniz siparişlerde sözlü ya da yazılı olarak. Tarayıcınızda tutulan bilgiler için Çerez ve Yerel Depolama Bilgilendirmesi'ne bakınız.

**6. Ne kadar süre saklıyoruz?**
- Sipariş, sözleşme ve onay kayıtları: elektronik ticaret mevzuatı gereği **10 yıl**. 2 yıldan sonra yalnızca yetkili yöneticinin erişebildiği arşivde tutulur.
- Fatura ve fişler: vergi ve ticaret mevzuatındaki süreler (5–10 yıl).
- Güvenlik günlükleri: en fazla 1 yıl.
- Ticari ileti izni kayıtları: izin sona erdikten sonra 3 yıl.
- Süre dolunca verileriniz silinir, yok edilir ya da anonim hale getirilir.

**7. Haklarınız (KVKK m.11)**
Kişisel verilerinizin işlenip işlenmediğini öğrenme; işlenmişse bilgi talep etme; işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme; yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme; eksik veya yanlış işlenmişse düzeltilmesini isteme; KVKK m.7 şartları çerçevesinde silinmesini veya yok edilmesini isteme; düzeltme ve silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini isteme; münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme; kanuna aykırı işleme nedeniyle zarara uğramanız halinde zararın giderilmesini talep etme.

Kanuni saklama süresi dolmamış kayıtlar silme talebi üzerine silinemez. Bu durumda işlemeyi kanuni amaçla sınırlar ve size gerekçesini bildiririz.

**8. Başvuru**
Başvurunuzu kimliğinizi gösteren bilgilerle birlikte yazılı olarak {{adres}} adresine elden ya da noter aracılığıyla, KEP adresimize ({{kep}}) veya güvenli elektronik/mobil imzalı olarak iletebilirsiniz. {{eposta}} adresine e-postayla da başvurabilirsiniz; kimliğinizi doğrulamak için sizi siparişte kullandığınız telefondan arayabiliriz. Başvurunuz en geç **30 gün** içinde ücretsiz sonuçlandırılır. Yanıtımızı yeterli bulmazsanız Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz.

---

### 5.4 Açık Rıza Metni (yalnızca pazarlama için)

> *Bu metin YALNIZCA kampanya/pazarlama iletisi gönderilecekse ve İYS kurulmuşsa kullanılır. Sipariş, teslimat, fatura, güvenlik ve ispat amaçlı işlemeler için açık rıza **istenmez** (Kurul ilke kararı 2026/347). Telegram bildirimi ve barındırma için açık rıza **çözüm değildir** (§4.3.4). Metin, aydınlatma metninden ayrı başlıkla sunulur; D kutusu bu metne ve §5.5'e bağlanır.*

**PAZARLAMA AMAÇLI KİŞİSEL VERİ İŞLENMESİNE İLİŞKİN AÇIK RIZA METNİ**

{{unvan}} ({{isletmeAdi}}), KVKK Aydınlatma Metni'nde ayrıntılı bilgisini verdiğimiz şekilde, **yalnızca izin vermeniz halinde** ad-soyad ve telefon numaranızı şu amaçla işleyecektir: size kampanya, indirim, yeni ürün ve dükkân duyurularını **SMS ve telefon araması** yoluyla iletmek.

- Bu izin **isteğe bağlıdır**. Vermemeniz sipariş vermenize ya da başka hiçbir hizmetimizden yararlanmanıza engel değildir.
- İzninizi dilediğiniz zaman, her iletideki ret bağlantısı veya numarası, {{telefon}}, {{eposta}} ya da İleti Yönetim Sistemi (iys.org.tr) üzerinden ücretsiz geri alabilirsiniz. Geri alma, sonraki işlemlere uygulanır.
- Bu amaçla verileriniz yalnızca ileti gönderimini yapan yurt içi SMS hizmet sağlayıcısına ve İleti Yönetim Sistemi'ne aktarılır; yurt dışına aktarılmaz.
- Verileriniz izniniz geri alınana kadar bu amaçla işlenir; izin kayıtları izin sona erdikten sonra 3 yıl saklanır.

☐ Yukarıdaki açıklamalar çerçevesinde ad-soyad ve telefon numaramın kampanya ve duyuru iletilerinin gönderilmesi amacıyla işlenmesine **açık rıza veriyorum**.

*(Kurulun ekli iyi uygulama şablonunda "açık rıza veriyorum ☐ / açık rıza vermiyorum ☐" şeklinde iki kutu yer alıyor [İ]. Web formunda tek, işaretsiz kutu ve "işaretlemezseniz izin vermemiş sayılırsınız" açıklaması yaygın; avukata sorulmalı [T].)*

---

### 5.5 Ticari Elektronik İleti İzni

> *(D kutusuna bağlanır; yalnız İYS kurulduysa. TEİ Yön. m.7/5: sözleşmeye dahil edilirse "Ticari Elektronik İleti" kenar başlığıyla, en az 12 punto, ret imkânıyla.)*

**TİCARİ ELEKTRONİK İLETİ İZNİ**

6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun ve Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik uyarınca:

- **Kimden:** {{unvan}} ({{isletmeAdi}}) · {{vergiNo}} · {{telefon}}
- **Ne gönderilir:** Kampanya, indirim, yeni ürün ve dükkân duyuruları.
- **Hangi kanallardan:** SMS ve telefon araması ([ ] SMS · [ ] Arama, ayrı ayrı seçilebilir — öneri).
- **Hangi numaraya:** Sipariş formunda verdiğiniz telefon numarası ({{aliciTelefon}}).
- Bu izin isteğe bağlıdır ve sipariş verebilmeniz için şart değildir. Kutu önceden işaretli gelmez.
- İzniniz alındığında, **24 saat içinde** telefonunuza izin alındığına dair bir bilgilendirme ve ret imkânı gönderilir. İzniniz 3 iş günü içinde İleti Yönetim Sistemi'ne (İYS) kaydedilir.
- Her iletide ücretsiz ret imkânı bulunur. Ret talebiniz en geç 3 iş günü içinde uygulanır. İzninizi iys.org.tr üzerinden de yönetebilirsiniz.
- Sipariş teyidi, "yola çıktı", "teslim edildi" gibi siparişinizle ilgili bildirimler için ayrıca izin gerekmez; bu bildirimlerde tanıtım yapılmaz.

**Beyan (D kutusu):** "Ticari Elektronik İleti İzni kapsamında {{isletmeAdi}} tarafından kampanya, indirim ve duyurularla ilgili ticari elektronik iletilerin telefon numarama SMS ve arama yoluyla gönderilmesine ve bu amaçla Açık Rıza Metni'nde açıklandığı şekilde ad ve telefon numaramın işlenmesine izin veriyorum. İzni dilediğim zaman ücretsiz geri alabilirim."

---

### 5.6 Çerez ve Yerel Depolama Bilgilendirmesi

> *(Footer'da "Çerez ve Yerel Depolama" bağlantısı; onay penceresi gerekmez. Son güncelleme: {{guncellemeTarihi}})*

**ÇEREZ VE YEREL DEPOLAMA BİLGİLENDİRMESİ**

{{siteAdresi}} sitesi **reklam, analitik veya takip amaçlı çerez kullanmaz**, üçüncü taraf ölçüm, reklam ya da sosyal medya araçları içermez.

Sitenin çalışması ve sizin istediğiniz hizmetleri (sepet, sipariş takibi, tercih hatırlama) sunabilmesi için tarayıcınızın **yerel depolama** (localStorage/sessionStorage) alanında aşağıdaki bilgiler tutulur. Bu bilgiler **yalnızca sizin cihazınızda** durur, sunucumuza takip amacıyla gönderilmez:

| Ad | Ne tutar | Neden | Ne kadar |
|---|---|---|---|
| `cart` | Sepetteki ürünler ve adetleri | Sepetin sayfalar arasında korunması | Siz boşaltana ya da tarayıcı verilerini silene kadar |
| `coupon` | Uyguladığınız kupon kodu | Sepette indirimin korunması | Sipariş verilene ya da kupon kaldırılana kadar |
| `myOrders` | Bu cihazdan verdiğiniz siparişlerin numarası ve gizli takip anahtarı | "Siparişlerim" ekranı ve sipariş iptali | Siz silene kadar |
| `profile` | Ad, telefon, ödeme ve "ürün yoksa" tercihiniz | Sonraki siparişte formu doldurmak (yalnız "bu cihazda hatırla" seçerseniz) | Siz silene kadar |
| `addresses` | Kayıtlı teslimat adresleriniz | Adres seçimini kolaylaştırmak (yalnız "bu cihazda hatırla" seçerseniz) | Siz silene kadar |
| `favs` | Favori ürünleriniz | Favori listesi | Siz silene kadar |
| `theme` | Açık/koyu tema tercihi | Görünüm tercihi | Siz değiştirene kadar |
| `stripHidden` (sessionStorage) | Kapattığınız bilgi şeridi | Aynı oturumda tekrar göstermemek | Sekme kapanınca silinir |

Yönetim paneline giriş yapan personel için oturum anahtarı da yerel depolamada tutulur.

Bu kayıtlar, sitenin talep ettiğiniz hizmeti sunabilmesi için **zorunludur**. KVKK m.5/2-c (sözleşmenin kurulması ve ifası) ve m.5/2-f (meşru menfaat) kapsamında işlenir; açık rızanız gerekmez. Bu bilgileri istediğiniz zaman "Siparişlerim > Bu cihazdaki bilgilerimi sil" düğmesiyle ya da tarayıcınızın site verilerini temizleyerek silebilirsiniz. Ortak kullanılan bir cihazdaysanız "bu cihazda hatırla" seçeneğini işaretlememenizi öneririz.

İleride ölçüm veya reklam amaçlı bir araç kullanılırsa, bu araçlar sizden önceden izin alınmadan çalıştırılmaz ve bu metin güncellenir.

---

### 5.7 İptal, İade ve Cayma Koşulları

> *(Mesafeli Satış Sözleşmesi'nin eki; ayrıca `/iade-kosullari` sayfası. Son güncelleme: {{guncellemeTarihi}})*

**İPTAL, İADE VE CAYMA KOŞULLARI**

**1. Siparişi iptal etmek**
- Siparişiniz **"Yeni"** durumundayken (hazırlanmaya başlanmadan) sitedeki **Siparişlerim** ekranından tek dokunuşla, ücretsiz iptal edebilirsiniz.
- Hazırlanmaya başlanan siparişler için {{telefon}} numarasından bize ulaşın. Cayma hakkı olan ürünlerde teslimattan önce de cayabilirsiniz (aşağıda); çabuk bozulan ürünler hazırlandıktan sonra iptal edilemeyebilir.
- Kapıda ödeme yapıldığı için iptal edilen siparişte sizden hiçbir ücret alınmaz.

**2. Cayma hakkı (14 gün)**

| Ürün grubu | Cayma hakkı |
|---|---|
| Meyve-sebze, süt ve süt ürünleri, et ve şarküteri, ekmek ve fırın ürünleri, dondurma ve donuk ürünler, soğuk zincir ve kısa raf ömürlü ürünler | **Yok** (çabuk bozulabilen / son kullanma tarihi geçebilecek ürün — Mesafeli Sözleşmeler Yön. m.15/1-c) |
| Kişisel bakım ve kozmetik, bebek bezi, ıslak mendil, hijyenik ped, diş fırçası vb. | **Ambalajı açılmamışsa var; açıldıysa yok** (hijyen — m.15/1-ç) |
| Temizlik ürünleri, kâğıt ürünler, ev gereçleri, uzun raf ömürlü kapalı ambalajlı gıda ve içecekler | **Var** (ambalajı açılmamış, kullanılmamış olarak) |

Her ürünün cayma durumu sipariş özetinde ve sözleşmenizdeki ürün tablosunda ayrıca yazar.

**Nasıl caydınız?** Teslim aldığınız günden itibaren 14 gün içinde e-posta ({{eposta}}), WhatsApp yazılı mesajı, adresimize yazılı başvuru ({{adres}}), KEP ({{kep}}) ya da **Siparişlerim > Cayma/iade talebi** formuyla bildirmeniz yeterlidir. Gerekçe göstermeniz gerekmez. Sitedeki formdan gönderilen talep ekranda hemen teyit edilir.

**Ürünü nasıl geri verirsiniz?** Cayma bildiriminden itibaren 14 gün içinde kuryemiz ürünü adresinizden **ücretsiz** alır ya da dilerseniz dükkâna getirirsiniz. İade için sizden hiçbir masraf istenmez.

**Paranız ne zaman iade edilir?** Ürün kuryemize teslim edildiği ya da dükkâna ulaştığı tarihten itibaren **en geç 14 gün içinde**, teslimat ücreti dahil, tek seferde: nakit ödemelerde nakit ya da bildireceğiniz IBAN'a havale; kartla ödemelerde ödeme yaptığınız karta (bankanıza bağlı olarak hesabınıza yansıması birkaç gün sürebilir).

**3. Ayıplı, bozuk, eksik veya yanlış ürün**
- Teslim edilen ürün bozuk, hasarlı, son kullanma tarihi geçmiş, siparişten farklı ya da eksikse, **cayma hakkı olmayan ürünler dahil** 6502 sayılı Kanun'daki seçimlik haklarınızı kullanabilirsiniz: ürünün değiştirilmesi, bedel indirimi, bedelin iadesi ya da mümkünse onarım.
- Ürünleri teslimatta kontrol etmenizi rica ederiz; sonradan fark ettiğiniz ayıplar için de kanuni haklarınız saklıdır. Taze ürünlerde, mümkünse fotoğrafla birlikte en kısa sürede {{telefon}} ya da WhatsApp üzerinden bildirmeniz sorunu hızla çözmemizi sağlar.
- Ayıplı ürün nedeniyle iade ya da değişimde hiçbir masraf sizden istenmez.

**4. Muadil ürün ve eksik ürün**
- Stokta olmayan ürün için siparişte seçtiğiniz tercih uygulanır. Muadil ürünü teslimatta ücretsiz reddedebilirsiniz. Getirilemeyen ürünün bedeli alınmaz.

**5. Şikâyet ve başvuru yolları**
{{telefon}} · {{eposta}} · {{adres}}. Uyuşmazlıklarda Tüketici Hakem Heyetine (e-Devlet üzerinden de) ya da arabulucuya başvurduktan sonra Tüketici Mahkemesine başvurabilirsiniz.

---

### 5.8 Kullanım Koşulları

> *(Mesafeli Satış Sözleşmesi'nin eki; `/kullanim-kosullari`. Son güncelleme: {{guncellemeTarihi}})*

**KULLANIM KOŞULLARI**

**1. Taraflar ve kapsam**
{{siteAdresi}} internet sitesi {{unvan}} ({{isletmeAdi}}) tarafından işletilir. Bu koşullar siteyi kullanan herkes için geçerlidir. Sipariş veren tüketiciler bakımından Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi ile birlikte uygulanır; çelişki halinde onlar ve tüketici lehine olan hüküm esastır. Sitenin yazılım ve barındırma hizmetini sağlayan kişiler satış sözleşmesinin tarafı değildir.

**2. Üyelik**
Sitede üyelik yoktur. Siparişleriniz bu cihazda saklanan gizli takip anahtarlarıyla eşleştirilir. Takip bağlantınızı yalnızca güvendiğiniz kişilerle paylaşın; bağlantıya sahip olan kişi siparişin durumunu görebilir ve "Yeni" durumundaki siparişi iptal edebilir.

**3. Sipariş verirken**
- Ad, telefon ve adres bilgilerinizi doğru ve eksiksiz vermeniz gerekir. Başka bir kişi adına sipariş veriyorsanız o kişinin bilgisi ve izni olmalıdır.
- 18 yaşından küçükseniz siparişi velinizin bilgisi ve izniyle verin.
- Siteden alkollü içki ve tütün ürünü satılmaz.

**4. Siparişin doğrulanması ve sahte siparişler**
- Satıcı, siparişi teyit etmek ve adres tarifini netleştirmek için sizi arayabilir. Makul şüphe uyandıran (ör. ulaşılamayan numara, gerçek dışı adres, kısa sürede çok sayıda sipariş) bir siparişi telefonla doğrulayamazsa, hazırlamadan önce iptal edebilir ve size bildirir. Ödeme kapıda yapıldığından bu durumda sizden hiçbir ücret alınmaz.
- Kötü niyetli, asılsız ya da başkası adına izinsiz verilen siparişler nedeniyle doğan zararlar için kanuni haklarımız saklıdır.
- Aynı telefon numarasıyla verilen siparişlerin **tekrarlanan şekilde** (en az üç kez) haklı bir neden olmaksızın teslim alınmaması ya da kapıda ödemenin reddedilmesi halinde, Satıcı o numaradan kapıda ödemeli sipariş kabul etmeyebilir. Bu kararla ilgili bize ulaşarak itiraz edebilirsiniz.

**5. Fiyatlar, stok ve ürün bilgileri**
- Fiyatlara KDV dahildir; birim fiyatlar ürün kartlarında gösterilir. İndirimli ürünlerde indirimden önceki fiyat, mevzuata uygun şekilde (indirimden önceki son 10 gündeki en düşük fiyat) gösterilir.
- Stok bilgisi anlıktır ve dükkândaki satışlar nedeniyle değişebilir. Stokta olmayan ürün için siparişte seçtiğiniz tercih uygulanır.
- Ürün görselleri ürünü tanıtmak içindir; ambalaj tasarımı üreticiye göre değişebilir. Ürünün içerik ve etiket bilgileri için ürün sayfasındaki etiket bilgileri ve teslim edilen ürünün ambalajı esastır. Teslim edilen ürün açıklamaya aykırıysa ayıplı mal hükümleri uygulanır.
- Sitede herkesçe açıkça hata olduğu anlaşılabilecek bir fiyat/ürün bilgisi hatası olursa, Mesafeli Satış Sözleşmesi m.3.3 uygulanır.

**6. Fikri haklar**
Sitedeki tasarım, metin, logo ve yazılım {{unvan}}'a veya lisans verenlere aittir; izinsiz kopyalanamaz. Marka ve ürün görselleri ilgili hak sahiplerine aittir ve yalnız ürünü tanıtmak için kullanılır.

**7. Sitenin kullanımı**
Siteyi hukuka aykırı amaçla kullanmak, otomatik araçlarla aşırı istek göndermek, güvenlik önlemlerini aşmaya çalışmak ve başkalarının sipariş bilgilerine erişmeye çalışmak yasaktır. Bu durumlarda erişim kısıtlanabilir ve yasal yollara başvurulabilir.

**8. Sorumluluk**
- Satıcı, sitenin kesintisiz ve hatasız çalışması için makul özeni gösterir. Bakım, teknik arıza, internet altyapısı ya da elektrik kesintisi gibi nedenlerle site geçici olarak kullanılamayabilir; bu durumda telefon ve WhatsApp ile sipariş verebilirsiniz.
- Siteden bağlantı verilen üçüncü taraf sitelerin (harita, WhatsApp vb.) içeriğinden ve kişisel veri uygulamalarından Satıcı sorumlu değildir.
- Bu madde, Satıcının ayıplı mal, ürün güvenliği, kişisel verilerin korunması ve tüketici mevzuatından doğan sorumluluklarını **ve kast veya ağır kusurundan doğan sorumluluğunu sınırlamaz.**

**9. Değişiklikler**
Bu koşullar güncellenebilir. Güncel metin sitede yayımlandığı andan itibaren **sonraki siparişler** için geçerlidir; verilmiş siparişlere, o siparişin verildiği andaki metin uygulanır.

**10. Uygulanacak hukuk ve uyuşmazlıklar**
Türk hukuku uygulanır. Tüketici uyuşmazlıklarında Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir; tüketicinin kendi yerleşim yerinde başvuru hakkı saklıdır.

**11. İletişim**
{{unvan}} · {{adres}} · {{telefon}} · {{eposta}} · KEP: {{kep}}

---

### 5.9 Teslimat Koşulları

> *(Mesafeli Satış Sözleşmesi'nin eki; `/teslimat-kosullari`. Son güncelleme: {{guncellemeTarihi}})*

**TESLİMAT KOŞULLARI**

**1. Bölgeler, saatler, tutarlar**
- Teslimat bölgeleri: {{teslimatBolgeleri}}. Bu bölgeler dışına teslimat yapılmaz.
- Online sipariş saatleri: {{calismaSaatleri}}. Sipariş alımı geçici olarak durdurulduğunda sitede açıkça yazar.
- Minimum sipariş tutarı: {{minTutar}}. Teslimat ücreti sepette ve sipariş özetinde gösterilir; ücretsiz teslimat eşiği varsa sepette yazar.
- Ödeme yalnızca kapıda nakit veya kapıda kredi/banka kartıyla yapılır.

**2. Teslim süresi**
- Tahmini teslim süresi: {{tahminiTeslimSuresi}}. Yoğunluk, hava ve trafik koşullarına göre değişebilir; güncel durum sipariş takip ekranında görünür.
- Siparişiniz **en geç sipariş verdiğiniz gün** (gece yarısından sonraki siparişlerde aynı çalışma vardiyası) içinde teslim edilir. Gecikme olursa sizi ararız; dilerseniz siparişi ücretsiz iptal edebilirsiniz. Taahhüt edilen süre aşılırsa sözleşmeyi feshetme hakkınız vardır.

**3. Teslim anı**
- Teslimat, verdiğiniz adreste size ya da adreste sizin adınıza teslim alan kişiye yapılır.
- Ürünleri teslimatta kontrol etmenizi rica ederiz; sorunlu ürünü kuryeye hemen iade edebilirsiniz. Sonradan fark ettiğiniz sorunlar için de kanuni haklarınız saklıdır.
- Tartılı ürünlerin kesin tutarı, sipariş özetinin ve sözleşmenizin basılı özetiyle birlikte teslim edilen fişte yazar.

**4. Adrese ulaşılamaması, adres hatası, teslim alınmaması**
- Kurye adreste en az **10 dakika** bekler ve sizi **iki kez** arar. Ulaşılamazsa sipariş dükkâna geri döner; aynı gün dükkândan teslim alabilir ya da yeniden gönderim isteyebilirsiniz.
- Adres hatası ya da ulaşılamama sizden kaynaklanıyorsa ve yeniden gönderim isterseniz, sitede ilan edilen teslimat ücreti yeniden uygulanabilir. Hata bizden kaynaklanıyorsa ücret alınmaz.
- Çabuk bozulan ürünler aynı gün içinde teslim alınmazsa saklanamayabilir.
- Siparişin haklı bir neden olmaksızın teslim alınmaması ya da kapıda ödemenin reddedilmesi tekrarlanırsa (en az üç kez), o telefon numarasıyla kapıda ödemeli sipariş kabul edilmeyebilir. Bu durumda sizden herhangi bir ceza ya da ek ücret istenmez.

**5. Gel-al (dükkândan teslim)**
- Sipariş durumunuz "Hazır, teslim alabilirsiniz" olduğunda {{adres}} adresindeki dükkândan, çalışma saatleri içinde teslim alabilirsiniz; ödemeyi teslim alırken yaparsınız.
- Hazır olan siparişi aynı gün içinde almanızı rica ederiz; çabuk bozulan ürünler sonraki güne saklanamayabilir.

**6. Kayıp ve hasar**
Ürünler size teslim edilinceye kadar oluşan kayıp ve hasardan Satıcı sorumludur.

---

### 5.10 İşlem Rehberi (ek — E-ticaret Yön. m.7/1 gereği)

> *(Ana sayfadan doğrudan erişilen "İşlem Rehberi" bağlantısı.)*

**İŞLEM REHBERİ — Nasıl sipariş verilir?**

1. **Ürün seçimi:** Kategorilerden ya da arama kutusundan ürünleri bulun, "Sepete ekle" ile sepetinize ekleyin. Sepette adetleri değiştirebilir ya da ürün çıkarabilirsiniz.
2. **Teslimat ve iletişim bilgileri:** Adrese teslim ya da dükkândan teslim seçin; teslimat bölgenizi, adınızı, telefonunuzu ve adresinizi girin; ödeme şeklini (kapıda nakit / kapıda kart) ve ürün yoksa tercihinizi seçin.
3. **Gözden geçirme ve düzeltme:** "Siparişi gözden geçir" ekranında ürünler, toplam tutar, teslimat ücreti ve cayma hakkı bilgileri bir arada gösterilir. Hatalı bir bilgi varsa "Düzenle" bağlantılarıyla önceki adımlara dönüp düzeltebilirsiniz; sipariş onaylanana kadar hiçbir şey kesinleşmez.
4. **Onay:** Ön Bilgilendirme Formu'nu ve Mesafeli Satış Sözleşmesi'ni okuyup ilgili kutuları işaretleyin, "Siparişi onayla — ödeme yükümlülüğü doğurur" düğmesine basın.
5. **Teyit:** Siparişinizin alındığı ekranda hemen gösterilir; ayrıca sizi telefonla arayarak (veya SMS ile) teyit ederiz.
6. **Sözleşmenin saklanması:** Siparişinize ait Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi, siparişin verildiği andaki haliyle Satıcı tarafından saklanır (10 yıl). Onay ekranından indirebilir veya yazdırabilir, sipariş takip bağlantınızdan istediğiniz zaman görüntüleyebilirsiniz; basılı özeti teslimatta verilir.
7. **Takip ve iptal:** "Siparişlerim" ekranından siparişinizin durumunu canlı izleyebilir, "Yeni" durumundaki siparişi iptal edebilirsiniz.
8. **Uyuşmazlık çözümü:** Tüketici Hakem Heyeti, arabuluculuk ve Tüketici Mahkemeleri (ayrıntı: Ön Bilgilendirme Formu m.9). Satıcı herhangi bir alternatif uyuşmazlık çözüm kuruluşuna üye değildir.
9. **Gizlilik:** KVKK Aydınlatma Metni ve Çerez ve Yerel Depolama Bilgilendirmesi.

---

### 5.11 İletişim / Satıcı Bilgileri bloğu (ek — 6563 m.3, E-ticaret Yön. m.5/1)

> *(Ana sayfadan doğrudan "İletişim" başlığıyla erişilmeli; footer'da da özet.)*

**İLETİŞİM VE SATICI BİLGİLERİ**
- {{unvan}} — {{isletmeAdi}}
- *(Şirketse)* MERSİS No: {{mersis}} · *(Esnafsa)* Vergi Kimlik No: {{vergiNo}}
- Vergi Dairesi: {{vergiDairesi}}
- Merkez adresi: {{adres}}
- Telefon: {{telefon}} · E-posta: {{eposta}} · KEP: {{kep}}
- Kayıtlı olduğu meslek odası: {{meslekOdasi}}
- İnternet sitesi: {{siteAdresi}}

---

## 6. İşletme sahibinin site dışında yapması gerekenler — kontrol listesi

**Canlıya çıkmadan önce (zorunlu):**
- [ ] **İşletme türünü netleştirin** (şahıs esnafı / şahıs tacir / şirket). Sitede hangi kimlik bilgilerinin (VKN mi MERSİS mi, KEP) gösterileceği buna bağlı. Panelde unvan, VKN/MERSİS, vergi dairesi, adres, telefon, **e-posta** (cayma bildirimi için gerekli) ve meslek odası doldurulsun.
- [ ] **ETBİS kaydı:** e-Devlet → Ticaret Bakanlığı → ETBİS; ücretsiz; **satışa başlamadan önce**. Alan adı, e-posta, faaliyet türü girilir. Değişiklikleri 30 gün içinde güncelleyin.
- [ ] **Metinleri bir avukata onaylatın** (bu belgedeki taslaklar + panelde doldurulmuş hali).
- [ ] **Barındırma yeri:** sunucuyu Türkiye'de tutun. Yurt dışındaysa barındırma firmasıyla KVKK standart sözleşmesini imzalayıp **5 iş günü içinde** Kurula bildirin.
- [ ] **Telegram bildirimini kişisel verisiz hale getirin** (yazılım güncellemesi; §4.3.4). Kuryeye adresi WhatsApp'tan değil panelden ya da fişten verin.
- [ ] **Veri işleme sözleşmeleri:** barındırma firması, yazılımı yapan/bakımını yapan kişi, dışarıdan kurye firması (varsa), mali müşavir.
- [ ] **Sipariş teyidi prosedürü:** her siparişte teyit araması (ve panelde işaretleme) ya da SMS sağlayıcısı.
- [ ] **Fatura/fiş düzeni:** kapıda satışta ÖKC fişi / e-Arşiv; kuryeye mobil POS. **Mali müşavirle** e-Arşiv eşiklerini kontrol edin.
- [ ] **Basılı sipariş özeti:** fişle birlikte sipariş özeti + cayma özeti + sözleşmeye QR/bağlantı.
- [ ] **Ürün verisi:** her ürüne cayma durumu; ön ambalajlı gıdalara etiket bilgisi (bileşen, alerjen, net miktar, üretici); tartılı ürünlere birim fiyat; indirimlerde son 10 günün en düşük fiyatı.
- [ ] **Alkol ve tütün:** sitede, afişte, ürün görsellerinde ve sosyal medyada alkol ürünü/marka/şişe görseli kullanmayın; "tekel" vurgusu yapmayın. 7584 sayılı Kanun gereği dükkândaki alkol marka/logo içeren tabela ve malzemeleri yaklaşık Haziran 2027'ye kadar kaldırın (geçiş süresini avukat/TADAB ile teyit edin).

**Gerekirse:**
- [ ] **VERBİS:** çalışan sayısı 50'den az (ve bilanço esasındaysanız yıllık bilanço 100 milyon TL'den az) ise muaf olmanız beklenir; sınır aşılırsa kayıt olun. Muafiyet KVKK'nın diğer yükümlülüklerini kaldırmaz.
- [ ] **İYS:** kampanya SMS'i, arama ya da WhatsApp mesajı göndermeden **önce** iys.org.tr'ye kaydolun; İYS entegre bir SMS sağlayıcısı seçin; sitede izin kutusunu ancak bundan sonra açın; izinleri 3 iş günü içinde, retleri 3 iş günü içinde İYS'ye işleyin.
- [ ] **E-posta/KEP:** cayma bildirimleri ve KVKK başvuruları için düzenli kontrol edilen bir e-posta adresi. Şirketseniz KEP zorunlu.

**Süregelen işler:**
- [ ] KVKK başvurularını 30 gün içinde yanıtlayın (panelde dışa aktar/anonimleştir).
- [ ] Veri ihlali şüphesinde 72 saat içinde Kurula bildirim; olayı belgeleyin.
- [ ] Cayma/iade taleplerini 14 gün içinde sonuçlandırın.
- [ ] Panel kullanıcılarını en az yetkiyle tanımlayın; ayrılan personelin hesabını kapatın.
- [ ] Metinleri **yılda en az bir kez** ve mevzuat değiştiğinde gözden geçirin (bu belgede birçok hüküm son iki yılda değişti).

---

## 7. Belirsiz kalanlar ve bir avukata sorulacaklar

1. **MSY m.2/2-ğ istisnası:** Aynı gün kuryeyle eve market teslimatı "satıcının düzenli teslimatları çerçevesinde" sayılır mı? (Bu belgede temkinli olarak "sayılmaz" kabul edildi.)
2. **"Son kullanma tarihi geçebilecek mal" (m.15/1-c) kapsamı:** Uzun raf ömürlü kapalı paketli gıdalarda cayma hakkı tanınmalı mı? Ürün bazında sınıflandırma (`caymaDurumu`) uygun mu?
3. **Kalıcı veri saklayıcısı:** İndir/yazdır + değişmez çevrimiçi kopya + basılı nüsha birlikte yeterli mi? Basılı nüsha teslimde verildiği için ön bilgilendirme "sözleşmeden önce" kalıcı ortamda verilmiş sayılır mı? (İndirme seçeneği sipariş öncesinde de sunulmalı mı?)
4. **E-ticaret Yön. m.9/1 teyidi:** Personelin telefon araması pratikte yeterli mi? Ulaşılamayan müşteride yükümlülük yerine getirilmiş sayılır mı? (Yönetmeliğin resmî metni birincil kaynaktan okunamadı.)
5. **Saklama süresi:** 6563 m.11'deki 10 yıl müşteri ad/telefon/adresini de kapsıyor mu? PLAN-2'deki 2 yıllık anonimleştirme ne olmalı?
6. **Telegram:** Ürün listesi + tutar + sipariş no içeren, ad/telefon/adres içermeyen bildirim kişisel veri aktarımı sayılır mı? Bunun hiç kişisel veri içermeyen sürümü yeterli mi?
7. **Pazarlama izni:** 6563 onayı ile KVKK açık rızası tek kutuda (§5.5 beyanı) alınabilir mi, yoksa Kurul 2026/347 ışığında iki ayrı kutu mu gerekir? Tek işaretsiz kutu mu, "veriyorum/vermiyorum" çifti mi?
8. **KVKK C kutusu:** Aydınlatma için zorunlu "okudum ve anladım" kutusu mu, yoksa yalnız bağlantı ve bilgilendirme cümlesi mi tercih edilmeli? (Bu belge kutuyu önerdi.)
9. **Esnafın KEP ve MERSİS durumu:** Şahıs esnafında "KEP: yoktur" yazmak ve MERSİS yerine VKN göstermek yeterli mi?
10. **"Tekel" ibaresi:** 7584 sonrası işletme adında, Instagram kullanıcı adında, tabelada ve eski URL yönlendirmelerinde "tekel" kelimesi alkol tanıtımı riski taşır mı? Geçiş süresinin bitiş tarihi (20.06.2027 mi 20.07.2027 mi)?
11. **Bariz fiyat hatası hükmü** (Sözleşme m.3.3), Fiyat Etiketi Yön. m.10/1 ile birlikte yorumlandığında haksız şart sayılır mı?
12. **Tekrarlanan teslim almama nedeniyle kapıda ödemeli siparişi reddetme** (Kullanım Koşulları m.4) 6502 m.6 bakımından haklı sebep mi? Üç kez eşiği makul mü?
13. **Tartı toleransı (%10)** ve yeniden gönderimde teslimat ücreti alınması uygun mu?
14. **Gıda etiket bilgisi (TGK Etiketleme Yön. m.17):** Market gibi bir perakendecinin sitesinde tüm ön ambalajlı ürünler için bileşen ve alerjen bilgisi göstermesi zorunlu mu? "Ürün sayfasında arka etiket fotoğrafı" yeterli mi? (Bir gıda mühendisine de danışılabilir.)
15. **ETBİS karekodu:** Sitede gösterme zorunluluğu 2025'te kalktı mı?
16. **Fatura:** Kapıda satışta ÖKC fişi mi e-Arşiv mi, mobil ÖKC gerekiyor mu? (Mali müşavir.)

---

## 8. Mevcut `lib/defaults.js` metinleriyle farklar (uygulayıcılar için)

- **İade metni:** "teslimat anında ya da en geç 24 saat içinde bildirmeniz hâlinde" → kaldırılmalı (haksız şart riski; §4.1.4). Yerine §5.7.
- **İade metni:** "Ambalajı açılmamış diğer ürünleri 14 gün içinde **mağazamıza getirerek** iade edebilirsiniz" → iade masrafı tüketiciye yüklenemediği ve taşıyıcı belirtilmediği için (MSY m.12/5, 2026) "kuryemiz ücretsiz alır ya da dükkâna getirebilirsiniz" olmalı. **Teslimat ücretinin de iade edileceği** eklenmeli.
- **Mesafeli satış metni:** m.15 atfı doğru, ancak ürün bazında cayma durumu, cayma bildirim adresi (e-posta), iade taşıyıcısı, hakem heyeti/arabulucu bilgisi (MSY m.5/1-k, 2026) ve ödeme yükümlülüğü eksik → §5.1–5.2.
- **KVKK metni:** "Başvurularınızı ... yazılı olarak veya e-posta" → başvuru yolları ve 30 gün eklenmeli; IP/onay kaydı, engelli numara listesi, yurt dışı aktarım durumu, saklama süreleri ve amaç-hukuki sebep eşleşmesi eklenmeli → §5.3.
- **Çerez metni:** gerçek localStorage anahtarlarıyla tablo → §5.6.
- **Yer tutucular:** mevcut `{{magaza}}` → `{{isletmeAdi}}`, `{{websitesi}}` → `{{siteAdresi}}` (bu belgedeki adlara uyum).
- **Yeni metinler:** Ön Bilgilendirme Formu, Kullanım Koşulları, Teslimat Koşulları, İşlem Rehberi, İletişim/Satıcı Bilgileri; pazarlama yapılacaksa Açık Rıza ve Ticari İleti İzni.
- **Kod (bilgi):** `lib/notify.js` Telegram'a ad, telefon, adres ve not gönderiyor → kişisel verisiz hale getirilmeli.

---

## 9. Kaynaklar

**Birincil (metni okunanlar):**
- Mesafeli Sözleşmeler Yönetmeliği — konsolide metin (değişiklikler 2019, 2022, 2023, 2024, 2025 ve Danıştay 6/5/2026 iptali işlenmiş): https://www.mevzuat.gov.tr/MevzuatMetin/yonetmelik/7.5.20237.pdf · İlk yayım: https://resmigazete.gov.tr/eskiler/2014/11/20141127-6.htm
- 6502 sayılı Tüketicinin Korunması Hakkında Kanun: https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=1&MevzuatNo=6502&MevzuatTertip=5
- 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun: https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=1&MevzuatNo=6563&MevzuatTertip=5 · https://www.resmigazete.gov.tr/eskiler/2014/11/20141105-1.htm
- Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik — konsolide: https://www.mevzuat.gov.tr/File/GeneratePdf?mevzuatNo=20914&mevzuatTur=KurumVeKurulusYonetmeligi&mevzuatTertip=5 · https://resmigazete.gov.tr/eskiler/2015/07/20150715-4.htm · 2020 değişikliği: https://www.resmigazete.gov.tr/eskiler/2020/01/20200104-2.htm
- 6698 sayılı KVKK (7499 değişiklikleriyle): https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=1&MevzuatNo=6698&MevzuatTertip=5
- Kişisel Verilerin Yurt Dışına Aktarılmasına İlişkin Usul ve Esaslar Hakkında Yönetmelik (RG 10/7/2024-32598): https://www.resmigazete.gov.tr/eskiler/2024/07/20240710-2.htm
- Fiyat Etiketi Yönetmeliği — konsolide (11/10/2025 ve 30/1/2026 değişiklikleri dahil): https://www.mevzuat.gov.tr/MevzuatMetin/yonetmelik/7.5.19819.pdf
- 4250 sayılı İspirto ve İspirtolu İçkiler İnhisarı Kanunu (7584 değişikliğiyle): https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=1&MevzuatNo=4250&MevzuatTertip=3
- Ticaret Bakanlığı e-ticaret mevzuat listesi: https://ticaret.gov.tr/ic-ticaret/elektronik-ticaret/mevzuat
- Ticaret Bakanlığı, "Fiyat etiketinde yeni dönem başlıyor" (13/10/2025): https://ticaret.gov.tr/haberler/fiyat-etiketinde-yeni-donem-basliyor
- KVKK Kurul kararı 2019/10 (ihlal bildirimi): https://www.kvkk.gov.tr/Icerik/6647/The-Board-Decision-No-2019-10-of-24-01-2019-about-Procedures-and-Principles-of-Personal-Data-Breach-Notification-
- KVKK Kurul kararı 2018/90 (aydınlatma ve açık rıza ayrı): https://kvkk.gov.tr/Icerik/5420/2018-90
- KVKK VERBİS istisna kamuoyu duyurusu: https://www.kvkk.gov.tr/Icerik/8388/KAMUOYU-DUYURUSU
- KVKK Çerez Uygulamaları Hakkında Rehber: https://kvkk.gov.tr/Icerik/7353/Cerez-Uygulamalari-Hakkinda-Rehber (sayfa yalnız kısmen okunabildi)
- AB Tüketici Hakları Direktifi 2011/83/AB m.3(3)(j) metni: https://www.legislation.gov.uk/eudr/2011/83/chapter/I/data.htm?view=plain

**İkincil (hukuk bürosu, mesleki yayın, haber) — doğrulama için birincil metne bakılmalı:**
- E-ticaret Yönetmeliği (RG 29/12/2022-32058) konsolide, lexpera: https://www.lexpera.com.tr/mevzuat/yonetmelikler/elektronik-ticaret-araci-hizmet-saglayici-ve-elektronik-ticaret-hizmet-saglayicilar-hakkinda-1
- KVKK ilke kararı 2026/347 (RG 24/3/2026-33203): https://www.lexpera.com.tr/mevzuat/kurul-kararlari/kisisel-verileri-koruma-kurulunun-18-02-2026-tarihli-ve-2026-347-sayili-karari-2026-347-1 · https://www.alomaliye.com/2026/03/24/kvkkdan-yeni-ilke-karari-acik-riza-metni-ile-aydinlatma-metni-artik-ayri-duzenlenmeli/
- ETBİS kayıt yükümlülüğü (Tebliğ m.5, m.7): https://halilbakirci.av.tr/etbis-kayit-zorunlulugu-kimler-kaydolmak-zorunda-2026/
- VERBİS eşikleri ve 2025 kararları: https://www.erdem-erdem.av.tr/bilgi-bankasi/verbis-kayit-yukumlulugune-iliskin-istisna-kriteri-degistirildi · https://www.cottgroup.com/en/blog/item/verbise-kayit-yukumlulugu-istisnasina-iliskin-uygulama-esaslari-netlestirildi · https://www.aeo.org.tr/verbis-degisikliklerine-iliskin-12012026-tarihli-kamuoyu-duyurusu
- KVKK çerez rehberi güncellemesi: https://www.erdem-erdem.av.tr/bilgi-bankasi/kisisel-verileri-koruma-kurumu-cerez-uygulamalari-hakkinda-rehberi-guncelledi
- Mesafeli Sözleşmeler Yönetmeliği 2022 değişikliği: https://www.erdem-erdem.av.tr/bilgi-bankasi/mesafeli-sozlesmeler-yonetmeliginde-degisiklik-yapilmasina-dair-yonetmelik-yayimlandi
- TGK Gıda Etiketleme ve Tüketicileri Bilgilendirme Yönetmeliği: https://www.mevzuat.gov.tr/File/GeneratePdf?mevzuatNo=23282&mevzuatTur=KurumVeKurulusYonetmeligi&mevzuatTertip=5 (PDF metni bu çalışmada açılamadı; m.17 içeriği ikincil kaynaklardan) · Kılavuz özeti: https://www.karmalt.com/gida-etiketleme-ve-tuketicileri-bilgilendirme-yonetmeligi-hakkinda-kilavuz/
- 7584 sayılı Kanun (alkol reklamı/logosu): https://www.alomaliye.com/2026/06/20/7584-sayili-kanun/ · https://www.bizimsivas.com.tr/yeni-yasal-duzenleme-kapsaminda-alkol-reklam-yasagi
- Alkol/tütün internet satış yasağı (2011 yönetmelik değişikliği): https://www.alomaliye.com/2011/06/17/tutun-mamulleri-ve-alkollu-ickilerin-satisina-ve-sunumuna-iliskin-usul-ve-esaslar-hakkinda-yonetmelikte-degisiklik-yapilmasina-dair-yonetmelik-2/
- e-Arşiv / e-Fatura eşikleri 2026: https://www.kolaybi.com/blog/e-fatura-ve-e-arsiv-fatura-kullanim-zorunlulugu
- Yurt dışı aktarımda "arızi" kavramı: https://www.erdem-erdem.av.tr/bilgi-bankasi/kisisel-verilerin-yurt-disina-aktarilmasina-iliskin-usul-ve-esaslar-hakkinda-yonetmelik-taslagina-dair-kamuoyu-duyurusu
- Enerji İçecekleri Tebliği (2017/4): https://www.lexpera.com.tr/mevzuat/tebligler/turk-gida-kodeksi-enerji-icecekleri-tebligi-2017-4-1

**Ulaşılamayan / okunamayan kaynaklar:**
- iys.org.tr SSS (sayfa JavaScript ile yükleniyor; içerik alınamadı).
- AB Komisyonu'nun Tüketici Hakları Direktifi yorum kılavuzu 2021/C 525/01 (EUR-Lex boş içerik döndürdü).
- ETBİS ve Bildirim Yükümlülükleri Tebliği'nin güncel birincil metni; ETBİS karekodunun kaldırıldığına dair resmî düzenleme.
- E-ticaret Yönetmeliği (RG 29/12/2022-32058) birincil PDF'i (lexpera konsolide metni kullanıldı).
- KVKK ilke kararı 2026/347'nin tam metni (ödeme duvarı).
- Aydınlatma Tebliği ve Veri Sorumlusuna Başvuru Tebliği'nin tam metinleri; 5651 sayılı Kanun'un güncel metni; TMK ve TBK maddeleri (bilinen maddeler olarak atıf yapıldı, bu çalışmada ayrıca açılmadı).
- GİB'in e-Arşiv birincil duyuruları.
