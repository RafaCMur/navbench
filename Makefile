PY = .venv/bin/python

.PHONY: ui gif door smoke test bench

ui:
	$(PY) ui.py

bench:
	$(PY) bench.py

gif:
	$(PY) animate.py

door:
	$(PY) door.py

smoke:
	$(PY) demo.py

test:
	$(PY) -m pytest -q tests
