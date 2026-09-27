import * as THREE from 'three';
import { propMaterial } from './kit.js';

// Dev only (tools/propview.mjs; nothing in the game imports it): a prop builder's output put
// down in the valley to be looked at. url: the builder's module; fn: its export, called as
// fn( ground ) with ground( lx, lz ) the terrain's height in the prop's frame (as buildHut is),
// returning { geometry, parts?, info? } - every BufferGeometry in parts is shown too.
export async function preview( app, url, fn, x, z, yaw = 0 ) {

	const mod = await import( /* @vite-ignore */ url );
	const td = app.terrainData, c = Math.cos( yaw ), s = Math.sin( yaw );
	const y0 = td.heightAt( x, z );
	const ground = ( lx, lz ) => td.heightAt( x + c * lx + s * lz, z - s * lx + c * lz ) - y0;
	const out = mod[ fn ]( ground );
	const g = new THREE.Group();
	g.position.set( x, y0, z );
	g.rotation.y = yaw;
	const mat = propMaterial( { side: THREE.DoubleSide } );
	const add = ( geo, name ) => {

		const m = new THREE.Mesh( geo, mat );
		m.castShadow = m.receiveShadow = true;
		m.name = name;
		g.add( m );

	};

	const walk = ( o, name, depth = 0 ) => {

		if ( ! o || depth > 4 ) return;
		if ( o.isBufferGeometry ) return add( o, name );
		if ( Array.isArray( o ) ) return o.forEach( ( v, i ) => walk( v, name + '.' + i, depth + 1 ) );
		if ( typeof o === 'object' && ! o.isVector3 ) for ( const [ k, v ] of Object.entries( o ) ) walk( v, name + '.' + k, depth + 1 );

	};

	walk( out.geometry, 'body' );
	walk( out.parts, 'parts' );
	window.__preview?.parent?.remove( window.__preview );
	app.scene.add( g );
	window.__preview = g;
	g.updateMatrixWorld( true );
	const box = new THREE.Box3().setFromObject( g );
	const centre = box.getCenter( new THREE.Vector3() ), size = box.getSize( new THREE.Vector3() );
	return { y0, meshes: g.children.length, centre: centre.toArray(), size: size.toArray(), info: out.info ?? null };

}
