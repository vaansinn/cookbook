# Foundation batch — bounded implementation and council loop

Started 2026-09-13 from teaching-hardening HEAD `5c60456e32d4db4ac78c9a2d3e074ff3395a52f1` plus preserved existing prototype/docs changes. Root main remains unchanged. User authorizes up to three implement/check/council iterations, continuing safe independent work and collecting questions at the end. This supersedes the earlier planning-only boundary for this bounded batch, not the release/privacy/production gates.

## Scope and authority

Policy-independent foundations: auth request validation and current-user identity enforcement; fail-closed production configuration and test isolation; defensive service-worker caching; reproducible unit/build and disposable PostgreSQL verification infrastructure. No new planning schema, shared-data deletion semantics, account migration, JWT transport/lifetime change, premium policy, culinary changes, purchases, production inspection, deployment, commit or push.

Preserve guest cooking, existing valid account behavior, recipe snapshots and revision contracts. Nothing here establishes GDPR compliance or launch readiness. Unknown existing users/data, planning ownership, mail policy and hosting decisions remain unresolved.

Implementation workers use isolated detached worktrees for auth/config/worker changes; the coordinator reviews and applies patches to this development worktree. QA adds disjoint new infrastructure files here. No simultaneous writers on shared app/auth/worker/model files. Reviewers are read-only and may not spawn more agents.

## Iteration ledger

1. Completed: auth validation/current identity, fail-closed runtime, worker caching and verification infrastructure. Integrated 100 backend tests passed. Five independent reviews and their cross-review are retained in `foundation-council-1.md` and `foundation-council-1-cross.md`.
2. Completed: actual Flask/Compress shell-header compatibility, isolated child environment, CI loader correction, current-tier validation before personal-plan shopping writes, and retryable frontend identity verification. Integrated 106 backend tests and 107 frontend/prototype TAP tests passed. The council identified temporary-owner data loss and stale credential form navigation; see `foundation-council-2.md`.
3. Completed: preserve verified owner during temporary verification and return explicit credential outcomes; actual cooking-state subscribers and compiled Login/Register form continuations now tested. Final production build and 107 frontend/prototype TAP checks pass. All five final specialist reviews accept the bounded candidate with no remaining introduced must-fix in their inspected scope; see `foundation-council-3.md`. Stopped at the requested three-iteration limit, not because all independent future work is blocked. This is not foundation/launch completion.

The user's explicit three-iteration request governs this batch. Each council review concerns the changed candidate; the ordinary one-cross-review skill limit does not prevent the requested implementation iterations. Iterations 1–2 reused the same five seats. The final review requests did not return recoverable reports across a turn transition (all prior IDs returned `not_found`), so five fresh specialist reviewers inspect the saved findings and final source. They are not represented as the same agents. The chairman evaluates evidence and distinguishes missing tests from passes.

## Environment baseline

- Existing project Python environment supports Flask/SQLAlchemy but has no `psycopg2` driver.
- No PostgreSQL service/install was found in the bounded local checks; Docker CLI cannot connect to its daemon. No engine was installed or started. PostgreSQL execution remains blocked; build a guarded runnable test route without claiming execution.
- Existing frontend dependencies are available. Use temporary build output, disable dotenv for tests/builds and do not touch the running preview's assets.

## Deferred questions

Carry unresolved user-data continuity, private-vs-household ownership, account/mail/offline policies and provider/budget/device access questions to the final handoff. These do not justify unsafe guesses or prevent unrelated authorized hardening.

## Handoff

See [foundation-handoff.md](foundation-handoff.md) for the changed-file scope,
verification commands/results, remaining evidence gaps and consolidated decisions.
