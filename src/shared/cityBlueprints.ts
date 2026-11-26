import type { StructureKind, StructureLevel, UnitKind } from './protocol';

export interface PlannedCityBuilding {
  kind: StructureKind;
  level: StructureLevel;
  dx: number;
  dz: number;
  rot: number;
  exact?: boolean;
}

export interface CityAvenueSpec {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  width: number;
  isCanal?: boolean;
  hasSouqCanopies?: boolean;
  hasColonnade?: boolean;
  hasTrees?: boolean;
}

export type CityMonumentKind =
  | 'mirqab_round_imperial'
  | 'damascus_umayyad_straight'
  | 'aleppo_glacis_citadel'
  | 'basra_harbor_canals'
  | 'jerusalem_sacred_terrace'
  | 'mosul_leaning_minaret'
  | 'antioch_mountain_bastion'
  | 'kufa_rahba_grid'
  | 'nusaybin_hex_fortress'
  | 'homs_basalt_citadel'
  | 'raqqa_horseshoe_gate'
  | 'tikrit_cliff_rampart'
  | 'acre_crusader_port'
  | 'marid_oasis_fort'
  | 'palmyra_colonnade_oasis'
  | 'black_valley_prison';

export interface BespokeCityBlueprint {
  cityId: string;
  plateauIndex: number;
  monumentKind: CityMonumentKind;
  outerRadius: number;
  plazaRadius: number;
  treeKind: 'palm' | 'cypress_olive' | 'mixed_oasis' | 'barren';
  customPalette?: {
    cobbleMain: number;
    cobbleAccent: number;
    avenueStone: number;
    awningColors: number[];
    waterHex?: number;
  };
  avenues: CityAvenueSpec[];
  ringRoads: Array<{ radius: number; width: number; arcStart?: number; arcEnd?: number }>;
  orchardZones: Array<{ x: number; z: number; radius: number; density: number }>;
  buildings: PlannedCityBuilding[];
  garrison: UnitKind[];
}

/**
 * Helper to generate an interlocking straight wall run between two points with optional gatehouse & corner watchtowers.
 */
function addWallLine(
  out: PlannedCityBuilding[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  opts: {
    wallLevel: StructureLevel;
    towerLevel: StructureLevel;
    gateIndex?: number;
    startTower?: boolean;
    endTower?: boolean;
    midTowerEvery?: number;
    step?: number;
    moatOffset?: { nx: number; nz: number; level: StructureLevel };
  }
): void {
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (dist < 2) return;
  const step = opts.step ?? 4.2;
  const count = Math.max(2, Math.round(dist / step));
  const rot = Math.atan2(-dz, dx);
  const gateIdx = opts.gateIndex ?? -999;

  for (let i = 0; i <= count; i++) {
    if (i === 0 && !opts.startTower) continue;
    if (i === count && !opts.endTower) continue;
    const t = i / count;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const isStartEnd = i === 0 || i === count;
    const isMidTower =
      !isStartEnd &&
      i !== gateIdx &&
      Math.abs(i - gateIdx) > 1 &&
      Boolean(opts.midTowerEvery && i % opts.midTowerEvery === 0);
    const isGate = i === gateIdx;

    const kind: StructureKind = isStartEnd || isMidTower
      ? 'watchtower'
      : isGate
        ? 'gatehouse'
        : 'stone_wall';

    out.push({
      kind,
      level: kind === 'stone_wall' ? opts.wallLevel : opts.towerLevel,
      dx: px,
      dz: pz,
      rot,
      exact: true,
    });

    if (opts.moatOffset && !isGate && !isStartEnd && Math.abs(i - gateIdx) >= 2) {
      out.push({
        kind: 'moat_trench',
        level: opts.moatOffset.level,
        dx: px + opts.moatOffset.nx * 3.35,
        dz: pz + opts.moatOffset.nz * 3.35,
        rot,
        exact: true,
      });
    }
  }
}

/**
 * Helper to generate a polygonal/circular fortified city wall ring (e.g. Round City of Mirqab,
 * Hexagonal Nusaybin, Horseshoe Raqqa, Crescent Mosul).
 */
function addPolygonRingWall(
  out: PlannedCityBuilding[],
  vertices: Array<[number, number]>,
  opts: {
    wallLevel: StructureLevel;
    towerLevel: StructureLevel;
    closed?: boolean;
    gateEdges?: number[];
    moatEdges?: number[];
    midTowerEvery?: number;
  }
): void {
  const closed = opts.closed !== false;
  const edgeCount = closed ? vertices.length : vertices.length - 1;
  const gateSet = new Set(opts.gateEdges ?? []);
  const moatSet = new Set(opts.moatEdges ?? []);

  for (let e = 0; e < edgeCount; e++) {
    const [ax, az] = vertices[e];
    const [bx, bz] = vertices[(e + 1) % vertices.length];
    const dist = Math.hypot(bx - ax, bz - az);
    const segs = Math.max(2, Math.round(dist / 4.2));
    const midX = (ax + bx) * 0.5;
    const midZ = (az + bz) * 0.5;
    const outLen = Math.hypot(midX, midZ) || 1;
    const nx = midX / outLen;
    const nz = midZ / outLen;

    addWallLine(out, ax, az, bx, bz, {
      wallLevel: opts.wallLevel,
      towerLevel: opts.towerLevel,
      gateIndex: gateSet.has(e) ? Math.floor(segs / 2) : -999,
      startTower: true,
      endTower: !closed && e === edgeCount - 1,
      midTowerEvery: opts.midTowerEvery,
      moatOffset: moatSet.has(e) ? { nx, nz, level: opts.wallLevel } : undefined,
    });
  }
}

/**
 * Helper to lay out a residential quarter block cleanly without overlapping roads.
 */
function addHouseCluster(
  out: PlannedCityBuilding[],
  coords: Array<[number, number, StructureLevel, number, StructureKind?]>
): void {
  for (const [dx, dz, level, rot, kind] of coords) {
    out.push({
      kind: kind ?? 'house',
      level,
      dx,
      dz,
      rot,
      exact: true,
    });
  }
}

// ============================================================================
// 1. MIRQAB — CAPITAL OF THE SINDHI STATE (Inspired by the Round City of Baghdad)
//    Concentric Circular Imperial Metropolis, 4 Grand Radial Boulevards, Double Rings
// ============================================================================
function buildMirqabBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Imperial Inner Core (Sultan Hassan Royal Palace Keep + Grand Mosque + Diwan Citadel)
    { kind: 'keep', level: 3, dx: 0, dz: 0, rot: 0, exact: true },
    { kind: 'temple', level: 3, dx: -11, dz: -9, rot: 0, exact: true },
    { kind: 'market', level: 3, dx: 11, dz: -9, rot: 0, exact: true },
    { kind: 'barracks', level: 3, dx: 11, dz: 10, rot: -Math.PI / 2, exact: true },
    { kind: 'war_tent', level: 2, dx: -11, dz: 10, rot: 0, exact: true },
    // Inner Diwan Citadel Guard Watchtowers framing the Royal Plaza
    { kind: 'watchtower', level: 3, dx: -15, dz: -15, rot: 0, exact: true },
    { kind: 'watchtower', level: 3, dx: 15, dz: -15, rot: 0, exact: true },
    { kind: 'watchtower', level: 3, dx: 15, dz: 15, rot: 0, exact: true },
    { kind: 'watchtower', level: 3, dx: -15, dz: 15, rot: 0, exact: true },

    // Grand Bazaar Markets flanking the Imperial Gate Boulevards
    { kind: 'market', level: 3, dx: -24, dz: -7.5, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: 24, dz: 7.5, rot: Math.PI, exact: true },
    { kind: 'market', level: 2, dx: -7.5, dz: 25, rot: Math.PI / 2, exact: true },

    // Imperial Military & Siege Quarter (East-South Sector)
    { kind: 'barracks', level: 3, dx: 25, dz: -15, rot: 0, exact: true },
    { kind: 'horse_stable', level: 3, dx: 31, dz: -8, rot: -Math.PI / 2, exact: true },
    { kind: 'siege_workshop', level: 3, dx: 29, dz: 18, rot: 0, exact: true },

    // Outer Agricultural & Supply Suburbs beyond the Grand Moat
    { kind: 'farm', level: 3, dx: -56, dz: -16, rot: 0, exact: true },
    { kind: 'farm', level: 2, dx: -56, dz: 16, rot: 0, exact: true },
    { kind: 'farm', level: 2, dx: 56, dz: -14, rot: 0, exact: true },
    { kind: 'livestock_ranch', level: 2, dx: 55, dz: 18, rot: 0, exact: true },
    { kind: 'quarry', level: 2, dx: -18, dz: -56, rot: 0, exact: true },
    { kind: 'lumber_camp', level: 2, dx: 22, dz: -56, rot: 0, exact: true },
  ];

  // Dense Concentric Residential Quarters (22 Real Lv.2-3 Courtyard Houses in 4 Quadrants)
  addHouseCluster(buildings, [
    // NW Quarter (Karkh / Scholars' Quarter)
    [-22, -22, 3, 0],
    [-30, -15, 3, Math.PI / 2],
    [-14, -29, 2, 0],
    [-27, -27, 2, Math.PI],
    [-35, -8, 2, Math.PI / 2],
    // NE Quarter (Rusafa Noble Villas)
    [22, -24, 3, 0],
    [13, -31, 3, -Math.PI / 2],
    [29, -24, 2, Math.PI],
    [7, -23, 2, 0],
    [36, -17, 2, -Math.PI / 2],
    // SW Quarter (Bazaar Artisans)
    [-22, 22, 3, 0],
    [-30, 14, 3, Math.PI / 2],
    [-16, 30, 2, Math.PI],
    [-28, 27, 2, 0],
    [-35, 9, 2, Math.PI / 2],
    [-23, 7.5, 2, Math.PI],
    // SE Quarter (River Merchants)
    [22, 22, 3, 0],
    [13, 31, 2, -Math.PI / 2],
    [28, 27, 2, Math.PI],
    [35, 9, 2, -Math.PI / 2],
    [-7.5, -24, 2, 0],
    [7.5, 25, 2, Math.PI],
  ]);

  // Monumental 12-Sided Circular Imperial Outer Wall (R = 45.5m) with 4 Grand Gates + Water Moat!
  const ringVerts: Array<[number, number]> = [];
  const sides = 12;
  const R = 45.5;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / 12;
    ringVerts.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  addPolygonRingWall(buildings, ringVerts, {
    wallLevel: 2,
    towerLevel: 3,
    closed: true,
    gateEdges: [2, 5, 8, 11], // South, West, North, East grand imperial gates
    moatEdges: [0, 1, 3, 4, 6, 7, 9, 10],
  });

  return {
    cityId: 'ai_sindhi_mirqab',
    plateauIndex: 0,
    monumentKind: 'mirqab_round_imperial',
    outerRadius: 68,
    plazaRadius: 15,
    treeKind: 'palm',
    customPalette: {
      cobbleMain: 0xcab082,
      cobbleAccent: 0x9e7a48,
      avenueStone: 0xdfca9e,
      awningColors: [0x0f766e, 0xd97706, 0x991b1b, 0x1d4ed8, 0xb45309],
      waterHex: 0x1e6078,
    },
    avenues: [
      { ax: -60, az: 0, bx: 60, bz: 0, width: 4.8, hasSouqCanopies: true, hasTrees: true },
      { ax: 0, az: -60, bx: 0, bz: 60, width: 4.8, hasSouqCanopies: true, hasTrees: true },
      { ax: -34, az: -34, bx: 34, bz: 34, width: 2.6 },
      { ax: 34, az: -34, bx: -34, bz: 34, width: 2.6 },
    ],
    ringRoads: [
      { radius: 17.5, width: 3.0 },
      { radius: 34.5, width: 3.2 },
    ],
    orchardZones: [
      { x: -56, z: -26, radius: 14, density: 18 },
      { x: 56, z: 24, radius: 14, density: 16 },
      { x: -52, z: 28, radius: 12, density: 14 },
    ],
    buildings,
    garrison: [
      'worker', 'worker', 'worker', 'worker',
      'commander', 'commander', 'knight', 'knight', 'knight', 'knight',
      'infantry', 'infantry', 'infantry', 'infantry',
      'spearman', 'spearman', 'spearman',
      'archer', 'archer', 'archer', 'archer',
      'trebuchet',
    ],
  };
}

// ============================================================================
// 2. DAMASCUS — WALLED ANCIENT METROPOLIS (Via Recta / Straight Street + Ghouta)
//    Elongated Rectangular Old City, NW Corner Citadel, Grand Umayyad Mosque, Long Souq Axis
// ============================================================================
function buildDamascusBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // NW Citadel of Damascus (Qal'at Dimashq — positioned in NW corner, NOT center!)
    { kind: 'keep', level: 3, dx: -30, dz: -18, rot: 0, exact: true },
    { kind: 'barracks', level: 3, dx: -20, dz: -20, rot: 0 },
    { kind: 'siege_workshop', level: 2, dx: -32, dz: -9, rot: Math.PI / 2 },
    { kind: 'horse_stable', level: 2, dx: -20, dz: -11, rot: 0 },

    // Grand Umayyad Sanctuary in Central-North Heart
    { kind: 'temple', level: 3, dx: 4, dz: -14, rot: 0, exact: true },

    // Long Hamidiyah / Straight Street Bazaar Spine (3 Markets along E-W Axis!)
    { kind: 'market', level: 3, dx: -8, dz: 2, rot: 0, exact: true },
    { kind: 'market', level: 3, dx: 12, dz: 2, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: 28, dz: 2, rot: 0 },

    // Eastern Bab Sharqi Garrison
    { kind: 'barracks', level: 2, dx: 33, dz: -15, rot: -Math.PI / 2 },

    // Famous Lush Ghouta Orchards & Farms Wrapping the Old City!
    { kind: 'farm', level: 3, dx: -54, dz: 14, rot: 0 },
    { kind: 'farm', level: 3, dx: 54, dz: -10, rot: 0 },
    { kind: 'farm', level: 2, dx: 54, dz: 12, rot: 0 },
    { kind: 'farm', level: 2, dx: -14, dz: 42, rot: 0 },
    { kind: 'livestock_ranch', level: 2, dx: 18, dz: 42, rot: 0 },
    { kind: 'quarry', level: 2, dx: -10, dz: -42, rot: 0 },
  ];

  // Dense Damascene Old Quarters (Al-Qaymariyah, Bab Tuma, Shaghour, Al-Amara — 18 Real Houses!)
  addHouseCluster(buildings, [
    // North-East Quarter (Bab Tuma & Qaymariyah)
    [16, -21, 3, 0],
    [24, -21, 3, Math.PI / 2],
    [16, -11, 2, Math.PI],
    [25, -11, 2, 0],
    [-6, -21, 3, 0],
    [-6, -11, 2, Math.PI / 2],
    // South-West Quarter (Midan & Bab al-Jabiyah)
    [-32, 11, 3, 0],
    [-23, 11, 3, Math.PI / 2],
    [-14, 12, 2, 0],
    [-31, 21, 2, Math.PI],
    [-21, 21, 3, 0],
    [-11, 22, 2, Math.PI / 2],
    // South-East Quarter (Al-Shaghour & Bab Sharqi)
    [4, 14, 3, 0],
    [13, 14, 3, Math.PI / 2],
    [23, 14, 2, 0],
    [33, 14, 2, Math.PI],
    [8, 23, 2, 0],
    [21, 23, 3, -Math.PI / 2],
  ]);

  // Elongated Rectangular Walled City (90m x 64m) with 4 Historic Gates
  addPolygonRingWall(
    buildings,
    [
      [-44, -31],
      [44, -31],
      [44, 31],
      [-44, 31],
    ],
    {
      wallLevel: 2,
      towerLevel: 3,
      closed: true,
      gateEdges: [0, 1, 2, 3], // Bab al-Faradis (N), Bab Sharqi (E), Bab Saghir (S), Bab al-Jabiyah (W)
      moatEdges: [0, 3],
      midTowerEvery: 4,
    }
  );

  return {
    cityId: 'ai_sindhi_damascus',
    plateauIndex: 5,
    monumentKind: 'damascus_umayyad_straight',
    outerRadius: 68,
    plazaRadius: 13,
    treeKind: 'cypress_olive',
    customPalette: {
      cobbleMain: 0xbcb2a0,
      cobbleAccent: 0x6b6359, // Classic Shami ablaq dark/light limestone contrast
      avenueStone: 0xd9d1c2,
      awningColors: [0x991b1b, 0x047857, 0xb45309, 0x1e3a8a, 0xd97706],
      waterHex: 0x227082,
    },
    avenues: [
      // Via Recta (الشارع المستقيم) running dead-straight East to West!
      { ax: -58, az: 2, bx: 58, bz: 2, width: 4.6, hasSouqCanopies: true, hasColonnade: true },
      // North-South Barada Avenue
      { ax: 0, az: -46, bx: 0, bz: 46, width: 3.8, hasTrees: true },
      // Barada Water Canal skirting the northern walls
      { ax: -54, az: -35, bx: 54, bz: -35, width: 3.4, isCanal: true, hasTrees: true },
    ],
    ringRoads: [],
    orchardZones: [
      { x: -56, z: -8, radius: 15, density: 20 },
      { x: 56, z: 0, radius: 16, density: 22 },
      { x: 0, z: 44, radius: 15, density: 18 },
      { x: 24, z: -42, radius: 12, density: 14 },
    ],
    buildings,
    garrison: [
      'worker', 'worker',
      'commander', 'knight', 'knight',
      'infantry', 'infantry', 'infantry',
      'spearman', 'spearman', 'archer', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 3. ALEPPO — ELEVATED CITADEL ON STEPPED GLACIS + SWEEPING COVERED SOUQS
// ============================================================================
function buildAleppoBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Elevated Central-East Citadel of Aleppo (Keep + Inner Barracks + Guard Towers)
    { kind: 'keep', level: 3, dx: 8, dz: -4, rot: 0, exact: true },
    { kind: 'barracks', level: 3, dx: 16, dz: -11, rot: -Math.PI / 2 },
    { kind: 'watchtower', level: 3, dx: -1, dz: -12, rot: 0, exact: true },
    { kind: 'watchtower', level: 3, dx: 17, dz: 3, rot: 0, exact: true },

    // Grand Covered Souq Al-Madina stretching West from Citadel Gate!
    { kind: 'market', level: 3, dx: -9, dz: 3, rot: 0, exact: true },
    { kind: 'market', level: 3, dx: -20, dz: 3, rot: 0, exact: true },
    { kind: 'temple', level: 3, dx: -16, dz: -12, rot: 0, exact: true },

    // Military & Horse Yards (South-East)
    { kind: 'barracks', level: 2, dx: 18, dz: 18, rot: 0 },
    { kind: 'horse_stable', level: 2, dx: 26, dz: 12, rot: -Math.PI / 2 },
    { kind: 'siege_workshop', level: 2, dx: 25, dz: -20, rot: 0 },

    // Outer Limestone Quarries & Olive Farms
    { kind: 'quarry', level: 3, dx: 48, dz: -18, rot: 0 },
    { kind: 'farm', level: 2, dx: -48, dz: 16, rot: 0 },
    { kind: 'farm', level: 2, dx: -48, dz: -14, rot: 0 },
    { kind: 'livestock_ranch', level: 2, dx: 10, dz: 48, rot: 0 },
  ];

  // Dense Grey-Limestone Halabi Quarters wrapping the Citadel Mound (16 Real Houses)
  addHouseCluster(buildings, [
    [-28, -19, 3, 0],
    [-20, -24, 3, Math.PI / 2],
    [-8, -24, 2, 0],
    [4, -25, 2, Math.PI],
    [-31, -7, 3, Math.PI / 2],
    [-31, 11, 3, 0],
    [-22, 14, 3, Math.PI / 2],
    [-12, 15, 2, 0],
    [-2, 16, 2, Math.PI],
    [-24, 24, 2, 0],
    [-12, 26, 3, Math.PI / 2],
    [0, 27, 2, 0],
    [10, 26, 2, -Math.PI / 2],
    [29, -4, 2, 0],
    [29, 3, 2, Math.PI],
    [18, -24, 2, 0],
  ]);

  // Asymmetric 8-Sided Halabi Fortified Perimeter (82m x 76m) with Moat
  addPolygonRingWall(
    buildings,
    [
      [-39, -22],
      [-20, -37],
      [22, -37],
      [40, -18],
      [40, 20],
      [22, 37],
      [-22, 37],
      [-39, 19],
    ],
    {
      wallLevel: 2,
      towerLevel: 3,
      closed: true,
      gateEdges: [1, 3, 5, 7], // Bab al-Nasr, Bab al-Hadid, Bab Qinnasrin, Bab Antakya
      moatEdges: [0, 2, 4, 6],
    }
  );

  return {
    cityId: 'ai_sindhi_aleppo',
    plateauIndex: 6,
    monumentKind: 'aleppo_glacis_citadel',
    outerRadius: 64,
    plazaRadius: 14,
    treeKind: 'cypress_olive',
    customPalette: {
      cobbleMain: 0xb8b2a6,
      cobbleAccent: 0x827d73,
      avenueStone: 0xd4cfc4,
      awningColors: [0x065f46, 0xb45309, 0x7c2d12, 0x374151, 0xd97706],
    },
    avenues: [
      { ax: -52, az: 3, bx: 10, bz: 3, width: 4.5, hasSouqCanopies: true },
      { ax: -14, az: -48, bx: -14, bz: 48, width: 3.6, hasSouqCanopies: true },
      { ax: 8, az: 8, bx: 48, bz: 8, width: 3.4 },
    ],
    ringRoads: [{ radius: 22.5, width: 2.8 }],
    orchardZones: [
      { x: -50, z: 22, radius: 13, density: 15 },
      { x: -48, z: -22, radius: 12, density: 14 },
      { x: 46, z: 26, radius: 12, density: 12 },
    ],
    buildings,
    garrison: [
      'worker', 'worker',
      'commander', 'knight', 'knight',
      'infantry', 'infantry', 'infantry',
      'spearman', 'spearman', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 4. RUSAFA — BASRA (SHATT AL-ARAB MARITIME PORT & CANAL METROPOLIS)
//    Twin Water Canals, Southern Shipwright Docks, Bustling Spice & Pearl Bazaars
// ============================================================================
function buildRusafaBasraBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Governor's Maritime Diwan & Grand Mirbad Mosque
    { kind: 'keep', level: 3, dx: 0, dz: -12, rot: 0, exact: true },
    { kind: 'temple', level: 3, dx: -15, dz: -14, rot: 0, exact: true },
    { kind: 'barracks', level: 3, dx: 15, dz: -14, rot: 0 },

    // Grand Waterfront Spice & Maritime Bazaars along the Harbor Quay (South)
    { kind: 'market', level: 3, dx: -16, dz: 14, rot: 0, exact: true },
    { kind: 'market', level: 3, dx: 0, dz: 14, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: 16, dz: 14, rot: 0, exact: true },

    // Naval Supply, Stables & Siege Yards
    { kind: 'barracks', level: 2, dx: -28, dz: -8, rot: Math.PI / 2 },
    { kind: 'horse_stable', level: 2, dx: 29, dz: -12, rot: -Math.PI / 2 },
    { kind: 'siege_workshop', level: 2, dx: 28, dz: 4, rot: 0 },
    { kind: 'lumber_camp', level: 3, dx: -30, dz: 14, rot: 0 },

    // Lush Date-Palm Plantations & Shatt al-Arab Farms
    { kind: 'farm', level: 3, dx: -52, dz: -16, rot: 0 },
    { kind: 'farm', level: 3, dx: 52, dz: -16, rot: 0 },
    { kind: 'farm', level: 2, dx: -16, dz: -46, rot: 0 },
    { kind: 'livestock_ranch', level: 2, dx: 18, dz: -46, rot: 0 },
    { kind: 'quarry', level: 2, dx: 50, dz: 10, rot: 0 },
  ];

  // 16 Dense Canal-Side Merchant & Shipwright Courtyard Houses
  addHouseCluster(buildings, [
    [-28, -22, 3, 0],
    [-18, -25, 3, Math.PI / 2],
    [-8, -25, 2, 0],
    [8, -25, 2, Math.PI],
    [19, -25, 3, 0],
    [29, -22, 2, -Math.PI / 2],
    [-25, 2, 3, 0],
    [-15, 2, 3, Math.PI / 2],
    [-6, 2, 2, 0],
    [6, 2, 2, Math.PI],
    [16, 2, 3, 0],
    [28, 16, 2, -Math.PI / 2],
    [-34, 4, 2, Math.PI / 2],
    [-12, -3, 2, 0],
    [12, -3, 2, Math.PI],
    [0, -25, 2, 0],
  ]);

  // U-Shaped Landward Fortification Wall (North, West, East) + Water Moats + Southern Sea-Towers flanking Harbor!
  addWallLine(buildings, -42, -34, 42, -34, {
    wallLevel: 2,
    towerLevel: 3,
    gateIndex: 10,
    startTower: true,
    endTower: true,
    midTowerEvery: 5,
    moatOffset: { nx: 0, nz: -1, level: 2 },
  });
  addWallLine(buildings, -42, -34, -42, 24, {
    wallLevel: 2,
    towerLevel: 3,
    gateIndex: 7,
    startTower: false,
    endTower: true,
    midTowerEvery: 4,
    moatOffset: { nx: -1, nz: 0, level: 2 },
  });
  addWallLine(buildings, 42, -34, 42, 24, {
    wallLevel: 2,
    towerLevel: 3,
    gateIndex: 7,
    startTower: false,
    endTower: true,
    midTowerEvery: 4,
    moatOffset: { nx: 1, nz: 0, level: 2 },
  });
  // Harbor Mouth Sea-Chain Bastions (South)
  buildings.push(
    { kind: 'watchtower', level: 3, dx: -26, dz: 28, rot: 0, exact: true },
    { kind: 'watchtower', level: 3, dx: 26, dz: 28, rot: 0, exact: true }
  );

  return {
    cityId: 'ai_sindhi_rusafa',
    plateauIndex: 1,
    monumentKind: 'basra_harbor_canals',
    outerRadius: 66,
    plazaRadius: 12,
    treeKind: 'palm',
    customPalette: {
      cobbleMain: 0xc2a57a,
      cobbleAccent: 0x8f714a,
      avenueStone: 0xd8be94,
      awningColors: [0x0f766e, 0x0369a1, 0xd97706, 0x991b1b, 0xca8a04],
      waterHex: 0x1a5f7a,
    },
    avenues: [
      // Grand Harbor Quay Promenade
      { ax: -42, az: 22, bx: 42, bz: 22, width: 5.2, hasSouqCanopies: true },
      // Central Shatt Canal Cutting East-West through Merchant Quarters
      { ax: -40, az: -6, bx: 40, bz: -6, width: 3.6, isCanal: true, hasTrees: true },
      // North-South Grand Mirbad Boulevard
      { ax: 0, az: -48, bx: 0, bz: 26, width: 4.4, hasTrees: true },
    ],
    ringRoads: [],
    orchardZones: [
      { x: -54, z: -22, radius: 16, density: 22 },
      { x: 54, z: -22, radius: 16, density: 22 },
      { x: 0, z: -48, radius: 15, density: 18 },
    ],
    buildings,
    garrison: [
      'worker', 'worker', 'worker',
      'commander', 'knight', 'knight',
      'infantry', 'infantry', 'infantry',
      'spearman', 'spearman', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 5. JERUSALEM — FOUR-QUARTER GOLDEN-LIMESTONE WALLED METROPOLIS
//    Eastern Sacred Dome Terrace, Western Crusader Citadel, Central Cardo Bazaar
// ============================================================================
function buildJerusalemBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Western Royal Citadel (قلعة بيت المقدس / Tower of David)
    { kind: 'keep', level: 3, dx: -27, dz: 2, rot: 0, exact: true },
    { kind: 'barracks', level: 3, dx: -26, dz: -10, rot: 0, exact: true },
    { kind: 'horse_stable', level: 3, dx: -26, dz: 14, rot: 0, exact: true },
    { kind: 'siege_workshop', level: 2, dx: -17, dz: 24, rot: 0, exact: true },
    { kind: 'watchtower', level: 3, dx: -19, dz: -4, rot: 0, exact: true },
    { kind: 'watchtower', level: 3, dx: -19, dz: 8, rot: 0, exact: true },

    // Eastern Raised Sacred Esplanade & Great Dome Sanctuary
    { kind: 'temple', level: 3, dx: 22, dz: -2, rot: 0, exact: true },

    // Central Colonnaded Cardo Markets
    { kind: 'market', level: 3, dx: -4, dz: -8, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: -4, dz: 10, rot: 0, exact: true },
    { kind: 'barracks', level: 2, dx: 12, dz: -24, rot: 0, exact: true },
    { kind: 'war_tent', level: 2, dx: 22, dz: 12, rot: 0, exact: true },

    // Terraced Olive Hills & Limestone Quarries outside the Walls
    { kind: 'farm', level: 2, dx: 52, dz: -12, rot: 0, exact: true },
    { kind: 'farm', level: 2, dx: -52, dz: 12, rot: 0, exact: true },
    { kind: 'quarry', level: 3, dx: -12, dz: -50, rot: 0, exact: true },
    { kind: 'livestock_ranch', level: 2, dx: 14, dz: 50, rot: 0, exact: true },
  ];

  // Four Historic Stone-Vaulted Quarters (18 Real Golden-Limestone Houses)
  addHouseCluster(buildings, [
    // NW Quarter
    [-16, -24, 3, 0],
    [-6, -24, 3, Math.PI / 2],
    [-16, -14, 2, 0],
    [-13, -3, 2, Math.PI],
    // NE Quarter
    [4, -24, 3, 0],
    [4, -14, 2, Math.PI / 2],
    [24, -22, 3, 0],
    [31, -15, 2, -Math.PI / 2],
    [13, -12, 3, 0],
    // SW Quarter
    [-16, 14, 3, 0],
    [-25, 24, 2, Math.PI / 2],
    [-6, 24, 3, 0],
    [-13, 5, 2, Math.PI],
    // SE Quarter
    [6, 14, 3, 0],
    [16, 22, 2, Math.PI / 2],
    [28, 22, 2, 0],
    [31, -4, 3, -Math.PI / 2],
    [31, 9, 2, Math.PI / 2],
  ]);

  // Monumental Trapezoidal Golden-Limestone City Wall (80m x 76m) with 4 Historic Gates
  addPolygonRingWall(
    buildings,
    [
      [-39, -36],
      [39, -34],
      [41, 34],
      [-37, 36],
    ],
    {
      wallLevel: 2,
      towerLevel: 3,
      closed: true,
      gateEdges: [0, 1, 2, 3], // Damascus Gate (N), Lions Gate (E), Zion Gate (S), Jaffa Gate (W)
      moatEdges: [0],
      midTowerEvery: 4,
    }
  );

  return {
    cityId: 'ai_crusader_jerusalem',
    plateauIndex: 2,
    monumentKind: 'jerusalem_sacred_terrace',
    outerRadius: 62,
    plazaRadius: 14,
    treeKind: 'cypress_olive',
    customPalette: {
      cobbleMain: 0xd9c8a2, // Iconic Jerusalem golden limestone
      cobbleAccent: 0xb29d76,
      avenueStone: 0xeadcc0,
      awningColors: [0xb91c1c, 0xf8fafc, 0xd97706, 0x1e3a8a, 0x991b1b],
    },
    avenues: [
      // The Roman Cardo (North-South colonnaded bazaar spine)
      { ax: -4, az: -48, bx: -4, bz: 48, width: 4.4, hasSouqCanopies: true, hasColonnade: true },
      // East-West Via Dolorosa / Jaffa-to-Terrace Axis
      { ax: -48, az: 0, bx: 48, bz: 0, width: 4.0, hasSouqCanopies: true },
    ],
    ringRoads: [],
    orchardZones: [
      { x: 52, z: 6, radius: 14, density: 18 }, // Mount of Olives grove
      { x: -50, z: -18, radius: 12, density: 13 },
    ],
    buildings,
    garrison: [
      'worker', 'worker', 'worker',
      'commander', 'knight', 'knight', 'knight', 'knight',
      'infantry', 'infantry', 'infantry', 'infantry',
      'spearman', 'spearman', 'spearman', 'archer', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 6. MOSUL — CRESCENT TIGRIS FORTRESS WITH LEANING MINARET (AL-HADBA)
// ============================================================================
function buildMosulBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Northern Bash Tabia River Citadel
    { kind: 'keep', level: 2, dx: 20, dz: -18, rot: 0, exact: true },
    { kind: 'barracks', level: 2, dx: 12, dz: -22, rot: 0 },
    { kind: 'horse_stable', level: 2, dx: 24, dz: -6, rot: -Math.PI / 2 },
    // Great Mosque of al-Nuri (Leaning Minaret center)
    { kind: 'temple', level: 2, dx: -4, dz: -4, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: -4, dz: 10, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: 12, dz: 10, rot: 0 },
    { kind: 'siege_workshop', level: 2, dx: -22, dz: -16, rot: 0 },
    { kind: 'farm', level: 2, dx: -46, dz: 12, rot: 0 },
    { kind: 'quarry', level: 2, dx: -44, dz: -16, rot: 0 },
    { kind: 'livestock_ranch', level: 2, dx: 44, dz: 14, rot: 0 },
  ];

  addHouseCluster(buildings, [
    [-22, -4, 2, 0],
    [-14, -14, 2, Math.PI / 2],
    [-4, -20, 2, 0],
    [4, -14, 2, Math.PI],
    [-24, 8, 2, 0],
    [-15, 16, 2, Math.PI / 2],
    [-4, 22, 2, 0],
    [8, 21, 2, -Math.PI / 2],
    [18, 18, 2, 0],
    [24, 4, 2, Math.PI],
    [-16, 2, 2, 0],
    [8, -2, 2, Math.PI / 2],
  ]);

  // Riverfront Crescent Wall (flat East Tigris bank, curved West/North/South landward arc)
  addPolygonRingWall(
    buildings,
    [
      [34, -30],
      [34, 30],
      [6, 36],
      [-24, 28],
      [-36, 4],
      [-28, -24],
      [4, -34],
    ],
    {
      wallLevel: 2,
      towerLevel: 2,
      closed: true,
      gateEdges: [1, 3, 5],
      moatEdges: [2, 4],
    }
  );

  return {
    cityId: 'ai_sindhi_mosul',
    plateauIndex: 16,
    monumentKind: 'mosul_leaning_minaret',
    outerRadius: 58,
    plazaRadius: 11,
    treeKind: 'cypress_olive',
    avenues: [
      { ax: -46, az: 4, bx: 44, bz: 4, width: 4.0, hasSouqCanopies: true },
      { ax: 0, az: -44, bx: 0, bz: 44, width: 3.6, hasTrees: true },
    ],
    ringRoads: [{ radius: 19, width: 2.6 }],
    orchardZones: [
      { x: -46, z: 20, radius: 12, density: 14 },
      { x: 44, z: 0, radius: 11, density: 12 },
    ],
    buildings,
    garrison: [
      'worker', 'worker', 'commander', 'knight', 'knight',
      'infantry', 'infantry', 'spearman', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 7. ANTIOCH — DIAMOND TERRACED MOUNTAIN-RIDGE CRUSADER FORTRESS
// ============================================================================
function buildAntiochBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Upper Eastern Mountain Citadel
    { kind: 'keep', level: 2, dx: 20, dz: 0, rot: -Math.PI / 2, exact: true },
    { kind: 'barracks', level: 2, dx: 14, dz: -12, rot: 0 },
    { kind: 'barracks', level: 2, dx: 14, dz: 12, rot: 0 },
    { kind: 'siege_workshop', level: 2, dx: 4, dz: -20, rot: 0 },
    // Lower Western Cathedral & Orontes Merchant Quarter
    { kind: 'temple', level: 2, dx: -10, dz: -6, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: -12, dz: 8, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: 0, dz: 4, rot: 0 },
    { kind: 'horse_stable', level: 2, dx: -2, dz: 20, rot: 0 },
    { kind: 'farm', level: 2, dx: -44, dz: 10, rot: 0 },
    { kind: 'lumber_camp', level: 2, dx: -42, dz: -16, rot: 0 },
    { kind: 'quarry', level: 2, dx: 42, dz: -16, rot: 0 },
  ];

  addHouseCluster(buildings, [
    [-24, -4, 2, 0],
    [-22, 6, 2, Math.PI / 2],
    [-18, -14, 2, 0],
    [-14, 18, 2, Math.PI],
    [-4, -15, 2, 0],
    [-6, 16, 2, Math.PI / 2],
    [4, 14, 2, 0],
    [5, -8, 2, -Math.PI / 2],
    [-24, 14, 2, 0],
    [-12, -22, 2, Math.PI / 2],
  ]);

  // Diamond Mountain-Wall Perimeter (74m x 68m)
  addPolygonRingWall(
    buildings,
    [
      [0, -35],
      [37, 0],
      [0, 35],
      [-37, 0],
    ],
    {
      wallLevel: 2,
      towerLevel: 2,
      closed: true,
      gateEdges: [2, 3], // Orontes Bridge Gate (SW) & St. Paul Gate (NW)
      midTowerEvery: 4,
    }
  );

  return {
    cityId: 'ai_crusader_antioch',
    plateauIndex: 7,
    monumentKind: 'antioch_mountain_bastion',
    outerRadius: 56,
    plazaRadius: 11,
    treeKind: 'cypress_olive',
    customPalette: {
      cobbleMain: 0xb6ad9c,
      cobbleAccent: 0x7d7468,
      avenueStone: 0xd0c7b7,
      awningColors: [0x991b1b, 0xfde047, 0xf8fafc, 0x1e3a8a],
    },
    avenues: [
      { ax: -46, az: 2, bx: 24, bz: 2, width: 4.0, hasSouqCanopies: true, hasColonnade: true },
      { ax: -6, az: -36, bx: -6, bz: 36, width: 3.4 },
    ],
    ringRoads: [],
    orchardZones: [
      { x: -46, z: 16, radius: 12, density: 14 },
      { x: -44, z: -18, radius: 12, density: 14 },
    ],
    buildings,
    garrison: [
      'worker', 'commander', 'knight', 'knight', 'knight',
      'infantry', 'infantry', 'spearman', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 8. KUFA — GRAND ORTHOGONAL TRIBAL GRID (KHITAT AL-KUFA + RAHBA PLAZA)
// ============================================================================
function buildKufaBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Attached Dar al-Imara (Keep) & Great Mosque of Kufa at Central Rahba Square
    { kind: 'keep', level: 2, dx: 0, dz: 6, rot: 0, exact: true },
    { kind: 'temple', level: 3, dx: 0, dz: -7, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: -14, dz: 0, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: 14, dz: 0, rot: 0, exact: true },
    { kind: 'barracks', level: 2, dx: 15, dz: 15, rot: 0 },
    { kind: 'horse_stable', level: 2, dx: -15, dz: 15, rot: 0 },
    { kind: 'farm', level: 2, dx: 48, dz: -10, rot: 0 },
    { kind: 'farm', level: 2, dx: 48, dz: 12, rot: 0 },
    { kind: 'livestock_ranch', level: 2, dx: -48, dz: 8, rot: 0 },
    { kind: 'quarry', level: 2, dx: -14, dz: -46, rot: 0 },
  ];

  // Disciplined Orthogonal Tribal Blocks (Khitat — 14 Real Houses)
  addHouseCluster(buildings, [
    [-26, -24, 2, 0],
    [-16, -24, 2, 0],
    [-26, -14, 2, Math.PI / 2],
    [16, -24, 2, 0],
    [26, -24, 2, 0],
    [26, -14, 2, -Math.PI / 2],
    [-26, 14, 2, 0],
    [-26, 24, 2, Math.PI / 2],
    [-14, 25, 2, 0],
    [26, 14, 2, 0],
    [26, 24, 2, -Math.PI / 2],
    [14, 25, 2, 0],
    [-6, 25, 2, 0],
    [6, -25, 2, 0],
  ]);

  // Square Planned Wall (74m x 74m) with 4 Wide Orthogonal Gate Avenues
  addPolygonRingWall(
    buildings,
    [
      [-37, -37],
      [37, -37],
      [37, 37],
      [-37, 37],
    ],
    {
      wallLevel: 2,
      towerLevel: 2,
      closed: true,
      gateEdges: [0, 1, 2, 3],
      midTowerEvery: 4,
    }
  );

  return {
    cityId: 'ai_sindhi_kufa',
    plateauIndex: 25,
    monumentKind: 'kufa_rahba_grid',
    outerRadius: 60,
    plazaRadius: 15,
    treeKind: 'palm',
    avenues: [
      { ax: -50, az: 0, bx: 50, bz: 0, width: 4.8, hasSouqCanopies: true, hasTrees: true },
      { ax: 0, az: -50, bx: 0, bz: 50, width: 4.8, hasTrees: true },
      { ax: -34, az: -19, bx: 34, bz: -19, width: 2.6 },
      { ax: -34, az: 19, bx: 34, bz: 19, width: 2.6 },
    ],
    ringRoads: [],
    orchardZones: [
      { x: 50, z: 0, radius: 15, density: 20 },
      { x: -48, z: -18, radius: 12, density: 14 },
    ],
    buildings,
    garrison: [
      'worker', 'worker', 'commander', 'knight', 'knight',
      'infantry', 'infantry', 'spearman', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 9. NUSAYBIN — DOUBLE-MOATED HEXAGONAL NORTHERN FRONTIER FORTRESS
// ============================================================================
function buildNusaybinBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    { kind: 'keep', level: 2, dx: 0, dz: 0, rot: 0, exact: true },
    { kind: 'barracks', level: 2, dx: -12, dz: -9, rot: 0 },
    { kind: 'barracks', level: 2, dx: 12, dz: -9, rot: 0 },
    { kind: 'horse_stable', level: 2, dx: 14, dz: 9, rot: 0 },
    { kind: 'siege_workshop', level: 2, dx: -14, dz: 9, rot: 0 },
    { kind: 'war_tent', level: 2, dx: 0, dz: -16, rot: 0 },
    { kind: 'temple', level: 2, dx: -10, dz: 20, rot: 0 },
    { kind: 'market', level: 2, dx: 10, dz: 20, rot: 0 },
    { kind: 'farm', level: 2, dx: -44, dz: 14, rot: 0 },
    { kind: 'quarry', level: 2, dx: 44, dz: -12, rot: 0 },
    { kind: 'livestock_ranch', level: 2, dx: 42, dz: 16, rot: 0 },
  ];

  addHouseCluster(buildings, [
    [-23, -4, 2, 0],
    [-22, 6, 2, Math.PI / 2],
    [23, -4, 2, 0],
    [22, 6, 2, -Math.PI / 2],
    [-18, -18, 2, 0],
    [18, -18, 2, Math.PI],
    [-19, 18, 2, 0],
    [19, 18, 2, Math.PI],
    [0, 22, 2, 0],
    [-8, -22, 2, 0],
  ]);

  // Regular Hexagonal Frontier Bastion (R = 36m) with Northern & Western Moats
  const hexVerts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    hexVerts.push([Math.cos(a) * 36.5, Math.sin(a) * 36.5]);
  }
  addPolygonRingWall(buildings, hexVerts, {
    wallLevel: 2,
    towerLevel: 3,
    closed: true,
    gateEdges: [1, 4], // South & North Frontier Gates
    moatEdges: [3, 4, 5],
  });

  return {
    cityId: 'ai_sindhi_nusaybin',
    plateauIndex: 3,
    monumentKind: 'nusaybin_hex_fortress',
    outerRadius: 56,
    plazaRadius: 11,
    treeKind: 'cypress_olive',
    avenues: [
      { ax: 0, az: -46, bx: 0, bz: 46, width: 4.2, hasSouqCanopies: true },
      { ax: -36, az: 0, bx: 36, bz: 0, width: 3.4 },
    ],
    ringRoads: [{ radius: 18, width: 2.6 }],
    orchardZones: [{ x: -46, z: 16, radius: 12, density: 13 }],
    buildings,
    garrison: [
      'worker', 'commander', 'knight', 'knight',
      'infantry', 'infantry', 'spearman', 'spearman', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 10. HOMS — BLACK-BASALT CITADEL MOUND & NORTHERN VOLCANIC-STONE TOWN
// ============================================================================
function buildHomsBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Southern Black-Basalt Citadel Mound
    { kind: 'keep', level: 2, dx: 0, dz: 19, rot: 0, exact: true },
    { kind: 'barracks', level: 2, dx: -12, dz: 18, rot: 0 },
    { kind: 'horse_stable', level: 2, dx: 13, dz: 18, rot: 0 },
    // Central Basalt Town Square & Grand Mosque of Khalid ibn al-Walid
    { kind: 'temple', level: 2, dx: -8, dz: -8, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: 8, dz: -6, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: 0, dz: 4, rot: 0 },
    { kind: 'farm', level: 2, dx: -44, dz: -10, rot: 0 },
    { kind: 'farm', level: 2, dx: 44, dz: -10, rot: 0 },
    { kind: 'livestock_ranch', level: 2, dx: 42, dz: 14, rot: 0 },
  ];

  addHouseCluster(buildings, [
    [-22, -16, 2, 0],
    [-14, -21, 2, Math.PI / 2],
    [0, -22, 2, 0],
    [14, -21, 2, -Math.PI / 2],
    [22, -14, 2, 0],
    [-23, -4, 2, Math.PI / 2],
    [-22, 6, 2, 0],
    [23, -2, 2, -Math.PI / 2],
    [22, 8, 2, 0],
    [-12, 4, 2, 0],
  ]);

  addPolygonRingWall(
    buildings,
    [
      [-32, -26],
      [0, -34],
      [32, -26],
      [34, 16],
      [18, 33],
      [-18, 33],
      [-34, 16],
    ],
    {
      wallLevel: 2,
      towerLevel: 2,
      closed: true,
      gateEdges: [0, 3, 6],
    }
  );

  return {
    cityId: 'ai_emirate_homs',
    plateauIndex: 8,
    monumentKind: 'homs_basalt_citadel',
    outerRadius: 56,
    plazaRadius: 11,
    treeKind: 'cypress_olive',
    customPalette: {
      cobbleMain: 0x67625c, // Distinctive dark volcanic basalt of Homs!
      cobbleAccent: 0x45413e,
      avenueStone: 0x87817a,
      awningColors: [0x7c3aed, 0xfde047, 0x991b1b, 0x0f766e],
    },
    avenues: [
      { ax: 0, az: -44, bx: 0, bz: 36, width: 4.0, hasSouqCanopies: true },
      { ax: -42, az: -4, bx: 42, bz: -4, width: 3.6, hasSouqCanopies: true },
    ],
    ringRoads: [],
    orchardZones: [
      { x: -46, z: -12, radius: 13, density: 15 },
      { x: 46, z: -12, radius: 13, density: 15 },
    ],
    buildings,
    garrison: [
      'worker', 'commander', 'knight', 'knight',
      'infantry', 'infantry', 'spearman', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 11. RAQQA (AL-RAFIQAH) — ICONIC HORSESHOE / D-SHAPED BRICK WALL CITY
// ============================================================================
function buildRaqqaBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Qasr al-Banat Keep & Great Mosque of al-Mansur
    { kind: 'keep', level: 2, dx: 14, dz: -6, rot: 0, exact: true },
    { kind: 'temple', level: 2, dx: -4, dz: -10, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: 0, dz: 10, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: -16, dz: 10, rot: 0 },
    { kind: 'barracks', level: 2, dx: 18, dz: 10, rot: 0 },
    { kind: 'horse_stable', level: 2, dx: -20, dz: -6, rot: Math.PI / 2 },
    { kind: 'farm', level: 2, dx: -44, dz: 18, rot: 0 },
    { kind: 'farm', level: 2, dx: 44, dz: 18, rot: 0 },
    { kind: 'livestock_ranch', level: 2, dx: 0, dz: -44, rot: 0 },
  ];

  addHouseCluster(buildings, [
    [-16, -18, 2, 0],
    [-4, -23, 2, Math.PI / 2],
    [10, -21, 2, 0],
    [-25, 4, 2, Math.PI / 2],
    [-12, 2, 2, 0],
    [6, 2, 2, Math.PI],
    [-22, 16, 2, 0],
    [-8, 17, 2, Math.PI / 2],
    [10, 17, 2, 0],
    [24, 2, 2, -Math.PI / 2],
  ]);

  // Iconic Horseshoe / D-Shape (Flat Southern Euphrates Wall + Semicircular Northern Brick Arc)
  addPolygonRingWall(
    buildings,
    [
      [-34, 24],
      [34, 24],
      [34, -4],
      [24, -26],
      [0, -35],
      [-24, -26],
      [-34, -4],
    ],
    {
      wallLevel: 2,
      towerLevel: 2,
      closed: true,
      gateEdges: [0, 1, 5], // Euphrates Gate (S), Baghdad Gate (SE), North Gate
      moatEdges: [3, 4],
    }
  );

  return {
    cityId: 'ai_sindhi_raqqa',
    plateauIndex: 17,
    monumentKind: 'raqqa_horseshoe_gate',
    outerRadius: 56,
    plazaRadius: 11,
    treeKind: 'palm',
    avenues: [
      { ax: -42, az: 10, bx: 42, bz: 10, width: 4.0, hasSouqCanopies: true },
      { ax: 0, az: -42, bx: 0, bz: 36, width: 3.6, hasTrees: true },
    ],
    ringRoads: [{ radius: 19, width: 2.4, arcStart: Math.PI, arcEnd: Math.PI * 2 }],
    orchardZones: [
      { x: -44, z: 22, radius: 12, density: 14 },
      { x: 44, z: 22, radius: 12, density: 14 },
    ],
    buildings,
    garrison: [
      'worker', 'knight', 'knight', 'infantry', 'infantry', 'spearman', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 12. TIKRIT — LONG NARROW CLIFF-EDGE TIGRIS CITADEL CORRIDOR
// ============================================================================
function buildTikritBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Eastern Cliff Citadel Core
    { kind: 'keep', level: 2, dx: 12, dz: 0, rot: 0, exact: true },
    { kind: 'barracks', level: 2, dx: 12, dz: -14, rot: 0 },
    { kind: 'barracks', level: 2, dx: 12, dz: 14, rot: 0 },
    { kind: 'temple', level: 2, dx: -6, dz: -10, rot: 0 },
    { kind: 'market', level: 2, dx: -6, dz: 6, rot: 0, exact: true },
    { kind: 'horse_stable', level: 2, dx: -8, dz: 22, rot: 0 },
    { kind: 'farm', level: 2, dx: -34, dz: 8, rot: 0 },
    { kind: 'quarry', level: 2, dx: -32, dz: -16, rot: 0 },
  ];

  addHouseCluster(buildings, [
    [-14, -22, 2, 0],
    [0, -24, 2, Math.PI / 2],
    [-16, -12, 2, 0],
    [-16, 0, 2, Math.PI / 2],
    [-16, 12, 2, 0],
    [2, 22, 2, Math.PI],
    [-14, 22, 2, 0],
    [0, -2, 2, Math.PI / 2],
  ]);

  // Elongated North-South Corridor Wall (48m wide x 72m long)
  addPolygonRingWall(
    buildings,
    [
      [-24, -36],
      [24, -36],
      [24, 36],
      [-24, 36],
    ],
    {
      wallLevel: 2,
      towerLevel: 2,
      closed: true,
      gateEdges: [0, 2, 3], // North Highway Gate, South Highway Gate, West Steppe Gate
      midTowerEvery: 4,
    }
  );

  return {
    cityId: 'ai_sindhi_tikrit',
    plateauIndex: 23,
    monumentKind: 'tikrit_cliff_rampart',
    outerRadius: 52,
    plazaRadius: 10,
    treeKind: 'palm',
    avenues: [
      { ax: -2, az: -46, bx: -2, bz: 46, width: 4.2, hasSouqCanopies: true },
      { ax: -34, az: 0, bx: 18, bz: 0, width: 3.4 },
    ],
    ringRoads: [],
    orchardZones: [{ x: -36, z: 12, radius: 11, density: 12 }],
    buildings,
    garrison: [
      'worker', 'knight', 'infantry', 'infantry', 'spearman', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 13. ACRE — DOUBLE-WALLED CRUSADER SEA-HARBOR FORTRESS
// ============================================================================
function buildAcreBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Inner Hospitaller Citadel (North-Center)
    { kind: 'keep', level: 2, dx: 4, dz: -14, rot: 0, exact: true },
    { kind: 'barracks', level: 2, dx: 18, dz: -14, rot: 0 },
    { kind: 'siege_workshop', level: 2, dx: 18, dz: -2, rot: 0 },
    // Pisan & Venetian Sea-Port Bazaars facing the Western/Southern Sea Docks
    { kind: 'market', level: 2, dx: -14, dz: 10, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: 2, dz: 14, rot: 0, exact: true },
    { kind: 'temple', level: 2, dx: -12, dz: -10, rot: 0 },
    { kind: 'horse_stable', level: 2, dx: 18, dz: 12, rot: 0 },
    { kind: 'farm', level: 2, dx: 44, dz: -8, rot: 0 },
    { kind: 'lumber_camp', level: 2, dx: 44, dz: 14, rot: 0 },
  ];

  addHouseCluster(buildings, [
    [-22, -20, 2, 0],
    [-8, -22, 2, Math.PI / 2],
    [-22, -4, 2, 0],
    [-22, 6, 2, Math.PI / 2],
    [-4, 2, 2, 0],
    [8, 2, 2, Math.PI],
    [-12, 21, 2, 0],
    [14, 22, 2, -Math.PI / 2],
    [22, -22, 2, 0],
  ]);

  // Heavy Landward Walls on North & East (with Deep Moat!) + Sea-Chain Harbor Towers on West/South
  addWallLine(buildings, -32, -32, 34, -32, {
    wallLevel: 2,
    towerLevel: 3,
    gateIndex: 8,
    startTower: true,
    endTower: true,
    midTowerEvery: 4,
    moatOffset: { nx: 0, nz: -1, level: 2 },
  });
  addWallLine(buildings, 34, -32, 34, 30, {
    wallLevel: 2,
    towerLevel: 3,
    gateIndex: 7,
    startTower: false,
    endTower: true,
    midTowerEvery: 4,
    moatOffset: { nx: 1, nz: 0, level: 2 },
  });
  addWallLine(buildings, -32, -32, -32, 8, {
    wallLevel: 2,
    towerLevel: 2,
    startTower: false,
    endTower: true,
  });
  // Harbor Chain Tower ("Tower of the Flies")
  buildings.push(
    { kind: 'watchtower', level: 3, dx: -28, dz: 28, rot: 0, exact: true },
    { kind: 'watchtower', level: 3, dx: 8, dz: 30, rot: 0, exact: true }
  );

  return {
    cityId: 'ai_crusader_acre',
    plateauIndex: 10,
    monumentKind: 'acre_crusader_port',
    outerRadius: 56,
    plazaRadius: 11,
    treeKind: 'cypress_olive',
    customPalette: {
      cobbleMain: 0xc8bca6,
      cobbleAccent: 0x8e8372,
      avenueStone: 0xded4c2,
      awningColors: [0xdc2626, 0xf8fafc, 0x1d4ed8, 0xd97706],
      waterHex: 0x195e7d,
    },
    avenues: [
      { ax: -26, az: 20, bx: 28, bz: 20, width: 4.8, hasSouqCanopies: true },
      { ax: 0, az: -42, bx: 0, bz: 24, width: 3.8, hasSouqCanopies: true },
      { ax: -24, az: -2, bx: 44, bz: -2, width: 3.4 },
    ],
    ringRoads: [],
    orchardZones: [{ x: 46, z: 4, radius: 12, density: 13 }],
    buildings,
    garrison: [
      'worker', 'commander', 'knight', 'knight',
      'infantry', 'infantry', 'spearman', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 14. DUMAT AL-JANDAL — MARID STONE CITADEL & HEJAZI OASIS PALM TOWN
// ============================================================================
function buildHejazMaridBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Marid Stone Fortress on Central Rocky Rise
    { kind: 'keep', level: 2, dx: 0, dz: -8, rot: 0, exact: true },
    { kind: 'temple', level: 2, dx: -11, dz: 6, rot: 0, exact: true }, // Umar Mosque
    { kind: 'market', level: 2, dx: 11, dz: 6, rot: 0, exact: true }, // Hajj Caravan Souq
    { kind: 'barracks', level: 2, dx: 13, dz: -10, rot: 0 },
    { kind: 'horse_stable', level: 2, dx: -14, dz: -10, rot: 0 },
    { kind: 'livestock_ranch', level: 2, dx: 34, dz: 12, rot: 0 },
    { kind: 'farm', level: 2, dx: -34, dz: 12, rot: 0 },
    { kind: 'quarry', level: 2, dx: 0, dz: -36, rot: 0 },
  ];

  addHouseCluster(buildings, [
    [-21, 0, 2, 0],
    [-20, 12, 2, Math.PI / 2],
    [-8, 17, 2, 0],
    [4, 17, 2, Math.PI],
    [19, 14, 2, 0],
    [21, 0, 2, -Math.PI / 2],
    [-12, -20, 1, 0, 'bedouin_tent'],
    [12, -20, 1, 0, 'bedouin_tent'],
    [-28, -14, 1, Math.PI / 4, 'bedouin_tent'],
  ]);

  // Compact Stone Oasis Ring Wall (56m x 52m)
  addPolygonRingWall(
    buildings,
    [
      [-28, -26],
      [28, -26],
      [28, 26],
      [-28, 26],
    ],
    {
      wallLevel: 1,
      towerLevel: 2,
      closed: true,
      gateEdges: [0, 2],
    }
  );

  return {
    cityId: 'ai_sindhi_hejaz',
    plateauIndex: 35,
    monumentKind: 'marid_oasis_fort',
    outerRadius: 50,
    plazaRadius: 10,
    treeKind: 'palm',
    customPalette: {
      cobbleMain: 0xdccbb0,
      cobbleAccent: 0xb9a382,
      avenueStone: 0xeae0cb,
      awningColors: [0xb45309, 0x0f766e, 0xfef3c7, 0x9a3412],
    },
    avenues: [
      { ax: 0, az: -38, bx: 0, bz: 38, width: 3.8, hasSouqCanopies: true, hasTrees: true },
      { ax: -34, az: 6, bx: 34, bz: 6, width: 3.4, hasTrees: true },
    ],
    ringRoads: [],
    orchardZones: [
      { x: -34, z: 16, radius: 14, density: 20 },
      { x: 34, z: 16, radius: 14, density: 20 },
    ],
    buildings,
    garrison: [
      'worker', 'knight', 'knight', 'infantry', 'spearman', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 15. PALMYRA (TADMUR) — GRAND COLONNADED DESERT OASIS & CARAVAN EMIRATE
// ============================================================================
function buildPalmyraBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Desert Hill Castle (Qal'at Ibn Ma'n) overlooking the Colonnade from North
    { kind: 'keep', level: 2, dx: 0, dz: -22, rot: 0, exact: true },
    // Grand Oasis Sanctuary (Bel Terrace) & Twin Caravan Markets lining the Great Colonnade!
    { kind: 'temple', level: 2, dx: 24, dz: 0, rot: -Math.PI / 2, exact: true },
    { kind: 'market', level: 2, dx: -10, dz: 6, rot: 0, exact: true },
    { kind: 'market', level: 2, dx: 10, dz: 6, rot: 0, exact: true },
    { kind: 'war_tent', level: 2, dx: -14, dz: -18, rot: 0 },
    { kind: 'horse_stable', level: 2, dx: 15, dz: -18, rot: 0 },
    { kind: 'livestock_ranch', level: 2, dx: -32, dz: 14, rot: 0 },
    { kind: 'livestock_ranch', level: 2, dx: 34, dz: 16, rot: 0 },
    { kind: 'farm', level: 2, dx: 0, dz: 28, rot: 0 },
    // Outer Desert Signal Watchtowers (Unwalled Oasis — defended by beacons & mobile cavalry!)
    { kind: 'watchtower', level: 2, dx: -32, dz: -14, rot: 0, exact: true },
    { kind: 'watchtower', level: 2, dx: 32, dz: -14, rot: 0, exact: true },
    { kind: 'watchtower', level: 2, dx: -26, dz: 24, rot: 0, exact: true },
    { kind: 'watchtower', level: 2, dx: 26, dz: 24, rot: 0, exact: true },
  ];

  // Sprawling Bedouin Sadu Tents + Stone Oasis Caravanserai Houses (12 Real Residential Units)
  addHouseCluster(buildings, [
    [-24, -2, 2, 0, 'bedouin_tent'],
    [-22, 10, 2, Math.PI / 4, 'bedouin_tent'],
    [-12, 18, 2, 0, 'bedouin_tent'],
    [12, 18, 2, -Math.PI / 6, 'bedouin_tent'],
    [22, 12, 2, 0, 'bedouin_tent'],
    [-18, -10, 2, 0, 'house'],
    [10, -10, 2, Math.PI, 'house'],
    [-4, -10, 2, 0, 'house'],
    [-34, 2, 1, Math.PI / 3, 'bedouin_tent'],
    [34, 4, 1, -Math.PI / 3, 'bedouin_tent'],
    [-20, 24, 1, 0, 'bedouin_tent'],
    [18, 24, 1, 0, 'bedouin_tent'],
  ]);

  return {
    cityId: 'ai_emirate_tadmur',
    plateauIndex: 14,
    monumentKind: 'palmyra_colonnade_oasis',
    outerRadius: 56,
    plazaRadius: 11,
    treeKind: 'mixed_oasis',
    customPalette: {
      cobbleMain: 0xd4b68c,
      cobbleAccent: 0xb08f65,
      avenueStone: 0xe6cda6,
      awningColors: [0x9c2c24, 0xd97706, 0x1e293b, 0xefe5d1],
    },
    avenues: [
      // Iconic Great Colonnade of Palmyra stretching East-West!
      { ax: -42, az: 0, bx: 42, bz: 0, width: 4.8, hasColonnade: true, hasSouqCanopies: true },
      { ax: 0, az: -32, bx: 0, bz: 34, width: 3.6, hasTrees: true },
    ],
    ringRoads: [],
    orchardZones: [
      { x: -14, z: 28, radius: 12, density: 18 },
      { x: 14, z: 28, radius: 12, density: 18 },
    ],
    buildings,
    garrison: [
      'worker', 'commander', 'knight', 'knight', 'knight',
      'infantry', 'archer', 'archer',
    ],
  };
}

// ============================================================================
// 16. BLACK VALLEY PRISON — GRIM CONCENTRIC OBSIDIAN-STONE MOUNTAIN FORTRESS
// ============================================================================
function buildBlackValleyBlueprint(): BespokeCityBlueprint {
  const buildings: PlannedCityBuilding[] = [
    // Inner Maximum-Security Dungeon Keep & Warden Barracks
    { kind: 'keep', level: 3, dx: 0, dz: 0, rot: 0, exact: true },
    { kind: 'barracks', level: 2, dx: -12, dz: -10, rot: 0 },
    { kind: 'barracks', level: 2, dx: 12, dz: -10, rot: 0 },
    { kind: 'siege_workshop', level: 2, dx: -14, dz: 10, rot: 0 },
    { kind: 'war_tent', level: 2, dx: 14, dz: 10, rot: 0 },
    // Forced-Labor Stone Quarries
    { kind: 'quarry', level: 3, dx: -38, dz: -6, rot: 0 },
    { kind: 'quarry', level: 2, dx: 38, dz: 6, rot: 0 },
    { kind: 'market', level: 1, dx: 0, dz: 18, rot: 0 },
  ];

  // Bleak Stone Guardhouses & Cellblocks
  addHouseCluster(buildings, [
    [-20, 0, 2, 0],
    [20, 0, 2, Math.PI],
    [-12, 18, 1, 0],
    [12, 18, 1, Math.PI],
    [0, -18, 2, 0],
  ]);

  // Grim Concentric Double-Bastioned Dark Fortress Wall + Spiked Dry Moat!
  addPolygonRingWall(
    buildings,
    [
      [-31, -27],
      [31, -27],
      [31, 27],
      [-31, 27],
    ],
    {
      wallLevel: 2,
      towerLevel: 3,
      closed: true,
      gateEdges: [2], // Single Heavily Guarded Southern Iron Gate!
      moatEdges: [0, 1, 2, 3],
      midTowerEvery: 3,
    }
  );

  return {
    cityId: 'ai_sindhi_black_valley',
    plateauIndex: 32,
    monumentKind: 'black_valley_prison',
    outerRadius: 50,
    plazaRadius: 10,
    treeKind: 'barren',
    customPalette: {
      cobbleMain: 0x4b4642,
      cobbleAccent: 0x2f2b28,
      avenueStone: 0x625b55,
      awningColors: [0x1e293b, 0x7f1d1d, 0x451a03],
    },
    avenues: [
      { ax: 0, az: -26, bx: 0, bz: 40, width: 3.8 },
      { ax: -28, az: 0, bx: 28, bz: 0, width: 3.0 },
    ],
    ringRoads: [],
    orchardZones: [],
    buildings,
    garrison: [
      'worker', 'commander', 'knight', 'knight',
      'infantry', 'infantry', 'spearman', 'spearman', 'archer', 'archer',
    ],
  };
}

const ALL_BESPOKE_BLUEPRINTS: BespokeCityBlueprint[] = [
  buildMirqabBlueprint(),
  buildDamascusBlueprint(),
  buildAleppoBlueprint(),
  buildRusafaBasraBlueprint(),
  buildJerusalemBlueprint(),
  buildMosulBlueprint(),
  buildAntiochBlueprint(),
  buildKufaBlueprint(),
  buildNusaybinBlueprint(),
  buildHomsBlueprint(),
  buildRaqqaBlueprint(),
  buildTikritBlueprint(),
  buildAcreBlueprint(),
  buildHejazMaridBlueprint(),
  buildPalmyraBlueprint(),
  buildBlackValleyBlueprint(),
];

export const BESPOKE_BLUEPRINTS_BY_ID: Record<string, BespokeCityBlueprint> = {};
export const BESPOKE_BLUEPRINTS_BY_PLATEAU: Record<number, BespokeCityBlueprint> = {};

for (const bp of ALL_BESPOKE_BLUEPRINTS) {
  BESPOKE_BLUEPRINTS_BY_ID[bp.cityId] = bp;
  BESPOKE_BLUEPRINTS_BY_PLATEAU[bp.plateauIndex] = bp;
}

export function getBespokeCityBlueprintById(cityId: string): BespokeCityBlueprint | undefined {
  return BESPOKE_BLUEPRINTS_BY_ID[cityId];
}

export function getBespokeCityBlueprintByPlateau(
  plateauIndex: number
): BespokeCityBlueprint | undefined {
  return BESPOKE_BLUEPRINTS_BY_PLATEAU[plateauIndex];
}
