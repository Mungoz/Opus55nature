import * as THREE from 'three';
import { Kit, M, col, mixc } from './kit.js';
import { beam, bolt } from './jetty.js';

// The footbridge over the pool, after the larch-wood footbridges of the Engadin (the one over
// the Clemgia at S-charl, shots/refs/bridge): two squared stringers resting on dry-stone
// abutments, a deck of planks laid across them, a handrail of round poles on posts, and on each
// side a strut frame (a Sprengwerk) - two tall posts near mid-span, each braced by a long
// raking strut down to the foot of its abutment - with iron straps and bolts at the joints.
// Frame: origin on the stream's centreline at the water surface, +z across the stream from the
// south bank to the north, +x downstream. ground( x, z ): terrain height in that frame.
const V = ( x, y, z ) => new THREE.Vector3( x, y, z );

function rand( seed ) {

	let s = seed >>> 0;
	return () => ( ( s = Math.imul( s ^ ( s >>> 15 ), 2246822507 ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 4294967296;

}

// water half-width w; the deck from -len/2 to len/2
export function buildBridge( ground, { w = 4, len = 13, seed = 21 } = {} ) {

	const R = rand( seed );
	const k = new Kit( ground, ( x, y, z, ny ) => ( ny < - 0.5 ? 0.55 : 1 ) * ( 0.55 + 0.45 * THREE.MathUtils.smoothstep( y - ground( x, z ), - 0.05, 0.6 ) ) );
	const wood = () => mixc( '#6b6155', '#83786a', R() ).multiplyScalar( 0.9 + 0.2 * R() );
	const plankC = () => mixc( '#7a7064', '#958a7b', R() ).multiplyScalar( 0.88 + 0.24 * R() );
	const iron = col( '#35302b' );
	const half = len / 2;
	// the abutments' faces a little back from the water's edge on each bank
	const faceA = - ( w + 0.6 ), faceB = w + 0.6;
	const bankA = Math.max( ground( 0, faceA - 1.2 ), ground( 0, faceA - 2.5 ) ), bankB = Math.max( ground( 0, faceB + 1.2 ), ground( 0, faceB + 2.5 ) );
	const deckY = Math.max( bankA, bankB, 0.55 ) + 0.42;
	const info = { deckY, half, faceA, faceB };
	const DW = 1.35; // deck width
	const sx = DW / 2 - 0.14; // stringer centres

	// --- abutments: rubble walls from the stream bed up to the stringers, wing walls back into
	// the banks, capped with a timber sill
	for ( const [ face, sgn ] of [ [ faceA, - 1 ], [ faceB, 1 ] ] ) {

		const back = face + sgn * 1.6, zc = ( face + back ) / 2;
		const bed = Math.min( ground( 0, face ), ground( 0, face - sgn * 0.8 ) ) - 0.4;
		const top = deckY - 0.36;
		k.box( 0, ( bed + top ) / 2, zc, DW + 0.9, top - bed, 1.6, M.RUBBLE, '#8a857b' );
		// wing walls, splayed, stepping down into the bank
		for ( const xs of [ - 1, 1 ] ) {

			const g0 = ground( xs * ( DW / 2 + 0.9 ), zc );
			k.box( xs * ( DW / 2 + 0.7 ), ( Math.min( g0, bed + 0.3 ) + top - 0.15 ) / 2, zc + sgn * 0.3, 0.55, top - 0.15 - Math.min( g0, bed + 0.3 ), 2.1, M.RUBBLE, '#858075', { rot: [ 0, xs * sgn * 0.28, 0 ] } );

		}

		// a squared sill across the wall top, the stringers bedded on it
		k.box( 0, top + 0.08, face + sgn * 0.45, DW + 0.5, 0.16, 0.26, M.LOG, wood(), { axis: [ 1, 0, 0 ], round: 0.02 } );
		// boulders set against the foot of the wall where the water scours
		for ( let i = 0; i < 7; i ++ ) {

			const x = ( R() - 0.5 ) * ( DW + 2.4 ), z = face - sgn * ( 0.2 + R() * 0.8 );
			const s = 0.22 + R() * 0.3;
			k.stone( x, Math.min( ground( x, z ), 0.05 ) - s * 0.3, z, s * 1.2, s * 0.8, s, mixc( '#8e897f', '#6f685e', R() ), R() * 40 );

		}

		info[ sgn < 0 ? 'bankA' : 'bankB' ] = Math.max( ground( 0, back ), ground( 0, back + sgn * 0.8 ) );

	}

	// --- the stringers: two squared larch baulks, adze-dressed, a little crooked
	for ( const x of [ - sx, sx ] ) beam( k, V( x, deckY - 0.2, - half + 0.25 ), V( x + ( R() - 0.5 ) * 0.03, deckY - 0.2, half - 0.25 ), 0.24, 0.3, M.LOG, wood().multiplyScalar( 0.85 ), { round: 0.03 } );
	// cross beams under the stringers at the posts, where the struts carry them
	const postZ = [ - 1.25, 1.25 ];
	for ( const z of postZ ) k.box( 0, deckY - 0.43, z, DW + 0.75, 0.2, 0.22, M.LOG, wood(), { axis: [ 1, 0, 0 ], round: 0.02 } );

	// --- deck planks across, butted, each a little different; one newer, one cupped
	{

		let z = - half;
		while ( z < half ) {

			const pw = 0.2 + R() * 0.07, t = 0.05;
			const c = R() < 0.06 ? mixc( '#8a6c50', '#a0826a', R() ) : plankC();
			const g = new THREE.BoxGeometry( DW + ( R() - 0.5 ) * 0.06, t, pw - 0.012 );
			g.rotateY( ( R() - 0.5 ) * 0.02 );
			g.rotateZ( R() < 0.08 ? ( R() - 0.5 ) * 0.03 : 0 );
			const cz = z + pw / 2, cx = ( R() - 0.5 ) * 0.03;
			g.translate( cx, deckY - t / 2 + ( R() - 0.5 ) * 0.006, cz );
			// the deck-plank shading (DECK) wants the plank's centre and width
			const p = g.getAttribute( 'position' ), cen = new Float32Array( p.count * 3 );
			for ( let i = 0; i < p.count; i ++ ) cen.set( [ cx, pw, cz ], i * 3 );
			g.setAttribute( 'aCenter', new THREE.BufferAttribute( cen, 3 ) );
			k.add( g, M.DECK, c, [ 1, 0, 0 ] );
			z += pw;

		}

	}

	// kerb logs along both edges of the deck, spiked down
	for ( const xs of [ - 1, 1 ] ) k.pole( V( xs * ( DW / 2 - 0.05 ), deckY + 0.05, - half + 0.1 ), V( xs * ( DW / 2 - 0.05 ), deckY + 0.05, half - 0.1 ), 0.06, M.BARK, wood().multiplyScalar( 0.8 ), xs * 3 );

	// --- handrails: posts on the stringers' outer faces, a top rail and a mid rail of poles
	const railX = DW / 2 + 0.07;
	for ( const xs of [ - 1, 1 ] ) {

		const posts = [];
		const n = Math.max( 3, Math.round( len / 2.2 ) );
		for ( let i = 0; i <= n; i ++ ) {

			const z = - half + 0.25 + ( len - 0.5 ) * i / n;
			if ( postZ.some( ( pz ) => Math.abs( pz - z ) < 0.5 ) ) continue;
			posts.push( z );
			k.pole( V( xs * railX, deckY - 0.42, z ), V( xs * railX + ( R() - 0.5 ) * 0.03, deckY + 1.02, z + ( R() - 0.5 ) * 0.03 ), 0.055, M.LOG, wood(), i + xs * 7 );
			bolt( k, V( xs * ( railX + 0.05 ), deckY - 0.22, z ), V( xs, 0, 0 ), 0.014 );

		}

		for ( const [ y, r ] of [ [ 1.0, 0.05 ], [ 0.52, 0.04 ] ] ) k.pole( V( xs * ( railX + 0.03 ), deckY + y, - half + 0.15 ), V( xs * ( railX + 0.03 ), deckY + y + ( R() - 0.5 ) * 0.04, half - 0.15 ), r, M.LOG, wood().multiplyScalar( 1.05 ), y * 10 + xs );

		// --- the strut frame: two tall posts, each braced down to its abutment's foot
		for ( const z of postZ ) {

			const top = deckY + 1.75;
			const base = V( xs * ( railX + 0.02 ), deckY - 0.55, z );
			const head = V( xs * ( railX + 0.02 ), top, z + ( R() - 0.5 ) * 0.02 );
			beam( k, base, head, 0.17, 0.17, M.LOG, wood(), { round: 0.02 } );
			const foot = V( xs * ( railX + 0.12 ), ( z < 0 ? info.bankA : info.bankB ) - 0.35, Math.sign( z ) * ( Math.abs( z < 0 ? faceA : faceB ) + 0.2 ) );
			const strutTop = head.clone().add( V( xs * 0.13, - 0.25, 0 ) );
			beam( k, foot, strutTop, 0.16, 0.16, M.LOG, wood().multiplyScalar( 0.92 ), { up: V( xs, 0, 0 ), round: 0.02 } );
			// iron straps round the joints, bolted
			k.box( xs * ( railX + 0.02 ), top - 0.3, z, 0.2, 0.06, 0.2, M.IRON, iron );
			k.box( xs * ( railX + 0.02 ), deckY - 0.28, z, 0.2, 0.06, 0.2, M.IRON, iron );
			bolt( k, V( xs * ( railX + 0.115 ), top - 0.3, z ), V( xs, 0, 0 ), 0.016 );
			bolt( k, V( xs * ( railX + 0.115 ), deckY - 0.28, z ), V( xs, 0, 0 ), 0.016 );

		}

		// the two post heads tied together by a cap along the rail
		k.box( xs * ( railX + 0.02 ), deckY + 1.74, 0, 0.14, 0.14, postZ[ 1 ] - postZ[ 0 ] + 0.3, M.LOG, wood(), { axis: [ 0, 0, 1 ], round: 0.02 } );

	}

	// moss and grass creeping onto the sills and the ends of the deck is the shader's job; the
	// kit's AO darkens the underside
	return { geometry: k.build(), info };

}
