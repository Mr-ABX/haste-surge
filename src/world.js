import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import { BIOMES } from './biomes.js';
import { getKit } from './props.js';
import { mulberry, additive, toon, createStarSparkGeometry } from './materials.js';

export const CELL = 7;
const SEG_X = 92, SEG_Z = 28;
const CW = CELL * SEG_X, CL = CELL * SEG_Z;
const perlin = new ImprovedNoise();

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color();

// Authentic 4-pointed star Spark geometry + prismatic iridescent shader (Screenshot 2)
const sparkGeo = createStarSparkGeometry(1.35, 0.42);
const sparkMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `
    varying vec3 vPos;
    varying vec3 vNormal;
    void main() {
      vPos = position;
      vNormal = normal;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    varying vec3 vPos;
    varying vec3 vNormal;
    void main() {
      float r = length(vPos.xy);
      vec3 core = vec3(1.0, 1.0, 1.0);
      vec3 rimA = vec3(1.0, 0.58, 0.88);
      vec3 rimB = vec3(0.42, 0.96, 1.0);
      vec3 rimC = vec3(1.0, 0.94, 0.52);
      float w = sin(vPos.x * 2.5 + uTime * 4.0) * 0.5 + 0.5;
      vec3 irid = mix(mix(rimA, rimB, w), rimC, clamp(vPos.y * 0.6 + 0.5, 0.0, 1.0));
      vec3 col = mix(core, irid, smoothstep(0.15, 0.95, r));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.chunks = new Map();
    this.time = 0;
    this.length = Infinity;
    this.portalZ = Infinity;

    // Painterly grass/dune material with directional speed-brushstroke detail
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.terrainMat.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying vec3 vWorldPos;\n` + shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
      shader.fragmentShader = `varying vec3 vWorldPos;\n` + shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         // Painterly directional grass / wind-streak modulation along Z
         float streak = sin(vWorldPos.x * 1.6 + sin(vWorldPos.z * 0.08) * 3.0) * cos(vWorldPos.z * 0.22);
         diffuseColor.rgb *= (1.0 + streak * 0.045);`
      );
    };

    // Lights
    this.hemi = new THREE.HemisphereLight('#ffffff', '#2b7a38', 1.45);
    this.sun = new THREE.DirectionalLight('#fff6dc', 2.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 650;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.5;
    scene.add(this.hemi, this.sun, this.sun.target);

    this._buildSky();
    this._buildClouds();
    this._buildStructures();
    this._buildPortal();
    this._buildWall();
  }

  setLevel(biomeKey, seed, length, isTutorial = false) {
    for (const c of this.chunks.values()) this._disposeChunk(c);
    this.chunks.clear();
    this.isTutorial = Boolean(isTutorial);
    this.biome = BIOMES[biomeKey];
    this.kit = getKit(biomeKey);
    this.seed = seed;
    this.length = length;
    this.t = this.biome.terrain;
    this.colors = {
      low: new THREE.Color(this.biome.colors.low),
      mid: new THREE.Color(this.biome.colors.mid),
      high: new THREE.Color(this.biome.colors.high),
      dirt: new THREE.Color(this.biome.colors.dirt),
      steep: new THREE.Color(this.biome.colors.steep),
    };

    const b = this.biome;
    this.scene.fog = new THREE.Fog(b.fog, b.fogNear, b.fogFar);
    this.skyMat.uniforms.top.value.set(b.skyTop);
    this.skyMat.uniforms.horizon.value.set(b.skyHorizon);
    this.sunDir = new THREE.Vector3(...b.sunDir).normalize();
    this.skyMat.uniforms.sunDir.value.copy(this.sunDir);
    this.hemi.color.set(b.hemiSky);
    this.hemi.groundColor.set(b.hemiGround);
    this.hemi.intensity = b.hemiIntensity;
    this.sun.color.set(b.sunColor);
    this.sun.intensity = b.sunIntensity;
    this.cloudMat.color.set(b.cloud);
    this.spire.visible = biomeKey === 'verdant';
    this.rift.visible = biomeKey === 'scorched';

    if (this.tutorialGates) {
      this.tutorialGates.visible = this.isTutorial;
      if (this.isTutorial) {
        this.tutorialGateMeshes.forEach((gate, idx) => {
          const gz = this.tutorialZPositions[idx];
          const gx = this.pathX(gz);
          const gy = this.h(gx, gz);
          gate.position.set(gx, gy + 1.2, gz);
        });
      }
    }

    this.setPortal(Number.isFinite(length) ? length : Infinity);
    for (let i = -2; i <= 6; i++) this._ensureChunk(i);
  }

  pathX(z) {
    if (this.isTutorial) {
      return Math.sin(z / 180) * 12;
    }
    const s = this.seed;
    return perlin.noise(z / 820, 3.7, s) * 210 + perlin.noise(z / 240, 9.1, s) * 38;
  }

  h(x, z) {
    if (this.isTutorial) {
      let y = 14;
      // Section 1: Gentle rolling turf for steering basics (Z: 0 to 260)
      const fade1 = 1 - THREE.MathUtils.smoothstep(z, 180, 260);
      y += Math.sin(z / 45) * 2.2 * fade1;

      // Section 2: Launch Crest Hill (rises smoothly up to peak at z = 380, +26m)
      const u = (z - 380) / 65;
      const crest = Math.exp(-u * u) * 26;
      y += crest;

      // Section 3 & 4: Continuous Steep Downhill Dive Chute (drops from 400 down to 720, -48m)
      const valleyDrop = THREE.MathUtils.smoothstep(z, 400, 720) * 48;
      y -= valleyDrop;

      // Section 5: Portal Runway smooth rolling speedway (Z: 760 to 1550)
      const runwayWave = THREE.MathUtils.smoothstep(z, 760, 900);
      y += Math.sin(z / 60) * 1.5 * runwayWave;

      const d = (x - this.pathX(z)) / 85;
      y += d * d * 16;
      return y;
    }

    const t = this.t, s = this.seed;
    let y = -z * t.downhill;
    if (t.ridged) {
      const n = perlin.noise(x / (t.bigScale * 0.7), z / t.bigScale, s + 1.3);
      const r = 1 - Math.sqrt(n * n + 0.02);
      y += r * r * t.big;
      y += perlin.noise(x / t.midScale, z / t.midScale, s + 2.1) * t.mid;
    } else {
      // Dynamic rolling wave hills with steep downhill landing zones
      y += perlin.noise(x / t.bigScale, z / t.bigScale, s + 1.3) * t.big;
      const wave = Math.sin(z / 48 + perlin.noise(x / 160, z / 160, s) * 1.8);
      // Downhill slopes are steeper for high-speed dive landings
      y += (wave > 0 ? wave * 1.05 : wave * 1.38) * 16.5;
      y += perlin.noise(x / t.midScale, z / t.midScale, s + 2.1) * t.mid;
    }
    y += perlin.noise(x / t.smallScale, z / t.smallScale, s + 3.7) * t.small;
    const d = (x - this.pathX(z)) / 145;
    y += d * d * t.bowl;
    return y;
  }

  grad(x, z) {
    const e = 0.75;
    return [
      (this.h(x + e, z) - this.h(x - e, z)) / (2 * e),
      (this.h(x, z + e) - this.h(x, z - e)) / (2 * e),
    ];
  }

  _ensureChunk(i) {
    if (this.chunks.has(i)) return false;
    this.chunks.set(i, this._buildChunk(i));
    return true;
  }

  _buildChunk(i) {
    const z0 = i * CL;
    const cx = Math.round(this.pathX(z0 + CL / 2) / CELL) * CELL;
    const x0 = cx - CW / 2;
    const nv = (SEG_X + 1) * (SEG_Z + 1);
    const pos = new Float32Array(nv * 3);
    const nor = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const c = this.colors;
    const bs = this.biome.colors.steepStart;

    let k = 0;
    for (let iz = 0; iz <= SEG_Z; iz++) {
      for (let ix = 0; ix <= SEG_X; ix++, k++) {
        const x = x0 + ix * CELL;
        const z = z0 + iz * CELL;
        const y = this.h(x, z);
        const [gx, gz] = this.grad(x, z);
        const il = 1 / Math.hypot(gx, 1, gz);
        const nx = -gx * il, ny = il, nz = -gz * il;
        pos.set([x, y, z], k * 3);
        nor.set([nx, ny, nz], k * 3);

        // Haste painterly hill coloring: deep emerald in valleys, bright sunlit lime on crests
        const hillWave = perlin.noise(x / 68, z / 68, 11.3) * 0.5 + 0.5;
        const crestFactor = THREE.MathUtils.clamp((-gz + 0.12) * 2.2 + hillWave * 0.5, 0, 1);
        tmpC.copy(c.low).lerp(c.mid, THREE.MathUtils.clamp(hillWave * 1.25, 0, 1));
        tmpC.lerp(c.high, Math.pow(crestFactor, 1.5) * 0.72);

        // Occasional warm sandy/dirt patches on hill shoulders (Screenshot 1 & 2)
        const dirtNoise = perlin.noise(x / 42, z / 42, 6.4);
        if (dirtNoise > 0.36) {
          tmpC.lerp(c.dirt, Math.min(1, (dirtNoise - 0.36) * 2.8) * 0.65);
        }

        const slope = 1 - ny;
        if (slope > bs) {
          tmpC.lerp(c.steep, THREE.MathUtils.smoothstep(slope, bs, bs + 0.22));
        }
        col.set([tmpC.r, tmpC.g, tmpC.b], k * 3);
      }
    }

    const idx = [];
    for (let iz = 0; iz < SEG_Z; iz++) {
      for (let ix = 0; ix < SEG_X; ix++) {
        const a = iz * (SEG_X + 1) + ix, b = a + 1, d = a + SEG_X + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();

    const mesh = new THREE.Mesh(g, this.terrainMat);
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.add(mesh);

    // Instanced Props
    const rnd = mulberry(Math.floor(this.seed * 1000) + i * 7919);
    for (const kind of this.kit) {
      const n = kind.count;
      const meshes = kind.parts.map((p) => new THREE.InstancedMesh(p.geo, p.mat, n));
      let placed = 0;
      for (let t = 0; t < n * 3 && placed < n; t++) {
        let x = x0 + (rnd() * 0.92 + 0.04) * CW;
        const z = z0 + rnd() * CL;
        if (kind.name === 'vineArch') {
          // Vine arches straddle right across the runner's path like Screenshot 3
          x = this.pathX(z) + (rnd() - 0.5) * 30;
        } else {
          const dx = Math.abs(x - this.pathX(z));
          if (dx < kind.clear) continue;
          if (dx < 32 && rnd() < 0.45) continue;
        }
        const s = kind.scale[0] + rnd() * (kind.scale[1] - kind.scale[0]);
        const y = this.h(x, z) - (kind.sink || 0) * s;
        tmpE.set(
          (rnd() - 0.5) * (kind.tilt || 0.08),
          kind.name === 'vineArch' ? (rnd() - 0.5) * 0.5 : rnd() * Math.PI * 2,
          (rnd() - 0.5) * (kind.tilt || 0.08)
        );
        tmpQ.setFromEuler(tmpE);
        if (kind.stretch) tmpS.set(s * (0.8 + rnd() * 0.6), s * (0.6 + rnd() * 0.6), s * (0.8 + rnd() * 0.6));
        else tmpS.setScalar(s);
        tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS);
        meshes.forEach((m, pi) => {
          m.setMatrixAt(placed, tmpM);
          const cf = kind.parts[pi].color;
          if (cf) m.setColorAt(placed, cf(rnd));
        });
        placed++;
      }
      meshes.forEach((m) => {
        m.count = placed;
        m.castShadow = kind.shadow;
        m.receiveShadow = true;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
        group.add(m);
      });
    }

    // 4-Pointed Star Sparks in sweeping sky-arcs & downhill ribbons (Screenshot 2)
    const sparks = [];
    if (this.isTutorial) {
      // Tutorial-specific instructional spark paths:
      // 1. Z: 40 to 220 - Ground slalom for steering
      if (z0 <= 220 && z0 + CL >= 40) {
        for (let j = 0; j < 14; j++) {
          const z = z0 + j * 15;
          if (z >= 40 && z <= 220) {
            const ox = Math.sin(z * 0.07) * 12;
            const x = this.pathX(z) + ox;
            sparks.push({ x, y: this.h(x, z) + 1.8, z, scale: 1.15, alive: true });
          }
        }
      }
      // 2. Z: 330 to 440 - High airborne crest launch arc
      if (z0 <= 450 && z0 + CL >= 330) {
        for (let j = 0; j < 12; j++) {
          const z = z0 + j * 10;
          if (z >= 330 && z <= 440) {
            const u = (z - 330) / 110;
            const x = this.pathX(z);
            sparks.push({ x, y: this.h(x, z) + 2.5 + Math.sin(u * Math.PI) * 14, z, scale: 1.25, alive: true });
          }
        }
      }
      // 3. Z: 460 to 680 - Fast-fall dive downhill chute through guidance arches
      if (z0 <= 690 && z0 + CL >= 460) {
        for (let j = 0; j < 18; j++) {
          const z = z0 + j * 12;
          if (z >= 460 && z <= 680) {
            const x = this.pathX(z);
            sparks.push({ x, y: this.h(x, z) + 2.4, z, scale: 1.2, alive: true });
          }
        }
      }
      // 4. Z: 760 to 1480 - High-speed speedway lanes to Portal
      if (z0 <= 1490 && z0 + CL >= 760) {
        for (let j = 0; j < 18; j++) {
          const z = z0 + j * 24;
          if (z >= 760 && z <= 1480) {
            [-6, 0, 6].forEach((ox) => {
              const x = this.pathX(z) + ox;
              sparks.push({ x, y: this.h(x, z) + 1.8, z, scale: 1.05, alive: true });
            });
          }
        }
      }
    } else if (z0 > 90 && z0 + CL < this.length - 80) {
      const arcs = 3;
      for (let a = 0; a < arcs; a++) {
        const zs = z0 + (a / arcs) * CL * 0.82 + 12;
        const ox = (rnd() - 0.5) * 52;
        const isSkyArc = rnd() < 0.55;
        const count = 14;
        const arcHeight = isSkyArc ? 14 + rnd() * 14 : 2.2;
        for (let j = 0; j < count; j++) {
          const u = j / (count - 1);
          const z = zs + j * 6.5;
          const x = this.pathX(z) + ox + Math.sin(u * Math.PI) * 5;
          const parabola = Math.sin(u * Math.PI) * arcHeight;
          sparks.push({
            x,
            y: this.h(x, z) + 2.0 + parabola,
            z,
            scale: 0.85 + Math.sin(u * Math.PI) * 0.45,
            alive: true,
          });
        }
      }
    }

    let sparkMesh = null;
    if (sparks.length) {
      sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, sparks.length);
      sparks.forEach((s, j) => {
        tmpE.set(0, j * 0.4, j * 0.25);
        tmpQ.setFromEuler(tmpE);
        tmpS.setScalar(s.scale);
        tmpM.compose(tmpP.set(s.x, s.y, s.z), tmpQ, tmpS);
        sparkMesh.setMatrixAt(j, tmpM);
      });
      sparkMesh.computeBoundingSphere();
      group.add(sparkMesh);
    }

    this.group.add(group);
    return { i, z0, group, sparks, sparkMesh };
  }

  _disposeChunk(c) {
    this.group.remove(c.group);
    c.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      else if (o.isMesh) o.geometry.dispose();
    });
  }

  collectSparks(p, radius) {
    let got = 0;
    const r2 = radius * radius;
    for (const c of this.chunks.values()) {
      if (!c.sparkMesh || Math.abs(c.z0 + CL / 2 - p.z) > CL) continue;
      let dirty = false;
      c.sparks.forEach((s, j) => {
        if (!s.alive) return;
        const dx = s.x - p.x, dy = s.y - (p.y + 1.5), dz = s.z - p.z;
        if (dx * dx + dy * dy + dz * dz < r2) {
          s.alive = false;
          got++;
          dirty = true;
          tmpM.makeScale(0, 0, 0);
          c.sparkMesh.setMatrixAt(j, tmpM);
        }
      });
      if (dirty) c.sparkMesh.instanceMatrix.needsUpdate = true;
    }
    return got;
  }

  _buildSky() {
    // Sky dome with dimensional fracture streaks in upper sky (matches Screenshot 1 top-left)
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunCol: { value: new THREE.Color('#fff8e2') },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 sunDir;
        uniform vec3 sunCol;
        uniform float uTime;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float t = clamp(d.y * 1.45 + 0.05, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(t, 0.62));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          c += sunCol * (pow(s, 260.0) * 1.35 + pow(s, 10.0) * 0.14);

          // Subtle dimensional fracture lines in upper sky (Screenshot 1)
          if (d.y > 0.15) {
            float g1 = abs( fract(d.x * 9.0 + d.y * 5.0 - uTime * 0.05) - 0.5 );
            float g2 = abs( fract(d.z * 11.0 - d.y * 7.0 + uTime * 0.03) - 0.5 );
            float line = smoothstep(0.008, 0.0, g1) * step(0.42, sin(d.z * 25.0));
            float glow = smoothstep(0.012, 0.0, g2) * step(0.65, cos(d.x * 18.0 + uTime));
            c += vec3(0.95, 0.25, 0.85) * line * 0.55 * d.y;
            c += vec3(0.35, 0.95, 1.0) * glow * 0.45 * d.y;
          }

          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), this.skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  _buildClouds() {
    this.cloudMat = new THREE.MeshLambertMaterial({
      color: '#ffffff',
      emissive: '#b5d4f2',
      emissiveIntensity: 0.5,
      fog: false,
    });
    this.clouds = new THREE.Group();
    const r = mulberry(42);
    this.cloudOffsets = [];
    for (let i = 0; i < 28; i++) {
      const c = new THREE.Group();
      const puffs = 5 + ((r() * 4) | 0);
      for (let p = 0; p < puffs; p++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(32 + r() * 44, 1), this.cloudMat);
        m.position.set((r() - 0.5) * 170, (r() - 0.3) * 22, (r() - 0.5) * 65);
        m.scale.y = 0.52;
        c.add(m);
      }
      const a = r() * Math.PI * 2;
      const d = 1450 + r() * 1350;
      this.cloudOffsets.push(new THREE.Vector3(Math.sin(a) * d, 240 + r() * 420, Math.cos(a) * d));
      c.scale.setScalar(0.85 + r() * 1.4);
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);
  }

  _buildStructures() {
    const mat = new THREE.MeshBasicMaterial({ color: '#4658a6', fog: false });
    const spire = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(24, 68, 1400, 8), mat);
    tower.position.y = 300;
    spire.add(tower);
    for (let i = 0; i < 5; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(680, 28, 38), mat);
      const a = (i / 5) * Math.PI * 2;
      arm.position.set(Math.cos(a) * 320, 880 - i * 40, Math.sin(a) * 320);
      arm.rotation.y = -a;
      arm.rotation.z = 0.35;
      spire.add(arm);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(8.5, 8.5, 1200, 8, 1, true),
        additive('#ff8a2a', 0.85)
      );
      beam.material.fog = false;
      beam.position.set(Math.cos(a) * 600, 300, Math.sin(a) * 600);
      spire.add(beam);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(260, 10, 8, 64), additive('#ff5fa0', 0.45));
    ring.material.fog = false;
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 760;
    spire.add(ring);
    this.spireRing = ring;
    this.spire = spire;
    this.scene.add(spire);

    // Floating Shattered World Megastructures / Broken Islands (Lore: Haste Broken Worlds)
    this.skyFragments = new THREE.Group();
    const fragMat = toon('#4a6886', true);
    const runeMat = additive('#32ecff', 0.85);
    const fragGeo = new THREE.DodecahedronGeometry(22, 1);
    fragGeo.scale(2.2, 0.72, 1.4);
    const runeRingGeo = new THREE.TorusGeometry(28, 1.4, 6, 24);

    this.fragData = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const rock = new THREE.Mesh(fragGeo, fragMat);
      const rRing = new THREE.Mesh(runeRingGeo, runeMat);
      rRing.rotation.x = Math.PI / 2 + 0.15;
      g.add(rock, rRing);
      const dist = 780 + i * 260;
      const ang = (i / 7) * Math.PI * 2 + 0.4;
      const basePos = new THREE.Vector3(
        Math.cos(ang) * dist,
        280 + (i % 3) * 110,
        Math.sin(ang) * dist
      );
      g.position.copy(basePos);
      g.scale.setScalar(0.75 + (i % 3) * 0.4);
      this.skyFragments.add(g);
      this.fragData.push({ group: g, basePos, rotSpeed: 0.12 + (i % 3) * 0.06 });
    }
    this.scene.add(this.skyFragments);

    // Holographic Tutorial Landing Arches with Downward Chevrons (Guides Step 4)
    this.tutorialGates = new THREE.Group();
    const archMat = additive('#4eff7a', 0.92);
    const chevMat = additive('#ffffff', 0.95);
    const archGeo = new THREE.TorusGeometry(16, 0.75, 8, 32, Math.PI);
    const chevGeo = new THREE.ConeGeometry(2.4, 4.8, 4);
    chevGeo.rotateZ(Math.PI);

    this.tutorialZPositions = [480, 560, 640];
    this.tutorialGateMeshes = [];
    this.tutorialZPositions.forEach(() => {
      const gate = new THREE.Group();
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.y = 8;
      const chev = new THREE.Mesh(chevGeo, chevMat);
      chev.position.y = 13.5;
      gate.add(arch, chev);
      this.tutorialGates.add(gate);
      this.tutorialGateMeshes.push(gate);
    });
    this.tutorialGates.visible = false;
    this.scene.add(this.tutorialGates);

    this.riftMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      uniforms: { t: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float t; varying vec2 vUv;
        void main(){ vec2 p = vUv-0.5; float r = length(p)*2.; float a = atan(p.y,p.x);
          float s = sin(a*4. + r*10. - t*1.5)*0.5+0.5;
          vec3 c = mix(vec3(0.22,0.14,0.52), vec3(0.55,0.78,1.0), s*(1.-r));
          c += pow(1.-r,4.)*vec3(0.9,0.95,1.);
          float al = smoothstep(1.,0.75,r);
          gl_FragColor = vec4(c, al*0.9);
          #include <colorspace_fragment>
        }`,
    });
    this.rift = new THREE.Mesh(new THREE.CircleGeometry(420, 64), this.riftMat);
    this.scene.add(this.rift);
  }

  _buildPortal() {
    // Swirling dark-ink & electric-blue vortex portal with jagged dark tendrils (Screenshot 3)
    this.portalMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: { t: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        uniform float t;
        varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float a = atan(p.y, p.x);
          float swirl = sin(a * 6.0 + r * 14.0 - t * 6.5);
          float jag = 0.82 + 0.14 * sin(a * 14.0 - t * 4.0) * cos(a * 7.0 + t * 2.0);
          float mask = smoothstep(jag, jag - 0.12, r);
          vec3 darkInk = vec3(0.03, 0.05, 0.14);
          vec3 cyanCore = vec3(0.28, 0.78, 1.0);
          vec3 whiteHot = vec3(0.92, 0.98, 1.0);
          vec3 col = mix(darkInk, cyanCore, smoothstep(-0.2, 0.85, swirl) * (1.0 - r * 0.55));
          col = mix(col, whiteHot, pow(max(0.0, 1.0 - r * 1.15), 2.6));
          gl_FragColor = vec4(col, mask);
          #include <colorspace_fragment>
        }
      `,
    });
    const portal = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(20, 64), this.portalMat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(18.5, 2.2, 10, 48), toon('#11162b'));
    portal.add(disc, rim);
    this.portal = portal;
    this.scene.add(portal);
  }

  setPortal(z) {
    this.portalZ = z;
    this.portal.visible = Number.isFinite(z);
    if (!Number.isFinite(z)) return;
    const x = this.pathX(z);
    this.portal.position.set(x, this.h(x, z) + 15, z);
    this.portal.rotation.set(0, 0, 0);
  }

  _buildWall() {
    this.wallMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { t: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float t; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          float cols = floor(vUv.x*90.);
          float sp = 0.4 + hash(vec2(cols,1.))*1.2;
          float streak = fract(vUv.y*3. - t*sp + hash(vec2(cols,3.)));
          float band = smoothstep(0.0,0.6,streak)*smoothstep(1.,0.6,streak);
          vec3 c = mix(vec3(1.,0.22,0.12), vec3(1.,0.72,0.22), band);
          float a = (0.22 + band*0.55) * smoothstep(1.,0.3,vUv.y) * smoothstep(0.,0.08,vUv.x) * smoothstep(1.,0.92,vUv.x);
          gl_FragColor = vec4(c*a, a);
        }`,
    });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900), this.wallMat);
    this.scene.add(this.wall);
  }

  setWall(z) {
    const x = this.pathX(z);
    this.wall.position.set(x, this.h(x, z) + 300, z);
  }

  update(p, dt, cam) {
    this.time += dt;
    sparkMat.uniforms.uTime.value = this.time;
    this.skyMat.uniforms.uTime.value = this.time;

    const ci = Math.floor(p.z / CL);
    let built = 0;
    for (let i = ci - 1; i <= ci + 6; i++) {
      if (!this.chunks.has(i) && built < 2) {
        this._ensureChunk(i);
        built++;
      }
    }
    for (const [i, c] of this.chunks) {
      if (i < ci - 2 || i > ci + 8) {
        this._disposeChunk(c);
        this.chunks.delete(i);
      }
    }

    this.sky.position.copy(cam.position);
    this.clouds.children.forEach((c, i) => {
      const o = this.cloudOffsets[i];
      c.position.set(p.x + o.x, p.y + o.y, p.z + o.z);
    });

    // Floating Shattered World fragments drifting along the horizon
    if (this.fragData) {
      this.fragData.forEach((f) => {
        f.group.position.x = p.x + f.basePos.x;
        f.group.position.z = p.z + f.basePos.z;
        f.group.position.y = f.basePos.y + Math.sin(this.time * 0.8 + f.basePos.x * 0.01) * 6;
        f.group.rotation.y += dt * f.rotSpeed;
      });
    }

    // Holographic Tutorial Gates pulsing animation
    if (this.isTutorial && this.tutorialGateMeshes) {
      const pulse = 1.0 + Math.sin(this.time * 4.5) * 0.12;
      this.tutorialGateMeshes.forEach((g) => {
        g.scale.set(pulse, pulse, pulse);
      });
    }

    const az = p.z + 2500;
    this.spire.position.set(this.pathX(az) * 0.4 + 480, this.h(p.x, p.z) - 200, az);
    this.spireRing.rotation.z += dt * 0.15;
    this.rift.position.set(p.x - 600, p.y + 650, p.z + 2400);
    this.rift.lookAt(cam.position);
    this.riftMat.uniforms.t.value = this.time;
    this.portalMat.uniforms.t.value = this.time;
    this.wallMat.uniforms.t.value = this.time;

    this.sun.position.copy(p).addScaledVector(this.sunDir, 240);
    this.sun.target.position.copy(p);
  }
}
