# QA execution ledger — launch review

Round 1 is complete; no diagnostic work or environment setup remains. My bounded report is delivered above, and I’m ready for cross-review.

Final execution ledger:

| Backend file | Passed |
|---|---:|
| `test_fix1_cooklog_snapshot_validation.py` | 4 |
| `test_fix2_snapshot_preserves_step_ids.py` | 4 |
| `test_fix3_snapshot_capture_race.py` | 1 |
| `test_fix5_sync_requires_both_languages.py` | 2 |
| `test_hardening_migration.py` | 1 |
| `test_step3c_lessons_api.py` | 10 |
| `test_step3c_reflections.py` | 10 |
| `test_teaching_hardening.py` | 13 |
| **Total** | **45** |

Each ran separately using:

```powershell
& 'D:/Projects/cookbook/venv/Scripts/python.exe' -c $qaRunner $_.FullName
```

`$qaRunner` executed the selected file with `runpy.run_path`, supplied `-v`, disabled `dotenv.load_dotenv`, and applied that same disablement to migration subprocesses. Environment overrides were `PYTHONDONTWRITEBYTECODE=1`, `FLASK_SKIP_DOTENV=1`, and a diagnostic-only JWT key. Databases were newly created temporary SQLite files.

All four frontend scripts passed:

```powershell
Get-ChildItem tests/frontend/test_*.mjs | ForEach-Object {
  node --experimental-loader ./tests/frontend/extensionlessLoader.mjs $_.FullName
}
```

Results: 10 cook-session checks, nine guest-session checks, hardening assertions, and 32 palette contrast pairs plus consistency assertions. All exits were zero.

The successful build command, run from the worktree’s `frontend` directory with `QA_BUILD_OUT` pointing to a newly created temporary directory, was:

```powershell
node --input-type=module -e 'import {build} from "./node_modules/vite/dist/node/index.js"; await build({envFile:false,build:{outDir:process.env.QA_BUILD_OUT,emptyOutDir:false}});'
```

Build: **139 modules**, **340.69 kB JavaScript**, **13.93 kB CSS**, exit zero.

Errors and limits: default Python lacked SQLAlchemy; the existing project environment resolved this without installation. My first build invocation used the wrong working directory and emitted a Tailwind configuration warning; the corrected invocation passed. Tests emitted deprecation, connection-cleanup, experimental-loader, and disposable-short-JWT-key warnings. No test failed. Some PowerShell wildcard searches required correction; no product defect was inferred from them.

No fresh browser, physical-device, PostgreSQL, production, or native-package validation occurred. Temporary build artifacts and helper-created disposable databases may remain in system temp; product files were untouched.

Verdict remains **conditional for phone-first web launch**. The decisive findings are timer elapsed-time handling, contradictory bilingual cooking instructions, and outstanding PostgreSQL, broader production-workflow, and service-worker/device acceptance gates.
