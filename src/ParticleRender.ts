import * as THREE from "three";
import vertexShaderCode from "./shaders/vertex-shader.glsl";
import fragmentShaderCode from "./shaders/fragment-shader.glsl";
import { ParticleGeometry } from "./visuals/ParticleGeometry";
import { ParticleVisual } from "./visuals/ParticleVisuals";
import { BoundingBox, CanvasVisual } from "./visuals/CanvasVisuals";

interface OptParticleRenderParamsSetter {
  FRUSTUM_SIZE?: number;
  SCALE?: number;
}
export class ParticleRenderParams {
  FRUSTUM_SIZE: number;
  SCALE: number;

  constructor(params: OptParticleRenderParamsSetter) {
    this.FRUSTUM_SIZE = params.FRUSTUM_SIZE ?? 1;
    this.SCALE = params.SCALE ?? 0.005;
  }
}

const shaderCode = { vertex: vertexShaderCode, fragment: fragmentShaderCode };

function injectFuncBody(
  shaderSection: "vertex" | "fragment",
  name: string,
  body?: unknown
) {
  const code = shaderCode[shaderSection];
  const matchStart = code
    .matchAll(new RegExp(`${name}[\\s\\S]+?{`, "g"))
    .next().value;
  if (!matchStart) throw new Error(`No function named "${name}"`);
  const start: number = matchStart.index + matchStart[0].length;

  const matchEnd = code
    .matchAll(new RegExp(`${name}[\\s\\S]+?{[\\s\\S]+?}`, "g"))
    .next().value;
  const end: number = matchEnd.index + matchEnd[0].length;

  if (!body || typeof body !== "string") {
    const returnTypeMatch = code
      .matchAll(new RegExp(`(?:vec\\d|float)(?=.+${name})`, "g"))
      .next().value;
    const returnType: string = returnTypeMatch[0];
    if (returnType.includes("float")) body = "return 0.0;";
    else {
      const vecLen = Number.parseInt(returnType[returnType.length - 1]);
      body = `return ${returnType}(${Array(vecLen).fill("0.0").join(", ")});`;
    }
  }

  shaderCode[shaderSection] =
    code.slice(0, start) + `\n${body}\n}` + code.slice(end);
}

function insertBooleanValue(
  shaderSection: "vertex" | "fragment",
  varName: string,
  value: boolean
) {
  const code = shaderCode[shaderSection];

  const matchStart = code
    .matchAll(new RegExp(`bool[\\s\\S]+?${varName}`, "g"))
    .next().value;
  if (!matchStart) throw new Error(`No variable named "${varName}"`);
  const start: number = matchStart.index + matchStart[0].length;

  const matchEnd = code
    .matchAll(new RegExp(`bool[\\s\\S]+?${varName}[\\s\\S]*?;`, "g"))
    .next().value;
  const end: number = matchEnd.index + matchEnd[0].length;

  shaderCode[shaderSection] =
    code.slice(0, start) + ` = ${value};` + code.slice(end);
}

export class ParticleRender {
  renderer: THREE.WebGLRenderer;
  meshes: THREE.Mesh[] = [];
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  particleUniforms: { [key: string]: { value: any } };
  copies: number;
  params: ParticleRenderParams;

  constructor(
    canvasContainer: HTMLElement,
    nParticles: number,
    particleVisual: ParticleVisual,
    canvasVisual: CanvasVisual,
    params: OptParticleRenderParamsSetter = {}
  ) {
    this.params = new ParticleRenderParams(params);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.localClippingEnabled = true;
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.renderer.setClearColor(
      canvasVisual.backgroundColor.color,
      canvasVisual.backgroundColor.alpha
    );
    this.renderer.setPixelRatio(window.devicePixelRatio);
    canvasContainer.appendChild(this.renderer.domElement);

    const canvas = this.renderer.domElement;
    const ratio = window.devicePixelRatio;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    this.scene = new THREE.Scene();

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
      textureVelocity: { value: null },
      pixelScale: { value: canvasVisual.pixelScale },
      iMouse: { value: [NaN, NaN] },
      iTime: { value: 0 },
    };

    const isColorDynamic = typeof particleVisual.color === "string";
    const isSizeDynamic = typeof particleVisual.color === "string";

    injectFuncBody("vertex", "sizeFunc", particleVisual.size);
    insertBooleanValue("vertex", "isSizeDynamic", isSizeDynamic);
    if (!isSizeDynamic) {
      this.particleUniforms["size"] = { value: particleVisual.size };
    }

    injectFuncBody("fragment", "colorFunc", particleVisual.color);
    insertBooleanValue("fragment", "isColorDynamic", isColorDynamic);
    if (!isColorDynamic) {
      this.particleUniforms["color"] = { value: particleVisual.color };
    }

    type Flipped = [x: boolean, y: boolean] | [x: boolean, y: boolean][];
    type Translation = [x: number, y: number] | [x: number, y: number][];
    const isOneFlipVal = (value: Flipped): value is [x: boolean, y: boolean] =>
      typeof value[0] === "boolean";
    const isOneTransVal = (
      value: Translation
    ): value is [x: number, y: number] => typeof value[0] === "number";

    this.copies = canvasVisual.copies;
    for (let i = 0; i < this.copies; i++) {
      let rotation: number;
      if (typeof canvasVisual.rotation !== "number")
        rotation = canvasVisual.rotation[i];
      else rotation = canvasVisual.rotation;

      let flippedX: boolean;
      let flippedY: boolean;
      if (isOneFlipVal(canvasVisual.flipped)) {
        flippedX = canvasVisual.flipped[0];
        flippedY = canvasVisual.flipped[1];
      } else {
        flippedX = canvasVisual.flipped[i][0];
        flippedY = canvasVisual.flipped[i][1];
      }

      let translation: [x: number, y: number];
      if (isOneTransVal(canvasVisual.translate))
        translation = canvasVisual.translate;
      else translation = canvasVisual.translate[i];

      const scale = canvasVisual.pixelScale * this.params.SCALE;
      let clippingPlanes: THREE.Plane[] = [];
      if (canvasVisual.crop) {
        let crop;
        if (canvasVisual.crop instanceof BoundingBox) crop = canvasVisual.crop;
        else crop = canvasVisual.crop[i];

        if (!Number.isNaN(crop.left) && crop.left != null)
          clippingPlanes.push(
            new THREE.Plane(new THREE.Vector3(1, 0, 0), crop.left * scale)
          );
        if (!Number.isNaN(crop.right) && crop.right != null)
          clippingPlanes.push(
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), crop.right * scale)
          );
        if (!Number.isNaN(crop.bottom) && crop.bottom != null)
          clippingPlanes.push(
            new THREE.Plane(new THREE.Vector3(0, 1, 0), crop.bottom * scale)
          );
        if (!Number.isNaN(crop.top) && crop.top != null)
          clippingPlanes.push(
            new THREE.Plane(new THREE.Vector3(0, -1, 0), crop.top * scale)
          );
      }

      const material = new THREE.ShaderMaterial({
        uniforms: { ...this.particleUniforms, offset: { value: translation } },
        vertexShader: shaderCode.vertex,
        fragmentShader: shaderCode.fragment,
        side: THREE.DoubleSide,
        // left wall, positive pushes leftwards, negative rightwards
        clippingPlanes,
        clipping: true,
      });

      const geometry = new ParticleGeometry(nParticles, particleVisual.shape);
      const particleMesh = new THREE.Mesh(geometry, material);

      particleMesh.setRotationFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        rotation
      );
      if (flippedX) particleMesh.rotateY(Math.PI);
      if (flippedY) particleMesh.rotateX(Math.PI);

      particleMesh.scale.set(this.params.SCALE, this.params.SCALE, 1);

      particleMesh.matrixAutoUpdate = false;
      particleMesh.updateMatrix();
      this.meshes.push(particleMesh);
      this.scene.add(particleMesh);
    }

    canvas.style.removeProperty("height");
    canvas.style.removeProperty("width");
  }

  // https://stackoverflow.com/a/45046955/11493659
  updateSize() {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      // "false" here means that THREE.js doesn't override the canvas'
      //  width and height styles (only changes attributes) which is needed
      //  for using canvas.clientWidth/Height
      this.renderer.setSize(width, height, false);

      const aspect = width / height;
      this.camera.left = (this.params.FRUSTUM_SIZE * aspect) / -2;
      this.camera.right = (this.params.FRUSTUM_SIZE * aspect) / 2;
      this.camera.top = this.params.FRUSTUM_SIZE / 2;
      this.camera.bottom = this.params.FRUSTUM_SIZE / -2;
      this.camera.updateProjectionMatrix();
    }
  }

  setParticleStates(positions: THREE.Texture, velocities: THREE.Texture) {
    this.particleUniforms["texturePosition"].value = positions;
    this.particleUniforms["textureVelocity"].value = velocities;
  }

  render() {
    this.updateSize();

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (mousePresent)
      this.particleUniforms["iMouse"].value = [
        (mousePosX - rect.left) / rect.width,
        (mousePosY - rect.top) / rect.height,
      ];
    else this.particleUniforms["iMouse"].value = [NaN, NaN];

    this.particleUniforms["iTime"].value += Math.min(
      performance.now() - this.particleUniforms["iTime"].value,
      0.02
    );

    this.renderer.render(this.scene, this.camera);
  }
}

let mousePresent = true;
let mousePosX: number;
let mousePosY: number;
document.documentElement.addEventListener(
  "mouseleave",
  () => (mousePresent = false)
);
document.documentElement.addEventListener(
  "mouseenter",
  () => (mousePresent = true)
);
window.addEventListener("mousemove", (e) => {
  mousePosX = e.clientX;
  mousePosY = e.clientY;
});
