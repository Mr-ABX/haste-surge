import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './materials.js';

function blob(radius, detail, x, y, z, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

function cyl(rt, rb, h, seg, x, y, z, rx = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.rotateX(rx);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

// Create a curving spiked thorn vine arch (matches Screenshot 3)
function buildVineArchGeo() {
  const parts = [];
  const segs = 12;
  const span = 18;
  const height = 14;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const tm = (t0 + t1) * 0.5;
    const x = (tm - 0.5) * span * 2;
    const y = Math.sin(tm * Math.PI) * height - 1.5;
    const z = Math.cos(tm * Math.PI * 1.5) * 2.5;
    const r = 1.35 - Math.abs(tm - 0.5) * 0.55;
    const ang = Math.atan2(
      Math.cos(tm * Math.PI) * Math.PI * height,
      span * 2
    );
    parts.push(cyl(r * 0.92, r, 3.8, 7, x, y, z, 0, ang - Math.PI / 2));

    // Conical thorn spikes along the vine
    if (i % 2 === 1) {
      const spike = new THREE.ConeGeometry(0.48, 1.8, 5);
      spike.rotateZ(ang + (i % 4 === 1 ? 0.6 : -0.6));
      spike.translate(x, y + r * 0.7, z + (i % 4 === 1 ? 0.6 : -0.6));
      parts.push(spike);
    }
  }
  return mergeGeometries(parts);
}

let cache = null;

function buildKits() {
  // ---------- VERDANT (Matches Haste Screenshots 1-5) ----------
  // Multi-branching trunk (like Screenshot 2 right side tree)
  const trunkGeo = mergeGeometries([
    cyl(0.65, 1.15, 7.5, 7, 0, 3.6, 0, 0.04, -0.05),
    cyl(0.42, 0.65, 5.5, 6, -0.8, 8.8, 0.2, 0.08, 0.35),
    cyl(0.38, 0.58, 5.2, 6, 1.1, 8.5, -0.3, -0.1, -0.42),
    cyl(0.32, 0.48, 4.5, 6, 0.1, 9.6, 0.9, 0.35, 0.05),
  ]);

  // Sculpted multi-puff lush canopy (9 overlapping foliage clusters for full volume)
  const canopyGeo = mergeGeometries([
    blob(4.2, 2, 0, 12.6, 0, 1.15, 0.78, 1.1),
    blob(3.6, 2, -2.9, 11.2, 0.8, 1.1, 0.75, 1.05),
    blob(3.5, 2, 3.1, 11.0, -0.6, 1.1, 0.75, 1.05),
    blob(3.2, 2, 0.4, 11.4, 2.7, 1.05, 0.72, 1.05),
    blob(3.1, 2, -0.6, 11.6, -2.5, 1.05, 0.72, 1.05),
    blob(3.0, 2, -1.6, 14.2, -0.4, 1.0, 0.76, 1.0),
    blob(2.9, 2, 1.7, 13.9, 0.6, 1.0, 0.75, 1.0),
    blob(2.5, 1, 0, 15.4, 0.1, 1.0, 0.72, 1.0),
  ]);

  // Cool blue-grey stylized faceted boulder (Screenshot 2 & 5)
  const rockGeo = new THREE.DodecahedronGeometry(1.15, 0);
  rockGeo.scale(1.25, 0.62, 0.95);

  // Stacked chiseled blue-grey stone monolith obelisk (Screenshot 2 & 5 center-right)
  const monolithGeo = mergeGeometries([
    box(2.2, 3.2, 2.0, 0, 1.5, 0, 0.03, 0.1, -0.02),
    box(1.95, 3.0, 1.85, 0.06, 4.5, -0.04, -0.02, 0.35, 0.03),
    box(1.7, 2.8, 1.65, -0.04, 7.2, 0.02, 0.02, 0.15, -0.02),
  ]);

  // Tilted ancient stone & brass ring ruin embedded in hills (Screenshot 1 background)
  const ancientRingGeo = new THREE.TorusGeometry(18, 2.6, 8, 24);
  ancientRingGeo.rotateY(0.4);
  ancientRingGeo.rotateX(0.35);
  ancientRingGeo.translate(0, 10, 0);

  // Curving spiked thorn vine arch (Screenshot 3)
  const vineArchGeo = buildVineArchGeo();

  // Grass tuft / wildflower cluster
  const bushGeo = mergeGeometries([
    blob(1.4, 1, 0, 0.65, 0, 1.35, 0.68, 1.15),
    blob(1.0, 1, 1.1, 0.5, 0.4, 1.1, 0.65, 1.0),
  ]);

  const trunkMat = toon('#6b442e');
  const canopyMat = toon('#ffffff', true);
  // Blue-grey faceted stone material matching Haste screenshots
  const blueStoneMat = new THREE.MeshLambertMaterial({ color: '#7b9eb8', flatShading: true });
  const monolithMat = new THREE.MeshLambertMaterial({ color: '#7397b5', flatShading: true });
  const ruinMat = new THREE.MeshLambertMaterial({ color: '#7d6954', flatShading: true });
  const vineMat = toon('#6e4f32');
  const bushMat = toon('#ffffff', true);

  // Rich Haste canopy greens + vibrant purple/magenta blossom trees (Screenshot 2)
  const greens = ['#38a832', '#4cc238', '#298f2e', '#62d13b'].map((c) => new THREE.Color(c));
  const purples = ['#9e389b', '#b846b2', '#872c8a', '#cf5cc9'].map((c) => new THREE.Color(c));

  const verdant = [
    {
      name: 'tree',
      count: 68,
      clear: 14,
      scale: [0.85, 1.65],
      shadow: true,
      parts: [
        { geo: trunkGeo, mat: trunkMat },
        {
          geo: canopyGeo,
          mat: canopyMat,
          color: (r) => (r() < 0.24 ? purples : greens)[(r() * 4) | 0],
        },
      ],
    },
    {
      name: 'rock',
      count: 38,
      clear: 6,
      scale: [1.4, 4.2],
      shadow: true,
      tilt: 0.28,
      sink: 0.25,
      stretch: true,
      parts: [{ geo: rockGeo, mat: blueStoneMat }],
    },
    {
      name: 'monolith',
      count: 10,
      clear: 11,
      scale: [0.85, 1.45],
      shadow: true,
      tilt: 0.12,
      sink: 0.4,
      parts: [{ geo: monolithGeo, mat: monolithMat }],
    },
    {
      name: 'bush',
      count: 55,
      clear: 5,
      scale: [0.7, 1.6],
      shadow: false,
      parts: [{ geo: bushGeo, mat: bushMat, color: (r) => greens[(r() * 4) | 0] }],
    },
    {
      name: 'vineArch',
      count: 3,
      clear: 0,
      scale: [0.85, 1.35],
      shadow: true,
      tilt: 0.18,
      sink: 0.5,
      parts: [{ geo: vineArchGeo, mat: vineMat }],
    },
    {
      name: 'ancientRing',
      count: 2,
      clear: 32,
      scale: [0.9, 1.5],
      shadow: true,
      tilt: 0.35,
      sink: 3.0,
      parts: [{ geo: ancientRingGeo, mat: ruinMat }],
    },
  ];

  // ---------- SCORCHED (Desert Cacti & Mesas) ----------
  const cactusGeo = mergeGeometries([
    cyl(0.9, 1.05, 16, 8, 0, 8, 0),
    blob(0.9, 1, 0, 16, 0, 1, 0.8, 1),
    cyl(0.55, 0.55, 3.2, 7, 1.9, 7, 0, 0, Math.PI / 2),
    cyl(0.6, 0.6, 6, 7, 3.4, 9.8, 0),
    blob(0.6, 1, 3.4, 12.8, 0, 1, 0.8, 1),
    cyl(0.5, 0.5, 2.6, 7, -1.6, 10, 0, 0, Math.PI / 2),
    cyl(0.5, 0.5, 4.5, 7, -2.8, 12, 0),
    blob(0.5, 1, -2.8, 14.3, 0, 1, 0.8, 1),
  ]);
  const smallCactusGeo = mergeGeometries([
    cyl(0.5, 0.6, 4, 7, 0, 2, 0),
    blob(0.5, 1, 0, 4, 0),
  ]);
  const mesaGeo = mergeGeometries([
    cyl(14, 18, 40, 7, 0, 20, 0),
    cyl(10, 14, 16, 7, 0, 48, 0),
  ]);
  const duneRockGeo = new THREE.DodecahedronGeometry(1, 0);
  duneRockGeo.scale(1.2, 0.6, 1);
  const shrubGeo = blob(1.2, 0, 0, 0.5, 0, 1.4, 0.6, 1.2);

  const cactusMat = toon('#ffffff');
  const cactusGreens = ['#387a49', '#458c52', '#2f6942', '#569c58'].map((c) => new THREE.Color(c));
  const mesaMat = toon('#d9894a');
  const sandRockMat = new THREE.MeshLambertMaterial({ color: '#e8b979', flatShading: true });
  const shrubMat = toon('#55704a');

  const scorched = [
    {
      name: 'cactus',
      count: 58,
      clear: 13,
      scale: [0.65, 1.75],
      shadow: true,
      tilt: 0.22,
      parts: [{ geo: cactusGeo, mat: cactusMat, color: (r) => cactusGreens[(r() * 4) | 0] }],
    },
    {
      name: 'smallCactus',
      count: 72,
      clear: 5,
      scale: [0.6, 1.4],
      shadow: true,
      tilt: 0.2,
      parts: [{ geo: smallCactusGeo, mat: cactusMat, color: (r) => cactusGreens[(r() * 4) | 0] }],
    },
    {
      name: 'shrub',
      count: 50,
      clear: 4,
      scale: [0.8, 2],
      shadow: false,
      parts: [{ geo: shrubGeo, mat: shrubMat }],
    },
    {
      name: 'duneRock',
      count: 16,
      clear: 9,
      scale: [2, 6],
      shadow: true,
      tilt: 0.3,
      sink: 0.4,
      stretch: true,
      parts: [{ geo: duneRockGeo, mat: sandRockMat }],
    },
    {
      name: 'mesa',
      count: 2,
      clear: 130,
      scale: [0.8, 1.6],
      shadow: false,
      sink: 6,
      parts: [{ geo: mesaGeo, mat: mesaMat }],
    },
  ];

  return { verdant, scorched };
}

export function getKit(biome) {
  if (!cache) cache = buildKits();
  return cache[biome];
}
