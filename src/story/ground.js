import * as THREE from 'three';
import { U } from '../core/uniforms.js';

// The story's marks on the ground, as one texture the terrain, grass and ground-cover shaders
// read (see storyMap() in shaders/common.glsl.js):
//   r: signed distance across the trail's centreline, -6..+6 m (0.5 = on the line)
//   g: trodden ground - the yard round the hut, the jetty's landing, the bridge ends
//   b: puddles (left by the storm; the shader fills them as the ground gets wet)
//   a: cleared of plants (under props: the hut, the boats, the signpost)
const RANGE = 6;

export class StoryGround {

	// path: the route; box: [ x0, z0, x1, z1 ]; mpp: metres per texel
	constructor( path, box, mpp = 0.5 ) {

		this.path = path;
		const [ x0, z0, x1, z1 ] = box;
		this.x0 = x0; this.z0 = z0;
		this.mpp = mpp;
		this.w = Math.ceil( ( x1 - x0 ) / mpp );
		this.h = Math.ceil( ( z1 - z0 ) / mpp );
		this.data = new Uint8Array( this.w * this.h * 4 );
		// start: far from the trail, nothing else
		for ( let i = 0; i < this.w * this.h; i ++ ) this.data[ i * 4 ] = 255;
		this._dist = new Float32Array( this.w * this.h ).fill( RANGE );
		this._off = new Float32Array( this.w * this.h ).fill( RANGE );
		this._trail();

	}

	// the trail: signed distance to the path (not on decks)
	_trail() {

		const S = this.path.samples, { w, h, mpp, x0, z0 } = this;
		for ( let i = 0; i < S.length - 1; i ++ ) {

			const a = S[ i ], b = S[ i + 1 ];
			if ( a.deck && b.deck ) continue;
			const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
			const ia = Math.max( 0, Math.floor( ( Math.min( a.x, b.x ) - RANGE - x0 ) / mpp ) ), ib = Math.min( w - 1, Math.ceil( ( Math.max( a.x, b.x ) + RANGE - x0 ) / mpp ) );
			const ja = Math.max( 0, Math.floor( ( Math.min( a.z, b.z ) - RANGE - z0 ) / mpp ) ), jb = Math.min( h - 1, Math.ceil( ( Math.max( a.z, b.z ) + RANGE - z0 ) / mpp ) );
			for ( let j = ja; j <= jb; j ++ ) for ( let k = ia; k <= ib; k ++ ) {

				const x = x0 + ( k + 0.5 ) * mpp, z = z0 + ( j + 0.5 ) * mpp;
				const t = THREE.MathUtils.clamp( ( ( x - a.x ) * ex + ( z - a.z ) * ez ) / l2, 0, 1 );
				const dx = x - ( a.x + ex * t ), dz = z - ( a.z + ez * t );
				const d = Math.hypot( dx, dz );
				const o = j * w + k;
				if ( d < this._dist[ o ] ) {

					this._dist[ o ] = d;
					this._off[ o ] = d * Math.sign( ex * dz - ez * dx || 1 );

				}

			}

		}

		for ( let i = 0; i < w * h; i ++ ) this.data[ i * 4 ] = Math.round( THREE.MathUtils.clamp( this._off[ i ] / RANGE * 0.5 + 0.5, 0, 1 ) * 255 );

	}

	// paint a soft-edged ellipse into a channel (1: trodden, 2: puddles, 3: cleared)
	blob( ch, x, z, rx, rz = rx, yaw = 0, strength = 1, edge = 0.35 ) {

		const { w, h, mpp, x0, z0 } = this;
		const r = Math.max( rx, rz );
		const c = Math.cos( yaw ), s = Math.sin( yaw );
		const ia = Math.max( 0, Math.floor( ( x - r - x0 ) / mpp ) ), ib = Math.min( w - 1, Math.ceil( ( x + r - x0 ) / mpp ) );
		const ja = Math.max( 0, Math.floor( ( z - r - z0 ) / mpp ) ), jb = Math.min( h - 1, Math.ceil( ( z + r - z0 ) / mpp ) );
		for ( let j = ja; j <= jb; j ++ ) for ( let k = ia; k <= ib; k ++ ) {

			const px = x0 + ( k + 0.5 ) * mpp - x, pz = z0 + ( j + 0.5 ) * mpp - z;
			const u = ( px * c - pz * s ) / rx, v = ( px * s + pz * c ) / rz;
			const q = Math.hypot( u, v );
			const f = strength * ( 1 - THREE.MathUtils.smoothstep( q, 1 - edge, 1 ) );
			const o = ( j * w + k ) * 4 + ch;
			this.data[ o ] = Math.max( this.data[ o ], Math.round( f * 255 ) );

		}

	}

	// a rectangle (centre, half sizes, yaw) with soft edges
	rect( ch, x, z, hx, hz, yaw = 0, strength = 1, edge = 0.4 ) {

		const { w, h, mpp, x0, z0 } = this;
		const r = Math.hypot( hx, hz ) + edge;
		const c = Math.cos( yaw ), s = Math.sin( yaw );
		const ia = Math.max( 0, Math.floor( ( x - r - x0 ) / mpp ) ), ib = Math.min( w - 1, Math.ceil( ( x + r - x0 ) / mpp ) );
		const ja = Math.max( 0, Math.floor( ( z - r - z0 ) / mpp ) ), jb = Math.min( h - 1, Math.ceil( ( z + r - z0 ) / mpp ) );
		for ( let j = ja; j <= jb; j ++ ) for ( let k = ia; k <= ib; k ++ ) {

			const px = x0 + ( k + 0.5 ) * mpp - x, pz = z0 + ( j + 0.5 ) * mpp - z;
			// into the object's frame (yaw about +y: local x = c px - s pz, local z = s px + c pz)
			const u = Math.abs( px * c - pz * s ) - hx, v = Math.abs( px * s + pz * c ) - hz;
			const out = Math.hypot( Math.max( u, 0 ), Math.max( v, 0 ) );
			const f = strength * ( 1 - THREE.MathUtils.smoothstep( out, 0, edge ) );
			const o = ( j * w + k ) * 4 + ch;
			this.data[ o ] = Math.max( this.data[ o ], Math.round( f * 255 ) );

		}

	}

	// metres from the trail's centreline at (x, z) (RANGE when far or off the map)
	trailDist( x, z ) {

		const k = Math.floor( ( x - this.x0 ) / this.mpp ), j = Math.floor( ( z - this.z0 ) / this.mpp );
		if ( k < 0 || j < 0 || k >= this.w || j >= this.h ) return RANGE;
		return this._dist[ j * this.w + k ];

	}

	channel( ch, x, z ) {

		const k = Math.floor( ( x - this.x0 ) / this.mpp ), j = Math.floor( ( z - this.z0 ) / this.mpp );
		if ( k < 0 || j < 0 || k >= this.w || j >= this.h ) return 0;
		return this.data[ ( j * this.w + k ) * 4 + ch ] / 255;

	}

	// upload, and point the shared uniforms at it
	upload() {

		if ( ! this.texture ) {

			this.texture = new THREE.DataTexture( this.data, this.w, this.h, THREE.RGBAFormat, THREE.UnsignedByteType );
			this.texture.minFilter = THREE.LinearFilter;
			this.texture.magFilter = THREE.LinearFilter;
			this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
			this.texture.generateMipmaps = false;

		}

		this.texture.needsUpdate = true;
		U.uStoryMap.value = this.texture;
		U.uStoryXf.value.set( this.x0, this.z0, 1 / ( this.w * this.mpp ), 1 / ( this.h * this.mpp ) );

	}

}

export const STORY_RANGE = RANGE;
