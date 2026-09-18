"""Local PostgreSQL only: python scripts/local_dev.py init|serve.

Use an existing Python with the project dependencies. Docker is managed separately.
No overrides, dotenv, resets, account fixtures, or production imports are supported.
"""
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
INIT_MARKER = ROOT / ".local" / "initialization-incomplete"
OS_KEYS = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"}
DATABASE_URL = (
    "postgresql+psycopg2://cookbook_local:cookbook-local-development-only"
    "@localhost:55433/cookbook_dev?" + urlencode({
        "hostaddr": "127.0.0.1", "connect_timeout": "5", "passfile": os.devnull,
        "sslmode": "disable",
        "options": "-c statement_timeout=30000 -c lock_timeout=5000 -c search_path=public",
    })
)
SETTINGS = {
    "DATABASE_URL": DATABASE_URL, "FLASK_ENV": "development", "FLASK_SKIP_DOTENV": "1",
    "FLASK_DEBUG": "0", "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8",
    "JWT_SECRET_KEY": "cookbook-local-only-stable-jwt-key-never-use-in-production-2026",
    "FRONTEND_URL": "http://localhost:5173", "CORS_ORIGINS": "",
}
SYNC_COMMANDS = ("sync-recipes", "sync-glossary", "sync-skills", "sync-lessons")
CONTENT_TABLES = ("dishes", "recipe_tiers", "food_items", "glossary_entries", "skills", "lessons")


class Refused(Exception):
    """Invalid configuration or database state; no further work is allowed."""


def isolated_env(environ):
    return {**{k: v for k, v in environ.items() if k.upper() in OS_KEYS}, **SETTINGS}


def validate_parent(environ):
    """Reject attempted runtime overrides without echoing names or values."""
    prefixes = ("FLASK_", "PG", "SQLALCHEMY_", "JWT_", "PROXY_FIX_", "COOKBOOK_")
    names = {"DATABASE_URL", "CORS_ORIGINS", "FRONTEND_URL", "MAX_CONTENT_LENGTH"}
    if any(k.upper() in names or k.upper().startswith(prefixes) for k in environ):
        raise Refused("Remove database/application environment overrides before launching.")


def validate_worker(environ):
    # Run before ANY third-party/application imports, including direct worker calls.
    if (any(environ.get(k) != v for k, v in SETTINGS.items())
            or any(k not in SETTINGS and k.upper() not in OS_KEYS for k in environ)):
        raise Refused("Worker requires the exact isolated local-development environment.")


def load_database_tools():
    import psycopg2  # noqa: F401 -- require the PostgreSQL driver, never SQLite
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.script import ScriptDirectory
    return sa, MigrationContext, ScriptDirectory(str(ROOT / "migrations"))


def inspect_database(sa, migration, scripts, engine, ready=False):
    """Read-only identity/schema barrier; serving also requires synced content."""
    with engine.connect() as connection:
        connection.execute(sa.text("SET TRANSACTION READ ONLY"))
        if connection.execute(sa.text("SELECT current_database()")).scalar_one() != "cookbook_dev":
            raise Refused("Connected database does not match cookbook_dev.")
        current = set(migration.configure(connection).get_current_heads())
        known = {revision.revision for revision in scripts.walk_revisions()}
        if current - known:
            raise Refused("Database has unknown migrations.")
        if not current:
            occupied = connection.execute(sa.text("""
                SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND n.nspname NOT LIKE 'pg_toast%')
            """)).scalar_one()
            if occupied:
                raise Refused("Unversioned nonempty database; no reset is provided.")
        if ready:
            if not current or current != set(scripts.get_heads()):
                raise Refused("Run init to bring the database to migration head.")
            for table in CONTENT_TABLES:
                if not connection.execute(sa.text(
                    f"SELECT EXISTS (SELECT 1 FROM public.{table})"
                )).scalar_one():
                    raise Refused("Run init to populate all required local content.")
    if ready:
        validate_content(sa, engine)


def validate_content(sa, engine):
    # Reuse the stored bilingual lesson/step-link checks, not just row counts.
    sys.path.insert(0, str(ROOT / "scripts"))
    from verify_postgres import assert_content
    assert_content(sa, engine)


def load_app():
    sys.path.insert(0, str(ROOT))
    import dotenv
    dotenv.load_dotenv = lambda *args, **kwargs: False
    from app import app
    return app


def initialize(app):
    cli = app.test_cli_runner()
    for index, command in enumerate((("db", "upgrade", "head"), *((name,) for name in SYNC_COMMANDS))):
        # Click captures command diagnostics; never echo potential credentials.
        if cli.invoke(args=list(command)).exit_code:
            return 10 + index
    return 0


def worker(action):
    engine = None
    try:
        if action not in {"init", "serve"}:
            raise Refused("Unsupported action.")
        validate_worker(os.environ)
        if action == "serve" and INIT_MARKER.exists():
            return 4
        sa, migration, scripts = load_database_tools()
        engine = sa.create_engine(DATABASE_URL, poolclass=sa.pool.NullPool)
        inspect_database(sa, migration, scripts, engine, ready=action == "serve")
        app = load_app()
        if app.config["SQLALCHEMY_DATABASE_URI"] != DATABASE_URL:
            raise Refused("Application database target changed.")
        if action == "init":
            INIT_MARKER.parent.mkdir(parents=True, exist_ok=True)
            INIT_MARKER.touch()
            failure = initialize(app)
            if failure:
                return failure
            inspect_database(sa, migration, scripts, engine, ready=True)
            INIT_MARKER.unlink()
        else:
            app.run(host="127.0.0.1", port=5100, debug=False, use_reloader=False,
                    use_debugger=False, load_dotenv=False)
        return 0
    except Refused:
        return 2
    except (ImportError, OSError):
        return 3
    except Exception:
        # Includes driver/SQL errors: never expose connection strings or SQL.
        return 3
    finally:
        if engine is not None:
            engine.dispose()


def main(argv=None, environ=None):
    argv = sys.argv[1:] if argv is None else argv
    environ = os.environ if environ is None else environ
    if argv in (["--help"], ["-h"]):
        print(__doc__)
        return 0
    if len(argv) != 1 or argv[0] not in {"init", "serve"}:
        print("Usage: python scripts/local_dev.py init|serve (no overrides)")
        return 2
    try:
        validate_parent(environ)
    except Refused as error:
        print("REFUSED: " + str(error))
        return 2
    print("WARNING: stable synthetic JWT key for loopback development only; never use in production.", flush=True)
    print("Checking cookbook_dev at localhost:55433; API bind is 127.0.0.1:5100.", flush=True)
    bootstrap = "import runpy,sys; sys.exit(runpy.run_path(sys.argv[1])['worker'](sys.argv[2]))"
    try:
        result = subprocess.run(
            [sys.executable, "-I", "-B", "-u", "-c", bootstrap, str(Path(__file__).resolve()), argv[0]],
            cwd=ROOT, env=isolated_env(environ), stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=300 if argv[0] == "init" else None,
        )
        code = result.returncode
    except subprocess.TimeoutExpired:
        print("FAILED: init timed out; local data may be partially synced. Rerun init; no reset is performed.")
        return 1
    except OSError:
        code = 3
    except KeyboardInterrupt:
        return 130
    messages = {
        1: "FAILED: migration/sync failed; local data may be partially initialized. Rerun init.",
        2: "REFUSED: invalid target or initialization state. Serve requires a successful init; no reset is provided.",
        3: "UNAVAILABLE: check this Python's existing dependencies, local PostgreSQL, and API port.",
        4: "INCOMPLETE: a previous init failed or was interrupted. Rerun init successfully before serving.",
        **{10 + i: "FAILED: " + stage + ". Local initialization is incomplete; fix the command and rerun init."
           for i, stage in enumerate(("db upgrade head", *SYNC_COMMANDS))},
    }
    if code:
        print(messages.get(code, "FAILED: local-development child exited unexpectedly."))
    elif argv[0] == "init":
        print("Initialized: migrations at head and all four content syncs completed.")
    return code if code in messages or code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
