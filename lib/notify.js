"use strict";
// Telegram bildirimi. Hata siparişi engellemez; yalnızca günlüğe yazılır.

const https = require("https");
const http = require("http");
const { formatTL } = require("./util");
const { TYPE_LABEL } = require("./orders");

function sendTelegram({ token, chatId, text, apiBase = "https://api.telegram.org", timeoutMs = 8000 }) {
  return new Promise((resolve) => {
    if (!token || !chatId) return resolve({ ok: false, error: "Telegram ayarları eksik." });
    let url;
    try {
      url = new URL(`/bot${token}/sendMessage`, apiBase);
    } catch {
      return resolve({ ok: false, error: "Telegram adresi geçersiz." });
    }
    const body = JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true });
    const lib = url.protocol === "http:" ? http : https;
    const req = lib.request(
      url,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: timeoutMs },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (raw += c.length < 100000 ? c : ""));
        res.on("end", () => {
          let data = {};
          try { data = JSON.parse(raw); } catch {}
          if (res.statusCode === 200 && data.ok) resolve({ ok: true });
          else resolve({ ok: false, error: data.description ? `Telegram: ${data.description}` : `Telegram yanıtı: ${res.statusCode}` });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("zaman aşımı")));
    req.on("error", (e) => resolve({ ok: false, error: `Telegram'a ulaşılamadı (${e.message}).` }));
    req.end(body);
  });
}

// Telegram'a kişisel veri GÖNDERİLMEZ (ad, telefon, adres, not): Telegram sunucuları yurt dışında; her siparişte
// otomatik giden bildirim KVKK m.9 bakımından "arızi" aktarım sayılmaz (YASAL.md §4.3.4). Ayrıntı panelde görülür.
function orderMessage(o, baseUrl) {
  const count = o.items.reduce((t, i) => t + (Number(i.qty) || 0), 0);
  const lines = [
    `🛒 Yeni sipariş #${o.id}${o.preorder ? " (ÖN SİPARİŞ)" : ""}`,
    `${TYPE_LABEL[o.type]}${o.customer.zoneName ? ` · ${o.customer.zoneName}` : ""}`,
    `${o.items.length} kalem, ${count} ürün · Toplam: ${formatTL(o.total)}`,
  ];
  if (baseUrl) lines.push("", `${baseUrl}/panel`);
  return lines.join("\n");
}

function cancelMessage(o) {
  return `❌ Sipariş #${o.id} müşteri tarafından iptal edildi · ${formatTL(o.total)}`;
}

function returnRequestMessage(o, r) {
  return `↩️ Sipariş #${o.id} için cayma/iade talebi (#${r.id}). Ayrıntı panelde.`;
}

module.exports = { sendTelegram, orderMessage, cancelMessage, returnRequestMessage };
