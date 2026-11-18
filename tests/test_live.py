import json
import shutil
import subprocess
from pathlib import Path

import pytest

from navbench.export import build

PLANNERS = Path(__file__).parent.parent / "web" / "planners.js"

# plans every benchmark route with the JavaScript planners and prints the lengths
SCRIPT = """
const P = require(process.argv[1]);
const D = JSON.parse(require("fs").readFileSync(0, "utf8"));
const out = D.scenarios.map((sc) => {
  const m = sc.closed ? "closed" : "open";
  const a = P.astar(D.live.free["A*"][m], D.live.bounds, sc.start, sc.goal);
  const rrt = D.seeds.map((seed) => {
    const r = P.rrtStar(D.live.free["RRT*"][m], D.live.bounds, sc.start, sc.goal, seed, { radius: D.live.radius });
    return r.path ? P.pathLength(r.path) : null;
  });
  return { astar: a.path ? P.pathLength(a.path) : null, rrt };
});
console.log(JSON.stringify(out));
"""


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_js_planners_match_pyrobosim():
    data = build(range(6))
    res = subprocess.run(
        ["node", "-e", SCRIPT, str(PLANNERS)], input=json.dumps(data), capture_output=True, text=True, check=True
    )
    same = total = 0
    for sc, js in zip(data["scenarios"], json.loads(res.stdout)):
        assert js["astar"] == pytest.approx(sc["runs"]["A*"][0]["length"], abs=1e-3), sc["name"]
        for run, length in zip(sc["runs"]["RRT*"], js["rrt"]):
            assert length is not None
            same += abs(length - run["length"]) < 1e-3
            total += 1
    assert same >= total // 3
