"""Smoke test: load a world, plan with A* and RRT*, save a picture."""

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from navbench.world import GOAL, START, draw_world, load_world, make_planners, plan

parser = argparse.ArgumentParser()
parser.add_argument("--seed", type=int, default=0)
args = parser.parse_args()

world = load_world()
robot = world.robots[0]

fig, ax = plt.subplots(figsize=(7, 7))
draw_world(ax, world)

for (name, planner), color in zip(make_planners().items(), ["tab:blue", "tab:red"]):
    path, dt = plan(robot, planner, args.seed)
    if path is None or not path.poses:
        print(f"{name}: no path")
        continue
    print(f"{name}: length={path.length:.2f} m, time={dt:.3f} s")
    ax.plot([p.x for p in path.poses], [p.y for p in path.poses], color=color, lw=2, label=name)

ax.plot(START.x, START.y, "go", ms=10)
ax.plot(GOAL.x, GOAL.y, "r*", ms=15)
ax.set_aspect("equal")
ax.legend()
out = Path(__file__).parent / "demos" / "smoke.png"
fig.savefig(out, dpi=120)
print("saved", out)
