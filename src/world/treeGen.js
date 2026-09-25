import * as THREE from 'three';
import { ATLAS, atlasRect } from '../gen/foliageAtlas.js';

// Species / surface codes stored per vertex (aInfo.x)
// Bark and other opaque surfaces are < 2.5 (new ones negative), foliage cards > 2.5.
export const KIND = {
	SPRUCE_BARK: 0, LARCH_BARK: 1, BIRCH_BARK: 2, SPRUCE_LEAF: 3, LARCH_LEAF: 4, BIRCH_LEAF: 5, SHRUB_LEAF: 6,
	PINE_BARK: - 1, ASPEN_BARK: - 2, DEAD_WOOD: - 3, ROWAN_BARK: - 4, MUSH_STEM: - 5, AGARIC_CAP: - 6, BOLETE_CAP: - 7,
	STUMP_WOOD: - 8, END_GRAIN: - 10, LOG_WOOD: - 11,
	PINE_LEAF: 7, ASPEN_LEAF: 8, ROWAN_LEAF: 9, FERN_LEAF: 10, HEATH_LEAF: 11,
};

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

	build( smoothNormals = false ) {

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new THREE.Float32BufferAttribute( this.nrm, 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( this.uv, 2 ) );
		g.setAttribute( 'aBark', new THREE.Float32BufferAttribute( this.bark, 2 ) );
		g.setAttribute( 'aInfo', new THREE.Float32BufferAttribute( this.info, 3 ) );
		g.setAttribute( 'aWind', new THREE.Float32BufferAttribute( this.wind, 2 ) );
		g.setIndex( this.idx );
		if ( smoothNormals ) g.computeVertexNormals();
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
			_v.copy( cur ).addScaledVector( _n, nodes[ i ].r * ( nodes[ i ].lobe ? nodes[ i ].lobe( a ) : 1 ) );
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

// A flat disc facing along axis: a sawn or snapped end showing the grain.
// Bark coords carry (0, radius) so the rings can be drawn from them.
function disc( B, c, axis, r, n, kind ) {

	const solid = atlasRect( ATLAS.solid );
	const su = ( solid.u0 + solid.u1 ) / 2, sv = ( solid.v0 + solid.v1 ) / 2;
	const t1 = ( Math.abs( axis.y ) < 0.9 ? new THREE.Vector3( 0, 1, 0 ) : new THREE.Vector3( 1, 0, 0 ) ).cross( axis ).normalize();
	const t2 = axis.clone().cross( t1 ).normalize();
	const ci = B.vert( c, axis, su, sv, 0, 0, kind, 0.85, 0, 0, 0 );
	const ring = [];
	for ( let j = 0; j <= n; j ++ ) {

		const a = j / n * Math.PI * 2;
		const p = c.clone().addScaledVector( t1, Math.cos( a ) * r ).addScaledVector( t2, Math.sin( a ) * r );
		ring.push( B.vert( p, axis, su, sv, 0, r, kind, 0.75, 0, 0, 0 ) );

	}

	for ( let j = 0; j < n; j ++ ) B.idx.push( ci, ring[ j ], ring[ j + 1 ] );

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
function leafCard( B, c, face, size, rect, kind, treeH, ao, phase, rng, roll = 1.2 ) {

	const up = Math.abs( face.y ) > 0.95 ? new THREE.Vector3( 1, 0, 0 ) : new THREE.Vector3( 0, 1, 0 );
	const right = new THREE.Vector3().crossVectors( up, face ).normalize();
	const upv = new THREE.Vector3().crossVectors( face, right ).normalize();
	const rot = ( rng.next() - 0.5 ) * roll;
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
	// Swiss stone pine: shorter and stouter, a dense dome of upswept brushes
	const pine = species === 'pine';
	const B = new Builder();
	const H = larch ? rng.range( 19, 23 ) : pine ? rng.range( 12, 17 ) : rng.range( 21, 26 );
	const R = H * ( larch ? rng.range( 0.19, 0.23 ) : pine ? rng.range( 0.25, 0.31 ) : rng.range( 0.16, 0.19 ) );
	const crownBase = H * ( larch ? rng.range( 0.18, 0.3 ) : pine ? rng.range( 0.1, 0.22 ) : rng.range( 0.06, 0.16 ) );
	const r0 = H * ( larch ? 0.013 : pine ? 0.02 : 0.012 );
	const barkKind = larch ? KIND.LARCH_BARK : pine ? KIND.PINE_BARK : KIND.SPRUCE_BARK;
	const leafKind = larch ? KIND.LARCH_LEAF : pine ? KIND.PINE_LEAF : KIND.SPRUCE_LEAF;
	const rect = atlasRect( larch ? ATLAS.larch : pine ? ATLAS.pine : ATLAS.spruce );

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
	const perMetre = larch ? rng.range( 11, 13 ) : pine ? rng.range( 8, 10 ) : rng.range( 15, 17 );
	const count = Math.floor( ( H - 0.6 - crownBase ) * perMetre );
	let az = rng.next() * Math.PI * 2;
	let phase = 0;
	for ( let b = 0; b < count; b ++ ) {

		const y = crownBase + ( H - 0.6 - crownBase ) * Math.pow( ( b + rng.next() ) / count, 0.92 );
		const t = ( y - crownBase ) / ( H - crownBase );
		const envelope = pine ? R * Math.pow( Math.sin( Math.PI * Math.min( 1, 0.14 + t * 0.9 ) ), 0.5 ) + 0.35 : R * Math.pow( 1 - t, larch ? 0.85 : 0.95 ) + 0.35;
		{

			az += 2.39996 + rng.range( - 0.35, 0.35 );
			const a = az;
			const len = envelope * rng.range( 0.65, 1.12 );
			const rise = larch ? rng.range( - 0.1, 0.25 ) : pine ? rng.range( 0.05, 0.5 ) : rng.range( - 0.2, 0.1 );
			const dir = new THREE.Vector3( Math.cos( a ), rise, Math.sin( a ) ).normalize();
			const side = new THREE.Vector3( - Math.sin( a ), 0, Math.cos( a ) );
			// roll the card around the branch for variety
			side.applyAxisAngle( dir, rng.range( - 0.75, 0.75 ) );
			const trunkR = r0 * ( 1 - y / H );
			const o = new THREE.Vector3( Math.cos( a ) * trunkR, y, Math.sin( a ) * trunkR ).add( new THREE.Vector3( lean.x * ( y / H ) ** 2, 0, lean.y * ( y / H ) ** 2 ) );
			const width = len * ( larch ? rng.range( 0.42, 0.55 ) : pine ? rng.range( 0.7, 0.9 ) : rng.range( 0.62, 0.78 ) ) + 0.25;
			const droop = larch ? rng.range( 0.35, 0.6 ) : pine ? rng.range( 0.02, 0.14 ) : rng.range( 0.18, 0.34 );
			const upturn = larch ? rng.range( 0.05, 0.15 ) : pine ? rng.range( 0.25, 0.45 ) : rng.range( 0.12, 0.24 );
			const aoIn = THREE.MathUtils.lerp( 0.3, 0.55, t );
			const aoOut = THREE.MathUtils.lerp( 0.72, 1.0, t );
			card( B, o, dir, side, len, width, droop, upturn, rect, leafKind, H, R, aoIn, aoOut, ( phase ++ * 0.618 ) % 1, 3 );

		}

	}

	// leader at the top (stone pines often carry several)
	const tops = pine ? rng.int( 2, 4 ) : 1;
	for ( let m = 0; m < tops; m ++ ) {

		const off = m === 0 ? new THREE.Vector3() : new THREE.Vector3( rng.range( - 1, 1 ), rng.range( - 1.4, - 0.5 ), rng.range( - 1, 1 ) );
		for ( let k = 0; k < 2; k ++ ) {

			const a = k * Math.PI / 2 + rng.next();
			const dir = pine ? new THREE.Vector3( off.x * 0.3, 1, off.z * 0.3 ).normalize() : new THREE.Vector3( 0, 1, 0 );
			const side = new THREE.Vector3( Math.cos( a ), 0, Math.sin( a ) );
			card( B, new THREE.Vector3( lean.x + off.x, H - 1.6 + off.y, lean.y + off.z ), dir, side, 2.0, pine ? 1.6 : 0.9, 0, 0, rect, leafKind, H, R, 0.8, 1, 0.5, 2 );

		}

	}

	return { geometry: B.build(), height: H, radius: R + 0.4, species };

}

// Deciduous broadleaves share one builder: a few stems, main branches with leaf-cluster cards.
const BROADLEAF = {
	birch: {
		H: [ 13, 17 ], stems: ( rng ) => rng.next() < 0.35 ? 2 : 1, tilt: [ 0.08, 0.16 ], tilt1: [ 0, 0.05 ],
		bark: KIND.BIRCH_BARK, leaf: KIND.BIRCH_LEAF, rects: [ ATLAS.birchA, ATLAS.birchB ],
		branches: [ 9, 13 ], span: [ 0.32, 0.9 ], elev: [ 0.55, 1.05 ], len: [ 0.34, 0.16 ], weep: 0.28,
		density: 2.4, size: [ 1.5, 2.3 ], crownY: 0.68, radius: 0.3,
	},
	// aspen: one tall straight stem, a narrow crown held high, round trembling leaves
	aspen: {
		H: [ 16, 21 ], stems: () => 1, tilt: [ 0, 0.03 ], tilt1: [ 0, 0.03 ],
		bark: KIND.ASPEN_BARK, leaf: KIND.ASPEN_LEAF, rects: [ ATLAS.aspenA, ATLAS.aspenB ],
		branches: [ 11, 15 ], span: [ 0.5, 0.95 ], elev: [ 0.8, 1.25 ], len: [ 0.22, 0.1 ], weep: 0.1,
		density: 2.8, size: [ 1.3, 2.0 ], crownY: 0.76, radius: 0.2,
	},
	// rowan: a small, often multi-stemmed tree with a rounded crown and berries
	rowan: {
		H: [ 6, 9 ], stems: ( rng ) => rng.int( 2, 4 ), tilt: [ 0.12, 0.26 ], tilt1: [ 0.02, 0.08 ],
		bark: KIND.ROWAN_BARK, leaf: KIND.ROWAN_LEAF, rects: [ ATLAS.rowan, ATLAS.rowan ],
		branches: [ 7, 10 ], span: [ 0.3, 0.92 ], elev: [ 0.45, 0.95 ], len: [ 0.42, 0.22 ], weep: 0.2,
		density: 3.2, size: [ 1.2, 1.8 ], crownY: 0.65, radius: 0.4,
	},
};

export function makeBroadleaf( rng, species = 'birch' ) {

	const c = BROADLEAF[ species ];
	const B = new Builder();
	const H = rng.range( c.H[ 0 ], c.H[ 1 ] );
	const stems = c.stems( rng );
	const leafRects = c.rects.map( atlasRect );
	let phase = 0;
	const crownC = new THREE.Vector3( 0, H * c.crownY, 0 );
	for ( let s = 0; s < stems; s ++ ) {

		const ang = rng.next() * Math.PI * 2;
		const tilt = stems > 1 ? rng.range( c.tilt[ 0 ], c.tilt[ 1 ] ) : rng.range( c.tilt1[ 0 ], c.tilt1[ 1 ] );
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

		tube( B, nodes, 7, c.bark, H, 2 );

		// main branches
		const nb = rng.int( c.branches[ 0 ], c.branches[ 1 ] );
		for ( let b = 0; b < nb; b ++ ) {

			const t = THREE.MathUtils.lerp( c.span[ 0 ], c.span[ 1 ], b / nb ) + rng.range( - 0.03, 0.03 );
			const base = nodes[ Math.floor( t * 10 ) ].p.clone().lerp( nodes[ Math.min( 10, Math.floor( t * 10 ) + 1 ) ].p, ( t * 10 ) % 1 );
			const a = b * 2.39996 + rng.next();
			const elev = THREE.MathUtils.lerp( c.elev[ 0 ], c.elev[ 1 ], t ) + rng.range( - 0.15, 0.15 );
			const L = sh * THREE.MathUtils.lerp( c.len[ 0 ], c.len[ 1 ], t ) * rng.range( 0.8, 1.2 );
			const dir = new THREE.Vector3( Math.cos( a ) * Math.cos( elev ), Math.sin( elev ), Math.sin( a ) * Math.cos( elev ) );
			const bn = [];
			const br = r0 * ( 1 - t ) * 0.55 + 0.012;
			for ( let i = 0; i <= 4; i ++ ) {

				const u = i / 4;
				const p = base.clone().addScaledVector( dir, u * L );
				p.y -= u * u * L * c.weep; // weeping tips
				bn.push( { p, r: br * ( 1 - u * 0.8 ), flex: 0.2 + u * 0.5 } );

			}

			tube( B, bn, 4, c.bark, H, 1, 0 );
			// leaf clusters along the outer part of the branch
			const nl = Math.floor( L * c.density ) + 2;
			for ( let k = 0; k < nl; k ++ ) {

				const u = rng.range( 0.3, 1.05 );
				const p = base.clone().addScaledVector( dir, u * L );
				p.y -= u * u * L * c.weep - rng.range( - 0.4, 0.4 );
				p.x += rng.range( - 0.5, 0.5 );
				p.z += rng.range( - 0.5, 0.5 );
				const face = p.clone().sub( crownC ).normalize();
				face.x += rng.range( - 0.5, 0.5 );
				face.z += rng.range( - 0.5, 0.5 );
				face.normalize();
				const ao = THREE.MathUtils.clamp( 0.5 + p.clone().sub( crownC ).length() / ( H * 0.35 ) * 0.5, 0.45, 1 );
				const size = rng.range( c.size[ 0 ], c.size[ 1 ] );
				leafCard( B, p, face, size, leafRects[ k & 1 ], c.leaf, H, ao, ( phase ++ * 0.618 ) % 1, rng );
				// a crossed partner for volume
				const f2 = new THREE.Vector3( - face.z, rng.range( - 0.3, 0.3 ), face.x ).normalize();
				leafCard( B, p, f2, size * 0.85, leafRects[ ( k + 1 ) & 1 ], c.leaf, H, ao * 0.9, ( phase ++ * 0.618 ) % 1, rng );

			}

		}

		// crown top clusters
		for ( let k = 0; k < 4; k ++ ) {

			const p = nodes[ 10 ].p.clone().add( new THREE.Vector3( rng.range( - 0.8, 0.8 ), rng.range( - 1.2, 0 ), rng.range( - 0.8, 0.8 ) ) );
			leafCard( B, p, new THREE.Vector3( rng.range( - 1, 1 ), 0.3, rng.range( - 1, 1 ) ).normalize(), 1.6, leafRects[ k & 1 ], c.leaf, H, 1, ( phase ++ * 0.618 ) % 1, rng );

		}

	}

	return { geometry: B.build(), height: H, radius: H * c.radius, species };

}

export function makeBirch( rng ) {

	return makeBroadleaf( rng, 'birch' );

}

// A standing dead tree: weathered grey, broken off, bristling with bare branches.
export function makeSnag( rng ) {

	const B = new Builder();
	const H = rng.range( 9, 17 );
	const top = rng.range( 0.72, 0.98 );
	const r0 = H * 0.016 + 0.05;
	const lean = new THREE.Vector2( rng.range( - 1, 1 ), rng.range( - 1, 1 ) ).multiplyScalar( H * 0.025 );
	const ph = rng.next() * 6.28;
	const nodes = [];
	for ( let i = 0; i <= 12; i ++ ) {

		const t = i / 12 * top;
		const y = t * H - 0.4;
		const wob = 0.14 * t;
		const flare = 1 + Math.max( 0, 1 - y / 1.1 ) * 0.7;
		nodes.push( { p: new THREE.Vector3( lean.x * t * t + Math.sin( t * 9 + ph ) * wob, y, lean.y * t * t + Math.cos( t * 7 + ph ) * wob ), r: Math.max( 0.035, r0 * ( 1 - t * 0.78 ) * flare ) } );

	}

	tube( B, nodes, 7, KIND.DEAD_WOOD, H, 2 );
	// jagged break at the top
	const tip = nodes[ 12 ];
	tube( B, [ { p: tip.p, r: tip.r }, { p: tip.p.clone().add( new THREE.Vector3( 0.03, 0.16, 0.02 ) ), r: tip.r * 0.35 } ], 6, KIND.DEAD_WOOD, H, 1 );
	disc( B, tip.p.clone().add( new THREE.Vector3( 0.03, 0.16, 0.02 ) ), new THREE.Vector3( 0.15, 1, 0.1 ).normalize(), tip.r * 0.35, 6, KIND.END_GRAIN );

	const at = ( t ) => {

		const f = t / top * 12, i = Math.min( 11, Math.floor( f ) );
		return nodes[ i ].p.clone().lerp( nodes[ i + 1 ].p, f - i );

	};

	const nb = rng.int( 18, 28 );
	for ( let b = 0; b < nb; b ++ ) {

		const t = rng.range( 0.18, 0.97 ) * top;
		const base = at( t );
		const a = rng.next() * Math.PI * 2;
		const broken = rng.next() < 0.35;
		const L = H * ( 0.05 + 0.14 * ( 1 - t ) ) * rng.range( 0.6, 1.2 ) * ( broken ? 0.3 : 1 );
		const el = rng.range( - 0.45, 0.3 );
		const dir = new THREE.Vector3( Math.cos( a ) * Math.cos( el ), Math.sin( el ), Math.sin( a ) * Math.cos( el ) );
		const br = 0.012 + 0.03 * ( 1 - t );
		const bn = [];
		for ( let i = 0; i <= 3; i ++ ) {

			const u = i / 3;
			const p = base.clone().addScaledVector( dir, u * L );
			p.y -= u * u * L * 0.15;
			bn.push( { p, r: br * ( 1 - u * 0.75 ) } );

		}

		tube( B, bn, 4, KIND.DEAD_WOOD, H, 1 );
		if ( ! broken && L > 1.2 ) {

			for ( let k = 0; k < 2; k ++ ) {

				const q = base.clone().addScaledVector( dir, L * rng.range( 0.4, 0.8 ) );
				const d2 = dir.clone().add( new THREE.Vector3( rng.range( - 0.7, 0.7 ), rng.range( 0.1, 0.6 ), rng.range( - 0.7, 0.7 ) ) ).normalize();
				tube( B, [ { p: q, r: br * 0.45 }, { p: q.clone().addScaledVector( d2, L * 0.35 ), r: 0.004 } ], 3, KIND.DEAD_WOOD, H, 1 );

			}

		}

	}

	return { geometry: B.build(), height: H * top + 0.5, radius: H * 0.2, species: 'snag' };

}

// A little cluster of toadstools: fly agaric or penny bun.
export function makeMushrooms( rng, type ) {

	const B = new Builder();
	const agaric = type === 'agaric';
	const n = agaric ? rng.int( 2, 5 ) : rng.int( 2, 4 );
	for ( let i = 0; i < n; i ++ ) {

		const a = rng.next() * Math.PI * 2, d = i === 0 ? 0 : rng.range( 0.14, 0.5 );
		const x = Math.cos( a ) * d, z = Math.sin( a ) * d;
		const sc = i === 0 ? 1.1 : rng.range( 0.5, 1.0 );
		const stemH = ( agaric ? 0.17 : 0.11 ) * sc, stemR = ( agaric ? 0.02 : 0.034 ) * sc;
		const capR = ( agaric ? 0.09 : 0.08 ) * sc * rng.range( 0.85, 1.2 );
		// young agarics are domed, old ones open flat
		const capH = capR * ( agaric ? rng.range( 0.3, 0.75 ) : rng.range( 0.5, 0.65 ) );
		const tilt = new THREE.Vector3( rng.range( - 0.2, 0.2 ), 1, rng.range( - 0.2, 0.2 ) ).normalize();
		const P = ( h ) => new THREE.Vector3( x + tilt.x * h, h - 0.02, z + tilt.z * h );
		tube( B, [ { p: P( 0 ), r: stemR * ( agaric ? 1.7 : 1.5 ) }, { p: P( stemH * 0.3 ), r: stemR * ( agaric ? 1.15 : 1.35 ) }, { p: P( stemH ), r: stemR } ], 7, KIND.MUSH_STEM, 1, 1 );
		// gills or pores underneath
		tube( B, [ { p: P( stemH - 0.006 ), r: capR * 0.97 }, { p: P( stemH ), r: stemR } ], 12, KIND.MUSH_STEM, 1, 1 );
		const cap = [];
		for ( let k = 0; k <= 6; k ++ ) {

			const u = k / 6;
			cap.push( { p: P( stemH - 0.006 + capH * Math.sin( u * Math.PI / 2 ) ), r: Math.max( 0.003, capR * Math.cos( u * Math.PI / 2 ) ) } );

		}

		tube( B, cap, 14, agaric ? KIND.AGARIC_CAP : KIND.BOLETE_CAP, 1, 1 );

	}

	return { geometry: B.build( true ), height: 0.3, radius: 0.6, species: 'mushroom' };

}

// Bracken: fronds rising on stalks and arching out into near-horizontal blades.
export function makeFern( rng ) {

	const B = new Builder();
	const rect = atlasRect( ATLAS.fern );
	const H = rng.range( 0.8, 1.25 );
	const n = rng.int( 6, 9 );
	for ( let k = 0; k < n; k ++ ) {

		const a = k / n * Math.PI * 2 + rng.range( - 0.4, 0.4 );
		const el = rng.range( 0.8, 1.2 );
		const dir = new THREE.Vector3( Math.cos( a ) * Math.cos( el ), Math.sin( el ), Math.sin( a ) * Math.cos( el ) );
		const side = new THREE.Vector3( - Math.sin( a ), 0, Math.cos( a ) );
		side.applyAxisAngle( dir, rng.range( - 0.35, 0.35 ) );
		const o = new THREE.Vector3( rng.range( - 0.2, 0.2 ), - 0.05, rng.range( - 0.2, 0.2 ) );
		const len = H * rng.range( 1.0, 1.4 );
		card( B, o, dir, side, len, len * 0.62, rng.range( 0.25, 0.45 ), 0, rect, KIND.FERN_LEAF, H, 0.7, 0.55, 1.0, rng.next(), 4, () => 1 );

	}

	return { geometry: B.build(), height: H, radius: H * 1.2, species: 'fern' };

}

// Bilberry / heath: a low, dense mat of red and orange twigs.
export function makeHeath( rng ) {

	const B = new Builder();
	const rect = atlasRect( ATLAS.heath );
	const H = rng.range( 0.22, 0.38 ), R = rng.range( 0.5, 0.9 );
	const n = rng.int( 9, 13 );
	for ( let k = 0; k < n; k ++ ) {

		const a = rng.next() * Math.PI;
		const r = R * Math.sqrt( rng.next() );
		const b = rng.next() * Math.PI * 2;
		const o = new THREE.Vector3( Math.cos( b ) * r, - 0.04, Math.sin( b ) * r );
		const side = new THREE.Vector3( Math.cos( a ), 0, Math.sin( a ) );
		const dir = new THREE.Vector3( rng.range( - 0.15, 0.15 ), 1, rng.range( - 0.15, 0.15 ) ).normalize();
		card( B, o, dir, side, H * rng.range( 0.8, 1.2 ), rng.range( 0.5, 0.85 ), 0.05, 0, rect, KIND.HEATH_LEAF, H, R, 0.5, 1.0, rng.next(), 2, () => 1 );

	}

	return { geometry: B.build(), height: H, radius: R + 0.4, species: 'heath' };

}

export function makeShrub( rng ) {

	const B = new Builder();
	const H = rng.range( 1.1, 1.8 );
	const rect = atlasRect( ATLAS.shrub );
	let phase = 0;
	const n = rng.int( 7, 10 );
	for ( let k = 0; k < n; k ++ ) {

		const a = k / n * Math.PI + rng.range( - 0.2, 0.2 );
		const size = H * rng.range( 0.85, 1.2 );
		const off = rng.range( 0, H * 0.3 ), oa = rng.next() * Math.PI * 2;
		const c = new THREE.Vector3( Math.cos( oa ) * off, size * 0.5 - 0.08, Math.sin( oa ) * off );
		const face = new THREE.Vector3( Math.cos( a ), rng.range( - 0.1, 0.1 ), Math.sin( a ) ).normalize();
		leafCard( B, c, face, size, rect, KIND.SHRUB_LEAF, H, rng.range( 0.65, 1 ), ( phase ++ * 0.618 ) % 1, rng, 0.3 );

	}

	return { geometry: B.build(), height: H, radius: H * 0.8, species: 'shrub' };

}
