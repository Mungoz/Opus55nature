import * as THREE from 'three';
import { BOAT } from './props/jetty.js';

// The two times you are in the boat: rowing in to the jetty at the start, and pushing off from
// the west strand at the end. A rower sits on the middle thwart facing the stern, so you see
// where you have come from, not where you are going. You can look about; the boat is rowed
// for you, a stroke every three seconds, the oars dipping and the rings spreading.

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const SEAT = V( 0, 0.52, - 0.12 ); // the middle thwart, in the boat's frame (+z to the bow)
const EYE = 0.82; // eye above the thwart

export class BoatScene {

	constructor( story ) {

		this.S = story;
		this.app = story.app;

	}

	// sit in boat b at the start of a row: the camera on the thwart, facing the stern
	_seat( b ) {

		const app = this.app, c = app.controls;
		const m = b.mesh;
		m.updateMatrixWorld( true );
		const eye = SEAT.clone().add( V( 0, EYE, 0 ) ).applyMatrix4( m.matrixWorld );
		app.camera.position.copy( eye );
		// facing the stern: the boat's heading + PI
		const yaw = m.rotation.y + Math.PI;
		// camera yaw convention: forward = ( -sin yaw, -cos yaw )
		c.yaw = c.targetYaw = Math.atan2( - Math.sin( yaw ), - Math.cos( yaw ) );
		c.pitch = c.targetPitch = - 0.12;

	}

	// the director's frame while rowing: the boat along its course, the camera on the thwart,
	// the view free
	_drive( b, course, speedFn, onStroke ) {

		const app = this.app, c = app.controls, S = this.S;
		let s = 0, t = 0, stroke = 0;
		const len = course.getLength();
		this._done = false;
		return new Promise( ( res ) => {

			app.director = ( dt ) => {

				t += dt;
				const v = speedFn( s / len, t );
				s = Math.min( len, s + v * dt );
				const u = s / len;
				const p = course.getPointAt( u ), tan = course.getTangentAt( u );
				// a rower's surge: the boat leaps at each catch and slows between
				const heading = Math.atan2( tan.x, tan.z );
				const ph = ( t / 3 ) % 1;
				const pitch = Math.sin( ph * Math.PI * 2 ) * 0.008;
				S.props.placeBoat( b, p.x, p.z, heading, { pitch, roll: Math.sin( t * 0.9 ) * 0.01 } );
				if ( Math.floor( t / 3 ) !== stroke && v > 0.2 ) {

					stroke = Math.floor( t / 3 );
					onStroke?.( b );

				}

				// the view: free to look about, from the thwart
				c.enabled = false;
				c.update( dt );
				const eye = SEAT.clone().add( V( 0, EYE, 0 ) );
				b.mesh.updateMatrixWorld( true );
				eye.applyMatrix4( b.mesh.matrixWorld );
				// the body leans with the stroke
				const lean = Math.sin( ph * Math.PI * 2 ) * 0.18 * Math.min( 1, v / 0.6 );
				eye.x += Math.sin( heading + Math.PI ) * - lean;
				eye.z += Math.cos( heading + Math.PI ) * - lean;
				// looking down over a side, you lean out over the gunwale to see into the water
				const ax = Math.cos( heading ), az = - Math.sin( heading ); // the boat's +x, across
				const across = - Math.sin( c.yaw ) * ax - Math.cos( c.yaw ) * az;
				const want = THREE.MathUtils.smoothstep( - c.pitch, 0.35, 0.85 ) * THREE.MathUtils.clamp( across * 1.8, - 1, 1 );
				this.lean = ( this.lean ?? 0 ) + ( want - ( this.lean ?? 0 ) ) * Math.min( 1, dt * 2.2 );
				eye.x += ax * 0.8 * this.lean;
				eye.z += az * 0.8 * this.lean;
				eye.y -= 0.32 * Math.abs( this.lean );
				app.camera.position.copy( eye );
				if ( S.you ) {

					S.you.pose = v > 0.2 ? 'row' : 'sit';
					S.you.rowPhase = ph * Math.PI * 2;
					const seat = SEAT.clone().applyMatrix4( b.mesh.matrixWorld );
					S.you.mesh.position.set( seat.x + ax * 0.5 * this.lean, seat.y - 0.45, seat.z + az * 0.5 * this.lean );
					S.you.mesh.rotation.set( 0, heading + Math.PI, 0.38 * this.lean );
					S.you.headYaw = THREE.MathUtils.clamp( Math.atan2( Math.sin( c.yaw - ( heading ) ), Math.cos( c.yaw - heading ) ), - 1.2, 1.2 );

				}

				if ( s >= len - 0.02 && ! this._done ) { this._done = true; res(); }

			};

		} );

	}

	// the oars: a dip either side, the rings spreading from the blades, the sound
	_stroke( b ) {

		const m = b.mesh, S = this.S;
		for ( const sd of [ - 1, 1 ] ) {

			const blade = V( sd * 1.55, 0, 0.2 ).applyMatrix4( m.matrixWorld );
			this.app.water.addRipple( blade.x, blade.z, 0.6 );
			this.app.water.addRipple( blade.x, blade.z, 0.3, 0.5 );
			if ( Math.random() < 0.7 ) this.app.particles.splash( blade.setY( 0.02 ), 3, 0.6 );

		}

		S.sound.oar( m.position.clone().setY( 0.4 ) );

	}

	// --------------------------------------------------------------- the opening
	async rowIn() {

		const S = this.S, app = this.app, P = S.props, ui = S.ui;
		const b = P.boat;
		if ( b.rope ) b.rope.visible = false;
		const berth = P.berth.clone();
		const jy = P.jettyFrame.yaw;
		// from 75 m out in the bay (the jetty's +z points out over the lake), curving in to lie
		// alongside its head; the boat goes bow first, and the rower faces aft
		const ox = Math.sin( jy ), oz = Math.cos( jy ), sx = oz, sz = - ox;
		const out = V( berth.x + ox * 75 + sx * 28, 0, berth.z + oz * 75 + sz * 28 );
		const mid = V( berth.x + ox * 24 + sx * 6, 0, berth.z + oz * 24 + sz * 6 );
		const near = V( berth.x + ox * 7 + sx * 1, 0, berth.z + oz * 7 + sz * 1 );
		const course = new THREE.CatmullRomCurve3( [ out, out.clone().lerp( mid, 0.5 ), mid, near, berth.clone() ] );
		S.input = false;
		app.controls.enabled = false;
		S.you.enable( true );
		// E1: the grebes ahead dive, the mallards paddle away, the heron at the jetty lifts off
		const heron = app.moreBirds.herons[ 0 ];
		const t0 = S.time;
		S.every( () => {

			const bp = b.mesh.position;
			for ( const g of app.moreBirds.grebes ) if ( g.state === 'swim' && g.pos.distanceTo( bp ) < 18 ) g.dive_now = true;
			app.waterfowl.fear = { p: bp.clone(), r: 14 };
			if ( ! heron.cmd && heron.pos.distanceTo( bp ) < 38 ) heron.cmd = { do: 'fly', to: V( heron.pos.x + 70, 0, heron.pos.z - 40 ), level: 0 };
			return S.flags.landed || S.time - t0 > 200;

		} );
		// black, the oars in the dark, the title
		ui.fade( 1, 0.01 );
		const t0c = course.getTangentAt( 0 );
		P.placeBoat( b, out.x, out.z, Math.atan2( t0c.x, t0c.z ) );
		this._seat( b );
		const rowing = this._drive( b, course, ( u ) => u < 0.88 ? 1.7 : Math.max( 0.25, 1.7 * ( 1 - u ) / 0.12 ), ( bb ) => this._stroke( bb ) );
		await S.wait( 1.5 );
		await ui.card( 'Larchmere', 'late October', 5 );
		await ui.fade( 0, 4 );
		await rowing;
		// alongside: the boat nudges the jetty
		S.sound.knock( P.berth.clone().setY( 0.5 ), 0.8 );
		S.flags.landed = true;
		app.waterfowl.fear = null;
		await S.wait( 1.2 );
		await ui.fade( 1, 0.8 );
		// ashore: standing on the jetty's head, the boat tied up behind you
		app.director = null;
		P.placeBoat( b, berth.x, berth.z, jy + 0.04, { roll: 0.015 } );
		P.moor( b );
		if ( b.rope ) b.rope.visible = true;
		S.you.pose = 'follow';
		app.controls.enabled = true;
		S.input = true;
		S.setProgress( 0, true );
		// face along the jetty toward the shore
		const land = S.path.at( S.path.ids.jettyLand );
		const cp = app.camera.position;
		app.controls.yaw = app.controls.targetYaw = Math.atan2( - ( land.x - cp.x ), - ( land.z - cp.z ) );
		await S.wait( 0.3 );
		ui.fade( 0, 1.6 );
		heron.cmd = null;

	}

	// --------------------------------------------------------------- the ending
	async ending() {

		const S = this.S, app = this.app, P = S.props, ui = S.ui;
		if ( S.ended ) return;
		S.ended = true;
		S.input = false;
		const variant = S.looked > S.lookLimit;
		S.log.push( [ 'ending', Math.round( S.time ), variant ? 'stayed' : 'boat', Math.round( S.looked ) ] );
		await ui.fade( 1, 1.4 );
		// the boat, pushed off: a few strokes out from the shore, then drifting
		const b = P.boatEnd;
		const from = b.mesh.position.clone().setY( 0 );
		const q = S.waterSide( from );
		const start = V( from.x + q.x * 4, 0, from.z + q.z * 4 );
		const end = V( from.x + q.x * 30, 0, from.z + q.z * 30 );
		const course = new THREE.CatmullRomCurve3( [ start, start.clone().lerp( end, 0.5 ), end ] );
		P.placeBoat( b, start.x, start.z, Math.atan2( q.x, q.z ) );
		b.lid.visible = true;
		this._seat( b );
		S.you.enable( true );
		S.shadowing = null;
		S.figure.setMode( 'hidden' );
		const shore = from.clone();
		// out through the dark water, stroke by stroke, and gliding to a stop
		let strokes = 0;
		const rowing = this._drive( b, course, ( u, t ) => ( t < 17 ? 1.5 : Math.max( 0.06, 1.5 - ( t - 17 ) * 0.35 ) ), ( bb ) => {

			if ( ++ strokes <= 6 ) this._stroke( bb );

		} );
		await S.wait( 0.5 );
		await ui.fade( 0, 3 );
		await rowing;
		// the rings from the oars settle. The water goes still.
		S.skyOverride = { wind: 0.0, mist: 0.0028, lift: 0.42, keyLow: 0.11 };
		app.water.uniforms.uCalm.value = 1;
		// sitting still in the dark, your eyes open to it: the stars come out in the water
		const tr = S.time;
		const adapt = S.every( () => {

			const k = THREE.MathUtils.smoothstep( S.time - tr, 0, 9 );
			if ( ! S.skyOverride ) return true;
			S.skyOverride.lift = THREE.MathUtils.lerp( 0.42, 1.05, k );
			S.skyOverride.keyLow = THREE.MathUtils.lerp( 0.11, 0.28, k );
			return k >= 1;

		} );
		void adapt;
		await S.wait( 6 );
		const F = S.figure;
		if ( ! variant ) {

			// Lean out over the side where the fish rose, and in the still water your own face looks
			// up at you - and beside it, at your shoulder, another: someone risen out of the water
			// by the boat, head and shoulders, looking up at you. Only in the water. (Nothing in the
			// boat can be seen in the water from the thwart - the hull is in the way - but a head
			// beside the gunwale can, as your own can when you lean out.)
			const p = V( 1.08, 0, SEAT.z + 0.55 ).applyMatrix4( b.mesh.matrixWorld );
			const eye = app.camera.position;
			F.place( p.x, p.z, Math.atan2( eye.x - p.x, eye.z - p.z ), - 1.02 );
			F.pose = 'stand';
			F.tilt = 0.35;
			F.setMode( 'reflect' );

		} else {

			// your reflection isn't in the boat. It stands on the shore; it turns, and walks
			// up into the trees.
			S.you.enable( true );
			app.director = this._keepSeat( b );
			S.you.pose = 'stand';
			S.you.mesh.position.set( shore.x, app.terrainData.heightAt( shore.x, shore.z ), shore.z );
			S.you.mesh.rotation.set( 0, Math.atan2( q.x, q.z ), 0 );

		}

		// a fish rises beside the boat - look
		await S.wait( 2 );
		const side = V( 1.8, 0, - 0.5 ).applyMatrix4( b.mesh.matrixWorld );
		app.water.addRipple( side.x, side.z, 0.5 );
		app.audio.splash( side.clone().setY( 0 ), 0.18 );
		const t0 = S.time;
		if ( ! variant ) {

			// it watches you; it turns its face to you as you lean
			const watch = S.every( () => {

				if ( F.mode !== 'reflect' ) return true;
				F.yaw = Math.atan2( app.camera.position.x - F.pos.x, app.camera.position.z - F.pos.z );
				return false;

			} );
			void watch;
			await S.until( () => ( S.sight.reflect > 0 && S.seenFor > 2.2 ) || S.time - t0 > 45 );
			S.drone( 1, 10 );
			// look up from the water to the place beside you: nobody; the water there closing over
			await S.until( () => S.unseenFor > 0.3 || S.time - t0 > 60 );
			F.setMode( 'hidden' );
			for ( let k = 0; k < 3; k ++ ) app.water.addRipple( F.pos.x, F.pos.z, 0.35, k * 0.7 );
			const bowDir = () => {

				const d = F.pos.clone().sub( app.camera.position ).setY( 0 ).normalize();
				const f = new THREE.Vector3();
				app.camera.getWorldDirection( f );
				return f.setY( 0 ).normalize().dot( d );

			};

			const t1 = S.time;
			await S.until( () => bowDir() > 0.6 || S.time - t1 > 12 );
			await S.wait( 1.6 );

		} else {

			const t1 = S.time;
			await S.wait( 4 );
			// it turns away and walks up into the trees
			const you = S.you;
			you.pose = 'walk';
			const dir = V( - q.x, 0, - q.z );
			you.mesh.rotation.y = Math.atan2( dir.x, dir.z );
			await new Promise( ( res ) => S.every( ( dt ) => {

				you.walkPhase += dt * 4;
				you.mesh.position.addScaledVector( dir, dt * 1.0 );
				you.mesh.position.y = app.terrainData.heightAt( you.mesh.position.x, you.mesh.position.z );
				if ( S.time - t1 > 22 ) { res(); return true; }
				return false;

			} ) );

		}

		// black. A cowbell. The title.
		await ui.fade( 1, 2.5 );
		app.audio.mix.birds = 0;
		await S.wait( 2 );
		S.sound.cowbell( app.camera.position.clone().add( V( 0, 0, - 6 ) ), 1, 0.9 );
		await S.wait( 3.5 );
		await ui.card( 'Larchmere', '', 7 );
		ui.end();

	}

	// hold the camera on the thwart of a drifting boat (the variant ending)
	_keepSeat( b ) {

		const app = this.app, c = app.controls;
		return ( dt ) => {

			c.enabled = false;
			c.update( dt );
			const eye = SEAT.clone().add( V( 0, EYE, 0 ) ).applyMatrix4( b.mesh.matrixWorld );
			app.camera.position.copy( eye );
			this.S.you.update( dt );

		};

	}

}
