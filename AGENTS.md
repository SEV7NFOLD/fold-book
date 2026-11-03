# AGENTS.md: FoldBook animations

The FoldBook animation handoff is **already integrated**. This file tells Codex how to keep it working.

## How it works
- **lottie-web 5.12.2 is self-hosted** at `assets/vendor/lottie-5.12.2.min.js`. The CSP in `vercel.json` only allows scripts from `'self'`, jsDelivr and unpkg, so **never load lottie-web from another CDN**.
- **Characters:** `window.playFoldBookMascot(character, state, container, options)` lives in `assets/js/mascots.js`.
  - `character` is `"foldo"` or `"eco"`.
  - It uses `assets/js/foldbook-characters.js` (the approved helper) and the data in `assets/lottie/mascots/*.json.gz.b64` (gzip plus base64 of the approved files).
  - Dr. Eco defaults to `{ cap: "round" }`. For Foldo, pass `{ flameDays }`.
  - Below 96 px (Foldo) or 120 px (Dr. Eco) wide, it automatically shows static art.
- **UI animations:** `window.playFoldBookUI(file, marker, container, options)` and `window.setFoldBookUIProgress(file, marker, container, value)` live in `assets/js/ui-animations.js`.
  - They use `assets/js/foldbook-ui.js` and the files in `assets/lottie/ui/<file>-dark.json`.
  - For streak-flame `header`, pass `{ flameDays }`.
- **Cleanup:** call `stopFoldBookMascot(container)` or `stopFoldBookUI(container)` before reusing a container for something else. Players whose container leaves the page are cleaned up automatically.
- **Fallbacks:** put a static `<img>` or `<span class="foldbook-fallback">` inside a container. It hides automatically once the animation renders, via the `mascot-ready` class.
- **Theme:** the app is dark-only, so always use the `-dark` files and the dark static art (`assets/brand/foldo-mark-dark.svg`, `foldo-icon-dark.svg`, `eco-avatar.svg`).
- **Picking the character:** `foldbookCharacterFor(course)` in `app.js` returns `"eco"` for ECO courses and `"foldo"` otherwise.

## Rules
1. **Never edit, retype, reformat or regenerate** animation data, markers or layer names. Copy files byte-for-byte.
2. **Dr. Eco appears only for Economics.** Foldo covers everything else.
3. **Dr. Eco's cap:** keep the `round` and `none` options. The cultural review is pending. Never add a slouched cap.
4. **Limits on screen:** at most one animated Dr. Eco and at most two large characters.
5. **Small slots use static art.** Don't animate characters below the size limits.
6. **Never block the student.** Don't disable, cover or delay buttons or answers for an animation.
7. **Adding a file:** add it to the allowlist in `scripts/build-site.js`, and to `SHELL_FILES` in `sw.js` if it's a script. Bump `CACHE_NAME` when shell files change.
8. **Binary files:** don't create them with Codex. Ask the human to upload them.
9. **Tests:** `npm test` has four failures that already existed before this work. Don't add new ones.
10. **No sounds** on new animation moments until a human decides on the sound set.

## Not yet integrated (optional later work)
- **Pull-to-refresh, install guide, empty states, offline and upload:** the UI pack has markers for each (`status`, `install-and-empty`, `upload`). `pwa.js` currently uses its own branded pull-to-refresh.
- **Path tree nodes:** they keep their static icons, because animating every node is too heavy. `path-nodes` markers could animate only the node that just changed.
- **Pending checks:** real lower-end Android phone test, native Lottie players and the Dr. Eco cultural review.

The handoff bundle documentation (`README.md`, `manifest.json`) lists every marker and its intended trigger.
