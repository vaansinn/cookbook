# Launch implementation — Q&A and decision register

Status: **remaining decisions open; full-plan/release approval remains pending**. Updated 2026-10-05. The user separately authorized the bounded [foundation batch](foundation-batch.md); earlier statements below about Q&A answers not authorizing implementation describe those answers, not the later batch instruction.

Purpose: ask the user a small number of relevant questions immediately before a decision becomes costly to reverse. Do not ask the entire questionnaire at once. Q01–Q03 are answered; later answers on local development, private ownership and future payments are recorded below.

**2026-10-05 checkpoint:** Phase 1 contract/parity/recovery documents and source
review are recorded in the [handoff](phase-1-handoff-2026-10-05.md). Q05–Q07 are the
next consolidated product questions; recommendations in that handoff or the new
ADRs are not answers. No existing answer or access policy changed in this batch.

**Subsequent user replies, 2026-10-05:** Q06 launch access/recovery and Q07's
account-deletion retention proposal were approved with “sounds good.” Q05 requires
audible timers even while the phone is locked, clarified as “like a regular alarm.”
Platform feasibility remains unverified. These answers update the intended contracts, not the
running application, and authorize no deployment or real deletion.

## How checkpoints work

- The coordinator presents at most three concise questions with relevant evidence, a recommendation, trade-offs and the specific work waiting on the answer.
- Silence is not consent. Draft recommendations remain proposals; only the affected work waits. Independently approved, non-conflicting work may proceed.
- Engineering choices belong to the specialists/chairman. Ask the user about product promises, people/data, cost, policy and release authority—not whether to use a particular cryptographic algorithm.
- Record answer, date, source/user confirmation, affected task IDs and changed assumptions. A material change reopens the relevant contract/tests, not the entire project.
- Q&A approval does not authorize spending, infrastructure changes, sending email, recruitment, commits, deployment or store submission unless explicitly included.
- Status choices: pending, answered, superseded, not applicable. No preselected suggestion counts as an answer.

## A. Before signing off the implementation approach

### Q01 — First distribution channel

**Current decision, answered 2026-10-05:** the user approved “Android first, iOS
later, and desktop/web deferred” with “sounds good.” This supersedes the September
13 web/PWA-first answer below and its desktop-first-release requirement. The
product is app-first, not permanently app-only. Start device validation with the
Galaxy S25. Keep the existing SQL backend and reuse the interface where feasible;
no framework or full native rewrite has been selected. Android N0–N3 is now in
the launch track; iOS and public web/desktop release remain later work. Q05's
locked-phone audible alarm is a mandatory requirement for the Android candidate.

**Consequences:** revalidate native API origin/session storage, lifecycle, alarm
permissions, accessibility, build/signing/update and distribution gates before
dispatching platform-dependent work. Q02's full planning/event/shopping scope and
Q06/Q07 answers are unchanged. Choosing Android-first does not authorize store
submission, paid accounts/tooling, deployment, device configuration or signing
credential access. Actual store requirements must be checked during N0/N2.

**Question:** Should the first public release be a phone-first website/installable web app, Android on Google Play, or Android and iOS stores together?

**Historical recommendation, superseded:** web/PWA first for the shortest route from the existing code. Store presence is a valid requirement, not an optionality we can decide for the user.

**Consequences:** stores bring native build/session/lifecycle validation, accounts/signing and beta-review lead time into the critical path. Desktop browser launch support is now deferred by the October 5 answer.

**Historical answer, superseded 2026-10-05:** on September 13 the user selected “Phone-first website/installable web app, then app stores (recommended for fastest launch).” N was deferred at that time. Use the current Android-first decision above, not this historical release order.

### Q02 — First-release feature promise

**Question:** Is cooking with optional accounts/history enough initially, must a bounded real planning/shopping workflow ship, or must the full approved planning/event/shopping prototype be integrated?

**Original recommendation, superseded by the answer below:** choose the smallest genuinely useful product; curated cooking plus optional accounts/favorites/history after hardening was the initial proposal. The user selected the broader full-prototype release. Do not quietly ship the old disliked UI or reduce that choice.

**Decision context:** bounded planning would have invoked P; the selected full prototype integration makes X mandatory and requires its own data-contract approval. It is not already production-ready. A guest-only preview would require a new user scope decision.

**Status:** answered 2026-09-13 through the user Q&A: “Include the full approved planning/event/shopping prototype functionality.” **Consequence:** full prototype parity is mandatory in the first web release; X is the production integration track, not a deferrable outline. Unbuilt packs/Use the rest/batches/leftovers are not implied. P is superseded as a reduced-scope alternative. The detailed X data/API/persistence contracts still require G1 sign-off; no feature implementation is authorized by this answer.

**Channel update, October 5:** this same feature scope now applies to the first
Android release; moving away from web-first does not reduce the agreed features.

### Q03 — Existing users and saved data

**Question:** Is the live app used only by you, by others as well, or only for disposable demos? Which saved account/planning/shopping data must survive?

**Recommendation:** preserve all existing data until explicitly classified otherwise. If uncertain, retain it and perform an authorized metadata-only inventory.

**Consequences:** real users require continuity, existing-link/token policy, recovery/export access, migration rehearsals and a cutover communication plan. Browser-local prototype data is distinct from account records and cannot be silently imported.

**Status:** answered 2026-09-13: only the creator currently uses it; public users should be able to sign up after release. Preserve the creator's records. This does not authorize a reset or inspection of production personal data; cutover still needs a rehearsal and approval.

### Q04 — Operating envelope, not final server shopping

**Partial answer 2026-09-13:** develop locally now, explicitly authorized. User has
Heroku/Hetzner accounts, prefers Hetzner later, and has an Android Galaxy S25.
No paid provisioning authorized; budget/operational owner/iPhone access remain
later decisions. Local PostgreSQL is now available; see `../../local-development.md`.

**Ask:** before approving environment/hosting-dependent work. What is the monthly operating ceiling, who owns the service/support inbox, and can we use an existing explicitly disposable PostgreSQL environment and physical iPhone/Android devices?

**Recommendation:** a small supported deployment, separate disposable testing/staging, named owner and a bounded budget. Retain the European-control preference. Do not pick a paid provider or request secret values in chat.

**If unanswered:** vendor/provisioning commitments and final verification schedule remain pending; provider-independent code tasks may be conditionally approved. A feasible PostgreSQL/device verification route must be established before approving the complete execution plan.

### Q05 — What should cooking do when interrupted?

**Answered 2026-10-05:** after requesting actual timers with an alarm, the user
clarified: “it should work if it's locked, like a regular alarm.” A real audible
completion alarm while the phone is locked is required; displaying an expired
timer or sounding only on return does not satisfy Q05. Physical-device feasibility
and the support matrix remain unverified. Reopen the PWA-only feasibility gate:
this requirement does not itself approve a native rewrite, packaging, store
submission or a reduced alarm promise.

**Engineering follow-up:** investigate OS-scheduled alarms, starting with Android
Galaxy S25, while preserving shared web UI/SQL backend. Browser-only timers cannot
be accepted as proof: Chrome documents suspension of freezable task queues in
[frozen pages](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).
[Android alarm scheduling](https://developer.android.com/develop/background-work/services/alarms)
provides wakeup/exact-alarm mechanisms subject to permissions; Apple's
[AlarmKit](https://developer.apple.com/videos/play/wwdc2025/230/) provides native
timers/alarms on iOS/iPadOS 26. These official sources were checked October 5;
they establish investigation paths, not implemented or device-tested support.
Do not equate an ordinary notification, server push or installable PWA with a
regular system alarm. Before selecting architecture, test locked/background
delivery, permissions denied/revoked, cancellation/rescheduling and duplicate
prevention; characterize battery/sound settings and network loss. No native
toolchain, notification delivery or physical-device test ran in this decision update.

**Ask:** before cooking/session persistence and channel architecture sign-off. Should timing be accurate when returning to the app, or must an audible alarm work while the phone is locked? Is online-first access with clear recovery acceptable?

**Recommendation:** persistent elapsed-time/deadline correctness, deliberate pause/cancel, no silent timer cancellation when changing steps, and explicit online-first recovery. Do not promise a locked-phone alarm without evidence.

**If stronger alarms/offline behavior are essential:** perform the bounded platform feasibility spike first and revise scope if unsupported. These are product/architecture requirements, not a disclaimer to add at the end.

**Also clarify:** which phone OS versions/devices matter to the intended users; the team proposes and tests the support matrix.

### Q06 — Accounts and access at launch

**Launch policy answered 2026-10-05:** the user approved question 2 (“sounds good”):
guest Basic cooking, all curated recipes free for signed-in users, email
verification and password recovery, paid tiers later. This supersedes the older
undecided launch access wording below. D05/D09 should implement and test this
policy; existing premium gates have not yet changed. Session transport/lifetimes,
the precise unverified-account flow and mail-provider setup still require their
engineering/operational decisions. No Stripe integration or real email sending
is authorized by this answer.

**Partial answer 2026-09-13:** public sign-up should be available when released;
Stripe is intended once a paid tier exists, not a request to implement payments
now. Email verification/recovery and exact launch access policy still need their
engineering/product checkpoint.

**Ask:** before account contract sign-off. Are accounts optional, should sharing require verified email, and is the first release free or does existing premium access need a commercial path?

**Recommendation:** preserve guest Basic access and optional learning; require proven email ownership before inviting/sharing where enabled. Keep payment implementation out unless expressly needed. Existing access rules must not change incidentally.

**If unanswered:** new registration/sharing/monetization policy cannot be finalized. Engineers can analyze session alternatives, but cannot silently choose product restrictions. The technical session ADR is owned by backend/security.

## B. Immediately before dependent implementation

### Q07 — Shared-data retention and public identity

**Deletion-retention proposal answered 2026-10-05:** the user approved question 3
(“sounds good”): remaining members may retain existing shared household content
without the deleted member's attribution; delete that member's private data and
remove/revoke their owned public links. New plans remain private by default.
This authorizes the design direction for D06/D12, not deletion of real records.
It does not approve new community sharing, public identity fields, inviter/member
administration rules, numeric retention periods or a specific former-member
export disclosure. Those narrower boundaries remain pending; never reconstruct
unknown merged-item provenance or expose co-member details by assumption.

**Ask:** during LP02, before G1 for the selected account/sharing scope. When someone deletes their account, may household grocery/meal content remain for other members with their attribution removed? What may a shared link disclose, and who may invite/remove members?

**Recommendation:** delete private records, revoke owned public links, retain only agreed shared content with attribution removed, preserve co-members' data. Sharing should be explicit and revocable; minimize exposed identity.

**Important evidence:** old merged grocery rows may lack creator attribution. We cannot reconstruct it or promise a complete historic contribution trail. Present the inventory and proposed handling before approval.

**If unanswered:** policy-dependent deletion/sharing writes wait. Technical inventory, failure tests and non-mutating API work can proceed. The policy must be settled before those packages are signed off for implementation; actual deletion tests come later.

### Q08 — Production planning/shopping ownership and semantics

**Ownership answered 2026-09-13:** everything a user sets up is private by default;
possible community sharing later. Do not introduce automatic sharing, household
imports or public visibility. Existing approved prototype shopping behavior stands;
SQL/revision/migration contracts still need the technical sign-off.

**Ask:** before G1 approves X, show how the existing prototype's behavior maps to account storage. Should new plans/events be private to the account initially, with household collaboration left separate? Confirm that each date/meal selection has its own checks/extras and that event-list checks are independent from the same event inside a plan. These are current prototype semantics, not a new pantry system.

**Recommendation:** private account-owned planning first, no new guest/member collaboration. Preserve derived requirements, source-level checks, separate extras, and sticky changed-amount review exactly as approved. Show the 220 g / 600 g spaghetti example and independent date selections. Ordinary prototype interactions need not be redesigned or repeatedly reapproved.

**Required new evidence:** the old APIs cannot represent the full model. Review X's source records, recipe configuration catalog, migration and revision/undo contracts; do not disguise full integration as a bug fix. Configured recipe preview exists in the prototype; direct guided cooking from a planned configuration does not, and must not be silently implied.

**If unanswered:** ownership and X contract sign-off wait; separately approved cooking/account work may continue. The user's decision to include full planning remains confirmed.

### Q09 — Wired-screen review

**Ask:** after the first integrated discovery → recipe → cook slice, before widening the port. Does this match the approved welcoming design, information density and phone priority?

**Show:** actual wired EN/DE mobile and desktop screens, not the static preview. Include one loading/error state and keyboard/focus behavior. Desktop ingredients-left arrangement and compact phone ingredients/method navigation should be preserved.

**Recommendation:** correct clear mismatches now; defer new concepts/features. Minor implementation details within the approved design do not need repeated Q&A.

### Q10 — Culinary and image approval

**Ask:** once the exact launch recipe set is known, before publishing changed content. For Basic lentil Bolognese, should the method use simultaneous pots or sequential reuse? Approve matching equipment, sequence, timings, quantities and EN/DE wording. Which images are creator-compared, and which recipes are creator-cooked?

**Recommendation:** creator/authorized culinary reviewer makes the method choice; engineers keep metadata, instructions, lesson links and claims consistent. Do not infer approval from a passing parser or an AI image.

**If unanswered:** that changed/unverified content is not approved for release. Existing snapshots are not rewritten. Device engineering may continue with clearly synthetic fixtures.

### Q11 — Domain, recovery email and cutover

**Ask:** before final host/domain/mail configuration. Confirm canonical domain, old-domain redirect/support window, account/recovery link behavior, sender and support address, and whether browser-local drafts need an explicit export/re-entry path.

**Recommendation:** finalize the canonical origin before broad data entry, keep staging restricted, self-host fonts, use verified email sending, and do not silently reset origin-local data.

**If unanswered:** staging may use an agreed temporary origin, but cutover, final recovery URLs and store links cannot be signed off. Domain purchase/paid mail/hosting require separate explicit authorization.

## C. Before acceptance and release

### Q12 — Reliability and support targets

**Ask:** before operational acceptance. How much downtime/data loss is tolerable, who receives alerts, when can they respond, and what happens if a third-party service is unavailable?

**Recommendation:** choose measurable backup/restore targets and simple alert routes suited to a one-person project; prefer a recoverable maintenance mode over unsafe writes. Team proposes numeric latency/error/load thresholds based on measurements, not unsupported promises.

**If unanswered:** no final operating sign-off. Restore tests, alert-delivery tests and modest-load measurements inform this discussion.

### Q13 — Beginner/beta participation

**Ask:** after engineering and culinary acceptance, before inviting anyone. Who may test, on which devices, what feedback is collected, and is any consent/privacy information needed?

**Recommendation:** begin with the previously discussed 1–2 beginner observations, then a bounded beta. App-store account-specific testing obligations are separate; do not assume two observations meet Google Play requirements.

**If unanswered:** do not recruit, send invitations or collect participant data. Automated testing may continue.

### Q14 — Release authorization

**Ask:** only after presenting the candidate, evidence, limitations, recovery plan and unresolved-risk list. Approve the exact commit/push target, deployment/cutover, and/or store submission separately.

**Recommendation:** release when an operator can observe and recover it; start with a bounded beta/audience. Any accepted low-severity issue has an owner, expiry and follow-up task.

**If unanswered:** no commit, push, production deployment, store submission or public announcements. Technical acceptance is not authority to publish.

### Q15 — Post-launch scope

**Ask:** after the agreed observation window and actual support findings. Which pain point should come next: personal recipes, ingredient-surplus/shared-preparation features, network integration or store expansion?

**Recommendation:** use observed friction and the agreed product direction; avoid reopening all deferred features at once. New recurring monitoring or tasks require explicit authorization.

## Engineering decisions not delegated to the user

Specialists produce concise architecture decision records for session transport/storage and revocation; validation/error/idempotency contracts; legacy-data reconciliation and migration order; worker/client compatibility; and release/content activation strategy. Each lists options, evidence, chosen approach, tests and recovery consequences. User-facing consequences are brought to the relevant Q above.

## Current answer log

**Git handoff authorization, 2026-09-18 (Q14 partial):** user requested committing
and pushing the accumulated work and tracking all outstanding items in Git.
Coordinator identified GitHub `vaansinn/cookbook` `main` as the target. This
authorizes that Git handoff only; deployment, paid provisioning, public content
activation, participant recruitment and store submission remain unapproved.
Current outstanding implementation and decision checklist: [TODO.md](../../../TODO.md).

**Additional confirmed requirement, 2026-09-13:** user requires a real SQL backend for accounts and saved personal information, not browser/app-only storage, and GDPR compliance at launch. PostgreSQL remains authoritative; privacy evidence is now explicit in the main plan. This does not answer Q03, choose account-versus-household sharing, approve a vendor, or add personal-recipe authoring to first-release scope. Ask controller/audience/lawful-purpose questions alongside Q04/Q06–Q08, and provider/retention/rights/incident questions alongside Q11/Q12.

| ID | Status | Recorded answer | Consequence |
|---|---|---|---|
| Q01 | Answered 2026-09-13 | Phone-first website/installable web app, then app stores | Web/PWA first; N deferred |
| Q02 | Answered 2026-09-13 | Full approved planning/event/shopping prototype functionality | X mandatory; reduced P option superseded; unbuilt roadmap features remain deferred |
| Q03 | Answered 2026-09-13 | Only creator currently uses app; public registration after release | Preserve existing records; no production reset/import authority |
| Q04 | Partly answered | Local development authorized; S25 available; Hetzner preferred later | No paid hosting now; iPhone/operational decisions later |
| Q06 | Partly answered | Public sign-up; Stripe when paid tier arrives | Payments deferred; recovery/access contract still needed |
| Q08 | Ownership answered | Private user-created data; possible community sharing later | Private account-owned SQL design; no implicit sharing |
| Other Q04–Q15 details | Scheduled | See checkpoints | Ask when dependent work needs them, not all at once |
