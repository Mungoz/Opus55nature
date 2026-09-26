import * as THREE from 'three';
import { Sculpt } from '../../fauna/sdf.js';

// J.'s boots: a pair of old leather mountain boots, paired neatly side by side, laced, toes to
// the water. Sculpted like the animals (a smooth union of rounded shapes, polygonised).
// Origin between the heels on the ground, +z toward the toes.
const C = ( hex ) => new THREE.Color( hex );

export function buildBoots() {

	const S = new Sculpt();
	S.bone( 'root', [ 0, 0, 0 ] );
	const leather = ( x, y, z ) => {

		// dark oiled leather, wet and darker toward the sole, scuffed paler at the toe
		const c = C( '#4a3526' ).multiplyScalar( 0.8 + 0.25 * Math.sin( x * 90 + z * 70 ) * Math.sin( y * 80 ) );
		if ( y < 0.05 ) c.multiplyScalar( 0.75 );
		if ( z > 0.2 && y < 0.1 ) c.lerp( C( '#6a5443' ), 0.35 );
		return c;

	};

	const o = ( color, k = 0.012, extra = {} ) => ( { bone: 'root', k, color, ...extra } );
	for ( const sd of [ - 1, 1 ] ) {

		const x = sd * 0.075, rot = sd * 0.05;
		const X = ( dx, z ) => x + dx + z * rot;
		// the sole: a thick lugged rubber sole, flat underneath
		S.ellipsoid( [ X( 0, 0.12 ), 0.02, 0.12 ], [ 0.05, 0.022, 0.155 ], o( '#1c1a18', 0.006 ) );
		S.ellipsoid( [ X( 0, - 0.01 ), 0.02, - 0.01 ], [ 0.043, 0.022, 0.06 ], o( '#1c1a18', 0.006 ) );
		// the upper: the toe box, the vamp rising to the ankle, the heel counter
		S.ellipsoid( [ X( 0, 0.19 ), 0.055, 0.19 ], [ 0.045, 0.04, 0.075 ], o( leather, 0.02 ) );
		S.ellipsoid( [ X( 0, 0.1 ), 0.075, 0.1 ], [ 0.046, 0.055, 0.1 ], o( leather, 0.025 ) );
		S.ellipsoid( [ X( 0, 0.0 ), 0.08, 0.0 ], [ 0.042, 0.075, 0.05 ], o( leather, 0.025 ) );
		// the shaft round the ankle, a padded collar, the opening
		S.cone( [ X( 0, 0.02 ), 0.1, 0.02 ], [ X( 0, 0.0 ), 0.19, 0.0 ], 0.045, 0.043, o( leather, 0.02 ) );
		S.ellipsoid( [ X( 0, 0.0 ), 0.19, 0.0 ], [ 0.047, 0.018, 0.048 ], o( C( '#2e241c' ), 0.01 ) );
		S.cone( [ X( 0, 0.0 ), 0.15, 0.0 ], [ X( 0, 0.0 ), 0.23, 0.0 ], 0.034, 0.034, o( '#111', 0.008, { sub: true } ) );
		// the tongue, and the laces crossing up it
		S.ellipsoid( [ X( 0, 0.055 ), 0.16, 0.055 ], [ 0.024, 0.045, 0.012 ], o( leather, 0.01 ) );
		for ( let i = 0; i < 5; i ++ ) {

			const z = 0.13 - i * 0.022, y = 0.1 + i * 0.018;
			S.cone( [ X( - 0.025, z ), y, z ], [ X( 0.025, z - 0.01 ), y + 0.004, z - 0.01 ], 0.0035, 0.0035, o( '#6b5a44', 0.002 ) );

		}

	}

	S.aoStep = 0.01;
	return S.build( 0.0045 );

}
