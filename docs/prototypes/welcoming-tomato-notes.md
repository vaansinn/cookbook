# Tomato pasta component prototype

The approved compact ingredient selector is wired into `welcoming-kitchen.html`.

- Explore → tomato → Open recipe: `#recipe/tomato`.
- Ready-made sauce is the default; Change previews tomatoes and herbs before Apply.
- All amounts align with reserved action space, including ingredients without Change.
- Recipe header: one dish title with a compact overview derived from the actual step titles, no eyebrow or prose subtitle. Equal-height servings/estimated-time tiles share a row. No repeated title in the sticky control bar. Time and overview update with the applied sauce choice.
- Three equal image frames tell the ingredient → preparation → finished-dish story. The ingredient image follows the sauce choice, while preparation and final illustrations are shared. Each image opens a full-size native dialog. Compact AI labels sit inside each image and open the existing disclosure, without nesting interactive controls. The quantity/doneness note remains in the enlargement dialog, not below the story. Asset provenance and final prompts: `tomato-story-image-prompts.md`.
- Servings and time retain visible labels with matching decorative line icons (plate/cutlery and clock), hidden from assistive technology. Equipment has its own heading and four-item list below ingredients; water is an ingredient row rather than a footnote. The proposal disclaimer is removed from the recipe and cooking screens; verification remains pending as documented below.
- Apply replaces the sauce ingredients, time estimate and entire method together. Cancel/Escape preserve the applied recipe. No per-step variant decisions.
- Desktop: ingredients left, method right. Mobile: existing sticky Ingredients/Method tabs.
- Cooking preview: `#cook/tomato`; the recipe choice is copied when starting. Returning to the recipe and changing sauce does not change an already-started cook. Starting from the recipe again creates a new preview.
- EN/DE, theme switching, mobile ingredient sheet, previous/next and completion are connected.
- This prototype is memory-only. Refresh starts fresh; no account, grocery, cook, confidence, reflection or persistent-storage writes.
- New quantities, timings and sauce variants remain unverified. Existing AI image is an illustration of the dish idea, not a verified result. No creator-cooked claim is inherited from the lentil recipe.
- Existing lentil recipe and its unresolved equipment/timing review are unchanged at `#recipe`.
- The library remains its previous one-dish layout; the new sample is reachable through Explore and the Sample recipe navigation.

Run `node docs/prototypes/welcoming-kitchen.test.mjs` for declarative regression tests. Browser checks must also exercise Apply/Cancel, both languages, mobile tabs, and an active cook surviving a recipe-choice change.

No publishing, commit or push is part of this increment. Further visual refinement and expansion to other components remain deferred.

## Verification, 2026-09-07

- Existing and new declarative tests passed with Node.
- Real browser: Explore link, Apply, Cancel, Escape, EN/DE switching, keyboard tab switching, mobile ingredient dialog, step navigation and completion passed.
- Started a jar-sauce cook, advanced to step 2, changed the recipe to tomatoes/herbs, and resumed the cook: it retained jar sauce and step 2. Starting again from the recipe used tomatoes/herbs at step 1.
- German 390px mobile and English 1280px desktop: all visible ingredient amounts had exactly matching right-edge coordinates. No horizontal overflow in these checks.
- Light mobile and dark desktop visually checked. Browser error log empty.
- Culinary testing, image comparison and production integration remain separate, uncompleted gates.
