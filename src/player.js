import * as THREE from 'three';
import { toon, OUTLINE_MAT, additive } from './materials.js';

function withOutline(geo, mat) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  const o = new THREE.Mesh(geo, OUTLINE_MAT);
  g.add(m, o);
  return g;
}

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 20, 0);
    this.vel = new THREE.Vector3(0, 0, 72);
    this.speed = 72;
    this.grounded = false;
    this.diving = false;
    this.airTime = 0;
    this.energy = 65;
    this.maxEnergy = 100;
    this.hp = 3;
    this.maxHp = 3;
    this.invuln = 0;
    this.steer = 0; // +1 = Left on screen (+X), -1 = Right on screen (-X)
    this.roll = 0;
    this.pitch = 0;
    this.stridePhase = 0;
    this.spinAngle = 0;
    this.boardActive = 0;

    this.stats = {
      topSpeedMult: 1,
      boostPower: 1,
      diveGravity: 1,
      magnetRadius: 6.5,
      energyGain: 1,
      damageShield: 0,
    };

    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);
    scene.add(this.root);

    this._buildZoeRig();
    this._buildTrails();
    this._buildFootSparks();
    this._buildShockwave();
  }

  _buildZoeRig() {
    const redMat = toon('#d92828');
    const whiteMat = toon('#f7f4eb');
    const darkMat = toon('#221d2b');
    const skinMat = toon('#ffcfb3');
    const brownHairMat = toon('#3d231a');
    const leatherMat = toon('#6e442b');
    const strapMat = toon('#e8dec8');
    const brassMat = toon('#e0a838');
    const blueGloveMat = toon('#1f5ed6');

    // Pelvis / Hips
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 1.35;
    this.rig.add(this.pelvis);

    const hipMesh = withOutline(new THREE.SphereGeometry(0.42, 10, 8), redMat);
    hipMesh.scale.set(1.15, 0.75, 0.95);
    this.pelvis.add(hipMesh);

    // Torso + Red/White Tunic & Cream Cross-Strap
    this.torso = new THREE.Group();
    this.torso.position.y = 0.2;
    this.pelvis.add(this.torso);

    const chest = withOutline(new THREE.CylinderGeometry(0.42, 0.34, 0.78, 9), redMat);
    chest.position.y = 0.4;
    const whiteTrim = withOutline(new THREE.CylinderGeometry(0.45, 0.43, 0.2, 9), whiteMat);
    whiteTrim.position.y = 0.14;
    const belt = withOutline(new THREE.CylinderGeometry(0.39, 0.4, 0.14, 9), darkMat);
    belt.position.y = 0.04;
    const collar = withOutline(new THREE.CylinderGeometry(0.46, 0.44, 0.18, 9), whiteMat);
    collar.position.y = 0.74;

    // Cross-body courier strap
    const strap = withOutline(new THREE.BoxGeometry(0.16, 0.85, 0.52), strapMat);
    strap.position.set(0, 0.42, 0);
    strap.rotation.z = 0.52;
    this.torso.add(chest, whiteTrim, belt, collar, strap);

    // ICONIC DIAGONAL BROWN LEATHER COURIER SCROLL TUBE / BACKPACK (Screenshots 1-5)
    this.scrollPack = new THREE.Group();
    this.scrollPack.position.set(-0.08, 0.48, -0.34);
    this.scrollPack.rotation.z = 0.58; // Slanted diagonally across back
    this.scrollPack.rotation.x = 0.12;
    const tubeBody = withOutline(new THREE.CylinderGeometry(0.28, 0.28, 1.48, 10), leatherMat);
    const capTop = withOutline(new THREE.CylinderGeometry(0.31, 0.31, 0.14, 10), brassMat);
    capTop.position.y = 0.72;
    const capBot = withOutline(new THREE.CylinderGeometry(0.31, 0.31, 0.14, 10), brassMat);
    capBot.position.y = -0.72;
    const bandA = withOutline(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10), strapMat);
    bandA.position.y = 0.28;
    const bandB = withOutline(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10), strapMat);
    bandB.position.y = -0.28;
    this.scrollPack.add(tubeBody, capTop, capBot, bandA, bandB);
    this.torso.add(this.scrollPack);

    // Head + Red/White Cap + Dark Brown Wavy Twin-Tails Hair (Screenshots 2, 3, 5)
    this.head = new THREE.Group();
    this.head.position.y = 1.02;
    this.torso.add(this.head);

    const skull = withOutline(new THREE.SphereGeometry(0.34, 12, 10), skinMat);
    const capCrown = withOutline(new THREE.SphereGeometry(0.37, 12, 10), redMat);
    capCrown.scale.set(1.04, 0.72, 1.05);
    capCrown.position.set(0, 0.14, -0.02);
    const capBrim = withOutline(new THREE.CylinderGeometry(0.39, 0.39, 0.1, 12), whiteMat);
    capBrim.position.set(0, 0.08, 0);
    const hairBack = withOutline(new THREE.SphereGeometry(0.38, 10, 8), brownHairMat);
    hairBack.scale.set(1.18, 0.85, 0.95);
    hairBack.position.set(0, -0.04, -0.14);
    this.head.add(skull, capCrown, capBrim, hairBack);

    // Voluminous Dark Brown Wavy Twin-Tails + White/Blue Ribbon Streamers
    this.hairChains = [];
    for (let side of [-1, 1]) {
      const chain = [];
      let parent = this.head;
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Group();
        seg.position.set(i === 0 ? side * 0.26 : 0, i === 0 ? -0.04 : -0.02, i === 0 ? -0.22 : -0.28);
        const r = 0.22 - i * 0.028;
        const puff = withOutline(new THREE.SphereGeometry(r, 8, 7), brownHairMat);
        puff.scale.set(1.1, 0.85, 1.45);
        puff.position.z = -0.14;
        seg.add(puff);
        parent.add(seg);
        chain.push(seg);
        parent = seg;
      }
      this.hairChains.push(chain);
    }

    // Arms with Blue Fingerless Gloves / Gauntlets (Screenshots 2, 3, 5)
    this.leftArm = this._makeArm(-1, whiteMat, redMat, blueGloveMat, skinMat);
    this.rightArm = this._makeArm(1, whiteMat, redMat, blueGloveMat, skinMat);
    this.torso.add(this.leftArm, this.rightArm);

    // Baggy Red & White Courier Pants + Glowing Jet-Sole Boots (Screenshots 2, 4, 5)
    this.leftLeg = this._makeLeg(-1, redMat, whiteMat, darkMat);
    this.rightLeg = this._makeLeg(1, redMat, whiteMat, darkMat);
    this.pelvis.add(this.leftLeg.hip, this.rightLeg.hip);

    // Courier Hover-Board (Active Ability)
    this.board = new THREE.Group();
    const deck = withOutline(new THREE.BoxGeometry(1.1, 0.12, 2.55), brassMat);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.06, 2.65), additive('#45f3ff', 0.78));
    glow.position.y = -0.08;
    this.board.add(deck, glow);
    this.board.position.y = 0.1;
    this.board.visible = false;
    this.rig.add(this.board);
  }

  _makeArm(side, whiteMat, redMat, blueGloveMat, skinMat) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.52, 0.68, 0);

    const sleeve = withOutline(new THREE.SphereGeometry(0.21, 8, 8), whiteMat);
    const upper = withOutline(new THREE.CylinderGeometry(0.12, 0.11, 0.44, 7), skinMat);
    upper.position.y = -0.24;

    // Blue Gauntlet / Fingerless Glove
    const gauntlet = withOutline(new THREE.CylinderGeometry(0.14, 0.17, 0.36, 8), blueGloveMat);
    gauntlet.position.y = -0.54;
    const cuff = withOutline(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8), redMat);
    cuff.position.y = -0.38;

    // Outstretched hand + fingers (clearly visible in Eagle Glide pose)
    const palm = withOutline(new THREE.BoxGeometry(0.22, 0.18, 0.12), blueGloveMat);
    palm.position.y = -0.76;
    for (let f = -1; f <= 1; f++) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.18, 5), skinMat);
      finger.position.set(f * 0.065, -0.9, 0);
      finger.rotation.z = f * 0.18;
      shoulder.add(finger);
    }

    shoulder.add(sleeve, upper, gauntlet, cuff, palm);
    return shoulder;
  }

  _makeLeg(side, redMat, whiteMat, darkMat) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.28, -0.06, 0);

    // Puffy baggy red courier bloomers/pants with white stripes (Screenshots 2, 3, 5)
    const baggyThigh = withOutline(new THREE.SphereGeometry(0.34, 10, 8), redMat);
    baggyThigh.scale.set(1.05, 1.25, 1.05);
    baggyThigh.position.y = -0.32;

    const whiteStripe = withOutline(new THREE.CylinderGeometry(0.32, 0.28, 0.14, 9), whiteMat);
    whiteStripe.position.y = -0.56;
    hip.add(baggyThigh, whiteStripe);

    const knee = new THREE.Group();
    knee.position.y = -0.62;
    hip.add(knee);

    const shin = withOutline(new THREE.CylinderGeometry(0.16, 0.22, 0.48, 8), darkMat);
    shin.position.y = -0.24;

    const boot = withOutline(new THREE.BoxGeometry(0.44, 0.3, 0.68), darkMat);
    boot.position.set(0, -0.5, 0.1);
    const bootTrim = withOutline(new THREE.BoxGeometry(0.46, 0.1, 0.7), whiteMat);
    bootTrim.position.set(0, -0.58, 0.1);

    // Glowing orange/yellow circular jet-sole (visible when knees bend in air or sprinting, Screenshots 1, 2, 4, 5)
    const soleDiscGeo = new THREE.CircleGeometry(0.32, 16);
    soleDiscGeo.rotateX(Math.PI / 2);
    const soleOuter = new THREE.Mesh(soleDiscGeo, additive('#ff6a14', 0.95));
    soleOuter.position.set(0, -0.66, 0.06);

    const soleCoreGeo = new THREE.CircleGeometry(0.2, 16);
    soleCoreGeo.rotateX(Math.PI / 2);
    const soleCore = new THREE.Mesh(soleCoreGeo, additive('#ffee55', 0.98));
    soleCore.position.set(0, -0.665, 0.06);

    // Jet plume cone
    const flameGeo = new THREE.ConeGeometry(0.28, 1.25, 10);
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.62);
    const flame = new THREE.Mesh(flameGeo, additive('#ff7b1c', 0.88));
    flame.position.set(0, -0.54, -0.18);

    const innerFlameGeo = new THREE.ConeGeometry(0.16, 0.78, 8);
    innerFlameGeo.rotateX(-Math.PI / 2);
    innerFlameGeo.translate(0, 0, -0.4);
    const innerFlame = new THREE.Mesh(innerFlameGeo, additive('#fff36b', 0.95));
    flame.add(innerFlame);

    knee.add(shin, boot, bootTrim, soleOuter, soleCore, flame);
    return { hip, knee, flame, soleOuter, soleCore };
  }

  _buildTrails() {
    this.trailLen = 26;
    this.trails = [-0.42, 0.42].map((ox) => {
      const pos = new Float32Array(this.trailLen * 2 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const idx = [];
      for (let i = 0; i < this.trailLen - 1; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return { ox, pos, geo, mesh, pts: [] };
    });
  }

  _buildFootSparks() {
    // Ground-running fiery spark puffs & curved wind arcs (Screenshot 1)
    this.footPuffs = [];
    const puffGeo = new THREE.IcosahedronGeometry(0.32, 0);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(
        puffGeo,
        additive(i % 2 === 0 ? '#ff841f' : '#ffdd47', 0.85)
      );
      m.visible = false;
      this.scene.add(m);
      this.footPuffs.push({ mesh: m, life: 0, maxLife: 0.28, vel: new THREE.Vector3() });
    }
    this.puffTimer = 0;
  }

  _buildShockwave() {
    const geo = new THREE.RingGeometry(0.8, 2.3, 32);
    geo.rotateX(-Math.PI / 2);
    this.shockMat = additive('#8aff6b', 0);
    this.shockMat.side = THREE.DoubleSide;
    this.shockRing = new THREE.Mesh(geo, this.shockMat);
    this.shockRing.visible = false;
    this.scene.add(this.shockRing);
    this.shockTimer = 0;
  }

  triggerLandingFX(colorHex, scaleMax = 14) {
    this.shockMat.color.set(colorHex);
    this.shockMat.opacity = 0.9;
    this.shockRing.position.copy(this.pos);
    this.shockRing.position.y += 0.35;
    this.shockRing.scale.setScalar(0.5);
    this.shockRing.visible = true;
    this.shockTimer = 0.4;
    this.shockMax = scaleMax;
  }

  reset(world) {
    const z = 0;
    const x = world.pathX(z);
    const y = world.h(x, z);
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 52);
    this.speed = 52;
    this.grounded = true;
    this.diving = false;
    this.airTime = 0;
    this.energy = 65;
    this.hp = this.maxHp;
    this.invuln = 0;
    this.boardActive = 0;
    this.trails.forEach((t) => (t.pts.length = 0));
    this.footPuffs.forEach((p) => { p.life = 0; p.mesh.visible = false; });
  }

  update(dt, input, world, audio, onLanding) {
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.boardActive > 0) this.boardActive = Math.max(0, this.boardActive - dt);

    // FIXED STEERING:
    // Camera looks from -Z toward +Z (+Y up), so Screen Left is +X and Screen Right is -X!
    const keySteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const mouseSteer = input.mouseSteer || 0;
    const steerTarget = THREE.MathUtils.clamp(keySteer + mouseSteer, -1.25, 1.25);
    this.steer = THREE.MathUtils.lerp(this.steer, steerTarget, 1 - Math.exp(-12 * dt));

    const maxLatSpeed = 52 + this.speed * 0.26;
    // Positive steer (+1 = Left) moves in +X (Screen Left)!
    this.vel.x = THREE.MathUtils.lerp(this.vel.x, this.steer * maxLatSpeed, 1 - Math.exp(-9 * dt));

    // Soft valley containment so player stays near the main biome corridor
    const pathDelta = world.pathX(this.pos.z) - this.pos.x;
    if (Math.abs(pathDelta) > 140) {
      this.vel.x += Math.sign(pathDelta) * (Math.abs(pathDelta) - 140) * 0.9 * dt;
    }

    // Active Ability: Courier Hoverboard / Boost Surge (Right-Click / E / Shift)
    if (input.boost && this.energy >= 33 && this.boardActive <= 0) {
      this.energy -= 33;
      this.boardActive = 3.0;
      this.speed = Math.max(this.speed + 42 * this.stats.boostPower, 138);
      this.vel.z = this.speed;
      this.triggerLandingFX('#ffd447', 16);
      audio?.playBoost();
    }

    const [gx, gz] = world.grad(this.pos.x, this.pos.z);

    // Holding Space / Left-Click / S triggers Fast-Fall Dive when airborne!
    const wantDive = Boolean(input.dive);
    this.diving = !this.grounded && wantDive;

    if (this.grounded) {
      this.airTime = 0;

      // Player-controlled forward momentum:
      // Holding forward actively drives sprint strides; letting go coasts smoothly toward jogging pace
      const isPushingForward = Boolean(input.forward || this.boardActive > 0);
      const baseSprintPace = (this.boardActive > 0 ? 140 : 68) * this.stats.topSpeedMult;
      const coastingPace = 24 * this.stats.topSpeedMult;

      if (isPushingForward) {
        if (this.speed < baseSprintPace) {
          this.speed += 38 * dt;
        }
      } else if (Math.abs(gz) < 0.05 && this.speed > coastingPace) {
        // Natural coasting deceleration on flat ground when not pushing forward
        this.speed -= 16 * dt;
      }

      // Slope Physics: Downhill accelerates, uphill decelerates
      // gz < 0 is downhill in +Z travel direction; gz > 0 is uphill
      const diveGripMult = wantDive && gz < 0 ? 1.6 : 1.0;
      const slopeForce = gz < 0 ? -gz * 135 * diveGripMult : -gz * 105;
      this.speed += slopeForce * dt;

      // Natural aerodynamic drag for speeds exceeding standard cruising
      const dragFactor = this.boardActive > 0 ? 0.012 : 0.038;
      const excessSpeed = Math.max(0, this.speed - baseSprintPace);
      this.speed -= excessSpeed * dragFactor * dt;

      // Minimum and maximum speed limits
      this.speed = THREE.MathUtils.clamp(this.speed, 18, 208 * this.stats.topSpeedMult);

      this.vel.z = this.speed;
      const prevX = this.pos.x;
      const prevY = this.pos.y;
      const prevZ = this.pos.z;

      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;

      const newGroundY = world.h(this.pos.x, this.pos.z);
      const [ngx, ngz] = world.grad(this.pos.x, this.pos.z);
      const groundSlopeVel = ngx * this.vel.x + ngz * this.vel.z;

      if (input.jump) {
        // Active Hop / Jump (consumes jump so holding key doesn't loop)
        input.jump = false;
        this.grounded = false;
        this.vel.y = Math.max(groundSlopeVel, 0) + 26;
        this.pos.y = newGroundY + 0.35;
        audio?.playJump();
      } else {
        // Physical Hill-Crest Launch:
        // Evaluates downward curvature acceleration of the ground relative to 3D tangent path
        const expectedY = prevY + (gx * this.vel.x + gz * this.vel.z) * dt;
        const downwardAccel = (expectedY - newGroundY) / (0.5 * Math.max(dt * dt, 0.00001));
        const launchThreshold = wantDive ? 52 : 24;

        if (downwardAccel > launchThreshold && this.speed > 48) {
          this.grounded = false;
          // Launch velocity scales with speed and crest slope
          const crestLift = Math.min((this.speed - 42) * 0.14, 14);
          this.vel.y = Math.max(gx * this.vel.x + gz * this.vel.z, 0) + 4 + crestLift;
          this.pos.y = newGroundY + 0.25;
        } else {
          this.pos.y = newGroundY;
          this.vel.y = groundSlopeVel;
        }
      }
    } else {
      // Airborne Glide & Fast-Fall Dive Physics
      this.airTime += dt;
      const gravity = this.diving ? -175 * this.stats.diveGravity : -24;
      this.vel.y += gravity * dt;

      if (this.diving) {
        // Fast-Fall Dive converts altitude into forward and downward velocity
        this.vel.z += (38 + Math.abs(this.vel.y) * 0.12) * dt;
        this.vel.y = Math.max(this.vel.y, -145);
      } else {
        // Eagle-Glide Lift: Aerodynamic forward velocity provides upward glide floatiness
        this.vel.y += Math.min(this.vel.z * 0.055, 8.8) * dt;
      }

      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      this.pos.z += this.vel.z * dt;
      this.speed = Math.hypot(this.vel.x, this.vel.z);

      const curGroundY = world.h(this.pos.x, this.pos.z);
      if (this.pos.y <= curGroundY) {
        // AUTHENTIC HASTE LANDING JUDGE: Slope Angle Matching
        const [lgx, lgz] = world.grad(this.pos.x, this.pos.z);
        const lil = 1 / Math.hypot(lgx, 1, lgz);
        const lnx = -lgx * lil, lny = lil, lnz = -lgz * lil;

        const vLen = Math.hypot(this.vel.x, this.vel.y, this.vel.z) || 1;
        const vx = this.vel.x / vLen, vy = this.vel.y / vLen, vz = this.vel.z / vLen;
        const impactDot = Math.abs(vx * lnx + vy * lny + vz * lnz);

        // Downhill checks: in +Z travel direction, lgz < -0.04 is gentle downslope, lgz < -0.14 is steep downhill landing zone
        const isDownhill = lgz < -0.04;
        const isSteepDownhill = lgz < -0.14;
        const flightSlope = this.vel.y / Math.max(this.vel.z, 1);
        const slopeAngleDiff = Math.abs(flightSlope - lgz);

        this.pos.y = curGroundY;
        this.grounded = true;

        if (this.airTime > 0.16) {
          // PERFECT LANDING: Cleanly aligned with a steep downhill landing chute
          if (isSteepDownhill && (slopeAngleDiff < 0.38 || impactDot < 0.38)) {
            const diveBonus = Math.abs(this.vel.y) * 0.35;
            const boost = (28 + Math.min(this.airTime * 18, 30) + diveBonus) * this.stats.boostPower;
            this.speed = Math.min(212 * this.stats.topSpeedMult, Math.max(this.speed, this.vel.z) + boost);
            this.energy = Math.min(this.maxEnergy, this.energy + 30 * this.stats.energyGain);
            this.triggerLandingFX('#88ff66', 16);
            audio?.playLanding('perfect');
            onLanding?.('Perfect', 'rgba(155, 245, 110, 0.95)', boost);

          // GOOD LANDING: Moderate downslope alignment or smooth gentle touchdown
          } else if ((isDownhill && impactDot < 0.54) || (impactDot < 0.46 && Math.abs(this.vel.y) < 30)) {
            const boost = (14 + Math.min(this.airTime * 9, 18)) * this.stats.boostPower;
            this.speed = Math.min(188 * this.stats.topSpeedMult, this.speed + boost);
            this.energy = Math.min(this.maxEnergy, this.energy + 15 * this.stats.energyGain);
            this.triggerLandingFX('#66f0ff', 12);
            audio?.playLanding('good');
            onLanding?.('Good', 'rgba(100, 240, 255, 0.90)', boost);

          // OK LANDING: Flat ground landing with low downward speed
          } else if (impactDot < 0.65 && Math.abs(this.vel.y) < 32 && Math.abs(lgz) <= 0.06) {
            this.speed = Math.max(48, this.speed * 0.90);
            this.triggerLandingFX('#ffd15c', 8);
            audio?.playLanding('ok');
            onLanding?.('Ok', 'rgba(255, 215, 95, 0.85)', -5);

          // BAD LANDING: Crashed into flat ground with high downward speed, or crashed into an uphill slope
          } else {
            this.speed = Math.max(32, this.speed * 0.56);
            this.triggerLandingFX('#ff4238', 11);
            audio?.playLanding('bad');
            onLanding?.('Bad', 'rgba(255, 66, 56, 0.92)', -28);
          }
        }
        this.vel.z = this.speed;
        this.vel.y = lgz * this.vel.z;
        this.diving = false;
      }
    }

    this._animateZoe(dt, gz);
    this._updateFootSparks(dt);
    this._updateTrails();
  }

  _animateZoe(dt, gz) {
    this.root.position.copy(this.pos);
    // Lean into turns smoothly (Screen Left = +steer -> bank left)
    this.roll = THREE.MathUtils.lerp(this.roll, -this.steer * 0.42, 1 - Math.exp(-11 * dt));

    const targetPitch = this.grounded
      ? Math.atan(-gz) * 0.85
      : THREE.MathUtils.clamp(-this.vel.y * 0.015 + (this.diving ? 0.58 : -0.1), -0.55, 0.95);
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, 1 - Math.exp(-12 * dt));

    // Slight yaw turn toward steering direction so Zoe faces into her carve
    const yawOffset = THREE.MathUtils.clamp(this.steer * 0.22, -0.3, 0.3);
    this.rig.rotation.set(this.pitch, Math.PI + yawOffset, this.roll);
    this.board.visible = this.boardActive > 0;
    this.rig.visible = this.invuln <= 0 || Math.floor(this.invuln * 20) % 2 === 0;

    const flameScale = THREE.MathUtils.clamp((this.speed - 52) / 78, 0.35, 1.9) * (this.boardActive > 0 ? 1.35 : 1);
    const pulse = 0.88 + Math.random() * 0.24;
    this.leftLeg.flame.scale.set(1, 1, flameScale * pulse);
    this.rightLeg.flame.scale.set(1, 1, flameScale * pulse);
    this.leftLeg.soleOuter.scale.setScalar(0.85 + pulse * 0.35);
    this.rightLeg.soleOuter.scale.setScalar(0.85 + pulse * 0.35);

    if (this.grounded && this.boardActive <= 0) {
      // GROUND SPRINT POSE (Matches Screenshot 1: forward lean, dynamic leg drive, scroll pack bobbing)
      this.stridePhase += dt * (9.5 + this.speed * 0.13);
      const s = Math.sin(this.stridePhase);
      const c = Math.cos(this.stridePhase);

      this.pelvis.position.y = 1.3 + Math.abs(s) * 0.2;
      this.torso.rotation.x = 0.42 + Math.min(this.speed / 240, 0.36);
      this.torso.rotation.y = s * 0.26;
      this.scrollPack.rotation.z = 0.58 + s * 0.08;

      this.leftLeg.hip.rotation.set(s * 1.18, 0, -0.06);
      this.leftLeg.knee.rotation.x = Math.max(0.1, -c * 1.15);
      this.rightLeg.hip.rotation.set(-s * 1.18, 0, 0.06);
      this.rightLeg.knee.rotation.x = Math.max(0.1, c * 1.15);

      this.leftArm.rotation.set(-s * 0.95 - 0.3, 0, -0.28);
      this.rightArm.rotation.set(s * 0.95 - 0.3, 0, 0.28);
    } else if (this.boardActive > 0) {
      // HOVERBOARD SURFER POSE
      this.pelvis.position.y = 1.42;
      this.torso.rotation.set(0.28, 0.42, 0);
      this.leftLeg.hip.rotation.set(-0.35, 0, -0.15);
      this.leftLeg.knee.rotation.x = 0.45;
      this.rightLeg.hip.rotation.set(0.35, 0, 0.15);
      this.rightLeg.knee.rotation.x = 0.45;
      this.leftArm.rotation.set(-0.2, 0, -1.1);
      this.rightArm.rotation.set(-0.2, 0, 1.1);
    } else if (this.diving) {
      // FAST-FALL DIVE POSE (Nose-down aerodynamic tuck, arms swept back, boots blazing)
      this.pelvis.position.y = 1.24;
      this.torso.rotation.set(0.82, 0, 0);
      this.leftArm.rotation.set(-1.35, 0, -0.25);
      this.rightArm.rotation.set(-1.35, 0, 0.25);
      this.leftLeg.hip.rotation.set(-0.45, 0, -0.14);
      this.leftLeg.knee.rotation.x = 1.35;
      this.rightLeg.hip.rotation.set(-0.45, 0, 0.14);
      this.rightLeg.knee.rotation.x = 1.35;
    } else {
      // ICONIC HASTE AIRBORNE EAGLE GLIDE POSE (Matches Screenshots 2, 4, 5!)
      // Arms spread wide horizontally with blue gloves open, knees bent up showing glowing orange boot soles!
      const bob = Math.sin(performance.now() * 0.008) * 0.06;
      this.pelvis.position.y = 1.38 + bob;
      this.torso.rotation.set(0.68, 0, 0);

      // Wide horizontal T/Y-wingspan arm pose
      this.leftArm.rotation.set(0.15, 0, -1.38 + bob);
      this.rightArm.rotation.set(0.15, 0, 1.38 - bob);

      // Knees bent upward and slightly wide so both glowing orange boot soles face the camera
      this.leftLeg.hip.rotation.set(-0.55, 0, -0.26);
      this.leftLeg.knee.rotation.x = 1.52;
      this.rightLeg.hip.rotation.set(-0.55, 0, 0.26);
      this.rightLeg.knee.rotation.x = 1.52;
    }

    // Wavy brown twin-tails hair physics
    const t = performance.now() * 0.014;
    this.hairChains.forEach((chain, ci) => {
      chain.forEach((seg, idx) => {
        seg.rotation.x = Math.sin(t - idx * 0.7 + ci) * (0.16 + this.speed * 0.0014) - this.pitch * 0.15;
        seg.rotation.y = Math.cos(t * 0.85 - idx * 0.55 + ci) * 0.14 - this.steer * 0.12;
      });
    });

    if (this.shockTimer > 0) {
      this.shockTimer = Math.max(0, this.shockTimer - dt);
      const p = 1 - this.shockTimer / 0.4;
      this.shockRing.scale.setScalar(1 + p * this.shockMax);
      this.shockMat.opacity = (1 - p) * 0.85;
      if (this.shockTimer <= 0) this.shockRing.visible = false;
    }
  }

  _updateFootSparks(dt) {
    this.puffTimer -= dt;
    if (this.grounded && this.speed > 65 && this.puffTimer <= 0) {
      this.puffTimer = 0.032;
      const p = this.footPuffs.find((f) => f.life <= 0);
      if (p) {
        p.life = p.maxLife;
        p.mesh.visible = true;
        p.mesh.position.set(
          this.pos.x + (Math.random() - 0.5) * 0.9,
          this.pos.y + 0.25,
          this.pos.z - 0.6
        );
        p.vel.set((Math.random() - 0.5) * 6, 2.5 + Math.random() * 4, -this.speed * 0.25);
      }
    }
    for (const p of this.footPuffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      const s = (p.life / p.maxLife) * 1.35;
      p.mesh.scale.setScalar(s);
    }
  }

  _updateTrails() {
    const show = this.speed > 78 || !this.grounded;
    this.trails.forEach((t) => {
      if (show) {
        const pL = new THREE.Vector3(t.ox - 0.12, 1.05, -0.35).applyMatrix4(this.root.matrixWorld);
        const pR = new THREE.Vector3(t.ox + 0.12, 1.05, -0.35).applyMatrix4(this.root.matrixWorld);
        t.pts.unshift([pL, pR]);
        if (t.pts.length > this.trailLen) t.pts.pop();
      } else if (t.pts.length > 0) {
        t.pts.pop();
      }
      if (t.pts.length < 2) {
        t.mesh.visible = false;
        return;
      }
      t.mesh.visible = true;
      for (let i = 0; i < this.trailLen; i++) {
        const pair = t.pts[Math.min(i, t.pts.length - 1)];
        t.pos.set([pair[0].x, pair[0].y, pair[0].z], i * 6);
        t.pos.set([pair[1].x, pair[1].y, pair[1].z], i * 6 + 3);
      }
      t.geo.attributes.position.needsUpdate = true;
      t.geo.computeBoundingSphere();
    });
  }
}
