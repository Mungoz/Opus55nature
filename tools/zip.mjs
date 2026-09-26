// Packs dist/ into a zip (default larchmere-itch.zip) with index.html at the archive root.
// (Windows' Compress-Archive writes backslash paths, which itch.io rejects.)
import { zipSync } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve( 'dist' );
if ( ! fs.existsSync( path.join( root, 'index.html' ) ) ) {

	console.error( 'dist/index.html not found - run `npm run build` first.' );
	process.exit( 1 );

}

const files = {};
const walk = ( dir ) => {

	for ( const name of fs.readdirSync( dir ) ) {

		const full = path.join( dir, name );
		if ( fs.statSync( full ).isDirectory() ) walk( full );
		else files[ path.relative( root, full ).split( path.sep ).join( '/' ) ] = [ fs.readFileSync( full ), { level: 9 } ];

	}

};

walk( root );
const out = zipSync( files );
const name = process.argv[ 2 ] || 'larchmere-itch.zip';
fs.writeFileSync( name, out );
const total = Object.keys( files ).length;
console.log( `${name}  ${( out.length / 1024 ).toFixed( 0 )} KB  (${total} files)` );
for ( const f of Object.keys( files ) ) console.log( '  ' + f );
