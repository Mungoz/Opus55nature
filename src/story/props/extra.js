import * as THREE from 'three';
import { Kit, M, col, mixc } from './kit.js';
import { beam, bolt, ring } from './jetty.js';
import { commonParsGLSL } from '../../shaders/common.glsl.js';
import { sharedUniforms } from '../../core/uniforms.js';

// The smaller things along the route (after shots/refs/fence, signs, trail): a pasture fence of
// round posts and crooked split rails with a braced gate; the signpost at the junction with its
// yellow arms and the walkers' register in a tin box; a wayside cross under a little roof;
// cairns; red-white-red blazes painted on trunks, posts and stones.

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );

function rand( seed ) {

	let s = seed >>> 0;
	return () => ( ( s = Math.imul( s ^ ( s >>> 15 ), 2246822507 ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 4294967296;

}

// a crooked split rail between a and b: a half-round, wandering a little, thicker at one end
function rail( k, a, b, r, c, seed ) {

	const R = rand( seed );
	const d = b.clone().sub( a ), len = d.length(), n = Math.max( 3, Math.round( len / 0.5 ) );
	const up = V( 0, 1, 0 ), side = new THREE.Vector3().crossVectors( d, up ).normalize();
	const pts = [];
	for ( let i = 0; i <= n; i ++ ) {

		const t = i / n;
		const wob = Math.sin( t * Math.PI ) * ( R() - 0.5 ) * 0.06;
		pts.push( a.clone().lerp( b, t ).addScaledVector( side, wob ).add( V( 0, Math.sin( t * Math.PI * ( 1 + R() ) ) * 0.02, 0 ) ) );

	}

	const curve = new THREE.CatmullRomCurve3( pts );
	const g = new THREE.TubeGeometry( curve, n * 3, r, 6, false );
	// taper: thicker at the butt
	const p = g.getAttribute( 'position' );
	for ( let i = 0; i < p.count; i ++ ) {

		const q = V( p.getX( i ), p.getY( i ), p.getZ( i ) );
		const t = THREE.MathUtils.clamp( q.clone().sub( a ).dot( d ) / ( len * len ), 0, 1 );
		const c0 = curve.getPoint( t );
		q.sub( c0 ).multiplyScalar( 1.15 - t * 0.3 ).add( c0 );
		// split rails are flat on one face
		p.setXYZ( i, q.x, Math.max( q.y, c0.y - r * 0.45 ), q.z );

	}

	g.computeVertexNormals();
	k.add( g, M.BARK, c, d.normalize().toArray(), a.clone().lerp( b, 0.5 ).toArray() );

}

// A pasture fence along pts ([ [ x, z ] ], world), the gate at segment gi (its first post
// the hinge). ground( x, z ). Returns { geometry, gate: { geometry, hinge, len, closedYaw } }.
export function buildFence( ground, pts, gi = - 1, seed = 5 ) {

	const R = rand( seed );
	const k = new Kit( ground );
	const wood = () => mixc( '#6e6457', '#877c6d', R() ).multiplyScalar( 0.85 + 0.25 * R() );
	const posts = [];
	// posts every 2.4 m or so
	for ( let s = 0; s < pts.length - 1; s ++ ) {

		const [ ax, az ] = pts[ s ], [ bx, bz ] = pts[ s + 1 ];
		const len = Math.hypot( bx - ax, bz - az );
		const n = s === gi ? 1 : Math.max( 1, Math.round( len / 2.4 ) );
		for ( let i = 0; i < n; i ++ ) posts.push( { x: ax + ( bx - ax ) * i / n, z: az + ( bz - az ) * i / n, seg: s, gate: s === gi && i === 0 } );

	}

	posts.push( { x: pts[ pts.length - 1 ][ 0 ], z: pts[ pts.length - 1 ][ 1 ], seg: pts.length - 1 } );
	for ( const p of posts ) {

		const g = ground( p.x, p.z );
		p.g = g;
		const h = p.gate || posts[ posts.indexOf( p ) - 1 ]?.gate ? 1.35 : 1.12 + R() * 0.1;
		p.top = g + h;
		k.pole( V( p.x, g - 0.3, p.z ), V( p.x + ( R() - 0.5 ) * 0.05, p.top, p.z + ( R() - 0.5 ) * 0.05 ), p.gate || posts[ posts.indexOf( p ) - 1 ]?.gate ? 0.085 : 0.065, M.LOG, wood(), R() * 9 );
		// a cap of weathered end grain and a split in the top
		k.box( p.x, p.top + 0.01, p.z, 0.1, 0.02, 0.1, M.END, wood().multiplyScalar( 0.8 ) );

	}

	// rails: two (three on the steeper stretches), nailed to the side of each post
	for ( let i = 0; i < posts.length - 1; i ++ ) {

		const a = posts[ i ], b = posts[ i + 1 ];
		if ( a.gate ) continue;
		const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot( dx, dz );
		const sx = dz / l * 0.08, sz = - dx / l * 0.08;
		for ( const h of [ 0.45, 0.92 ] ) {

			const ya = a.g + h + ( R() - 0.5 ) * 0.05, yb = b.g + h + ( R() - 0.5 ) * 0.05;
			rail( k, V( a.x + sx - dx / l * 0.12, ya, a.z + sz - dz / l * 0.12 ), V( b.x + sx + dx / l * 0.12, yb, b.z + sz + dz / l * 0.12 ), 0.045 + R() * 0.012, wood(), R() * 1e6 );

		}

	}

	// the gate: a frame of squared rails with a diagonal brace, iron strap hinges and a latch
	let gate = null;
	const gp = posts.findIndex( ( p ) => p.gate );
	if ( gp >= 0 ) {

		const a = posts[ gp ], b = posts[ gp + 1 ];
		const len = Math.hypot( b.x - a.x, b.z - a.z ) - 0.2, gh = 1.15;
		const G = new Kit( ( x, z ) => - 1 );
		const gw = () => mixc( '#6b6155', '#83786a', R() );
		for ( const y of [ 0.18, 0.62, 1.06 ] ) G.box( len / 2, y, 0, len, 0.1, 0.045, M.BOARD, gw(), { axis: [ 1, 0, 0 ], round: 0.01 } );
		for ( const x of [ 0.05, len - 0.05 ] ) G.box( x, gh / 2, 0.03, 0.09, gh, 0.045, M.BOARD, gw(), { axis: [ 0, 1, 0 ], round: 0.01 } );
		beam( G, V( 0.1, 0.2, - 0.035 ), V( len - 0.1, 1.0, - 0.035 ), 0.08, 0.04, M.BOARD, gw(), { up: V( 0, 0, 1 ) } );
		for ( const y of [ 0.18, 1.06 ] ) {

			G.box( 0.22, y, 0.03, 0.42, 0.04, 0.008, M.IRON, col( '#35302b' ) );
			ring( G, V( 0, y, 0 ), V( 0, 1, 0 ), 0.03, 0.008 );

		}

		G.box( len - 0.02, 0.8, 0.045, 0.12, 0.03, 0.02, M.IRON, col( '#35302b' ) );
		gate = { geometry: G.build(), hinge: V( a.x, a.g, a.z ), yaw: Math.atan2( b.x - a.x, b.z - a.z ) - Math.PI / 2, len, latch: V( b.x, b.g + 0.8, b.z ) };

	}

	return { geometry: k.build(), gate, posts };

}

// ---------------------------------------------------------------------------
// The signpost: a larch post, yellow arms with black lettering (canvas-painted), a small tin
// register box with a hinged lid below them, a red-white-red band round the post
// ---------------------------------------------------------------------------
export function signTexture( lines, { w = 512, h = 128, arrow = 1 } = {} ) {

	const c = document.createElement( 'canvas' );
	c.width = w; c.height = h;
	const g = c.getContext( '2d' );
	// enamelled yellow, faded and spotted with lichen and rust at the rivets
	g.fillStyle = '#d9a91c';
	g.fillRect( 0, 0, w, h );
	for ( let i = 0; i < 600; i ++ ) {

		g.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 40},20,${Math.random() * 0.08})`;
		g.beginPath(); g.arc( Math.random() * w, Math.random() * h, Math.random() * 6, 0, 7 ); g.fill();

	}

	g.fillStyle = '#1a1712';
	g.font = `600 ${Math.round( h * 0.3 )}px Inter, Arial, sans-serif`;
	lines.forEach( ( [ place, time ], i ) => {

		const y = h * ( 0.42 + i * 0.36 );
		g.textAlign = 'left';
		g.fillText( place, arrow > 0 ? w * 0.06 : w * 0.18, y );
		g.textAlign = 'right';
		g.fillText( time, arrow > 0 ? w * 0.8 : w * 0.95, y );

	} );
	// a white border line, as the Swiss signs have
	g.strokeStyle = 'rgba(245,238,220,0.7)';
	g.lineWidth = h * 0.03;
	g.strokeRect( h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12 );
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;

}

// a textured flat thing (sign arms, the cloth) lit like the rest
export function paintedMaterial( map, { side = THREE.FrontSide, rough = 0.6 } = {} ) {

	return new THREE.ShaderMaterial( {
		vertexShader: /* glsl */ `
			varying vec3 vWorldPos; varying vec3 vNormal; varying vec2 vUv;
			void main() {
				vec4 wp = modelMatrix * vec4( position, 1.0 );
				vWorldPos = wp.xyz; vNormal = normalize( mat3( modelMatrix ) * normal ); vUv = uv;
				gl_Position = projectionMatrix * viewMatrix * wp;
			}`,
		fragmentShader: /* glsl */ `
			${commonParsGLSL}
			uniform sampler2D tMap;
			uniform float uRough;
			varying vec3 vWorldPos; varying vec3 vNormal; varying vec2 vUv;
			void main() {
				vec3 N = normalize( vNormal );
				if ( ! gl_FrontFacing ) N = - N;
				vec3 V = normalize( cameraPosition - vWorldPos );
				vec4 t = texture2D( tMap, vUv );
				if ( t.a < 0.5 ) discard;
				vec3 alb = t.rgb * 0.8;
				float sh = sunShadow( vWorldPos, N );
				vec3 col = shadeSurface( alb, N, V, vWorldPos, 0.9, sh, uRough, 0.04 );
				col = applyAtmosphere( col, vWorldPos );
				gl_FragColor = vec4( col, 1.0 );
			}`,
		uniforms: { ...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ), ...sharedUniforms(), tMap: { value: map }, uRough: { value: rough } },
		lights: true,
		side,
	} );

}

// arms: [ { text: [ [ place, time ], ... ], yaw (world, the way it points), y } ]
export function buildSignpost( ground, x, z, arms, seed = 9, { register: withRegister = true } = {} ) {

	const R = rand( seed );
	const k = new Kit( ground );
	const g = ground( x, z );
	const top = g + 2.35;
	k.pole( V( x, g - 0.4, z ), V( x, top, z ), 0.07, M.LOG, mixc( '#6a5d4d', '#7d6f5d', 0.5 ), 3 );
	k.box( x, top + 0.02, z, 0.15, 0.03, 0.15, M.IRON, col( '#4a4540' ) );
	// the register: a galvanised box, its lid hinged at the back, a ring pull, on a bracket
	const by = g + 1.2;
	if ( withRegister ) k.box( x, by, z + 0.1, 0.24, 0.3, 0.12, M.IRON, col( '#8d8c86' ), { axis: [ 0, 1, 0 ] } );
	if ( withRegister ) {

		k.box( x, by + 0.165, z + 0.1, 0.27, 0.025, 0.15, M.IRON, col( '#7b7a74' ), { rot: [ 0.08, 0, 0 ] } );
		ring( k, V( x, by + 0.12, z + 0.17 ), V( 0, 0, 1 ), 0.018, 0.004 );
		for ( const dy of [ - 0.1, 0.1 ] ) bolt( k, V( x, by + dy, z + 0.162 ), V( 0, 0, 1 ), 0.008 );

	}
	const geo = k.build();
	// the arms: planks painted yellow, pointed at one end, bolted round the post
	const group = new THREE.Group();
	arms.forEach( ( a, i ) => {

		const tex = signTexture( a.text, { arrow: 1 } );
		const len = 0.62, hgt = a.text.length > 1 ? 0.2 : 0.14;
		const sh = new THREE.Shape( [ new THREE.Vector2( 0, - hgt / 2 ), new THREE.Vector2( len - 0.08, - hgt / 2 ), new THREE.Vector2( len, 0 ), new THREE.Vector2( len - 0.08, hgt / 2 ), new THREE.Vector2( 0, hgt / 2 ) ] );
		const eg = new THREE.ExtrudeGeometry( sh, { depth: 0.02, bevelEnabled: false } );
		// uvs: x along the arm, y up
		const p = eg.getAttribute( 'position' ), uv = eg.getAttribute( 'uv' );
		for ( let j = 0; j < p.count; j ++ ) uv.setXY( j, p.getX( j ) / len, ( p.getY( j ) + hgt / 2 ) / hgt );
		eg.translate( 0.075, 0, - 0.01 );
		const m = new THREE.Mesh( eg, paintedMaterial( tex, { side: THREE.DoubleSide } ) );
		m.position.set( x, top - 0.18 - i * 0.24, z );
		m.rotation.y = a.yaw - Math.PI / 2;
		m.castShadow = m.receiveShadow = true;
		group.add( m );
		void R;

	} );

	return { geometry: geo, arms: group, register: V( x, by + 0.05, z + 0.12 ) };

}

// ---------------------------------------------------------------------------
// The wayside cross (after the carved Wegkreuze of Bavaria and Tyrol, shots/refs/signs): a
// squared larch cross set in a stone foot, a little gabled roof of shingles over the crossing,
// a tin plaque, a jar of dried flowers at its foot
// ---------------------------------------------------------------------------
export function buildCross( ground, x, z, yaw, seed = 13 ) {

	const R = rand( seed );
	const k = new Kit( ground );
	const g = ground( x, z );
	const c = Math.cos( yaw ), s = Math.sin( yaw );
	const W = ( lx, ly, lz ) => V( x + c * lx + s * lz, g + ly, z - s * lx + c * lz );
	const wood = mixc( '#5a4a39', '#6c5a46', R() );
	const put = ( lx, ly, lz, sx, sy, sz, mat, colr, extra = {} ) => {

		const p = W( lx, ly, lz );
		k.box( p.x, p.y, p.z, sx, sy, sz, mat, colr, { ...extra, rot: [ extra.rot?.[ 0 ] ?? 0, yaw + ( extra.rot?.[ 1 ] ?? 0 ), extra.rot?.[ 2 ] ?? 0 ] } );

	};

	// the foot: a rough block of stone
	k.stone( x, g - 0.05, z, 0.32, 0.3, 0.3, '#8a857b', 3 );
	put( 0, 1.3, 0, 0.13, 2.6, 0.12, M.LOG, wood, { axis: [ 0, 1, 0 ] } );
	put( 0, 2.02, 0.005, 1.05, 0.11, 0.11, M.LOG, wood, { axis: [ 1, 0, 0 ] } );
	// the little roof over the crossing: two boards and shingles, a ridge board
	for ( const sd of [ - 1, 1 ] ) {

		put( sd * 0.22, 2.73, 0.02, 0.5, 0.025, 0.42, M.SHINGLE, mixc( '#6d665c', '#5c554c', R() ), { rot: [ 0, 0, sd * - 0.6 ], axis: [ 1, 0, 0 ] } );
		put( sd * 0.45, 2.32, 0.02, 0.025, 0.72, 0.4, M.BOARD, wood, { rot: [ 0, 0, sd * 0.1 ], axis: [ 0, 1, 0 ] } );

	}

	put( 0, 2.9, 0.02, 0.05, 0.05, 0.44, M.BOARD, wood, { axis: [ 0, 0, 1 ] } );
	// a tin plaque below the crossing, its words long gone
	put( 0, 1.72, 0.07, 0.2, 0.12, 0.01, M.IRON, col( '#6f6c64' ) );
	// the jar of dried flowers
	{

		const p = W( 0.1, 0, 0.3 );
		const gy = ground( p.x, p.z );
		const jar = new THREE.CylinderGeometry( 0.045, 0.04, 0.14, 12, 1, true );
		jar.translate( p.x, gy + 0.07, p.z );
		k.add( jar, M.STONE, col( '#8e9a92' ), [ 0, 1, 0 ] );
		for ( let i = 0; i < 7; i ++ ) {

			const a = R() * Math.PI * 2, r = R() * 0.03;
			const q = V( p.x + Math.cos( a ) * r, gy + 0.12, p.z + Math.sin( a ) * r );
			const tip = q.clone().add( V( Math.cos( a ) * 0.06, 0.18 + R() * 0.12, Math.sin( a ) * 0.06 ) );
			k.pole( q, tip, 0.003, M.LOG, col( '#6b5a3a' ), i );
			k.stone( tip.x, tip.y - 0.01, tip.z, 0.018, 0.014, 0.018, mixc( '#7a4a52', '#8a7a58', R() ), i * 7 );

		}

	}

	return k.build();

}

// a cairn: rough stones heaped, smaller toward the top (on a stump or rock: base y)
export function cairn( k, x, y, z, h = 0.7, seed = 1 ) {

	const R = rand( seed );
	let yy = y, r = 0.22 + h * 0.18;
	while ( yy < y + h ) {

		const n = r > 0.18 ? 3 : 1;
		for ( let i = 0; i < n; i ++ ) {

			const a = R() * Math.PI * 2, d = n > 1 ? r * 0.5 : 0;
			const rx = r * ( 0.7 + R() * 0.4 ), ry = r * ( 0.35 + R() * 0.2 ), rz = r * ( 0.6 + R() * 0.4 );
			k.stone( x + Math.cos( a ) * d, yy, z + Math.sin( a ) * d, rx, ry, rz, mixc( '#8e897f', '#6d675e', R() ).multiplyScalar( 0.9 + R() * 0.25 ), R() * 99, [ ( R() - 0.5 ) * 0.2, 0, ( R() - 0.5 ) * 0.2 ] );

		}

		yy += r * 0.55;
		r *= 0.78;

	}

}

// ---------------------------------------------------------------------------
// Blazes: red-white-red bands painted on a trunk (a curved patch wrapped round it at eye
// height, facing the path) or a flat patch on a stone or post
// ---------------------------------------------------------------------------
let _blazeTex = null;
function blazeTexture() {

	if ( _blazeTex ) return _blazeTex;
	const c = document.createElement( 'canvas' );
	c.width = 64; c.height = 128;
	const g = c.getContext( '2d' );
	g.clearRect( 0, 0, 64, 128 );
	// three bands, brushed on: ragged edges, the paint thinner where the bark stood proud
	const band = ( y0, y1, color ) => {

		for ( let x = 0; x < 64; x ++ ) {

			const a = y0 + ( Math.random() - 0.5 ) * 5, b = y1 + ( Math.random() - 0.5 ) * 5;
			g.fillStyle = color;
			g.globalAlpha = 0.75 + Math.random() * 0.25;
			g.fillRect( x, a, 1, b - a );

		}

	};

	band( 8, 44, '#b3261e' );
	band( 44, 84, '#e8e2d4' );
	band( 84, 120, '#b3261e' );
	g.globalAlpha = 1;
	// flaking: holes through the paint
	for ( let i = 0; i < 40; i ++ ) {

		g.clearRect( Math.random() * 64, Math.random() * 128, 2 + Math.random() * 4, 1 + Math.random() * 3 );

	}

	_blazeTex = new THREE.CanvasTexture( c );
	_blazeTex.colorSpace = THREE.SRGBColorSpace;
	return _blazeTex;

}

// blazes: [ { x, y, z, nx, nz, r } ] (r: the trunk's radius, 0 for a flat patch)
export function buildBlazes( list ) {

	const geos = [];
	for ( const b of list ) {

		const w = 0.2, h = 0.3;
		let g;
		if ( b.r > 0 ) {

			// a patch of cylinder wrapped round the trunk, a hair off the bark
			const arc = Math.min( 1.4, w / b.r );
			g = new THREE.CylinderGeometry( b.r + 0.012, b.r + 0.012, h, 8, 1, true, - arc / 2, arc );
			g.rotateY( Math.atan2( b.nx, b.nz ) );

		} else {

			g = new THREE.PlaneGeometry( w * 0.8, h * 0.8 );
			g.rotateY( Math.atan2( b.nx, b.nz ) );
			if ( b.up ) {

				g.rotateX( 0 );

			}

		}

		g.translate( b.x, b.y, b.z );
		geos.push( g.index ? g.toNonIndexed() : g );

	}

	if ( ! geos.length ) return null;
	const g = mergeAll( geos );
	const m = new THREE.Mesh( g, paintedMaterial( blazeTexture(), { rough: 0.8 } ) );
	m.name = 'blazes';
	m.receiveShadow = true;
	return m;

}

function mergeAll( geos ) {

	const pos = [], nrm = [], uv = [];
	for ( const g of geos ) {

		pos.push( ...g.getAttribute( 'position' ).array );
		nrm.push( ...g.getAttribute( 'normal' ).array );
		uv.push( ...g.getAttribute( 'uv' ).array );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( nrm, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	g.computeBoundingSphere();
	return g;

}
