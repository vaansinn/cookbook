# Phase 1 — launch foundation review and handoff

Date: **2026-10-05**. Documentation and diagnostic batch authorized by the user's
“go ahead” after the Phase 1 explanation. No application behavior, migration,
account data, content publication, infrastructure or hook changes. No commit,
push or deployment. This does not close the release gates in [TODO](../../../TODO.md).

## Baseline and ownership

- Checkout: `D:/Projects/cookbook/.worktrees/teaching-hardening`, branch
  `codex/teaching-pilot-hardening`; source `04a414f218c909dea3c82e720d8d5ac8ba84e228`.
  GitHub main matched when checked today. Root checkout and unrelated work were
  left alone. No CodeGraph index exists in this checkout.
- Existing September 27 dispatch/manifest/council edits and changes to TODO,
  PIPELINE, AGENT_HANDOFFS and implementation-plan were preserved. They were
  already uncommitted; this batch does not imply they are published.
- Three Sol writers shared the checkout with disjoint document ownership;
  frontend and security reviewers are read-only. Main owns integration, baseline
  tests and this handoff. No agent owns a live database or browser session.
- The manifest remains a dispatch template, not a scheduler or authority grant.
  This dated record and TODO describe execution; underlying L items stay open.

## Delivered artifacts

| Package | Deliverable | What it establishes |
|---|---|---|
| D01 | [Exposure matrix](exposure-matrix.md), [session proposal](session-contract.md), [legacy/content proposal](legacy-contract.md) | Registered API boundaries, source-backed risks, proposed session/deletion/sharing contracts and synthetic negative cases; no permission changes |
| D02 | [All 20 parity rows](parity-evidence.md), [browser scenarios](browser-scenarios.md) | Production source and named tests versus prototype requirements; actual gaps distinguished from unrun acceptance |
| D04 | [Release runbook](release-runbook.md), [recovery test design](recovery-test-design.md) | Current operational capability versus proposed safe publication, restore and compatible recovery-build proof |

These are implementation inputs, not deployed features. D01's engineering ADRs
remain proposals where review or policy is unresolved. D02's browser scenarios
and D04's new PostgreSQL recovery scenarios have **not** been executed.

## Chairman's decision ledger

1. **Keep the private SQL foundation; harden the complete exposed surface.**
   Source confirms account-owned workspace checks and transactional receipts,
   but the eleven registered blueprints still include legacy household, list,
   named-plan and anonymous sharing routes. Removing a navigation link is not
   an access-control fix. D06 must preserve existing records while enforcing
   the chosen legacy policy on the server.
2. **Close session lifecycle, not just login UI.** Current 30-day bearer tokens
   survive local logout if copied. Deleted-user checks are useful but not
   per-session revocation. D05 should select the reviewed server-session design,
   including mixed old/new client behavior, revocation, recovery and abuse
   controls. Cookie transport is an engineering recommendation, not user consent
   to changed access tiers or verification requirements.
3. **Do not equate the green suite with complete planning parity.** Concrete
   source gaps are meal/item positioning, destructive shopping-impact detail,
   and editor preview quantities using base rather than selected servings.
   Correct these with focused tests and actual SQL/browser checks. Catalog
   authoring and culinary approval remain separate; an empty published catalog
   is not evidence that all recipe choices work.
4. **Do not manufacture legacy identity equivalence.** The prototype's old
   `#plan/shopping/...` links are aliases to the same demo records. Production
   `/plans` and `/groceries` have different legacy records. Preserve and identify
   those records; do not force an import/redirect to unrelated private data to
   satisfy PX09. This corrects the first parity draft's false failure finding.
5. **Do not manufacture a cache-cleanup bug.** The harness creates its own
   `unrelatedCache` sentinel to test service-worker isolation. Keeping that
   sentinel through worker activation and removing it at confirmed harness
   teardown are compatible. Genuinely unowned caches must survive. The first
   browser-scenario draft confused these and was corrected; L10 remains a
   missing real-browser check, not a demonstrated unsafe teardown.
6. **Require no mixed visible content after failure, not an unnecessary new
   publishing platform.** Separate sync commits currently permit partial
   publication. D12 must compare a serialized coordinated transaction with
   staged/versioned activation and choose the smallest solution that proves the
   invariant for all content readers. Existing snapshots and catalog revisions
   stay immutable. A restored current build is not proof that an older or bridge
   recovery build can read and write candidate-created records.
7. **Do not promise server logout from an old client that never calls it.**
   Prefer evaluating a controlled one-time reauthentication for the creator-only
   rollout before building a dual-transport compatibility period. Retain account
   data either way. If a transition is needed, reject ambiguous credentials and
   preserve server-side invalidations, but state the old local-logout limitation.
   Recovery tests must reject revoked sessions for a still-live account; their
   valid-session control is issued on the restored target, not assumed to survive
   from a source login performed after the archive.

No majority opinion can waive data-loss, policy or release gates.

## Independent review record

Five specialist contexts used `gpt-6-sol` with high reasoning, not five different
models or independent human experts. Three authored disjoint documents; two
inspected source read-only before receiving the peer reports. Each supplied a
cross-review; one targeted correction pass addressed concrete remaining security
boundaries. The coordinator independently checked decisive code and integrated
the documents. This follows the developer-council workflow but is not the final
candidate/release council required by L16.

| Seat / actual agent | Evidence and evaluation | Cross-review / chairman outcome |
|---|---|---|
| Backend, Epicurus — `01a10954-c493-7002-b9dc-53867319eaec` | D01's three source-linked documents enumerate 66 API route rules; current private workspace and legacy disclosure boundaries are distinct | Accept inventory. Keep session/access/retention proposals gated; require explicit credential precedence, revocation and truthful former-member export. Compare atomic publication mechanisms rather than mandating a pointer. |
| QA, Kepler — `01a10954-c5ba-75a0-8879-898eda8d44d6` | D02 maps all 20 rows to specific screens/routes/tests and missing outcomes | Accept corrected matrix, not blanket parity approval. Retracted cache-sentinel and legacy-route false failures. Distinguish truthful authored base preview from missing selected-servings preview. |
| DevOps, Franklin — `01a10954-c73d-7240-a46f-51c87b3ab2d6` | D04 identifies separately committed syncs and current-build-only restore proof | Accept provider-independent specification, not executed recovery. Separate candidate and designated recovery artifacts; include revocation/deletion continuity and precise test-target ownership. |
| Security, Peirce — `01a10959-9e6a-7563-bf2e-46c780c68141` | Independently confirmed copied-token logout gap, missing recovery/abuse controls, reusable invite/member-email disclosure, public owner-name link and legacy derived-access/provenance gaps | High confidence in source findings. Required no credential fallback, limited former-member exports, and still-live-account session revocation after restore. These cannot be waived by green baseline tests. |
| Frontend, McClintock — `01a1095b-91b8-7501-9d85-050e0b1cfef8` | Existing API-backed Home/recipe/cook path makes D03 feasible; no component variant in cook URL or production image-verification field | Accept bounded D03 admission. Preserve guards and attempt identity, use real keyboard controls, label search honestly, keep configured cooking separate, obtain actual wired screenshots. Corrected an overly broad first interpretation of the authored preview. |

**Confidence:** high for inspected source boundaries and fresh baseline results;
medium for the proposed engineering contracts pending focused implementation tests;
low/unverified for full device/browser parity, real catalog/culinary content,
operating capacity and compatible recovery. The council did not approve GDPR
compliance, content claims, a host, spending or launch.

## Fresh verification and limits

Commands ran in the integration checkout, using installed local dependencies:

| Check | Result on October 5 |
|---|---|
| `.local/venv/Scripts/python.exe -I -B tests/run_backend.py` | **32/32 scripts passed**, isolated synthetic SQLite environments; not PostgreSQL acceptance |
| `node --experimental-vm-modules --experimental-loader ./tests/frontend/extensionlessLoader.mjs --test <all tests/frontend/test_*.mjs and docs/prototypes/*.test.mjs>` | **352 passed, 2 skipped, 0 failed**; optional browser skips remain |
| `node node_modules/vite/bin/vite.js build --outDir ../.local/build-verification` from `frontend` | **Passed, 161 modules**; temporary local output, no served artifact promotion |
| Documentation | All PX01–PX20 rows present; local document links and whitespace checked; final integration check recorded below |

Final integration: all seven assigned documents were reviewed and corrected;
66 route-table rows match 47 route/add-rule declarations plus 19 method-specific
decorators. Exactly 20 unique PX rows are present. Documentation-only scope and
relative file targets were checked; no application or test-source diff was added.

The existing [September 18 CI run](https://github.com/vaansinn/cookbook/actions/runs/35339011776)
for `04a414f` remains green, including five disposable PostgreSQL databases;
its status was checked today, **the PostgreSQL rehearsal was not rerun today**.
There was no fresh browser, physical S25/iPhone, clean-second-device, culinary,
legal/compliance, performance or deployment acceptance. Backend warnings about
legacy SQLAlchemy query APIs did not fail the suite; they do not prove a new
regression in this documentation-only batch.

## Next implementation admission

**Ready next: D03**, one real Home → recipe → existing cook journey, within its
approved boundary. Use current authorized API reads, preserve the request/account
guards, EN/DE, both themes, tier/language/servings and active attempts. Do not
change CookMode/auth storage/API contracts or invent ingredient-network mappings.
Produce actual wired mobile/desktop evidence for Q09 before expanding the port.
Its own implementation and browser evidence are not delivered by this Phase 1
documentation batch.

Then admit policy-independent leaves of D05/D06, and D07 draft mapping, with one
owner for shared backend files. Resolve Q06/Q07 before behavior dependent on them.
D02's correction packets feed D10 rather than silently broadening D03. D04's
new recovery harness belongs to D12 after contract decisions; do not run the
existing verifier against occupied targets or declare the new design passed.

## Consolidated user checkpoint

**Subsequent answers, October 5:** Q06's launch access/recovery and Q07's
deletion-retention proposals were approved. Q05 requires audible timer alarms
while the phone is locked, “like a regular alarm”; platform feasibility is open.
The questions below
are the historical checkpoint; use the [decision register](implementation-questions.md)
and current TODO for the answered scope and remaining details. Recording these
answers did not implement the policies or change application data.

Only these product consequences need the next answers; no infrastructure purchase
or technical cryptography choice is being delegated to the user:

- **Q05:** online-first cooking, with timers accurate on return, without promising
  an alarm while a locked phone is suspended? Recommended first-release promise;
  a guaranteed locked-phone alarm needs a separate feasibility decision.
- **Q06:** guest Basic cooking plus free access to all curated recipes for signed-in
  users, email verification/recovery, and paid tiers later? Proposed launch policy,
  not an answer already given. Current premium gates remain unchanged meanwhile.
- **Q07:** delete private account data and revoke its public links, while keeping
  agreed shared household content for remaining members without attribution;
  future sharing explicit/revocable with no public owner identity by default?
  Proposed default, with known limits on historic merged contributor provenance.

Q09 visual and Q10 culinary/image approval follow their concrete artifacts.
Hosting/domain/mail/retention/support and physical-device access remain later
operator checkpoints, not prerequisites to all local engineering work.
