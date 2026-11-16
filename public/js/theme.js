// Tema tercihini ilk boyamadan önce uygular (CSP satır içi betiğe izin vermediği için ayrı dosya).
// localStorage "theme": "light" | "dark" | yok (sistem tercihi)
(function () {
  var t = null;
  try { t = localStorage.getItem("theme"); } catch (e) {}
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
})();
