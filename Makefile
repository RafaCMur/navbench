PY = .venv/bin/python

.PHONY: ui gif door video smoke test bench web serve

ui:
	$(PY) ui.py

bench:
	$(PY) bench.py

gif:
	$(PY) animate.py

door:
	$(PY) door.py

video:
	$(PY) animate.py --mp4
	$(PY) door.py --mp4

smoke:
	$(PY) demo.py

test:
	$(PY) -m pytest -q tests

web:
	$(PY) export.py

serve:
	$(PY) -m http.server -d web 8000
