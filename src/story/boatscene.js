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
		// from a little way out in the bay (the jetty's +z points out over the lake), curving in
		// to lie alongside its head: twenty seconds or so on the water. The boat goes bow first
		// and the rower faces aft - you look over your shoulder at where you are going, and can
		// look about as you like
		const ox = Math.sin( jy ), oz = Math.cos( jy ), sx = oz, sz = - ox;
		const out = V( berth.x + ox * 34 + sx * 10, 0, berth.z + oz * 34 + sz * 10 );
		const mid = V( berth.x + ox * 15 + sx * 3, 0, berth.z + oz * 15 + sz * 3 );
		const near = V( berth.x + ox * 6 + sx * 1, 0, berth.z + oz * 6 + sz * 1 );
		const course = new THREE.CatmullRomCurve3( [ out, out.clone().lerp( mid, 0.5 ), mid, near, berth.clone() ] );
		S.input = false;
		app.controls.enabled = false;
		app.controls.lookFree = true;
		S.you.enable( true );
		// E1, on the way in: a skein of geese goes over low, calling; a fish rises by the boat;
		// the heron on the jetty's head lifts off croaking and flaps away low over the water; the
		// grebes ahead dive; the mallards paddle off in a line
		const heron = app.moreBirds.herons[ 0 ];
		const t0 = S.time;
		let geese = false, fish = false;
		S.every( () => {

			const bp = b.mesh.position, d = bp.distanceTo( berth );
			for ( const g of app.moreBirds.grebes ) if ( g.state === 'swim' && g.pos.distanceTo( bp ) < 20 ) g.dive_now = true;
			app.waterfowl.fear = { p: bp.clone(), r: 32 };
			if ( ! geese && S.time - t0 > 4.5 ) {

				geese = true;
				app.geese.pass( app.camera, 38, 45 );

			}

			if ( ! fish && d < 24 ) {

				fish = true;
				const q = V( - 2.2, 0, 1.5 ).applyMatrix4( b.mesh.matrixWorld );
				app.water.addRipple( q.x, q.z, 0.6 );
				app.water.addRipple( q.x, q.z, 0.3, 0.4 );
				app.audio.splash?.( q.clone().setY( 0 ), 0.2 );

			}

			if ( ! heron.cmd && d < 21 ) heron.cmd = { do: 'fly', to: V( heron.pos.x + 70, 0, heron.pos.z - 40 ), level: 0 };
			return S.flags.landed || S.time - t0 > 200;

		} );
		// the oars in the dark, then the title over the water as you come in
		ui.fade( 1, 0.01 );
		const t0c = course.getTangentAt( 0 );
		P.placeBoat( b, out.x, out.z, Math.atan2( t0c.x, t0c.z ) );
		this._seat( b );
		// (turned in your seat, looking over your shoulder toward the jetty)
		{

			const c = app.controls, e = app.camera.position;
			c.yaw = c.targetYaw = Math.atan2( - ( berth.x - e.x ), - ( berth.z - e.z ) ) + 0.35;
			c.pitch = c.targetPitch = - 0.06;

		}

		const rowing = this._drive( b, course, ( u ) => u < 0.86 ? 1.9 : Math.max( 0.25, 1.9 * ( 1 - u ) / 0.14 ), ( bb ) => this._stroke( bb ) );
		await S.wait( 1.2 );
		ui.fade( 0, 2.5 );
		await S.wait( 1.2 );
		ui.card( 'Larchmere', 'late October', 4.5 );
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
		app.controls.lookFree = false;
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
	// (HORROR_PLAN 16.5.) Out onto the lake; the rowing stops and the water goes still. Far out
	// on it, against the pale band where the far shore's mist lies in the mirror, someone stands
	// on the water - only in the water. Each time you look away it is nearer. When it stands
	// beside the boat the view tips over into the lake and goes under. Last, from the shore:
	// your boat rowing on out into the dark, with it at the oars.
	// (The old ending - a face rising beside the gunwale - could hardly be seen: from a thwart the
	// water right by the boat is looked at steeply, where it reflects almost nothing.)
	async ending() {

		const S = this.S, app = this.app, P = S.props, ui = S.ui;
		if ( S.ended ) return;
		S.ended = true;
		S.input = false;
		S.log.push( [ 'ending', Math.round( S.time ), 'boat', Math.round( S.looked ) ] );
		for ( let i = 0; i < 6 && S.reading; i ++ ) ui.closeReading();
		await ui.fade( 1, 1.4 );
		// the boat, pushed off: out from the shore, then gliding to a stop
		const b = P.boatEnd;
		const from = b.mesh.position.clone().setY( 0 );
		const q = S.waterSide( from );
		const start = V( from.x + q.x * 4, 0, from.z + q.z * 4 );
		const end = V( from.x + q.x * 36, 0, from.z + q.z * 36 );
		const course = new THREE.CatmullRomCurve3( [ start, start.clone().lerp( end, 0.5 ), end ] );
		P.placeBoat( b, start.x, start.z, Math.atan2( q.x, q.z ) );
		b.lid.visible = true;
		this._seat( b );
		app.controls.lookFree = true;
		S.you.enable( true );
		S.shadowing = null;
		const F = S.figure;
		F.setMode( 'hidden' );
		const shore = from.clone();
		let strokes = 0;
		const rowing = this._drive( b, course, ( u, t ) => ( t < 17 ? 1.5 : Math.max( 0.06, 1.5 - ( t - 17 ) * 0.35 ) ), ( bb ) => {

			if ( ++ strokes <= 6 ) this._stroke( bb );

		} );
		await S.wait( 0.5 );
		await ui.fade( 0, 3 );
		await rowing;
		// the rings from the oars settle. The water goes still; your eyes open to the dark
		S.skyOverride = { wind: 0.0, mist: 0.0028, lift: 0.42, keyLow: 0.11 };
		app.water.uniforms.uCalm.value = 1;
		const tr = S.time;
		S.every( () => {

			const k = THREE.MathUtils.smoothstep( S.time - tr, 0, 9 );
			if ( ! S.skyOverride ) return true;
			S.skyOverride.lift = THREE.MathUtils.lerp( 0.42, 1.05, k );
			S.skyOverride.keyLow = THREE.MathUtils.lerp( 0.11, 0.28, k );
			return k >= 1;

		} );
		await S.wait( 5 );
		// which way the lake lies open longest: there the far shore is low and its mist pale, and a
		// dark figure on the water shows against it in the mirror
		const boatAt = b.mesh.position.clone().setY( 0 );
		const dir = this._openWater( boatAt );
		const side = V( dir.z, 0, - dir.x );
		const eye = app.camera.position;
		let dist = 30;
		const put = () => {

			const p = V( boatAt.x + dir.x * dist + side.x * ( dist * 0.06 ), 0, boatAt.z + dir.z * dist + side.z * ( dist * 0.06 ) );
			F.place( p.x, p.z, Math.atan2( eye.x - p.x, eye.z - p.z ), - 0.05 );
			return p;

		};

		F.pose = 'stand';
		F.tilt = 0.4;
		put();
		F.setMode( 'reflect' );
		// a cowbell, once, far off over the water, the way it stands
		S.sound.cowbell( V( boatAt.x + dir.x * 120, 2, boatAt.z + dir.z * 120 ), 1, 0.6 );
		let told = false, tLast = S.time;
		while ( dist > 3.4 ) {

			// nearer, whenever you look away from it (or in a while, if you never look)
			await S.until( () => ( S.unseenFor > 1.4 && S.time - tLast > 2.5 ) || S.time - tLast > 22 );
			tLast = S.time;
			dist = Math.max( 3.4, dist * 0.6 );
			const p = put();
			for ( let k = 0; k < 3; k ++ ) app.water.addRipple( p.x, p.z, 0.4, k * 0.5 );
			S.sound.wade( p.clone().setY( 0.2 ), 0.35 );
			if ( ! told ) { told = true; S.ui.caption( '[ wading, out on the water ]', 3.5 ); }
			S.drone( 0.4 + ( 30 - dist ) / 30 * 0.5, 4 );

		}

		// beside the boat. Look.
		const tb = S.time;
		await S.until( () => ( S.sight.reflect > 0 && S.seenFor > 1.0 ) || S.time - tb > 18 );
		S.drone( 1, 8 );
		await S.wait( 1.2 );
		// the view tips over into the water, and under
		await this._under();
		// last: from the shore, your boat going out into the dark with it at the oars; where you
		// were, the rings spreading
		F.setMode( 'hidden' );
		const gone = boatAt.clone();
		const out = V( boatAt.x + dir.x * 70, 0, boatAt.z + dir.z * 70 );
		const course2 = new THREE.CatmullRomCurve3( [ boatAt.clone(), boatAt.clone().lerp( out, 0.5 ), out ] );
		const shoreEye = V( shore.x - q.x * 3, app.terrainData.heightAt( shore.x - q.x * 3, shore.z - q.z * 3 ) + 1.65, shore.z - q.z * 3 );
		S.you.enable( false );
		app.controls.lookFree = true;
		F.pose = 'sit';
		F.tilt = 0.2;
		F.setMode( 'direct' );
		const seat = () => {

			const m = b.mesh;
			m.updateMatrixWorld( true );
			const p = SEAT.clone().applyMatrix4( m.matrixWorld );
			F.place( p.x, p.z, m.rotation.y + Math.PI, p.y - 0.46 );

		};

		const away = this._drive( b, course2, () => 0.9, ( bb ) => this._stroke( bb ) );
		// (the director drives the boat; the camera stays on the shore)
		const drive = app.director;
		app.director = ( dt ) => {

			drive( dt );
			seat();
			app.camera.position.copy( shoreEye );

		};

		const c = app.controls;
		c.yaw = c.targetYaw = Math.atan2( - ( boatAt.x - shoreEye.x ), - ( boatAt.z - shoreEye.z ) );
		c.pitch = c.targetPitch = - 0.05;
		for ( let k = 0; k < 4; k ++ ) app.water.addRipple( gone.x + side.x * 1.2, gone.z + side.z * 1.2, 0.5, k * 0.8 );
		await ui.fade( 0, 3 );
		await Promise.race( [ away, S.wait( 14 ) ] );
		// black. A cowbell. The title.
		await ui.fade( 1, 3 );
		app.director = null;
		app.audio.mix.birds = 0;
		await S.wait( 2 );
		S.sound.cowbell( shoreEye.clone().add( V( 0, 0, - 6 ) ), 1, 0.9 );
		await S.wait( 3.5 );
		await ui.card( 'Larchmere', '', 7 );
		ui.end();

	}

	// the view tipping over the gunwale into the water and going under: dark, and the sound of it
	async _under() {

		const S = this.S, app = this.app, c = app.controls, cam = app.camera;
		app.director = null;
		c.enabled = false;
		c.lookFree = false;
		const p0 = cam.position.clone(), yaw0 = c.yaw, pitch0 = c.pitch, t0 = S.time;
		S.sound.wade( p0.clone().setY( 0 ), 0.9 );
		S.ui.fade( 1, 2.2 );
		await S.until( () => {

			const u = Math.min( 1, ( S.time - t0 ) / 2.4 ), e = u * u;
			c.pitch = c.targetPitch = THREE.MathUtils.lerp( pitch0, - 1.35, Math.min( 1, u * 1.6 ) );
			c.yaw = c.targetYaw = yaw0;
			cam.position.set( p0.x, THREE.MathUtils.lerp( p0.y, - 0.6, e ), p0.z );
			return u >= 1;

		} );
		setTimeout( () => S.sound.drip( cam.position.clone(), 0.2 ), 300 );
		await S.wait( 1.5 );
		c.enabled = true;

	}

	// the direction from p over the lake with the most open water before the far shore
	_openWater( p ) {

		const td = this.app.terrainData;
		let best = null, bl = - 1;
		for ( let k = 0; k < 48; k ++ ) {

			const a = k / 48 * Math.PI * 2, x = Math.sin( a ), z = Math.cos( a );
			let l = 0;
			while ( l < 900 && td.heightAt( p.x + x * l, p.z + z * l ) < - 0.2 ) l += 6;
			if ( l > bl ) { bl = l; best = V( x, 0, z ); }

		}

		return best;

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
