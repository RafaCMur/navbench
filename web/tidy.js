const T = D.tidy;
const ACTION = 1.0; // seconds for each pick, place, open and close
const PLACES = { trash_top: "trash can", my_desk_desktop: "desk" };
const LABELS = {
  open: "Open the trash can",
  pick: "Pick up the soda",
  place: "Put the soda in",
  close: "Close the trash can",
};
const state = { seed: 0, t: 0, playing: false, speed: 1 };

const label = (s) => (s.do === "go" ? `Drive to the ${PLACES[s.to]}` : LABELS[s.do]);

function timeline(steps) {
  let t = 0;
  let at = D.live.home;
  return steps.map((s) => {
    const seg = { ...s, start: t, from: at };
    if (s.do === "go") {
      seg.track = new Track(s.path);
      t += seg.track.duration;
      at = s.path[s.path.length - 1];
    } else {
      t += ACTION;
    }
    seg.end = t;
    seg.at = at;
    return seg;
  });
}

function runsNow() {
  return {
    "A*": timeline(T.runs["A*"][0].steps),
    "RRT*": timeline(T.runs["RRT*"][state.seed].steps),
  };
}

let runs = runsNow();

function finish(tl) {
  return tl.length ? tl[tl.length - 1].end : 0;
}

function endTime() {
  return Math.max(...NAMES.map((n) => finish(runs[n]))) + HOLD;
}

// where the robot is, what it holds and whether the trash can is open at time t
function stateAt(tl, t) {
  const out = { pos: D.live.home, open: false, held: false, placed: null, current: null };
  for (const s of tl) {
    if (t < s.start) break;
    const done = t >= s.end;
    if (s.do === "go") out.pos = done ? s.at : s.track.position(t - s.start);
    if (!done) {
      out.current = s;
      break;
    }
    if (s.do === "open") out.open = true;
    if (s.do === "close") out.open = false;
    if (s.do === "pick") out.held = true;
    if (s.do === "place") {
      out.held = false;
      out.placed = s.ring;
    }
  }
  return out;
}

function boxes() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w > h) return [fit(0, 28, w / 2, h - 28), fit(w / 2, 28, w / 2, h - 28)];
  return [fit(0, 24, w, h / 2 - 24), fit(0, h / 2 + 24, w, h / 2 - 24)];
}

function drawHouse(name, tl, t) {
  const st = stateAt(tl, t);
  const color = COLORS[name];
  drawWorld();

  for (const o of T.objects) {
    if (o.name === "soda") continue;
    poly(o.ring, "rgba(243,246,250,0.3)", INK, 1);
  }
  if (st.placed) poly(st.placed, color, SHEET, 1);
  else if (!st.held) poly(T.objects.find((o) => o.name === "soda").ring, color, SHEET, 1);
  if (!st.open) {
    poly(T.trash, SHEET, null);
    hatch(T.trash);
  }

  ctx.fillStyle = INK;
  ctx.font = `italic ${Math.round(Math.min(14, Math.max(11, view.s * 0.15)))}px ${FONT}`;
  ctx.textAlign = "left";
  const right = (ring) => view.px([Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))]);
  const [tx, ty] = right(T.trash);
  ctx.fillText(st.open ? "trash can, open" : "trash can, closed", tx + 6, ty + 10);
  if (!st.held && !st.placed) {
    const [sx, sy] = right(T.objects.find((o) => o.name === "soda").ring);
    ctx.textAlign = "right";
    ctx.fillText("soda", sx - 14, sy + 4);
  }

  for (const s of tl) {
    if (s.do !== "go") continue;
    if (t >= s.end) line(s.path, color, 3);
    else if (t >= s.start) {
      line(s.track.ahead(t - s.start), color, 1.5, 0.9, [6, 5]);
      line(s.track.trail(t - s.start), color, 3);
    } else line(s.path, color, 1.5, 0.35, [6, 5]);
  }

  drawRobot(st.pos, color);
  if (st.held) {
    const [x, y] = view.px(st.pos);
    ctx.fillStyle = color;
    ctx.strokeStyle = SHEET;
    ctx.lineWidth = 2;
    ctx.fillRect(x + 6, y - 14, 9, 9);
    ctx.strokeRect(x + 6, y - 14, 9, 9);
  }

  const [lx, ly] = view.px([-3.2, 4.3]);
  ctx.fillStyle = color;
  ctx.font = `600 22px "Barlow Condensed", ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(name, lx, ly);
}

function draw() {
  if (!view) return;
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  const [a, b] = boxes();
  view = a;
  drawHouse("A*", runs["A*"], state.t);
  view = b;
  drawHouse("RRT*", runs["RRT*"], state.t);
  view = a;
  scaleBar();
}

const robotsEl = document.getElementById("robots");
const resultEl = document.getElementById("result");
const stepsEl = document.getElementById("steps");
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

const rows = runs["A*"].map((s) => {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${label(s)}</td><td></td><td></td>`;
  stepsEl.appendChild(tr);
  return tr;
});

function updatePanel() {
  const t = state.t;
  NAMES.forEach((name, col) => {
    const tl = runs[name];
    const st = stateAt(tl, t);
    const drives = tl.filter((s) => s.do === "go");
    const driven = drives.reduce((sum, s) => sum + (t >= s.start ? s.track.dist(t - s.start) : 0), 0);
    const total = drives.reduce((sum, s) => sum + s.track.length, 0);
    const planned = drives.reduce((sum, s) => sum + s.time, 0);
    cards[name].nums.textContent = `${driven.toFixed(1)} of ${total.toFixed(1)} m`;
    let status = `planned 3 drives in ${Math.round(planned * 1000)} ms`;
    if (st.current) status = label(st.current).toLowerCase();
    else if (t >= finish(tl)) status = `done after ${finish(tl).toFixed(1)} s`;
    cards[name].status.textContent = status;

    tl.forEach((s, i) => {
      const cell = rows[i].children[col + 1];
      cell.textContent = t >= s.end ? `${s.end.toFixed(1)} s` : s === st.current ? "now" : "";
      cell.classList.toggle("now", s === st.current);
    });
  });

  const [a, b] = NAMES.map((n) => finish(runs[n]));
  let msg = "";
  if (t >= Math.max(a, b)) {
    const gap = b - a;
    msg = Math.abs(gap) < 0.05 ? "A tie." : `${gap > 0 ? "A*" : "RRT*"} finished ${Math.abs(gap).toFixed(1)} s earlier.`;
  }
  resultEl.textContent = msg;
  scrub.value = Math.round((1000 * t) / endTime());
  document.getElementById("tb-seed").textContent = state.seed;
}

const playBtn = document.getElementById("play");
const seedInput = document.getElementById("seed");
const seedValue = document.getElementById("seed-value");
seedInput.max = T.runs["RRT*"].length - 1;
document.getElementById("made").textContent = D.made;

function setPlaying(on) {
  state.playing = on;
  playBtn.textContent = on ? "Pause" : "Play";
}

function setSeed(seed) {
  state.seed = seed;
  seedInput.value = seed;
  seedValue.textContent = seed;
  runs = runsNow();
  state.t = 0;
  draw();
  updatePanel();
}

playBtn.onclick = () => {
  if (state.t >= endTime()) state.t = 0;
  setPlaying(!state.playing);
};
document.getElementById("restart").onclick = () => {
  state.t = 0;
  setPlaying(true);
};
seedInput.oninput = () => setSeed(+seedInput.value);
document.getElementById("dice").onclick = () => {
  const n = T.runs["RRT*"].length;
  let s = state.seed;
  while (s === state.seed && n > 1) s = Math.floor(Math.random() * n);
  setSeed(s);
  setPlaying(true);
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
  if (e.key === " " && e.target.tagName !== "BUTTON") {
    e.preventDefault();
    playBtn.onclick();
  } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    setSeed(Math.max(0, Math.min(T.runs["RRT*"].length - 1, state.seed + step)));
  }
});

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

const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has("seed")) setSeed(Math.min(+hash.get("seed"), T.runs["RRT*"].length - 1));
state.t = Math.min(+hash.get("t") || 0, endTime());
new ResizeObserver(resize).observe(canvas);
document.fonts.ready.then(draw);
updatePanel();
requestAnimationFrame(frame);
