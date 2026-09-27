import * as THREE from 'three';
import { Kit, M, mixc } from './kit.js';

// A forestry deer fence (Wildschutzzaun), the kind run round young plantings in Alpine woods:
// peeled larch posts every four metres, a strained wire along the top and the bottom, and between
// them knotted wire mesh two metres high, galvanised and gone dull - finer toward the ground,
// where the hares come. Too high to climb, and you see through it.
// heightAt( x, z ): the ground (world); pts: [ [ x, z ], ... ] (world).
// Returns { geometry (posts and wires), mesh (the wire mesh panels, uv in metres / 0.3), length }

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );

export function deerFence( heightAt, pts, { spacing = 4, h = 1.95, seed = 7 } = {} ) {

	let s = seed;
	const R = () => ( ( s = Math.imul( s ^ ( s >>> 15 ), 2246822507 ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 4294967296;
	const k = new Kit( heightAt );
	// posts along the line, a post at every corner
	const posts = [];
	for ( let i = 0; i < pts.length - 1; i ++ ) {

		const [ ax, az ] = pts[ i ], [ bx, bz ] = pts[ i + 1 ];
		const len = Math.hypot( bx - ax, bz - az ), n = Math.max( 1, Math.round( len / spacing ) );
		for ( let j = 0; j < n; j ++ ) posts.push( [ ax + ( bx - ax ) * j / n, az + ( bz - az ) * j / n ] );

	}

	posts.push( pts[ pts.length - 1 ] );
	const tops = [], bots = [];
	let length = 0;
	for ( const [ i, [ x, z ] ] of posts.entries() ) {

		const g = heightAt( x, z );
		const lean = [ ( R() - 0.5 ) * 0.06, ( R() - 0.5 ) * 0.06 ];
		const top = V( x + lean[ 0 ], g + h + 0.12, z + lean[ 1 ] );
		k.pole( V( x, g - 0.4, z ), top, 0.055 + R() * 0.015, M.LOG, mixc( '#7a6c5a', '#8e8270', R() ), i );
		tops.push( V( x + lean[ 0 ] * 0.95, g + h, z + lean[ 1 ] * 0.95 ) );
		bots.push( V( x, g + 0.06, z ) );
		if ( i ) length += Math.hypot( x - posts[ i - 1 ][ 0 ], z - posts[ i - 1 ][ 1 ] );
		// a strut against the pull at the corners and every so often
		if ( i === 0 || i === posts.length - 1 || i % 12 === 0 ) {

			const [ px, pz ] = posts[ Math.max( 0, i - 1 ) === i ? i + 1 : i - 1 ];
			const dx = px - x, dz = pz - z, dl = Math.hypot( dx, dz ) || 1;
			k.pole( V( x + dx / dl * 1.4, heightAt( x + dx / dl * 1.4, z + dz / dl * 1.4 ) - 0.1, z + dz / dl * 1.4 ), V( x, g + 1.3, z ), 0.045, M.LOG, mixc( '#7a6c5a', '#8e8270', R() ), i + 99 );

		}

	}

	// the top and bottom wires, strained post to post, sagging a little
	for ( let i = 0; i < tops.length - 1; i ++ ) for ( const [ a, b, sag ] of [ [ tops[ i ], tops[ i + 1 ], 0.03 ], [ bots[ i ], bots[ i + 1 ], 0.0 ] ] ) {

		const m = a.clone().lerp( b, 0.5 ).add( V( 0, - sag, 0 ) );
		k.pole( a, m, 0.006, M.IRON, '#8a8e8c', 0 );
		k.pole( m, b, 0.006, M.IRON, '#8a8e8c', 0 );

	}

	// the mesh: a strip between the wires, uv in metres (the texture repeats every 0.3 m)
	const pos = [], uv = [], idx = [];
	let u = 0;
	for ( let i = 0; i < tops.length; i ++ ) {

		if ( i ) u += Math.hypot( tops[ i ].x - tops[ i - 1 ].x, tops[ i ].z - tops[ i - 1 ].z );
		pos.push( bots[ i ].x, bots[ i ].y, bots[ i ].z, tops[ i ].x, tops[ i ].y, tops[ i ].z );
		uv.push( u / 0.3, 0, u / 0.3, ( tops[ i ].y - bots[ i ].y ) / 0.3 );
		if ( i ) {

			const a = ( i - 1 ) * 2, b = i * 2;
			idx.push( a, b, a + 1, b, b + 1, a + 1 );

		}

	}

	const mesh = new THREE.BufferGeometry();
	mesh.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	mesh.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	mesh.setIndex( idx );
	mesh.computeVertexNormals();
	return { geometry: k.build(), mesh, length, posts };

}

// the knotted mesh, a tile 0.3 m square: vertical wires every 0.15 m, horizontal ones closer
// toward the bottom of the fence (the texture's v runs up the fence; one tile of the lowest
// metre is drawn finer by the shader-free trick of a denser tile - here, simply every 0.075 m)
let _meshTex = null;
export function wireMeshTexture() {

	if ( _meshTex ) return _meshTex;
	const c = document.createElement( 'canvas' );
	c.width = c.height = 128;
	const g = c.getContext( '2d' );
	g.clearRect( 0, 0, 128, 128 );
	g.strokeStyle = 'rgba(150,154,150,1)';
	g.lineWidth = 3;
	for ( const x of [ 1.5, 65.5 ] ) { g.beginPath(); g.moveTo( x, 0 ); g.lineTo( x, 128 ); g.stroke(); }
	for ( const y of [ 1.5, 33.5, 65.5, 97.5 ] ) { g.beginPath(); g.moveTo( 0, y ); g.lineTo( 128, y ); g.stroke(); }
	// the knots, where the wires cross
	g.fillStyle = 'rgba(130,134,130,1)';
	for ( const x of [ 1.5, 65.5 ] ) for ( const y of [ 1.5, 33.5, 65.5, 97.5 ] ) g.fillRect( x - 3, y - 3, 6, 6 );
	_meshTex = new THREE.CanvasTexture( c );
	_meshTex.wrapS = _meshTex.wrapT = THREE.RepeatWrapping;
	_meshTex.colorSpace = THREE.SRGBColorSpace;
	_meshTex.anisotropy = 4;
	return _meshTex;

}
