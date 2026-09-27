import * as THREE from 'three';
import { commonParsGLSL } from '../../shaders/common.glsl.js';
import { sharedUniforms } from '../../core/uniforms.js';

// A lamp's glow seen from afar: the flame itself is a pixel or two across a bay, so a
// camera-facing quad carries it - a hot point, a small bloom and a faint wide glow in the mist,
// sized by distance so it stays the same few pixels however far away it is, and fading through
// the haze like everything else.
// On water a point of light is not mirrored as a point: the ripples smear it into a column of
// broken dashes running from under it toward you. The lake's mirror pass draws this same quad,
// so when it is being drawn for a mirror camera it stretches down the image and breaks into
// bands that crawl with the water.
export class Glow {

	constructor( camera, color = new THREE.Color( 1.0, 0.56, 0.22 ) ) {

		const g = new THREE.PlaneGeometry( 2, 2 );
		this.material = new THREE.ShaderMaterial( {
			vertexShader: /* glsl */ `
				uniform float uSize;
				uniform float uMirror;
				varying vec2 vUv;
				varying vec3 vWorldPos;
				void main() {
					vUv = position.xy;
					vec4 c = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
					vWorldPos = c.xyz;
					float d = length( cameraPosition - c.xyz );
					// a few pixels at any distance, never smaller than the lamp itself
					float r = max( 0.35, d * uSize );
					vec4 mv = viewMatrix * c;
					// in the mirror: a tall, narrow column hanging down from the light's image
					vec2 s = mix( vec2( 1.0 ), vec2( 0.45, 7.0 ), uMirror );
					mv.xy += position.xy * r * s;
					mv.y -= uMirror * r * ( s.y - 1.4 );
					gl_Position = projectionMatrix * mv;
				}`,
			fragmentShader: /* glsl */ `
				${commonParsGLSL}
				uniform vec3 uColor;
				uniform float uIntensity;
				uniform float uMirror;
				uniform float uClock;
				varying vec2 vUv;
				varying vec3 vWorldPos;
				float hash( float n ) { return fract( sin( n ) * 43758.5453 ); }
				void main() {
					float r = length( vUv );
					if ( r > 1.0 ) discard;
					float core = exp( - r * r * 170.0 ), bloom = exp( - r * r * 40.0 ) * 0.03, mist = exp( - r * r * 4.5 ) * 0.009;
					float k = core * 2.2 + bloom + mist;
					if ( uMirror > 0.5 ) {

						// broken into dashes that crawl toward you, brightest near the top
						float y = vUv.y * 22.0 + uClock * 1.7;
						float band = floor( y ), f = fract( y );
						float on = step( 0.35, hash( band ) ) * smoothstep( 0.0, 0.25, f ) * smoothstep( 1.0, 0.6, f );
						float w = 0.35 + 0.65 * hash( band + 7.1 );
						float across = exp( - vUv.x * vUv.x / ( w * w ) * 14.0 );
						float down = smoothstep( - 1.0, 0.1, vUv.y ) * ( 0.35 + 0.65 * smoothstep( - 0.6, 0.9, vUv.y ) );
						k = ( core * 1.2 + across * on * ( 0.08 + 0.14 * hash( band + 3.3 ) ) * down ) + mist * 0.5;

					}

					vec3 col = uColor * k * uIntensity;
					// through the haze and the mist, as everything else
					col = applyAtmosphere( col, vWorldPos ) - applyAtmosphere( vec3( 0.0 ), vWorldPos );
					gl_FragColor = vec4( max( col, 0.0 ), 0.0 );
				}`,
			uniforms: { ...sharedUniforms(), uColor: { value: color }, uIntensity: { value: 0 }, uSize: { value: 0.012 }, uMirror: { value: 0 }, uClock: { value: 0 } },
			transparent: true,
			depthWrite: false,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneFactor,
			blendSrcAlpha: THREE.ZeroFactor,
			blendDstAlpha: THREE.OneFactor,
		} );
		this.mesh = new THREE.Mesh( g, this.material );
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 20;
		this.mesh.name = 'glow';
		this.mesh.visible = false;
		// drawn for the eye or for a mirror?
		this.mesh.onBeforeRender = ( renderer, scene, cam ) => {

			this.material.uniforms.uMirror.value = cam === camera ? 0 : 1;

		};

	}

	set( on, intensity = 7 ) {

		this.mesh.visible = on;
		this.target = on ? intensity : 0;

	}

	update( dt, time ) {

		if ( ! this.mesh.visible ) return;
		// a wick flame: a slow breathing and a quicker gutter now and then
		const f = 0.9 + 0.07 * Math.sin( time * 2.1 ) + 0.05 * Math.sin( time * 7.3 + Math.sin( time * 1.3 ) * 2 );
		this.material.uniforms.uIntensity.value = this.target * f;
		this.material.uniforms.uClock.value = time;

	}

}
