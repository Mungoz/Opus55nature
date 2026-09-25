import * as THREE from 'three';
import { ATLAS, atlasRect } from '../gen/foliageAtlas.js';

// Species / surface codes stored per vertex (aInfo.x)
export const KIND = { SPRUCE_BARK: 0, LARCH_BARK: 1, BIRCH_BARK: 2, SPRUCE_LEAF: 3, LARCH_LEAF: 4, BIRCH_LEAF: 5, SHRUB_LEAF: 6 };

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

class Builder {

	constructor() {

		this.pos = [];
		this.nrm = [];
		this.uv = [];
		this.bark = [];
		this.info = [];
		this.wind = [];
		this.idx = [];

	}

	get count() { return this.pos.length / 3; }

	vert( p, n, u, v, bu, bv, kind, ao, phase, hFrac, flex ) {

		this.pos.push( p.x, p.y, p.z );
		this.nrm.push( n.x, n.y, n.z );
		this.uv.push( u, v );
		this.bark.push( bu, bv );
		this.info.push( kind, ao, phase );
		this.wind.push( hFrac, flex );
		return this.count - 1;

	}

	quad( a, b, c, d ) {

		this.idx.push( a, b, c, b, d, c );

	}

	build() {

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new THREE.Float32BufferAttribute( this.nrm, 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( this.uv, 2 ) );
		g.setAttribute( 'aBark', new THREE.Float32BufferAttribute( this.bark, 2 ) );
		g.setAttribute( 'aInfo', new THREE.Float32BufferAttribute( this.info, 3 ) );
		g.setAttribute( 'aWind', new THREE.Float32BufferAttribute( this.wind, 2 ) );
		g.setIndex( this.idx );
		g.computeBoundingBox();
		g.computeBoundingSphere();
		return g;

	}

}

// A tapered tube along a polyline of { p, r } nodes with parallel-transport frames.
function tube( B, nodes, radial, kind, treeH, barkScale = 1, flexBase = 0 ) {

	const solid = atlasRect( ATLAS.solid );
	const su = ( solid.u0 + solid.u1 ) / 2, sv = ( solid.v0 + solid.v1 ) / 2;
	let normal = new THREE.Vector3( 1, 0, 0 );
	const tangent = new THREE.Vector3();
	const binormal = new THREE.Vector3();
	let prevT = null;
	const rings = [];
	let along = 0;
	for ( let i = 0; i < nodes.length; i ++ ) {

		const cur = nodes[ i ].p;
		const next = nodes[ Math.min( i + 1, nodes.length - 1 ) ].p;
		const prev = nodes[ Math.max( i - 1, 0 ) ].p;
		tangent.subVectors( next, prev ).normalize();
		if ( prevT ) {

			// parallel transport the normal
			const axis = _a.crossVectors( prevT, tangent );
			const ang = Math.acos( THREE.MathUtils.clamp( prevT.dot( tangent ), - 1, 1 ) );
			if ( axis.lengthSq() > 1e-10 ) normal.applyAxisAngle( axis.normalize(), ang );

		} else {

			normal = Math.abs( tangent.y ) < 0.9 ? new THREE.Vector3( 0, 1, 0 ).cross( tangent ).normalize() : new THREE.Vector3( 1, 0, 0 );

		}

		prevT = tangent.clone();
		binormal.crossVectors( tangent, normal ).normalize();
		if ( i > 0 ) along += cur.distanceTo( prev );
		const ring = [];
		for ( let j = 0; j <= radial; j ++ ) {

			const a = j / radial * Math.PI * 2;
			_n.copy( normal ).multiplyScalar( Math.cos( a ) ).addScaledVector( binormal, Math.sin( a ) );
			_v.copy( cur ).addScaledVector( _n, nodes[ i ].r );
			const hFrac = THREE.MathUtils.clamp( _v.y / treeH, 0, 1 );
			const ao = THREE.MathUtils.clamp( 0.55 + _v.y * 0.25, 0.55, 1 );
			const flex = flexBase + ( nodes[ i ].flex ?? 0 );
			ring.push( B.vert( _v, _n, su, sv, j / radial * barkScale, along, kind, ao, 0, hFrac, flex ) );

		}

		rings.push( ring );

	}

	for ( let i = 0; i < rings.length - 1; i ++ ) {

		for ( let j = 0; j < radial; j ++ ) B.quad( rings[ i ][ j ], rings[ i ][ j + 1 ], rings[ i + 1 ][ j ], rings[ i + 1 ][ j + 1 ] );

	}

}

// A bent foliage card following a branch.
function card( B, o, dir, side, len, width, droop, upturn, rect, kind, treeH, crownR, aoIn, aoOut, phase, segs = 4, widthCurve = ( s ) => 0.35 + 0.65 * Math.sin( Math.PI * Math.min( 1, s * 0.9 + 0.1 ) ) ) {

	const cardN = _b.crossVectors( side, dir ).normalize().clone();
	if ( cardN.y < 0 ) cardN.negate();
	const rows = [];
	for ( let i = 0; i <= segs; i ++ ) {

		const s = i / segs;
		const c = o.clone().addScaledVector( dir, s * len );
		c.y += len * ( - droop * s * s + upturn * s * s * s );
		const w = width * widthCurve( s ) * 0.5;
		const row = [];
		for ( const j of [ - 1, 0, 1 ] ) {

			// sprays are arched: the centre line rides above the edges
			const p = c.clone().addScaledVector( side, j * w ).addScaledVector( cardN, j === 0 ? w * 0.28 : 0 );
			// crown-shaped normal: outward from the stem axis, tilted upward
			const rad = _n.set( p.x, 0, p.z );
			const rl = rad.length();
			const crownN = rad.normalize().multiplyScalar( Math.min( 1, rl / Math.max( crownR * 0.4, 0.3 ) ) );
			crownN.y = 0.45 + ( 1 - Math.min( 1, rl / Math.max( crownR, 0.5 ) ) ) * 0.4;
			crownN.normalize();
			const nn = crownN.multiplyScalar( 0.88 ).addScaledVector( cardN, 0.12 ).normalize();
			const u = THREE.MathUtils.lerp( rect.u0, rect.u1, s );
			const v = j < 0 ? rect.v0 : ( j > 0 ? rect.v1 : ( rect.v0 + rect.v1 ) * 0.5 );
			const ao = THREE.MathUtils.lerp( aoIn, aoOut, Math.pow( s, 0.7 ) );
			row.push( B.vert( p, nn, u, v, 0, 0, kind, ao, phase, THREE.MathUtils.clamp( p.y / treeH, 0, 1 ), s ) );

		}

		rows.push( row );

	}

	for ( let i = 0; i < segs; i ++ ) {

		B.quad( rows[ i ][ 0 ], rows[ i ][ 1 ], rows[ i + 1 ][ 0 ], rows[ i + 1 ][ 1 ] );
		B.quad( rows[ i ][ 1 ], rows[ i ][ 2 ], rows[ i + 1 ][ 1 ], rows[ i + 1 ][ 2 ] );

	}

}

// A square leaf-cluster card, centred at c, facing roughly `face`.
function leafCard( B, c, face, size, rect, kind, treeH, ao, phase, rng ) {

	const up = Math.abs( face.y ) > 0.95 ? new THREE.Vector3( 1, 0, 0 ) : new THREE.Vector3( 0, 1, 0 );
	const right = new THREE.Vector3().crossVectors( up, face ).normalize();
	const upv = new THREE.Vector3().crossVectors( face, right ).normalize();
	const rot = ( rng.next() - 0.5 ) * 1.2;
	const r2 = right.clone().multiplyScalar( Math.cos( rot ) ).addScaledVector( upv, Math.sin( rot ) );
	const u2 = upv.clone().multiplyScalar( Math.cos( rot ) ).addScaledVector( right, - Math.sin( rot ) );
	const ids = [];
	for ( const [ sx, sy ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) {

		const p = c.clone().addScaledVector( r2, sx * size * 0.5 ).addScaledVector( u2, sy * size * 0.5 );
		const rad = _n.set( p.x, ( p.y - treeH * 0.65 ) * 0.8, p.z ).normalize();
		const nn = rad.multiplyScalar( 0.7 ).addScaledVector( face, 0.3 ).normalize();
		ids.push( B.vert( p, nn, sx < 0 ? rect.u0 : rect.u1, sy < 0 ? rect.v0 : rect.v1, 0, 0, kind, ao, phase, THREE.MathUtils.clamp( p.y / treeH, 0, 1 ), 0.6 + 0.4 * ( sy > 0 ? 1 : 0 ) ) );

	}

	B.quad( ids[ 0 ], ids[ 1 ], ids[ 2 ], ids[ 3 ] );

}

// ---------------------------------------------------------------------------

export function makeConifer( rng, species ) {

	const larch = species === 'larch';
	const B = new Builder();
	const H = larch ? rng.range( 19, 23 ) : rng.range( 21, 26 );
	const R = H * ( larch ? rng.range( 0.19, 0.23 ) : rng.range( 0.16, 0.19 ) );
	const crownBase = H * ( larch ? rng.range( 0.18, 0.3 ) : rng.range( 0.06, 0.16 ) );
	const r0 = H * ( larch ? 0.013 : 0.012 );
	const barkKind = larch ? KIND.LARCH_BARK : KIND.SPRUCE_BARK;
	const leafKind = larch ? KIND.LARCH_LEAF : KIND.SPRUCE_LEAF;
	const rect = atlasRect( larch ? ATLAS.larch : ATLAS.spruce );

	// trunk with a small lean and root flare
	const nodes = [];
	const lean = new THREE.Vector2( rng.range( - 1, 1 ), rng.range( - 1, 1 ) ).multiplyScalar( H * 0.012 );
	for ( let i = 0; i <= 12; i ++ ) {

		const t = i / 12;
		const y = t * H * 0.98 - 0.4;
		const flare = 1 + Math.max( 0, 1 - y / 0.9 ) * 0.5;
		nodes.push( { p: new THREE.Vector3( lean.x * t * t, y, lean.y * t * t ), r: Math.max( 0.02, r0 * ( 1 - t ) * flare ), flex: t * 0.05 } );

	}

	tube( B, nodes, 7, barkKind, H, 2 );

	// whorls of branch cards
	// branches spiral up the stem at scattered heights (no stacked rings)
	const perMetre = larch ? rng.range( 11, 13 ) : rng.range( 15, 17 );
	const count = Math.floor( ( H - 0.6 - crownBase ) * perMetre );
	let az = rng.next() * Math.PI * 2;
	let phase = 0;
	for ( let b = 0; b < count; b ++ ) {

		const y = crownBase + ( H - 0.6 - crownBase ) * Math.pow( ( b + rng.next() ) / count, 0.92 );
		const t = ( y - crownBase ) / ( H - crownBase );
		const envelope = R * Math.pow( 1 - t, larch ? 0.85 : 0.95 ) + 0.35;
		{

			az += 2.39996 + rng.range( - 0.35, 0.35 );
			const a = az;
			const len = envelope * rng.range( 0.65, 1.12 );
			const rise = larch ? rng.range( - 0.1, 0.25 ) : rng.range( - 0.2, 0.1 );
			const dir = new THREE.Vector3( Math.cos( a ), rise, Math.sin( a ) ).normalize();
			const side = new THREE.Vector3( - Math.sin( a ), 0, Math.cos( a ) );
			// roll the card around the branch for variety
			side.applyAxisAngle( dir, rng.range( - 0.75, 0.75 ) );
			const trunkR = r0 * ( 1 - y / H );
			const o = new THREE.Vector3( Math.cos( a ) * trunkR, y, Math.sin( a ) * trunkR ).add( new THREE.Vector3( lean.x * ( y / H ) ** 2, 0, lean.y * ( y / H ) ** 2 ) );
			const width = len * ( larch ? rng.range( 0.42, 0.55 ) : rng.range( 0.62, 0.78 ) ) + 0.25;
			const droop = larch ? rng.range( 0.35, 0.6 ) : rng.range( 0.18, 0.34 );
			const upturn = larch ? rng.range( 0.05, 0.15 ) : rng.range( 0.12, 0.24 );
			const aoIn = THREE.MathUtils.lerp( 0.3, 0.55, t );
			const aoOut = THREE.MathUtils.lerp( 0.72, 1.0, t );
			card( B, o, dir, side, len, width, droop, upturn, rect, leafKind, H, R, aoIn, aoOut, ( phase ++ * 0.618 ) % 1, 3 );

		}

	}

	// leader at the top
	for ( let k = 0; k < 2; k ++ ) {

		const a = k * Math.PI / 2 + rng.next();
		const dir = new THREE.Vector3( 0, 1, 0 );
		const side = new THREE.Vector3( Math.cos( a ), 0, Math.sin( a ) );
		card( B, new THREE.Vector3( lean.x, H - 1.6, lean.y ), dir, side, 2.0, 0.9, 0, 0, rect, leafKind, H, R, 0.8, 1, 0.5, 2 );

	}

	return { geometry: B.build(), height: H, radius: R + 0.4, species };

}

export function makeBirch( rng ) {

	const B = new Builder();
	const H = rng.range( 13, 17 );
	const stems = rng.next() < 0.35 ? 2 : 1;
	const leafRects = [ atlasRect( ATLAS.birchA ), atlasRect( ATLAS.birchB ) ];
	let phase = 0;
	const crownC = new THREE.Vector3( 0, H * 0.68, 0 );
	for ( let s = 0; s < stems; s ++ ) {

		const ang = rng.next() * Math.PI * 2;
		const tilt = stems > 1 ? rng.range( 0.08, 0.16 ) : rng.range( 0, 0.05 );
		const sh = H * ( s === 0 ? 1 : rng.range( 0.8, 0.92 ) );
		const r0 = sh * 0.012 + 0.04;
		const nodes = [];
		const bendA = rng.next() * Math.PI * 2;
		for ( let i = 0; i <= 10; i ++ ) {

			const t = i / 10;
			const y = t * sh - 0.3;
			const off = tilt * y + Math.sin( t * 3.0 + bendA ) * 0.25 * t;
			nodes.push( { p: new THREE.Vector3( Math.cos( ang ) * off, y, Math.sin( ang ) * off ), r: Math.max( 0.015, r0 * ( 1 - t * 0.85 ) * ( 1 + Math.max( 0, 1 - y / 0.6 ) * 0.4 ) ), flex: t * 0.1 } );

		}

		tube( B, nodes, 7, KIND.BIRCH_BARK, H, 2 );

		// main branches
		const nb = rng.int( 9, 13 );
		for ( let b = 0; b < nb; b ++ ) {

			const t = THREE.MathUtils.lerp( 0.32, 0.9, b / nb ) + rng.range( - 0.03, 0.03 );
			const base = nodes[ Math.floor( t * 10 ) ].p.clone().lerp( nodes[ Math.min( 10, Math.floor( t * 10 ) + 1 ) ].p, ( t * 10 ) % 1 );
			const a = b * 2.39996 + rng.next();
			const elev = THREE.MathUtils.lerp( 0.55, 1.05, t ) + rng.range( - 0.15, 0.15 );
			const L = sh * THREE.MathUtils.lerp( 0.34, 0.16, t ) * rng.range( 0.8, 1.2 );
			const dir = new THREE.Vector3( Math.cos( a ) * Math.cos( elev ), Math.sin( elev ), Math.sin( a ) * Math.cos( elev ) );
			const bn = [];
			const br = r0 * ( 1 - t ) * 0.55 + 0.012;
			for ( let i = 0; i <= 4; i ++ ) {

				const u = i / 4;
				const p = base.clone().addScaledVector( dir, u * L );
				p.y -= u * u * L * 0.28; // weeping tips
				bn.push( { p, r: br * ( 1 - u * 0.8 ), flex: 0.2 + u * 0.5 } );

			}

			tube( B, bn, 4, KIND.BIRCH_BARK, H, 1, 0 );
			// leaf clusters along the outer part of the branch
			const nl = Math.floor( L * 2.4 ) + 2;
			for ( let k = 0; k < nl; k ++ ) {

				const u = rng.range( 0.3, 1.05 );
				const p = base.clone().addScaledVector( dir, u * L );
				p.y -= u * u * L * 0.28 - rng.range( - 0.4, 0.4 );
				p.x += rng.range( - 0.5, 0.5 );
				p.z += rng.range( - 0.5, 0.5 );
				const face = p.clone().sub( crownC ).normalize();
				face.x += rng.range( - 0.5, 0.5 );
				face.z += rng.range( - 0.5, 0.5 );
				face.normalize();
				const ao = THREE.MathUtils.clamp( 0.5 + p.clone().sub( crownC ).length() / ( H * 0.35 ) * 0.5, 0.45, 1 );
				const size = rng.range( 1.5, 2.3 );
				leafCard( B, p, face, size, leafRects[ k & 1 ], KIND.BIRCH_LEAF, H, ao, ( phase ++ * 0.618 ) % 1, rng );
				// a crossed partner for volume
				const f2 = new THREE.Vector3( - face.z, rng.range( - 0.3, 0.3 ), face.x ).normalize();
				leafCard( B, p, f2, size * 0.85, leafRects[ ( k + 1 ) & 1 ], KIND.BIRCH_LEAF, H, ao * 0.9, ( phase ++ * 0.618 ) % 1, rng );

			}

		}

		// crown top clusters
		for ( let k = 0; k < 4; k ++ ) {

			const p = nodes[ 10 ].p.clone().add( new THREE.Vector3( rng.range( - 0.8, 0.8 ), rng.range( - 1.2, 0 ), rng.range( - 0.8, 0.8 ) ) );
			leafCard( B, p, new THREE.Vector3( rng.range( - 1, 1 ), 0.3, rng.range( - 1, 1 ) ).normalize(), 1.6, leafRects[ k & 1 ], KIND.BIRCH_LEAF, H, 1, ( phase ++ * 0.618 ) % 1, rng );

		}

	}

	return { geometry: B.build(), height: H, radius: H * 0.3, species: 'birch' };

}

export function makeShrub( rng ) {

	const B = new Builder();
	const H = rng.range( 1.2, 2.0 );
	const rect = atlasRect( ATLAS.shrub );
	let phase = 0;
	const n = rng.int( 16, 22 );
	for ( let k = 0; k < n; k ++ ) {

		const a = k * 2.39996 + rng.next() * 0.5;
		const el = rng.range( 0.15, 1.2 );
		const face = new THREE.Vector3( Math.cos( a ) * Math.cos( el ), Math.sin( el ), Math.sin( a ) * Math.cos( el ) ).normalize();
		const r = H * 0.45 * Math.cos( el );
		const c = new THREE.Vector3( Math.cos( a ) * r, H * ( 0.25 + 0.45 * Math.sin( el ) ), Math.sin( a ) * r );
		leafCard( B, c, face, H * rng.range( 0.55, 0.8 ), rect, KIND.SHRUB_LEAF, H, THREE.MathUtils.lerp( 0.5, 1, Math.sin( el ) ), ( phase ++ * 0.618 ) % 1, rng );

	}

	return { geometry: B.build(), height: H, radius: H * 0.8, species: 'shrub' };

}
