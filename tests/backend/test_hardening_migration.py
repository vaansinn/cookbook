"""Populated SQLite migration smoke test; PostgreSQL remains a separate gate."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class MigrationTest(unittest.TestCase):
    def test_populated_pre_hardening_history_survives(self):
        with tempfile.TemporaryDirectory() as folder:
            env = {**os.environ, "FLASK_ENV": "development", "DATABASE_URL": "sqlite:///" + (Path(folder) / "history.db").as_posix()}
            def run(*args):
                result = subprocess.run([sys.executable, *args], cwd=ROOT, env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            run("-m", "flask", "db", "upgrade", "ee06718de8cd")
            run("-c", '''
from app import app, db
from models import User, Dish, CookLog
from sqlalchemy import MetaData, Table
with app.app_context():
    user=User(email="migration@example.test",password_hash="test-only")
    dish=Dish(slug="migration-dish")
    db.session.add_all([user,dish]); db.session.flush()
    cook=CookLog(user_id=user.id,dish_id=dish.id,level="basic",session_id="old-attempt")
    db.session.add(cook); db.session.flush()
    old=Table("cook_reflections",MetaData(),autoload_with=db.engine)
    db.session.execute(old.insert().values(user_id=user.id,cook_log_id=cook.id,outcome="happy"))
    db.session.commit()
''')
            run("-m", "flask", "db", "upgrade")
            run("-c", '''
from app import app, db
from models import CookLog, CookReflection, ReflectionMutation
with app.app_context():
    cook=CookLog.query.one(); row=CookReflection.query.one()
    assert cook.session_id=="old-attempt" and cook.snapshot_id is None
    assert row.outcome=="happy" and row.revision==1
    assert ReflectionMutation.query.count()==0
''')


if __name__ == "__main__": unittest.main()
