# Python Architecture Paradigms — Deep Reference

## Table of Contents
1. Clean Architecture
2. Hexagonal Architecture (Ports & Adapters)
3. Domain-Driven Design Tactical Patterns
4. CQRS
5. Vertical Slice Architecture
6. Feature-Sliced Design (FSD) for Python
7. Paradigm Comparison and Tradeoffs
8. Dependency Inversion in Python: Protocol vs ABC

---

## 1. Clean Architecture (Robert C. Martin)

### Core idea
Business rules are the center of the system. Everything else — frameworks, DBs,
UIs — is a detail that plugs into the center. The center must be ignorable by
the outer layers in the sense that it doesn't know they exist.

### Concentric circles (inner = more stable, outer = more volatile)
1. **Entities (Domain)** — Enterprise-wide business rules. Pure Python classes.
2. **Use Cases (Application)** — Application-specific business rules. Orchestrate entities.
3. **Interface Adapters (Presentation + Infrastructure)** — Convert data formats.
4. **Frameworks & Drivers** — HTTP frameworks, ORMs, message queues, CLIs.

### The Dependency Rule
Source code dependencies can only point inward. Nothing in an inner circle can
know anything at all about an outer circle. This includes function names,
class names, variables, or any other named software entity declared in an
outer circle.

### What "knowing nothing" means in Python
- No `import` of outer-layer modules from inner-layer modules.
- Domain entities must be instantiable with `pytest` and zero frameworks.
- If you need `from sqlalchemy.orm import ...` in your domain, the architecture
  is already broken.

---

## 2. Hexagonal Architecture (Alistair Cockburn)

Also called Ports and Adapters. Functionally equivalent to Clean Architecture
but uses different vocabulary.

### Vocabulary
- **Port** — An interface (Protocol/ABC) defining how the application talks to
  the outside world. Two types:
  - *Primary (driving) port* — Driven by external actors (HTTP request, CLI call).
    Defined in `application/`. Implemented by the application itself.
  - *Secondary (driven) port* — The application drives external systems (DB, email).
    Defined as a `Protocol` in `domain/repositories/` or `application/ports/`.
    Implemented by infrastructure adapters.
- **Adapter** — A concrete implementation of a port. Lives in `infrastructure/`.

### Key insight
The hexagonal model makes testability explicit: swap any adapter with a fake.
A `SqlAlchemyUserRepository` and an `InMemoryUserRepository` both implement the
same `UserRepository` Protocol. Your application service sees only the Protocol.

```python
# domain/repositories/user_repository.py
from typing import Protocol
from uuid import UUID
from ..entities.user import User

class UserRepository(Protocol):
    def find_by_id(self, user_id: UUID) -> User | None: ...
    def find_by_email(self, email: str) -> User | None: ...
    def save(self, user: User) -> None: ...
    def delete(self, user_id: UUID) -> None: ...
```

```python
# infrastructure/persistence/sql_user_repository.py
from uuid import UUID
from sqlalchemy.orm import Session
from domain.entities.user import User
from domain.repositories.user_repository import UserRepository

class SqlAlchemyUserRepository:  # implements UserRepository structurally
    def __init__(self, session: Session) -> None:
        self._session = session

    def find_by_id(self, user_id: UUID) -> User | None:
        ...

    def find_by_email(self, email: str) -> User | None:
        ...

    def save(self, user: User) -> None:
        ...

    def delete(self, user_id: UUID) -> None:
        ...
```

```python
# tests/unit/fakes/fake_user_repository.py
from uuid import UUID
from domain.entities.user import User

class FakeUserRepository:  # also implements UserRepository structurally
    def __init__(self) -> None:
        self._store: dict[UUID, User] = {}

    def find_by_id(self, user_id: UUID) -> User | None:
        return self._store.get(user_id)

    def find_by_email(self, email: str) -> User | None:
        return next((u for u in self._store.values() if u.email == email), None)

    def save(self, user: User) -> None:
        self._store[user.id] = user

    def delete(self, user_id: UUID) -> None:
        self._store.pop(user_id, None)
```

---

## 3. DDD Tactical Patterns

### Entity
- Has identity that persists through state changes.
- Two entities with the same data but different IDs are not equal.
- Identity is a UUID, not a DB auto-increment (avoids infrastructure leak).

```python
from dataclasses import dataclass, field
from uuid import UUID, uuid4

@dataclass
class User:
    id: UUID = field(default_factory=uuid4)
    email: str = ""
    name: str = ""

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, User):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)
```

### Value Object
- No identity. Two VOs with same data ARE equal.
- Immutable. Validated at construction.
- Model domain concepts: `Money`, `EmailAddress`, `DateRange`, `Coordinates`.

```python
from dataclasses import dataclass
import re

@dataclass(frozen=True)
class EmailAddress:
    value: str

    def __post_init__(self) -> None:
        if not re.match(r"[^@]+@[^@]+\.[^@]+", self.value):
            raise ValueError(f"Invalid email: {self.value}")
```

### Aggregate
- A cluster of entities and VOs treated as a single unit of consistency.
- Has one **Aggregate Root** — the only object external code holds a reference to.
- Enforces all invariants (business rules) for the cluster.
- Only the aggregate root has a repository.

### Repository
- Abstracts collection semantics over aggregates. Looks like an in-memory
  collection; hides DB details.
- One repository per aggregate root. Never one per entity.
- Defined as a Protocol in domain. Implemented in infrastructure.

### Domain Event
- A fact that has happened in the domain. Past tense. Immutable.
- Used to decouple side effects (send email after `UserRegistered`).
- Emitted by entities/aggregates, dispatched by application layer.

```python
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

@dataclass(frozen=True)
class UserRegistered:
    user_id: UUID
    email: str
    occurred_at: datetime
```

### Domain Service
- Stateless operation that spans multiple aggregates and doesn't naturally
  belong to any one of them.
- Example: `TransferFundsService` that coordinates `SourceAccount` and
  `DestinationAccount`.

---

## 4. CQRS (Command Query Responsibility Segregation)

### Principle
Separate the model you use to update state from the model you use to read state.

- **Command** — Intent to change state. Has side effects. Returns nothing or
  a minimal acknowledgment. Must be immutable.
- **Query** — Request for data. No side effects. Returns a read model.

### Folder placement
```
application/
├── commands/
│   └── create_user.py          # @dataclass(frozen=True) class CreateUser
├── queries/
│   └── get_user_by_id.py       # @dataclass(frozen=True) class GetUserById
└── handlers/
    ├── create_user_handler.py  # class CreateUserHandler
    └── get_user_handler.py     # class GetUserByIdHandler
```

### Handler pattern
Each handler handles exactly one command or query. Handlers are the only place
where application logic lives. They are thin orchestrators.

```python
from dataclasses import dataclass
from uuid import UUID
from domain.repositories.user_repository import UserRepository
from domain.entities.user import User
from application.commands.create_user import CreateUser

@dataclass
class CreateUserHandler:
    _repository: UserRepository

    def handle(self, command: CreateUser) -> UUID:
        user = User(email=command.email, name=command.name)
        self._repository.save(user)
        return user.id
```

### When NOT to use CQRS
Simple CRUD apps with no complex domain. CQRS adds indirection. The tradeoff
is worth it when reads and writes have substantially different optimization needs
or when the command model is significantly more complex than the query model.

---

## 5. Vertical Slice Architecture

### Core idea
Organize by feature (vertical cut through all layers), not by layer (horizontal
cut across all features). Each feature is self-contained: its own models, its
own handlers, its own persistence logic.

### Structure
```
features/
├── auth/
│   ├── domain.py           # ← Only auth domain objects
│   ├── commands.py         # ← Only auth commands
│   ├── handlers.py         # ← Only auth handlers
│   ├── repository.py       # ← Auth-specific port + implementation
│   └── router.py           # ← Auth HTTP routes
├── billing/
│   └── ...
```

### Governance rules (critical)
- Feature A never imports Feature B directly.
- Cross-feature communication: domain events published to a shared event bus,
  or through a shared kernel (`shared/`).
- Shared kernel contains only things with zero reason to change per feature:
  base types, logging config, common exceptions, shared DB session.

### When to choose vertical slice
- Large teams where different features are owned by different developers.
- Features have very different read/write characteristics.
- Features are likely to be extracted into separate services later.

---

## 6. Feature-Sliced Design (FSD) for Python

FSD originated in the frontend (React) world but its core ideas translate
directly to Python backend/API services.

### FSD layers (top = user-facing, bottom = foundational)
1. `app/` — Application initialization, routing, DI wiring.
2. `pages/` / `processes/` — (frontend concept; maps to `workers/` or `flows/` in backend)
3. `features/` — User-facing features with business logic.
4. `entities/` — Shared domain entities used across features.
5. `shared/` — Utilities, base classes, cross-cutting infrastructure.

### Import direction rule in FSD
Upper layers can import from lower layers. Lower layers must not import from upper.
Within a layer, slices are isolated — no cross-slice imports.

### Python adaptation
```
src/<package>/
├── app/            # Composition root, main.py, container
├── features/       # Auth, billing, notifications (vertical slices)
├── entities/       # Shared domain entities (User, Organization)
├── shared/         # Logging, exceptions, base types, DB session
```

---

## 7. Paradigm Comparison

| Criterion | Layered Clean Arch | Vertical Slice | Hybrid FSD |
|---|---|---|---|
| Cognitive load | Low per layer, high total | Low per feature | Medium |
| Testability | Excellent | Excellent | Excellent |
| Cross-feature code | Shared infra layer | Shared kernel only | Shared `entities/` + `shared/` |
| New developer navigation | Predictable, consistent | Intuitive per feature | Requires FSD knowledge |
| Scaling to microservices | Feature → service boundary unclear | Feature = service boundary | Feature = service boundary |
| CRUD-heavy apps | Overkill for simple CRUD | Better fit | Good fit |
| Complex domain | Best fit | Needs discipline | Good fit |

---

## 8. Protocol vs ABC: The Definitive Python Decision

### Use `typing.Protocol` when:
- Defining a port (boundary contract between layers).
- The consumer of the interface should not inherit from it.
- You want structural typing (duck typing with type checker support).
- The implementor may be a third-party class you don't control.

### Use `abc.ABC` when:
- You have shared concrete implementation that subclasses inherit.
- You need runtime `isinstance()` checks to enforce the contract.
- You're building a plugin system where developers register implementations.
- You want instantiation to fail at runtime if abstract methods are missing.

### Decision matrix

```
Does the implementor need to inherit? → ABC
Does the implementor just need the right methods? → Protocol

Is it a port/adapter boundary? → Protocol
Is it a base class with shared code? → ABC

Do you need isinstance() checks at runtime? → ABC (register with register())
Is static type checking sufficient? → Protocol

Is the implementor a third-party class? → Protocol (no inheritance needed)
Is the implementor your own class hierarchy? → either, prefer Protocol
```

### Anti-patterns
- `ABC` with zero concrete methods → just use `Protocol`.
- `Protocol` when you need runtime instantiation prevention → use `ABC`.
- Mixing ABC inheritance with Protocol structural checks on the same class.
