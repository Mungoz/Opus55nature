import * as THREE from 'three';
import { Water } from '../world/water.js';
import { U } from '../core/uniforms.js';

// The puddles the storm leaves on the trail are painted into the ground (the terrain shader
// fills them with the sky's reflection as the rain comes). The one nearest you, within a few
// strides, is a true mirror as well: the trees over it, the sky, whoever stands by it - a small
// water laid over the painted puddle, fading out toward its rim, moved from puddle to puddle as
// you go. (One mirror pass, and only near a puddle.)
export class PuddleMirror {

	constructor( app, puddles ) {

		this.app = app;
		this.puddles = puddles || [];
		const geo = new THREE.CircleGeometry( 1, 32 );
		this.water = new Water( null, app.quality, { geometry: geo, position: new THREE.Vector3( 0, - 50, 0 ), reflectScale: 0.5, name: 'puddle', peat: 0.5, rim: 0.45, foam: 0 } );
		const w = this.water;
		// still, shallow water under your feet: hardly any distortion, the normal map fine-grained
		w.uniforms.size.value = 4;
		w.uniforms.distortionScale.value = 0.02;
		w.uniforms.uCalm.value = 1;
		w.reflectOnly.push( app.terrain.mesh );
		app.addWater( w );
		w.mesh.visible = false;
		this.current = null;
		this.range = 16;

	}

	update() {

		const w = this.water, fill = U.uPuddle?.value ?? 0;
		const c = this.app.camera.position;
		let best = null, bd = this.range;
		if ( fill > 0.12 ) for ( const p of this.puddles ) {

			const d = Math.hypot( p.x - c.x, p.z - c.z );
			if ( d < bd ) { bd = d; best = p; }

		}

		if ( ! best ) {

			w.mesh.visible = false;
			this.current = null;
			return;

		}

		// (as the painted puddle dries back from its edges, so does the mirror)
		const k = 0.8 * THREE.MathUtils.smoothstep( fill, 0.1, 0.5 );
		w.mesh.position.set( best.x, best.level, best.z );
		w.mesh.rotation.set( - Math.PI / 2, 0, best.yaw );
		w.mesh.scale.set( best.rx * k, best.rz * k, 1 );
		w.uniforms.uLevel && ( w.uniforms.uLevel.value = best.level );
		w.mesh.visible = k > 0.05;
		this.current = best;

	}

}
