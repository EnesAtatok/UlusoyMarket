"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const CSV = require("../lib/csv");
const { start } = require("./helpers");

test("CSV ayrıştırma: tırnak, satır içi satır sonu, ; ve , ayracı, BOM", () => {
  const rows = CSV.parse('﻿a;b;c\r\n1;"x;y";"çok\nsatır"\r\n2;"tırnak ""içinde""";\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["1", "x;y", "çok\nsatır"], ["2", 'tırnak "içinde"', ""]]);
  assert.deepEqual(CSV.parse("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

let s;
let admin;
before(async () => {
  s = await start();
  admin = await s.login();
});
after(() => s.close());

async function exportCsv() {
  const res = await fetch(`${s.base}/api/admin/products/export`, { headers: { Authorization: `Bearer ${admin}` } });
  return { res, buf: Buffer.from(await res.arrayBuffer()) };
}

test("ürün dışa aktarma: UTF-8 BOM, ; ayraç, virgüllü ondalık, Evet/Hayır, formül koruması", async () => {
  s.app.db.products[0].name = "=HYPERLINK(\"x\")";
  const { res, buf } = await exportCsv();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(res.headers.get("content-disposition"), /attachment; filename="urunler-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.equal(buf.subarray(0, 3).toString("hex"), "efbbbf");
  const rows = CSV.parse(buf.toString("utf8"));
  assert.deepEqual(rows[0], ["ID", "Barkod", "Ürün adı", "Marka", "Kategori", "Fiyat", "Eski fiyat", "Birim", "Stok", "Sipariş başına en fazla", "Tükendi", "Gizli", "Öne çıkan", "Açıklama", "Emoji", "Cayma hakkı"]);
  assert.equal(rows.length, s.app.db.products.length + 1);
  assert.equal(rows[1][2], "'=HYPERLINK(\"x\")");
  const milk = rows.find((r) => r[0] === "13");
  assert.equal(milk[5], "46,5");
  assert.equal(milk[4], "Süt & Kahvaltılık");
  assert.equal(milk[10], "Hayır");
  s.app.db.products[0].name = "Domates";
});

test("içe aktarma: barkodla / adla günceller, yoksa ekler, kategori oluşturur, satır hataları, kuru çalıştırma", async () => {
  s.app.db.products.find((p) => p.id === 13).barcode = "8690000000013";
  const csv =
    "﻿Barkod;Ürün adı;Kategori;Fiyat;Eski fiyat;Stok;Tükendi;Öne çıkan\r\n" +
    "8690000000013;Tam Yağlı Süt 1 L;;49,90;;20;Hayır;Evet\r\n" + // barkodla güncelle
    ";domates;;44,90;;;;\r\n" + // adla (büyük/küçük harf duyarsız) güncelle
    "8691111111111;Yeni Ürün Kefir;Süt & Kahvaltılık;35,5;39,9;;;\r\n" + // ekle
    ";Hindistan Cevizi;Egzotik Meyveler;120;;;;\r\n" + // ekle + yeni kategori
    ";Fiyatsız Yeni Ürün;Fırın;;;;;\r\n" + // hata: fiyat yok
    ";Domates;;abc;;;;\r\n" + // hata: geçersiz fiyat
    ";Ekmek (Normal);;;;;belki;\r\n"; // hata: Evet/Hayır değil

  const before = s.app.db.products.length;
  let r = await s.req("POST", "/api/admin/products/import", { csv, dryRun: true }, admin);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.dryRun, true);
  assert.equal(r.json.added, 2);
  assert.equal(r.json.updated, 2);
  assert.deepEqual(r.json.createdCategories, ["Egzotik Meyveler"]);
  assert.deepEqual(r.json.errors.map((e) => e.row), [6, 7, 8]);
  assert.equal(s.app.db.products.length, before, "kuru çalıştırma veriyi değiştirmez");
  assert.equal(s.app.db.products.find((p) => p.id === 13).price, 46.5);
  assert.ok(!s.app.db.categories.some((c) => c.name === "Egzotik Meyveler"));

  r = await s.req("POST", "/api/admin/products/import", { csv }, admin);
  assert.equal(r.json.added, 2);
  assert.equal(r.json.updated, 2);
  const milk = s.app.db.products.find((p) => p.id === 13);
  assert.equal(milk.price, 49.9);
  assert.equal(milk.stock, 20);
  assert.equal(milk.featured, true);
  assert.equal(milk.name, "Tam Yağlı Süt 1 L");
  assert.equal(s.app.db.products.find((p) => p.id === 1).price, 44.9);
  const kefir = s.app.db.products.find((p) => p.barcode === "8691111111111");
  assert.equal(kefir.price, 35.5);
  assert.equal(kefir.oldPrice, 39.9);
  assert.equal(kefir.unit, "adet");
  assert.equal(kefir.stock, null);
  const cat = s.app.db.categories.find((c) => c.name === "Egzotik Meyveler");
  assert.ok(cat);
  assert.equal(s.app.db.products.find((p) => p.name === "Hindistan Cevizi").categoryId, cat.id);
  // Aynı dosya ikinci kez: değişiklik yok
  r = await s.req("POST", "/api/admin/products/import", { csv }, admin);
  assert.equal(r.json.added, 0);
  assert.equal(r.json.updated, 0);
  assert.equal(r.json.unchanged, 4);
});

test("dışa aktarılan dosya geri içe aktarılınca değişiklik olmaz (gidiş-dönüş)", async () => {
  const { buf } = await exportCsv();
  const res = await fetch(`${s.base}/api/admin/products/import?dryRun=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${admin}`, "Content-Type": "text/csv; charset=utf-8" },
    body: buf,
  });
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.equal(j.errors.length, 0, JSON.stringify(j.errors.slice(0, 3)));
  assert.equal(j.added, 0);
  assert.equal(j.updated, 0);
  assert.equal(j.unchanged, s.app.db.products.length);
});

test("CSV: cayma hakkı sütunu dışa/içe aktarılır; eski fiyat 10 günün en düşüğünden yüksekse uyarı, düşük fiyatta otomatik", async () => {
  // Dışa aktarma: ürünün kendi değeri etiketle, yoksa "Kategoriden (…)"
  const p13 = s.app.db.products.find((p) => p.id === 13);
  p13.caymaDurumu = "var";
  const rows = CSV.parse((await exportCsv()).buf.toString("utf8"));
  const col = rows[0].indexOf("Cayma hakkı");
  assert.equal(rows.find((r) => r[0] === "13")[col], "Var");
  assert.match(rows.find((r) => r[0] === "1")[col], /^Kategoriden \(Yok – çabuk bozulan\)$/);
  // İçe aktarma: etiket, kod ve "kategoriden" kabul; anlamsız değer satır hatası
  const csv =
    "Barkod;Ürün adı;Cayma hakkı\r\n" +
    ";Tam Yağlı Süt 1 L;Yok – çabuk bozulan\r\n" +
    ";Domates;acilirsa_yok_hijyen\r\n" +
    ";Ekmek (Normal);belki\r\n";
  let r = await s.req("POST", "/api/admin/products/import", { csv }, admin);
  assert.equal(r.status, 200, r.text);
  assert.equal(p13.caymaDurumu, "yok_cabuk_bozulan");
  assert.equal(s.app.db.products.find((p) => p.id === 1).caymaDurumu, "acilirsa_yok_hijyen");
  assert.deepEqual(r.json.errors.map((e) => e.row), [4]);
  r = await s.req("POST", "/api/admin/products/import", { csv: "Ürün adı;Cayma hakkı\r\nDomates;Kategoriden (Var)\r\n" }, admin);
  assert.equal(s.app.db.products.find((p) => p.id === 1).caymaDurumu, null);

  // Eski fiyat: ürün 10 gündür 46,5 → 60 eski fiyatla indirim girilirse uyarı (satır yine alınır)
  p13.price = 46.5;
  p13.oldPrice = null;
  p13.priceHistory = [{ price: 46.5, at: new Date(Date.now() - 20 * 86400000).toISOString() }];
  r = await s.req("POST", "/api/admin/products/import", { csv: "Ürün adı;Fiyat;Eski fiyat\r\nTam Yağlı Süt 1 L;40;60\r\n" }, admin);
  assert.equal(r.json.updated, 1);
  assert.equal(r.json.warnings.length, 1, r.text);
  assert.equal(r.json.warnings[0].row, 2);
  assert.match(r.json.warnings[0].message, /son 10 günde uygulanan en düşük fiyat/);
  assert.equal(p13.price, 40);
  assert.equal(p13.oldPrice, 60);
  // Eski fiyat sütunu yoksa indirim öncesi fiyat geçmişten konur (panelle aynı)
  p13.priceHistory = [{ price: 46.5, at: new Date(Date.now() - 20 * 86400000).toISOString() }];
  p13.price = 46.5;
  p13.oldPrice = null;
  r = await s.req("POST", "/api/admin/products/import", { csv: "Ürün adı;Fiyat\r\nTam Yağlı Süt 1 L;42\r\n" }, admin);
  assert.equal(r.json.warnings.length, 0);
  assert.equal(p13.oldPrice, 46.5);
});

test("başlıksız / boş dosya", async () => {
  let r = await s.req("POST", "/api/admin/products/import", { csv: "x;y\n1;2" }, admin);
  assert.match(r.json.errors[0].message, /Ürün adı/);
  r = await s.req("POST", "/api/admin/products/import", { csv: "" }, admin);
  assert.equal(r.status, 400);
});
