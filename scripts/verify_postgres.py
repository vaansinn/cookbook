"""Opt-in, disposable PostgreSQL migration/sync smoke test (never a reset tool)."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
URL_KEYS = ("COOKBOOK_TEST_DATABASE_URL", "COOKBOOK_TEST_HISTORY_URL")
DATABASES = ("cookbook_test_fresh", "cookbook_test_history")
CONFIRM_KEY = "COOKBOOK_TEST_POSTGRES_CONFIRM"
CONFIRM_VALUE = "disposable-local-test-databases"
OLD_REVISION = "ee06718de8cd"
SYNC_COMMANDS = ("sync-recipes", "sync-glossary", "sync-skills", "sync-lessons")
CONTENT_TABLES = ("dishes", "recipe_tiers", "food_items", "glossary_entries", "skills", "lessons")
# Reject ambiguous URL syntax before a URL parser can normalize it. Credentials
# may contain percent-encoded punctuation, but hosts/paths/queries cannot.
URL_PATTERN = re.compile(
    r"postgresql(?:\+psycopg2)?://(?P<user>(?:[A-Za-z0-9_.~-]|%[0-9A-Fa-f]{2})+)"
    r":(?P<password>(?:[A-Za-z0-9_.~-]|%[0-9A-Fa-f]{2})+)"
    r"@localhost:55432/(?P<database>cookbook_test_(?:fresh|history))"
)


class Refused(Exception):
    """Unsafe input or a nonempty target; exit 2."""


class Blocked(Exception):
    """The required PostgreSQL runtime/connection is unavailable; exit 3."""


def validate_targets(env):
    """Pure validation of BOTH targets; imports no database/application code."""
    if env.get(CONFIRM_KEY) != CONFIRM_VALUE:
        raise Refused(f"Set {CONFIRM_KEY}={CONFIRM_VALUE} to explicitly opt in.")
    urls = []
    for key, database in zip(URL_KEYS, DATABASES):
        value = env.get(key, "")
        match = URL_PATTERN.fullmatch(value)
        if not match or match["database"] != database:
            raise Refused(f"{key} must name {database} on exact localhost:55432, with explicit credentials and no query/fragment.")
        for field in ("user", "password"):
            try:
                decoded = unquote(match[field], errors="strict")
            except UnicodeError:
                raise Refused(f"{key} has invalid credential encoding.") from None
            if any(ord(char) < 32 or ord(char) == 127 for char in decoded):
                raise Refused(f"{key} has control characters in credentials.")
        urls.append(value)
    # Explicit pair invariant, even though the stricter per-slot allowlist
    # already enforces it. Do not loosen either check independently.
    fresh, history = map(urlsplit, urls)
    if (fresh.hostname, fresh.port) != (history.hostname, history.port) or fresh.path == history.path:
        raise Refused("Targets must use the same local server and distinct databases.")
    return tuple(urls)


def isolated_env(env, urls):
    """Allowlist OS essentials; do not inherit PG*, DATABASE_URL or app secrets."""
    allowed = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"}
    result = {key: value for key, value in env.items() if key.upper() in allowed}
    result.update(zip(URL_KEYS, urls))
    result.update({CONFIRM_KEY: CONFIRM_VALUE, "FLASK_SKIP_DOTENV": "1",
                   "FLASK_ENV": "development", "PYTHONDONTWRITEBYTECODE": "1",
                   "PYTHONIOENCODING": "utf-8", "LANG": "C.UTF-8",
                   "JWT_SECRET_KEY": "disposable-postgres-test-key-never-used-for-real-accounts"})
    return result


def redact(output, urls):
    """Remove complete URLs and raw/decoded/repr forms of both credentials."""
    if isinstance(output, bytes):
        output = output.decode("utf-8", errors="replace")
    output = output or ""
    secrets = set(urls)
    for url in urls:
        parts = urlsplit(url)
        for value in (parts.username, parts.password):
            if value:
                decoded = unquote(value)
                secrets.update((value, decoded, repr(decoded)[1:-1], json.dumps(decoded)[1:-1]))
    for secret in sorted(secrets, key=len, reverse=True):
        output = re.sub(re.escape(secret), "[REDACTED]", output, flags=re.IGNORECASE)
    return output


def captured_run(command, env, urls, timeout=180):
    """No shell, no URL in argv; redact captured output before displaying it."""
    try:
        result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True,
                                text=True, encoding="utf-8", errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired as error:
        print(redact(error.stdout, urls))
        print(redact(error.stderr, urls))
        raise RuntimeError("Verification subprocess timed out; targets may be partially populated.") from None
    for output in (result.stdout, result.stderr):
        if output:
            print(redact(output, urls), end="" if output.endswith("\n") else "\n", flush=True)
    return result.returncode


def load_database_tools():
    try:
        import psycopg2  # noqa: F401 -- explicit driver gate, no SQLite fallback
        import sqlalchemy
        import alembic  # noqa: F401
        import flask_migrate  # noqa: F401
    except (ImportError, OSError):
        raise Blocked("PostgreSQL driver or migration dependencies unavailable in this Python runtime.") from None
    return sqlalchemy


def engine_url(sa, url):
    # hostaddr pins localhost to loopback even if DNS/hosts files are unusual.
    # Explicit credentials and a null passfile disable implicit credential files.
    return sa.engine.make_url(url).set(drivername="postgresql+psycopg2", query={
        "hostaddr": "127.0.0.1", "connect_timeout": "5", "passfile": os.devnull,
        "options": "-c statement_timeout=30000 -c lock_timeout=5000 -c search_path=public",
    })


def inspect_empty(sa, engine, database):
    with engine.connect() as connection:
        connection.execute(sa.text("SET TRANSACTION READ ONLY"))
        if connection.execute(sa.text("SELECT current_database()")).scalar_one() != database:
            raise Refused("Connected database does not match the validated target.")
        # pg_class covers tables, partitions, views, materialized views,
        # sequences, indexes and foreign tables, in ALL non-system schemas.
        occupied = connection.execute(sa.text("""
            SELECT EXISTS (
                SELECT 1 FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND n.nspname NOT LIKE 'pg_toast%'
            )
        """)).scalar_one()
        if occupied:
            raise Refused(f"{database} contains user relations; both targets must start empty. No reset is provided.")


def preflight(sa, engines):
    # Keep this entire read-only barrier before EVERY migration/fixture/sync.
    for engine, database in zip(engines, DATABASES):
        try:
            inspect_empty(sa, engine, database)
        except sa.exc.OperationalError:
            raise Blocked(f"Cannot connect to disposable {database} at localhost:55432.") from None
    print("Both targets are empty; migration/sync writes are now permitted.", flush=True)


def flask_command(url, urls, *args):
    env = isolated_env(os.environ, urls)
    # DATABASE_URL is an internal adapter for the existing app. It is generated
    # only from the validated test URL; never read from the caller's environment.
    env["DATABASE_URL"] = url
    bootstrap = (
        "import sys; sys.path.insert(0, sys.argv.pop(1)); "
        "import dotenv; dotenv.load_dotenv=lambda *a,**k:False; "
        "from flask.cli import main; main()"
    )
    if captured_run([sys.executable, "-I", "-B", "-X", "utf8", "-c", bootstrap, str(ROOT), "--app", "app", *args], env, urls):
        raise RuntimeError("Flask verification command failed: " + " ".join(args))


def rows(sa, engine, name):
    table = sa.Table(name, sa.MetaData(), schema="public", autoload_with=engine)
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(sa.select(table).order_by(*table.primary_key.columns)).mappings()]


def seed_history(sa, engine):
    """Insert through the OLD reflected schema, never current ORM defaults."""
    from datetime import datetime
    metadata = sa.MetaData()
    tables = {name: sa.Table(name, metadata, schema="public", autoload_with=engine)
              for name in ("users", "dishes", "cook_logs", "cook_reflections")}
    with engine.begin() as connection:
        def insert(name, **values):
            table = tables[name]
            return connection.execute(table.insert().values(**values).returning(table.c.id)).scalar_one()
        user = insert("users", email="postgres-history@example.test", password_hash="synthetic-not-a-login",
                      plan="free", created_at=datetime(2026, 1, 1))
        dish = insert("dishes", slug="postgres-history-fixture", created_at=datetime(2026, 1, 1))
        cook = insert("cook_logs", user_id=user, dish_id=dish, level="basic", session_id="old-attempt",
                      cooked_at=datetime(2026, 1, 1), lang=None, snapshot_id=None)
        insert("cook_reflections", user_id=user, cook_log_id=cook, outcome="happy",
               practiced_skill_confirmed=False, confidence=None, skill_slug=None,
               created_at=datetime(2026, 1, 1), updated_at=datetime(2026, 1, 1))
    return {name: rows(sa, engine, name) for name in tables}


def require(condition, message):
    # Unlike Python assert, these checks remain active under optimization.
    if not condition:
        raise RuntimeError(message)


def assert_history(sa, engine, before):
    for name, expected in before.items():
        actual = rows(sa, engine, name)
        # Content sync adds dishes, but must preserve the synthetic old dish.
        ids = {row["id"] for row in expected}
        actual = [row for row in actual if row["id"] in ids]
        if name == "cook_reflections":
            require(all(row.pop("revision") == 1 for row in actual), "Old reflection revision was not initialized to 1.")
        if name == "users":
            require(all(row.pop("email_verified") is False and row.pop("legacy_tokens_valid_after") is None
                        for row in actual), "Migration invented verification or revoked an old account.")
        require(actual == expected, f"Synthetic old history changed in {name}.")
    require(not rows(sa, engine, "reflection_mutations"), "Unexpected mutation receipts for old history.")


def assert_content(sa, engine):
    data = {name: rows(sa, engine, name) for name in CONTENT_TABLES}
    require(all(data.values()), "Content sync left a required content table empty.")
    dishes = {row["slug"]: row["id"] for row in data["dishes"]}
    for lesson in data["lessons"]:
        for lang in ("en", "de"):
            require(bool(lesson["title"].get(lang)) and bool(lesson["body"].get(lang)), "Lesson translation missing.")
            tiers = [row for row in data["recipe_tiers"] if row["dish_id"] == dishes.get(lesson["dish_slug"])
                     and row["level"] == lesson["level"] and row["lang"] == lang]
            require(len(tiers) == 1 and any(isinstance(step, dict) and step.get("id") == lesson["step_id"]
                                          for step in tiers[0]["steps"]), "Lesson step link does not resolve.")
    return data


def exercise(sa, engine, url, urls, history=False):
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    config = Config()
    config.set_main_option("script_location", str(ROOT / "migrations"))
    heads = set(ScriptDirectory.from_config(config).get_heads())
    before = None
    if history:
        flask_command(url, urls, "db", "upgrade", OLD_REVISION)
        before = seed_history(sa, engine)
    baseline = None
    for run in (1, 2):
        print(f"{'history' if history else 'fresh'}: upgrade/head + full sync, pass {run}", flush=True)
        flask_command(url, urls, "db", "upgrade", "head")
        require({row["version_num"] for row in rows(sa, engine, "alembic_version")} == heads,
                "Database did not reach migration head.")
        if before:
            assert_history(sa, engine, before)
        for command in SYNC_COMMANDS:
            flask_command(url, urls, command)
        current = assert_content(sa, engine)
        if baseline is not None:
            require(current == baseline, "Repeated content sync changed stored content or IDs.")
        baseline = current
        if before:
            assert_history(sa, engine, before)
        else:
            require(not rows(sa, engine, "cook_logs") and not rows(sa, engine, "cook_reflections")
                    and not rows(sa, engine, "reflection_mutations"), "Fresh sync invented user history.")
    if not history:
        env = isolated_env(os.environ, urls)
        env["DATABASE_URL"] = url
        if captured_run([sys.executable, "-I", "-B", "-X", "utf8", str(ROOT / "scripts/planning_postgres_checks.py")], env, urls):
            raise RuntimeError("PostgreSQL private planning checks failed")


def worker():
    urls = validate_targets(os.environ)
    # Defense in depth if worker() is called directly from an imported module.
    clean = isolated_env(os.environ, urls)
    os.environ.clear()
    os.environ.update(clean)
    engines = []
    try:
        sa = load_database_tools()
        for url in urls:
            engines.append(sa.create_engine(engine_url(sa, url), poolclass=sa.pool.NullPool))
        preflight(sa, engines)
        for index, engine in enumerate(engines):
            exercise(sa, engine, engine_url(sa, urls[index]).render_as_string(hide_password=False), urls,
                     history=bool(index))
        print("PASS: fresh/history upgrades, repeated full sync and private planning transactions. Migration rollback/backup restore NOT tested.")
        return 0
    except (Refused, Blocked) as error:
        print(f"{'REFUSED' if isinstance(error, Refused) else 'BLOCKED'}: {redact(str(error), urls)}")
        return 2 if isinstance(error, Refused) else 3
    except Exception as error:
        print("FAILED: " + redact(str(error), urls))
        # Stage locations are useful on Windows without printing SQL, locals,
        # environment variables or full exception representations.
        import traceback
        for frame in traceback.extract_tb(error.__traceback__)[-4:]:
            print(f"  at {Path(frame.filename).name}:{frame.lineno} ({frame.name})")
        return 1
    finally:
        for engine in engines:
            engine.dispose()


def main(env=None):
    env = os.environ if env is None else env
    try:
        urls = validate_targets(env)
    except Refused as error:
        print("REFUSED: " + str(error))  # validator messages never echo input
        return 2
    bootstrap = "import runpy,sys; sys.exit(runpy.run_path(sys.argv[1])['worker']())"
    try:
        return captured_run([sys.executable, "-I", "-B", "-X", "utf8", "-c", bootstrap, str(Path(__file__).resolve())],
                            isolated_env(env, urls), urls, timeout=900)
    except (OSError, RuntimeError) as error:
        print("FAILED: " + redact(str(error), urls))
        return 1


if __name__ == "__main__":
    # Windows consoles may default to a legacy code page; fixture/content logs
    # can contain Unicode. Do not turn a successful command into a print failure.
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")
    sys.exit(main())
