# Python Toolchain Reference (2025/2026 Standard)

## Stack Overview

| Tool | Version | Role |
|---|---|---|
| `uv` | ≥ 0.5 | Package manager, venv manager, lock file, Python version management |
| `ruff` | ≥ 0.8 | Linter + formatter (replaces black, isort, flake8, pylint, bandit) |
| `mypy` | ≥ 1.13 | Static type checker (or `ty` from Astral as emerging alternative) |
| `pytest` | ≥ 8 | Test runner |
| `pytest-cov` | latest | Coverage reports |
| `pre-commit` | ≥ 3 | Git hook automation |
| `hatchling` | latest | PEP 517 build backend |
| `pytest-asyncio` | latest | Async test support (when using async frameworks) |
| `httpx` | latest | Async HTTP client (also used for TestClient in FastAPI) |

---

## pyproject.toml — Complete Template

This is the single config file for the entire project. Nothing else.

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "my-project"
version = "0.1.0"
description = "Short description"
readme = "README.md"
requires-python = ">=3.12"
license = { text = "MIT" }
authors = [{ name = "Your Name", email = "you@example.com" }]
dependencies = [
    # Runtime deps only. Add them here.
    # "fastapi>=0.115",
    # "sqlalchemy>=2.0",
    # "pydantic>=2.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-cov>=5.0",
    "pytest-asyncio>=0.24",
    "ruff>=0.8",
    "mypy>=1.13",
    "pre-commit>=3.0",
    "httpx>=0.27",        # TestClient + async HTTP
]

[tool.hatch.build.targets.wheel]
packages = ["src/my_project"]   # ← change to your actual package name

[tool.uv]
package = true

# ─── Ruff ─────────────────────────────────────────────────────────────────────
[tool.ruff]
target-version = "py312"
line-length = 100
src = ["src"]

[tool.ruff.lint]
select = [
    "E",   # pycodestyle errors
    "F",   # pyflakes
    "I",   # isort
    "UP",  # pyupgrade
    "B",   # bugbear
    "SIM", # simplify
    "TCH", # type-checking imports
    "ANN", # type annotations
    "N",   # pep8-naming
    "RUF", # ruff-specific
]
ignore = [
    "ANN101",  # missing type for self
    "ANN102",  # missing type for cls
]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
docstring-code-format = true

# ─── Mypy ─────────────────────────────────────────────────────────────────────
[tool.mypy]
python_version = "3.12"
strict = true
warn_unused_ignores = true
warn_return_any = true
disallow_untyped_defs = true
disallow_any_generics = true
check_untyped_defs = true
mypy_path = "src"

# ─── Pytest ───────────────────────────────────────────────────────────────────
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = [
    "-ra",
    "--strict-markers",
    "--cov=src",
    "--cov-report=term-missing",
    "--cov-report=html:htmlcov",
]
asyncio_mode = "auto"   # for pytest-asyncio

# ─── Coverage ─────────────────────────────────────────────────────────────────
[tool.coverage.run]
source = ["src"]
omit = ["*/tests/*", "*/migrations/*"]

[tool.coverage.report]
fail_under = 80
show_missing = true
```

---

## .python-version

```
3.12
```

Pin exactly. `uv` and `pyenv` both read this.

---

## .pre-commit-config.yaml

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.8.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.13.0
    hooks:
      - id: mypy
        additional_dependencies: []   # add stubs here if needed
        args: [--strict]

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-toml
      - id: check-merge-conflict
```

---

## Makefile

```makefile
.PHONY: install lint format typecheck test test-unit test-integration clean

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

clean:
	rm -rf .pytest_cache htmlcov .mypy_cache __pycache__ dist
```

---

## uv Workflow

```bash
# Initial setup
uv init my-project          # Creates project with pyproject.toml, .python-version
cd my-project
mkdir -p src/my_project tests/unit tests/integration
touch src/my_project/__init__.py

# Add deps
uv add fastapi sqlalchemy pydantic
uv add --dev pytest ruff mypy pre-commit

# Run tools (always via uv run, never activate venv manually)
uv run pytest
uv run ruff check src/ --fix
uv run mypy src/

# Lock and reproduce
uv lock                     # generates uv.lock
uv sync --frozen            # install from lockfile (use in CI)

# One-off tools without installing
uvx ruff check src/
uvx mypy src/
```

---

## src/ Layout Setup

After `uv init`, restructure immediately:

```bash
mkdir -p src/my_project/{domain/{entities,value_objects,repositories,events},\
application/{commands,queries,handlers,ports},\
infrastructure/{persistence,messaging,di},\
presentation/{api,cli},\
shared}
touch src/my_project/{domain,application,infrastructure,presentation,shared}/__init__.py
touch src/my_project/domain/{entities,value_objects,repositories,events}/__init__.py
touch src/my_project/application/{commands,queries,handlers,ports}/__init__.py
touch src/my_project/infrastructure/{persistence,messaging,di}/__init__.py
touch src/my_project/presentation/{api,cli}/__init__.py
```

---

## CI (GitHub Actions) — Minimal Template

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4
        with:
          version: "latest"

      - name: Set up Python
        run: uv python install

      - name: Install dependencies
        run: uv sync --frozen --all-extras

      - name: Lint
        run: uv run ruff check src/ tests/

      - name: Format check
        run: uv run ruff format --check src/ tests/

      - name: Type check
        run: uv run mypy src/

      - name: Test
        run: uv run pytest tests/ --cov=src --cov-fail-under=80
```

---

## Dockerfile — Multi-stage Production Template

```dockerfile
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src/ ./src/
RUN uv sync --frozen --no-dev

FROM python:3.12-slim AS runtime
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src /app/src

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src"

CMD ["python", "-m", "my_project.presentation.api.main"]
```
