import pytest

from navbench.world import load_world, make_planners, plan


@pytest.fixture(scope="module")
def robot():
    return load_world().robots[0]


@pytest.mark.parametrize("name", ["A*", "RRT*"])
def test_finds_path(robot, name):
    path, _ = plan(robot, make_planners()[name])
    assert path is not None
    assert len(path.poses) >= 2
    assert path.length > 0


def test_rrt_same_seed_same_path(robot):
    a, _ = plan(robot, make_planners()["RRT*"], seed=3)
    b, _ = plan(robot, make_planners()["RRT*"], seed=3)
    assert a.length == pytest.approx(b.length)
