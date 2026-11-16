"use strict";
// Varsayılan ayarlar ve yasal metin şablonları.
// seed.json içindeki "settings" bu değerlerin aynısıdır; eski db.json yükseltilirken eksik alanlar buradan dolar.

const DAY = { open: "14:00", close: "02:00", closed: false };

const DEFAULT_SETTINGS = {
  store: {
    name: "Ulusoy Market",
    slogan: "Gece de açık mahalle marketi",
    phone: "0537 311 96 96",
    whatsapp: "905373119696",
    email: "",
    address: "Doğa Apt, Şükrüpaşa Mah. Şehit Cem Dilay Kerman Bulvarı No:5, 22000 Merkez/Edirne",
    city: "Edirne",
    district: "Merkez",
    postalCode: "22000",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Ulusoy+Market+%C5%9E%C3%BCkr%C3%BCpa%C5%9Fa+Edirne",
    instagram: "https://www.instagram.com/ulusoymarkettekel/",
    about:
      "Ulusoy Market, Edirne Şükrüpaşa'da gece geç saate kadar açık olan bir mahalle marketidir. Meyve-sebzeden kahvaltılığa, temel gıdadan temizlik ürünlerine kadar günlük ihtiyaçlarınızı kapınıza getiriyoruz.",
  },
  legal: {
    companyTitle: "",
    taxOffice: "",
    taxNo: "",
    mersis: "",
    kep: "",
    texts: { kvkk: "", mesafeliSatis: "", iade: "", cerez: "" },
  },
  hours: { days: [DAY, DAY, DAY, DAY, DAY, DAY, DAY].map((d) => ({ ...d })) },
  ordering: {
    enabled: true,
    pausedMessage: "Şu an online sipariş alamıyoruz. Telefonla veya WhatsApp'tan ulaşabilirsiniz.",
    allowPreorder: false,
    minOrder: 200,
    deliveryFee: 0,
    freeDeliveryOver: null,
    etaMinutes: 30,
    pickupEnabled: true,
    payments: { nakit: true, kart: true },
    maxActiveOrdersPerPhone: 3,
  },
  zones: [
    { id: 1, name: "Şükrüpaşa", slug: "sukrupasa", fee: null, minOrder: null, etaMinutes: 20, active: true },
    { id: 2, name: "Meydan", slug: "meydan", fee: null, minOrder: null, etaMinutes: null, active: true },
    { id: 3, name: "İstiklal", slug: "istiklal", fee: null, minOrder: null, etaMinutes: null, active: true },
    { id: 4, name: "Cumhuriyet", slug: "cumhuriyet", fee: null, minOrder: null, etaMinutes: null, active: true },
    { id: 5, name: "Sabuni", slug: "sabuni", fee: null, minOrder: null, etaMinutes: null, active: true },
    { id: 6, name: "Medrese Alibey", slug: "medrese-alibey", fee: null, minOrder: null, etaMinutes: null, active: true },
    { id: 7, name: "Diğer (Edirne Merkez)", slug: "edirne-merkez", fee: 40, minOrder: 400, etaMinutes: 45, active: true },
  ],
  announcement: { text: "", active: false },
  banners: [
    {
      id: 1,
      title: "Gece de kapınızdayız",
      text: "Her gün 14:00–02:00 arası eve teslim. Kapıda nakit veya kartla ödeyin.",
      image: null,
      link: "",
      active: true,
    },
    {
      id: 2,
      title: "Haftanın indirimleri",
      text: "Seçili kahvaltılık ve temizlik ürünlerinde indirim.",
      image: null,
      link: "#indirimler",
      active: true,
    },
  ],
  faq: [
    {
      q: "Hangi saatlerde sipariş verebilirim?",
      a: "Online siparişleri her gün 14:00 ile 02:00 arasında alıyoruz. Dükkânımız da gece 02:00'ye kadar açık.",
    },
    {
      q: "Hangi bölgelere teslimat yapıyorsunuz?",
      a: "Şükrüpaşa, Meydan, İstiklal, Cumhuriyet, Sabuni ve Medrese Alibey mahallelerine; ayrıca Edirne merkezdeki diğer adreslere teslimat yapıyoruz.",
    },
    {
      q: "Ödemeyi nasıl yapıyorum?",
      a: "Ödeme kapıda yapılır: nakit ya da kredi/banka kartı. Nakit ödeyecekseniz para üstü için hangi banknotu vereceğinizi sipariş sırasında yazabilirsiniz.",
    },
    {
      q: "Siparişimi iptal edebilir miyim?",
      a: "Siparişiniz hazırlanmaya başlamadan önce \"Siparişlerim\" ekranından iptal edebilirsiniz. Sonrasında bizi arayın.",
    },
    {
      q: "Sipariş ettiğim ürün yoksa ne olur?",
      a: "Sipariş verirken seçtiğiniz tercihe göre sizi ararız, benzer bir ürünle değiştiririz ya da o ürünü siparişten çıkarırız.",
    },
    {
      q: "Alkollü içecek ve sigara satıyor musunuz?",
      a: "Yasal düzenleme gereği alkollü içecek ve tütün ürünleri internetten satılamaz; bu ürünleri yalnızca dükkânımızdan alabilirsiniz.",
    },
  ],
  notify: { telegramBotToken: "", telegramChatId: "", sound: true },
  blockedPhones: [],
};

// Yasal metin şablonları. {{alan}} yer tutucuları ayarlardan doldurulur; boş alanlar "[…]" olarak kalır.
// Biçim: boş satırla ayrılan paragraflar; "## " ile başlayan satır ara başlık, "- " ile başlayan satırlar madde listesi.
const LEGAL_TEMPLATES = {
  kvkk: `Bu aydınlatma metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında veri sorumlusu sıfatıyla {{unvan}} ("{{magaza}}") tarafından hazırlanmıştır.

## Veri sorumlusu
- Unvan: {{unvan}}
- Adres: {{adres}}
- Telefon: {{telefon}}
- E-posta: {{eposta}}
- KEP: {{kep}}

## Hangi kişisel verileri işliyoruz?
Online sipariş verdiğinizde ad-soyad, telefon numarası, teslimat adresi, seçtiğiniz teslimat bölgesi, sipariş içeriği, sipariş notunuz ve ödeme tercihiniz (kapıda nakit/kart) işlenir. Güvenlik amacıyla sipariş sırasında IP adresiniz geçici olarak kullanılır. Kart bilgileriniz sitemizde alınmaz ve saklanmaz.

## Hangi amaçlarla işliyoruz?
- Siparişinizi almak, hazırlamak ve adresinize teslim etmek,
- Sipariş durumu hakkında sizinle iletişime geçmek (arama veya WhatsApp),
- Yasal yükümlülüklerimizi yerine getirmek (fatura/fiş, muhasebe kayıtları),
- Kötüye kullanımı ve sahte siparişleri önlemek.

## Hukuki sebepler
Verileriniz KVKK m.5/2-c (sözleşmenin kurulması ve ifası), m.5/2-ç (hukuki yükümlülük) ve m.5/2-f (meşru menfaat) hukuki sebeplerine dayanılarak işlenir.

## Kimlere aktarılır?
Kişisel verileriniz yalnızca siparişinizi teslim eden market çalışanlarıyla ve kanunen yetkili kamu kurumlarıyla, talep hâlinde paylaşılır. Verileriniz yurt dışına aktarılmaz ve pazarlama amacıyla üçüncü kişilere verilmez.

## Saklama süresi
Sipariş kayıtları ilgili mevzuatta öngörülen süreler boyunca (vergi mevzuatı gereği en fazla 10 yıl) saklanır, süre sonunda silinir veya anonim hâle getirilir.

## Haklarınız
KVKK m.11 uyarınca verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz. Başvurularınızı {{adres}} adresine yazılı olarak veya {{eposta}} adresine iletebilirsiniz.`,

  mesafeliSatis: `## 1. Taraflar
Satıcı: {{unvan}}
Adres: {{adres}}
Telefon: {{telefon}}
E-posta: {{eposta}}
Vergi dairesi / no: {{vergiDairesi}} / {{vergiNo}}
MERSİS no: {{mersis}}

Alıcı: {{websitesi}} üzerinden sipariş veren ve sipariş formunda adı, telefonu ve adresi yer alan kişi.

## 2. Konu
Bu sözleşme, alıcının {{websitesi}} adresinden elektronik ortamda sipariş verdiği ürünlerin satışı ve teslimi ile ilgili olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca tarafların hak ve yükümlülüklerini düzenler.

## 3. Ürünler ve fiyat
Siparişe konu ürünlerin adı, adedi, birim fiyatı, teslimat ücreti ve toplam tutarı sipariş özetinde ve sipariş onay ekranında gösterilir. Fiyatlara KDV dahildir. Tartılı ürünlerde (meyve, sebze vb.) teslim edilen miktar küçük farklılıklar gösterebilir.

## 4. Ödeme
Ödeme teslimat sırasında kapıda nakit veya kredi/banka kartıyla yapılır. Sitede online ödeme alınmaz.

## 5. Teslimat
Ürünler, sipariş formunda belirtilen adrese, sipariş onayında bildirilen tahmini süre içinde teslim edilir. Gel-al siparişlerinde ürünler mağazadan teslim alınır. Siparişteki bir ürün stokta yoksa, alıcının sipariş sırasında seçtiği tercihe göre alıcı aranır, benzer ürünle değiştirilir veya ürün siparişten çıkarılır ve tutar buna göre düzeltilir.

## 6. Cayma hakkı
Mesafeli Sözleşmeler Yönetmeliği m.15 uyarınca çabuk bozulabilen veya son kullanma tarihi geçebilecek ürünlerde, ambalajı açılmış hijyen ve kişisel bakım ürünlerinde cayma hakkı kullanılamaz. Diğer ürünlerde alıcı, teslimden itibaren 14 gün içinde cayma hakkını kullanabilir; ayrıntılar İade Koşulları sayfasındadır.

## 7. Sipariş iptali
Alıcı, siparişi hazırlanmaya başlamadan önce "Siparişlerim" ekranından iptal edebilir. Satıcı, stok yetersizliği, adrese ulaşılamaması veya teslimat bölgesi dışında kalınması gibi durumlarda siparişi iptal edebilir ve alıcıyı bilgilendirir.

## 8. Uyuşmazlıklar
Uyuşmazlıklarda Ticaret Bakanlığınca ilan edilen parasal sınırlar dahilinde alıcının yerleşim yerindeki Tüketici Hakem Heyetleri, bu sınırları aşan durumlarda Tüketici Mahkemeleri yetkilidir.

## 9. Yürürlük
Alıcı, siparişi onaylamadan önce bu sözleşmeyi okuduğunu ve kabul ettiğini beyan eder. Sözleşme, siparişin onaylanmasıyla yürürlüğe girer.`,

  iade: `{{magaza}} olarak müşteri memnuniyetini önemsiyoruz. Teslim aldığınız üründe bir sorun varsa bizi {{telefon}} numarasından arayın.

## Hasarlı, eksik veya yanlış ürün
Teslimat sırasında ürünleri kontrol etmenizi öneririz. Hasarlı, bozuk, son kullanma tarihi geçmiş, eksik veya yanlış gönderilen ürünleri teslimat anında ya da en geç 24 saat içinde bildirmeniz hâlinde ürün değiştirilir veya bedeli iade edilir.

## Cayma hakkı kullanılamayan ürünler
- Meyve, sebze, et, süt ürünleri, ekmek gibi çabuk bozulabilen gıdalar,
- Ambalajı açılmış kişisel bakım, kozmetik ve hijyen ürünleri,
- Ambalajı açılmış gıda ürünleri.

## Diğer ürünler
Ambalajı açılmamış ve yeniden satılabilir durumdaki diğer ürünleri teslimden itibaren 14 gün içinde mağazamıza getirerek iade edebilirsiniz.

## Ödeme iadesi
Kapıda nakit ödenen tutarlar nakit olarak, kartla ödenen tutarlar ise ödeme yapılan karta iade edilir. Kart iadelerinin hesabınıza yansıması bankanıza bağlı olarak birkaç gün sürebilir.`,

  cerez: `{{websitesi}} sitesinde reklam veya takip amaçlı çerez kullanılmaz ve üçüncü taraf ölçüm araçları bulunmaz.

## Tarayıcınızda sakladığımız bilgiler
Siteyi kullanabilmeniz için bazı bilgiler yalnızca kendi cihazınızda, tarayıcının yerel depolama alanında tutulur:
- Sepetinizdeki ürünler,
- Verdiğiniz siparişlerin numaraları (takip için),
- İsterseniz bir sonraki siparişte kolaylık olsun diye adınız, telefonunuz ve adresleriniz,
- Tema (açık/koyu) tercihiniz ve favori ürünleriniz.

Bu bilgiler sunucularımıza gönderilmez; yalnızca sipariş verdiğinizde sipariş için gerekenler iletilir. Tarayıcı ayarlarından site verilerini silerek bu bilgileri istediğiniz zaman temizleyebilirsiniz.

## Yönetim paneli
Market çalışanlarının kullandığı yönetim panelinde oturum bilgisi tarayıcıda saklanır; bu bilgi yalnızca giriş yapmış çalışanlar için kullanılır.

## İletişim
Sorularınız için {{telefon}} numarasından ya da {{eposta}} adresinden bize ulaşabilirsiniz.`,
};

module.exports = { DEFAULT_SETTINGS, LEGAL_TEMPLATES };
