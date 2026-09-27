import * as THREE from 'three';
import { commonParsGLSL } from '../../shaders/common.glsl.js';
import { sharedUniforms, U } from '../../core/uniforms.js';
import { LAYERS } from '../../core/world.js';

// Smoke seeping from a charcoal kiln's vents (or a stovepipe): soft puffs that rise, swell, lean
// over with the breeze and thin away. Each puff is a camera-facing quad, its disc broken up by
// noise that turns as it rises, lit by the sky (and the sun where it reaches) like the mist.
// sources: [ { p: Vector3, rate: puffs a second, size: starting radius, rise: m/s } ]

const vert = /* glsl */ `
attribute vec4 aPuff; // centre, radius
attribute vec4 aLife; // age 0..1, alpha, seed, spin
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec4 vLife;
void main() {
	vUv = position.xy;
	vLife = aLife;
	float a = aLife.w + aLife.x * 1.6;
	vec2 q = mat2( cos( a ), sin( a ), - sin( a ), cos( a ) ) * position.xy * aPuff.w;
	vec4 mv = viewMatrix * vec4( aPuff.xyz, 1.0 );
	mv.xy += q;
	vWorldPos = ( inverse( viewMatrix ) * mv ).xyz;
	gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
${commonParsGLSL}
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec4 vLife;
void main() {
	float r = length( vUv );
	if ( r > 1.0 ) discard;
	// a soft ball of smoke, torn at its edges, curling as it goes
	float n = gnoise( vUv * 1.7 + vLife.z * 13.0 + vLife.x * 0.8 ) * 0.6 + gnoise( vUv * 4.1 - vLife.z * 7.0 + vLife.x * 1.9 ) * 0.4;
	float body = smoothstep( 1.0, 0.25, r + n * 0.35 );
	float a = body * vLife.y * 0.55;
	if ( a < 0.004 ) discard;
	// lit by the sky from above, a little by the sun, a touch of warmth where it is thick
	float sh = sunShadowFast( vWorldPos );
	vec3 col = skyIrradiance( vec3( 0.0, 1.0, 0.0 ) ) * 0.42 + uSunColor * sh * 0.12;
	col *= vec3( 0.93, 0.93, 0.95 ) * ( 0.85 + 0.25 * n );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col * a, a );
}
`;

export class Smoke {

	constructor( sources, max = 180 ) {

		this.sources = sources.map( ( s ) => ( { rate: 0.5, size: 0.35, rise: 0.45, acc: Math.random(), ...s } ) );
		this.max = max;
		this.puffs = [];
		const quad = new THREE.PlaneGeometry( 2, 2 );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = quad.index;
		geo.setAttribute( 'position', quad.getAttribute( 'position' ) );
		this.aPuff = new Float32Array( max * 4 );
		this.aLife = new Float32Array( max * 4 );
		geo.setAttribute( 'aPuff', new THREE.InstancedBufferAttribute( this.aPuff, 4 ).setUsage( THREE.DynamicDrawUsage ) );
		geo.setAttribute( 'aLife', new THREE.InstancedBufferAttribute( this.aLife, 4 ).setUsage( THREE.DynamicDrawUsage ) );
		geo.instanceCount = 0;
		this.geo = geo;
		this.mesh = new THREE.Mesh( geo, new THREE.ShaderMaterial( {
			vertexShader: vert,
			fragmentShader: frag,
			uniforms: { ...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ), ...sharedUniforms() },
			lights: true,
			transparent: true,
			depthWrite: false,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.ZeroFactor,
			blendDstAlpha: THREE.OneFactor,
		} ) );
		this.mesh.frustumCulled = false;
		this.mesh.layers.set( LAYERS.FX );
		this.mesh.name = 'smoke';
		this.centre = new THREE.Vector3();
		for ( const s of this.sources ) this.centre.add( s.p );
		this.centre.divideScalar( Math.max( 1, this.sources.length ) );
		// (already smoking when you come to it)
		for ( let t = 0; t < 14; t += 0.1 ) this._step( 0.1, t );

	}

	_step( dt, time ) {

		const w = U.uWind.value, wx = w.x * Math.min( 2, w.z ), wz = w.y * Math.min( 2, w.z );
		for ( const s of this.sources ) {

			s.acc += dt * s.rate;
			while ( s.acc >= 1 && this.puffs.length < this.max ) {

				s.acc -= 1;
				this.puffs.push( {
					p: s.p.clone().add( new THREE.Vector3( ( Math.random() - 0.5 ) * 0.15, 0, ( Math.random() - 0.5 ) * 0.15 ) ),
					v: new THREE.Vector3( ( Math.random() - 0.5 ) * 0.12, s.rise * ( 0.8 + Math.random() * 0.4 ), ( Math.random() - 0.5 ) * 0.12 ),
					r0: s.size * ( 0.8 + Math.random() * 0.4 ), age: 0, life: 9 + Math.random() * 6, seed: Math.random(), spin: Math.random() * 6.28,
					a: 0.5 + Math.random() * 0.5,
				} );

			}

			s.acc = Math.min( s.acc, 1 );

		}

		for ( let i = this.puffs.length - 1; i >= 0; i -- ) {

			const q = this.puffs[ i ];
			q.age += dt;
			if ( q.age > q.life ) { this.puffs.splice( i, 1 ); continue; }
			// rising slower as it cools, carried further by the breeze the higher it gets
			const k = q.age / q.life;
			q.v.y *= Math.exp( - dt * 0.12 );
			q.p.x += ( q.v.x + wx * 0.35 * ( 0.3 + k ) + Math.sin( time * 0.7 + q.seed * 9 ) * 0.05 ) * dt;
			q.p.y += q.v.y * dt;
			q.p.z += ( q.v.z + wz * 0.35 * ( 0.3 + k ) + Math.cos( time * 0.6 + q.seed * 7 ) * 0.05 ) * dt;

		}

	}

	update( dt, time, camera ) {

		const cp = camera.position;
		const far = cp.distanceToSquared( this.centre ) > 220 * 220;
		this.mesh.visible = ! far;
		if ( far ) return;
		this._step( Math.min( dt, 0.1 ), time );
		// back to front
		for ( const q of this.puffs ) q.d = q.p.distanceToSquared( cp );
		this.puffs.sort( ( a, b ) => b.d - a.d );
		const P = this.aPuff, L = this.aLife;
		this.puffs.forEach( ( q, i ) => {

			const k = q.age / q.life;
			P[ i * 4 ] = q.p.x; P[ i * 4 + 1 ] = q.p.y; P[ i * 4 + 2 ] = q.p.z;
			P[ i * 4 + 3 ] = q.r0 * ( 1 + k * 5.5 );
			L[ i * 4 ] = k;
			L[ i * 4 + 1 ] = q.a * Math.min( 1, q.age / 1.2 ) * Math.pow( 1 - k, 1.6 );
			L[ i * 4 + 2 ] = q.seed;
			L[ i * 4 + 3 ] = q.spin;

		} );
		this.geo.instanceCount = this.puffs.length;
		this.geo.getAttribute( 'aPuff' ).needsUpdate = true;
		this.geo.getAttribute( 'aLife' ).needsUpdate = true;

	}

}
