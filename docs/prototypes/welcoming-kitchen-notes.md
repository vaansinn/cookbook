# Welcoming kitchen — first website draft

## Scope

Standalone prototype under redesign task #60a. Open `http://127.0.0.1:5098/welcoming-kitchen.html` with the existing preview server. The app on port 5097 and the earlier prototype are unchanged. No commit, push, production UI edits, backend writes, account integration or deployment is included.

Three routes: ingredient-first library, recipe overview, and cooking view; a completion screen explicitly confirms that no cook was saved. Both Pasta and Beans & lentils find the same lentil Bolognese. Other categories demonstrate honest empty states because the draft contains one dish, not invented library content. Search filters the sample by dish/ingredient text. Cuisine filters and the rest of the app navigation are deferred, not removed from the implementation scope.

## Visual decisions

- Blue enamel controls, warm porcelain background, oat teaching surfaces; photographs carry most of the colour.
- Bricolage Grotesque headings paired with Plus Jakarta Sans body text. No serif, childish reward motifs or heavy button ledges. These are prototype-only geometry/type proposals, not amendments to production design rules.
- One recognisable ingredient arrangement alongside the finished dish; a small code-native simmering illustration supports the teaching note. No generated image is claimed to depict a verified cook or doneness standard.
- Ingredients remain left of the wider step area on desktop. Compact recipe tabs remain sticky; cooking ingredients open in a native modal sheet.
- English/German and light/dark controls are included. State is in memory for this preview only; refreshing starts it over. A timer is a reminder, not a doneness check.

## Content and safety gate

### AI transparency follow-up

The creator confirms having personally cooked the recipes so far. The draft records that confirmation for the sample `lentil-bolognese/basic` only, while `imageCompared` remains false: no explicit comparison with this specific generated image has been supplied. It shows “Cooked by me” and “Image comparison pending”, not a blanket verified badge. The combined image-match statement is gated on both confirmations. This is prototype-local metadata, not an implemented production verification/audit workflow. Substantial recipe/image changes require reassessment when integrated.

“How I use AI” opens a native disclosure dialog from the desktop header and footer; every generated-image label also opens it, including on mobile and inside the ingredients sheet. Mobile keeps the header compact, with access through captions/footer. EN/DE copy explains the one-person workload, useful image arrangements, image limitations, the two separate checks, and AI assistance with site building/explanatory copy. It does not claim professional certification, guaranteed outcomes or that the images document real cooks.

Verified `node docs/prototypes/welcoming-kitchen.test.mjs`: locale-key parity, all four combinations of cooking/image-check flags, sample scope and pending-image state. Browser checks: header/caption opening without navigation; Escape restores the original trigger; nested AI dialog closes back into the still-open ingredient sheet; DE dark-mode mobile content fits without horizontal overflow. Cooking state and timer are not reset by opening the explanation. A single-button native dialog can move keyboard focus to browser chrome; no behind-dialog controls are activated.

Equipment clarification requested from the creator: two pots plus one pan with parallel lentil/pasta cooking, or one pot plus one pan sequentially. Until answered, no cooking source content or timing estimate is changed and the review warning remains. This is the remaining blocker for the requested equipment correction, not for the completed disclosure UI.

Recipe source: `content/recipes/lentil-bolognese/basic.{en,de}.md`; teaching summaries from `content/lessons/simmering/{en,de}.md`. Original method preserved (punctuation typographically normalised). The five ingredients are dry spaghetti, red lentils, jarred tomato pasta sauce, dried Italian herbs and salt; cooking water is called out separately. Serving controls scale displayed amounts, never the illustration. Generated amounts are not measurable evidence.

The existing source contradicts itself: one-pot equipment metadata and sequential notes versus the instruction to cook pasta while lentils simmer, plus a pan for sauce. The 25-minute estimate is labelled unverified in a visible review disclosure on recipe/cooking screens. No culinary approval has been inferred and no source recipe has been rewritten.

## Connected discovery follow-up

The separate Explore tab adds the requested pasta basics → tomato pasta → tomato
pasta with lentils network and three new images. See
[network design, scope and prompts](welcoming-network-notes.md). It does not
replace the earlier recipe/Cook Mode or resolve that source's culinary gate.
Component selection for the two dishes is deferred to the next feedback round.

## Image assets and prompts

Generated with the built-in image-generation tool. Both selected original PNG outputs are copied into `kitchen-assets/`, rather than referenced from a private generation directory. They are 1536 × 1024, approximately 2.65 MB each; responsive WebP/AVIF derivatives remain a production optimisation, not yet implemented. Google Fonts is the only third-party page resource; imagery and scripts are local.

### `kitchen-assets/lentil-bolognese.png`

Use case: photorealistic-natural. Asset type: food hero for a welcoming cooking-learning website prototype. Create one landscape editorial food photograph, aspect ratio 3:2. A modest everyday serving of spaghetti with red lentil tomato Bolognese, in a warm ivory ceramic shallow bowl with a thin dark enamel-blue rim, on a pale honey oak kitchen table. Sauce is thick rustic red-orange tomato sauce with softened red lentils and tiny dried Italian herb flecks; simple and achievable, not fine dining. A fork rests beside the bowl on a casually folded oatmeal and blue-striped kitchen towel. Soft natural side daylight, tactile matte ceramics, warm but true-to-life colors, appetising detail, candid ordinary home kitchen feel. Bowl occupies the central 70 percent so it can crop well square or landscape. No garnish of fresh herbs, no cheese, no meat, no raw vegetables, no extra ingredients, no lettering, no labels, no logos, no watermarks. This depicts a recipe with dry spaghetti, red lentils, jarred tomato pasta sauce, dried Italian herbs and salt only. Food is main subject, restrained styling.

### `kitchen-assets/ingredients.png`

Use case: photorealistic-natural. Asset type: ingredient flat lay for a welcoming cooking-learning website prototype. One landscape 3:2 overhead editorial photograph on a pale honey oak kitchen table, soft natural daylight, subtle shadows, true ingredient colors. Show EXACTLY five food ingredients, each distinctly separated with breathing space in an informal practical arrangement: a bundle of uncooked dry spaghetti about 220g laid horizontally on a folded oatmeal and blue-striped tea towel at upper left; a shallow ivory ceramic bowl with enamel-blue rim containing dry split red lentils about 150g at lower left; one open unbranded clear glass jar filled with red tomato pasta sauce about450g at right center; a tiny plain ceramic dish containing dried Italian herb flakes at upper center; a small ceramic pinch bowl of fine white salt at lower center. Jar has no label and its plain lid beside it. Everything visible completely, warm approachable home kitchen styling, realistic sizes, not clinical food catalog. No other food, no vegetables, no fresh tomatoes, no garlic, no onion, no basil, no oil, no cheese, no knife, no text, no typography, no numbers, no graphic overlays, no watermark. Useful clear ingredients arrangement, not decorative banquet. This is gather-before-preparing, lentils are dry and spaghetti uncooked.

## Verification

JavaScript syntax check, local HTTP checks and `git diff --check` pass. Browser QA in the in-app Chromium browser verified:

- Pasta and Beans & lentils each return the same sample; Rice returns an honest empty state; search and clearing work.
- Serving increase from 2 to 3 produces 330 g spaghetti, 225 g lentils, 675 g sauce and 1.5 tsp each of herbs/salt. The unchanged photograph is explicitly not a quantity guide.
- Ingredient checkboxes persist between recipe, cooking sidebar and mobile sheet during the current page session.
- Reminder counts down while the sheet is open (12:00 to 11:50 observed); Escape restores focus to Ingredients.
- Sticky recipe tabs support arrow keys/Home. First method selection places its heading below the sticky bar (bar at 0, height 60; heading at about 85 pixels).
- All four steps and the no-save completion state are reachable. No page console errors were reported.
- EN/light and DE/dark cooking inspected; six semantic text/surface pairs measured in each theme, all above 4.5:1 (lowest 4.80:1).
- No horizontal overflow in the checked 320 px library/cooking, 390 px cooking, 768 px recipe and 1024 px cooking views. Ingredient images load with their full aspect ratio.
- Resizing an open mobile sheet to desktop closes it, focuses the visible H1 and restores ingredients-left / wider-steps-right order.

Screenshots are saved in `C:/Users/zweiz/.codex/visualizations/2026/09/05/01a07204-bcec-7173-9431-3eaab7058750/` as `welcoming-kitchen-library.png`, `welcoming-kitchen-recipe.png`, `welcoming-kitchen-cook.png` and `welcoming-kitchen-mobile-cook.png`.

These are viewport-emulation checks, not physical-device, screen-reader, 200%-zoom or exhaustive accessibility certification. Reduced-motion CSS is present but OS-level reduced-motion testing remains open. These prototype checks do not substitute for production session, snapshot, auth, reflection or culinary acceptance tests. The actual application was not rebuilt because it was not changed.
