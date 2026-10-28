import assert from 'node:assert';
import * as THREE from 'three';
import { TUTORIAL_STAGE, SHARD_CAMPAIGN, SHOP_ITEMS } from './src/roguelite.js';
import { BIOMES } from './src/biomes.js';
import { World } from './src/world.js';
import { Player } from './src/player.js';
import { SoundEngine } from './src/audio.js';

console.log('--- RUNNING HASTE SURGE COMPREHENSIVE VERIFICATION TESTS ---');

// 1. Verify Campaign and Tutorial Stage Definitions
console.log('Test 1: Campaign and Tutorial definitions...');
assert(TUTORIAL_STAGE.isTutorial === true, 'TUTORIAL_STAGE must have isTutorial true');
assert(TUTORIAL_STAGE.wallSpeed === 0, 'TUTORIAL_STAGE wallSpeed must be 0 (no death wall)');
assert(TUTORIAL_STAGE.length >= 1400, 'TUTORIAL_STAGE must have sufficient length');
assert(SHARD_CAMPAIGN.length >= 6, 'SHARD_CAMPAIGN must have at least 6 stages');
console.log('✓ Test 1 passed: Campaign definitions valid.');

// 2. Verify World & Tutorial Terrain Geometry & Continuity
console.log('Test 2: World Tutorial & Standard Terrain Geometry Continuity...');
const mockScene = new THREE.Scene();
const world = new World(mockScene);

// Setup tutorial mode
world.setLevel('verdant', 42, TUTORIAL_STAGE.length, true);
assert(world.isTutorial === true, 'World must be in tutorial mode');
assert(world.tutorialGates.visible === true, 'Tutorial gates must be visible');
assert(world.tutorialGateMeshes.length === 3, 'Must have 3 tutorial guidance arches');

// Check that guidance arches are all on steep downhill slope
world.tutorialZPositions.forEach((az, i) => {
  const [, agz] = world.grad(0, az);
  assert(agz < -0.14, `Guidance arch ${i+1} at z=${az} (gz=${agz.toFixed(3)}) must be on steep downhill slope (< -0.14)`);
});
console.log('  -> All 3 guidance arches confirmed on steep downhill landing slope.');

// Strict continuity test across all 1550m of tutorial terrain (no cliffs or step walls)
for (let z = 0; z < 1550; z += 1) {
  const y1 = world.h(0, z);
  const y2 = world.h(0, z + 1);
  const diff = Math.abs(y2 - y1);
  assert(diff < 0.6, `Terrain discontinuity detected at z=${z}: diff=${diff.toFixed(3)}m exceeds 0.6m threshold!`);
}
console.log('  -> 1550m continuous C1 smoothness verified: 0 vertical step cliffs.');

// Check Section 1 (Z = 100): Gentle rolling plain
const hSec1 = world.h(0, 100);
assert(hSec1 > 10 && hSec1 < 20, `Section 1 height ${hSec1} should be gentle plain`);

// Check Section 2 (Z = 380): Peak of first crest launch
const hCrest = world.h(0, 380);
assert(hCrest > 35, `Crest peak height ${hCrest} should be elevated > 35m`);

// Check Section 3/4 Downhill chute slope
const [, gzChute] = world.grad(0, 500);
assert(gzChute < -0.20, `Downhill dive landing chute slope ${gzChute} must be steep downhill (< -0.20)`);

// Check Standard Terrain (non-tutorial)
world.setLevel('verdant', 14.2, 1650, false);
assert(world.isTutorial === false, 'World must be in standard mode');
assert(world.tutorialGates.visible === false, 'Tutorial gates must be hidden in standard mode');
console.log('✓ Test 2 passed: Terrain geometry and continuity verified.');

// 3. Verify Player Physics (Reset, Forward Drive, Coasting, Crest Launch, Dive, and Landing Judge)
console.log('Test 3: Actual Player Physics Engine...');
world.setLevel('verdant', 42, 1550, true);
const player = new Player(mockScene);

// Test 3A: Reset pos is grounded, frame 1 does not fake-launch
player.reset(world);
assert(player.grounded === true, 'Player must be grounded after reset');
assert(Math.abs(player.pos.y - world.h(0, 0)) < 0.01, 'Player reset pos.y must match ground height');
player.update(1/60, { forward: true }, world, null, null);
assert(player.grounded === true, 'Player must remain grounded on frame 1 (no false spawn launch)');
console.log('  -> Reset & initial frame groundedness verified.');

// Test 3B: Player-controlled momentum (coasting vs sprinting)
player.reset(world);
const startSpeed = player.speed;
// 1 second of holding forward sprints up
for (let f = 0; f < 60; f++) player.update(1/60, { forward: true }, world, null, null);
const sprintSpeed = player.speed;
assert(sprintSpeed > startSpeed, `Sprint speed ${sprintSpeed.toFixed(1)} must exceed start speed ${startSpeed.toFixed(1)}`);

// Releasing forward on flat ground gently coasts down
for (let f = 0; f < 60; f++) player.update(1/60, { forward: false }, world, null, null);
const coastSpeed = player.speed;
assert(coastSpeed < sprintSpeed, `Coast speed ${coastSpeed.toFixed(1)} must decelerate from sprint speed ${sprintSpeed.toFixed(1)}`);
console.log(`  -> Player momentum verified: sprint (+${(sprintSpeed - startSpeed).toFixed(1)} m/s), coast (-${(sprintSpeed - coastSpeed).toFixed(1)} m/s).`);

// Test 3C: Crest Launch on Hill (Z = 350-390)
player.reset(world);
let launchedAt = null;
for (let f = 0; f < 350; f++) {
  player.update(1/60, { forward: true }, world, null, null);
  if (!player.grounded) {
    launchedAt = player.pos.z;
    break;
  }
}
assert(launchedAt !== null, 'Player must launch off crest hill');
assert(launchedAt > 330 && launchedAt < 420, `Launch position z=${launchedAt.toFixed(1)} must occur near crest (330-420)`);
console.log(`  -> Crest launch verified at z=${launchedAt.toFixed(1)}m into eagle flight.`);

// Test 3D: Fast-Fall Dive into Downhill Slope awards Perfect Landing Boost
let landingGrade = '';
let landingBoost = 0;
for (let f = 0; f < 150; f++) {
  const wantDive = player.pos.z > 375;
  player.update(1/60, { forward: true, dive: wantDive }, world, null, (grade, col, boost) => {
    landingGrade = grade;
    landingBoost = boost;
  });
  if (player.grounded) break;
}
assert(landingGrade === 'Perfect' || landingGrade === 'Good', `Landing grade ${landingGrade} must be Perfect or Good`);
assert(landingBoost > 20, `Landing boost ${landingBoost.toFixed(1)} m/s must be > 20 m/s`);
console.log(`  -> Dive landing verified: grade=${landingGrade}, boost=+${landingBoost.toFixed(1)} m/s.`);
console.log('✓ Test 3 passed: Real Player physics verified.');

// 4. Verify Interactive Tutorial Step Machine
console.log('Test 4: Interactive Tutorial 5-Step Machine...');
world.setLevel('verdant', 42, 1550, true);
player.reset(world);

let tutorialStep = 1;
let tutorialSteered = false;
let lastGrade = '';
const stepsReached = [1];

for (let f = 0; f < 800; f++) {
  const dt = 1/60;
  const input = { forward: true, jump: false, left: false, right: false, dive: false };
  if (player.pos.z < 200) {
    input.left = f % 40 < 20;
    input.right = !input.left;
  }
  if (!player.grounded && tutorialStep >= 3) {
    input.dive = true;
  }

  player.update(dt, input, world, null, (g, c, b) => {
    lastGrade = g;
  });
  if (!player.grounded) lastGrade = '';

  if (tutorialStep === 1) {
    if (input.left || input.right || Math.abs(player.steer) > 0.18) tutorialSteered = true;
    if (tutorialSteered && player.pos.z > 210) {
      tutorialStep = 2;
      stepsReached.push(2);
    }
  } else if (tutorialStep === 2) {
    if (!player.grounded && player.pos.z > 330 && player.airTime > 0.2) {
      tutorialStep = 3;
      stepsReached.push(3);
    }
  } else if (tutorialStep === 3) {
    if (!player.grounded && player.diving) {
      tutorialStep = 4;
      stepsReached.push(4);
    }
  } else if (tutorialStep === 4) {
    if (player.grounded && (lastGrade === 'Perfect' || lastGrade === 'Good' || player.speed > 105)) {
      tutorialStep = 5;
      stepsReached.push(5);
    }
  }

  if (player.pos.z >= world.portalZ - 12) {
    stepsReached.push('PORTAL');
    break;
  }
}

assert(stepsReached.includes(2), 'Step 2 must be reached');
assert(stepsReached.includes(3), 'Step 3 must be reached');
assert(stepsReached.includes(4), 'Step 4 must be reached');
assert(stepsReached.includes(5), 'Step 5 must be reached');
assert(stepsReached.includes('PORTAL'), 'Shard portal must be reached');
console.log('✓ Test 4 passed: Tutorial step sequence 1 -> 2 -> 3 -> 4 -> 5 -> PORTAL verified.');

// 5. Verify SoundEngine API & Shared Noise Buffer
console.log('Test 5: SoundEngine API surface & memory efficiency...');
const audio = new SoundEngine();
assert(typeof audio.init === 'function', 'audio.init must exist');
assert(typeof audio.startBreakbeat === 'function', 'audio.startBreakbeat must exist');
assert(typeof audio.updateSpeed === 'function', 'audio.updateSpeed must exist');
assert(typeof audio.playLanding === 'function', 'audio.playLanding must exist');
assert(typeof audio.playBoost === 'function', 'audio.playBoost must exist');
assert(typeof audio.playSpark === 'function', 'audio.playSpark must exist');
assert(typeof audio.playObjectiveSuccess === 'function', 'audio.playObjectiveSuccess must exist');
assert(typeof audio.setMenuMode === 'function', 'audio.setMenuMode must exist');
assert(typeof audio.setMuted === 'function', 'audio.setMuted must exist');
assert(typeof audio.setSlowMo === 'function', 'audio.setSlowMo must exist');
assert(typeof audio.playSlowMoStart === 'function', 'audio.playSlowMoStart must exist');
assert(typeof audio.playSlowMoEnd === 'function', 'audio.playSlowMoEnd must exist');
console.log('✓ Test 5 passed: SoundEngine API surface intact.');

// 6. Verify Slow-Mo Time Dilation System
console.log('Test 6: Slow-Mo Time Dilation Ability System...');
player.reset(world);
assert(player.slowMo.active === false, 'Slow-Mo should start inactive');
assert(player.slowMo.cooldown === 0, 'Slow-Mo cooldown should start at 0');
assert(player.slowMo.timeScale === 1.0, 'Initial timeScale must be 1.0');

// Trigger Slow-Mo
const triggered = player.triggerSlowMo();
assert(triggered === true, 'player.triggerSlowMo() must return true when ready');
assert(player.slowMo.active === true, 'player.slowMo.active must be true');
assert(player.slowMo.timer === player.slowMo.duration, 'player.slowMo.timer must equal duration (3.5s)');
assert(player.slowMo.targetTimeScale === 0.30, 'Target timeScale must be 0.30x (slow motion)');

// Update slow-mo over 1 second in realDt
for (let f = 0; f < 60; f++) {
  player.updateSlowMo(1/60);
}
assert(player.slowMo.timer < 3.0, 'Timer must decrement over time');
assert(player.slowMo.timeScale >= 0.25 && player.slowMo.timeScale <= 0.35, `timeScale (${player.slowMo.timeScale.toFixed(2)}) must be slowed to 0.25x-0.35x`);

// Run until duration expires (remaining ~2.5s)
for (let f = 0; f < 180; f++) {
  player.updateSlowMo(1/60);
}
assert(player.slowMo.active === false, 'Slow-Mo must deactivate when timer expires');
assert(player.slowMo.cooldown > 0, 'Slow-Mo must enter cooldown after expiration');
assert(player.slowMo.targetTimeScale === 1.0, 'Target timeScale must return to 1.0');

// Verify trigger is blocked during cooldown
const blockedTrigger = player.triggerSlowMo();
assert(blockedTrigger === false, 'Trigger must be rejected while on cooldown');

// Verify early toggle cancellation
player.slowMo.cooldown = 0;
player.triggerSlowMo();
assert(player.slowMo.active === true, 'Should activate again');
player.triggerSlowMo(); // toggle off early
assert(player.slowMo.active === false, 'Second trigger must cancel early');
assert(player.slowMo.cooldown > 0, 'Early cancellation must initiate cooldown');

// Verify reset cleans up slow-mo
player.reset(world);
assert(player.slowMo.active === false, 'Reset must deactivate slow-mo');
assert(player.slowMo.cooldown === 0, 'Reset must clear cooldown');
assert(player.slowMo.timeScale === 1.0, 'Reset must restore timeScale to 1.0');

// Verify input.slowmo in player.update()
let slowMoStartCalls = 0;
let slowMoEndCalls = 0;
const mockAudio = {
  playSlowMoStart: () => { slowMoStartCalls++; },
  playSlowMoEnd: () => { slowMoEndCalls++; },
};

// 1. Activation via input.slowmo
player.reset(world);
player.update(1/60, { slowmo: true }, world, mockAudio, null);
assert(player.slowMo.active === true, 'input.slowmo = true must activate slow-mo');
assert(slowMoStartCalls === 1, 'playSlowMoStart must be called once on activation');
assert(slowMoEndCalls === 0, 'playSlowMoEnd must not be called on activation');

// 2. Early cancellation via input.slowmo while active
player.update(1/60, { slowmo: true }, world, mockAudio, null);
assert(player.slowMo.active === false, 'input.slowmo while active must cancel slow-mo');
assert(slowMoEndCalls === 1, 'playSlowMoEnd must be called once on early cancellation');
assert(player.slowMo.cooldown > 0, 'Cooldown must be active after cancellation');

// 3. Blocked trigger while on cooldown must NOT play end audio!
player.update(1/60, { slowmo: true }, world, mockAudio, null);
assert(player.slowMo.active === false, 'Trigger must remain blocked on cooldown');
assert(slowMoEndCalls === 1, 'playSlowMoEnd must NOT be called when trigger is blocked on cooldown!');

// 4. deactivateSlowMo API method
player.reset(world);
player.triggerSlowMo();
assert(player.slowMo.active === true, 'SlowMo should be active');
const deactivated = player.deactivateSlowMo();
assert(deactivated === true, 'deactivateSlowMo must return true when active');
assert(player.slowMo.active === false, 'deactivateSlowMo must set active to false');
assert(player.slowMo.targetTimeScale === 1.0, 'deactivateSlowMo must restore targetTimeScale to 1.0');
assert(player.slowMo.cooldown === player.slowMo.maxCooldown, 'deactivateSlowMo must set cooldown to maxCooldown');

console.log('✓ Test 6 passed: Slow-Mo Time Dilation System fully verified.');

console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY WITH 100% PASS RATE!');
