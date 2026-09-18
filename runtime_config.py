"""Validate runtime settings without creating an app, engine, or connection."""

import os
from urllib.parse import urlsplit

from sqlalchemy.engine import make_url


PROXY_HEADERS = ("for", "proto", "host", "port", "prefix")
TEST_SECRET = "runtime-tests-only-not-for-production"


def runtime_environment(environ, environment=None):
    mode = environment if environment is not None else environ.get("FLASK_ENV", "production")
    if mode not in {"production", "development", "testing"}:
        raise RuntimeError("FLASK_ENV must be production, development, or testing")
    return mode


def _integer(environ, name, default, minimum):
    raw = environ.get(name, str(default))
    if not isinstance(raw, str) or not raw.isascii() or not raw.isdecimal():
        raise RuntimeError(f"{name} must be an integer >= {minimum}")
    try:
        value = int(raw)
    except ValueError:
        raise RuntimeError(f"{name} must be an integer >= {minimum}") from None
    if value < minimum:
        raise RuntimeError(f"{name} must be an integer >= {minimum}")
    return value


def _origins(environ, mode):
    raw = environ.get("CORS_ORIGINS")
    if raw is None:
        raw = environ.get("FRONTEND_URL", "http://localhost:5173" if mode == "development" else "")
    if not raw.strip():
        return ()
    origins = []
    for item in raw.split(","):
        origin = item.strip()
        try:
            parsed = urlsplit(origin)
            valid = (
                parsed.scheme in {"http", "https"}
                and parsed.hostname
                and not parsed.username
                and not parsed.password
                and not parsed.path
                and not parsed.query
                and not parsed.fragment
                and not any(char.isspace() for char in origin)
                and not any(char in origin for char in "*\\^$(){}|?#")
                and (parsed.port is None or parsed.port > 0)
                and not parsed.netloc.endswith(":")
                and "@" not in parsed.netloc
            )
        except ValueError:
            valid = False
        if not valid:
            raise RuntimeError("CORS origins must be exact HTTP(S) origins without paths or wildcards")
        if origin not in origins:
            origins.append(origin)
    return tuple(origins)


def build_runtime_config(environ=None, *, environment=None):
    environ = os.environ if environ is None else environ
    mode = runtime_environment(environ, environment)
    # Testing cannot inherit a deployment database, secret, origin, or proxy trust.
    settings = {} if mode == "testing" else environ
    database_url = settings.get("DATABASE_URL")
    if mode == "testing":
        database_url = "sqlite:///:memory:"
    elif database_url is None and mode == "development":
        database_url = "sqlite:///cookbook.db"
    if not database_url or not database_url.strip():
        raise RuntimeError("DATABASE_URL must be set")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    try:
        parsed_url = make_url(database_url)
        valid_database = bool(parsed_url.database)
        if mode == "production":
            valid_database = valid_database and parsed_url.drivername in {
                "postgresql", "postgresql+psycopg2",
            }
        # Force validation of an explicitly supplied port without connecting.
        parsed_url.port
    except (TypeError, ValueError):
        valid_database = False
    except Exception:
        # SQLAlchemy parser errors can contain the credential-bearing input.
        raise RuntimeError("DATABASE_URL is invalid") from None
    if not valid_database:
        raise RuntimeError("DATABASE_URL must name a database (PostgreSQL with psycopg2 in production)")

    secret = TEST_SECRET if mode == "testing" else settings.get("JWT_SECRET_KEY")
    if not secret and mode == "development":
        secret = "dev-secret"
    if not secret or not secret.strip() or (mode == "production" and secret in {"dev-secret", TEST_SECRET}):
        raise RuntimeError("JWT_SECRET_KEY must be set to a non-development secret")

    return {
        "RUNTIME_ENV": mode,
        "TESTING": mode == "testing",
        "DEBUG": False,
        "SQLALCHEMY_DATABASE_URI": database_url,
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "JWT_SECRET_KEY": secret,
        "API_CORS_ORIGINS": _origins(settings, mode),
        "MAX_CONTENT_LENGTH": _integer(settings, "MAX_CONTENT_LENGTH", 1024 * 1024, 1),
        **{
            f"PROXY_FIX_X_{header.upper()}": _integer(settings, f"PROXY_FIX_X_{header.upper()}", 0, 0)
            for header in PROXY_HEADERS
        },
    }
