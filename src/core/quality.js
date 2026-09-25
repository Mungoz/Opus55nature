// Quality presets. Terrain spacing is fixed at load; everything else can change live.
export const PRESETS = {
	low: {
		label: 'Low', pixelRatio: 0.75, msaa: 0, shadowSize: 1024, cascades: 1,
		grassDensity: 0.35, grassNear: 16, grassFar: 45, treeNear: 70, reflectScale: 0.35,
		terrainSpacing: 3.5, bloom: true, rays: false, particles: 0.4, fur: 0, riverMirrors: 1,
	},
	medium: {
		label: 'Medium', pixelRatio: 1, msaa: 2, shadowSize: 2048, cascades: 2,
		grassDensity: 0.6, grassNear: 20, grassFar: 60, treeNear: 110, reflectScale: 0.5,
		terrainSpacing: 2.6, bloom: true, rays: true, particles: 0.7, fur: 8, riverMirrors: 2,
	},
	high: {
		label: 'High', pixelRatio: 1, msaa: 4, shadowSize: 2048, cascades: 2,
		grassDensity: 1, grassNear: 24, grassFar: 75, treeNear: 150, reflectScale: 0.5,
		terrainSpacing: 2, bloom: true, rays: true, particles: 1, fur: 12, riverMirrors: 3,
	},
	ultra: {
		label: 'Ultra', pixelRatio: 2, msaa: 4, shadowSize: 4096, cascades: 2,
		grassDensity: 1.35, grassNear: 30, grassFar: 95, treeNear: 220, reflectScale: 0.7,
		terrainSpacing: 1.5, bloom: true, rays: true, particles: 1, fur: 16, riverMirrors: 4,
	},
};

export function pickDefaultPreset() {

	const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test( navigator.userAgent );
	if ( mobile ) return 'low';
	return 'high';

}
