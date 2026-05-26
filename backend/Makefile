.PHONY: install lint format typecheck test test-unit test-integration clean run

install:
	uv sync --all-extras

lint:
	uv run ruff check src/ tests/

format:
	uv run ruff format src/ tests/

typecheck:
	uv run mypy src/

test:
	uv run pytest tests/

test-unit:
	uv run pytest tests/unit/

test-integration:
	uv run pytest tests/integration/

run:
	uv run uvicorn src.noctris.main:app --host 0.0.0.0 --port 18420 --reload

clean:
	rm -rf .pytest_cache htmlcov .mypy_cache __pycache__ dist .ruff_cache
