---
name: python-architecture
description: >
  Activate this skill whenever the user is working on Python project structure,
  architecture, or environment setup at any non-trivial level of scope. Trigger
  on phrases like "how should I structure my project", "set up my Python project",
  "folder structure", "clean architecture in Python", "hexagonal", "DDD in Python",
  "domain layer", "ports and adapters", "repository pattern", "CQRS", "dependency
  injection Python", "pyproject.toml", "uv setup", "ruff config", "src layout",
  "how do I organize my code", "scalable Python project", "professional Python setup",
  "what goes where", "module boundaries", or any question about layering, naming
  conventions, or package organization. Also trigger when the user is starting a
  new non-trivial Python project (API, CLI, ML pipeline, SaaS, microservice) and
  has not yet defined its structure. When active, Claude must produce
  paradigm-correct, industry-grade, opinionated guidance — never beginner-level
  folder dumps. Every design decision must be justified by a named principle.
---

# Modern Python Architecture

This skill encodes professional Python architecture knowledge. Before producing
any structure, folder layout, or tooling config, Claude must think from principles
first — then derive the structure. Never reverse-engineer a structure from
convenience.

Read `references/paradigms.md` for deep pattern explanations.
Read `references/toolchain.md` for tooling reference and `pyproject.toml` templates.
Read `references/antipatterns.md` before reviewing or auditing existing code.

---

## Core Axioms

These govern every decision. Violating any of them requires explicit justification.

1. **Dependency Rule** — Dependencies point inward only. Outer layers know about
   inner layers; inner layers know nothing about outer layers. Domain is the center
   and has zero external imports.

2. **Single Source of Truth** — `pyproject.toml` is the single config file.
   No `setup.py`, `setup.cfg`, `.flake8`, `mypy.ini`, or `pytest.ini` alongside it.

3. **Structural typing over nominal typing** — Define ports (interfaces) as
   `typing.Protocol`. Reserve `abc.ABC` for shared concrete implementation.

4. **Constructor injection** — Dependencies are injected through `__init__`.
   No service locators. No module-level singletons reaching into global state.

5. **`src/` layout** — All importable code lives under `src/<package_name>/`.
   Never put the package at the repo root. This prevents accidental imports of
   uninstalled source and separates packaging from project tooling.

6. **Paradigm purity per layer** — Never mix infrastructure concerns into domain.
   A domain entity must be instantiable with zero DB, zero framework, zero HTTP.

---

## Architectural Paradigm Selection

Three paradigms dominate professional Python. Choose based on project size and
domain complexity. Hybrid (most common) is the default recommendation.

| Paradigm | Best for | Folder axis |
|---|---|---|
| **Layered Clean Arch** | APIs, services, medium–large domain | Horizontal (layer-first) |
| **Vertical Slice** | Feature-heavy apps, parallel teams | Vertical (feature-first) |
| **Hybrid (FSD-inspired)** | Most real-world projects | Feature-first, layered within |

See `references/paradigms.md` for tradeoffs and anti-patterns per paradigm.

---

## Canonical Folder Structure: Layered Clean Architecture

For services with a non-trivial domain. This is the default for APIs, SaaS backends,
ML inference services.

```
project-root/
├── src/
│   └── <package>/
│       ├── domain/                 # Zero external deps. Pure Python.
│       │   ├── entities/           # Identity-based objects (mutable state)
│       │   ├── value_objects/      # Immutable. Equality by value. Validated.
│       │   ├── aggregates/         # Consistency boundary. Contains entities.
│       │   ├── repositories/       # Protocols only. No implementations.
│       │   ├── services/           # Domain logic spanning multiple aggregates.
│       │   └── events/             # Domain events as frozen dataclasses.
│       ├── application/            # Orchestration. Knows domain. No infra.
│       │   ├── commands/           # Frozen dataclasses. Intent to change state.
│       │   ├── queries/            # Frozen dataclasses. Intent to read state.
│       │   ├── handlers/           # One handler per command/query.
│       │   ├── services/           # Application services (thin orchestrators).
│       │   └── ports/              # Protocols for external dependencies.
│       ├── infrastructure/         # Implements ports. Knows frameworks, DBs.
│       │   ├── persistence/        # Repository implementations, ORM models.
│       │   ├── messaging/          # Event bus, Celery, Kafka adapters.
│       │   ├── http_clients/       # External API adapters.
│       │   └── di/                 # Dependency injection container wiring.
│       ├── presentation/           # Entry points. Thin. No business logic.
│       │   ├── api/                # FastAPI/Flask routers, schemas, middleware.
│       │   ├── cli/                # Typer/Click commands.
│       │   └── workers/            # Background task entrypoints.
│       └── shared/                 # Cross-cutting: logging, exceptions, types.
│           ├── exceptions.py
│           ├── types.py
│           └── logging.py
├── tests/
│   ├── unit/                       # Pure domain + application tests. No I/O.
│   ├── integration/                # Tests that touch real infra (DB, queue).
│   └── e2e/                        # Full stack. Runs against deployed service.
├── pyproject.toml
├── uv.lock
├── .python-version
├── .pre-commit-config.yaml
├── Makefile
├── Dockerfile
└── README.md
```

---

## Canonical Folder Structure: Hybrid / Feature-Sliced

For apps where features are the primary organizational unit (e-commerce, SaaS
platforms, microservices with many bounded contexts).

```
src/<package>/
├── features/
│   ├── auth/
│   │   ├── domain.py               # Entities, VOs, events for this feature
│   │   ├── commands.py             # CQRS commands
│   │   ├── queries.py              # CQRS queries
│   │   ├── handlers.py             # Command + query handlers
│   │   ├── repository.py           # Port (Protocol) + implementation
│   │   └── api.py                  # Router for this feature
│   ├── billing/
│   │   └── ...
│   └── notifications/
│       └── ...
├── shared/                         # Cross-feature shared kernel
│   ├── domain/                     # Base classes, shared value objects
│   ├── infrastructure/             # Shared DB session, event bus
│   └── api/                        # Shared middleware, error handlers
├── container.py                    # DI wiring for whole app
└── main.py                         # Application entrypoint
```

**Governance rule:** A feature module must never import from another feature
module directly. Cross-feature communication goes through domain events or a
shared application service. Violation = tight coupling = fragility.

---

## Layer Contracts and Dependency Rules

### Domain Layer

- Zero `import` statements pointing outside `domain/`.
- Entities: mutable, identity-based. Use `@dataclass` with `eq=False`.
- Value Objects: immutable, equality by value. Use `@dataclass(frozen=True)`.
- Domain Events: `@dataclass(frozen=True)`. Represent facts that happened.
- Repository ports: `typing.Protocol`. Named `<Aggregate>Repository`.

```python
from typing import Protocol
from uuid import UUID
from .entities import User

class UserRepository(Protocol):
    def find_by_id(self, user_id: UUID) -> User | None: ...
    def save(self, user: User) -> None: ...
```

### Application Layer

- Imports from `domain/` only.
- Commands and Queries are `@dataclass(frozen=True)`. Immutable intent.
- One handler per command/query. Handlers depend on repository *protocols*.
- Application ports (`application/ports/`) define contracts for infra services
  (email sender, file storage, event publisher) as `Protocol`.

### Infrastructure Layer

- Implements every `Protocol` defined in `domain/repositories/` and
  `application/ports/`.
- Allowed to import SQLAlchemy, Redis, boto3, httpx, etc.
- Never imported by domain or application.

### Presentation Layer

- Imports from `application/` only (commands, queries, handlers).
- Deserializes request → command/query. Calls handler. Serializes response.
- No business logic. No domain object exposure to HTTP schemas directly.
- Use separate Pydantic schemas for request/response. Never expose entities.

---

## Dependency Injection

Prefer manual constructor injection. Use a container only at the composition root.

**Recommended:** `dependency-injector` (production, complex graphs) or `lagom`
(lightweight, type-based autowiring).

**Composition root** is the only place that knows concrete implementations.
Everything else works against abstractions (Protocols).

```
infrastructure/di/container.py  ← knows everything, wires it together
main.py                         ← imports container, starts app
```

Never do:
```python
from infrastructure.persistence.user_repo import SqlAlchemyUserRepository
# inside application/handlers/create_user.py  ← WRONG
```

---

## Toolchain: The 2025/2026 Standard Stack

| Tool | Role | Replaces |
|---|---|---|
| `uv` | Package manager, venv, lock | pip, virtualenv, poetry |
| `ruff` | Linter + formatter | black, isort, flake8, pylint |
| `mypy` / `ty` | Static type checker | (was mypy-only; `ty` is Astral's new tool) |
| `pytest` + `pytest-cov` | Testing + coverage | unittest |
| `pre-commit` | Git hook automation | manual enforcement |
| `hatchling` | Build backend | setuptools |

**Setup sequence:**
```bash
uv init <project-name>
uv add --dev ruff mypy pytest pytest-cov pre-commit
uv run mypy src/
uv run ruff check src/ --fix
uv run pytest tests/ --cov=src/
```

See `references/toolchain.md` for full `pyproject.toml` template with all
`[tool.*]` sections.

---

## Naming Conventions

| Artifact | Convention | Example |
|---|---|---|
| Entities | `PascalCase` noun | `User`, `Order`, `BiometricSample` |
| Value Objects | `PascalCase` noun | `EmailAddress`, `Money`, `UserId` |
| Commands | `PascalCase` imperative verb+noun | `CreateUser`, `SubmitOrder` |
| Queries | `PascalCase` `Get`/`List`/`Find` prefix | `GetUserById`, `ListActiveOrders` |
| Handlers | Command/Query name + `Handler` | `CreateUserHandler`, `GetUserByIdHandler` |
| Repository protocols | Aggregate name + `Repository` | `UserRepository`, `OrderRepository` |
| Repository implementations | Prefix with technology | `SqlAlchemyUserRepository`, `RedisSessionStore` |
| Ports (application) | Descriptive noun + `Port` or `Gateway` | `EmailGateway`, `StoragePort` |
| Adapters (infra) | Technology + purpose | `SendgridEmailAdapter`, `S3StorageAdapter` |
| Domain events | Past-tense verb phrase | `UserRegistered`, `OrderShipped` |
| Modules/files | `snake_case` | `user_repository.py`, `create_user.py` |

---

## Key Files and Their Purpose

Every production Python project must have these files. If any is missing, flag it.

| File | Purpose |
|---|---|
| `pyproject.toml` | Single config truth: metadata, deps, ruff, mypy, pytest, uv |
| `uv.lock` | Lockfile. Always commit. Ensures reproducible builds. |
| `.python-version` | Pins Python version for uv/pyenv. |
| `.pre-commit-config.yaml` | Automates ruff + mypy on every commit. |
| `src/<pkg>/__init__.py` | Declares public API surface of the package. |
| `Makefile` | Developer shortcuts (`make lint`, `make test`, `make run`). |
| `Dockerfile` | Production container. Multi-stage. Never uses `CMD python main.py` raw. |
| `README.md` | Setup, architecture overview, decision log. |

---

## Decision Tree: Which Paradigm?

```
Is this a script or one-off tool? → flat module, no architecture needed
    ↓ No
Does it have a non-trivial domain with business rules?
    ↓ Yes → Clean Architecture (layered)
    ↓ No (mostly CRUD + thin logic)
Are features independently deployable or owned by separate teams?
    ↓ Yes → Vertical Slice / Hybrid FSD
    ↓ No → Simple layered (domain / application / infra / presentation)
Does it grow to microservices?
    ↓ Yes → Bounded contexts per service. Each service is its own Clean Arch project.
```

---

## Enforcement Checklist

Run this before declaring any architecture "done":

- [ ] Domain layer imports: zero third-party packages, zero infra imports
- [ ] Every port is a `Protocol`, not a concrete class
- [ ] Every handler has exactly one responsibility
- [ ] Presentation layer has zero business logic
- [ ] `pyproject.toml` exists and consolidates all tool config
- [ ] `src/` layout is used
- [ ] `uv.lock` is committed
- [ ] Tests are split: `unit/` (no I/O), `integration/` (real infra), `e2e/`
- [ ] DI wiring is in one composition root only
- [ ] No circular imports between layers
- [ ] No feature module imports another feature module directly
