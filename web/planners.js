// A* and RRT* written again in JavaScript, following the PyRoboSim planners step by step,
// so the live page can plan in the browser.

// Mersenne Twister, the generator behind np.random.seed and np.random.random,
// so the same seed gives the same RRT* samples as in Python.
class Random {
  constructor(seed) {
    this.mt = new Uint32Array(624);
    this.i = 624;
    this.mt[0] = seed >>> 0;
    for (let i = 1; i < 624; i++) {
      const p = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
      this.mt[i] = (Math.imul(1812433253, p) + i) >>> 0;
    }
  }

  next() {
    const mt = this.mt;
    if (this.i >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff);
        mt[k] = mt[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.i = 0;
    }
    let y = mt[this.i++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random() {
    const a = this.next() >>> 5;
    const b = this.next() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }
}

function onSegment(x, y, a, b) {
  if (x < Math.min(a[0], b[0]) || x > Math.max(a[0], b[0]) || y < Math.min(a[1], b[1]) || y > Math.max(a[1], b[1])) return false;
  return (b[0] - a[0]) * (y - a[1]) === (b[1] - a[1]) * (x - a[0]);
}

// even-odd rule, and points on an edge count as inside, like shapely's intersects
function inRings(rings, x, y) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (onSegment(x, y, a, b)) return true;
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}

function isFree(free, x, y) {
  return free.some((rings) => inRings(rings, x, y));
}

// same test as PyRoboSim's is_connectable: points every step along the line,
// not counting the first one
function connectable(free, a, b, step, maxDist) {
  const d = dist(a, b);
  if (maxDist && d > maxDist) return false;
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let k = 1; k * step < d; k++) {
    if (!isFree(free, a[0] + k * step * c, a[1] + k * step * s)) return false;
  }
  return true;
}

class Grid {
  constructor(free, bounds, resolution) {
    const [[x0, x1], [y0, y1]] = bounds;
    const px = (x1 - x0) * 0.05;
    const py = (y1 - y0) * 0.05;
    this.res = resolution;
    this.ox = x0 - px;
    this.oy = y0 - py;
    this.nx = Math.ceil((x1 + px + resolution - this.ox) / resolution);
    this.ny = Math.ceil((y1 + py + resolution - this.oy) / resolution);
    this.occupied = new Uint8Array(this.nx * this.ny);
    for (let i = 0; i < this.nx; i++) {
      for (let j = 0; j < this.ny; j++) {
        const [x, y] = this.toWorld(i, j);
        this.occupied[i * this.ny + j] = isFree(free, x, y) ? 0 : 1;
      }
    }
  }

  toCell(p) {
    return [Math.floor((p[0] - this.ox) / this.res), Math.floor((p[1] - this.oy) / this.res)];
  }

  // numpy's arange steps by (start + step) - start, which is not exactly step
  toWorld(i, j) {
    return [this.ox + i * (this.ox + this.res - this.ox), this.oy + j * (this.oy + this.res - this.oy)];
  }

  isOccupied(i, j) {
    return i < 0 || j < 0 || i >= this.nx || j >= this.ny || this.occupied[i * this.ny + j] === 1;
  }
}

// Python's heapq, step for step. The astar package keeps its open set in one,
// and when two cells tie, the order they come out decides which of the equally
// short grid routes A* returns.
class Heap {
  constructor() {
    this.items = [];
  }

  push(node) {
    this.items.push(node);
    this.down(0, this.items.length - 1);
  }

  pop() {
    const a = this.items;
    const last = a.pop();
    if (!a.length) return last;
    const top = a[0];
    a[0] = last;
    this.up(0);
    return top;
  }

  remove(node) {
    const a = this.items;
    const i = a.indexOf(node);
    const last = a.pop();
    if (i < a.length) {
      a[i] = last;
      this.up(i);
      this.down(0, i);
    }
  }

  down(start, i) {
    const a = this.items;
    const item = a[i];
    while (i > start) {
      const p = (i - 1) >> 1;
      if (!(item.f < a[p].f)) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = item;
  }

  up(i) {
    const a = this.items;
    const start = i;
    const item = a[i];
    let c = 2 * i + 1;
    while (c < a.length) {
      if (c + 1 < a.length && !(a[c].f < a[c + 1].f)) c++;
      a[i] = a[c];
      i = c;
      c = 2 * i + 1;
    }
    a[i] = item;
    this.down(start, i);
  }

  get size() {
    return this.items.length;
  }
}

const dist = (a, b) => Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);

// left, right, up, down, then the diagonals, in the order PyRoboSim tries them
const MOVES = [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [-1, -1], [1, 1], [1, -1]];

// Returns { path, expanded } where expanded lists the cells A* looked at, for drawing.
function astar(free, bounds, start, goal, resolution = 0.05) {
  const grid = new Grid(free, bounds, resolution);
  const s = grid.toCell(start);
  const g = grid.toCell(goal);
  const nodes = new Map();
  const node = (c) => {
    const k = c[0] * grid.ny + c[1];
    if (!nodes.has(k)) nodes.set(k, { cell: c, g: Infinity, f: Infinity, closed: false, open: false, from: null });
    return nodes.get(k);
  };
  const toPath = (cells) => {
    const path = cells.map((c) => grid.toWorld(c[0], c[1]));
    path[0] = start;
    path[path.length - 1] = goal;
    return path;
  };
  const expanded = [];
  if (s[0] === g[0] && s[1] === g[1]) return { path: toPath([s]), expanded };

  const open = new Heap();
  const first = node(s);
  first.g = 0;
  first.f = dist(s, g);
  first.open = true;
  open.push(first);

  while (open.size) {
    const cur = open.pop();
    cur.open = false;
    expanded.push(grid.toWorld(cur.cell[0], cur.cell[1]));
    if (cur.cell[0] === g[0] && cur.cell[1] === g[1]) {
      const cells = [];
      for (let n = cur; n; n = n.from) cells.unshift(n.cell);
      return { path: toPath(cells), expanded };
    }
    cur.closed = true;
    for (const [di, dj] of MOVES) {
      const c = [cur.cell[0] + di, cur.cell[1] + dj];
      if (grid.isOccupied(c[0], c[1])) continue;
      const n = node(c);
      if (n.closed) continue;
      const gs = cur.g + dist(cur.cell, c);
      if (gs >= n.g) continue;
      const fs = gs + dist(c, g);
      if (n.open) {
        if (n.f < fs) continue;
        open.remove(n);
      }
      n.from = cur;
      n.g = gs;
      n.f = fs;
      n.open = true;
      open.push(n);
    }
  }
  return { path: null, expanded };
}

const RRT_DEFAULTS = {
  maxConnectionDist: 0.5,
  rewireRadius: 1.5,
  step: 0.025,
  maxNodes: 1000,
  maxTime: 2.0,
  radius: 0.1,
};

// Bidirectional RRT*, as PyRoboSim's RRTPlanner with bidirectional=True and rrt_star=True.
// Returns { path, edges } where edges are the branches of both trees.
function rrtStar(free, bounds, start, goal, seed, options = {}) {
  const o = { ...RRT_DEFAULTS, ...options };
  const rng = new Random(seed);
  const t0 = performance.now();
  const link = (a, b) => connectable(free, a, b, o.step, o.maxConnectionDist);

  const startTree = { nodes: [{ at: start, parent: null, cost: 0 }] };
  const goalTree = { nodes: [{ at: goal, parent: null, cost: 0 }] };
  const edges = () => [startTree, goalTree].flatMap((t) => t.nodes.filter((n) => n.parent && !n.copy).map((n) => [n.parent.at, n.at]));

  if (link(start, goal)) return { path: [start, goal], edges: [] };

  function sample() {
    const [[x0, x1], [y0, y1]] = bounds;
    const r = o.radius;
    for (let tries = 0; tries < 1000; tries++) {
      const x = (x1 - x0 - 2 * r) * rng.random() + x0 + r;
      const y = (y1 - y0 - 2 * r) * rng.random() + y0 + r;
      rng.random(); // PyRoboSim also draws a yaw here
      if (isFree(free, x, y)) return [x, y];
    }
    return null;
  }

  function nearest(tree, p) {
    let best = null;
    let bestDist = Infinity;
    for (const n of tree.nodes) {
      const d = dist(p, n.at);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }

  // as in PyRoboSim, the cost adds the distance to the sample, not the step taken
  function extend(from, p) {
    const d = dist(from.at, p);
    let at = p;
    if (d > o.maxConnectionDist) {
      const a = Math.atan2(p[1] - from.at[1], p[0] - from.at[0]);
      at = [from.at[0] + o.maxConnectionDist * Math.cos(a), from.at[1] + o.maxConnectionDist * Math.sin(a)];
    }
    return { at, parent: from, cost: from.cost + d };
  }

  function rewire(tree, node) {
    let best = null;
    for (const n of tree.nodes) {
      const d = dist(n.at, node.at);
      if (n !== node && d <= o.rewireRadius && n.cost + d < node.cost && link(n.at, node.at)) {
        best = n;
        node.cost = n.cost + d;
      }
    }
    if (best) node.parent = best;
  }

  // the target node is copied into this tree, so both trees end at the same point
  function connect(tree, from, target) {
    if (dist(from.at, target.at) < o.maxConnectionDist && link(from.at, target.at)) {
      const copy = { at: target.at, parent: from, cost: target.cost, copy: true };
      tree.nodes.push(copy);
      rewire(tree, copy);
      return copy;
    }
    return null;
  }

  let sampled = 0;
  for (;;) {
    const q = sample();
    if (!q) return { path: null, edges: edges() };
    sampled++;

    const a = extend(nearest(startTree, q), q);
    const addedA = link(a.parent.at, a.at);
    if (addedA) startTree.nodes.push(a);
    const b = extend(nearest(goalTree, q), q);
    const addedB = link(b.parent.at, b.at);
    if (addedB) goalTree.nodes.push(b);

    if (addedA) rewire(startTree, a);
    if (addedB) rewire(goalTree, b);

    let fromStart = null;
    let fromGoal = null;
    if (addedA) {
      fromGoal = nearest(goalTree, a.at);
      fromStart = connect(startTree, a, fromGoal);
    }
    if (addedB && !fromStart) {
      fromStart = nearest(startTree, b.at);
      fromGoal = connect(goalTree, b, fromStart);
      if (!fromGoal) fromStart = null;
    }

    if (fromStart) {
      const path = [];
      for (let n = fromStart; n; n = n.parent) path.unshift(n.at);
      for (let n = fromGoal.parent; n; n = n.parent) path.push(n.at);
      return { path, edges: edges() };
    }

    if ((performance.now() - t0) / 1000 > o.maxTime || sampled > o.maxNodes) return { path: null, edges: edges() };
  }
}

function pathLength(path) {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += dist(path[i - 1], path[i]);
  return s;
}

if (typeof module !== "undefined") module.exports = { Random, isFree, connectable, Grid, astar, rrtStar, pathLength };
