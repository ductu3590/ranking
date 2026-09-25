# Canonical Stitch References

This folder contains the approved visual-reference bundle for the Unified Internal Tournament Setup recovery.

- Stitch project ID: `16224817196221939744`
- Imported on: 2026-09-23
- Original export: `_workspace/stitch-internal-setup/stitch_pickleball_tournament_management_dashboard` (trong repo)
- The raw export is kept unchanged next to this folder. This bundle gives implementation and QA stable, descriptive paths.

## Setup Screens

| Key | Stitch screen ID | Purpose |
| --- | --- | --- |
| `setup/01-tournament-info` | `eb47d977df8544ec85215565c840d0d9` | Step 1: tournament information |
| `setup/02-participants` | `d4fd143f81474548bbcfde53d6184394` | Step 2: participants |
| `setup/03-format-pairing` | `f182baaf80914de7bdb7c8d78d121e2a` | Step 3: format and pairing |
| `setup/03-format-pairing/tap-to-pair.*` | `3ebeb2f0f3f949eab3b318dd30f8c77d` | Step-3 tap-to-pair interaction state, not an extra wizard step |
| `setup/04-draw-preview-finalize` | `f96d2e8bf77943e2a8511acce797b022` | Step 4: draw, preview, and finalization |

## Operations Screens (Epic 2)

See `operations/README.md` (10 screens, generated 2026-09-24 via the Stitch connector, same project and light design system).

`DESIGN.md` is the visual token authority. The `shell-references/` files provide broader club-shell inspiration only; they do not define tournament setup behavior. `unclassified/image.png` has no known functional role.

## Usage Rules

- These are reference artifacts, not executable application dependencies.
- Do not copy generated Tailwind, CDN imports, remote avatars, placeholder player data, fake save messages, or unsupported product promises into `app/`.
- Production UI must use local components, CSS, approved Next font loading, real API data, and Vietnamese user-facing language.
- The approved recovery-plan overrides take precedence over conflicting Stitch demo behavior, including no public seed/hash/DUPR, no reserve list, truthful per-step saves, and click/tap-two pairing on every device.
- See `stitch-source-manifest.json` for source provenance and SHA-256 values.
