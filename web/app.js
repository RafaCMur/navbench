const D = window.DATA;
const NAMES = ["A*", "RRT*"];
const COLORS = { "A*": "#ffd447", "RRT*": "#ff8a7a" };
const INK = "#f3f6fa";
const SHEET = "#21497a";
const FONT = "Barlow, 'Helvetica Neue', Arial, sans-serif";
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

const state = { scenario: 0, seed: 0, t: 0, playing: false, speed: 1, door: false, tree: false, all: false };

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
let view = null;

function doorMode() {
  return state.door && state.scenario === 0;
}

function runsNow() {
  const sc = D.scenarios[state.scenario];
  const out = {};
  for (const name of NAMES) {
    const r = sc.runs[name][state.seed];
    out[name] = { ok: r.ok, track: new Track(r.ok ? r.path : [sc.start, sc.start]), plan: r.time, tree: r.tree };
    if (doorMode()) {
      const d = D.door[name][state.seed];
      Object.assign(out[name], { first: new Track(d.first), track: new Track(d.driven), replan: d.replan, ok: d.arrived });
    }
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

function target(p, r) {
  const [cx, cy] = view.px(p);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.moveTo(cx - r - 4, cy);
  ctx.lineTo(cx + r + 4, cy);
  ctx.moveTo(cx, cy - r - 4);
  ctx.lineTo(cx, cy + r + 4);
  ctx.stroke();
}

function hatch(ring) {
  ctx.save();
  poly(ring, null, null);
  ctx.clip();
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const w = canvas.clientWidth + canvas.clientHeight;
  for (let k = -canvas.clientHeight; k < w; k += 7) {
    ctx.moveTo(k, 0);
    ctx.lineTo(k - canvas.clientHeight, canvas.clientHeight);
  }
  ctx.stroke();
  ctx.restore();
  poly(ring, null, INK, 1.5);
}

function scaleBar() {
  const x = 18;
  const y = canvas.clientHeight - 22;
  const m = view.s;
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, m / 2, 5);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, m - 1, 5);
  ctx.font = `13px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("0", x - 3, y - 6);
  ctx.textAlign = "center";
  ctx.fillText("1 m", x + m, y - 6);
}

function drawWorld() {
  const w = D.world;
  w.halls.forEach((r) => poly(r, "#244f83", "rgba(243,246,250,0.75)", 1));
  w.rooms.forEach((r) => poly(r, "#265387", INK, 2.5));
  w.furniture.forEach((r) => poly(r, "rgba(243,246,250,0.08)", "rgba(243,246,250,0.8)", 1));
  ctx.fillStyle = "#b8c8dc";
  ctx.font = `italic ${Math.round(Math.min(15, Math.max(11, view.s * 0.15)))}px ${FONT}`;
  ctx.textAlign = "center";
  for (const n of w.names) {
    const [x, y] = view.px([n.at[0], n.at[1] + 0.35]);
    ctx.fillText(n.name[0].toUpperCase() + n.name.slice(1), x, y);
  }
}

function drawRobot(p, color) {
  const [x, y] = view.px(p);
  const r = Math.max(7, ROBOT_RADIUS * view.s);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = SHEET;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function draw() {
  if (!view) return;
  const sc = D.scenarios[state.scenario];
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawWorld();
  scaleBar();
  const t = state.t;
  const shut = sc.closed || (doorMode() && t >= D.close_at);
  if (shut) {
    D.world.door.forEach(hatch);
    const ring = D.world.door[0];
    const xs = ring.map((p) => p[0]);
    const mid = (Math.min(...ring.map((p) => p[1])) + Math.max(...ring.map((p) => p[1]))) / 2;
    ctx.fillStyle = INK;
    ctx.font = `italic 15px ${FONT}`;
    const [x, y] = view.px([Math.max(...xs), mid]);
    ctx.textAlign = "left";
    // on narrow screens there is no room for the label, the hatching has to do
    if (x + 8 + ctx.measureText("Hallway").width < canvas.clientWidth - 4) {
      ctx.fillText("Hallway", x + 8, y - 2);
      ctx.fillText("closed", x + 8, y + 15);
    }
  }

  if (state.tree) {
    for (const [a, b] of runs["RRT*"].tree) line([a, b], COLORS["RRT*"], 1, 0.35);
  }
  if (state.all) {
    for (const name of NAMES) {
      const paths = doorMode() ? D.door[name].map((d) => d.driven) : sc.runs[name].filter((r) => r.ok).map((r) => r.path);
      for (const p of paths) line(p, COLORS[name], 1.5, name === "A*" ? 0.6 : 0.2);
    }
  }

  // planned route ahead is dashed, the part already driven is solid
  for (const name of NAMES) {
    const r = runs[name];
    if (doorMode() && t < D.close_at) {
      line(r.first.ahead(t), COLORS[name], 1.5, 0.9, [6, 5]);
      continue;
    }
    if (doorMode() && r.replan !== null) line(r.first.ahead(D.close_at), COLORS[name], 1.5, 0.45, [1, 5]);
    line(r.track.ahead(t), COLORS[name], 1.5, 0.9, [6, 5]);
  }
  for (const name of NAMES) line(runs[name].track.trail(t), COLORS[name], 3);

  const [sx, sy] = view.px(sc.start);
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, 2 * Math.PI);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  target(sc.goal, 8);

  for (const name of [...NAMES].reverse()) drawRobot(runs[name].track.position(t), COLORS[name]);
}

const robotsEl = document.getElementById("robots");
const resultEl = document.getElementById("result");
const scrub = document.getElementById("scrub");
const cards = {};
for (const name of NAMES) {
  const el = document.createElement("div");
  el.className = "row";
  el.innerHTML = `
    <div class="name"><span class="pen" style="border-color:${COLORS[name]}"></span>${name}</div>
    <div class="nums"></div>
    <div class="status"></div>`;
  robotsEl.appendChild(el);
  cards[name] = { nums: el.querySelector(".nums"), status: el.querySelector(".status") };
}

function updatePanel() {
  const t = state.t;
  for (const name of NAMES) {
    const r = runs[name];
    const c = cards[name];
    const tr = r.track;
    const total = doorMode() && t < D.close_at ? r.first.length : tr.length;
    c.nums.textContent = `${tr.dist(t).toFixed(1)} of ${total.toFixed(1)} m`;

    let status = `planned in ${Math.round(r.plan * 1000)} ms`;
    if (doorMode() && t >= D.close_at) {
      status = r.replan === null ? "not blocked, kept its route" : `replanned in ${Math.round(r.replan * 1000)} ms`;
    }
    if (!r.ok && !doorMode()) status = "found no path";
    else if (t >= tr.duration) status += r.ok ? `, arrived at ${tr.duration.toFixed(1)} s` : ", stuck";
    c.status.textContent = status;
  }

  const [a, b] = NAMES.map((n) => runs[n]);
  const done = t >= Math.max(a.track.duration, b.track.duration);
  let msg = "";
  if (done && a.ok && b.ok) {
    const gap = b.track.duration - a.track.duration;
    if (Math.abs(gap) < 0.05) msg = "A tie.";
    else msg = `${gap > 0 ? "A*" : "RRT*"} got there ${Math.abs(gap).toFixed(1)} s earlier.`;
  }
  resultEl.textContent = msg;
  scrub.value = Math.round((1000 * state.t) / endTime());
  document.getElementById("tb-route").textContent = D.scenarios[state.scenario].name + (doorMode() ? ", hallway closes" : "");
  document.getElementById("tb-seed").textContent = state.seed;
}

const playBtn = document.getElementById("play");
const seedInput = document.getElementById("seed");
const seedValue = document.getElementById("seed-value");
const scenarioSel = document.getElementById("scenario");

D.scenarios.forEach((s, i) => scenarioSel.add(new Option(s.name, i)));
seedInput.max = D.seeds.length - 1;
document.getElementById("n-seeds").textContent = D.seeds.length;

const doorBox = document.getElementById("door");
const treeBox = document.getElementById("tree");
const allBox = document.getElementById("all");

function reload() {
  runs = runsNow();
  state.t = Math.min(state.t, endTime());
  syncDoorBox();
  draw();
  updatePanel();
  saveHash();
}

function syncDoorBox() {
  doorBox.disabled = state.scenario !== 0;
  doorBox.parentElement.classList.toggle("off", doorBox.disabled);
}

function saveHash() {
  const h = `route=${state.scenario}&seed=${state.seed}&door=${+state.door}&tree=${+state.tree}&all=${+state.all}`;
  history.replaceState(null, "", "#" + h);
}

function loadHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const num = (k, d) => (p.has(k) ? +p.get(k) : d);
  state.scenario = Math.min(num("route", 0), D.scenarios.length - 1);
  state.seed = Math.min(num("seed", 0), D.seeds.length - 1);
  state.door = !!num("door", 0);
  state.tree = !!num("tree", 0);
  state.all = !!num("all", 0);
  state.t = num("t", 0);
  scenarioSel.value = state.scenario;
  seedInput.value = state.seed;
  seedValue.textContent = state.seed;
  doorBox.checked = state.door;
  treeBox.checked = state.tree;
  allBox.checked = state.all;
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
doorBox.onchange = () => {
  state.door = doorBox.checked;
  state.t = 0;
  reload();
};
treeBox.onchange = () => {
  state.tree = treeBox.checked;
  reload();
};
allBox.onchange = () => {
  state.all = allBox.checked;
  reload();
};
scrub.oninput = () => {
  state.t = (scrub.value / 1000) * endTime();
  setPlaying(false);
  draw();
  updatePanel();
};
document.querySelectorAll("[data-speed]").forEach((btn) => {
  btn.onclick = () => {
    state.speed = +btn.dataset.speed;
    document.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", b === btn));
  };
});
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "SELECT") return;
  if (e.key === " ") {
    e.preventDefault();
    playBtn.onclick();
  } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    seedInput.value = Math.max(0, Math.min(D.seeds.length - 1, state.seed + step));
    seedInput.oninput();
  }
});
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
    state.t += (state.speed * (now - last)) / 1000;
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

loadHash();
runs = runsNow();
state.t = Math.min(state.t, endTime());
syncDoorBox();
new ResizeObserver(resize).observe(canvas);
document.fonts.ready.then(draw);
updatePanel();
requestAnimationFrame(frame);
