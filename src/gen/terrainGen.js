import * as THREE from 'three';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { terrainShapeGLSL } from '../shaders/terrainShape.glsl.js';
import { FullscreenPass, passMaterial, makeTarget } from './gpu.js';
import { WORLD, regionOrigin } from '../core/world.js';
import { riverSamples, PONDS, RIVER_SAMPLES, RIVER_CHUNK } from '../core/features.js';

// The stream data for the shaders, parked far away until the water is measured.
function riverTexture() {

	const d = new Float32Array( RIVER_SAMPLES * 3 * 4 );
	for ( let i = 0; i < RIVER_SAMPLES; i ++ ) {

		d.set( [ 1e6, 1e6, 0, 0 ], i * 4 );
		d.set( [ 1e6, 1e6, - 1e6, - 1e6 ], ( RIVER_SAMPLES * 2 + i ) * 4 ); // empty chunk bounds

	}

	const t = new THREE.DataTexture( d, RIVER_SAMPLES, 3, THREE.RGBAFormat, THREE.FloatType );
	t.minFilter = t.magFilter = THREE.NearestFilter;
	t.needsUpdate = true;
	return t;

}

// Measures natural ground (no streams or ponds carved) at a list of points.
const probeFrag = /* glsl */ `
${noiseGLSL}
${terrainShapeGLSL}
uniform sampler2D uPos;
void main() {
	vec2 p = texelFetch( uPos, ivec2( gl_FragCoord.xy ), 0 ).xy;
	gl_FragColor = vec4( terrainHeight( p, 1.0 ), 0.0, 0.0, 1.0 );
}
`;

const heightFrag = /* glsl */ `
${noiseGLSL}
${terrainShapeGLSL}
uniform vec2 uOrigin;
uniform float uSize;
uniform float uRes;
void main() {
	vec2 p = uOrigin + ( gl_FragCoord.xy / uRes ) * uSize;
	float h = terrainHeight( p, max( uSize / uRes * 2.0, 0.8 ) );
	gl_FragColor = vec4( h, 0.0, 0.0, 1.0 );
}
`;

// Normals + horizon-based ambient occlusion.
const deriveFrag = /* glsl */ `
${noiseGLSL}
uniform sampler2D uH;
uniform float uRes;
uniform float uTexel;
float H( ivec2 c ) {
	c = clamp( c, ivec2( 0 ), ivec2( int( uRes ) - 1 ) );
	return texelFetch( uH, c, 0 ).r;
}
void main() {
	ivec2 c = ivec2( gl_FragCoord.xy );
	float h = H( c );
	float hx = H( c + ivec2( 1, 0 ) ) - H( c - ivec2( 1, 0 ) );
	float hz = H( c + ivec2( 0, 1 ) ) - H( c - ivec2( 0, 1 ) );
	vec3 n = normalize( vec3( -hx, 2.0 * uTexel, -hz ) );

	float occ = 0.0;
	float jitter = hash12( gl_FragCoord.xy ) * 0.5;
	const int DIRS = 12;
	for ( int d = 0; d < DIRS; d ++ ) {
		float a = ( float( d ) + jitter ) / float( DIRS ) * TAU;
		vec2 dir = vec2( cos( a ), sin( a ) );
		float maxSlope = 0.0;
		for ( int s = 1; s <= 7; s ++ ) {
			float dist = pow( 1.9, float( s ) );
			vec2 uv = ( gl_FragCoord.xy + dir * dist ) / uRes;
			float hs = texture2D( uH, uv ).r;
			maxSlope = max( maxSlope, ( hs - h ) / ( dist * uTexel ) );
		}
		occ += maxSlope / sqrt( 1.0 + maxSlope * maxSlope );
	}
	float ao = clamp( 1.0 - occ / float( DIRS ), 0.0, 1.0 );
	gl_FragColor = vec4( h, n.x, n.z, ao );
}
`;

// Vegetation / material masks: r = grass, g = forest, b = rock, a = shore (sand/pebbles).
const biomeFrag = /* glsl */ `
${noiseGLSL}
${terrainShapeGLSL}
uniform sampler2D uHN;
uniform vec2 uOrigin;
uniform float uSize;
uniform float uRes;
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	vec2 p = uOrigin + uv * uSize;
	vec4 d = texelFetch( uHN, ivec2( gl_FragCoord.xy ), 0 );
	float h = d.x;
	float ny = sqrt( max( 0.0, 1.0 - d.y * d.y - d.z * d.z ) );
	float steep = 1.0 - ny;
	float lake = lakeSDF( p );

	float n1 = fbm2( p * 0.0032 + 4.0, 5 );
	float n2 = fbm2( p * 0.018 + 9.0, 3 );
	float n3 = gnoise( p * 0.06 );

	// Rock: cliffs and high, windswept ground.
	// bare rock only on true cliffs; moderate slopes carry turf and scree
	float rock = smoothstep( 0.26, 0.4, steep + n2 * 0.08 + n3 * 0.04 );
	rock = max( rock, smoothstep( 950.0, 1300.0, h + n1 * 180.0 ) * smoothstep( 0.1, 0.24, steep ) );

	// Shore band: pebbles and silt at and below the waterline.
	float shore = 1.0 - smoothstep( 0.4, 0.62 + n2 * 0.18, h );
	shore *= 1.0 - smoothstep( 40.0, 90.0, lake );

	// Forest: clustered stands below the treeline, thinning near water and in the southern meadows.
	float treeline = 560.0 + n1 * 140.0;
	float forest = smoothstep( -0.18, 0.22, n1 + n2 * 0.35 + 0.12 );
	forest *= 1.0 - smoothstep( treeline - 80.0, treeline + 60.0, h );
	forest *= 1.0 - smoothstep( 0.42, 0.62, steep );
	forest *= smoothstep( 6.0, 30.0 + n2 * 20.0, lake );
	// a stand of spruce and larch on the island
	float isl = 1.0 - smoothstep( 18.0, 42.0, length( ( p - ISLAND_C ) * vec2( 1.0, 0.8 ) ) );
	forest = max( forest, isl * smoothstep( 1.5, 4.0, h ) * ( 0.65 + 0.35 * n3 ) );
	vec2 meadowC = vec2( 40.0, 640.0 );
	float meadow = 1.0 - smoothstep( 150.0, 360.0, length( ( p - meadowC ) * vec2( 1.0, 0.8 ) ) + n2 * 90.0 );
	forest *= 1.0 - meadow * 0.92;
	forest = clamp( forest, 0.0, 1.0 );

	// Grass everywhere it can grow.
	float grass = ( 1.0 - rock ) * smoothstep( 0.42, 0.75, h ) * ( 1.0 - smoothstep( 1050.0, 1350.0, h + n1 * 150.0 ) );
	grass *= 1.0 - forest * 0.75;
	grass *= smoothstep( -0.75, -0.35, n2 + n3 * 0.2 + meadow + smoothstep( 60.0, 0.0, h ) * 0.6 );
	grass *= 1.0 - shore;

	// streams and ponds: stony beds, open banks
	float wet = surfaceWater( p );
	float pond = pondWater( p );
	vec3 rq = riverQuery( p );
	float nearWater = 1.0 - smoothstep( rq.z + 2.0, rq.z + 12.0, rq.x );
	grass *= 1.0 - max( wet, pond );
	forest *= 1.0 - max( max( wet, pond ), nearWater );
	shore = max( shore, wet );
	rock *= 1.0 - max( wet, pond );

	gl_FragColor = vec4( clamp( grass, 0.0, 1.0 ), forest, rock, shore );
}
`;

// Sun occlusion by the landscape, marched through the heightmaps.
// r: near region (fine), g: whole world (coarse).
const shadowFrag = /* glsl */ `
uniform sampler2D uHNear;
uniform sampler2D uHFar;
uniform vec4 uNearXf;
uniform vec4 uFarXf;
uniform vec3 uSunDir;
uniform float uRes;

float nearW( vec2 p ) {
	vec2 uv = ( p - uNearXf.xy ) * uNearXf.z;
	vec2 e = min( uv, 1.0 - uv );
	return smoothstep( 0.0, 0.03, min( e.x, e.y ) );
}
float terrainH( vec2 p ) {
	float hf = textureLod( uHFar, ( p - uFarXf.xy ) * uFarXf.z, 0.0 ).r;
	float w = nearW( p );
	if ( w <= 0.0 ) return hf;
	float hn = textureLod( uHNear, ( p - uNearXf.xy ) * uNearXf.z, 0.0 ).r;
	return mix( hf, hn, w );
}
float march( vec2 p, float minStep ) {
	vec3 L = uSunDir;
	if ( L.y < -0.02 ) return 0.0;
	float h0 = terrainH( p ) + 0.6;
	float hl = max( length( L.xz ), 1e-4 );
	vec2 dir = L.xz / hl;
	float rise = L.y / hl;
	float t = minStep;
	float res = 1.0;
	for ( int i = 0; i < 180; i ++ ) {
		vec2 q = p + dir * t;
		float rayH = h0 + rise * t;
		float diff = rayH - terrainH( q );
		res = min( res, diff / ( t * 0.012 + 0.5 ) );
		if ( res < -1.0 || rayH > 2900.0 || abs( q.x ) > 6000.0 || abs( q.y ) > 6000.0 ) break;
		t += max( minStep, t * 0.035 );
	}
	return smoothstep( -1.0, 1.0, res );
}
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	float sn = march( uNearXf.xy + uv * uNearXf.w, 1.5 );
	float sf = march( uFarXf.xy + uv * uFarXf.w, 10.0 );
	gl_FragColor = vec4( sn, sf, 0.0, 1.0 );
}
`;

function regionXf( r ) {

	const [ ox, oz ] = regionOrigin( r );
	return new THREE.Vector4( ox, oz, 1 / r.size, r.size );

}

export class TerrainData {

	constructor( renderer ) {

		this.renderer = renderer;
		this.floatLinear = renderer.extensions.has( 'OES_texture_float_linear' );
		this.nearXf = regionXf( WORLD.near );
		this.farXf = regionXf( WORLD.far );

	}

	// Streams must run downhill and sit below their banks, ponds must fill their
	// hollows: measure the natural ground first, then derive water levels.
	_measureWater() {

		const r = this.renderer;
		const samples = riverSamples();
		const pts = [];
		samples.forEach( ( smp, i ) => {

			const a = samples[ Math.max( 0, i - 1 ) ].p, b = samples[ Math.min( samples.length - 1, i + 1 ) ].p;
			const t = b.clone().sub( a ).normalize();
			const n = new THREE.Vector2( - t.y, t.x );
			pts.push( smp.p, smp.p.clone().addScaledVector( n, smp.width ), smp.p.clone().addScaledVector( n, - smp.width ) );

		} );
		for ( const pd of PONDS ) {

			pts.push( pd.c );
			for ( let k = 0; k < 24; k ++ ) {

				const a = k / 12 * Math.PI * 2;
				pts.push( pd.c.clone().add( new THREE.Vector2( Math.cos( a ), Math.sin( a ) ).multiplyScalar( pd.r * ( k < 12 ? 1.0 : 1.6 ) ) ) );

			}

		}

		const n = pts.length;
		const data = new Float32Array( n * 4 );
		pts.forEach( ( p, i ) => data.set( [ p.x, p.y, 0, 1 ], i * 4 ) );
		const posTex = new THREE.DataTexture( data, n, 1, THREE.RGBAFormat, THREE.FloatType );
		posTex.needsUpdate = true;
		const rt = makeTarget( n, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter } );
		const pass = new FullscreenPass( passMaterial( probeFrag, { uPos: { value: posTex }, ...this.featureUniforms } ) );
		pass.render( r, rt );
		const out = new Float32Array( n * 4 );
		r.readRenderTargetPixels( rt, 0, 0, n, 1, out );
		pass.dispose();
		rt.dispose();
		posTex.dispose();
		const h = ( i ) => out[ i * 4 ];

		// stream: lowest of centre and banks, stepping only downhill, smoothed
		let surf = samples.map( ( smp, i ) => Math.min( h( i * 3 ), h( i * 3 + 1 ), h( i * 3 + 2 ) ) - 0.85 );
		for ( let i = 1; i < surf.length; i ++ ) surf[ i ] = Math.min( surf[ i ], surf[ i - 1 ] );
		for ( let pass2 = 0; pass2 < 4; pass2 ++ ) {

			surf = surf.map( ( v, i ) => ( surf[ Math.max( 0, i - 1 ) ] + v * 2 + surf[ Math.min( surf.length - 1, i + 1 ) ] ) / 4 );
			for ( let i = 1; i < surf.length; i ++ ) surf[ i ] = Math.min( surf[ i ], surf[ i - 1 ] );

		}

		surf = surf.map( ( v ) => Math.max( v, 0.04 ) );
		// run out level with the lake over the last stretch
		for ( let i = 0; i < surf.length; i ++ ) {

			const k = THREE.MathUtils.smoothstep( samples[ i ].s, samples[ samples.length - 1 ].s - 40, samples[ samples.length - 1 ].s - 8 );
			surf[ i ] = THREE.MathUtils.lerp( surf[ i ], 0.0, k );

		}
		samples.forEach( ( smp, i ) => ( smp.surf = surf[ i ] ) );
		// signed curvature from the turning of the tangent, smoothed along the stream
		let K = samples.map( ( smp, i ) => {

			const a = samples[ Math.max( 0, i - 1 ) ], b = samples[ Math.min( samples.length - 1, i + 1 ) ];
			const ta = smp.p.clone().sub( a.p ).normalize(), tb = b.p.clone().sub( smp.p ).normalize();
			if ( i === 0 || i === samples.length - 1 ) return 0;
			return ( ta.x * tb.y - ta.y * tb.x ) / Math.max( ( b.s - a.s ) * 0.5, 1e-3 );

		} );
		for ( let pass2 = 0; pass2 < 3; pass2 ++ ) K = K.map( ( v, i ) => ( K[ Math.max( 0, i - 1 ) ] + v * 2 + K[ Math.min( K.length - 1, i + 1 ) ] ) / 4 );
		samples.forEach( ( smp, i ) => ( smp.k = K[ i ] ) );
		this.river = samples;
		const rd = this.featureUniforms.uRiverTex.value.image.data;
		samples.forEach( ( smp, i ) => {

			rd.set( [ smp.p.x, smp.p.y, smp.surf, smp.width ], i * 4 );
			rd.set( [ K[ i ], 0, 0, 0 ], ( RIVER_SAMPLES + i ) * 4 );

		} );
		// padded bounds of each chunk of segments, so the shader skips the far ones
		for ( let c = 0; c * RIVER_CHUNK < RIVER_SAMPLES - 1; c ++ ) {

			const pts = samples.slice( c * RIVER_CHUNK, Math.min( c * RIVER_CHUNK + RIVER_CHUNK, RIVER_SAMPLES - 1 ) + 1 ).map( ( smp ) => smp.p );
			const box = new THREE.Box2().setFromPoints( pts ).expandByScalar( 34 );
			rd.set( [ box.min.x, box.min.y, box.max.x, box.max.y ], ( RIVER_SAMPLES * 2 + c ) * 4 );

		}

		this.featureUniforms.uRiverTex.value.needsUpdate = true;
		const box = new THREE.Box2().setFromPoints( samples.map( ( smp ) => smp.p ) ).expandByScalar( 40 );
		this.featureUniforms.uRiverBox.value.set( box.min.x, box.min.y, box.max.x, box.max.y );

		// ponds: fill to just below the lowest point of the rim
		let k = samples.length * 3;
		this.ponds = PONDS.map( ( pd ) => {

			let m = h( k );
			for ( let j = 1; j <= 24; j ++ ) m = Math.min( m, h( k + j ) );
			k += 25;
			return { c: pd.c.clone(), r: pd.r, surf: m - 0.3, plunge: !! pd.plunge };

		} );
		// the plunge pool and the stream leaving it share one level
		{

			const pp = this.ponds.find( ( pd ) => pd.plunge );
			if ( pp ) {

				pp.surf = Math.min( pp.surf, samples[ 0 ].surf );
				for ( const smp of samples ) if ( smp.p.distanceTo( pp.c ) < pp.r * 1.25 ) smp.surf = Math.min( smp.surf, pp.surf );
				for ( let i = 1; i < samples.length; i ++ ) samples[ i ].surf = Math.min( samples[ i ].surf, samples[ i - 1 ].surf );
				samples.forEach( ( smp, i ) => rd.set( [ smp.p.x, smp.p.y, smp.surf, smp.width ], i * 4 ) );
				this.featureUniforms.uRiverTex.value.needsUpdate = true;

			}

		}
		this.featureUniforms.uPonds.value = this.ponds.map( ( pd ) => new THREE.Vector4( pd.c.x, pd.c.y, pd.r, pd.surf ) );
		this.featureUniforms.uFeatures.value = 1;

	}

	async generate( progress = () => {} ) {

		const r = this.renderer;
		const filter = this.floatLinear ? THREE.LinearFilter : THREE.NearestFilter;
		this.featureUniforms = {
			uRiverTex: { value: riverTexture() },
			uRiverBox: { value: new THREE.Vector4( - 1e6, - 1e6, 1e6, 1e6 ) },
			uPonds: { value: Array.from( { length: 4 }, () => new THREE.Vector4( 1e6, 1e6, 0, 0 ) ) },
			uFeatures: { value: 0 },
		};
		this._measureWater();

		const buildRegion = ( region ) => {

			const res = region.res;
			const [ ox, oz ] = regionOrigin( region );
			const hRT = makeTarget( res, res, { type: THREE.FloatType, minFilter: filter, magFilter: filter } );
			const hPass = new FullscreenPass( passMaterial( heightFrag, {
				...this.featureUniforms,
				uOrigin: { value: new THREE.Vector2( ox, oz ) },
				uSize: { value: region.size },
				uRes: { value: res },
			} ) );
			hPass.render( r, hRT );
			hPass.dispose();

			const dRT = makeTarget( res, res, { type: THREE.FloatType, minFilter: filter, magFilter: filter } );
			const dPass = new FullscreenPass( passMaterial( deriveFrag, {
				uH: { value: hRT.texture },
				uRes: { value: res },
				uTexel: { value: region.size / res },
			} ) );
			dPass.render( r, dRT );
			dPass.dispose();
			hRT.dispose();

			const bRT = makeTarget( res, res, { type: THREE.UnsignedByteType } );
			const bPass = new FullscreenPass( passMaterial( biomeFrag, {
				...this.featureUniforms,
				uHN: { value: dRT.texture },
				uOrigin: { value: new THREE.Vector2( ox, oz ) },
				uSize: { value: region.size },
				uRes: { value: res },
			} ) );
			bPass.render( r, bRT );
			bPass.dispose();

			// CPU copies for meshing, placement and collision.
			const full = new Float32Array( res * res * 4 );
			r.readRenderTargetPixels( dRT, 0, 0, res, res, full );
			const height = new Float32Array( res * res );
			const ao = new Float32Array( res * res );
			for ( let i = 0; i < res * res; i ++ ) {

				height[ i ] = full[ i * 4 ];
				ao[ i ] = full[ i * 4 + 3 ];

			}

			const biome = new Uint8Array( res * res * 4 );
			r.readRenderTargetPixels( bRT, 0, 0, res, res, biome );

			dRT.texture.wrapS = dRT.texture.wrapT = THREE.ClampToEdgeWrapping;
			return { region, res, ox, oz, texel: region.size / res, height, ao, biome, hnTex: dRT.texture, biomeTex: bRT.texture, hnRT: dRT, biomeRT: bRT };

		};

		this.far = buildRegion( WORLD.far );
		progress( 0.5 );
		await new Promise( ( res ) => setTimeout( res, 0 ) );
		this.near = buildRegion( WORLD.near );
		progress( 1 );

		this._initShadows();

	}

	// ---------- CPU sampling ----------

	_sample( d, x, z, arr, stride = 1, ch = 0 ) {

		const fx = ( x - d.ox ) / d.texel - 0.5;
		const fz = ( z - d.oz ) / d.texel - 0.5;
		const res = d.res;
		let ix = Math.floor( fx ), iz = Math.floor( fz );
		const tx = fx - ix, tz = fz - iz;
		const ix0 = Math.min( Math.max( ix, 0 ), res - 1 ), ix1 = Math.min( Math.max( ix + 1, 0 ), res - 1 );
		const iz0 = Math.min( Math.max( iz, 0 ), res - 1 ), iz1 = Math.min( Math.max( iz + 1, 0 ), res - 1 );
		const a = arr[ ( iz0 * res + ix0 ) * stride + ch ];
		const b = arr[ ( iz0 * res + ix1 ) * stride + ch ];
		const c = arr[ ( iz1 * res + ix0 ) * stride + ch ];
		const e = arr[ ( iz1 * res + ix1 ) * stride + ch ];
		return ( a + ( b - a ) * tx ) + ( ( c + ( e - c ) * tx ) - ( a + ( b - a ) * tx ) ) * tz;

	}

	nearWeight( x, z ) {

		const n = this.near;
		const u = ( x - n.ox ) / n.region.size, v = ( z - n.oz ) / n.region.size;
		const e = Math.min( u, v, 1 - u, 1 - v );
		const t = Math.min( Math.max( e / 0.03, 0 ), 1 );
		return t * t * ( 3 - 2 * t );

	}

	heightAt( x, z ) {

		const hf = this._sample( this.far, x, z, this.far.height );
		const w = this.nearWeight( x, z );
		if ( w <= 0 ) return hf;
		const hn = this._sample( this.near, x, z, this.near.height );
		return hf + ( hn - hf ) * w;

	}

	normalAt( x, z, out = new THREE.Vector3(), e = 1.0 ) {

		const hx = this.heightAt( x + e, z ) - this.heightAt( x - e, z );
		const hz = this.heightAt( x, z + e ) - this.heightAt( x, z - e );
		return out.set( - hx, 2 * e, - hz ).normalize();

	}

	// Returns [grass, forest, rock, shore] in 0..1
	biomeAt( x, z, out = [ 0, 0, 0, 0 ] ) {

		const w = this.nearWeight( x, z );
		for ( let c = 0; c < 4; c ++ ) {

			const f = this._sample( this.far, x, z, this.far.biome, 4, c );
			const n = w > 0 ? this._sample( this.near, x, z, this.near.biome, 4, c ) : f;
			out[ c ] = ( f + ( n - f ) * w ) / 255;

		}

		return out;

	}

	aoAt( x, z ) {

		const w = this.nearWeight( x, z );
		const f = this._sample( this.far, x, z, this.far.ao );
		const n = w > 0 ? this._sample( this.near, x, z, this.near.ao ) : 1;
		return f * ( 1 + ( n - 1 ) * w );

	}

	// ---------- Terrain self-shadowing (sun occlusion by mountains) ----------

	_initShadows() {

		const res = 1024;
		this.shadowRT = makeTarget( res, res, { type: THREE.UnsignedByteType } );
		this.shadowPass = new FullscreenPass( passMaterial( shadowFrag, {
			uHNear: { value: this.near.hnTex },
			uHFar: { value: this.far.hnTex },
			uNearXf: { value: this.nearXf },
			uFarXf: { value: this.farXf },
			uSunDir: { value: new THREE.Vector3( 0, 1, 0 ) },
			uRes: { value: res },
		} ) );
		this._lastShadowDir = new THREE.Vector3( 0, - 1, 0 );

	}

	get shadowTex() { return this.shadowRT.texture; }

	updateShadows( sunDir, force = false ) {

		if ( ! force && sunDir.angleTo( this._lastShadowDir ) < 0.0012 ) return false;
		this._lastShadowDir.copy( sunDir );
		this.shadowPass.material.uniforms.uSunDir.value.copy( sunDir );
		this.shadowPass.render( this.renderer, this.shadowRT );
		return true;

	}

}
