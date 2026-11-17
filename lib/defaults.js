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
    // İşletme türü: "sahis" (şahıs esnafı/tacir: ad soyad + VKN; MERSİS/KEP zorunlu değil) | "sirket" (MERSİS ve KEP zorunlu) | "" (seçilmedi)
    businessType: "",
    companyTitle: "",
    taxOffice: "",
    taxNo: "",
    mersis: "",
    kep: "",
    chamber: "", // kayıtlı olunan meslek odası ({{meslekOdasi}})
    etbisNo: "", // ETBİS kayıt numarası (satışa başlamadan önce zorunlu; boşsa panelde uyarı)
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
  // Gizlilik (YASAL.md §3, §4.3.6):
  //  retentionDays: tamamlanmış siparişte kişisel veriler bu süre sonunda anonimleşir (varsayılan 10 yıl — 6563 m.11; null = kapalı)
  //  archiveDays:   bu süreyi geçen tamamlanmış siparişlerde ad/telefon/adres/not personele maskeli döner, yalnızca yönetici görür
  //  phoneLookup:   başka cihazdan numara + telefonla sorgu (varsayılan kapalı → 404)
  //  marketingConsent: ticari ileti izni kutusu (D) ve bağlı metinler (İYS kurulmadan açmayın; varsayılan kapalı)
  privacy: { retentionDays: 3650, archiveDays: 730, phoneLookup: false, marketingConsent: false },
};


// Eski ayar modelindeki metin alanları (settings.legal.texts) — belgelerle eşit tutulur
const TEXT_KEYS = ["kvkk", "mesafeliSatis", "iade", "cerez"];

// Yasal metin şablonları: docs/YASAL.md §5.1–5.11 (lib/legal-texts.js). Belgenin "text" alanı boşsa bunlar kullanılır.
const { LEGAL_TEXTS } = require("./legal-texts");
const LEGAL_TEMPLATES = LEGAL_TEXTS;
// Şablonların yazıldığı tarih ({{guncellemeTarihi}}: özel metin girilmemiş belgeler için)
const TEMPLATE_DATE = "2026-11-17";

// Yasal belgeler (settings.legal.docs). marketing: true olanlar yalnızca privacy.marketingConsent açıkken yayımlanır.
const DEFAULT_LEGAL_DOCS = [
  { key: "onBilgilendirme", title: "Ön Bilgilendirme Formu", path: "/on-bilgilendirme", lead: "Siparişinizi onaylamadan önce bilmeniz gerekenler.", text: "", active: true, marketing: false },
  { key: "mesafeliSatis", title: "Mesafeli Satış Sözleşmesi", path: "/mesafeli-satis", lead: "Online siparişlerinize uygulanan satış sözleşmesi.", text: "", active: true, marketing: false },
  { key: "kvkk", title: "KVKK Aydınlatma Metni", path: "/kvkk", lead: "Kişisel verilerinizin nasıl işlendiğine dair bilgilendirme.", text: "", active: true, marketing: false },
  { key: "iade", title: "İptal, İade ve Cayma Koşulları", path: "/iade-kosullari", lead: "Sipariş iptali, cayma hakkı ve iade kuralları.", text: "", active: true, marketing: false },
  { key: "teslimatKosullari", title: "Teslimat Koşulları", path: "/teslimat-kosullari", lead: "Teslimat bölgeleri, süreleri ve teslimatla ilgili kurallar.", text: "", active: true, marketing: false },
  { key: "kullanim", title: "Kullanım Koşulları", path: "/kullanim-kosullari", lead: "Sitenin kullanımına ilişkin koşullar.", text: "", active: true, marketing: false },
  { key: "cerez", title: "Çerez ve Yerel Depolama Bilgilendirmesi", path: "/cerez-politikasi", lead: "Sitede hangi bilgilerin tarayıcınızda saklandığı.", text: "", active: true, marketing: false },
  { key: "islemRehberi", title: "İşlem Rehberi", path: "/islem-rehberi", lead: "Online siparişin adımları ve sözleşmenize nasıl ulaşacağınız.", text: "", active: true, marketing: false },
  { key: "iletisim", title: "İletişim ve Satıcı Bilgileri", path: "/iletisim", lead: "Satıcının tanıtıcı bilgileri ve iletişim kanalları.", text: "", active: true, marketing: false },
  { key: "acikRiza", title: "Açık Rıza Metni (Pazarlama)", path: "/acik-riza", lead: "Pazarlama amaçlı kişisel veri işlenmesine ilişkin açık rıza metni.", text: "", active: true, marketing: true },
  { key: "ticariIleti", title: "Ticari Elektronik İleti İzni", path: "/ticari-ileti-izni", lead: "Kampanya ve duyuru iletileri için izin metni.", text: "", active: true, marketing: true },
];

// Sipariş formundaki onay kutuları (YASAL.md §2.2). label içinde [görünen metin](belge-anahtarı) bağlantı olur.
// Hepsi ayrı, hiçbiri ön işaretli gelmez. D (ticariIleti) yalnızca privacy.marketingConsent açıkken gösterilir/kabul edilir.
// E ("bu cihazda hatırla") hukuki onay değildir; yalnızca istemcide tutulur, burada yoktur.
const DEFAULT_CONSENTS = [
  {
    key: "onBilgilendirme",
    label:
      "[Ön Bilgilendirme Formu](onBilgilendirme)'nu okudum; siparişimle ilgili ön bilgileri (satıcı bilgileri, ürünlerin temel nitelikleri, vergiler dahil toplam fiyat, teslimat, ödeme ve cayma hakkı koşulları) edindiğimi teyit ediyorum.",
    required: true,
    docs: ["onBilgilendirme"],
    order: 1,
    active: true,
    marketing: false,
  },
  {
    key: "mesafeliSozlesme",
    label:
      "[Mesafeli Satış Sözleşmesi](mesafeliSatis)'ni ekleri olan [Teslimat Koşulları](teslimatKosullari), [İptal-İade-Cayma Koşulları](iade) ve [Kullanım Koşulları](kullanim) ile birlikte okudum ve kabul ediyorum.",
    required: true,
    docs: ["mesafeliSatis", "teslimatKosullari", "iade", "kullanim"],
    order: 2,
    active: true,
    marketing: false,
  },
  {
    key: "kvkkAydinlatma",
    label: "Kişisel verilerimin işlenmesine ilişkin [KVKK Aydınlatma Metni](kvkk)'ni okudum ve anladım.",
    required: true,
    docs: ["kvkk"],
    order: 3,
    active: true,
    marketing: false,
  },
  {
    key: "ticariIleti",
    label:
      "[Ticari Elektronik İleti İzni](ticariIleti) kapsamında {{isletmeAdi}} tarafından kampanya, indirim ve duyurularla ilgili ticari elektronik iletilerin telefon numarama SMS ve arama yoluyla gönderilmesine ve bu amaçla [Açık Rıza Metni](acikRiza)'nde açıklandığı şekilde ad ve telefon numaramın işlenmesine izin veriyorum. İzni dilediğim zaman ücretsiz geri alabilirim.",
    required: false,
    docs: ["ticariIleti", "acikRiza"],
    order: 4,
    active: true,
    marketing: true,
  },
];

// Ödeme yükümlülüğü bildirimi ve düğme metni (YASAL.md §2.3, MSY m.8/1)
const CHECKOUT_TEXTS = {
  buttonLabel: "Siparişi onayla — ödeme yükümlülüğü doğurur",
  buttonLabelShort: "Ödeme yükümlülüğüyle sipariş ver",
  paymentNotice:
    "«Siparişi onayla» düğmesine bastığınızda siparişiniz kesinleşir ve teslimatta {{toplam}} tutarını (tartılı ürünlerde kesin tutarı) ödeme yükümlülüğü altına girersiniz. Ödeme {{odemeSekli}} ile yapılır.",
  paymentNoticePickup:
    "«Siparişi onayla» düğmesine bastığınızda siparişiniz kesinleşir ve dükkândan teslim alırken {{toplam}} tutarını (tartılı ürünlerde kesin tutarı) ödeme yükümlülüğü altına girersiniz. Ödeme dükkânda {{odemeSekli}} ile yapılır.",
  weighedNotice: "Tartılı ürünlerde tutar, teslimde tartılan gerçek miktara göre kesinleşir; fark ±%10'u aşarsa sizi ararız.",
  noteHint: "Sağlık bilgisi gibi özel bilgiler yazmayın.",
};

module.exports = { DEFAULT_SETTINGS, LEGAL_TEMPLATES, DEFAULT_LEGAL_DOCS, DEFAULT_CONSENTS, TEXT_KEYS, TEMPLATE_DATE, CHECKOUT_TEXTS };
