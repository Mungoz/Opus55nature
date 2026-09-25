# Larchmere

*An autumn evening beside a glacial lake in the high Alps: real-time, in the browser, built with three.js.*

Golden larches against dark spruce, a turquoise lake mirroring a snow-dusted horn, starlings wheeling over the water at dusk. Every mountain, tree, texture and sound is generated when the page loads. The whole game is about 200 KB zipped.

## What's in the valley

- **Terrain**: a glacial U-valley generated on the GPU from ridged multifractal and eroded noise, with stratified limestone cliff bands, scree, alpine turf, snow on ledges and a pebble strand. Near and far heightmaps, horizon-based AO, and mountains that cast shadows across the valley at low sun.
- **Sky**: single-scattering atmosphere (Rayleigh, Mie and ozone) baked into a sky LUT and irradiance map every frame. Cumulus and cirrus layers with self-shadowing and cloud shadows on the ground. The sun follows real astronomy (46.5° N, late October), with a moon that has phases, a star field that turns about the pole, the Milky Way, and aurora.
- **Lake**: planar reflections with an oblique clip plane, Fresnel, wind-driven wave normals with "cat's paws", a sun glitter path, and Beer-Lambert water absorption with caustics on the bed. Also shoreline wash, whitecaps in a gale, and ripple rings from rain, fish, swan wakes and stones you throw.
- **Forest**: about 125,000 procedurally modelled spruces, larches and birches. Near trees are instanced meshes with wind sway, translucency and cascaded shadows; distant ones are baked impostor billboards with normal maps, crossfaded by dithering.
- **Meadows**: an "infinite" GPU grass field in tufts of several species (fine blades, broad leaves, flowering stems with seed heads, dry lodged straw), with patches grazed short, rolling gust fronts and backlit translucency. Underneath is a baked turf of moss, clover, dead blades and fallen larch needles. Drifts of autumn crocus, gentian, harebell, yarrow and hawkbit, plus reeds in the shallows.
- **Shore**: a strand of loose cobbles and pebbles (a baked stone-field texture plus thousands of individual stones) that darkens where the swash wets it, with algae-filmed stones fading into silt in the shallows.
- **Weather**: clear, breezy, overcast, rain and thunderstorm, blended smoothly, or left to change by itself. Rain streaks, surfaces that soak and dry, a low cloud deck that swallows the peaks, and branching lightning with thunder delayed by the speed of sound.
- **Wildlife**: a boids starling murmuration (with the odd falcon strike), V-formations of migrating geese, soaring golden eagles, a pair of mute swans and a raft of mallards (which up-end to feed), minnow shoals and cruising trout in the shallows that scatter as you approach, and leaping trout. On land there is a red deer herd with a rutting stag that roars at dusk, a colony of alpine marmots that sit up and whistle before bolting for their burrows, and red squirrels that race up the nearest trunk.
- **Creatures** are sculpted as signed-distance fields, traced from reference photographs, polygonised with surface nets, skinned to skeletons and animated procedurally (a lateral-sequence walk and a bounding gallop for the deer).
- **Sound**: fully synthesized, with no audio files. Wind and rustling leaves, lapping water, spatialized birdsong, loons echoing off the valley at dusk, owls at night, geese, splashes, rain and thunder.
- **Look**: HDR pipeline with MSAA, physically based bloom, god rays, AgX filmic tone mapping, split-tone grade and night-vision colour shift.

## Controls

| Input | Action |
| --- | --- |
| Drag (or `L` to lock the mouse) | Look around |
| `W A S D` | Move |
| `E` / `Space` · `Q` / `C` | Rise · sink |
| `Shift` · mouse wheel | Hurry · set flying speed |
| Click the lake | Skim a stone |
| `G` | Walk on the ground / fly |
| `T` | Cinematic tour |
| `[` `]` | Wind time back / forward |
| `P` | Photo mode (hide the interface) |
| `R` | Return to the meadow |
| `M` · `F` · `H` | Mute · fullscreen · help |
| Weather bar (bottom right) | Clear · breezy · overcast · rain · storm · let it change by itself |

On phones and tablets an on-screen joystick appears: drag anywhere on the left to move, swipe on the right to look, and use the buttons to rise, sink or switch to walking. Tap the lake to skim a stone.

The toolbar has time-of-day presets, weather, flow of time, quality (Low to Ultra), cloud cover, wind, volume, look sensitivity and adaptive resolution. Settings persist between visits.

## Running it

```bash
npm install
npm run dev        # http://localhost:5199
npm run release    # production build + larchmere-itch.zip
```

WebGL 2 is required. Every current desktop browser supports it.

## Publishing on itch.io

1. `npm run release`. This builds into `dist/` and writes `larchmere-itch.zip` with `index.html` at the root. The archive uses forward-slash paths; Windows' built-in *Compress-Archive* writes backslashes, which itch.io rejects.
2. On itch.io, create a new project and set **Kind of project** to **HTML**.
3. Upload `larchmere-itch.zip` and tick **This file will be played in the browser**.
4. Under **Embed options**, set the viewport to **1280 × 720** (or bigger), and enable **Fullscreen button** and **Mobile friendly** (landscape).
5. Save, then view the page. The first load takes a few seconds while the valley is generated on the GPU.

## Recording the trailer

`src/film.js` is a small director: open the page with `?film` and it plays a scripted shot list frame by frame at a fixed 30 fps, with letterboxing, title cards and captions. `tools/film.mjs` drives it in headless Chrome, captures every frame, renders the soundtrack offline (the game's own procedural soundscape, cued per shot, over an ambient pad whose chords change on the cuts), and encodes an H.264/AAC MP4 with ffmpeg:

```bash
npm run dev                                   # in one terminal
node tools/film.mjs preview tools/out/film    # one still per shot
node tools/film.mjs record  tools/out/film larchmere-trailer.mp4
```

## Project layout

```
src/
  app.js              frame loop, systems, settings, stone skimming
  core/               world constants, shared uniforms, controls, quality presets
  gen/                GPU terrain generator, texture baker, foliage atlas painter
  shaders/            noise, atmosphere, terrain shape, shared lighting chunk
  world/              sky, terrain, water, trees, grass, rocks, particles, weather, shadows
  fauna/              birds (boids, geese, eagles), waterfowl, fish, shared creature material
  fx/post.js          bloom, god rays, tone mapping and grade
  audio.js            procedural soundscape
  ui.js · tour.js     interface and cinematic camera
  film.js             trailer director · trailerAudio.js offline soundtrack
tools/                screenshot harness, UI/mobile tests, trailer recorder, itch.io zipper
```
