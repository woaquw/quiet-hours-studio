/* "Raw vs mix" demo.
   A short loop is synthesized with the Web Audio API and played through two processing chains at once:
   RAW  = unbalanced levels, muddy chords, harsh hats, mono, no space.
   MIX  = EQ, balance, stereo, reverb, bus compression and limiting.
   Switching only crossfades the two outputs, so the music never stops or drifts. */
(() => {
  const root = document.querySelector(".ab");
  if (!root) return;
  const playBtn = document.getElementById("abPlay");
  const switchBtns = [...root.querySelectorAll(".ab__switch button")];
  const canvas = document.getElementById("abViz");
  const c2d = canvas.getContext("2d");

  const BPM = 92;
  const STEP = 60 / BPM / 4; // 16th note
  // A minor progression: Am – F – C – G, one bar each (MIDI notes)
  const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
  const BASS = [45, 41, 48, 43];
  const KICK = [0, 7, 10];
  const SNARE = [4, 12];

  let ctx, out, analyser, raw, mix, noiseBuf;
  let mode = "raw";
  let playing = false;
  let nextTime = 0;
  let step = 0;
  let timer = null;

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function setMode(m) {
    mode = m;
    root.classList.toggle("is-mix", m === "mix");
    switchBtns.forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", String(on));
    });
    if (!ctx) return;
    const t = ctx.currentTime;
    raw.out.gain.setTargetAtTime(m === "raw" ? 1 : 0, t, 0.015);
    mix.out.gain.setTargetAtTime(m === "mix" ? 1 : 0, t, 0.015);
  }

  /* ---------- Audio graph ---------- */
  function node(type, params = {}) {
    const n = ctx[`create${type}`]();
    for (const [k, v] of Object.entries(params)) {
      if (n[k] instanceof AudioParam) n[k].value = v;
      else n[k] = v;
    }
    return n;
  }
  const chain = (...nodes) => { nodes.reduce((a, b) => (a.connect(b), b)); return nodes[0]; };

  function impulse(seconds, decay) {
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function buildRaw() {
    const outGain = node("Gain", { gain: 1 });
    const bus = node("Gain", { gain: 0.55 });
    bus.connect(outGain);
    const mud = node("BiquadFilter", { type: "peaking", frequency: 300, Q: 0.9, gain: 7 });
    return {
      out: outGain,
      kick: chain(node("Gain", { gain: 0.55 }), bus),
      snare: chain(node("Gain", { gain: 0.45 }), bus),
      hat: chain(node("Gain", { gain: 0.6 }), bus), // too loud and unfiltered
      bass: chain(node("Gain", { gain: 1.0 }), bus), // fights the kick
      chords: chain(node("Gain", { gain: 0.75 }), mud, bus), // muddy low-mids
    };
  }

  function buildMix() {
    const outGain = node("Gain", { gain: 0 });
    const glue = node("DynamicsCompressor", { threshold: -20, knee: 6, ratio: 3, attack: 0.01, release: 0.2 });
    const makeup = node("Gain", { gain: 1.25 });
    const limiter = node("DynamicsCompressor", { threshold: -4, knee: 0, ratio: 20, attack: 0.002, release: 0.08 });
    chain(glue, makeup, limiter, outGain);

    const verb = node("Convolver");
    verb.buffer = impulse(1.8, 3);
    chain(verb, node("Gain", { gain: 0.32 }), glue);

    const send = (src, amount) => src.connect(chain(node("Gain", { gain: amount }), verb));

    const kick = chain(node("Gain", { gain: 0.95 }), node("BiquadFilter", { type: "peaking", frequency: 60, gain: 3 }), glue);
    const snareIn = node("Gain", { gain: 0.6 });
    chain(snareIn, node("BiquadFilter", { type: "peaking", frequency: 200, gain: 2 }), glue);
    send(snareIn, 0.5);
    const hat = chain(node("Gain", { gain: 0.22 }), node("BiquadFilter", { type: "lowpass", frequency: 9000 }), node("StereoPanner", { pan: 0.35 }), glue);
    const bass = chain(node("Gain", { gain: 0.5 }), node("BiquadFilter", { type: "highpass", frequency: 38 }),
      node("BiquadFilter", { type: "lowpass", frequency: 700 }), glue);

    // Chords: high-pass + mud cut + air, then split wide left/right with a tiny delay (Haas effect)
    const chords = node("Gain", { gain: 0.5 });
    const air = node("BiquadFilter", { type: "highshelf", frequency: 7000, gain: 4 });
    chain(chords,
      node("BiquadFilter", { type: "highpass", frequency: 160 }),
      node("BiquadFilter", { type: "peaking", frequency: 320, Q: 1, gain: -6 }),
      air);
    air.connect(chain(node("StereoPanner", { pan: -0.7 }), glue));
    air.connect(chain(node("Delay", { delayTime: 0.014 }), node("StereoPanner", { pan: 0.7 }), glue));
    send(air, 0.35);

    return { out: outGain, kick, snare: snareIn, hat, bass, chords };
  }

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    analyser = node("Analyser", { fftSize: 256, smoothingTimeConstant: 0.8 });
    out = node("Gain", { gain: 0.9 });
    chain(out, analyser, ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    raw = buildRaw();
    mix = buildMix();
    raw.out.connect(out);
    mix.out.connect(out);
    setMode(mode);
  }

  /* ---------- Instruments (each hit feeds both chains) ---------- */
  const targets = (name) => [raw[name], mix[name]];

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function kick(t) {
    const o = node("Oscillator", { type: "sine" });
    const g = node("Gain");
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    env(g, t, 0.003, 1, 0.35);
    o.connect(g);
    targets("kick").forEach((d) => g.connect(d));
    o.start(t); o.stop(t + 0.4);
  }

  function noise(t, dur, filterType, freq, peak, dest) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = node("BiquadFilter", { type: filterType, frequency: freq });
    const g = node("Gain");
    env(g, t, 0.002, peak, dur);
    chain(s, f, g);
    targets(dest).forEach((d) => g.connect(d));
    s.start(t); s.stop(t + dur + 0.05);
  }

  function snare(t) {
    noise(t, 0.18, "bandpass", 1900, 0.9, "snare");
    const o = node("Oscillator", { type: "triangle", frequency: 185 });
    const g = node("Gain");
    env(g, t, 0.002, 0.5, 0.1);
    o.connect(g);
    targets("snare").forEach((d) => g.connect(d));
    o.start(t); o.stop(t + 0.15);
  }

  const hat = (t, open) => noise(t, open ? 0.12 : 0.04, "highpass", 7500, open ? 0.35 : 0.28, "hat");

  function bass(t, midi, dur) {
    const o = node("Oscillator", { type: "sawtooth", frequency: hz(midi) });
    const lp = node("BiquadFilter", { type: "lowpass", frequency: 900, Q: 4 });
    const g = node("Gain");
    env(g, t, 0.01, 0.6, dur);
    chain(o, lp, g);
    targets("bass").forEach((d) => g.connect(d));
    o.start(t); o.stop(t + dur + 0.05);
  }

  function chord(t, notes, dur) {
    notes.forEach((m, i) => {
      [-6, 6].forEach((cents) => {
        const o = node("Oscillator", { type: "sawtooth", frequency: hz(m + 12) });
        o.detune.value = cents + i;
        const lp = node("BiquadFilter", { type: "lowpass", frequency: 2600 });
        const g = node("Gain");
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
        g.gain.setTargetAtTime(0.0001, t + dur * 0.8, 0.15);
        chain(o, lp, g);
        targets("chords").forEach((d) => g.connect(d));
        o.start(t); o.stop(t + dur + 0.6);
      });
    });
  }

  function schedule(s, t) {
    const bar = Math.floor(s / 16) % 4;
    const i = s % 16;
    if (KICK.includes(i)) kick(t);
    if (SNARE.includes(i)) snare(t);
    if (i % 2 === 0) hat(t, i === 14);
    if (i === 0 || i === 8) chord(t, CHORDS[bar], STEP * 8);
    if ([0, 3, 6, 8, 11, 14].includes(i)) bass(t, BASS[bar] + (i === 14 ? 12 : 0), STEP * 2);
  }

  function tick() {
    while (nextTime < ctx.currentTime + 0.12) {
      schedule(step, nextTime);
      nextTime += STEP;
      step = (step + 1) % 64;
    }
  }

  async function toggle() {
    if (!ctx) init();
    if (playing) {
      playing = false;
      clearInterval(timer);
      await ctx.suspend();
    } else {
      await ctx.resume();
      playing = true;
      nextTime = ctx.currentTime + 0.05;
      timer = setInterval(tick, 25);
      tick();
      draw();
    }
    root.classList.toggle("is-playing", playing);
    playBtn.setAttribute("aria-label", playing ? "Pause demo track" : "Play demo track");
  }

  /* ---------- Visualizer ---------- */
  const css = getComputedStyle(document.documentElement);
  const FG = css.getPropertyValue("--fg").trim() || "#ece8e1";
  const REC = css.getPropertyValue("--rec").trim() || "#ff3b1f";

  function draw() {
    const w = canvas.width = canvas.clientWidth * devicePixelRatio;
    const h = canvas.height = canvas.clientHeight * devicePixelRatio;
    c2d.clearRect(0, 0, w, h);
    const bars = 64;
    const gap = 3 * devicePixelRatio;
    const bw = (w - gap * (bars - 1)) / bars;
    const data = new Uint8Array(analyser ? analyser.frequencyBinCount : bars);
    if (analyser && playing) analyser.getByteFrequencyData(data);
    c2d.fillStyle = mode === "mix" ? REC : FG;
    for (let i = 0; i < bars; i++) {
      const v = data[Math.floor((i / bars) * data.length * 0.85)] / 255;
      const bh = Math.max(2 * devicePixelRatio, v * h * 0.92);
      c2d.globalAlpha = mode === "mix" ? 0.95 : 0.55;
      c2d.fillRect(i * (bw + gap), h - bh, bw, bh);
    }
    if (playing) requestAnimationFrame(draw);
  }

  /* ---------- UI ---------- */
  playBtn.addEventListener("click", toggle);
  switchBtns.forEach((b) => b.addEventListener("click", () => {
    setMode(b.dataset.mode);
    if (!playing) toggle();
  }));
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "m" || /input|textarea|select/i.test(document.activeElement?.tagName || "")) return;
    setMode(mode === "raw" ? "mix" : "raw");
  });
  // Pause when the player scrolls out of view to save CPU and battery.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => { if (!e.isIntersecting && playing) toggle(); }, { threshold: 0 }).observe(root);
  }
  window.addEventListener("resize", () => { if (!playing) draw(); });
  draw();
})();
