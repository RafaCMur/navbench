"""Two robots, same start and goal: A* vs RRT*. Exports demos/race.gif."""

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter

from navbench.motion import Track
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

tracks = {}
for name, planner in make_planners().items():
    path, dt = plan(robot, planner, args.seed)
    assert path is not None and path.poses, f"{name}: no path"
    tracks[name] = Track.from_path(path, SPEED)
    print(f"{name}: length={path.length:.2f} m, plan={dt:.3f} s, travel={tracks[name].duration:.1f} s")

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

lines, dots, labels = [], [], []
for i, name in enumerate(tracks):
    color = COLORS[name]
    lines.append(ax.plot([], [], color=color, lw=2, zorder=4)[0])
    dots.append(ax.plot([], [], "o", color=color, ms=11, mec="black", zorder=5)[0])
    labels.append(
        ax.text(
            0.02,
            0.98 - 0.065 * i,
            "",
            transform=ax.transAxes,
            color=color,
            fontsize=10,
            va="top",
            family="monospace",
            weight="bold",
            zorder=6,
            bbox=dict(fc="white", ec="none", alpha=0.8, pad=1.5),
        )
    )

n_frames = int((max(tr.duration for tr in tracks.values()) + HOLD_S) * FPS)


def update(i):
    t = i / FPS
    for (name, tr), line, dot, label in zip(tracks.items(), lines, dots, labels):
        line.set_data(*tr.trail(t).T)
        dot.set_data(*[[v] for v in tr.position(t)])
        done = "  ARRIVED" if t >= tr.duration else ""
        label.set_text(f"{name:<5} {tr.dist(t):4.1f}/{tr.length:.1f} m{done}")
    return lines + dots + labels


anim = FuncAnimation(fig, update, frames=n_frames, interval=1000 / FPS, blit=True)
out = Path(__file__).parent / "demos" / "race.gif"
anim.save(out, writer=PillowWriter(fps=FPS), dpi=80)
print("saved", out, f"({out.stat().st_size / 1e6:.1f} MB, {n_frames} frames)")
