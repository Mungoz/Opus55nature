import * as THREE from 'three';
import { commonParsGLSL, terrainUniformsGLSL, terrainLookupFnGLSL } from '../shaders/common.glsl.js';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { paletteGLSL } from '../shaders/palette.glsl.js';
import { sharedUniforms } from '../core/uniforms.js';
import { RNG } from '../core/rng.js';

// "Infinite" grass: a fixed grid of blade instances tiled around the camera.
// Each blade finds its world position by wrapping its cell offset to the tile
// nearest the camera, so blades stay planted while the viewer moves.

const vert = /* glsl */ `
${noiseGLSL}
${terrainUniformsGLSL}
${terrainLookupFnGLSL}
${paletteGLSL}
uniform float uTime;
uniform vec4 uWind;
uniform sampler2D uNoiseTex;
uniform float uWaterLevel;
uniform float uTile;
uniform float uRadius;
uniform float uFadeIn;
uniform float uDensity;
uniform vec2 uHeightRange;
uniform float uWidth;
uniform float uType;
attribute vec4 aOff;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vY;
varying float vAO;

void main() {
	vec2 cam = cameraPosition.xz;
	vec2 p = aOff.xy + uTile * floor( ( cam - aOff.xy ) / uTile + 0.5 );
	float dist = length( p - cam );
	float r1 = aOff.z, r2 = aOff.w;

	float fade = 1.0 - smoothstep( uRadius * 0.7, uRadius, dist );
	fade *= smoothstep( uFadeIn * 0.75, uFadeIn, dist );
	if ( fade <= 0.001 ) { gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 ); return; }

	vec4 hn = terrainHN( p );
	float h = hn.x;
	vec4 bio = biomeAt( p );
	float patchN = textureLod( uNoiseTex, p / 23.0, 0.0 ).g;
	float dens;
	if ( uType < 0.5 ) {
		dens = bio.r * ( 1.0 - smoothstep( 0.3, 0.55, bio.b ) );
		dens *= smoothstep( 0.2, 0.45, patchN + bio.r * 0.3 );
	} else {
		// reeds: in the shallows and on the wet margin, in clumps
		float depth = uWaterLevel - h;
		dens = smoothstep( -0.5, 0.0, depth ) * ( 1.0 - smoothstep( 0.45, 0.85, depth ) );
		dens *= smoothstep( 0.5, 0.68, textureLod( uNoiseTex, p / 70.0 + 0.3, 0.0 ).r );
	}
	float keep = step( r1, dens * uDensity );
	float scale = keep * fade;
	if ( scale < 0.01 ) { gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 ); return; }

	float height = mix( uHeightRange.x, uHeightRange.y, r2 ) * ( 0.45 + 0.55 * dens ) * ( 0.6 + 0.6 * patchN );
	height *= mix( 0.35, 1.0, fade );
	float ang = r1 * 57.0 + r2 * 11.0;
	vec2 facing = vec2( cos( ang ), sin( ang ) );

	// wind: rolling gust fronts plus per-blade flutter
	vec2 wdir = normalize( uWind.xy + 1e-4 );
	float gust = textureLod( uNoiseTex, p / 45.0 - wdir * uTime * 0.09, 0.0 ).g;
	gust = smoothstep( 0.3, 0.85, gust );
	float windBend = uWind.z * ( 0.15 + 1.1 * gust ) + 0.12 * uWind.z * sin( uTime * 2.6 + r2 * 6.28 + dot( p, vec2( 0.7, 0.5 ) ) );
	vec2 bendDir = normalize( facing * 0.55 + wdir * windBend );
	float k = max( 0.3 + r2 * 0.5 + windBend * 0.9, 0.001 );
	if ( uType > 0.5 ) k *= 0.35;

	float y = position.y;
	float horiz = height * ( 1.0 - cos( k * y ) ) / k;
	float up = height * sin( k * y ) / k;
	float w = uWidth * ( 0.7 + 0.6 * r1 ) * ( 1.0 - y * 0.82 ) * ( 1.0 + dist * 0.03 );
	vec2 side = vec2( -bendDir.y, bendDir.x );
	vec3 base = vec3( p.x, h - 0.03, p.y );
	vec3 wp = base + vec3( bendDir.x * horiz, up, bendDir.y * horiz ) + vec3( side.x, 0.0, side.y ) * position.x * w;

	vec3 tangent = normalize( vec3( bendDir.x * sin( k * y ), cos( k * y ), bendDir.y * sin( k * y ) ) );
	vec3 across = vec3( side.x, 0.0, side.y );
	vec3 n = normalize( cross( across, tangent ) );
	if ( n.y < 0.0 ) n = -n;
	n = normalize( n + across * position.x * 0.9 );
	vNormal = normalize( mix( n, hnNormal( hn ), 0.4 ) );

	vec3 c = grassColor( p, h );
	if ( uType > 0.5 ) {
		c = mix( vec3( 0.16, 0.2, 0.07 ), vec3( 0.42, 0.34, 0.16 ), r2 );
		// a few cattail heads
		float head = step( 0.72, r1 ) * smoothstep( 0.72, 0.76, y ) * ( 1.0 - smoothstep( 0.88, 0.9, y ) );
		c = mix( c, vec3( 0.12, 0.06, 0.03 ), head );
	}
	// individual blade variety: some dry straw, tips paler
	c *= 0.8 + 0.4 * r2;
	c = mix( c, c * vec3( 1.25, 1.12, 0.8 ), smoothstep( 0.5, 1.0, y ) * 0.6 );
	vColor = c;
	vY = y;
	vAO = mix( 0.4, 1.0, y ) * hn.w;
	vWorldPos = wp;
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`;

const frag = /* glsl */ `
${commonParsGLSL}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vY;
varying float vAO;
void main() {
	vec3 N = normalize( vNormal );
	vec3 V = normalize( cameraPosition - vWorldPos );
	vec3 L = uSunDir;
	float sh = sunShadowFast( vWorldPos );
	float wrap = saturate( dot( N, L ) * 0.6 + 0.4 );
	float back = pow( saturate( dot( -V, L ) ), 3.0 ) * vY;
	vec3 alb = vColor * ( 1.0 - uWeather.y * 0.3 );
	vec3 direct = uSunColor * sh * ( alb / PI * wrap + alb * saturate( alb * 2.0 ) * back * 0.9 );
	vec3 amb = alb / PI * skyIrradiance( N ) * vAO;
	vec3 H = normalize( L + V );
	float spec = pow( saturate( dot( N, H ) ), mix( 30.0, 80.0, uWeather.y ) ) * mix( 0.08, 0.4, uWeather.y ) * vY;
	vec3 col = ( direct + amb ) * underwaterLight( vWorldPos ) + uSunColor * sh * spec;
	col = waterColumn( col, vWorldPos, uSunColor * sh );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, 1.0 );
}
`;

function bladeGeometry( segs ) {

	const pos = [];
	const idx = [];
	for ( let i = 0; i < segs; i ++ ) {

		const y = i / segs;
		pos.push( - 0.5, y, 0, 0.5, y, 0 );

	}

	pos.push( 0, 1, 0 );
	for ( let i = 0; i < segs - 1; i ++ ) {

		const a = i * 2;
		idx.push( a, a + 1, a + 2, a + 1, a + 3, a + 2 );

	}

	const t = ( segs - 1 ) * 2;
	idx.push( t, t + 1, t + 2 );
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	return g;

}

export class GrassLayer {

	constructor( opts ) {

		const { tile, spacing, segs, radius, fadeIn = 0, heightRange, width, type = 0, density = 1, seed = 1 } = opts;
		const n = Math.floor( tile / spacing );
		const rng = new RNG( seed );
		const blade = bladeGeometry( segs );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = blade.index;
		geo.setAttribute( 'position', blade.getAttribute( 'position' ) );
		const off = new Float32Array( n * n * 4 );
		let k = 0;
		for ( let j = 0; j < n; j ++ ) {

			for ( let i = 0; i < n; i ++ ) {

				off[ k ++ ] = ( i + rng.next() ) * spacing;
				off[ k ++ ] = ( j + rng.next() ) * spacing;
				off[ k ++ ] = rng.next();
				off[ k ++ ] = rng.next();

			}

		}

		geo.setAttribute( 'aOff', new THREE.InstancedBufferAttribute( off, 4 ) );
		geo.instanceCount = n * n;
		this.uniforms = {
			...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
			...sharedUniforms(),
			uTile: { value: tile },
			uRadius: { value: radius },
			uFadeIn: { value: fadeIn },
			uDensity: { value: density },
			uHeightRange: { value: new THREE.Vector2( ...heightRange ) },
			uWidth: { value: width },
			uType: { value: type },
		};
		this.material = new THREE.ShaderMaterial( {
			vertexShader: vert,
			fragmentShader: frag,
			uniforms: this.uniforms,
			lights: true,
			side: THREE.DoubleSide,
		} );
		this.mesh = new THREE.Mesh( geo, this.material );
		this.mesh.frustumCulled = false;
		this.mesh.layers.set( 1 );
		this.mesh.name = type ? 'reeds' : 'grass';

	}

}

export class Meadow {

	constructor( quality ) {

		this.group = new THREE.Group();
		const d = quality.grassDensity;
		const near = quality.grassNear, far = quality.grassFar;
		this.near = new GrassLayer( { tile: near * 2, spacing: 0.15 / Math.sqrt( d ), segs: 4, radius: near, heightRange: [ 0.28, 0.75 ], width: 0.05, seed: 3 } );
		this.far = new GrassLayer( { tile: far * 2, spacing: 0.42 / Math.sqrt( d ), segs: 2, radius: far, fadeIn: near * 0.85, heightRange: [ 0.3, 0.7 ], width: 0.11, seed: 5 } );
		this.reeds = new GrassLayer( { tile: 90, spacing: 0.3, segs: 4, radius: 45, heightRange: [ 1.1, 2.1 ], width: 0.035, type: 1, seed: 9 } );
		this.group.add( this.near.mesh, this.far.mesh, this.reeds.mesh );

	}

}
