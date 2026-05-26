# Python Architecture Anti-Patterns

Reference this file when reviewing or auditing existing code. These are
diagnostic signals — each one points to a specific architectural failure.

---

## Layer Violations

### Infra import in Domain
```python
# WRONG: domain/entities/user.py
from sqlalchemy import Column, String  # ← infrastructure in domain
```
**Why broken:** Domain must be framework-agnostic. SQLAlchemy is an adapter.
**Fix:** Use plain `@dataclass` in domain. Create a separate ORM model in
`infrastructure/persistence/models/user_model.py` that maps to the domain entity.

---

### Business logic in presentation
```python
# WRONG: presentation/api/users.py
@router.post("/users")
def create_user(data: UserCreateSchema):
    if db.query(User).filter_by(email=data.email).first():
        raise HTTPException(400, "Email exists")
    user = User(email=data.email)
    db.add(user)
    db.commit()
    return user
```
**Why broken:** Duplicate-email check is domain logic. DB calls are infra.
Presentation should only: deserialize → dispatch command → serialize response.
**Fix:** Move the logic to a `CreateUserHandler` in application layer. Move
persistence to a repository. Presentation calls `handler.handle(CreateUser(...))`.

---

### Application importing infrastructure
```python
# WRONG: application/handlers/create_user_handler.py
from infrastructure.persistence.sql_user_repository import SqlAlchemyUserRepository

class CreateUserHandler:
    def __init__(self):
        self._repo = SqlAlchemyUserRepository()  # ← concrete infra in application
```
**Why broken:** Application is now coupled to SQLAlchemy. Can't test without DB.
**Fix:** Accept `UserRepository` Protocol in `__init__`. Wire concrete at
composition root.

---

### Feature A importing Feature B (vertical slice violation)
```python
# WRONG: features/billing/handlers.py
from features.auth.repository import UserRepository  # ← direct cross-feature import
```
**Fix:** Publish a `UserRegistered` domain event. Billing subscribes to it.
Or extract `User` into `entities/` shared layer.

---

## God Objects

```python
# WRONG
class ApplicationService:
    def create_user(self): ...
    def send_email(self): ...
    def process_payment(self): ...
    def generate_report(self): ...
    def notify_slack(self): ...
```
**Why broken:** Violates SRP. Grows unboundedly. Impossible to test in isolation.
**Fix:** One handler per use case. One service per domain concern.

---

## Anemic Domain Model

```python
# WRONG: domain/entities/order.py
@dataclass
class Order:
    id: UUID
    status: str
    items: list

# WRONG: application/services/order_service.py
class OrderService:
    def submit(self, order: Order):
        if order.status != "draft":
            raise ValueError("...")
        order.status = "submitted"  # ← business logic outside entity
```
**Why broken:** The entity is a data bag. Business rules scatter across services.
**Fix:** Push invariants into the entity:
```python
@dataclass
class Order:
    id: UUID
    status: str
    items: list

    def submit(self) -> None:
        if self.status != "draft":
            raise DomainError("Only draft orders can be submitted")
        self.status = "submitted"
```

---

## Service Locator

```python
# WRONG
class CreateUserHandler:
    def handle(self, command: CreateUser) -> None:
        repo = ServiceLocator.get(UserRepository)  # ← hidden dependency
```
**Why broken:** Dependencies are invisible. Can't tell what this class needs
without running it. Untestable without mocking global state.
**Fix:** Constructor injection. Every dependency is declared in `__init__`.

---

## Fat `__init__.py` used for logic

```python
# WRONG: domain/__init__.py
def create_user(email: str) -> User:
    ...

class UserRepository:
    ...
```
**Why broken:** `__init__.py` is a namespace declaration, not a logic container.
Navigation breaks. Import paths become ambiguous.
**Fix:** Logic lives in named modules. `__init__.py` re-exports public API only.
```python
# domain/__init__.py — correct
from .entities.user import User
from .value_objects.email import EmailAddress
```

---

## Global Mutable State

```python
# WRONG
_db_connection = None

def get_db():
    global _db_connection
    if _db_connection is None:
        _db_connection = create_engine(...)
    return _db_connection
```
**Why broken:** Untestable. Race conditions in async code. Lifecycle unclear.
**Fix:** DI container manages connection lifecycle. Session injected per-request.

---

## Flat Structure (no layers)

```
src/
├── models.py          # 800 lines: domain + ORM mixed
├── services.py        # 1200 lines: all business logic
├── routes.py          # 600 lines: HTTP + logic mixed
└── utils.py           # 400 lines: everything else
```
**Why broken:** Zero separation of concerns. Every change touches multiple
concerns. Impossible to test domain in isolation. Can't add a CLI without
duplicating logic.

---

## Tests That Touch Production Infrastructure

```python
# WRONG: tests/unit/test_create_user.py
def test_create_user():
    db = create_engine("postgresql://localhost/testdb")  # ← real DB in unit test
    ...
```
**Why broken:** Unit tests must be fast and offline. The moment a unit test
needs a running DB, it's an integration test.
**Fix:** Unit tests use fakes (in-memory repositories). Integration tests use
a real DB, isolated and reset between runs.

---

## Type Ignore Sprawl

```python
result = some_function()  # type: ignore
another = something_else()  # type: ignore[attr-defined]
```
**Why broken:** `# type: ignore` is technical debt. Three or more in a file
signals the module boundary is wrong or the typing is unresolved.
**Acceptable:** At true integration boundaries where third-party stubs are
missing. Not acceptable in domain or application layers.

---

## Missing `__all__` in Public Modules

```python
# WRONG: domain/__init__.py — no __all__, everything leaks
from .entities.user import User
from .entities._internal_thing import _PrivateThing  # ← leaks
```
**Fix:** Define `__all__` to explicitly control the public surface.
```python
__all__ = ["User", "EmailAddress", "UserRepository"]
```

---

## Requirements.txt Alongside pyproject.toml

Having both `requirements.txt` and `pyproject.toml` with overlapping deps.
**Why broken:** Two sources of truth. They drift. CI may install different
versions than dev.
**Fix:** `pyproject.toml` is the source. If you need a flat file for legacy
tooling: `uv export --format requirements-txt > requirements.txt` (generated,
not hand-maintained).

---

## Using Mutable Default Arguments as DI

```python
# WRONG
class UserService:
    def __init__(self, repo=SqlAlchemyUserRepository()):  # ← instantiated at import
        self._repo = repo
```
**Why broken:** The concrete class is instantiated at module import time.
Single global instance. Also a classic Python mutable-default-argument bug.
**Fix:** Default to `None`, type as `UserRepository | None`, raise if not provided.
Or use DI container.

---

## Circular Imports

```
domain/entities/user.py → imports from domain/services/auth.py
domain/services/auth.py → imports from domain/entities/user.py
```
**Why broken:** Python resolves this at import time, causing `ImportError` or
partial initialization bugs.
**Fix:** Circular imports always indicate a boundary violation. Either extract
the shared concept, or invert the dependency using a Protocol.
