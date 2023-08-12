import * as THREE from "three";
import { getSizeXY } from "./helper";
import vertexShaderCode from "./shaders/vertex-shader.glsl";
import fragmentShaderCode from "./shaders/fragment-shader.glsl";

interface OptParticleRenderParamsSetter {
  PIXEL_SCALE?: number;
  PARTICLE_COLOR?: number;
  BACKGROUND_COLOR?: number;
  FRUSTUM_SIZE?: number;
}
export class ParticleRenderParams {
  PIXEL_SCALE: number;
  PARTICLE_COLOR: number;
  BACKGROUND_COLOR: number;
  FRUSTUM_SIZE: number;

  constructor(params: OptParticleRenderParamsSetter) {
    this.PIXEL_SCALE = params.PIXEL_SCALE ?? 4;
    this.PARTICLE_COLOR = params.PARTICLE_COLOR ?? 0x0000ff;
    this.BACKGROUND_COLOR = params.BACKGROUND_COLOR ?? 0xffffff;
    this.FRUSTUM_SIZE = params.FRUSTUM_SIZE ?? 200;
  }
}

export class ParticleRender {
  renderer: THREE.WebGLRenderer;
  geometry: THREE.BufferGeometry;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  particleUniforms: { [key: string]: { value: any } };
  params: ParticleRenderParams;

  constructor(
    canvasContainer: HTMLElement,
    nParticles: number,
    params: OptParticleRenderParamsSetter = {}
  ) {
    this.params = new ParticleRenderParams(params);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(
      canvasContainer.clientWidth,
      canvasContainer.clientHeight
    );
    this.renderer.setClearColor(this.params.BACKGROUND_COLOR, 1);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    canvasContainer.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.params.BACKGROUND_COLOR);

    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    this.camera = new THREE.OrthographicCamera(
      (this.params.FRUSTUM_SIZE * aspect) / -2,
      (this.params.FRUSTUM_SIZE * aspect) / 2,
      this.params.FRUSTUM_SIZE / 2,
      this.params.FRUSTUM_SIZE / -2
    );
    this.camera.position.z = 1;
    this.scene.add(this.camera);

    this.particleUniforms = {
      texturePosition: { value: null },
      color: { value: new THREE.Color(this.params.PARTICLE_COLOR) },
      pixelScale: { value: this.params.PIXEL_SCALE },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.particleUniforms,
      vertexShader: vertexShaderCode,
      fragmentShader: fragmentShaderCode,
      side: THREE.DoubleSide,
    });

    this.geometry = new ParticleGeometry(nParticles);

    const particleMesh = new THREE.Mesh(this.geometry, material);
    particleMesh.matrixAutoUpdate = false;
    particleMesh.updateMatrix();
    this.scene.add(particleMesh);
  }

  setParticlePositions(positions: THREE.Texture) {
    this.particleUniforms["texturePosition"].value = positions;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

class ParticleGeometry extends THREE.BufferGeometry {
  nParticles: number;
  posTexWidth: number;
  posTexHeight: number;

  segments: number;
  points: number;

  indices: number[];
  vertices: THREE.BufferAttribute;
  referencesX: THREE.BufferAttribute;
  referencesY: THREE.BufferAttribute;

  constructor(nParticles: number, segments: number = 20) {
    super();

    this.nParticles = nParticles;
    [this.posTexWidth, this.posTexHeight] = getSizeXY(2 * nParticles);

    this.segments = segments;
    this.points = nParticles * (segments + 2); // +1 for center vertex, and another
    //                                            +1 for inclusive range starting at 0; [0, segments]

    this.vertices = new THREE.BufferAttribute(
      new Float32Array(this.points * 3),
      3
    );
    this.referencesX = new THREE.BufferAttribute(
      new Float32Array(this.points * 2),
      2
    );
    this.referencesY = new THREE.BufferAttribute(
      new Float32Array(this.points * 2),
      2
    );
    this.indices = [];

    this.setVertices();
    this.setIndices();
    this.setPositionTextureReference();

    this.setIndex(this.indices);
    this.setAttribute("position", this.vertices);
    this.setAttribute("referenceX", this.referencesX);
    this.setAttribute("referenceY", this.referencesY);
    // optional
    this.attributes.referenceX.name = "referenceX";
    this.attributes.referenceY.name = "referenceY";
    this.attributes.position.name = "position";
  }

  setIndices() {
    for (let i = 0; i < this.nParticles; i++) {
      for (let s = 0; s <= this.segments; s++) {
        const particleIndex = i * (this.segments + 1) + i;
        if (s > 0)
          this.indices.push(
            particleIndex + s,
            particleIndex + s + 1,
            particleIndex
          );
      }
    }
  }

  setVertices() {
    let v = 0;
    const verts_push = (...args: number[]) => {
      for (let i = 0; i < args.length; i++) this.vertices.set([args[i]], v++);
    };

    const vertex = new THREE.Vector3(); // helper variable

    for (let i = 0; i < this.nParticles; i++) {
      verts_push(0, 0, 0);
      for (let s = 0; s <= this.segments; s++) {
        const segment = (s / this.segments) * 2 * Math.PI;
        vertex.x = Math.cos(segment);
        vertex.y = Math.sin(segment);
        verts_push(vertex.x, vertex.y, vertex.z);
      }
    }
  }

  setPositionTextureReference() {
    for (let v = 0; v < this.points; v++) {
      // for each of the vertices constructing a circle, set all of them
      //  referring to the same particle in the output gpuCompute texture,
      //  noting that when reading the texture image- in a 1D, sequential
      //  fashion (row by row, left to right)- every index is a particle's
      //  x coord, and every other index is a y coord.
      const particleIndex = Math.trunc(v / (this.points / this.nParticles));
      const refXx = ((particleIndex * 2) % this.posTexWidth) / this.posTexWidth;
      const refXy =
        Math.trunc((particleIndex * 2) / this.posTexWidth) / this.posTexHeight;
      const refYx =
        ((particleIndex * 2 + 1) % this.posTexWidth) / this.posTexWidth;
      const refYy =
        Math.trunc((particleIndex * 2 + 1) / this.posTexWidth) /
        this.posTexHeight;

      this.referencesX.set([refXx, refXy], v * 2);
      this.referencesY.set([refYx, refYy], v * 2);
    }
  }
}
