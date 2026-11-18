const state = { scenario: 0, seed: 0, t: 0, playing: false, speed: 1, door: false, tree: false, all: false };

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

function draw() {
  if (!view) return;
  const sc = D.scenarios[state.scenario];
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawWorld();
  scaleBar();
  const t = state.t;
  const shut = sc.closed || (doorMode() && t >= D.close_at);
  if (shut) drawClosedDoor();

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

  startMark(sc.start);
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
      status = r.replan === null ? "route not blocked" : `replanned in ${Math.round(r.replan * 1000)} ms`;
    }
    if (!r.ok && !doorMode()) status = "no path found";
    else if (t >= tr.duration) status += r.ok ? `, arrived at ${tr.duration.toFixed(1)} s` : ", stuck";
    c.status.textContent = status;
  }

  const [a, b] = NAMES.map((n) => runs[n]);
  const done = t >= Math.max(a.track.duration, b.track.duration);
  let msg = "";
  if (done && a.ok && b.ok) {
    const gap = b.track.duration - a.track.duration;
    if (Math.abs(gap) < 0.05) msg = "A tie.";
    else msg = `${gap > 0 ? "A*" : "RRT*"} arrived ${Math.abs(gap).toFixed(1)} s earlier.`;
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
