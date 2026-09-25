import * as THREE from 'three';
import { PartBuilder, loft, MAT } from './creature.js';

const M = ( fn ) => fn( new THREE.Matrix4() );
export const smooth = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// A patch laid over a lofted body between two parameters, pushed slightly
// outward: used for folded wings that sit on the flanks.
export function shell( section, t0, t1, a0, a1, lift, edgeFn, segs = 18, around = 10 ) {

	const pos = [], idx = [];
	for ( let i = 0; i <= segs; i ++ ) {

		const u = i / segs;
		const t = t0 + ( t1 - t0 ) * u;
		const sec = section( t );
		const n = sec.n ?? 2.2;
		for ( let j = 0; j <= around; j ++ ) {

			const v = j / around;
			const a = a0 + ( a1 - a0 ) * Math.min( 1, v * edgeFn( u ) );
			const c = Math.cos( a ), si = Math.sin( a );
			const x = Math.sign( c ) * Math.pow( Math.abs( c ), 2 / n ) * sec.w * lift;
			const y = Math.sign( si ) * Math.pow( Math.abs( si ), 2 / n ) * ( si >= 0 ? sec.top : sec.bot ) * lift;
			pos.push( ( sec.cx ?? 0 ) + x, ( sec.cy ?? 0 ) + y, sec.z );

		}

	}

	for ( let i = 0; i < segs; i ++ ) for ( let j = 0; j < around; j ++ ) {

		const p = i * ( around + 1 ) + j, q = p + around + 1;
		idx.push( p, q, p + 1, q, q + 1, p + 1 );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// Tube along a curve whose radius follows radiusFn(t).
export function taperedTube( curve, radiusFn, segs = 32, radial = 12 ) {

	const tube = new THREE.TubeGeometry( curve, segs, 1, radial );
	const p = tube.getAttribute( 'position' );
	const tmp = new THREE.Vector3(), c = new THREE.Vector3();
	for ( let i = 0; i < p.count; i ++ ) {

		const t = Math.floor( i / ( radial + 1 ) ) / segs;
		curve.getPointAt( t, c );
		tmp.fromBufferAttribute( p, i ).sub( c ).normalize().multiplyScalar( radiusFn( t ) ).add( c );
		p.setXYZ( i, tmp.x, tmp.y, tmp.z );

	}

	tube.computeVertexNormals();
	return tube;

}

export function swanGeometry() {

	const b = new PartBuilder();
	// boat-shaped body: round breast, folded wings arching the back, tail swept up
	const body = ( t ) => {

		const e = Math.max( 0, 1 - Math.pow( ( t - 0.5 ) / 0.5, 2 ) );
		const se = Math.sqrt( e );
		const arch = Math.exp( - Math.pow( ( t - 0.45 ) / 0.28, 2 ) );
		return {
			z: - 0.74 + t * 1.3,
			w: 0.34 * se * ( 0.45 + 0.55 * smooth( 0.0, 0.42, t ) ) + 1e-4,
			top: se * ( 0.17 + 0.1 * arch ) + 1e-4,
			bot: se * 0.15 + 1e-4,
			cy: 0.07 + 0.2 * Math.pow( 1 - t, 3 ),
			n: 2.4,
		};

	};

	b.add( loft( body, 36, 26 ), ( x, y ) => ( y < 0.02 ? '#cfccc4' : '#eeece6' ), null, 0, MAT.FEATHER );
	// folded wings over each flank, the trailing edge split into primary tips
	const tips = ( u ) => 0.7 + 0.3 * smooth( 0.0, 0.3, u ) - ( u < 0.32 ? 0.2 * Math.abs( Math.sin( u * 62 ) ) : 0 );
	b.add( shell( body, 0.08, 0.8, 0.3, - 0.08, 1.045, tips, 30, 10 ), '#f3f1eb', null, 0, MAT.FEATHER );
	b.add( shell( body, 0.08, 0.8, Math.PI - 0.3, Math.PI + 0.08, 1.045, tips, 30, 10 ), '#f3f1eb', null, 0, MAT.FEATHER );

	// S-curved neck, thick where it meets the breast
	const curve = new THREE.CatmullRomCurve3( [
		new THREE.Vector3( 0, 0.14, 0.44 ), new THREE.Vector3( 0, 0.36, 0.62 ), new THREE.Vector3( 0, 0.6, 0.6 ),
		new THREE.Vector3( 0, 0.8, 0.46 ), new THREE.Vector3( 0, 0.95, 0.46 ),
	] );
	b.add( taperedTube( curve, ( t ) => THREE.MathUtils.lerp( 0.095, 0.042, Math.pow( t, 0.55 ) ) ), '#efede7', null, 0, MAT.FEATHER );
	// head: rounded crown sloping to the bill, black lores
	const head = loft( ( t ) => {

		const e = Math.max( 0, 1 - Math.pow( ( t - 0.45 ) / 0.55, 2 ) );
		const se = Math.sqrt( e );
		return { z: 0.41 + t * 0.2, w: 0.046 * se + 1e-4, top: 0.05 * se * ( 1 - 0.3 * t ) + 1e-4, bot: 0.036 * se + 1e-4, cy: 0.965 - t * 0.03, n: 2.2 };

	}, 18, 16 );
	b.add( head, ( x, y, z ) => ( z > 0.565 && y < 0.975 ? '#141414' : '#f1efe9' ), null, 0, MAT.FEATHER );
	// orange bill with a black nail, black knob at its base
	const bill = loft( ( t ) => {

		const k = 1 - t * 0.75;
		return { z: 0.58 + t * 0.12, w: 0.028 * k + 1e-4, top: 0.022 * k + 1e-4, bot: 0.012 * k + 1e-4, cy: 0.945 - t * 0.035, n: 2.6 };

	}, 12, 12 );
	b.add( bill, ( x, y, z ) => ( z > 0.685 ? '#1a1410' : '#d8561a' ), null, 0, MAT.BILL );
	b.add( new THREE.SphereGeometry( 1, 10, 8 ), '#101010', M( ( m ) => m.makeScale( 0.018, 0.022, 0.024 ).setPosition( 0, 0.972, 0.595 ) ), 0, MAT.BILL );
	for ( const sd of [ - 1, 1 ] ) b.add( new THREE.SphereGeometry( 0.008, 8, 6 ), '#050505', M( ( m ) => m.makeTranslation( 0.04 * sd, 0.972, 0.55 ) ), 0, MAT.BILL );
	return b.build();

}

export function mallardGeometry( drake ) {

	const b = new PartBuilder();
	const body = ( t ) => {

		const e = Math.max( 0, 1 - Math.pow( ( t - 0.5 ) / 0.5, 2 ) );
		const se = Math.sqrt( e );
		return { z: - 0.31 + t * 0.6, w: 0.14 * se * ( 0.55 + 0.45 * smooth( 0, 0.4, t ) ) + 1e-4, top: se * 0.1 + 1e-4, bot: se * 0.075 + 1e-4, cy: 0.045 + 0.09 * Math.pow( 1 - t, 3 ), n: 2.3 };

	};

	const bodyCol = drake
		? ( x, y, z ) => ( z > 0.14 ? '#5a3324' : ( z < - 0.22 ? ( y > 0.1 ? '#111111' : '#e8e6e0' ) : ( y > 0.08 ? '#6f6a60' : '#a5a198' ) ) )
		: ( x, y ) => ( y > 0.07 ? '#6b4f33' : '#8a6a47' );
	b.add( loft( body, 26, 20 ), bodyCol, null, 0, MAT.FEATHER );
	const edge = ( u ) => 0.75 + 0.25 * smooth( 0, 0.3, u );
	b.add( shell( body, 0.12, 0.75, 0.35, 0.0, 1.05, edge, 14, 6 ), drake ? '#5d574d' : '#5e452d', null, 0, MAT.FEATHER );
	b.add( shell( body, 0.12, 0.75, Math.PI - 0.35, Math.PI, 1.05, edge, 14, 6 ), drake ? '#5d574d' : '#5e452d', null, 0, MAT.FEATHER );
	// the iridescent blue speculum
	for ( const side of [ - 1, 1 ] ) b.add( new THREE.BoxGeometry( 0.004, 0.022, 0.07 ), '#2a3f9a', M( ( m ) => m.makeTranslation( side * 0.128, 0.105, - 0.12 ) ), 0, MAT.SCALES );
	if ( drake ) {

		const curl = new THREE.TorusGeometry( 0.025, 0.006, 6, 10, Math.PI * 1.3 );
		b.add( curl, '#0e0e0e', M( ( m ) => m.makeRotationY( Math.PI / 2 ).setPosition( 0, 0.16, - 0.26 ) ), 0, MAT.FEATHER );

	}

	const head = loft( ( t ) => {

		const se = Math.sqrt( Math.max( 0, 1 - Math.pow( ( t - 0.5 ) / 0.5, 2 ) ) );
		return { z: 0.14 + t * 0.14, w: 0.045 * se + 1e-4, top: 0.05 * se + 1e-4, bot: 0.045 * se + 1e-4, cy: 0.2, n: 2.1 };

	}, 14, 14 );
	b.add( head, drake ? '#0d4a2c' : '#6f5237', null, 0, drake ? MAT.SCALES : MAT.FEATHER );
	if ( ! drake ) b.add( new THREE.BoxGeometry( 0.092, 0.008, 0.05 ), '#2d2016', M( ( m ) => m.makeTranslation( 0, 0.205, 0.235 ) ), 0, MAT.FEATHER );
	b.add( new THREE.CylinderGeometry( 0.042, 0.055, 0.12, 12 ), drake ? '#0d4a2c' : '#6b4f33', M( ( m ) => m.makeRotationX( 0.35 ).setPosition( 0, 0.14, 0.16 ) ), 0, MAT.FEATHER );
	if ( drake ) b.add( new THREE.CylinderGeometry( 0.05, 0.052, 0.012, 12 ), '#f2f2ee', M( ( m ) => m.makeRotationX( 0.35 ).setPosition( 0, 0.115, 0.15 ) ), 0, MAT.FEATHER );
	const bill = loft( ( t ) => ( { z: 0.26 + t * 0.07, w: 0.022 * ( 1 - t * 0.2 ) + 1e-4, top: 0.012 * ( 1 - t * 0.5 ) + 1e-4, bot: 0.006 + 1e-4, cy: 0.19 - t * 0.012, n: 3 } ), 8, 10 );
	b.add( bill, drake ? '#c9b43a' : '#b8742a', null, 0, MAT.BILL );
	for ( const sd of [ - 1, 1 ] ) b.add( new THREE.SphereGeometry( 0.006, 6, 4 ), '#050505', M( ( m ) => m.makeTranslation( 0.038 * sd, 0.215, 0.235 ) ), 0, MAT.BILL );
	return b.build();

}
