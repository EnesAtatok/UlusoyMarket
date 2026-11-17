"use strict";
// Testler için küçük SSE istemcisi (EventSource yerine): olayları ayrıştırır, beklenen olayı bekler.

const http = require("http");

function openSse(base, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(base + path, { headers: { Accept: "text/event-stream", ...headers } }, (res) => {
      const out = { status: res.statusCode, headers: res.headers, events: [], comments: [], raw: "", ended: false, res, req };
      const waiters = [];
      const check = () => {
        for (let i = waiters.length - 1; i >= 0; i--) {
          const w = waiters[i];
          const hit = out.events.find((e, idx) => idx >= w.from && w.pred(e));
          if (hit || (w.onEnd && out.ended)) {
            clearTimeout(w.timer);
            waiters.splice(i, 1);
            w.resolve(hit || null);
          }
        }
      };
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        out.raw += chunk;
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = { event: "message", data: "", id: null };
          let hasField = false;
          for (const line of block.split("\n")) {
            if (line.startsWith(":")) out.comments.push(line.slice(1).trim());
            else if (line.startsWith("event: ")) { ev.event = line.slice(7); hasField = true; }
            else if (line.startsWith("data: ")) { ev.data += line.slice(6); hasField = true; }
            else if (line.startsWith("id: ")) ev.id = Number(line.slice(4));
            else if (line.startsWith("retry: ")) out.retry = Number(line.slice(7));
          }
          if (hasField) {
            try { ev.json = JSON.parse(ev.data); } catch {}
            out.events.push(ev);
          }
        }
        check();
      });
      res.on("end", () => { out.ended = true; check(); });
      res.on("close", () => { out.ended = true; check(); });
      /** pred'i sağlayan olayı bekler (from: bu sıradan sonraki olaylar); süre dolarsa null */
      out.waitFor = (pred, ms = 2000, from = 0) =>
        new Promise((r) => {
          const w = { pred, from, resolve: r, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); r(null); }, ms) };
          waiters.push(w);
          check();
        });
      out.waitEvent = (name, ms, from) => out.waitFor((e) => e.event === name, ms, from);
      out.waitEnd = (ms = 2000) =>
        new Promise((r) => {
          if (out.ended) return r(true);
          const t = setTimeout(() => r(false), ms);
          res.on("close", () => { clearTimeout(t); r(true); });
          res.on("end", () => { clearTimeout(t); r(true); });
        });
      out.close = () => { req.destroy(); };
      if (res.statusCode !== 200) {
        res.on("end", () => {
          try { out.json = JSON.parse(out.raw); } catch {}
          resolve(out);
        });
      } else resolve(out);
    });
    req.on("error", reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { openSse, sleep };
