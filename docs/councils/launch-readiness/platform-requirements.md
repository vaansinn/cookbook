# Platform requirements — launch-readiness council

Checked 2026-09-13 against official documentation. These are planning gates, not a store-approval or legal-compliance determination. Recheck dated SDK rules when submitting.

## What “phone app” can mean

1. **Responsive website:** one React application used in phone and desktop browsers.
2. **Installed web app/PWA:** the website can have a home-screen entry and standalone presentation. On iPhone, Safari supports Add to Home Screen/Open as Web App. This is not an App Store listing and does not establish reliable offline behavior, background alarms or account synchronization. [Apple instructions](https://support.apple.com/en-mide/guide/iphone/iphea86e5236/ios).
3. **Store-distributed mobile application:** a separately built, signed, tested and reviewed Android/iOS package. Reusing web UI is possible; it does not remove native lifecycle or store obligations.
4. **Packaged desktop application:** another release target. A desktop browser experience does not require this.

The repository has web/PWA scaffolding. The council found no native project, signing pipeline or packaged-desktop configuration. Actual store accounts and physical-device availability are unknown.

## A possible reuse route, not a selected dependency

Capacitor provides a native container/runtime for web applications. Investigate it with a small device spike if store delivery is chosen; do not rewrite the frontend in advance or assume the existing app works unchanged in a WebView. Its official setup requires macOS/Xcode for iOS builds (a cloud Mac is an alternative) and Android Studio/Android SDK for Android. The Windows workspace alone does not establish an iOS build environment. [Runtime](https://capacitorjs.com/docs), [environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).

A spike must cover API origin/auth storage, account switching, safe areas, Android Back, external/deep links, file export, app suspension/resume, timer behavior, update compatibility and permission denial. Prefer no new permission unless an exposed feature needs it.

## Apple release gates

- Developer identity/account, bundle identity, certificates/provisioning and a repeatable signed build; reviewer access and working backend; accurate listing/screenshots, support and privacy URLs.
- Since April 28, 2026, uploads require Xcode 26 or later and the applicable 26-series SDK. Age-rating and EU trader-status requirements also need checking against the actual publisher. [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/).
- Guideline 4.2 creates a minimum-functionality review risk for a repackaged website. A hybrid implementation is not automatically prohibited; the submitted experience must justify an app. [Review guidelines](https://developer.apple.com/app-store/review/guidelines/).
- Apps that create accounts must support initiating deletion in-app. Existing broken deletion cannot be treated as satisfying this. [Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app).
- Declare actual app/SDK data practices, including functional account data; assess privacy manifests/required-reason APIs for the selected native dependencies. [App privacy details](https://developer.apple.com/app-store/app-privacy-details/).

## Google Play release gates

- Verified developer account, stable package identity, protected signing/upload credentials, signed release artifact and working review access.
- Since August 31, 2026, ordinary new phone apps/updates must target Android 16/API 36 or later. This is target SDK, not the minimum supported phone OS. [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).
- Personal accounts created after November 13, 2023 require at least 12 testers opted into a closed test continuously for at least 14 days before applying for production access. This is conditional on account type/date and does not guarantee approval. [Testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
- New personal accounts also have a physical-device verification requirement. [Device verification](https://support.google.com/googleplay/android-developer/answer/14316361?hl=en).
- Account-creating apps need both an in-app deletion path and a functional external web deletion-request resource, useful even after uninstalling. [Deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
- Complete privacy/Data safety and listing declarations from the actual release inventory. [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

## Decisions still needed

Is the first public release a phone-first website/PWA or store listing? Are accounts required on day one? Which existing tiers/features remain exposed? Is the release free or monetized? A monetized store release needs a separate current billing-policy review; existing premium flags are not a payment implementation.

Recommendation to discuss: ship a bounded, welcoming mobile-web experience first, supporting desktop through the same codebase; treat Android/iOS packaging as the next acceptance track. This is a proposed default, not authorization to downgrade the user's app-store goal.
