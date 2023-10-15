import * as THREE from "three";
import { getSizeXY } from "../helper";

export interface ParticleShape {
  setIndices: () => number[];
  setVertices: () => number[];
}

export class CircleShape implements ParticleShape {
  segments: number;
  constructor(segments: number = 20) {
    this.segments = segments;
  }

  setIndices() {
    const final: number[] = [];
    for (let s = 1; s <= this.segments; s++) {
      final.push(s, s + 1, 0);
    }
    return final;
  }
  setVertices() {
    const vertices: number[] = [];
    const vertex = new THREE.Vector3(); // helper variable

    vertices.push(0, 0, 0);
    for (let s = 0; s <= this.segments; s++) {
      const segment = (s / this.segments) * 2 * Math.PI;
      vertex.x = Math.cos(segment);
      vertex.y = Math.sin(segment);
      vertices.push(vertex.x, vertex.y, vertex.z);
    }
    return vertices;
  }
}

export class ParticleGeometry extends THREE.BufferGeometry {
  nParticles: number;
  posTexWidth: number;
  posTexHeight: number;

  points: number;

  indices: number[];
  vertices: THREE.BufferAttribute;
  referencesX: THREE.BufferAttribute;
  referencesY: THREE.BufferAttribute;

  constructor(nParticles: number, particleShape: ParticleShape) {
    super();

    this.nParticles = nParticles;
    [this.posTexWidth, this.posTexHeight] = getSizeXY(2 * nParticles);

    const indices = particleShape.setIndices();
    const vertices = particleShape.setVertices();

    this.points = (nParticles * vertices.length) / 3;

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

    this.applyVertices(vertices);
    this.applyIndices(indices);
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

  applyVertices(vertices: number[]) {
    let v = 0;
    const verts_push = (...args: number[]) => {
      for (let i = 0; i < args.length; i++) this.vertices.set([args[i]], v++);
    };
    for (let i = 0; i < this.nParticles; i++) {
      for (let j = 0; j < vertices.length; j++) {
        verts_push(vertices[j]);
      }
    }
  }

  applyIndices(indices: number[]) {
    for (let i = 0; i < this.nParticles; i++) {
      const particleIndex = i * (this.points / this.nParticles);
      this.indices = [
        ...this.indices,
        ...indices.map((el) => el + particleIndex),
      ];
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

// new ParticleGeometry(1, new CircleShape())
