// Biome definitions tuned to match Haste: Broken Worlds screenshots.
export const BIOMES = {
  verdant: {
    key: 'verdant',
    name: 'SHARD 01 // VERDANT EXPANSE',
    skyTop: '#3898ec',
    skyHorizon: '#bce8ff',
    fog: '#b5e2fa',
    fogNear: 260,
    fogFar: 1350,
    sunColor: '#fff6dc',
    sunIntensity: 2.8,
    sunDir: [-0.45, 0.78, -0.42],
    hemiSky: '#ccf0ff',
    hemiGround: '#2b7a38',
    hemiIntensity: 1.45,
    terrain: {
      downhill: 0.115,
      big: 46,
      bigScale: 270,
      mid: 15,
      midScale: 105,
      small: 1.8,
      smallScale: 42,
      ridged: false,
      bowl: 24,
    },
    colors: {
      low: '#1f8738',      // Rich emerald valley shade
      mid: '#4ec438',      // Vibrant Haste meadow green
      high: '#82e642',     // Sunlit lime hill crests
      dirt: '#cfa66b',     // Warm sandy path patches
      steep: '#6c8ea8',    // Cool blue-grey rock faces
      steepStart: 0.28,
    },
    cloud: '#ffffff',
  },
  scorched: {
    key: 'scorched',
    name: 'SHARD 02 // SCORCHED DUNES',
    skyTop: '#6ecbc0',
    skyHorizon: '#fae8be',
    fog: '#f4dfaf',
    fogNear: 220,
    fogFar: 1250,
    sunColor: '#fff0cc',
    sunIntensity: 3.0,
    sunDir: [0.48, 0.7, -0.52],
    hemiSky: '#def5ea',
    hemiGround: '#c98238',
    hemiIntensity: 1.25,
    terrain: {
      downhill: 0.11,
      big: 44,
      bigScale: 255,
      mid: 12,
      midScale: 115,
      small: 1.4,
      smallScale: 48,
      ridged: true,
      bowl: 24,
    },
    colors: {
      low: '#d68536',
      mid: '#f0b244',
      high: '#fad26b',
      dirt: '#e0963e',
      steep: '#b8622e',
      steepStart: 0.24,
    },
    cloud: '#fff7e6',
  },
};
