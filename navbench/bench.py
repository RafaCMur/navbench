import statistics

from pyrobosim.utils.pose import Pose

from navbench.world import close_door, load_world, make_planners, plan

# name: (start, goal, door closed)
SCENARIOS = {
    "kitchen to bedroom": ((0.0, 0.0), (2.3, 3.3), False),
    "kitchen to bathroom": ((0.0, 0.0), (-1.5, 2.0), False),
    "bathroom to bedroom": ((-1.5, 2.0), (2.3, 3.3), False),
    "kitchen to bedroom, door closed": ((0.0, 0.0), (2.3, 3.3), True),
}

FIELDS = ["scenario", "planner", "seed", "success", "length", "time"]


def run(seeds, scenarios=SCENARIOS):
    """Plan every scenario with every planner and seed. Returns one dict per run."""
    rows = []
    for name, (start, goal, closed) in scenarios.items():
        world = load_world()
        if closed:
            close_door(world)
        robot = world.robots[0]
        start, goal = Pose(x=start[0], y=start[1]), Pose(x=goal[0], y=goal[1])
        for seed in seeds:
            for planner_name, planner in make_planners().items():
                path, dt = plan(robot, planner, seed, start, goal)
                ok = path is not None and len(path.poses) > 1
                rows.append(
                    {
                        "scenario": name,
                        "planner": planner_name,
                        "seed": seed,
                        "success": ok,
                        "length": path.length if ok else float("nan"),
                        "time": dt,
                    }
                )
    return rows


def summary(rows):
    """Group runs by scenario and planner. Returns success rate and length/time stats."""
    groups = {}
    for r in rows:
        groups.setdefault((r["scenario"], r["planner"]), []).append(r)
    out = []
    for (scenario, planner), rs in groups.items():
        lengths = [r["length"] for r in rs if r["success"]]
        times = [r["time"] for r in rs]
        out.append(
            {
                "scenario": scenario,
                "planner": planner,
                "runs": len(rs),
                "success": len(lengths) / len(rs),
                "length_mean": statistics.mean(lengths) if lengths else float("nan"),
                "length_sd": statistics.pstdev(lengths) if lengths else float("nan"),
                "length_min": min(lengths, default=float("nan")),
                "length_max": max(lengths, default=float("nan")),
                "time_median": statistics.median(times),
            }
        )
    return out
