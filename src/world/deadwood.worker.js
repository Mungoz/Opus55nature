import { bakeDeadwood } from './deadwood.js';

// Sculpts deadwood meshes off the main thread.
self.onmessage = ( e ) => {

	const out = e.data.map( bakeDeadwood );
	const transfer = [];
	for ( const r of out ) for ( const p of [ r.hi, r.lo ] ) transfer.push( p.pos.buffer, p.nrm.buffer, p.idx.buffer, p.bark.buffer, p.inf.buffer );
	self.postMessage( out, transfer );

};
