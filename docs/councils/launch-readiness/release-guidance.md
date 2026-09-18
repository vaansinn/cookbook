# Release guidance used for the implementation plan

Checked 2026-09-13. Primary/official documentation only. These sources inform a proportionate release process; they do not certify this app, imply every platform guideline is mandatory, or authorize infrastructure/store actions.

| Source | What we apply to this app |
|---|---|
| [Google SRE: production launch planning](https://sre.google/resources/practices-and-processes/production-launch-planning/) and [launch checklist](https://sre.google/sre-book/launch-checklist/) | Tailor the process to a small operator: named owner, repeatable release, expected load, external dependencies, rollback/restore, alert delivery and a controlled launch. Do not copy Google's infrastructure scale. |
| [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) | Build a scoped security-verification matrix pinned to stable ASVS 5.0.0, with applicable controls, rationale, test and result. Automated scanning alone is not verification or certification. |
| [OWASP forgot-password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) | Non-enumerating responses, bounded request rates, random securely stored expiring single-use recovery tokens, trusted reset URL construction and session invalidation policy. Test replay and email failure, not only happy-path login. |
| [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) | Treat session credentials as account access; document storage, expiry, revocation and secure transport. Select web/native-specific storage and CSRF/XSS controls through a decision record rather than an incidental refactor. |
| [W3C WCAG overview](https://www.w3.org/WAI/standards-guidelines/wcag/) | Use WCAG 2.2 AA as the engineering target for selected web journeys. Include keyboard, focus, labels, status/error communication, text enlargement and contrast. A palette test does not establish conformance; legal applicability needs separate confirmation. |
| [Android core app quality](https://developer.android.com/docs/quality-guidelines/core-app-quality) | Validate state preservation across app switching, screen lock, navigation and orientation, plus accessibility and native Back behavior for packaged Android. Do not treat desktop viewport emulation as a device test. |
| [Service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle) | New workers can control older pages, particularly with immediate activation. Exercise old/new client compatibility and update timing; do not disrupt an active cook. Cache ownership is origin-scoped and cleanup must not remove unrelated applications' caches. |
| [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) | Browser-local state belongs to an origin and can be unavailable. A new domain does not automatically inherit saved drafts, attempts or tokens. Decide preservation/export/re-entry explicitly; never silently migrate guest/prototype data into accounts. |
| [PostgreSQL backup and restore](https://www.postgresql.org/docs/current/backup.html) | Choose and rehearse an appropriate backup method, including restoration and integrity checks. Do not equate a file backup, schema downgrade or SQLite smoke test with demonstrated PostgreSQL recovery. |
| [Web Vitals](https://web.dev/articles/vitals) | Reference mobile/desktop field targets: LCP ≤2.5 seconds, INP ≤200 ms, CLS ≤0.1 at the 75th percentile. Prelaunch lab scenarios are proxies and must be labeled; final budgets depend on agreed device/network/load. |
| [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/) and [upcoming requirements](https://developer.apple.com/news/upcoming-requirements/) | Before iOS submission, confirm complete functionality, reviewer access, current SDK, privacy/deletion, metadata and minimum-functionality requirements. A web wrapper is not a guaranteed store approval. |
| [Google new-personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en) and [target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) | Check account type/date and current SDK before scheduling. Where applicable, closed testing requires 12 testers continuously opted in for at least 14 days before applying for production access. This is not automatic approval. |
| [Google staged updates](https://support.google.com/googleplay/android-developer/answer/6346149?hl=en) and [Apple phased version updates](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases/) | Use beta channels before first publication. Distinguish first launch from staged/phased update tools; do not promise that initial release can use a percentage rollout or that halting an update uninstalls it from users. |

See [platform-requirements.md](platform-requirements.md) for the separate Apple/Google privacy, deletion, toolchain and dated submission checklist.

## Additional application-specific safeguards

These are this plan's engineering recommendations, not quotations or universal platform rules:

- Maintain an evidence ledger tied to exact code/content/build identities, not just a passing screenshot.
- Separate plan approval, increment acceptance and deployment/store authorization.
- Reconcile legacy shared rows without inventing missing ownership or quantities.
- Preserve deletion/revocation decisions when restoring an older backup.
- Verify email sender/domain configuration and recovery delivery before opening accounts.
- Restrict staging access and real outbound email; no production personal data in test fixtures.
- Keep third-party processors, font/image licenses and AI/creator-verification claims accurate.
- Agree operating cost, support responsibility, incident escalation and update cadence before launch.
- Retain compatible old assets and the previous supported client/API behavior; test recovery after new writes.
- Run realistic modest-load checks rather than demand enterprise infrastructure or invent traffic estimates.
