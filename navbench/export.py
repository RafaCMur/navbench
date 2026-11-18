import numpy as np
from pyrobosim.utils.pose import Pose
from shapely.geometry import LineString

from navbench.bench import SCENARIOS
from navbench.scenes import CLOSE_AT, door_run, tidy_run, tidy_world
from navbench.world import START, close_door, door, load_world, make_planners, plan


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


def free_space(inflation, closed):
    """Where the robot centre may be, as polygons with holes, at full precision."""
    world = load_world()
    if closed:
        close_door(world)
    world.set_inflation_radius(inflation)
    geom = world.total_internal_polygon
    # not rounded: the grid test points can sit exactly on an edge
    exact = lambda coords: [[x, y] for x, y, *_ in coords]
    return [[exact(g.exterior.coords)] + [exact(r.coords) for r in g.interiors] for g in getattr(geom, "geoms", [geom])]


def live_map():
    """Everything the in-browser planners need: free space, world bounds and places to drive to."""
    world = load_world()
    places = [{"name": room.name, "at": pts([(room.nav_poses[0].x, room.nav_poses[0].y)], 3)[0]} for room in world.rooms]
    for loc in world.locations:
        pose = loc.children[0].nav_poses[0]
        places.append({"name": loc.category.replace("_", " "), "at": pts([(pose.x, pose.y)], 3)[0]})
    radius = world.robots[0].radius
    inflation = make_planners()["A*"].grid_inflation_radius
    return {
        "bounds": [world.x_bounds, world.y_bounds],
        "radius": radius,
        "home": [START.x, START.y],
        "places": places,
        "free": {
            "A*": {"open": free_space(inflation, False), "closed": free_space(inflation, True)},
            "RRT*": {"open": free_space(radius, False), "closed": free_space(radius, True)},
        },
    }


def tidy(seeds):
    """The soda task. A* is planned once since its routes do not depend on the seed."""
    world = tidy_world()
    runs = {}
    for name in make_planners():
        runs[name] = []
        for seed in seeds[:1] if name == "A*" else seeds:
            _, steps = tidy_run(name, seed)
            for step in steps:
                if "path" in step:
                    step["path"] = pts(step["path"])
                    step["time"] = round(step["time"], 4)
                if "ring" in step:
                    step["ring"] = pts(step["ring"], 3)
            runs[name].append({"seed": seed, "steps": steps})
    return {
        "objects": [{"name": o.name, "ring": pts(o.polygon.exterior.coords, 3)} for o in world.objects],
        "trash": rings(world.get_entity_by_name("trash").polygon)[0],
        "runs": runs,
    }


def build(seeds):
    """Plan every scenario and the door scene for each seed. Returns plain data for the web viewer."""
    seeds = list(seeds)
    data = {"seeds": seeds, "close_at": CLOSE_AT, "world": world_shapes(load_world()), "live": live_map(), "scenarios": []}

    for name, (start, goal, closed) in SCENARIOS.items():
        world = load_world()
        if closed:
            close_door(world)
        robot = world.robots[0]
        hall = door(world).closed_polygon
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
                        "length": round(path.length, 4) if ok else None,
                        "via_door": ok and bool(LineString([(p.x, p.y) for p in path.poses]).intersects(hall)),
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
    data["tidy"] = tidy(seeds)
    return data
