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

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
let view = null;

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

function startMark(p) {
  const [x, y] = view.px(p);
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, 2 * Math.PI);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawClosedDoor() {
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
