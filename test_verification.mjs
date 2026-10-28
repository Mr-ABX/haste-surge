import assert from 'node:assert';
import * as THREE from 'three';
import { TUTORIAL_STAGE, SHARD_CAMPAIGN, SHOP_ITEMS } from './src/roguelite.js';
import { BIOMES } from './src/biomes.js';
import { World } from './src/world.js';
import { SoundEngine } from './src/audio.js';

console.log('--- RUNNING HASTE SURGE VERIFICATION TESTS ---');

// 1. Verify Campaign and Tutorial Stage Definitions
console.log('Test 1: Campaign and Tutorial definitions...');
assert(TUTORIAL_STAGE.isTutorial === true, 'TUTORIAL_STAGE must have isTutorial true');
assert(TUTORIAL_STAGE.wallSpeed === 0, 'TUTORIAL_STAGE wallSpeed must be 0 (no death wall)');
assert(TUTORIAL_STAGE.length >= 1400, 'TUTORIAL_STAGE must have sufficient length');
assert(SHARD_CAMPAIGN.length >= 6, 'SHARD_CAMPAIGN must have at least 6 stages');
console.log('✓ Test 1 passed.');

// 2. Verify World & Tutorial Terrain Geometry
console.log('Test 2: World Tutorial & Standard Terrain Geometry...');
const mockScene = new THREE.Scene();
const world = new World(mockScene);

// Setup tutorial mode
world.setLevel('verdant', 42, TUTORIAL_STAGE.length, true);
assert(world.isTutorial === true, 'World must be in tutorial mode');
assert(world.tutorialGates.visible === true, 'Tutorial gates must be visible');
assert(world.tutorialGateMeshes.length === 3, 'Must have 3 tutorial guidance arches');

// Check terrain at section 1 (Z = 100): Gentle rolling plain
const hSec1 = world.h(0, 100);
assert(hSec1 > 8 && hSec1 < 20, `Section 1 height ${hSec1} should be gentle plain`);

// Check terrain at section 2 (Z = 390): Peak of first crest launch
const hCrest = world.h(0, 390);
const [gxCrest, gzCrest] = world.grad(0, 390);
assert(hCrest > 30, `Crest peak height ${hCrest} should be elevated`);

// Check terrain drop-off after crest (Z = 450):
const [gxDrop, gzDrop] = world.grad(0, 450);
assert(gzDrop < 0, `Terrain slope after crest ${gzDrop} must be downhill (negative gz)`);

// Check Section 3/4 (Z = 780): Steep downhill dive chute
const [gxChute, gzChute] = world.grad(0, 780);
assert(gzChute < -0.25, `Downhill dive landing chute slope ${gzChute} must be steep downhill (< -0.25)`);

// Check Standard Terrain (non-tutorial)
world.setLevel('verdant', 14.2, 1650, false);
assert(world.isTutorial === false, 'World must be in standard mode');
assert(world.tutorialGates.visible === false, 'Tutorial gates must be hidden in standard mode');
console.log('✓ Test 2 passed.');

// 3. Verify Downhill Slope Landing Judge Logic (Mathematical simulation)
console.log('Test 3: Slope Angle Matching Landing Physics...');
function simulateLanding({ velY, velZ, lgz, airTime, isDiving }) {
  const lgx = 0;
  const lil = 1 / Math.hypot(lgx, 1, lgz);
  const lnx = -lgx * lil, lny = lil, lnz = -lgz * lil;

  const vLen = Math.hypot(0, velY, velZ) || 1;
  const vx = 0, vy = velY / vLen, vz = velZ / vLen;
  const impactDot = Math.abs(vx * lnx + vy * lny + vz * lnz);

  const isDownhill = lgz < -0.04;
  const isSteepDownhill = lgz < -0.14;
  const flightSlope = velY / Math.max(velZ, 1);
  const slopeAngleDiff = Math.abs(flightSlope - lgz);

  let grade = '';
  let boost = 0;

  if (airTime > 0.16) {
    if (isSteepDownhill && (slopeAngleDiff < 0.25 || impactDot < 0.28)) {
      grade = 'Perfect';
      const diveBonus = Math.abs(velY) * 0.32;
      boost = 28 + Math.min(airTime * 18, 30) + diveBonus;
    } else if ((isDownhill && impactDot < 0.52) || (impactDot < 0.44 && Math.abs(velY) < 28)) {
      grade = 'Good';
      boost = 14 + Math.min(airTime * 9, 16);
    } else if (impactDot < 0.65 && Math.abs(velY) < 32 && Math.abs(lgz) <= 0.06) {
      grade = 'Ok';
      boost = -5;
    } else {
      grade = 'Bad';
      boost = -28;
    }
  }
  return { grade, boost, impactDot, slopeAngleDiff };
}

// Case A: Fast-fall dive into steep downhill landing slope (-35%)
// Velocity: plunging downwards matching the slope: velY = -35, velZ = 95
const perfectResult = simulateLanding({
  velY: -35,
  velZ: 95,
  lgz: -0.36,
  airTime: 1.2,
  isDiving: true,
});
assert.strictEqual(perfectResult.grade, 'Perfect', 'Dive onto downhill slope must result in Perfect landing');
assert(perfectResult.boost > 35, `Perfect landing boost ${perfectResult.boost} should be > 35 m/s`);
console.log(`  -> Perfect landing verified: grade=${perfectResult.grade}, boost=+${perfectResult.boost.toFixed(1)} m/s`);

// Case B: Moderate downslope alignment (angle slightly mismatched, impactDot ~0.45)
const goodResult = simulateLanding({
  velY: -35,
  velZ: 80,
  lgz: -0.06,
  airTime: 0.8,
  isDiving: false,
});
assert.strictEqual(goodResult.grade, 'Good', 'Moderate downslope alignment must result in Good landing');
console.log(`  -> Good landing verified: grade=${goodResult.grade}, boost=+${goodResult.boost.toFixed(1)} m/s`);

// Case C: Crashing into flat ground with high downward velocity
const badFlatResult = simulateLanding({
  velY: -55,
  velZ: 70,
  lgz: 0.0,
  airTime: 1.0,
  isDiving: true,
});
assert.strictEqual(badFlatResult.grade, 'Bad', 'Fast-fall dive onto flat ground must result in Bad landing');
console.log(`  -> Bad flat crash verified: grade=${badFlatResult.grade}, penalty=${badFlatResult.boost.toFixed(1)} m/s`);

// Case D: Crashing into an uphill slope (+25%)
const badUphillResult = simulateLanding({
  velY: -20,
  velZ: 85,
  lgz: 0.25,
  airTime: 0.9,
  isDiving: false,
});
assert.strictEqual(badUphillResult.grade, 'Bad', 'Landing into an uphill slope must result in Bad landing');
console.log(`  -> Bad uphill crash verified: grade=${badUphillResult.grade}`);
console.log('✓ Test 3 passed.');

// 4. Verify SoundEngine API surface
console.log('Test 4: SoundEngine API surface...');
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
console.log('✓ Test 4 passed.');

console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
