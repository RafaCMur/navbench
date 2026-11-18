import numpy as np
from pyrobosim.utils.pose import Pose
from shapely.geometry import LineString

from navbench.motion import Track
from navbench.world import close_door, door, load_world, make_planners, plan

CLOSE_AT = 1.0  # seconds after start, robots are still in the kitchen


def door_run(seed, close_at=CLOSE_AT, speed=1.0):
    """Drive kitchen to bedroom and close the short hallway at close_at seconds.

    Returns ({planner: (first track, driven track, replan seconds or None)}, hallway).
    A robot whose remaining route does not cross the hallway keeps its route.
    A robot that finds no new route stops where it is.
    """
    world = load_world()
    robot = world.robots[0]
    hall = door(world)

    before = {}
    for name, planner in make_planners().items():
        path, _ = plan(robot, planner, seed)
        before[name] = Track.from_path(path, speed)

    close_door(world)

    runs = {}
    for name, planner in make_planners().items():
        old = before[name]
        if not LineString(old.ahead(close_at)).intersects(hall.closed_polygon):
            runs[name] = (old, old, None)
            continue
        x, y = old.position(close_at)
        path, dt = plan(robot, planner, seed, start=Pose(x=x, y=y))
        if path is None or len(path.poses) < 2:
            runs[name] = (old, Track(old.trail(close_at), speed), dt)
            continue
        new_xy = [[p.x, p.y] for p in path.poses][1:]
        runs[name] = (old, Track(np.vstack([old.trail(close_at), new_xy]), speed), dt)
    return runs, hall


# Throw the soda on the desk into the trash can. The trash can starts closed, and
# PyRoboSim does not let a robot open something while it holds an object, so it
# has to open the trash can first.
TIDY = [
    ("go", "trash_top"),
    ("open", None),
    ("go", "my_desk_desktop"),
    ("pick", "soda"),
    ("go", "trash_top"),
    ("place", None),
    ("close", None),
]


def tidy_world():
    # objects without a pose in the world file are put down at random when it loads
    np.random.seed(0)
    return load_world()


def tidy_run(planner_name, seed):
    """Do the TIDY steps with one planner. Returns (world, steps).

    Each step is a dict. Driving steps have the path and the planning time,
    the place step has the outline of the object where it was put down.
    Stops early if a step fails.
    """
    world = tidy_world()
    robot = world.robots[0]
    planner = make_planners()[planner_name]
    steps = []
    for action, target in TIDY:
        if action == "go":
            path, dt = plan(robot, planner, seed, robot.get_pose(), world.get_entity_by_name(target).nav_poses[0])
            if path is None or len(path.poses) < 2:
                break
            robot.set_pose(path.poses[-1])
            steps.append({"do": "go", "to": target, "path": [[p.x, p.y] for p in path.poses], "time": dt})
            continue
        if action == "pick":
            res = robot.pick_object(target)
        elif action == "place":
            obj = robot.manipulated_object
            res = robot.place_object()
        elif action == "open":
            res = robot.open_location()
        else:
            res = robot.close_location()
        if not res.is_success():
            break
        step = {"do": action}
        if action == "place":
            step["ring"] = list(obj.polygon.exterior.coords)
        steps.append(step)
    return world, steps
