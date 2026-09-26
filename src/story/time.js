// hours as "hh:mm"
export function fmtTime( h ) {

	const hh = Math.floor( h ), mm = Math.floor( ( h - hh ) * 60 );
	return `${String( hh ).padStart( 2, '0' )}:${String( mm ).padStart( 2, '0' )}`;

}
