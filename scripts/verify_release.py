"""Opt-in LOCAL repeatability coordinator; not deployment or release approval.

Invocation: python -I -B scripts/verify_release.py --check-guards (pure), then
python -I -B scripts/verify_release.py --run (coordinator-authorized DB writes).
No arguments, unknown flags, resume/reset and partial/skip modes never execute.

All FIVE databases must already exist, be exclusively assigned to this run and
contain no user objects. Exact localhost:55432, explicit credentials, PostgreSQL
16 and the existing verifier confirmations are required, plus
COOKBOOK_TEST_RELEASE_CONFIRM=new-empty-five-database-release-rehearsal.
The five URL environment keys are listed in URL_KEYS below. No DATABASE_URL,
libpq/service configuration, dotenv or production secrets are inherited.

Before ANY fixture/migration, check every target read-only using the restore
verifier's stricter identity/emptiness guard and verify its fixed-path PG16 dump
clients (.local/postgres-runtime/pgsql/bin/pg_dump and pg_restore).
Then, serially: fresh/history + full sync + base planning transactions; repeat;
shopping/templates/preferences; new-format restore; populated X1b -> head.
No target is created/dropped/reset by this coordinator. Precreating both restore
targets means the existing restore verifier's optional creation path is unused.
Exclusive access throughout is a caller requirement, not a cross-process lease.

There is no automatic retry/resume or cleanup. On failure/timeout retain ALL
targets and stop: a nested verifier may still be winding down; do not reuse the
cluster until the coordinator has verified all worker processes have stopped.
Successful targets remain occupied. Existing PG09 targets are NOT suitable.
CI alone provisions a new ephemeral job-owned cluster, never a saved/local one.

Output contains fixed stage/status summaries, not child SQL, credentials, tokens
or row data. Exit 0=all stages passed, 1=failed, 2=refused, 3=runtime unavailable.
This proves only the executed current-build rehearsals, not old-backend rollback,
physical-browser acceptance, production recovery, publication or release consent.
"""
import argparse
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
URL_KEYS = ("COOKBOOK_TEST_DATABASE_URL", "COOKBOOK_TEST_HISTORY_URL",
            "COOKBOOK_TEST_RECOVERY_SOURCE_URL", "COOKBOOK_TEST_RESTORED_URL",
            "COOKBOOK_TEST_SHOPPING_UPGRADE_URL")
DATABASES = ("cookbook_test_fresh", "cookbook_test_history",
             "cookbook_test_recovery_source", "cookbook_test_restored",
             "cookbook_test_shopping_upgrade")
CONFIRM_KEY = "COOKBOOK_TEST_RELEASE_CONFIRM"
CONFIRM_VALUE = "new-empty-five-database-release-rehearsal"
CONFIRMATIONS = {
    CONFIRM_KEY: CONFIRM_VALUE,
    "COOKBOOK_TEST_POSTGRES_CONFIRM": "disposable-local-test-databases",
    "COOKBOOK_TEST_RESTORE_CONFIRM": "verifier-finished-synthetic-clone-and-restore",
    "COOKBOOK_TEST_SHOPPING_UPGRADE_CONFIRM": "new-empty-pre-fc86-fixture-upgrade",
}
OS_KEYS = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"}
STAGES = (
    ("fresh/history/sync/planning", "verify_postgres.py", (), 1200),
    ("repeat", "planning_repeat_postgres_checks.py", (), 300),
    ("shopping/templates/preferences", "planning_shopping_postgres_checks.py", (), 600),
    ("new-format restore", "verify_planning_restore.py", (), 900),
    ("populated X1b upgrade", "planning_shopping_postgres_checks.py", ("--check-populated-upgrade",), 600),
)


class Refused(Exception):
    pass


def helper(name):
    # Only our existing stdlib-only guard modules; never an application import.
    if name not in {"verify_postgres", "verify_planning_restore"}:
        raise Refused("Unknown verifier helper")
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_targets(env):
    """Pure, complete validation before any subprocess/driver import."""
    if any(env.get(key) != value for key, value in CONFIRMATIONS.items()):
        raise Refused("All four explicit release/verifier confirmations are required")
    if any(key in env for key in ("COOKBOOK_TEST_RESTORE_RESUME", "COOKBOOK_TEST_X1B_SCHEMA_SHA256")):
        raise Refused("Release orchestration never resumes an existing target")
    if any(not isinstance(env.get(key), str) for key in URL_KEYS):
        raise Refused("All five exact disposable target URLs are required")
    base, restore = helper("verify_postgres"), helper("verify_planning_restore")
    try:
        base.validate_targets(env)
        restore.validate_targets(env)
        # Reuse the base syntax/credential guard for the upgrade target, just as
        # upgrade_guard does. Never use this temporary validation URL to connect.
        raw = env[URL_KEYS[4]]
        suffix = "/" + DATABASES[4]
        if not raw.endswith(suffix):
            raise Refused("Invalid upgrade target")
        check = dict(env)
        check[URL_KEYS[0]] = raw[:-len(suffix)] + "/" + DATABASES[0]
        base.validate_targets(check)
    except (base.Refused, restore.Refused):
        raise Refused("Targets must name the five fixed databases on exact localhost:55432 with valid explicit credentials") from None
    urls = tuple(env[key] for key in URL_KEYS)
    principals = {(unquote(urlsplit(url).username), unquote(urlsplit(url).password)) for url in urls}
    if len(principals) != 1:
        raise Refused("All five targets must use the same disposable database principal")
    return urls


def isolated_env(env, urls):
    clean = {key: value for key, value in env.items() if key.upper() in OS_KEYS}
    clean.update(zip(URL_KEYS, urls))
    clean.update(CONFIRMATIONS)
    clean.update(FLASK_SKIP_DOTENV="1", PYTHONDONTWRITEBYTECODE="1",
                 PYTHONIOENCODING="utf-8", LANG="C.UTF-8")
    return clean


def stage_env(env, urls, stage):
    """Least-target environment; existing children sanitize again themselves."""
    clean = isolated_env(env, ())
    for key in CONFIRMATIONS:
        clean.pop(key, None)
    values = dict(zip(URL_KEYS, urls))
    if stage[1] in ("verify_postgres.py", "planning_repeat_postgres_checks.py"):
        keys = URL_KEYS[:2]
        confirmations = ("COOKBOOK_TEST_POSTGRES_CONFIRM",)
    elif stage[1] == "verify_planning_restore.py":
        keys = (URL_KEYS[0], URL_KEYS[2], URL_KEYS[3])
        confirmations = ("COOKBOOK_TEST_RESTORE_CONFIRM",)
    elif stage[2] == ("--check-populated-upgrade",):
        keys = (URL_KEYS[4],)
        confirmations = ("COOKBOOK_TEST_POSTGRES_CONFIRM", "COOKBOOK_TEST_SHOPPING_UPGRADE_CONFIRM")
    else:
        keys = (URL_KEYS[0],)
        confirmations = ("COOKBOOK_TEST_POSTGRES_CONFIRM",)
    clean.update({key: values[key] for key in keys})
    clean.update({key: CONFIRMATIONS[key] for key in confirmations})
    return clean


def preflight(env, urls):
    """All-target read-only barrier; no schema/fixture or provisioning writes."""
    base, restore = helper("verify_postgres"), helper("verify_planning_restore")
    restore.discover_runtime(env)
    sa = base.load_database_tools()
    engines = []
    try:
        for url in urls:
            engines.append(sa.create_engine(base.engine_url(sa, url), poolclass=sa.pool.NullPool))
        for engine, name in zip(engines, DATABASES):
            restore.inspect_empty(sa, engine, name)
    finally:
        for engine in engines:
            engine.dispose()


def run_stage(env, urls, stage):
    label, filename, flags, timeout = stage
    print("START: " + label, flush=True)
    # Credentials only in the sanitized environment; no shell or command override.
    result = subprocess.run(
        [sys.executable, "-I", "-B", "-X", "utf8", str(ROOT / "scripts" / filename), *flags],
        cwd=ROOT, env=stage_env(env, urls, stage), capture_output=True,
        text=True, encoding="utf-8", errors="replace", timeout=timeout,
    )
    if result.returncode:
        print("FAILED: " + label + "; targets retained; no retry/reset", flush=True)
        return result.returncode if result.returncode in (1, 2, 3) else 1
    print("PASS: " + label, flush=True)
    return 0


def worker():
    try:
        urls = validate_targets(os.environ)
    except Refused:
        print("REFUSED: release worker target/confirmation validation failed")
        return 2
    env = isolated_env(os.environ, urls)
    os.environ.clear()
    os.environ.update(env)
    try:
        preflight(env, urls)
        print("PASS: all five precreated targets empty; PG16 identity and client runtime verified", flush=True)
        for stage in STAGES:
            status = run_stage(env, urls, stage)
            if status:
                return status
        print("PASS: complete current-build release rehearsal; targets occupied and retained; NOT release approval", flush=True)
        return 0
    except Exception as error:
        # No raw errors: drivers/subprocesses may include credentials/private SQL.
        kind = type(error).__name__
        print("STOPPED: verification unavailable/refused/failed; retain targets and check workers before any reuse", flush=True)
        return 2 if kind == "Refused" else 3 if kind == "Blocked" else 1


def main(env=None, argv=None):
    env = os.environ if env is None else env
    argv = sys.argv[1:] if argv is None else list(argv)
    if argv not in (["--run"], ["--check-guards"], ["--help"], ["-h"]):
        # argparse's unknown-argument diagnostic would echo user-supplied URLs.
        print("REFUSED: choose exactly --check-guards or --run; no overrides, partial runs or resume")
        return 2
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--check-guards", action="store_true", help="validate supplied configuration only; no database/runtime I/O")
    modes.add_argument("--run", action="store_true", help="run ALL stages against five precreated empty exclusive targets")
    args = parser.parse_args(argv)
    try:
        urls = validate_targets(env)
    except Refused as error:
        print("REFUSED: " + str(error))
        return 2
    if args.check_guards:
        print("PASS: pure five-target configuration guards only; no connection/emptiness/runtime evidence")
        return 0
    bootstrap = "import runpy,sys; sys.exit(runpy.run_path(sys.argv[1])['worker']())"
    try:
        # The outer budget exceeds the sum of bounded stage budgets + preflight.
        result = subprocess.run(
            [sys.executable, "-I", "-B", "-X", "utf8", "-c", bootstrap, str(Path(__file__).resolve())],
            cwd=ROOT, env=isolated_env(env, urls), capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=3900,
        )
        # Only fixed messages emitted by THIS coordinator, never nested logs.
        allowed = {"START: " + stage[0] for stage in STAGES} | {"PASS: " + stage[0] for stage in STAGES}
        for line in result.stdout.splitlines():
            if line in allowed:
                print(line)
        status = result.returncode if result.returncode in (0, 1, 2, 3) else 1
        print("PASS: all release rehearsal stages; targets retained; no old-backend/release approval claim" if status == 0
              else "STOPPED: release rehearsal incomplete; retain targets and check workers; never reset/retry automatically")
        return status
    except (OSError, subprocess.TimeoutExpired):
        print("STOPPED: worker unavailable/timed out; targets retained; verify child termination before reuse")
        return 1


if __name__ == "__main__":
    sys.exit(main())
