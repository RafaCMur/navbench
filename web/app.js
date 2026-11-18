const D = window.DATA;
const NAMES = ["A*", "RRT*"];
const COLORS = { "A*": "#4ea1ff", "RRT*": "#ff5c6c" };
const SPEED = 1.0; // m/s, same as the Python scripts
const HOLD = 1.0; // seconds to wait at the end before stopping
const ROBOT_RADIUS = 0.1;

class Track {
  constructor(xy) {
    this.xy = xy;
    this.cum = [0];
    for (let i = 1; i < xy.length; i++) {
      const dx = xy[i][0] - xy[i - 1][0];
      const dy = xy[i][1] - xy[i - 1][1];
      this.cum.push(this.cum[i - 1] + Math.hypot(dx, dy));
    }
    this.length = this.cum[this.cum.length - 1];
    this.duration = this.length / SPEED;
  }

  dist(t) {
    return Math.min(SPEED * t, this.length);
  }

  position(t) {
    const s = this.dist(t);
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const seg = this.cum[i] - this.cum[i - 1];
    const k = seg > 0 ? (s - this.cum[i - 1]) / seg : 0;
    const a = this.xy[i - 1];
    const b = this.xy[i];
    return [a[0] + k * (b[0] - a[0]), a[1] + k * (b[1] - a[1])];
  }

  trail(t) {
    const s = this.dist(t);
    const out = this.xy.filter((_, i) => this.cum[i] < s);
    out.push(this.position(t));
    return out;
  }

  ahead(t) {
    const s = this.dist(t);
    return [this.position(t), ...this.xy.filter((_, i) => this.cum[i] > s)];
  }
}

const state = { scenario: 0, seed: 0, t: 0, playing: false };

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
let view = null;

function runsNow() {
  const sc = D.scenarios[state.scenario];
  const out = {};
  for (const name of NAMES) {
    const r = sc.runs[name][state.seed];
    out[name] = { ok: r.ok, track: new Track(r.ok ? r.path : [sc.start, sc.start]), plan: r.time, tree: r.tree };
  }
  return out;
}

let runs = runsNow();

function endTime() {
  return Math.max(...NAMES.map((n) => runs[n].track.duration)) + HOLD;
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const all = [...D.world.rooms, ...D.world.halls].flat();
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const pad = 0.3;
  const minx = Math.min(...xs) - pad, maxx = Math.max(...xs) + pad;
  const miny = Math.min(...ys) - pad, maxy = Math.max(...ys) + pad;
  const s = Math.min(w / (maxx - minx), h / (maxy - miny));
  const ox = (w - s * (maxx - minx)) / 2;
  const oy = (h - s * (maxy - miny)) / 2;
  view = { s, px: (p) => [ox + (p[0] - minx) * s, oy + (maxy - p[1]) * s] };
  draw();
}

function poly(ring, fill, stroke, width = 1) {
  ctx.beginPath();
  ring.forEach((p, i) => {
    const [x, y] = view.px(p);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function line(pts, color, width, alpha = 1, dash = []) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = view.px(p);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function star(p, r, color) {
  const [cx, cy] = view.px(p);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawWorld() {
  const w = D.world;
  w.halls.forEach((r) => poly(r, "#1a1f2b", "#2c3344"));
  w.rooms.forEach((r) => poly(r, "#1d2230", "#3a4256", 1.5));
  w.furniture.forEach((r) => poly(r, "#3a3226", "#5a4c37"));
  ctx.fillStyle = "#4b5368";
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  for (const n of w.names) {
    const [x, y] = view.px(n.at);
    ctx.fillText(n.name.toUpperCase(), x, y);
  }
}

function drawRobot(p, color) {
  const [x, y] = view.px(p);
  const r = Math.max(7, ROBOT_RADIUS * view.s);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function draw() {
  if (!view) return;
  const sc = D.scenarios[state.scenario];
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawWorld();
  if (sc.closed) D.world.door.forEach((r) => poly(r, "#3a151a", "#7a2a33"));

  const t = state.t;
  for (const name of NAMES) {
    const tr = runs[name].track;
    line(tr.ahead(t), COLORS[name], 1.5, 0.35);
  }
  for (const name of NAMES) {
    const tr = runs[name].track;
    ctx.save();
    ctx.shadowColor = COLORS[name];
    ctx.shadowBlur = 8;
    line(tr.trail(t), COLORS[name], 3);
    ctx.restore();
  }

  const [sx, sy] = view.px(sc.start);
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "#3ddc97";
  ctx.fill();
  star(sc.goal, 11, "#ffd166");

  for (const name of NAMES) drawRobot(runs[name].track.position(t), COLORS[name]);
}

const robotsEl = document.getElementById("robots");
const cards = {};
for (const name of NAMES) {
  const el = document.createElement("div");
  el.className = "robot";
  el.innerHTML = `
    <div class="top"><span class="chip" style="background:${COLORS[name]}"></span>${name}<span class="status"></span></div>
    <div class="bar"><div class="fill" style="background:${COLORS[name]}"></div></div>
    <div class="nums"><span class="dist"></span><span class="plan"></span></div>`;
  robotsEl.appendChild(el);
  cards[name] = {
    status: el.querySelector(".status"),
    fill: el.querySelector(".fill"),
    dist: el.querySelector(".dist"),
    plan: el.querySelector(".plan"),
  };
}

function updatePanel() {
  const t = state.t;
  for (const name of NAMES) {
    const r = runs[name];
    const c = cards[name];
    const tr = r.track;
    c.dist.textContent = `${tr.dist(t).toFixed(1)} / ${tr.length.toFixed(1)} m`;
    c.plan.textContent = `planned in ${Math.round(r.plan * 1000)} ms`;
    c.fill.style.width = `${tr.length ? (100 * tr.dist(t)) / tr.length : 0}%`;
    let status = "ready";
    if (!r.ok) status = "no path";
    else if (t >= tr.duration) status = `arrived at ${tr.duration.toFixed(1)} s`;
    else if (t > 0) status = "driving";
    c.status.textContent = status;
    c.status.classList.toggle("done", r.ok && t >= tr.duration);
  }
}

const playBtn = document.getElementById("play");
const seedInput = document.getElementById("seed");
const seedValue = document.getElementById("seed-value");
const scenarioSel = document.getElementById("scenario");

D.scenarios.forEach((s, i) => scenarioSel.add(new Option(s.name, i)));
seedInput.max = D.seeds.length - 1;

function reload() {
  runs = runsNow();
  state.t = Math.min(state.t, endTime());
  draw();
  updatePanel();
}

function setPlaying(on) {
  state.playing = on;
  playBtn.textContent = on ? "Pause" : "Play";
}

playBtn.onclick = () => {
  if (state.t >= endTime()) state.t = 0;
  setPlaying(!state.playing);
};
document.getElementById("restart").onclick = () => {
  state.t = 0;
  setPlaying(true);
};
scenarioSel.onchange = () => {
  state.scenario = +scenarioSel.value;
  state.t = 0;
  reload();
};
seedInput.oninput = () => {
  state.seed = +seedInput.value;
  seedValue.textContent = state.seed;
  state.t = 0;
  reload();
};
document.getElementById("dice").onclick = () => {
  let s = state.seed;
  while (s === state.seed && D.seeds.length > 1) s = Math.floor(Math.random() * D.seeds.length);
  seedInput.value = s;
  seedInput.oninput();
  setPlaying(true);
};

let last = null;
function frame(now) {
  if (last !== null && state.playing) {
    state.t += (now - last) / 1000;
    if (state.t >= endTime()) {
      state.t = endTime();
      setPlaying(false);
    }
    draw();
    updatePanel();
  }
  last = now;
  requestAnimationFrame(frame);
}

new ResizeObserver(resize).observe(canvas);
updatePanel();
requestAnimationFrame(frame);
