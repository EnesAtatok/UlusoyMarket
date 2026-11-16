"use strict";
// Küçük yol eşleyici: "/api/admin/products/:id" → { id }

class Router {
  constructor() {
    this.routes = [];
  }
  // opts.auth: true → oturum gerekir; opts.role: "yonetici" → yalnızca yönetici
  add(method, pattern, opts, handler) {
    if (typeof opts === "function") {
      handler = opts;
      opts = {};
    }
    const keys = [];
    const re = new RegExp(
      "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === ":" ? c : "\\" + c)).replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$"
    );
    this.routes.push({ method, pattern, re, keys, opts, handler });
    return this;
  }
  match(method, pathname) {
    const m = method === "HEAD" ? "GET" : method;
    const allowed = [];
    for (const r of this.routes) {
      const hit = r.re.exec(pathname);
      if (!hit) continue;
      if (r.method !== m) {
        allowed.push(r.method);
        continue;
      }
      const params = {};
      r.keys.forEach((k, i) => {
        try { params[k] = decodeURIComponent(hit[i + 1]); } catch { params[k] = hit[i + 1]; }
      });
      return { route: r, params };
    }
    return { route: null, allowed };
  }
}

module.exports = { Router };
