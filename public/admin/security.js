// Güvenlik ve yasal durum (GET /api/admin/security): her ekranda tek satırlık özet + Ayarlar'da ayrıntı.
// Varsayılan şifre uyarısı da buradan gösterilir (eski "defaultPwWarn" bandının yerine).
import { state, $, esc, icon, api, isAdmin, readLS, writeLS } from "./core.js";
import { onLive } from "./live.js";

/** Uyarı kodu → kısa başlık, ne yapılacağı, ilgili ekran */
export const WARN_INFO = {
  HTTPS_YOK: { title: "Site şifresiz (HTTP) bağlantıyla açılıyor", todo: "Sunucunun önüne HTTPS sağlayan bir vekil (ör. Caddy) kurun; PUBLIC_URL'yi https:// ile ve TRUST_PROXY=1 verin (docs/DEPLOY.md). Bu, sunucuyu kuran kişinin işidir." },
  VARSAYILAN_SIFRE: { title: "Varsayılan şifre kullanımda", todo: "Hesabım → Şifre değiştir. Başka bir kullanıcıdaysa Ayarlar → Kullanıcılar'dan yeni şifre verin.", link: "/panel/hesap", linkLabel: "Şifreyi değiştir" },
  VEKIL_AYARI: { title: "HTTPS yönlendirmesi çalışmıyor", todo: "Ortam değişkenlerine TRUST_PROXY=1 ekleyip sunucuyu yeniden başlatın (docs/DEPLOY.md)." },
  PUBLIC_URL_YOK: { title: "Site adresi (PUBLIC_URL) verilmemiş", todo: "Ortam değişkeni olarak sitenin gerçek adresini verin: PUBLIC_URL=https://alanadiniz.com (docs/DEPLOY.md)." },
  SIFRESIZ_DEPO: { title: "Müşteri verisi sunucuda şifresiz saklanıyor", todo: "Uzun, rastgele bir DATA_KEY oluşturup ortam değişkeni olarak verin ve sunucuyu yeniden başlatın; veriler açılışta şifreliye çevrilir. Anahtarı ayrıca güvenli bir yerde saklayın: kaybolursa veriler açılamaz (docs/DEPLOY.md)." },
  ISLETME_BILGISI_EKSIK: { title: "İşletme bilgileri eksik", todo: "Canlıya çıkmadan önce unvan, vergi bilgileri, adres, telefon ve e-postayı doldurun. Eksik alanlar yasal metinlerde “[…]” görünür.", link: "/panel/ayarlar/isletme", linkLabel: "İşletme bilgilerine git" },
  ISLETME_TURU_YOK: { title: "İşletme türü seçilmemiş", todo: "Şahıs işletmesi mi şirket mi seçin. Şahısta ad soyad ve vergi numarası yeterli; şirkette MERSİS ve KEP de zorunlu.", link: "/panel/ayarlar/isletme", linkLabel: "İşletme türünü seç" },
  ETBIS_YOK: { title: "ETBİS kaydı girilmemiş", todo: "e-Devlet → Ticaret Bakanlığı → ETBİS üzerinden ücretsiz kaydolun (satışa başlamadan önce) ve kayıt numarasını İşletme bilgileri'ne girin.", link: "/panel/ayarlar/isletme", linkLabel: "ETBİS numarasını gir" },
  ONAY_YOK: { title: "Zorunlu onay kutusu yok", todo: "Ön bilgilendirme, mesafeli satış sözleşmesi ve KVKK aydınlatma kutuları zorunlu olmalı.", link: "/panel/ayarlar/onaylar", linkLabel: "Onay kutularına git" },
  YEREL_DINLEME: { title: "Sunucu yalnızca bu bilgisayardan açılıyor", todo: "Varsayılan şifre (admin123) kullanımdayken sunucu ağa açılmaz. Hesabım → Şifre değiştir ile şifreyi değiştirin, sonra sunucuyu yeniden başlatın (Marketi Baslat penceresini kapatıp tekrar açın).", link: "/panel/hesap", linkLabel: "Şifreyi değiştir" },
  TELEFON_SORGU_ACIK: { title: "Telefonla sipariş sorgusu açık", todo: "Gerekmiyorsa kapatın: sipariş numarası ve telefonu bilen herkes siparişin durumunu (salt okunur; ad, adres ve ürünler gösterilmez) görebilir.", link: "/panel/ayarlar/guvenlik", linkLabel: "Gizlilik ayarları" },
  SAKLAMA_KAPALI: { title: "Otomatik anonimleştirme kapalı", todo: "Saklama süresini girin (önerilen 3650 gün = 10 yıl).", link: "/panel/ayarlar/guvenlik", linkLabel: "Gizlilik ayarları" },
  SAKLAMA_KISA: { title: "Saklama süresi 10 yıldan kısa", todo: "6563 sayılı Kanun e-ticaret kayıtlarının 10 yıl saklanmasını istiyor; süreyi avukatınızla birlikte belirleyin.", link: "/panel/ayarlar/guvenlik", linkLabel: "Gizlilik ayarları" },
  TELEGRAM_ACIK: { title: "Telegram bildirimi açık", todo: "Bilgi: bildirimlere müşteri adı, telefon, adres ve not yazılmaz. Kuryeye adresi panelden ya da fişten verin.", link: "/panel/ayarlar/bildirim", linkLabel: "Bildirim ayarları" },
  PAZARLAMA_IZNI_ACIK: { title: "Pazarlama izni kutusu açık", todo: "İYS kaydı ve İYS'ye bağlı bir SMS sağlayıcısı olmadan kampanya mesajı göndermeyin; izinleri 3 iş günü içinde İYS'ye işleyin.", link: "/panel/ayarlar/guvenlik", linkLabel: "Gizlilik ayarları" },
};
export const LEVEL_LABEL = { kritik: "Kritik", uyari: "Uyarı", bilgi: "Bilgi" };

let timer = null;

export async function loadSecurity() {
  if (!state.user) return null;
  try {
    state.security = await api("/api/admin/security");
  } catch { return state.security || null; }
  renderSecBar();
  document.dispatchEvent(new CustomEvent("securityupdated"));
  return state.security;
}
export function startSecurity() {
  clearInterval(timer);
  loadSecurity();
  timer = setInterval(() => { if (document.visibilityState === "visible") loadSecurity(); }, 10 * 60 * 1000);
}
export function stopSecurity() {
  clearInterval(timer);
  state.security = null;
  $("#secBar").hidden = true;
  $("#secChip").hidden = true;
}

/** Üst bantta gösterilecek uyarılar: yönetici kritik + uyarı; personel yalnızca kendini ilgilendirenler */
function barWarnings() {
  const sec = state.security;
  let list = sec ? sec.warnings.filter((w) => w.level !== "bilgi") : [];
  if (!isAdmin()) list = list.filter((w) => w.code === "HTTPS_YOK");
  // Varsayılan şifre: personel yalnızca kendi hesabı için görür; yönetici hangi hesap olduğunu da görür
  list = list.filter((w) => w.code !== "VARSAYILAN_SIFRE");
  const weak = sec && sec.defaultPassword && sec.defaultPassword.users ? sec.defaultPassword.users : [];
  if (state.defaultPassword || (isAdmin() && weak.length)) {
    const self = state.defaultPassword;
    const others = weak.filter((u) => !state.user || u !== state.user.username);
    list.unshift({
      code: "VARSAYILAN_SIFRE", level: "kritik",
      text: self ? "Bu hesabın şifresi herkesçe bilinen varsayılan şifre" : `Varsayılan şifre kullanan hesap: ${others.join(", ")}`,
      link: self ? "/panel/hesap" : "/panel/ayarlar/kullanicilar", linkLabel: self ? "Şifreyi değiştir" : "Kullanıcılar",
    });
  }
  return list;
}
const dismissKey = (list) => list.map((w) => w.code).sort().join(",");

export function renderSecBar() {
  const bar = $("#secBar");
  const chip = $("#secChip");
  if (!bar || !state.user) return;
  const list = barWarnings();
  if (!list.length) { bar.hidden = true; chip.hidden = true; return; }
  const kritik = list.some((w) => w.level === "kritik");
  const dismissed = !kritik && readLS("panelSecHidden") === dismissKey(list);
  bar.className = `secbar ${kritik ? "kritik" : "uyari"}`;
  const titles = list.map((w) => esc(w.text || (WARN_INFO[w.code] && WARN_INFO[w.code].title) || w.message));
  const own = list.find((w) => w.code === "VARSAYILAN_SIFRE");
  bar.innerHTML = `${icon(kritik ? "shield-alert" : "alert")}
    <div class="sb-text"><b>${kritik ? "Güvenlik uyarısı" : "Canlıya çıkmadan önce"}:</b> ${titles.join(" · ")}${!isAdmin() && list.some((w) => w.code === "HTTPS_YOK") ? ". Yöneticinize bildirin." : ""}</div>
    <div class="sb-acts">
      ${own ? `<a class="btn" href="${own.link}" data-link>${esc(own.linkLabel)}</a>` : ""}
      ${isAdmin() ? `<a class="btn" href="/panel/ayarlar/guvenlik" data-link><span class="hide-phone">Ayrıntı ve ne yapılacak</span><span class="only-phone">Ayrıntı</span></a>` : ""}
      ${kritik ? "" : `<button type="button" class="btn btn-ghost" data-sechide>Gizle</button>`}
    </div>`;
  bar.hidden = dismissed;
  chip.hidden = !dismissed;
  chip.className = `sec-chip ${kritik ? "kritik" : ""}`;
  chip.querySelector(".n").textContent = String(list.length);
  chip.title = `${list.length} güvenlik/yasal uyarı — göstermek için dokunun`;
  chip.setAttribute("aria-label", chip.title);
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-sechide]")) {
    writeLS("panelSecHidden", dismissKey(barWarnings()));
    renderSecBar();
  } else if (e.target.closest("#secChip")) {
    writeLS("panelSecHidden", null);
    renderSecBar();
  }
});
document.addEventListener("passwordchanged", () => { state.defaultPassword = false; loadSecurity(); });
// Güvenlik ekranı açıkken canlı bağlantı kurulunca bağlantı sayıları tazelensin
onLive("connected", () => { if (location.pathname === "/panel/ayarlar/guvenlik") loadSecurity(); });
document.addEventListener("securityrefresh", () => loadSecurity());
