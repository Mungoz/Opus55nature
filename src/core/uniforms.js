import * as THREE from 'three';
/* global __HORROR__ */

// Uniform objects shared (by reference) between every nature material, so one
// assignment per frame updates the whole scene.
export const U = {
	uTime: { value: 0 },
	uSunDir: { value: new THREE.Vector3( 0, 1, 0 ) }, // main light (sun, or moon at night)
	uSunColor: { value: new THREE.Vector3( 1, 1, 1 ) }, // main light irradiance at ground level
	uTrueSunDir: { value: new THREE.Vector3( 0, 1, 0 ) },
	uMoonDir: { value: new THREE.Vector3( 0, - 1, 0 ) },
	uNight: { value: 0 },
	uSkyLUT: { value: null },
	uIrrLUT: { value: null },
	uHNear: { value: null },
	uHFar: { value: null },
	uBiomeNear: { value: null },
	uBiomeFar: { value: null },
	uNearXf: { value: new THREE.Vector4() },
	uFarXf: { value: new THREE.Vector4() },
	uTShadow: { value: null }, // r: near region, g: whole world
	uNoiseTex: { value: null },
	// x: haze density, y: valley mist density, z: mist scale height, w: rain/wetness
	uFog: { value: new THREE.Vector4( 2.0, 0.00035, 16, 0 ) },
	// x: coverage, y/z: wind offset (m), w: cloud shadow strength
	uCloud: { value: new THREE.Vector4( 0.42, 0, 0, 0.35 ) },
	// xy: wind direction, z: strength, w: gust phase time
	uWind: { value: new THREE.Vector4( 0.8, 0.6, 1, 0 ) },
	// x: rain intensity, y: surface wetness, z: overcast, w: lightning flash
	uWeather: { value: new THREE.Vector4( 0, 0, 0, 0 ) },
	// x: cloud base altitude (m) for low cloud, y: low-cloud density
	uCloudBase: { value: new THREE.Vector2( 3000, 0 ) },
	// xy: where ground cover is centred when w = 1 (a long-lens subject); else it follows the camera
	uFocus: { value: new THREE.Vector4( 0, 0, 0, 0 ) },
	uWaterLevel: { value: 0 },
	uWaterAbsorb: { value: new THREE.Vector3( 0.42, 0.075, 0.07 ) },
	uWaterScatter: { value: new THREE.Vector3( 0.012, 0.05, 0.048 ) },
	// the horror edition's marks on the ground (trail, yards, puddles; see story/ground.js)
	...( __HORROR__ ? { uStoryMap: { value: null }, uStoryXf: { value: new THREE.Vector4( 0, 0, 0, 0 ) } } : {} ),
};

export function sharedUniforms( ...names ) {

	const out = {};
	for ( const n of names.length ? names : Object.keys( U ) ) out[ n ] = U[ n ];
	return out;

}
