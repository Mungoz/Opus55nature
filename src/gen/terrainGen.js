import * as THREE from 'three';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { terrainShapeGLSL } from '../shaders/terrainShape.glsl.js';
import { FullscreenPass, passMaterial, makeTarget } from './gpu.js';
import { WORLD, regionOrigin } from '../core/world.js';

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
	vec2 meadowC = vec2( 40.0, 640.0 );
	float meadow = 1.0 - smoothstep( 150.0, 360.0, length( ( p - meadowC ) * vec2( 1.0, 0.8 ) ) + n2 * 90.0 );
	forest *= 1.0 - meadow * 0.92;
	forest = clamp( forest, 0.0, 1.0 );

	// Grass everywhere it can grow.
	float grass = ( 1.0 - rock ) * smoothstep( 0.42, 0.75, h ) * ( 1.0 - smoothstep( 1050.0, 1350.0, h + n1 * 150.0 ) );
	grass *= 1.0 - forest * 0.75;
	grass *= smoothstep( -0.75, -0.35, n2 + n3 * 0.2 + meadow + smoothstep( 60.0, 0.0, h ) * 0.6 );
	grass *= 1.0 - shore;

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

	async generate( progress = () => {} ) {

		const r = this.renderer;
		const filter = this.floatLinear ? THREE.LinearFilter : THREE.NearestFilter;

		const buildRegion = ( region ) => {

			const res = region.res;
			const [ ox, oz ] = regionOrigin( region );
			const hRT = makeTarget( res, res, { type: THREE.FloatType, minFilter: filter, magFilter: filter } );
			const hPass = new FullscreenPass( passMaterial( heightFrag, {
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
