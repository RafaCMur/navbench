import math

from navbench.bench import SCENARIOS, run, summary


def test_run_and_summary():
    rows = run(range(2))
    assert len(rows) == len(SCENARIOS) * 2 * 2
    for s in summary(rows):
        assert s["runs"] == 2
        assert s["success"] == 1.0
        assert s["length_mean"] > 0


def test_closed_door_is_longer():
    rows = run([0], {k: SCENARIOS[k] for k in ["kitchen to bedroom", "kitchen to bedroom, door closed"]})
    astar = {r["scenario"]: r["length"] for r in rows if r["planner"] == "A*"}
    assert astar["kitchen to bedroom, door closed"] > astar["kitchen to bedroom"] + 1.0
    assert not any(math.isnan(r["length"]) for r in rows)
