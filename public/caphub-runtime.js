/*!
 * CapHub Studio page runtime — injected into published pages and editor previews.
 * Captures <form> submissions and sends them to CapHub Studio.
 * Config comes from window.__CAPHUB__ = { siteId, api, mode: "live" | "preview" }.
 */
(function () {
  "use strict";
  var cfg = window.__CAPHUB__;
  if (!cfg || !cfg.siteId || !cfg.api) return;

  function formName(form) {
    return form.getAttribute("data-form-name") || form.getAttribute("name") || form.id || "form";
  }

  function collect(form) {
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (value, key) {
      if (typeof value !== "string") return; // skip file inputs
      data[key] = key in data ? data[key] + ", " + value : value;
    });
    return data;
  }

  function addHoneypot(form) {
    if (form.querySelector('input[name="_hp"]')) return;
    var hp = document.createElement("input");
    hp.type = "text";
    hp.name = "_hp";
    hp.tabIndex = -1;
    hp.autocomplete = "off";
    hp.setAttribute("aria-hidden", "true");
    hp.style.cssText = "position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0";
    form.appendChild(hp);
  }

  function notice(form, text, isError) {
    var box = form.querySelector("[data-caphub-notice]");
    if (!box) {
      box = document.createElement("div");
      box.setAttribute("data-caphub-notice", "");
      box.setAttribute("role", "status");
      box.style.cssText = "margin-top:12px;padding:12px 14px;border-radius:8px;font:500 14px/1.4 system-ui,sans-serif";
      form.appendChild(box);
    }
    box.style.background = isError ? "#fef2f2" : "#ecfdf5";
    box.style.color = isError ? "#991b1b" : "#065f46";
    box.textContent = text;
  }

  function onSubmit(e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    e.preventDefault();
    var data = collect(form);
    var success = form.getAttribute("data-success-message") || "Thanks! We received your submission and will be in touch soon.";

    if (cfg.mode === "preview") {
      delete data._hp;
      notice(form, "Preview — submission not saved: " + JSON.stringify(data), false);
      return;
    }

    var btn = form.querySelector('[type="submit"], button:not([type])');
    if (btn) btn.disabled = true;
    fetch(cfg.api + "/api/public/forms/" + encodeURIComponent(cfg.siteId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form: formName(form), page: String(location.href).slice(0, 2000), data: data }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        form.reset();
        notice(form, success, false);
      })
      .catch(function () {
        notice(form, "Sorry, something went wrong. Please try again.", true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function init() {
    Array.prototype.forEach.call(document.forms, addHoneypot);
    document.addEventListener("submit", onSubmit, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
