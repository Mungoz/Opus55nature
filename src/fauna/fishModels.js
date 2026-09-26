import * as THREE from 'three';
import { PartBuilder, MAT } from './creature.js';
import { toAlbedo } from './sdf.js';

// Fish of an alpine lake, each after photographs, built at a common length (0.46 along +z,
// tail at -0.23, head at +0.23 - the swimming wave in the creature shader expects it) and
// scaled per shoal:
//  - European perch: deep-bodied, olive-gold with six or seven dark bars, a spiny first
//    dorsal with a black spot at its end, red-orange pelvic and anal fins and tail
//  - Arctic char, in autumn spawning dress: olive back, flanks and belly flushed orange-red,
//    small pale spots, the lower fins red with white leading edges
//  - common minnow: small and slender, olive-gold, a row of dark blotches along the flank
//  - grayling: slender, silver-grey with scattered dark spots, and a tall sail of a dorsal
//    fin edged purple and red

const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

const h2 = ( x, y ) => {

	const s = Math.sin( x * 127.1 + y * 311.7 ) * 43758.5453;
	return s - Math.floor( s );

};

const SPECIES = {
	perch: {
		depth: 0.3, width: 0.13, humpAt: 0.55, tailFork: 0.35,
		coat( t, v, side ) {

			// t: 0 tail .. 1 head; v: -1 belly .. 1 back
			const c = new THREE.Color( '#6f7a3a' ).lerp( new THREE.Color( '#c9b870' ), ss( 0.6, - 0.2, v ) ).lerp( new THREE.Color( '#e8e2c8' ), ss( - 0.35, - 0.8, v ) );
			// the dark bars, strongest on the upper flank
			const bar = Math.cos( ( t * 7.2 - 0.3 ) * Math.PI * 2 );
			const inBars = t > 0.12 && t < 0.78;
			c.lerp( new THREE.Color( '#2c3018' ), inBars ? ss( 0.35, 0.8, bar ) * ss( - 0.45, 0.2, v ) * 0.75 : 0 );
			// the gill cover a little brassy
			if ( t > 0.72 && t < 0.85 && v < 0.4 ) c.lerp( new THREE.Color( '#b69a5a' ), 0.35 );
			return c;

		},
		fins: {
			tail: '#c8502a', pelvic: '#d24a24', anal: '#d0582c', pectoral: '#c8a060',
			dorsal: [ { from: 0.45, to: 0.74, h: 0.055, color: '#6a6a42', spot: true, spines: true }, { from: 0.24, to: 0.43, h: 0.04, color: '#8a8450' } ],
		},
	},
	char: {
		depth: 0.21, width: 0.12, humpAt: 0.5, tailFork: 0.18,
		coat( t, v ) {

			const c = new THREE.Color( '#475038' ).lerp( new THREE.Color( '#c05a2e' ), ss( 0.45, - 0.15, v ) ).lerp( new THREE.Color( '#d8562a' ), ss( - 0.3, - 0.75, v ) );
			// pale spots scattered over the flank and back
			const gx = Math.floor( t * 26 ), gy = Math.floor( ( v + 1 ) * 7 );
			const fx = t * 26 - gx - 0.5, fy = ( v + 1 ) * 7 - gy - 0.5;
			if ( v > - 0.35 && h2( gx, gy ) > 0.55 && fx * fx + fy * fy < 0.09 ) c.lerp( new THREE.Color( '#e8cfa0' ), 0.75 );
			return c;

		},
		fins: {
			tail: '#5a5a40', pelvic: '#c84424', anal: '#c84424', pectoral: '#c84424', whiteEdge: true,
			dorsal: [ { from: 0.44, to: 0.62, h: 0.035, color: '#555a3e' } ],
		},
	},
	minnow: {
		depth: 0.17, width: 0.1, humpAt: 0.5, tailFork: 0.3,
		coat( t, v ) {

			const c = new THREE.Color( '#4a5230' ).lerp( new THREE.Color( '#b8a860' ), ss( 0.4, - 0.1, v ) ).lerp( new THREE.Color( '#e0dcc8' ), ss( - 0.35, - 0.8, v ) );
			// a line of dark blotches along the flank, run together toward the tail
			const bl = Math.cos( t * 9 * Math.PI * 2 ) * 0.5 + 0.5;
			c.lerp( new THREE.Color( '#23261a' ), ss( 0.25, 0.1, Math.abs( v - 0.05 ) ) * ss( 0.35, 0.8, bl + ( 1 - t ) * 0.4 ) * 0.8 );
			// a golden line above it
			c.lerp( new THREE.Color( '#c8a848' ), ss( 0.1, 0.0, Math.abs( v - 0.3 ) ) * 0.5 );
			return c;

		},
		fins: { tail: '#6a6440', pelvic: '#b89060', anal: '#a89468', pectoral: '#b0a070', dorsal: [ { from: 0.42, to: 0.57, h: 0.028, color: '#5a5a3c' } ] },
	},
	grayling: {
		depth: 0.19, width: 0.11, humpAt: 0.55, tailFork: 0.35,
		coat( t, v ) {

			const c = new THREE.Color( '#4c5256' ).lerp( new THREE.Color( '#a8a9a4' ), ss( 0.45, - 0.1, v ) ).lerp( new THREE.Color( '#dcdad2' ), ss( - 0.35, - 0.8, v ) );
			// a scatter of small dark spots toward the head
			const gx = Math.floor( t * 30 ), gy = Math.floor( ( v + 1 ) * 8 );
			const fx = t * 30 - gx - 0.5, fy = ( v + 1 ) * 8 - gy - 0.5;
			if ( t > 0.55 && v > - 0.3 && h2( gx + 7, gy ) > 0.62 && fx * fx + fy * fy < 0.08 ) c.lerp( new THREE.Color( '#1c1c1e' ), 0.8 );
			// faint coppery lines along the scale rows
			c.lerp( new THREE.Color( '#8a6a58' ), ( Math.cos( v * 14 ) * 0.5 + 0.5 ) * 0.12 );
			return c;

		},
		fins: { tail: '#5a5058', pelvic: '#8a5a50', anal: '#6a6060', pectoral: '#8a8078', dorsal: [ { from: 0.3, to: 0.7, h: 0.065, color: '#4a4058', sail: true } ] },
	},
};

// the outline: a slim tail stalk swelling to the deepest point, then a blunt, rounded head
const profile = ( sp ) => ( t ) => {

	const k = sp.humpAt;
	const env = t < k ? Math.pow( Math.sin( Math.PI * 0.5 * t / k ), 0.85 ) : Math.sqrt( Math.max( 0, 1 - Math.pow( ( t - k ) / ( 1.035 - k ), 2 ) ) );
	return env * ( 0.14 + 0.86 * ss( 0.0, 0.3, t ) );

};

// the body: an elliptical section lofted along z, deepest toward the head
function bodyGeometry( sp ) {

	const prof = profile( sp );

	const segs = 22, around = 14;
	const pos = [], col = [], idx = [];
	const c3 = [ 0, 0, 0 ];
	for ( let i = 0; i <= segs; i ++ ) {

		const t = i / segs; // 0 tail .. 1 head
		const z = - 0.23 + t * 0.46;
		// profile: a slim tail stalk, fullest at humpAt, a rounded head
		const e = prof( t );
		const hh = Math.max( 0.004, sp.depth * 0.23 * e ), ww = Math.max( 0.003, sp.width * 0.23 * e );
		for ( let k = 0; k <= around; k ++ ) {

			const a = k / around * Math.PI * 2;
			const v = Math.cos( a ); // 1 back .. -1 belly
			// a flatter belly, a keeled back
			const y = hh * v * ( v > 0 ? 1.05 : 0.95 );
			const x = ww * Math.sin( a );
			pos.push( x, y, z );
			const c = sp.coat( t, v, Math.sign( x ) );
			toAlbedo( c.r, c.g, c.b, c3, 0 );
			// fish are counter-shaded and a little shiny: the belly stays bright
			col.push( c3[ 0 ] * 1.25, c3[ 1 ] * 1.25, c3[ 2 ] * 1.25 );

		}

	}

	for ( let i = 0; i < segs; i ++ ) for ( let k = 0; k < around; k ++ ) {

		const a = i * ( around + 1 ) + k, b = a + around + 1;
		idx.push( a, b, a + 1, a + 1, b, b + 1 );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	const ng = g.toNonIndexed();
	const colors = [];
	for ( const i of idx ) colors.push( col[ i * 3 ], col[ i * 3 + 1 ], col[ i * 3 + 2 ] );
	ng.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
	return { geo: ng, depthAt: ( t ) => sp.depth * 0.23 * prof( t ) };

}

export function fishGeometry( species ) {

	const sp = SPECIES[ species ];
	const b = new PartBuilder();
	const { geo, depthAt } = bodyGeometry( sp );
	b.add( geo, '#ffffff', null, 0, MAT.SCALES );
	b.parts[ b.parts.length - 1 ].setAttribute( 'color', geo.getAttribute( 'color' ) );
	const zAt = ( t ) => - 0.23 + t * 0.46;
	const F = sp.fins;
	// tail: forked (or square), a little taller than the stalk
	const tz = zAt( 0.03 ), st = depthAt( 0.03 ) * 0.9, th = sp.depth * 0.23 * 1.35, tl = 0.07, fork = sp.tailFork;
	const notch = [ 0, 0, tz - tl * ( 1 - fork ) ];
	b.tris( [ [ 0, st, tz ], [ 0, th, tz - tl ], notch, [ 0, st, tz ], notch, [ 0, 0, tz ], [ 0, 0, tz ], notch, [ 0, - st, tz ], [ 0, - st, tz ], notch, [ 0, - th, tz - tl ] ], F.tail, () => 0, MAT.PLAIN );
	// dorsal fins: a membrane along the back; its top edge serrated where spines hold it (perch),
	// or rising to a tall rounded sail (grayling), edged in colour
	for ( const d of F.dorsal ) {

		const z0 = zAt( d.from ), z1 = zAt( d.to );
		const n = 16, pts = [], edge = [];
		const top = ( u ) => {

			// u: 0 at the front of the fin .. 1 at its back
			if ( d.sail ) return d.h * ( 0.3 + 0.7 * Math.sin( Math.PI * 0.5 * Math.min( 1, u * 1.25 ) ) ) * ( 1 - ss( 0.85, 1.0, u ) * 0.6 );
			if ( d.spines ) return d.h * ( 1 - 0.6 * u ) * ( 0.72 + 0.28 * Math.pow( Math.abs( Math.cos( u * 6.5 * Math.PI ) ), 3 ) ) * ss( 0.0, 0.08, u + 0.02 );
			return d.h * Math.sin( Math.PI * Math.min( 1, 0.12 + 0.95 * u ) ) * ( 1.1 - 0.3 * u );

		};

		for ( let k = 0; k < n; k ++ ) {

			const u0 = k / n, u1 = ( k + 1 ) / n;
			const za = z1 + ( z0 - z1 ) * u0, zb = z1 + ( z0 - z1 ) * u1;
			const ya = depthAt( ( za + 0.23 ) / 0.46 ) * 0.93, yb = depthAt( ( zb + 0.23 ) / 0.46 ) * 0.93;
			// the fin rakes back a little
			const ra = top( u0 ), rb = top( u1 );
			pts.push( [ 0, ya, za ], [ 0, yb + rb, zb - rb * 0.25 ], [ 0, yb, zb ], [ 0, ya, za ], [ 0, ya + ra, za - ra * 0.25 ], [ 0, yb + rb, zb - rb * 0.25 ] );
			if ( d.sail ) edge.push( [ 0.001, ya + ra * 0.82, za - ra * 0.2 ], [ 0.001, yb + rb, zb - rb * 0.25 ], [ 0.001, yb + rb * 0.82, zb - rb * 0.2 ], [ 0.001, ya + ra * 0.82, za - ra * 0.2 ], [ 0.001, ya + ra, za - ra * 0.25 ], [ 0.001, yb + rb, zb - rb * 0.25 ] );

		}

		b.tris( pts, d.color, () => 0, MAT.PLAIN );
		if ( edge.length ) b.tris( edge, '#a8485a', () => 0, MAT.PLAIN );
		if ( d.spot ) {

			// the black spot at the back of a perch's first dorsal
			const zs = z0 + ( z1 - z0 ) * 0.15, ys = depthAt( ( zs + 0.23 ) / 0.46 ) * 0.93;
			b.tris( [ [ 0.002, ys + 0.004, zs + 0.012 ], [ 0.002, ys + top( 0.85 ) * 0.8, zs - 0.004 ], [ 0.002, ys + 0.004, zs - 0.014 ] ], '#141412', () => 0, MAT.PLAIN );

		}

	}

	// pelvic and anal fins below, pectorals behind the gill cover
	const yb = ( t ) => - depthAt( t ) * 0.92;
	const lowFin = ( t, len, color ) => {

		const z = zAt( t );
		for ( const sd of [ - 1, 1 ] ) b.tris( [ [ sd * 0.006, yb( t ), z ], [ sd * 0.016, yb( t ) - len * 0.5, z - len ], [ sd * 0.004, yb( t ), z - len * 0.8 ] ], color, () => 0, MAT.PLAIN );
		if ( F.whiteEdge ) for ( const sd of [ - 1, 1 ] ) b.tris( [ [ sd * 0.0065, yb( t ) - 0.002, z ], [ sd * 0.0165, yb( t ) - len * 0.5 - 0.002, z - len ], [ sd * 0.012, yb( t ) - len * 0.45, z - len * 0.8 ] ], '#f0ece0', () => 0, MAT.PLAIN );

	};

	lowFin( 0.55, 0.05, F.pelvic );
	const az = zAt( 0.3 );
	b.tris( [ [ 0, yb( 0.36 ), az + 0.03 ], [ 0, yb( 0.3 ) - 0.03, az - 0.01 ], [ 0, yb( 0.24 ), az - 0.03 ] ], F.anal, () => 0, MAT.PLAIN );
	for ( const sd of [ - 1, 1 ] ) {

		const pz = zAt( 0.74 ), py = - depthAt( 0.74 ) * 0.3, px = sd * sp.width * 0.23 * 0.9;
		b.tris( [ [ px, py, pz ], [ px + sd * 0.03, py - 0.02, pz - 0.05 ], [ px, py - 0.012, pz - 0.035 ] ], F.pectoral, () => 0, MAT.PLAIN );

	}

	// the eye: dark, with a pale ring
	for ( const sd of [ - 1, 1 ] ) {

		const ez = zAt( 0.9 ), ey = depthAt( 0.9 ) * 0.25, ex = sd * sp.width * 0.23 * 0.62;
		const ring = new THREE.CircleGeometry( 0.011, 12 );
		ring.rotateY( sd * Math.PI / 2 );
		ring.translate( ex, ey, ez );
		b.add( ring, species === 'perch' ? '#d8c060' : '#c8c0a8', null, 0, MAT.BILL );
		const pupil = new THREE.CircleGeometry( 0.007, 10 );
		pupil.rotateY( sd * Math.PI / 2 );
		pupil.translate( ex + sd * 0.0008, ey, ez );
		b.add( pupil, '#0c0c0c', null, 0, MAT.EYE );

	}

	return b.build();

}
