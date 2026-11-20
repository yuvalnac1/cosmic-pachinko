# Cosmic Pachinko — Main Design (v1 build)

Source: *Cosmic Pachinko — PRD* (Nov 20 2026). Reference image `assets/imported/image.png` is a mood reference only (mobile portrait machine); this build targets **desktop Chrome, keyboard (Space)**.

## Player fantasy & loop
An alien boss guards a black hole. Hold **Space** to charge, release to fire. Weak shots drop down the left, strong shots loop over the top to the right. Turn the daily 100 balls into as many as possible.

## Desktop layout
- Full-window cosmic backdrop.
- Centre: portrait pachinko board (logical 760×1000, scaled to fit height) inside a chrome machine frame with an outer launch rail on the left curving over the top.
- Left panel: ball counter (rolling), status (Fever timer, Ball Rain), session stats.
- Right panel: alien hit ring (n/20), event feed, hint "Hold SPACE".
- No power meter (per PRD) — only a rising charge tone.

## Objects (board)
| Object | Behaviour | Reward |
|---|---|---|
| Star pins | bounce, flash, note climbing a scale in chains | — |
| ×2 / ×3 holes (4) | ball splits into 2/3 | splits chain |
| Lucky cup | slides along bottom | +1 per catch |
| Alien (centre) | counts hits, ring of 20 lights | Ball Rain at 20 |
| Black hole (below alien) | slow-mo, zoom, Wheel of Fortune | wheel prize |
| UFO | crosses board every ~90 s | +10 |
| Hidden hole | tiny unmarked gap, top-right pocket | +50 + dancing astronaut |
| Drain | bottom | lost |

## Special modes
- **Wheel**: +5, +10, +25, Fever, Ball Rain, Jackpot +100 (weights in dev menu).
- **Fever** 20 s: winnings ×2, rainbow pins, fast starfield, faster music, big countdown.
- **Ball Rain** 10 s / 40 free balls from top; alien counter resets.

## Economy & save
100 balls/day, 1 per shot, saved in localStorage (`balls`, `lastRefill`). At 0 → dim board, "Come back tomorrow for your 100 balls." + countdown to local midnight.
**Open question decision (default, tunable in dev menu):** top-up to 100 if below (toggle to "+100 on top").

## Developer menu (` backtick)
Live sliders for every PRD constant; buttons: +100 balls, reset day, Fever, Ball Rain, spawn UFO, spin wheel, show hit areas.

## Audio
All SFX synthesised with WebAudio (pin notes, whoosh, clink, ouch blip, hum, ticks/fanfare, laser, jingle, music loop normal/fever/rain). Can be replaced by recorded assets later.

## Asset list
| Asset | Role | Spec | Source | Runtime path |
|---|---|---|---|---|
| Cosmic backdrop | page background | 16:9 2K | generated | public/art/backdrop.jpg |
| Board playfield | board background | 3:4 | generated | public/art/board.png |
| Alien pod | centre target | 1:1, keyed | generated | public/art/alien.png |
| Black hole | jackpot hole | 1:1, additive | generated | public/art/blackhole.png |
| UFO | bonus target | 1:1, keyed | generated | public/art/ufo.png |
| Lucky cup | catcher | 1:1, keyed | generated | public/art/cup.png |
| Astronaut | secret animation | 1:1, keyed | generated | public/art/astronaut.png |
| Pins, holes, wheel, particles, HUD | dynamic | — | code-drawn | — |

## Implementation notes (v0.1 build)
- Stack: Vite + TypeScript, raw Canvas 2D, custom fixed-step physics (240 Hz). Source in `src/`; all tunables in `src/tuning.ts` (dev-menu edits persist in localStorage until "Reset constants").
- Shot physics: the ball launches up the left wall into the top arc rail. Weak shots fall off the rail early (left side); about 60% strength reaches the apex; full strength rides down the right wall, where chrome kickers knock it back into the pins.
- Hidden hole: an unmarked notch on the rail about 24° right of the apex. It only catches a ball riding the rail just fast enough to stay on it, which needs roughly 61–62% strength (a hold of about 0.55 s). Launch speed has ±1.2% jitter.
- Each ball can only count one alien hit. The black hole sits inside a 9-pin guard ring.
- Balance sim: `npm run sim` (economy: random / fixed 0.5 / fixed 0.8 strength) and `npm run sim:strength` (per-strength hit rates). Current return per ball spent: random ≈0.45–0.55, best aim (≈0.5) ≈1.2–1.4, strong ≈0.25. Needs a tuning pass.
- Mouse/touch press = Space (fallback for the preview iframe only; the PRD scope is keyboard).

## v0.2 changes
- **Multiplier ships replace bare holes.** Four mini UFOs (×2) surround the alien; two rockets and two satellite dishes (×3) sit on the lower board. Each has a solid hull (bounces, dings) and a glowing hatch on top. A ball dropping into the hatch splits ×2/×3, and the new balls drop out from under the ship. Pin funnels guide balls toward each hatch.
- **Orb bumpers** flank the alien (strong kick, sparkle).
- **Pin layout** follows reference-style patterns: concentric rail arcs, W crowns, parenthesis arcs around the alien and black hole, lanes, chevrons and a fan above the cup, with a sparse filler grid.
- **Super Wheel:** a ball reaching the black hole during Ball Rain spins a gold wheel where every prize is ×2 (+10/+20/+50, Rain ×2, Fever 40 s, Jackpot +200).
- **Effects layer:** marquee chase lights around the frame (speed and colour follow the mode), comets, asteroids (board and screen), searchlight sweeps, screen flashes on big events.
- **Shot:** shorter charge (0.55 s to full) with an ease-out curve, so taps already have punch. New launch sound: soft spring thunk and the ball rolling up the rail.
- **Right slingshot** kicker throws strong shots back toward the alien, so every strength is viable.
- **Dev menu:** backtick key or the DEV button bottom-left. New: Spin SUPER wheel, charge curve, slingshot power, hatch sizes.
- Simulated return per ball spent: about 0.7–1.0 for weak, mid and strong shots.

## v0.3 changes (classic machine reference)
- **Gourd housing:** the alien sits in a gourd-shaped neon housing with a chrome **crown** on top, like the classic hero housing. The crown has 3 holes: side holes pay +3 and count as an alien hit; the centre **WARP** hole (guarded by a roof pin) streaks the ball down through the alien into the black hole, which then spins the wheel.
- **Layout follows the classic machine:** two UFO "discs" high up, a waist row of four (outer UFOs, inner orb bumpers), and a staggered catcher row (outer rockets/dishes higher, inner ones lower) with the black hole as the centre gem.
- **Console** below the board: a chrome tray showing the actual ball stack (hex-packed, up to about 100 visible, "+N in reserve" beyond that). Balls leave through the outlet pipe to the launcher when you shoot, and winnings pour in from a chute. Plus a **launch handle** (generated dial art + lever) that turns with the Space charge and springs back with a wobble on release.
- Balance: at most one Super Wheel per Ball Rain (removes a runaway chain); black-hole radius 6, ×2 hatch 1.0, ×3 hatch 0.95. Simulated return about 0.8–1.1 at every strength.
- v0.3.1: a ball can hit the alien again after it touches a pin, orb or ship in between (it was once per ball before). Alien hits are up about 35% and Ball Rain now comes about every 75 shots. Simulated return is about 1.0–1.2; tune it down with "Alien hits → Rain" or "Ball Rain balls" in the dev menu if days last too long.
- v0.4: **Last Chance Wheel.** The first time a day you hit 0 balls (with nothing left in play), a cyan wheel appears: "Out of balls — one free spin, 60% to win! Press SPACE." Slices: SEE YOU ×2 (40% total), +10 ×2 (24%), +20 (14%), +30 (7%), Ball Rain (12%), Jackpot +100 (3%). Used once per day (saved as `lastChance`); afterwards you get the normal "come back tomorrow" screen. Odds and on/off are in the dev menu, plus a "Last chance wheel" button to test it.
- v0.4.1: lower row reordered to antenna, rocket, rocket, antenna. New **Ball Back pocket** above the lucky cup: a wide chrome housing with a ∧ roof and the opening at the peak. Balls on the roof roll off sideways; a ball dropping straight in is returned (+1, doubled in Fever). Catches about 5% of shots. Black-hole radius 5. Simulated return about 0.95–1.1.
- v0.5: **Golden Super Alien in Ball Rain.** The alien no longer disappears. He explodes for 0.7 s, then returns as a golden, electrified version with a rotating sunburst (new art `public/art/alien-gold.jpg`). Every ball that hits him (or a crown side hole) pays immediately: 1 ball + 1 more per 6-hit combo (max +2), doubled in Fever, with "COMBO ×5/×10" call-outs, rising coin notes and a running "GOLD COMBO n · +won" readout. Each ball pays the golden alien once. To pay for this, **Alien hits → Ball Rain is now 30** (Ball Rain about every 90 shots). Simulated return about 0.9–1.2. Tunables: golden balls/hit, combo step, combo max.
- v0.5.1: **Power meter** in the left launcher housing (requested; this overrides the PRD's "no power bar"). It fills bottom→top while Space is held (cyan→green→gold→red), with ticks at 25/50/75%, a live % readout below and a flashing **MAX** at the top. A gold arrow and line stay at the previous shot's strength, to help players find and repeat a sweet spot.
- v0.6: **Space Hoops** (new Last Chance slice "HOOPS", 10%; one of the two +10 slices was replaced). A full-screen neon court with a floating basket at a random distance left/right. The aim arrow sweeps at a constant speed. HOLD Space to lock the aim and charge the power (it ping-pongs, so over-holding drops it), RELEASE in the gold zone. Swish = +100 balls with jackpot-style celebration; grazing the rim = +10; miss = nothing. Tunables: prize, aim speed, power fill time, swish tolerances. Dev button "Space Hoops".
- v0.6: the **alien grows** during Fever (×1.15) and Ball Rain (×1.28): a bigger target for hits and golden-combo payouts. Its top stays under the crown and it grows downward; pins near it were moved to make room.
- v0.6.1: **Ball Back hole size** slider in the dev menu (`returnGap`, default 13; ~5% catch at 13, ~8% at 18, ~11% at 24). **Secret hole → Space Hoops:** finding the hidden hole now pays +50, shows the dancing astronaut with "BONUS: SPACE HOOPS COMING UP!", then opens a bonus round of Space Hoops (swish +100). Dev button "Secret hole" triggers it.
- v0.6.2: **New title logo** (generated art `public/art/logo.jpg`: chrome-cyan "COSMIC" over magenta-to-gold 3D "PACHINKO", with an orbiting pachinko ball ring). The black background is keyed out at load. It sizes with the window (about 13% of height, 76–150 px on desktop), floats gently, has a light sweep across the letters, cycles rainbow in Fever and glows green in Ball Rain.
- v0.7: **Tuning lives in `tuning.config.json`** (project root). The dev menu writes every change to it through a dev-server endpoint (`/__tuning`); the file is excluded from file watching, so edits never reload or reset the game. Code changes to `DEFAULTS` in `src/tuning.ts` only fill keys missing from the file. The production build bakes the file in (that's the "make them constants" step). On first run the file is seeded from the values saved in the designer's browser. Automated playtest sessions are read-only.
- v0.7: **Black Hole Hoops** (reskinned Space Hoops): the game's nebula backdrop with a purple/cyan warp grid, a chrome pachinko ball with a cyan comet trail, a black-hole vortex inside a chrome ring as the hoop, and the alien on a neon glass backboard floating on a UFO beam. On success the ball spirals into the vortex and the alien turns golden and dances ("SWALLOWED! +100"). Otherwise "OFF THE RIM! +10" or "LOST IN SPACE…".
- v0.8: **Welcome Wheel.** On a player's first-ever visit a gold "★ WELCOME WHEEL ★" opens before the first shot: "Welcome! Your first spin is on the house — press SPACE to spin". It uses the normal wheel prizes with boosted odds: Fever 22%, Ball Rain 22%, +25 20%, +10 22%, Jackpot 6%, +5 8% (vs 5% / 5% / 2% jackpot normally). It's shown once (saved as `welcomed`). Odds and on/off are in the dev menu, plus a "Welcome wheel" replay button.
- v0.9: **Black hole charges up.** The black hole must swallow `blackHoleBallsForWheel` balls (default 5, dev menu "Black hole balls → wheel") before the Wheel of Fortune opens. A ring of lights around it shows progress (the last one blinks gold when one more ball will open the wheel). Each partial ball gives a gulp sound, an inward spark swirl and an "n/N" pop-up. Slow-mo/zoom only plays for the ball that will open the wheel. The WARP hole still opens the wheel instantly. During Ball Rain, filling the meter still gives the Super Wheel.
- v0.9: **Hoops hole size** (`hoopsHoleSize`, ×1 default) scales the black-hole hoop visual and the swish/rim aim tolerance together.
- v0.9: `npm run sim:players -- players=1000 cap=400` simulates many players (tapper/mid/power/random/learner personas, wheels and Hoops automated) in worker threads using tuning.config.json. It reports core return-to-player, per-persona return, bust rate and event rates.
- v0.9.1 fix: the WARP hole no longer bypasses the black-hole counter. A warp ball now feeds the black hole like any other ball (`warpCharge` balls, default 1, dev menu "WARP counts as N balls"). Verified headless: with N=10 the wheel opens only on the 10th ball, warps included.
- v0.9.2: removed the Ball Back pocket (and its returnGap setting); the sliding lucky cup is the only bottom catcher.
- v0.9.3: **Out-of-balls fix.** Balls wedged on a kicker tip (slow for >2.5 s) are now cleared, so the Last Chance Wheel / "come back tomorrow" screen can't be blocked. At 0 balls with balls still in play, a pulsing "OUT OF BALLS — waiting for the last balls…" banner and a log entry appear; pressing Space at 0 shows "NO BALLS LEFT".
- v0.9.3: **Escalating targets.** Each alien-earned Ball Rain raises the next alien target by `alienRainStep` (10): 30 → 40 → 50… Each black-hole wheel raises the next black-hole target by `bhWheelStep` (5): 10 → 15 → 20… Levels are saved (reloading doesn't reset them) and reset with the daily refill. The light rings and side panel show the current target. Dev: steps adjustable, "Reset hit targets" button.
- v0.9.4: **Jackpot** (+100) now also starts Fever and Ball Rain immediately (Super Wheel jackpot: double length/balls). **Counters:** when the alien target exceeds 50, the side panel swaps the dots for a big digital "hits / target". After the player first opens the wheel via the black hole (`bhKnown`, saved permanently), the panel gains a BLACK HOLE "n / target" counter and the board shows "ALIEN n/N · HOLE n/N" under the alien.
- v0.9.5 **Performance (Chrome):** removed `backdrop-filter` on panels and the masked logo shine (both forced full recomposites over the animated canvas); backdrop and board art are baked into offscreen canvases per resize; canvas is opaque (`alpha:false`); render resolution capped at 1.5× DPR; `shadowBlur` capped at 14 and disabled below high quality; particle cap; HUD only touches the DOM when values change. **Adaptive quality:** if FPS < 45 for 2 s the game drops high → medium (no glow blur, 1.25× res) → low (1×, fewer particles). Measured 72 FPS at 1920×1080 during Fever + Ball Rain + auto-play. Dev menu shows FPS/quality and has "Quality: cycle".
- **v1.0 release lock:** the designer's dev-menu values are baked into `DEFAULTS` in `src/tuning.ts` as final constants. The dev menu and DEV button are disabled (`DEV_MENU = false`; the backtick does nothing), browser-saved tuning is ignored and cleared, and `tuning.config.json` plus its dev-server plugin were removed. Verified: production build contains the locked values; the Welcome-Wheel jackpot triggered Fever + a 35-ball Ball Rain.
