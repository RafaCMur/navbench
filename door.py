"""The bedroom door shuts while both robots drive. Each robot whose route is
blocked plans again from where it stands. Exports demos/door.gif."""

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FFMpegWriter, FuncAnimation, PillowWriter

from navbench.scenes import CLOSE_AT, door_run
from navbench.world import GOAL, START, draw_world, load_world

SPEED = 1.0
FPS = 20
HOLD_S = 1.5
COLORS = {"A*": "tab:blue", "RRT*": "tab:red"}

parser = argparse.ArgumentParser()
# with seed 8 the first RRT* route also uses the short hallway, so both robots have to replan
parser.add_argument("--seed", type=int, default=8)
parser.add_argument("--mp4", action="store_true", help="write demos/door.mp4 instead (needs ffmpeg)")
args = parser.parse_args()

runs, hall = door_run(args.seed, CLOSE_AT, SPEED)
before = {name: old for name, (old, _, _) in runs.items()}
for name, (old, tr, dt) in runs.items():
    if dt is None:
        print(f"{name}: not blocked, length={old.length:.2f} m")
    else:
        print(f"{name}: planned {old.length:.2f} m, replanned in {dt * 1000:.0f} ms, drove {tr.length:.2f} m")

world = load_world()

fig, ax = plt.subplots(figsize=(6.4, 5.4))
fig.subplots_adjust(left=0.01, right=0.99, bottom=0.01, top=0.93)
draw_world(ax, world)
ax.plot(START.x, START.y, "go", ms=10, zorder=3)
ax.plot(GOAL.x, GOAL.y, "k*", ms=16, zorder=3)
ax.set_aspect("equal")
ax.set_xlim(-3.3, 3.8)
ax.set_ylim(-1.3, 4.3)
ax.set_xticks([])
ax.set_yticks([])
ax.set_title("The door shuts: both robots replan", fontsize=12)

door_patches = []
for g in getattr(hall.closed_polygon, "geoms", [hall.closed_polygon]):
    door_patches += ax.fill(*g.exterior.xy, color="#444444", zorder=3, visible=False)
door_text = ax.text(2.55, 1.3, "closed", color="white", fontsize=9, ha="center", rotation=90, zorder=6, visible=False)

artists = []
for i, (name, (_, tr, dt)) in enumerate(runs.items()):
    color = COLORS[name]
    a = {
        "plan": ax.plot([], [], color=color, lw=1, alpha=0.35, zorder=4)[0],
        "old": ax.plot(*before[name].ahead(CLOSE_AT).T, color=color, lw=1.5, ls="--", alpha=0.5, zorder=4, visible=False)[0],
        "line": ax.plot([], [], color=color, lw=2, zorder=4)[0],
        "dot": ax.plot([], [], "o", color=color, ms=11, mec="black", zorder=5)[0],
        "label": ax.text(
            0.02,
            0.98 - 0.065 * i,
            "",
            transform=ax.transAxes,
            color=color,
            fontsize=10,
            va="top",
            family="monospace",
            weight="bold",
            zorder=6,
            bbox=dict(fc="white", ec="none", alpha=0.8, pad=1.5),
        ),
    }
    artists.append((name, tr, dt, a))

n_frames = int((max(tr.duration for _, tr, _ in runs.values()) + HOLD_S) * FPS)


def update(i):
    t = i / FPS
    closed = t >= CLOSE_AT
    for p in door_patches:
        p.set_visible(closed)
    door_text.set_visible(closed)
    out = door_patches + [door_text]
    for name, tr, dt, a in artists:
        shown = tr if closed else before[name]
        a["plan"].set_data(*shown.ahead(t).T)
        a["old"].set_visible(closed and dt is not None)
        a["line"].set_data(*tr.trail(t).T)
        a["dot"].set_data(*[[v] for v in tr.position(t)])
        note = ""
        if closed and dt is not None:
            note = f"  replanned in {dt * 1000:.0f} ms"
        if t >= tr.duration:
            note = "  ARRIVED"
        a["label"].set_text(f"{name:<5} {tr.dist(t):4.1f}/{shown.length:.1f} m{note}")
        out += list(a.values())
    return out


anim = FuncAnimation(fig, update, frames=n_frames, interval=1000 / FPS, blit=True)
if args.mp4:
    out = Path(__file__).parent / "demos" / "door.mp4"
    anim.save(out, writer=FFMpegWriter(fps=FPS), dpi=120)
else:
    out = Path(__file__).parent / "demos" / "door.gif"
    anim.save(out, writer=PillowWriter(fps=FPS), dpi=80)
print("saved", out, f"({out.stat().st_size / 1e6:.1f} MB, {n_frames} frames)")
