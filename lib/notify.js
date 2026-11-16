"use strict";
// Telegram bildirimi. Hata siparişi engellemez; yalnızca günlüğe yazılır.

const https = require("https");
const http = require("http");
const { formatTL } = require("./util");
const { TYPE_LABEL, PAYMENT_LABEL, SUBST_LABEL } = require("./orders");

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

function orderMessage(o, baseUrl) {
  const lines = [
    `🛒 Yeni sipariş #${o.id}${o.preorder ? " (ÖN SİPARİŞ)" : ""}`,
    `${o.customer.name} · ${o.customer.phone}`,
    `${TYPE_LABEL[o.type]}${o.customer.zoneName ? ` · ${o.customer.zoneName}` : ""}`,
  ];
  if (o.customer.address) lines.push(`Adres: ${o.customer.address}`);
  lines.push(`Ödeme: ${PAYMENT_LABEL[o.payment]}${o.changeFor ? ` (${formatTL(o.changeFor)} bozuk para)` : ""}`);
  lines.push("");
  for (const i of o.items) lines.push(`${i.qty} × ${i.name} — ${formatTL(i.price * i.qty)}`);
  lines.push("");
  if (o.discount) lines.push(`İndirim${o.couponCode ? ` (${o.couponCode})` : ""}: -${formatTL(o.discount)}`);
  if (o.deliveryFee) lines.push(`Teslimat: ${formatTL(o.deliveryFee)}`);
  lines.push(`Toplam: ${formatTL(o.total)}`);
  lines.push(`Ürün yoksa: ${SUBST_LABEL[o.substitution]}`);
  if (o.note) lines.push(`Not: ${o.note}`);
  if (baseUrl) lines.push("", `${baseUrl}/panel`);
  return lines.join("\n");
}

function cancelMessage(o) {
  return `❌ Sipariş #${o.id} müşteri tarafından iptal edildi.\n${o.customer.name} · ${o.customer.phone} · ${formatTL(o.total)}`;
}

module.exports = { sendTelegram, orderMessage, cancelMessage };
