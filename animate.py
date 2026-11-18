"""Two robots, same start and goal: A* vs RRT*. Exports demos/race.gif."""

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.animation import FuncAnimation, PillowWriter

from navbench.world import GOAL, START, draw_world, load_world, make_planners, plan

SPEED = 1.0  # m/s, same for both robots
FPS = 20
HOLD_S = 1.5  # seconds to keep the final frame
COLORS = {"A*": "tab:blue", "RRT*": "tab:red"}

parser = argparse.ArgumentParser()
parser.add_argument("--seed", type=int, default=0)
args = parser.parse_args()

world = load_world()
robot = world.robots[0]


class Run:
    def __init__(self, name, planner, color):
        path, self.plan_time = plan(robot, planner, args.seed)
        assert path is not None and path.poses, f"{name}: no path"
        self.name, self.color = name, color
        self.xy = np.array([[p.x, p.y] for p in path.poses])
        seg = np.linalg.norm(np.diff(self.xy, axis=0), axis=1)
        self.cum = np.concatenate([[0.0], np.cumsum(seg)])
        self.length = self.cum[-1]
        self.travel_time = self.length / SPEED

    def position(self, t):
        s = min(SPEED * t, self.length)
        return np.array(
            [np.interp(s, self.cum, self.xy[:, 0]), np.interp(s, self.cum, self.xy[:, 1])]
        )

    def trail(self, t):
        s = min(SPEED * t, self.length)
        keep = self.cum < s
        pts = np.vstack([self.xy[keep], self.position(t)])
        return pts[:, 0], pts[:, 1]


runs = [Run(n, p, COLORS[n]) for n, p in make_planners().items()]
for r in runs:
    print(f"{r.name}: length={r.length:.2f} m, plan={r.plan_time:.3f} s, travel={r.travel_time:.1f} s")

fig, ax = plt.subplots(figsize=(6, 6.4))
draw_world(ax, world)

ax.plot(START.x, START.y, "go", ms=10, zorder=3)
ax.plot(GOAL.x, GOAL.y, "k*", ms=16, zorder=3)
ax.set_aspect("equal")
ax.set_xlim(-3.3, 3.8)
ax.set_ylim(-1.3, 4.3)
ax.set_xticks([])
ax.set_yticks([])
ax.set_title("A* vs RRT*: same start, same goal", fontsize=12)

lines = [ax.plot([], [], color=r.color, lw=2, zorder=4)[0] for r in runs]
dots = [ax.plot([], [], "o", color=r.color, ms=11, mec="black", zorder=5)[0] for r in runs]
labels = [
    ax.text(
        0.02,
        0.98 - 0.065 * i,
        "",
        transform=ax.transAxes,
        color=r.color,
        fontsize=10,
        va="top",
        family="monospace",
        weight="bold",
        zorder=6,
        bbox=dict(fc="white", ec="none", alpha=0.8, pad=1.5),
    )
    for i, r in enumerate(runs)
]

total_s = max(r.travel_time for r in runs) + HOLD_S
n_frames = int(total_s * FPS)


def update(i):
    t = i / FPS
    for r, line, dot, label in zip(runs, lines, dots, labels):
        x, y = r.trail(t)
        line.set_data(x, y)
        px, py = r.position(t)
        dot.set_data([px], [py])
        done = t >= r.travel_time
        dist = min(SPEED * t, r.length)
        label.set_text(
            f"{r.name:<5} {dist:4.1f}/{r.length:.1f} m" + ("  ARRIVED" if done else "")
        )
    return lines + dots + labels


anim = FuncAnimation(fig, update, frames=n_frames, interval=1000 / FPS, blit=True)
out = Path(__file__).parent / "demos" / "race.gif"
anim.save(out, writer=PillowWriter(fps=FPS), dpi=80)
print("saved", out, f"({out.stat().st_size / 1e6:.1f} MB, {n_frames} frames)")
