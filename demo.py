"""Smoke test: load a world, plan with A* and RRT*, save a picture."""

import time
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from pyrobosim.core import WorldYamlLoader
from pyrobosim.navigation import AStarPlanner, RRTPlanner
from pyrobosim.utils.general import get_data_folder
from pyrobosim.utils.pose import Pose

START = Pose(x=0.0, y=0.0)
GOAL = Pose(x=2.3, y=3.3)

world = WorldYamlLoader().from_file(get_data_folder() / "test_world.yaml")
robot = world.robots[0]

planners = {
    "A*": AStarPlanner(grid_resolution=0.05, grid_inflation_radius=0.15),
    "RRT*": RRTPlanner(
        bidirectional=True,
        rrt_star=True,
        max_connection_dist=0.5,
        rewire_radius=1.5,
        collision_check_step_dist=0.025,
    ),
}

fig, ax = plt.subplots(figsize=(7, 7))
for room in world.rooms:
    x, y = room.polygon.exterior.xy
    ax.fill(x, y, color="#eeeeee", ec="black")
for hall in world.hallways:
    geoms = getattr(hall.polygon, "geoms", [hall.polygon])
    for g in geoms:
        x, y = g.exterior.xy
        ax.fill(x, y, color="#dddddd", ec="gray")

for (name, planner), color in zip(planners.items(), ["tab:blue", "tab:red"]):
    robot.set_path_planner(planner)
    t0 = time.perf_counter()
    path = robot.plan_path(START, GOAL)
    dt = time.perf_counter() - t0
    if path is None or not path.poses:
        print(f"{name}: no path")
        continue
    print(f"{name}: length={path.length:.2f} m, time={dt:.3f} s")
    ax.plot(
        [p.x for p in path.poses],
        [p.y for p in path.poses],
        color=color,
        lw=2,
        label=name,
    )

ax.plot(START.x, START.y, "go", ms=10)
ax.plot(GOAL.x, GOAL.y, "r*", ms=15)
ax.set_aspect("equal")
ax.legend()
out = Path(__file__).parent / "demos" / "smoke.png"
fig.savefig(out, dpi=120)
print("saved", out)
