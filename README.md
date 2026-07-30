# NIGHTFALL PROTOCOL

A single-mission first-person shooter built in vanilla Three.js (ES modules, no build step). Infiltrate the Blackgate compound, eliminate the squad leaders, plant a charge on the server, and extract before reinforcements overrun the site.

## Run it

Browsers block ES-module `import` over `file://`, so serve the folder over local HTTP. Pick one:

```bash
# Python 3
python3 -m http.server 8000

# Node (no install needed)
npx serve .

# VS Code
Right-click index.html -> "Open with Live Server"
```

Then open `http://localhost:8000` and click **CLICK TO DEPLOY** (this also grants pointer lock + starts audio, which browsers require to be triggered by a click).

Three.js itself loads from a CDN (`unpkg.com`) via an import map in `index.html`, so you need an internet connection the first time it loads in a browser — everything else (textures, audio, level, AI) is generated procedurally in code, so there are no binary asset files to manage.

## Controls

| Action | Key |
|---|---|
| Move | WASD |
| Look | Mouse |
| Fire | Left click |
| Aim down sights | Right click (hold) |
| Sprint | Shift (hold, while moving forward) |
| Crouch | Ctrl / C |
| Jump | Space |
| Reload | R |
| Interact (plant charge) | E (hold) |
| Pause | Esc |

## Mission flow

1. **Infiltrate** — walk through the compound's front gate.
2. **Eliminate** — take down the 2 marked squad leaders (regular hostiles are optional but will keep shooting at you).
3. **Plant** — reach the glowing server in the central building and hold **E** for 3 seconds. This trips the alarm.
4. **Extract** — reinforcements start arriving from 3 directions; reach the yellow helipad marker before the timer runs out.

Health does not regenerate — play the cover and the crouch/sprint tradeoffs.

## Project structure

```
index.html         HUD markup, menus, import map
style.css           Tactical HUD styling
js/main.js          Engine bootstrap, render/post-processing pipeline, game loop
js/player.js        Pointer-lock controller, movement physics, camera bob/shake
js/weapon.js         Weapon model, hitscan firing, recoil/sway, muzzle flash, tracers
js/enemies.js       Enemy soldier model + patrol/alert/attack AI state machine
js/level.js          Compound geometry, lighting rig, colliders, mission markers
js/objectives.js     Mission stage state machine (infiltrate/eliminate/plant/extract)
js/hud.js           DOM HUD controller (health, ammo, objective text, hit markers)
js/textures.js       Procedural canvas textures (concrete, metal, camo, starfield...)
js/audio.js          Procedural WebAudio SFX (gunshot, footsteps, alarm, explosion...)
js/utils.js         Math + AABB collision/raycast helpers
```

## Honest scope note

This targets "polished, atmospheric browser FPS" — physically-based lighting, bloom, procedural PBR-ish materials, hitscan combat with real recoil/sway, a patrol→alert→attack enemy AI, and a 4-stage mission with failure states. It does **not** attempt to match a modern Call of Duty release: no motion-captured animation, no ray-traced GI, no destructible geometry, no multiplayer netcode, no asset pipeline of scanned textures/models. Those require a studio-scale engine and art team, not a single Three.js scene graph. Treat this as a strong indie/tech-demo baseline that's genuinely extensible — more enemy variety, weapons, or level geometry all slot into the existing systems.
