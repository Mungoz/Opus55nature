import * as THREE from 'three';
import { propMaterial, LAMP, M, col } from './kit.js';
import { buildHut, HUT } from './hut.js';
import { buildJetty, buildBoat, boatWaterline, mooring, JETTY, BOAT, rope as ropeTo } from './jetty.js';
import { buildBridge } from './bridge.js';
import { buildFence, buildSignpost, buildCross, cairn, buildBlazes, paintedMaterial } from './extra.js';
import { buildBoots } from './boots.js';
import { creatureMaterial } from '../../fauna/creature.js';
import { Kit } from './kit.js';
import { Glow } from './glow.js';
import { PLACES, BOARDWALK } from '../layout.js';
import { buildBoardwalk } from './boardwalk.js';
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
		this.hut = { group: g, hinge, shutOpen, shutShut, cover, parts, frame: f };
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

		box( 0, 0, HUT.W / 2 + 0.08, HUT.L / 2 + 0.08 );
		// the crossed log ends standing out at the corners
		for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) {

			const p = f.toWorld( sx * HUT.W / 2, 0, sz * HUT.L / 2 );
			C.circle( p.x, p.z, 0.42, 'hut' );

		}
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
		// down off the porch: its whole front edge is a step (a ramp, for walking)
		const step = f.toWorld( 0, 0, HUT.L / 2 + HUT.PORCH + 0.4 );
		const gs = td.heightAt( step.x, step.z );
		C.deck( step.x, step.z, HUT.W / 2 + 0.1, 0.45, f.yaw, ( lx, lz ) => THREE.MathUtils.lerp( f.y - 0.04, Math.max( gs, f.y - 0.6 ), ( lz + 0.45 ) / 0.9 ), 'hut' );
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

	// swing the gate open (away from the walker) or shut; resolves when it has swung
	swingGate( open ) {

		const G = this.gate, from = G.open, to = open ? 1 : 0;
		if ( open ) this.story.collision.remove( 'gate' );
		else {

			const P = G.hinge.position, L = G.latch;
			this.story.collision.capsule( P.x, P.z, L.x, L.z, 0.1, 'gate' );

		}

		return new Promise( ( res ) => {

			let t = 0;
			this.story.every( ( dt ) => {

				t += dt;
				const u = Math.min( 1, t / ( open ? 1.8 : 1.2 ) );
				const e = open ? 1 - Math.pow( 1 - u, 2.4 ) : u * u;
				G.open = from + ( to - from ) * e;
				G.hinge.rotation.y = G.yaw + G.open * 1.75;
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
		for ( let d = path.ids.jettyLand + 30; d < path.ids.strand; d += 55 ) {

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

	setDoor( open ) { this.hut.hinge.rotation.y = open ? 1.65 : 0; }

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
		this.troughWater.mesh.visible = ! on;
		this.troughWaterOn = ! on;

	}

	// ------------------------------------------------------------------ the boats
	_boats() {

		this.boatGeo = buildBoat();
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
		if ( ! this.glow ) {

			this.glow = new Glow( this.app.camera );
			this.glow.mesh.position.copy( this.lamp );
			this.group.add( this.glow.mesh );

		}

		this.glow.set( on );

	}

	update( dt, time ) {

		this.glow?.update( dt, time );

	}

}

export { LAMP };
