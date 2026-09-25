import * as THREE from 'three';

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _c = new THREE.Vector3();
const _f = new THREE.Vector3();

// Two stable, texel-snapped shadow cascades that follow the viewer. The lights
// themselves contribute no light (intensity 0): nature materials do their own
// shading and only read the shadow maps.
export class SunShadows {

	constructor( scene, quality ) {

		this.scene = scene;
		this.lights = [];
		this.radii = [ 42, 280 ];
		this.depth = 900;
		this.configure( quality );

	}

	configure( quality ) {

		for ( const l of this.lights ) {

			this.scene.remove( l, l.target );
			l.dispose();

		}

		this.lights = [];
		const n = quality.cascades;
		for ( let i = 0; i < n; i ++ ) {

			const l = new THREE.DirectionalLight( 0xffffff, 0 );
			l.castShadow = true;
			// on every layer: the water and effects passes sample the cascades too, and every
			// pass then shares one lighting state (three.js re-resolves each material's program
			// whenever that state changes between passes)
			l.layers.enableAll();
			const size = i === 0 ? quality.shadowSize : Math.min( quality.shadowSize, 2048 );
			l.shadow.mapSize.set( size, size );
			const r = n === 1 ? 90 : this.radii[ i ];
			const cam = l.shadow.camera;
			cam.left = - r; cam.right = r; cam.top = r; cam.bottom = - r;
			cam.near = 1;
			cam.far = this.depth * 2;
			cam.updateProjectionMatrix();
			const texel = 2 * r / size;
			l.shadow.bias = - 0.00004 * ( i + 1 ) * ( i + 1 );
			l.shadow.normalBias = texel * 1.2;
			l.shadow.radius = i === 0 ? 1.6 : 1.2;
			l.userData.radius = r;
			l.userData.texel = texel;
			this.scene.add( l, l.target );
			this.lights.push( l );

		}

	}

	update( camera, lightDir ) {

		camera.getWorldDirection( _f );
		_f.y = 0;
		if ( _f.lengthSq() < 1e-6 ) _f.set( 0, 0, - 1 );
		_f.normalize();
		// light-space basis matching Object3D.lookAt for the shadow camera
		_x.crossVectors( THREE.Object3D.DEFAULT_UP, lightDir );
		if ( _x.lengthSq() < 1e-6 ) _x.set( 1, 0, 0 );
		_x.normalize();
		_y.crossVectors( lightDir, _x ).normalize();

		for ( const l of this.lights ) {

			const r = l.userData.radius;
			const texel = l.userData.texel;
			_c.copy( camera.position ).addScaledVector( _f, r * 0.55 );
			// snap the centre to the shadow-map texel grid
			const px = Math.round( _c.dot( _x ) / texel ) * texel;
			const py = Math.round( _c.dot( _y ) / texel ) * texel;
			const pz = _c.dot( lightDir );
			_c.set( 0, 0, 0 ).addScaledVector( _x, px ).addScaledVector( _y, py ).addScaledVector( lightDir, pz );
			l.target.position.copy( _c );
			l.position.copy( _c ).addScaledVector( lightDir, this.depth );
			l.target.updateMatrixWorld();
			l.updateMatrixWorld();

		}

	}

}
