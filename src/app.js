import * as THREE from 'three';
import { U } from './core/uniforms.js';
import { PRESETS } from './core/quality.js';
import { Controls } from './core/controls.js';
import { TerrainData } from './gen/terrainGen.js';
import { TextureBank } from './gen/textures.js';
import { nextFrame } from './gen/gpu.js';
import { Sky } from './world/sky.js';
import { Terrain } from './world/terrain.js';
import { SunShadows } from './world/shadows.js';
import { Water } from './world/water.js';
import { Streams } from './world/stream.js';
import { buildDeadwood } from './world/deadwood.js';
import { LAYERS } from './core/world.js';
import { FullscreenPass, passMaterial } from './gen/gpu.js';
import { WaterPlants } from './world/waterplants.js';
import { Forest } from './world/trees.js';
import { Meadow, CROP } from './world/grass.js';
import { GroundCover, PONDS_GC } from './world/groundcover.js';
import { Rocks } from './world/rocks.js';
import { buildFallCliff } from './world/fallCliff.js';
import { Particles } from './world/particles.js';
import { Murmuration, GeeseFlight, Eagles } from './fauna/birds.js';
import { Waterfowl } from './fauna/waterfowl.js';
import { LeapingFish } from './fauna/fish.js';
import { Shallows } from './fauna/fishSchool.js';
import { RiverFish } from './fauna/riverFish.js';
import { MoreBirds } from './fauna/moreBirds.js';
import { Mammals } from './fauna/mammals.js';
import { creatureMaterial, PartBuilder } from './fauna/creature.js';
import { Soundscape } from './audio.js';
import { Tour } from './tour.js';
import { Weather } from './world/weather.js';
import { Post } from './fx/post.js';

const _v = new THREE.Vector3();
const _ray = new THREE.Ray();
const _ndc = new THREE.Vector2();
const bio = [ 0, 0, 0, 0 ];

export const START_POSE = [ - 5, 3.5, 508, 4, 4 ];

const _frustum = new THREE.Frustum(), _m4 = new THREE.Matrix4();
// would the renderer draw this object in the main view? (the same tests three.js makes)
function inView( o ) {

	for ( let p = o; p; p = p.parent ) if ( ! p.visible ) return false;
	return o.frustumCulled === false || _frustum.intersectsObject( o );

}

// A material shared by different kinds of object (skinned, instanced, plain) needs a different
// shader program for each, and three.js re-resolves it every time the kind changes from one
// draw to the next. Give each kind its own copy (same shaders, the very same uniforms), and
// the same for the shadow pass's depth material; nothing drawn changes.
function splitSharedMaterials( scene ) {

	const kind = ( o ) => ( o.isSkinnedMesh ? 's' : '' ) + ( o.isInstancedMesh ? 'i' + ( o.instanceColor ? 'c' : '' ) : '' ) + ( o.isBatchedMesh ? 'b' : '' ) || 'p';
	const users = new Map();
	scene.traverse( ( o ) => {

		if ( ! o.isMesh || Array.isArray( o.material ) ) return;
		let m = users.get( o.material );
		if ( ! m ) users.set( o.material, m = new Map() );
		const k = kind( o );
		if ( ! m.has( k ) ) m.set( k, [] );
		m.get( k ).push( o );

	} );

	for ( const [ mat, byKind ] of users ) {

		if ( byKind.size < 2 ) continue;
		let first = true;
		for ( const list of byKind.values() ) {

			if ( first ) { first = false; continue; }
			// cloned without its uniforms (render-target textures cannot be copied), which the
			// copy then shares
			const u = mat.uniforms;
			if ( u ) mat.uniforms = {};
			const copy = mat.clone();
			if ( u ) mat.uniforms = copy.uniforms = u;
			for ( const o of list ) o.material = copy;

		}

	}

	// the shadow pass: one plain depth material per kind of caster (casters with alpha-tested
	// or displaced materials keep three.js's own per-material variants)
	const depth = new Map();
	scene.traverse( ( o ) => {

		if ( ! o.isMesh || ! o.castShadow || o.customDepthMaterial !== undefined || Array.isArray( o.material ) ) return;
		const m = o.material;
		if ( m.alphaTest > 0 || m.alphaMap || m.displacementMap || m.alphaToCoverage || m.clipShadows ) return;
		const k = kind( o );
		if ( ! depth.has( k ) ) depth.set( k, new THREE.MeshDepthMaterial() );
		o.customDepthMaterial = depth.get( k );

	} );

}

export class App {

	constructor( canvas, options = {} ) {

		this.canvas = canvas;
		this.options = options;
		this.presetName = options.preset && PRESETS[ options.preset ] ? options.preset : 'high';
		this.quality = { ...PRESETS[ this.presetName ] };
		this.hours = options.hours ?? 16.15;
		this.timeSpeed = options.timeSpeed ?? 2; // game seconds per real second
		this.elapsed = 0;
		this.systems = [];
		this.frame = 0;
		this.renderScale = 1;
		this.autoResolution = ! options.shot;
		this._ftAvg = 16;
		this._resTimer = 0;
		this.stones = [];
		this.onToast = () => {};

		const r = this.renderer = new THREE.WebGLRenderer( {
			canvas,
			antialias: false,
			alpha: false,
			powerPreference: 'high-performance',
			stencil: false,
			depth: true,
		} );
		r.setPixelRatio( Math.min( window.devicePixelRatio, this.quality.pixelRatio ) );
		r.toneMapping = THREE.NoToneMapping;
		r.outputColorSpace = THREE.SRGBColorSpace;
		r.shadowMap.enabled = true;
		r.shadowMap.type = THREE.PCFShadowMap;
		r.shadowMap.autoUpdate = false;
		r.info.autoReset = false;

		this.scene = new THREE.Scene();
		// world matrices are brought up to date once per frame, at the start of render(), rather
		// than in each of its five to seven passes (nothing moves between the passes)
		this.scene.matrixWorldAutoUpdate = false;
		this.camera = new THREE.PerspectiveCamera( 55, 1, 0.25, 16000 );
		this.camera.layers.enable( LAYERS.MAIN );
		this.camera.layers.enable( LAYERS.WATER );
		this.camera.layers.enable( LAYERS.FX );
		this.scene.add( this.camera );
		this.audio = new Soundscape();

	}

	async load( progress = () => {} ) {

		const r = this.renderer;
		this.loadTimes = [];
		let tPrev = performance.now();
		const step = async ( frac, label ) => {

			const now = performance.now();
			this.loadTimes.push( [ label, Math.round( now - tPrev ) ] );
			tPrev = now;
			progress( frac, label );
			await nextFrame();

		};

		if ( ! r.capabilities.isWebGL2 ) throw new Error( 'WebGL 2 is required' );
		// stumps and fallen trunks are sculpted in workers while the GPU builds the world
		const deadwoodP = buildDeadwood();

		await step( 0.02, 'Preparing the palette' );
		this.textures = new TextureBank( r ).build();
		U.uNoiseTex.value = this.textures.noise;

		await step( 0.1, 'Raising the mountains' );
		this.terrainData = new TerrainData( r );
		await this.terrainData.generate();
		const td = this.terrainData;
		U.uHNear.value = td.near.hnTex;
		U.uHFar.value = td.far.hnTex;
		U.uBiomeNear.value = td.near.biomeTex;
		U.uBiomeFar.value = td.far.biomeTex;
		U.uNearXf.value.copy( td.nearXf );
		U.uFarXf.value.copy( td.farXf );
		U.uTShadow.value = td.shadowTex;
		td.ponds.forEach( ( pd, i ) => PONDS_GC.value[ i ].set( pd.c.x, pd.c.y, pd.r, pd.surf ) );

		await step( 0.3, 'Painting the sky' );
		this.sky = new Sky( r );
		this.scene.add( this.sky.mesh );
		this.sky.mesh.layers.enableAll();
		this.sky.mesh.layers.disable( LAYERS.WATER );
		this.sky.mesh.layers.disable( LAYERS.FX );

		await step( 0.38, 'Carving the valley' );
		this.terrain = new Terrain( td, this.textures, this.quality );
		this.scene.add( this.terrain.mesh, this.terrain.reflectMesh );

		await step( 0.45, 'Filling the lake' );
		this.water = new Water( this.textures, this.quality );
		this.water.reflectOnly.push( this.terrain.reflectMesh );
		this.scene.add( this.water.mesh );
		this.streams = new Streams( td, this.textures, this.water, this.quality, this.terrain.mesh, this.terrain.reflectMesh );
		this.scene.add( this.streams.group );
		this.waterPlants = new WaterPlants( td );
		this.scene.add( this.waterPlants.group );

		await step( 0.5, 'Growing the larches' );
		this.forest = new Forest( td, this.quality, r, await deadwoodP );
		if ( this.options.showcase ) this.forest.showcase = { x: 30, z: 560, page: this.options.showcasePage || 0 };
		this.treeCount = this.forest.place();
		await step( 0.6, 'Turning the larches gold' );
		this.scene.add( this.forest.build() );

		await step( 0.66, 'Scattering boulders' );
		this.rocks = new Rocks( td, this.textures );
		this.rocks.place( [
			{ x: - 14, z: 492, s: 2.6, sink: 0.45 }, { x: 52, z: 522, s: 1.5 }, { x: 78, z: 598, s: 4.2 }, { x: - 30, z: 560, s: 1.2 }, { x: 5, z: 500, s: 0.9 },
		] );
		this.scene.add( this.rocks.group );
		// the sculpted rock of the waterfall's cliff
		{

			const g = buildFallCliff( td, this.streams.fallInfo.lipB );
			const cliff = new THREE.Mesh( g, this.rocks.cliffMaterial( this.streams.fallInfo ) );
			cliff.castShadow = cliff.receiveShadow = true;
			cliff.name = 'fall-cliff';
			this.scene.add( cliff );
			this.fallCliff = cliff;

		}

		await step( 0.72, 'Sowing the meadows' );
		this.meadow = new Meadow( this.quality );
		this.scene.add( this.meadow.group );
		this.groundCover = new GroundCover( this.quality );
		this.scene.add( this.groundCover.group );
		this.particles = new Particles( td, this.quality );
		this.scene.add( this.particles.group );

		await step( 0.8, 'Waking the wildlife' );
		this.starlings = new Murmuration( Math.round( 900 * Math.max( 0.45, this.quality.particles ) ), td );
		this.geese = new GeeseFlight( td, ( p, n ) => this.audio.honk( p, n ) );
		this.eagles = new Eagles( td );
		this.waterfowl = new Waterfowl( td, this.water );
		this.fish = new LeapingFish( td, this.water, this.particles, ( p, s ) => this.audio.splash( p, s ) );
		this.shallows = new Shallows( td );
		this.scene.add( this.shallows.group );
		this.riverFish = new RiverFish( td, this.streams.path );
		this.scene.add( this.riverFish.group );
		this.moreBirds = new MoreBirds( td, this.water );
		this.scene.add( this.moreBirds.group );
		this.mammals = new Mammals( td, this.forest, this.audio, this.quality );
		this.scene.add( this.mammals.group );
		// marmots crop the turf short around their burrows
		// grazed turf round each burrow, and none growing through the spoil
		this.mammals.burrows.forEach( ( b, i ) => {

			CROP.value[ i * 2 ].set( b.pos.x + ( i % 2 ? 1.5 : - 1.2 ), b.pos.z + ( i % 3 ? 0.8 : - 1.4 ), 6 + ( i % 3 ), 0.6 );
			CROP.value[ i * 2 + 1 ].set( b.pos.x + Math.sin( b.heading ) * 0.2, b.pos.z + Math.cos( b.heading ) * 0.2, 1.9, 1 );

		} );
		const sv = this.forest.spawnVignette;
		if ( sv ) CROP.value[ 11 ].set( sv.perch.x, sv.perch.z, 3.2, 0.6 );
		this.scene.add( this.starlings.mesh, this.geese.mesh, this.eagles.mesh, this.waterfowl.group, this.fish.mesh );
		this._buildStone();
		this.weather = new Weather( td, this.quality, this.audio );
		this.scene.add( this.weather.group );
		if ( this.options.weather ) this.weather.snap( this.options.weather );

		this.shadows = new SunShadows( this.scene, this.quality );
		this.post = new Post( r, { msaa: this.quality.msaa } );

		this.controls = new Controls( this.camera, this.canvas, td );
		this.controls.onClick = ( e ) => this.throwStone( e );
		const p = this.options.cam;
		this.controls.setPose( ...( p || START_POSE ) );
		// debug: ?cam=x,y,z&look=x,y,z aims the camera at a point
		if ( p && this.options.look ) {

			const [ lx, ly, lz ] = this.options.look;
			const dx = lx - p[ 0 ], dy = ly - p[ 1 ], dz = lz - p[ 2 ];
			this.controls.setPose( p[ 0 ], p[ 1 ], p[ 2 ], Math.atan2( - dx, - dz ) * 180 / Math.PI, Math.atan2( dy, Math.hypot( dx, dz ) ) * 180 / Math.PI );

		}

		// on foot by default (screenshots and the trailer place the camera freely)
		this.controls.walk = ! this.options.shot;
		// debug: ?prop=log|fern|heath|mush frames the nearest one of those to the start
		const pk = this.options.prop && this.forest.props[ this.options.prop ];
		if ( pk ) {

			const c = this.camera.position;
			let best = null, bd = Infinity;
			for ( const it of pk.items ) {

				const d = ( it.x - c.x ) ** 2 + ( it.z - c.z ) ** 2;
				if ( d < bd ) { bd = d; best = it; }

			}

			const r = this.options.prop === 'mush' ? 1.3 : this.options.prop === 'log' ? ( this.options.near ? 3 : 7 ) : 4;
			const ang = Math.atan2( c.x - best.x, c.z - best.z );
			const x = best.x + Math.sin( ang ) * r, z = best.z + Math.cos( ang ) * r;
			const y = td.heightAt( x, z ) + ( this.options.prop === 'mush' ? 0.45 : 1.6 );
			const pitch = Math.atan2( best.y + 0.15 - y, r ) * 180 / Math.PI;
			this.controls.setPose( x, y, z, ang * 180 / Math.PI, pitch );

		}

		this.tour = new Tour( this.camera, td );

		this.resize();
		window.addEventListener( 'resize', () => this.resize() );

		// Prime the sky & terrain shadows so the first frame is right.
		this.updateTime( 0 );
		td.updateShadows( this.sky.sunDir, true );

		// debug: ?hide=name,name hides objects by name
		for ( const n of ( this.options.hide || '' ).split( ',' ).filter( Boolean ) ) this.scene.traverse( ( o ) => { if ( o.name === n ) o.visible = false; } );

		await step( 0.9, 'Warming the shaders' );
		// compile every program up front so the first seconds are smooth
		this.forest.update( this.camera );
		this.rocks.update( this.camera );
		this.waterPlants.update( this.camera );
		splitSharedMaterials( this.scene );
		// compile in the background where the browser supports it (keeps the loader animating)
		await r.compileAsync( this.scene, this.camera );
		this.render();

		await step( 1, 'Ready' );

	}

	// debug camera that frames a creature (?follow=minnows|trout|swan|deer|marmot|squirrel)
	_debugFollow() {

		const f = this.options.follow;
		let p = null, h = 2.2, back = 1.4;
		if ( f === 'minnows' ) { p = this.shallows.groups[ 0 ].pos[ 0 ]; h = 6.5; back = 1.2; }
		if ( f === 'perch' || f === 'char' ) { const g = this.shallows.groups.find( ( s ) => s.mesh.name === f ); p = g.pos[ 0 ]; h = 1.2; back = 2.2; }
		if ( f === 'trout' ) { p = this.shallows.groups[ 2 ].pos[ 0 ]; h = 3; back = 2.5; }
		if ( f === 'duck' ) { const b = this.waterfowl.birds[ 2 ]; p = b.pos.clone().setY( 0.12 ); h = 0.12; back = 1.3; this._followHeading = b.heading; }
		if ( f === 'swan' ) { const b = this.waterfowl.birds[ 0 ]; p = b.pos.clone().setY( 0.5 ); h = 0.3; back = 4.5; this._followHeading = b.heading; }
		// the heron held in its fishing freeze, the grebe swimming on the surface
		if ( f === 'heron' || f === 'heron-step' ) { const b = this.moreBirds.herons[ 0 ]; if ( b.state !== 'fly' ) { b.state = f === 'heron' ? 'freeze' : 'step'; b.timer = 1e9; b.target ??= b.pos.clone().add( new THREE.Vector3( Math.sin( b.heading ) * 50, 0, Math.cos( b.heading ) * 50 ) ); } p = b.pos.clone().setY( 0.55 ); h = 0.2; back = 2.4; this._followHeading = b.heading - Math.PI / 2; }
		if ( f === 'grebe' ) { const b = this.moreBirds.grebes[ 0 ]; b.state = 'swim'; b.timer = 1e9; p = b.pos.clone().setY( 0.12 ); h = 0.12; back = 1.0; this._followHeading = b.heading - Math.PI / 2; }
		if ( this.mammals && this.mammals.debugTarget ) { const d = this.mammals.debugTarget( f ); if ( d ) { p = d.p; h = d.h; back = d.back; this._followHeading = d.heading; if ( this.options.bone && d.animal?.bones.get( this.options.bone ) ) p = d.animal.bones.get( this.options.bone ).getWorldPosition( new THREE.Vector3() ); } }
		if ( ! p ) return;
		if ( this.options.back ) back = this.options.back;
		if ( this.options.h !== undefined ) h = this.options.h;
		// side-on when the target reports its heading (studio view), else a 3/4 view
		const hd = this._followHeading;
		const sx = hd !== undefined ? Math.cos( hd + ( this.options.angle || 0 ) ) : 0.7, sz = hd !== undefined ? - Math.sin( hd + ( this.options.angle || 0 ) ) : 0.7;
		const gx = p.x + back * sx, gz = p.z + back * sz;
		this.camera.position.set( gx, hd !== undefined ? p.y + h : Math.max( this.terrainData.heightAt( gx, gz ), 0 ) + h, gz );
		this.camera.lookAt( p.x, p.y, p.z );
		this.camera.updateMatrixWorld();

	}

	_buildStone() {

		const b = new PartBuilder();
		const g = new THREE.IcosahedronGeometry( 0.06, 1 );
		g.scale( 1.2, 0.6, 1 );
		b.add( g, '#6d6a64' );
		this.stoneGeo = b.build();
		this.stoneMat = creatureMaterial();

	}

	stats() {

		const td = this.terrainData;
		const probe = ( x, z ) => Math.round( td.heightAt( x, z ) * 10 ) / 10;
		return {
			fps: Math.round( 1000 / this._ftAvg ),
			calls: this.renderer.info.render.calls,
			trees: this.treeCount,
			water: this.waterPlants.counts(),
			props: Object.fromEntries( Object.entries( this.forest.props ).map( ( [ k, v ] ) => [ k, v.items.length ] ) ),
			tris: this.renderer.info.render.triangles,
			cam: probe( this.camera.position.x, this.camera.position.z ),
			sunEl: Math.round( this.sky.sunElevation * 10 ) / 10,
			scale: this.renderScale,
			river: this.terrainData.river.filter( ( v, i ) => i % 6 === 0 ).map( ( r ) => r.surf ).map( ( v ) => Math.round( v * 10 ) / 10 ),
			ponds: this.terrainData.ponds.map( ( p ) => Math.round( p.surf * 10 ) / 10 ),
			fallBase: Math.round( this.streams.fallInfo.floorY * 10 ) / 10, fallTop: Math.round( this.streams.fallInfo.lipY * 10 ) / 10,
			load: this.loadTimes,
		};

	}

	resize() {

		const w = window.innerWidth, h = window.innerHeight;
		this.renderer.setSize( w, h, false );
		this.canvas.style.width = w + 'px';
		this.canvas.style.height = h + 'px';
		this.camera.aspect = w / h;
		// keep a comfortable horizontal field of view on tall (portrait) screens
		this.camera.fov = w < h ? Math.min( 82, 55 / Math.pow( w / h, 0.6 ) ) : 55;
		this.camera.updateProjectionMatrix();
		const pr = this.renderer.getPixelRatio();
		this.post.setSize( w * pr, h * pr, this.renderScale );
		this.water.setSize( w * pr * this.renderScale, h * pr * this.renderScale );
		this.streams?.setSize( w * pr * this.renderScale, h * pr * this.renderScale );
		const rw = Math.max( 2, Math.round( w * pr * this.renderScale ) ), rh = Math.max( 2, Math.round( h * pr * this.renderScale ) );
		if ( ! this.refractRT ) this.refractRT = new THREE.WebGLRenderTarget( rw, rh, { type: THREE.HalfFloatType, depthBuffer: false } );
		else this.refractRT.setSize( rw, rh );
		if ( this.streams ) this.streams.refraction.value = this.refractRT.texture;

	}

	// ---------- settings ----------
	setQuality( name ) {

		if ( ! PRESETS[ name ] ) return;
		this.presetName = name;
		const keepSpacing = this.quality.terrainSpacing;
		Object.assign( this.quality, PRESETS[ name ], { terrainSpacing: keepSpacing } );
		const q = this.quality;
		this.renderer.setPixelRatio( Math.min( window.devicePixelRatio, q.pixelRatio ) );
		this.post.setMSAA( q.msaa );
		this.shadows.configure( q );
		this.scene.remove( this.meadow.group );
		this.meadow = new Meadow( q );
		this.scene.add( this.meadow.group );
		this.scene.remove( this.groundCover.group );
		this.groundCover = new GroundCover( q );
		this.scene.add( this.groundCover.group );
		this.forest.setNearDistance( q.treeNear );
		this.terrain.uniforms.uGrassFar.value = q.grassFar;
		splitSharedMaterials( this.scene );
		this.renderScale = 1;
		this.resize();

	}

	setClouds( v ) { this.weather.userClouds = v; }

	setWind( v ) { this.weather.userWind = v; }

	setWeather( name ) { this.weather.set( name ); }

	updateTime( dt ) {

		this.hours = ( this.hours + dt * this.timeSpeed / 3600 + 24 ) % 24;
		this.sky.update( this.hours );
		this.weather?.applyToLight();

	}

	exposureFor( sunY ) {

		const el = Math.asin( THREE.MathUtils.clamp( sunY, - 1, 1 ) ) * 180 / Math.PI;
		// piecewise log-exposure curve tuned by eye
		const pts = [ [ - 18, 4.5 ], [ - 10, 4.2 ], [ - 6, 3.4 ], [ - 3, 2.5 ], [ 0, 1.5 ], [ 4, 0.8 ], [ 10, 0.35 ], [ 30, 0.0 ] ];
		let ev = pts[ pts.length - 1 ][ 1 ];
		if ( el <= pts[ 0 ][ 0 ] ) ev = pts[ 0 ][ 1 ];
		else for ( let i = 0; i < pts.length - 1; i ++ ) {

			const [ a0, e0 ] = pts[ i ], [ a1, e1 ] = pts[ i + 1 ];
			if ( el >= a0 && el <= a1 ) {

				const t = ( el - a0 ) / ( a1 - a0 );
				ev = e0 + ( e1 - e0 ) * t * t * ( 3 - 2 * t );
				break;

			}

		}

		return Math.pow( 2, ev ) * 0.95;

	}

	// ---------- interaction: skim a stone onto the lake ----------
	throwStone( e ) {

		if ( this.tour.active ) return;
		const rect = this.canvas.getBoundingClientRect();
		if ( document.pointerLockElement === this.canvas ) _ndc.set( 0, 0 );
		else _ndc.set( ( ( e.clientX - rect.left ) / rect.width ) * 2 - 1, - ( ( e.clientY - rect.top ) / rect.height ) * 2 + 1 );
		_ray.origin.copy( this.camera.position );
		_ray.direction.set( _ndc.x, _ndc.y, 0.5 ).unproject( this.camera ).sub( this.camera.position ).normalize();
		if ( _ray.direction.y > - 0.005 ) return;
		const t = - _ray.origin.y / _ray.direction.y;
		const hit = _ray.at( t, new THREE.Vector3() );
		if ( t > 90 || this.terrainData.heightAt( hit.x, hit.z ) > - 0.15 ) return;
		const start = this.camera.position.clone().add( new THREE.Vector3( 0.25, - 0.35, 0 ).applyQuaternion( this.camera.quaternion ) );
		const flight = 0.35 + t / 26;
		const vel = hit.clone().sub( start ).divideScalar( flight );
		vel.y += 0.5 * 9.81 * flight;
		const mesh = new THREE.Mesh( this.stoneGeo, this.stoneMat );
		mesh.position.copy( start );
		this.scene.add( mesh );
		// a flat, fast throw skips: each bounce loses speed
		const skips = t > 12 && _ray.direction.y > - 0.35 ? 1 + Math.floor( Math.random() * 4 ) : 0;
		this.stones.push( { mesh, vel, skips, spin: new THREE.Vector3( Math.random() * 20, Math.random() * 20, Math.random() * 20 ) } );

	}

	_updateStones( dt ) {

		for ( let i = this.stones.length - 1; i >= 0; i -- ) {

			const s = this.stones[ i ];
			s.vel.y -= 9.81 * dt;
			s.mesh.position.addScaledVector( s.vel, dt );
			s.mesh.rotation.x += s.spin.x * dt;
			s.mesh.rotation.y += s.spin.y * dt;
			const p = s.mesh.position;
			if ( p.y <= 0 && s.vel.y < 0 ) {

				const floor = this.terrainData.heightAt( p.x, p.z );
				if ( floor > 0 ) {

					this.scene.remove( s.mesh );
					this.stones.splice( i, 1 );
					continue;

				}

				if ( s.skips > 0 ) {

					s.skips --;
					s.vel.y = Math.abs( s.vel.y ) * 0.45 + 1.2;
					s.vel.x *= 0.72;
					s.vel.z *= 0.72;
					p.y = 0.01;
					this.water.addRipple( p.x, p.z, 0.45 );
					this.particles.splash( p, 6, 1.2 );
					this.audio.splash( p, 0.25 );

				} else {

					this.water.addRipple( p.x, p.z, 0.8 );
					this.water.addRipple( p.x, p.z, 0.35, 0.3 );
					this.particles.splash( p, 16, 1.9 );
					this.audio.splash( p, 0.6 );
					this.scene.remove( s.mesh );
					this.stones.splice( i, 1 );

				}

			}

		}

	}

	// ---------- frame ----------
	update( dt ) {

		this._ftAvg += ( ( this.realDt ?? dt ) * 1000 - this._ftAvg ) * 0.05;
		this.elapsed += dt;
		const t = this.elapsed;
		U.uTime.value = t;
		this.updateTime( dt );
		if ( this.director ) this.director( dt );
		else if ( this.tour.active ) this.tour.update( dt );
		else this.controls.update( dt );
		this.camera.updateMatrixWorld();

		const td = this.terrainData;
		td.updateShadows( this.sky.sunDir );
		this.shadows.update( this.camera, U.uSunDir.value );
		this.weather.update( dt, t, this.camera, this.sky );

		this.forest.update( this.camera );
		this.rocks.update( this.camera );
		this.waterPlants.update( this.camera );
		const sunEl = this.sky.sunElevation;
		const day = sunEl > - 7 && this.weather.state.rain < 0.3;
		// murmurations gather in the late afternoon and at dusk
		this.starlings.update( dt, day && sunEl < 16 && sunEl > - 6 );
		this.geese.update( dt, t, this.camera, sunEl > - 4 && this.weather.state.rain < 0.5 );
		this.eagles.update( dt, t, sunEl > 1 && this.weather.state.overcast < 0.6 );
		this.waterfowl.update( dt, t );
		this.fish.update( dt, this.camera, true );
		this.shallows.update( dt, this.camera );
		this.riverFish.update( dt, t, this.camera );
		this.moreBirds.update( dt, t, this.options.follow || this.director ? { position: new THREE.Vector3( 1e4, 0, 1e4 ) } : this.camera );
		// (the debug follow camera must not spook what it films)
		this.mammals.update( dt, t, this.options.follow || this.director ? { position: new THREE.Vector3( 1e4, 0, 1e4 ) } : this.camera, 1 - Math.min( 1, Math.abs( sunEl + 1 ) / 7 ) );
		this.mammals.lod( this.camera );
		if ( this.options.follow ) this._debugFollow();
		this._updateStones( dt );

		// leaves fall from nearby larches and birches
		if ( ( this._leafTimer = ( this._leafTimer ?? 0 ) - dt ) <= 0 ) {

			this._leafTimer = 2;
			const cp = this.camera.position;
			const list = [];
			for ( const tr of this.forest.trees ) {

				if ( tr.variant < 3 ) continue;
				const dx = tr.x - cp.x, dz = tr.z - cp.z;
				if ( dx * dx + dz * dz < 3600 ) list.push( { x: tr.x, y: tr.y, z: tr.z, h: this.forest.variants[ tr.variant ].height * tr.s } );

			}

			this.particles.trees = list;

		}

		const wind = U.uWind.value;
		// raindrops bounce off the lake around the viewer
		const rain = this.weather.state.rain;
		if ( rain > 0.05 ) {

			const cp0 = this.camera.position;
			for ( let k = 0; k < Math.ceil( rain * 5 ); k ++ ) {

				const a = Math.random() * Math.PI * 2, d = 1.5 + Math.random() * 14;
				const x = cp0.x + Math.cos( a ) * d, z = cp0.z + Math.sin( a ) * d;
				if ( td.heightAt( x, z ) < - 0.05 ) this.particles.splash( _v.set( x, 0, z ), 2, 0.7 );

			}

		}

		this.particles.update( dt, t, this.camera, wind, this.water );
		this.water.update( dt );
		for ( const p of this.streams.ponds ) p.update( dt );
		this.streams.update( this.camera, dt );

		// soundscape
		const cp = this.camera.position;
		const ground = td.heightAt( cp.x, cp.z );
		td.biomeAt( cp.x, cp.z, bio );
		let shore = 0;
		for ( let k = 0; k < 8; k ++ ) {

			const a = k / 8 * Math.PI * 2;
			for ( const d of [ 4, 12, 28 ] ) {

				if ( td.heightAt( cp.x + Math.cos( a ) * d, cp.z + Math.sin( a ) * d ) < 0 ) shore = Math.max( shore, 1 - d / 36 );

			}

		}

		if ( ground < 0 ) shore = Math.max( shore, 0.5 );
		shore *= 1 - THREE.MathUtils.smoothstep( cp.y - Math.max( ground, 0 ), 5, 40 );
		const gust = 0.5 + 0.5 * Math.sin( t * 0.37 ) * Math.sin( t * 0.113 + 1.3 );
		this.audio.update( dt, this.camera, {
			gust, wind: wind.z, forest: bio[ 1 ], shore, altitude: cp.y - Math.max( ground, 0 ),
			night: U.uNight.value, dusk: 1 - Math.min( 1, Math.abs( sunEl + 2 ) / 6 ), rain: this.weather.state.rain,
			brook: 1 - THREE.MathUtils.smoothstep( this.streams.distanceTo( cp ), 2, 45 ),
			fall: Math.min( 1, 60 / Math.max( 1, cp.distanceTo( this.streams.poolPos ) ) ),
		} );

		// post parameters
		const post = this.post;
		post.exposure = this.exposureBias ?? 1;
		post.dt = dt;
		post.night = U.uNight.value;
		_v.copy( this.sky.sunDir ).multiplyScalar( 1000 ).add( this.camera.position ).project( this.camera );
		const onScreen = _v.z < 1 && Math.abs( _v.x ) < 1.4 && Math.abs( _v.y ) < 1.4;
		post.sunScreen.set( _v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5 );
		post.sunVisible = onScreen && this.quality.rays ? THREE.MathUtils.smoothstep( this.sky.sunDir.y, - 0.03, 0.02 ) * ( 1 - THREE.MathUtils.smoothstep( Math.max( Math.abs( _v.x ), Math.abs( _v.y ) ), 1.0, 1.4 ) ) : 0;
		post.raysTint.copy( U.uSunColor.value ).normalize().multiplyScalar( 1.5 ).addScalar( 0.2 );

		// dynamic resolution keeps things fluid on slower GPUs
		this._resTimer += this.realDt ?? dt;
		if ( this.autoResolution && this._resTimer > 1.5 && this.frame > 120 ) {

			this._resTimer = 0;
			let s = this.renderScale;
			if ( this._ftAvg > 24 && s > 0.55 ) s = Math.max( 0.55, s - 0.1 );
			else if ( this._ftAvg < 15 && s < 1 ) s = Math.min( 1, s + 0.05 );
			if ( s !== this.renderScale ) {

				this.renderScale = s;
				this.resize();

			}

		}

	}

	// copy a texture into a render target (a single full-screen triangle)
	_copy( tex, target ) {

		if ( ! this._copyPass ) this._copyPass = new FullscreenPass( passMaterial( /* glsl */ `
			uniform sampler2D uSrc;
			varying vec2 vUv;
			void main() { gl_FragColor = texture2D( uSrc, vUv ); }
		`, { uSrc: { value: null } } ) );
		this._copyPass.material.uniforms.uSrc.value = tex;
		this._copyPass.render( this.renderer, target );

	}

	render() {

		const r = this.renderer;
		r.info.reset();
		r.shadowMap.needsUpdate = true;
		this.scene.updateMatrixWorld();

		// The mirrors, all before the frame and at the top level: the stream's (three.js
		// Reflector), then the lake's and each pond's (three.js Water) when they are in view.
		const cam = this.camera, mask = cam.layers.mask;
		cam.updateMatrixWorld();
		this.streams.renderReflection( r, this.scene, cam );
		_frustum.setFromProjectionMatrix( _m4.multiplyMatrices( cam.projectionMatrix, cam.matrixWorldInverse ) );
		for ( const w of [ this.water, ...this.streams.ponds ] ) if ( inView( w.mesh ) ) w.renderMirror( r, this.scene, cam );

		// 1. everything but the water
		r.setRenderTarget( this.post.sceneRT );
		r.setClearColor( 0x000000, 1 );
		r.clear( true, true, false );
		cam.layers.disable( LAYERS.WATER );
		cam.layers.disable( LAYERS.FX );
		r.render( this.scene, cam );
		// 2. that frame becomes the refraction seen through the stream and the falls
		this._copy( this.post.sceneRT.texture, this.refractRT );
		// 3. the water, then the effects in front of it, over the same frame and depth
		const autoClear = r.autoClear;
		r.autoClear = false;
		r.setRenderTarget( this.post.sceneRT );
		cam.layers.set( LAYERS.WATER );
		r.render( this.scene, cam );
		cam.layers.set( LAYERS.FX );
		r.render( this.scene, cam );
		cam.layers.mask = mask;
		r.autoClear = autoClear;
		r.setRenderTarget( null );
		this.post.render( this.elapsed );
		this.frame ++;

	}

}
