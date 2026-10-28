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
        if (data.email) lastEmail = data.email;
        // Funnels: continue to the next step unless the form opts out with data-stay.
        if (cfg.next && !form.hasAttribute("data-stay")) {
          notice(form, "Thanks! One moment…", false);
          location.href = cfg.next + (lastEmail ? "?email=" + encodeURIComponent(lastEmail) : "");
          return;
        }
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

  // Email carried from an earlier funnel step pre-fills Stripe checkout.
  var lastEmail = "";
  try {
    lastEmail = new URLSearchParams(location.search).get("email") || "";
  } catch (e) {}

  /* Checkout buttons: any element with data-caphub-checkout="<productId>" starts a Stripe checkout. */
  function onClick(e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-caphub-checkout]") : null;
    if (!el) return;
    e.preventDefault();
    var productId = el.getAttribute("data-caphub-checkout");
    if (cfg.mode === "preview") {
      alertBox(el, "Preview — in the live page this opens secure checkout for product " + productId + ".");
      return;
    }
    if (el.getAttribute("aria-busy") === "true") return;
    el.setAttribute("aria-busy", "true");
    var label = el.textContent;
    el.textContent = "Loading checkout…";
    fetch(cfg.api + "/api/public/checkout/" + encodeURIComponent(productId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: lastEmail, returnUrl: cfg.next || String(location.href).split("?")[0] }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || "Checkout unavailable");
          location.href = j.url;
        });
      })
      .catch(function (err) {
        el.textContent = label;
        el.removeAttribute("aria-busy");
        alertBox(el, err.message || "Checkout unavailable");
      });
  }

  function alertBox(el, text) {
    var box = document.createElement("div");
    box.setAttribute("role", "status");
    box.style.cssText = "margin-top:10px;padding:10px 12px;border-radius:8px;background:#fef3c7;color:#92400e;font:500 13px/1.4 system-ui,sans-serif";
    box.textContent = text;
    el.insertAdjacentElement("afterend", box);
    setTimeout(function () {
      box.remove();
    }, 6000);
  }

  function init() {
    Array.prototype.forEach.call(document.forms, addHoneypot);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
