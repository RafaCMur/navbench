import json

from navbench.bench import SCENARIOS
from navbench.export import build


def test_build():
    data = build([0, 1])
    json.dumps(data)
    assert data["seeds"] == [0, 1]
    assert len(data["world"]["rooms"]) == 3
    assert data["world"]["door"]
    assert [s["name"] for s in data["scenarios"]] == list(SCENARIOS)
    for s in data["scenarios"]:
        for name, runs in s["runs"].items():
            assert len(runs) == 2
            for r in runs:
                assert r["ok"] and r["length"] > 0 and len(r["path"]) > 1
                assert bool(r["tree"]) == (name == "RRT*")
                assert isinstance(r["via_door"], bool)
    for runs in data["door"].values():
        assert all(r["arrived"] for r in runs)
