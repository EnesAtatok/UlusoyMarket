// Market prototipi — bağımlılıksız Node.js sunucusu
// Çalıştırma: node server.js  →  http://localhost:3000  (admin: /panel)

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const DB_FILE = path.join(__dirname, "data", "db.json");
const SEED_FILE = path.join(__dirname, "data", "seed.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const STATUSES = ["Yeni", "Hazırlanıyor", "Yolda", "Teslim edildi", "İptal"];

// Sipariş formu kuralları (istemcide de aynı kurallar uygulanır)
const TR = "A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû";
const NAME_MAX = 60;
const ADDR_MIN = 10;
const ADDR_MAX = 250;
const ADDR_MAX_LINES = 5;
const NAME_RE = new RegExp(`^[${TR}][${TR} .'-]+$`);
const ADDR_RE = new RegExp(`^[0-9${TR} .,:;/#'()\\n-]+$`);
const PHONE_RE = /^0\d{10}$/;
const CANCEL_NOTE_MAX = 300;

// ---------- Veri katmanı (JSON dosyası) ----------
function loadDb() {
  if (!fs.existsSync(DB_FILE)) fs.copyFileSync(SEED_FILE, DB_FILE);
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
let db = loadDb();
// Takip anahtarı özelliğinden önce verilmiş siparişlere anahtar ata
const newToken = () => crypto.randomBytes(12).toString("hex");
if (db.orders.some((o) => !o.token)) {
  db.orders.forEach((o) => { if (!o.token) o.token = newToken(); });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
const nextId = (list) => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;

// ---------- Admin oturumları (bellekte) ----------
const sessions = new Set();
function isAdmin(req) {
  const auth = req.headers.authorization || "";
  return sessions.has(auth.replace("Bearer ", ""));
}

// ---------- Yardımcılar ----------
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    // Sınırı aşan istekte veriyi biriktirmeden sonuna kadar okur, sonra anlaşılır bir hata döner
    // (bağlantıyı kesmek tarayıcıda "bağlantı hatası" olarak görünürdü)
    let raw = "";
    let size = 0;
    let tooBig = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > 50e6) return req.destroy(); // aşırı büyük/kötü niyetli istek
      if (size > limit) { tooBig = true; raw = ""; return; }
      raw += c;
    });
    req.on("end", () => {
      if (tooBig) return reject(new Error("Gönderilen bilgi çok uzun. Lütfen alanları kısaltın."));
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Geçersiz JSON"));
      }
    });
  });
}
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

// data:image/...;base64,... → public/uploads/ içine kaydeder, URL döner
const IMG_EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
function saveImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw new Error("Görsel JPG, PNG veya WEBP olmalı.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 3 * 1024 * 1024) throw new Error("Görsel en fazla 3 MB olabilir.");
  const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${IMG_EXT[m[1]]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
function deleteImage(url) {
  if (!url || !url.startsWith("/uploads/")) return;
  try { fs.rmSync(path.join(UPLOAD_DIR, path.basename(url)), { force: true }); } catch {}
}

// Müşteriye gösterilecek sipariş bilgisi (telefon/adres maskelenmeden sadece sahibine)
function publicOrder(o) {
  return {
    id: o.id,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt || o.createdAt,
    status: o.status,
    history: o.history || [{ status: o.status, at: o.createdAt }],
    items: o.items,
    total: o.total,
    customer: { name: o.customer.name },
    cancelNote: o.status === "İptal" ? o.cancelNote || "" : "",
  };
}
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  // Temiz adresler: /panel → panel.html  (/panel.html yazılırsa /panel'e yönlendir)
  if (urlPath === "/panel.html") {
    res.writeHead(301, { Location: "/panel" });
    return res.end();
  }
  // /panel, /panel/urunler, /panel/siparisler, /panel/ciro → aynı sayfa (sayfa geçişi istemcide)
  if (urlPath === "/panel" || urlPath.startsWith("/panel/")) urlPath = "/panel.html";
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: "Yasak" });
  fs.readFile(file, (err, content) => {
    if (err) return send(res, 404, { error: "Bulunamadı" });
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      // Sayfa/kod dosyaları her açılışta güncel hâliyle gelsin (yüklenen ürün fotoğrafları önbellekte kalabilir)
      "Cache-Control": urlPath.startsWith("/uploads/") ? "public, max-age=86400" : "no-cache",
    });
    res.end(content);
  });
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const { pathname } = url;
  const m = req.method;

  // --- Müşteri tarafı ---
  if (m === "GET" && pathname === "/api/categories") {
    return send(res, 200, db.categories);
  }
  if (m === "GET" && pathname === "/api/products") {
    return send(res, 200, db.products.filter((p) => !p.hidden));
  }
  if (m === "POST" && pathname === "/api/orders") {
    const body = await readBody(req);
    const name = String(body.name || "").trim().replace(/\s+/g, " ");
    const phone = String(body.phone || "").trim();
    const address = String(body.address || "")
      .trim()
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n");
    const items = Array.isArray(body.items) ? body.items : [];

    if (name.length > NAME_MAX) return send(res, 400, { error: `Ad soyad en fazla ${NAME_MAX} karakter olabilir.` });
    if (!NAME_RE.test(name) || !/\S\s+\S/.test(name))
      return send(res, 400, { error: "Ad soyad yalnızca harflerden oluşmalı (örn. Ayşe Yılmaz)." });
    if (!PHONE_RE.test(phone))
      return send(res, 400, { error: "Telefon 0 ile başlamalı ve 11 haneli olmalı (örn. 05321234567)." });
    if (address.length < ADDR_MIN) return send(res, 400, { error: `Lütfen açık adres girin (en az ${ADDR_MIN} karakter).` });
    if (address.length > ADDR_MAX) return send(res, 400, { error: `Adres en fazla ${ADDR_MAX} karakter olabilir.` });
    if (address.split("\n").length > ADDR_MAX_LINES) return send(res, 400, { error: `Adres en fazla ${ADDR_MAX_LINES} satır olabilir.` });
    if (!ADDR_RE.test(address)) return send(res, 400, { error: "Adreste izin verilmeyen karakter var." });
    if (!items.length) return send(res, 400, { error: "Sepetiniz boş." });
    if (items.length > 200) return send(res, 400, { error: "Sepette çok fazla ürün çeşidi var." });

    const lines = [];
    for (const it of items) {
      const p = db.products.find((x) => x.id === Number(it.productId));
      const qty = Math.floor(Number(it.qty));
      if (!p || p.hidden) return send(res, 409, { error: `Bir ürün artık satışta değil. Sepetinizi kontrol edin.` });
      if (p.soldOut) return send(res, 409, { error: `"${p.name}" tükendi. Sepetinizden çıkarıldı, lütfen tekrar kontrol edin.` });
      if (!(qty > 0 && qty <= 99)) return send(res, 400, { error: "Geçersiz adet." });
      lines.push({ productId: p.id, name: p.name, price: p.price, qty });
    }
    const now = new Date().toISOString();
    const order = {
      id: nextId(db.orders),
      token: newToken(),
      createdAt: now,
      updatedAt: now,
      customer: { name, phone, address },
      items: lines,
      total: Math.round(lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100,
      status: "Yeni",
      history: [{ status: "Yeni", at: now }],
    };
    db.orders.push(order);
    saveDb();
    return send(res, 201, { id: order.id, token: order.token, total: order.total });
  }

  // Sipariş takibi: ?token=... (aynı tarayıcı) veya ?phone=... (başka cihazdan sorgu)
  const trackMatch = pathname.match(/^\/api\/orders\/(\d+)$/);
  if (m === "GET" && trackMatch) {
    const o = db.orders.find((x) => x.id === Number(trackMatch[1]));
    const token = url.searchParams.get("token");
    const phone = (url.searchParams.get("phone") || "").replace(/\D/g, "").slice(-10);
    const ok = o && ((token && o.token === token) || (phone.length === 10 && o.customer.phone.slice(-10) === phone));
    if (!ok) return send(res, 404, { error: "Sipariş bulunamadı. Numara ve telefonu kontrol edin." });
    if (!o.token) { o.token = newToken(); saveDb(); }
    return send(res, 200, { ...publicOrder(o), token: o.token });
  }

  // --- Admin girişi ---
  if (m === "POST" && pathname === "/api/admin/login") {
    const body = await readBody(req);
    if (body.password !== ADMIN_PASSWORD) return send(res, 401, { error: "Şifre hatalı." });
    const token = crypto.randomBytes(24).toString("hex");
    sessions.add(token);
    return send(res, 200, { token });
  }

  if (pathname.startsWith("/api/admin/")) {
    if (!isAdmin(req)) return send(res, 401, { error: "Yetkisiz" });

    if (m === "GET" && pathname === "/api/admin/products") return send(res, 200, db.products);

    // Sıralama: { categoryIds: [...] } veya { categoryId, productIds: [...] }
    if (m === "PUT" && pathname === "/api/admin/order") {
      const b = await readBody(req);
      if (Array.isArray(b.categoryIds)) {
        const ids = b.categoryIds.map(Number);
        if (ids.length !== db.categories.length || !db.categories.every((c) => ids.includes(c.id)))
          return send(res, 400, { error: "Geçersiz sıralama" });
        db.categories = ids.map((id) => db.categories.find((c) => c.id === id));
      } else if (Array.isArray(b.productIds)) {
        const cid = Number(b.categoryId);
        const mine = db.products.filter((p) => p.categoryId === cid);
        const ids = b.productIds.map(Number);
        if (ids.length !== mine.length || !mine.every((p) => ids.includes(p.id)))
          return send(res, 400, { error: "Geçersiz sıralama" });
        db.products = [...db.products.filter((p) => p.categoryId !== cid), ...ids.map((id) => mine.find((p) => p.id === id))];
      } else return send(res, 400, { error: "Geçersiz sıralama" });
      saveDb();
      return send(res, 200, { ok: true });
    }

    const catMatch = pathname.match(/^\/api\/admin\/categories\/(\d+)$/);
    if (catMatch) {
      const c = db.categories.find((x) => x.id === Number(catMatch[1]));
      if (!c) return send(res, 404, { error: "Kategori bulunamadı" });
      if (m === "PATCH") {
        const b = await readBody(req);
        const name = String(b.name || "").trim();
        if (!name) return send(res, 400, { error: "Kategori adı gerekli." });
        c.name = name;
        if (b.emoji !== undefined) c.emoji = String(b.emoji).trim().slice(0, 4) || "📦";
        saveDb();
        return send(res, 200, c);
      }
      if (m === "DELETE") {
        const count = db.products.filter((p) => p.categoryId === c.id).length;
        if (count) return send(res, 409, { error: `Bu kategoride ${count} ürün var. Önce ürünleri silin veya başka kategoriye taşıyın.` });
        db.categories = db.categories.filter((x) => x !== c);
        saveDb();
        return send(res, 200, { ok: true });
      }
    }

    if (m === "POST" && pathname === "/api/admin/products") {
      const b = await readBody(req, 6e6);
      const name = String(b.name || "").trim();
      const price = Number(b.price);
      const categoryId = Number(b.categoryId);
      if (!name) return send(res, 400, { error: "Ürün adı gerekli." });
      if (!(price > 0)) return send(res, 400, { error: "Geçerli bir fiyat girin." });
      if (!db.categories.some((c) => c.id === categoryId)) return send(res, 400, { error: "Kategori seçin." });
      const image = b.image ? saveImage(b.image) : null;
      const product = {
        id: nextId(db.products),
        name,
        price: Math.round(price * 100) / 100,
        unit: String(b.unit || "adet").trim(),
        categoryId,
        image,
        emoji: "🛒",
        soldOut: false,
        hidden: false,
      };
      db.products.push(product);
      saveDb();
      return send(res, 201, product);
    }

    const prodMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
    if (prodMatch) {
      const p = db.products.find((x) => x.id === Number(prodMatch[1]));
      if (!p) return send(res, 404, { error: "Ürün bulunamadı" });
      if (m === "PATCH") {
        const b = await readBody(req, 6e6);
        // Önce doğrula, sonra uygula
        if (b.name !== undefined && !String(b.name).trim()) return send(res, 400, { error: "Ürün adı gerekli." });
        if (b.price !== undefined && !(Number(b.price) > 0)) return send(res, 400, { error: "Geçerli bir fiyat girin." });
        if (b.categoryId !== undefined && !db.categories.some((c) => c.id === Number(b.categoryId)))
          return send(res, 400, { error: "Kategori seçin." });
        if (b.name !== undefined) p.name = String(b.name).trim();
        if (b.price !== undefined) p.price = Math.round(Number(b.price) * 100) / 100;
        if (b.unit !== undefined) p.unit = String(b.unit).trim() || "adet";
        if (b.categoryId !== undefined) p.categoryId = Number(b.categoryId);
        if (typeof b.hidden === "boolean") p.hidden = b.hidden;
        if (typeof b.soldOut === "boolean") p.soldOut = b.soldOut;
        if (b.image) {
          const newUrl = saveImage(b.image);
          deleteImage(p.image);
          p.image = newUrl;
        } else if (b.image === null) {
          deleteImage(p.image);
          p.image = null;
        }
        saveDb();
        return send(res, 200, p);
      }
      if (m === "DELETE") {
        deleteImage(p.image);
        db.products = db.products.filter((x) => x !== p);
        saveDb();
        return send(res, 200, { ok: true });
      }
    }

    if (m === "POST" && pathname === "/api/admin/categories") {
      const b = await readBody(req);
      const name = String(b.name || "").trim();
      if (!name) return send(res, 400, { error: "Kategori adı gerekli." });
      const cat = { id: nextId(db.categories), name, emoji: String(b.emoji || "📦").trim().slice(0, 4) };
      db.categories.push(cat);
      saveDb();
      return send(res, 201, cat);
    }

    if (m === "GET" && pathname === "/api/admin/orders") {
      return send(res, 200, [...db.orders].reverse());
    }
    const orderMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
    if (orderMatch && m === "PATCH") {
      const o = db.orders.find((x) => x.id === Number(orderMatch[1]));
      if (!o) return send(res, 404, { error: "Sipariş bulunamadı" });
      const b = await readBody(req);
      // İptal notu: müşteriye gösterilir (en fazla 300 karakter)
      let note;
      if (b.cancelNote !== undefined) {
        note = String(b.cancelNote).replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").replace(/\n{2,}/g, "\n").trim();
        if (note.length > CANCEL_NOTE_MAX) return send(res, 400, { error: `Not en fazla ${CANCEL_NOTE_MAX} karakter olabilir.` });
      }
      const now = new Date().toISOString();
      if (STATUSES.includes(b.status) && b.status !== o.status) {
        o.status = b.status;
        o.updatedAt = now;
        o.history = o.history || [{ status: "Yeni", at: o.createdAt }];
        o.history.push({ status: b.status, at: now });
        if (b.status !== "İptal") delete o.cancelNote; // iptal geri alındıysa not da kalkar
      }
      if (note !== undefined && o.status === "İptal") {
        o.cancelNote = note;
        o.updatedAt = now;
      }
      saveDb();
      return send(res, 200, o);
    }
  }

  send(res, 404, { error: "Bulunamadı" });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
      serveStatic(req, res);
    } catch (e) {
      send(res, 400, { error: e.message || "Hata" });
    }
  })
  .listen(PORT, () => {
    console.log(`Market çalışıyor:  http://localhost:${PORT}`);
    console.log(`Admin paneli:      http://localhost:${PORT}/panel  (şifre: ${ADMIN_PASSWORD === "admin123" ? "admin123" : "ADMIN_PASSWORD"})`);
  });
