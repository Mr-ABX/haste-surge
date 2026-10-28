import * as THREE from 'three';
import { toon, additive, mulberry } from './materials.js';

export const BOSS_INFO = {
  jumper: {
    id: 'jumper',
    biome: 'verdant',
    name: 'JUMPER',
    subtitle: 'ATTACK THE MACHINE',
  },
  chronos: {
    id: 'chronos',
    biome: 'verdant',
    name: 'CHRONOS TITAN',
    subtitle: 'PIERCE THE REACTOR CORE',
  },
  leviathan: {
    id: 'leviathan',
    biome: 'scorched',
    name: 'DUNE LEVIATHAN',
    subtitle: 'STRIKE THE SPINE RESONATORS',
  },
  solaris: {
    id: 'solaris',
    biome: 'scorched',
    name: 'SOLARIS MONOLITH',
    subtitle: 'SHATTER THE ECLIPSE OBELISK',
  },
};

export class EncounterManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.tethers = [];
    this.missiles = [];
    this.craters = [];
    this.jumpArcs = [];
    this.boss = null;
    this.bossType = null;
    this.bossHp = 0;
    this.bossMaxHp = 5;
    this.time = 0;
    this.missileTimer = 0;

    this._buildMissileTemplate();
  }

  _buildMissileTemplate() {
    // Black-and-red artillery mortar shell with glowing orange nose-cone (Screenshot 5)
    const darkIron = toon('#242734');
    const redStripe = toon('#e62e2e');
    const noseGlow = additive('#ff881a', 0.92);

    this.missileProto = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 2.8, 10), darkIron);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.7, 0.45, 10), redStripe);
    band.position.y = 0.5;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.2, 10), redStripe);
    cone.rotation.x = Math.PI;
    cone.position.y = -2.0;
    const aura = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 10), noseGlow);
    aura.scale.set(1, 1.45, 1);
    aura.position.y = -1.8;

    // 4 tail fins
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.55), redStripe);
      const a = (i / 4) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 0.65, 1.1, Math.sin(a) * 0.65);
      fin.rotation.y = -a;
      this.missileProto.add(fin);
    }

    this.missileProto.add(body, band, cone, aura);
  }

  clear() {
    while (this.group.children.length) {
      const c = this.group.children.pop();
      this.group.remove(c);
    }
    this.tethers = [];
    this.missiles = [];
    this.craters = [];
    this.jumpArcs = [];
    this.boss = null;
    this.bossType = null;
    this.bossHp = 0;
  }

  populateStage(biomeKey, seed, length, bossKey = null) {
    this.clear();
    const rnd = mulberry(Math.floor(seed * 9999) + 17);

    // 1. Sweeping Magma / Laser Tethers (Screenshot 1)
    const orbGeo = new THREE.IcosahedronGeometry(2.4, 1);
    const orbMat = additive('#ff7315', 0.95);
    const beamMat = additive('#ffb32b', 0.9);

    const step = bossKey ? 240 : 210;
    for (let z = 300; z < length - 220; z += step) {
      const cx = this.world.pathX(z) + (rnd() - 0.5) * 48;
      const span = 24 + rnd() * 20;
      const baseH = 4.2 + rnd() * 6.5;
      const speed = (rnd() < 0.5 ? 1 : -1) * (1.1 + rnd() * 1.3);

      const tetherGroup = new THREE.Group();
      const orbA = new THREE.Mesh(orbGeo, orbMat);
      const orbB = new THREE.Mesh(orbGeo, orbMat);
      const beamGeo = new THREE.CylinderGeometry(1.05, 1.05, span, 8);
      beamGeo.rotateZ(Math.PI / 2);
      const beam = new THREE.Mesh(beamGeo, beamMat);

      tetherGroup.add(orbA, orbB, beam);
      this.group.add(tetherGroup);
      this.tethers.push({
        group: tetherGroup,
        orbA,
        orbB,
        beam,
        cx,
        z,
        span,
        baseH,
        speed,
        phase: rnd() * Math.PI * 2,
      });
    }

    // 2. Burning Magma Craters & Orange Trajectory Arcs (Screenshot 4)
    const craterOuterMat = new THREE.MeshBasicMaterial({ color: '#1f1210' });
    const craterLavaMat = additive('#ff8814', 0.92);
    const arcMat = additive('#ff7b1a', 0.78);

    for (let z = 260; z < length - 200; z += 195) {
      const x1 = this.world.pathX(z) + (rnd() - 0.5) * 55;
      const y1 = this.world.h(x1, z);
      const crater = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.CircleGeometry(7.5, 20), craterOuterMat);
      rim.rotation.x = -Math.PI / 2;
      const lava = new THREE.Mesh(new THREE.CircleGeometry(5.8, 18), craterLavaMat);
      lava.rotation.x = -Math.PI / 2;
      lava.position.y = 0.08;
      crater.add(rim, lava);
      crater.position.set(x1, y1 + 0.15, z);
      this.group.add(crater);
      this.craters.push({ pos: crater.position, radius: 6.2 });

      // Parabolic fiery trajectory line connecting to next landing zone (Screenshot 4)
      if (bossKey === 'jumper' || rnd() < 0.55) {
        const z2 = z + 195;
        const x2 = this.world.pathX(z2) + (rnd() - 0.5) * 55;
        const y2 = this.world.h(x2, z2);
        const pts = [];
        for (let s = 0; s <= 24; s++) {
          const u = s / 24;
          const px = THREE.MathUtils.lerp(x1, x2, u);
          const pz = THREE.MathUtils.lerp(z, z2, u);
          const py = THREE.MathUtils.lerp(y1, y2, u) + Math.sin(u * Math.PI) * 42;
          pts.push(new THREE.Vector3(px, py, pz));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.35, 6, false);
        const arcMesh = new THREE.Mesh(tubeGeo, arcMat);
        this.group.add(arcMesh);
      }
    }

    if (bossKey && BOSS_INFO[bossKey]) {
      this._spawnBoss(bossKey);
    }
  }

  _spawnBoss(bossKey) {
    this.bossType = bossKey;
    this.bossMaxHp = 5;
    this.bossHp = 5;

    const bGroup = new THREE.Group();
    const darkArmor = toon('#26283a');
    const redArmor = toon('#d92e2e');
    const goldArmor = toon('#e8a838');
    const magmaMat = additive('#ff7315', 0.95);

    if (bossKey === 'jumper') {
      // JUMPER: Fiery leaping mechanical war-machine (Screenshot 4)
      const chassis = new THREE.Mesh(new THREE.DodecahedronGeometry(6.5, 1), darkArmor);
      const core = new THREE.Mesh(new THREE.SphereGeometry(4.8, 14, 14), magmaMat);
      core.position.y = -1.2;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5.5, 4.5, 8), redArmor);
      crown.position.y = 4.5;
      bGroup.add(chassis, core, crown);
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 14, 2.2), darkArmor);
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        leg.position.set(Math.cos(a) * 6.5, -5, Math.sin(a) * 6.5);
        leg.rotation.z = Math.cos(a) * 0.4;
        bGroup.add(leg);
      }
    } else if (bossKey === 'chronos') {
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(24, 3.2, 10, 32), darkArmor);
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(17, 2.5, 10, 32), goldArmor);
      const r3 = new THREE.Mesh(new THREE.TorusGeometry(10, 1.8, 10, 28), redArmor);
      const core = new THREE.Mesh(new THREE.SphereGeometry(6.0, 16, 16), magmaMat);
      bGroup.add(r1, r2, r3, core);
      bGroup.userData = { r1, r2, r3 };
    } else if (bossKey === 'leviathan') {
      const segs = [];
      for (let i = 0; i < 8; i++) {
        const r = 10 - i * 0.85;
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), i % 2 === 0 ? goldArmor : darkArmor);
        const fin = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, 9, 5), magmaMat);
        fin.position.y = r;
        s.add(fin);
        bGroup.add(s);
        segs.push(s);
      }
      bGroup.userData = { segs };
    } else if (bossKey === 'solaris') {
      const pyr = new THREE.Mesh(new THREE.ConeGeometry(16, 34, 4), goldArmor);
      const inv = new THREE.Mesh(new THREE.ConeGeometry(12, 22, 4), darkArmor);
      inv.rotation.x = Math.PI;
      inv.position.y = -16;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(22, 1.6, 8, 32), magmaMat);
      halo.rotation.x = Math.PI / 2;
      bGroup.add(pyr, inv, halo);
      bGroup.userData = { pyr, halo };
    }

    // Spawn 5 glowing target nodes along the valley for the 5-segment boss health bar
    this.pylons = [];
    const nodeGeo = new THREE.OctahedronGeometry(4.8, 1);
    const ringGeo = new THREE.TorusGeometry(7.2, 0.8, 8, 24);
    for (let i = 0; i < 5; i++) {
      const pz = 340 + i * 290;
      const px = this.world.pathX(pz);
      const py = this.world.h(px, pz) + 6.5;
      const pg = new THREE.Group();
      const gem = new THREE.Mesh(nodeGeo, magmaMat);
      const ring = new THREE.Mesh(ringGeo, redArmor);
      pg.add(gem, ring);
      pg.position.set(px, py, pz);
      this.group.add(pg);
      this.pylons.push({ group: pg, pos: pg.position, alive: true });
    }

    this.boss = bGroup;
    this.group.add(bGroup);
  }

  _spawnMissileBarrage(player) {
    // Rains 5 black-and-red artillery mortar shells ahead of Zoe (Screenshot 5)
    for (let i = 0; i < 5; i++) {
      const m = this.missileProto.clone();
      const tz = player.pos.z + 95 + i * 24 + (Math.random() - 0.5) * 20;
      const tx = player.pos.x + (Math.random() - 0.5) * 48;
      const ty = this.world.h(tx, tz);
      m.position.set(tx + (Math.random() - 0.5) * 18, ty + 68 + i * 14, tz - 18);
      m.rotation.set(0.32, 0, (Math.random() - 0.5) * 0.25);
      this.group.add(m);
      this.missiles.push({
        mesh: m,
        vel: new THREE.Vector3(0, -62 - Math.random() * 18, 22),
        alive: true,
      });
    }
  }

  update(dt, player, audio, onEvent) {
    this.time += dt;

    // Periodic Artillery Missile Barrage (Screenshot 5)
    this.missileTimer -= dt;
    if (this.missileTimer <= 0) {
      this.missileTimer = this.boss ? 3.8 : 5.5;
      this._spawnMissileBarrage(player);
    }

    for (const m of this.missiles) {
      if (!m.alive) continue;
      m.mesh.position.addScaledVector(m.vel, dt);
      const gy = this.world.h(m.mesh.position.x, m.mesh.position.z);
      if (m.mesh.position.y <= gy + 1.2) {
        m.alive = false;
        m.mesh.visible = false;
        if (
          player.invuln <= 0 &&
          Math.hypot(player.pos.x - m.mesh.position.x, player.pos.z - m.mesh.position.z) < 6.5
        ) {
          this._hitPlayer(player, audio, onEvent);
        }
      }
    }

    // Sweeping Magma Tethers
    for (const t of this.tethers) {
      if (Math.abs(t.z - player.pos.z) > 350) continue;
      const sway = Math.sin(this.time * t.speed + t.phase) * 16;
      const x = t.cx + sway;
      const y = this.world.h(x, t.z) + t.baseH + Math.cos(this.time * 1.8 + t.phase) * 2.2;
      t.group.position.set(x, y, t.z);
      const tilt = Math.sin(this.time * 0.9 + t.phase) * 0.25;
      t.group.rotation.z = tilt;
      t.orbA.position.set(-t.span / 2, 0, 0);
      t.orbB.position.set(t.span / 2, 0, 0);

      if (player.invuln <= 0 && Math.abs(player.pos.z - t.z) < 3.2) {
        const dx = player.pos.x - x;
        if (Math.abs(dx) < t.span * 0.5) {
          const beamYAtX = y + Math.tan(tilt) * dx;
          if (Math.abs(player.pos.y + 1.2 - beamYAtX) < 2.5) {
            this._hitPlayer(player, audio, onEvent);
          }
        }
      }
    }

    // Boss movement & Attack Machine strikes
    if (this.boss && this.bossHp > 0) {
      const bz = player.pos.z + 92;
      const bx = this.world.pathX(bz) + Math.sin(this.time * 1.45) * 28;
      const jumpArc = this.bossType === 'jumper' ? Math.abs(Math.sin(this.time * 2.6)) * 28 : 22;
      const by = this.world.h(bx, bz) + jumpArc;
      this.boss.position.set(bx, by, bz);

      if (this.bossType === 'chronos') {
        const { r1, r2, r3 } = this.boss.userData;
        r1.rotation.z += dt * 1.2;
        r2.rotation.x += dt * 1.8;
        r3.rotation.y += dt * 2.4;
      } else if (this.bossType === 'leviathan') {
        this.boss.userData.segs.forEach((s, i) => {
          s.position.set(
            Math.sin(this.time * 4 - i * 0.6) * 16,
            Math.cos(this.time * 3.2 - i * 0.5) * 9 - i * 2,
            -i * 10
          );
        });
      } else if (this.bossType === 'solaris') {
        this.boss.userData.pyr.rotation.y += dt * 2.2;
        this.boss.userData.halo.rotation.z -= dt * 3;
      } else {
        this.boss.rotation.y += dt * 2.0;
      }

      for (const p of this.pylons) {
        if (!p.alive) continue;
        p.group.rotation.y += dt * 2.8;
        if (p.pos.z < player.pos.z - 20) {
          p.pos.z = player.pos.z + 240 + Math.random() * 110;
          p.pos.x = this.world.pathX(p.pos.z) + (Math.random() - 0.5) * 36;
          p.pos.y = this.world.h(p.pos.x, p.pos.z) + 6.5;
        }
        const dist = Math.hypot(
          player.pos.x - p.pos.x,
          player.pos.y + 1.5 - p.pos.y,
          player.pos.z - p.pos.z
        );
        if (dist < 10.5) {
          p.alive = false;
          p.group.visible = false;
          this.bossHp = Math.max(0, this.bossHp - 1);
          player.speed = Math.min(198, player.speed + 28);
          player.vel.z = player.speed;
          player.triggerLandingFX('#88ff66', 18);
          audio?.playBossHit();
          if (this.bossHp === 0) {
            this.boss.visible = false;
            this.world.setPortal(player.pos.z + 220);
            onEvent?.('Perfect', 'rgba(155, 245, 110, 0.85)');
          } else {
            onEvent?.('Good', 'rgba(120, 235, 255, 0.8)');
          }
        }
      }
    }
  }

  _hitPlayer(player, audio, onEvent) {
    if (player.boardActive > 0) {
      player.boardActive = 0;
      player.invuln = 1.2;
      player.triggerLandingFX('#ffd447', 12);
      return;
    }
    if (player.stats.damageShield > 0) {
      player.stats.damageShield--;
      player.invuln = 1.5;
      return;
    }
    player.hp = Math.max(0, player.hp - 1);
    player.invuln = 1.8;
    player.speed = Math.max(46, player.speed * 0.65);
    player.vel.z = player.speed;
    player.vel.y = 16;
    player.grounded = false;
    player.triggerLandingFX('#ff4a4a', 12);
    audio?.playHit();
    onEvent?.('Bad', 'rgba(255, 85, 85, 0.85)');
  }
}
