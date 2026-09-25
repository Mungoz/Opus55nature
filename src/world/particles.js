import * as THREE from 'three';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { sharedUniforms } from '../core/uniforms.js';
import { RNG } from '../core/rng.js';

const lightsU = () => ( { ...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ), ...sharedUniforms() } );

// ---------------------------------------------------------------------------
// Point sprites: splash droplets and sunlit motes share one shader.
// ---------------------------------------------------------------------------
const pointVert = /* glsl */ `
uniform float uScale;
attribute float aSize;
attribute float aAlpha;
varying vec3 vWorldPos;
varying float vAlpha;
void main() {
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vWorldPos = wp.xyz;
	vAlpha = aAlpha;
	vec4 mv = viewMatrix * wp;
	gl_Position = projectionMatrix * mv;
	gl_PointSize = clamp( aSize * uScale / max( -mv.z, 0.1 ), 1.0, 64.0 );
}
`;

const pointFrag = /* glsl */ `
${commonParsGLSL}
uniform float uMode; // 0 water droplets, 1 motes
uniform float uIntensity;
varying vec3 vWorldPos;
varying float vAlpha;
void main() {
	vec2 c = gl_PointCoord * 2.0 - 1.0;
	float r2 = dot( c, c );
	if ( r2 > 1.0 ) discard;
	float soft = 1.0 - r2;
	vec3 V = normalize( cameraPosition - vWorldPos );
	float sh = sunShadowFast( vWorldPos );
	vec3 col;
	float a;
	if ( uMode < 0.5 ) {
		col = ( uSunColor * sh * 0.25 + skyIrradiance( vec3( 0.0, 1.0, 0.0 ) ) * 0.3 ) * 0.9;
		a = vAlpha * soft;
	} else {
		// pollen and midges: only visible when they scatter light toward the eye
		float fwd = pow( saturate( dot( -V, uSunDir ) ), 6.0 );
		col = uSunColor * sh * ( 0.02 + fwd * 1.6 ) * vec3( 1.0, 0.92, 0.75 );
		a = vAlpha * soft * soft * uIntensity;
	}
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col * a, a * 0.0 );
}
`;

class PointPool {

	constructor( max, mode, scale ) {

		this.max = max;
		this.geo = new THREE.BufferGeometry();
		this.pos = new Float32Array( max * 3 );
		this.size = new Float32Array( max );
		this.alpha = new Float32Array( max );
		this.geo.setAttribute( 'position', new THREE.BufferAttribute( this.pos, 3 ).setUsage( THREE.DynamicDrawUsage ) );
		this.geo.setAttribute( 'aSize', new THREE.BufferAttribute( this.size, 1 ).setUsage( THREE.DynamicDrawUsage ) );
		this.geo.setAttribute( 'aAlpha', new THREE.BufferAttribute( this.alpha, 1 ).setUsage( THREE.DynamicDrawUsage ) );
		this.material = new THREE.ShaderMaterial( {
			vertexShader: pointVert,
			fragmentShader: pointFrag,
			uniforms: { ...lightsU(), uScale: { value: scale }, uMode: { value: mode }, uIntensity: { value: 1 } },
			lights: true,
			transparent: true,
			depthWrite: false,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: mode ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.ZeroFactor,
			blendDstAlpha: THREE.OneFactor,
		} );
		this.points = new THREE.Points( this.geo, this.material );
		this.points.frustumCulled = false;

	}

	flush() {

		for ( const k of [ 'position', 'aSize', 'aAlpha' ] ) this.geo.getAttribute( k ).needsUpdate = true;

	}

}

// ---------------------------------------------------------------------------
// Falling leaves: small lit quads tumbling down from the canopy.
// ---------------------------------------------------------------------------
const leafVert = /* glsl */ `
attribute vec4 aLeaf; // xyz position, w: size
attribute vec4 aRot;  // quaternion
attribute vec3 aTint;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vTint;
vec3 qrot( vec4 q, vec3 v ) { return v + 2.0 * cross( q.xyz, cross( q.xyz, v ) + q.w * v ); }
void main() {
	vec3 p = qrot( aRot, vec3( position.x, 0.0, position.y ) * aLeaf.w );
	vWorldPos = aLeaf.xyz + p;
	vNormal = qrot( aRot, vec3( 0.0, 1.0, 0.0 ) );
	vUv = position.xy;
	vTint = aTint;
	gl_Position = projectionMatrix * viewMatrix * vec4( vWorldPos, 1.0 );
}
`;

const leafFrag = /* glsl */ `
${commonParsGLSL}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vTint;
void main() {
	// pointed oval leaf with a midrib
	vec2 q = vUv * 2.0;
	float w = 0.55 * ( 1.0 - q.y * q.y ) * ( 1.0 - 0.25 * q.y );
	if ( abs( q.x ) > w || abs( q.y ) > 1.0 ) discard;
	vec3 N = normalize( vNormal );
	if ( !gl_FrontFacing ) N = -N;
	vec3 V = normalize( cameraPosition - vWorldPos );
	vec3 alb = vTint * ( 1.0 - 0.3 * smoothstep( 0.04, 0.0, abs( q.x ) ) );
	float sh = sunShadowFast( vWorldPos );
	vec3 col = alb / PI * ( uSunColor * sh * ( saturate( dot( N, uSunDir ) ) * 0.7 + 0.3 ) + skyIrradiance( N ) );
	col += alb * uSunColor * sh * pow( saturate( dot( -V, uSunDir ) ), 3.0 ) * 0.35;
	col = waterColumn( col, vWorldPos, uSunColor * sh );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, 1.0 );
}
`;

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class Particles {

	constructor( terrain, quality ) {

		this.terrain = terrain;
		this.group = new THREE.Group();
		this.group.name = 'particles';
		this.rng = new RNG( 1001 );
		const k = quality.particles;

		// splash droplets
		this.drops = new PointPool( 1200, 0, 380 );
		this.dropVel = new Float32Array( 1200 * 3 );
		this.dropLife = new Float32Array( 1200 );
		this.dropNext = 0;
		this.group.add( this.drops.points );

		// drifting motes around the viewer
		this.moteCount = Math.floor( 1400 * k );
		this.motes = new PointPool( this.moteCount, 1, 90 );
		this.moteSeed = new Float32Array( this.moteCount * 4 );
		for ( let i = 0; i < this.moteCount; i ++ ) {

			this.moteSeed.set( [ this.rng.next(), this.rng.next(), this.rng.next(), this.rng.next() ], i * 4 );
			this.motes.size[ i ] = 0.04 + this.rng.next() * 0.06;
			this.motes.alpha[ i ] = 0.5 + this.rng.next() * 0.5;

		}

		this.motes.points.layers.set( 1 );
		this.group.add( this.motes.points );

		// leaves
		this.leafCount = Math.floor( 260 * k );
		const quad = new THREE.PlaneGeometry( 1, 1 );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = quad.index;
		geo.setAttribute( 'position', quad.getAttribute( 'position' ) );
		this.leafPos = new Float32Array( this.leafCount * 4 );
		this.leafRot = new Float32Array( this.leafCount * 4 );
		const tint = new Float32Array( this.leafCount * 3 );
		this.leafState = [];
		const palette = [ '#e0b030', '#d79a22', '#c9661c', '#e8c24a', '#b5471a', '#d4a038' ].map( ( c ) => new THREE.Color( c ).convertSRGBToLinear() );
		for ( let i = 0; i < this.leafCount; i ++ ) {

			const c = palette[ i % palette.length ];
			tint.set( [ c.r, c.g, c.b ], i * 3 );
			this.leafState.push( { p: new THREE.Vector3( 0, - 1000, 0 ), v: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler(), rest: 0, active: false } );

		}

		geo.setAttribute( 'aLeaf', new THREE.InstancedBufferAttribute( this.leafPos, 4 ).setUsage( THREE.DynamicDrawUsage ) );
		geo.setAttribute( 'aRot', new THREE.InstancedBufferAttribute( this.leafRot, 4 ).setUsage( THREE.DynamicDrawUsage ) );
		geo.setAttribute( 'aTint', new THREE.InstancedBufferAttribute( tint, 3 ) );
		geo.instanceCount = this.leafCount;
		this.leafGeo = geo;
		this.leaves = new THREE.Mesh( geo, new THREE.ShaderMaterial( {
			vertexShader: leafVert, fragmentShader: leafFrag, uniforms: lightsU(), lights: true, side: THREE.DoubleSide,
		} ) );
		this.leaves.frustumCulled = false;
		this.leaves.layers.set( 1 );
		this.group.add( this.leaves );
		this.trees = null; // set by the app: forest instance list for leaf spawning

	}

	drip( at, vel, count = 1 ) {

		for ( let n = 0; n < count; n ++ ) {

			const i = this.dropNext;
			this.dropNext = ( this.dropNext + 1 ) % this.drops.max;
			this.drops.pos.set( [ at.x + ( this.rng.next() - 0.5 ) * 0.08, at.y, at.z + ( this.rng.next() - 0.5 ) * 0.08 ], i * 3 );
			this.dropVel.set( [ vel.x + ( this.rng.next() - 0.5 ) * 0.6, vel.y + this.rng.next() * 0.4, vel.z + ( this.rng.next() - 0.5 ) * 0.6 ], i * 3 );
			this.dropLife[ i ] = 1.2;
			this.drops.size[ i ] = 0.03 + this.rng.next() * 0.03;
			this.drops.alpha[ i ] = 0.85;

		}

	}

	splash( at, count, power, size = 1 ) {

		for ( let n = 0; n < count; n ++ ) {

			const i = this.dropNext;
			this.dropNext = ( this.dropNext + 1 ) % this.drops.max;
			const a = this.rng.next() * Math.PI * 2, r = this.rng.next();
			this.drops.pos.set( [ at.x + Math.cos( a ) * r * 0.3, at.y + 0.05, at.z + Math.sin( a ) * r * 0.3 ], i * 3 );
			this.dropVel.set( [ Math.cos( a ) * r * power * 0.8, power * ( 0.8 + this.rng.next() * 0.9 ), Math.sin( a ) * r * power * 0.8 ], i * 3 );
			this.dropLife[ i ] = 1.2;
			this.drops.size[ i ] = ( 0.03 + this.rng.next() * 0.05 ) * size;
			this.drops.alpha[ i ] = 0.8;

		}

	}

	_spawnLeaf( s, cam ) {

		const rng = this.rng;
		// drop from a nearby deciduous tree if there is one, else from above the viewer
		let x = cam.x + rng.range( - 35, 35 ), z = cam.z + rng.range( - 35, 35 ), y;
		if ( this.trees && this.trees.length && rng.next() < 0.85 ) {

			const t = this.trees[ Math.floor( rng.next() * this.trees.length ) ];
			x = t.x + rng.range( - 3, 3 );
			z = t.z + rng.range( - 3, 3 );
			y = t.y + t.h * rng.range( 0.4, 0.95 );

		} else y = this.terrain.heightAt( x, z ) + rng.range( 6, 16 );
		s.p.set( x, y, z );
		s.v.set( 0, - rng.range( 0.6, 1.1 ), 0 );
		s.spin.set( rng.range( - 4, 4 ), rng.range( - 3, 3 ), rng.range( - 4, 4 ) );
		s.rot.set( rng.next() * 6, rng.next() * 6, rng.next() * 6 );
		s.rest = 0;
		s.active = true;
		s.size = rng.range( 0.05, 0.08 );

	}

	update( dt, time, camera, wind, water ) {

		const cam = camera.position;
		// droplets
		const d = this.drops;
		for ( let i = 0; i < d.max; i ++ ) {

			if ( this.dropLife[ i ] <= 0 ) {

				d.alpha[ i ] = 0;
				continue;

			}

			this.dropLife[ i ] -= dt;
			this.dropVel[ i * 3 + 1 ] -= 9.81 * dt;
			d.pos[ i * 3 ] += this.dropVel[ i * 3 ] * dt;
			d.pos[ i * 3 + 1 ] += this.dropVel[ i * 3 + 1 ] * dt;
			d.pos[ i * 3 + 2 ] += this.dropVel[ i * 3 + 2 ] * dt;
			if ( d.pos[ i * 3 + 1 ] < 0 ) {

				this.dropLife[ i ] = 0;
				d.alpha[ i ] = 0;

			}

		}

		d.flush();

		// motes wrap within a 36 m box around the viewer and drift on the breeze
		const B = 36;
		const m = this.motes;
		for ( let i = 0; i < this.moteCount; i ++ ) {

			const s = this.moteSeed.subarray( i * 4, i * 4 + 4 );
			const ox = s[ 0 ] * B + time * wind.x * 0.6 + Math.sin( time * 0.3 + s[ 3 ] * 20 ) * 1.5;
			const oz = s[ 1 ] * B + time * wind.y * 0.6 + Math.cos( time * 0.27 + s[ 3 ] * 17 ) * 1.5;
			const x = cam.x + ( ( ( ox - cam.x ) % B ) + B ) % B - B / 2;
			const z = cam.z + ( ( ( oz - cam.z ) % B ) + B ) % B - B / 2;
			const g = this.terrain.heightAt( x, z );
			const y = Math.max( g, 0 ) + 0.3 + s[ 2 ] * 7 + Math.sin( time * 0.5 + s[ 3 ] * 30 ) * 0.4;
			m.pos[ i * 3 ] = x; m.pos[ i * 3 + 1 ] = y; m.pos[ i * 3 + 2 ] = z;

		}

		m.flush();

		// leaves
		for ( let i = 0; i < this.leafCount; i ++ ) {

			const s = this.leafState[ i ];
			if ( ! s.active || s.p.distanceToSquared( cam ) > 70 * 70 ) this._spawnLeaf( s, cam );
			if ( s.rest > 0 ) {

				s.rest -= dt;
				if ( s.rest <= 0 ) this._spawnLeaf( s, cam );

			} else {

				const flutter = Math.sin( time * 3 + i ) * 0.6;
				s.v.x += ( wind.x * 1.4 * ( 0.6 + wind.z ) + Math.cos( time * 2.1 + i ) * 0.8 - s.v.x ) * dt * 1.5;
				s.v.z += ( wind.y * 1.4 * ( 0.6 + wind.z ) + flutter - s.v.z ) * dt * 1.5;
				s.p.addScaledVector( s.v, dt );
				s.rot.x += s.spin.x * dt; s.rot.y += s.spin.y * dt; s.rot.z += s.spin.z * dt;
				const g = this.terrain.heightAt( s.p.x, s.p.z );
				const floor = Math.max( g + 0.03, 0.005 );
				if ( s.p.y <= floor ) {

					s.p.y = floor;
					s.rest = this.rng.range( 4, 12 );
					s.rot.set( Math.PI * 0.5 * ( this.rng.next() < 0.5 ? 0 : 0.05 ), s.rot.y, 0 );
					if ( g < 0 ) water?.addRipple( s.p.x, s.p.z, 0.08 );

				}

			}

			const drift = s.rest > 0 && s.p.y < 0.05 ? time : 0; // leaves afloat drift slowly
			_e.set( s.rest > 0 ? 0 : s.rot.x, s.rot.y + drift * 0.05, s.rest > 0 ? 0 : s.rot.z );
			_q.setFromEuler( _e );
			this.leafPos.set( [ s.p.x, s.p.y, s.p.z, s.size * 1.8 ], i * 4 );
			this.leafRot.set( [ _q.x, _q.y, _q.z, _q.w ], i * 4 );

		}

		this.leafGeo.getAttribute( 'aLeaf' ).needsUpdate = true;
		this.leafGeo.getAttribute( 'aRot' ).needsUpdate = true;

	}

}
