# Animated sprites

Hand-drawn (in code) pixel sprite sheets that replace the temporary static sprites.
Each sprite has a generator in `tools/`, its sheet + atlas in its own folder, and shows up in `preview.html`.

| Sprite | Generator | Sheet |
|---|---|---|
| Satellite (deploy + working) | `tools/gen-satellite.mjs` | `satellite/satellite.png` + `satellite.json` |
| Rover (fall, land, deploy, drive) | `tools/gen-rover.mjs` | `rover/rover.png` + `rover.json` |
| Crew after landing (exit, plant, wave) | `tools/gen-crew.mjs` | `crew/crew.png` + `crew.json` |

## Regenerate

`npm run sprites` rebuilds all sheets and copies the PNGs to `public/assets/sprites/`, which is where the game loads them from. Or one at a time:

    node animated_sprites/tools/gen-satellite.mjs
    node animated_sprites/tools/gen-rover.mjs
    node animated_sprites/tools/gen-crew.mjs

`tools/lib.mjs` holds the shared palette (sampled from the rocket part sprites), the pixel `Frame` and the sheet writer.

## Preview

    python3 -m http.server 8765 --directory animated_sprites
    # open http://localhost:8765/preview.html  (switch sprite with the buttons, or #rover / #satellite / #crew)

## Satellite sheet (48x48 frames)

- Row 0 `deploy`, 10 frames at 110 ms, plays once: eject puff, solar panels unfold, mast rises, dish opens, light goes green.
- Row 1 `working`, 8 frames at 130 ms, loops: dish scans, signal waves leave it, light blinks, a glint sweeps the panels.

## Rover sheet (64x64 frames, ground is row 57)

- Row 0 `fall`, 1 static frame: the airbag ball while it drops. Nothing animates until it touches the ground.
- Row 1 `land`, 7 frames at 130 ms, once: squash on impact, two bounces, settle, deflate over the shell.
- Row 2 `deploy`, 10 frames at 130 ms, once: the shell opens, the roof pops off, the rover unfolds mast, camera, dish and solar panel, light goes green.
- Row 3 `drive`, 8 frames at 110 ms, loops: wheels spin, dish scans, dust trails behind.

## Crew sheet (48x48 frames, ground is row 44)

What plays after the rocket lands. The rocket is the player's own build, so it is not in the sheet: place the sprite beside the rocket's base (x = 6 is the hatch, the astronaut ends up standing at x = 24).

- Row 0 `exit`, 10 frames at 110 ms, once: airlock puff, the astronaut steps out and walks to the spot.
- Row 1 `plant`, 8 frames at 140 ms, once: carries the flag, plants it, it unfurls. On the landing site only.
- Row 2 `wave_flag`, 6 frames at 150 ms, loops: waves beside the planted flag (flag is the game's cyan pennant on a brown pole).
- Row 3 `wave`, 6 frames at 150 ms, loops: just waves. For landing safely off the site.

On site: `exit`, `plant`, `wave_flag`. Off site: `exit`, `wave`.
