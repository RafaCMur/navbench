"""Open the PyRoboSim web UI on the test world."""

import argparse

from pyrobosim.web import start_ui

from navbench.world import load_world

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8050)
parser.add_argument("--no-browser", action="store_true")
args = parser.parse_args()

start_ui(load_world(), port=args.port, title="navbench", auto_open=not args.no_browser)
