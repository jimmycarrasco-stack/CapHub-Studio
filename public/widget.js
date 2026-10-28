/*!
 * CapHub Studio chat widget.
 * Embed: <script src="https://YOUR-STUDIO/widget.js" data-agent="AGENT_ID" defer></script>
 * Optional: data-api="https://YOUR-STUDIO" (defaults to the script's origin).
 * Renders inside a Shadow DOM so host-page CSS can't break it; all text is
 * inserted with textContent (no HTML injection from model output).
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var agentId = script.getAttribute("data-agent");
  if (!agentId) return;
  var api = (script.getAttribute("data-api") || new URL(script.src).origin).replace(/\/+$/, "");
  if (window["__caphubWidget_" + agentId]) return;
  window["__caphubWidget_" + agentId] = true;

  var storeKey = "caphub_conv_" + agentId;
  var memory = {}; // fallback when sessionStorage is unavailable (sandboxed page, private mode)
  function store(key, value) {
    if (value !== undefined) memory[key] = value;
    try {
      if (value === undefined) return window.sessionStorage.getItem(key) || memory[key] || null;
      window.sessionStorage.setItem(key, value);
    } catch (e) {
      return memory[key] || null;
    }
  }

  fetch(api + "/api/public/agents/" + encodeURIComponent(agentId))
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (agent) {
      if (agent) mount(agent);
    })
    .catch(function () {});

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function mount(agent) {
    var color = /^#[0-9a-f]{6}$/i.test(agent.color) ? agent.color : "#4f46e5";
    var host = el("div", { id: "caphub-chat-" + agentId });
    host.style.cssText = "position:fixed;z-index:2147483000;right:20px;bottom:20px";
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });

    var style = el("style");
    style.textContent =
      ":host{all:initial}*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}" +
      ".btn{width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;background:" + color + ";color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.2);display:grid;place-items:center;transition:transform .15s}" +
      ".btn:hover{transform:scale(1.06)}.btn:focus-visible{outline:3px solid #fff;outline-offset:2px}" +
      ".panel{position:absolute;right:0;bottom:72px;width:min(380px,calc(100vw - 40px));height:min(560px,calc(100vh - 120px));background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;border:1px solid #e5e7eb}" +
      ".panel.open{display:flex}" +
      ".head{background:" + color + ";color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:15px}" +
      ".x{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 4px}" +
      ".log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f9fafb}" +
      ".msg{max-width:85%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
      ".bot{background:#fff;color:#111827;border:1px solid #e5e7eb;align-self:flex-start;border-bottom-left-radius:4px}" +
      ".me{background:" + color + ";color:#fff;align-self:flex-end;border-bottom-right-radius:4px}" +
      ".err{background:#fef2f2;color:#991b1b;align-self:flex-start}" +
      ".dots{display:inline-flex;gap:4px}.dots i{width:6px;height:6px;border-radius:50%;background:#9ca3af;animation:b 1s infinite}" +
      ".dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}@keyframes b{0%,80%,100%{opacity:.3}40%{opacity:1}}" +
      "form{display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb;background:#fff}" +
      "textarea{flex:1;resize:none;border:1px solid #d1d5db;border-radius:10px;padding:9px 11px;font-size:14px;line-height:1.4;max-height:120px;outline:none;color:#111827}" +
      "textarea:focus{border-color:" + color + ";box-shadow:0 0 0 3px " + color + "33}" +
      ".send{border:0;border-radius:10px;background:" + color + ";color:#fff;padding:0 14px;font-weight:600;font-size:14px;cursor:pointer}" +
      ".send:disabled{opacity:.5;cursor:default}.foot{text-align:center;font-size:11px;color:#9ca3af;padding:0 0 8px;background:#fff}";
    root.appendChild(style);

    var btn = el("button", { class: "btn", "aria-label": "Open chat with " + agent.name, "aria-expanded": "false" });
    btn.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var panel = el("div", { class: "panel", role: "dialog", "aria-label": agent.name + " chat" });
    var head = el("div", { class: "head" });
    head.appendChild(el("span", null, agent.name));
    var close = el("button", { class: "x", "aria-label": "Close chat" }, "×");
    head.appendChild(close);
    var log = el("div", { class: "log", "aria-live": "polite" });
    var form = el("form");
    var input = el("textarea", { rows: "1", placeholder: "Type a message…", "aria-label": "Message", maxlength: "4000" });
    var send = el("button", { class: "send", type: "submit" }, "Send");
    form.appendChild(input);
    form.appendChild(send);
    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(form);
    panel.appendChild(el("div", { class: "foot" }, "AI assistant · may make mistakes"));
    root.appendChild(panel);
    root.appendChild(btn);

    function add(cls, text) {
      var m = el("div", { class: "msg " + cls }, text);
      log.appendChild(m);
      log.scrollTop = log.scrollHeight;
      return m;
    }
    if (agent.greeting) add("bot", agent.greeting);

    function toggle(open) {
      panel.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
      if (open) input.focus();
    }
    btn.addEventListener("click", function () {
      toggle(!panel.classList.contains("open"));
    });
    close.addEventListener("click", function () {
      toggle(false);
      btn.focus();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    var busy = false;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text || busy) return;
      busy = true;
      send.disabled = true;
      input.value = "";
      add("me", text);
      var typing = el("div", { class: "msg bot", "aria-label": "Typing" });
      typing.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
      log.appendChild(typing);
      log.scrollTop = log.scrollHeight;

      var body = { message: text };
      var conv = store(storeKey);
      if (conv) body.conversationId = conv;

      fetch(api + "/api/public/agents/" + encodeURIComponent(agentId) + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) throw new Error(j.error || "Request failed");
            return j;
          });
        })
        .then(function (j) {
          if (j.conversationId) store(storeKey, j.conversationId);
          typing.remove();
          add("bot", j.reply);
        })
        .catch(function (err) {
          typing.remove();
          add("err", err && err.message && /slow down/.test(err.message) ? err.message : "Sorry, I couldn't respond just now. Please try again.");
        })
        .finally(function () {
          busy = false;
          send.disabled = false;
          input.focus();
        });
    });
  }
})();
