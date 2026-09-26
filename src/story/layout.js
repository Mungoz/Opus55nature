import { Path } from './path.js';

// The horror edition's layout: the route, the places along it and the things that shape
// it, laid into the nature edition's valley. Data only; the generators and the story read it.
// Coordinates are metres: +x east, +z south (up the valley), the lake's surface at y = 0.

const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------
export const PLACES = {
	// the jetty on the east strand: where its deck meets the shore, and the way it points
	// (out over the lake, to the north-west)
	jetty: { x: 80, z: 437, yaw: Math.atan2( - 0.54, - 0.84 ) },
	// the alp hut, its porch facing east toward the bridge; the tarn beside it
	hut: { x: - 69, z: 712, yaw: 78 * D2R },
	tarn: { x: - 110, z: 682 },
	// the footbridge: its two ends (south bank, north bank)
	bridge: { a: [ - 17.6, 733.6 ], b: [ - 24.6, 722.2 ] },
	// the signpost at the junction, the wayside cross beside it
	signpost: { x: 6, z: 750.5, yaw: - 20 * D2R },
	cross: { x: 12.5, z: 755, yaw: 200 * D2R },
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
	{ x: 71.0, z: 423.1, deck: true, id: 'jettyHead' },
	{ x: 80.0, z: 437.0, deck: true, id: 'jettyLand' },
	// 2. the strand to the stream mouth, then up its east bank
	{ x: 78.5, z: 446 },
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
	{ x: - 17.6, z: 733.6, deck: true, id: 'bridge' },
	{ x: - 24.6, z: 722.2, deck: true },
	// 6. the hut: up the line of its door, past the trough standing out in front of the porch
	{ x: - 36, z: 717.5 },
	H( - 0.8, 24 ),
	H( - 0.8, 14.5, { id: 'troughView' } ),
	H( 0.9, 10.2 ),
	H( 0.6, 7.2 ),
	H( - 0.3, 5.4, { id: 'hut' } ),
	// 8. after the storm, round the hut's north side and behind the pen to the tarn
	H( 3.6, 4.6, { id: 'trough' } ),
	H( 5.6, 0 ),
	H( 6.6, - 4.8 ),
	H( 11.2, - 8.6 ),
	H( 13.2, - 16 ),
	{ x: - 93, z: 694, id: 'tarn' },
	// 9. round the tarn, to the plunge pool's rim
	{ x: - 103, z: 712 },
	{ x: - 124, z: 728 },
	{ x: - 145, z: 748 },
	{ x: - 162, z: 761, id: 'pool' },
	{ x: - 181, z: 763 },
	{ x: - 196, z: 752 },
	// 10. north through the larch wood under the west wall
	{ x: - 205, z: 725 },
	{ x: - 212, z: 694, id: 'wood' },
	{ x: - 218, z: 660 },
	{ x: - 222, z: 628 },
	{ x: - 227, z: 596 },
	{ x: - 229, z: 562, id: 'bear' },
	{ x: - 231, z: 528 },
	{ x: - 229, z: 494 },
	{ x: - 223, z: 462 },
	// 11. out onto the west strand
	{ x: - 216, z: 430 },
	{ x: - 212, z: 404, id: 'strand' },
	// 12. north along the dark shore, a few metres above the water
	{ x: - 221, z: 378 },
	{ x: - 232, z: 352 },
	{ x: - 240, z: 326 },
	{ x: - 245, z: 300 },
	{ x: - 248, z: 276, id: 'boatJ' },
	{ x: - 250, z: 250 },
	// 13. the boat
	{ x: - 251, z: 226, id: 'boat' },
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
];

// the pool the footbridge crosses: a stretch of the stream widened and deepened
export const BRIDGE_POOL = { s0: 150, s1: 192, widen: 2.1, deepen: 0.9 };

// what the terrain generator shapes for this edition (see core/features.js)
export const FEATURES = { banks: BANKS, pool: BRIDGE_POOL };

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
	g.blob( 1, ...at( - 0.8, 8.4 ), 1.5, 2.6, hut.yaw, 0.9, 0.6 );
	g.blob( 1, ...at( 4.5, - 5.5 ), 2.0, 1.5, hut.yaw, 0.6, 0.7 );
	// the jetty's landing, the bridge ends, the signpost's foot
	const j = PLACES.jetty;
	g.blob( 1, j.x - Math.sin( j.yaw ) * 1.5, j.z - Math.cos( j.yaw ) * 1.5, 2.2, 1.6, j.yaw, 0.8, 0.6 );
	for ( const [ x, z ] of [ PLACES.bridge.a, PLACES.bridge.b ] ) g.blob( 1, x, z, 1.6, 1.6, 0, 0.8, 0.6 );
	g.blob( 1, PLACES.signpost.x, PLACES.signpost.z, 1.8, 1.5, 0.3, 0.7, 0.6 );
	g.blob( 3, PLACES.signpost.x, PLACES.signpost.z, 0.5, 0.5, 0, 1, 0.5 );
	g.blob( 3, PLACES.cross.x, PLACES.cross.z, 0.8, 0.8, 0, 0.8, 0.5 );
	// the boats on the west strand
	for ( const b of [ PLACES.boatEnd, PLACES.boatJ ] ) g.rect( 3, b.x, b.z, 0.9, 2.8, b.yaw, 1, 0.5 );

}

// the area the ground marks cover: [ x0, z0, x1, z1 ]
export const GROUND_BOX = [ - 285, 195, 120, 790 ];
