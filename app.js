document.documentElement.classList.remove("no-js");

/* ---------- Mobile menu ---------- */
const burger = document.getElementById("burger");
const nav = document.getElementById("nav");
const setMenu = (open) => {
  burger.setAttribute("aria-expanded", String(open));
  burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  nav.classList.toggle("is-open", open);
};
burger.addEventListener("click", () => setMenu(burger.getAttribute("aria-expanded") !== "true"));
nav.addEventListener("click", (e) => e.target.closest("a") && setMenu(false));

/* ---------- Reveal on scroll ---------- */
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
  }), { threshold: 0.1 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
}

/* ---------- Live room status (studio time = New York) ---------- */
const BUSY = [ // [room, from, to] in 24h studio time, same every day for the demo
  ["Room A", 13, 18], ["Room B", 19, 23], ["Room C", 11, 13], ["Room C", 16, 17], ["Room A", 20, 24],
];
function nyHour() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
  return Number(p.find((x) => x.type === "hour").value) + Number(p.find((x) => x.type === "minute").value) / 60;
}
const fmtHour = (h) => { const hh = Math.floor(h) % 24; return `${((hh + 11) % 12) + 1} ${hh < 12 ? "am" : "pm"}`; };
function updateStatus() {
  const el = document.getElementById("status");
  const text = document.getElementById("statusText");
  const h = nyHour();
  const now = BUSY.find(([, a, b]) => h >= a && h < b);
  const open = h >= 10 || h < 2;
  if (now) {
    el.classList.remove("is-free");
    text.textContent = `${now[0]} · recording now · free from ${fmtHour(now[2])}`;
  } else {
    el.classList.add("is-free");
    text.textContent = open ? "Rooms free right now · walk-ins welcome" : "Closed · opens 10 am";
  }
}
updateStatus();
setInterval(updateStatus, 60_000);

/* ---------- Service photo follows the cursor (desktop) ---------- */
const preview = document.getElementById("servicePreview");
const previewImg = preview.querySelector("img");
document.querySelectorAll(".service").forEach((row) => {
  row.addEventListener("mouseenter", () => { previewImg.src = row.dataset.img; preview.classList.add("is-on"); });
  row.addEventListener("mouseleave", () => preview.classList.remove("is-on"));
  row.addEventListener("mousemove", (e) => { preview.style.left = `${e.clientX + 170}px`; preview.style.top = `${e.clientY}px`; });
});

/* ---------- Session builder ---------- */
const SERVICES = {
  recording: { name: "Recording", price: 65, unit: "hour", min: 2, max: 10, start: 3, slots: true,
    extras: [["senior", "Senior engineer", 20, "perUnit"], ["drummer", "Session drummer", 150, "flat"], ["rough", "Rough mix to take home", 40, "flat"]] },
  mixing: { name: "Mixing", price: 180, unit: "song", min: 1, max: 20, start: 1, slots: false, delivery: 5,
    extras: [["tune", "Vocal tuning", 40, "perUnit"], ["stems", "Stems export", 25, "perUnit"], ["rush", "Rush delivery (48 h)", 0.3, "percent"]] },
  mastering: { name: "Mastering", price: 60, unit: "track", min: 1, max: 20, start: 2, slots: false, delivery: 3,
    extras: [["vinyl", "Vinyl version", 30, "perUnit"], ["ddp", "DDP image for CD", 40, "flat"]] },
  podcast: { name: "Podcast", price: 50, unit: "hour", min: 1, max: 6, start: 1, slots: true,
    extras: [["video", "Video, 3 cameras", 40, "perUnit"], ["edit", "Edited episode", 60, "flat"]] },
};
const SLOT_TIMES = [10, 12, 14, 16, 18, 20, 22];
const state = { svc: "recording", qty: 3, extras: new Set(), day: null, slot: null };

const $ = (id) => document.getElementById(id);
const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// Deterministic "already booked" slots so the demo looks the same on every visit of the day.
const isBooked = (dayIdx, t) => ((dayIdx * 7 + t * 3) % 5 === 0) || (dayIdx === 0 && t <= nyHour() + 1);

function days() {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
}

function renderServices() {
  $("svc").innerHTML = Object.entries(SERVICES).map(([id, s]) =>
    `<button type="button" data-id="${id}" aria-pressed="${id === state.svc}">${s.name}<small>${money(s.price)} / ${s.unit}</small></button>`).join("");
}
$("svc").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.svc = b.dataset.id;
  state.qty = SERVICES[state.svc].start;
  state.extras.clear();
  state.slot = null;
  renderAll();
});

function renderQty() {
  const s = SERVICES[state.svc];
  $("qty").textContent = state.qty;
  $("qtyLabel").textContent = `2 · ${s.unit[0].toUpperCase() + s.unit.slice(1)}s`;
  $("qtyHint").textContent = s.unit === "hour" ? `min ${s.min} h · max ${s.max} h` : `${plural(state.qty, s.unit)}`;
  $("qtyMinus").disabled = state.qty <= s.min;
  $("qtyPlus").disabled = state.qty >= s.max;
}
$("qtyMinus").addEventListener("click", () => { state.qty = Math.max(SERVICES[state.svc].min, state.qty - 1); renderQty(); renderSummary(); });
$("qtyPlus").addEventListener("click", () => { state.qty = Math.min(SERVICES[state.svc].max, state.qty + 1); renderQty(); renderSummary(); });

function extraPrice([, , value, kind], base) {
  if (kind === "perUnit") return value * state.qty;
  if (kind === "percent") return base * value;
  return value;
}
function renderExtras() {
  const s = SERVICES[state.svc];
  $("extras").innerHTML = s.extras.map(([id, label, value, kind]) => {
    const tag = kind === "perUnit" ? `+${money(value)} / ${s.unit}` : kind === "percent" ? `+${value * 100}%` : `+${money(value)}`;
    return `<label><input type="checkbox" value="${id}" ${state.extras.has(id) ? "checked" : ""}> ${label}<span class="mono">${tag}</span></label>`;
  }).join("");
}
$("extras").addEventListener("change", (e) => {
  if (e.target.checked) state.extras.add(e.target.value); else state.extras.delete(e.target.value);
  renderSummary();
});

function renderDays() {
  $("days").innerHTML = days().map((d, i) => {
    const sel = state.day === i;
    const wd = i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });
    return `<button type="button" role="option" data-i="${i}" aria-selected="${sel}">${wd}<b>${d.getDate()}</b>${d.toLocaleDateString("en-US", { month: "short" })}</button>`;
  }).join("");
}
$("days").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.day = Number(b.dataset.i);
  state.slot = null;
  renderDays(); renderSlots(); renderSummary();
});

function renderSlots() {
  const s = SERVICES[state.svc];
  const box = $("slots");
  if (!s.slots) {
    box.innerHTML = `<p class="mono dim">No need to be here: send files any time, delivery in ${s.delivery} business days${state.extras.has("rush") ? " (48 h with rush)" : ""}.</p>`;
    return;
  }
  if (state.day === null) { box.innerHTML = `<p class="mono dim">Pick a day to see free start times.</p>`; return; }
  box.innerHTML = SLOT_TIMES.map((t) => {
    const booked = isBooked(state.day, t);
    return `<button type="button" role="option" data-t="${t}" ${booked ? "disabled" : ""} aria-selected="${state.slot === t}">${fmtHour(t)}${booked ? " · booked" : ""}</button>`;
  }).join("");
}
$("slots").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  state.slot = Number(b.dataset.t);
  renderSlots(); renderSummary();
});

function total() {
  const s = SERVICES[state.svc];
  const base = s.price * state.qty;
  const extras = s.extras.filter((x) => state.extras.has(x[0])).map((x) => [x[1], extraPrice(x, base)]);
  return { base, extras, sum: base + extras.reduce((a, [, v]) => a + v, 0) };
}

function renderSummary() {
  const s = SERVICES[state.svc];
  const t = total();
  const rows = [[`${s.name} · ${plural(state.qty, s.unit)}`, money(t.base)], ...t.extras.map(([l, v]) => [l, money(v)])];
  if (state.day !== null) {
    const d = days()[state.day];
    const when = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    rows.push([s.slots ? "When" : "Start", s.slots ? (state.slot !== null ? `${when}, ${fmtHour(state.slot)}–${fmtHour(state.slot + state.qty)}` : `${when}, pick a time`) : when]);
  }
  $("sumList").innerHTML = rows.map(([a, b]) => `<li><span>${a}</span><span>${b}</span></li>`).join("");
  $("sumTotal").textContent = money(t.sum);
}

function renderAll() { renderServices(); renderQty(); renderExtras(); renderDays(); renderSlots(); renderSummary(); }
renderAll();

/* ---------- Submit ---------- */
const form = $("builder");
const msg = $("formMsg");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = ""; msg.className = "form-msg";
  const s = SERVICES[state.svc];
  const problems = [];
  if (state.day === null) problems.push("pick a day");
  else if (s.slots && state.slot === null) problems.push("pick a start time");
  ["name", "email"].forEach((n) => {
    const input = form.elements[n];
    const ok = input.checkValidity();
    input.classList.toggle("has-error", !ok);
    if (!ok) problems.push(n === "email" ? "add a valid email" : "add your name");
  });
  const link = form.elements.link;
  if (link.value && !link.checkValidity()) { link.classList.add("has-error"); problems.push("check the link"); } else link.classList.remove("has-error");
  if (problems.length) {
    msg.textContent = `Almost there: ${problems.join(", ")}.`;
    msg.classList.add("is-error");
    return;
  }
  if (form.elements.company.value) return; // honeypot: silently drop bots

  const btn = $("bookBtn");
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    const endpoint = form.dataset.endpoint;
    const payload = { service: s.name, qty: state.qty, extras: [...state.extras], day: days()[state.day].toDateString(), start: state.slot, total: total().sum, name: form.elements.name.value, email: form.elements.email.value, link: link.value };
    if (endpoint) {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } else {
      await new Promise((r) => setTimeout(r, 700)); // demo mode
    }
    msg.textContent = `Request sent, ${payload.name.split(" ")[0]}. We'll confirm at ${payload.email} within 2 hours.`;
    msg.classList.add("is-ok");
    form.reset();
    state.extras.clear(); state.day = null; state.slot = null;
    renderAll();
  } catch {
    msg.textContent = "Something went wrong. Please call (718) 555-0199.";
    msg.classList.add("is-error");
  } finally {
    btn.disabled = false; btn.textContent = "Request this session";
  }
});
