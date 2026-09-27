import { Path } from './path.js';

// The horror edition's layout: the route, the places along it and the things that shape
// it, laid into the nature edition's valley. Data only; the generators and the story read it.
// Coordinates are metres: +x east, +z south (up the valley), the lake's surface at y = 0.

const D2R = Math.PI / 180;

// The fishermen's boardwalk along the west shore: about 2.8 m out from the waterline over the
// shallows (the shore shelves ~0.3 m in a metre), coming ashore at either end. [ x, z ]
function BOARDWALK_LINE() {

	return [ [ - 205, 352 ], [ - 204.6, 344 ], [ - 207.7, 335 ], [ - 212.7, 325 ], [ - 217.45, 315 ], [ - 221.45, 305 ], [ - 224.7, 295 ], [ - 227.45, 285 ], [ - 230.2, 275 ], [ - 233.45, 265 ], [ - 236.7, 255 ], [ - 239.95, 245 ], [ - 242.5, 236 ], [ - 245.6, 229 ], [ - 248.4, 224 ] ];

}

export const BOARDWALK = BOARDWALK_LINE();

// how far (x, z) is from the boardwalk's line
export function boardwalkDist( x, z ) {

	let d = Infinity;
	for ( let i = 0; i < BOARDWALK.length - 1; i ++ ) {

		const [ ax, az ] = BOARDWALK[ i ], [ bx, bz ] = BOARDWALK[ i + 1 ];
		const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
		const u = Math.min( 1, Math.max( 0, ( ( x - ax ) * dx + ( z - az ) * dz ) / l2 ) );
		d = Math.min( d, Math.hypot( ax + dx * u - x, az + dz * u - z ) );

	}

	return d;

}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------
export const PLACES = {
	// the jetty on the east strand: where its deck meets the shore, and the way it points
	// (out over the lake, to the north-west)
	// (a metre and a half inland of the waterline; its deck runs 18 m out, the head in 2 m of water)
	jetty: { x: 74.6, z: 428.6, yaw: Math.atan2( - 0.54, - 0.84 ) },
	// the alp hut, its porch facing east toward the bridge; the tarn beside it
	hut: { x: - 69, z: 712, yaw: 78 * D2R },
	tarn: { x: - 110, z: 682 },
	// the footbridge: its two ends (south bank, north bank)
	bridge: { a: [ - 17.6, 733.6 ], b: [ - 24.6, 722.2 ] },
	// the signpost at the junction, the wayside cross beside it
	signpost: { x: 9, z: 752.8, yaw: - 20 * D2R },
	cross: { x: 14.5, z: 756.5, yaw: 200 * D2R },
	// the marmot bank: a low moraine south of the east pond
	marmotBank: { x: 96, z: 742 },
	// J.'s boots on the plunge pool's shingle, toes to the water
	boots: { x: - 166, z: 770.5, yaw: 200 * D2R },
	// the island's point, where F6 stands
	islandPoint: { x: - 118, z: 214 },
	// your boat, drifted onto the west strand; J.'s, upturned in the reeds before it
	boatEnd: { x: - 248, z: 216, yaw: 150 * D2R },
	boatJ: { x: - 243, z: 268, yaw: 95 * D2R },
};

// a point in the hut's frame (x across its front, z out of the porch) in the world
export function hutPoint( lx, lz ) {

	const h = PLACES.hut, c = Math.cos( h.yaw ), s = Math.sin( h.yaw );
	return { x: h.x + c * lx + s * lz, z: h.z - s * lx + c * lz };

}

const H = ( lx, lz, extra = {} ) => ( { ...hutPoint( lx, lz ), ...extra } );

// ---------------------------------------------------------------------------
// The route. `deck` marks points joined by a deck (no trail pressed into the ground).
// ---------------------------------------------------------------------------
export const ROUTE = [
	// 1. the jetty, from its head to the shore
	{ x: 65.6, z: 414.7, deck: true, id: 'jettyHead' },
	{ x: 75.1, z: 429.4, deck: true, id: 'jettyLand' },
	// 2. the strand to the stream mouth, then up its east bank
	{ x: 76.8, z: 437.5 },
	{ x: 75.5, z: 447 },
	{ x: 72, z: 457, id: 'mouth' },
	{ x: 74, z: 471 },
	{ x: 81, z: 487 },
	{ x: 89, z: 502 },
	{ x: 97, z: 518, id: 'ford' },
	{ x: 99, z: 534 },
	{ x: 95, z: 549 },
	{ x: 91, z: 563 },
	{ x: 88, z: 579 },
	{ x: 89, z: 595 },
	{ x: 92, z: 611 },
	{ x: 93, z: 627 },
	// 3. the gate, the east pond, the marmot bank
	{ x: 92, z: 642, id: 'gate' },
	{ x: 88, z: 660 },
	{ x: 84, z: 681, id: 'pond' },
	{ x: 83, z: 703 },
	{ x: 88, z: 724 },
	{ x: 92, z: 740, id: 'marmots' },
	{ x: 80, z: 752 },
	{ x: 58, z: 758 },
	{ x: 34, z: 757 },
	// 4. the signpost
	{ x: 12, z: 749, id: 'signpost' },
	// 5. along the south bank to the footbridge, over it
	{ x: - 8, z: 741 },
	// (straight on and off, along the bridge's line)
	{ x: - 15.5, z: 737.0 },
	{ x: - 17.6, z: 733.6, deck: true, id: 'bridge' },
	{ x: - 24.6, z: 722.2, deck: true },
	{ x: - 26.7, z: 718.8 },
	// 6. the hut: up the line of its door, past the trough standing out in front of the porch
	{ x: - 36, z: 717.5 },
	H( - 1.9, 24 ),
	H( - 2.3, 14.5, { id: 'troughView' } ),
	H( - 2.4, 10.2 ),
	H( - 1.85, 6.85 ),
	H( - 0.3, 5.4, { id: 'hut' } ),
	// 8. after the storm: back out along the trough's other side to its far end, then round
	// behind the hut and the pen to the tarn
	H( 0.9, 6.7, { id: 'trough' } ),
	H( 1.1, 9.6 ),
	H( 1.5, 12.6, { id: 'troughEnd' } ),
	H( 5.2, 14.2 ),
	H( 10.2, 11.6 ),
	H( 12.6, 5 ),
	H( 13.3, - 4 ),
	H( 13.9, - 14 ),
	{ x: - 93, z: 694, id: 'tarn' },
	// 9. round the tarn, to the plunge pool's rim
	{ x: - 103, z: 712 },
	{ x: - 124, z: 728 },
	{ x: - 145, z: 748 },
	{ x: - 162, z: 761, id: 'pool' },
	{ x: - 175, z: 757 },
	// 10. the Black Wood (part two, HORROR_PLAN 16): in at its edge by a wayside shrine, the
	// woodcutters' clearing, the gully and its footbridge, east to the black pond, back west by
	// the glade with the hunting stand, the forester's lodge, the camp, the charcoal burners'
	{ x: - 185, z: 743 },
	{ x: - 189, z: 724, id: 'shrine' },
	{ x: - 181, z: 706 },
	{ x: - 170, z: 690, id: 'wood' },
	{ x: - 157, z: 669 },
	{ x: - 150.5, z: 656.5, deck: true },
	{ x: - 145, z: 646, deck: true, id: 'gully' },
	{ x: - 139.5, z: 635.5, deck: true },
	{ x: - 133, z: 624 },
	{ x: - 120, z: 605 },
	{ x: - 101, z: 588 },
	{ x: - 84, z: 570 },
	{ x: - 76, z: 553, id: 'blackpond' },
	{ x: - 88, z: 537 },
	{ x: - 112, z: 539 },
	{ x: - 133, z: 546 },
	{ x: - 148, z: 551, id: 'stand' },
	{ x: - 166, z: 543 },
	{ x: - 180, z: 535, id: 'lodge' },
	{ x: - 196, z: 517 },
	{ x: - 204, z: 500, id: 'camp' },
	{ x: - 211, z: 480 },
	{ x: - 214, z: 461, id: 'bear' },
	// 11. out onto the west strand
	{ x: - 216, z: 430 },
	{ x: - 212, z: 404, id: 'strand' },
	// 12. down to the water, and along the old boardwalk over the shallows - a hand's breadth
	// over the water, the bank a few metres off - past J.'s boat and through the reeds
	{ x: - 213, z: 384 },
	{ x: - 207.5, z: 366 },
	...BOARDWALK_LINE().map( ( [ x, z ], i ) => ( { x, z, deck: true, ...( i === 9 ? { id: 'boatJ' } : {} ) } ) ),
	// 13. the boat
	{ x: - 249.5, z: 219.6, id: 'boat' },
];

let _path = null;
export function routePath() {

	return _path ??= new Path( ROUTE );

}

// ---------------------------------------------------------------------------
// Shaping the ground (see terrain: applyStory)
// ---------------------------------------------------------------------------
// low moraine banks: segment a-b, crest height h above the ground, half-width w
export const BANKS = [
	// the marmot bank south of the east pond
	{ a: [ 64, 750 ], b: [ 150, 734 ], h: 4.5, w: 16 },
	// a longer moraine closing off the east side of the first half
	{ a: [ 140, 520 ], b: [ 158, 700 ], h: 6, w: 26 },
	// the gully in the Black Wood: a ravine four metres deep, too steep to climb, across the way
	// (its footbridge is missing its middle planks: HORROR_PLAN 16.3)
	{ a: [ - 196, 652.6 ], b: [ - 94, 639.4 ], h: - 4.3, w: 5.2 },
];

// The Black Wood (HORROR_PLAN 16): dense spruce across the valley floor between the plunge
// pool and the west strand. Bands (segment a-b, radius r) of full density fading over their
// last 14 m, with clearings cut out of them ( x, z, radius ) where its places stand.
export const WOODS = {
	bands: [
		{ a: [ - 206, 716 ], b: [ - 214, 468 ], r: 30 },
		{ a: [ - 162, 672 ], b: [ - 152, 482 ], r: 34 },
		{ a: [ - 104, 630 ], b: [ - 60, 505 ], r: 32 },
	],
	clear: [
		[ - 190, 724, 5 ], // the wayside shrine
		[ - 160, 688, 11 ], // the woodcutters' clearing
		[ - 150, 562, 15 ], // the glade under the hunting stand
		[ - 190, 526, 12 ], // the forester's lodge
		[ - 208, 492, 7 ], // the camp
		[ - 203, 452, 12 ], // the charcoal burners'
	],
	box: [ - 250, 430, - 25, 755 ],
};

const segDist = ( x, z, [ ax, az ], [ bx, bz ] ) => {

	const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
	const t = Math.max( 0, Math.min( 1, ( ( x - ax ) * dx + ( z - az ) * dz ) / l2 ) );
	return Math.hypot( x - ax - dx * t, z - az - dz * t );

};

const sm = ( a, b, x ) => { const t = Math.max( 0, Math.min( 1, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };

// how deep in the Black Wood (x, z) is: 0 outside it or in a clearing, 1 in its heart (the
// terrain's biome pass does the same on the GPU: woods() in core/features.js)
export function woodsAt( x, z ) {

	let w = 0;
	for ( const b of WOODS.bands ) w = Math.max( w, 1 - sm( b.r - 14, b.r, segDist( x, z, b.a, b.b ) ) );
	if ( w <= 0 ) return 0;
	for ( const [ cx, cz, r ] of WOODS.clear ) w *= sm( r, r + 6, Math.hypot( x - cx, z - cz ) );
	return w;

}

// the pool the footbridge crosses: a stretch of the stream widened and deepened
export const BRIDGE_POOL = { s0: 128, s1: 182, widen: 2.1, deepen: 0.9 };

// what the terrain generator shapes for this edition (see core/features.js)
// (the tarn, pond 1, is peaty: dark enough to mirror)
export const FEATURES = { banks: BANKS, pool: BRIDGE_POOL, peat: [ 0, 1, 0.4, 0 ], woods: WOODS };

// ---------------------------------------------------------------------------
// Marks on the ground (story/ground.js): yards, landings, clearings under props
// ---------------------------------------------------------------------------
export function paintGround( g ) {

	const hut = PLACES.hut, fx = Math.sin( hut.yaw ), fz = Math.cos( hut.yaw );
	const at = ( lx, lz ) => [ hut.x + Math.cos( hut.yaw ) * lx + fx * lz, hut.z - Math.sin( hut.yaw ) * lx + fz * lz ];
	// the hut stands on its own footprint; the yard in front of the porch and round the
	// trough is trodden bare, and the path out to the pen
	g.rect( 3, hut.x, hut.z, 3.6, 5.6, hut.yaw, 1, 0.6 );
	g.blob( 1, ...at( - 0.3, 7.7 ), 3.2, 2.4, hut.yaw, 0.95, 0.6 );
	g.blob( 1, ...at( - 0.8, 8.4 ), 2.6, 3.0, hut.yaw, 0.9, 0.6 );
	g.blob( 1, ...at( 4.5, - 5.5 ), 2.0, 1.5, hut.yaw, 0.6, 0.7 );
	// the jetty's landing, the bridge ends, the signpost's foot; the jetty's line and its
	// berths kept clear (of boulders)
	const j = PLACES.jetty;
	g.rect( 3, j.x + Math.sin( j.yaw ) * 11, j.z + Math.cos( j.yaw ) * 11, 6, 13, j.yaw, 1, 0.5 );
	g.blob( 1, j.x - Math.sin( j.yaw ) * 1.5, j.z - Math.cos( j.yaw ) * 1.5, 2.2, 1.6, j.yaw, 0.8, 0.6 );
	for ( const [ x, z ] of [ PLACES.bridge.a, PLACES.bridge.b ] ) g.blob( 1, x, z, 1.6, 1.6, 0, 0.8, 0.6 );
	g.blob( 1, PLACES.signpost.x, PLACES.signpost.z, 1.8, 1.5, 0.3, 0.7, 0.6 );
	g.blob( 3, PLACES.signpost.x, PLACES.signpost.z, 0.5, 0.5, 0, 1, 0.5 );
	g.blob( 3, PLACES.cross.x, PLACES.cross.z, 0.8, 0.8, 0, 0.8, 0.5 );
	// the boats on the west strand
	for ( const b of [ PLACES.boatEnd, PLACES.boatJ ] ) g.rect( 3, b.x, b.z, 0.9, 2.8, b.yaw, 1, 0.5 );

}

// Puddles, for after the storm: in the tread's flattest, most dished spots from the hut yard to
// the strand, spaced out, long along the path (after refs of rutted tracks after rain), now and
// then a pair like the ruts of a cart. Painted into the ground marks (channel 2); returns them
// for the near one's mirror: [ { x, z, rx, rz, yaw, level } ].
export function paintPuddles( g, td ) {

	const path = routePath(), ids = path.ids;
	const hash = ( a, b ) => { const v = Math.sin( a * 127.1 + b * 311.7 ) * 43758.5453; return v - Math.floor( v ); };
	const cands = [];
	for ( let d = ids.hut - 30; d < ids.strand + 45; d += 1.5 ) {

		const p = path.at( d );
		if ( p.deck ) continue;
		const h = td.heightAt( p.x, p.z );
		if ( h < 0.6 ) continue;
		let sum = 0, hi = - Infinity, lo = Infinity;
		for ( let k = 0; k < 8; k ++ ) {

			const a = k / 8 * Math.PI * 2, q = td.heightAt( p.x + Math.cos( a ) * 1.4, p.z + Math.sin( a ) * 1.4 );
			sum += q; hi = Math.max( hi, q ); lo = Math.min( lo, q );

		}

		const slope = ( hi - lo ) / 2.8, dish = sum / 8 - h;
		if ( slope > 0.11 ) continue;
		cands.push( { d, p, h, score: dish * 60 - slope * 5 + hash( p.x, p.z ) * 0.5 } );

	}

	cands.sort( ( a, b ) => b.score - a.score );
	const out = [];
	for ( const c of cands ) {

		if ( out.length >= 22 ) break;
		if ( out.some( ( o ) => Math.abs( o.d - c.d ) < 13 ) ) continue;
		const r = hash( c.p.z, c.p.x );
		const add = ( d, scale ) => {

			const p = path.at( d ), nx = p.tz, nz = - p.tx;
			const off = ( hash( d, 3 ) - 0.5 ) * 0.45;
			const x = p.x + nx * off, z = p.z + nz * off;
			const rx = ( 0.7 + 1.3 * hash( d, 7 ) ) * scale, rz = ( 0.35 + 0.45 * hash( d, 11 ) ) * scale;
			const yaw = Math.atan2( - p.tz, p.tx );
			g.blob( 2, x, z, rx, rz, yaw, 1, 0.55 );
			out.push( { d, x, z, rx, rz, yaw, level: td.heightAt( x, z ) + 0.012 } );

		};

		add( c.d, 1 );
		if ( r < 0.4 ) add( c.d + 1.8 + r * 2, 0.7 );

	}

	// and in the hut's trodden yard, either side of the trough (from the yard, they mirror the
	// doorway where the trough does not: see the F4 beat)
	const hut = PLACES.hut;
	for ( const [ lx, lz, rx, rz ] of [ [ 0.8, 8.0, 1.0, 0.6 ], [ - 2.45, 8.2, 0.95, 0.55 ] ] ) {

		const x = hut.x + Math.cos( hut.yaw ) * lx + Math.sin( hut.yaw ) * lz, z = hut.z - Math.sin( hut.yaw ) * lx + Math.cos( hut.yaw ) * lz;
		g.blob( 2, x, z, rx, rz, hut.yaw, 1, 0.55 );
		out.push( { d: ids.hut, x, z, rx, rz, yaw: hut.yaw, level: td.heightAt( x, z ) + 0.012, yard: true } );

	}

	return out;

}

// the area the ground marks cover: [ x0, z0, x1, z1 ]
export const GROUND_BOX = [ - 285, 195, 120, 790 ];

// ---------------------------------------------------------------------------
// Open water: no reeds or lily pads on the jetty's line and its berths, round the boats on
// the west strand, or on the tarn, whose reflections the story needs
// ---------------------------------------------------------------------------
const TARN_VIEW = [ - 97, 692 ];
export function waterClear( x, z, kind ) {

	const j = PLACES.jetty, c = Math.cos( j.yaw ), s = Math.sin( j.yaw );
	const dx = x - j.x, dz = z - j.z;
	const lx = c * dx - s * dz, lz = s * dx + c * dz;
	if ( lz > - 3 && lz < 26 && lx > - 7 && lx < 8 ) return true;
	// the row-in's lane, from out in the bay to the berth (boatscene.rowIn, in the jetty's frame):
	// nothing growing up through the boat as it comes in
	if ( lz > 10 && lz < 100 && lx > - 6 && lx < 38 ) {

		const L = [ [ 2.5, 16.6 ], [ 3.5, 23.6 ], [ 8.5, 40.6 ], [ 19.5, 66.1 ], [ 30.5, 91.6 ] ];
		for ( let i = 0; i < L.length - 1; i ++ ) {

			const [ ax, az ] = L[ i ], [ bx, bz ] = L[ i + 1 ], dx = bx - ax, dz = bz - az;
			const u = Math.min( 1, Math.max( 0, ( ( lx - ax ) * dx + ( lz - az ) * dz ) / ( dx * dx + dz * dz ) ) );
			if ( Math.hypot( ax + dx * u - lx, az + dz * u - lz ) < 3.4 ) return true;

		}

	}
	for ( const b of [ PLACES.boatEnd, PLACES.boatJ ] ) if ( Math.hypot( x - b.x, z - b.z ) < 6 ) return true;
	// nothing grows up through the boardwalk's planks
	if ( Math.abs( z - 290 ) < 70 && x < - 195 && x > - 255 && boardwalkDist( x, z ) < ( kind === 'reed' ? 1.05 : 0.9 ) ) return true;
	const t = PLACES.tarn;
	const r = Math.hypot( x - t.x, z - t.z );
	// the tarn stays open, but for a few pads in its northern lobe
	if ( kind === 'pad' && r < 30 && ! ( z < t.z - 10 && ( ( x * 7.1 + z * 3.3 ) % 1 + 1 ) % 1 < 0.3 ) ) return true;
	// the tarn's near shore, where the path comes to the water: open, so you see into it; and
	// round the figure's place on the far shore, and between (no reeds in front of it)
	if ( Math.hypot( x - TARN_VIEW[ 0 ], z - TARN_VIEW[ 1 ] ) < 13 ) return true;
	{

		const [ ex, ez ] = SIGHTS.tarn.eye, [ fx, fz ] = SIGHTS.tarn.fig;
		const dx = fx - ex, dz = fz - ez, l = Math.hypot( dx, dz );
		const along = ( ( x - ex ) * dx + ( z - ez ) * dz ) / l;
		const across = Math.abs( ( x - ex ) * dz - ( z - ez ) * dx ) / l;
		if ( along > 0 && along < l + 6 && across < 5 + along * 0.12 ) return true;

	}
	return false;

}

// ---------------------------------------------------------------------------
// Where the animals live in this edition (see the encounters in story/encounters.js)
// ---------------------------------------------------------------------------
export function faunaAt( td ) {

	const tarn = td.ponds[ 1 ];
	return {
		mammals: {
			// the herd grazes the west bank by the ford, across the stream from the path
			herd: fordWest( td ),
			// the marmots' bank, their burrows turned toward the path: on the outside of its bend,
			// 6 to 13 m off it (they were 17 to 30, too far to see much of)
			burrows: [ [ 99, 741 ], [ 98, 733 ], [ 95.5, 746.5 ], [ 105, 741 ] ],
			face: [ 92, 738 ],
			// a hare that sits tight in the path (E5), and others along the way
			hares: [ [ 95, 604 ], [ 58, 600 ], [ 118, 676 ], [ - 150, 732 ], [ - 222, 474 ], [ - 30, 660 ] ],
			// the bear works the lower edge of the larch wood (E13)
			// (in the Black Wood, east of the way between the camp and the charcoal burners')
			bear: { start: [ - 192, 474 ], route: [ [ - 192, 474 ], [ - 186, 490 ], [ - 197, 466 ], [ - 184, 481 ] ] },
			// squirrels in the larch wood (E12), by the signpost and near the hut
			squirrels: [ [ - 221, 642 ], [ - 214, 704 ], [ 4, 744 ], [ - 40, 725 ], [ - 233, 520 ] ],
		},
		birds: {
			// a heron on the shallows by the jetty (E1), another on the tarn's far shore (E9)
			herons: [ [ 57, 428, 0 ], [ tarn.c.x - 16, tarn.c.y - 6, tarn.surf ] ],
			grebes: [ [ 48, 402 ], [ 82, 394 ], [ 30, 386 ] ],
			chough: { crag: [ - 240, 150, 830 ], spots: [ [ - 110, 60, 700 ], [ - 160, 72, 752 ], [ 0, 52, 650 ], [ - 60, 58, 610 ] ] },
		},
		small: {
			flocks: [ [ 12, 756 ], [ - 58, 700 ], [ 104, 610 ], [ - 214, 660 ], [ 70, 478 ] ],
			wagtails: { x0: 62, x1: 108, z0: 424, z1: 452 },
			// a dipper at the stream's mouth (E3), one under the footbridge (E8)
			dippers: [ 478, 184 ],
		},
		fowl: {
			swans: false,
			// (the first party well out in the bay, clear of the boat's way in to the jetty)
			mallards: [ [ 0, 365, 6 ], [ - 170, 330, 5 ], [ - 225, 300, 3 ] ],
			bay: { x0: - 260, x1: 120, z0: 240, z1: 452 },
		},
	};

}

// the west bank of the reach where the herd fords the stream (E4), a few metres from the water
function fordWest( td ) {

	const R = td.river;
	const i = R.findIndex( ( s ) => s.s > 420 );
	const a = R[ i - 1 ], b = R[ i + 1 ], c = R[ i ];
	const tx = b.p.x - a.p.x, tz = b.p.y - a.p.y, tl = Math.hypot( tx, tz );
	let nx = tz / tl, nz = - tx / tl;
	if ( nx < 0 ) { nx = - nx; nz = - nz; }
	return [ c.p.x - nx * ( c.width + 11 ), c.p.y - nz * ( c.width + 11 ) ];

}

// ---------------------------------------------------------------------------
// Sightlines. Where the figure is seen in the water, what is behind it (in the mirror) must be
// light - sky, the snow of the horn in the haze - or a dark coat on dark water shows nothing.
// Trees are kept out of a corridor running on from the eye, past the figure, down the valley.
// ---------------------------------------------------------------------------
// E14: the reedbed on the west shore the starlings pour down into at dusk, a little north of
// the boat - straw-gold Phragmites from the bank out into the shallows (u along the shore)
export const REEDBEDS = [ { x: - 236, z: 244, len: 18, wid: 10, yaw: - 1.23, lean: 0.8 } ];

export const SIGHTS = {
	// F5: from the tarn's south-east shore, across it to the far shore's shallows, a little west
	// of north: its reflection out in the middle of the tarn against the misty valley and the horn
	tarn: { eye: [ - 93, 694 ], fig: [ - 99.3, 669.6 ], len: 240 },
};

export function treeClear( x, z ) {

	for ( const s of Object.values( SIGHTS ) ) {

		const [ ex, ez ] = s.eye, [ fx, fz ] = s.fig;
		const dx = fx - ex, dz = fz - ez, l = Math.hypot( dx, dz );
		const ux = dx / l, uz = dz / l;
		const along = ( x - fx ) * ux + ( z - fz ) * uz;
		if ( along < - 2 || along > s.len ) continue;
		const across = Math.abs( ( x - fx ) * uz - ( z - fz ) * ux );
		if ( across < 5 + along * 0.13 ) return true;

	}

	return false;

}
