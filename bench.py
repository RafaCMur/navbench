"""Run A* and RRT* over every scenario and many seeds. Writes demos/bench.csv and demos/bench.png."""

import argparse
import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from navbench.bench import FIELDS, SCENARIOS, run, summary

COLORS = {"A*": "tab:blue", "RRT*": "tab:red"}

parser = argparse.ArgumentParser()
parser.add_argument("--seeds", type=int, default=30)
args = parser.parse_args()

rows = run(range(args.seeds))
out = Path(__file__).parent / "demos"

with open(out / "bench.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=FIELDS)
    w.writeheader()
    for r in rows:
        w.writerow({**r, "length": f"{r['length']:.3f}", "time": f"{r['time']:.4f}"})

print("| scenario | planner | success | length (m) | best / worst (m) | median time (ms) |")
print("|---|---|---|---|---|---|")
for s in summary(rows):
    print(
        f"| {s['scenario']} | {s['planner']} | {s['success']:.0%} "
        f"| {s['length_mean']:.2f} ± {s['length_sd']:.2f} "
        f"| {s['length_min']:.2f} / {s['length_max']:.2f} "
        f"| {1000 * s['time_median']:.0f} |"
    )

names = list(SCENARIOS)
fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
for ax, key, label in [(axes[0], "length", "path length (m)"), (axes[1], "time", "planning time (ms)")]:
    for k, (planner, color) in enumerate(COLORS.items()):
        data = []
        for name in names:
            vals = [r[key] for r in rows if r["scenario"] == name and r["planner"] == planner and r["success"]]
            data.append([v * 1000 for v in vals] if key == "time" else vals)
        pos = [i + (k - 0.5) * 0.35 for i in range(len(names))]
        ax.boxplot(
            data,
            positions=pos,
            widths=0.3,
            patch_artist=True,
            boxprops=dict(facecolor=color, alpha=0.4),
            medianprops=dict(color=color),
            flierprops=dict(markeredgecolor=color),
        )
        ax.plot([], [], "s", color=color, alpha=0.6, label=planner)
    ax.set_xticks(range(len(names)), [n.replace(", ", ",\n").replace(" to ", "\nto ") for n in names], fontsize=8)
    ax.set_ylabel(label)
    ax.grid(axis="y", alpha=0.3)
axes[0].legend()
fig.suptitle(f"A* vs RRT*, {args.seeds} seeds per scenario")
fig.tight_layout()
fig.savefig(out / "bench.png", dpi=110)
print("saved", out / "bench.csv", out / "bench.png")
