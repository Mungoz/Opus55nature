// Shared motion for the animals: the pieces that make movement read as alive rather than
// mechanical - bodies that accelerate and brake, feet that stay planted while they bear
// weight, eyes that fix on something and then snap to the next thing, activity that comes
// in bouts, and loose parts (tails, heads) that follow through.

export const wrapAngle = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );

// Speed that changes like a body with mass: up to `accel`, down at `decel` (m/s^2).
export function approach( v, target, accel, decel, dt ) {

	const d = target - v, k = ( d > 0 ? accel : decel ) * dt;
	return Math.abs( d ) <= k ? target : v + Math.sign( d ) * k;

}

// Turn toward a heading at up to `rate` (rad/s), easing in over the last `ease` radians.
export function steer( h, target, rate, dt, ease = 0.4 ) {

	const d = wrapAngle( target - h );
	const k = rate * dt * Math.min( 1, Math.abs( d ) / ease + 0.15 );
	return h + Math.max( - k, Math.min( k, d ) );

}

// One leg's cycle. ph in [0, 1): for the first `duty` of it the foot is on the ground and
// sweeps back at a constant rate (so it stays planted as the body passes over it); then it
// lifts and swings forward, quicker, easing in and out.
// swing: +1 foot forward ... -1 foot back; lift: 0 on the ground ... 1 at the top of the step.
export function legCycle( ph, duty ) {

	ph = ( ( ph % 1 ) + 1 ) % 1;
	if ( ph < duty ) return { swing: 1 - 2 * ph / duty, lift: 0 };
	const t = ( ph - duty ) / ( 1 - duty );
	const e = t * t * ( 3 - 2 * t );
	return { swing: - 1 + 2 * e, lift: Math.sin( Math.PI * t ) };

}

// The hip (or shoulder) angle that sweeps a planted foot through one stance: the body moves
// stride * duty over the ground while the foot is down.
export const stanceAngle = ( stride, duty, legLength ) => Math.atan( stride * duty * 0.5 / legLength );

// A critically damped spring (no overshoot unless zeta < 1): smooth starts and stops.
export class Spring {

	constructor( x = 0, freq = 4, zeta = 1 ) {

		this.x = x; this.v = 0; this.freq = freq; this.zeta = zeta;

	}

	update( target, dt ) {

		const w = this.freq * Math.PI * 2;
		// semi-implicit Euler in small steps (stable for any dt we see)
		const n = Math.max( 1, Math.ceil( dt / 0.008 ) ), h = dt / n;
		for ( let i = 0; i < n; i ++ ) {

			this.v += ( w * w * ( target - this.x ) - 2 * this.zeta * w * this.v ) * h;
			this.x += this.v * h;

		}

		return this.x;

	}

}

// Where an animal is looking. It fixes on something for a while, then its head snaps to the
// next thing (fast, like a saccade) - now and then straight ahead again - or it keeps
// watching a point of interest.
export class Gaze {

	constructor( rng, { yaw = 0.8, pitch = 0.3, hold = [ 0.8, 3.5 ], speed = 7, centre = 0.35 } = {} ) {

		this.rng = rng; this.maxYaw = yaw; this.maxPitch = pitch; this.holdR = hold; this.centre = centre;
		this.yawS = new Spring( 0, speed, 1 ); this.pitchS = new Spring( 0, speed * 0.8, 1 );
		this.tYaw = 0; this.tPitch = 0; this.hold = rng.next() * hold[ 1 ];

	}

	// interest: a yaw (relative to the body) to keep watching, or null
	update( dt, interest = null ) {

		this.hold -= dt;
		if ( this.hold <= 0 ) {

			const r = this.rng;
			this.hold = r.range( this.holdR[ 0 ], this.holdR[ 1 ] );
			if ( interest !== null ) {

				// keep an eye on it, glancing away only briefly
				this.tYaw = interest + r.range( - 0.12, 0.12 );
				this.tPitch = r.range( - 0.1, 0.05 ) * this.maxPitch;

			} else if ( r.next() < this.centre ) {

				this.tYaw = r.range( - 0.1, 0.1 ); this.tPitch = 0;

			} else {

				this.tYaw = r.range( - 1, 1 ) * this.maxYaw;
				this.tPitch = r.range( - 1, 0.6 ) * this.maxPitch;

			}

		}

		if ( interest !== null && Math.abs( interest - this.tYaw ) > 0.5 ) { this.tYaw = interest; this.hold = Math.min( this.hold, 0.3 ); }
		this.tYaw = Math.max( - this.maxYaw, Math.min( this.maxYaw, this.tYaw ) );
		return { yaw: this.yawS.update( this.tYaw, dt ), pitch: this.pitchS.update( this.tPitch, dt ) };

	}

}

// Something done in bouts: on for a while, off for a while (nibbling, chewing, sniffing).
// Returns 0..1, eased at the edges.
export class Bouts {

	constructor( rng, on = [ 0.6, 2 ], off = [ 0.5, 3 ], ease = 12 ) {

		this.rng = rng; this.onR = on; this.offR = off; this.ease = ease;
		this.on = rng.next() < 0.5; this.t = rng.range( ...( this.on ? on : off ) ); this.x = this.on ? 1 : 0;

	}

	update( dt ) {

		this.t -= dt;
		if ( this.t <= 0 ) {

			this.on = ! this.on;
			this.t = this.rng.range( ...( this.on ? this.onR : this.offR ) );

		}

		this.x += ( ( this.on ? 1 : 0 ) - this.x ) * Math.min( 1, dt * this.ease );
		return this.x;

	}

}
