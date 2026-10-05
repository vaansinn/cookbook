# Launch implementation — bounded agent dispatch plan

Date: **2026-09-27**. Planning deliverable, not an instruction to deploy or run
all packages immediately. [TODO.md](../../../TODO.md) remains the canonical
outstanding-work checklist. This document defines execution order; the adjacent
[dispatch manifest](dispatch-manifest-2026-09-27.json) supplies task packets.
[Council reports and chairman decisions](dispatch-council-2026-09-27.md).

## 1. Verified starting point

**Execution override, 2026-10-05:** Q01 now selects Android app first, iOS later,
public web/desktop deferred; Q05 requires audible alarms while locked. This
supersedes web/PWA-first scope and native deferral below. Read current TODO L18
and the Q&A register before dispatch. D01/D02/D04 Phase 1 artifacts exist; perform
Android N0 admission and rebaseline platform-dependent D03/D05/D08/D09/D13/D14
packets, including origin/auth and alarm architecture. Subsequent user priority:
connect the approved core design/features first; the alarm check must stay bounded.
D03's existing-API UI work can proceed without completed native alarms or new
session transport. Gate only its platform-specific assumptions, not the whole UI
leaf. Independent backend/data work can continue where contracts are unaffected.
Do not interpret these old
packets as authority to rewrite the app, submit to stores or publish a website.

- Integration checkout: `D:/Projects/cookbook/.worktrees/teaching-hardening`,
  branch `codex/teaching-pilot-hardening`, clean before these documentation edits.
- GitHub `vaansinn/cookbook` main and this checkout both at
  `04a414f218c909dea3c82e720d8d5ac8ba84e228`, checked today.
- [GitHub Verify run 35339011776](https://github.com/vaansinn/cookbook/actions/runs/35339011776)
  completed successfully on September 18, including backend/frontend/build and
  the five-database disposable PostgreSQL release rehearsal. The result was read
  today, not rerun today. L13's initial-CI uncertainty is resolved; future
  candidate-specific verification and operational recovery remain required.
- Root `D:/Projects/cookbook` is an older local main with unrelated untracked
  work. Do not execute from it, reset it, or stage its files. Recheck the exact
  integration SHA and dirty paths before every implementation batch.
- No new model/API integration, scheduling service or hook is required. Native
  subagent tools are available in this task; five `gpt-6-sol` reviewers actually
  ran with independent contexts. Model availability must be rechecked on resume.

## 2. Product boundary

Ship the agreed phone-first web/PWA product, real private SQL accounts and the
full **implemented** planning/events/shopping prototype behavior. Do not reduce
the release to a pretty recipe preview. Keep EN/DE, both themes, guest cooking,
existing records, retained teaching content and optional reflection.

No app-store packaging, personal recipe authoring, paid tiers, scanning, automatic
network inference, packs/Use the rest, shared batches or leftovers in this launch
batch. Their backlog remains in TODO. Configured recipe **preview** is required;
direct guided cooking from a planned configuration is deferred and must never
silently discard the selected options.

## 3. Waves and where the user is involved

| Wave | Packages and result | Parallelism | User checkpoint |
|---|---|---|---|
| 0 — Admit the work | D01 exposure/contracts; D02 PX evidence matrix; D04 release runbook, then D03 one wired recipe journey | Start D01/D02/D04; admit D03 when D01/D02 identify its safe boundary | None needed for inventories, existing-contract wiring and synthetic work |
| 1 — Safe account foundation | D05 sessions/reset/verification; D06 legacy lifecycle; D07 authored catalog mapping | Implement only admitted policy-independent leaves; backend shared changes serialized | Batch Q05–Q07 consequences after Wave 0; Q10 content approval before publication |
| 2 — Connected real product | D08 shared navigation/supporting screens; D09 account recovery UI; D10 complete catalog/PX parity | Frontend and backend leaf work can overlap after contracts; shared files have one owner | Q09 approve first actual wired slice; Q10 approve finite culinary/image set |
| 3 — Reliability and privacy | D11 measured capacity; D12 privacy/publication/recovery; D13 complete device/candidate acceptance | Measurements and test authoring parallel; database runs and content activation serial | Operator/retention/device access; later Q04/Q11/Q12 budget/domain/mail/support |
| 4 — Controlled launch | D14 council sign-off, beginner observations, exact release and aftercare | Human approvals cannot be parallelized away | Q13 participants; separate Q14 deployment/cutover approval |

Waves are a dependency map, not a reason to leave unrelated safe work idle.
For example, missing email-provider details do not stop a local fake-mail test,
and a culinary question does not stop navigation or session tests. Conversely,
an unapproved recipe cannot be seeded as creator-verified simply to unblock UI.

## 4. First batch — exact bounded assignments

### D01 — Contracts and exposed-data inventory (backend, security review)

Read actual auth/household/planning/public-link routes and existing contracts.
Write one route table: principal, data exposed, mutation owner, current access,
legacy disposition, test and unresolved decision. Draft session/recovery and
legacy-retention ADRs with options and user-visible consequences. Own the data
contract for content visibility after late sync failure, coordinating with D04's
operations procedure. Do not migrate,
retire endpoints, change permissions or select a paid/free policy in this slice.

Acceptance: every exposed route has a disposition; specify synthetic anonymous,
cross-account, removed-member, deleted-owner and revoked-link cases with exact
allowed disclosure and responses. Deleted/expired/revoked tokens,
public identity, invitations, former/last-member export/deletion and unattributed
merged grocery data are covered. Technical security choices belong to engineers;
ask the user only about consequential promises, retention and access policy.

### D02 — Production parity evidence map (QA, independent review)

Map all PX01–PX20 rows to real API routes, production screens, current tests and
missing browser outcomes. Mark prototype-only, source assertion, mounted fake
transport and real SQL/browser evidence separately. Carry September 18 CI as
baseline evidence, not proof every parity row passed. Turn each gap into a
bounded correction with exact files, fixture and negative case.

Acceptance: no omitted PX row; required configured previews and unavailable
content covered; clean-browser/second-device restore remains explicit. Design
L10's narrow worker-cleanup scenario without touching real account storage.

### D03 — One welcoming recipe journey (frontend, QA review)

After D01/D02 establish its safe boundary, use the existing authorized recipe
API to wire Home → one authored recipe → the
existing cook entry. Improve compact layout, equipment, accessible ingredient
checklists and method controls; phone Ingredients/Method switching, desktop
ingredients left. Preserve recipe/tier/language/servings and async/attempt guards.
Do not change `CookMode.jsx`, auth stores or API response shapes in this leaf.

Ingredient quick picks may initially use existing text search **only when
presented as search**, with EN/DE result tests. Text matches are not canonical
ingredient membership, graph edges or form-compatible shopping identity. Do not
claim the production Explore network is finished; its authored mapping is a
separate D07/D10 deliverable. No guessed photos, culinary claims or rewritten
recipe content. Missing approved imagery uses a neutral state.

Acceptance: real authorized EN/DE reads, one loading/empty/error state, rapid
language/account changes, keyboard focus/back behavior and 320/390/768/1280 in
both themes. Produce actual screenshots for Q09, not another standalone mockup.
Keep the existing cook controller/snapshot behavior and regressions intact.

### D04 — Provider-independent operations package (DevOps)

Draft the build/content identity, migration/sync ordering, failed-publication
recovery, old-client asset window, isolated restore and alert/support runbook.
Design synthetic late-sync-failure and compatible recovery-build tests. No host,
domain, SMTP purchase, production probes or actual deployment. Backend owns sync
transaction changes; DevOps must not patch them independently.

Acceptance: explicitly distinguish a restored current build from a designated
recovery build reading **and writing candidate-created records**. Record missing
operator decisions and measurable proposed targets instead of inventing uptime.

## 5. Remaining packages and exit criteria

| ID | TODO coverage | Deliverable and done gate | Prerequisites / authority |
|---|---|---|---|
| D05 | L01/L05/L06 | Agreed session transport/revocation; auth abuse controls; expiring hashed single-use reset/verification tokens; fake mail; replay/expiry/concurrency/enumeration tests | D01, engineering ADR; Q06 only for access/verification/session consequences; no live mail |
| D06 | L07/L08 | Server-enforced legacy route boundary, invitation/link lifecycle where retained, truthful export/deletion and preserved creator/shared records | D01, Q07; exact synthetic fixture and coordinated migrations |
| D07 | L03/L14 | Finite EN/DE ingredient/form/configuration and Explore mapping with immutable revisions; authoring validator and synthetic fixtures | D01; draft mappings can proceed, Q10 gates actual content activation; no automatic graph inference |
| D08 | L02/L11 | Shared responsive navigation, safe areas, narrow German labels, consistent History/Settings/planning/shopping shell | D03, Q09 thin-slice approval before broadening; frontend integration owns router/locales |
| D09 | L05/L06/L08 | Wired login/logout/expiry/reset/verification, export/delete/privacy states; accessible pending/error/retry | D05/D06 contracts integrated; no speculative retention or compliance claims |
| D10 | L03/L04 | Close D02's actual PX gaps, authorized configured previews and authored Explore entry points; prove shopping/plan isolation and clean second-device persistence | D02/D05–D09; Q10 for real catalog; no configured-cook shortcut; legacy fixes precede privacy/parity sign-off |
| D11 | L12 | PostgreSQL latency/query/memory and concurrency evidence at ordinary and admitted maximum sizes, receipt boundary and exhaustion/retry tests; scoped optimization | D01/D02 and exclusive disposable DB targets; changes to projection have backend review |
| D12 | L08/L14/L15 | Actual privacy/data lifecycle and retention implementation, late-failure-safe content release, recovery-build proof and provider-independent operational rehearsal | D04–D07; policy-dependent writes wait for Q07/operator approval; deployment topology later |
| D13 | L09/L10/L11/L13 | Full candidate automated/PG checks, scoped worker cleanup, two-release assets/active cooks, real S25/iOS and EN/DE/theme/keyboard/screen-reader/zoom matrix | Affected D05–D12 packages integrated; Q05 promises, physical-device access; no invented browser evidence |
| D14 | L16/L17 | Independent five-seat candidate review, human design/culinary acceptance, authorized beginner observations, fixed findings, exact release/aftercare decision | D10–D13 plus Q09/Q10/Q12; Q13 participants and Q14 release remain separate authorizations |

D11 results inform Q12 operating targets. D13 can author/check unaffected
scenarios earlier, but its final sign-off uses the integrated candidate.
All L01–L17 are covered; a task finished in part does not tick its whole L item.

## 6. Delegation contract — how automatic handoffs work

**Coordinator/chairman:** current main agent. **Implementers:** bounded Sol
subagents (`gpt-6-sol`, initially high reasoning). **Reviewers:** a separate agent
or coordinator who did not author the change. Role is not a model: frontend,
backend, security, DevOps and QA can all use Sol with different scoped briefs.

During an authorized active implementation task:

1. Read TODO, this plan and the manifest. Verify current repository, SHA, status,
   decisions and tool availability; update dispatch base, never assume this SHA
   remains current. No old root-checkout dispatch.
2. Resolve prerequisites. Choose at most **three non-overlapping workers** to
   start; keep room for review. An omitted prerequisite/decision fails admission.
3. Send each worker a fresh-context packet: objective, approved contract version,
   actual base, assigned checkout, exact allowed files, exclusions, tests and
   handback shape. Use native subagent tools, not new user tasks, shell-spawned
   infinite agent loops or hook callbacks. No recursive worker delegation.
4. Assign isolated managed checkouts where supported. The spawn call alone is
   **not proof of isolation**: record the real cwd. If agents share a checkout,
   enforce disjoint file ownership and serialize shared-file integration.
   Without a safe write boundary, use read-only review rather than competing edits.
5. Keep one owner for backend boot/auth/models/migration order; one for frontend
   router/global state/navigation/locales; one for CI/release runners. Assign
   leaf test paths too. Exclusive database cluster/port and browser-test session
   ownership is required—worktrees do not isolate runtime resources.
6. Inspect each diff and tests, send an independent review, integrate in the
   declared order, and retest the **integrated** result. Exact file ownership can
   be expanded by the coordinator only after checking overlaps and task scope.
7. At most **three implement → review → correction iterations per batch**.
   Each assignment is one bounded deliverable, initially capped at 30 minutes
   as a checkpoint, not a completion estimate. A stuck worker hands back partial
   evidence; do not repeatedly restart it or reset a database to make tests pass.
8. Continue other ready tasks while blocked questions accumulate. At a batch
   boundary present one consolidated decision list. Stop the affected package
   immediately for a data-loss/privacy/authority conflict; stop the batch after
   its correction limit, user interruption, host/usage limit, or no safe ready work.
9. Update task status and evidence, then dispatch the next admitted task during
   the active run. Save a resumable handoff if the run ends. A plan file does not
   schedule future work or guarantee operation when the app/task is stopped.

States: `planned → ready → running → review → integrated → verified`; use
`blocked` with a precise missing decision/evidence. `released` requires user
authority and observed deployment. The manifest is a dispatch template, not an
executable scheduler or completed-task ledger; TODO holds current completion.

### Worker prompt template

```text
Implement ONLY package {id} from dispatch-plan-2026-09-27.md.
Model requested: gpt-6-sol. Role: {role}. No recursive delegation.
Repository/check-out: {verified absolute path}; base: {verified SHA}.
Approved dependencies/contract versions: {evidence}; decisions: {recorded answers}.
Allowed files: {exact write set}; shared owner/locks: {names and resources}.
Required outcome and negative cases: {acceptance from packet}.
Do not change product policy, content claims, production records or unrelated files.
Do not commit, push, deploy, send real email, provision, enable hooks or recruit.
Use local synthetic data only. Never reset an occupied verification database.
Return: changed files/diff, tests with outcomes, remaining risks, questions and
next recommendation. Distinguish implemented from verified and human-approved.
Pause this assignment on overlapping edits or a necessary unapproved decision.
```

### Review return template

```text
Task / base / candidate identity:
Actual checkout and changed paths:
Contract and decision references:
What works / what was deliberately not changed:
Tests: exact commands, fixture/environment, result, skipped cases:
Browser evidence: actual screen/device or explicitly not run:
Migration, retained-data and recovery consequences:
Independent findings (severity/evidence) and correction outcome:
Remaining questions and ready successor task:
```

For auth/schema/ownership/content activation, a majority vote never overrides
an unresolved security or data-loss finding. Have the coordinator resolve it
with evidence, strengthen review, or ask the relevant product question.

## 7. Questions — minimal involvement, at useful times

No answer is needed merely to prepare the first batch. After its independent
work, ask these together, with evidence and clear recommendations:

- **Q05:** online-first and correct timers on return (recommended), or must an
  alarm sound while a locked phone is suspended? The latter requires a platform
  feasibility decision and may change scope. Do not claim either was approved.
- **Q06:** first-release access/verification and account-recovery expectations.
  Recommendation to discuss: guest Basic cooking, all curated recipes free for
  signed-in users, verified email/recovery, Stripe later. Current premium rules
  stay intact until the user actually approves a change.
- **Q07:** what remains for other household members after account deletion, and
  what may public links expose? Recommend preserving agreed shared content with
  attribution removed while deleting private content; explain provenance limits.

Then Q09 is one actual wired design review; Q10 is a finite content/image checklist
including the lentil dish's pot/parallel-versus-sequential contradiction. Those
are separate approvals. Hosting/budget/domain/mail/retention/support choices
(Q04/Q11/Q12) wait until needed. Physical S25 testing needs user participation;
physical iPhone access is unconfirmed. Recruitment and release wait for Q13/Q14.

## 8. Hooks in the screenshot

Hooks are event-triggered commands/tools, not React hooks and not developer
seats. They can run around prompts, tool actions or task completion. Codex requires
trust review for non-managed hooks. See [official hooks documentation](https://learn.chatgpt.com/docs/hooks).

Read-only inspection found **seven handlers across two local sources**:

| Source | Trigger / intended action | Current caution |
|---|---|---|
| User `C:/Users/zweiz/.codex/hooks.json` | On prompt submission: `codegraph prompt-hook` | Cookbook has no `.codegraph/`; command not resolved in this shell. Not needed for this plan. Full implementation not audited. |
| `security-guidance/2.0.0/hooks/hooks.json` | Session start: bootstrap Claude Agent SDK | Script can create a venv/install the SDK where supported; native Windows bootstrap explicitly skips. Do not execute to inspect. |
| Same plugin | Prompt submission: security reminder handler | Inspect exact handler/config before trusting; name alone is not a safety guarantee. |
| Same plugin | After edit/write: security reminder handler | Matcher uses Edit/Write-style names; actual applicability to Codex tools not verified. |
| Same plugin | After commit: background review | Can request AI review of changed code. |
| Same plugin | After push: background review | Can request AI review of pushed commits. |
| Same plugin | On stop: background review | Can supply follow-up findings; not a cookbook implementation scheduler. |

The count matches the screenshot, but **Hook 1–7 ordering/provenance cannot be
confirmed from collapsed rows**. No hook was enabled, executed or disabled here.
Inspection of the security plugin found Claude/API review paths and diff prompts;
provider authentication, data handling, cost and Windows behavior need review
before approval. This was not a full audit of all imported hook code.

Recommendation: choose **Not now**, or expand and approve only specific reviewed
handlers. Do not Allow all based on friendly labels. Our own bounded Sol reviews,
test commands and CI do not require these hooks. Optional future local validation
hooks should be a separate small reviewed change, not a prerequisite for launch.

## 9. Confidence and sign-off

High confidence: existing CI result, SQL foundation and ability to delegate bounded
tasks. Medium: first wired UI slice and full parity until actual browser mapping
is complete. Low: final session/shared-data policy, authored catalog/culinary
accuracy, physical locked-phone behavior, production capacity and recovery under
a real operator. Tests reduce engineering uncertainty; they cannot approve human
content, privacy policy or spending.

The five-seat council shaped this plan: contracts before shared writes, one thin
wired slice before wider redesign, row-by-row parity evidence, and explicit
recovery-build proof. It did not approve the application for release.

**Next concrete action after implementation authorization:** admit D01/D02/D04,
then D03 once its safe boundary is established. Perform the bounded review loop and return the
consolidated questions. This planning turn creates no automatic future jobs,
changes no hook configuration, and makes no commit/push/deployment.
