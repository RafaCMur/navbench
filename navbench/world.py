import time

import numpy as np
from pyrobosim.core import WorldYamlLoader
from pyrobosim.navigation import AStarPlanner, RRTPlanner
from pyrobosim.utils.general import get_data_folder
from pyrobosim.utils.pose import Pose

START = Pose(x=0.0, y=0.0)
GOAL = Pose(x=2.3, y=3.3)


def load_world():
    """Load the PyRoboSim test world (3 rooms, 3 hallways, one robot)."""
    return WorldYamlLoader().from_file(get_data_folder() / "test_world.yaml")


def make_planners():
    """Return the A* and RRT* planners we compare, keyed by name."""
    return {
        "A*": AStarPlanner(grid_resolution=0.05, grid_inflation_radius=0.15),
        "RRT*": RRTPlanner(
            bidirectional=True,
            rrt_star=True,
            max_connection_dist=0.5,
            rewire_radius=1.5,
            collision_check_step_dist=0.025,
        ),
    }


def plan(robot, planner, seed=0, start=START, goal=GOAL):
    """Plan a path with the given planner. Returns (path, seconds)."""
    # RRT samples with the global numpy generator (World.sample_free_robot_pose_uniform)
    np.random.seed(seed)
    t0 = time.perf_counter()
    # set_path_planner calls reset(), which is where A* builds its occupancy
    # grid, so the grid build counts as planning time
    robot.set_path_planner(planner)
    path = robot.plan_path(start, goal)
    return path, time.perf_counter() - t0


def door(world):
    """Return the hallway that joins the kitchen and the bedroom directly."""
    for hall in world.hallways:
        if {hall.room_start.name, hall.room_end.name} == {"kitchen", "bedroom"}:
            return hall


def close_door(world):
    """Close the kitchen-bedroom hallway, so the only way left is the bathroom."""
    res = world.close_location(door(world), ignore_robots=world.robots)
    assert res.is_success(), res.message


def draw_world(ax, world):
    """Draw rooms, hallways and furniture on a matplotlib axis."""
    for room in world.rooms:
        x, y = room.polygon.exterior.xy
        ax.fill(x, y, color="#f2f2f2", ec="black", zorder=1)
    for hall in world.hallways:
        for g in getattr(hall.polygon, "geoms", [hall.polygon]):
            x, y = g.exterior.xy
            ax.fill(x, y, color="#e0e0e0", ec="gray", zorder=1)
    for loc in world.locations:
        x, y = loc.polygon.exterior.xy
        ax.fill(x, y, color="#c8b79a", ec="#8a7a5c", zorder=2)
