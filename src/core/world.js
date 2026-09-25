// World layout constants shared by generators, materials and gameplay code.
// Units are meters. +x = east, -z = north, +y = up. Water surface sits at y = 0.

export const WORLD = {
	size: 12000,
	waterLevel: 0,
	near: { cx: - 100, cz: - 40, size: 2560, res: 2048 },
	far: { cx: 0, cz: 0, size: 12000, res: 2048 },
	lakeCenter: [ 0, - 330 ],
	latitude: 46.5,
	// Camera limits (keeps the viewer where the terrain has detail).
	boundsRadius: 2600,
	maxAltitude: 1600,
};

// Render layers: 0 is everything mirrors see; 1 main-view only (grass, detailed terrain);
// 2 mirror-only (the cheap terrain); water is drawn after the rest of the frame (its
// refraction is a copy of it), and effects (rain, spray, motes) after the water.
export const LAYERS = { MAIN: 1, MIRROR: 2, WATER: 3, FX: 4 };

export function regionOrigin( r ) {

	return [ r.cx - r.size / 2, r.cz - r.size / 2 ];

}
