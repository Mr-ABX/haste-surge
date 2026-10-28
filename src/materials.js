import * as THREE from 'three';

// Crisp 4-step cel-shading ramp for vibrant stylized lighting
function makeGradient(steps) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { data.set([v, v, v, 255], i * 4); });
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export const GRADIENT = makeGradient([105, 175, 230, 255]);
export const SOFT_GRADIENT = makeGradient([140, 195, 235, 255]);

export const toon = (color, soft = false) =>
  new THREE.MeshToonMaterial({ color, gradientMap: soft ? SOFT_GRADIENT : GRADIENT });

// Subtle dark ink outline for Zoe and key props
export const OUTLINE_MAT = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  vertexShader: `
    void main(){
      vec3 p = position + normal * 0.018;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `void main(){ gl_FragColor = vec4(0.11, 0.07, 0.14, 1.0); }`,
});

export const additive = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

// Build a 3D 4-pointed star crystal geometry (matches Haste's white/prismatic Spark pickups)
export function createStarSparkGeometry(radius = 1.15, thickness = 0.42) {
  const pts = [];
  const spikes = 4;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.36;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const pos = [];
  const nor = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    // Front face triangle
    pos.push(0, 0, thickness, x0, y0, 0, x1, y1, 0);
    nor.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
    // Back face triangle
    pos.push(0, 0, -thickness, x1, y1, 0, x0, y0, 0);
    nor.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.computeVertexNormals();
  return geo;
}

export function mulberry(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
