import fs from 'node:fs';
const out = process.argv[ 2 ];
const queries = [ [ 'siskin', 'Spinus spinus', 2 ], [ 'redpoll', 'Acanthis flammea', 2 ], [ 'wagtail', 'Motacilla alba', 2 ], [ 'dipper', 'Cinclus cinclus', 2 ], [ 'buzzard', 'Buteo buteo flight', 2 ], [ 'raven', 'Corvus corax flight', 2 ] ];
const UA = { 'User-Agent': 'LarchmereRefBot/1.0 (personal research)' };
const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
for ( const [ name, q, n ] of queries ) {
	await sleep( 6000 );
	const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${ encodeURIComponent( q ) }&gsrnamespace=6&gsrlimit=${ n + 6 }&prop=imageinfo&iiprop=url&iiurlwidth=1000&format=json`;
	let j;
	try { j = await ( await fetch( url, { headers: UA } ) ).json(); } catch ( e ) { console.log( name, 'query failed' ); continue; }
	const pages = Object.values( j.query?.pages || {} ).sort( ( a, b ) => a.index - b.index ).filter( ( p ) => /\.(jpe?g|png)$/i.test( p.title ) );
	if ( ! pages.length ) console.log( name, 'no results' );
	let k = 0;
	for ( const p of pages ) {
		if ( k >= n ) break;
		await sleep( 3000 );
		const r = await fetch( p.imageinfo[ 0 ].thumburl, { headers: UA } );
		if ( ! r.ok ) { console.log( name, 'download', r.status ); continue; }
		const file = `${ out }/${ name }_${ k }.jpg`;
		fs.writeFileSync( file, Buffer.from( await r.arrayBuffer() ) );
		console.log( file.split( '/' ).pop(), '<-', p.title );
		k ++;
	}
}
