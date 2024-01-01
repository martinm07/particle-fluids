import * as THREE from "three";
import vertexShaderCode from "./shaders/vertex-shader.glsl";
import fragmentShaderCode from "./shaders/fragment-shader.glsl";
import { ParticleGeometry } from "./visuals/ParticleGeometry";
import { CanvasVisual } from "./visuals/CanvasVisuals";
import { Vec2 } from "./helper";

interface OptParticleRenderParamsSetter {
  EDGE_POINT?: Vec2;
}
export class ParticleRenderParams {
  EDGE_POINT: Vec2;

  constructor(params: OptParticleRenderParamsSetter) {
    // Perhaps a useful way to define the scale is so that
    //  some point in the simulation space (e.g. (-20, -20))
    //  lies on the edge of the canvas
    this.EDGE_POINT = params.EDGE_POINT ?? [-21, -21];
  }
}

let shaderCode = { vertex: vertexShaderCode, fragment: fragmentShaderCode };
function refreshShaderCode() {
  shaderCode = { vertex: vertexShaderCode, fragment: fragmentShaderCode };
}

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

  aspect: number;
  scale: number = 1;
  pixelRatio: number = 1;
  firstRender: boolean = true;

  particleUniforms: { [key: string]: { value: any } };
  copies: number;
  params: ParticleRenderParams;
  canvasVisual: CanvasVisual;

  constructor(
    canvasContainer: HTMLElement,
    nParticles: number,
    canvasVisual: CanvasVisual,
    params: OptParticleRenderParamsSetter = {}
  ) {
    this.params = new ParticleRenderParams(params);
    this.canvasVisual = canvasVisual;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.localClippingEnabled = true;
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    this.renderer.setClearColor(
      canvasVisual.backgroundColor.color,
      canvasVisual.backgroundColor.alpha
    );
    canvasContainer.appendChild(this.renderer.domElement);

    const canvas = this.renderer.domElement;
    const ratio = window.devicePixelRatio;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    this.scene = new THREE.Scene();

    this.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    this.camera = new THREE.OrthographicCamera();
    this.camera.position.z = 1;
    this.scene.add(this.camera);

    this.particleUniforms = {
      texturePosition: { value: null },
      textureVelocity: { value: null },
      iMouse: { value: [NaN, NaN] },
      iTime: { value: 0 },
    };

    this.copies = canvasVisual.fluidCopies.length;
    for (let i = 0; i < this.copies; i++) {
      const fluidVisual = canvasVisual.fluidCopies[i];
      const particleVisual = fluidVisual.particleVisual;
      refreshShaderCode();

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

      const material = new THREE.ShaderMaterial({
        uniforms: {
          ...this.particleUniforms,
          translate: { value: fluidVisual.translate },
          transform: { value: fluidVisual.transform },
        },
        vertexShader: shaderCode.vertex,
        fragmentShader: shaderCode.fragment,
        side: THREE.DoubleSide,
        clipping: true,
      });

      const geometry = new ParticleGeometry(nParticles, particleVisual.shape);
      const particleMesh = new THREE.Mesh(geometry, material);

      particleMesh.scale.set(this.scale, this.scale, 1);

      particleMesh.matrixAutoUpdate = false;
      particleMesh.updateMatrix();
      this.meshes.push(particleMesh);
      this.scene.add(particleMesh);
    }

    // This refreshes the internal width/height to be the CSS width/height
    //  (multiplied by the device pixel ratio)
    canvas.style.removeProperty("height");
    canvas.style.removeProperty("width");
  }

  // https://stackoverflow.com/a/45046955/11493659

  hasSizeChanged() {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth * this.pixelRatio;
    const height = canvas.clientHeight * this.pixelRatio;
    return canvas.width !== width || canvas.height !== height;
  }

  updateSize(force?: boolean) {
    const canvas = this.renderer.domElement;
    const width = (canvas.clientWidth * this.pixelRatio) | 0; // takes the floor
    const height = (canvas.clientHeight * this.pixelRatio) | 0;

    if (force || canvas.width !== width || canvas.height !== height) {
      // "false" here means that THREE.js doesn't override the canvas'
      //  width and height styles (only changes attributes) which is needed
      //  for using canvas.clientWidth/Height
      this.renderer.setSize(width, height, false);

      this.aspect = canvas.clientWidth / canvas.clientHeight;

      this.camera.left = 1 / -2;
      this.camera.right = 1 / 2;
      this.camera.top = 1 / 2;
      this.camera.bottom = 1 / -2;
      if (width > height) {
        this.camera.left *= this.aspect;
        this.camera.right *= this.aspect;
      } else {
        this.camera.top /= this.aspect;
        this.camera.bottom /= this.aspect;
      }

      this.camera.updateProjectionMatrix();

      const pX = Math.abs(this.params.EDGE_POINT[0]);
      const pY = Math.abs(this.params.EDGE_POINT[1]);

      if (pY > pX) {
        // p prefers the top/bottom, so if a wider aspect then def cY
        if (width >= height) this.scale = 1 / pY;
        else if (pY - this.aspect * pX > 0) this.scale = this.aspect / pY;
        else this.scale = 1 / pX;
      } else {
        if (width <= height) this.scale = 1 / pX;
        else if (pX - this.aspect * pY > 0) this.scale = this.aspect / pX;
        else this.scale = 1 / pY;
      }
      // A scale of 1 means that a Plane of height/width 1 would be what extends to the edge,
      //  yet the coordinate at the corner of the plane is (0.5, 0.5), not the (1, 1) that
      //  this.params.EDGE_POINT would expect
      //  (this happens because we expect the full height/width of the camera viewing frustrum
      //  to extend out to any point from (0, 0) instead of correctly saying half, since it's
      //  centered on the origin).
      this.scale *= 0.5;
      // console.log(this.scale);

      this.meshes[0].scale.set(this.scale, this.scale, 1);
      this.meshes[0].updateMatrix();
    }
  }

  setParticleStates(positions: THREE.Texture, velocities: THREE.Texture) {
    this.particleUniforms["texturePosition"].value = positions;
    this.particleUniforms["textureVelocity"].value = velocities;
  }

  render() {
    this.updateSize(this.firstRender);

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
    this.firstRender = false;
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
