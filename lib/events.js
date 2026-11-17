"use strict";
// Canlı güncelleme (Server-Sent Events). Tek süreç içinde yayın merkezi.
//
// Kimlik: EventSource özel başlık gönderemediği için önce POST ile kısa ömürlü, tek kullanımlık bir "akış bileti"
// alınır (müşteri: sipariş id + token çiftleri; panel: Bearer oturumu), sonra GET .../stream?ticket=... ile bağlanılır.
// Token ve Bearer belirteci URL'ye girmez; bilet 60 sn içinde ve yalnızca bir kez, aynı IP'den kullanılabilir.

const crypto = require("crypto");

const DEFAULTS = {
  ticketTtlMs: 60 * 1000,
  heartbeatMs: 25 * 1000,
  retryMs: 5000,
  maxPerIp: 8,
  maxTotal: 300, // müşteri + kimliksiz durum akışları toplamı (panel akışları bu sınıra takılmaz)
  maxPublic: 200, // kimliksiz durum akışı (siparişi olmayan ziyaretçi) üst sınırı: sipariş takibini aç bırakmasın
  maxBuffered: 64 * 1024, // okumayan (yavaş) istemcinin yazma tamponu bunu aşarsa bağlantı kesilir
  maxTickets: 5000,
  historySize: 200,
};

// IP başına sayımda IPv6 adresleri /64 önekine indirgenir (tek istemci aynı ağdan sınırsız adres üretebilir).
// Hız sınırlayıcılarla aynı anahtar (lib/http.js ipKey).
const { ipKey: ipGroup } = require("./http");

class EventHub {
  constructor(opts = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.boot = crypto.randomBytes(6).toString("hex");
    this.nextId = 1;
    this.history = []; // { id, scope: "panel"|"musteri", orderId?, name, data }
    this.subs = new Set();
    this.tickets = new Map(); // ticket → { kind, ip, expiresAt, orderIds?, userId?, sessionHash? }
    this.timer = setInterval(() => this.tick(), this.opts.heartbeatMs);
    if (this.timer.unref) this.timer.unref();
    this.validatePanel = () => true; // app tarafından atanır: (sub) => oturum hâlâ geçerli mi
  }

  // ---------- Biletler ----------
  issueTicket(info) {
    this.pruneTickets();
    if (this.tickets.size >= this.opts.maxTickets) return null;
    const ticket = crypto.randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + this.opts.ticketTtlMs;
    this.tickets.set(ticket, { ...info, expiresAt });
    return { ticket, expiresAt: new Date(expiresAt).toISOString(), ttlSeconds: Math.round(this.opts.ticketTtlMs / 1000) };
  }
  /** Bileti tüketir (tek kullanımlık). Dönüş: bilgi ya da { error } */
  consumeTicket(ticket, kind, ip) {
    if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(ticket)) return { error: "GECERSIZ" };
    const t = this.tickets.get(ticket);
    if (!t) return { error: "GECERSIZ" };
    this.tickets.delete(ticket);
    if (t.expiresAt < Date.now()) return { error: "SURE" };
    if (t.kind !== kind) return { error: "GECERSIZ" };
    if (t.ip !== ip) return { error: "IP" };
    return { info: t };
  }
  pruneTickets() {
    const now = Date.now();
    for (const [k, t] of this.tickets) if (t.expiresAt < now) this.tickets.delete(k);
  }

  // ---------- Bağlantılar ----------
  countIp(ip, panel = false) {
    const g = ipGroup(ip);
    let n = 0;
    for (const s of this.subs) if ((s.kind === "panel") === panel && ipGroup(s.ip) === g) n++;
    return n;
  }
  /**
   * Bağlantı açılabilir mi: null ya da { message }. Panel akışları (oturumlu) müşteri/ziyaretçi bağlantılarıyla
   * aynı havuzu paylaşmaz: kimliksiz bağlantılarla havuzu dolduran biri yeni sipariş bildirimini kesemesin.
   */
  canOpen(ip, kind = "musteri") {
    if (kind === "panel") {
      if (this.countIp(ip, true) >= this.opts.maxPerIp) return { message: "Bu ağdan çok fazla panel bağlantısı açık. Panel yoklamayla güncellenmeye devam edecek." };
      return null;
    }
    let total = 0;
    let pub = 0;
    for (const s of this.subs) {
      if (s.kind === "panel") continue;
      total++;
      if (s.kind === "durum") pub++;
    }
    if (total >= this.opts.maxTotal || (kind === "durum" && pub >= this.opts.maxPublic))
      return { message: "Canlı bağlantı sayısı dolu. Sayfa birkaç saniyede bir kendini yenileyecek." };
    if (this.countIp(ip) >= this.opts.maxPerIp) return { message: "Bu ağdan çok fazla canlı bağlantı açık. Sayfa birkaç saniyede bir kendini yenileyecek." };
    return null;
  }

  /**
   * Akışı açar. sub: { kind: "musteri"|"panel", ip, orderIds?: Set, userId?, sessionHash? }
   * hello: ilk olayın verisi (ek alanlar). lastEventId: yeniden bağlanmada kaçırılan olaylar gönderilir.
   */
  open(req, res, sub, { hello = {}, lastEventId } = {}) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: vekil/CDN sıkıştırıp tamponlamasın; X-Accel-Buffering: nginx tamponlamasın
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    if (req.method === "HEAD") return res.end();
    if (req.socket) {
      req.socket.setNoDelay(true);
      req.socket.setKeepAlive(true, 30000);
      req.socket.setTimeout(0);
    }
    const s = { ...sub, req, res, openedAt: Date.now() };
    this.subs.add(s);
    const cleanup = () => this.subs.delete(s);
    req.on("close", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);
    res.write(`retry: ${this.opts.retryMs}\n: bağlandı\n\n`);
    // id'siz "hello": istemcinin son olay numarasını değiştirmez
    this.write(s, null, "hello", { boot: this.boot, lastId: this.nextId - 1, serverTime: new Date().toISOString(), ...hello });
    const last = Number(lastEventId);
    if (Number.isInteger(last) && last > 0 && last < this.nextId) {
      for (const ev of this.history) if (ev.id > last && this.matches(s, ev)) this.write(s, ev.id, ev.name, ev.data);
    }
    return s;
  }

  // Olay verisi JSON.stringify ile tek satıra yazılır (metindeki satır sonları \n kaçışına döner): "\n\n" ile olay enjeksiyonu olmaz.
  // Olay adı yalnızca sunucu koduyla belirlenir.
  write(s, id, name, data) {
    if (s.res.writableEnded || s.res.destroyed) return;
    // Okumayan istemci: yazma tamponu sınırsız büyümesin
    if (s.res.writableLength > this.opts.maxBuffered) {
      this.subs.delete(s);
      s.res.destroy();
      return;
    }
    s.res.write(`${id ? `id: ${id}\n` : ""}event: ${String(name).replace(/[\r\n]/g, "")}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // Kapsamlar: "panel" (oturumlu), "musteri" (yalnızca bileti olan siparişler), "herkes" (herkese açık mağaza durumu:
  // müşteri akışlarına ve kimliksiz durum akışına gider)
  matches(s, ev) {
    if (ev.scope === "panel") return s.kind === "panel";
    if (ev.scope === "musteri") return s.kind === "musteri" && s.orderIds.has(ev.orderId);
    if (ev.scope === "herkes") return s.kind === "musteri" || s.kind === "durum";
    return false;
  }

  /** Anonimleştirilen siparişlerin kişisel veri taşıyan olaylarını geçmiş tamponundan atar */
  forgetOrders(ids) {
    const set = new Set(ids.map(Number));
    // Yalnızca sipariş nesnesi (müşteri bilgisi) taşıyan olaylar atılır; "silindi" gibi kimlik olayları kalır
    this.history = this.history.filter((ev) => !(ev.data && ev.data.customer && (set.has(Number(ev.orderId)) || set.has(Number(ev.data.id)))));
  }

  publish(scope, name, data, orderId) {
    const ev = { id: this.nextId++, scope, name, data, orderId };
    this.history.push(ev);
    if (this.history.length > this.opts.historySize) this.history.shift();
    for (const s of this.subs) {
      if (!this.matches(s, ev)) continue;
      if (s.kind === "panel" && !this.validatePanel(s)) {
        this.end(s, "oturum", { reason: "Oturum kapandı." });
        continue;
      }
      this.write(s, ev.id, name, data);
    }
    return ev;
  }

  end(s, name, data) {
    this.subs.delete(s);
    if (name) this.write(s, null, name, data);
    if (!s.res.writableEnded) s.res.end();
  }

  /** Kalp atışı + panel oturum denetimi */
  tick() {
    this.pruneTickets();
    for (const s of [...this.subs]) {
      if (s.kind === "panel" && !this.validatePanel(s)) {
        this.end(s, "oturum", { reason: "Oturum kapandı." });
        continue;
      }
      if (s.res.writableEnded || s.res.destroyed) continue;
      if (s.res.writableLength > this.opts.maxBuffered) {
        this.subs.delete(s);
        s.res.destroy();
        continue;
      }
      s.res.write(`: ping ${Date.now()}\n\n`);
    }
  }

  closeWhere(fn, name, data) {
    for (const s of [...this.subs]) if (fn(s)) this.end(s, name, data);
  }

  /** Belirli türdeki (ya da tüm) bağlantıları bir son olayla kapatır */
  closeAll(kind, name = "kapanis", data = { reason: "Sunucu yeniden başlıyor." }) {
    for (const s of [...this.subs]) if (!kind || s.kind === kind) this.end(s, name, data);
  }

  stats() {
    const out = { total: this.subs.size, musteri: 0, panel: 0, durum: 0, tickets: this.tickets.size };
    for (const s of this.subs) out[s.kind]++;
    return out;
  }

  stop() {
    clearInterval(this.timer);
    this.closeAll();
  }
}

module.exports = { EventHub, DEFAULTS, ipGroup };
