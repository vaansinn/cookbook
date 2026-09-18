"""Run backend unittest scripts in separate, disposable local environments.

No dotenv, inherited database URL, or network database is used by this runner.
PostgreSQL release verification is deliberately a separate, explicit command.
"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def test_environment(environ, database):
    allowed = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"}
    env = {key: value for key, value in environ.items() if key.upper() in allowed}
    env.update(FLASK_SKIP_DOTENV="1", FLASK_ENV="development",
               JWT_SECRET_KEY="disposable-test-key-not-a-production-credential-123456789",
               DATABASE_URL="sqlite:///" + database.as_posix(),
               PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8")
    return env


def main():
    files = sorted((ROOT / "tests" / "backend").glob("test_*.py"))
    failed = []
    with tempfile.TemporaryDirectory(prefix="cookbook-unit-") as directory:
        for file in files:
            env = test_environment(os.environ, Path(directory) / (file.stem + ".db"))
            print(f"\nRunning {file.name}", flush=True)
            # Explicitly disable dotenv even when checking older app versions.
            bootstrap = "import dotenv,runpy,sys; dotenv.load_dotenv=lambda *a,**k:False; p=sys.argv[1]; sys.argv=[p,'-v']; runpy.run_path(p,run_name='__main__')"
            result = subprocess.run([sys.executable, "-c", bootstrap, str(file)], cwd=ROOT, env=env)
            if result.returncode:
                failed.append(file.name)
    print(f"Backend scripts: {len(files) - len(failed)}/{len(files)} passed")
    if failed:
        print("Failed: " + ", ".join(failed))
    return bool(failed)


if __name__ == "__main__":
    sys.exit(main())
