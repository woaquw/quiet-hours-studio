/* Reusable AI chat widget. Configure with window.CHAT_CONFIG before this script loads:
   { endpoint, bot, title, subtitle, avatar, greeting, suggestions[], fallback, cta: { text, href, match } }
   The endpoint is a Cloudflare Worker that keeps the knowledge base and runs the model. */
(() => {
  const cfg = Object.assign({
    title: "Assistant", subtitle: "AI", avatar: "AI", greeting: "Hi! How can I help?",
    suggestions: [], fallback: "Sorry, I can't answer right now.", cta: null,
  }, window.CHAT_CONFIG || {});
  if (!cfg.endpoint) return;

  const history = [];
  let busy = false;

  const root = document.createElement("div");
  root.className = "chat";
  root.innerHTML = `
    <button class="chat__launcher" aria-label="Open chat: ${cfg.title}" aria-expanded="false">
      <span class="chat__pulse"></span><span class="chat__label">${cfg.title}</span>
    </button>
    <section class="chat__panel" role="dialog" aria-label="${cfg.title}" hidden>
      <header class="chat__head">
        <span class="chat__avatar" aria-hidden="true">${cfg.avatar}</span>
        <div><strong>${cfg.title}</strong><small>${cfg.subtitle}</small></div>
        <button class="chat__close" aria-label="Close chat">×</button>
      </header>
      <div class="chat__log" aria-live="polite"></div>
      <div class="chat__chips"></div>
      <form class="chat__form">
        <input class="chat__input" autocomplete="off" maxlength="500" placeholder="Type a question…" aria-label="Your message">
        <button class="chat__send" aria-label="Send">→</button>
      </form>
      <p class="chat__note">AI can make mistakes. Prices are confirmed on booking.</p>
    </section>`;
  document.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const launcher = $(".chat__launcher"), panel = $(".chat__panel"), log = $(".chat__log"),
    chips = $(".chat__chips"), form = $(".chat__form"), input = $(".chat__input");

  function open(state) {
    panel.hidden = !state;
    launcher.setAttribute("aria-expanded", String(state));
    root.classList.toggle("is-open", state);
    if (state) {
      if (!log.children.length) bubble("assistant", cfg.greeting);
      setTimeout(() => input.focus(), 50);
    }
  }
  launcher.addEventListener("click", () => open(panel.hidden));
  $(".chat__close").addEventListener("click", () => open(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) open(false); });

  cfg.suggestions.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s;
    b.addEventListener("click", () => send(s));
    chips.appendChild(b);
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });

  function bubble(role, text) {
    const el = document.createElement("div");
    el.className = `chat__msg chat__msg--${role}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function addCta(el, text) {
    if (!cfg.cta || !new RegExp(cfg.cta.match, "i").test(text)) return;
    const a = document.createElement("a");
    a.href = cfg.cta.href;
    a.className = "chat__cta";
    a.textContent = cfg.cta.text;
    a.addEventListener("click", () => window.innerWidth < 640 && open(false));
    el.appendChild(a);
  }

  async function send(raw) {
    const text = raw.trim();
    if (!text || busy) return;
    busy = true;
    input.value = "";
    chips.hidden = true;
    bubble("user", text);
    history.push({ role: "user", content: text });
    const reply = bubble("assistant", "");
    reply.classList.add("is-typing");
    reply.innerHTML = "<span></span><span></span><span></span>";

    let answer = "";
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot: cfg.bot, messages: history.slice(-12) }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const raw = JSON.parse(data).response;
            // Numbers can arrive as JSON numbers (0 included), so check for null, not truthiness.
            const token = raw == null ? "" : String(raw);
            if (token) {
              if (!answer) { reply.classList.remove("is-typing"); reply.textContent = ""; }
              answer += token;
              reply.textContent = answer;
              log.scrollTop = log.scrollHeight;
            }
          } catch { /* incomplete line */ }
        }
      }
      answer = answer.trim();
      if (!answer) throw new Error("Empty answer");
      reply.classList.remove("is-typing");
      reply.textContent = answer;
      addCta(reply, answer);
      history.push({ role: "assistant", content: answer });
    } catch (err) {
      console.warn("Chat error:", err);
      reply.classList.remove("is-typing");
      reply.classList.add("is-error");
      reply.textContent = cfg.fallback;
      history.pop();
    } finally {
      busy = false;
      log.scrollTop = log.scrollHeight;
      input.focus();
    }
  }
})();
