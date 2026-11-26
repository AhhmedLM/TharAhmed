import type { ResourceNode, UnitKind } from './protocol.ts';

export type BiomeKind =
  | 'fertile_plains'
  | 'western_forest'
  | 'northern_peaks'
  | 'eastern_basalt'
  | 'southern_dunes'
  | 'river_basin'
  | 'waterfall_gorge'
  | 'ocean_coast';

export type ClimateKind =
  | 'temperate_clear'
  | 'northern_blizzard'
  | 'desert_sandstorm'
  | 'monsoon_rain';

export interface BiomeMetadata {
  id: BiomeKind;
  nameAr: string;
  continentAr: string;
  subtitleAr: string;
  temperatureC: number;
  humidityPct: number;
  tacticalEffectAr: string;
  speedMultiplier: number;
  harvestBonusKind: 'wood' | 'stone' | 'gold' | 'food' | 'cloth' | 'horses';
  harvestBonusPct: number;
  accentHex: string;
}

export interface ClimateMetadata {
  id: ClimateKind;
  nameAr: string;
  descriptionAr: string;
  skyHex: number;
  fogHex: number;
  fogDensity: number;
  sunHex: number;
  sunIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  speedModifier: number;
  harvestModifier: number;
  badgeHex: string;
  particleType: 'none' | 'snow' | 'sand' | 'rain';
}

export interface WaterfallSite {
  id: string;
  nameAr: string;
  cliffX: number;
  cliffZ: number;
  topY: number;
  bottomY: number;
  flowDirX: number;
  flowDirZ: number;
  width: number;
}

export interface MacroLandmark {
  id: string;
  nameAr: string;
  regionAr: string;
  x: number;
  z: number;
  category: 'capital_zone' | 'pass' | 'oasis' | 'peak' | 'strait' | 'port' | 'forest';
  priority: 1 | 2 | 3;
}

export interface PolylineSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface LandmassLobe {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  rotRad: number;
  continentId: 'nw' | 'ne' | 'sw' | 'se' | 'archipelago';
}

export interface AridPocket {
  x: number;
  z: number;
  radius: number;
  intensity: number;
}

/**
 * Hand-Crafted Regional World of "ثار أحمد" (100 x 100 km, -50,000 .. +50,000 m):
 * - West: البحر المتوسط وساحل الشام والقدس (Mediterranean Sea & Levant Highlands)
 * - North: جبال طوروس وثغر نصيبين والجزيرة الفراتية (Taurus Mountains, Nusaybin & Upper Mesopotamia)
 * - East: دجلة والفرات وسفوح زاغروس وميناء الرصافة/البصرة على الخليج العربي (Mesopotamia, Al-Rusafa/Basra & Arabian Gulf)
 * - Center & South: بادية الشام، مرقاب، حصن القفول، الوادي الأسود، وصحراء النفود نحو تخوم الحجاز
 * Shared 1:1 with the WebGL2 Strategic Map GLSL Shader.
 */
export const WORLD_MAP_SIZE = 100_000;
export const WORLD_HALF_SIZE = WORLD_MAP_SIZE / 2;
export const CHUNK_SIZE = 256;
export const WATER_LEVEL_Y = -0.25;

export function formatWorldCoordKm(meters: number): string {
  const absM = Math.abs(meters);
  if (absM >= 1000) {
    return `${(meters / 1000).toFixed(1)} كم`;
  }
  return `${Math.round(meters)} م`;
}

export function getSectorCoords(x: number, z: number): { sx: number; sz: number } {
  return {
    sx: Math.floor(x / CHUNK_SIZE),
    sz: Math.floor(z / CHUNK_SIZE),
  };
}

/**
 * 21 Hand-Sculpted Landmass Lobes forming the Fertile Crescent, Levant Coast, Mesopotamia & Northern Arabia:
 * - Open Mediterranean Sea on the West (X < -31,000) with Eastern Cyprus / Arwad islands
 * - Open Arabian Gulf & Shatt al-Arab on the Southeast (X > +24,000, Z > +19,000) with Gulf islands
 * - Gulf of Aqaba indentation in the Southwest pointing toward Hejaz (off-map South)
 * Shared 1:1 with the WebGL2 Strategic Map GLSL Shader (max 21 lobes).
 */
export const CONTINENT_LOBES: LandmassLobe[] = [
  // 1. Northern Levant & Taurus Foothills (Antioch -> Aleppo -> Nusaybin -> Mosul)
  { cx: -21500, cz: -27500, rx: 11800, rz: 10200, rotRad: -0.18, continentId: 'nw' },
  { cx: -7500, cz: -29500, rx: 14500, rz: 9600, rotRad: 0.06, continentId: 'nw' },
  { cx: 8500, cz: -28500, rx: 15500, rz: 10400, rotRad: 0.14, continentId: 'ne' },
  { cx: 24500, cz: -23500, rx: 13200, rz: 11800, rotRad: 0.34, continentId: 'ne' },

  // 2. Western Levant Coast & Jerusalem Highlands (Latakia -> Damascus -> Jerusalem -> Gaza)
  { cx: -22500, cz: -12500, rx: 10200, rz: 12500, rotRad: 0.08, continentId: 'nw' },
  { cx: -21800, cz: 3500, rx: 9800, rz: 12800, rotRad: 0.12, continentId: 'sw' },
  { cx: -22200, cz: 17500, rx: 9200, rz: 10800, rotRad: -0.10, continentId: 'sw' },
  { cx: -19500, cz: 29500, rx: 9600, rz: 8200, rotRad: 0.24, continentId: 'sw' },

  // 3. Upper & Middle Mesopotamia (Raqqa -> Deir ez-Zor -> Baghdad -> Zagros)
  { cx: -4500, cz: -15500, rx: 14500, rz: 11500, rotRad: -0.05, continentId: 'nw' },
  { cx: 13500, cz: -13500, rx: 15200, rz: 12400, rotRad: 0.12, continentId: 'ne' },
  { cx: 28500, cz: -8500, rx: 11200, rz: 13500, rotRad: -0.16, continentId: 'ne' },
  { cx: 18500, cz: 1500, rx: 15500, rz: 11800, rotRad: 0.22, continentId: 'se' },
  { cx: 30500, cz: 6200, rx: 9800, rz: 10500, rotRad: -0.28, continentId: 'se' },

  // 4. Syrian Desert Heart ("ثار أحمد": Mirqab, Hisn al-Quful, Black Valley) & Lower Euphrates / Al-Rusafa (Basra)
  { cx: -5500, cz: 3500, rx: 15800, rz: 13800, rotRad: 0.05, continentId: 'sw' },
  { cx: 12500, cz: 12500, rx: 13800, rz: 10500, rotRad: 0.20, continentId: 'se' },
  { cx: 24200, cz: 14200, rx: 7200, rz: 5800, rotRad: -0.35, continentId: 'se' },

  // 5. Southern Syrian Desert & Northern Arabia Frontier (Nafud, Jawf, Tabuk -> Hejaz Edge)
  { cx: -8500, cz: 21500, rx: 15200, rz: 12200, rotRad: -0.08, continentId: 'sw' },
  { cx: 6800, cz: 25500, rx: 12600, rz: 10800, rotRad: 0.16, continentId: 'se' },
  { cx: -5500, cz: 32500, rx: 13500, rz: 6800, rotRad: 0.04, continentId: 'sw' },

  // 6. Offshore Islands: Eastern Cyprus (Mediterranean NW) & Bubiyan/Failaka Pearl Isle (Arabian Gulf SE)
  { cx: -41500, cz: -21500, rx: 5600, rz: 3000, rotRad: -0.38, continentId: 'archipelago' },
  { cx: 34500, cz: 29500, rx: 3800, rz: 2700, rotRad: 0.45, continentId: 'archipelago' },
];

/**
 * 8 Realistic Tectonic Mountain Spines across the Theater of "ثار أحمد":
 * Taurus (North), Zagros (NE/East), Mount Lebanon & Levant Ridge (West),
 * Jerusalem/Moab Highlands (SW), and Black Valley Basalt Escarpment (South-Center).
 */
export const MOUNTAIN_SPINES: PolylineSegment[] = [
  // Taurus Mountains (Northern Frontier above Aleppo & Nusaybin)
  { ax: -27500, az: -33500, bx: -10500, bz: -34800 },
  { ax: -10500, az: -34800, bx: 8500, bz: -33800 },
  // Kurdistan & Zagros Mountains (NE & Eastern Mesopotamia Frontier)
  { ax: 8500, az: -33800, bx: 26500, bz: -27200 },
  { ax: 26500, az: -27200, bx: 34200, bz: -11000 },
  { ax: 34200, az: -11000, bx: 35200, bz: 6200 },
  // Mount Lebanon, Anti-Lebanon & Northern Levant Coastal Range
  { ax: -26800, az: -22500, bx: -24200, bz: -5200 },
  // Jerusalem, Hebron & Moab/Sharah Highlands (East of Jerusalem overlooking Jordan Valley)
  { ax: -24200, az: 5200, bx: -22200, bz: 23800 },
  // Black Valley & Harrah Rocky Basalt Escarpment (South of Mirqab — Mustafa's Ambush Gorge)
  { ax: -13200, az: 13800, bx: -5200, bz: 19200 },
];

export interface CanyonSegment extends PolylineSegment {
  nameAr: string;
  halfWidth: number;
  depth: number;
}

/**
 * Major Tectonic Canyons, Gorges & Desert Wadis (الأخاديد والأودية الصخرية العميقة).
 * Deeply carved winding ravines with steep stratified cliff walls and natural chokepoints.
 */
export const CANYON_SEGMENTS: CanyonSegment[] = [
  // 1. أخدود الوادي الأسود وشعاب حمرين (Black Valley Gorge — NE of Mirqab)
  { ax: 22400, az: -12400, bx: 25400, bz: -9200, nameAr: 'أخدود الوادي الأسود', halfWidth: 58, depth: 5.8 },
  { ax: 25400, az: -9200, bx: 28800, bz: -7100, nameAr: 'شعاب حمرين السحيقة', halfWidth: 64, depth: 6.2 },
  // 2. أخدود وادي القفول والبادية (Desert Wadi Gorge near Hisn al-Quful — visible tactical barrier)
  { ax: 4460, az: 3340, bx: 4980, bz: 3440, nameAr: 'أخدود وادي القفول الصخري', halfWidth: 26, depth: 4.1 },
  { ax: 4980, az: 3440, bx: 5420, bz: 3180, nameAr: 'شعاب القفول الشرقية', halfWidth: 32, depth: 4.4 },
  // 3. وادي حوران والبادية الوسطى (Wadi Hawran Desert Canyon)
  { ax: 1200, az: 4800, bx: 6800, bz: 7400, nameAr: 'أخدود وادي حوران', halfWidth: 52, depth: 4.8 },
  { ax: 6800, az: 7400, bx: 12600, bz: 5200, nameAr: 'وادي البادية الغائر', halfWidth: 48, depth: 4.4 },
  // 4. أخدود الغور الصخري ووادي الأردن (Jordan Rift Escarpment)
  { ax: -23400, az: 5200, bx: -22900, bz: 11200, nameAr: 'أخدود الغور والأردن', halfWidth: 66, depth: 5.4 },
  { ax: -22900, az: 13200, bx: -23500, bz: 19400, nameAr: 'أخدود البحر الميت', halfWidth: 74, depth: 6.0 },
  // 5. خوانق طوروس الشمالية (Taurus Alpine Gorges)
  { ax: -14500, az: -31800, bx: -8200, bz: -33200, nameAr: 'خانق طوروس الغربي', halfWidth: 62, depth: 6.4 },
  { ax: 2400, az: -32200, bx: 8400, bz: -30800, nameAr: 'أخدود طور عبدين', halfWidth: 58, depth: 5.9 },
  // 6. خوانق زاغروس الشرقية (Zagros Eastern Gorges)
  { ax: 27200, az: -22800, bx: 31200, bz: -16500, nameAr: 'خوانق زاغروس الشمالية', halfWidth: 68, depth: 6.5 },
  // 7. أخاديد حسمى وتبوك (Southern Sandstone Canyons)
  { ax: -16500, az: 26200, bx: -11200, bz: 30400, nameAr: 'أخاديد حسمى الرملية', halfWidth: 62, depth: 5.1 },
];

export interface MesaFormation {
  x: number;
  z: number;
  rx: number;
  rz: number;
  rotRad: number;
  height: number;
  tiers: number;
  nameAr: string;
}

/**
 * Stepped Natural Plateaus & Defensive Mesas (الهضاب المتدرجة والربى الحصينة).
 * Flat-topped terraced elevations ideal for hilltop fortresses & commanding high ground.
 */
export const MESA_FORMATIONS: MesaFormation[] = [
  // Scenic defensive mesas near Hisn al-Quful (player starting frontier)
  { x: 4610, z: 3045, rx: 46, rz: 36, rotRad: 0.35, height: 5.2, tiers: 2, nameAr: 'هضبة الرصد الشمالية' },
  { x: 5040, z: 3020, rx: 52, rz: 40, rotRad: -0.28, height: 5.8, tiers: 2, nameAr: 'هضبة الحصن الشرقية' },
  { x: 4655, z: 3440, rx: 38, rz: 30, rotRad: 0.62, height: 4.5, tiers: 2, nameAr: 'نتوء هضبة القوافل' },
  // Regional Strategic Mesas across Mesopotamia, Syria & the Desert
  { x: 17960, z: -3040, rx: 68, rz: 52, rotRad: 0.22, height: 5.6, tiers: 2, nameAr: 'هضبة طلائع مرقاب' },
  { x: 24520, z: -10040, rx: 82, rz: 58, rotRad: -0.45, height: 7.4, tiers: 3, nameAr: 'هضبة جرف الوادي الأسود' },
  { x: -20940, z: -2040, rx: 74, rz: 54, rotRad: 0.18, height: 6.2, tiers: 2, nameAr: 'هضبة قاسيون المطلة' },
  { x: -17550, z: -24460, rx: 66, rz: 54, rotRad: -0.32, height: 6.4, tiers: 2, nameAr: 'هضبة قلعة الشهباء' },
  { x: -25720, z: 13540, rx: 70, rz: 50, rotRad: 0.4, height: 6.6, tiers: 2, nameAr: 'هضبة جبل الزيتون والقدس' },
  { x: -11520, z: -4460, rx: 64, rz: 48, rotRad: -0.2, height: 5.8, tiers: 2, nameAr: 'هضبة قلعة تدمر' },
  { x: 1520, z: -27460, rx: 72, rz: 56, rotRad: 0.15, height: 6.8, tiers: 3, nameAr: 'هضبة ثغر نصيبين' },
  { x: -3120, z: 26520, rx: 68, rz: 52, rotRad: 0.5, height: 5.6, tiers: 2, nameAr: 'هضبة مارد والجوف' },
];


/**
 * 6 Broad Realistic Arid Desert & Semi-Arid Steppe Basins matching real Middle East satellite geography:
 * Badiyat al-Sham, Central/Southern Iraq, Northern Syrian/Jazira Steppe, Great Nafud, Dahna/Samman & Tabuk/Jordan.
 * Leaves only the Mediterranean Levant coast, northern Taurus/Kurdistan highlands, narrow river ribbons & oases green!
 */
export const ARID_POCKETS: AridPocket[] = [
  { x: -3500, z: 8500, radius: 22500, intensity: 0.96 },   // بادية الشام الكبرى والأنبار الغربية
  { x: -10500, z: 30000, radius: 22000, intensity: 1.00 }, // صحراء النفود الكبرى ودرب الحجاز
  { x: 11500, z: 25500, radius: 22000, intensity: 0.98 },  // صحراء الدهناء والصمّان وبادية البصرة والكويت
  { x: 13800, z: 4200, radius: 20500, intensity: 0.90 },   // بادية السماوة وسهول العراق الوسطى والجنوبية
  { x: -3800, z: -12500, radius: 20000, intensity: 0.80 }, // سهوب الجزيرة الفراتية وشرق الشام (الرقة - تدمر - دير الزور)
  { x: -19500, z: 24500, radius: 18500, intensity: 0.96 }, // بادية الأردن وحسمى وتبوك
];

/**
 * 4 Highland Waterfalls feeding the Euphrates, Tigris, Great Zab, and Jordan headwaters.
 */
export const WATERFALL_SITES: WaterfallSite[] = [
  {
    id: 'wf_taurus_euphrates',
    nameAr: 'شلالات منابع الفرات (طوروس)',
    cliffX: -11200,
    cliffZ: -33200,
    topY: 14.5,
    bottomY: -0.25,
    flowDirX: 0.38,
    flowDirZ: 0.92,
    width: 16.0,
  },
  {
    id: 'wf_nusaybin_tigris',
    nameAr: 'شلالات طور عبدين (شمال نصيبين)',
    cliffX: 4600,
    cliffZ: -33000,
    topY: 14.2,
    bottomY: -0.25,
    flowDirX: 0.54,
    flowDirZ: 0.84,
    width: 15.0,
  },
  {
    id: 'wf_zagros_zab',
    nameAr: 'شلالات زاغروس والزاب الكبير',
    cliffX: 23400,
    cliffZ: -27400,
    topY: 14.4,
    bottomY: -0.25,
    flowDirX: -0.78,
    flowDirZ: 0.62,
    width: 16.0,
  },
  {
    id: 'wf_hermon_jordan',
    nameAr: 'شلالات جبل الشيخ وبانياس',
    cliffX: -23200,
    cliffZ: -4600,
    topY: 13.6,
    bottomY: -0.25,
    flowDirX: -0.14,
    flowDirZ: 0.99,
    width: 14.5,
  },
];

/**
 * 6 Authentic River Systems of Mesopotamia & the Levant (22 segments total, fits uRiverSegments[24]):
 * 1. Euphrates (الفرات) -> Shatt al-Arab (شط العرب) into the Arabian Gulf
 * 2. Tigris (دجلة) converging with Euphrates at Al-Qurna north of Al-Rusafa (Basra)
 * 3. Khabur (الخابور) flowing past Nusaybin into the Euphrates
 * 4. Great Zab (الزاب الكبير) from Zagros into the Tigris
 * 5. Orontes (العاصي) in Northern Levant to the Mediterranean
 * 6. Jordan (الأردن) from Mt. Hermon past Jerusalem's eastern valley
 */
export const RIVER_SEGMENTS: PolylineSegment[] = [
  // 1. نهر الفرات وشط العرب (Euphrates -> Shatt al-Arab -> Arabian Gulf) [7 segments]
  { ax: -11200, az: -33200, bx: -6800, bz: -21500 },
  { ax: -6800, az: -21500, bx: 3500, bz: -14200 },
  { ax: 3500, az: -14200, bx: 12200, bz: -4500 },
  { ax: 12200, az: -4500, bx: 16800, bz: 4500 },
  { ax: 16800, az: 4500, bx: 23200, bz: 11200 },
  { ax: 23200, az: 11200, bx: 26400, bz: 14200 },
  { ax: 26400, az: 14200, bx: 29800, bz: 19800 },

  // 2. نهر دجلة (Tigris River -> Qurna Confluence) [6 segments]
  { ax: 4600, az: -33000, bx: 12400, bz: -23200 },
  { ax: 12400, az: -23200, bx: 17400, bz: -12400 },
  { ax: 17400, az: -12400, bx: 19800, bz: -2600 },
  { ax: 19800, az: -2600, bx: 24200, bz: 6200 },
  { ax: 24200, az: 6200, bx: 26400, bz: 14200 },
  // Eastern Shatt al-Arab / Karun delta branch into Gulf
  { ax: 29800, az: 8500, bx: 27800, bz: 16500 },

  // 3. نهر الخابور (Khabur River — Nusaybin frontier) [2 segments]
  { ax: 1400, az: -31200, bx: 800, bz: -22200 },
  { ax: 800, az: -22200, bx: 3500, bz: -14200 },

  // 4. نهر الزاب الكبير (Great Zab — Zagros to Tigris) [2 segments]
  { ax: 23400, az: -27400, bx: 17800, bz: -23800 },
  { ax: 17800, az: -23800, bx: 14500, bz: -18600 },

  // 5. نهر العاصي (Orontes River — Homs/Hama -> Antioch -> Mediterranean) [2 segments]
  { ax: -23200, az: -11500, bx: -24200, bz: -20200 },
  { ax: -24200, az: -20200, bx: -29400, bz: -26200 },

  // 6. نهر الأردن (Jordan River — Hermon -> Tiberias -> East of Jerusalem -> Dead Sea) [3 segments]
  { ax: -23200, az: -4600, bx: -23800, bz: 3400 },
  { ax: -23800, az: 3400, bx: -23200, bz: 12200 },
  { ax: -23200, az: 12200, bx: -23600, bz: 19600 },
];

/**
 * 40 Audited Kingdom, Fortress & Oasis Plateaus across the 1080 AD Theater of "ثار أحمد".
 * First 6 are the Primary Theater Capitals & Provinces (No Baghdad, No Karak):
 * 0: مرقاب (Mirqab — Capital of the Sindhi State on the Tigris, where Baghdad would be)
 * 1: الرصافة / البصرة (Al-Rusafa — Separate Southern Gulf Province)
 * 2: القدس (Jerusalem — Western Coastal Crusader Stronghold, coastal strip only)
 * 3: نصيبين (Nusaybin — Northern Frontier Province of the Sindhi State)
 * 4: حصن القفول (Hisn al-Quful — Desert/Hills Tribal Stronghold West of Mirqab)
 * 5: دمشق (Damascus — Inland Syria Province of the Sindhi State)
 */
export type CityUrbanStyle =
  | 'iraqi_mesopotamian'
  | 'levantine_shami'
  | 'hejazi_arabian'
  | 'bedouin_nomadic';

export const SPAWN_PLATEAUS: Array<{
  x: number;
  z: number;
  radius: number;
  targetElevation: number;
  continentNameAr: string;
  urbanStyle: CityUrbanStyle;
  populationEst: number;
  walled?: boolean;
}> = [
  // Primary 6 Capitals & Provinces (Indices 0..5)
  { x: 18200, z: -2800, radius: 112, targetElevation: 2.3, continentNameAr: 'مرقاب (عاصمة الدولة السندية)', urbanStyle: 'iraqi_mesopotamian', populationEst: 48500, walled: true },
  { x: 25200, z: 14800, radius: 106, targetElevation: 2.0, continentNameAr: 'الرصافة — البصرة (ولاية شط العرب)', urbanStyle: 'iraqi_mesopotamian', populationEst: 32800, walled: true },
  { x: -26000, z: 13800, radius: 102, targetElevation: 2.9, continentNameAr: 'القدس (حامية الساحل الغربي)', urbanStyle: 'levantine_shami', populationEst: 24600, walled: true },
  { x: 1800, z: -27200, radius: 90, targetElevation: 2.7, continentNameAr: 'نصيبين (ولاية الثغر الشمالي)', urbanStyle: 'iraqi_mesopotamian', populationEst: 16800, walled: true },
  { x: 4800, z: 3200, radius: 64, targetElevation: 2.5, continentNameAr: 'حصن القفول (معقل البادية والقبائل)', urbanStyle: 'bedouin_nomadic', populationEst: 5400, walled: false },
  { x: -21200, z: -1800, radius: 108, targetElevation: 2.5, continentNameAr: 'دمشق (ولاية الشام الداخلي)', urbanStyle: 'levantine_shami', populationEst: 34200, walled: true },

  // Western Levant Coast & Inland Syria (Indices 6..15)
  { x: -17800, z: -24200, radius: 104, targetElevation: 2.6, continentNameAr: 'حلب (ولاية الشام الشمالي)', urbanStyle: 'levantine_shami', populationEst: 28400, walled: true },
  { x: -27800, z: -25200, radius: 90, targetElevation: 2.2, continentNameAr: 'أنطاكية (ثغر الساحل الشمالي)', urbanStyle: 'levantine_shami', populationEst: 19200, walled: true },
  { x: -22200, z: -11200, radius: 88, targetElevation: 2.4, continentNameAr: 'حمص (ولاية الشام الأوسط)', urbanStyle: 'levantine_shami', populationEst: 14500, walled: true },
  { x: -22400, z: -17800, radius: 60, targetElevation: 2.4, continentNameAr: 'حماة (ضفاف العاصي)', urbanStyle: 'levantine_shami', populationEst: 13200, walled: true },
  { x: -27600, z: 6200, radius: 88, targetElevation: 2.0, continentNameAr: 'عكا (ثغر الساحل الغربي)', urbanStyle: 'levantine_shami', populationEst: 11800, walled: true },
  { x: -27600, z: -8500, radius: 60, targetElevation: 2.0, continentNameAr: 'طرابلس الشام (الساحل الأخضر)', urbanStyle: 'levantine_shami', populationEst: 12400, walled: true },
  { x: -21800, z: 14500, radius: 60, targetElevation: 2.7, continentNameAr: 'عمّان — البلقاء (مشارف الأردن)', urbanStyle: 'levantine_shami', populationEst: 9600, walled: false },
  { x: -27600, z: 19200, radius: 58, targetElevation: 2.0, continentNameAr: 'غزة (بوابة الساحل الجنوبي)', urbanStyle: 'levantine_shami', populationEst: 10800, walled: true },
  { x: -11800, z: -4200, radius: 86, targetElevation: 2.4, continentNameAr: 'تدمر (واحة بادية الشام)', urbanStyle: 'bedouin_nomadic', populationEst: 6200, walled: false },
  { x: -5500, z: 6200, radius: 58, targetElevation: 2.5, continentNameAr: 'واحة الحماد (ممر الشام ومرقاب)', urbanStyle: 'bedouin_nomadic', populationEst: 3800, walled: false },

  // Upper Mesopotamia & Northern Frontier Province (Indices 16..23)
  { x: 11200, z: -22800, radius: 92, targetElevation: 2.5, continentNameAr: 'الموصل (ضفة دجلة العليا)', urbanStyle: 'iraqi_mesopotamian', populationEst: 22500, walled: true },
  { x: -6400, z: -20600, radius: 88, targetElevation: 2.3, continentNameAr: 'الرقة (حوض الفرات الشمالي)', urbanStyle: 'iraqi_mesopotamian', populationEst: 13600, walled: true },
  { x: 4200, z: -13500, radius: 60, targetElevation: 2.3, continentNameAr: 'دير الزور (معبر الفرات)', urbanStyle: 'iraqi_mesopotamian', populationEst: 9800, walled: false },
  { x: 5600, z: -22800, radius: 58, targetElevation: 2.8, continentNameAr: 'سنجار (هضبة الجزيرة)', urbanStyle: 'iraqi_mesopotamian', populationEst: 8400, walled: true },
  { x: -7200, z: -28200, radius: 58, targetElevation: 2.6, continentNameAr: 'حران (تخوم طوروس)', urbanStyle: 'levantine_shami', populationEst: 11200, walled: true },
  { x: -1600, z: -31500, radius: 60, targetElevation: 2.9, continentNameAr: 'آمد — ديار بكر (المنابع الشمالية)', urbanStyle: 'levantine_shami', populationEst: 16400, walled: true },
  { x: 18500, z: -21500, radius: 62, targetElevation: 2.6, continentNameAr: 'أربيل (سفوح زاغروس)', urbanStyle: 'iraqi_mesopotamian', populationEst: 15200, walled: true },
  { x: 16200, z: -11800, radius: 84, targetElevation: 2.3, continentNameAr: 'تكريت (رباط دجلة الأوسط)', urbanStyle: 'iraqi_mesopotamian', populationEst: 12800, walled: true },

  // Central & Lower Iraq & Arabian Gulf (Indices 24..31)
  { x: 10800, z: -4200, radius: 60, targetElevation: 2.3, continentNameAr: 'الأنبار (ثغر الفرات الأوسط)', urbanStyle: 'iraqi_mesopotamian', populationEst: 11900, walled: true },
  { x: 15800, z: 5200, radius: 94, targetElevation: 2.2, continentNameAr: 'الكوفة (مشارف البادية والفرات)', urbanStyle: 'iraqi_mesopotamian', populationEst: 18400, walled: true },
  { x: 23200, z: 5800, radius: 60, targetElevation: 2.2, continentNameAr: 'واسط (بين دجلة والأهوار)', urbanStyle: 'iraqi_mesopotamian', populationEst: 14100, walled: true },
  { x: 14600, z: 1800, radius: 60, targetElevation: 2.2, continentNameAr: 'كربلاء (طريق عين التمر)', urbanStyle: 'iraqi_mesopotamian', populationEst: 13500, walled: false },
  { x: 21500, z: 11800, radius: 58, targetElevation: 2.1, continentNameAr: 'أهوار الجنوب (ملتقى النهرين)', urbanStyle: 'iraqi_mesopotamian', populationEst: 7600, walled: false },
  { x: 17800, z: 12200, radius: 58, targetElevation: 2.2, continentNameAr: 'السماوة (بوابة البادية الشرقية)', urbanStyle: 'iraqi_mesopotamian', populationEst: 8900, walled: false },
  { x: 28200, z: -5500, radius: 58, targetElevation: 2.6, continentNameAr: 'خانقين (ممر زاغروس الشرقي)', urbanStyle: 'iraqi_mesopotamian', populationEst: 7400, walled: false },
  { x: 24500, z: 18200, radius: 58, targetElevation: 2.0, continentNameAr: 'الأبلة — كاظمة (ساحل الخليج)', urbanStyle: 'iraqi_mesopotamian', populationEst: 9200, walled: false },

  // Black Valley, Desert Passes, Southern Hejaz Frontier & Islands (Indices 32..39)
  { x: 24800, z: -9800, radius: 80, targetElevation: 2.8, continentNameAr: 'سجن الوادي الأسود (شعاب حمرين)', urbanStyle: 'iraqi_mesopotamian', populationEst: 4200, walled: true },
  { x: 10200, z: 3200, radius: 58, targetElevation: 2.5, continentNameAr: 'شعاب التلال الرملية (درب القفول)', urbanStyle: 'bedouin_nomadic', populationEst: 3600, walled: false },
  { x: 9200, z: 13800, radius: 58, targetElevation: 2.3, continentNameAr: 'آبار القوافل الشرقية (طريق الرصافة)', urbanStyle: 'bedouin_nomadic', populationEst: 3900, walled: false },
  { x: -3400, z: 26800, radius: 80, targetElevation: 2.4, continentNameAr: 'دومة الجندل — الجوف (تخوم الحجاز)', urbanStyle: 'hejazi_arabian', populationEst: 6800, walled: true },
  { x: -18200, z: 28500, radius: 60, targetElevation: 2.4, continentNameAr: 'تبوك (بوابة ولاية الحجاز)', urbanStyle: 'hejazi_arabian', populationEst: 8400, walled: true },
  { x: -12500, z: 33200, radius: 60, targetElevation: 2.3, continentNameAr: 'تيماء (تخوم النفود والحجاز)', urbanStyle: 'hejazi_arabian', populationEst: 7200, walled: true },
  { x: 7500, z: 25800, radius: 58, targetElevation: 2.3, continentNameAr: 'حفر الباطن — الصمّان (درب الخليج)', urbanStyle: 'bedouin_nomadic', populationEst: 4400, walled: false },
  { x: -41200, z: -21500, radius: 58, targetElevation: 2.1, continentNameAr: 'جزيرة المتوسط الشرقية (ثغر البحر)', urbanStyle: 'levantine_shami', populationEst: 9100, walled: true },
];

/**
 * Named Geographical Landmarks across the 1080 AD Theater of "ثار أحمد" (Spoiler-free)
 */
export const MACRO_LANDMARKS: MacroLandmark[] = [
  {
    id: 'lm_mirqab',
    nameAr: 'مرقاب (عاصمة الدولة السندية)',
    regionAr: 'حوض دجلة الأوسط وقلب السلطنة',
    x: 18200,
    z: -2800,
    category: 'capital_zone',
    priority: 1,
  },
  {
    id: 'lm_rusafa_basra',
    nameAr: 'الرصافة (البصرة)',
    regionAr: 'ولاية شط العرب وميناء الخليج',
    x: 25200,
    z: 14800,
    category: 'port',
    priority: 1,
  },
  {
    id: 'lm_jerusalem',
    nameAr: 'القدس الشريف',
    regionAr: 'مركز الحامية الصليبية بالساحل الغربي',
    x: -26000,
    z: 13800,
    category: 'capital_zone',
    priority: 1,
  },
  {
    id: 'lm_nusaybin',
    nameAr: 'نصيبين (ولاية الشمال)',
    regionAr: 'ثغر الجزيرة العليا وسفوح طوروس',
    x: 1800,
    z: -27200,
    category: 'pass',
    priority: 1,
  },
  {
    id: 'lm_hisn_alquful',
    nameAr: 'حصن القفول',
    regionAr: 'معقل البادية والتلال الرملية غرب مرقاب',
    x: 4800,
    z: 3200,
    category: 'capital_zone',
    priority: 1,
  },
  {
    id: 'lm_black_valley',
    nameAr: 'سجن الوادي الأسود',
    regionAr: 'الشعاب الوعرة شمال شرق مرقاب',
    x: 24800,
    z: -9800,
    category: 'peak',
    priority: 1,
  },
  {
    id: 'lm_damascus',
    nameAr: 'دمشق وغوطة الشام',
    regionAr: 'حاضرة ولاية الشام الداخلي',
    x: -21200,
    z: -1800,
    category: 'capital_zone',
    priority: 2,
  },
  {
    id: 'lm_aleppo',
    nameAr: 'حلب الشهباء',
    regionAr: 'قلعة الشام الشمالي',
    x: -17800,
    z: -24200,
    category: 'capital_zone',
    priority: 2,
  },
  {
    id: 'lm_mosul',
    nameAr: 'الموصل والجزيرة',
    regionAr: 'معبر دجلة الأعلى نحو نصيبين',
    x: 11200,
    z: -22800,
    category: 'oasis',
    priority: 2,
  },
  {
    id: 'lm_hejaz_gate',
    nameAr: 'درب ولاية الحجاز',
    regionAr: 'تخوم النفود وطريق القوافل الجنوبي',
    x: -11500,
    z: 32500,
    category: 'oasis',
    priority: 2,
  },
  {
    id: 'lm_mediterranean',
    nameAr: 'البحر المتوسط وثغر عكا',
    regionAr: 'الشريط الساحلي الغربي لبلاد الشام',
    x: -33500,
    z: 4500,
    category: 'strait',
    priority: 2,
  },
  {
    id: 'lm_arabian_gulf',
    nameAr: 'الخليج العربي وشط العرب',
    regionAr: 'الممر البحري الشرقي لولاية الرصافة',
    x: 33500,
    z: 24500,
    category: 'strait',
    priority: 2,
  },
  {
    id: 'lm_forest_nusaybin',
    nameAr: 'غابات نصيبين وطور عبدين',
    regionAr: 'أحراش البلوط والصنوبر الشمالية',
    x: -7000,
    z: -24400,
    category: 'forest',
    priority: 2,
  },
  {
    id: 'lm_forest_levant',
    nameAr: 'غابات الأرز والساحل الشامي',
    regionAr: 'أحراش جبال الشام الغربية',
    x: -23600,
    z: -18600,
    category: 'forest',
    priority: 2,
  },
  {
    id: 'lm_forest_zagros',
    nameAr: 'غابات سفوح زاغروس والزاب',
    regionAr: 'أحراش الشمال الشرقي قرب الوادي الأسود',
    x: 20500,
    z: -18500,
    category: 'forest',
    priority: 2,
  },
  {
    id: 'lm_forest_gilead',
    nameAr: 'غابات عجلون ومرتفعات الأردن',
    regionAr: 'أحراش البلوط غرب دمشق والبلقاء',
    x: -26000,
    z: -500,
    category: 'forest',
    priority: 3,
  },
];

/**
 * Strategic Stone Bridges positioned at exact audited meandered crossings of the Euphrates, Tigris, Khabur, Orontes & Jordan Rivers
 */
export const BRIDGE_CROSSINGS: Array<{
  x: number;
  z: number;
  rotationY: number;
  length: number;
}> = [
  { x: -6970, z: -21620, rotationY: 0.92, length: 34 },  // جسر الرقة (نهر الفرات)
  { x: 3500, z: -14410, rotationY: 0.86, length: 34 },   // جسر دير الزور (نهر الفرات)
  { x: 11938, z: -4852, rotationY: 0.72, length: 34 },   // جسر الأنبار (نهر الفرات)
  { x: 16726, z: 4626, rotationY: 0.64, length: 34 },    // جسر الكوفة (نهر الفرات)
  { x: 23000, z: 11010, rotationY: 0.78, length: 34 },   // جسر الأهوار الغربي (الفرات)
  { x: 12680, z: -22880, rotationY: 0.96, length: 34 },  // جسر الموصل (نهر دجلة)
  { x: 19970, z: -2240, rotationY: 0.32, length: 34 },   // جسر مرقاب الكبير (نهر دجلة)
  { x: 24468, z: 6552, rotationY: 0.44, length: 34 },    // جسر واسط (نهر دجلة)
  { x: 1070, z: -22130, rotationY: 0.14, length: 34 },   // جسر الخابور (طريق نصيبين)
  { x: -23840, z: 3288, rotationY: 0.08, length: 34 },   // جسر نهر الأردن الشمالي
  { x: -23010, z: 12170, rotationY: 0.06, length: 34 },  // جسر أريحا (طريق القدس)
  { x: -24238, z: -20338, rotationY: 0.16, length: 34 }, // جسر العاصي (حماة - أنطاكية)
];

/**
 * Natural Winding Caravan & Royal Highways (+45% march speed)
 * Connecting Al-Rusafa (Basra), Mirqab (Tigris), Hisn al-Quful, Black Valley, Jerusalem, Damascus, Aleppo, Nusaybin & the Hejaz Trail.
 */
export const STRATEGIC_ROADS: Array<{
  ax: number;
  az: number;
  bx: number;
  bz: number;
}> = [
  // 1. المحور الملكي للسلطنة والبادية: الرصافة (البصرة) <-> الكوفة <-> حصن القفول <-> واحة الحماد <-> القدس
  { ax: 25200, az: 14800, bx: 23000, bz: 11010 },
  { ax: 23000, az: 11010, bx: 17800, bz: 12200 },
  { ax: 17800, az: 12200, bx: 9200, bz: 13800 },
  { ax: 9200, az: 13800, bx: 4800, bz: 3200 },
  { ax: 4800, az: 3200, bx: 10200, bz: 3200 },
  { ax: 10200, az: 3200, bx: 14600, bz: 1800 },
  { ax: 14600, az: 1800, bx: 18200, bz: -2800 },
  { ax: 4800, az: 3200, bx: -5500, bz: 6200 },
  { ax: -5500, az: 6200, bx: -21800, bz: 14500 },
  { ax: -21800, az: 14500, bx: -23010, bz: 12170 },
  { ax: -23010, az: 12170, bx: -26000, bz: 13800 },
  { ax: -26000, az: 13800, bx: -27600, bz: 19200 },

  // 2. محور الشام والجزيرة ونصيبين (حصن القفول <-> تدمر <-> دمشق / دير الزور <-> نصيبين <-> الموصل)
  { ax: 4800, az: 3200, bx: -11800, bz: -4200 },
  { ax: -11800, az: -4200, bx: -21200, bz: -1800 },
  { ax: -11800, az: -4200, bx: 3500, bz: -14410 },
  { ax: 3500, az: -14410, bx: 1070, bz: -22130 },
  { ax: 1070, az: -22130, bx: 1800, bz: -27200 },
  { ax: 1800, az: -27200, bx: -1600, bz: -31500 },
  { ax: 1800, az: -27200, bx: -7200, bz: -28200 },
  { ax: 1800, az: -27200, bx: 5600, bz: -22800 },
  { ax: 5600, az: -22800, bx: 12680, bz: -22880 },

  // 3. محور دجلة الملكي (الموصل <-> تكريت <-> مرقاب <-> واسط <-> الرصافة) + فرع سجن الوادي الأسود
  { ax: 12680, az: -22880, bx: 18500, bz: -21500 },
  { ax: 12680, az: -22880, bx: 16200, bz: -11800 },
  { ax: 16200, az: -11800, bx: 18200, bz: -2800 },
  { ax: 18200, az: -2800, bx: 19970, bz: -2240 },
  { ax: 19970, az: -2240, bx: 24800, bz: -9800 },
  { ax: 24800, az: -9800, bx: 28200, bz: -5500 },
  { ax: 19970, az: -2240, bx: 28200, bz: -5500 },
  { ax: 19970, az: -2240, bx: 24468, bz: 6552 },
  { ax: 24468, az: 6552, bx: 25200, bz: 14800 },
  { ax: 25200, az: 14800, bx: 24500, bz: 18200 },

  // 4. محور الفرات الأوسط (حلب <-> الرقة <-> دير الزور <-> الأنبار <-> مرقاب <-> الكوفة <-> السماوة)
  { ax: -17800, az: -24200, bx: -6970, bz: -21620 },
  { ax: -6970, az: -21620, bx: 3500, bz: -14410 },
  { ax: 3500, az: -14410, bx: 11938, bz: -4852 },
  { ax: 11938, az: -4852, bx: 18200, bz: -2800 },
  { ax: 11938, az: -4852, bx: 14600, bz: 1800 },
  { ax: 14600, az: 1800, bx: 16726, bz: 4626 },
  { ax: 16726, az: 4626, bx: 17800, bz: 12200 },
  { ax: 4800, az: 3200, bx: 15800, bz: 5200 },

  // 5. محور بلاد الشام الساحلي والداخلي (أنطاكية <-> حلب <-> حماة <-> حمص <-> دمشق <-> الأردن <-> القدس <-> عمّان)
  { ax: -27800, az: -25200, bx: -17800, bz: -24200 },
  { ax: -27800, az: -25200, bx: -24238, bz: -20338 },
  { ax: -24238, az: -20338, bx: -22400, bz: -17800 },
  { ax: -22400, az: -17800, bx: -22200, bz: -11200 },
  { ax: -22200, az: -11200, bx: -27600, bz: -8500 },
  { ax: -22200, az: -11200, bx: -21200, bz: -1800 },
  { ax: -21200, az: -1800, bx: -23840, bz: 3288 },
  { ax: -23840, az: 3288, bx: -27600, bz: 6200 },
  { ax: -23840, az: 3288, bx: -23010, bz: 12170 },
  { ax: -23010, az: 12170, bx: -21800, bz: 14500 },

  // 6. دروب البادية الجنوبية وطريق قوافل ولاية الحجاز
  { ax: -5500, az: 6200, bx: -3400, bz: 26800 },
  { ax: -3400, az: 26800, bx: -12500, bz: 33200 },
  { ax: -21800, az: 14500, bx: -18200, bz: 28500 },
  { ax: -18200, az: 28500, bx: -12500, bz: 33200 },
  { ax: -3400, az: 26800, bx: 7500, bz: 25800 },
  { ax: 7500, az: 25800, bx: 24500, bz: 18200 },
];

export const BIOME_SPECS: Record<BiomeKind, BiomeMetadata> = {
  fertile_plains: {
    id: 'fertile_plains',
    nameAr: 'سهول الهلال الخصيب والمروج',
    continentAr: 'أراضي الشام والجزيرة والرافدين',
    subtitleAr: 'سهول زراعية خصبة ومروج واسعة تربط حواضر الشام بالرافدين وطرق القوافل',
    temperatureC: 23,
    humidityPct: 58,
    tacticalEffectAr: '+20% إنتاج المؤن وسرعة مثالية لحركة الجيوش (100%)',
    speedMultiplier: 1.0,
    harvestBonusKind: 'food',
    harvestBonusPct: 20,
    accentHex: '#22c55e',
  },
  western_forest: {
    id: 'western_forest',
    nameAr: 'غابات الأرز والبلوط والأحراش',
    continentAr: 'غابات الشام ونصيبين وسفوح زاغروس',
    subtitleAr: 'غابات كثيفة من الأرز والبلوط والصنوبر تغطي مرتفعات الشام وشمال نصيبين، غنية بالأخشاب ومكمناً لقطاع الطرق',
    temperatureC: 17,
    humidityPct: 78,
    tacticalEffectAr: '+35% قطع الأخشاب في الغابات وتستتر فيها عصابات قطاع الطرق',
    speedMultiplier: 0.9,
    harvestBonusKind: 'wood',
    harvestBonusPct: 35,
    accentHex: '#10b981',
  },
  northern_peaks: {
    id: 'northern_peaks',
    nameAr: 'قمم طوروس وزاغروس الثلجية',
    continentAr: 'السلاسل الجبلية الشمالية والشرقية',
    subtitleAr: 'سلاسل جبلية شامخة تتوج قممها بالثلوج وتغذي منابع دجلة والفرات وتحصن ثغور الشمال',
    temperatureC: -3,
    humidityPct: 70,
    tacticalEffectAr: '+30% استخراج الحجارة وتحصين جبلي طبيعي للممرات',
    speedMultiplier: 0.78,
    harvestBonusKind: 'stone',
    harvestBonusPct: 30,
    accentHex: '#bae6fd',
  },
  eastern_basalt: {
    id: 'eastern_basalt',
    nameAr: 'الشعاب البازلتية والهضاب الصخرية',
    continentAr: 'الوادي الأسود ومرتفعات الشام وزاغروس',
    subtitleAr: 'أودية صخرية وحرار بركانية وعرة كشعاب الوادي الأسود وممرات الكمائن والقدس',
    temperatureC: 25,
    humidityPct: 36,
    tacticalEffectAr: '+25% استخراج الحجارة والمعادن من الشعاب والمرتفعات',
    speedMultiplier: 0.88,
    harvestBonusKind: 'stone',
    harvestBonusPct: 25,
    accentHex: '#c084fc',
  },
  southern_dunes: {
    id: 'southern_dunes',
    nameAr: 'بادية الشام وكثبان النفود والواحات',
    continentAr: 'البادية الوسطى وتخوم الحجاز',
    subtitleAr: 'صحارى وكثبان ذهبية تمتد بين مرقاب والرصافة حتى تخوم النفود ودرب قوافل الحجاز',
    temperatureC: 37,
    humidityPct: 20,
    tacticalEffectAr: '+30% استخراج الذهب من العروق الصحراوية ومفترقات القوافل',
    speedMultiplier: 0.84,
    harvestBonusKind: 'gold',
    harvestBonusPct: 30,
    accentHex: '#f59e0b',
  },
  river_basin: {
    id: 'river_basin',
    nameAr: 'أحواض دجلة والفرات وشط العرب',
    continentAr: 'سواد العراق والغور والعاصي',
    subtitleAr: 'ضفاف أنهار دجلة والفرات والأردن والعاصي وأهوار الرصافة الغنية بالزراعة والخصب',
    temperatureC: 22,
    humidityPct: 84,
    tacticalEffectAr: '+25% إنتاج المؤن على الضفاف وإبطاء العبور خارج الجسور',
    speedMultiplier: 0.8,
    harvestBonusKind: 'food',
    harvestBonusPct: 25,
    accentHex: '#38bdf8',
  },
  waterfall_gorge: {
    id: 'waterfall_gorge',
    nameAr: 'ينابيع الجبال وشلالات المنابع',
    continentAr: 'منابع الفرات ودجلة وجبل الشيخ',
    subtitleAr: 'مساقط مائية جبلية تغذي الأنهار الكبرى بالمياه العذبة والرواسب المعدنية',
    temperatureC: 14,
    humidityPct: 92,
    tacticalEffectAr: '+25% ذهب ومؤن حول أحواض الشلالات الغنية',
    speedMultiplier: 0.82,
    harvestBonusKind: 'gold',
    harvestBonusPct: 25,
    accentHex: '#67e8f9',
  },
  ocean_coast: {
    id: 'ocean_coast',
    nameAr: 'البحر المتوسط والخليج العربي',
    continentAr: 'الثغور البحرية والموانئ',
    subtitleAr: 'مياه المتوسط غرب الشام والخليج العربي عند ميناء الرصافة (البصرة) وممرات التجارة البحرية',
    temperatureC: 24,
    humidityPct: 86,
    tacticalEffectAr: '+20% مؤن وتجارة ساحلية على الشواطئ والموانئ',
    speedMultiplier: 0.72,
    harvestBonusKind: 'food',
    harvestBonusPct: 20,
    accentHex: '#0ea5e9',
  },
};

export const CLIMATE_SPECS: Record<ClimateKind, ClimateMetadata> = {
  temperate_clear: {
    id: 'temperate_clear',
    nameAr: 'صحو معتدل (Clear Sky)',
    descriptionAr: 'رؤية بحرية وقارية شاملة، إضاءة شمسية طبيعية تبرز ألوان الأقاليم والجبال، وسرعة 100%',
    skyHex: 0x6ea6cc,
    fogHex: 0xa8cbe0,
    fogDensity: 0.00038,
    sunHex: 0xfff8e6,
    sunIntensity: 2.15,
    hemiSkyHex: 0xbfe0ff,
    hemiGroundHex: 0x4a3f32,
    speedModifier: 1.0,
    harvestModifier: 1.0,
    badgeHex: '#38bdf8',
    particleType: 'none',
  },
  northern_blizzard: {
    id: 'northern_blizzard',
    nameAr: 'رياح باردة وعواصف جبلية (Blizzard)',
    descriptionAr: 'رياح ثلجية تهب من القمم وتبطئ المسير (-10%) مع زيادة صلابة القلاع',
    skyHex: 0x7c97b0,
    fogHex: 0x9eb5c9,
    fogDensity: 0.00072,
    sunHex: 0xe6f4ff,
    sunIntensity: 1.65,
    hemiSkyHex: 0xcbe8ff,
    hemiGroundHex: 0x475569,
    speedModifier: 0.9,
    harvestModifier: 1.05,
    badgeHex: '#7dd3fc',
    particleType: 'snow',
  },
  desert_sandstorm: {
    id: 'desert_sandstorm',
    nameAr: 'عاصفة رملية دافئة (Sandstorm)',
    descriptionAr: 'رياح رملية ذهبية تهب من الأحواض الجافة وتزيد استخراج الذهب والمعادن (+20%)',
    skyHex: 0xb88b54,
    fogHex: 0xc9a06a,
    fogDensity: 0.00086,
    sunHex: 0xfde68a,
    sunIntensity: 1.85,
    hemiSkyHex: 0xfde68a,
    hemiGroundHex: 0x5c3818,
    speedModifier: 0.92,
    harvestModifier: 1.2,
    badgeHex: '#f59e0b',
    particleType: 'sand',
  },
  monsoon_rain: {
    id: 'monsoon_rain',
    nameAr: 'أمطار بحرية موسمية (Monsoon Rain)',
    descriptionAr: 'أمطار بحرية غزيرة تغذي الأنهار والغابات وتزيد إنتاج المحاصيل (+25%)',
    skyHex: 0x56718a,
    fogHex: 0x748da3,
    fogDensity: 0.00068,
    sunHex: 0xd6e8ff,
    sunIntensity: 1.55,
    hemiSkyHex: 0x93c5fd,
    hemiGroundHex: 0x263547,
    speedModifier: 0.94,
    harvestModifier: 1.25,
    badgeHex: '#60a5fa',
    particleType: 'rain',
  },
};

// ============================================================================
// DETERMINISTIC 2D NOISE & REALISTIC MULTI-CONTINENT GEOGRAPHY (100 x 100 km)
// ============================================================================

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function smin(a: number, b: number, k = 0.16): number {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return a * h + b * (1 - h) - k * h * (1 - h);
}

export function hash2D(ix: number, iz: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + 1442695041;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);

  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm2D(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += amp * (valueNoise2D(x * freq, z * freq) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return value / Math.max(0.001, norm);
}

function ridged2D(x: number, z: number, octaves = 3): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2D(x * freq, z * freq) * 2 - 1;
    const r = 1 - Math.abs(n);
    value += amp * r * r;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return value / Math.max(0.001, norm);
}

interface PrecomputedSegment {
  ax: number;
  az: number;
  dx: number;
  dz: number;
  invLenSq: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function buildPrecomputedSegments(segs: PolylineSegment[]): PrecomputedSegment[] {
  return segs.map((s) => {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const lenSq = dx * dx + dz * dz;
    return {
      ax: s.ax,
      az: s.az,
      dx,
      dz,
      invLenSq: lenSq > 0 ? 1 / lenSq : 0,
      minX: Math.min(s.ax, s.bx),
      maxX: Math.max(s.ax, s.bx),
      minZ: Math.min(s.az, s.bz),
      maxZ: Math.max(s.az, s.bz),
    };
  });
}

const PRE_ROADS = buildPrecomputedSegments(STRATEGIC_ROADS);
const PRE_RIVERS = buildPrecomputedSegments(RIVER_SEGMENTS);
const PRE_SPINES = buildPrecomputedSegments(MOUNTAIN_SPINES);

const PRE_LOBES = CONTINENT_LOBES.map((lb) => ({
  cx: lb.cx,
  cz: lb.cz,
  invRx: 1 / lb.rx,
  invRz: 1 / lb.rz,
  cosA: Math.cos(lb.rotRad),
  sinA: Math.sin(lb.rotRad),
}));

const PRE_BRIDGES = BRIDGE_CROSSINGS.map((bc) => ({
  ...bc,
  halfReach: bc.length * 0.6,
  halfLen: bc.length * 0.56,
  cosNegR: Math.cos(-bc.rotationY),
  sinNegR: Math.sin(-bc.rotationY),
}));

function distSqToPreSegment(px: number, pz: number, s: PrecomputedSegment): number {
  if (s.invLenSq === 0) {
    const ox = px - s.ax;
    const oz = pz - s.az;
    return ox * ox + oz * oz;
  }
  let t = ((px - s.ax) * s.dx + (pz - s.az) * s.dz) * s.invLenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const rx = px - (s.ax + t * s.dx);
  const rz = pz - (s.az + t * s.dz);
  return rx * rx + rz * rz;
}

function distSqToAabb(px: number, pz: number, s: PrecomputedSegment): number {
  let dx = 0;
  if (px < s.minX) dx = s.minX - px;
  else if (px > s.maxX) dx = px - s.maxX;
  let dz = 0;
  if (pz < s.minZ) dz = s.minZ - pz;
  else if (pz > s.maxZ) dz = pz - s.maxZ;
  return dx * dx + dz * dz;
}

export function getRoadDistance(x: number, z: number): number {
  let minDSq = 1e12;
  const wx = x + Math.sin(z * 0.00055) * 180;
  const wz = z + Math.cos(x * 0.00055) * 180;
  for (let i = 0; i < PRE_ROADS.length; i++) {
    const r = PRE_ROADS[i];
    if (distSqToAabb(wx, wz, r) >= minDSq) continue;
    const dSq = distSqToPreSegment(wx, wz, r);
    if (dSq < minDSq) minDSq = dSq;
  }
  return Math.sqrt(minDSq);
}

/**
 * Evaluates signed distance to the nearest Continent / Island coastline (negative = inland, positive = sea).
 * Shared 1:1 with GLSL shader.
 */
export function getCoastlineSignedDist(x: number, z: number): number {
  const warpX = fbm2D(x * 0.000085, z * 0.000085, 3) * 3800;
  const warpZ = fbm2D(x * 0.000085 + 7.4, z * 0.000085 - 5.1, 3) * 3800;
  const wx = x + warpX;
  const wz = z + warpZ;

  let minSd = 9.0;
  for (let i = 0; i < PRE_LOBES.length; i++) {
    const lb = PRE_LOBES[i];
    const dx = wx - lb.cx;
    const dz = wz - lb.cz;
    const lx = (dx * lb.cosA + dz * lb.sinA) * lb.invRx;
    const lz = (-dx * lb.sinA + dz * lb.cosA) * lb.invRz;
    const sd = Math.sqrt(lx * lx + lz * lz) - 1.0;
    minSd = i === 0 ? sd : smin(minSd, sd, 0.13);
  }

  // Natural fjords, coves & coastal indentation
  const fjordErosion = fbm2D(x * 0.00034 + 3.7, z * 0.00034 - 8.2, 3) * 0.17;
  return minSd + fjordErosion;
}

/**
 * Evaluates minimum distance (meters) to the 8 meandering continental river systems.
 */
export function getRiverDistance(x: number, z: number): number {
  const meanderX =
    x + fbm2D(x * 0.00032, z * 0.00032, 2) * 290 + Math.sin(z * 0.0018) * 36;
  const meanderZ =
    z + fbm2D(x * 0.00032 + 14.3, z * 0.00032 - 9.7, 2) * 290 + Math.cos(x * 0.0018) * 36;

  let minDSq = 1e12;
  for (let i = 0; i < PRE_RIVERS.length; i++) {
    const r = PRE_RIVERS[i];
    if (distSqToAabb(meanderX, meanderZ, r) >= minDSq) continue;
    const dSq = distSqToPreSegment(meanderX, meanderZ, r);
    if (dSq < minDSq) minDSq = dSq;
  }
  return Math.sqrt(minDSq);
}

export function getMountainSpineDistance(x: number, z: number): number {
  const wx = x + fbm2D(x * 0.00018, z * 0.00018, 2) * 950;
  const wz = z + fbm2D(x * 0.00018 + 6.2, z * 0.00018 - 4.8, 2) * 950;
  let minDSq = 1e12;
  for (let i = 0; i < PRE_SPINES.length; i++) {
    const s = PRE_SPINES[i];
    if (distSqToAabb(wx, wz, s) >= minDSq) continue;
    const dSq = distSqToPreSegment(wx, wz, s);
    if (dSq < minDSq) minDSq = dSq;
  }
  return Math.sqrt(minDSq);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function mixNum(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

/**
 * Planetary atmospheric wind vector by latitude (Westerlies in north/temperate, Trade Easterlies in subtropics).
 * Shared 1:1 with GLSL shader.
 */
export function getPrevailingWindDir(z: number): { wx: number; wz: number } {
  const latNorm = Math.max(-1, Math.min(1, z / WORLD_HALF_SIZE));
  const westerliesBlend = 1 - smoothstep(-0.08, 0.22, latNorm);
  return {
    wx: mixNum(-0.92, 0.94, westerliesBlend),
    wz: mixNum(-0.34, 0.20, westerliesBlend),
  };
}

interface OrographicBalance {
  windwardLift: number;
  leewardShadow: number;
  onshoreBreeze: number;
  continentalInterior: number;
}

const OROGRAPHIC_CACHE = new Map<number, OrographicBalance>();
const OROGRAPHIC_CELL_M = 128;

/**
 * Evaluates orographic windward condensation vs leeward rain shadow using mountain spines and coastlines
 * strictly without calling getTerrainHeight (cycle-safe, shared 1:1 with GLSL).
 * Cached on a 128m spatial grid (features vary on a 2,400m-4,400m atmospheric fetch scale).
 */
export function getOrographicBalanceAt(
  x: number,
  z: number,
  preHereSpine?: number
): OrographicBalance {
  const cx = Math.round(x / OROGRAPHIC_CELL_M);
  const cz = Math.round(z / OROGRAPHIC_CELL_M);
  const key = (cx + 2048) * 4096 + (cz + 2048);
  const cached = OROGRAPHIC_CACHE.get(key);
  if (cached) return cached;

  const sx = cx * OROGRAPHIC_CELL_M;
  const sz = cz * OROGRAPHIC_CELL_M;
  const { wx, wz } = getPrevailingWindDir(sz);
  const ux1 = sx - wx * 2400;
  const uz1 = sz - wz * 2400;
  const ux2 = sx - wx * 4400;
  const uz2 = sz - wz * 4400;
  const dx = sx + wx * 4200;
  const dz = sz + wz * 4200;

  const hereSpine = preHereSpine ?? getMountainSpineDistance(sx, sz);
  const upwindSpine = Math.min(
    getMountainSpineDistance(ux1, uz1),
    getMountainSpineDistance(ux2, uz2)
  );
  const upwindCoast = getCoastlineSignedDist(ux2, uz2);
  const downwindCoast = getCoastlineSignedDist(dx, dz);

  const leewardShadow =
    (1 - smoothstep(400, 2600, upwindSpine)) * smoothstep(900, 3200, hereSpine);
  const windwardLift =
    (1 - smoothstep(400, 3400, hereSpine)) * smoothstep(-0.26, 0.02, upwindCoast);
  const onshoreBreeze = Math.max(
    smoothstep(-0.22, 0.06, upwindCoast),
    smoothstep(-0.14, 0.06, downwindCoast) * 0.75
  );
  // 1.0 only deep inside true continents (not small archipelago islands surrounded by sea)
  const continentalInterior = smoothstep(0.04, -0.34, Math.min(upwindCoast, downwindCoast)) *
    smoothstep(0.08, -0.18, Math.max(upwindCoast, downwindCoast));

  const res: OrographicBalance = {
    windwardLift,
    leewardShadow,
    onshoreBreeze,
    continentalInterior,
  };
  if (OROGRAPHIC_CACHE.size >= 4096) {
    OROGRAPHIC_CACHE.clear();
  }
  OROGRAPHIC_CACHE.set(key, res);
  return res;
}

function getAridIntensityCore(
  x: number,
  z: number,
  coastSd: number,
  leewardShadow: number,
  continentalInterior: number
): number {
  const warp = fbm2D(x * 0.00016 + 5.1, z * 0.00016 - 3.9, 2) * 1800;
  const px = x + warp;
  const pz = z - warp * 0.7;
  let maxVal = 0;
  for (let i = 0; i < ARID_POCKETS.length; i++) {
    const ap = ARID_POCKETS[i];
    const adx = Math.abs(px - ap.x);
    if (adx >= ap.radius) continue;
    const adz = Math.abs(pz - ap.z);
    if (adz >= ap.radius) continue;
    const d = Math.sqrt(adx * adx + adz * adz);
    if (d < ap.radius) {
      const f = (1 - smoothstep(ap.radius * 0.25, ap.radius, d)) * ap.intensity;
      if (f > maxVal) maxVal = f;
    }
  }

  // Realistic Middle East continental desertification:
  // Vast Syrian Desert, Iraqi plains & Arabian Peninsula are arid south of the Taurus mountains,
  // moderated only along the narrow Mediterranean Levant coast (x < -20500, z < 16000).
  const latNorm = Math.max(-1, Math.min(1, z / WORLD_HALF_SIZE));
  const medCoastShield =
    (1 - smoothstep(-27500, -19500, x)) * (1 - smoothstep(12000, 21000, z));
  const taurusNorthShield = 1 - smoothstep(-32000, -21000, z);
  const regionalDesertBelt =
    smoothstep(-0.56, 0.14, latNorm) *
    (0.76 - medCoastShield * 0.62 - taurusNorthShield * 0.45);
  const leewardLandMask = smoothstep(-0.04, -0.22, coastSd) * continentalInterior;
  const dynamicArid =
    regionalDesertBelt +
    leewardShadow * 0.34 * smoothstep(-0.35, 0.12, latNorm) * leewardLandMask;

  return clamp01(Math.max(maxVal * (1 - medCoastShield * 0.65), dynamicArid));
}

export function getAridIntensityAt(x: number, z: number): number {
  const coastSd = getCoastlineSignedDist(x, z);
  const { leewardShadow, continentalInterior } = getOrographicBalanceAt(x, z);
  return getAridIntensityCore(x, z, coastSd, leewardShadow, continentalInterior);
}

/**
 * Distance to Desert Oases & Springs across the Syrian Desert & Northern Arabia
 * (Mirqab Well, Palmyra/Tadmur, Dumat al-Jandal/Jawf, Ein al-Tamr).
 * Shared 1:1 with GLSL shader.
 */
export function getOasisDistance(x: number, z: number): number {
  const dx1 = (x + 4120) * 0.9; // واحة وبئر مرقاب
  const dz1 = z - 5180;
  const dx2 = (x + 12200) * 0.88; // واحة تدمر
  const dz2 = z + 4500;
  const dx3 = (x + 3800) * 0.9; // واحة دومة الجندل (الجوف)
  const dz3 = z - 27200;
  const dx4 = (x - 12200) * 0.88; // واحة عين التمر (مشارف الكوفة)
  const dz4 = z - 6800;
  return Math.sqrt(
    Math.min(
      dx1 * dx1 + dz1 * dz1,
      dx2 * dx2 + dz2 * dz2,
      dx3 * dx3 + dz3 * dz3,
      dx4 * dx4 + dz4 * dz4
    )
  );
}

export function getNearestWaterfallDistance(x: number, z: number): number {
  let minDSq = 1e12;
  for (let i = 0; i < WATERFALL_SITES.length; i++) {
    const wf = WATERFALL_SITES[i];
    const dx = x - wf.cliffX;
    const dz = z - wf.cliffZ;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDSq) minDSq = dSq;
  }
  return Math.sqrt(minDSq);
}

/**
 * Realistic physical humidity (0..1):
 * combines coastal moisture, onshore ocean fetch, boreal/monsoon storm tracks,
 * inland subtropical high-pressure dryness, windward uplift vs leeward rain shadow, rivers & oases.
 */
export function getMoistureAt(x: number, z: number): number {
  const latNorm = Math.max(-1, Math.min(1, z / WORLD_HALF_SIZE));
  const coastSd = getCoastlineSignedDist(x, z);
  const riverDist = getRiverDistance(x, z);
  const oasisDist = getOasisDistance(x, z);
  const { windwardLift, leewardShadow, onshoreBreeze, continentalInterior } =
    getOrographicBalanceAt(x, z);
  const arid = getAridIntensityCore(x, z, coastSd, leewardShadow, continentalInterior);

  // Realistic Levant/Mesopotamia/Arabia moisture:
  // Humid ONLY along the narrow Mediterranean Levant coast, northern Taurus/Kurdistan rim, and narrow river/oasis ribbons.
  const deepInland = smoothstep(-0.06, -0.32, coastSd);
  const medCoastBelt =
    (1 - smoothstep(-29000, -19500, x)) * (1 - smoothstep(13000, 22000, z));
  const taurusRimBelt = 1 - smoothstep(-35000, -22500, z);
  const arabiaDryDrop = smoothstep(-0.22, 0.48, latNorm) * 0.28;

  const baseHumidity = 0.22 + medCoastBelt * 0.44 + taurusRimBelt * 0.30;
  const aridDrop = arid * 0.46;
  const moistureNoise = fbm2D(x * 0.00012 + 41, z * 0.00012 - 19, 3) * 0.11;
  const riverBonus = riverDist < 280 ? (1 - smoothstep(25, 280, riverDist)) * 0.48 : 0;
  const oasisBonus = oasisDist < 210 ? (1 - smoothstep(22, 210, oasisDist)) * 0.44 : 0;

  return clamp01(
    baseHumidity +
      onshoreBreeze * 0.12 * medCoastBelt +
      windwardLift * 0.20 * (medCoastBelt + taurusRimBelt) -
      leewardShadow * 0.16 * deepInland * continentalInterior -
      arabiaDryDrop -
      aridDrop +
      moistureNoise +
      riverBonus +
      oasisBonus
  );
}

/**
 * Realistic Temperature (°C) factoring Latitude, Subtropical insolation, Maritime moderation,
 * Arid inland heating, Altitude lapse rate (~1.55°C/m) and River cooling.
 */
export function getTemperatureCAt(x: number, z: number, knownElev?: number): number {
  const latNorm = Math.max(-1, Math.min(1, z / WORLD_HALF_SIZE));
  const elev = Math.max(0, knownElev ?? getTerrainHeight(x, z));
  const coastSd = getCoastlineSignedDist(x, z);
  const { leewardShadow, continentalInterior } = getOrographicBalanceAt(x, z);
  const arid = getAridIntensityCore(x, z, coastSd, leewardShadow, continentalInterior);

  const subtropicalPeak = Math.exp(-Math.pow((latNorm - 0.48) / 0.44, 2)) * 4.5;
  const baseSeaLevelC = 19.5 + latNorm * 14.0 + subtropicalPeak;

  const inland = smoothstep(0.0, -0.38, coastSd) * (0.35 + continentalInterior * 0.65);
  const warmMix = smoothstep(-0.32, 0.18, latNorm);
  const continentality = mixNum(-inland * 2.4, inland * 3.4, warmMix);
  const aridHeat = arid * 6.0 * smoothstep(-0.14, 0.22, latNorm);
  const riverCooling = getRiverDistance(x, z) < 160 ? -1.4 : 0;
  const noiseC = fbm2D(x * 0.0001, z * 0.0001, 2) * 1.8;

  return Math.round(
    baseSeaLevelC + continentality + aridHeat - elev * 1.55 + riverCooling + noiseC
  );
}

/**
 * Dynamic Latitude- & Aridity-Dependent Snowline Elevation (meters).
 * Lower snowline in cool northern latitudes (~5.3m), higher in warm subtropics (~9.8m).
 */
export function getSnowlineElevationAt(x: number, z: number, precomputedArid?: number): number {
  const latNorm = Math.max(-1, Math.min(1, z / WORLD_HALF_SIZE));
  const arid = precomputedArid ?? getAridIntensityAt(x, z);
  return 5.3 + smoothstep(-0.78, 0.55, latNorm) * 4.3 + arid * 1.2;
}

export interface TerrainSurfaceSample {
  riverDist: number;
  oasisDist: number;
  roadDist: number;
  spineDist: number;
  arid: number;
  moisture: number;
  forestDensity: number;
  tempC: number;
  snowLine: number;
}

/**
 * Deterministic multi-scale woodland & dense forest canopy density (0..1).
 * Forms organic oak/pine forests and glades across humid coastal belts, river valleys,
 * foothills, and continental interiors while keeping sandy coasts, deserts, roads, and spawn plateaus clear.
 * Shared mathematically 1:1 with the WebGL2 Strategic Map GLSL shader and 3D tree spawner.
 */
export function getForestDensityAt(
  x: number,
  z: number,
  precomputed?: {
    coastSd?: number;
    elev?: number;
    moisture?: number;
    arid?: number;
    snowLine?: number;
    riverDist?: number;
    roadDist?: number;
  }
): number {
  const coastSd = precomputed?.coastSd ?? getCoastlineSignedDist(x, z);
  if (coastSd > -0.025) return 0;

  const elev = precomputed?.elev ?? getTerrainHeight(x, z);
  const arid = precomputed?.arid ?? getAridIntensityAt(x, z);
  const snowLine = precomputed?.snowLine ?? getSnowlineElevationAt(x, z, arid);
  if (elev < 0.35 || elev > snowLine - 0.55) return 0;

  const moisture = precomputed?.moisture ?? getMoistureAt(x, z);
  if (moisture < 0.42 || arid > 0.36) return 0;

  const riverDist = precomputed?.riverDist ?? getRiverDistance(x, z);
  if (riverDist < 14) return 0;

  // Macro forest belts strictly on humid Mediterranean coast, Taurus/Zagros slopes, and narrow riverine groves
  const macroGrove = fbm2D(x * 0.00022 + 19.4, z * 0.00022 - 11.7, 3);
  const gladeBreak = fbm2D(x * 0.00095 - 5.2, z * 0.00095 + 8.3, 2);
  const basePatch = macroGrove * 0.68 + gladeBreak * 0.32;

  const moistBoost = smoothstep(0.42, 0.78, moisture) * 0.46;
  const aridSuppress = smoothstep(0.14, 0.36, arid) * 0.62;
  const elevFade = 1 - smoothstep(snowLine - 2.2, snowLine - 0.55, elev);
  const coastFade = smoothstep(-0.025, -0.12, coastSd);
  const riverCorridorBoost = riverDist < 220 ? (1 - smoothstep(18, 220, riverDist)) * 0.18 : 0;

  const raw =
    smoothstep(-0.10, 0.36, basePatch + moistBoost + riverCorridorBoost - aridSuppress) *
    elevFade *
    coastFade;

  return clamp01(raw);
}

/**
 * Single-pass physical terrain & climate surface evaluation for chunk vertex painting.
 * Reuses coastline, orographic balance, river, and aridity terms without redundant calls.
 */
export function sampleTerrainSurfaceAt(
  x: number,
  z: number,
  knownElev: number
): TerrainSurfaceSample {
  const latNorm = Math.max(-1, Math.min(1, z / WORLD_HALF_SIZE));
  const elev = Math.max(0, knownElev);
  const coastSd = getCoastlineSignedDist(x, z);
  const riverDist = getRiverDistance(x, z);
  const oasisDist = getOasisDistance(x, z);
  const roadDist = getRoadDistance(x, z);
  const spineDist = getMountainSpineDistance(x, z);
  const { windwardLift, leewardShadow, onshoreBreeze, continentalInterior } =
    getOrographicBalanceAt(x, z, spineDist);
  const arid = getAridIntensityCore(x, z, coastSd, leewardShadow, continentalInterior);

  const deepInlandM = smoothstep(-0.06, -0.32, coastSd);
  const medCoastBelt =
    (1 - smoothstep(-29000, -19500, x)) * (1 - smoothstep(13000, 22000, z));
  const taurusRimBelt = 1 - smoothstep(-35000, -22500, z);
  const arabiaDryDrop = smoothstep(-0.22, 0.48, latNorm) * 0.28;
  const baseHumidity = 0.22 + medCoastBelt * 0.44 + taurusRimBelt * 0.30;
  const moistureNoise = fbm2D(x * 0.00012 + 41, z * 0.00012 - 19, 3) * 0.11;
  const riverBonus = riverDist < 280 ? (1 - smoothstep(25, 280, riverDist)) * 0.48 : 0;
  const oasisBonus = oasisDist < 210 ? (1 - smoothstep(22, 210, oasisDist)) * 0.44 : 0;

  const moisture = clamp01(
    baseHumidity +
      onshoreBreeze * 0.12 * medCoastBelt +
      windwardLift * 0.20 * (medCoastBelt + taurusRimBelt) -
      leewardShadow * 0.16 * deepInlandM * continentalInterior -
      arabiaDryDrop -
      arid * 0.46 +
      moistureNoise +
      riverBonus +
      oasisBonus
  );

  const subtropicalPeak = Math.exp(-Math.pow((latNorm - 0.48) / 0.44, 2)) * 4.5;
  const baseSeaLevelC = 19.5 + latNorm * 14.0 + subtropicalPeak;
  const inland = smoothstep(0.0, -0.38, coastSd) * (0.35 + continentalInterior * 0.65);
  const warmMix = smoothstep(-0.32, 0.18, latNorm);
  const continentality = mixNum(-inland * 2.4, inland * 3.4, warmMix);
  const aridHeat = arid * 6.0 * smoothstep(-0.14, 0.22, latNorm);
  const riverCooling = riverDist < 160 ? -1.4 : 0;
  const noiseC = fbm2D(x * 0.0001, z * 0.0001, 2) * 1.8;
  const tempC = Math.round(
    baseSeaLevelC + continentality + aridHeat - elev * 1.55 + riverCooling + noiseC
  );

  const snowLine = 5.3 + smoothstep(-0.78, 0.55, latNorm) * 4.3 + arid * 1.2;
  const forestDensity = getForestDensityAt(x, z, {
    coastSd,
    elev: knownElev,
    moisture,
    arid,
    snowLine,
    riverDist,
    roadDist,
  });

  return {
    riverDist,
    oasisDist,
    roadDist,
    spineDist,
    arid,
    moisture,
    forestDensity,
    tempC,
    snowLine,
  };
}

/**
 * Classifies the natural regional climate belt at any world coordinate.
 */
export function getClimateZoneLabelAr(x: number, z: number): string {
  const h = getTerrainHeight(x, z);
  const tempC = getTemperatureCAt(x, z, Math.max(0, h));
  const moisture = getMoistureAt(x, z);
  const arid = getAridIntensityAt(x, z);
  const snowLine = getSnowlineElevationAt(x, z, arid);

  if (h >= snowLine || tempC <= 4) return 'مناخ قطبي ألبي بارد';
  if (tempC <= 13) return 'مناخ شمالي معتدل بارد';
  if (arid > 0.34 && tempC >= 22) return 'مناخ صحراوي شبه مداري جاف';
  if (tempC >= 24 && moisture >= 0.52) return 'مناخ موسمي دافئ رطب';
  if (tempC >= 19) return 'مناخ متوسطي دافئ';
  return 'مناخ معتدل بحري';
}

/**
 * Resolves a global atmospheric storm front into the physically realistic LOCAL weather at (x, z).
 * Prevents tropical dunes from freezing in blizzards or snowy glaciers from suffering desert sandstorms!
 */
export function getEffectiveClimateAt(
  x: number,
  z: number,
  globalClimate: ClimateKind
): ClimateKind {
  if (globalClimate === 'temperate_clear') {
    return 'temperate_clear';
  }

  const h = getTerrainHeight(x, z);
  const tempC = getTemperatureCAt(x, z, Math.max(0, h));
  const coastSd = getCoastlineSignedDist(x, z);
  const arid = getAridIntensityAt(x, z);
  const moisture = getMoistureAt(x, z);
  const snowLine = getSnowlineElevationAt(x, z, arid);

  if (globalClimate === 'northern_blizzard') {
    if (tempC <= 13 || h >= snowLine - 0.5 || z < -12000) {
      return 'northern_blizzard';
    }
    if (tempC <= 23 && moisture >= 0.42) {
      return 'monsoon_rain';
    }
    return 'temperate_clear';
  }

  if (globalClimate === 'desert_sandstorm') {
    if (arid > 0.20 || (tempC >= 25 && moisture < 0.44 && h < snowLine - 1.2)) {
      return 'desert_sandstorm';
    }
    return 'temperate_clear';
  }

  // globalClimate === 'monsoon_rain'
  if (h >= snowLine - 0.4 && tempC <= 3) {
    return 'northern_blizzard';
  }
  if (arid > 0.54 && moisture < 0.34 && getRiverDistance(x, z) > 120) {
    return 'temperate_clear';
  }
  if (moisture >= 0.36 || coastSd > -0.14) {
    return 'monsoon_rain';
  }
  return 'temperate_clear';
}

export type GeologicalFeatureKind =
  | 'canyon'
  | 'mesa'
  | 'outcrop'
  | 'mountain_ridge'
  | 'plain';

export interface GeologicalSample {
  kind: GeologicalFeatureKind;
  canyonDepth: number;
  mesaStrength: number;
  outcropStrength: number;
  ridgeStrength: number;
  labelAr: string;
}

const PRE_MESAS = MESA_FORMATIONS.map((m) => ({
  ...m,
  cosR: Math.cos(-m.rotRad),
  sinR: Math.sin(-m.rotRad),
  boundR: Math.max(m.rx, m.rz) * 1.48,
}));

const PRE_CANYONS = CANYON_SEGMENTS.map((c) => ({
  ...c,
  minX: Math.min(c.ax, c.bx) - c.halfWidth * 2.4 - 45,
  maxX: Math.max(c.ax, c.bx) + c.halfWidth * 2.4 + 45,
  minZ: Math.min(c.az, c.bz) - c.halfWidth * 2.4 - 45,
  maxZ: Math.max(c.az, c.bz) + c.halfWidth * 2.4 + 45,
}));

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq <= 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/**
 * Computes natural geological relief contributions (Canyons/Gorges, Stepped Mesas/Plateaus,
 * and Rocky Outcrops/Buttes) at any continental land coordinate.
 */
function sampleGeologicalOffsets(
  x: number,
  z: number,
  inlandFactor: number,
  arid: number,
  spineDist: number
): {
  canyonCut: number;
  mesaLift: number;
  mesaMask: number;
  outcropLift: number;
  outcropMask: number;
} {
  // 1. Named & Procedural Canyons / Gorges / Wadis (الأخاديد)
  let canyonCut = 0;
  const cWarpX = fbm2D(x * 0.0085 + 3.1, z * 0.0085 - 2.4, 2) * 16;
  const cWarpZ = fbm2D(x * 0.0085 - 6.7, z * 0.0085 + 5.2, 2) * 16;
  const cx = x + cWarpX;
  const cz = z + cWarpZ;

  for (let i = 0; i < PRE_CANYONS.length; i++) {
    const seg = PRE_CANYONS[i];
    if (x < seg.minX || x > seg.maxX || z < seg.minZ || z > seg.maxZ) continue;
    const d = distToSegment(cx, cz, seg.ax, seg.az, seg.bx, seg.bz);
    if (d < seg.halfWidth * 1.55) {
      // Steep terraced canyon rim wall dropping sharply to a flat rocky wadi floor
      const wallT = 1 - smoothstep(seg.halfWidth * 0.34, seg.halfWidth * 1.18, d);
      const terraceRim = 1 - smoothstep(seg.halfWidth * 1.05, seg.halfWidth * 1.55, d);
      const cut = (wallT * 0.86 + terraceRim * 0.14) * seg.depth;
      if (cut > canyonCut) canyonCut = cut;
    }
  }

  // Procedural winding desert wadis & tectonic fault ravines in dry interior / rocky foothills
  if (inlandFactor > 0.22 && (arid > 0.18 || spineDist < 4200)) {
    const fWarpX = fbm2D(x * 0.0014 + 1.9, z * 0.0014 - 4.3, 2) * 240;
    const fWarpZ = fbm2D(x * 0.0014 - 5.1, z * 0.0014 + 2.8, 2) * 240;
    const faultVal = Math.abs(fbm2D((x + fWarpX) * 0.00195 + 11.4, (z + fWarpZ) * 0.00195 - 7.6, 2));
    // Pinch narrow canyon channels strictly where faultVal approaches 0
    if (faultVal < 0.068) {
      const ravineMask = 1 - smoothstep(0.016, 0.068, faultVal);
      const regionStrength = Math.max(
        smoothstep(0.18, 0.55, arid) * 0.85,
        (1 - smoothstep(700, 4200, spineDist)) * 1.05
      );
      const procCut = ravineMask * ravineMask * 3.85 * regionStrength * inlandFactor;
      if (procCut > canyonCut) canyonCut = procCut;
    }
  }

  // 2. Stepped Plateaus & Mesas (الهضاب المتدرجة)
  let mesaLift = 0;
  let mesaMask = 0;
  for (let i = 0; i < PRE_MESAS.length; i++) {
    const m = PRE_MESAS[i];
    const dx = x - m.x;
    if (dx > m.boundR || dx < -m.boundR) continue;
    const dz = z - m.z;
    if (dz > m.boundR || dz < -m.boundR) continue;
    const lx = (dx * m.cosR - dz * m.sinR) / m.rx;
    const lz = (dx * m.sinR + dz * m.cosR) / m.rz;
    const edgeWarp = fbm2D(x * 0.018 + i * 3.7, z * 0.018 - i * 2.1, 2) * 0.18;
    const r = Math.hypot(lx, lz) + edgeWarp;
    if (r < 1.38) {
      // Crisp 2-tier stepped escarpment with a flat, fortress-buildable tabletop summit
      const lowerShelf = 1 - smoothstep(0.96, 1.34, r);
      const upperCliff = 1 - smoothstep(0.58, 0.88, r);
      const lift = (lowerShelf * 0.36 + upperCliff * 0.64) * m.height;
      const mask = Math.max(lowerShelf * 0.65, upperCliff);
      if (lift > mesaLift) {
        mesaLift = lift;
        mesaMask = mask;
      }
    }
  }

  // Procedural regional terraced mesas across inland steppes & rocky highlands
  if (inlandFactor > 0.25) {
    const mNoise = fbm2D(x * 0.00145 + 17.3, z * 0.00145 - 13.7, 3);
    const mDetail = fbm2D(x * 0.0058 - 4.2, z * 0.0058 + 8.1, 2) * 0.14;
    const mField = mNoise + mDetail;
    if (mField > 0.24) {
      const shelf1 = smoothstep(0.24, 0.36, mField);
      const shelf2 = smoothstep(0.42, 0.54, mField);
      const procMesa = (shelf1 * 1.95 + shelf2 * 2.35) * inlandFactor;
      if (procMesa > mesaLift) {
        mesaLift = procMesa;
        mesaMask = Math.max(mesaMask, Math.min(1, shelf1 * 0.6 + shelf2 * 0.4));
      }
    }
  }

  // 3. Rocky Outcrops, Buttes & Craggy Tors (النتوءات الصخرية)
  let outcropLift = 0;
  let outcropMask = 0;
  if (inlandFactor > 0.15) {
    const oRidged = ridged2D(x * 0.0046 + 29.4, z * 0.0046 - 18.2, 2);
    const oCluster = fbm2D(x * 0.0011 - 9.3, z * 0.0011 + 14.6, 2);
    if (oRidged > 0.64 && oCluster > -0.08) {
      const spire = smoothstep(0.64, 0.92, oRidged);
      const clusterW = smoothstep(-0.08, 0.42, oCluster);
      const cragNoise = ridged2D(x * 0.017 + 3.4, z * 0.017 - 7.1, 2);
      const rawOutcrop = Math.pow(spire, 1.55) * (2.6 + cragNoise * 3.1) * clusterW * inlandFactor;
      outcropLift = rawOutcrop;
      outcropMask = Math.min(1, spire * clusterW);
    }
  }

  return { canyonCut, mesaLift, mesaMask, outcropLift, outcropMask };
}

/**
 * Classifies the dominant geological landform at (x, z) for vertex strata shading,
 * 3D crag placement, and fortress high-ground reporting.
 */
export function getGeologicalFeatureAt(
  x: number,
  z: number,
  knownElev?: number
): GeologicalSample {
  const coastSd = getCoastlineSignedDist(x, z);
  const inlandFactor = smoothstep(0.02, -0.35, coastSd);
  if (inlandFactor < 0.08) {
    return {
      kind: 'plain',
      canyonDepth: 0,
      mesaStrength: 0,
      outcropStrength: 0,
      ridgeStrength: 0,
      labelAr: 'سهل ساحلي',
    };
  }
  const spineDist = getMountainSpineDistance(x, z);
  const { leewardShadow, continentalInterior } = getOrographicBalanceAt(x, z, spineDist);
  const arid = getAridIntensityCore(x, z, coastSd, leewardShadow, continentalInterior);
  const geo = sampleGeologicalOffsets(x, z, inlandFactor, arid, spineDist);
  const ridgeStrength = 1 - smoothstep(450, 3200, spineDist);
  const elev = knownElev ?? getTerrainHeight(x, z);

  if (geo.canyonCut > 1.35) {
    return {
      kind: 'canyon',
      canyonDepth: geo.canyonCut,
      mesaStrength: geo.mesaMask,
      outcropStrength: geo.outcropMask,
      ridgeStrength,
      labelAr: 'أخدود صخري عميق',
    };
  }
  if (ridgeStrength > 0.35 && elev > 5.4) {
    return {
      kind: 'mountain_ridge',
      canyonDepth: geo.canyonCut,
      mesaStrength: geo.mesaMask,
      outcropStrength: geo.outcropMask,
      ridgeStrength,
      labelAr: 'سلسلة جبلية شاهقة',
    };
  }
  if (geo.mesaMask > 0.42 && geo.mesaLift > 1.65) {
    return {
      kind: 'mesa',
      canyonDepth: geo.canyonCut,
      mesaStrength: geo.mesaMask,
      outcropStrength: geo.outcropMask,
      ridgeStrength,
      labelAr: 'هضبة صخرية متدرجة',
    };
  }
  if (geo.outcropMask > 0.36 && geo.outcropLift > 1.35) {
    return {
      kind: 'outcrop',
      canyonDepth: geo.canyonCut,
      mesaStrength: geo.mesaMask,
      outcropStrength: geo.outcropMask,
      ridgeStrength,
      labelAr: 'نتوء صخري ناتئ',
    };
  }
  return {
    kind: 'plain',
    canyonDepth: geo.canyonCut,
    mesaStrength: geo.mesaMask,
    outcropStrength: geo.outcropMask,
    ridgeStrength,
    labelAr: 'سهل مفتوح',
  };
}

/**
 * Multi-Continent Realistic Height Synthesis (100 x 100 km, ~60% Sea / ~40% Land).
 * Includes Tectonic Ridged Mountains, Stepped Mesas/Plateaus, Rocky Outcrops, and Carved Canyons.
 */
export function getTerrainHeight(x: number, z: number): number {
  const coastSd = getCoastlineSignedDist(x, z);

  // Small fractal offshore islets in the sea channels near continent coasts
  const isletNoise = fbm2D(x * 0.00045 - 11.2, z * 0.00045 + 6.4, 2);
  const absX = Math.abs(x);
  const absZ = Math.abs(z);
  const rimDist = absX > absZ ? absX : absZ;
  const borderFade = 1 - smoothstep(43000, 48500, rimDist);
  const nearCoastBand = smoothstep(0.45, 0.05, coastSd) * smoothstep(-0.02, 0.08, coastSd);
  const isletFactor = smoothstep(0.44, 0.62, isletNoise) * nearCoastBand * borderFade;

  // Base ocean floor when strictly outside coastlines and islets (smooth 2D bathymetry — zero 1D stripes!)
  if (coastSd > 0.14 && isletFactor < 0.05) {
    const abyssT = smoothstep(0.0, 0.55, coastSd);
    const bathymetry = fbm2D(x * 0.00022 + 3.1, z * 0.00022 - 4.7, 2) * 0.32;
    return Math.round((-0.55 - abyssT * 3.2 + bathymetry) * 100) / 100;
  }

  // Rolling continental relief
  const mesoNoise = fbm2D(x * 0.0036, z * 0.0036, 3);
  const macroNoise = fbm2D(x * 0.00038, z * 0.00038, 3);
  const microDetail = Math.sin(x * 0.024) * Math.cos(z * 0.024) * 0.24;

  const inlandFactor = smoothstep(0.02, -0.35, coastSd);
  let h = 0.85 + inlandFactor * 2.05 + mesoNoise * 1.45 + macroNoise * 1.85 + microDetail;

  // Orographic Tectonic Mountain Spines: sharp domain-warped multi-octave alpine peaks, arêtes & cirques
  const spineDist = getMountainSpineDistance(x, z);
  const spineMask = 1 - smoothstep(380, 3450, spineDist);
  if (spineMask > 0.01) {
    const mWarpX = fbm2D(x * 0.00095 + 4.4, z * 0.00095 - 8.1, 2) * 320;
    const mWarpZ = fbm2D(x * 0.00095 - 7.3, z * 0.00095 + 3.2, 2) * 320;
    const ridgeMacro = ridged2D((x + mWarpX) * 0.00034 + 12.7, (z + mWarpZ) * 0.00034 - 4.3, 3);
    const ridgeFine = ridged2D((x + mWarpX * 0.5) * 0.0024, (z + mWarpZ * 0.5) * 0.0024, 3);
    const sharpPeak = Math.pow(ridgeMacro, 1.35) * 11.2 + Math.pow(ridgeFine, 1.5) * 7.8;
    const foothills = Math.pow(spineMask, 0.72) * 3.4;
    // Alpine glacial valley troughs cutting flanks of mountain ranges
    const valleyCarve = smoothstep(0.55, 0.92, 1 - ridgeMacro) * spineMask * 2.6;
    h += foothills + Math.pow(spineMask, 1.15) * sharpPeak - valleyCarve;
  }

  // Subtle sand dune ripples inside arid rain-shadow pockets
  const { leewardShadow, continentalInterior } = getOrographicBalanceAt(x, z, spineDist);
  const arid = getAridIntensityCore(x, z, coastSd, leewardShadow, continentalInterior);
  if (arid > 0.05) {
    const dunes = Math.pow(Math.sin(x * 0.026 + Math.cos(z * 0.019) * 2.2) * 0.5 + 0.5, 1.45) * 2.3;
    h += arid * dunes * 0.58;
  }

  // Geological Landforms: Stepped Mesas (الهضاب), Rocky Outcrops (النتوءات) & Deep Canyons (الأخاديد)
  if (inlandFactor > 0.08) {
    const geo = sampleGeologicalOffsets(x, z, inlandFactor, arid, spineDist);
    // Keep major royal roads smoothly graded so caravans never drop down sheer canyon walls
    const roadDist = getRoadDistance(x, z);
    const roadClear = smoothstep(14, 44, roadDist);
    // Blend mesas cleanly (flattening rolling noise slightly on mesa tabletops for buildable fortresses)
    if (geo.mesaLift > 0.05) {
      const tabletopFlat = Math.min(1, geo.mesaMask * 0.62) * roadClear;
      const flatBase = 2.05 + macroNoise * 0.7;
      h = h * (1 - tabletopFlat) + flatBase * tabletopFlat + geo.mesaLift * roadClear;
    }
    // Add rocky outcrops & desert tors
    if (geo.outcropLift > 0.05) {
      h += geo.outcropLift * roadClear * (1 - geo.mesaMask * 0.55);
    }
    // Carve deep tectonic canyons & desert wadis
    if (geo.canyonCut > 0.05) {
      h -= geo.canyonCut * roadClear;
      // Keep dry inland canyon floors above deep ocean floor unless genuinely meeting sea
      if (coastSd < -0.06) {
        h = Math.max(-0.18, h);
      }
    }
  }

  // Smooth coastal beach & continental shelf slope at sea boundary
  if (coastSd > -0.09) {
    const seaMix = smoothstep(-0.09, 0.06, coastSd);
    const oceanFloor = -0.35 - smoothstep(0.0, 0.5, Math.max(0, coastSd)) * 3.4;
    h = h * (1 - seaMix) + oceanFloor * seaMix;
  }

  // Lift small offshore archipelago islets cleanly above sea level
  if (isletFactor > 0.05) {
    h = Math.max(h, -0.3 + isletFactor * 3.4);
  }

  // Waterfall Cliffs (with AABB fast reject)
  for (let i = 0; i < WATERFALL_SITES.length; i++) {
    const wf = WATERFALL_SITES[i];
    const dx = x - wf.cliffX;
    if (dx > 42 || dx < -42) continue;
    const dz = z - wf.cliffZ;
    if (dz > 42 || dz < -42) continue;
    const distToCliff = Math.sqrt(dx * dx + dz * dz);
    if (distToCliff < 42) {
      const alongFlow = dx * wf.flowDirX + dz * wf.flowDirZ;
      const acrossFlow = Math.abs(-dx * wf.flowDirZ + dz * wf.flowDirX);
      const smoothW = 1 - smoothstep(0, 42, distToCliff);
      if (alongFlow < -2.5) {
        const basinDepress = acrossFlow < wf.width * 0.7 ? -0.7 : 1.8;
        h = h * (1 - smoothW * 0.92) + (wf.topY + basinDepress) * (smoothW * 0.92);
      } else if (alongFlow >= -2.5 && alongFlow <= 6.0 && acrossFlow < wf.width * 0.9) {
        const t = (alongFlow + 2.5) / 8.5;
        const cliffH = wf.topY * (1 - t) + wf.bottomY * t;
        h = h * (1 - smoothW) + cliffH * smoothW;
      }
    }
  }

  // Flatten Audited 40 Capital & Emirate Spawn Plateaus (with AABB fast reject)
  for (let i = 0; i < SPAWN_PLATEAUS.length; i++) {
    const sp = SPAWN_PLATEAUS[i];
    const dx = x - sp.x;
    if (dx >= sp.radius || dx <= -sp.radius) continue;
    const dz = z - sp.z;
    if (dz >= sp.radius || dz <= -sp.radius) continue;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < sp.radius) {
      const smooth = smoothstep(sp.radius * 0.56, sp.radius, dist);
      h = sp.targetElevation * (1 - smooth) + h * smooth;
    }
  }

  // Oasis Basins
  const oasisDist = getOasisDistance(x, z);
  if (oasisDist < 28) {
    const oSmooth = smoothstep(14, 28, oasisDist);
    h = -1.3 * (1 - oSmooth) + h * oSmooth;
  }

  // River Channel Carve (only on land!)
  if (coastSd < 0.02) {
    const riverDist = getRiverDistance(x, z);
    if (riverDist < 15.0) {
      let isUpstreamOfWaterfall = false;
      for (let i = 0; i < WATERFALL_SITES.length; i++) {
        const wf = WATERFALL_SITES[i];
        const dx = x - wf.cliffX;
        if (dx > 36 || dx < -36) continue;
        const dz = z - wf.cliffZ;
        if (dz > 36 || dz < -36) continue;
        if (dx * dx + dz * dz < 1296 && dx * wf.flowDirX + dz * wf.flowDirZ < 0) {
          isUpstreamOfWaterfall = true;
          break;
        }
      }
      if (!isUpstreamOfWaterfall) {
        const rSmooth = smoothstep(5.5, 15.0, riverDist);
        h = -1.15 * (1 - rSmooth) + h * rSmooth;
      }
    }
  }

  // Audited Bridge Decks (with AABB fast reject)
  for (let i = 0; i < PRE_BRIDGES.length; i++) {
    const bc = PRE_BRIDGES[i];
    const dx = x - bc.x;
    if (dx >= bc.halfReach || dx <= -bc.halfReach) continue;
    const dz = z - bc.z;
    if (dz >= bc.halfReach || dz <= -bc.halfReach) continue;
    if (dx * dx + dz * dz < bc.halfReach * bc.halfReach) {
      const localX = Math.abs(dx * bc.cosNegR - dz * bc.sinNegR);
      const localZ = Math.abs(dx * bc.sinNegR + dz * bc.cosNegR);
      if (localX < 6.5 && localZ < bc.halfLen) {
        return 0.55;
      }
    }
  }

  // Deepen map rim cleanly into open ocean
  if (rimDist > 45500 || x * x + z * z > 62000 * 62000) {
    const rimFade = smoothstep(45500, 49500, rimDist);
    h = h * (1 - rimFade) + -3.8 * rimFade;
  }

  return Math.round(h * 100) / 100;
}

export function getTerrainSlope(x: number, z: number): number {
  const step = 2.5;
  const dhx = getTerrainHeight(x + step, z) - getTerrainHeight(x - step, z);
  const dhz = getTerrainHeight(x, z + step) - getTerrainHeight(x, z - step);
  return Math.hypot(dhx, dhz) / (step * 2);
}

/**
 * Classifies realistic physical biome (elevation + latitude snowline + orographic rain shadow + moisture + rivers).
 * Zero artificial north-snow or south-desert blocks!
 */
export function getBiomeAt(x: number, z: number): BiomeKind {
  const h = getTerrainHeight(x, z);
  if (Math.max(Math.abs(x), Math.abs(z)) > 48500 || h < -0.25) {
    if (getRiverDistance(x, z) < 16 && getCoastlineSignedDist(x, z) < -0.02) {
      return 'river_basin';
    }
    return 'ocean_coast';
  }
  if (getNearestWaterfallDistance(x, z) < 38) {
    return 'waterfall_gorge';
  }
  if (getRiverDistance(x, z) < 16 || getOasisDistance(x, z) < 30) {
    return 'river_basin';
  }

  const arid = getAridIntensityAt(x, z);
  const snowLine = getSnowlineElevationAt(x, z, arid);

  // High summits above dynamic latitude snowline become alpine snow peaks
  if (h > snowLine) {
    return 'northern_peaks';
  }

  // Mid-altitude rocky foothills & fault escarpments
  const spineDist = getMountainSpineDistance(x, z);
  if (h > Math.min(5.2, snowLine - 1.4) || (spineDist < 2600 && h > 3.2)) {
    return 'eastern_basalt';
  }

  // Realistic Middle East arid desert & dry steppe (Syria, Iraq, Jordan, Nafud, Northern Arabia)
  // Narrow irrigated river corridors & oases stay fertile!
  const moisture = getMoistureAt(x, z);
  const latNorm = Math.max(-1, Math.min(1, z / WORLD_HALF_SIZE));
  const nearWaterFertile = getRiverDistance(x, z) < 220 || getOasisDistance(x, z) < 170;
  const warmEnoughForDesert = latNorm > -0.46 && h < snowLine - 1.2;
  if (!nearWaterFertile && warmEnoughForDesert && (arid > 0.32 || (moisture < 0.34 && arid > 0.20))) {
    return 'southern_dunes';
  }

  // Cool dry northern steppes/plateaus fall back cleanly to rocky steppe or open plains
  if (!warmEnoughForDesert && arid > 0.38 && h > 2.6) {
    return 'eastern_basalt';
  }

  // Dense Forests strictly across humid Mediterranean Levant coast, Taurus/Zagros slopes & lush river valleys
  const forestDensity = getForestDensityAt(x, z, { elev: h, moisture, arid, snowLine });
  if (forestDensity >= 0.46 || (moisture > 0.62 && arid < 0.24)) {
    return 'western_forest';
  }

  return 'fertile_plains';
}

/**
 * Fast zero-recomputation biome classification directly from an already-sampled TerrainSurfaceSample.
 */
export function getBiomeFromSurfaceValues(
  x: number,
  z: number,
  h: number,
  riverDist: number,
  oasisDist: number,
  spineDist: number,
  arid: number,
  moisture: number,
  forestDensity: number,
  snowLine: number
): BiomeKind {
  if (Math.max(Math.abs(x), Math.abs(z)) > 48500 || h < -0.25) {
    return riverDist < 16 ? 'river_basin' : 'ocean_coast';
  }
  if (getNearestWaterfallDistance(x, z) < 38) {
    return 'waterfall_gorge';
  }
  if (riverDist < 16 || oasisDist < 30) {
    return 'river_basin';
  }
  if (h > snowLine) {
    return 'northern_peaks';
  }
  if (h > Math.min(5.2, snowLine - 1.4) || (spineDist < 2600 && h > 3.2)) {
    return 'eastern_basalt';
  }
  const latNorm = Math.max(-1, Math.min(1, z / WORLD_HALF_SIZE));
  const nearWaterFertile = riverDist < 220 || oasisDist < 170;
  const warmEnoughForDesert = latNorm > -0.46 && h < snowLine - 1.2;
  if (!nearWaterFertile && warmEnoughForDesert && (arid > 0.32 || (moisture < 0.34 && arid > 0.20))) {
    return 'southern_dunes';
  }
  if (!warmEnoughForDesert && arid > 0.38 && h > 2.6) {
    return 'eastern_basalt';
  }
  if (forestDensity >= 0.46 || (moisture > 0.62 && arid < 0.24)) {
    return 'western_forest';
  }
  return 'fertile_plains';
}

export function isBuildableTerrain(x: number, z: number): {
  ok: boolean;
  reasonAr?: string;
} {
  if (Math.abs(x) > WORLD_HALF_SIZE - 500 || Math.abs(z) > WORLD_HALF_SIZE - 500) {
    return {
      ok: false,
      reasonAr: 'الموقع خارج الحدود البحرية للمحيط القاري',
    };
  }
  const hCenter = getTerrainHeight(x, z);
  if (hCenter < 0.05) {
    return {
      ok: false,
      reasonAr: 'لا يمكن تشييد المباني في مياه البحار أو الأنهار',
    };
  }
  if (hCenter > 13.5) {
    return {
      ok: false,
      reasonAr: 'القمم الجبلية الشاهقة غير صالحة لتشييد الأساسات',
    };
  }
  const slope = getTerrainSlope(x, z);
  if (slope > 0.85) {
    return {
      ok: false,
      reasonAr: 'المنحدر الصخري حاد جداً — اختر سهلاً أو هضبة مستوية',
    };
  }
  return { ok: true };
}

export interface FortificationTerrainReport {
  buildable: boolean;
  reasonAr?: string;
  elevationM: number;
  slope: number;
  isHighGround: boolean;
  isWaterFedMoat: boolean;
  rangeBonusPct: number;
  damageBonusPct: number;
  defenseBonusPct: number;
  rating: 'citadel_peak' | 'river_fort' | 'flat_plain' | 'steep_hazard';
  labelAr: string;
  hintAr: string;
}

/**
 * Evaluates the tactical fortification value of any terrain coordinate for castles,
 * walls, gates, moats, and towers (elevation high-ground advantage, natural river-fed
 * water moats, and cliff/slope protection).
 */
export function evaluateFortificationTerrain(x: number, z: number): FortificationTerrainReport {
  const check = isBuildableTerrain(x, z);
  const elevationM = Math.round(getTerrainHeight(x, z) * 10) / 10;
  const slope = Math.round(getTerrainSlope(x, z) * 100) / 100;
  const surf = sampleTerrainSurfaceAt(x, z, elevationM);
  const isWaterFedMoat = surf.riverDist < 48 || surf.oasisDist < 44;

  if (!check.ok) {
    return {
      buildable: false,
      reasonAr: check.reasonAr,
      elevationM,
      slope,
      isHighGround: false,
      isWaterFedMoat,
      rangeBonusPct: 0,
      damageBonusPct: 0,
      defenseBonusPct: 0,
      rating: 'steep_hazard',
      labelAr: 'تضاريس وعرة — غير صالحة للبناء',
      hintAr: check.reasonAr ?? 'اختر هضبة أو سهلاً مستوياً لتشييد الحصن',
    };
  }

  const geo = getGeologicalFeatureAt(x, z, elevationM);

  if (elevationM >= 4.2 || (geo.kind === 'mesa' && elevationM >= 3.2)) {
    const isMesa = geo.kind === 'mesa';
    return {
      buildable: true,
      elevationM,
      slope,
      isHighGround: true,
      isWaterFedMoat,
      rangeBonusPct: isMesa ? 26 : 24,
      damageBonusPct: isMesa ? 24 : 22,
      defenseBonusPct: isMesa ? 24 : 20,
      rating: 'citadel_peak',
      labelAr: isMesa
        ? 'هضبة صخرية متدرجة (حصن طبيعي فائق)'
        : 'ذروة قلعة حصينة (أفضلية ارتفاع عظمى)',
      hintAr: isMesa
        ? '+26% مدى الأبراج، +24% متانة للأسوار وجرف صخري يعيق آلات الحصار.'
        : '+24% مدى الأبراج والرمي، +22% ضرر علوي، والمنحدر يبطئ آلات الحصار.',
    };
  }

  if (elevationM >= 2.35 || geo.kind === 'outcrop') {
    const isOutcrop = geo.kind === 'outcrop';
    return {
      buildable: true,
      elevationM,
      slope,
      isHighGround: true,
      isWaterFedMoat,
      rangeBonusPct: isOutcrop ? 18 : 14,
      damageBonusPct: isOutcrop ? 18 : 15,
      defenseBonusPct: isOutcrop ? 16 : 12,
      rating: 'citadel_peak',
      labelAr: isOutcrop ? 'نتوء صخري حصين' : 'هضبة استراتيجية مرتفعة',
      hintAr: isOutcrop
        ? '+18% مدى رمي ومتانة إضافية فوق النتوء الصخري الطبيعي.'
        : '+14% مدى الأبراج والبوابات و+15% أفضلية رمي من المرتفع.',
    };
  }

  if (isWaterFedMoat) {
    return {
      buildable: true,
      elevationM,
      slope,
      isHighGround: false,
      isWaterFedMoat: true,
      rangeBonusPct: 5,
      damageBonusPct: 0,
      defenseBonusPct: 18,
      rating: 'river_fort',
      labelAr: 'ضفة محمية بالماء (خندق مائي طبيعي)',
      hintAr: 'الخنادق هنا تمتلئ بالماء تلقائياً وتُبطئ العدو -62% مع ضرر مستمر.',
    };
  }

  return {
    buildable: true,
    elevationM,
    slope,
    isHighGround: false,
    isWaterFedMoat: false,
    rangeBonusPct: 0,
    damageBonusPct: 0,
    defenseBonusPct: 0,
    rating: 'flat_plain',
    labelAr: geo.kind === 'canyon' ? 'قاع أخدود صخري (ممر خانق)' : 'سهل مفتوح صالح للتوسع والتحصين',
    hintAr:
      geo.kind === 'canyon'
        ? 'ممر أخدودي ضيق مثالي لبناء بوابة وأسوار لسد تقدم الجيوش.'
        : 'سهل مثالي لمدّ الأسوار والبوابات وحفر الخنادق حول المعقل.',
  };
}

/**
 * Deterministic Procedural Resource Nodes Generator for any 256m x 256m Sector (sx, sz).
 */
export function getDeterministicNodesInSector(
  sx: number,
  sz: number,
  resourceDeltas?: Record<string, number>
): ResourceNode[] {
  const originX = sx * CHUNK_SIZE;
  const originZ = sz * CHUNK_SIZE;

  if (
    Math.abs(originX) > WORLD_HALF_SIZE - CHUNK_SIZE ||
    Math.abs(originZ) > WORLD_HALF_SIZE - CHUNK_SIZE
  ) {
    return [];
  }

  const sectorRand = hash2D(sx * 37 + 19, sz * 53 - 7);
  const candidateCount = sectorRand < 0.25 ? 1 : sectorRand < 0.72 ? 2 : 3;
  const nodes: ResourceNode[] = [];

  for (let i = 0; i < candidateCount; i++) {
    const rx = hash2D(sx * 101 + i * 17, sz * 211 + i * 31);
    const rz = hash2D(sx * 313 + i * 43, sz * 127 + i * 59);
    const px = Math.round(originX + 24 + rx * (CHUNK_SIZE - 48));
    const pz = Math.round(originZ + 24 + rz * (CHUNK_SIZE - 48));

    const h = getTerrainHeight(px, pz);
    if (h < 0.15 || h > 13.0) continue;
    if (getTerrainSlope(px, pz) > 0.72) continue;

    if (SPAWN_PLATEAUS.some((sp) => Math.hypot(px - sp.x, pz - sp.z) < 16)) continue;

    const biome = getBiomeAt(px, pz);
    const roll = hash2D(sx * 419 + i * 71, sz * 509 + i * 97);

    let kind: ResourceNode['kind'] = 'food';
    if (biome === 'western_forest') {
      kind = roll < 0.65 ? 'wood' : roll < 0.80 ? 'food' : roll < 0.92 ? 'cloth' : 'horses';
    } else if (biome === 'northern_peaks') {
      kind = roll < 0.55 ? 'stone' : roll < 0.8 ? 'gold' : roll < 0.92 ? 'wood' : 'horses';
    } else if (biome === 'eastern_basalt') {
      kind = roll < 0.45 ? 'stone' : roll < 0.75 ? 'gold' : roll < 0.9 ? 'horses' : 'wood';
    } else if (biome === 'southern_dunes') {
      kind = roll < 0.42 ? 'gold' : roll < 0.68 ? 'cloth' : roll < 0.85 ? 'horses' : 'stone';
    } else if (biome === 'river_basin' || biome === 'waterfall_gorge') {
      kind = roll < 0.42 ? 'food' : roll < 0.65 ? 'cloth' : roll < 0.85 ? 'gold' : 'wood';
    } else {
      kind =
        roll < 0.25
          ? 'wood'
          : roll < 0.48
            ? 'food'
            : roll < 0.66
              ? 'cloth'
              : roll < 0.82
                ? 'horses'
                : roll < 0.92
                  ? 'stone'
                  : 'gold';
    }

    const maxAmount =
      kind === 'gold'
        ? 3800
        : kind === 'stone'
          ? 3400
          : kind === 'wood'
            ? biome === 'western_forest'
              ? 4200
              : 3200
            : 2800;
    const nodeId = `sec_${sx}_${sz}_r${i}`;
    const remaining =
      resourceDeltas && typeof resourceDeltas[nodeId] === 'number'
        ? Math.max(0, resourceDeltas[nodeId])
        : maxAmount;

    if (remaining <= 0) continue;

    nodes.push({
      id: nodeId,
      kind,
      x: px,
      z: pz,
      amount: remaining,
      maxAmount,
    });
  }

  return nodes;
}

export function getMovementSpeedMultiplierAt(
  x: number,
  z: number,
  unitKind: UnitKind,
  climate: ClimateKind
): number {
  const biome = getBiomeAt(x, z);
  const localClimate = getEffectiveClimateAt(x, z, climate);
  const bSpec = BIOME_SPECS[biome];
  const cSpec = CLIMATE_SPECS[localClimate] ?? CLIMATE_SPECS.temperate_clear;

  const roadDist = getRoadDistance(x, z);
  const onHighway = roadDist < 48;
  const roadBonus = onHighway ? 1.45 : 1.0;

  const cavalryBonus =
    (unitKind === 'knight' || unitKind === 'commander') &&
    (biome === 'fertile_plains' || onHighway)
      ? 1.12
      : 1.0;

  // Tactical terrain slope penalty: steep hillsides slow assault columns and heavily drag siege engines
  const slope = getTerrainSlope(x, z);
  const isSiege = unitKind === 'battering_ram' || unitKind === 'trebuchet';
  let slopePenalty = 1.0;
  if (slope > 0.28) {
    const excess = Math.min(0.65, slope - 0.28);
    slopePenalty = isSiege
      ? Math.max(0.38, 1.0 - excess * 1.15)
      : Math.max(0.56, 1.0 - excess * 0.72);
  }
  const siegeOffroadPenalty = isSiege && !onHighway ? 0.88 : 1.0;

  return (
    bSpec.speedMultiplier *
    cSpec.speedModifier *
    roadBonus *
    cavalryBonus *
    slopePenalty *
    siegeOffroadPenalty
  );
}

export interface MarchRouteStats {
  totalDistanceM: number;
  estimatedSeconds: number;
  avgSpeedMps: number;
  passesThroughMountains: boolean;
  passesThroughDesert: boolean;
  usesHighway: boolean;
}

export function calculateMarchRouteStats(
  startX: number,
  startZ: number,
  waypoints: Array<{ x: number; z: number }>,
  baseUnitSpeedMps: number,
  unitKind: UnitKind,
  climate: ClimateKind
): MarchRouteStats {
  let prevX = startX;
  let prevZ = startZ;
  let totalDist = 0;
  let totalSec = 0;
  let passesMountains = false;
  let passesDesert = false;
  let usesHighway = false;

  for (const wp of waypoints) {
    const segLen = Math.hypot(wp.x - prevX, wp.z - prevZ);
    if (segLen <= 0.01) continue;
    totalDist += segLen;

    const samples = Math.max(1, Math.min(24, Math.ceil(segLen / 1200)));
    const subLen = segLen / samples;
    for (let s = 0; s < samples; s++) {
      const t = (s + 0.5) / samples;
      const sx = prevX + (wp.x - prevX) * t;
      const sz = prevZ + (wp.z - prevZ) * t;
      const b = getBiomeAt(sx, sz);
      if (b === 'northern_peaks' || b === 'eastern_basalt') passesMountains = true;
      if (b === 'southern_dunes') passesDesert = true;
      if (getRoadDistance(sx, sz) < 48) usesHighway = true;

      const mult = getMovementSpeedMultiplierAt(sx, sz, unitKind, climate);
      const effSpeed = Math.max(1.5, baseUnitSpeedMps * mult);
      totalSec += subLen / effSpeed;
    }

    prevX = wp.x;
    prevZ = wp.z;
  }

  return {
    totalDistanceM: Math.round(totalDist),
    estimatedSeconds: Math.max(1, Math.round(totalSec)),
    avgSpeedMps: totalSec > 0 ? Math.round((totalDist / totalSec) * 10) / 10 : baseUnitSpeedMps,
    passesThroughMountains: passesMountains,
    passesThroughDesert: passesDesert,
    usesHighway,
  };
}

export function formatDurationAr(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} ث`;
  const mins = Math.floor(s / 60);
  const remS = s % 60;
  if (mins < 60) return remS > 0 ? `${mins} د ${remS} ث` : `${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  const remM = mins % 60;
  if (hrs < 24) return remM > 0 ? `${hrs} س ${remM} د` : `${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  const remH = hrs % 24;
  return remH > 0 ? `${days} يوم ${remH} س` : `${days} يوم`;
}

export function formatDistanceAr(meters: number): string {
  const m = Math.max(0, Math.round(meters));
  if (m < 1000) return `${m} م`;
  if (m < 10_000) return `${(m / 1000).toFixed(1)} كم`;
  return `${Math.round(m / 1000)} كم`;
}

/**
 * 8-point Arabic compass bearing from origin to target (world +X = East, -Z = North)
 */
export function formatBearingAr(dx: number, dz: number): string {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  if (deg >= 337.5 || deg < 22.5) return 'شمال';
  if (deg < 67.5) return 'شمال شرق';
  if (deg < 112.5) return 'شرق';
  if (deg < 157.5) return 'جنوب شرق';
  if (deg < 202.5) return 'جنوب';
  if (deg < 247.5) return 'جنوب غرب';
  if (deg < 292.5) return 'غرب';
  return 'شمال غرب';
}

export function getTheaterRegionAr(x: number, z: number): string {
  if (x < -25000 && z > -24000 && z < 23000) return 'ساحل القدس والشام الغربي';
  if (x > 22500 && z > 10500) return 'ولاية الرصافة وشط العرب';
  if (z < -24500) return 'ولاية نصيبين وثغر الشمال';
  if (x > 24000 && z < 2000) return 'شعاب الوادي الأسود وتخوم زاغروس';
  if (z > 23500) return 'صحراء النفود وتخوم ولاية الحجاز';
  if (x < -14500) return 'ولاية الشام الداخلي';
  if (x > 11500) return 'ولاية مرقاب وبلاد الرافدين';
  if (z < -12000) return 'الجزيرة الفراتية';
  return 'بادية الشام وحصن القفول';
}

export interface SpatialLocationSummary {
  regionAr: string;
  nearestLandmark: MacroLandmark;
  landmarkDistanceM: number;
  relativeDirFromLandmarkAr: string;
  nearestTownAr: string;
  nearestTownDistanceM: number;
  headlineAr: string;
}

export function describeSpatialLocationAt(x: number, z: number): SpatialLocationSummary {
  let bestLm = MACRO_LANDMARKS[0];
  let bestLmDist = Infinity;
  for (let i = 0; i < MACRO_LANDMARKS.length; i++) {
    const lm = MACRO_LANDMARKS[i];
    const d = Math.hypot(x - lm.x, z - lm.z);
    if (d < bestLmDist) {
      bestLmDist = d;
      bestLm = lm;
    }
  }

  let bestTown = SPAWN_PLATEAUS[0];
  let bestTownDist = Infinity;
  for (let i = 0; i < SPAWN_PLATEAUS.length; i++) {
    const sp = SPAWN_PLATEAUS[i];
    const d = Math.hypot(x - sp.x, z - sp.z);
    if (d < bestTownDist) {
      bestTownDist = d;
      bestTown = sp;
    }
  }

  const regionAr = getTheaterRegionAr(x, z);
  const shortLm = bestLm.nameAr.split(' (')[0];
  const shortTown = bestTown.continentNameAr.split(' (')[0];
  const relDir = formatBearingAr(x - bestLm.x, z - bestLm.z);

  let headlineAr: string;
  if (bestLmDist < 550) {
    headlineAr = `في قلب ${shortLm}`;
  } else if (bestTownDist < 480 && bestTownDist < bestLmDist * 0.6) {
    headlineAr = `نطاق ${shortTown} · ${formatDistanceAr(bestLmDist)} ${relDir} ${shortLm}`;
  } else if (bestLmDist < 2200) {
    headlineAr = `قرب ${shortLm} (${formatDistanceAr(bestLmDist)} ${relDir})`;
  } else {
    headlineAr = `${regionAr} · ${formatDistanceAr(bestLmDist)} ${relDir} ${shortLm}`;
  }

  return {
    regionAr,
    nearestLandmark: bestLm,
    landmarkDistanceM: bestLmDist,
    relativeDirFromLandmarkAr: relDir,
    nearestTownAr: shortTown,
    nearestTownDistanceM: bestTownDist,
    headlineAr,
  };
}

