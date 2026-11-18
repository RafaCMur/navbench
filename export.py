"""Plan every scenario for many seeds and save the results for the web viewer in web/data.js."""

import argparse
import json
from datetime import date
from pathlib import Path

from navbench.export import build

parser = argparse.ArgumentParser()
parser.add_argument("--seeds", type=int, default=30)
args = parser.parse_args()

data = build(range(args.seeds))
data["made"] = date.today().isoformat()

out = Path(__file__).parent / "web" / "data.js"
out.parent.mkdir(exist_ok=True)
# a .js file instead of .json so the page also works when opened straight from disk
out.write_text("window.DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
print("saved", out, f"({out.stat().st_size / 1e6:.1f} MB)")
