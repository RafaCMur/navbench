const L = D.live;
const live = { t: 0, playing: false, speed: 1, closed: false, seed: 0, place: null, search: false, tree: false };
let robots = {};

function standStill(p) {
  return { track: new Track([p, p]), legStart: p, plan: null, replan: null, dropped: null, ok: true };
}

function resetRobots() {
  for (const name of NAMES) robots[name] = standStill(L.home);
  live.t = 0;
  live.place = null;
}

function freeSpace(name) {
  return L.free[name][live.closed ? "closed" : "open"];
}

function planFrom(name, from, to) {
  const t0 = performance.now();
  const res = name === "A*" ? astar(freeSpace(name), L.bounds, from, to) : rrtStar(freeSpace(name), L.bounds, from, to, live.seed, { radius: L.radius });
  return { ...res, ms: performance.now() - t0 };
}

function arrived() {
  return NAMES.every((n) => live.t >= robots[n].track.duration);
}

// Plan from where each robot is now. A robot that is still driving keeps the
// part it has driven, so its trail does not jump.
function goTo(place) {
  const fresh = arrived();
  const t = live.t;
  for (const name of NAMES) {
    const r = robots[name];
    const from = r.track.position(t);
    const p = planFrom(name, from, place.at);
    const before = fresh ? [from] : r.track.trail(t);
    const route = p.path ? p.path.slice(1) : [from];
    robots[name] = {
      track: new Track([...before, ...route]),
      legStart: fresh ? from : r.legStart,
      plan: p,
      replan: null,
      dropped: null,
      ok: !!p.path,
    };
  }
  if (fresh) live.t = 0;
  live.place = place;
  setPlaying(true);
  update();
}

function blocked(path) {
  const free = L.free["RRT*"].closed;
  for (let i = 1; i < path.length; i++) {
    if (!connectable(free, path[i - 1], path[i], 0.025)) return true;
  }
  return false;
}

function toggleDoor() {
  const t = live.t;
  if (!live.closed) {
    const inside = NAMES.some((n) => !isFree(L.free["RRT*"].closed, ...robots[n].track.position(t)));
    if (inside) {
      note("A robot is in the short hallway. Close it once both are out.");
      return;
    }
  }
  live.closed = !live.closed;
  doorBtn.textContent = live.closed ? "Open the short hallway" : "Close the short hallway";
  note("");
  if (live.closed && live.place) {
    for (const name of NAMES) {
      const r = robots[name];
      const ahead = r.track.ahead(t);
      if (t >= r.track.duration || !blocked(ahead)) continue;
      const from = r.track.position(t);
      const p = planFrom(name, from, live.place.at);
      const route = p.path ? p.path.slice(1) : [from];
      Object.assign(r, { track: new Track([...r.track.trail(t), ...route]), replan: p, dropped: ahead, ok: !!p.path });
    }
  }
  update();
}

function again() {
  if (!live.place) return;
  live.seed = Math.floor(Math.random() * 1000);
  for (const name of NAMES) robots[name] = standStill(robots[name].legStart);
  live.t = 0;
  goTo(live.place);
}

function endTime() {
  return Math.max(...NAMES.map((n) => robots[n].track.duration)) + HOLD;
}

function draw() {
  if (!view) return;
  const t = live.t;
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawWorld();
  scaleBar();
  if (live.closed) drawClosedDoor();

  const a = robots["A*"];
  const last = (r) => r.replan || r.plan;
  if (live.search && last(a)) {
    ctx.fillStyle = COLORS["A*"];
    ctx.globalAlpha = 0.3;
    const s = Math.max(1.5, 0.025 * view.s);
    for (const p of last(a).expanded) {
      const [x, y] = view.px(p);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  const r = robots["RRT*"];
  if (live.tree && last(r)) {
    for (const [p, q] of last(r).edges) line([p, q], COLORS["RRT*"], 1, 0.35);
  }

  for (const name of NAMES) {
    const rb = robots[name];
    if (rb.dropped) line(rb.dropped, COLORS[name], 1.5, 0.45, [1, 5]);
    line(rb.track.ahead(t), COLORS[name], 1.5, 0.9, [6, 5]);
  }
  for (const name of NAMES) line(robots[name].track.trail(t), COLORS[name], 3);

  if (live.place) {
    startMark(robots["A*"].legStart);
    target(live.place.at, 8);
  }
  for (const name of [...NAMES].reverse()) drawRobot(robots[name].track.position(t), COLORS[name]);
}

const robotsEl = document.getElementById("robots");
const resultEl = document.getElementById("result");
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

function describe(name, p) {
  const ms = p.ms < 10 ? p.ms.toFixed(1) : Math.round(p.ms);
  const work = name === "A*" ? `${p.expanded.length} cells searched` : `${p.edges.length} branches`;
  return `${ms} ms, ${work}`;
}

function updatePanel() {
  const t = live.t;
  for (const name of NAMES) {
    const r = robots[name];
    const c = cards[name];
    const tr = r.track;
    c.nums.textContent = `${tr.dist(t).toFixed(1)} of ${tr.length.toFixed(1)} m`;
    let status = "waiting";
    if (r.plan) status = `planned in ${describe(name, r.plan)}`;
    if (r.replan) status = `replanned in ${describe(name, r.replan)}`;
    if (!r.ok) status += ", found no path";
    else if (r.plan && t >= tr.duration) status += `, arrived after ${tr.duration.toFixed(1)} s`;
    c.status.textContent = status;
  }

  const [a, b] = NAMES.map((n) => robots[n]);
  let msg = "";
  if (live.place && arrived() && a.ok && b.ok) {
    const gap = b.track.duration - a.track.duration;
    if (Math.abs(gap) < 0.05) msg = "A tie.";
    else msg = `${gap > 0 ? "A*" : "RRT*"} got there ${Math.abs(gap).toFixed(1)} s earlier.`;
  }
  if (!live.place) msg = "Pick a place to drive to.";
  resultEl.textContent = msg;
  seedValue.textContent = live.seed;
  document.getElementById("tb-goal").textContent = live.place ? title(live.place.name) : "nowhere yet";
}

function update() {
  draw();
  updatePanel();
}

const title = (s) => s[0].toUpperCase() + s.slice(1);
const playBtn = document.getElementById("play");
const doorBtn = document.getElementById("hall");
const seedValue = document.getElementById("seed-value");
const noteEl = document.getElementById("note");

function note(text) {
  noteEl.textContent = text || "Space plays or pauses.";
}

function setPlaying(on) {
  live.playing = on;
  playBtn.textContent = on ? "Pause" : "Play";
}

const placesEl = document.getElementById("places");
for (const place of L.places) {
  const btn = document.createElement("button");
  btn.textContent = title(place.name);
  btn.onclick = () => goTo(place);
  placesEl.appendChild(btn);
}

playBtn.onclick = () => setPlaying(!live.playing && !arrived());
document.getElementById("reset").onclick = () => {
  resetRobots();
  if (live.closed) toggleDoor();
  setPlaying(false);
  note("");
  update();
};
doorBtn.onclick = toggleDoor;
document.getElementById("again").onclick = again;
document.getElementById("search").onchange = (e) => {
  live.search = e.target.checked;
  draw();
};
document.getElementById("tree").onchange = (e) => {
  live.tree = e.target.checked;
  draw();
};
document.querySelectorAll("[data-speed]").forEach((btn) => {
  btn.onclick = () => {
    live.speed = +btn.dataset.speed;
    document.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", b === btn));
  };
});
document.addEventListener("keydown", (e) => {
  if (e.key === " " && e.target.tagName !== "BUTTON") {
    e.preventDefault();
    playBtn.onclick();
  }
});

let last = null;
function frame(now) {
  if (last !== null && live.playing) {
    live.t += (live.speed * (now - last)) / 1000;
    if (live.t >= endTime()) {
      live.t = endTime();
      setPlaying(false);
    }
    update();
  }
  last = now;
  requestAnimationFrame(frame);
}

resetRobots();
setPlaying(false);
new ResizeObserver(resize).observe(canvas);
document.fonts.ready.then(draw);
updatePanel();
requestAnimationFrame(frame);
