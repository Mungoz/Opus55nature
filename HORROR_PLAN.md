# Larchmere: horror edition plan

Plan for turning Larchmere into a 15-minute eerie walking game. It records what has been decided, what exists so far, what still needs building, and what is still open.

Status as of 2026-09-26 (evening): the route, the ending and the open questions are decided (sections 5 and 15), animal encounters are added (5.3), and implementation in `src/` has started, in the order of section 13. Mockups live in `mockups/`.

Two things shape everything else:
- **The map will change a lot** (section 6). Expect a much more guided path with blocking terrain, a tighter play area, and far less detail in the distance, not just props added to today's valley. Every coordinate in this plan is provisional until the new layout is blocked out.
- **The game must last about 15 minutes** (section 7). That is a target proven by playtests, not estimated from walking distances.

---

## 1. The game in one paragraph

It is late October. J., the herder, went back up the valley alone to close the alp hut and find a cow that never came down. He didn't come back. You row across the lake at golden hour to fetch him. Over the next evening the valley goes quiet around you, and something that looks like a man in a herder's coat is always standing somewhere you only half see. Up close it only ever appears in water. It should last about 15 minutes for a first-time player (section 7). Nothing jumps out and you can't die or fail. The game never explains what the figure is.

## 2. Decisions made

- **Two builds.** The horror game becomes the main build. The original nature sim must still build as its own separate zip.
- **Two endings.** One main ending, plus a hidden variant decided by how often you looked at the figure.
- **Moonlight only.** No hand-held lantern.
- **Initials only.** People appear as "J.", never by full name.
- **The figure is the herder (mockup form B):** a long dark wool coat, a wide felt hat, a stick, and a head tilted too far. It is person-sized. It is not a giant and not animal-like.
- **Reflections reveal it, but it isn't only in reflections.** You can see it directly, but only far off and only standing still. Close up it appears only in small water.
- **A storm** breaks at the midpoint, as you reach the hut.
- **The time of day follows your progress along the route, not real time.** Standing still never makes it later. The storm is the only exception (see 5.2).
- **Realism comes from reference photos.** Reference boards live in `mockups/refs/`.
- **The environment can change to serve the story:** fewer lily pads, a wider or deeper river, and so on.

## 3. The figure's rules

1. You only see it directly when it is far away, in poor light, standing still. It reads as a snag, a post, or someone at the edge of the trees.
2. Close up, it only appears in water: the tarn, lake coves, puddles, the trough, and the boat at the end.
3. It never moves while you can see it, whether directly or in a reflection. It moves while you look away.
4. Every time you see it, it is closer.
5. Its presence is bigger than its body. The valley reacts to it:
   - Birdsong stops around it, and that silent patch moves.
   - Deer stop and stare at it.
   - Marmot alarm whistles run along the slope as it passes.
   - The starling flock parts around it.
   - It copies sounds: a cowbell where no cow is, and your own footsteps half a beat late.
   - It leaves things behind: cairns, bare footprints in wet shingle, J.'s boots, and it moves your boat.

What the mockups showed about when a reflection reads (see `mockups/out/`):
- The water must be deep and dark: lake coves or peaty ponds. The clear, shallow stream shows its stony bed instead of a reflection.
- There must be open sky or hazy distance behind the figure. Against near spruce a dark coat vanishes.
- It must be within about 30 m across the water. At 45 m it is a speck.
- Lily pads must not cover the water.
- Looking straight down, water reflects only about 2% of the light. A figure standing behind you can't be seen in water at your feet. A reflection beat needs a low, grazing view.

## 4. Story and writing

J.'s notes are the only story text. There are three sources, about ten entries in all, a line or two each:

| Source | Where | What it carries |
|---|---|---|
| Boat log | A box on a post at the jetty's land end | "J. took the other boat, 4 Oct." There is no return entry. |
| Walkers' register | A tin on the signpost | Entries thin out and get odder through October. |
| Hut book | A tin by the hut door | The missing cow's bell heard where it can't be. Someone on the far shore, "not on the shore, in it". "It stands where I stand now." "Going down to the boat." |

- [ ] Write all the entries in J.'s voice. Keep them spare.
- [ ] Draft the found objects: the boarded trough, the upturned bucket, the cloth nailed over the window, J.'s boots paired neatly on the shore facing the water, and the cut mooring rope at J.'s berth.

## 5. Route, beats and time of day

### 5.1 The route (decided, extended)

The jetty moves to the **east strand**, just east of the stream mouth, so the stream itself divides the game in two: the first half is walked on its east and south banks, the second half on the lake side of it, and the only way across is the footbridge. The ending moves to the **west strand**, with the jetty's lantern burning across the bay. Nobody lit it.

The route is about 1.7 km of path, 14–16 minutes with the reading, the storm and the encounters. Coordinates are on today's (shrunk) map. Figure sightings are marked **F**, animal encounters **E** (see 5.3).

| # | Stretch | Path | Clock | Sky and weather | Beats |
|---|---|---|---|---|---|
| 0 | Title over black, the sound of oars; the row-in (a cutscene) | n/a | 16:24 → 16:30 | Golden, cloud building behind the peaks | E1 grebes dive ahead of the bow, the mallards paddle off, a heron lifts from the jetty and flaps away low, croaking |
| 1 | The jetty on the east strand (~78, 437): the boat is tied up; the boat-log box; J.'s berth, its line cut clean | 25 m | 16:30 | Golden | Read: the boat log |
| 2 | The strand to the stream mouth, then south up the stream's east bank | 280 m | 16:31 → 16:39 | Golden, wind rising | E2 wagtails run the shingle ahead; E3 a dipper on a stone at the mouth whirrs upstream; E4 the red deer herd fords the stream ahead of you, the stag roaring; **F1** far off at the larch edge across the meadow, a dark upright shape the hinds are staring at; E5 a hare sits tight in the path, then goes |
| 3 | Through the gate in the pasture fence, past the east pond, up to the marmot bank | 230 m | 16:39 → 16:46 | Cloud over the sun, gusts | E6 marmots at their burrows: the sentinel whistles, they dive; the gate creaks; the first thunder, very far |
| 4 | The signpost at the junction (~40, 760), the wayside cross, the walkers' register | 90 m | 16:46 → 16:49 | Peaks swallowed by cloud | Read: the register; E7 a flock of finches bursts out of the rowans; the cowbell, once, from up the valley |
| 5 | West along the south bank to the footbridge over its deep, slow pool (~−22, 736) | 90 m | 16:49 → 16:53 | First drops on the pool, wind | E8 a dipper under the bridge, trout holding in the tail of the pool; **F2** looking up the pool, the reflection shows someone on the bank; the bank is empty |
| 6 | The hut (−69, 712). The storm breaks as you reach the porch | 60 m | 16:53 → 17:01 | The storm | Rain on the shingles; read: the hut book; **F3** in the lightning flashes, a figure at the far side of the pen, nearer at every flash; the cowbell from the empty pen |
| 7 | The storm, sheltering under the porch | n/a | 17:01 → 17:26 (about 3 min) | Storm, then clearing | Clears after the hut book is read or after 3 minutes; **F4** stepping out, the trough by the door (now uncovered) shows the doorway behind you with someone standing in it; the door, which was shut, is open |
| 8 | The tarn (−110, 682) in the mist | 60 m | 17:30 | Blue hour, mist rising | E9 the heron stands on the far shore; **F5** in the tarn's reflection the figure stands beside the heron; the heron stares at the empty place beside it and lifts off croaking; rings spread from an empty patch of water |
| 9 | Along the plunge pool's north rim under the waterfall | 110 m | 17:34 | Blue hour | J.'s boots, paired neatly on the shingle, toes to the water; E10 the choughs stop wheeling and settle along a ledge in a silent row, all facing the same way |
| 10 | North through the larch wood on the valley's west side | 260 m | 17:38 → 17:47 | Dusk under the trees | E11 deer standing frozen in the trees, all staring past you, back the way you came; E12 a red squirrel scolding at something behind you; E13 the bear rises on its hind legs, scenting, then crashes away downhill; cairns on stumps and stones along the path |
| 11 | Out of the trees onto the west strand; the lantern is lit across the bay | 120 m | 17:47 → 17:52 | Dusk, moonrise | E14 the starlings' last murmuration over the lake, opening round an empty point above the water; **F6** far across the water, on the island's point, someone standing |
| 12 | North along the dark west shore, pinched between the water and a rock band | 400 m | 17:52 → 18:05 | Nightfall, mist on the lake | **F7** your reflection walks beside you, and a second one keeps pace a few steps behind it; the stone beat; your footsteps echoed half a beat late; bare footprints into the water; cairns in the shallows; J.'s boat upturned in the reeds; E15 geese go over low in the dark, calling, then silence; the loon and its backwards answer |
| 13 | Your boat, fetched up on the shingle, its line cut the same way | n/a | 18:05 → 18:10 | Night | The ending (9.11) |

- [x] Agree the route (this table).
- [ ] Check it on the plan map (`tools/planmap.mjs`) with the path, props and blockers drawn on, and walk it with the bot.
- [x] The ending is on the west strand, with the jetty's lantern burning across the water.

### 5.2 Time and atmosphere follow progress

- The route is one path, and progress is measured along it. It only counts up, one stretch at a time, so shortcuts don't skip beats.
- Each point on the path has a fixed clock time and weather state. The clock eases toward the target with a speed limit, so the sun never visibly races.
- Standing still stops the clock. Clouds, water, leaves and animals keep moving, because they run on real time.
- **The storm is the one exception.** It runs about 3 minutes at the hut, hidden by cloud. It clears after the hut book has been read, or when the 3 minutes are up. It clears into blue hour and the clock holds again.
- Everything follows the same progress value: the time of day, the weather, how quiet the birds are, and how the animals behave.

### 5.3 Canned animal encounters

The valley's existing animals are cast in short scripted scenes along the route. Each is staged off screen before you arrive, plays once when you reach its trigger, and then hands the animals back to their normal behaviour. None of them needs you to stop: they happen in front of you as you walk, and each is framed by the path, a gap in the trees or a bend, so a player looking where they are going sees it. They do two jobs: in the first half they make the valley feel generous and alive (so its silence later is felt), and in the second half the same animals react to something you can't see.

| # | Where | Animals | What happens | Reference behaviour |
|---|---|---|---|---|
| E1 | The row-in | Grebes, mallards, heron | Two grebes dive ahead of the bow and surface behind; the mallard party paddles off in a line; the heron at the jetty's head lifts with a croak and flaps away low over the water | Grebes dive for 20–30 s; herons flush at 30–50 m from a boat |
| E2 | The east strand | White wagtails | A pair runs along the shingle ahead, tails pumping, flits on a few metres whenever you close, twice, then loops away over the water | Wagtails run, stop, pump the tail, fly in dipping bounds |
| E3 | The stream mouth | Dipper | Bobs on a stone in the current, blinks its white eyelid, then whirrs off low upstream | Dippers bob ("dip") 40–60 times a minute, fly fast and low along the water |
| E4 | Up the east bank | Red deer herd | The herd comes down the far bank to a gravel bar and fords the stream ahead of you, hinds first, the stag last, pausing mid-stream; spray, the stag roars on the near bank; the hinds stop and stare across the meadow at the larch edge (F1), then trot off in file | October is the rut: stags roar through the evening; herds cross water in single file |
| E5 | East bank | Mountain hare | Sits tight in the path until you are close, then runs in zig-zags and sits up again at a distance | Hares freeze, then flush late and circle |
| E6 | Marmot bank | Marmots | Three at their burrow mounds; a sentinel sits up and whistles; the others run for the holes; one head stays watching from a burrow mouth | Marmot alarm: a single whistle for a threat from the air, repeated whistles for one on the ground |
| E7 | Signpost | Finch flock | A flock of finches bursts from the rowans by the cross, wheels once and is gone | Finches flush as a flock and wheel tightly |
| E8 | Footbridge | Dipper, trout | A dipper on a stone under the bridge; brown trout holding in the tail of the pool, which dart into the undercut bank when F2 shows | Trout hold station facing the current |
| E9 | The tarn | Heron | The heron stands on the far shore; during F5 it stares at the empty place beside it, then flies off croaking | Herons stand motionless for minutes |
| E10 | Plunge pool | Alpine choughs | The flock that wheeled at the cliff all day settles on a ledge in a row, silent, facing the same way | Choughs roost communally on cliff ledges |
| E11 | Larch wood | Red deer | Three hinds standing among the trees, frozen, all staring back down the path behind you; they don't run until you are very close | Deer freeze and stare at a predator they can't place |
| E12 | Larch wood | Red squirrel | Scolds from a trunk, tail flicking, facing past you; then spirals up out of sight | The squirrel's alarm chatter is aimed at the threat |
| E13 | Larch wood's lower edge | Brown bear | Rises on its hind legs to scent the air, drops, and crashes away downhill | Bears stand to see and smell, not to attack |
| E14 | West strand | Starlings | The evening murmuration over the lake flows round an empty point above the water, then pours into the reeds | Murmurations open round a falcon |
| E15 | West shore | Geese, mallards | A skein goes over low in the dark, calling; the mallards on the water all turn and paddle away from an empty patch | Geese migrate at night in autumn |

- [ ] An encounter system (`src/story/encounters.js`): stage off screen, trigger by progress or sight, play a timeline of animal commands (go to, look at, stare, flee, roar, whistle, fly), release.
- [ ] Hooks in the animal systems so the director can command individual animals and set a "threat" they react to (9.6).
- [ ] Review each encounter in the game against reference footage behaviour (the table's last column), and adjust timing.

## 6. Map layout and performance: expect big changes

Today's valley was built as an open sandbox for flying and wandering:
- a 12 km world, with a camera that sees 16 km;
- about 92,000 trees, with billboards out to 5.2 km;
- nothing stopping you going anywhere.

A 15-minute guided horror walk needs a different shape. **Expect significant changes to the map's layout, not just props dropped into the current valley.** Until the new layout is blocked out, treat as provisional:
- the route in 5.1;
- the hut and jetty sites;
- every coordinate in this plan.

### 6.1 A much more guided path

The landscape itself should funnel the player along one route. The soft boundary (9.2) is only a backstop. Blocking features, all of which belong in an alpine valley:
- **Steep ground:**
  - raised banks, moraine ridges, rock bands and small cliffs either side of the path;
  - gullies, and a narrow gorge for key stretches.
- **Water:**
  - the stream, crossable only at the bridge;
  - bog and deep peat you can't walk into;
  - the lake.
- **Forest:** dense spruce thickets, and walls of criss-crossed fallen trunks off the path.
- **Rock:** boulder fields and scree too rough to cross.
- **Fences:** pasture fences with gates. They also fit the story, since this is the herder's alp.
- **Terrain shaped for the route:**
  - a bench carved along slopes;
  - a hollow for the hut clearing;
  - the shore walk pinched between the water and a rock band.

Beyond blocking:
- **Compress the play area.** Pull the landmarks closer together, so the walking is spent on beats rather than crossing empty meadow. The landmarks: jetty, stream, signpost, hut, tarn, waterfall, larch grove and west strand. Features can move: ponds, the stream's course, the island, parts of the lake shore.
- **Design sight lines on purpose.**
  - Open the views the story needs: the lantern across the water, the figure at a treeline, the hut roof from below.
  - Close off views into places the player can't reach, so nothing invites them off the path.
- **Remove or shrink anything that tempts wandering** and leads nowhere.
- **Collision (9.3) must cover every blocker.** Test for gaps a player could slip through.

### 6.2 Render much less of what's far away

The horror build only needs the play area in full detail. The rest of the valley can be far cheaper:
- **Terrain:**
  - shrink the detailed near-terrain region (2.56 km across now) to a tight box round the route, which also buys more detail where the player walks;
  - mountains are only needed as silhouettes, and evening light, low cloud, mist and night all hide distance, so cut back the far plane, far terrain and far-tree billboards.
- **Trees:** plant only within and just around the play area, plus a band of billboards on the valley walls.
- **Ground detail:** grass, ground cover, rocks and deadwood near the path only.
- **Wildlife:** only what the beats use (deer, marmots, starlings, and the birds that are only heard). Drop or thin the rest.
- **Mirrors:** run the reflection passes for puddles, the trough and small ponds only while their beat is active or they are close.
- **Other effects:**
  - a shorter shadow distance, and the aurora off;
  - props, the figure and effects switched on per beat, not all at once.
- **Load time:** it should drop too, since less is generated.

### 6.3 Keeping the nature build intact

The layout lives in constants that the terrain generator and every system share: `src/core/world.js`, `src/core/features.js` and `src/shaders/terrainShape.glsl.js`. These need to become per-edition, so the horror build can reshape the valley without touching the nature build.

Tasks:
- [ ] Block out the new layout on a top-down map before building anything into `src/`: the route, the blockers, the landmarks and the sight lines.
- [ ] Make the layout constants per-edition.
- [ ] Walk the blockout in the engine, with collision on, and hunt for escape routes and dead ends.
- [ ] Set a performance budget for the horror build and cut the far detail until it fits (section 12).

## 7. Length: about 15 minutes, proven by playtests

The game must last about 15 minutes for a typical first-time player. That is a target to measure, not a guess from walking distances.

Targets:
- About 15 minutes, with an acceptable range of 13–17.
- A fast, direct player shouldn't finish in under about 12 minutes. A slow explorer shouldn't run past about 20.

What sets the length, all tuned together:
- the route's length at walking speed (3.2 m/s now);
- the storm (about 3 minutes);
- time spent reading;
- time spent at each reveal;
- the rowing scenes.

Measuring it:
- A debug overlay, and a log per session: time per beat, total time, time off the path, and how often the figure was looked at.
- A scripted walk-through: a bot that follows the path at walking speed and pauses to read. It gives a baseline after every layout change, built on the Puppeteer harnesses in `tools/`.
- Playtests with people who haven't seen the game, covering a direct walker, an explorer and a reader. Record their times and repeat after every major change.

If it runs long or short, the levers are:
- adding, moving or removing beats;
- lengthening or shortening stretches of the route;
- the storm's duration;
- more or fewer notes;
- the horror build's walking speed;
- how long the ending holds.

Tasks:
- [ ] Build the timing log and overlay.
- [ ] Build the walk-through bot.
- [ ] Make a paper estimate as soon as the route is agreed.
- [ ] Run the first real playtest as soon as the blockout is walkable, before any art.
- [ ] Playtest with fresh players at every milestone, and tune until typical first plays land at about 15 minutes.

## 8. Two builds (nature and horror)

- [ ] Add an edition switch at build time, for example `VITE_EDITION=horror|nature` or a Vite mode, so each build only includes its own code.
- [ ] Add release scripts:
  - `npm run release`: the horror edition, producing `larchmere-horror-itch.zip`.
  - `npm run release:nature`: the current game, producing `larchmere-itch.zip`.
- [ ] In the horror build, hide the toolbar, flying, the tour, the time slider, the weather controls and photo mode. Keep volume, look sensitivity, quality and fullscreen.
- [ ] Give the horror build its own loading screen, title and intro (the first minutes still feel like the nature sim).
- [ ] Keep both builds working in CI or tests (`tools/uitest.mjs`, `tools/mobiletest.mjs`).

## 9. Systems to build

### 9.1 Story director (`src/story/`)
- [ ] A beat list: each beat has a trigger (position, gaze or progress), actions, and the state of props.
- [ ] Progress along the path, time of day, weather targets and the audio mix, all driven from one progress value.
- [ ] Run alongside normal movement. The existing `app.director` hook takes over the camera and makes the animals ignore you, so it can't be reused as it is.
- [ ] A way to save and resume progress, and a debug jump to any beat (for example `?beat=hut`).

### 9.2 Path and guidance
- [ ] Define the path as a curve with evenly spaced samples: distance to the path, and progress along it.
- [ ] A worn earth and pale-stone trail pressed slightly into the terrain, with no grass on it. Trees, rocks and props stay about 1.5 m clear of it.
- [ ] Red-white-red paint marks every 50–80 m on nearby rocks or posts, plus signposts at forks.
- [ ] Something visible to walk toward at every stage: the waterfall, the hut roof, the glint of the tarn, the lantern across the water.
- [ ] Sound as a lure: the cowbell ahead, and the waterfall's roar.
- [ ] The main control is physical: the blocking terrain, water, forest and fences of section 6.1. Behind that, a soft boundary as a backstop:
  - within about 25 m of the path you are free;
  - beyond that, denser undergrowth and slower walking;
  - after dark, leaving the path brings thicker mist, a low drone and staring animals;
  - at about 150 m you ease to a stop in a thicket.
- [ ] If you have been lost for about 90 seconds, the cowbell rings from the direction of the path.

### 9.3 Collision
- [ ] A 2D collision grid of 4 m cells, built at load, pushing out a player circle of about 0.3 m. You slide along obstacles rather than sticking to them.
- [ ] Obstacle shapes:
  - tree trunks as circles (`treeGen.js` needs to return the trunk radius);
  - boulders as circles;
  - fallen logs as capsules;
  - stumps as circles;
  - walls, fences, boats and railings as boxes or segments.
- [ ] Walkable decks (jetty, footbridge, porch): the floor height is the higher of the terrain and the deck.
- [ ] Deep water stops you at about knee depth. The stream can only be crossed at the bridge.
- [ ] A slope limit of about 32°.
- [ ] Shift slows from 9 m/s to about 4.5 m/s in the horror build.
- [ ] Optionally, trunk collision in the nature build too.

### 9.4 The figure
- [ ] Put the herder sculpt into `src/`, starting from `mockups/figures.js` `buildHerder`.
- [ ] Refine it:
  - the face either shadowed or pale and blank;
  - a slightly lighter weathered coat, so the arms and stick read;
  - a stronger head tilt.
- [ ] Animation, all slow:
  - stand dead still, with only the coat hem moving in the wind;
  - a slow head turn or tilt;
  - a walk that's too even (no bob, the stick planted every other step), used only while out of sight or in a reflection;
  - turn to face you without taking a step;
  - sit;
  - stand in the boat.
- [ ] A reflection-only version. The figure goes on each water surface's reflection-only list; the stream's mirror needs its own hook.
- [ ] A visibility test: is it on screen directly, or on screen reflected (mirrored in the water plane, then checked for calm water under that point)? This drives when it moves, the drone, and the look counter.
- [ ] Hiding places: spots with a broken direct view from where you stand (ridges, trees, mist, darkness), chosen before each move.
- [ ] Count how often you look at it, for the ending variant.

### 9.5 The player's reflection
- [ ] A simple body, drawn in reflections only, so you see yourself in puddles and in the boat. The ending depends on this.

### 9.6 The valley reacts
- [ ] Birdsong suppressed around the figure, with a gap that follows it (`audio.js` places songs at random around you).
- [ ] A "threat" position the animals react to (`mammals.js`): deer freeze and stare, marmots whistle in a chain, then bolt.
- [ ] A keep-away zone for the figure in the starlings' flocking.
- [ ] Slow ripple rings from an empty patch of water (the ripple system already exists).

### 9.7 Changes while you're not looking
- [ ] A system that swaps prop states only when they are off screen (the same check `app.js` already uses): the shutter, the door, the trough cover, cairns, boots, the boat.

### 9.8 Reading and interaction
- [ ] A small dot when something can be read, E to read (E currently rises in fly mode, which the horror build disables), and a paper page in a handwriting font.
- [ ] Clicking still skims stones. A stone breaking the reflection is one of the beats.

### 9.9 Weather
- [ ] The storm builds over several minutes (the presets currently ease in about 30 s).
- [ ] The director aims lightning (`weather.strike( camera, aim, dist )` already exists). Keep strikes distant, and never put a close crack on a reveal.
- [ ] Rain stops under roofs: the porch, and any shelter.
- [ ] Puddles that fill along the path and stay afterwards. They need a mirror near the player at puddle height, like the stream's. Watch the cost on mobile.
- [ ] Valley mist rises as the storm clears.

### 9.10 Sound (all synthesised)
- [ ] Footsteps that change with the ground: grass, shingle, wood, forest floor.
- [ ] Rain drumming on shingles while under the porch, and drips afterwards.
- [ ] The cowbell, placed in 3D.
- [ ] Echoed footsteps: yours, about 0.4 s late, from behind.
- [ ] A loon call answered by the same call played backwards.
- [ ] A low drone while the figure is visible.
- [ ] Oars, creaking wood, rope, and the boat knocking against the jetty.
- [ ] Silence in stages: birds, then wind, then the lake lapping, leaving only running water.
- [ ] Captions for key sounds (the bell, footsteps behind you).

### 9.11 Opening and ending
- [ ] The row-in cutscene, reusing the shot system in `film.js`.
- [ ] The ending (location open, see 5.1). You row out. As the ripples from the oars settle, your reflection has someone sitting behind you in the boat. You turn round: the boat is empty. Fade to black, a cowbell, then the title.
- [ ] Ending variant: if you looked too often, your reflection isn't in the boat. It stays on the shore, turns, and walks up into the trees.

## 10. Landscape and props

| Item | Status | Still to do |
|---|---|---|
| Hut (`mockups/hut.js`) | Mocked up, based on 18 reference photos. Stone-weighted shingle roof, crossed-log walls, rubble base, porch, trough, pen, woodpile. Sited at about (−69, 712). | Warmer sunlit logs, stronger eave shadow, denser roof stones. Move the trough within 3 m of the door for the low-angle reflection beat. Rain blocked under the porch. |
| Jetty (`mockups/jetty.js`) | Detailed rebuild written, based on refs 23 and 27, but **not yet rendered or checked**. Includes square posts, bolted double caps, fascia boards, braces, a T-head with bollards, rubbing strakes and a fender, a cleat, a ladder, the hurricane lantern, props, a stone abutment and the boat-log box. | Render and fix. Clear lily pads and reeds around it. Confirm the site: the strand is very flat there, hence the abutment. |
| Boats (`mockups/jetty.js`) | Detailed rebuild written, **not yet rendered**. Solid lapped planks with nails and chipped paint, stem and iron band, rails, ribs, knees, thwarts, slatted floor, rowlocks, shaped oars, grapnel, rainwater standing in the bilge. | Render and fix. A depth-only lid at the waterline keeps the lake out of the hull; confirm it works (the first version was culled). |
| Herder (`mockups/figures.js`) | Form B chosen and mocked up in the valley and in reflections. | See 9.4. |
| Trail and paint marks | Not started | See 9.2. |
| Footbridge | Not started | Build it at a slow, deep, dark pool so it can reflect. |
| Signpost and register tin | Not started | |
| Cairns, boots, bucket, window cloth | Not started | |
| Puddles | Not started | See 9.9. |
| Pasture fences and a gate (extended route) | Not started | Alpine split-rail and pole fences after reference photos; they funnel the first half and the gate creaks. |
| Wayside cross at the signpost (extended route) | Not started | A plain wooden cross under a small shingled gable, a jar of dried flowers, after reference photos. |
| J.'s boat, upturned in the reeds (extended route) | Not started | The second boat from `jetty.js`, capsized, a strake stove in, half in the water on the west shore. |
| Marmot bank (extended route) | Not started | A second colony of burrows on the east bank for E6. |

Environment changes:
- [ ] Clear lily pads from the viewing side of each encounter pond, and around the jetty and berths.
- [ ] Keep trees out of a corridor behind each encounter's far bank, so the figure stands against sky.
- [ ] A deep, slow pool on the stream at the footbridge. Widen the stream there if needed.
- [ ] Give small waters a dark body, so reflections read.
- [ ] Undergrowth and fallen logs off the path, to shape where you can go.

## 11. Mockups: what's left

This is everything still open in `mockups/`, item by item, including known bugs from the last renders.

### 11.1 Jetty and boats (work stopped partway through)

`mockups/jetty.js` was rewritten in full with the detailed jetty and boat, but the rewrite has **never been run**. It may have runtime errors. The last renders in `mockups/out/jetty-*.png` show the old, simple version.

Make the rewrite work:
- [ ] Render `jetty-plan`, `jetty-shore` and `jetty-boat`, and fix any errors.
- [ ] Check that the solid lapped planks render the right way round. `slab()` builds each plank's outer face, inner face and edges, and turns them by a reference direction.
- [ ] The boat still uses a double-sided material. Now that the planks are solid, switch it to front-side if that looks right, which avoids shading artefacts.
- [ ] Tidy the `edge()` helper inside `slab()` (it is convoluted) and the unused first nail line in the DECK shader in `hut.js`.

Known bugs from the last render:
- [ ] **Lake water and lily pads show inside the boat.**
  - The depth-only lid at the waterline faces down and gets culled. Its material (`lidMat` in `figures.js`) needs `side: THREE.DoubleSide`.
  - The lily pads float above the floorboards, so the lid can't hide them. They need removing around the berth (next group).
- [ ] **The deck was far too dark.** The plank colours are now brighter (`weathered()`). Confirm under a low sun.
- [ ] **Pale blotches on the hull tar** read as paint splashes. The hull now uses the new HULL shading; the rails still use PAINT, so check them.
- [ ] **The first jetty ran 14 m over flat shingle.** The strand at the chosen site is very flat. The rewrite caps the land run at 4 m and adds a stone abutment with steps.
  - `jettySite()` in `figures.js` still searches up to 14 m inland and scores on that; update it for the new deck height of 0.62.
  - Confirm the site at about (7, 461) looks right, or pick another.

Clear the water plants around the jetty:
- [ ] Hide lily pads and flowers near the jetty and berths by zeroing their instance matrices. They live in `app.waterPlants.group`: meshes named `lilypads`, plus the flower mesh.
- [ ] Hide reeds there the same way, through `waterPlants.sets[*].matrices`, and force `waterPlants._last` to refresh.
- [ ] Put all of these back in `clear()`, as the hidden rocks already are.

Staging (`figures.js`), updated for the new T-head:
- [ ] Moor the boat alongside the head, parallel to the jetty. Its berth is now `HW/2 + 0.74` out from the centreline.
- [ ] Run the mooring line from the bow ring to the new cleat (`info.cleat`) or the right-hand bollard.
- [ ] Add a close-up shot of the boat-log box (`info.logBox`).

Render the story shots:
- [ ] `jetty-approach` (golden hour, rowing in).
- [ ] `jetty-night` (lantern lit, still water, mist).
- [ ] `jetty-ending` and `jetty-endingzoom` (the herder standing in the drifting boat, seen only in the water).
- [ ] Check that the lantern's glow reflects in the lake and that its light falls warmly on the deck and posts (`LAMP`).

Compare against the references:
- [ ] Build a comparison board, as for the hut: ref23 and ref27 against `jetty-boat` and `jetty-shore`.
- [ ] Tune the posts' waterline algae, the deck wear path, the moss in the seams, the chipped paint, and the needles and rainwater in the bilge.

Regression check:
- [ ] `Kit.add` in `hut.js` now keeps any per-vertex colour, grain axis or centre a geometry already carries. Re-render the hut shots to confirm nothing changed.

### 11.2 Hut
- [ ] Warmer, oranger sunlit logs (refs 14 and 15), a stronger shadow under the eave, and more roof stones set closer together (ref 13).
- [ ] Move the trough within about 3 m of the door. Re-render the trough beat as a low-angle view along the water showing the open doorway and the herder in it.
- [ ] Rain stopping under the porch roof, and a storm shot from under the porch.
- [ ] Props for the story: the cloth nailed over the window, the boarded trough (done) and the uncovered trough (done), the book tin (done), the cowbell (done).

### 11.3 The figure
- [ ] Herder refinements: a shadowed or blank face, a lighter coat so the arms and stick read, a stronger head tilt.
- [ ] Rig and animate it. Mock the slow head turn, the too-even walk, the turn to face you, sitting, and standing in the boat.
- [ ] Test the player's own reflected body: see yourself in the tarn and the bilge water, with the figure behind you.
- [ ] Mock the reflection keeping pace with you on the west strand at dusk, and the stone breaking the reflection then settling with the figure closer.
- [ ] Figure A (the stilt figure) is dropped. Its images can be deleted from `mockups/out/`.

### 11.4 Not started
- [ ] Footbridge, with a slow, deep, dark pool under it, and a check that the figure reads in its reflection.
- [ ] Signpost with the walkers' register tin, and red-white-red paint marks on rocks.
- [ ] Trail: a worn earth strip with pale stones, checked by day and by moonlight.
- [ ] Puddles after the storm along the path, with reflections.
- [ ] Cairns, including some in the shallows; J.'s boots on the shingle; an upturned bucket.
- [ ] The west strand at dusk and the drifted boat, if the ending moves there.
- [ ] The larch grove beat: frozen deer staring toward the lake.
- [ ] The route drawn on a top-down map.

## 12. Mobile and performance

- [ ] Decide whether the horror build supports phones. The nature build does.
- [ ] Budget the new mirrors (puddles, trough, the reflection-only figure and body) with `tools/gpuprof.mjs` and `tools/mobiletest.mjs`.
- [ ] The props are merged single meshes. Check their draw calls and triangle counts once in the game.

## 13. Order of work

1. **Mockups (in progress):** finish everything in section 11.
2. **Agree the route and ending.**
3. **Block out the new map layout** (section 6): blockers, landmarks and sight lines, with the layout constants made per-edition.
4. **Two builds and the story shell:** the edition switch, hidden UI, walking fixes and collision, the path and progress, the clock following progress, reading.
5. **First timing playtest on the bare blockout** (section 7), then adjust the route before any art goes in.
6. **Landscape in `src/`:** trail, jetty and boats, hut, bridge, signpost, blockers, and the lily pad, tree and pool edits.
7. **The figure:** sculpt, animation, reflection-only drawing, visibility test, hiding places, the out-of-sight system, and the valley's reactions.
8. **Weather:** the storm arc, rain under roofs, puddles, post-storm mist.
9. **Sound.**
10. **Writing, the opening and the ending.**
11. **Performance pass:** far detail cut back (6.2), mirrors budgeted (section 12).
12. **Playtests until first plays land at about 15 minutes** (section 7). Playtesting runs at every milestone, not only here. Then a trailer with the `?film` recorder.

## 14. Mockup tooling

- `node mockups/render.mjs [outDir] [shot …]`, run while `npm run dev` is up. It adds props and figures to the running page, stages each shot, and saves the images.
- Shot names:
  - figure shots: `lineup`, `lineupdusk`, `treeline-B`, `treezoom-B`, `shore-B`, `shorezoom-B`, `pond-B`, `pondzoom-B`, `ponddirect-B`, `cove-B`, `covezoom-B`, `stream-B`;
  - hut shots: `hut-plan`, `hut-arrive`, `hut-side`, `hut-roof`, `hut-overview`, `hut-porch`, `hut-storm`, `hut-after`, `hut-trough`;
  - jetty shots: `jetty-plan`, `jetty-shore`, `jetty-boat`, `jetty-approach`, `jetty-night`, `jetty-ending`, `jetty-endingzoom`.
- `mockups/refs/` holds reference photos from Wikimedia Commons, mostly under CC licences, plus contact sheets. They need attribution if they're ever published or committed.
- `mockups/out/` holds the rendered images, about 40 MB. It is probably worth adding to `.gitignore`.

## 15. Open questions (all decided)

Decisions, 2026-09-26:
- **Route and ending:** the jetty moves to the east strand and the ending to the west strand (5.1).
- **The trough:** moved beside the door for a low-angle reflection. Real water, no boosted reflections.
- **The herder's face:** shadowed under the hat brim. Nothing resolves in it, even in close reflections.
- **Mobile:** supported. Touch walks and looks as in the nature build; a tap on the reading dot reads. Mirrors are budgeted (section 12).
- **Trunk collision in the nature build:** no. The nature build keeps flying free.
- **Reshaping the valley:** keep the valley of the nature edition, and shape the route inside it: the stream as the divide, fences, thickets, deadfall and bog as blockers, the trail pressed into the ground, a deeper pool at the footbridge. No rebuild of the basin; the far detail is cut back (6.2).

The original questions, for the record:

1. The route and where the ending happens: the jetty, or the west strand with the lantern across the water (5.1).
2. The trough beat: move the trough by the door for a low-angle reflection (recommended), or make small waters reflect more strongly than real water.
3. The herder's face: shadowed, or pale and blank.
4. Mobile support for the horror build.
5. Trunk collision in the nature build as well.
6. How far to reshape the valley: keep it recognisably the valley from the nature edition, or rebuild the basin freely around the route.
