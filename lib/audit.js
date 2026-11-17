"use strict";
// Denetim kaydı: panelde kim, ne zaman, hangi işlemi yaptı. Kişisel veri (müşteri adı, telefonu, adresi, IP) yazılmaz.
// DATA_DIR/audit.json (DATA_KEY varsa şifreli). Geri yüklemeden etkilenmez (db.json'dan ayrı).
//
// İki bölme (ikisi de sınırlı, dosya boyutu sınırlı kalır):
//  - genel:    her değiştirici panel işlemi, giriş/çıkış; son MAX kayıt (personelin ya da kimliksiz başarısız girişlerin
//              taşırabildiği bölme). Ardışık aynı kayıtlar ve başarısız girişler (kişi + ağ başına, saatlik) birleştirilir.
//  - güvenlik: yedek indirme / geri yükleme, kullanıcı-rol-şifre değişikliği, veri silme ve dışa aktarma, ayar değişikliği.
//              Bu kayıtları yalnızca yönetici işlemleri üretir (personelin tek güvenlik kaydı kendi şifresini değiştirmesidir;
//              ardışık olanlar birleştirilir), bu yüzden genel bölmeyi dolduran biri bunları sildiremez.

const fs = require("fs");
const { readJsonData, writeDataFile, CryptoError } = require("./secure-file");

const MAX = 2000;

// Yöntem + yol kalıbı → okunur işlem adı
const LABELS = {
  "POST /api/admin/login": "Giriş",
  "POST /api/admin/logout": "Çıkış",
  "POST /api/admin/password": "Kendi şifresini değiştirdi",
  "POST /api/admin/uploads": "Görsel yükledi",
  "POST /api/admin/products": "Ürün ekledi",
  "PATCH /api/admin/products/:id": "Ürün düzenledi",
  "DELETE /api/admin/products/:id": "Ürün sildi",
  "POST /api/admin/products/:id/duplicate": "Ürün çoğalttı",
  "POST /api/admin/products/bulk": "Ürünlerde toplu işlem",
  "GET /api/admin/products/export": "Ürünleri CSV indirdi",
  "POST /api/admin/products/import": "Ürünleri CSV ile içe aktardı",
  "PUT /api/admin/order": "Sıralama değiştirdi",
  "POST /api/admin/categories": "Kategori ekledi",
  "PATCH /api/admin/categories/:id": "Kategori düzenledi",
  "DELETE /api/admin/categories/:id": "Kategori sildi",
  "POST /api/admin/categories/bulk-delete": "Kategorileri toplu sildi",
  "POST /api/admin/orders": "Elle sipariş girdi",
  "PATCH /api/admin/orders/:id": "Sipariş güncelledi",
  "PUT /api/admin/orders/:id/items": "Sipariş kalemlerini düzenledi",
  "POST /api/admin/orders/bulk": "Siparişlerde toplu işlem",
  "GET /api/admin/orders/export": "Siparişleri CSV indirdi",
  "PUT /api/admin/customers/:phone/block": "Müşteri engelini değiştirdi",
  "GET /api/admin/customers/:phone/export": "Müşteri verisini dışa aktardı",
  "POST /api/admin/customers/:phone/anonymize": "Müşteri verisini anonimleştirdi",
  "POST /api/admin/coupons": "Kupon ekledi",
  "PATCH /api/admin/coupons/:id": "Kupon düzenledi",
  "DELETE /api/admin/coupons/:id": "Kupon sildi",
  "POST /api/admin/coupons/bulk-delete": "Kuponları toplu sildi",
  "PATCH /api/admin/settings": "Ayarları değiştirdi",
  "PUT /api/admin/settings": "Ayarları değiştirdi",
  "POST /api/admin/settings/banners/bulk-delete": "Afişleri toplu sildi",
  "POST /api/admin/settings/faq/bulk-delete": "SSS maddelerini toplu sildi",
  "POST /api/admin/settings/zones/bulk-delete": "Bölgeleri toplu sildi",
  "POST /api/admin/settings/telegram-test": "Telegram deneme mesajı gönderdi",
  "POST /api/admin/users": "Kullanıcı ekledi",
  "PATCH /api/admin/users/:id": "Kullanıcı düzenledi",
  "DELETE /api/admin/users/:id": "Kullanıcı sildi",
  "GET /api/admin/backup": "Yedek indirdi (şifresiz)",
  "POST /api/admin/backup": "Yedek indirdi (parolalı)",
  "GET /api/admin/backups/:name": "Sunucudaki yedeği indirdi",
  "POST /api/admin/backups/:name": "Sunucudaki yedeği parolalı indirdi",
  "POST /api/admin/restore": "Yedekten geri yükledi",
  "POST /api/admin/privacy/run": "Saklama süresi anonimleştirmesini çalıştırdı",
  "POST /api/admin/orders/:id/confirmation": "Sipariş teyidini kaydetti",
  "PATCH /api/admin/orders/:id/return-requests/:rid": "Cayma/iade talebini güncelledi",
};

const SECURE_MAX = 5000;
const MERGE_MS = 10 * 60 * 1000; // ardışık aynı kayıtlar bu süre içinde birleştirilir
const FAIL_WINDOW_MS = 60 * 60 * 1000; // başarısız giriş özeti: kişi + ağ başına saatlik tek kayıt

const sameEntry = (a, b) =>
  a && b && a.user === b.user && a.role === b.role && a.action === b.action && a.target === b.target &&
  JSON.stringify(a.details || null) === JSON.stringify(b.details || null);

// Güvenlik bölmesine yazılan işlemler (yöntem + yol kalıbı). Koşullu olanları (toplu silme) işleyici ctx.auditSecure ile işaretler.
const SECURE_ACTIONS = new Set([
  "GET /api/admin/backup", "POST /api/admin/backup", "GET /api/admin/backups/:name", "POST /api/admin/backups/:name",
  "POST /api/admin/restore",
  "POST /api/admin/users", "PATCH /api/admin/users/:id", "DELETE /api/admin/users/:id", "POST /api/admin/password",
  "PATCH /api/admin/settings", "PUT /api/admin/settings",
  "POST /api/admin/settings/banners/bulk-delete", "POST /api/admin/settings/faq/bulk-delete", "POST /api/admin/settings/zones/bulk-delete",
  "DELETE /api/admin/products/:id", "POST /api/admin/products/import", "DELETE /api/admin/categories/:id", "POST /api/admin/categories/bulk-delete",
  "DELETE /api/admin/coupons/:id", "POST /api/admin/coupons/bulk-delete",
  "GET /api/admin/products/export", "GET /api/admin/orders/export",
  "GET /api/admin/customers/:phone/export", "POST /api/admin/customers/:phone/anonymize", "PUT /api/admin/customers/:phone/block",
  "POST /api/admin/privacy/run",
].map((x) => x));

class AuditLog {
  constructor(file, cipher, { log = () => {}, max = MAX, secureMax = SECURE_MAX } = {}) {
    this.file = file;
    this.cipher = cipher;
    this.log = log;
    this.max = max;
    this.secureMax = secureMax;
    this.entries = []; // genel bölme
    this.secure = []; // güvenlik bölmesi
    this.seq = 0;
    this.encrypted = false;
    this.load();
  }
  load() {
    if (!fs.existsSync(this.file)) return;
    try {
      const { data, encrypted } = readJsonData(this.file, this.cipher, "audit.json");
      this.encrypted = encrypted;
      const clean = (list) => (Array.isArray(list) ? list.filter((e) => e && typeof e === "object") : []);
      // Eski biçim: düz dizi (tek bölme)
      if (Array.isArray(data)) this.entries = clean(data).slice(-this.max);
      else if (data && typeof data === "object") {
        this.entries = clean(data.entries).slice(-this.max);
        this.secure = clean(data.secure).slice(-this.secureMax);
      }
      this.seq = [...this.entries, ...this.secure].reduce((m, e) => Math.max(m, Number(e.seq) || 0), 0);
    } catch (e) {
      // Şifre sorununda sunucu açılmaz ve dosyaya dokunulmaz; bozuk JSON'da kayıtlar okunamaz ama dosya korunur
      if (e instanceof CryptoError) throw new Error(`${e.message} Dosyaya dokunulmadı.`);
      this.log(`Denetim kaydı okunamadı (${e.message}); dosya audit.json.bozuk olarak saklanıp yeni kayıt başlatılıyor.`);
      try { fs.renameSync(this.file, `${this.file}.bozuk-${Date.now()}`); } catch {}
    }
  }
  persist() {
    try {
      writeDataFile(this.file, JSON.stringify({ v: 2, entries: this.entries, secure: this.secure }), this.cipher);
      this.encrypted = !!this.cipher;
    } catch (e) {
      this.log(`Denetim kaydı yazılamadı: ${e.message}`);
    }
  }
  /**
   * e: { user, role, action, method?, path?, target?, details?, label? }
   * opts.secure: güvenlik bölmesine yazılır (taşırılamaz)
   */
  add(e, { secure = false } = {}) {
    const list = secure ? this.secure : this.entries;
    const now = Date.now();
    const last = list[list.length - 1];
    // Ardışık aynı işlem (aynı kişi, işlem, hedef, ayrıntı): yeni kayıt yerine sayaç artar
    if (last && sameEntry(last, e) && now - Date.parse(last.lastAt || last.at) < MERGE_MS) {
      last.count = (last.count || 1) + 1;
      last.lastAt = new Date(now).toISOString();
      this.persist();
      return last;
    }
    const entry = { seq: ++this.seq, at: new Date(now).toISOString(), ...e };
    if (secure) entry.secure = true;
    if (!entry.label) entry.label = LABELS[`${e.method} ${e.path}`] || e.action || `${e.method} ${e.path}`;
    list.push(entry);
    const cap = secure ? this.secureMax : this.max;
    if (list.length > cap) list.splice(0, list.length - cap);
    this.persist();
    return entry;
  }
  /**
   * Başarısız giriş: aynı kullanıcı adı + aynı ağ (IP'nin kısa özeti; adresin kendisi yazılmaz) için saatte tek kayıt,
   * deneme sayısı "count" alanında.
   */
  addFailedLogin(user, role, sourceTag) {
    const now = Date.now();
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const x = this.entries[i];
      if (now - Date.parse(x.at) > FAIL_WINDOW_MS) break;
      if (x.action === "giris.basarisiz" && x.user === user && x.source === sourceTag) {
        x.count = (x.count || 1) + 1;
        x.lastAt = new Date(now).toISOString();
        this.persist();
        return x;
      }
    }
    return this.add({ user, role, action: "giris.basarisiz", label: "Hatalı şifreyle giriş denemesi", source: sourceTag, count: 1 });
  }
  /** En yeni üstte (iki bölme sıra numarasına göre birleşik). section: "guvenlik" → yalnızca güvenlik bölmesi */
  list({ limit = 200, before, user, action, section } = {}) {
    let list = section === "guvenlik" ? this.secure : mergeBySeq(this.entries, this.secure);
    if (before) list = list.filter((e) => e.seq < before);
    if (user) list = list.filter((e) => e.user === user);
    if (action) list = list.filter((e) => e.action === action);
    const out = list.slice(-limit).reverse();
    return {
      entries: out,
      total: section === "guvenlik" ? this.secure.length : this.entries.length + this.secure.length,
      max: this.max,
      secure: { total: this.secure.length, max: this.secureMax },
    };
  }
  needsEncrypt() {
    return !!this.cipher && !this.encrypted && fs.existsSync(this.file);
  }
}

function mergeBySeq(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i].seq < b[j].seq)) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

module.exports = { AuditLog, LABELS, MAX, SECURE_MAX, SECURE_ACTIONS };
