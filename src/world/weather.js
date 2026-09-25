import * as THREE from 'three';
import { commonParsGLSL, terrainUniformsGLSL, terrainLookupFnGLSL } from '../shaders/common.glsl.js';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { sharedUniforms, U } from '../core/uniforms.js';
import { RNG } from '../core/rng.js';

// Weather presets. Everything eases toward the target over ~half a minute.
export const WEATHERS = {
	clear: { label: 'Clear', clouds: 0.34, wind: 0.7, rain: 0, overcast: 0, haze: 2.0, mist: 0.00035, base: 3000, lowCloud: 0, storm: 0 },
	breezy: { label: 'Breezy', clouds: 0.5, wind: 1.55, rain: 0, overcast: 0.05, haze: 1.7, mist: 0.0001, base: 3000, lowCloud: 0, storm: 0 },
	overcast: { label: 'Overcast', clouds: 0.86, wind: 0.9, rain: 0, overcast: 0.72, haze: 2.8, mist: 0.0007, base: 3000, lowCloud: 0, storm: 0 },
	rain: { label: 'Rain', clouds: 0.95, wind: 1.25, rain: 0.65, overcast: 0.9, haze: 4.2, mist: 0.0012, base: 700, lowCloud: 0.004, storm: 0 },
	storm: { label: 'Thunderstorm', clouds: 1.0, wind: 2.1, rain: 1.0, overcast: 1.0, haze: 5.0, mist: 0.0009, base: 520, lowCloud: 0.005, storm: 1 },
};

// ---------------------------------------------------------------------------
// Rain: GPU-animated streaks wrapped in a box around the viewer
// ---------------------------------------------------------------------------
const rainVert = /* glsl */ `
${noiseGLSL}
${terrainUniformsGLSL}
${terrainLookupFnGLSL}
uniform float uTime;
uniform float uIntensity;
uniform vec2 uWindVel;
attribute vec4 aSeed;
varying float vAlpha;
varying vec3 vWorldPos;
const float R = 24.0;
const float H = 22.0;
void main() {
	vAlpha = 0.0;
	if ( aSeed.w > uIntensity ) { gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 ); return; }
	float fall = 8.5 + aSeed.z * 2.5;
	vec3 vel = vec3( uWindVel.x, -fall, uWindVel.y );
	float cycle = H / fall;
	float t = uTime + aSeed.z * 17.0 * cycle;
	float k = floor( t / cycle );
	float f = fract( t / cycle );
	// each fall re-seeds the drop's column so no pattern repeats
	vec2 col = hash22( aSeed.xy * 97.0 + k * 0.137 );
	vec2 off = ( col - 0.5 ) * 2.0 * R;
	vec2 cam = cameraPosition.xz;
	vec2 w = off + uWindVel * f * cycle;
	vec2 xz = cam + mod( w - cam + R, 2.0 * R ) - R;
	float y = cameraPosition.y + H * 0.45 - f * H;
	vec3 p = vec3( xz.x, y, xz.y );
	float ground = max( terrainH( p.xz ), 0.0 );
	if ( p.y < ground ) { gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 ); return; }
	vec3 dir = normalize( vel );
	vec3 toCam = normalize( cameraPosition - p );
	vec3 side = normalize( cross( dir, toCam ) );
	float len = fall * 0.045;
	vec3 wp = p + dir * position.y * len + side * position.x * 0.011;
	float d = length( cameraPosition - p );
	vAlpha = smoothstep( 0.5, 2.5, d ) * ( 1.0 - smoothstep( R * 0.6, R, d ) );
	vWorldPos = wp;
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`;

const rainFrag = /* glsl */ `
${commonParsGLSL}
varying float vAlpha;
varying vec3 vWorldPos;
void main() {
	if ( vAlpha <= 0.001 ) discard;
	vec3 light = skyIrradiance( vec3( 0.0, 1.0, 0.0 ) ) * 0.12 + uSunColor * 0.04;
	float a = vAlpha * 0.32;
	gl_FragColor = vec4( light * a, 0.0 );
}
`;

// ---------------------------------------------------------------------------
// Lightning: a branching, momentary HDR ribbon from the cloud base
// ---------------------------------------------------------------------------
const boltVert = /* glsl */ `
attribute float aW;
varying float vW;
void main() {
	vW = aW;
	gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 );
}
`;

const boltFrag = /* glsl */ `
uniform float uIntensity;
varying float vW;
void main() {
	float core = 1.0 - abs( vW );
	gl_FragColor = vec4( vec3( 7.0, 7.6, 9.0 ) * core * core * uIntensity, 0.0 );
}
`;

export class Weather {

	constructor( terrain, quality, audio ) {

		this.terrain = terrain;
		this.audio = audio;
		this.rng = new RNG( 2024 );
		this.state = { ...WEATHERS.clear };
		this.target = WEATHERS.clear;
		this.name = 'clear';
		this.dynamic = false;
		this.userWind = 1;
		this.userClouds = null;
		this.wetness = 0;
		this.flash = 0;
		this._strikeTimer = 8;
		this._cycleTimer = 180;
		this.windAngle = Math.atan2( 0.6, 0.8 );
		this.group = new THREE.Group();
		this.group.name = 'weather';

		// rain streaks
		const n = Math.round( 18000 * Math.max( 0.35, quality.particles ) );
		const quad = new THREE.PlaneGeometry( 1, 1 );
		quad.translate( 0, 0.5, 0 );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = quad.index;
		geo.setAttribute( 'position', quad.getAttribute( 'position' ) );
		const seeds = new Float32Array( n * 4 );
		for ( let i = 0; i < n; i ++ ) seeds.set( [ this.rng.next(), this.rng.next(), this.rng.next(), i / n ], i * 4 );
		geo.setAttribute( 'aSeed', new THREE.InstancedBufferAttribute( seeds, 4 ) );
		geo.instanceCount = n;
		this.rainUniforms = {
			...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
			...sharedUniforms(),
			uIntensity: { value: 0 },
			uWindVel: { value: new THREE.Vector2() },
		};
		this.rain = new THREE.Mesh( geo, new THREE.ShaderMaterial( {
			vertexShader: rainVert,
			fragmentShader: rainFrag,
			uniforms: this.rainUniforms,
			lights: true,
			transparent: true,
			depthWrite: false,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneFactor,
			blendSrcAlpha: THREE.ZeroFactor,
			blendDstAlpha: THREE.OneFactor,
		} ) );
		this.rain.frustumCulled = false;
		this.rain.layers.set( 1 );
		this.rain.visible = false;
		this.group.add( this.rain );

		// lightning bolt
		this.boltMat = new THREE.ShaderMaterial( {
			vertexShader: boltVert, fragmentShader: boltFrag, uniforms: { uIntensity: { value: 0 } },
			transparent: true, depthWrite: false, side: THREE.DoubleSide,
			blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
		} );
		this.bolt = new THREE.Mesh( new THREE.BufferGeometry(), this.boltMat );
		this.bolt.frustumCulled = false;
		this.bolt.visible = false;
		this.group.add( this.bolt );
		this._boltLife = 0;

	}

	snap( name ) {

		this.set( name );
		Object.assign( this.state, this.target );
		this.wetness = this.target.rain > 0 ? 1 : 0;

	}

	set( name ) {

		if ( ! WEATHERS[ name ] ) return;
		if ( name === 'storm' && this.name !== 'storm' ) this._strikeTimer = 4;
		this.name = name;
		this.target = WEATHERS[ name ];

	}

	// Fractal lightning path with a few side branches, as camera-facing ribbons.
	_makeBolt( camera, aim = null, dist = null ) {

		const rng = this.rng;
		const a = aim ?? rng.next() * Math.PI * 2, d = dist ?? rng.range( 1400, 4200 );
		const cx = camera.position.x + Math.cos( a ) * d, cz = camera.position.z + Math.sin( a ) * d;
		const ground = Math.max( this.terrain.heightAt( cx, cz ), 0 );
		const top = new THREE.Vector3( cx + rng.range( - 300, 300 ), Math.max( U.uCloudBase.value.x, ground + 400 ) + 200, cz + rng.range( - 300, 300 ) );
		const bottom = new THREE.Vector3( cx, ground, cz );
		const paths = [];
		const subdivide = ( p0, p1, depth, amp ) => {

			let pts = [ p0, p1 ];
			for ( let k = 0; k < depth; k ++ ) {

				const next = [];
				for ( let i = 0; i < pts.length - 1; i ++ ) {

					const m = pts[ i ].clone().lerp( pts[ i + 1 ], 0.5 );
					const l = pts[ i ].distanceTo( pts[ i + 1 ] );
					m.x += rng.range( - 1, 1 ) * l * amp;
					m.z += rng.range( - 1, 1 ) * l * amp;
					m.y += rng.range( - 0.3, 0.3 ) * l * amp;
					next.push( pts[ i ], m );

				}

				next.push( pts[ pts.length - 1 ] );
				pts = next;

			}

			return pts;

		};

		const main = subdivide( top, bottom, 7, 0.22 );
		paths.push( { pts: main, w: 9 } );
		for ( let b = 0; b < 4; b ++ ) {

			const i = Math.floor( rng.range( 0.1, 0.6 ) * main.length );
			const start = main[ i ];
			const end = start.clone().add( new THREE.Vector3( rng.range( - 400, 400 ), - rng.range( 200, 600 ), rng.range( - 400, 400 ) ) );
			paths.push( { pts: subdivide( start, end, 5, 0.25 ), w: 4 } );

		}

		const pos = [], w = [], idx = [];
		const toCam = new THREE.Vector3(), side = new THREE.Vector3(), dir = new THREE.Vector3();
		for ( const path of paths ) {

			const base = pos.length / 3;
			path.pts.forEach( ( p, i ) => {

				const q = path.pts[ Math.min( i + 1, path.pts.length - 1 ) ], r = path.pts[ Math.max( i - 1, 0 ) ];
				dir.subVectors( q, r ).normalize();
				toCam.subVectors( camera.position, p ).normalize();
				side.crossVectors( dir, toCam ).normalize().multiplyScalar( path.w * ( 1 - i / path.pts.length * 0.5 ) );
				pos.push( p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z );
				w.push( - 1, 1 );
				if ( i < path.pts.length - 1 ) {

					const k = base + i * 2;
					idx.push( k, k + 1, k + 2, k + 1, k + 3, k + 2 );

				}

			} );

		}

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'aW', new THREE.Float32BufferAttribute( w, 1 ) );
		g.setIndex( idx );
		this.bolt.geometry.dispose();
		this.bolt.geometry = g;
		return { dist: camera.position.distanceTo( bottom ), at: bottom };

	}

	// a lightning strike; aim (world angle in the xz-plane) lets a director place it in shot
	strike( camera, aim = null, dist = null ) {

		const r = this._makeBolt( camera, aim, dist );
		this._boltLife = 0.35;
		this._flicker = 0;
		this.flash = 1.0 * Math.min( 1, 2500 / r.dist );
		this.audio?.thunder( r.at, r.dist );

	}

	update( dt, time, camera, sky ) {

		// optional slow cycle through the weathers
		if ( this.dynamic ) {

			this._cycleTimer -= dt;
			if ( this._cycleTimer <= 0 ) {

				const order = [ 'clear', 'breezy', 'overcast', 'rain', 'storm', 'rain', 'overcast', 'breezy' ];
				const i = ( order.indexOf( this.name ) + 1 ) % order.length;
				this.set( order[ i ] );
				this._cycleTimer = this.rng.range( 120, 240 );

			}

		}

		const s = this.state, tg = this.target;
		const k = 1 - Math.exp( - dt / 5 );
		// the sky clears over ~20 s, but rain starts and stops within a few seconds
		const kRain = tg.rain < s.rain ? 1 - Math.exp( - dt / 1.2 ) : 1 - Math.exp( - dt / 3 );
		for ( const key of [ 'clouds', 'wind', 'rain', 'overcast', 'haze', 'mist', 'base', 'lowCloud', 'storm' ] ) s[ key ] += ( tg[ key ] - s[ key ] ) * ( key === 'rain' ? kRain : k );
		if ( tg.rain === 0 && s.rain < 0.02 ) s.rain = 0;

		// surfaces soak quickly and dry slowly
		if ( s.rain > 0.05 ) this.wetness = Math.min( 1, this.wetness + dt * s.rain * 0.08 );
		else this.wetness = Math.max( 0, this.wetness - dt * 0.025 );

		// wind: gently veering direction, strength from weather x user setting, with gusts
		this.windAngle += Math.sin( time * 0.013 ) * dt * 0.01;
		const gust = 0.85 + 0.25 * Math.sin( time * 0.21 ) * Math.sin( time * 0.07 + 1 );
		U.uWind.value.x = Math.cos( this.windAngle );
		U.uWind.value.y = Math.sin( this.windAngle );
		U.uWind.value.z = s.wind * this.userWind * gust;

		U.uCloud.value.x = this.userClouds !== null && tg === WEATHERS.clear ? this.userClouds : s.clouds;
		U.uCloud.value.w = 0.35 * ( 1 - s.overcast );
		// clouds sail with the wind
		U.uCloud.value.y += dt * U.uWind.value.x * ( 3 + 7 * U.uWind.value.z );
		U.uCloud.value.z += dt * U.uWind.value.y * ( 3 + 7 * U.uWind.value.z );
		U.uFog.value.x = s.haze;
		U.uFog.value.y = s.mist + ( 1 - Math.min( 1, U.uWind.value.z ) ) * 0.0003 * ( 1 - s.rain );
		U.uCloudBase.value.set( s.base, s.lowCloud );
		sky.overcast = s.overcast;

		// lightning
		if ( this.flash > 0 ) this.flash = Math.max( 0, this.flash - dt * 3.2 );
		if ( s.storm > 0.6 ) {

			this._strikeTimer -= dt;
			if ( this._strikeTimer <= 0 ) {

				this._strikeTimer = this.rng.range( 5, 16 ) / s.storm;
				this.strike( camera );

			}

		}

		if ( this._boltLife > 0 ) {

			this._boltLife -= dt;
			this._flicker += dt;
			// return strokes: the bolt pulses a few times
			const pulse = 0.35 + 0.65 * Math.abs( Math.sin( this._flicker * 38 ) );
			this.boltMat.uniforms.uIntensity.value = pulse * Math.min( 1, this._boltLife / 0.1 );
			this.bolt.visible = true;
			if ( this.rng.next() < dt * 8 ) this.flash = Math.max( this.flash, 0.6 );

		} else this.bolt.visible = false;

		U.uWeather.value.set( s.rain, this.wetness, s.overcast, this.flash * 0.9 );

		// rain streaks
		this.rain.visible = s.rain > 0.01;
		this.rainUniforms.uIntensity.value = s.rain;
		this.rainUniforms.uWindVel.value.set( U.uWind.value.x, U.uWind.value.y ).multiplyScalar( U.uWind.value.z * 2.5 );

	}

	// overcast dims direct sun; called after the sky has set the clear-sky light
	applyToLight() {

		const dim = 1 - this.state.overcast * 0.9;
		U.uSunColor.value.multiplyScalar( dim );

	}

}
