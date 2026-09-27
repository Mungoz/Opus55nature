import * as THREE from 'three';
import { propMaterial, streamMaterial, LAMP, INSIDE, ROOM, ROOM_SIZE, ROOM_PITCH, LAMP2, ROOM2, ROOM2_SIZE, ROOM2_PITCH, M, col } from './kit.js';

const LAMP_INSIDE = 2.2; // the hut's storm lantern
import { buildHut, HUT } from './hut.js';
import { buildJetty, buildBoat, boatWaterline, mooring, ring, JETTY, BOAT, rope as ropeTo } from './jetty.js';
import { buildBridge } from './bridge.js';
import { buildFence, buildSignpost, buildCross, cairn, buildBlazes, paintedMaterial } from './extra.js';
import { buildBoots } from './boots.js';
import { creatureMaterial } from '../../fauna/creature.js';
import { Kit } from './kit.js';
import { Glow } from './glow.js';
import { PLACES, BOARDWALK, BANKS } from '../layout.js';
import { buildBoardwalk } from './boardwalk.js';
import { buildStand } from './stand.js';
import { buildLodge } from './lodge.js';
import { buildShrine } from './shrine.js';
import { buildClearing, buildGullyBridge } from './clearing.js';
import { buildCamp, buildKiln } from './camp.js';
import { drawValleyMap } from './map.js';
import { woodsAt } from '../layout.js';
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
		this._bridge();
		this._hut();
		this._topGate();
		this._gully();
		this._woods();
		this._boats();
		this._fence();
		this._junction();
		this._wayside();
		this._boardwalk();
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

	// ------------------------------------------------------------------ the boardwalk
	_boardwalk() {

		const td = this.app.terrainData;
		const bw = this.boardwalk = buildBoardwalk( BOARDWALK, ( x, z ) => td.heightAt( x, z ) );
		this.group.add( this._mesh( bw.geometry, this.material, 'boardwalk' ) );
		const C = this.story.collision;
		for ( const d of bw.decks ) C.deck( d.x, d.z, d.hx, d.hz, d.yaw, d.y, 'boardwalk' );

	}

	// ------------------------------------------------------------------ the footbridge
	_bridge() {

		const td = this.app.terrainData, P = PLACES.bridge;
		const mx = ( P.a[ 0 ] + P.b[ 0 ] ) / 2, mz = ( P.a[ 1 ] + P.b[ 1 ] ) / 2;
		// the stream here: its surface and half-width
		let best = null, bd = Infinity;
		for ( const s of td.river ) {

			const d = ( s.p.x - mx ) ** 2 + ( s.p.y - mz ) ** 2;
			if ( d < bd ) { bd = d; best = s; }

		}

		const yaw = Math.atan2( P.b[ 0 ] - P.a[ 0 ], P.b[ 1 ] - P.a[ 1 ] );
		// centred between its two ends (where the path meets it), at the water's level there
		const f = this.bridgeFrame = new Frame( mx, best.surf, mz, yaw );
		const len = Math.hypot( P.b[ 0 ] - P.a[ 0 ], P.b[ 1 ] - P.a[ 1 ] ) + 1.0;
		const ground = ( lx, lz ) => {

			const w = f.toWorld( lx, 0, lz );
			return td.heightAt( w.x, w.z ) - f.y;

		};

		const { geometry, info } = buildBridge( ground, { w: best.width, len } );
		const mesh = this._mesh( geometry, this.material, 'bridge' );
		mesh.position.set( f.x, f.y, f.z );
		mesh.rotation.y = yaw;
		this.group.add( mesh );
		this.bridge = { mesh, info, frame: f };
		// the deck, ramps up onto it from each bank, the rails
		const C = this.story.collision, dy = f.y + info.deckY;
		C.deck( f.x, f.z, 0.66, info.half, yaw, dy, 'bridge' );
		for ( const sgn of [ - 1, 1 ] ) {

			const c = f.toWorld( 0, 0, sgn * ( info.half + 0.7 ) );
			const g = td.heightAt( c.x, c.z );
			C.deck( c.x, c.z, 0.7, 0.75, yaw, ( lx, lz ) => THREE.MathUtils.lerp( dy, Math.min( dy, g ), THREE.MathUtils.clamp( ( lz * sgn + 0.75 ) / 1.5, 0, 1 ) ), 'bridge' );

		}

		for ( const xs of [ - 1, 1 ] ) {

			const a = f.toWorld( xs * 0.78, 0, - info.half + 0.6 ), b = f.toWorld( xs * 0.78, 0, info.half - 0.6 );
			C.capsule( a.x, a.z, b.x, b.z, 0.08, 'bridge' );

		}

		// a gate across the deck at the hut's end, standing open as you come (it swings shut
		// behind you: there is no going back over the stream)
		{

			const H = PLACES.hut, e0 = f.toWorld( 0, 0, - info.half ), e1 = f.toWorld( 0, 0, info.half );
			const hs = Math.hypot( e1.x - H.x, e1.z - H.z ) < Math.hypot( e0.x - H.x, e0.z - H.z ) ? 1 : - 1;
			const lz = hs * ( info.half - 0.85 );
			const p0 = f.toWorld( - 0.74, 0, lz ), p1 = f.toWorld( 0.74, 0, lz );
			const { geometry: gf, gate } = buildFence( () => dy, [ [ p0.x, p0.z ], [ p1.x, p1.z ] ], 0, 17 );
			this.group.add( this._mesh( gf, this.material, 'bridge-gate-posts' ) );
			const hinge = new THREE.Group();
			hinge.position.copy( gate.hinge );
			hinge.add( this._mesh( gate.geometry, this.material, 'bridge-gate' ) );
			this.group.add( hinge );
			// (open: swung back toward the hut, lying along the rail)
			const open = hs;
			this.bridgeGate = { hinge, yaw: gate.yaw, open: 1, dir: open, pos: new THREE.Vector3( ( p0.x + p1.x ) / 2, dy + 1, ( p0.z + p1.z ) / 2 ), latch: gate.latch, tag: 'bgate' };
			hinge.rotation.y = gate.yaw + 1.75 * open;
			C.circle( p0.x, p0.z, 0.1, 'bridge' );
			C.circle( p1.x, p1.z, 0.1, 'bridge' );

		}

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
		const coverOff = this._mesh( parts.coverOff, this.material, 'hut-trough-boards-off' );
		coverOff.visible = false;
		const lamp = this._mesh( parts.lamp, this.material, 'hut-lantern' );
		lamp.castShadow = false;
		const key = this._mesh( parts.key, this.material, 'hut-key' );
		g.add( shutOpen, shutShut, cover, coverOff, lamp, key );
		// J. nailed a sack over the front window, on the inside of the open shutter
		{

			const [ wx, wy, wz, ww, wh ] = parts.window;
			const c = document.createElement( 'canvas' );
			c.width = 128; c.height = 128;
			const cg = c.getContext( '2d' );
			cg.fillStyle = '#7a6a52';
			cg.fillRect( 0, 0, 128, 128 );
			// hessian: a coarse weave, stains, a torn corner
			for ( let i = 0; i < 128; i += 2 ) {

				cg.fillStyle = `rgba(40,30,20,${0.1 + Math.random() * 0.1})`;
				cg.fillRect( i, 0, 1, 128 );
				cg.fillRect( 0, i, 128, 1 );

			}

			for ( let i = 0; i < 9; i ++ ) {

				cg.fillStyle = `rgba(35,25,15,${Math.random() * 0.3})`;
				cg.beginPath(); cg.arc( Math.random() * 128, Math.random() * 128, 8 + Math.random() * 25, 0, 7 ); cg.fill();

			}

			cg.clearRect( 100, 104, 28, 24 );
			const tex = new THREE.CanvasTexture( c );
			tex.colorSpace = THREE.SRGBColorSpace;
			const geo = new THREE.PlaneGeometry( ww, wh, 6, 6 );
			const p = geo.getAttribute( 'position' );
			// it sags between the nails at its corners
			for ( let i = 0; i < p.count; i ++ ) {

				const u = p.getX( i ) / ww * 2, v = p.getY( i ) / wh * 2;
				p.setZ( i, 0.012 * ( 1 - u * u ) * ( 1 - v * v ) );
				p.setY( i, p.getY( i ) - 0.02 * ( 1 - u * u ) * ( 1 + v ) * 0.5 );

			}

			geo.computeVertexNormals();
			const cloth = new THREE.Mesh( geo, paintedMaterial( tex, { side: THREE.DoubleSide, rough: 0.95 } ) );
			cloth.position.set( wx, wy, wz - 0.06 );
			cloth.receiveShadow = true;
			g.add( cloth );

		}
		this.group.add( g );
		this.hut = { group: g, hinge, shutOpen, shutShut, cover, coverOff, lamp, key, parts, frame: f };
		this.keyPos = f.toWorld( HUT.key.x, HUT.key.y, HUT.key.z );
		this.lampPos = f.toWorld( HUT.lamp.x, HUT.lamp.y, HUT.lamp.z );
		// the room, for the shader: sun and sky kept out of it
		ROOM.value.set( f.x, f.z, f.c, f.s );
		// (out to the middle of the walls, where the chinking is: the logs' faces in the gaps between
		// them, seen from inside, are inside)
		ROOM_SIZE.value.set( HUT.room.x1 + 0.075, HUT.room.z1 + 0.075, f.y - 0.3, f.y + HUT.RIDGE + 0.085 );
		ROOM_PITCH.value = HUT.pitch;
		// the trough's water: a small mirror, drawn only when it is near and in view
		const tw = f.toWorld( HUT.trough.x, HUT.troughWater, HUT.trough.z );
		const geo = new THREE.PlaneGeometry( 0.52, 2.42 );
		geo.rotateZ( f.yaw );
		const w = new Water( null, this.app.quality, { geometry: geo, position: tw, reflectScale: 1, fallback: this.app.water, farDist: 60, name: 'trough', peat: 1 } );
		w.uniforms.size.value = 3.5;
		// still water a metre away: barely any distortion (the lake's is scaled for distance)
		w.uniforms.distortionScale.value = 0.03;
		w.uniforms.uCalm.value = 1;
		w.reflectOnly.push( this.app.terrain.mesh );
		this.app.addWater( w );
		this.troughWater = w;
		this.troughPos = tw;
		this.troughLocal = HUT.trough;
		this.troughWaterOn = true;
		// the feed pipe running: a thin stream from its mouth, curving a little as it falls, into
		// the trough; rings where it lands
		{

			const mouth = f.toWorld( HUT.troughPipe.x, HUT.troughPipe.y, HUT.troughPipe.z );
			const back = f.toWorld( HUT.troughPipe.x - 0.3, HUT.troughPipe.y, HUT.troughPipe.z + 0.13 );
			const dx = mouth.x - back.x, dz = mouth.z - back.z, dl = Math.hypot( dx, dz );
			const h = mouth.y - tw.y;
			const geo = new THREE.CylinderGeometry( 0.009, 0.013, h, 6, 10, true );
			geo.translate( 0, - h / 2, 0 );
			const p = geo.getAttribute( 'position' );
			for ( let i = 0; i < p.count; i ++ ) {

				// thrown out of the pipe at half a metre a second, falling
				const off = 0.5 * Math.sqrt( 2 * Math.max( 0, - p.getY( i ) ) / 9.8 );
				p.setX( i, p.getX( i ) + dx / dl * off );
				p.setZ( i, p.getZ( i ) + dz / dl * off );

			}

			geo.computeVertexNormals();
			const m = new THREE.Mesh( geo, streamMaterial() );
			m.position.copy( mouth );
			m.name = 'spout';
			this.group.add( m );
			const land = 0.5 * Math.sqrt( 2 * h / 9.8 );
			this.spout = { pos: new THREE.Vector3( mouth.x + dx / dl * land, tw.y, mouth.z + dz / dl * land ), next: 0 };

		}
		// a second door, swung open, that only the water shows (layer 7: reflections only)
		const ghostHinge = new THREE.Group();
		ghostHinge.position.fromArray( parts.door.pivot );
		ghostHinge.rotation.y = 1.65;
		const ghostDoor = new THREE.Mesh( parts.door.geometry, this.material );
		ghostDoor.layers.set( 7 );
		ghostHinge.add( ghostDoor );
		g.add( ghostHinge );
		this.hut.ghostDoor = ghostDoor;
		this.hut.ghostHinge = ghostHinge;
		// collision: the walls (the porch posts and the trough too), the woodpile under the east
		// eave, the pen fence, the log pile, the chopping block
		const C = this.story.collision;
		const box = ( lx, lz, hx, hz ) => {

			const w2 = f.toWorld( lx, 0, lz );
			C.box( w2.x, w2.z, hx, hz, f.yaw, 'hut' );

		};

		// the walls, with the doorway open (you can go in: "you can't see inside the hut")
		{

			const hw = HUT.W / 2 - 0.075, hl = HUT.L / 2 - 0.075;
			const seg = ( ax, az, bx, bz, r = 0.1 ) => {

				const a = f.toWorld( ax, 0, az ), b = f.toWorld( bx, 0, bz );
				C.capsule( a.x, a.z, b.x, b.z, r, 'hut' );

			};

			seg( - hw, - hl, hw, - hl );
			seg( - hw, - hl, - hw, hl );
			seg( hw, - hl, hw, hl );
			seg( - hw, hl, - 1.31, hl, 0.06 );
			seg( - 0.29, hl, hw, hl, 0.06 );
			// the floor, a step up from the porch; the furniture
			const fc = f.toWorld( 0, 0, 0 );
			C.deck( fc.x, fc.z, hw - 0.05, hl - 0.05, f.yaw, f.y, 'hutfloor' );
			for ( const [ lx, lz, hx, hz ] of HUT.furniture ) box( lx, lz, hx, hz );

		}
		// the crossed log ends standing out at the corners
		for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) {

			const p = f.toWorld( sx * HUT.W / 2, 0, sz * HUT.L / 2 );
			C.circle( p.x, p.z, 0.42, 'hut' );

		}
		{

			const w2 = f.toWorld( HUT.trough.x, 0, HUT.trough.z );
			C.box( w2.x, w2.z, 0.38, 1.35, f.yaw, 'trough' );

		}
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
		// down off the porch: the steps along its whole front, a tread at a time
		const ST = HUT.steps;
		if ( ST && ST.n > 1 ) {

			const half = ( ST.n - 1 ) * ST.tread / 2;
			const sc = f.toWorld( 0, 0, ST.z0 + half );
			C.deck( sc.x, sc.z, HUT.W / 2 + 0.15, half + 0.03, f.yaw, ( lx, lz ) => f.y + ST.fy - ( 1 + THREE.MathUtils.clamp( Math.floor( ( lz + half ) / ST.tread ), 0, ST.n - 2 ) ) * ST.rise, 'hut' );

		}

		// (and up its sides, where they stand clear of the ground, there is no way: the steps are)
		for ( const sx of [ - 1, 1 ] ) {

			const a = f.toWorld( sx * ( HUT.W / 2 + 0.2 ), 0, HUT.L / 2 + 0.1 ), b = f.toWorld( sx * ( HUT.W / 2 + 0.2 ), 0, HUT.L / 2 + HUT.PORCH + 0.05 );
			const m = f.toWorld( sx * ( HUT.W / 2 + 0.45 ), 0, HUT.L / 2 + HUT.PORCH / 2 );
			if ( td.heightAt( m.x, m.z ) < f.y - 0.3 ) C.capsule( a.x, a.z, b.x, b.z, 0.08, 'hut' );

		}
		// under the porch roof: out of the rain
		this.porch = { frame: f, x0: - HUT.W / 2 - 0.3, x1: HUT.W / 2 + 0.3, z0: HUT.L / 2 - 0.2, z1: HUT.L / 2 + HUT.PORCH + 0.2 };
		// no rain falls under the roof (over the hut and its porch, out to the eaves)
		{

			const zc = ( - HUT.L / 2 - 0.7 + HUT.L / 2 + HUT.PORCH + 0.35 ) / 2, hz = ( HUT.L + HUT.PORCH + 1.05 ) / 2;
			const c = f.toWorld( 0, 0, zc );
			const U = this.app.weather.rainUniforms;
			U.uShelter.value.set( c.x, c.z, HUT.W / 2 + 0.85, hz );
			U.uShelterB.value.set( Math.cos( f.yaw ), Math.sin( f.yaw ), f.y + HUT.EAVE - 0.05, 1 );

		}
		this.bookTin = f.toWorld( - 0.05, 1.3, HUT.L / 2 + 0.07 );
		this.door = f.toWorld( HUT.door.x, 0, HUT.door.z );
		// standing in the doorway, on the threshold
		this.doorway = f.toWorld( HUT.door.x, 0, HUT.door.z + 0.15 );

	}

	// ------------------------------------------------------------------ the pasture fence and gate
	_fence() {

		const td = this.app.terrainData;
		const ground = ( x, z ) => td.heightAt( x, z );
		const pts = [ [ 68.5, 639 ], [ 74, 639.6 ], [ 81, 640.4 ], [ 87, 641.2 ], [ 90.6, 641.8 ], [ 93.9, 642.2 ], [ 100, 643 ], [ 108, 644 ], [ 117, 645 ], [ 128, 646 ], [ 142, 647.5 ] ];
		const { geometry, gate } = buildFence( ground, pts, 4 );
		this.group.add( this._mesh( geometry, this.material, 'fence' ) );
		const C = this.story.collision;
		C.polyline( pts.slice( 0, 5 ), 0.09, 'fence' );
		C.polyline( pts.slice( 5 ), 0.09, 'fence' );
		const [ ax, az ] = pts[ 4 ], [ bx, bz ] = pts[ 5 ];
		C.capsule( ax, az, bx, bz, 0.1, 'gate' );
		const hinge = new THREE.Group();
		hinge.position.copy( gate.hinge );
		hinge.rotation.y = gate.yaw;
		hinge.add( this._mesh( gate.geometry, this.material, 'gate' ) );
		this.group.add( hinge );
		this.gate = { hinge, yaw: gate.yaw, open: 0, pos: new THREE.Vector3( ( ax + bx ) / 2, gate.hinge.y + 1, ( az + bz ) / 2 ), latch: gate.latch };

	}

	// A prop from one of the builders (build( ground ) -> { geometry, parts, info }) put down
	// at x, z facing yaw: its mesh, its moving parts as meshes of their own, its collision; and
	// W( [ lx, ly, lz ] ) for its info's points in the world
	_placeProp( build, x, z, yaw, name ) {

		const td = this.app.terrainData;
		const f = new Frame( x, td.heightAt( x, z ), z, yaw );
		const ground = ( lx, lz ) => { const w = f.toWorld( lx, 0, lz ); return td.heightAt( w.x, w.z ) - f.y; };
		const out = build( ground );
		const g = new THREE.Group();
		g.position.set( f.x, f.y, f.z );
		g.rotation.y = yaw;
		g.name = name;
		g.add( this._mesh( out.geometry, this.material, name ) );
		const parts = {};
		for ( const [ k, geo ] of Object.entries( out.parts || {} ) ) {

			if ( ! geo?.isBufferGeometry ) continue;
			parts[ k ] = this._mesh( geo, this.material, name + '-' + k );
			g.add( parts[ k ] );

		}

		this.group.add( g );
		g.updateMatrixWorld( true );
		const info = out.info || {};
		for ( const [ cx, cz, hx, hz ] of info.collision || [] ) {

			const w = f.toWorld( cx, 0, cz );
			this.story.collision.box( w.x, w.z, hx, hz, yaw, name );

		}

		const W = ( p ) => f.toWorld( p[ 0 ], p[ 1 ] ?? 0, p[ 2 ] ?? p[ 1 ] );
		return { frame: f, group: g, parts, info, W, out };

	}

	// the Black Wood's places (HORROR_PLAN 16.2)
	_woods() {

		// the hunting stand over the glade: the shed key up in it, the hunter's log, binoculars
		const P = PLACES.stand;
		this.stand = this._placeProp( buildStand, P.x, P.z, P.yaw, 'stand' );
		this._lodge();
		this._plaque();
		this._poster();
		// the wayside shrine at the wood's edge: candles lit, J.'s photograph on the post, a card
		const Sh = PLACES.shrine;
		this.shrine = this._placeProp( buildShrine, Sh.x, Sh.z, Sh.yaw, 'shrine' );
		this.shrine.parts.flames.castShadow = false;
		// the woodcutters' clearing (the planks), the camp, the charcoal burners'
		const Cl = PLACES.clearing, Ca = PLACES.camp, Ki = PLACES.kiln;
		this.clearing = this._placeProp( buildClearing, Cl.x, Cl.z, Cl.yaw, 'clearing' );
		this.camp = this._placeProp( buildCamp, Ca.x, Ca.z, Ca.yaw, 'camp' );
		this.kiln = this._placeProp( buildKiln, Ki.x, Ki.z, Ki.yaw, 'kiln' );
		this._gullyBridge();

	}

	// the forester's lodge, its lamp lit and its door ajar, and the padlocked shed with the oars
	_lodge() {

		const P = PLACES.lodge, C = this.story.collision;
		const L = this.lodge = this._placeProp( buildLodge, P.x, P.z, P.yaw, 'lodge' );
		const I = L.info, f = L.frame;
		// the doors on their hinges: the lodge's standing open, the shed's shut
		const hang = ( mesh, pivot, rot ) => {

			const h = new THREE.Group();
			h.position.fromArray( pivot );
			L.group.remove( mesh );
			h.add( mesh );
			h.rotation.y = rot;
			L.group.add( h );
			return h;

		};

		L.doorHinge = hang( L.parts.door, I.doorPivot, I.doorOpen * 0.8 );
		L.shedHinge = hang( L.parts.shedDoor, I.shedPivot, 0 );
		// walls with their doorways open; the furniture; outside, the bench and the woodpile
		const seg = ( [ ax, az, bx, bz ], r, tag ) => {

			const a = f.toWorld( ax, 0, az ), b = f.toWorld( bx, 0, bz );
			C.capsule( a.x, a.z, b.x, b.z, r, tag );

		};

		for ( const w of I.walls ) seg( w, I.wallT / 2 + 0.04, 'lodge' );
		for ( const w of I.shedWalls ) seg( w, 0.07, 'lodge' );
		for ( const [ cx, cz, hx, hz ] of [ ...( I.furniture || [] ), ...( I.solids || [] ), ...( I.shedFurniture || [] ) ] ) {

			const w = f.toWorld( cx, 0, cz );
			C.box( w.x, w.z, hx, hz, f.yaw, 'lodge' );

		}

		// the shed's door shut: its doorway closed
		const sd = I.shedWalls[ 3 ], se = I.shedWalls[ 4 ];
		seg( [ sd[ 2 ], sd[ 3 ], se[ 0 ], se[ 1 ] ], 0.06, 'sheddoor' );
		// floors: the room, the porch and its steps, the shed
		const deck = ( x0, x1, z0, z1, y, tag ) => {

			const c = f.toWorld( ( x0 + x1 ) / 2, 0, ( z0 + z1 ) / 2 );
			C.deck( c.x, c.z, ( x1 - x0 ) / 2, ( z1 - z0 ) / 2, f.yaw, y, tag );

		};

		const Rm = I.room;
		deck( Rm.x0, Rm.x1, Rm.z0, Rm.z1, f.y + Rm.floorY, 'lodgefloor' );
		if ( I.porch ) deck( I.porch.x0, I.porch.x1, I.porch.z0, I.porch.z1, f.y + I.porch.y, 'lodgefloor' );
		if ( I.steps && I.steps.n > 1 ) {

			const St = I.steps, half = ( St.n - 1 ) * St.tread / 2;
			const c = f.toWorld( ( St.x0 + St.x1 ) / 2, 0, St.z0 + half );
			C.deck( c.x, c.z, ( St.x1 - St.x0 ) / 2, half + 0.03, f.yaw, ( lx, lz ) => f.y + St.top - ( 1 + THREE.MathUtils.clamp( Math.floor( ( lz + half ) / St.tread ), 0, St.n - 2 ) ) * St.rise, 'hut' );

		}

		const sw = I.shedWalls;
		deck( Math.min( sw[ 0 ][ 0 ], sw[ 0 ][ 2 ] ) + 0.05, Math.max( sw[ 0 ][ 0 ], sw[ 0 ][ 2 ] ) - 0.05, Math.min( sw[ 1 ][ 1 ], sw[ 1 ][ 3 ] ) + 0.05, Math.max( sw[ 1 ][ 1 ], sw[ 1 ][ 3 ] ) - 0.05, f.y + I.shedFloorY, 'lodgefloor' );
		// the room kept out of the sun and the sky, lit by its lamp
		ROOM2.value.set( f.x + f.s * ( Rm.z0 + Rm.z1 ) / 2 + f.c * ( Rm.x0 + Rm.x1 ) / 2, f.z + f.c * ( Rm.z0 + Rm.z1 ) / 2 - f.s * ( Rm.x0 + Rm.x1 ) / 2, f.c, f.s );
		ROOM2_SIZE.value.set( ( Rm.x1 - Rm.x0 ) / 2 + I.wallT / 2, ( Rm.z1 - Rm.z0 ) / 2 + I.wallT / 2, f.y + Rm.floorY - 0.3, f.y + Rm.ridge );
		ROOM2_PITCH.value = Rm.pitch;
		const lamp = L.W( I.lamp );
		LAMP2.value.set( lamp.x, lamp.y + 0.1, lamp.z, 1.6 );
		L.lampAt = lamp;
		// the map on the wall: the valley, the path pencilled on it, the lodge crossed
		{

			const path = this.story.path, ids = path.ids, at = ( id ) => path.at( ids[ id ] );
			const H = PLACES.hut, T = PLACES.tarn;
			const marks = [
				{ x: H.x, z: H.z, label: 'Hut' }, { x: T.x, z: T.z, label: 'Tarn', dy: 26 },
				{ x: - 162, z: 772, label: 'Falls', dx: - 60 }, { ...at( 'wood' ), label: 'felling', dx: 14 },
				{ ...at( 'gully' ), label: 'bridge (closed)', dx: 14, dy: 22 }, { x: - 58, z: 540, ring: 20, label: 'J. ?', dx: 26, dy: 4 },
				{ ...at( 'stand' ), label: 'stand 3', dx: 14 }, { x: P.x, z: P.z, cross: true, label: 'here', dx: - 70, dy: 6 },
				{ ...at( 'camp' ), label: '', dx: 0 }, { ...at( 'strand' ), label: 'boathouse / boat', dx: 14 },
			];
			const m = drawValleyMap( this.app.terrainData, path, marks, woodsAt, [ - 300, 380, 0, 800 ] );
			L.mapCanvas = m.canvas;
			L.parts.map.material = paintedMaterial( m.texture, { rough: 0.8 } );

		}

		// where things are, in the world
		L.at = {};
		for ( const k of [ 'diary', 'radio', 'lamp', 'oars', 'padlock' ] ) L.at[ k ] = L.W( I[ k ] );
		L.at.map = L.W( I.map.centre );
		L.at.door = L.W( [ I.doorway[ 0 ], I.doorway[ 1 ], I.doorway[ 2 ] + 0.6 ] );
		L.at.shed = L.W( [ I.shedDoorway[ 0 ], I.shedDoorway[ 1 ] + 1, I.shedDoorway[ 2 ] + 0.3 ] );

	}

	// the plaque at the plunge pool: bronze, green at its edges, on a boulder by the path
	_plaque() {

		const P = PLACES.plaque, td = this.app.terrainData;
		const f = new Frame( P.x, td.heightAt( P.x, P.z ), P.z, P.yaw );
		const k = new Kit( ( x, z ) => { const w = f.toWorld( x, 0, z ); return td.heightAt( w.x, w.z ) - f.y; } );
		k.stone( 0, - 0.2, - 0.15, 0.75, 0.95, 0.6, '#8a857b', 17, [ 0.15, 0.3, - 0.1 ] );
		k.box( 0, 0.55, 0.36, 0.34, 0.24, 0.02, M.BRONZE, '#6b5a36', { rot: [ - 0.25, 0, 0 ], round: 0.005 } );
		for ( const [ x, y ] of [ [ - 0.14, 0.65 ], [ 0.14, 0.65 ], [ - 0.14, 0.45 ], [ 0.14, 0.45 ] ] ) k.box( x, y + 0.005, 0.372, 0.018, 0.018, 0.01, M.BRONZE, '#4a3e24', { rot: [ - 0.25, 0, 0 ] } );
		const m = this._mesh( k.build(), this.material, 'plaque' );
		m.position.set( f.x, f.y, f.z );
		m.rotation.y = P.yaw;
		this.group.add( m );
		this.story.collision.circle( f.x, f.z, 0.55, 'rock' );
		this.plaque = f.toWorld( 0, 0.55, 0.45 );

	}

	// the MISSING poster: a printed sheet nailed to a trunk, rained on, facing the path
	_poster() {

		const P = PLACES.poster, td = this.app.terrainData, path = this.story.path;
		let best = null, bd = 6;
		for ( const t of this.app.forest.trees ) {

			if ( Math.abs( t.x - P.x ) > 6 || Math.abs( t.z - P.z ) > 6 ) continue;
			const d = Math.hypot( t.x - P.x, t.z - P.z );
			if ( d < bd && this.app.forest.variants[ t.variant ].trunk ) { bd = d; best = t; }

		}

		const s = path.at( path.nearest( P.x, P.z ).d );
		const tx = best ? best.x : P.x, tz = best ? best.z : P.z;
		const r = best ? this.app.forest.variants[ best.variant ].trunk * best.s * 0.85 : 0.05;
		const nx = s.x - tx, nz = s.z - tz, nl = Math.hypot( nx, nz ) || 1;
		const yaw = Math.atan2( nx / nl, nz / nl );
		const y = td.heightAt( tx, tz ) + 1.45;
		// the sheet: a printed MISSING notice, a photograph, the rain run down it
		const c = document.createElement( 'canvas' );
		c.width = 360; c.height = 500;
		const g = c.getContext( '2d' );
		g.fillStyle = '#e8e2d2'; g.fillRect( 0, 0, 360, 500 );
		g.fillStyle = '#9a1c16'; g.font = 'bold 58px Arial, sans-serif'; g.textAlign = 'center';
		g.fillText( 'MISSING', 180, 72 );
		g.fillStyle = '#6a6660'; g.fillRect( 105, 96, 150, 180 );
		// the photograph: a man's head and shoulders, grey, a hat
		g.fillStyle = '#3a3834'; g.beginPath(); g.ellipse( 180, 176, 34, 42, 0, 0, Math.PI * 2 ); g.fill();
		g.fillRect( 122, 220, 116, 56 );
		g.fillStyle = '#2a2826'; g.fillRect( 138, 128, 84, 12 ); g.fillRect( 156, 108, 48, 24 );
		g.fillStyle = '#222'; g.font = 'bold 22px Arial, sans-serif';
		g.fillText( 'J. B., 58, herder', 180, 312 );
		g.font = '17px Arial, sans-serif';
		for ( const [ i, t ] of [ 'Alp Larchmere. Last seen 9 October', 'at the alp hut above the lake.', 'Long dark wool coat, felt hat,', 'a stick. Anyone who has seen him:', 'the police post in the village.' ].entries() ) g.fillText( t, 180, 344 + i * 24 );
		// rain streaks and a torn corner
		for ( let i = 0; i < 70; i ++ ) {

			g.fillStyle = `rgba(90,80,60,${ 0.04 + Math.random() * 0.06 })`;
			g.fillRect( Math.random() * 360, Math.random() * 200, 2 + Math.random() * 3, 80 + Math.random() * 220 );

		}

		g.clearRect( 316, 452, 44, 48 );
		const tex = new THREE.CanvasTexture( c );
		tex.colorSpace = THREE.SRGBColorSpace;
		const geo = new THREE.PlaneGeometry( 0.3, 0.42, 6, 1 );
		// (curved a little round the trunk)
		const pos = geo.getAttribute( 'position' );
		for ( let i = 0; i < pos.count; i ++ ) pos.setZ( i, - ( pos.getX( i ) ** 2 ) / ( 2 * Math.max( 0.12, r ) ) );
		geo.computeVertexNormals();
		const m = new THREE.Mesh( geo, paintedMaterial( tex, { rough: 0.9 } ) );
		m.position.set( tx + nx / nl * ( r + 0.012 ), y, tz + nz / nl * ( r + 0.012 ) );
		m.rotation.y = yaw;
		m.name = 'missing-poster';
		this.group.add( m );
		this.poster = m.position.clone();

	}

	// the gully's footbridge: its deck to walk on, a rail of stops along both sides, and the gap
	// where its middle planks are gone closed off until a plank is laid over it
	_gullyBridge() {

		const P = PLACES.gullyBridge, C = this.story.collision;
		const span = P.span;
		const B = this.gullyBridge = this._placeProp( ( ground ) => buildGullyBridge( ground, span ), P.x, P.z, P.yaw, 'gullybridge' );
		const I = B.info, f = B.frame, half = span / 2;
		B.parts.laid.visible = false;
		const yA = I.ends[ 0 ][ 1 ], yB = I.ends[ 1 ][ 1 ];
		const c = f.toWorld( 0, 0, 0 );
		C.deck( c.x, c.z, I.width / 2 + 0.05, half, f.yaw, ( lx, lz ) => f.y + yA + ( yB - yA ) * ( lz + half ) / span, 'bridge' );
		const seg = ( ax, az, bx, bz, r, tag ) => {

			const a = f.toWorld( ax, 0, az ), b = f.toWorld( bx, 0, bz );
			C.capsule( a.x, a.z, b.x, b.z, r, tag );

		};

		for ( const sx of [ - 1, 1 ] ) seg( sx * ( I.width / 2 + 0.12 ), - half + 0.4, sx * ( I.width / 2 + 0.12 ), half - 0.4, 0.08, 'gullyrail' );
		for ( const z of I.gap ) seg( - I.width / 2, z + ( z < 0 ? - 0.18 : 0.18 ), I.width / 2, z + ( z < 0 ? - 0.18 : 0.18 ), 0.08, 'gap' );
		B.gapAt = f.toWorld( 0, ( yA + yB ) / 2 + 0.6, ( I.gap[ 0 ] + I.gap[ 1 ] ) / 2 );
		B.near = [ f.toWorld( 0, yA + 1, I.gap[ 0 ] - 0.9 ), f.toWorld( 0, yB + 1, I.gap[ 1 ] + 0.9 ) ];

	}

	// the plank laid over the gap: the way across
	layPlank() {

		this.gullyBridge.parts.laid.visible = true;
		this.story.collision.remove( 'gap' );

	}

	// the shed: unlocked (the padlock gone), its door swung open, its doorway clear
	openShed() {

		const L = this.lodge;
		L.parts.padlock.visible = false;
		this.story.collision.remove( 'sheddoor' );
		const t0 = this.story.time, to = L.info.shedOpen;
		this.story.every( () => {

			const u = Math.min( 1, ( this.story.time - t0 ) / 1.6 );
			L.shedHinge.rotation.y = to * ( 1 - Math.pow( 1 - u, 2.2 ) );
			return u >= 1;

		} );

	}

	// The gully in the Black Wood (layout.BANKS, the one cut down): its rims are walls - its
	// sides are too steep to climb out of - but for the footbridge's gap where the way crosses
	_gully() {

		const g = BANKS.find( ( b ) => b.h < 0 );
		if ( ! g ) return;
		const path = this.story.path, C = this.story.collision;
		const [ ax, az ] = g.a, [ bx, bz ] = g.b, l = Math.hypot( bx - ax, bz - az );
		const ux = ( bx - ax ) / l, uz = ( bz - az ) / l, nx = - uz, nz = ux;
		const X = path.at( path.ids.gully );
		const tx = ( X.x - ax ) * ux + ( X.z - az ) * uz;
		this.gully = { a: g.a, b: g.b, cross: X, u: [ ux, uz ], n: [ nx, nz ] };
		for ( const side of [ - 1, 1 ] ) {

			const off = side * ( g.w + 1.6 );
			const run = ( t0, t1 ) => {

				const pts = [];
				for ( let t = t0; t <= t1 + 0.01; t += 4 ) pts.push( [ ax + ux * t + nx * off, az + uz * t + nz * off ] );
				C.polyline( pts, 0.25, 'gully' );

			};

			run( l * 0.08, tx - 0.95 );
			run( tx + 0.95, l * 0.92 );

		}

	}

	// The top gate. J. chained it ("Nothing comes down from the tarn now. Key on the table"): a
	// pasture fence across the valley floor behind the hut, from a few metres into the tarn to
	// the stream, the trail through a gate in it. Its key is on the hut's table.
	_topGate() {

		const td = this.app.terrainData, f = this.hutFrame;
		const ground = ( x, z ) => td.heightAt( x, z );
		// along the hut's frame at z = -28: north end in the tarn, the gate where the trail
		// crosses, the south end at the stream
		const lxs = [ 21.5, 17.5, 13.3, 9.9, 6, 0.5, - 6, - 13, - 20.5, - 28, - 35.5, - 43, - 50.5, - 57.5, - 63.5 ];
		const pts = lxs.map( ( lx, i ) => {

			const w = f.toWorld( lx, 0, - 28 + Math.sin( i * 2.3 ) * 0.5 );
			return [ w.x, w.z ];

		} );
		const gi = 2;
		const { geometry, gate } = buildFence( ground, pts, gi, 11 );
		this.group.add( this._mesh( geometry, this.material, 'top-fence' ) );
		const C = this.story.collision;
		C.polyline( pts.slice( 0, gi + 1 ), 0.09, 'fence' );
		C.polyline( pts.slice( gi + 1 ), 0.09, 'fence' );
		const [ ax, az ] = pts[ gi ], [ bx, bz ] = pts[ gi + 1 ];
		C.capsule( ax, az, bx, bz, 0.1, 'tgate' );
		const hinge = new THREE.Group();
		hinge.position.copy( gate.hinge );
		hinge.rotation.y = gate.yaw;
		hinge.add( this._mesh( gate.geometry, this.material, 'top-gate' ) );
		this.group.add( hinge );
		// it swings away from the hut (toward the tarn side)
		const lx = gate.latch.x - gate.hinge.x, lz = gate.latch.z - gate.hinge.z, a = 1.75;
		const ox = lx * Math.cos( a ) + lz * Math.sin( a ), oz = - lx * Math.sin( a ) + lz * Math.cos( a );
		const away = f.toWorld( 0, 0, - 1 ).sub( f.toWorld( 0, 0, 0 ) );
		const dir = ox * away.x + oz * away.z > 0 ? 1 : - 1;
		this.topGate = { hinge, yaw: gate.yaw, open: 0, dir, pos: new THREE.Vector3( ( ax + bx ) / 2, gate.hinge.y + 1, ( az + bz ) / 2 ), latch: gate.latch, tag: 'tgate' };
		// the chain round the gate's end and the post, and the padlock hanging from it
		const k = new Kit( ( x, z ) => ground( x, z ) );
		const L = gate.latch, ux = ( gate.hinge.x - L.x ), uz = ( gate.hinge.z - L.z ), ul = Math.hypot( ux, uz );
		const nx = uz / ul, nz = - ux / ul;
		for ( let i = 0; i < 9; i ++ ) {

			// links looped round, a little below the latch, alternating their plane
			const a2 = i / 9 * Math.PI * 2, rr = 0.09;
			const p = new THREE.Vector3( L.x + ux / ul * 0.06 + nx * Math.cos( a2 ) * rr + ux / ul * Math.sin( a2 ) * rr * 0.6, L.y - 0.08 - Math.abs( Math.sin( a2 ) ) * 0.02, L.z + uz / ul * 0.06 + nz * Math.cos( a2 ) * rr + uz / ul * Math.sin( a2 ) * rr * 0.6 );
			ring( k, p, i % 2 ? new THREE.Vector3( 0, 1, 0 ) : new THREE.Vector3( nx, 0, nz ), 0.018, 0.005 );

		}

		const lp = new THREE.Vector3( L.x + nx * 0.1, L.y - 0.2, L.z + nz * 0.1 );
		k.box( lp.x, lp.y, lp.z, 0.06, 0.07, 0.025, M.IRON, '#5a4a30', { round: 0.006 } );
		ring( k, new THREE.Vector3( lp.x, lp.y + 0.045, lp.z ), new THREE.Vector3( nx, 0, nz ), 0.022, 0.005 );
		this.topChain = this._mesh( k.build(), this.material, 'top-gate-chain' );
		this.group.add( this.topChain );

	}

	// swing a gate (the pasture's, or G) open (away from the walker) or shut; resolves when
	// it has swung
	swingGate( open, G = this.gate ) {

		const from = G.open, to = open ? 1 : 0, tag = G.tag ?? 'gate';
		if ( open ) this.story.collision.remove( tag );
		else {

			const P = G.hinge.position, L = G.latch;
			this.story.collision.capsule( P.x, P.z, L.x, L.z, 0.1, tag );

		}

		return new Promise( ( res ) => {

			let t = 0;
			this.story.every( ( dt ) => {

				t += dt;
				const u = Math.min( 1, t / ( open ? 1.8 : 1.2 ) );
				const e = open ? 1 - Math.pow( 1 - u, 2.4 ) : u * u;
				G.open = from + ( to - from ) * e;
				G.hinge.rotation.y = G.yaw + G.open * 1.75 * ( G.dir ?? 1 );
				if ( u >= 1 ) { res(); return true; }
				return false;

			} );

		} );

	}

	// ------------------------------------------------------------------ the junction
	_junction() {

		const td = this.app.terrainData;
		const ground = ( x, z ) => td.heightAt( x, z );
		const sp = PLACES.signpost;
		const toward = ( x, z ) => Math.atan2( x - sp.x, z - sp.z );
		const { geometry, arms, register } = buildSignpost( ground, sp.x, sp.z, [
			{ text: [ [ 'Alp Larchmere', '15 min' ], [ 'Seeli', '25 min' ] ], yaw: toward( - 20, 731 ) },
			{ text: [ [ 'Wasserfall', '35 min' ] ], yaw: toward( - 40, 745 ) + 0.25 },
			{ text: [ [ 'Schiffsteg', '30 min' ] ], yaw: toward( 60, 758 ) },
		] );
		this.group.add( this._mesh( geometry, this.material, 'signpost' ), arms );
		this.register = register;
		this.story.collision.circle( sp.x, sp.z, 0.12, 'signpost' );
		const cr = PLACES.cross;
		this.group.add( this._mesh( buildCross( ground, cr.x, cr.z, cr.yaw ), this.material, 'cross' ) );
		this.story.collision.circle( cr.x, cr.z, 0.3, 'cross' );
		// a trail sign where the path leaves the hut's yard and turns up behind it for the tarn
		// (the way on is not the way you came in): set beside the path, its arm along it
		{

			const path = this.story.path, d = path.ids.troughEnd + 5;
			const p = path.at( d ), a = path.at( d + 9 );
			const nx = p.tz, nz = - p.tx;
			const sx = p.x + nx * 1.4, sz = p.z + nz * 1.4;
			const s2 = buildSignpost( ground, sx, sz, [
				{ text: [ [ 'Seeli', '10 min' ], [ 'Wasserfall', '25 min' ] ], yaw: Math.atan2( a.x - sx, a.z - sz ) },
			], 21, { register: false } );
			this.group.add( this._mesh( s2.geometry, this.material, 'trail-sign' ), s2.arms );
			this.story.collision.circle( sx, sz, 0.12, 'signpost' );
			this.trailSign = V( sx, ground( sx, sz ) + 2, sz );

		}

	}

	// ------------------------------------------------------------------ along the way: J.'s
	// boots by the pool, cairns, the blazes that mark the path
	_wayside() {

		const td = this.app.terrainData, S = this.story, path = S.path;
		// the boots on the shingle at the plunge pool's edge, toes to the water
		{

			const pool = td.ponds.find( ( p ) => p.plunge );
			const b = PLACES.boots;
			let x = b.x, z = b.z;
			const dx = pool.c.x - x, dz = pool.c.y - z, l = Math.hypot( dx, dz );
			for ( let t = 0; t < l; t += 0.2 ) {

				const h = td.heightAt( b.x + dx / l * t, b.z + dz / l * t );
				if ( h < pool.surf + 0.12 ) break;
				x = b.x + dx / l * t; z = b.z + dz / l * t;

			}

			const m = new THREE.Mesh( buildBoots(), creatureMaterial() );
			m.position.set( x, td.heightAt( x, z ) - 0.01, z );
			m.rotation.y = Math.atan2( dx, dz );
			m.castShadow = m.receiveShadow = true;
			m.name = 'boots';
			this.group.add( m );
			this.boots = m;

		}

		// cairns: on stumps beside the path through the larch wood, and in the shallows of
		// the west shore
		const k = new Kit( ( x, z ) => td.heightAt( x, z ) );
		const d0 = path.ids.wood - 40, d1 = path.ids.strand;
		const stumps = this.app.forest.props.stump;
		let n = 0, last = - 1e9;
		for ( const it of stumps.items ) {

			const q = path.nearest( it.x, it.z, d0, d1 );
			if ( q.dist > 4.5 || q.dist < 1.2 || Math.abs( q.d - last ) < 35 ) continue;
			const top = it.y + ( stumps.variants[ it.variant ].height ?? 0.4 ) * it.s;
			cairn( k, it.x, top, it.z, 0.45, n + 7 );
			last = q.d;
			if ( ++ n >= 5 ) break;

		}

		for ( const d of [ path.ids.boatJ - 60, path.ids.boatJ - 22, path.ids.boatJ + 18 ] ) {

			// a few metres out from the path, where the water is ankle deep
			const s = path.at( d );
			for ( let r = 2; r < 25; r += 0.5 ) {

				const x = s.x + s.tz * r, z = s.z - s.tx * r;
				const h = td.heightAt( x, z );
				if ( h < - 0.15 ) { cairn( k, x, h, z, 0.75, d | 0 ); break; }

			}

		}

		// blazes: every 50-60 m, on a trunk beside the path, or on a marker post
		const blazes = [];
		const trees = this.app.forest.trees;
		// (every 55 m; and every 14 m where the way is not obvious: from the trough's end up
		// behind the hut and round the pen to the tarn)
		const marks = [];
		for ( let d = path.ids.jettyLand + 30; d < path.ids.strand; d += 55 ) marks.push( d );
		for ( let d = path.ids.troughEnd + 8; d < path.ids.tarn - 4; d += 14 ) marks.push( d );
		// and through the Black Wood, from its edge to the strand (in its dusk, the one thing
		// showing the way besides the trail)
		for ( let d = path.ids.shrine + 6; d < path.ids.strand - 12; d += 16 ) if ( Math.abs( d - path.ids.gully ) > 9 ) marks.push( d );
		for ( const d of marks ) {

			const s = path.at( d );
			let best = null, bd = 3.6;
			for ( const t of trees ) {

				if ( Math.abs( t.x - s.x ) > 4 || Math.abs( t.z - s.z ) > 4 ) continue;
				const dd = Math.hypot( t.x - s.x, t.z - s.z );
				if ( dd < bd && this.app.forest.variants[ t.variant ].trunk ) { bd = dd; best = t; }

			}

			if ( best ) {

				const r = this.app.forest.variants[ best.variant ].trunk * best.s * 0.85;
				blazes.push( { x: best.x, y: td.heightAt( best.x, best.z ) + 1.55, z: best.z, nx: s.x - best.x, nz: s.z - best.z, r } );

			} else {

				// a larch post, its top painted
				const x = s.x + s.tz * 1.1, z = s.z - s.tx * 1.1, g = td.heightAt( x, z );
				if ( S.collision.blocked( x, z, 0.3 ) || td.heightAt( x, z ) < 0.3 ) continue;
				k.pole( new THREE.Vector3( x, g - 0.3, z ), new THREE.Vector3( x, g + 1.15, z ), 0.06, M.LOG, col( '#6e6254' ), d );
				S.collision.circle( x, z, 0.08, 'post' );
				blazes.push( { x, y: g + 0.95, z, nx: s.x - x, nz: s.z - z, r: 0.052 } );

			}

		}

		this.group.add( this._mesh( k.build(), this.material, 'wayside' ) );
		const bm = buildBlazes( blazes );
		if ( bm ) this.group.add( bm );

	}

	underPorch( x, z ) {

		const p = this.porch;
		if ( ! p ) return false;
		const [ lx, lz ] = p.frame.toLocal( x, z );
		return lx > p.x0 && lx < p.x1 && lz > p.z0 && lz < p.z1;

	}

	setDoor( open ) {

		this.hut.hinge.rotation.y = open ? 1.65 : 0;
		// (swung open, it stands out into the room from its hinge)
		const C = this.story.collision, f = this.hutFrame;
		C.remove( 'hutdoor' );
		if ( open ) {

			const a = f.toWorld( - 1.24, 0, HUT.L / 2 - 0.05 ), b = f.toWorld( - 1.31, 0, HUT.L / 2 - 0.92 );
			C.capsule( a.x, a.z, b.x, b.z, 0.05, 'hutdoor' );

		}

	}

	// a lamp lit inside the hut: the inside glows through the door, and its light falls out over
	// the porch (the lantern light is free until the jetty's is lit, at the strand)
	lightInside( on ) {

		// (the lantern on the table: its light fills the room and falls out of the door)
		const door = this.lampPos;
		this._inside = on ? { door } : null;
		INSIDE.value.w = 0;
		if ( on ) LAMP.value.set( door.x, door.y, door.z, LAMP_INSIDE );
		else if ( LAMP.value.distanceTo?.( new THREE.Vector4( door.x, door.y, door.z, LAMP.value.w ) ) < 0.1 ) LAMP.value.w = 0;

	}

	// The door as the water shows it: 'same' (as it is), or 'open' while the real one is shut -
	// the real door drops out of the reflections and the open one joins them.
	setDoorReflection( mode ) {

		const h = this.hut, real = h.hinge.children[ 0 ];
		const lists = [ this.app.water, ...this.app.streams.ponds, ...this.app.extraWaters ];
		for ( const w of lists ) w.reflectOnly = w.reflectOnly.filter( ( o ) => o !== h.ghostDoor );
		if ( mode === 'open' ) {

			real.layers.set( 1 );
			for ( const w of lists ) w.reflectOnly.push( h.ghostDoor );

		} else real.layers.set( 0 );

	}

	setShutter( open ) { this.hut.shutOpen.visible = open; this.hut.shutShut.visible = ! open; }

	setTroughCover( on ) {

		this.hut.cover.visible = on;
		this.hut.coverOff.visible = ! on;
		this.troughWater.mesh.visible = ! on;
		this.troughWaterOn = ! on;

	}

	// ------------------------------------------------------------------ the boats
	_boats() {

		this.boatGeo = buildBoat();
		// (the one on the west strand has had its oars taken up to the forest lodge to mend)
		this.boatGeoBare = buildBoat( { oars: false } );
		this.waterline = boatWaterline();
		this.lidMat = new THREE.MeshBasicMaterial( { colorWrite: false, side: THREE.DoubleSide } );
		// yours: moored alongside the jetty's head (the row-in brings it there)
		this.boat = this._boat( 'boat' );
		this.placeBoat( this.boat, this.berth.x, this.berth.z, this.jettyFrame.yaw + 0.04, { roll: 0.015 } );
		this.moor( this.boat );
		// ...and found again on the west strand, fetched up on the shingle, its line cut
		{

			const E = PLACES.boatEnd, td = this.app.terrainData;
			this.boatEnd = this._boat( 'boat-end' );
			this.boatEnd.mesh.geometry = this.boatGeoBare;
			const ax = Math.sin( E.yaw ), az = Math.cos( E.yaw );
			const hb = td.heightAt( E.x - ax * 2.2, E.z - az * 2.2 ), hf = td.heightAt( E.x + ax * 2.2, E.z + az * 2.2 );
			// the bow up on the stones, the stern afloat
			this.placeBoat( this.boatEnd, E.x, E.z, E.yaw, { y: Math.max( - BOAT.draft, Math.min( hb, hf ) - 0.02 ), pitch: - Math.atan2( Math.max( hf, - 0.1 ) - Math.max( hb, - 0.1 ), 4.4 ) * 0.9, roll: 0.05 } );
			this.boatEnd.lid.visible = false;
			this.boatEnd.x = E.x; this.boatEnd.y = Math.max( 0, hf ); this.boatEnd.z = E.z;
			this.story.collision.capsule( E.x - ax * 2.3, E.z - az * 2.3, E.x + ax * 2.3, E.z + az * 2.3, 0.62, 'boatEnd' );
			// the painter, cut short, trailing from the bow ring into the water
			this.boatEnd.mesh.updateMatrixWorld( true );
			const ring = new THREE.Vector3( 0, 0.66, BOAT.L / 2 - 0.02 ).applyMatrix4( this.boatEnd.mesh.matrixWorld );
			const end = ring.clone().add( new THREE.Vector3( ax * 0.6 - az * 0.5, - 0.66, az * 0.6 + ax * 0.5 ) );
			const k = new Kit( ( x, z ) => td.heightAt( x, z ) );
			ropeTo( k, [ ring, ring.clone().lerp( end, 0.5 ).add( new THREE.Vector3( 0, - 0.2, 0 ) ), end ] );
			this.group.add( this._mesh( k.build(), this.material, 'painter-cut' ) );

		}

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

	// the oars laid in the boat on the strand
	oarsIn() { this.boatEnd.mesh.geometry = this.boatGeo; }

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

		this.lampLit = on;
		LAMP.value.set( this.lamp.x, this.lamp.y, this.lamp.z, on ? 1.6 : 0 );
		if ( ! this.glow ) {

			this.glow = new Glow( this.app.camera );
			this.glow.mesh.position.copy( this.lamp );
			this.group.add( this.glow.mesh );

		}

		this.glow.set( on );

	}

	update( dt, time ) {

		this.glow?.update( dt, time );
		// the forest lodge's lamp breathes too
		if ( this.lodge?.lampAt ) LAMP2.value.w = 1.6 * ( 0.9 + 0.07 * Math.sin( time * 2.1 + 1 ) + 0.04 * Math.sin( time * 8.3 ) );
		// the spout's rings, small and often
		if ( this.spout && time > this.spout.next && this.troughWaterOn ) {

			this.spout.next = time + 0.35 + Math.random() * 0.2;
			this.troughWater.addRipple( this.spout.pos.x, this.spout.pos.z, 0.035 + Math.random() * 0.025 );

		}
		// the lamp inside the hut: a wick's breathing
		if ( this._inside ) {

			const k = 0.88 + 0.08 * Math.sin( time * 2.3 ) + 0.05 * Math.sin( time * 7.9 + Math.sin( time * 1.7 ) * 2 );
			if ( ! this.lampLit ) LAMP.value.w = LAMP_INSIDE * k;

		}

	}

}

export { LAMP };
