import numpy as np
from pyrobosim.utils.pose import Pose

from navbench.bench import SCENARIOS
from navbench.scenes import CLOSE_AT, door_run
from navbench.world import close_door, door, load_world, make_planners, plan


def rings(geom):
    """Outer rings of a polygon or multipolygon, as lists of [x, y]."""
    return [pts(g.exterior.coords) for g in getattr(geom, "geoms", [geom])]


def pts(coords, nd=2):
    return [[round(x, nd), round(y, nd)] for x, y, *_ in coords]


def tree_edges(planner):
    edges = []
    for g in getattr(planner, "get_graphs", lambda: [])():
        for e in g.edges:
            edges.append(pts([(e.nodeA.pose.x, e.nodeA.pose.y), (e.nodeB.pose.x, e.nodeB.pose.y)]))
    return edges


def world_shapes(world):
    return {
        "rooms": [r for room in world.rooms for r in rings(room.polygon)],
        "halls": [r for hall in world.hallways for r in rings(hall.polygon)],
        "furniture": [r for loc in world.locations for r in rings(loc.polygon)],
        "door": rings(door(world).closed_polygon),
        "names": [{"name": room.name, "at": pts([room.polygon.centroid.coords[0]])[0]} for room in world.rooms],
    }


def build(seeds):
    """Plan every scenario and the door scene for each seed. Returns plain data for the web viewer."""
    seeds = list(seeds)
    data = {"seeds": seeds, "close_at": CLOSE_AT, "world": world_shapes(load_world()), "scenarios": []}

    for name, (start, goal, closed) in SCENARIOS.items():
        world = load_world()
        if closed:
            close_door(world)
        robot = world.robots[0]
        s, g = Pose(x=start[0], y=start[1]), Pose(x=goal[0], y=goal[1])
        runs = {}
        for planner_name in make_planners():
            runs[planner_name] = []
            for seed in seeds:
                planner = make_planners()[planner_name]
                path, dt = plan(robot, planner, seed, s, g)
                ok = path is not None and len(path.poses) > 1
                runs[planner_name].append(
                    {
                        "seed": seed,
                        "ok": ok,
                        "length": round(path.length, 3) if ok else None,
                        "time": round(dt, 4),
                        "path": pts([(p.x, p.y) for p in path.poses]) if ok else [],
                        "tree": tree_edges(planner),
                    }
                )
        data["scenarios"].append({"name": name, "start": start, "goal": goal, "closed": closed, "runs": runs})

    door_runs = {}
    for seed in seeds:
        runs, _ = door_run(seed)
        for planner_name, (old, tr, dt) in runs.items():
            door_runs.setdefault(planner_name, []).append(
                {
                    "seed": seed,
                    "first": pts(old.xy),
                    "driven": pts(tr.xy),
                    "replan": round(dt, 4) if dt is not None else None,
                    "arrived": bool(np.allclose(tr.xy[-1], old.xy[-1])),
                }
            )
    data["door"] = door_runs
    return data
