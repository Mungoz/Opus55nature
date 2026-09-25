import * as THREE from 'three';

// A single oversized triangle covering the viewport; cheaper than a quad and avoids the diagonal seam.
const triGeometry = new THREE.BufferGeometry();
triGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ], 3 ) );
triGeometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( [ 0, 0, 2, 0, 0, 2 ], 2 ) );

const orthoCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

export const fullscreenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

export class FullscreenPass {

	constructor( material ) {

		this.material = material;
		this.mesh = new THREE.Mesh( triGeometry, material );
		this.mesh.frustumCulled = false;
		this.scene = new THREE.Scene();
		this.scene.add( this.mesh );

	}

	render( renderer, target, viewport = null, layer = 0 ) {

		const prevTarget = renderer.getRenderTarget();
		const prevAutoClear = renderer.autoClear;
		renderer.autoClear = false;
		renderer.setRenderTarget( target, layer );
		if ( viewport ) {

			target.viewport.set( viewport.x, viewport.y, viewport.z, viewport.w );
			target.scissor.set( viewport.x, viewport.y, viewport.z, viewport.w );
			target.scissorTest = true;

		}

		renderer.render( this.scene, orthoCamera );
		if ( viewport ) {

			target.viewport.set( 0, 0, target.width, target.height );
			target.scissor.set( 0, 0, target.width, target.height );
			target.scissorTest = false;

		}

		renderer.autoClear = prevAutoClear;
		renderer.setRenderTarget( prevTarget );

	}

	dispose() {

		this.material.dispose();

	}

}

export function passMaterial( fragmentShader, uniforms = {}, extra = {} ) {

	return new THREE.ShaderMaterial( {
		vertexShader: fullscreenVertex,
		fragmentShader,
		uniforms,
		depthTest: false,
		depthWrite: false,
		...extra,
	} );

}

export function makeTarget( width, height, options = {} ) {

	const rt = new THREE.WebGLRenderTarget( width, height, {
		type: options.type ?? THREE.HalfFloatType,
		format: options.format ?? THREE.RGBAFormat,
		minFilter: options.minFilter ?? THREE.LinearFilter,
		magFilter: options.magFilter ?? THREE.LinearFilter,
		wrapS: options.wrap ?? THREE.ClampToEdgeWrapping,
		wrapT: options.wrap ?? THREE.ClampToEdgeWrapping,
		generateMipmaps: options.mipmaps ?? false,
		depthBuffer: options.depth ?? false,
		stencilBuffer: false,
		samples: options.samples ?? 0,
		colorSpace: options.colorSpace ?? THREE.NoColorSpace,
		anisotropy: options.anisotropy ?? 1,
	} );
	rt.texture.name = options.name ?? '';
	return rt;

}

// Renders a shader into a fresh target and returns it.
export function bake( renderer, width, height, fragmentShader, uniforms, options = {} ) {

	const target = makeTarget( width, height, options );
	const pass = new FullscreenPass( passMaterial( fragmentShader, uniforms ) );
	pass.render( renderer, target );
	pass.dispose();
	return target;

}

export const nextFrame = () => new Promise( ( resolve ) => requestAnimationFrame( () => resolve() ) );
