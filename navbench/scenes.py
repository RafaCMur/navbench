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
