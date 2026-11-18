import pytest
from pyrobosim.utils.pose import Pose
from shapely.geometry import LineString

from navbench.world import close_door, door, load_world, make_planners, plan


@pytest.mark.parametrize("name", ["A*", "RRT*"])
def test_replan_avoids_closed_door(name):
    world = load_world()
    close_door(world)
    assert not door(world).is_open
    path, _ = plan(world.robots[0], make_planners()[name], seed=8, start=Pose(x=0.6, y=0.35))
    assert path is not None and len(path.poses) > 1
    line = LineString([(p.x, p.y) for p in path.poses])
    assert not line.intersects(door(world).closed_polygon)
