import * as THREE from 'three';
import { propMaterial, LAMP } from './kit.js';
import { buildHut, HUT } from './hut.js';
import { buildJetty, buildBoat, boatWaterline, mooring, JETTY, BOAT } from './jetty.js';
import { PLACES } from '../layout.js';
import { Water } from '../../world/water.js';

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );

// A place in the world with its own frame: origin, floor height, yaw (local +z = world
// ( sin yaw, cos yaw )).
class Frame {

	constructor( x, y, z, yaw ) {

		this.x = x; this.y = y; this.z = z; this.yaw = yaw;
		this.c = Math.cos( yaw ); this.s = Math.sin( yaw );

	}

	toWorld( lx, ly, lz, out = new THREE.Vector3() ) {

		return out.set( this.x + this.c * lx + this.s * lz, this.y + ly, this.z - this.s * lx + this.c * lz );

	}

	toLocal( x, z ) {

		const dx = x - this.x, dz = z - this.z;
		return [ this.c * dx - this.s * dz, this.s * dx + this.c * dz ];

	}

}

// The story's buildings and boats: built once at load, placed in the valley, given their
// collision and decks, and the things on them to read.
export class StoryProps {

	constructor( story ) {

		this.story = story;
		this.app = story.app;
		this.material = propMaterial();
		// the boats' planks are single surfaces in places
		this.boatMaterial = propMaterial( { side: THREE.DoubleSide } );
		this.group = new THREE.Group();
		this.group.name = 'story-props';

	}

	build() {

		this._jetty();
		this._hut();
		this._boats();
		this.app.scene.add( this.group );

	}

	_mesh( geo, mat = this.material, name = '' ) {

		const m = new THREE.Mesh( geo, mat );
		m.castShadow = m.receiveShadow = true;
		m.name = name;
		return m;

	}

	// ------------------------------------------------------------------ the jetty
	_jetty() {

		const td = this.app.terrainData, P = PLACES.jetty;
		const f = this.jettyFrame = new Frame( P.x, 0, P.z, P.yaw );
		const bed = ( lx, lz ) => {

			const w = f.toWorld( lx, 0, lz );
			return td.heightAt( w.x, w.z );

		};

		const { geometry, info } = buildJetty( bed, { lamp: false } );
		this.jettyInfo = info;
		const mesh = this._mesh( geometry, this.material, 'jetty' );
		mesh.position.set( f.x, 0, f.z );
		mesh.rotation.y = f.yaw;
		this.group.add( mesh );
		this.jetty = mesh;
		// the lantern's glass, separately: dark until someone lights it
		this.lamp = f.toWorld( info.lamp.x, info.lamp.y, info.lamp.z );
		// decks: the walk and the head
		const C = this.story.collision, { LEN, W, DECK, HW, HD } = JETTY;
		const z0 = info.z0 - 0.4;
		const walk = f.toWorld( 0, 0, ( z0 + LEN - HD ) / 2 ), head = f.toWorld( 0, 0, LEN - HD / 2 );
		C.deck( walk.x, walk.z, W / 2 + 0.02, ( LEN - HD - z0 ) / 2 + 0.05, f.yaw, DECK, 'jetty' );
		C.deck( head.x, head.z, HW / 2 + 0.02, HD / 2, f.yaw, DECK, 'jetty' );
		// the abutment and its steps down to the strand: a ramp from the deck to the ground
		const ab = f.toWorld( 0, 0, info.z0 - 1.1 );
		const gEnd = bed( 0, info.z0 - 1.9 );
		C.deck( ab.x, ab.z, W / 2 + 0.05, 0.85, f.yaw, ( lx, lz ) => THREE.MathUtils.lerp( gEnd, DECK, THREE.MathUtils.clamp( ( lz + 0.85 ) / 1.7, 0, 1 ) ), 'jetty' );
		// the lamp post, the bollards
		const post = f.toWorld( JETTY.HW / 2 - 0.08 - 0.3, 0, LEN - 0.08 );
		C.circle( post.x, post.z, 0.1, 'jetty' );
		// the boat-log box on its post by the abutment
		const lb = f.toWorld( info.logBox.x, info.logBox.y, info.logBox.z );
		C.circle( lb.x, lb.z, 0.12, 'jetty' );
		this.logBox = lb;
		this.berth = f.toWorld( info.berth.x, 0, info.berth.z );
		this.bollard = f.toWorld( info.bollard.x, info.bollard.y, info.bollard.z );
		this.cleat = f.toWorld( info.cleat.x, info.cleat.y, info.cleat.z );

	}

	// ------------------------------------------------------------------ the hut
	_hut() {

		const td = this.app.terrainData, P = PLACES.hut;
		const c = Math.cos( P.yaw ), s = Math.sin( P.yaw );
		// the floor a little above the highest ground under the hut and its porch
		let hi = - 1e9;
		for ( let xl = - HUT.W / 2; xl <= HUT.W / 2; xl += 0.5 ) for ( let zl = - HUT.L / 2; zl <= HUT.L / 2 + HUT.PORCH; zl += 0.5 ) hi = Math.max( hi, td.heightAt( P.x + xl * c + zl * s, P.z - xl * s + zl * c ) );
		const f = this.hutFrame = new Frame( P.x, hi + 0.3, P.z, P.yaw );
		const ground = ( xl, zl ) => {

			const w = f.toWorld( xl, 0, zl );
			return td.heightAt( w.x, w.z ) - f.y;

		};

		const { geometry, parts } = buildHut( ground );
		const g = new THREE.Group();
		g.position.set( f.x, f.y, f.z );
		g.rotation.y = f.yaw;
		g.name = 'hut';
		g.add( this._mesh( geometry, this.material, 'hut-body' ) );
		// the door on its hinge
		const door = this._mesh( parts.door.geometry, this.material, 'hut-door' );
		const hinge = new THREE.Group();
		hinge.position.fromArray( parts.door.pivot );
		hinge.add( door );
		g.add( hinge );
		const shutOpen = this._mesh( parts.shutter.open, this.material, 'hut-shutter-open' );
		const shutShut = this._mesh( parts.shutter.shut, this.material, 'hut-shutter-shut' );
		shutShut.visible = false;
		const cover = this._mesh( parts.cover, this.material, 'hut-trough-cover' );
		g.add( shutOpen, shutShut, cover );
		this.group.add( g );
		this.hut = { group: g, hinge, shutOpen, shutShut, cover, parts, frame: f };
		// the trough's water: a small mirror, drawn only when it is near and in view
		const tw = f.toWorld( HUT.trough.x, HUT.troughWater, HUT.trough.z );
		const geo = new THREE.PlaneGeometry( 0.52, 2.42 );
		geo.rotateZ( f.yaw );
		const w = new Water( null, this.app.quality, { geometry: geo, position: tw, reflectScale: 1, fallback: this.app.water, farDist: 60, name: 'trough' } );
		w.uniforms.size.value = 3.5;
		// still water a metre away: barely any distortion (the lake's is scaled for distance)
		w.uniforms.distortionScale.value = 0.03;
		w.uniforms.uCalm.value = 1;
		w.reflectOnly.push( this.app.terrain.mesh );
		this.app.addWater( w );
		this.troughWater = w;
		this.troughPos = tw;
		// collision: the walls (the porch posts and the trough too), the woodpile under the east
		// eave, the pen fence, the log pile, the chopping block
		const C = this.story.collision;
		const box = ( lx, lz, hx, hz ) => {

			const w2 = f.toWorld( lx, 0, lz );
			C.box( w2.x, w2.z, hx, hz, f.yaw, 'hut' );

		};

		box( 0, 0, HUT.W / 2 + 0.08, HUT.L / 2 + 0.08 );
		box( HUT.trough.x, HUT.trough.z, 0.38, 1.35 );
		box( HUT.W / 2 + 0.33, 0, 0.3, HUT.L / 2 - 0.3 );
		for ( const x of [ - HUT.W / 2 + 0.1, HUT.W / 2 - 0.1 ] ) {

			const p = f.toWorld( x, 0, HUT.L / 2 + HUT.PORCH - 0.12 );
			C.circle( p.x, p.z, 0.12, 'hut' );

		}

		const pen = [ [ - HUT.W / 2 - 0.2, - HUT.L / 2 - 0.2 ], [ - HUT.W / 2 - 2.5, - HUT.L / 2 - 8.5 ], [ HUT.W / 2 + 5.5, - HUT.L / 2 - 10.5 ], [ HUT.W / 2 + 6.5, - HUT.L / 2 - 3.5 ], [ HUT.W / 2 + 4.2, - HUT.L / 2 - 0.2 ] ].map( ( [ x, z ] ) => {

			const p = f.toWorld( x, 0, z );
			return [ p.x, p.z ];

		} );
		C.polyline( pen, 0.08, 'fence' );
		box( HUT.W / 2 + 2.2, - HUT.L / 2 - 1.5, 0.8, 2.2 );
		const blk = f.toWorld( HUT.W / 2 + 1.1, 0, HUT.L / 2 + 0.9 );
		C.circle( blk.x, blk.z, 0.25, 'hut' );
		// the porch floor
		const pc = f.toWorld( 0, 0, HUT.L / 2 + HUT.PORCH / 2 + 0.02 );
		C.deck( pc.x, pc.z, HUT.W / 2 + 0.15, HUT.PORCH / 2 + 0.05, f.yaw, f.y - 0.04, 'hut' );
		const step = f.toWorld( - 0.4, 0, HUT.L / 2 + HUT.PORCH + 0.45 );
		const gs = td.heightAt( step.x, step.z );
		C.deck( step.x, step.z, 0.55, 0.3, f.yaw, Math.max( gs, ( gs + f.y - 0.04 ) / 2 ), 'hut' );
		// under the porch roof: out of the rain
		this.porch = { frame: f, x0: - HUT.W / 2 - 0.3, x1: HUT.W / 2 + 0.3, z0: HUT.L / 2 - 0.2, z1: HUT.L / 2 + HUT.PORCH + 0.2 };
		this.bookTin = f.toWorld( - 0.05, 1.3, HUT.L / 2 + 0.07 );
		this.door = f.toWorld( HUT.door.x, 0, HUT.door.z );

	}

	underPorch( x, z ) {

		const p = this.porch;
		if ( ! p ) return false;
		const [ lx, lz ] = p.frame.toLocal( x, z );
		return lx > p.x0 && lx < p.x1 && lz > p.z0 && lz < p.z1;

	}

	setDoor( open ) { this.hut.hinge.rotation.y = open ? 1.65 : 0; }

	setShutter( open ) { this.hut.shutOpen.visible = open; this.hut.shutShut.visible = ! open; }

	setTroughCover( on ) { this.hut.cover.visible = on; }

	// ------------------------------------------------------------------ the boats
	_boats() {

		this.boatGeo = buildBoat();
		this.waterline = boatWaterline();
		this.lidMat = new THREE.MeshBasicMaterial( { colorWrite: false, side: THREE.DoubleSide } );
		// yours: moored alongside the jetty's head (the row-in brings it there)
		this.boat = this._boat( 'boat' );
		this.placeBoat( this.boat, this.berth.x, this.berth.z, this.jettyFrame.yaw + 0.04, { roll: 0.015 } );
		// J.'s: upturned in the reeds of the west strand, a strake stove in
		const J = PLACES.boatJ;
		const jb = this._mesh( this.boatGeo, this.boatMaterial, 'boat-j' );
		const td = this.app.terrainData;
		const ax = Math.sin( J.yaw ), az = Math.cos( J.yaw );
		const hb = td.heightAt( J.x - ax * 2, J.z - az * 2 ), hf = td.heightAt( J.x + ax * 2, J.z + az * 2 );
		jb.position.set( J.x, Math.max( hb, hf, - 0.25 ) + 0.62, J.z );
		jb.rotation.set( Math.atan2( hf - hb, 4 ) * 0.8, J.yaw, Math.PI - 0.12, 'YXZ' );
		this.group.add( jb );
		this.boatJ = jb;
		this.story.collision.capsule( J.x - ax * 2.2, J.z - az * 2.2, J.x + ax * 2.2, J.z + az * 2.2, 0.62, 'boatJ' );

	}

	_boat( name ) {

		const b = this._mesh( this.boatGeo, this.boatMaterial, name );
		// a depth-only lid at the waterline, drawn after the boat, keeps the lake out of the hull
		const lid = new THREE.Mesh( this.waterline, this.lidMat );
		lid.renderOrder = 10;
		lid.name = name + '-lid';
		this.group.add( b, lid );
		return { mesh: b, lid, rope: null };

	}

	placeBoat( b, x, z, yaw, { roll = 0, pitch = 0, y = - BOAT.draft } = {} ) {

		b.mesh.position.set( x, y, z );
		b.mesh.rotation.set( pitch, yaw, roll, 'YXZ' );
		b.lid.position.copy( b.mesh.position );
		b.lid.rotation.copy( b.mesh.rotation );
		b.lid.visible = y < 0.05;

	}

	// the mooring line from the bow ring to the bollard
	moor( b ) {

		b.mesh.updateMatrixWorld( true );
		const ring = V( 0, 0.66, BOAT.L / 2 - 0.02 ).applyMatrix4( b.mesh.matrixWorld );
		const post = this.bollard.clone().add( V( 0, 0, 0 ) );
		if ( b.rope ) this.group.remove( b.rope );
		b.rope = this._mesh( mooring( ring, post ), this.material, 'mooring' );
		this.group.add( b.rope );

	}

	lightLamp( on ) {

		LAMP.value.set( this.lamp.x, this.lamp.y, this.lamp.z, on ? 1.6 : 0 );

	}

}

export { LAMP };
