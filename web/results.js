function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sd(xs) {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function stats(runs) {
  const ok = runs.filter((r) => r.ok);
  const lengths = ok.map((r) => r.length);
  return {
    lengths,
    success: ok.length / runs.length,
    mean: lengths.length ? mean(lengths) : NaN,
    sd: lengths.length ? sd(lengths) : NaN,
    min: Math.min(...lengths),
    max: Math.max(...lengths),
    time: median(runs.map((r) => r.time)),
  };
}

// one dot per RRT* run on a shared length axis, with A* as a line
function strip(a, r, lo, hi) {
  const w = 220, h = 26;
  const x = (v) => 6 + ((v - lo) / (hi - lo)) * (w - 12);
  const dots = r.lengths
    .map((v, i) => `<circle cx="${x(v).toFixed(1)}" cy="${(8 + (i % 3) * 5).toFixed(1)}" r="2.6" fill="var(--rrt)" opacity="0.75"/>`)
    .join("");
  const ax = x(a.mean).toFixed(1);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line x1="6" x2="${w - 6}" y1="${h - 3}" y2="${h - 3}" stroke="var(--rule)"/>${dots}<line x1="${ax}" x2="${ax}" y1="2" y2="${h - 2}" stroke="var(--astar)" stroke-width="2"/></svg>`;
}

const tbody = document.getElementById("results");
const all = D.scenarios.map((s) => ({ a: stats(s.runs["A*"]), r: stats(s.runs["RRT*"]) }));
const lo = Math.floor(Math.min(...all.map((x) => Math.min(x.a.min, x.r.min))));
const hi = Math.ceil(Math.max(...all.map((x) => Math.max(x.a.max, x.r.max))));

D.scenarios.forEach((s, i) => {
  const { a, r } = all[i];
  const tr = document.createElement("tr");
  const fail = r.success < 1 ? ` <span class="dim">(${Math.round(r.success * 100)}% found a path)</span>` : "";
  tr.innerHTML = `
    <td>${s.name}</td>
    <td>${a.mean.toFixed(2)}</td>
    <td>${r.mean.toFixed(2)} ± ${r.sd.toFixed(2)}${fail}</td>
    <td>${r.min.toFixed(2)} / ${r.max.toFixed(2)}</td>
    <td>${strip(a, r, lo, hi)}</td>
    <td>${Math.round(a.time * 1000)} / ${Math.round(r.time * 1000)}</td>`;
  tr.onclick = () => {
    scenarioSel.value = i;
    scenarioSel.onchange();
    setPlaying(true);
    document.querySelector(".viewer").scrollIntoView({ behavior: "smooth" });
  };
  tbody.appendChild(tr);
});

const doorText = NAMES.map((name) => {
  const runs = D.door[name];
  const replanned = runs.filter((r) => r.replan !== null);
  const driven = mean(runs.map((r) => new Track(r.driven).length));
  let t = `${name} had to replan in ${replanned.length} of ${runs.length} runs`;
  if (replanned.length) t += ` (median ${Math.round(median(replanned.map((r) => r.replan)) * 1000)} ms)`;
  return `${t} and drove ${driven.toFixed(2)} m on average`;
});
document.getElementById("door-summary").textContent =
  `With the short hallway closing after ${D.close_at} s: ${doorText.join("; ")}.`;

const kb = all[0];
document.getElementById("f-short").textContent = D.scenarios[0].runs["RRT*"].filter((r) => r.via_door).length;
document.getElementById("f-rrt-best").textContent = all[2].r.min.toFixed(2);
document.getElementById("f-astar-bb").textContent = all[2].a.mean.toFixed(2);
document.getElementById("made").textContent = D.made;
document.querySelectorAll(".n-seeds").forEach((el) => (el.textContent = D.seeds.length));
