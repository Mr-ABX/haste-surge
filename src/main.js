import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { EncounterManager, BOSS_INFO } from './bosses.js';
import { SoundEngine } from './audio.js';
import { TUTORIAL_STAGE, SHARD_CAMPAIGN, SHOP_ITEMS } from './roguelite.js';

const canvas = document.getElementById('game-canvas');
const fxCanvas = document.getElementById('fx-canvas');
const fxCtx = fxCanvas.getContext('2d');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.5, 6500);

const world = new World(scene);
const player = new Player(scene);
const encounters = new EncounterManager(scene, world);
const audio = new SoundEngine();

// Game State
let state = 'menu'; // 'menu' | 'playing' | 'shop' | 'tutorial_modal'
let stageIdx = 0;
let isTutorial = false;
let tutorialStep = 1;
let tutorialDiveAccum = 0;
let lastLandingGrade = '';
let sparks = 930;
let recentSparks = 0;
let recentSparkTimer = 0;
let wallZ = -180;
let camShake = 0;
let ownedItems = [SHOP_ITEMS[0], SHOP_ITEMS[1]];

// Input State
const input = { forward: false, left: false, right: false, dive: false, jump: false, boost: false, mouseSteer: 0 };

window.addEventListener('keydown', (e) => {
  const k = e.code;
  if (!audio.ctx) audio.init();

  if (k === 'KeyA' || k === 'ArrowLeft') input.left = true;
  if (k === 'KeyD' || k === 'ArrowRight') input.right = true;
  if (k === 'KeyS' || k === 'ArrowDown' || k === 'Space') input.dive = true;
  if (k === 'KeyW' || k === 'ArrowUp') {
    input.forward = true;
    input.jump = true;
  }
  if (k === 'KeyE' || k === 'ShiftLeft' || k === 'ShiftRight') input.boost = true;
  if (k === 'Escape' && state === 'playing') openMenu();
});

window.addEventListener('keyup', (e) => {
  const k = e.code;
  if (k === 'KeyA' || k === 'ArrowLeft') input.left = false;
  if (k === 'KeyD' || k === 'ArrowRight') input.right = false;
  if (k === 'KeyS' || k === 'ArrowDown' || k === 'Space') input.dive = false;
  if (k === 'KeyW' || k === 'ArrowUp') {
    input.forward = false;
    input.jump = false;
  }
  if (k === 'KeyE' || k === 'ShiftLeft' || k === 'ShiftRight') input.boost = false;
});

window.addEventListener('mousedown', (e) => {
  if (!audio.ctx) audio.init();
  if (state !== 'playing') return;
  if (e.target.closest('button')) return;
  if (e.button === 0) input.dive = true;
  if (e.button === 2) input.boost = true;
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.dive = false;
  if (e.button === 2) input.boost = false;
});

window.addEventListener('mousemove', (e) => {
  if (state !== 'playing') return;
  const normX = (e.clientX / window.innerWidth) * 2 - 1;
  // Subtle mouse steering influence: -0.75 to +0.75
  input.mouseSteer = -normX * 0.75;
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  fxCanvas.width = window.innerWidth;
  fxCanvas.height = window.innerHeight;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
fxCanvas.width = window.innerWidth;
fxCanvas.height = window.innerHeight;

// HUD Elements
const elHud = document.getElementById('hud');
const elSpeedCluster = document.querySelector('.speed-cluster');
const elSpeed = document.getElementById('hud-speed');
const elSparks = document.getElementById('hud-sparks');
const elRecentSparks = document.getElementById('hud-sparks-add');
const elProgressFill = document.getElementById('hud-progress-fill');
const elWallMarker = document.getElementById('hud-wall-marker');
const elEnergyFill = document.getElementById('hud-energy-fill');
const elHearts = document.getElementById('hud-hearts');
const elItemsTray = document.getElementById('hud-items');
const elCallout = document.getElementById('hud-callout');
const elBossBanner = document.getElementById('boss-banner');
const elBossName = document.getElementById('boss-name');
const elBossSub = document.getElementById('boss-sub');
const elBossHpFill = document.getElementById('boss-hp-fill');
const elMenuModal = document.getElementById('menu-modal');
const elShopModal = document.getElementById('shop-modal');
const elShopGrid = document.getElementById('shop-grid');
const elShopSparks = document.getElementById('shop-sparks');

// Tutorial Elements
const elTutorialHud = document.getElementById('tutorial-hud');
const elTutStepNum = document.getElementById('tut-step-num');
const elTutTitle = document.getElementById('tut-title');
const elTutDesc = document.getElementById('tut-desc');
const elTutorialModal = document.getElementById('tutorial-modal');
const elBtnStartTutorial = document.getElementById('btn-start-tutorial');
const elBtnTutShard1 = document.getElementById('btn-tut-shard1');
const elBtnTutMenu = document.getElementById('btn-tut-menu');

const TUTORIAL_STEPS = [
  {
    num: 1,
    title: '1. SPRINT & STEER',
    desc: 'Use [A] / [D] or [◀] / [▶] to steer along the spark trail. Hold [W] / [▲] to sprint!',
  },
  {
    num: 2,
    title: '2. CREST LAUNCH & EAGLE FLIGHT',
    desc: 'Carry momentum over the hill crest to launch high into the sky!',
  },
  {
    num: 3,
    title: '3. FAST-FALL DIVE',
    desc: 'While airborne, HOLD [SPACE] or [LEFT CLICK] to dive downward!',
  },
  {
    num: 4,
    title: '4. PERFECT SLOPE BOOST',
    desc: 'Fast-fall into the green downhill slope ahead to score a SPEED BOOST!',
  },
  {
    num: 5,
    title: '5. ENTER SHARD PORTAL',
    desc: 'Rocket forward and enter the golden Shard Portal!',
  },
];

function updateTutorialHud() {
  const cur = TUTORIAL_STEPS[tutorialStep - 1] || TUTORIAL_STEPS[0];
  elTutStepNum.textContent = `STEP ${cur.num} / 5`;
  elTutTitle.textContent = cur.title;
  elTutDesc.textContent = cur.desc;
  for (let i = 1; i <= 5; i++) {
    const dot = document.getElementById(`tut-dot-${i}`);
    if (!dot) continue;
    dot.className = 'tut-dot' + (i < tutorialStep ? ' done' : i === tutorialStep ? ' active' : '');
  }
}

let calloutTimer = 0;
function showCallout(text, color = 'rgba(155, 245, 110, 0.72)') {
  elCallout.textContent = text;
  elCallout.style.color = color;
  elCallout.style.opacity = '1';
  elCallout.style.transform = 'translateX(-50%) scale(1.12)';
  setTimeout(() => {
    elCallout.style.transform = 'translateX(-50%) scale(1)';
  }, 60);
  calloutTimer = 1.05;
}

function startTutorial() {
  isTutorial = true;
  stageIdx = -1;
  tutorialStep = 1;
  tutorialDiveAccum = 0;
  lastLandingGrade = '';

  audio.init();
  audio.playing = true;
  audio.setMenuMode(false);

  elMenuModal.style.display = 'none';
  elShopModal.style.display = 'none';
  elTutorialModal.classList.add('hidden');
  elHud.classList.remove('hidden');
  elTutorialHud.classList.remove('hidden');
  elBossBanner.style.display = 'none';

  world.setLevel('verdant', 42, TUTORIAL_STAGE.length, true);
  player.reset(world);
  encounters.clear();
  wallZ = -9999;
  world.setWall(wallZ);

  updateTutorialHud();
  updateHudStatic();
  state = 'playing';
}

function loadStage(index) {
  isTutorial = false;
  stageIdx = index % SHARD_CAMPAIGN.length;
  const cfg = SHARD_CAMPAIGN[stageIdx];
  const seed = 14.2 + stageIdx * 7.3;

  audio.setMenuMode(false);
  elTutorialHud.classList.add('hidden');
  elTutorialModal.classList.add('hidden');

  world.setLevel(cfg.biome, seed, cfg.length, false);
  player.reset(world);
  encounters.populateStage(cfg.biome, seed, cfg.length, cfg.boss);
  wallZ = -190;

  if (cfg.boss && BOSS_INFO[cfg.boss]) {
    elBossBanner.style.display = 'block';
    elBossName.textContent = BOSS_INFO[cfg.boss].name;
    elBossSub.textContent = BOSS_INFO[cfg.boss].subtitle;
  } else {
    elBossBanner.style.display = 'none';
  }
  updateHudStatic();
}

function updateHudStatic() {
  elHearts.innerHTML = '';
  for (let i = 0; i < player.maxHp; i++) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'heart-svg ' + (i < player.hp ? 'full' : 'empty'));
    svg.innerHTML = `<path d="M12 21s-7-4.5-9.5-8.5C.5 9 2.5 5 6.5 5c2.3 0 4 1.2 5.5 3 1.5-1.8 3.2-3 5.5-3 4 0 6 4 4 7.5C19 16.5 12 21 12 21z"/>`;
    elHearts.appendChild(svg);
  }
  elItemsTray.innerHTML = '';
  ownedItems.slice(-5).forEach((item) => {
    const d = document.createElement('div');
    d.className = 'item-slot';
    d.style.color = item.color;
    d.title = item.name;
    d.innerHTML = item.svg;
    elItemsTray.appendChild(d);
  });
}

function openMenu() {
  state = 'menu';
  audio.setMenuMode(true);
  elHud.classList.add('hidden');
  elShopModal.style.display = 'none';
  elTutorialModal.classList.add('hidden');
  elTutorialHud.classList.add('hidden');
  elMenuModal.style.display = 'flex';
}

function openShop() {
  state = 'shop';
  audio.setMenuMode(true);
  elHud.classList.add('hidden');
  elShopModal.style.display = 'flex';
  renderShopItems();
}

function renderShopItems() {
  elShopSparks.textContent = sparks;
  elShopGrid.innerHTML = '';
  SHOP_ITEMS.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.style.borderLeftColor = item.color;
    card.innerHTML = `
      <div class="shop-icon-wrap" style="color:${item.color}">${item.svg}</div>
      <div class="shop-name">${item.name}</div>
      <div class="shop-desc">${item.desc}</div>
      <button class="shop-buy" ${sparks < item.cost ? 'disabled' : ''}>MANIFEST // ${item.cost} SPARKS</button>
    `;
    card.querySelector('button').addEventListener('click', () => {
      if (sparks >= item.cost) {
        sparks -= item.cost;
        item.apply(player);
        ownedItems.push(item);
        audio.playBoost();
        updateHudStatic();
        renderShopItems();
      }
    });
    elShopGrid.appendChild(card);
  });
}

// Button Bindings
if (elBtnStartTutorial) {
  elBtnStartTutorial.addEventListener('click', startTutorial);
}

if (elBtnTutShard1) {
  elBtnTutShard1.addEventListener('click', () => {
    elTutorialModal.classList.add('hidden');
    elHud.classList.remove('hidden');
    audio.playing = true;
    loadStage(0);
    state = 'playing';
  });
}

if (elBtnTutMenu) {
  elBtnTutMenu.addEventListener('click', openMenu);
}

document.querySelectorAll('[data-start-stage]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const idx = parseInt(btn.getAttribute('data-start-stage'), 10);
    audio.init();
    audio.playing = true;
    elMenuModal.style.display = 'none';
    elShopModal.style.display = 'none';
    elHud.classList.remove('hidden');
    loadStage(idx);
    state = 'playing';
  });
});

document.getElementById('btn-next-stage').addEventListener('click', () => {
  elShopModal.style.display = 'none';
  elHud.classList.remove('hidden');
  audio.playing = true;
  loadStage((stageIdx + 1) % SHARD_CAMPAIGN.length);
  state = 'playing';
});

document.getElementById('btn-open-menu').addEventListener('click', openMenu);
document.getElementById('btn-shop-menu').addEventListener('click', openMenu);

document.getElementById('btn-mute').addEventListener('click', (e) => {
  audio.setMuted(!audio.muted);
  e.currentTarget.textContent = audio.muted ? 'OFF' : 'SND';
});

document.getElementById('lyria-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) {
    audio.loadCustomTrack(file);
  }
});

// Dynamic Peripheral Speed Lines & Wind Tunnel (Matches Haste High-Speed Aesthetic)
function drawSpeedLines(speed, isDiving = false) {
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  if (speed < 76 && !isDiving) return;
  const intensity = Math.min(1, Math.max(0, (speed - 76) / 85));
  const cx = fxCanvas.width * 0.5;
  const cy = fxCanvas.height * 0.5;
  const maxR = Math.hypot(cx, cy);

  fxCtx.save();
  const alpha = 0.16 + intensity * 0.38 + (isDiving ? 0.18 : 0);
  fxCtx.strokeStyle = speed > 140
    ? `rgba(38, 240, 255, ${alpha})`
    : `rgba(255, 255, 255, ${alpha})`;
  fxCtx.lineWidth = 1.3 + intensity * 1.6;
  const count = Math.floor(24 + intensity * 42 + (isDiving ? 20 : 0));
  const t = performance.now() * 0.024;

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.sin(t + i * 1.7) * 0.035;
    const innerMin = isDiving ? 0.35 : 0.54;
    const r0 = maxR * (innerMin + ((i * 19) % 10) * 0.025 - intensity * 0.12);
    const r1 = maxR * 1.04;
    fxCtx.beginPath();
    fxCtx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    fxCtx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    fxCtx.stroke();
  }
  fxCtx.restore();
}

// Initialize Verdant Grassland stage behind Title Screen
loadStage(0);
state = 'menu';

let lastTime = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  const cfg = isTutorial ? TUTORIAL_STAGE : SHARD_CAMPAIGN[stageIdx];

  if (state === 'playing') {
    player.update(dt, input, world, audio, (grade, col) => {
      lastLandingGrade = grade;
      showCallout(grade, col);
      if (grade === 'Bad') camShake = 0.42;
    });

    const got = world.collectSparks(player.pos, player.stats.magnetRadius);
    if (got > 0) {
      sparks += got * 10;
      recentSparks += got * 10;
      recentSparkTimer = 1.6;
      audio.playSpark();
    }

    if (recentSparkTimer > 0) {
      recentSparkTimer -= dt;
      elRecentSparks.style.opacity = '1';
      elRecentSparks.textContent = `+${recentSparks}`;
    } else {
      recentSparks = 0;
      elRecentSparks.style.opacity = '0';
    }

    if (!isTutorial) {
      encounters.update(dt, player, audio, (msg, col) => {
        showCallout(msg, col);
        updateHudStatic();
        if (msg === 'Bad') camShake = 0.45;
      });
      wallZ = Math.max(wallZ + cfg.wallSpeed * dt, player.pos.z - 260);
    } else {
      wallZ = -9999;
    }
    world.setWall(wallZ);

    if (!isTutorial && (player.pos.z < wallZ + 8 || player.hp <= 0)) {
      loadStage(stageIdx);
    }

    // Interactive Tutorial Step Machine
    if (isTutorial) {
      if (tutorialStep === 1) {
        if ((input.left || input.right || Math.abs(player.steer) > 0.22) && player.pos.z > 210) {
          tutorialStep = 2;
          updateTutorialHud();
          audio.playObjectiveSuccess();
          showCallout('STEP COMPLETE!', 'rgba(38, 240, 255, 0.95)');
        }
      } else if (tutorialStep === 2) {
        if (!player.grounded && player.pos.z > 370 && player.airTime > 0.45) {
          tutorialStep = 3;
          updateTutorialHud();
          audio.playObjectiveSuccess();
          showCallout('CREST LAUNCH!', 'rgba(245, 215, 66, 0.95)');
        }
      } else if (tutorialStep === 3) {
        if (!player.grounded && player.diving) {
          tutorialDiveAccum += dt;
          if (tutorialDiveAccum > 0.3) {
            tutorialStep = 4;
            updateTutorialHud();
            audio.playObjectiveSuccess();
            showCallout('FAST-FALL DIVE!', 'rgba(255, 150, 46, 0.95)');
          }
        }
      } else if (tutorialStep === 4) {
        if (lastLandingGrade === 'Perfect' || lastLandingGrade === 'Good' || (player.grounded && player.pos.z > 870 && player.speed > 105)) {
          tutorialStep = 5;
          updateTutorialHud();
          audio.playBoost();
          showCallout('SLOPE BOOST!', 'rgba(155, 245, 110, 0.95)');
        }
      }
    }

    // Portal Reached Check
    if (player.pos.z >= world.portalZ - 12) {
      if (!isTutorial && encounters.boss && encounters.bossHp > 0) {
        world.setPortal(player.pos.z + 450);
      } else if (isTutorial) {
        state = 'tutorial_modal';
        sparks += 250;
        audio.playObjectiveSuccess();
        elTutorialModal.classList.remove('hidden');
        elHud.classList.add('hidden');
      } else {
        sparks += 100;
        openShop();
      }
    }

    audio.updateSpeed(player.speed, player.diving);

    // High-Speed Dynamic Camera & FOV Warp
    const targetFov = THREE.MathUtils.clamp(70 + (player.speed - 50) * 0.44, 70, 118);
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-8 * dt));
    camera.updateProjectionMatrix();

    const camDist = 10.5 + Math.min(player.speed * 0.022, 4.0);
    const camHeight = player.diving ? 3.0 : 4.2;
    const desiredCam = new THREE.Vector3(
      player.pos.x + player.steer * 1.6,
      player.pos.y + camHeight,
      player.pos.z - camDist
    );

    if (camShake > 0) {
      camShake = Math.max(0, camShake - dt);
      desiredCam.x += (Math.random() - 0.5) * camShake * 3.5;
      desiredCam.y += (Math.random() - 0.5) * camShake * 3.5;
    }

    camera.position.lerp(desiredCam, 1 - Math.exp(-15 * dt));
    camera.lookAt(player.pos.x, player.pos.y + 2.0, player.pos.z + 28);
  } else {
    // Cinematic Live 3D Title Screen Camera showcasing Zoe gliding through the Verdant Expanse
    player.speed = 88;
    player.grounded = false;
    player.diving = false;
    player.pos.z += 48 * dt;
    player.pos.x = world.pathX(player.pos.z) + Math.sin(now * 0.0008) * 16;
    player.pos.y = world.h(player.pos.x, player.pos.z) + 6.0 + Math.cos(now * 0.0014) * 2.5;
    player._animateZoe(dt, -0.08);
    player._updateTrails();

    wallZ = player.pos.z - 300;
    world.setWall(wallZ);

    const orbitAngle = now * 0.00035;
    const orbitDist = 11.5 + Math.sin(now * 0.0006) * 2.5;
    camera.fov = 74;
    camera.updateProjectionMatrix();
    camera.position.set(
      player.pos.x + Math.sin(orbitAngle) * orbitDist,
      player.pos.y + 3.4 + Math.cos(now * 0.0008) * 1.2,
      player.pos.z - Math.cos(orbitAngle) * orbitDist
    );
    camera.lookAt(player.pos.x, player.pos.y + 1.8, player.pos.z + 20);
  }

  world.update(player.pos, dt, camera);

  // Update HUD Speedometer with dynamic heat styling
  const roundedSpeed = Math.round(player.speed);
  elSpeed.textContent = roundedSpeed;
  if (roundedSpeed > 145) {
    elSpeedCluster.className = 'speed-cluster reticle-frame speed-hyper';
  } else if (roundedSpeed > 105) {
    elSpeedCluster.className = 'speed-cluster reticle-frame speed-fast';
  } else {
    elSpeedCluster.className = 'speed-cluster reticle-frame speed-normal';
  }

  elSparks.textContent = sparks;
  const pct = THREE.MathUtils.clamp((player.pos.z / world.portalZ) * 100, 0, 100);
  const wallPct = isTutorial ? 0 : THREE.MathUtils.clamp((wallZ / world.portalZ) * 100, 0, 100);
  elProgressFill.style.width = `${pct}%`;
  elWallMarker.style.width = `${wallPct}%`;
  elEnergyFill.style.width = `${(player.energy / player.maxEnergy) * 100}%`;

  if (!isTutorial && encounters.boss && encounters.bossHp > 0) {
    elBossHpFill.style.width = `${(encounters.bossHp / encounters.bossMaxHp) * 100}%`;
  }

  if (calloutTimer > 0) {
    calloutTimer -= dt;
    if (calloutTimer <= 0) elCallout.style.opacity = '0';
  }

  drawSpeedLines(state === 'playing' ? player.speed : 0, state === 'playing' && player.diving);
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
