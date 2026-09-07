# Pasta network — standalone design draft

## Scope and direction

Final Explore polish: map width capped at 960px, desktop nodes reduced to 52–56px
high with 30–34px thumbnails and tighter branch spacing. Longer labels can wrap
and grow on narrow phones; targets stay at least 44px. The lentil detail now has
a primary EN/DE “Open recipe” action directly below its heading, backed by an
explicit node `recipeHref`, replacing the easy-to-miss old draft text link.
Tomato now links to the component recipe prototype at `#recipe/tomato`; see
`welcoming-tomato-notes.md`. The eight empty ideas still have no invented recipe
destination. Browser Enter activation reaches the existing lentil recipe with
four method steps; 320px check has no horizontal overflow. Tests assert that
only the node with a real destination renders the action, before the overview
text. The first adjustable sauce component is now wired in the tomato recipe.
No production feature, content approval or release gate
is marked complete by that handoff.

2026-09-07. Open `welcoming-kitchen.html?draft=branches3#explore`. A separate prototype navigation tab, not a production feature. The expanded map has 11 nodes and 11 relationships: one pasta basics guide and ten dish ideas in tomato, pesto and cream branches. Creamy tomato is one shared node connected to both tomato and cream. Eight missing recipes have deliberately blank thumbnails, no ingredients/instructions, and a selectable “No recipe yet” state. Existing guide, tomato overview and earlier lentil recipe draft remain distinguished. No recipe or image was invented for a placeholder.

Node selection opens one detail area. All nodes have direct hash links; relationships work in either direction. Below 700px, sauce controls show one branch at a time, with a link across to the other sauce for the shared node. Branch URLs, reverse links, unknown-node fallback and focus return are handled without saved progress, locking or API writes. Search and other ingredient bases remain deferred.

The user-approved design system is retained: porcelain #faf8f3, warm surface #fffdf9, oat #eee5d4, enamel blue #284f62, ink #263d43; dark mode uses existing semantic tokens. Bricolage Grotesque headings and Plus Jakarta Sans body. The frontend-design guidance informed compact image/title/status nodes, with descriptions moved to a single detail area. Final desktop card heights are 52–56px, reduced from 68–76px. Desktop uses a root, three branch columns and a shared bottom node; mobile uses one compact branch, no horizontal canvas panning. Dotted outside connections identify the shared sauce idea. Placeholder names illustrate the agreed layout, not a claim that ten recipes exist.

The skill database's playful education/hero recommendation was rejected as mismatched to the agreed adult, quiet kitchen direction. Existing tokens and typography take precedence. No separate design-system files overwritten.

## Boundaries

- Existing library, lentil source recipe, Cook Mode, timers and AI explanation retained.
- The basics guide is newly authored prototype copy, not creator-verified culinary content. Packet-specific timing, taste checks and hot-water care replace invented universal times.
- Two dish panels show component names only, not interactive substitutions or complete new recipes. That is the next design round.
- The older lentil recipe remains explicitly an earlier draft; its equipment/timing contradiction is not silently resolved here.
- New image disclosure explicitly describes these as concept illustrations, not verified versions. No inherited cooked/image-comparison status from the old lentil snapshot.
- No database, API, authentication, storage, access changes or personal writes. No commit, push or deployment.

## Expanded-map verification

- Unit tests pass for 11 unique nodes, ten dish ideas, eight empty placeholders, three retained image files, shared/reverse connections, mobile branch/deep-link resolution and EN/DE rendering for every detail panel. Pending panels contain neither images, components nor instructions. Existing AI disclosure tests retained.
- Browser: all 11 desktop cards and connections render. The three original images load. Pesto mobile view shows four nodes; tomato/cream show five including the shared node. Placeholders open an empty detail area; Enter focuses its heading and Back returns to the visible sauce selector.
- Selecting creamy tomato from cream retains that branch and exposes links to both sauces. Only one shared node exists in the rendered map.
- DE/dark DOM layout checks at 320, 390, 699, 700, 768, 1024 and 1440 pixels: no horizontal overflow or invalid connector coordinates. Normal-width desktop and 390px mobile screenshots inspected separately; viewport overrides reset after checks.
- Regression browser checks: original sample recipe still shows four method steps; Cook Mode still opens with five ingredients and the original first step. No timer or personal save was started.
- Both JS syntax checks and `git diff --check` pass. Screenshot evidence: `pasta-branches-desktop.png` and `pasta-branches-mobile.png` in the same task-scoped visualization folder listed below.
- Not a production, physical-device, screen-reader or culinary acceptance sign-off. No production build, commit, push or deployment performed.

## Earlier three-node verification (historical)

- `node docs/prototypes/welcoming-kitchen.test.mjs` passes existing disclosure checks plus network EN/DE key parity, three asset references, guide/dish distinction, direct/unknown node links, valid edges, reverse traversal and a synthetic shared/cyclic relationship.
- Both JavaScript syntax checks and `git diff --check` pass.
- Real in-app browser: all three images loaded at 1254×1254; both connectors rendered; no horizontal overflow at 320, 390, 768, 1024 and 1440 CSS pixels in DE/dark. EN/light mobile and desktop inspected separately.
- Selecting the pasta guide with Enter moves focus to its detail heading and exposes four steps. Related-link navigation reaches the tomato overview; direct lentil selection shows its three components and the reverse tomato connection.
- Network AI disclosure shows the new concept-image status, not the old sample's cooking confirmation. Escape closes it and restores the caption trigger.
- Mobile navigation wraps deliberately into two columns, not an orphan final link. Existing source screens remain available; their production functionality has not been changed or re-certified.
- Screenshots: `C:/Users/zweiz/.codex/visualizations/2026/09/05/01a07204-bcec-7173-9431-3eaab7058750/pasta-network-desktop.png` and `pasta-network-mobile.png`. Temporary viewport override reset after capture.
- This is viewport emulation, not physical-device or screen-reader acceptance. New guide copy still needs culinary review. No production build needed for this standalone HTML/CSS/JS-only change.

## Image files and prompts

Three new square 1254×1254 PNG assets generated with the built-in image-generation tool (not the CLI). Originals copied into the project, existing images untouched. These show illustrative pasta, sauce and cooked lentils; they are not a claim to match the previous dry-red-lentil recipe. WebP/AVIF production optimisation is deferred.

### kitchen-assets/network-pasta.png

Use case: photorealistic-natural. Asset type: food illustration for a warm, adult beginner-cooking website, matching three-image series. Square photograph-style AI illustration. Top-down view of a single shallow ivory ceramic bowl with a thin muted enamel-blue rim, on a warm pale oat linen surface. Bowl centered, fully visible with ample margin, fills 75% of frame. Soft natural window light from upper left, realistic home cooking, inviting but not restaurant styling. No utensils, hands, text, labels, logos, garnish, herbs, cheese, props, raw ingredients or decorative extras. Subject: Plain cooked spaghetti only, softly tangled pale golden strands, moist but not oily; no sauce or toppings.

### kitchen-assets/network-tomato.png

Use case: photorealistic-natural. Asset type: food illustration for a warm, adult beginner-cooking website, matching three-image series. Square photograph-style AI illustration. Top-down view of a single shallow ivory ceramic bowl with a thin muted enamel-blue rim, on a warm pale oat linen surface. Bowl centered, fully visible with ample margin, fills 75% of frame. Soft natural window light from upper left, realistic home cooking, inviting but not restaurant styling. No utensils, hands, text, labels, logos, garnish, herbs, cheese, props, raw ingredients or decorative extras. Subject: Cooked spaghetti lightly and evenly coated with simple smooth red tomato sauce; no lentils, meat or other additions.

### kitchen-assets/network-lentils.png

Use case: photorealistic-natural. Asset type: food illustration for a warm, adult beginner-cooking website, matching three-image series. Square photograph-style AI illustration. Top-down view of a single shallow ivory ceramic bowl with a thin muted enamel-blue rim, on a warm pale oat linen surface. Bowl centered, fully visible with ample margin, fills 75% of frame. Soft natural window light from upper left, realistic home cooking, inviting but not restaurant styling. No utensils, hands, text, labels, logos, garnish, herbs, cheese, props, raw ingredients or decorative extras. Subject: Cooked spaghetti with simple red tomato sauce containing clearly visible small cooked lentils, rustic modest home portion. No meat, cheese or herbs.
