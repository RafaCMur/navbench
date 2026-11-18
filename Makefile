PY = .venv/bin/python

.PHONY: ui gif smoke test bench

ui:
	$(PY) ui.py

bench:
	$(PY) bench.py

gif:
	$(PY) animate.py

smoke:
	$(PY) demo.py

test:
	$(PY) -m pytest -q tests
