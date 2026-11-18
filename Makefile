PY = .venv/bin/python

.PHONY: ui gif smoke test

ui:
	$(PY) ui.py

gif:
	$(PY) animate.py

smoke:
	$(PY) demo.py

test:
	$(PY) -m pytest -q tests
