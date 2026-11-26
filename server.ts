import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  deleteKingdomByUid,
  loadAllResourceDeltas,
  loadKingdomByUid,
  saveKingdomByUid,
  upsertResourceDeltas,
} from './src/db/kingdomRepo.ts';
import {
  getBespokeCityBlueprintById,
  type PlannedCityBuilding,
} from './src/shared/cityBlueprints.ts';
import {
  BANDIT_UNIT_SPECS,
  BANNER_PATTERN_SPECS,
  CULTURE_SPECS,
  evaluateEnvironmentalFit,
  evaluateKingdomCapacity,
  evaluateKingdomUrbanization,
  evaluatePopulationLife,
  getBanditRoleForUnitKind,
  getRecommendedCultureForBiome,
  getStructureDefenseSpec,
  getStructureUpgradeRequirement,
  getTotalCarriedLoot,
  getUnitEffectiveCombatStats,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  normalizeCultureKind,
  STRUCTURE_SPECS,
  UNIT_SPECS,
  URBANIZATION_TIERS,
} from './src/shared/protocol.ts';
import type {
  AiFactionKind,
  BanditCampArchetype,
  BanditTacticalState,
  BannerPatternKind,
  BlockoutStructure,
  BlockoutUnit,
  CombatEvent,
  CultureKind,
  MarchWaypoint,
  NetworkPacket,
  PlayerResources,
  PlayerState,
  PveDifficulty,
  PveTheaterState,
  ResourceNode,
  StructureKind,
  StructureLevel,
  UnitKind,
  UnitStanceKind,
  WorldState,
} from './src/shared/protocol.ts';
import {
  BIOME_SPECS,
  BRIDGE_CROSSINGS,
  calculateMarchRouteStats,
  CHUNK_SIZE,
  CLIMATE_SPECS,
  evaluateFortificationTerrain,
  formatDurationAr,
  formatWorldCoordKm,
  getBiomeAt,
  getDeterministicNodesInSector,
  getEffectiveClimateAt,
  getForestDensityAt,
  getMovementSpeedMultiplierAt,
  getRoadDistance,
  getSectorCoords,
  getTerrainHeight,
  isBuildableTerrain,
  MACRO_LANDMARKS,
  SPAWN_PLATEAUS,
  STRATEGIC_ROADS,
  WATER_LEVEL_Y,
  WORLD_HALF_SIZE,
  WORLD_MAP_SIZE,
} from './src/shared/worldMap.ts';
import type { ClimateKind } from './src/shared/worldMap.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const TICK_RATE_HZ = 20;
const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ;
const MAP_SIZE = WORLD_MAP_SIZE;
const AOI_RADIUS_M = 1650;

const CLIMATE_CYCLE_ORDER: ClimateKind[] = [
  'temperate_clear',
  'monsoon_rain',
  'desert_sandstorm',
  'northern_blizzard',
];

const FACTION_PRESETS: Array<{
  color: string;
  secondaryColor: string;
  bannerPattern: BannerPatternKind;
  factionName: string;
  culture: CultureKind;
  spawnX: number;
  spawnZ: number;
}> = [
  {
    color: '#a855f7',
    secondaryColor: '#fde047',
    bannerPattern: 'royal_lion',
    factionName: 'معقل حصن القفول وبادية الشام',
    culture: 'iraqi_mesopotamian',
    spawnX: SPAWN_PLATEAUS[4].x,
    spawnZ: SPAWN_PLATEAUS[4].z,
  },
  {
    color: '#f59e0b',
    secondaryColor: '#7c2d12',
    bannerPattern: 'imperial_sun',
    factionName: 'تحالف واحة تدمر والقوافل',
    culture: 'bedouin_nomadic',
    spawnX: SPAWN_PLATEAUS[14].x,
    spawnZ: SPAWN_PLATEAUS[14].z,
  },
  {
    color: '#2563eb',
    secondaryColor: '#fbbf24',
    bannerPattern: 'crescent_star',
    factionName: 'أحرار معبر دير الزور والفرات',
    culture: 'iraqi_mesopotamian',
    spawnX: SPAWN_PLATEAUS[18].x,
    spawnZ: SPAWN_PLATEAUS[18].z,
  },
  {
    color: '#d97706',
    secondaryColor: '#fef3c7',
    bannerPattern: 'crossed_swords',
    factionName: 'فرسان واحة الحماد وممر البادية',
    culture: 'bedouin_nomadic',
    spawnX: SPAWN_PLATEAUS[15].x,
    spawnZ: SPAWN_PLATEAUS[15].z,
  },
  {
    color: '#0284c7',
    secondaryColor: '#fde047',
    bannerPattern: 'crescent_star',
    factionName: 'حماة بوابة السماوة والجنوب',
    culture: 'hejazi_arabian',
    spawnX: SPAWN_PLATEAUS[29].x,
    spawnZ: SPAWN_PLATEAUS[29].z,
  },
  {
    color: '#10b981',
    secondaryColor: '#f8fafc',
    bannerPattern: 'royal_lion',
    factionName: 'حامية حمص ووسط الشام',
    culture: 'levantine_shami',
    spawnX: SPAWN_PLATEAUS[8].x,
    spawnZ: SPAWN_PLATEAUS[8].z,
  },
];

let serverSeq = 1;
let entityCounter = 100;
let structuresDirty = true;
let resourcesDirty = true;

const loadedSectors = new Set<string>();
let resourceDeltasCache: Record<string, number> = {};
const pendingResourceDeltaFlush = new Map<
  string,
  { nodeId: string; sectorX: number; sectorZ: number; remainingAmount: number }
>();

function nextEntityId(prefix: string): string {
  entityCounter += 1;
  return `${prefix}_${entityCounter}`;
}

function quantize(val: number): number {
  return Math.round(val * 10) / 10;
}

function createInitialResourceNodes(): Record<string, ResourceNode> {
  const nodes: Record<string, ResourceNode> = {};
  const layout: Array<{ kind: ResourceNode['kind']; x: number; z: number; amount: number }> = [];

  // 1. Starter Resource Clusters around each of the 6 Continental Spawn Plateaus
  for (const sp of SPAWN_PLATEAUS) {
    layout.push(
      { kind: 'wood', x: sp.x + 26, z: sp.z - 18, amount: 3000 },
      { kind: 'food', x: sp.x - 24, z: sp.z - 16, amount: 2800 },
      { kind: 'cloth', x: sp.x + 16, z: sp.z - 25, amount: 2800 },
      { kind: 'horses', x: sp.x - 16, z: sp.z - 26, amount: 2600 },
      { kind: 'stone', x: sp.x - 28, z: sp.z + 22, amount: 3000 },
      { kind: 'gold', x: sp.x + 28, z: sp.z + 24, amount: 3200 }
    );
  }

  // 2. Central Syrian Desert Contested Caravan Crossroads between Mirqab & Hisn al-Quful
  const crossX = -950;
  const crossZ = 6650;
  layout.push(
    { kind: 'gold', x: crossX - 28, z: crossZ - 28, amount: 4500 },
    { kind: 'gold', x: crossX + 28, z: crossZ + 28, amount: 4500 },
    { kind: 'gold', x: crossX + 28, z: crossZ - 28, amount: 4500 },
    { kind: 'gold', x: crossX - 28, z: crossZ + 28, amount: 4500 },
    { kind: 'stone', x: crossX, z: crossZ - 55, amount: 3800 },
    { kind: 'stone', x: crossX, z: crossZ + 55, amount: 3800 },
    { kind: 'wood', x: crossX - 55, z: crossZ, amount: 3600 },
    { kind: 'food', x: crossX + 55, z: crossZ, amount: 3600 },
    { kind: 'cloth', x: crossX, z: crossZ + 36, amount: 3800 },
    { kind: 'horses', x: crossX, z: crossZ - 36, amount: 3600 }
  );

  layout.forEach((item, idx) => {
    const id = `res_${idx + 1}`;
    const remaining =
      typeof resourceDeltasCache[id] === 'number' ? resourceDeltasCache[id] : item.amount;
    nodes[id] = {
      id,
      kind: item.kind,
      x: item.x,
      z: item.z,
      amount: remaining,
      maxAmount: item.amount,
    };
  });

  return nodes;
}

let combatEventsBuffer: CombatEvent[] = [];
const lastAlertTickByOwner = new Map<string, number>();
const lastAiRaidTick = new Map<string, number>();
const lastAiBuildTick = new Map<string, number>();

function pushCombatEvent(ev: Omit<CombatEvent, 'id' | 'tick'>) {
  combatEventsBuffer.push({
    ...ev,
    id: nextEntityId('fx'),
    tick: worldState.tick,
  });
  if (combatEventsBuffer.length > 90) {
    combatEventsBuffer = combatEventsBuffer.slice(-90);
  }
}

const worldState: WorldState = {
  tick: 0,
  serverTime: Date.now(),
  mapSize: MAP_SIZE,
  climate: 'temperate_clear',
  autoCycleClimate: true,
  players: {},
  structures: {},
  units: {},
  resourceNodes: createInitialResourceNodes(),
  pveTheater: {
    id: 'theater_1',
    difficulty: 'balanced',
    strongholdCount: 3,
    strongholdsCleared: 0,
    startedAtMs: Date.now(),
  },
  combatEvents: [],
};

/**
 * Materializes deterministic procedural resource nodes on-demand for active 256m sectors.
 */
function ensureSectorsMaterialized(centerX: number, centerZ: number, radiusM = 1200): boolean {
  const { sx: cx, sz: cz } = getSectorCoords(centerX, centerZ);
  const sectorRadius = Math.max(1, Math.ceil(radiusM / CHUNK_SIZE));
  let addedAny = false;

  for (let dz = -sectorRadius; dz <= sectorRadius; dz++) {
    for (let dx = -sectorRadius; dx <= sectorRadius; dx++) {
      const sx = cx + dx;
      const sz = cz + dz;
      const key = `${sx}_${sz}`;
      if (loadedSectors.has(key)) continue;
      loadedSectors.add(key);

      const sectorNodes = getDeterministicNodesInSector(sx, sz, resourceDeltasCache);
      for (const n of sectorNodes) {
        if (!worldState.resourceNodes[n.id]) {
          worldState.resourceNodes[n.id] = n;
          addedAny = true;
        }
      }
    }
  }
  return addedAny;
}

function prewarmStrategicSectors() {
  ensureSectorsMaterialized(0, 0, 1024);
  for (const sp of SPAWN_PLATEAUS) {
    ensureSectorsMaterialized(sp.x, sp.z, 768);
  }
}

prewarmStrategicSectors();

/**
 * Produces an Area-Of-Interest (AOI) filtered world view for a specific player's active viewport,
 * always including friendly units/structures AND nearby hostiles around any friendly force or camera.
 */
function filterWorldSliceForPlayer(
  pid: string,
  includeStructures: boolean,
  includeResources: boolean
): {
  structures?: Record<string, BlockoutStructure>;
  units: Record<string, BlockoutUnit>;
  resourceNodes?: Record<string, ResourceNode>;
  combatEvents: CombatEvent[];
} {
  const player = worldState.players[pid];
  const camX = player?.camera.targetX ?? 0;
  const camZ = player?.camera.targetZ ?? 0;
  const camZoom = player?.camera.zoom ?? 40;
  const aoiRadius = Math.min(3200, Math.max(AOI_RADIUS_M, Math.round(camZoom * 3.4)));

  const friendlyAnchors: Array<{ x: number; z: number }> = [];
  for (const s of Object.values(worldState.structures)) {
    if (s.ownerId === pid) friendlyAnchors.push({ x: s.x, z: s.z });
  }
  for (const u of Object.values(worldState.units)) {
    if (u.ownerId === pid) friendlyAnchors.push({ x: u.x, z: u.z });
  }

  const isNearFriendlyOrCam = (x: number, z: number, friendlySight = 260): boolean => {
    if (Math.abs(x - camX) <= aoiRadius && Math.abs(z - camZ) <= aoiRadius) return true;
    for (let i = 0; i < friendlyAnchors.length; i++) {
      const a = friendlyAnchors[i];
      if (Math.abs(x - a.x) <= friendlySight && Math.abs(z - a.z) <= friendlySight) {
        return true;
      }
    }
    return false;
  };

  const filteredUnits: Record<string, BlockoutUnit> = {};
  const assignedResIds = new Set<string>();
  for (const u of Object.values(worldState.units)) {
    // Server-authoritative forest stealth: hidden bandits are never transmitted to players until revealed!
    if (u.ownerId !== pid && u.isBanditUnit && u.isStealthed) {
      continue;
    }
    if (u.ownerId === pid || isNearFriendlyOrCam(u.x, u.z, 260)) {
      filteredUnits[u.id] = u;
      if (u.ownerId === pid && u.assignedResourceId) {
        assignedResIds.add(u.assignedResourceId);
      }
    }
  }

  let filteredStructures: Record<string, BlockoutStructure> | undefined;
  if (includeStructures) {
    filteredStructures = {};
    for (const s of Object.values(worldState.structures)) {
      if (s.ownerId === pid || isNearFriendlyOrCam(s.x, s.z, 280)) {
        filteredStructures[s.id] = s;
      }
    }
  }

  let filteredResources: Record<string, ResourceNode> | undefined;
  if (includeResources) {
    filteredResources = {};
    for (const r of Object.values(worldState.resourceNodes)) {
      if (
        r.amount > 0 &&
        (assignedResIds.has(r.id) ||
          (Math.abs(r.x - camX) <= aoiRadius && Math.abs(r.z - camZ) <= aoiRadius))
      ) {
        filteredResources[r.id] = r;
      }
    }
  }

  const recentEvents = combatEventsBuffer.filter(
    (ev) =>
      worldState.tick - ev.tick <= 14 &&
      (((ev.kind === 'alert' ||
        ev.kind === 'ambush' ||
        ev.kind === 'loot_stolen' ||
        ev.kind === 'loot_recovered') &&
        ev.targetOwnerId === pid) ||
        isNearFriendlyOrCam(ev.toX, ev.toZ, 280) ||
        isNearFriendlyOrCam(ev.fromX, ev.fromZ, 280))
  );

  return {
    units: filteredUnits,
    combatEvents: recentEvents,
    ...(filteredStructures ? { structures: filteredStructures } : {}),
    ...(filteredResources ? { resourceNodes: filteredResources } : {}),
  };
}

function findValidPlacementNear(
  centerX: number,
  centerZ: number,
  preferredDx: number,
  preferredDz: number,
  minClearance = 4.2
): { x: number; z: number } | null {
  const existing = Object.values(worldState.structures);
  const tryPoint = (px: number, pz: number) => {
    const qx = quantize(Math.max(-WORLD_HALF_SIZE + 8, Math.min(WORLD_HALF_SIZE - 8, px)));
    const qz = quantize(Math.max(-WORLD_HALF_SIZE + 8, Math.min(WORLD_HALF_SIZE - 8, pz)));
    if (!isBuildableTerrain(qx, qz).ok) return null;
    const collides = existing.some((s) => Math.hypot(s.x - qx, s.z - qz) < minClearance);
    return collides ? null : { x: qx, z: qz };
  };

  const direct = tryPoint(centerX + preferredDx, centerZ + preferredDz);
  if (direct) return direct;

  for (let r = 6; r <= 36; r += 5) {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const cand = tryPoint(
        centerX + preferredDx + Math.cos(ang) * r,
        centerZ + preferredDz + Math.sin(ang) * r
      );
      if (cand) return cand;
    }
  }
  return null;
}

function findBuildableCampSiteNear(
  cx: number,
  cz: number,
  minR: number,
  maxR: number
): { x: number; z: number } {
  for (let r = minR; r <= maxR; r += 16) {
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + 0.35;
      const x = quantize(Math.max(-WORLD_HALF_SIZE + 40, Math.min(WORLD_HALF_SIZE - 40, cx + Math.cos(ang) * r)));
      const z = quantize(Math.max(-WORLD_HALF_SIZE + 40, Math.min(WORLD_HALF_SIZE - 40, cz + Math.sin(ang) * r)));
      if (!isBuildableTerrain(x, z).ok) continue;
      const okRing =
        isBuildableTerrain(x + 9, z).ok &&
        isBuildableTerrain(x - 9, z).ok &&
        isBuildableTerrain(x, z + 9).ok &&
        isBuildableTerrain(x, z - 9).ok;
      if (okRing) {
        return { x, z };
      }
    }
  }
  return { x: quantize(cx + minR), z: quantize(cz) };
}

function spawnPlayerInitialBase(
  player: PlayerState,
  spawnX: number,
  spawnZ: number,
  variant: 'full_capital' | 'frontier_raider' = 'full_capital',
  difficulty: PveDifficulty = 'balanced'
) {
  const culture: CultureKind = normalizeCultureKind(player.culture);
  const dirX = spawnX < 0 ? 1 : -1;
  const dirZ = spawnZ < 0 ? 1 : -1;

  const initialBuildings: Array<{
    kind: StructureKind;
    level: StructureLevel;
    dx: number;
    dz: number;
    rot: number;
  }> =
    variant === 'frontier_raider'
      ? [
          { kind: 'keep', level: 1, dx: 0, dz: 0, rot: 0 },
          { kind: 'house', level: 1, dx: -dirX * 7, dz: -3, rot: 0 },
          { kind: 'farm', level: 1, dx: -dirX * 11, dz: 5, rot: 0 },
          { kind: 'barracks', level: 1, dx: dirX * 8, dz: dirZ * 4, rot: 0 },
          { kind: 'watchtower', level: 1, dx: dirX * 5, dz: dirZ * 10, rot: 0 },
        ]
      : [
          // Main Citadel Keep
          { kind: 'keep', level: 1, dx: 0, dz: 0, rot: 0 },
          // Residential Neighborhood (Houses of Level 1, 2, and 3)
          { kind: 'house', level: 1, dx: -dirX * 6, dz: -2, rot: 0 },
          { kind: 'house', level: 2, dx: -dirX * 6, dz: 4, rot: Math.PI / 2 },
          { kind: 'house', level: 3, dx: -dirX * 11, dz: 1, rot: 0 },
          // Irrigated Agricultural Farms adjacent to the residential neighborhood (Synergy!)
          { kind: 'farm', level: 2, dx: -dirX * 12, dz: -5.5, rot: 0 },
          { kind: 'farm', level: 1, dx: -dirX * 12, dz: 7.5, rot: 0 },
          // Livestock & Cotton Ranch + Bedouin Hospitality Tent + Horse Stables & Taming Paddock
          { kind: 'livestock_ranch', level: 1, dx: -dirX * 17, dz: 1, rot: 0 },
          { kind: 'bedouin_tent', level: 1, dx: -dirX * 17, dz: -5.5, rot: 0 },
          { kind: 'horse_stable', level: 1, dx: dirX * 15, dz: dirZ * 3, rot: 0 },
          // Trade Market & Caravanserai
          { kind: 'market', level: 2, dx: 0, dz: -dirZ * 8, rot: 0 },
          // Cultural & Religious Temple / Mosque / Cathedral / Pagoda
          { kind: 'temple', level: 2, dx: -dirX * 8, dz: -dirZ * 8, rot: 0 },
          // Military Barracks, War Tent Pavilion & Watchtower
          { kind: 'barracks', level: 1, dx: dirX * 9, dz: dirZ * 3, rot: dirX > 0 ? Math.PI / 2 : -Math.PI / 2 },
          { kind: 'war_tent', level: 1, dx: dirX * 9, dz: -dirZ * 4, rot: 0 },
          { kind: 'watchtower', level: 1, dx: dirX * 4, dz: dirZ * 10, rot: 0 },
        ];

  initialBuildings.forEach((b) => {
    const pos =
      b.dx === 0 && b.dz === 0
        ? { x: quantize(spawnX), z: quantize(spawnZ) }
        : findValidPlacementNear(spawnX, spawnZ, b.dx, b.dz, 3.8);
    if (!pos) return;
    const id = nextEntityId('str');
    const spec = STRUCTURE_SPECS[b.kind];
    const hpMult = b.level === 2 ? 1.5 : b.level === 3 ? 2.25 : 1;
    const diffHpMult =
      variant === 'frontier_raider' && difficulty === 'casual'
        ? 0.8
        : variant === 'frontier_raider' && difficulty === 'aggressive'
          ? 1.1
          : 1.0;
    const maxHp = Math.round(spec.maxHp * hpMult * diffHpMult);
    worldState.structures[id] = {
      id,
      ownerId: player.id,
      ownerColor: player.color,
      secondaryColor: player.secondaryColor ?? '#fbbf24',
      bannerPattern: player.bannerPattern ?? 'crescent_star',
      kind: b.kind,
      culture,
      level: b.level,
      x: pos.x,
      z: pos.z,
      rotationY: b.rot,
      hp: maxHp,
      maxHp,
      createdAtTick: worldState.tick,
    };
  });

  const initialUnits: Array<{ kind: UnitKind; dx: number; dz: number }> =
    variant === 'frontier_raider'
      ? difficulty === 'casual'
        ? [
            { kind: 'worker', dx: dirX * 4, dz: -2 },
            { kind: 'infantry', dx: dirX * 7, dz: dirZ * 6 },
            { kind: 'spearman', dx: dirX * 9, dz: dirZ * 6 },
          ]
        : difficulty === 'aggressive'
          ? [
              { kind: 'worker', dx: dirX * 4, dz: -2 },
              { kind: 'worker', dx: dirX * 4, dz: 1 },
              { kind: 'infantry', dx: dirX * 7, dz: dirZ * 6 },
              { kind: 'infantry', dx: dirX * 9, dz: dirZ * 7 },
              { kind: 'spearman', dx: dirX * 10, dz: dirZ * 5 },
              { kind: 'archer', dx: dirX * 6, dz: dirZ * 8 },
              { kind: 'knight', dx: dirX * 11, dz: dirZ * 8 },
            ]
          : [
              { kind: 'worker', dx: dirX * 4, dz: -2 },
              { kind: 'worker', dx: dirX * 4, dz: 1 },
              { kind: 'infantry', dx: dirX * 7, dz: dirZ * 6 },
              { kind: 'spearman', dx: dirX * 9, dz: dirZ * 6 },
              { kind: 'archer', dx: dirX * 8, dz: dirZ * 8 },
            ]
      : [
          { kind: 'worker', dx: dirX * 5, dz: -3 },
          { kind: 'worker', dx: dirX * 5, dz: 0 },
          { kind: 'infantry', dx: dirX * 8, dz: dirZ * 7 },
          { kind: 'spearman', dx: dirX * 10, dz: dirZ * 7 },
          { kind: 'archer', dx: dirX * 11, dz: dirZ * 5 },
          { kind: 'knight', dx: dirX * 9, dz: dirZ * 9.5 },
        ];

  initialUnits.forEach((u) => {
    const unitId = nextEntityId('unt');
    const ux = quantize(spawnX + u.dx);
    const uz = quantize(spawnZ + u.dz);
    const spec = UNIT_SPECS[u.kind];
    worldState.units[unitId] = {
      id: unitId,
      ownerId: player.id,
      ownerColor: player.color,
      secondaryColor: player.secondaryColor ?? '#fbbf24',
      bannerPattern: player.bannerPattern ?? 'crescent_star',
      kind: u.kind,
      x: ux,
      z: uz,
      targetX: ux,
      targetZ: uz,
      rotationY: 0,
      speed: spec.speed,
      state: 'idle',
      stance: 'aggressive',
      activityAr:
        u.kind === 'worker' ? 'يتفقد أحياء السكان والمزارع' : 'دورية حراسة لحماية الأهالي',
      patrolling: true,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
    };
  });

  if (variant === 'frontier_raider') {
    const extraRes: Array<{ kind: ResourceNode['kind']; dx: number; dz: number }> = [
      { kind: 'wood', dx: -dirX * 19, dz: -10 },
      { kind: 'food', dx: -dirX * 18, dz: 11 },
      { kind: 'gold', dx: dirX * 18, dz: -10 },
      { kind: 'stone', dx: dirX * 17, dz: 12 },
    ];
    extraRes.forEach((res) => {
      const rx = quantize(spawnX + res.dx);
      const rz = quantize(spawnZ + res.dz);
      if (isBuildableTerrain(rx, rz).ok) {
        const rid = nextEntityId('res_ai');
        worldState.resourceNodes[rid] = {
          id: rid,
          kind: res.kind,
          x: rx,
          z: rz,
          amount: 2400,
          maxAmount: 2400,
        };
      }
    });
    resourcesDirty = true;
  }

  structuresDirty = true;
}

type BanditArchetype =
  | 'forest_ambush'
  | 'highway_raiders'
  | 'mountain_brigands'
  | 'ruin_marauders';

const AI_KINGDOM_PRESETS: Array<{
  id: string;
  name: string;
  cityNameAr: string;
  administrationTitleAr: string;
  factionName: string;
  provinceAr: string;
  aiFactionKind: AiFactionKind;
  color: string;
  secondaryColor: string;
  bannerPattern: BannerPatternKind;
  culture: CultureKind;
  plateauIndex: number;
  patrolRadius: number;
  isCapital?: boolean;
}> = [
  // 1. Sindhi State Provinces (ولايات الدولة السندية)
  {
    id: 'ai_sindhi_mirqab',
    name: 'ولاية مرقاب (العاصمة)',
    cityNameAr: 'مرقاب',
    administrationTitleAr: 'ديوان عاصمة الدولة السندية',
    factionName: 'الدولة السندية — عاصمة مرقاب',
    provinceAr: 'ولاية مرقاب — دجلة',
    aiFactionKind: 'sindhi_state',
    color: '#0d9488',
    secondaryColor: '#fbbf24',
    bannerPattern: 'crescent_star',
    culture: 'iraqi_mesopotamian',
    plateauIndex: 0,
    patrolRadius: 115,
    isCapital: true,
  },
  {
    id: 'ai_sindhi_rusafa',
    name: 'ولاية الرصافة (البصرة)',
    cityNameAr: 'الرصافة — البصرة',
    administrationTitleAr: 'إمارة شط العرب وميناء الرصافة',
    factionName: 'الدولة السندية — ولاية الرصافة',
    provinceAr: 'ولاية الرصافة وشط العرب',
    aiFactionKind: 'sindhi_state',
    color: '#0f766e',
    secondaryColor: '#fde047',
    bannerPattern: 'imperial_sun',
    culture: 'iraqi_mesopotamian',
    plateauIndex: 1,
    patrolRadius: 105,
    isCapital: true,
  },
  {
    id: 'ai_sindhi_nusaybin',
    name: 'ولاية نصيبين والثغر',
    cityNameAr: 'نصيبين',
    administrationTitleAr: 'قيادة ثغر نصيبين والجزيرة العليا',
    factionName: 'الدولة السندية — ولاية نصيبين',
    provinceAr: 'ولاية الثغر الشمالي',
    aiFactionKind: 'sindhi_state',
    color: '#115e59',
    secondaryColor: '#f8fafc',
    bannerPattern: 'crossed_swords',
    culture: 'iraqi_mesopotamian',
    plateauIndex: 3,
    patrolRadius: 105,
  },
  {
    id: 'ai_sindhi_damascus',
    name: 'ولاية الشام الداخلي (دمشق)',
    cityNameAr: 'دمشق',
    administrationTitleAr: 'نيابة دمشق وولاية الشام الداخلي',
    factionName: 'الدولة السندية — ولاية دمشق',
    provinceAr: 'ولاية الشام الداخلي',
    aiFactionKind: 'sindhi_state',
    color: '#047857',
    secondaryColor: '#fbbf24',
    bannerPattern: 'crescent_star',
    culture: 'levantine_shami',
    plateauIndex: 5,
    patrolRadius: 105,
    isCapital: true,
  },
  {
    id: 'ai_sindhi_aleppo',
    name: 'إمارة حلب الشهباء',
    cityNameAr: 'حلب',
    administrationTitleAr: 'قلعة وإدارة الشام الشمالي — حلب',
    factionName: 'الدولة السندية — ولاية حلب',
    provinceAr: 'ولاية الشام الشمالي',
    aiFactionKind: 'sindhi_state',
    color: '#059669',
    secondaryColor: '#fde047',
    bannerPattern: 'royal_lion',
    culture: 'levantine_shami',
    plateauIndex: 6,
    patrolRadius: 100,
    isCapital: true,
  },
  {
    id: 'ai_sindhi_mosul',
    name: 'إدارة الموصل ودجلة العليا',
    cityNameAr: 'الموصل',
    administrationTitleAr: 'ديوان الموصل وحوض دجلة الشمالي',
    factionName: 'الدولة السندية — حامية الموصل',
    provinceAr: 'ضفة دجلة العليا',
    aiFactionKind: 'sindhi_state',
    color: '#14b8a6',
    secondaryColor: '#f8fafc',
    bannerPattern: 'crescent_star',
    culture: 'iraqi_mesopotamian',
    plateauIndex: 16,
    patrolRadius: 96,
  },
  {
    id: 'ai_sindhi_raqqa',
    name: 'حامية الرقة والفرات',
    cityNameAr: 'الرقة',
    administrationTitleAr: 'إدارة معابر الفرات الشمالي — الرقة',
    factionName: 'الدولة السندية — رباط الرقة',
    provinceAr: 'حوض الفرات الشمالي',
    aiFactionKind: 'sindhi_state',
    color: '#0d9488',
    secondaryColor: '#fef3c7',
    bannerPattern: 'imperial_sun',
    culture: 'iraqi_mesopotamian',
    plateauIndex: 17,
    patrolRadius: 90,
  },
  {
    id: 'ai_sindhi_tikrit',
    name: 'رباط تكريت الأوسط',
    cityNameAr: 'تكريت',
    administrationTitleAr: 'حامية قلعة تكريت على دجلة',
    factionName: 'الدولة السندية — رباط تكريت',
    provinceAr: 'رباط دجلة الأوسط',
    aiFactionKind: 'sindhi_state',
    color: '#0f766e',
    secondaryColor: '#fbbf24',
    bannerPattern: 'crossed_swords',
    culture: 'iraqi_mesopotamian',
    plateauIndex: 23,
    patrolRadius: 90,
  },
  {
    id: 'ai_sindhi_kufa',
    name: 'ولاية الكوفة والفرات',
    cityNameAr: 'الكوفة',
    administrationTitleAr: 'إدارة حاضرة الكوفة ومشارف البادية',
    factionName: 'الدولة السندية — ولاية الكوفة',
    provinceAr: 'مشارف البادية والفرات',
    aiFactionKind: 'sindhi_state',
    color: '#0284c7',
    secondaryColor: '#fde047',
    bannerPattern: 'imperial_sun',
    culture: 'iraqi_mesopotamian',
    plateauIndex: 25,
    patrolRadius: 94,
  },
  {
    id: 'ai_sindhi_black_valley',
    name: 'حامية سجن الوادي الأسود',
    cityNameAr: 'الوادي الأسود',
    administrationTitleAr: 'قيادة حرس سجن الوادي الأسود وشعاب حمرين',
    factionName: 'الدولة السندية — حامية الوادي الأسود',
    provinceAr: 'شعاب حمرين الوعرة',
    aiFactionKind: 'sindhi_state',
    color: '#1e293b',
    secondaryColor: '#f59e0b',
    bannerPattern: 'royal_lion',
    culture: 'iraqi_mesopotamian',
    plateauIndex: 32,
    patrolRadius: 95,
  },
  {
    id: 'ai_sindhi_hejaz',
    name: 'تخوم ولاية الحجاز (دومة الجندل)',
    cityNameAr: 'دومة الجندل — الجوف',
    administrationTitleAr: 'إدارة درب الحجاز وقلعة مارد',
    factionName: 'الدولة السندية — تخوم الحجاز',
    provinceAr: 'ولاية الحجاز الجنوبية',
    aiFactionKind: 'sindhi_state',
    color: '#b45309',
    secondaryColor: '#fef3c7',
    bannerPattern: 'royal_lion',
    culture: 'hejazi_arabian',
    plateauIndex: 35,
    patrolRadius: 95,
  },
  // 2. Western Coastal Crusaders (الحاميات الصليبية بالساحل الغربي)
  {
    id: 'ai_crusader_jerusalem',
    name: 'حامية القدس الساحلية',
    cityNameAr: 'القدس',
    administrationTitleAr: 'قيادة الحامية الصليبية بالقدس',
    factionName: 'الصليبيون — الساحل الغربي والقدس',
    provinceAr: 'الشريط الساحلي للقدس',
    aiFactionKind: 'crusaders',
    color: '#b91c1c',
    secondaryColor: '#f8fafc',
    bannerPattern: 'crusader_cross',
    culture: 'levantine_shami',
    plateauIndex: 2,
    patrolRadius: 92,
    isCapital: true,
  },
  {
    id: 'ai_crusader_antioch',
    name: 'إمارة أنطاكية الساحلية',
    cityNameAr: 'أنطاكية',
    administrationTitleAr: 'حامية ثغر أنطاكية الساحلي',
    factionName: 'الصليبيون — ثغر أنطاكية',
    provinceAr: 'الساحل الشمالي',
    aiFactionKind: 'crusaders',
    color: '#991b1b',
    secondaryColor: '#fde047',
    bannerPattern: 'crusader_cross',
    culture: 'levantine_shami',
    plateauIndex: 7,
    patrolRadius: 88,
  },
  {
    id: 'ai_crusader_acre',
    name: 'ثغر عكا البحري',
    cityNameAr: 'عكا',
    administrationTitleAr: 'إدارة ميناء وحصن عكا الساحلي',
    factionName: 'الصليبيون — ميناء عكا',
    provinceAr: 'الساحل الغربي',
    aiFactionKind: 'crusaders',
    color: '#dc2626',
    secondaryColor: '#f8fafc',
    bannerPattern: 'crusader_cross',
    culture: 'levantine_shami',
    plateauIndex: 10,
    patrolRadius: 86,
  },
  // 3. Autonomous Local Emirates & Oasis Councils (الإمارات المحلية ومجالس الواحات)
  {
    id: 'ai_emirate_homs',
    name: 'إمارة حمص ووسط الشام',
    cityNameAr: 'حمص',
    administrationTitleAr: 'مجلس وإمارة حمص المحلية',
    factionName: 'إمارة حمص المستقلة',
    provinceAr: 'ولاية الشام الأوسط',
    aiFactionKind: 'local_emirate',
    color: '#7c3aed',
    secondaryColor: '#fde047',
    bannerPattern: 'crescent_star',
    culture: 'levantine_shami',
    plateauIndex: 8,
    patrolRadius: 90,
  },
  {
    id: 'ai_emirate_tadmur',
    name: 'مشيخة واحة تدمر والقوافل',
    cityNameAr: 'تدمر',
    administrationTitleAr: 'مشيخة واحة تدمر وحماة القوافل',
    factionName: 'عشائر واحة تدمر',
    provinceAr: 'بادية الشام الوسطى',
    aiFactionKind: 'local_emirate',
    color: '#d97706',
    secondaryColor: '#fef3c7',
    bannerPattern: 'nordic_raven',
    culture: 'bedouin_nomadic',
    plateauIndex: 14,
    patrolRadius: 88,
  },
];

const BANDIT_CLAN_PRESETS: Array<{
  name: string;
  factionName: string;
  color: string;
  secondaryColor: string;
  bannerPattern: BannerPatternKind;
  culture: CultureKind;
  archetype: BanditArchetype;
  preferredX: number;
  preferredZ: number;
}> = [
  {
    name: 'ذئاب أحراش نصيبين',
    factionName: 'عصابة ذئاب أحراش نصيبين (قطاع الطرق)',
    color: '#dc2626',
    secondaryColor: '#18181b',
    bannerPattern: 'crossed_swords',
    culture: 'bedouin_nomadic',
    archetype: 'forest_ambush',
    preferredX: -7000,
    preferredZ: -24400,
  },
  {
    name: 'لصوص قوافل بادية مرقاب',
    factionName: 'عصابة لصوص قوافل بادية مرقاب (قطاع الطرق)',
    color: '#ea580c',
    secondaryColor: '#fde047',
    bannerPattern: 'crossed_swords',
    culture: 'bedouin_nomadic',
    archetype: 'highway_raiders',
    preferredX: 9800,
    preferredZ: 12800,
  },
  {
    name: 'قطاع مضيق الوادي الأسود',
    factionName: 'قطاع مضيق الوادي الأسود والشعاب (قطاع الطرق)',
    color: '#9333ea',
    secondaryColor: '#f43f5e',
    bannerPattern: 'nordic_raven',
    culture: 'bedouin_nomadic',
    archetype: 'mountain_brigands',
    preferredX: 23200,
    preferredZ: -11200,
  },
  {
    name: 'نهّابو غابات الشام والأردن',
    factionName: 'عصابة نهّابي غابات الشام والأردن (قطاع الطرق)',
    color: '#9f1239',
    secondaryColor: '#fbbf24',
    bannerPattern: 'royal_lion',
    culture: 'bedouin_nomadic',
    archetype: 'ruin_marauders',
    preferredX: -23600,
    preferredZ: -18600,
  },
];

function isHostileOwners(ownerA: string, ownerB: string): boolean {
  if (ownerA === ownerB) return false;
  const pA = worldState.players[ownerA];
  const pB = worldState.players[ownerB];
  const aIsAi = Boolean(pA?.isAi || pA?.isBandit);
  const bIsAi = Boolean(pB?.isAi || pB?.isBandit);
  // Human players always cooperate in Online Co-op PvE
  if (!aIsAi && !bIsAi) return false;
  // Human vs any AI faction (Sindhi State, Crusaders, or Bandits) is hostile
  if (aIsAi !== bIsAi) return true;
  // AI vs AI: Same faction cooperates; different major factions & bandits are hostile
  const kindA = pA?.aiFactionKind ?? (pA?.isBandit ? 'bandits' : 'sindhi_state');
  const kindB = pB?.aiFactionKind ?? (pB?.isBandit ? 'bandits' : 'sindhi_state');
  if (kindA === kindB) return false;
  return true;
}

function clearSingleAiPlayer(aiId: string) {
  delete worldState.players[aiId];
  lastAiRaidTick.delete(aiId);
  lastAiBuildTick.delete(aiId);
  lastAlertTickByOwner.delete(aiId);
  for (const sid of Object.keys(worldState.structures)) {
    if (worldState.structures[sid].ownerId === aiId) {
      delete worldState.structures[sid];
    }
  }
  for (const uid of Object.keys(worldState.units)) {
    if (worldState.units[uid].ownerId === aiId) {
      delete worldState.units[uid];
    }
  }
}

function clearAiPlayers(banditsOnly = false) {
  const aiIds = Object.values(worldState.players)
    .filter((p) => (banditsOnly ? Boolean(p.isBandit) : Boolean(p.isAi || p.isBandit)))
    .map((p) => p.id);
  for (const id of aiIds) {
    clearSingleAiPlayer(id);
  }
}

function isClearBanditSite(
  x: number,
  z: number,
  existingKeeps: BlockoutStructure[],
  minKeepDist: number
): boolean {
  if (Math.abs(x) > WORLD_HALF_SIZE - 80 || Math.abs(z) > WORLD_HALF_SIZE - 80) {
    return false;
  }
  if (SPAWN_PLATEAUS.some((sp) => Math.hypot(x - sp.x, z - sp.z) < sp.radius + 135)) {
    return false;
  }
  if (existingKeeps.some((k) => Math.hypot(k.x - x, k.z - z) < minKeepDist)) {
    return false;
  }
  return (
    isBuildableTerrain(x, z).ok &&
    isBuildableTerrain(x + 8, z).ok &&
    isBuildableTerrain(x - 8, z).ok &&
    isBuildableTerrain(x, z + 8).ok &&
    isBuildableTerrain(x, z - 8).ok
  );
}

function findBanditHideoutSite(
  slotIdx: number,
  preset: (typeof BANDIT_CLAN_PRESETS)[number],
  anchorX: number,
  anchorZ: number
): { x: number; z: number } {
  const existingKeeps = Object.values(worldState.structures).filter(
    (s) => s.kind === 'keep' && s.hp > 0
  );

  // Slot 0 spawns as a local forest/roadside bandit ambush camp within reach of the human capital
  if (slotIdx === 0) {
    let bestSite: { x: number; z: number } | null = null;
    let bestScore = -1e9;
    for (let r = 175; r <= 380; r += 22) {
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2 + 0.27;
        const cx = quantize(anchorX + Math.cos(ang) * r);
        const cz = quantize(anchorZ + Math.sin(ang) * r);
        if (!isClearBanditSite(cx, cz, existingKeeps, 120)) continue;
        const fDens = getForestDensityAt(cx, cz);
        const rDist = getRoadDistance(cx, cz);
        const biome = getBiomeAt(cx, cz);
        let score = 0;
        if (biome === 'western_forest' || fDens >= 0.42) score += 130;
        else if (fDens >= 0.25) score += 55;
        if (rDist >= 22 && rDist <= 125) score += 85;
        score -= Math.abs(r - 235) * 0.2;
        if (score > bestScore) {
          bestScore = score;
          bestSite = { x: cx, z: cz };
        }
      }
    }
    if (bestSite) return bestSite;
    return findBuildableCampSiteNear(anchorX, anchorZ, 185, 290);
  }

  // Regional woodland / highway / foothill anchors across the continents (never occupying player plateaus)
  const forestLandmarks = MACRO_LANDMARKS.filter((m) => m.category === 'forest');
  const roadSamples: Array<{ x: number; z: number }> = [];
  for (let ri = 0; ri < STRATEGIC_ROADS.length; ri += 3) {
    const rd = STRATEGIC_ROADS[ri];
    const mx = (rd.ax + rd.bx) * 0.5;
    const mz = (rd.az + rd.bz) * 0.5;
    const dx = rd.bx - rd.ax;
    const dz = rd.bz - rd.az;
    const len = Math.max(1, Math.hypot(dx, dz));
    const nx = -dz / len;
    const nz = dx / len;
    roadSamples.push({ x: Math.round(mx + nx * 62), z: Math.round(mz + nz * 62) });
  }

  const anchorCandidates: Array<{ x: number; z: number }> = [
    { x: preset.preferredX, z: preset.preferredZ },
    ...forestLandmarks.map((f) => ({ x: f.x, z: f.z })),
    ...roadSamples,
    { x: -7000, z: -24400 },
    { x: -23600, z: -18600 },
    { x: 20500, z: -18500 },
    { x: -8500, z: -18500 },
    { x: -26000, z: -500 },
    { x: 9800, z: 12800 },
  ];

  // Rotate starting offset by slotIdx so distinct bandit clans spread across different regions
  const startIdx = (slotIdx - 1) % anchorCandidates.length;
  let bestGlobal: { x: number; z: number } | null = null;
  let bestGlobalScore = -1e9;

  for (let step = 0; step < anchorCandidates.length; step++) {
    const base = anchorCandidates[(startIdx + step) % anchorCandidates.length];
    if (Math.hypot(base.x - anchorX, base.z - anchorZ) < 650) continue;

    for (let r = 0; r <= 420; r += 70) {
      const angles = r === 0 ? 1 : 8;
      for (let a = 0; a < angles; a++) {
        const ang = (a / angles) * Math.PI * 2 + slotIdx * 0.4;
        const cx = quantize(base.x + Math.cos(ang) * r);
        const cz = quantize(base.z + Math.sin(ang) * r);
        if (Math.hypot(cx - anchorX, cz - anchorZ) < 700) continue;
        if (!isClearBanditSite(cx, cz, existingKeeps, 420)) continue;

        const fDens = getForestDensityAt(cx, cz);
        const rDist = getRoadDistance(cx, cz);
        const biome = getBiomeAt(cx, cz);
        let score = step === 0 ? 40 : 0;
        if (preset.archetype === 'forest_ambush' && (biome === 'western_forest' || fDens >= 0.42)) {
          score += 140;
        }
        if (preset.archetype === 'highway_raiders' && rDist >= 24 && rDist <= 140) {
          score += 130;
        }
        if (biome === 'western_forest') score += 70;
        if (fDens >= 0.35) score += 45;
        if (rDist >= 24 && rDist <= 160) score += 35;

        if (score > bestGlobalScore) {
          bestGlobalScore = score;
          bestGlobal = { x: cx, z: cz };
          if (bestGlobalScore >= 170) return bestGlobal;
        }
      }
    }
  }

  return (
    bestGlobal ??
    findBuildableCampSiteNear(preset.preferredX, preset.preferredZ, 120, 480)
  );
}

function createBanditUnit(
  bandit: PlayerState,
  kind: UnitKind,
  x: number,
  z: number,
  initialState: BanditTacticalState = 'guard_lair'
): BlockoutUnit {
  const role = getBanditRoleForUnitKind(kind);
  const bSpec = BANDIT_UNIT_SPECS[role];
  const uid = nextEntityId('unt');
  const qx = quantize(x);
  const qz = quantize(z);
  const archetype: BanditCampArchetype = bandit.banditCampArchetype ?? 'forest_ambush';
  const u: BlockoutUnit = {
    id: uid,
    ownerId: bandit.id,
    ownerColor: bandit.color,
    secondaryColor: bandit.secondaryColor ?? '#18181b',
    bannerPattern: bandit.bannerPattern ?? 'crossed_swords',
    kind,
    x: qx,
    z: qz,
    targetX: qx,
    targetZ: qz,
    rotationY: 0,
    speed: bSpec.speed,
    state: 'idle',
    stance: 'aggressive',
    activityAr:
      role === 'looter'
        ? 'ينقل المسروقات ويرمم مخبأ العصابة'
        : 'دورية كمين قطاع الطرق بين الأحراش والطريق',
    patrolling: false,
    hp: bSpec.maxHp,
    maxHp: bSpec.maxHp,
    isBanditUnit: true,
    banditClanArchetype: archetype,
    banditRole: role,
    banditState: initialState,
    isStealthed: false,
    carriedLoot: { gold: 0, wood: 0, food: 0 },
  };
  worldState.units[uid] = u;
  return u;
}

function findBanditAmbushSpot(
  lairX: number,
  lairZ: number,
  targetX: number,
  targetZ: number,
  archetype: BanditCampArchetype,
  enemyKeeps: BlockoutStructure[],
  enemyTowers: BlockoutStructure[]
): { x: number; z: number } {
  const safeFromForts = (px: number, pz: number) =>
    !enemyKeeps.some((k) => Math.hypot(k.x - px, k.z - pz) < 72) &&
    !enemyTowers.some((t) => Math.hypot(t.x - px, t.z - pz) < 58);

  const distToTarget = Math.hypot(targetX - lairX, targetZ - lairZ);
  // Look along the corridor between the lair and player settlements/roads/bridges
  const dirX = distToTarget > 1 ? (targetX - lairX) / distToTarget : 1;
  const dirZ = distToTarget > 1 ? (targetZ - lairZ) / distToTarget : 0;
  const corridorLen = Math.min(260, Math.max(85, distToTarget * 0.58));
  const midX = lairX + dirX * corridorLen;
  const midZ = lairZ + dirZ * corridorLen;

  let best: { x: number; z: number } | null = null;
  let bestScore = -1e9;

  // Check bridges near the lair for chokepoint ambushes (especially highway_raiders & mountain_brigands)
  for (const br of BRIDGE_CROSSINGS) {
    if (Math.hypot(br.x - lairX, br.z - lairZ) > 420) continue;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const cx = quantize(br.x + Math.cos(ang) * 38);
      const cz = quantize(br.z + Math.sin(ang) * 38);
      if (!isBuildableTerrain(cx, cz).ok || !safeFromForts(cx, cz)) continue;
      const fDens = getForestDensityAt(cx, cz);
      const score =
        (fDens >= 0.36 ? 150 : 60) +
        (archetype === 'highway_raiders' || archetype === 'mountain_brigands' ? 90 : 30);
      if (score > bestScore) {
        bestScore = score;
        best = { x: cx, z: cz };
      }
    }
  }

  for (let r = 20; r <= 170; r += 26) {
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2;
      const cx = quantize(midX + Math.cos(ang) * r);
      const cz = quantize(midZ + Math.sin(ang) * r);
      if (!isBuildableTerrain(cx, cz).ok || !safeFromForts(cx, cz)) continue;
      const fDens = getForestDensityAt(cx, cz);
      const biome = getBiomeAt(cx, cz);
      const rDist = getRoadDistance(cx, cz);
      let score = 0;
      if (biome === 'western_forest' || fDens >= 0.4) score += 160;
      else if (fDens >= 0.34) score += 95;
      if (rDist >= 18 && rDist <= 95) score += 75;
      score -= Math.abs(Math.hypot(cx - lairX, cz - lairZ) - 115) * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = { x: cx, z: cz };
      }
    }
  }

  if (best) return best;
  const fallback = findBuildableCampSiteNear(lairX, lairZ, 42, 110);
  return fallback;
}

function spawnBanditHideout(
  player: PlayerState,
  spawnX: number,
  spawnZ: number,
  difficulty: PveDifficulty,
  archetype: BanditCampArchetype
) {
  const culture: CultureKind = normalizeCultureKind(player.culture ?? 'bedouin_nomadic');
  const dirX = spawnX < 0 ? 1 : -1;
  const dirZ = spawnZ < 0 ? 1 : -1;

  const hideoutStructures: Array<{
    kind: StructureKind;
    level: StructureLevel;
    dx: number;
    dz: number;
    rot: number;
  }> = [
    // Bandit Lair Keep (core objective to clear the camp)
    { kind: 'keep', level: 1, dx: 0, dz: 0, rot: 0 },
    // Raider Tents & Brigand Pavilions (no civilian houses/temples/markets)
    { kind: 'war_tent', level: 1, dx: -dirX * 7, dz: -3.5, rot: 0 },
    { kind: 'bedouin_tent', level: 1, dx: -dirX * 8, dz: 5, rot: 0.4 },
    { kind: 'barracks', level: 1, dx: dirX * 8, dz: dirZ * 4, rot: 0 },
    { kind: 'watchtower', level: 1, dx: dirX * 5, dz: -dirZ * 9, rot: 0 },
  ];

  if (difficulty !== 'casual') {
    hideoutStructures.push({
      kind: 'war_tent',
      level: 1,
      dx: dirX * 9.5,
      dz: -dirZ * 3,
      rot: -0.35,
    });
  }
  if (difficulty === 'aggressive' || archetype === 'highway_raiders') {
    hideoutStructures.push({
      kind: 'watchtower',
      level: 1,
      dx: -dirX * 5,
      dz: dirZ * 10,
      rot: 0,
    });
  }

  const campHpMult =
    difficulty === 'casual' ? 0.78 : difficulty === 'aggressive' ? 1.08 : 0.92;

  hideoutStructures.forEach((b) => {
    const pos =
      b.dx === 0 && b.dz === 0
        ? { x: quantize(spawnX), z: quantize(spawnZ) }
        : findValidPlacementNear(spawnX, spawnZ, b.dx, b.dz, 3.8);
    if (!pos) return;
    const id = nextEntityId('str');
    const spec = STRUCTURE_SPECS[b.kind];
    const maxHp = Math.round(spec.maxHp * campHpMult);
    worldState.structures[id] = {
      id,
      ownerId: player.id,
      ownerColor: player.color,
      secondaryColor: player.secondaryColor ?? '#18181b',
      bannerPattern: player.bannerPattern ?? 'crossed_swords',
      kind: b.kind,
      culture,
      level: b.level,
      x: pos.x,
      z: pos.z,
      rotationY: b.rot,
      hp: maxHp,
      maxHp,
      createdAtTick: worldState.tick,
    };
  });

  // Individually weaker bandits operating in nimble ambush packs & looters
  const initialBrigands: Array<{ kind: UnitKind; dx: number; dz: number }> =
    difficulty === 'casual'
      ? [
          { kind: 'worker', dx: dirX * 4, dz: -2 },
          { kind: 'infantry', dx: dirX * 7, dz: dirZ * 6 },
          { kind: 'infantry', dx: dirX * 8, dz: dirZ * 4 },
          { kind: 'archer', dx: dirX * 6, dz: dirZ * 8 },
        ]
      : difficulty === 'aggressive'
        ? [
            { kind: 'worker', dx: dirX * 4, dz: -2 },
            { kind: 'worker', dx: -dirX * 4, dz: 3 },
            { kind: 'infantry', dx: dirX * 7, dz: dirZ * 6 },
            { kind: 'infantry', dx: dirX * 9, dz: dirZ * 7 },
            { kind: 'spearman', dx: dirX * 10, dz: dirZ * 5 },
            { kind: 'archer', dx: dirX * 6, dz: dirZ * 8 },
            { kind: 'archer', dx: -dirX * 6, dz: dirZ * 7 },
            { kind: 'knight', dx: dirX * 11, dz: dirZ * 8 },
            { kind: 'knight', dx: dirX * 11, dz: -dirZ * 5 },
          ]
        : [
            { kind: 'worker', dx: dirX * 4, dz: -2 },
            { kind: 'infantry', dx: dirX * 7, dz: dirZ * 6 },
            { kind: 'infantry', dx: dirX * 8, dz: dirZ * 4 },
            { kind: 'spearman', dx: dirX * 9, dz: dirZ * 6 },
            { kind: 'archer', dx: dirX * 8, dz: dirZ * 8 },
            { kind: 'archer', dx: -dirX * 6, dz: dirZ * 7 },
            { kind: 'knight', dx: dirX * 10, dz: -dirZ * 6 },
          ];

  initialBrigands.forEach((u) => {
    createBanditUnit(player, u.kind, spawnX + u.dx, spawnZ + u.dz, 'guard_lair');
  });

  // Stolen loot caches & woodland timber beside the bandit hideout
  const lootCaches: Array<{ kind: ResourceNode['kind']; dx: number; dz: number }> = [
    { kind: 'wood', dx: -dirX * 17, dz: -10 },
    { kind: 'gold', dx: dirX * 17, dz: -9 },
    { kind: 'food', dx: -dirX * 16, dz: 11 },
    { kind: 'stone', dx: dirX * 16, dz: 11 },
  ];
  lootCaches.forEach((res) => {
    const rx = quantize(spawnX + res.dx);
    const rz = quantize(spawnZ + res.dz);
    if (isBuildableTerrain(rx, rz).ok) {
      const rid = nextEntityId('res_bnd');
      worldState.resourceNodes[rid] = {
        id: rid,
        kind: res.kind,
        x: rx,
        z: rz,
        amount: 2600,
        maxAmount: 2600,
      };
    }
  });

  resourcesDirty = true;
  structuresDirty = true;
}

function spawnSingleBanditCamp(
  slotIdx: number,
  difficulty: PveDifficulty,
  anchorX: number,
  anchorZ: number
): PlayerState {
  const preset = BANDIT_CLAN_PRESETS[slotIdx % BANDIT_CLAN_PRESETS.length];
  const site = findBanditHideoutSite(slotIdx, preset, anchorX, anchorZ);
  const rx = site.x;
  const rz = site.z;

  const banditId = `ai_rival_${slotIdx + 1}`;
  const campCulture: CultureKind = 'bedouin_nomadic';

  const startMult = difficulty === 'casual' ? 0.85 : difficulty === 'aggressive' ? 1.35 : 1.05;
  const banditPlayer: PlayerState = {
    id: banditId,
    name: preset.name,
    color: preset.color,
    secondaryColor: preset.secondaryColor,
    bannerPattern: preset.bannerPattern,
    factionName: preset.factionName,
    provinceAr: 'أحراش وممرات القوافل',
    aiFactionKind: 'bandits',
    culture: campCulture,
    connectedAt: Date.now(),
    pingMs: 0,
    camera: {
      targetX: rx,
      targetZ: rz,
      zoom: 42,
      yaw: 0,
      pitch: 58,
      cursorX: rx,
      cursorZ: rz,
    },
    resources: {
      wood: Math.round(620 * startMult),
      stone: Math.round(480 * startMult),
      gold: Math.round(520 * startMult),
      food: Math.round(520 * startMult),
      cloth: Math.round(320 * startMult),
      horses: Math.round(240 * startMult),
    },
    packetsReceived: 0,
    packetsSent: 0,
    isAi: true,
    isBandit: true,
    banditCampArchetype: preset.archetype,
    isDefeated: false,
    defeatedAtMs: undefined,
    aiDifficulty: difficulty,
    kills: 0,
    losses: 0,
    structuresRazed: 0,
  };

  worldState.players[banditId] = banditPlayer;
  ensureSectorsMaterialized(rx, rz, 768);
  spawnBanditHideout(banditPlayer, rx, rz, difficulty, preset.archetype);
  return banditPlayer;
}

function spawnOrganizedAiKingdoms(difficulty: PveDifficulty) {
  const hpMult = difficulty === 'casual' ? 0.9 : difficulty === 'aggressive' ? 1.2 : 1.0;

  for (const preset of AI_KINGDOM_PRESETS) {
    if (worldState.players[preset.id]) {
      clearSingleAiPlayer(preset.id);
    }
    const slot = SPAWN_PLATEAUS[preset.plateauIndex] ?? SPAWN_PLATEAUS[0];
    const rx = slot.x;
    const rz = slot.z;
    const isBedouinCity = preset.culture === 'bedouin_nomadic';
    const isWalledCity = Boolean(slot.walled) && !isBedouinCity;
    const mainLv: StructureLevel = preset.isCapital ? 3 : 2;
    const subLv: StructureLevel = preset.isCapital ? 2 : 1;

    const aiPlayer: PlayerState = {
      id: preset.id,
      name: preset.name,
      cityNameAr: preset.cityNameAr,
      administrationTitleAr: preset.administrationTitleAr,
      color: preset.color,
      secondaryColor: preset.secondaryColor,
      bannerPattern: preset.bannerPattern,
      factionName: preset.factionName,
      provinceAr: preset.provinceAr,
      aiFactionKind: preset.aiFactionKind,
      culture: preset.culture,
      connectedAt: Date.now(),
      pingMs: 0,
      camera: {
        targetX: rx,
        targetZ: rz,
        zoom: 42,
        yaw: 0,
        pitch: 58,
        cursorX: rx,
        cursorZ: rz,
      },
      resources: {
        wood: 950,
        stone: 900,
        gold: 900,
        food: 850,
        cloth: 500,
        horses: 400,
      },
      packetsReceived: 0,
      packetsSent: 0,
      isAi: true,
      isBandit: false,
      isDefeated: false,
      defeatedAtMs: undefined,
      aiDifficulty: difficulty,
      kills: 0,
      losses: 0,
      structuresRazed: 0,
    };

    worldState.players[preset.id] = aiPlayer;
    ensureSectorsMaterialized(rx, rz, 768);

    const blueprint = getBespokeCityBlueprintById(preset.id);

    let cityLayout: PlannedCityBuilding[];
    if (blueprint) {
      cityLayout = blueprint.buildings;
    } else {
      // Fallback compact layout only if a future preset has no bespoke blueprint
      const housingKind: StructureKind = isBedouinCity ? 'bedouin_tent' : 'house';
      cityLayout = [
        { kind: 'keep', level: mainLv, dx: 0, dz: 0, rot: 0, exact: true },
        { kind: 'temple', level: mainLv, dx: -10, dz: -10, rot: 0 },
        { kind: 'market', level: mainLv, dx: 10, dz: -10, rot: 0 },
        { kind: housingKind, level: mainLv, dx: -10.5, dz: 4.5, rot: 0 },
        { kind: housingKind, level: mainLv, dx: -10.5, dz: 11.5, rot: Math.PI / 2 },
        { kind: housingKind, level: subLv, dx: 10.5, dz: 11.5, rot: -Math.PI / 2 },
        { kind: 'barracks', level: mainLv, dx: 10.5, dz: 4.5, rot: 0 },
        { kind: 'farm', level: subLv, dx: -27.5, dz: -4.5, rot: 0 },
      ];
      if (!isWalledCity) {
        cityLayout.push(
          { kind: 'watchtower', level: 2, dx: 0, dz: 16, rot: 0, exact: true },
          { kind: 'war_tent', level: 2, dx: 12.5, dz: -4.5, rot: 0 }
        );
      }
    }

    cityLayout.forEach((b) => {
      let pos: { x: number; z: number } | null = null;
      if (b.exact) {
        const tx = quantize(rx + b.dx);
        const tz = quantize(rz + b.dz);
        const terrainCheck = isBuildableTerrain(tx, tz);
        if (terrainCheck.ok) {
          pos = { x: tx, z: tz };
        } else if (
          b.kind === 'moat_trench' ||
          b.kind === 'stone_wall' ||
          b.kind === 'watchtower' ||
          b.kind === 'gatehouse'
        ) {
          // Allow coastal/harbor fortifications and moats on shallow edges without dropping wall continuity
          const h = getTerrainHeight(tx, tz);
          if (h >= WATER_LEVEL_Y - 0.9) {
            pos = { x: tx, z: tz };
          }
        }
      } else {
        pos = findValidPlacementNear(rx, rz, b.dx, b.dz, 3.25);
      }
      if (!pos) return;
      const id = nextEntityId('str');
      const spec = STRUCTURE_SPECS[b.kind];
      const lvMult = b.level === 3 ? 2.1 : b.level === 2 ? 1.45 : 1.0;
      const fortTerrain = evaluateFortificationTerrain(pos.x, pos.z);
      const maxHp = Math.round(spec.maxHp * lvMult * hpMult);
      worldState.structures[id] = {
        id,
        ownerId: aiPlayer.id,
        ownerColor: aiPlayer.color,
        secondaryColor: aiPlayer.secondaryColor,
        bannerPattern: aiPlayer.bannerPattern,
        kind: b.kind,
        culture: preset.culture,
        level: b.level,
        x: pos.x,
        z: pos.z,
        rotationY: b.rot,
        hp: maxHp,
        maxHp,
        createdAtTick: worldState.tick,
        ...(b.kind === 'gatehouse' ? { isGateLocked: false } : {}),
        ...(b.kind === 'moat_trench' ? { isWaterMoat: fortTerrain.isWaterFedMoat } : {}),
      };
    });

    const garrisonKinds: UnitKind[] = blueprint
      ? blueprint.garrison
      : preset.isCapital
        ? ['worker', 'worker', 'commander', 'knight', 'knight', 'infantry', 'infantry', 'spearman', 'archer', 'archer']
        : ['worker', 'knight', 'infantry', 'spearman', 'archer', 'archer'];

    const hotspots = blueprint?.hotspots ?? [];
    const gateSpots = hotspots.filter((h) => h.kind === 'gate' || h.kind === 'harbor');
    const civicSpots = hotspots.filter((h) => h.kind === 'plaza' || h.kind === 'souq' || h.kind === 'mosque');

    garrisonKinds.forEach((uk, idx) => {
      let ux: number;
      let uz: number;
      let ang = (idx / Math.max(1, garrisonKinds.length)) * Math.PI * 2;

      if (uk === 'worker' && civicSpots.length > 0) {
        const spot = civicSpots[idx % civicSpots.length];
        const a = ((idx * 1.9) % (Math.PI * 2));
        ux = quantize(rx + spot.x + Math.cos(a) * Math.min(4.2, spot.radius * 0.45));
        uz = quantize(rz + spot.z + Math.sin(a) * Math.min(4.2, spot.radius * 0.45));
        ang = a;
      } else if ((uk === 'spearman' || uk === 'archer' || uk === 'infantry') && gateSpots.length > 0) {
        const spot = gateSpots[idx % gateSpots.length];
        const a = ((idx * 2.3) % (Math.PI * 2));
        ux = quantize(rx + spot.x * 0.88 + Math.cos(a) * 2.4);
        uz = quantize(rz + spot.z * 0.88 + Math.sin(a) * 2.4);
        ang = Math.atan2(spot.z, spot.x);
      } else {
        const rad = uk === 'worker' ? 8 : uk === 'commander' ? 6.5 : 15;
        ux = quantize(rx + Math.cos(ang) * rad);
        uz = quantize(rz + Math.sin(ang) * rad);
      }

      const uSpec = UNIT_SPECS[uk];
      const uid = nextEntityId('unt');
      worldState.units[uid] = {
        id: uid,
        ownerId: aiPlayer.id,
        ownerColor: aiPlayer.color,
        secondaryColor: aiPlayer.secondaryColor,
        bannerPattern: aiPlayer.bannerPattern,
        kind: uk,
        x: ux,
        z: uz,
        targetX: ux,
        targetZ: uz,
        rotationY: ang,
        speed: uSpec.speed,
        state: 'idle',
        stance: 'defensive',
        activityAr:
          uk === 'worker'
            ? `يعمر ${preset.cityNameAr}`
            : preset.aiFactionKind === 'crusaders'
              ? `حامية ${preset.cityNameAr} الساحلية`
              : `حامية ${preset.cityNameAr}`,
        patrolling: false,
        hp: uSpec.maxHp,
        maxHp: uSpec.maxHp,
        isBanditUnit: false,
      };
    });
  }
  structuresDirty = true;
}

function spawnBanditClans(
  difficulty: PveDifficulty,
  campCount: number,
  anchorX: number,
  anchorZ: number,
  preserveAlive = false
) {
  const clampedCount = Math.max(1, Math.min(4, Math.round(campCount)));
  if (!preserveAlive) {
    clearAiPlayers(true);
    for (let i = 0; i < clampedCount; i++) {
      spawnSingleBanditCamp(i, difficulty, anchorX, anchorZ);
    }
  } else {
    for (let i = clampedCount; i < 4; i++) {
      const extraId = `ai_rival_${i + 1}`;
      if (worldState.players[extraId]) clearSingleAiPlayer(extraId);
    }
    for (let i = 0; i < clampedCount; i++) {
      const banditId = `ai_rival_${i + 1}`;
      const existing = worldState.players[banditId];
      if (existing && !existing.isDefeated) {
        existing.aiDifficulty = difficulty;
        existing.isBandit = true;
      } else {
        if (existing) clearSingleAiPlayer(banditId);
        spawnSingleBanditCamp(i, difficulty, anchorX, anchorZ);
      }
    }
  }
  structuresDirty = true;
}

// Boot 1080 AD PvE World: Organized AI Provinces (Sindhi State & Coastal Crusaders) + Bandit Lairs near Hisn al-Quful
spawnOrganizedAiKingdoms('balanced');
spawnBanditClans('balanced', 3, SPAWN_PLATEAUS[4].x, SPAWN_PLATEAUS[4].z);

function canAfford(resources: PlayerResources, cost: Partial<PlayerResources>): boolean {
  return (
    resources.wood >= (cost.wood ?? 0) &&
    resources.stone >= (cost.stone ?? 0) &&
    resources.gold >= (cost.gold ?? 0) &&
    resources.food >= (cost.food ?? 0) &&
    resources.cloth >= (cost.cloth ?? 0) &&
    resources.horses >= (cost.horses ?? 0)
  );
}

function deductResources(resources: PlayerResources, cost: Partial<PlayerResources>) {
  resources.wood -= cost.wood ?? 0;
  resources.stone -= cost.stone ?? 0;
  resources.gold -= cost.gold ?? 0;
  resources.food -= cost.food ?? 0;
  resources.cloth -= cost.cloth ?? 0;
  resources.horses -= cost.horses ?? 0;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const clientSockets = new Map<string, WebSocket>();

  function sendPacket<T>(ws: WebSocket, type: NetworkPacket['type'], payload: T) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const pkt: NetworkPacket<T> = {
      seq: serverSeq++,
      type,
      timestamp: Date.now(),
      senderId: 'SERVER_AUTH',
      payload,
    };
    ws.send(JSON.stringify(pkt));
  }

  function broadcastWorldSnapshot(reason: string, excludePid?: string) {
    for (const [pid, client] of clientSockets.entries()) {
      if (pid === excludePid || client.readyState !== WebSocket.OPEN) continue;
      const slice = filterWorldSliceForPlayer(pid, true, true);
      sendPacket(client, 'S2C_WORLD_SNAPSHOT', {
        reason,
        world: {
          ...worldState,
          structures: slice.structures ?? {},
          units: slice.units,
          resourceNodes: slice.resourceNodes ?? {},
          combatEvents: slice.combatEvents,
        },
      });
      if (worldState.players[pid]) {
        worldState.players[pid].packetsSent += 1;
      }
    }
  }

  app.get('/api/network-stats', (_req, res) => {
    res.json({
      status: 'ONLINE',
      tick: worldState.tick,
      tickRateHz: TICK_RATE_HZ,
      connectedPlayers: Object.keys(worldState.players).length,
      structuresCount: Object.keys(worldState.structures).length,
      unitsCount: Object.keys(worldState.units).length,
      serverSeq,
    });
  });

  app.get('/api/kingdom', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const email = req.user?.email ?? '';
      const kingdom = await loadKingdomByUid(uid, email);
      res.json({ kingdom });
    } catch (error) {
      console.error('GET /api/kingdom error:', error);
      res.status(500).json({ error: 'Failed to load kingdom data' });
    }
  });

  app.put('/api/kingdom', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const email = req.user?.email ?? '';
      const body = (req.body ?? {}) as Record<string, unknown>;

      const displayName =
        typeof body.displayName === 'string' && body.displayName.trim()
          ? body.displayName.trim().slice(0, 40)
          : 'قائد الحصن';
      const factionName =
        typeof body.factionName === 'string' && body.factionName.trim()
          ? body.factionName.trim().slice(0, 60)
          : displayName;
      const primaryColor =
        typeof body.primaryColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(body.primaryColor)
          ? body.primaryColor
          : '#0d9488';
      const secondaryColor =
        typeof body.secondaryColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(body.secondaryColor)
          ? body.secondaryColor
          : '#fbbf24';
      const rawBanner = String(body.bannerPattern ?? 'crescent_star') as BannerPatternKind;
      const bannerPattern: BannerPatternKind = BANNER_PATTERN_SPECS[rawBanner]
        ? rawBanner
        : 'crescent_star';
      const culture: CultureKind = normalizeCultureKind(body.culture as string | undefined);

      const rawRes = (body.resources ?? {}) as Partial<PlayerResources>;
      const resources: PlayerResources = {
        wood: Math.max(0, Math.min(1000000, Math.round(Number(rawRes.wood ?? 750)))),
        stone: Math.max(0, Math.min(1000000, Math.round(Number(rawRes.stone ?? 650)))),
        gold: Math.max(0, Math.min(1000000, Math.round(Number(rawRes.gold ?? 500)))),
        food: Math.max(0, Math.min(1000000, Math.round(Number(rawRes.food ?? 550)))),
        cloth: Math.max(0, Math.min(1000000, Math.round(Number(rawRes.cloth ?? 380)))),
        horses: Math.max(0, Math.min(1000000, Math.round(Number(rawRes.horses ?? 260)))),
      };

      const rawStructures = Array.isArray(body.structures)
        ? (body.structures as BlockoutStructure[])
        : [];
      const structures: BlockoutStructure[] = rawStructures.slice(0, 400).filter(
        (s) => s && typeof s.kind === 'string' && Boolean(STRUCTURE_SPECS[s.kind])
      );

      const rawUnits = Array.isArray(body.units) ? (body.units as BlockoutUnit[]) : [];
      const units: BlockoutUnit[] = rawUnits.slice(0, 400).filter(
        (u) => u && typeof u.kind === 'string' && Boolean(UNIT_SPECS[u.kind])
      );

      const rawCam = (body.camera ?? {}) as Partial<PlayerState['camera']>;
      const camera: PlayerState['camera'] = {
        targetX: Number(rawCam.targetX ?? 0),
        targetZ: Number(rawCam.targetZ ?? 0),
        zoom: Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, Number(rawCam.zoom ?? 38))),
        yaw: Number(rawCam.yaw ?? 0),
        pitch: Number(rawCam.pitch ?? 58),
        cursorX: Number(rawCam.cursorX ?? 0),
        cursorZ: Number(rawCam.cursorZ ?? 0),
      };

      const saved = await saveKingdomByUid(uid, email, {
        displayName,
        factionName,
        primaryColor,
        secondaryColor,
        bannerPattern,
        culture,
        resources,
        structures,
        units,
        camera,
      });

      res.json({ saved });
    } catch (error) {
      console.error('PUT /api/kingdom error:', error);
      res.status(500).json({ error: 'Failed to save kingdom data' });
    }
  });

  app.delete('/api/kingdom', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const email = req.user?.email ?? '';
      const result = await deleteKingdomByUid(uid, email);
      res.json(result);
    } catch (error) {
      console.error('DELETE /api/kingdom error:', error);
      res.status(500).json({ error: 'Failed to delete kingdom data' });
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    const humanPlayers = Object.values(worldState.players).filter((p) => !p.isAi);
    const humanIndex = humanPlayers.length;
    const preset = FACTION_PRESETS[humanIndex % FACTION_PRESETS.length];
    // Human players start at Hisn al-Quful (SPAWN_PLATEAUS[4]) and nearby desert/river frontier cities so Sindhi State & Crusaders hold Mirqab & Jerusalem
    const spawnCandidates = [
      SPAWN_PLATEAUS[4],
      SPAWN_PLATEAUS[14],
      SPAWN_PLATEAUS[18],
      SPAWN_PLATEAUS[15],
      SPAWN_PLATEAUS[29],
      SPAWN_PLATEAUS[8],
      ...SPAWN_PLATEAUS,
    ];
    const occupiedCoords = Object.values(worldState.structures).filter((s) => s.kind === 'keep');
    const spawnSlot =
      humanIndex === 0
        ? SPAWN_PLATEAUS[4]
        : (spawnCandidates.find(
            (cand) => !occupiedCoords.some((k) => Math.hypot(k.x - cand.x, k.z - cand.z) < 1200)
          ) ?? SPAWN_PLATEAUS[4]);

    const spawnBiome = getBiomeAt(spawnSlot.x, spawnSlot.z);
    const spawnLocalClimate = getEffectiveClimateAt(
      spawnSlot.x,
      spawnSlot.z,
      worldState.climate
    );
    const assignedCulture =
      humanIndex === 0
        ? preset.culture
        : getRecommendedCultureForBiome(spawnBiome, spawnLocalClimate);
    const playerId = `plr_${Math.random().toString(36).substring(2, 8)}`;

    const newPlayer: PlayerState = {
      id: playerId,
      name: `قائد ${humanIndex + 1}`,
      color: preset.color,
      secondaryColor: preset.secondaryColor,
      bannerPattern: preset.bannerPattern,
      factionName:
        humanIndex === 0
          ? preset.factionName
          : `${spawnSlot.continentNameAr}`,
      culture: assignedCulture,
      connectedAt: Date.now(),
      pingMs: 12,
      camera: {
        targetX: spawnSlot.x,
        targetZ: spawnSlot.z,
        zoom: 38,
        yaw: 0,
        pitch: 58,
        cursorX: spawnSlot.x,
        cursorZ: spawnSlot.z,
      },
      resources: {
        wood: 750,
        stone: 650,
        gold: 500,
        food: 550,
        cloth: 380,
        horses: 260,
      },
      packetsReceived: 0,
      packetsSent: 1,
      isAi: false,
      isDefeated: false,
      kills: 0,
      losses: 0,
      structuresRazed: 0,
    };

    worldState.players[playerId] = newPlayer;
    clientSockets.set(playerId, ws);

    if (!Object.values(worldState.players).some((p) => p.isAi && !p.isBandit)) {
      spawnOrganizedAiKingdoms(worldState.pveTheater?.difficulty ?? 'balanced');
    }
    if (!Object.values(worldState.players).some((p) => p.isBandit)) {
      spawnBanditClans(
        worldState.pveTheater?.difficulty ?? 'balanced',
        worldState.pveTheater?.strongholdCount ?? 3,
        spawnSlot.x,
        spawnSlot.z
      );
    }

    ensureSectorsMaterialized(spawnSlot.x, spawnSlot.z, 1280);
    spawnPlayerInitialBase(newPlayer, spawnSlot.x, spawnSlot.z, 'full_capital');

    const welcomeSlice = filterWorldSliceForPlayer(playerId, true, true);
    sendPacket(ws, 'S2C_WELCOME', {
      playerId,
      tickRateHz: TICK_RATE_HZ,
      world: {
        ...worldState,
        structures: welcomeSlice.structures ?? {},
        units: welcomeSlice.units,
        resourceNodes: welcomeSlice.resourceNodes ?? {},
        combatEvents: welcomeSlice.combatEvents,
      },
    });

    broadcastWorldSnapshot(`انضم ${newPlayer.factionName} إلى الساحة`, playerId);

    ws.on('message', (data: Buffer) => {
      try {
        const packet = JSON.parse(data.toString()) as NetworkPacket<Record<string, unknown>>;
        const player = worldState.players[playerId];
        if (!player) return;

        player.packetsReceived += 1;

        switch (packet.type) {
          case 'C2S_HANDSHAKE': {
            let heraldryChanged = false;
            if (typeof packet.payload?.name === 'string' && packet.payload.name.trim()) {
              player.name = packet.payload.name.trim().slice(0, 28);
              player.factionName = player.name;
            }
            const rawPrimary = packet.payload?.primaryColor;
            if (typeof rawPrimary === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawPrimary)) {
              player.color = rawPrimary;
              heraldryChanged = true;
            }
            const rawSecondary = packet.payload?.secondaryColor;
            if (typeof rawSecondary === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawSecondary)) {
              player.secondaryColor = rawSecondary;
              heraldryChanged = true;
            }
            const rawPattern = packet.payload?.bannerPattern as BannerPatternKind | undefined;
            if (rawPattern && BANNER_PATTERN_SPECS[rawPattern]) {
              player.bannerPattern = rawPattern;
              heraldryChanged = true;
            }

            if (heraldryChanged) {
              for (const st of Object.values(worldState.structures)) {
                if (st.ownerId === player.id) {
                  st.ownerColor = player.color;
                  st.secondaryColor = player.secondaryColor;
                  st.bannerPattern = player.bannerPattern;
                }
              }
              for (const u of Object.values(worldState.units)) {
                if (u.ownerId === player.id) {
                  u.ownerColor = player.color;
                  u.secondaryColor = player.secondaryColor;
                  u.bannerPattern = player.bannerPattern;
                }
              }
              structuresDirty = true;
            }

            sendPacket(ws, 'S2C_PACKET_ACK', {
              ackSeq: packet.seq,
              cmd: 'C2S_HANDSHAKE',
              ok: true,
              message: heraldryChanged
                ? `تم تحديث راية وألوان المملكة والجنود: ${player.name}`
                : `تم توثيق الجلسة: ${player.name}`,
            });
            break;
          }

          case 'C2S_PING': {
            const clientTime = Number(packet.payload?.clientTime || Date.now());
            const reportedRtt = Number(packet.payload?.lastRttMs || 0);
            if (reportedRtt > 0 && reportedRtt < 5000) {
              player.pingMs = Math.round(reportedRtt);
            }
            sendPacket(ws, 'S2C_PONG', {
              clientTime,
              serverTime: Date.now(),
              tick: worldState.tick,
            });
            break;
          }

          case 'C2S_CAMERA_SYNC': {
            const cam = packet.payload as Partial<PlayerState['camera']>;
            if (typeof cam.targetX === 'number') {
              player.camera.targetX = quantize(
                Math.max(-MAP_SIZE / 2, Math.min(MAP_SIZE / 2, cam.targetX))
              );
            }
            if (typeof cam.targetZ === 'number') {
              player.camera.targetZ = quantize(
                Math.max(-MAP_SIZE / 2, Math.min(MAP_SIZE / 2, cam.targetZ))
              );
            }
            if (typeof cam.zoom === 'number') {
              player.camera.zoom = quantize(
                Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, cam.zoom))
              );
            }
            if (typeof cam.yaw === 'number') {
              player.camera.yaw = Math.round(cam.yaw * 100) / 100;
            }
            if (typeof cam.pitch === 'number') {
              player.camera.pitch = quantize(cam.pitch);
            }
            if (typeof cam.cursorX === 'number') {
              player.camera.cursorX = quantize(cam.cursorX);
            }
            if (typeof cam.cursorZ === 'number') {
              player.camera.cursorZ = quantize(cam.cursorZ);
            }
            const materializeRadius = Math.min(
              2400,
              Math.max(1280, Math.round(player.camera.zoom * 2.4))
            );
            if (
              ensureSectorsMaterialized(
                player.camera.targetX,
                player.camera.targetZ,
                materializeRadius
              )
            ) {
              resourcesDirty = true;
            }
            break;
          }

          case 'C2S_SET_CULTURE': {
            const rawCulture = packet.payload?.culture as CultureKind | undefined;
            const applyToExisting = packet.payload?.applyToExisting !== false;
            const targetStructureId =
              typeof packet.payload?.structureId === 'string'
                ? packet.payload.structureId
                : undefined;
            const adaptAllToBiomes = packet.payload?.adaptAllToBiomes === true;

            if (adaptAllToBiomes) {
              let adaptedCount = 0;
              for (const st of Object.values(worldState.structures)) {
                if (st.ownerId === player.id) {
                  const localBiome = getBiomeAt(st.x, st.z);
                  const localClimate = getEffectiveClimateAt(
                    st.x,
                    st.z,
                    worldState.climate
                  );
                  const bestCulture = getRecommendedCultureForBiome(
                    localBiome,
                    localClimate
                  );
                  st.culture = bestCulture;
                  const spec = STRUCTURE_SPECS[st.kind];
                  const lvlMult = st.level === 2 ? 1.5 : st.level === 3 ? 2.25 : 1;
                  const envFit = evaluateEnvironmentalFit(
                    bestCulture,
                    localBiome,
                    localClimate,
                    st.level
                  );
                  st.maxHp = Math.round(spec.maxHp * lvlMult * envFit.maxHpMultiplier);
                  st.hp = st.maxHp;
                  adaptedCount += 1;
                }
              }
              structuresDirty = true;
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_SET_CULTURE',
                ok: true,
                message: `تم تكييف ${adaptedCount} مبنى مع بيئاتها الجغرافية لتحقيق أقصى كفاءة (+45%)`,
              });
              break;
            }

            if (!rawCulture || !CULTURE_SPECS[rawCulture]) return;

            if (targetStructureId) {
              const st = worldState.structures[targetStructureId];
              if (st && st.ownerId === player.id) {
                st.culture = rawCulture;
                const spec = STRUCTURE_SPECS[st.kind];
                const lvlMult = st.level === 2 ? 1.5 : st.level === 3 ? 2.25 : 1;
                const envFit = evaluateEnvironmentalFit(
                  rawCulture,
                  getBiomeAt(st.x, st.z),
                  getEffectiveClimateAt(st.x, st.z, worldState.climate),
                  st.level
                );
                st.maxHp = Math.round(spec.maxHp * lvlMult * envFit.maxHpMultiplier);
                st.hp = Math.min(st.maxHp, Math.max(st.hp, st.maxHp));
                structuresDirty = true;
                sendPacket(ws, 'S2C_PACKET_ACK', {
                  ackSeq: packet.seq,
                  cmd: 'C2S_SET_CULTURE',
                  ok: true,
                  message: `تم تحويل ${spec.labelAr} إلى طراز (${CULTURE_SPECS[rawCulture].shortAr}) — ${envFit.ratingLabelAr}`,
                });
              }
              break;
            }

            player.culture = rawCulture;
            if (applyToExisting) {
              for (const st of Object.values(worldState.structures)) {
                if (st.ownerId === player.id) {
                  st.culture = rawCulture;
                  const spec = STRUCTURE_SPECS[st.kind];
                  const lvlMult = st.level === 2 ? 1.5 : st.level === 3 ? 2.25 : 1;
                  const envFit = evaluateEnvironmentalFit(
                    rawCulture,
                    getBiomeAt(st.x, st.z),
                    getEffectiveClimateAt(st.x, st.z, worldState.climate),
                    st.level
                  );
                  st.maxHp = Math.round(spec.maxHp * lvlMult * envFit.maxHpMultiplier);
                  st.hp = Math.min(st.hp, st.maxHp);
                }
              }
              structuresDirty = true;
            }

            const cSpec = CULTURE_SPECS[rawCulture];
            sendPacket(ws, 'S2C_PACKET_ACK', {
              ackSeq: packet.seq,
              cmd: 'C2S_SET_CULTURE',
              ok: true,
              message: `تم اعتماد الطراز المعماري: ${cSpec.nameAr}`,
            });
            break;
          }

          case 'C2S_PLACE_STRUCTURE': {
            const kind = packet.payload?.kind as StructureKind;
            const rawCulture = packet.payload?.culture as CultureKind | undefined;
            const activeCulture: CultureKind = normalizeCultureKind(rawCulture ?? player.culture);
            const x = quantize(Number(packet.payload?.x ?? 0));
            const z = quantize(Number(packet.payload?.z ?? 0));
            const rotationY = Number(packet.payload?.rotationY ?? 0);

            const spec = STRUCTURE_SPECS[kind];
            if (!spec) return;

            const playerStructures = Object.values(worldState.structures).filter(
              (s) => s.ownerId === player.id
            );
            const urbanReport = evaluateKingdomUrbanization(
              playerStructures,
              normalizeCultureKind(player.culture),
              worldState.climate,
              getBiomeAt,
              (sx, sz) => getEffectiveClimateAt(sx, sz, worldState.climate)
            );

            if (urbanReport.tier < spec.requiredUrbanTier) {
              const reqSpec = URBANIZATION_TIERS[spec.requiredUrbanTier];
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_PLACE_STRUCTURE',
                ok: false,
                message: `يتطلب تشييد ${spec.labelAr} الوصول إلى (${reqSpec.nameAr} — ${reqSpec.minScore} نقطة تحضر، لديك ${urbanReport.score}). ابنِ وطوّر البيوت والمزارع أولاً!`,
              });
              return;
            }

            const terrainCheck = isBuildableTerrain(x, z);
            if (!terrainCheck.ok) {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_PLACE_STRUCTURE',
                ok: false,
                message: terrainCheck.reasonAr || 'التضاريس غير صالحة للبناء هنا',
              });
              return;
            }

            if (!canAfford(player.resources, spec.cost)) {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_PLACE_STRUCTURE',
                ok: false,
                message: 'الموارد غير كافية لبناء هذا الهيكل',
              });
              return;
            }

            const isFortSegment = (k: StructureKind) =>
              k === 'stone_wall' || k === 'moat_trench' || k === 'gatehouse' || k === 'watchtower';

            // Seamless Wall-to-Gatehouse Conversion: placing a gatehouse directly onto your own stone_wall replaces it cleanly
            let replacedWall: BlockoutStructure | null = null;
            if (kind === 'gatehouse') {
              let bestDist = 2.8;
              for (const s of Object.values(worldState.structures)) {
                if (s.ownerId === player.id && s.kind === 'stone_wall' && s.hp > 0) {
                  const d = Math.hypot(s.x - x, s.z - z);
                  if (d < bestDist) {
                    bestDist = d;
                    replacedWall = s;
                  }
                }
              }
            }

            const finalX = replacedWall ? replacedWall.x : x;
            const finalZ = replacedWall ? replacedWall.z : z;
            const finalRotationY = replacedWall ? replacedWall.rotationY : rotationY;

            const collision = Object.values(worldState.structures).some((s) => {
              if (replacedWall && s.id === replacedWall.id) return false;
              let reqDist = 4.2;
              if (
                (kind === 'stone_wall' || kind === 'moat_trench') &&
                (s.kind === 'stone_wall' || s.kind === 'moat_trench')
              ) {
                reqDist = kind !== s.kind ? 2.15 : 2.55;
              } else if (
                (kind === 'watchtower' && (s.kind === 'stone_wall' || s.kind === 'gatehouse')) ||
                (s.kind === 'watchtower' && (kind === 'stone_wall' || kind === 'gatehouse'))
              ) {
                reqDist = 2.55;
              } else if (isFortSegment(kind) && isFortSegment(s.kind)) {
                reqDist = 2.85;
              } else if (
                kind === 'house' ||
                kind === 'bedouin_tent' ||
                kind === 'war_tent' ||
                kind === 'stone_wall' ||
                kind === 'moat_trench' ||
                kind === 'watchtower'
              ) {
                reqDist = 3.2;
              }
              return Math.hypot(s.x - finalX, s.z - finalZ) < reqDist;
            });
            if (collision) {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_PLACE_STRUCTURE',
                ok: false,
                message: 'الموقع متداخل مع مبنى آخر على الشبكة',
              });
              return;
            }

            if (replacedWall) {
              delete worldState.structures[replacedWall.id];
              // Refund 50% of the replaced wall's stone
              player.resources.stone += Math.round((STRUCTURE_SPECS.stone_wall.cost.stone ?? 20) * 0.5);
            }

            deductResources(player.resources, spec.cost);
            const id = nextEntityId('str');
            const clampedX = Math.max(-MAP_SIZE / 2 + 5, Math.min(MAP_SIZE / 2 - 5, finalX));
            const clampedZ = Math.max(-MAP_SIZE / 2 + 5, Math.min(MAP_SIZE / 2 - 5, finalZ));
            const biomeId = getBiomeAt(clampedX, clampedZ);
            const biome = BIOME_SPECS[biomeId];
            const fortTerrain = evaluateFortificationTerrain(clampedX, clampedZ);
            const envFit = evaluateEnvironmentalFit(
              activeCulture,
              biomeId,
              getEffectiveClimateAt(clampedX, clampedZ, worldState.climate),
              1
            );
            const terrainFortHpMult =
              isFortSegment(kind) || kind === 'keep'
                ? 1 + fortTerrain.defenseBonusPct / 100
                : 1.0;
            const effectiveMaxHp = Math.round(
              spec.maxHp * envFit.maxHpMultiplier * terrainFortHpMult
            );

            const initialHp = Math.max(45, Math.round(effectiveMaxHp * 0.16));
            const buildTimeSeconds = spec.buildTimeSeconds ?? 14;

            // Find up to 2 nearest available workers belonging to the player to auto-dispatch to the construction site
            const myAvailableWorkers = Object.values(worldState.units)
              .filter(
                (u) =>
                  u.ownerId === player.id &&
                  u.kind === 'worker' &&
                  u.state !== 'building'
              )
              .sort(
                (a, b) =>
                  Math.hypot(a.x - clampedX, a.z - clampedZ) -
                  Math.hypot(b.x - clampedX, b.z - clampedZ)
              )
              .slice(0, 2);

            myAvailableWorkers.forEach((w, idx) => {
              const angle = (idx / Math.max(1, myAvailableWorkers.length)) * Math.PI + 0.4;
              const radius =
                kind === 'house' ||
                kind === 'watchtower' ||
                kind === 'bedouin_tent' ||
                kind === 'war_tent' ||
                kind === 'stone_wall' ||
                kind === 'moat_trench'
                  ? 2.3
                  : 3.1;
              w.targetX = quantize(clampedX + Math.cos(angle) * radius);
              w.targetZ = quantize(clampedZ + Math.sin(angle) * radius);
              w.assignedStructureId = id;
              w.assignedResourceId = undefined;
              w.patrolling = false;
              w.state = 'building';
              w.activityAr = `يشيّد ويرفع سقالات ${spec.labelAr}`;
            });

            const structure: BlockoutStructure = {
              id,
              ownerId: player.id,
              ownerColor: player.color,
              secondaryColor: player.secondaryColor ?? '#fbbf24',
              bannerPattern: player.bannerPattern ?? 'crescent_star',
              kind,
              culture: activeCulture,
              level: 1,
              x: clampedX,
              z: clampedZ,
              rotationY: finalRotationY,
              hp: initialHp,
              maxHp: effectiveMaxHp,
              isConstructing: true,
              constructionProgress: 0,
              buildTimeSeconds,
              activeBuildersCount: myAvailableWorkers.length,
              createdAtTick: worldState.tick,
              ...(kind === 'gatehouse' ? { isGateLocked: false } : {}),
              ...(kind === 'moat_trench' ? { isWaterMoat: fortTerrain.isWaterFedMoat } : {}),
            };
            worldState.structures[id] = structure;
            structuresDirty = true;

            const cSpec = CULTURE_SPECS[activeCulture];
            const fortNote =
              fortTerrain.isHighGround && (isFortSegment(kind) || kind === 'keep')
                ? ` · ${fortTerrain.labelAr}`
                : kind === 'moat_trench' && fortTerrain.isWaterFedMoat
                  ? ' · خندق مائي طبيعي'
                  : '';
            const buildersNote =
              myAvailableWorkers.length > 0
                ? ` — تم توجيه ${myAvailableWorkers.length} عمال لرفع السقالات (${buildTimeSeconds}ث)`
                : ` — وجّه العمال للموقع لتسريع البناء (${buildTimeSeconds}ث)`;
            sendPacket(ws, 'S2C_PACKET_ACK', {
              ackSeq: packet.seq,
              cmd: 'C2S_PLACE_STRUCTURE',
              ok: true,
              message: `${replacedWall ? 'تم تحويل السور إلى ' : 'بدأ تشييد '}${spec.labelAr} (${cSpec.shortAr}) في ${biome.nameAr}${fortNote}${buildersNote}`,
            });
            break;
          }

          case 'C2S_PLACE_FORT_BATCH': {
            const rawItems = Array.isArray(packet.payload?.items)
              ? (packet.payload.items as Array<{
                  kind?: StructureKind;
                  x?: number;
                  z?: number;
                  rotationY?: number;
                  culture?: CultureKind;
                }>).slice(0, 36)
              : [];
            if (rawItems.length === 0) return;

            const playerStructures = Object.values(worldState.structures).filter(
              (s) => s.ownerId === player.id
            );
            const urbanReport = evaluateKingdomUrbanization(
              playerStructures,
              normalizeCultureKind(player.culture),
              worldState.climate,
              getBiomeAt,
              (sx, sz) => getEffectiveClimateAt(sx, sz, worldState.climate)
            );

            const isFortSegment = (k: StructureKind) =>
              k === 'stone_wall' || k === 'moat_trench' || k === 'gatehouse' || k === 'watchtower';

            let placedCount = 0;
            let skippedCollision = 0;
            let stoppedResources = false;
            const placedIds: Array<{ id: string; x: number; z: number; kind: StructureKind }> = [];

            for (const item of rawItems) {
              const kind = item.kind as StructureKind;
              const spec = STRUCTURE_SPECS[kind];
              if (!spec) continue;
              if (urbanReport.tier < spec.requiredUrbanTier) continue;

              const bx = quantize(Number(item.x ?? 0));
              const bz = quantize(Number(item.z ?? 0));
              const brot = Number(item.rotationY ?? 0);
              const activeCulture = normalizeCultureKind(item.culture ?? player.culture);

              const terrainCheck = isBuildableTerrain(bx, bz);
              if (!terrainCheck.ok) {
                skippedCollision += 1;
                continue;
              }
              if (!canAfford(player.resources, spec.cost)) {
                stoppedResources = true;
                break;
              }

              const collision = Object.values(worldState.structures).some((s) => {
                let reqDist = 4.2;
                if (
                  (kind === 'stone_wall' || kind === 'moat_trench') &&
                  (s.kind === 'stone_wall' || s.kind === 'moat_trench')
                ) {
                  reqDist = kind !== s.kind ? 2.15 : 2.55;
                } else if (
                  (kind === 'watchtower' && (s.kind === 'stone_wall' || s.kind === 'gatehouse')) ||
                  (s.kind === 'watchtower' && (kind === 'stone_wall' || kind === 'gatehouse'))
                ) {
                  reqDist = 2.55;
                } else if (isFortSegment(kind) && isFortSegment(s.kind)) {
                  reqDist = 2.85;
                } else if (kind === 'stone_wall' || kind === 'moat_trench' || kind === 'watchtower') {
                  reqDist = 3.2;
                }
                return Math.hypot(s.x - bx, s.z - bz) < reqDist;
              });
              if (collision) {
                skippedCollision += 1;
                continue;
              }

              deductResources(player.resources, spec.cost);
              const id = nextEntityId('str');
              const clampedX = Math.max(-MAP_SIZE / 2 + 5, Math.min(MAP_SIZE / 2 - 5, bx));
              const clampedZ = Math.max(-MAP_SIZE / 2 + 5, Math.min(MAP_SIZE / 2 - 5, bz));
              const biomeId = getBiomeAt(clampedX, clampedZ);
              const fortTerrain = evaluateFortificationTerrain(clampedX, clampedZ);
              const envFit = evaluateEnvironmentalFit(
                activeCulture,
                biomeId,
                getEffectiveClimateAt(clampedX, clampedZ, worldState.climate),
                1
              );
              const terrainFortHpMult =
                isFortSegment(kind) || kind === 'keep'
                  ? 1 + fortTerrain.defenseBonusPct / 100
                  : 1.0;
              const effectiveMaxHp = Math.round(
                spec.maxHp * envFit.maxHpMultiplier * terrainFortHpMult
              );
              const initialHp = Math.max(45, Math.round(effectiveMaxHp * 0.18));
              const buildTimeSeconds = spec.buildTimeSeconds ?? 8;

              worldState.structures[id] = {
                id,
                ownerId: player.id,
                ownerColor: player.color,
                secondaryColor: player.secondaryColor ?? '#fbbf24',
                bannerPattern: player.bannerPattern ?? 'crescent_star',
                kind,
                culture: activeCulture,
                level: 1,
                x: clampedX,
                z: clampedZ,
                rotationY: brot,
                hp: initialHp,
                maxHp: effectiveMaxHp,
                isConstructing: true,
                constructionProgress: 0,
                buildTimeSeconds,
                activeBuildersCount: 0,
                createdAtTick: worldState.tick,
                ...(kind === 'gatehouse' ? { isGateLocked: false } : {}),
                ...(kind === 'moat_trench' ? { isWaterMoat: fortTerrain.isWaterFedMoat } : {}),
              };
              placedIds.push({ id, x: clampedX, z: clampedZ, kind });
              placedCount += 1;
            }

            if (placedCount > 0) {
              structuresDirty = true;
              // Auto-dispatch up to 3 idle workers along the newly laid fortification line
              const idleWorkers = Object.values(worldState.units)
                .filter(
                  (u) =>
                    u.ownerId === player.id &&
                    u.kind === 'worker' &&
                    u.state !== 'building'
                )
                .slice(0, 3);
              idleWorkers.forEach((w, idx) => {
                const target = placedIds[idx % placedIds.length];
                const angle = (idx / Math.max(1, idleWorkers.length)) * Math.PI + 0.4;
                w.targetX = quantize(target.x + Math.cos(angle) * 2.3);
                w.targetZ = quantize(target.z + Math.sin(angle) * 2.3);
                w.assignedStructureId = target.id;
                w.assignedResourceId = undefined;
                w.patrolling = false;
                w.state = 'building';
                w.activityAr = 'يشيّد خط التحصينات';
                const targetSt = worldState.structures[target.id];
                if (targetSt) targetSt.activeBuildersCount = (targetSt.activeBuildersCount ?? 0) + 1;
              });

              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_PLACE_FORT_BATCH',
                ok: true,
                message: `تم رصف ${placedCount} قطعة تحصين بنجاح${
                  stoppedResources ? ' (توقف عند نفاد الموارد)' : ''
                }${skippedCollision > 0 ? ` · تم تخطي ${skippedCollision} عائق` : ''}`,
              });
            } else {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_PLACE_FORT_BATCH',
                ok: false,
                message: stoppedResources
                  ? 'الموارد غير كافية لرصف صف التحصينات'
                  : 'المسار المختار غير صالح أو متداخل مع مبانٍ أخرى',
              });
            }
            break;
          }

          case 'C2S_TOGGLE_GATE': {
            const structureId = String(packet.payload?.structureId || '');
            const gate = worldState.structures[structureId];
            if (!gate || gate.ownerId !== player.id || gate.kind !== 'gatehouse') {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_TOGGLE_GATE',
                ok: false,
                message: 'لا يمكن التحكم بهذه البوابة',
              });
              return;
            }
            gate.isGateLocked = !gate.isGateLocked;
            structuresDirty = true;
            sendPacket(ws, 'S2C_PACKET_ACK', {
              ackSeq: packet.seq,
              cmd: 'C2S_TOGGLE_GATE',
              ok: true,
              message: gate.isGateLocked
                ? 'تم إغلاق مزلاج البوابة بالكامل (منع عبور الجميع)'
                : 'تم فتح البوابة تلقائياً لجنودك وحلفائك مع صد الأعداء',
            });
            break;
          }

          case 'C2S_UPGRADE_STRUCTURE': {
            const structureId = String(packet.payload?.structureId || '');
            const st = worldState.structures[structureId];
            if (!st || st.ownerId !== player.id) {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_UPGRADE_STRUCTURE',
                ok: false,
                message: 'لا يمكن تطوير هذا المبنى',
              });
              return;
            }

            if (st.level >= 3) {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_UPGRADE_STRUCTURE',
                ok: false,
                message: 'المبنى وصل إلى أقصى مستوى تطور (المستوى 3)',
              });
              return;
            }

            const spec = STRUCTURE_SPECS[st.kind];
            const upgradeReq = getStructureUpgradeRequirement(st.kind, st.level);
            if (!upgradeReq) return;
            const { nextLevel, cost, requiredTier: requiredTierForUpgrade } = upgradeReq;

            // Civic structures require higher Urbanization Tiers to upgrade; Houses & Farms can upgrade 1 tier earlier to drive Urbanization!
            const playerStructures = Object.values(worldState.structures).filter(
              (s) => s.ownerId === player.id
            );
            const urbanReport = evaluateKingdomUrbanization(
              playerStructures,
              normalizeCultureKind(player.culture),
              worldState.climate,
              getBiomeAt,
              (sx, sz) => getEffectiveClimateAt(sx, sz, worldState.climate)
            );

            if (urbanReport.tier < requiredTierForUpgrade) {
              const reqTierSpec =
                URBANIZATION_TIERS[requiredTierForUpgrade as 1 | 2 | 3];
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_UPGRADE_STRUCTURE',
                ok: false,
                message: `يتطلب تطوير ${spec.labelAr} إلى المستوى ${nextLevel} بلوغ (${reqTierSpec.nameAr} — ${reqTierSpec.minScore} نقطة تحضر). وسّع البيوت والمزارع أولاً!`,
              });
              return;
            }

            if (!canAfford(player.resources, cost)) {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_UPGRADE_STRUCTURE',
                ok: false,
                message: 'الموارد غير كافية لتطوير المبنى إلى المستوى التالي',
              });
              return;
            }

            if (st.isConstructing) {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_UPGRADE_STRUCTURE',
                ok: false,
                message: 'المبنى قيد التشييد حالياً — انتظر اكتمال رفع السقالات أولاً',
              });
              return;
            }

            deductResources(player.resources, cost);
            st.level = nextLevel as StructureLevel;
            const hpMultiplier = nextLevel === 2 ? 1.5 : 2.25;
            const stCulture = normalizeCultureKind(st.culture ?? player.culture);
            const envFit = evaluateEnvironmentalFit(
              stCulture,
              getBiomeAt(st.x, st.z),
              getEffectiveClimateAt(st.x, st.z, worldState.climate),
              st.level
            );
            st.maxHp = Math.round(spec.maxHp * hpMultiplier * envFit.maxHpMultiplier);
            st.isConstructing = true;
            st.constructionProgress = 0;
            st.buildTimeSeconds = Math.max(9, Math.round((spec.buildTimeSeconds ?? 14) * 0.85));

            // Auto-dispatch nearest available worker to build the upgrade
            const upgradeWorkers = Object.values(worldState.units)
              .filter(
                (u) =>
                  u.ownerId === player.id &&
                  u.kind === 'worker' &&
                  u.state !== 'building'
              )
              .sort(
                (a, b) =>
                  Math.hypot(a.x - st.x, a.z - st.z) -
                  Math.hypot(b.x - st.x, b.z - st.z)
              )
              .slice(0, 2);

            upgradeWorkers.forEach((w, idx) => {
              const angle = idx * Math.PI + 0.6;
              w.targetX = quantize(st.x + Math.cos(angle) * 2.8);
              w.targetZ = quantize(st.z + Math.sin(angle) * 2.8);
              w.assignedStructureId = st.id;
              w.assignedResourceId = undefined;
              w.patrolling = false;
              w.state = 'building';
              w.activityAr = `يطوّر ويشيّد ${spec.tierNamesAr[st.level]}`;
            });
            st.activeBuildersCount = upgradeWorkers.length;
            structuresDirty = true;

            sendPacket(ws, 'S2C_PACKET_ACK', {
              ackSeq: packet.seq,
              cmd: 'C2S_UPGRADE_STRUCTURE',
              ok: true,
              message: `بدأ تطوير ${spec.labelAr} إلى ${spec.tierNamesAr[st.level]} (نصب السقالات وتوجيه العمال)`,
            });
            break;
          }

          case 'C2S_SPAWN_UNIT': {
            const kind = packet.payload?.kind as UnitKind;
            const spec = UNIT_SPECS[kind];
            if (!spec) return;

            const playerStructures = Object.values(worldState.structures).filter(
              (s) => s.ownerId === player.id
            );
            const urbanReport = evaluateKingdomUrbanization(
              playerStructures,
              normalizeCultureKind(player.culture),
              worldState.climate,
              getBiomeAt,
              (sx, sz) => getEffectiveClimateAt(sx, sz, worldState.climate)
            );

            if (urbanReport.tier < spec.requiredUrbanTier) {
              const reqSpec = URBANIZATION_TIERS[spec.requiredUrbanTier];
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_SPAWN_UNIT',
                ok: false,
                message: `يتطلب تجنيد ${spec.labelAr} بلوغ (${reqSpec.nameAr} — ${reqSpec.minScore} نقطة تحضر). ابنِ البيوت والمزارع لرفع مستوى التحضر!`,
              });
              return;
            }

            // Compute housing population capacity & cavalry stable level via canonical shared helper
            const capacityReport = evaluateKingdomCapacity(
              playerStructures,
              normalizeCultureKind(player.culture),
              worldState.climate,
              getBiomeAt,
              (sx, sz) => getEffectiveClimateAt(sx, sz, worldState.climate)
            );
            const maxPop = capacityReport.maxPopulation;

            const currentUnitsCount = Object.values(worldState.units).filter(
              (u) => u.ownerId === player.id
            ).length;

            if (currentUnitsCount >= maxPop) {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_SPAWN_UNIT',
                ok: false,
                message: `سعة المساكن والخيام والمرابط ممتلئة (${currentUnitsCount}/${maxPop}). ابنِ أو طوّر البيوت أو الخيام أو مربط الخيول لتجنيد المزيد!`,
              });
              return;
            }

            if (!canAfford(player.resources, spec.cost)) {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_SPAWN_UNIT',
                ok: false,
                message:
                  'الموارد غير كافية لتدريب هذه الوحدة (تحقق من الغذاء والخشب والذهب والقماش والخيول المروضة)',
              });
              return;
            }

            const requestedCampId =
              typeof packet.payload?.structureId === 'string'
                ? packet.payload.structureId
                : undefined;
            const requestedCamp = requestedCampId
              ? playerStructures.find(
                  (s) => s.id === requestedCampId && (!s.isConstructing || s.level > 1)
                )
              : undefined;

            const readyStructures = playerStructures.filter(
              (s) => !s.isConstructing || s.level > 1
            );
            const spawnBase =
              requestedCamp ||
              (kind === 'knight' || kind === 'commander'
                ? readyStructures.find((s) => s.kind === 'horse_stable')
                : undefined) ||
              readyStructures.find((s) => s.kind === 'barracks') ||
              readyStructures.find((s) => s.kind === 'war_tent') ||
              readyStructures.find((s) => s.kind === 'keep') ||
              playerStructures.find((s) => s.kind === 'keep');

            const baseX = spawnBase ? spawnBase.x : player.camera.targetX;
            const baseZ = spawnBase ? spawnBase.z : player.camera.targetZ;
            const angle = Math.random() * Math.PI * 2;
            const dist = 4.6 + Math.random() * 2.2;
            const ux = quantize(baseX + Math.cos(angle) * dist);
            const uz = quantize(baseZ + Math.sin(angle) * dist);

            deductResources(player.resources, spec.cost);
            const unitId = nextEntityId('unt');
            const effectiveUnitHp = Math.round(
              spec.maxHp * urbanReport.unitHpMultiplier
            );

            // Cavalry units (knight, commander) gain +8% speed per Horse Stable level (up to +24%)
            const highestStableLvl = capacityReport.highestStableLevel;
            const cavalrySpeedMult =
              kind === 'knight' || kind === 'commander'
                ? 1 + highestStableLvl * 0.08
                : 1.0;
            const effectiveSpeed = quantize(spec.speed * cavalrySpeedMult);

            worldState.units[unitId] = {
              id: unitId,
              ownerId: player.id,
              ownerColor: player.color,
              secondaryColor: player.secondaryColor ?? '#fbbf24',
              bannerPattern: player.bannerPattern ?? 'crescent_star',
              kind,
              x: ux,
              z: uz,
              targetX: quantize(ux + Math.cos(angle) * 2.4),
              targetZ: quantize(uz + Math.sin(angle) * 2.4),
              rotationY: Math.round(angle * 100) / 100,
              speed: effectiveSpeed,
              state: 'moving',
              activityAr: spawnBase
                ? `تخرّج من ${STRUCTURE_SPECS[spawnBase.kind].labelAr.split(' (')[0]} (${spec.skills[0].nameAr})`
                : `جاهز في الميدان (${spec.skills[0].nameAr})`,
              hp: effectiveUnitHp,
              maxHp: effectiveUnitHp,
            };

            const campNameAr = spawnBase
              ? STRUCTURE_SPECS[spawnBase.kind].labelAr.split(' (')[0]
              : 'معسكر التدريب';
            sendPacket(ws, 'S2C_PACKET_ACK', {
              ackSeq: packet.seq,
              cmd: 'C2S_SPAWN_UNIT',
              ok: true,
              message: `تم تدريب وتخريج ${spec.shortAr} من ${campNameAr} (صحة: ${effectiveUnitHp} · هجوم: ${spec.attack} · مهارة: ${spec.skills[0].nameAr})`,
            });
            break;
          }

          case 'C2S_MOVE_UNITS': {
            const unitIds = Array.isArray(packet.payload?.unitIds)
              ? (packet.payload.unitIds as string[])
              : [];
            const targetX = Number(packet.payload?.targetX ?? 0);
            const targetZ = Number(packet.payload?.targetZ ?? 0);
            const resourceId =
              typeof packet.payload?.resourceId === 'string'
                ? packet.payload.resourceId
                : undefined;

            const validUnits = unitIds
              .map((id) => worldState.units[id])
              .filter((u): u is BlockoutUnit => Boolean(u && u.ownerId === player.id));

            if (validUnits.length === 0) return;

            // Check if target is one of the player's structures currently under construction
            const targetConstructingStruct = !resourceId
              ? Object.values(worldState.structures).find(
                  (s) =>
                    s.ownerId === player.id &&
                    s.isConstructing &&
                    Math.hypot(s.x - targetX, s.z - targetZ) <= 5.4
                )
              : undefined;

            const cols = Math.ceil(Math.sqrt(validUnits.length));
            const spacing = 2.2;

            validUnits.forEach((u, index) => {
              const row = Math.floor(index / cols);
              const col = index % cols;
              const offsetX = (col - (cols - 1) / 2) * spacing;
              const offsetZ = (row - (cols - 1) / 2) * spacing;

              if (targetConstructingStruct && u.kind === 'worker') {
                const angle = (index / Math.max(1, validUnits.length)) * Math.PI * 2;
                const radius =
                  targetConstructingStruct.kind === 'house' ||
                  targetConstructingStruct.kind === 'watchtower' ||
                  targetConstructingStruct.kind === 'bedouin_tent' ||
                  targetConstructingStruct.kind === 'war_tent'
                    ? 2.4
                    : 3.1;
                u.targetX = quantize(targetConstructingStruct.x + Math.cos(angle) * radius);
                u.targetZ = quantize(targetConstructingStruct.z + Math.sin(angle) * radius);
                u.assignedStructureId = targetConstructingStruct.id;
                u.assignedResourceId = undefined;
                u.state = 'building';
                u.patrolling = false;
                u.activityAr = `يساهم في تشييد ${STRUCTURE_SPECS[targetConstructingStruct.kind]?.labelAr ?? 'المبنى'}`;
              } else {
                u.targetX = quantize(
                  Math.max(-MAP_SIZE / 2 + 3, Math.min(MAP_SIZE / 2 - 3, targetX + offsetX))
                );
                u.targetZ = quantize(
                  Math.max(-MAP_SIZE / 2 + 3, Math.min(MAP_SIZE / 2 - 3, targetZ + offsetZ))
                );
                u.assignedStructureId = undefined;
                u.assignedResourceId = resourceId;
                u.targetUnitId = undefined;
                u.targetStructureId = undefined;
                u.attackMoveTarget = undefined;
                u.waypoints = undefined;
                u.departedAtMs = undefined;
                u.totalDistanceM = undefined;
                u.etaServerMs = undefined;
                u.marchOrderLabelAr = undefined;
                u.state = resourceId ? 'gathering' : 'moving';
                u.patrolling = false;
                u.activityAr = resourceId
                  ? 'يتجه لحصاد الموارد'
                  : 'يتحرك بأمر القائد';
              }
            });

            const destBiome = BIOME_SPECS[getBiomeAt(targetX, targetZ)];
            sendPacket(ws, 'S2C_PACKET_ACK', {
              ackSeq: packet.seq,
              cmd: 'C2S_MOVE_UNITS',
              ok: true,
              message: targetConstructingStruct
                ? `توجيه العمال لتسريع تشييد ${STRUCTURE_SPECS[targetConstructingStruct.kind]?.labelAr ?? 'المبنى'}`
                : resourceId
                  ? `توجيه ${validUnits.length} وحدة لجمع الموارد في ${destBiome.nameAr}`
                  : `تحريك ${validUnits.length} وحدة نحو ${destBiome.nameAr} (${formatWorldCoordKm(targetX)}, ${formatWorldCoordKm(targetZ)})`,
            });
            break;
          }

          case 'C2S_ATTACK_TARGET': {
            const unitIds = Array.isArray(packet.payload?.unitIds)
              ? (packet.payload.unitIds as string[])
              : [];
            const targetUnitId =
              typeof packet.payload?.targetUnitId === 'string'
                ? packet.payload.targetUnitId
                : undefined;
            const targetStructureId =
              typeof packet.payload?.targetStructureId === 'string'
                ? packet.payload.targetStructureId
                : undefined;
            const targetX = Number(packet.payload?.targetX ?? 0);
            const targetZ = Number(packet.payload?.targetZ ?? 0);
            const attackMove = Boolean(packet.payload?.attackMove);

            const validUnits = unitIds
              .map((id) => worldState.units[id])
              .filter((u): u is BlockoutUnit => Boolean(u && u.ownerId === player.id));
            if (validUnits.length === 0) return;

            const enemyUnit =
              targetUnitId &&
              worldState.units[targetUnitId] &&
              isHostileOwners(player.id, worldState.units[targetUnitId].ownerId)
                ? worldState.units[targetUnitId]
                : undefined;
            const enemyStruct =
              !enemyUnit &&
              targetStructureId &&
              worldState.structures[targetStructureId] &&
              isHostileOwners(player.id, worldState.structures[targetStructureId].ownerId)
                ? worldState.structures[targetStructureId]
                : undefined;

            if (!enemyUnit && !enemyStruct && !attackMove) return;

            const cols = Math.ceil(Math.sqrt(validUnits.length));
            validUnits.forEach((u, index) => {
              u.assignedResourceId = undefined;
              u.assignedStructureId = undefined;
              u.waypoints = undefined;
              u.departedAtMs = undefined;
              u.totalDistanceM = undefined;
              u.etaServerMs = undefined;
              u.marchOrderLabelAr = undefined;
              u.patrolling = false;
              u.state = 'attacking';
              if (enemyUnit) {
                u.targetUnitId = enemyUnit.id;
                u.targetStructureId = undefined;
                u.attackMoveTarget = undefined;
                u.targetX = quantize(enemyUnit.x);
                u.targetZ = quantize(enemyUnit.z);
                u.activityAr = `يهاجم ${UNIT_SPECS[enemyUnit.kind].shortAr}`;
              } else if (enemyStruct) {
                u.targetUnitId = undefined;
                u.targetStructureId = enemyStruct.id;
                u.attackMoveTarget = undefined;
                u.targetX = quantize(enemyStruct.x);
                u.targetZ = quantize(enemyStruct.z);
                u.activityAr = `يحاصر ${STRUCTURE_SPECS[enemyStruct.kind].labelAr.split(' (')[0]}`;
              } else {
                const row = Math.floor(index / cols);
                const col = index % cols;
                const ox = (col - (cols - 1) / 2) * 2.4;
                const oz = (row - (cols - 1) / 2) * 2.4;
                const destX = quantize(
                  Math.max(-WORLD_HALF_SIZE + 4, Math.min(WORLD_HALF_SIZE - 4, targetX + ox))
                );
                const destZ = quantize(
                  Math.max(-WORLD_HALF_SIZE + 4, Math.min(WORLD_HALF_SIZE - 4, targetZ + oz))
                );
                u.targetUnitId = undefined;
                u.targetStructureId = undefined;
                u.attackMoveTarget = { x: destX, z: destZ };
                u.targetX = destX;
                u.targetZ = destZ;
                u.activityAr = 'تقدم هجومي (هجوم-تحرك)';
              }
            });

            sendPacket(ws, 'S2C_PACKET_ACK', {
              ackSeq: packet.seq,
              cmd: 'C2S_ATTACK_TARGET',
              ok: true,
              message: enemyUnit
                ? `توجيه ${validUnits.length} وحدة لمهاجمة ${UNIT_SPECS[enemyUnit.kind].shortAr}`
                : enemyStruct
                  ? `توجيه ${validUnits.length} وحدة لمحاصرة ${STRUCTURE_SPECS[enemyStruct.kind].labelAr.split(' (')[0]}`
                  : `تقدم هجومي لـ ${validUnits.length} وحدة نحو (${formatWorldCoordKm(targetX)}, ${formatWorldCoordKm(targetZ)})`,
            });
            break;
          }

          case 'C2S_UNIT_STANCE': {
            const unitIds = Array.isArray(packet.payload?.unitIds)
              ? (packet.payload.unitIds as string[])
              : [];
            const action = String(packet.payload?.action ?? 'stop');
            const validUnits = unitIds
              .map((id) => worldState.units[id])
              .filter((u): u is BlockoutUnit => Boolean(u && u.ownerId === player.id));
            if (validUnits.length === 0) return;

            if (action === 'stop') {
              validUnits.forEach((u) => {
                u.targetX = u.x;
                u.targetZ = u.z;
                u.state = 'idle';
                u.patrolling = false;
                u.targetUnitId = undefined;
                u.targetStructureId = undefined;
                u.attackMoveTarget = undefined;
                u.assignedResourceId = undefined;
                u.assignedStructureId = undefined;
                u.waypoints = undefined;
                u.etaServerMs = undefined;
                u.activityAr = 'متوقف ومتمركز بأمر القائد';
              });
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_UNIT_STANCE',
                ok: true,
                message: `تم إيقاف ${validUnits.length} وحدة في مواقعها`,
              });
            } else if (action === 'aggressive' || action === 'defensive' || action === 'stand') {
              const stance = action as UnitStanceKind;
              validUnits.forEach((u) => {
                u.stance = stance;
                if (stance === 'stand') {
                  u.targetX = u.x;
                  u.targetZ = u.z;
                  u.attackMoveTarget = undefined;
                  u.patrolling = false;
                  u.activityAr = 'ثبات تكتيكي في الموقع';
                }
              });
              const stanceNameAr =
                stance === 'aggressive'
                  ? 'هجومي'
                  : stance === 'defensive'
                    ? 'دفاعي'
                    : 'ثابت بالموقع';
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_UNIT_STANCE',
                ok: true,
                message: `تم ضبط نمط الاشتباك لـ ${validUnits.length} وحدة: (${stanceNameAr})`,
              });
            }
            break;
          }

          case 'C2S_REPAIR_STRUCTURE': {
            const unitIds = Array.isArray(packet.payload?.unitIds)
              ? (packet.payload.unitIds as string[])
              : [];
            const structureId = String(packet.payload?.structureId ?? '');
            const st = worldState.structures[structureId];
            if (!st || st.ownerId !== player.id || st.hp >= st.maxHp) return;

            const validWorkers = unitIds
              .map((id) => worldState.units[id])
              .filter(
                (u): u is BlockoutUnit =>
                  Boolean(u && u.ownerId === player.id && u.kind === 'worker')
              );
            if (validWorkers.length === 0) return;

            validWorkers.forEach((w, idx) => {
              const ang = (idx / Math.max(1, validWorkers.length)) * Math.PI * 2;
              w.targetX = quantize(st.x + Math.cos(ang) * 3.0);
              w.targetZ = quantize(st.z + Math.sin(ang) * 3.0);
              w.assignedStructureId = st.id;
              w.assignedResourceId = undefined;
              w.targetUnitId = undefined;
              w.targetStructureId = undefined;
              w.attackMoveTarget = undefined;
              w.patrolling = false;
              w.state = 'repairing';
              w.activityAr = `يرمم ${STRUCTURE_SPECS[st.kind].labelAr.split(' (')[0]}`;
            });

            sendPacket(ws, 'S2C_PACKET_ACK', {
              ackSeq: packet.seq,
              cmd: 'C2S_REPAIR_STRUCTURE',
              ok: true,
              message: `توجيه ${validWorkers.length} عمال لترميم ${STRUCTURE_SPECS[st.kind].labelAr.split(' (')[0]}`,
            });
            break;
          }

          case 'C2S_SPAWN_PVE_FRONTS': {
            const rawDiff = packet.payload?.difficulty as PveDifficulty | undefined;
            const difficulty: PveDifficulty =
              rawDiff === 'casual' || rawDiff === 'balanced' || rawDiff === 'aggressive'
                ? rawDiff
                : 'balanced';
            const strongholdCount = Math.max(
              1,
              Math.min(4, Number(packet.payload?.strongholdCount ?? 3))
            );
            const replenishOnly = packet.payload?.replenishOnly !== false;

            const humans = Object.values(worldState.players).filter((p) => !p.isAi);
            const anchorHuman = humans[0] ?? player;
            const anchorKeep = Object.values(worldState.structures).find(
              (s) => s.ownerId === anchorHuman.id && s.kind === 'keep'
            );
            const anchorX = anchorKeep?.x ?? anchorHuman.camera.targetX ?? SPAWN_PLATEAUS[4].x;
            const anchorZ = anchorKeep?.z ?? anchorHuman.camera.targetZ ?? SPAWN_PLATEAUS[4].z;

            // Never wipe human kingdoms in persistent Online Co-op PvE!
            spawnBanditClans(difficulty, strongholdCount, anchorX, anchorZ, replenishOnly);
            // Update organized AI kingdom difficulty without wiping player progress
            for (const aiP of Object.values(worldState.players)) {
              if (aiP.isAi && !aiP.isBandit) {
                aiP.aiDifficulty = difficulty;
              }
            }

            worldState.pveTheater = {
              id: worldState.pveTheater?.id ?? nextEntityId('theater'),
              difficulty,
              strongholdCount,
              strongholdsCleared: worldState.pveTheater?.strongholdsCleared ?? 0,
              startedAtMs: worldState.pveTheater?.startedAtMs ?? Date.now(),
              lastRespawnAtMs: Date.now(),
            };
            structuresDirty = true;

            broadcastWorldSnapshot(
              replenishOnly
                ? `تم تعزيز أوكار قطاع الطرق (${strongholdCount} أوكار · ${difficulty === 'casual' ? 'هادئ' : difficulty === 'aggressive' ? 'شرس' : 'متوازن'}) في الغابات والطرق دون المساس بممالك اللاعبين`
                : `تم نشر موجة جديدة من عصابات قطاع الطرق (${strongholdCount} أوكار) مع بقاء جميع ممالك اللاعبين`
            );
            break;
          }

          case 'C2S_RECLAIM_KEEP': {
            const hasKeep = Object.values(worldState.structures).some(
              (s) => s.ownerId === player.id && s.kind === 'keep' && s.hp > 0
            );
            if (hasKeep) {
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_RECLAIM_KEEP',
                ok: false,
                message: 'معقلك ما يزال قائماً ولا يحتاج إلى إعادة تأسيس.',
              });
              break;
            }

            const existingKeeps = Object.values(worldState.structures).filter(
              (s) => s.kind === 'keep' && s.hp > 0
            );
            const freeSlot =
              SPAWN_PLATEAUS.find(
                (sp) => !existingKeeps.some((k) => Math.hypot(k.x - sp.x, k.z - sp.z) < 420)
              ) ?? SPAWN_PLATEAUS[4];

            player.isDefeated = false;
            player.defeatedAtMs = undefined;
            player.resources.wood = Math.max(player.resources.wood, 420);
            player.resources.stone = Math.max(player.resources.stone, 360);
            player.resources.gold = Math.max(player.resources.gold, 280);
            player.resources.food = Math.max(player.resources.food, 300);
            player.camera.targetX = freeSlot.x;
            player.camera.targetZ = freeSlot.z;

            ensureSectorsMaterialized(freeSlot.x, freeSlot.z, 900);
            const keepId = nextEntityId('str');
            const keepSpec = STRUCTURE_SPECS.keep;
            worldState.structures[keepId] = {
              id: keepId,
              ownerId: player.id,
              ownerColor: player.color,
              secondaryColor: player.secondaryColor ?? '#fbbf24',
              bannerPattern: player.bannerPattern ?? 'crescent_star',
              kind: 'keep',
              culture: normalizeCultureKind(player.culture),
              level: 1,
              x: quantize(freeSlot.x),
              z: quantize(freeSlot.z),
              rotationY: 0,
              hp: keepSpec.maxHp,
              maxHp: keepSpec.maxHp,
              createdAtTick: worldState.tick,
            };

            const reliefUnits: UnitKind[] = ['worker', 'worker', 'infantry', 'infantry', 'archer'];
            reliefUnits.forEach((uk, idx) => {
              const ang = (idx / reliefUnits.length) * Math.PI * 2;
              const ux = quantize(freeSlot.x + Math.cos(ang) * 7.5);
              const uz = quantize(freeSlot.z + Math.sin(ang) * 7.5);
              const uSpec = UNIT_SPECS[uk];
              const uid = nextEntityId('unt');
              worldState.units[uid] = {
                id: uid,
                ownerId: player.id,
                ownerColor: player.color,
                secondaryColor: player.secondaryColor ?? '#fbbf24',
                bannerPattern: player.bannerPattern ?? 'crescent_star',
                kind: uk,
                x: ux,
                z: uz,
                targetX: ux,
                targetZ: uz,
                rotationY: 0,
                speed: uSpec.speed,
                state: 'idle',
                stance: uk === 'worker' ? 'defensive' : 'aggressive',
                activityAr: 'حامية المعقل المستعاد',
                hp: uSpec.maxHp,
                maxHp: uSpec.maxHp,
              };
            });

            structuresDirty = true;
            resourcesDirty = true;
            broadcastWorldSnapshot(`أعاد ${player.factionName} تأسيس معقله لمواصلة القتال التعاوني`);
            break;
          }

          case 'C2S_ATLAS_DISPATCH': {
            const unitIds = Array.isArray(packet.payload?.unitIds)
              ? (packet.payload.unitIds as string[])
              : [];
            const rawWaypoints = Array.isArray(packet.payload?.waypoints)
              ? (packet.payload.waypoints as Array<{ x?: number; z?: number }>)
              : [];

            const clampedWaypoints: MarchWaypoint[] = rawWaypoints
              .slice(0, 24)
              .filter((wp) => wp && typeof wp.x === 'number' && typeof wp.z === 'number')
              .map((wp) => ({
                x: quantize(Math.max(-WORLD_HALF_SIZE + 500, Math.min(WORLD_HALF_SIZE - 500, wp.x!))),
                z: quantize(Math.max(-WORLD_HALF_SIZE + 500, Math.min(WORLD_HALF_SIZE - 500, wp.z!))),
              }));

            const validUnits = unitIds
              .map((id) => worldState.units[id])
              .filter((u): u is BlockoutUnit => Boolean(u && u.ownerId === player.id));

            if (validUnits.length === 0 || clampedWaypoints.length === 0) return;

            const nowMs = Date.now();
            const destWp = clampedWaypoints[clampedWaypoints.length - 1];
            const cols = Math.ceil(Math.sqrt(validUnits.length));
            const spacing = 3.2;

            let maxEtaSec = 0;
            let avgDistanceM = 0;

            validUnits.forEach((u, index) => {
              const row = Math.floor(index / cols);
              const col = index % cols;
              const offsetX = (col - (cols - 1) / 2) * spacing;
              const offsetZ = (row - (cols - 1) / 2) * spacing;

              const unitWaypoints: MarchWaypoint[] = clampedWaypoints.map((wp, wpIdx) =>
                wpIdx === clampedWaypoints.length - 1
                  ? {
                      x: quantize(Math.max(-WORLD_HALF_SIZE + 500, Math.min(WORLD_HALF_SIZE - 500, wp.x + offsetX))),
                      z: quantize(Math.max(-WORLD_HALF_SIZE + 500, Math.min(WORLD_HALF_SIZE - 500, wp.z + offsetZ))),
                    }
                  : wp
              );

              const stats = calculateMarchRouteStats(
                u.x,
                u.z,
                unitWaypoints,
                u.speed,
                u.kind,
                worldState.climate
              );

              maxEtaSec = Math.max(maxEtaSec, stats.estimatedSeconds);
              avgDistanceM += stats.totalDistanceM;

              u.waypoints = unitWaypoints;
              u.targetX = unitWaypoints[0].x;
              u.targetZ = unitWaypoints[0].z;
              u.departedAtMs = nowMs;
              u.totalDistanceM = stats.totalDistanceM;
              u.etaServerMs = nowMs + stats.estimatedSeconds * 1000;
              u.marchOrderLabelAr = `مسير قاري إلى (${formatWorldCoordKm(destWp.x)}, ${formatWorldCoordKm(destWp.z)})`;
              u.assignedStructureId = undefined;
              u.assignedResourceId = undefined;
              u.patrolling = false;
              u.state = 'moving';
              u.activityAr = u.marchOrderLabelAr;
            });

            avgDistanceM = Math.round(avgDistanceM / validUnits.length);
            ensureSectorsMaterialized(destWp.x, destWp.z, 768);

            sendPacket(ws, 'S2C_PACKET_ACK', {
              ackSeq: packet.seq,
              cmd: 'C2S_ATLAS_DISPATCH',
              ok: true,
              message: `انطلقت حملة من ${validUnits.length} وحدة لمسافة ${(avgDistanceM / 1000).toFixed(1)} كم — الوصول المتوقع: ${formatDurationAr(maxEtaSec)}`,
            });
            break;
          }

          case 'C2S_TRADE_RESOURCE': {
            const action = packet.payload?.action === 'buy' ? 'buy' : 'sell';
            const resource = packet.payload?.resource as
              | 'wood'
              | 'stone'
              | 'food'
              | 'cloth'
              | 'horses'
              | undefined;
            const amount = Math.max(50, Math.min(500, Number(packet.payload?.amount ?? 100)));

            if (
              !resource ||
              !['wood', 'stone', 'food', 'cloth', 'horses'].includes(resource)
            ) {
              return;
            }

            const playerStructures = Object.values(worldState.structures).filter(
              (s) => s.ownerId === playerId
            );
            const capacityReport = evaluateKingdomCapacity(
              playerStructures,
              normalizeCultureKind(player.culture),
              worldState.climate,
              getBiomeAt,
              (sx, sz) => getEffectiveClimateAt(sx, sz, worldState.climate)
            );

            const resNamesAr: Record<
              'wood' | 'stone' | 'food' | 'cloth' | 'horses',
              string
            > = {
              wood: 'خشب',
              stone: 'حجر',
              food: 'غذاء',
              cloth: 'قماش وقطن',
              horses: 'خيول أصيلة',
            };

            const { sellGoldPer100, buyGoldPer100, storageCap } = capacityReport;

            if (action === 'sell') {
              if (player.resources[resource] < amount) {
                sendPacket(ws, 'S2C_PACKET_ACK', {
                  ackSeq: packet.seq,
                  cmd: 'C2S_TRADE_RESOURCE',
                  ok: false,
                  message: `لا يوجد رصيد كافٍ من ${resNamesAr[resource]} للبيع (${amount} مطلوب)`,
                });
                return;
              }
              const goldEarned = Math.round((amount / 100) * sellGoldPer100);
              player.resources[resource] -= amount;
              player.resources.gold = Math.max(
                player.resources.gold,
                Math.min(storageCap, player.resources.gold + goldEarned)
              );
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_TRADE_RESOURCE',
                ok: true,
                message: `تم بيع ${amount} ${resNamesAr[resource]} مقابل +${goldEarned} ذهب في السوق`,
              });
            } else {
              if (player.resources[resource] >= storageCap) {
                sendPacket(ws, 'S2C_PACKET_ACK', {
                  ackSeq: packet.seq,
                  cmd: 'C2S_TRADE_RESOURCE',
                  ok: false,
                  message: `مخازن ${resNamesAr[resource]} ممتلئة (${storageCap}/${storageCap}) — طوّر السوق أو القلعة لرفع السعة`,
                });
                return;
              }
              const goldCost = Math.round((amount / 100) * buyGoldPer100);
              if (player.resources.gold < goldCost) {
                sendPacket(ws, 'S2C_PACKET_ACK', {
                  ackSeq: packet.seq,
                  cmd: 'C2S_TRADE_RESOURCE',
                  ok: false,
                  message: `الذهب غير كافٍ للشراء (${goldCost} ذهب مطلوب مقابل ${amount} ${resNamesAr[resource]})`,
                });
                return;
              }
              player.resources.gold -= goldCost;
              const nextAmount = Math.min(storageCap, player.resources[resource] + amount);
              const added = nextAmount - player.resources[resource];
              player.resources[resource] = nextAmount;
              sendPacket(ws, 'S2C_PACKET_ACK', {
                ackSeq: packet.seq,
                cmd: 'C2S_TRADE_RESOURCE',
                ok: true,
                message: `تم شراء +${added} ${resNamesAr[resource]} مقابل ${goldCost} ذهب`,
              });
            }
            break;
          }

          case 'C2S_SET_CLIMATE': {
            const requestedClimate = packet.payload?.climate as ClimateKind | undefined;
            const toggleAuto = packet.payload?.autoCycleClimate;

            if (typeof toggleAuto === 'boolean') {
              worldState.autoCycleClimate = toggleAuto;
            }

            if (requestedClimate && CLIMATE_SPECS[requestedClimate]) {
              worldState.climate = requestedClimate;
            }

            const cSpec = CLIMATE_SPECS[worldState.climate];
            sendPacket(ws, 'S2C_PACKET_ACK', {
              ackSeq: packet.seq,
              cmd: 'C2S_SET_CLIMATE',
              ok: true,
              message: `تغير مناخ العالم إلى: ${cSpec.nameAr}`,
            });
            break;
          }

          case 'C2S_HYDRATE_FROM_CLOUD': {
            const cloudResources = packet.payload?.resources as Partial<PlayerResources> | undefined;
            const cloudStructures = Array.isArray(packet.payload?.structures)
              ? (packet.payload.structures as BlockoutStructure[])
              : [];
            const cloudUnits = Array.isArray(packet.payload?.units)
              ? (packet.payload.units as BlockoutUnit[])
              : [];
            const displayName =
              typeof packet.payload?.displayName === 'string'
                ? packet.payload.displayName.trim().slice(0, 40)
                : '';
            const factionName =
              typeof packet.payload?.factionName === 'string'
                ? packet.payload.factionName.trim().slice(0, 60)
                : '';
            const primaryColor =
              typeof packet.payload?.primaryColor === 'string' &&
              /^#[0-9a-fA-F]{3,8}$/.test(packet.payload.primaryColor)
                ? packet.payload.primaryColor
                : undefined;
            const secondaryColor =
              typeof packet.payload?.secondaryColor === 'string' &&
              /^#[0-9a-fA-F]{3,8}$/.test(packet.payload.secondaryColor)
                ? packet.payload.secondaryColor
                : undefined;
            const rawBanner = packet.payload?.bannerPattern as BannerPatternKind | undefined;
            const bannerPattern =
              rawBanner && BANNER_PATTERN_SPECS[rawBanner] ? rawBanner : undefined;
            const rawCulture = packet.payload?.culture as string | undefined;
            const culture = rawCulture ? normalizeCultureKind(rawCulture) : undefined;
            const cloudCamera = packet.payload?.camera as Partial<PlayerState['camera']> | undefined;

            if (displayName) {
              player.name = displayName;
            }
            if (factionName) {
              player.factionName = factionName;
            } else if (displayName) {
              player.factionName = displayName;
            }
            if (primaryColor) player.color = primaryColor;
            if (secondaryColor) player.secondaryColor = secondaryColor;
            if (bannerPattern) player.bannerPattern = bannerPattern;
            if (culture) player.culture = culture;

            if (cloudResources) {
              player.resources = {
                wood: Math.max(0, Number(cloudResources.wood ?? player.resources.wood)),
                stone: Math.max(0, Number(cloudResources.stone ?? player.resources.stone)),
                gold: Math.max(0, Number(cloudResources.gold ?? player.resources.gold)),
                food: Math.max(0, Number(cloudResources.food ?? player.resources.food)),
                cloth: Math.max(0, Number(cloudResources.cloth ?? player.resources.cloth ?? 380)),
                horses: Math.max(
                  0,
                  Number(cloudResources.horses ?? player.resources.horses ?? 260)
                ),
              };
            }

            // Calculate migration offset if cloud save was created on older 340x340 or 1200x1200 maps
            let shiftX = 0;
            let shiftZ = 0;
            if (cloudStructures.length > 0) {
              const cloudKeep =
                cloudStructures.find((cs) => cs.kind === 'keep') ?? cloudStructures[0];
              const kx = Number(cloudKeep?.x ?? 0);
              const kz = Number(cloudKeep?.z ?? 0);
              const outOf100KmBounds =
                Math.max(Math.abs(kx), Math.abs(kz)) > WORLD_HALF_SIZE - 1500;
              if (Math.hypot(kx, kz) < 800 || outOf100KmBounds) {
                const existingKeep = Object.values(worldState.structures).find(
                  (s) => s.ownerId === playerId && s.kind === 'keep'
                );
                const homeX = existingKeep ? existingKeep.x : preset.spawnX;
                const homeZ = existingKeep ? existingKeep.z : preset.spawnZ;
                shiftX = homeX - kx;
                shiftZ = homeZ - kz;
                player.camera.targetX = homeX;
                player.camera.targetZ = homeZ;
              } else if (
                cloudCamera &&
                typeof cloudCamera.targetX === 'number' &&
                typeof cloudCamera.targetZ === 'number'
              ) {
                player.camera.targetX = cloudCamera.targetX;
                player.camera.targetZ = cloudCamera.targetZ;
                if (typeof cloudCamera.zoom === 'number') {
                  player.camera.zoom = cloudCamera.zoom;
                }
              }
            }

            ensureSectorsMaterialized(player.camera.targetX, player.camera.targetZ, 1280);

            if (cloudStructures.length > 0) {
              for (const sid of Object.keys(worldState.structures)) {
                if (worldState.structures[sid].ownerId === playerId) {
                  delete worldState.structures[sid];
                }
              }
              cloudStructures.forEach((cs) => {
                const spec = STRUCTURE_SPECS[cs.kind];
                if (!spec) return;
                const sid = cs.id || nextEntityId('str');
                const validCulture: CultureKind = normalizeCultureKind(
                  (cs.culture as string | undefined) ?? player.culture
                );
                worldState.structures[sid] = {
                  id: sid,
                  ownerId: playerId,
                  ownerColor: player.color,
                  secondaryColor: player.secondaryColor ?? '#fbbf24',
                  bannerPattern: player.bannerPattern ?? 'crescent_star',
                  kind: cs.kind,
                  culture: validCulture,
                  level: (cs.level === 2 || cs.level === 3 ? cs.level : 1) as StructureLevel,
                  x: quantize(Number(cs.x ?? 0) + shiftX),
                  z: quantize(Number(cs.z ?? 0) + shiftZ),
                  rotationY: Number(cs.rotationY ?? 0),
                  hp: Number(cs.hp ?? spec.maxHp),
                  maxHp: Number(cs.maxHp ?? spec.maxHp),
                  createdAtTick: worldState.tick,
                  isConstructing: Boolean(cs.isConstructing),
                  constructionProgress:
                    typeof cs.constructionProgress === 'number'
                      ? cs.constructionProgress
                      : undefined,
                  buildTimeSeconds:
                    typeof cs.buildTimeSeconds === 'number' ? cs.buildTimeSeconds : undefined,
                };
              });

              // Ensure older cloud saves that predated Houses/Markets/Temples get the new cultural buildings
              const myHydrated = Object.values(worldState.structures).filter(
                (s) => s.ownerId === playerId
              );
              const hasHouse = myHydrated.some((s) => s.kind === 'house');
              if (!hasHouse) {
                const keepSt = myHydrated.find((s) => s.kind === 'keep') ?? myHydrated[0];
                const bx = keepSt ? keepSt.x : preset.spawnX;
                const bz = keepSt ? keepSt.z : preset.spawnZ;
                const dirX = bx < 0 ? 1 : -1;
                const dirZ = bz < 0 ? 1 : -1;
                const cKind: CultureKind = normalizeCultureKind(player.culture);
                const extraBuildings: Array<{
                  kind: StructureKind;
                  level: StructureLevel;
                  dx: number;
                  dz: number;
                  rot: number;
                }> = [
                  { kind: 'house', level: 1, dx: -dirX * 6, dz: -2, rot: 0 },
                  { kind: 'house', level: 2, dx: -dirX * 6, dz: 4, rot: Math.PI / 2 },
                  { kind: 'house', level: 3, dx: -dirX * 11, dz: 1, rot: 0 },
                  { kind: 'market', level: 2, dx: 0, dz: -dirZ * 8, rot: 0 },
                  { kind: 'temple', level: 2, dx: -dirX * 8, dz: -dirZ * 8, rot: 0 },
                ];
                extraBuildings.forEach((eb) => {
                  const id = nextEntityId('str');
                  const spec = STRUCTURE_SPECS[eb.kind];
                  const hpMult = eb.level === 2 ? 1.5 : eb.level === 3 ? 2.25 : 1;
                  const maxHp = Math.round(spec.maxHp * hpMult);
                  worldState.structures[id] = {
                    id,
                    ownerId: playerId,
                    ownerColor: player.color,
                    secondaryColor: player.secondaryColor ?? '#fbbf24',
                    bannerPattern: player.bannerPattern ?? 'crescent_star',
                    kind: eb.kind,
                    culture: cKind,
                    level: eb.level,
                    x: bx + eb.dx,
                    z: bz + eb.dz,
                    rotationY: eb.rot,
                    hp: maxHp,
                    maxHp,
                    createdAtTick: worldState.tick,
                  };
                });
              }

              structuresDirty = true;
            }

            if (cloudUnits.length > 0) {
              for (const uid of Object.keys(worldState.units)) {
                if (worldState.units[uid].ownerId === playerId) {
                  delete worldState.units[uid];
                }
              }
              const nowMs = Date.now();
              cloudUnits.forEach((cu) => {
                const spec = UNIT_SPECS[cu.kind];
                if (!spec) return;
                const uid = cu.id || nextEntityId('unt');
                let ux = quantize(Number(cu.x ?? 0) + shiftX);
                let uz = quantize(Number(cu.z ?? 0) + shiftZ);
                let tx = quantize(Number(cu.targetX ?? cu.x ?? 0) + shiftX);
                let tz = quantize(Number(cu.targetZ ?? cu.z ?? 0) + shiftZ);
                let unitWaypoints: MarchWaypoint[] | undefined = Array.isArray(cu.waypoints)
                  ? cu.waypoints.map((wp) => ({
                      x: quantize(Number(wp.x ?? 0) + shiftX),
                      z: quantize(Number(wp.z ?? 0) + shiftZ),
                    }))
                  : undefined;
                let unitState: BlockoutUnit['state'] =
                  cu.state === 'moving' ||
                  cu.state === 'gathering' ||
                  cu.state === 'building'
                    ? cu.state
                    : 'idle';
                let etaMs = typeof cu.etaServerMs === 'number' ? cu.etaServerMs : undefined;
                let marchLabel = cu.marchOrderLabelAr;

                // Analytical offline march catch-up if player returns while army was marching!
                if (unitWaypoints && unitWaypoints.length > 0 && etaMs && cu.departedAtMs) {
                  if (nowMs >= etaMs) {
                    const lastWp = unitWaypoints[unitWaypoints.length - 1];
                    ux = lastWp.x;
                    uz = lastWp.z;
                    tx = lastWp.x;
                    tz = lastWp.z;
                    unitWaypoints = undefined;
                    etaMs = undefined;
                    marchLabel = undefined;
                    unitState = 'idle';
                  }
                }

                worldState.units[uid] = {
                  id: uid,
                  ownerId: playerId,
                  ownerColor: player.color,
                  secondaryColor: player.secondaryColor ?? '#fbbf24',
                  bannerPattern: player.bannerPattern ?? 'crescent_star',
                  kind: cu.kind,
                  x: ux,
                  z: uz,
                  targetX: tx,
                  targetZ: tz,
                  rotationY: Number(cu.rotationY ?? 0),
                  speed: Number(cu.speed ?? spec.speed),
                  state: unitState,
                  waypoints: unitWaypoints,
                  departedAtMs: cu.departedAtMs,
                  totalDistanceM: cu.totalDistanceM,
                  etaServerMs: etaMs,
                  marchOrderLabelAr: marchLabel,
                  hp: Number(cu.hp ?? spec.maxHp),
                  maxHp: Number(cu.maxHp ?? spec.maxHp),
                };
              });
            }

            const hydratedSlice = filterWorldSliceForPlayer(playerId, true, true);
            sendPacket(ws, 'S2C_WORLD_SNAPSHOT', {
              reason: `تمت مزامنة قاعدة وجيوش ${player.factionName} من الحفظ السحابي`,
              world: {
                ...worldState,
                structures: hydratedSlice.structures ?? {},
                units: hydratedSlice.units,
                resourceNodes: hydratedSlice.resourceNodes ?? {},
              },
            });
            break;
          }

          case 'C2S_RESET_WORLD': {
            worldState.structures = {};
            worldState.units = {};
            combatEventsBuffer = [];
            lastAlertTickByOwner.clear();
            lastAiRaidTick.clear();
            lastAiBuildTick.clear();
            loadedSectors.clear();
            worldState.resourceNodes = createInitialResourceNodes();
            prewarmStrategicSectors();
            worldState.climate = 'temperate_clear';

            const humans = Object.values(worldState.players).filter((p) => !p.isAi);
            let anchorX = SPAWN_PLATEAUS[4].x;
            let anchorZ = SPAWN_PLATEAUS[4].z;

            const humanSpawnSlots = [
              SPAWN_PLATEAUS[4],
              SPAWN_PLATEAUS[14],
              SPAWN_PLATEAUS[18],
              SPAWN_PLATEAUS[15],
              SPAWN_PLATEAUS[29],
              SPAWN_PLATEAUS[8],
            ];
            humans.forEach((p, idx) => {
              const slot = humanSpawnSlots[idx % humanSpawnSlots.length];
              if (idx === 0) {
                anchorX = slot.x;
                anchorZ = slot.z;
              }
              p.resources = {
                wood: 750,
                stone: 650,
                gold: 500,
                food: 550,
                cloth: 380,
                horses: 260,
              };
              p.isDefeated = false;
              p.kills = 0;
              p.losses = 0;
              p.structuresRazed = 0;
              p.camera.targetX = slot.x;
              p.camera.targetZ = slot.z;
              spawnPlayerInitialBase(p, slot.x, slot.z, 'full_capital');
            });

            const curDiff = worldState.pveTheater?.difficulty ?? 'balanced';
            const curStrongholds = worldState.pveTheater?.strongholdCount ?? 3;
            clearAiPlayers(false);
            spawnOrganizedAiKingdoms(curDiff);
            spawnBanditClans(curDiff, curStrongholds, anchorX, anchorZ);
            worldState.pveTheater = {
              id: nextEntityId('theater'),
              difficulty: curDiff,
              strongholdCount: curStrongholds,
              strongholdsCleared: 0,
              startedAtMs: Date.now(),
            };

            structuresDirty = true;
            resourcesDirty = true;

            for (const [pid, client] of clientSockets.entries()) {
              const slice = filterWorldSliceForPlayer(pid, true, true);
              sendPacket(client, 'S2C_WORLD_SNAPSHOT', {
                reason: 'تمت إعادة ضبط خريطة العالم وتضاريسها وبدء معركة جديدة',
                world: {
                  ...worldState,
                  structures: slice.structures ?? {},
                  units: slice.units,
                  resourceNodes: slice.resourceNodes ?? {},
                  combatEvents: slice.combatEvents,
                },
              });
            }
            break;
          }
        }
      } catch (err) {
        console.error('Invalid packet received:', err);
      }
    });

    ws.on('close', () => {
      clientSockets.delete(playerId);
      delete worldState.players[playerId];
      for (const sid of Object.keys(worldState.structures)) {
        if (worldState.structures[sid].ownerId === playerId) {
          delete worldState.structures[sid];
        }
      }
      for (const uid of Object.keys(worldState.units)) {
        if (worldState.units[uid].ownerId === playerId) {
          delete worldState.units[uid];
        }
      }
      structuresDirty = true;
      broadcastWorldSnapshot(`غادر القائد (${playerId}) الجلسة`);
    });
  });

  // Authoritative 20Hz Server Game Loop with Dirty-Flag Delta Optimization & Climate Simulation
  const dt = 1 / TICK_RATE_HZ;
  setInterval(() => {
    worldState.tick += 1;
    worldState.serverTime = Date.now();

    // Auto-cycle world climate every 1400 ticks (70 seconds) when enabled
    if (worldState.autoCycleClimate && worldState.tick % 1400 === 0) {
      const idx = CLIMATE_CYCLE_ORDER.indexOf(worldState.climate);
      worldState.climate = CLIMATE_CYCLE_ORDER[(idx + 1) % CLIMATE_CYCLE_ORDER.length];
    }

    const activeClimate = CLIMATE_SPECS[worldState.climate] ?? CLIMATE_SPECS.temperate_clear;

    // Trim expired VFX combat events (older than 16 ticks)
    if (combatEventsBuffer.length > 0) {
      combatEventsBuffer = combatEventsBuffer.filter((ev) => worldState.tick - ev.tick <= 16);
    }

    for (const unit of Object.values(worldState.units)) {
      const dx = unit.targetX - unit.x;
      const dz = unit.targetZ - unit.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 0.2) {
        let speedMult = getMovementSpeedMultiplierAt(
          unit.x,
          unit.z,
          unit.kind,
          worldState.climate
        );
        // Bandits move unimpeded in dense forests and gain burst speed during ambushes & retreats!
        if (unit.isBanditUnit) {
          if (getBiomeAt(unit.x, unit.z) === 'western_forest') {
            speedMult = Math.max(speedMult, 1.04);
          }
          if (unit.banditState === 'retreating') {
            speedMult *= 1.18;
          } else if (
            unit.banditState === 'ambush_strike' ||
            (unit.ambushBonusUntilTick ?? 0) >= worldState.tick
          ) {
            speedMult *= 1.15;
          }
        }
        // Server-authoritative Fortification Physics: Moats slow & injure hostiles; Walls & locked Gates block passage
        let moatSlowMult = 1.0;
        let blockingFort: BlockoutStructure | undefined;
        const allStructVals = Object.values(worldState.structures);
        for (let si = 0; si < allStructVals.length; si++) {
          const st = allStructVals[si];
          if (st.hp <= 0 || st.isConstructing) continue;
          if (st.kind !== 'stone_wall' && st.kind !== 'gatehouse' && st.kind !== 'moat_trench') {
            continue;
          }
          const dCur = Math.hypot(st.x - unit.x, st.z - unit.z);
          if (dCur > 5.2) continue;

          const hostileToFort = isHostileOwners(unit.ownerId, st.ownerId);
          if (st.kind === 'moat_trench' && hostileToFort && dCur < 2.25) {
            const waterFactor = st.isWaterMoat || st.level >= 2 ? 0.36 : 0.42;
            moatSlowMult = Math.min(moatSlowMult, waterFactor);
            if (worldState.tick % 20 === 0) {
              const spikeDmg = 5 + st.level * 3;
              unit.hp = Math.max(1, unit.hp - spikeDmg);
              pushCombatEvent({
                kind: 'melee',
                fromX: st.x,
                fromZ: st.z,
                toX: unit.x,
                toZ: unit.z,
                attackerOwnerId: st.ownerId,
                targetOwnerId: unit.ownerId,
                damage: spikeDmg,
                color: '#60a5fa',
              });
            }
          } else if (st.kind === 'stone_wall' || st.kind === 'gatehouse') {
            const shouldBlock =
              st.kind === 'stone_wall'
                ? hostileToFort
                : hostileToFort || Boolean(st.isGateLocked);
            if (!shouldBlock) continue;
            const blockR = st.kind === 'gatehouse' ? 2.45 : 2.05;
            const stepPreview = Math.min(dist, unit.speed * speedMult * moatSlowMult * dt);
            const candX = unit.x + (dx / dist) * stepPreview;
            const candZ = unit.z + (dz / dist) * stepPreview;
            const dNext = Math.hypot(st.x - candX, st.z - candZ);
            if (dNext < blockR && dNext < dCur) {
              blockingFort = st;
              break;
            }
          }
        }

        if (blockingFort) {
          // Blocked by enemy wall/gate (or locked gate): hostile units automatically engage to breach it!
          if (isHostileOwners(unit.ownerId, blockingFort.ownerId) && unit.kind !== 'worker') {
            unit.targetStructureId = blockingFort.id;
            unit.state = 'attacking';
            unit.activityAr = `يحاول اختراق ${STRUCTURE_SPECS[blockingFort.kind].labelAr.split(' (')[0]}`;
          }
          unit.targetX = unit.x;
          unit.targetZ = unit.z;
        } else {
          const effectiveSpeed = unit.speed * speedMult * moatSlowMult;
          const step = Math.min(dist, effectiveSpeed * dt);
          unit.x = quantize(
            Math.max(-WORLD_HALF_SIZE + 2, Math.min(WORLD_HALF_SIZE - 2, unit.x + (dx / dist) * step))
          );
          unit.z = quantize(
            Math.max(-WORLD_HALF_SIZE + 2, Math.min(WORLD_HALF_SIZE - 2, unit.z + (dz / dist) * step))
          );
          unit.rotationY = Math.round(Math.atan2(dx, dz) * 100) / 100;
        }
      } else {
        unit.x = unit.targetX;
        unit.z = unit.targetZ;

        if (unit.waypoints && unit.waypoints.length > 0) {
          unit.waypoints.shift();
          if (unit.waypoints.length > 0) {
            unit.targetX = unit.waypoints[0].x;
            unit.targetZ = unit.waypoints[0].z;
            const remStats = calculateMarchRouteStats(
              unit.x,
              unit.z,
              unit.waypoints,
              unit.speed,
              unit.kind,
              worldState.climate
            );
            unit.etaServerMs = Date.now() + remStats.estimatedSeconds * 1000;
          } else {
            unit.waypoints = undefined;
            unit.departedAtMs = undefined;
            unit.totalDistanceM = undefined;
            unit.etaServerMs = undefined;
            unit.marchOrderLabelAr = undefined;
            unit.state = 'idle';
            unit.activityAr = 'وصلت الحملة إلى وجهتها';
          }
        } else if (unit.state === 'moving') {
          unit.state = 'idle';
        }
      }

      // Authoritative Naval Transport Flag (unit switches to war galley on open water)
      unit.isNaval = getTerrainHeight(unit.x, unit.z) < WATER_LEVEL_Y;

      if (unit.state === 'repairing' && unit.assignedStructureId) {
        const repSt = worldState.structures[unit.assignedStructureId];
        if (!repSt || repSt.hp >= repSt.maxHp || repSt.isConstructing) {
          unit.state = 'idle';
          unit.assignedStructureId = undefined;
          unit.activityAr = 'أتمّ ترميم المبنى بنجاح';
        } else if (dist <= 6.2 && worldState.tick % 10 === 0) {
          repSt.hp = Math.min(repSt.maxHp, repSt.hp + 9);
          structuresDirty = true;
          if (worldState.tick % 20 === 0) {
            pushCombatEvent({
              kind: 'repair',
              fromX: unit.x,
              fromZ: unit.z,
              toX: repSt.x,
              toZ: repSt.z,
              attackerOwnerId: unit.ownerId,
            });
          }
        }
      }

      if (unit.state === 'gathering' && unit.assignedResourceId && dist <= 5.2) {
        if (worldState.tick % 20 === 0) {
          const rNode = worldState.resourceNodes[unit.assignedResourceId];
          const owner = worldState.players[unit.ownerId];
          if (rNode && rNode.amount > 0 && owner) {
            const nodeBiome = BIOME_SPECS[getBiomeAt(rNode.x, rNode.z)];
            const biomeBonus =
              nodeBiome.harvestBonusKind === rNode.kind
                ? 1 + nodeBiome.harvestBonusPct / 100
                : 1.0;

            let campBonus = 1.0;
            for (const st of Object.values(worldState.structures)) {
              if (st.ownerId !== unit.ownerId) continue;
              const dCamp = Math.hypot(st.x - rNode.x, st.z - rNode.z);
              if (dCamp <= 26) {
                if (
                  st.kind === 'keep' ||
                  (rNode.kind === 'wood' && st.kind === 'lumber_camp') ||
                  ((rNode.kind === 'stone' || rNode.kind === 'gold') && st.kind === 'quarry') ||
                  (rNode.kind === 'food' &&
                    (st.kind === 'house' || st.kind === 'farm' || st.kind === 'bedouin_tent')) ||
                  (rNode.kind === 'cloth' &&
                    (st.kind === 'livestock_ranch' ||
                      st.kind === 'bedouin_tent' ||
                      st.kind === 'farm')) ||
                  (rNode.kind === 'horses' &&
                    (st.kind === 'horse_stable' ||
                      st.kind === 'bedouin_tent' ||
                      st.kind === 'war_tent' ||
                      st.kind === 'livestock_ranch'))
                ) {
                  const stCulture = normalizeCultureKind(st.culture ?? owner.culture);
                  const campEnvFit = evaluateEnvironmentalFit(
                    stCulture,
                    getBiomeAt(st.x, st.z),
                    getEffectiveClimateAt(st.x, st.z, worldState.climate),
                    st.level
                  );
                  campBonus = Math.max(
                    campBonus,
                    1 + 0.15 * st.level * campEnvFit.campBonusMultiplier
                  );
                }
              }
            }

            const baseYield = unit.kind === 'worker' ? 9 : 4;
            const nodeClimateSpec =
              CLIMATE_SPECS[getEffectiveClimateAt(rNode.x, rNode.z, worldState.climate)] ??
              activeClimate;
            const yieldAmt = Math.round(
              baseYield * biomeBonus * campBonus * nodeClimateSpec.harvestModifier
            );
            const ownerStructs = Object.values(worldState.structures).filter(
              (s) => s.ownerId === owner.id
            );
            const ownerCap = evaluateKingdomCapacity(
              ownerStructs,
              normalizeCultureKind(owner.culture),
              worldState.climate,
              getBiomeAt,
              (sx, sz) => getEffectiveClimateAt(sx, sz, worldState.climate)
            ).storageCap;
            const roomLeft = Math.max(0, ownerCap - owner.resources[rNode.kind]);
            const harvested = Math.min(rNode.amount, yieldAmt, roomLeft);
            if (harvested > 0) {
              rNode.amount -= harvested;
              owner.resources[rNode.kind] += harvested;
              resourcesDirty = true;
              const { sx, sz } = getSectorCoords(rNode.x, rNode.z);
              resourceDeltasCache[rNode.id] = rNode.amount;
              pendingResourceDeltaFlush.set(rNode.id, {
                nodeId: rNode.id,
                sectorX: sx,
                sectorZ: sz,
                remainingAmount: rNode.amount,
              });
            }
          } else {
            const depletedKind = rNode?.kind;
            let nextNodeId: string | undefined;
            let bestDist = 90;
            if (depletedKind) {
              for (const candidate of Object.values(worldState.resourceNodes)) {
                if (candidate.kind === depletedKind && candidate.amount > 0) {
                  const d = Math.hypot(candidate.x - unit.x, candidate.z - unit.z);
                  if (d < bestDist) {
                    bestDist = d;
                    nextNodeId = candidate.id;
                  }
                }
              }
            }
            if (nextNodeId) {
              const nextNode = worldState.resourceNodes[nextNodeId];
              unit.assignedResourceId = nextNode.id;
              unit.targetX = quantize(nextNode.x);
              unit.targetZ = quantize(nextNode.z);
              unit.state = 'gathering';
              unit.activityAr = `يحصد ${nextNode.kind === 'wood' ? 'الأخشاب' : nextNode.kind === 'stone' ? 'الحجارة' : nextNode.kind === 'gold' ? 'الذهب' : nextNode.kind === 'cloth' ? 'القطن والصوف' : nextNode.kind === 'horses' ? 'ويروّض الخيول البرية' : 'الغذاء'}`;
            } else {
              unit.state = 'idle';
              unit.assignedResourceId = undefined;
            }
          }
        }
      }
      if (unit.state === 'building' && unit.assignedStructureId) {
        const targetSt = worldState.structures[unit.assignedStructureId];
        if (!targetSt || !targetSt.isConstructing) {
          unit.state = 'idle';
          unit.assignedStructureId = undefined;
          unit.activityAr = 'أتمّ تشييد المبنى بنجاح';
        }
      }
    }

    // Authoritative Combat Simulation, Tower Volleys & Stance Targeting (runs when clients connected)
    if (clientSockets.size > 0 && worldState.tick % 2 === 0) {
      const unitsArr = Object.values(worldState.units);
      const structsArr = Object.values(worldState.structures);

      const hasFriendlyCommander = (u: BlockoutUnit) => {
        for (let i = 0; i < unitsArr.length; i++) {
          const c = unitsArr[i];
          if (
            c.ownerId === u.ownerId &&
            c.kind === 'commander' &&
            c.hp > 0 &&
            Math.hypot(c.x - u.x, c.z - u.z) <= 24
          ) {
            return true;
          }
        }
        return false;
      };

      const emitUnderAttackAlert = (ownerId: string, x: number, z: number) => {
        const owner = worldState.players[ownerId];
        if (!owner || owner.isAi) return;
        const prevAlert = lastAlertTickByOwner.get(ownerId) ?? -200;
        if (worldState.tick - prevAlert >= 80) {
          lastAlertTickByOwner.set(ownerId, worldState.tick);
          pushCombatEvent({
            kind: 'alert',
            fromX: x,
            fromZ: z,
            toX: x,
            toZ: z,
            targetOwnerId: ownerId,
          });
        }
      };

      // Helper: Bandits siphon real resources from victim player on striking workers or outer buildings
      const stealResourcesFromVictim = (
        banditUnit: BlockoutUnit,
        victimOwnerId: string,
        sx: number,
        sz: number,
        maxSteal: number,
        lootCap: number
      ) => {
        if (!banditUnit.isBanditUnit || maxSteal <= 0) return;
        const victim = worldState.players[victimOwnerId];
        if (!victim || victim.isAi || victim.isBandit) return;
        if (!banditUnit.carriedLoot) {
          banditUnit.carriedLoot = { gold: 0, wood: 0, food: 0 };
        }
        const curTotal = getTotalCarriedLoot(banditUnit.carriedLoot);
        const room = Math.max(0, lootCap - curTotal);
        if (room <= 0) return;

        let rem = Math.min(room, maxSteal);
        const takeGold = Math.min(victim.resources.gold, Math.ceil(rem * 0.5));
        victim.resources.gold -= takeGold;
        banditUnit.carriedLoot.gold += takeGold;
        rem -= takeGold;

        const takeWood = Math.min(victim.resources.wood, Math.ceil(rem * 0.55));
        victim.resources.wood -= takeWood;
        banditUnit.carriedLoot.wood += takeWood;
        rem -= takeWood;

        const takeFood = Math.min(victim.resources.food, rem);
        victim.resources.food -= takeFood;
        banditUnit.carriedLoot.food += takeFood;

        const totalTaken = takeGold + takeWood + takeFood;
        if (totalTaken > 0) {
          resourcesDirty = true;
          const prevAlert = lastAlertTickByOwner.get(`loot_${victimOwnerId}`) ?? -200;
          if (worldState.tick - prevAlert >= 100) {
            lastAlertTickByOwner.set(`loot_${victimOwnerId}`, worldState.tick);
            pushCombatEvent({
              kind: 'loot_stolen',
              fromX: sx,
              fromZ: sz,
              toX: banditUnit.x,
              toZ: banditUnit.z,
              attackerOwnerId: banditUnit.ownerId,
              targetOwnerId: victimOwnerId,
              damage: totalTaken,
              color: '#f59e0b',
              labelAr: `نهب قطاع الطرق ${totalTaken} من مواردك!`,
            });
          }
        }
      };

      const recoverStolenLootOnDeath = (deadBandit: BlockoutUnit, killerOwnerId: string) => {
        if (!deadBandit.isBanditUnit || !deadBandit.carriedLoot) return;
        const total = getTotalCarriedLoot(deadBandit.carriedLoot);
        if (total <= 0) return;
        const killer = worldState.players[killerOwnerId];
        if (!killer || killer.isAi || killer.isBandit) return;
        killer.resources.gold += deadBandit.carriedLoot.gold;
        killer.resources.wood += deadBandit.carriedLoot.wood;
        killer.resources.food += deadBandit.carriedLoot.food;
        deadBandit.carriedLoot = { gold: 0, wood: 0, food: 0 };
        resourcesDirty = true;
        pushCombatEvent({
          kind: 'loot_recovered',
          fromX: deadBandit.x,
          fromZ: deadBandit.z,
          toX: deadBandit.x,
          toZ: deadBandit.z,
          attackerOwnerId: killerOwnerId,
          targetOwnerId: killerOwnerId,
          damage: total,
          color: '#34d399',
          labelAr: `تمت استعادة ${total} موارد مسروقة من قاطع الطريق`,
        });
      };

      // 1. Unit-to-Unit & Unit-to-Structure Combat
      for (let i = 0; i < unitsArr.length; i++) {
        const unit = unitsArr[i];
        if (unit.hp <= 0) continue;

        const spec = getUnitEffectiveCombatStats(unit);
        const stance: UnitStanceKind = unit.stance ?? 'aggressive';

        if (unit.targetUnitId) {
          const t = worldState.units[unit.targetUnitId];
          if (!t || t.hp <= 0 || (t.isBanditUnit && t.isStealthed)) {
            unit.targetUnitId = undefined;
          }
        }
        if (unit.targetStructureId) {
          const st = worldState.structures[unit.targetStructureId];
          if (!st || st.hp <= 0) {
            unit.targetStructureId = undefined;
          }
        }

        // Retreating bandits stay committed to fleeing; stealthed ambushers wait for pack trigger!
        const suppressBanditAutoScan =
          Boolean(unit.isBanditUnit) &&
          (unit.banditState === 'retreating' || unit.banditState === 'ambush_wait');

        // Auto-acquire nearby enemies for combat units or Attack-Move marches
        const canAutoScan =
          !suppressBanditAutoScan &&
          !unit.targetUnitId &&
          !unit.targetStructureId &&
          (Boolean(unit.attackMoveTarget) ||
            (unit.kind !== 'worker' &&
              (unit.state === 'idle' || unit.patrolling || unit.state === 'attacking') &&
              stance !== 'stand'));

        if (canAutoScan && worldState.tick % 4 === 0) {
          const scanR = unit.attackMoveTarget
            ? Math.max(36, spec.rangeMeters + 16)
            : stance === 'aggressive'
              ? Math.max(32, spec.rangeMeters + 14)
              : Math.max(18, spec.rangeMeters + 6);

          let bestEnemyUnit: BlockoutUnit | undefined;
          let bestDist = scanR;
          for (let j = 0; j < unitsArr.length; j++) {
            const cand = unitsArr[j];
            if (!isHostileOwners(unit.ownerId, cand.ownerId) || cand.hp <= 0) continue;
            // Hidden forest bandits cannot be auto-targeted from afar until revealed!
            if (cand.isBanditUnit && cand.isStealthed) continue;
            const d = Math.hypot(cand.x - unit.x, cand.z - unit.z);
            if (d < bestDist) {
              bestDist = d;
              bestEnemyUnit = cand;
            }
          }
          if (bestEnemyUnit) {
            unit.targetUnitId = bestEnemyUnit.id;
            unit.patrolling = false;
            unit.state = 'attacking';
            unit.activityAr = `يشتبك مع ${getUnitEffectiveCombatStats(bestEnemyUnit).shortAr}`;
          } else if (unit.attackMoveTarget) {
            let bestEnemyStruct: BlockoutStructure | undefined;
            let bestSDist = 38;
            for (let j = 0; j < structsArr.length; j++) {
              const st = structsArr[j];
              if (!isHostileOwners(unit.ownerId, st.ownerId) || st.hp <= 0) continue;
              // Bandits avoid blindly charging Keeps unless explicitly raiding an undefended structure
              if (unit.isBanditUnit && st.kind === 'keep' && st.hp > st.maxHp * 0.55) continue;
              const d = Math.hypot(st.x - unit.x, st.z - unit.z);
              if (d < bestSDist) {
                bestSDist = d;
                bestEnemyStruct = st;
              }
            }
            if (bestEnemyStruct) {
              unit.targetStructureId = bestEnemyStruct.id;
              unit.patrolling = false;
              unit.state = 'attacking';
              unit.activityAr = unit.isBanditUnit
                ? `ينهب ${STRUCTURE_SPECS[bestEnemyStruct.kind].labelAr.split(' (')[0]}`
                : `يحاصر ${STRUCTURE_SPECS[bestEnemyStruct.kind].labelAr.split(' (')[0]}`;
            } else {
              const am = unit.attackMoveTarget;
              if (Math.hypot(am.x - unit.x, am.z - unit.z) > 2.8) {
                unit.targetX = am.x;
                unit.targetZ = am.z;
                unit.state = 'attacking';
              } else {
                unit.attackMoveTarget = undefined;
                unit.state = 'idle';
                unit.activityAr = 'وصلت التشكيلة القتالية إلى موقعها';
              }
            }
          }
        }

        const tUnit = unit.targetUnitId ? worldState.units[unit.targetUnitId] : undefined;
        const tStruct =
          !tUnit && unit.targetStructureId ? worldState.structures[unit.targetStructureId] : undefined;

        if (tUnit && tUnit.hp > 0) {
          const d = Math.hypot(tUnit.x - unit.x, tUnit.z - unit.z);
          const effectiveRange = spec.rangeMeters + 0.6;
          if (d > effectiveRange) {
            if (stance !== 'stand') {
              unit.targetX = quantize(tUnit.x);
              unit.targetZ = quantize(tUnit.z);
            }
          } else {
            unit.targetX = unit.x;
            unit.targetZ = unit.z;
            unit.rotationY = Math.round(Math.atan2(tUnit.x - unit.x, tUnit.z - unit.z) * 100) / 100;
            const cdTicks =
              unit.isBanditUnit
                ? 17
                : unit.kind === 'trebuchet'
                  ? 42
                  : unit.kind === 'battering_ram'
                    ? 28
                    : unit.kind === 'knight' || unit.kind === 'commander'
                      ? 18
                      : 20;
            if (worldState.tick - (unit.lastAttackTick ?? -99) >= cdTicks) {
              unit.lastAttackTick = worldState.tick;
              let rawDmg = spec.attack;

              // First-strike ambush bonus from forest stealth (+45%..+50%)
              if (unit.isBanditUnit && (unit.isStealthed || (unit.ambushBonusUntilTick ?? 0) >= worldState.tick)) {
                rawDmg *= spec.ambushMultiplier;
                if (unit.isStealthed) {
                  unit.isStealthed = false;
                  unit.banditState = 'ambush_strike';
                  unit.ambushBonusUntilTick = worldState.tick + 60;
                }
              }

              if (hasFriendlyCommander(unit)) rawDmg *= 1.25;
              if (unit.kind === 'spearman' && (tUnit.kind === 'knight' || tUnit.kind === 'commander')) {
                rawDmg *= 2.8;
              }
              if (
                (unit.kind === 'knight' || unit.kind === 'commander') &&
                (tUnit.kind === 'battering_ram' || tUnit.kind === 'trebuchet')
              ) {
                rawDmg *= 2.2; // Fast cavalry counters exposed siege engines
              }
              if (unit.kind === 'archer' && tUnit.kind === 'infantry' && !tUnit.isBanditUnit) {
                rawDmg *= 0.65; // Shield wall mitigation on armored regular infantry
              }
              if (unit.kind === 'archer' && tUnit.kind === 'battering_ram') {
                rawDmg *= 0.45; // Armored ram roof deflects arrows (-55%)
              }
              // Tactical High-Ground Elevation Combat Bonus
              const elevDelta = getTerrainHeight(unit.x, unit.z) - getTerrainHeight(tUnit.x, tUnit.z);
              if (elevDelta > 1.8) {
                rawDmg *= 1.22;
              } else if (elevDelta > 0.55) {
                rawDmg *= 1.15;
              }

              const defSpec = getUnitEffectiveCombatStats(tUnit);
              const defAura = hasFriendlyCommander(tUnit) ? 1.2 : 1.0;
              const mitigation = 100 / (100 + defSpec.defense * defAura * 1.4);
              const dmg = Math.max(5, Math.round(rawDmg * mitigation));
              tUnit.hp = Math.max(0, tUnit.hp - dmg);

              // Trebuchet fiery boulder splash damage around target impact!
              if (unit.kind === 'trebuchet') {
                const splashDmg = Math.max(8, Math.round(dmg * 0.45));
                for (let k = 0; k < unitsArr.length; k++) {
                  const other = unitsArr[k];
                  if (other.id === tUnit.id || other.hp <= 0) continue;
                  if (!isHostileOwners(unit.ownerId, other.ownerId)) continue;
                  if (Math.hypot(other.x - tUnit.x, other.z - tUnit.z) <= 5.5) {
                    other.hp = Math.max(1, other.hp - splashDmg);
                  }
                }
              }

              // Bandits actively steal resources when raiding isolated workers or gatherers!
              if (unit.isBanditUnit && (tUnit.kind === 'worker' || unit.banditRole === 'looter')) {
                stealResourcesFromVictim(
                  unit,
                  tUnit.ownerId,
                  tUnit.x,
                  tUnit.z,
                  spec.stealPerHit,
                  spec.lootCapacity
                );
              }

              pushCombatEvent({
                kind:
                  unit.kind === 'trebuchet'
                    ? 'siege_boulder'
                    : unit.kind === 'archer'
                      ? 'fire_arrow'
                      : 'melee',
                fromX: unit.x,
                fromZ: unit.z,
                toX: tUnit.x,
                toZ: tUnit.z,
                attackerOwnerId: unit.ownerId,
                targetOwnerId: tUnit.ownerId,
                damage: dmg,
                color: unit.ownerColor,
              });
              emitUnderAttackAlert(tUnit.ownerId, tUnit.x, tUnit.z);

              // Auto-retaliate if defender is idle/patrolling (unless bandit is retreating!)
              if (
                tUnit.hp > 0 &&
                tUnit.kind !== 'worker' &&
                !tUnit.targetUnitId &&
                !(tUnit.isBanditUnit && tUnit.banditState === 'retreating') &&
                (tUnit.stance ?? 'aggressive') !== 'stand'
              ) {
                tUnit.isStealthed = false;
                tUnit.targetUnitId = unit.id;
                tUnit.state = 'attacking';
                tUnit.patrolling = false;
                tUnit.activityAr = `يرد الهجوم على ${spec.shortAr}`;
              }

              if (tUnit.hp <= 0) {
                delete worldState.units[tUnit.id];
                unit.targetUnitId = undefined;
                const attPlayer = worldState.players[unit.ownerId];
                const defPlayer = worldState.players[tUnit.ownerId];
                if (attPlayer) {
                  attPlayer.kills = (attPlayer.kills ?? 0) + 1;
                  const banditBonus = defPlayer?.isBandit ? 8 : 0;
                  attPlayer.resources.gold += 12 + banditBonus;
                  attPlayer.resources.food += 6;
                }
                if (defPlayer) {
                  defPlayer.losses = (defPlayer.losses ?? 0) + 1;
                }
                recoverStolenLootOnDeath(tUnit, unit.ownerId);
                pushCombatEvent({
                  kind: 'destruction',
                  fromX: tUnit.x,
                  fromZ: tUnit.z,
                  toX: tUnit.x,
                  toZ: tUnit.z,
                  targetOwnerId: tUnit.ownerId,
                });
                if (!unit.attackMoveTarget) {
                  unit.state = 'idle';
                  unit.activityAr = 'تأمين محيط الاشتباك';
                }
              }
            }
          }
        } else if (tStruct && tStruct.hp > 0) {
          const stFootW = STRUCTURE_SPECS[tStruct.kind]?.footprint.w ?? 4;
          const d = Math.hypot(tStruct.x - unit.x, tStruct.z - unit.z);
          const effectiveRange = Math.max(spec.rangeMeters, stFootW * 0.65 + 1.8);
          if (d > effectiveRange) {
            if (stance !== 'stand') {
              unit.targetX = quantize(tStruct.x);
              unit.targetZ = quantize(tStruct.z);
            }
          } else {
            unit.targetX = unit.x;
            unit.targetZ = unit.z;
            unit.rotationY = Math.round(Math.atan2(tStruct.x - unit.x, tStruct.z - unit.z) * 100) / 100;
            const siegeCd =
              unit.kind === 'trebuchet' ? 44 : unit.kind === 'battering_ram' ? 28 : 20;
            if (worldState.tick - (unit.lastAttackTick ?? -99) >= siegeCd) {
              unit.lastAttackTick = worldState.tick;
              let siegeDmg = spec.attack * (hasFriendlyCommander(unit) ? 1.25 : 1.0);
              const isHeavyFort =
                tStruct.kind === 'stone_wall' ||
                tStruct.kind === 'gatehouse' ||
                tStruct.kind === 'keep' ||
                tStruct.kind === 'watchtower';
              if (unit.kind === 'battering_ram') {
                siegeDmg *= isHeavyFort ? 3.6 : 2.6;
              } else if (unit.kind === 'trebuchet') {
                const highGroundBonus =
                  getTerrainHeight(unit.x, unit.z) > getTerrainHeight(tStruct.x, tStruct.z) + 1.0
                    ? 1.18
                    : 1.0;
                siegeDmg *= (isHeavyFort ? 3.2 : 2.4) * highGroundBonus;
              } else if (isHeavyFort && unit.kind === 'archer') {
                siegeDmg *= 0.45; // Arrows barely scratch heavy stone walls & gates
              }
              if (tStruct.kind === 'war_tent' || tStruct.kind === 'bedouin_tent') siegeDmg *= 1.25;
              if (unit.kind === 'commander') siegeDmg *= 1.25;
              if (unit.isBanditUnit) {
                unit.isStealthed = false;
                // Bandits plunder resources from outer economic structures!
                if (tStruct.kind !== 'watchtower' && !isHeavyFort) {
                  stealResourcesFromVictim(
                    unit,
                    tStruct.ownerId,
                    tStruct.x,
                    tStruct.z,
                    Math.round(spec.stealPerHit * 1.15),
                    spec.lootCapacity
                  );
                }
              }
              const dmg = Math.max(6, Math.round(siegeDmg));
              tStruct.hp = Math.max(0, tStruct.hp - dmg);
              structuresDirty = true;

              // Trebuchet splash damage against nearby hostile troops defending the wall/gate
              if (unit.kind === 'trebuchet') {
                const splashDmg = Math.max(10, Math.round(spec.attack * 0.65));
                for (let k = 0; k < unitsArr.length; k++) {
                  const other = unitsArr[k];
                  if (other.hp <= 0 || !isHostileOwners(unit.ownerId, other.ownerId)) continue;
                  if (Math.hypot(other.x - tStruct.x, other.z - tStruct.z) <= 5.5) {
                    other.hp = Math.max(1, other.hp - splashDmg);
                  }
                }
              }

              pushCombatEvent({
                kind:
                  unit.kind === 'trebuchet'
                    ? 'siege_boulder'
                    : unit.kind === 'archer'
                      ? 'fire_arrow'
                      : 'siege',
                fromX: unit.x,
                fromZ: unit.z,
                toX: tStruct.x,
                toZ: tStruct.z,
                attackerOwnerId: unit.ownerId,
                targetOwnerId: tStruct.ownerId,
                damage: dmg,
                color: unit.ownerColor,
              });
              emitUnderAttackAlert(tStruct.ownerId, tStruct.x, tStruct.z);

              if (tStruct.hp <= 0) {
                delete worldState.structures[tStruct.id];
                unit.targetStructureId = undefined;
                for (const otherU of unitsArr) {
                  if (otherU.assignedStructureId === tStruct.id) {
                    otherU.assignedStructureId = undefined;
                    otherU.state = 'idle';
                  }
                  if (otherU.targetStructureId === tStruct.id) {
                    otherU.targetStructureId = undefined;
                  }
                }
                const attPlayer = worldState.players[unit.ownerId];
                const razedOwner = worldState.players[tStruct.ownerId];
                if (attPlayer) {
                  attPlayer.structuresRazed = (attPlayer.structuresRazed ?? 0) + 1;
                  const lootMult = razedOwner?.isBandit ? 1.4 : 1.0;
                  attPlayer.resources.gold += Math.round(55 * lootMult);
                  attPlayer.resources.wood += Math.round(40 * lootMult);
                  attPlayer.resources.stone += Math.round(30 * lootMult);
                  attPlayer.resources.food += Math.round(25 * lootMult);
                }
                pushCombatEvent({
                  kind: 'destruction',
                  fromX: tStruct.x,
                  fromZ: tStruct.z,
                  toX: tStruct.x,
                  toZ: tStruct.z,
                  targetOwnerId: tStruct.ownerId,
                });
                if (!unit.attackMoveTarget) {
                  unit.state = 'idle';
                  unit.activityAr = 'تم تدمير حصن الخصم';
                }
              }
            }
          }
        } else if (unit.state === 'attacking' && !unit.attackMoveTarget) {
          unit.state = 'idle';
        }
      }

      // 2. Automated Watchtower, Gatehouse, Lv.2+ Wall & Keep Arrow Volleys (with High-Ground Elevation Advantage!)
      for (let i = 0; i < structsArr.length; i++) {
        const st = structsArr[i];
        if (st.hp <= 0 || st.isConstructing) continue;
        const defSpec = getStructureDefenseSpec(st.kind, st.level);
        if (!defSpec.canAttack) continue;
        if (worldState.tick - (st.lastAttackTick ?? -99) < defSpec.cooldownTicks) continue;

        const stElev = getTerrainHeight(st.x, st.z);
        const rangeMult = stElev >= 4.2 ? 1.24 : stElev >= 2.35 ? 1.14 : 1.0;
        const dmgElevMult = stElev >= 4.2 ? 1.22 : stElev >= 2.35 ? 1.15 : 1.0;

        let targetUnit: BlockoutUnit | undefined;
        let bestD = defSpec.rangeMeters * rangeMult;
        for (let j = 0; j < unitsArr.length; j++) {
          const u = unitsArr[j];
          if (!isHostileOwners(st.ownerId, u.ownerId) || u.hp <= 0) continue;
          if (u.isBanditUnit && u.isStealthed) continue;
          const d = Math.hypot(u.x - st.x, u.z - st.z);
          if (d <= bestD) {
            bestD = d;
            targetUnit = u;
          }
        }
        if (targetUnit) {
          st.lastAttackTick = worldState.tick;
          const uDef = getUnitEffectiveCombatStats(targetUnit).defense;
          const ramShieldMult = targetUnit.kind === 'battering_ram' ? 0.45 : 1.0;
          const dmg = Math.max(
            5,
            Math.round(defSpec.damage * dmgElevMult * ramShieldMult * (100 / (100 + uDef)))
          );
          targetUnit.hp = Math.max(0, targetUnit.hp - dmg);
          pushCombatEvent({
            kind: 'arrow',
            fromX: st.x,
            fromZ: st.z,
            toX: targetUnit.x,
            toZ: targetUnit.z,
            attackerOwnerId: st.ownerId,
            targetOwnerId: targetUnit.ownerId,
            damage: dmg,
            color: st.ownerColor,
          });
          if (targetUnit.hp <= 0) {
            delete worldState.units[targetUnit.id];
            const ownerP = worldState.players[st.ownerId];
            const targP = worldState.players[targetUnit.ownerId];
            if (ownerP) ownerP.kills = (ownerP.kills ?? 0) + 1;
            if (targP) targP.losses = (targP.losses ?? 0) + 1;
            recoverStolenLootOnDeath(targetUnit, st.ownerId);
            pushCombatEvent({
              kind: 'destruction',
              fromX: targetUnit.x,
              fromZ: targetUnit.z,
              toX: targetUnit.x,
              toZ: targetUnit.z,
              targetOwnerId: targetUnit.ownerId,
            });
          }
        }
      }
    }

    // 2B. Bandit Forest Stealth & Ambush Detection Evaluator (every 10 ticks / 0.5s)
    if (clientSockets.size > 0 && worldState.tick % 10 === 0) {
      const allUnits = Object.values(worldState.units);
      const allStructs = Object.values(worldState.structures);
      const humanUnits = allUnits.filter(
        (u) => u.hp > 0 && !worldState.players[u.ownerId]?.isAi && !worldState.players[u.ownerId]?.isBandit
      );
      const humanWatch = allStructs.filter(
        (s) =>
          s.hp > 0 &&
          (s.kind === 'watchtower' || s.kind === 'keep') &&
          !worldState.players[s.ownerId]?.isAi &&
          !worldState.players[s.ownerId]?.isBandit
      );

      for (const bUnit of allUnits) {
        if (!bUnit.isBanditUnit || bUnit.hp <= 0) continue;

        const inForest =
          getForestDensityAt(bUnit.x, bUnit.z) >= 0.34 ||
          getBiomeAt(bUnit.x, bUnit.z) === 'western_forest';
        const isFighting =
          bUnit.state === 'attacking' || Boolean(bUnit.targetUnitId) || Boolean(bUnit.targetStructureId);

        let spottedByUnit: BlockoutUnit | undefined;
        let spottedByTower = false;
        let nearestHumanDist = Infinity;

        for (const hu of humanUnits) {
          const d = Math.hypot(hu.x - bUnit.x, hu.z - bUnit.z);
          if (d < nearestHumanDist) nearestHumanDist = d;
          const detectR = hu.kind === 'archer' || hu.kind === 'commander' ? 24 : 17;
          if (d <= detectR) {
            spottedByUnit = hu;
            break;
          }
        }
        if (!spottedByUnit) {
          for (const tw of humanWatch) {
            const d = Math.hypot(tw.x - bUnit.x, tw.z - bUnit.z);
            if (d <= 28) {
              spottedByTower = true;
              break;
            }
          }
        }

        if (spottedByUnit || spottedByTower || isFighting || bUnit.banditState === 'retreating') {
          const wasAmbushWaiting = bUnit.isStealthed && bUnit.banditState === 'ambush_wait';
          bUnit.isStealthed = false;
          // Spring coordinated forest ambush when a player unit walks into hidden ambushers!
          if (wasAmbushWaiting && spottedByUnit) {
            for (const mate of allUnits) {
              if (
                mate.ownerId === bUnit.ownerId &&
                mate.isBanditUnit &&
                mate.hp > 0 &&
                mate.banditState !== 'retreating' &&
                Math.hypot(mate.x - bUnit.x, mate.z - bUnit.z) <= 42
              ) {
                mate.isStealthed = false;
                mate.banditState = 'ambush_strike';
                mate.ambushBonusUntilTick = worldState.tick + 70;
                mate.targetUnitId = spottedByUnit.id;
                mate.state = 'attacking';
                mate.patrolling = false;
                mate.targetX = spottedByUnit.x;
                mate.targetZ = spottedByUnit.z;
                mate.activityAr = 'انقضاض كمين مفاجئ من الغابة!';
              }
            }
            pushCombatEvent({
              kind: 'ambush',
              fromX: bUnit.x,
              fromZ: bUnit.z,
              toX: spottedByUnit.x,
              toZ: spottedByUnit.z,
              attackerOwnerId: bUnit.ownerId,
              targetOwnerId: spottedByUnit.ownerId,
              color: '#dc2626',
              labelAr: `كمين قطاع الطرق (${worldState.players[bUnit.ownerId]?.name ?? 'عصابة'}) في الغابة!`,
            });
          }
        } else if (
          inForest &&
          (bUnit.banditState === 'ambush_wait' || bUnit.banditState === 'guard_lair') &&
          nearestHumanDist > 26
        ) {
          // Full stealth inside forests when lurking and out of immediate detection range
          bUnit.isStealthed = true;
        } else {
          bUnit.isStealthed = false;
        }
      }
    }

    // 3. Multi-State Bandit Clans Tactical Brain (Ambush, Opportunistic Loot, Chokepoint Guard, Hit-and-Run Retreat)
    if (clientSockets.size > 0 && worldState.tick % 40 === 0) {
      const diff = worldState.pveTheater?.difficulty ?? 'balanced';
      const elapsedSec =
        (Date.now() - (worldState.pveTheater?.startedAtMs ?? Date.now())) / 1000;
      const graceSec = diff === 'casual' ? 65 : diff === 'balanced' ? 35 : 18;
      const raidIntervalTicks = diff === 'casual' ? 980 : diff === 'balanced' ? 680 : 440;
      const maxUnitsCap = diff === 'casual' ? 10 : diff === 'balanced' ? 16 : 22;

      const allStructs = Object.values(worldState.structures);
      const allUnits = Object.values(worldState.units);
      const allRes = Object.values(worldState.resourceNodes);
      const humanUnits = allUnits.filter(
        (u) => u.hp > 0 && !worldState.players[u.ownerId]?.isAi && !worldState.players[u.ownerId]?.isBandit
      );
      const humanStructs = allStructs.filter(
        (s) => s.hp > 0 && !worldState.players[s.ownerId]?.isAi && !worldState.players[s.ownerId]?.isBandit
      );
      const humanKeeps = humanStructs.filter((s) => s.kind === 'keep');
      const humanTowers = humanStructs.filter((s) => s.kind === 'watchtower');

      const getUnitCombatPower = (u: BlockoutUnit) => {
        if (u.kind === 'worker') return 0.25;
        if (u.isBanditUnit) return u.banditRole === 'raider_horse' ? 1.1 : 0.72;
        if (u.kind === 'commander') return 2.6;
        if (u.kind === 'knight') return 1.65;
        return 1.15;
      };

      for (const bandit of Object.values(worldState.players)) {
        if ((!bandit.isAi && !bandit.isBandit) || bandit.isDefeated) continue;
        const campStructs = allStructs.filter((s) => s.ownerId === bandit.id);
        const lairKeep = campStructs.find((s) => s.kind === 'keep') ?? campStructs[0];
        if (!lairKeep) continue;

        const campUnits = allUnits.filter((u) => u.ownerId === bandit.id);
        const campHaulers = campUnits.filter((u) => u.kind === 'worker');
        const campRaiders = campUnits.filter((u) => u.kind !== 'worker');

        // 1) Organized Governed Cities (Sindhi State Provinces, Coastal Crusaders & Local Emirates)
        // Strict regional garrison & defensive patrol AI — throttle distant cities when no human is nearby
        if (!bandit.isBandit) {
          const hasHumanNearCity =
            humanUnits.some((hu) => Math.hypot(hu.x - lairKeep.x, hu.z - lairKeep.z) < 420) ||
            humanStructs.some((hs) => Math.hypot(hs.x - lairKeep.x, hs.z - lairKeep.z) < 420);
          if (!hasHumanNearCity && (worldState.tick + bandit.id.length * 17) % 160 !== 0) {
            continue;
          }
          const garrisonCap = diff === 'casual' ? 7 : diff === 'aggressive' ? 12 : 9;
          const patrolRadius = bandit.aiFactionKind === 'crusaders' ? 88 : 112;

          for (const w of campHaulers) {
            if (w.state !== 'idle' && !w.patrolling) continue;
            const damaged = campStructs.find((s) => !s.isConstructing && s.hp < s.maxHp * 0.9);
            if (damaged) {
              w.state = 'repairing';
              w.assignedStructureId = damaged.id;
              w.targetX = quantize(damaged.x + 2.5);
              w.targetZ = quantize(damaged.z + 2.5);
              w.patrolling = false;
              w.activityAr = `يرمم تحصينات ${bandit.cityNameAr ?? bandit.name}`;
            }
          }

          // Train regular garrison replacements when below cap
          if (campUnits.length < garrisonCap) {
            const barracks = campStructs.find((s) => !s.isConstructing && s.kind === 'barracks') ?? lairKeep;
            const pool: UnitKind[] =
              campHaulers.length < 1
                ? ['worker']
                : ['infantry', 'spearman', 'archer', 'knight'];
            const pick = pool[Math.floor(Math.random() * pool.length)];
            const uSpec = UNIT_SPECS[pick];
            if (canAfford(bandit.resources, uSpec.cost)) {
              deductResources(bandit.resources, uSpec.cost);
              const ang = Math.random() * Math.PI * 2;
              const ux = quantize(barracks.x + Math.cos(ang) * 5.5);
              const uz = quantize(barracks.z + Math.sin(ang) * 5.5);
              const uid = nextEntityId('unt');
              worldState.units[uid] = {
                id: uid,
                ownerId: bandit.id,
                ownerColor: bandit.color,
                secondaryColor: bandit.secondaryColor,
                bannerPattern: bandit.bannerPattern,
                kind: pick,
                x: ux,
                z: uz,
                targetX: ux,
                targetZ: uz,
                rotationY: ang,
                speed: uSpec.speed,
                state: 'idle',
                stance: 'defensive',
                activityAr:
                  bandit.aiFactionKind === 'crusaders'
                    ? 'حامية ساحل القدس الدفاعية'
                    : `حامية ${bandit.name}`,
                patrolling: false,
                hp: uSpec.maxHp,
                maxHp: uSpec.maxHp,
                isBanditUnit: false,
              };
            }
          }

          // Intercept hostile intruders approaching within patrol perimeter; otherwise patrol around city
          let intruder: BlockoutUnit | undefined;
          for (const u of allUnits) {
            if (u.hp <= 0 || !isHostileOwners(bandit.id, u.ownerId)) continue;
            if (Math.hypot(u.x - lairKeep.x, u.z - lairKeep.z) <= patrolRadius + 28) {
              intruder = u;
              break;
            }
          }

          for (const soldier of campRaiders) {
            const distHome = Math.hypot(soldier.x - lairKeep.x, soldier.z - lairKeep.z);
            if (distHome > patrolRadius + 45) {
              soldier.targetUnitId = undefined;
              soldier.targetStructureId = undefined;
              soldier.targetX = quantize(lairKeep.x + (Math.random() - 0.5) * 18);
              soldier.targetZ = quantize(lairKeep.z + (Math.random() - 0.5) * 18);
              soldier.state = 'moving';
              soldier.activityAr = `يعود لتأمين ${bandit.name}`;
              continue;
            }
            if (intruder && !soldier.targetUnitId) {
              soldier.targetUnitId = intruder.id;
              soldier.targetX = intruder.x;
              soldier.targetZ = intruder.z;
              soldier.state = 'attacking';
              soldier.activityAr = `يتصدى للمعتدين على ${bandit.name}`;
            } else if (soldier.state === 'idle' && Math.random() < 0.28) {
              const ang = Math.random() * Math.PI * 2;
              const rad = 16 + Math.random() * (patrolRadius * 0.45);
              soldier.targetX = quantize(lairKeep.x + Math.cos(ang) * rad);
              soldier.targetZ = quantize(lairKeep.z + Math.sin(ang) * rad);
              soldier.state = 'moving';
              soldier.activityAr =
                bandit.aiFactionKind === 'crusaders'
                  ? 'دورية حراسة ساحل القدس'
                  : `دورية حماية ${bandit.name}`;
            }
          }
          continue;
        }

        const archetype: BanditCampArchetype = bandit.banditCampArchetype ?? 'forest_ambush';

        // A. Bandit Looters/Haulers repair lair or haul nearby caches when not raiding
        for (const w of campHaulers) {
          if (w.banditState === 'retreating' || w.banditState === 'raiding') continue;
          if (w.state !== 'idle' && !w.patrolling) continue;
          const damaged = campStructs.find((s) => !s.isConstructing && s.hp < s.maxHp * 0.85);
          if (damaged) {
            w.state = 'repairing';
            w.assignedStructureId = damaged.id;
            w.targetX = quantize(damaged.x + 2.5);
            w.targetZ = quantize(damaged.z + 2.5);
            w.patrolling = false;
            w.activityAr = 'يرمم تحصينات وكر العصابة';
            continue;
          }
          let nearestNode: ResourceNode | undefined;
          let bestD = 150;
          for (const rn of allRes) {
            if (rn.amount <= 0) continue;
            const d = Math.hypot(rn.x - lairKeep.x, rn.z - lairKeep.z);
            if (d < bestD) {
              bestD = d;
              nearestNode = rn;
            }
          }
          if (nearestNode) {
            w.assignedResourceId = nearestNode.id;
            w.targetX = quantize(nearestNode.x);
            w.targetZ = quantize(nearestNode.z);
            w.state = 'gathering';
            w.patrolling = false;
            w.activityAr = 'ينهب الأخشاب والغنائم إلى الوكر';
          }
        }

        // B. Reinforce Bandit Hideout defenses (war tents, barracks, watchtowers — no civil houses)
        const lastBuild = lastAiBuildTick.get(bandit.id) ?? 0;
        if (worldState.tick - lastBuild >= 200) {
          lastAiBuildTick.set(bandit.id, worldState.tick);
          const cap = evaluateKingdomCapacity(
            campStructs,
            normalizeCultureKind(bandit.culture ?? 'bedouin_nomadic'),
            worldState.climate,
            getBiomeAt,
            (sx, sz) => getEffectiveClimateAt(sx, sz, worldState.climate)
          );
          const warTentCount = campStructs.filter(
            (s) => s.kind === 'war_tent' || s.kind === 'bedouin_tent'
          ).length;
          const barracksCount = campStructs.filter((s) => s.kind === 'barracks').length;
          const towerCount = campStructs.filter((s) => s.kind === 'watchtower').length;

          let wantKind: StructureKind | null = null;
          if (barracksCount === 0) wantKind = 'barracks';
          else if (campUnits.length >= cap.maxPopulation - 2 && warTentCount < 4) wantKind = 'war_tent';
          else if (diff !== 'casual' && towerCount < 2) wantKind = 'watchtower';

          if (wantKind && canAfford(bandit.resources, STRUCTURE_SPECS[wantKind].cost)) {
            const spot = findValidPlacementNear(
              lairKeep.x,
              lairKeep.z,
              (Math.random() - 0.5) * 24,
              (Math.random() - 0.5) * 24,
              4.6
            );
            if (spot) {
              deductResources(bandit.resources, STRUCTURE_SPECS[wantKind].cost);
              const sid = nextEntityId('str');
              const sSpec = STRUCTURE_SPECS[wantKind];
              worldState.structures[sid] = {
                id: sid,
                ownerId: bandit.id,
                ownerColor: bandit.color,
                secondaryColor: bandit.secondaryColor,
                bannerPattern: bandit.bannerPattern,
                kind: wantKind,
                culture: normalizeCultureKind(bandit.culture ?? 'bedouin_nomadic'),
                level: 1,
                x: spot.x,
                z: spot.z,
                rotationY: 0,
                hp: Math.round(sSpec.maxHp * 0.2),
                maxHp: sSpec.maxHp,
                isConstructing: true,
                constructionProgress: 0,
                buildTimeSeconds: sSpec.buildTimeSeconds,
                createdAtTick: worldState.tick,
              };
              structuresDirty = true;
            }
          }
        }

        // C. Recruit nimble Bandit Pack members using custom BANDIT_UNIT_SPECS!
        if (campUnits.length < maxUnitsCap) {
          const cap = evaluateKingdomCapacity(
            campStructs,
            normalizeCultureKind(bandit.culture ?? 'bedouin_nomadic'),
            worldState.climate,
            getBiomeAt,
            (sx, sz) => getEffectiveClimateAt(sx, sz, worldState.climate)
          );
          if (campUnits.length < cap.maxPopulation) {
            const hasBarracks = campStructs.some((s) => !s.isConstructing && s.kind === 'barracks');
            const pool: UnitKind[] =
              campHaulers.length < 1
                ? ['worker']
                : archetype === 'forest_ambush'
                  ? ['archer', 'infantry', 'archer', 'spearman']
                  : archetype === 'highway_raiders'
                    ? hasBarracks
                      ? ['knight', 'infantry', 'archer', 'knight']
                      : ['infantry', 'archer', 'spearman']
                    : hasBarracks
                      ? ['infantry', 'spearman', 'archer', 'knight']
                      : ['infantry', 'spearman', 'archer'];
            const pick = pool[Math.floor(Math.random() * pool.length)];
            // Bandits recruit cheaply with irregular ragtag gear
            const recruitCost: Partial<PlayerResources> = {
              food: Math.round((UNIT_SPECS[pick].cost.food ?? 40) * 0.7),
              gold: Math.round((UNIT_SPECS[pick].cost.gold ?? 20) * 0.65),
            };
            if (canAfford(bandit.resources, recruitCost)) {
              const camp =
                campStructs.find((s) => !s.isConstructing && (s.kind === 'barracks' || s.kind === 'war_tent')) ??
                lairKeep;
              deductResources(bandit.resources, recruitCost);
              const ang = Math.random() * Math.PI * 2;
              createBanditUnit(
                bandit,
                pick,
                camp.x + Math.cos(ang) * 4.5,
                camp.z + Math.sin(ang) * 4.5,
                'guard_lair'
              );
            }
          }
        }

        // D. Process Returning / Retreating Bandits (Deposit Stolen Loot & Regroup at Lair)
        for (const b of campUnits) {
          if (b.banditState === 'retreating') {
            const dHome = Math.hypot(b.x - lairKeep.x, b.z - lairKeep.z);
            if (dHome <= 22) {
              if (b.carriedLoot) {
                bandit.resources.gold += b.carriedLoot.gold;
                bandit.resources.wood += b.carriedLoot.wood;
                bandit.resources.food += b.carriedLoot.food;
                b.carriedLoot = { gold: 0, wood: 0, food: 0 };
              }
              b.hp = Math.min(b.maxHp, b.hp + 15);
              b.banditState = 'guard_lair';
              b.state = 'idle';
              b.activityAr = 'أودع المسروقات ويعيد التجميع في الوكر';
            } else {
              b.targetUnitId = undefined;
              b.targetStructureId = undefined;
              b.attackMoveTarget = undefined;
              b.targetX = quantize(lairKeep.x + (Math.random() - 0.5) * 8);
              b.targetZ = quantize(lairKeep.z + (Math.random() - 0.5) * 8);
              b.state = 'moving';
              b.activityAr =
                getTotalCarriedLoot(b.carriedLoot) > 0
                  ? 'يهرب بالمسروقات نحو وكر العصابة'
                  : 'ينسحب تكتيكياً إلى الغابة والوكر';
            }
          } else if (b.banditState === 'guard_lair' && b.hp < b.maxHp) {
            if (Math.hypot(b.x - lairKeep.x, b.z - lairKeep.z) <= 28) {
              b.hp = Math.min(b.maxHp, b.hp + 8);
            }
          }
        }

        // E. Hit-and-Run & Outnumbered Retreat Evaluation for Active Raiders/Ambushers
        for (const r of campUnits) {
          if (r.banditState !== 'raiding' && r.banditState !== 'ambush_strike') continue;
          const bSpec = getUnitEffectiveCombatStats(r);
          const carried = getTotalCarriedLoot(r.carriedLoot);
          const nearLair = Math.hypot(r.x - lairKeep.x, r.z - lairKeep.z) <= 52;

          let hostilePower = 0;
          for (const hu of humanUnits) {
            if (Math.hypot(hu.x - r.x, hu.z - r.z) <= 40) {
              hostilePower += getUnitCombatPower(hu);
            }
          }
          let friendlyBanditPower = 0;
          for (const mate of campUnits) {
            if (mate.hp > 0 && Math.hypot(mate.x - r.x, mate.z - r.z) <= 40) {
              friendlyBanditPower += getUnitCombatPower(mate);
            }
          }
          const nearFortifiedBase =
            humanKeeps.some((k) => Math.hypot(k.x - r.x, k.z - r.z) <= 34) ||
            humanTowers.some((t) => Math.hypot(t.x - r.x, t.z - r.z) <= 30);

          const pocketsFull = bSpec.lootCapacity > 0 && carried >= Math.round(bSpec.lootCapacity * 0.68);
          const wounded = r.hp < r.maxHp * 0.42;
          const outmatched = !nearLair && hostilePower > Math.max(1.2, friendlyBanditPower * 1.35);
          const fortDanger = !nearLair && nearFortifiedBase && hostilePower >= 1.0;

          if (pocketsFull || (!nearLair && wounded) || outmatched || fortDanger) {
            r.banditState = 'retreating';
            r.isStealthed = false;
            r.targetUnitId = undefined;
            r.targetStructureId = undefined;
            r.attackMoveTarget = undefined;
            r.patrolling = false;
            r.state = 'moving';
            r.targetX = quantize(lairKeep.x);
            r.targetZ = quantize(lairKeep.z);
            r.activityAr = pocketsFull
              ? 'امتلأت حقيبة المسروقات — فرار سريع للوكر'
              : 'ينسحب أمام تفوّق جيش المملكة';
          }
        }

        // F. Defend Hideout Only When Enemies Directly Threaten the Lair Perimeter
        let lairIntruder: BlockoutUnit | undefined;
        for (const hu of humanUnits) {
          if (Math.hypot(hu.x - lairKeep.x, hu.z - lairKeep.z) <= 68) {
            lairIntruder = hu;
            break;
          }
        }
        if (lairIntruder) {
          for (const g of campRaiders) {
            if (
              g.banditState !== 'retreating' &&
              Math.hypot(g.x - lairKeep.x, g.z - lairKeep.z) <= 130 &&
              !g.targetUnitId
            ) {
              g.isStealthed = false;
              g.banditState = 'guard_lair';
              g.targetUnitId = lairIntruder.id;
              g.state = 'attacking';
              g.targetX = lairIntruder.x;
              g.targetZ = lairIntruder.z;
              g.activityAr = 'يدافع عن وكر قطاع الطرق';
            }
          }
          continue;
        }

        // Nearest human keep (used ONLY to orient forest/road ambush corridors, NOT to suicide-charge it!)
        const nearestHumanKeep = humanKeeps
          .slice()
          .sort(
            (a, b) =>
              Math.hypot(a.x - lairKeep.x, a.z - lairKeep.z) -
              Math.hypot(b.x - lairKeep.x, b.z - lairKeep.z)
          )[0];

        // G. Deploy Idle Raiders into Hidden Forest/Road/Bridge Ambush Packs (`ambush_wait`)
        const guardingRaiders = campRaiders.filter(
          (g) =>
            g.banditState === 'guard_lair' &&
            !g.targetUnitId &&
            !g.targetStructureId &&
            g.hp >= g.maxHp * 0.75
        );
        const alreadyAmbushing = campRaiders.filter((g) => g.banditState === 'ambush_wait');

        if (nearestHumanKeep && guardingRaiders.length >= 4 && alreadyAmbushing.length < 4) {
          const ambushSpot = findBanditAmbushSpot(
            lairKeep.x,
            lairKeep.z,
            nearestHumanKeep.x,
            nearestHumanKeep.z,
            archetype,
            humanKeeps,
            humanTowers
          );
          // Leave 2 guards at the hideout; send the rest to lurk in the forest ambush zone
          const ambushPack = guardingRaiders.slice(0, Math.min(5, guardingRaiders.length - 1));
          ambushPack.forEach((b, bIdx) => {
            const ang = (bIdx / Math.max(1, ambushPack.length)) * Math.PI * 2;
            const ax = quantize(ambushSpot.x + Math.cos(ang) * 7);
            const az = quantize(ambushSpot.z + Math.sin(ang) * 7);
            b.banditState = 'ambush_wait';
            b.ambushAnchor = { x: ax, z: az };
            b.targetX = ax;
            b.targetZ = az;
            b.state = 'moving';
            b.patrolling = false;
            b.activityAr = 'يتمركز في الغابة لنصب كمين';
          });
        }

        // H. Opportunistic Ambush & Soft-Target Plunder Check (Workers, Isolated Squads, Outer Farms)
        const waitingPack = campRaiders.filter(
          (g) => g.banditState === 'ambush_wait' && Math.hypot(g.x - g.targetX, g.z - g.targetZ) <= 5
        );

        if (waitingPack.length >= 2 && elapsedSec >= graceSec) {
          const packCenterX =
            waitingPack.reduce((sum, u) => sum + u.x, 0) / waitingPack.length;
          const packCenterZ =
            waitingPack.reduce((sum, u) => sum + u.z, 0) / waitingPack.length;
          const packPower = waitingPack.reduce((sum, u) => sum + getUnitCombatPower(u), 0);

          // 1) Look for isolated workers or small squads passing within 68m of the ambush zone
          let juicyTargetUnit: BlockoutUnit | undefined;
          let bestUnitScore = -1e9;
          for (const hu of humanUnits) {
            const d = Math.hypot(hu.x - packCenterX, hu.z - packCenterZ);
            if (d > 68) continue;
            // Never dive into a Keep/Watchtower kill-zone
            const underFort =
              humanKeeps.some((k) => Math.hypot(k.x - hu.x, k.z - hu.z) <= 36) ||
              humanTowers.some((t) => Math.hypot(t.x - hu.x, t.z - hu.z) <= 32);
            if (underFort) continue;
            let guardPower = 0;
            for (const other of humanUnits) {
              if (Math.hypot(other.x - hu.x, other.z - hu.z) <= 34) {
                guardPower += getUnitCombatPower(other);
              }
            }
            if (guardPower > packPower * 1.1) continue;
            const score = (hu.kind === 'worker' ? 140 : 65) - d - guardPower * 25;
            if (score > bestUnitScore) {
              bestUnitScore = score;
              juicyTargetUnit = hu;
            }
          }

          if (juicyTargetUnit) {
            waitingPack.forEach((b) => {
              b.isStealthed = false;
              b.banditState = 'ambush_strike';
              b.ambushBonusUntilTick = worldState.tick + 70;
              b.targetUnitId = juicyTargetUnit!.id;
              b.state = 'attacking';
              b.targetX = juicyTargetUnit!.x;
              b.targetZ = juicyTargetUnit!.z;
              b.activityAr = 'كمين مفاجئ لنهب المعزولين!';
            });
            pushCombatEvent({
              kind: 'ambush',
              fromX: packCenterX,
              fromZ: packCenterZ,
              toX: juicyTargetUnit.x,
              toZ: juicyTargetUnit.z,
              attackerOwnerId: bandit.id,
              targetOwnerId: juicyTargetUnit.ownerId,
              color: '#dc2626',
              labelAr: `كمين ${bandit.name} على وحداتك!`,
            });
          } else {
            // 2) Periodic opportunistic hit-and-run raid on undefended outer farms/houses/workers (never fortified Keeps!)
            const lastRaid = lastAiRaidTick.get(bandit.id) ?? 0;
            if (worldState.tick - lastRaid >= raidIntervalTicks && waitingPack.length >= 3) {
              const softWorker = humanUnits
                .filter((hu) => {
                  if (hu.kind !== 'worker') return false;
                  const distFromLair = Math.hypot(hu.x - lairKeep.x, hu.z - lairKeep.z);
                  if (distFromLair > 450) return false;
                  const nearKeep = humanKeeps.some((k) => Math.hypot(k.x - hu.x, k.z - hu.z) <= 32);
                  const guards = humanUnits.filter(
                    (g) => g.kind !== 'worker' && Math.hypot(g.x - hu.x, g.z - hu.z) <= 35
                  ).length;
                  return !nearKeep && guards <= 2;
                })
                .sort(
                  (a, b) =>
                    Math.hypot(a.x - packCenterX, a.z - packCenterZ) -
                    Math.hypot(b.x - packCenterX, b.z - packCenterZ)
                )[0];

              const softOuterStruct = !softWorker
                ? humanStructs
                    .filter((st) => {
                      if (st.kind === 'keep' || st.kind === 'watchtower') return false;
                      if (Math.hypot(st.x - lairKeep.x, st.z - lairKeep.z) > 450) return false;
                      const nearFort =
                        humanKeeps.some((k) => Math.hypot(k.x - st.x, k.z - st.z) <= 36) ||
                        humanTowers.some((t) => Math.hypot(t.x - st.x, t.z - st.z) <= 32);
                      return !nearFort;
                    })
                    .sort(
                      (a, b) =>
                        Math.hypot(a.x - packCenterX, a.z - packCenterZ) -
                        Math.hypot(b.x - packCenterX, b.z - packCenterZ)
                    )[0]
                : undefined;

              if (softWorker || softOuterStruct) {
                lastAiRaidTick.set(bandit.id, worldState.tick);
                const tx = softWorker ? softWorker.x : softOuterStruct!.x;
                const tz = softWorker ? softWorker.z : softOuterStruct!.z;
                waitingPack.forEach((b, idx) => {
                  b.isStealthed = false;
                  b.banditState = 'raiding';
                  if (softWorker) b.targetUnitId = softWorker.id;
                  else if (softOuterStruct) b.targetStructureId = softOuterStruct.id;
                  b.state = 'attacking';
                  const ang = (idx / Math.max(1, waitingPack.length)) * Math.PI * 2;
                  b.targetX = quantize(tx + Math.cos(ang) * 3);
                  b.targetZ = quantize(tz + Math.sin(ang) * 3);
                  b.activityAr = 'غارة نهب خاطفة (كرّ وفرّ)';
                });
              }
            }
          }
        }
      }
    }

    // 4. Persistent Co-op PvE Bandit Hideout Clearance & Auto-Respawn Director (every 20 ticks / 1s)
    if (clientSockets.size > 0 && worldState.tick % 20 === 0) {
      const keepOwners = new Set(
        Object.values(worldState.structures)
          .filter((s) => s.kind === 'keep' && s.hp > 0)
          .map((s) => s.ownerId)
      );
      const nowMs = Date.now();
      let clearedAnyBandit = false;

      for (const p of Object.values(worldState.players)) {
        if (!p.isAi && !p.isBandit) {
          p.isDefeated = !keepOwners.has(p.id);
          if (!p.isDefeated) p.defeatedAtMs = undefined;
          continue;
        }

        if (!p.isDefeated && !keepOwners.has(p.id)) {
          p.isDefeated = true;
          p.defeatedAtMs = nowMs;
          clearedAnyBandit = true;
          if (worldState.pveTheater) {
            worldState.pveTheater.strongholdsCleared += 1;
          }
          const isMajorStronghold = !p.isBandit;
          for (const hp of Object.values(worldState.players)) {
            if (!hp.isAi && !hp.isBandit) {
              hp.resources.gold += isMajorStronghold ? 420 : 140;
              hp.resources.wood += isMajorStronghold ? 280 : 110;
              hp.resources.stone += isMajorStronghold ? 240 : 80;
              hp.resources.food += isMajorStronghold ? 180 : 60;
            }
          }
          resourcesDirty = true;
          broadcastWorldSnapshot(
            isMajorStronghold
              ? `سقط معقل ${p.factionName}! غنم الحلفاء خزائن الولاية ومواردها الاستراتيجية`
              : `تم تطهير وكر ${p.name}! غنمت الممالك المسروقات وستتجمع عصابة قطاع طرق جديدة في الأحراش خلال 45 ثانية`
          );
        }
      }

      if (!clearedAnyBandit) {
        const humans = Object.values(worldState.players).filter((p) => !p.isAi && !p.isBandit);
        const anchorHuman = humans[0];
        const anchorKeep = anchorHuman
          ? Object.values(worldState.structures).find(
              (s) => s.ownerId === anchorHuman.id && s.kind === 'keep'
            )
          : undefined;
        const anchorX = anchorKeep?.x ?? anchorHuman?.camera.targetX ?? SPAWN_PLATEAUS[4].x;
        const anchorZ = anchorKeep?.z ?? anchorHuman?.camera.targetZ ?? SPAWN_PLATEAUS[4].z;
        const targetCount = worldState.pveTheater?.strongholdCount ?? 3;
        const diff = worldState.pveTheater?.difficulty ?? 'balanced';

        let respawned = false;
        for (let i = 0; i < targetCount; i++) {
          const banditId = `ai_rival_${i + 1}`;
          const bandit = worldState.players[banditId];
          if (bandit && bandit.isDefeated && bandit.defeatedAtMs && nowMs - bandit.defeatedAtMs >= 45_000) {
            clearSingleAiPlayer(banditId);
            spawnSingleBanditCamp(i, diff, anchorX, anchorZ);
            respawned = true;
          }
        }
        if (respawned) {
          if (worldState.pveTheater) {
            worldState.pveTheater.lastRespawnAtMs = nowMs;
          }
          structuresDirty = true;
          broadcastWorldSnapshot('تجمعت عصابة جديدة لقطاع الطرق في الغابات والطرق التجارية');
        }
      }
    }

    // Progress active building construction sites (driven by nearby / assigned workers & buildTimeSeconds)
    for (const st of Object.values(worldState.structures)) {
      if (!st.isConstructing) continue;

      let activeBuilders = 0;
      for (const u of Object.values(worldState.units)) {
        if (u.ownerId === st.ownerId && u.kind === 'worker') {
          const d = Math.hypot(u.x - st.x, u.z - st.z);
          if (d <= 5.8 || (u.assignedStructureId === st.id && d <= 7.5)) {
            activeBuilders += 1;
            if (u.state !== 'building') {
              u.state = 'building';
              u.assignedStructureId = st.id;
              u.activityAr = `يشيّد ${STRUCTURE_SPECS[st.kind]?.labelAr ?? 'المبنى'}`;
            }
          }
        }
      }

      st.activeBuildersCount = activeBuilders;
      const totalBuildSec = Math.max(6, st.buildTimeSeconds ?? STRUCTURE_SPECS[st.kind]?.buildTimeSeconds ?? 14);
      const workerSpeedMult = activeBuilders > 0 ? 1 + (activeBuilders - 1) * 0.65 : 0.25;
      const progressStep = (100 / totalBuildSec) * workerSpeedMult * dt;
      const nextProgress = Math.min(100, (st.constructionProgress ?? 0) + progressStep);
      st.constructionProgress = Math.round(nextProgress * 10) / 10;

      const minHp = Math.max(45, Math.round(st.maxHp * 0.16));
      st.hp = Math.min(
        st.maxHp,
        Math.round(minHp + (st.maxHp - minHp) * (st.constructionProgress / 100))
      );

      if (st.constructionProgress >= 100) {
        st.isConstructing = false;
        st.constructionProgress = 100;
        st.hp = st.maxHp;
        st.activeBuildersCount = 0;
        structuresDirty = true;

        for (const u of Object.values(worldState.units)) {
          if (u.assignedStructureId === st.id) {
            u.assignedStructureId = undefined;
            u.state = 'idle';
            u.activityAr = `أتمّ تشييد ${STRUCTURE_SPECS[st.kind]?.labelAr ?? 'المبنى'}`;
          }
        }

        const nextConstructing = Object.values(worldState.structures).find(
          (other) => other.ownerId === st.ownerId && other.isConstructing
        );
        if (nextConstructing) {
          const nearbyIdleWorkers = Object.values(worldState.units)
            .filter(
              (u) =>
                u.ownerId === st.ownerId &&
                u.kind === 'worker' &&
                u.state === 'idle' &&
                Math.hypot(u.x - st.x, u.z - st.z) <= 10
            )
            .slice(0, 2);
          nearbyIdleWorkers.forEach((w, idx) => {
            const angle = idx * Math.PI + 0.5;
            w.targetX = quantize(nextConstructing.x + Math.cos(angle) * 2.8);
            w.targetZ = quantize(nextConstructing.z + Math.sin(angle) * 2.8);
            w.assignedStructureId = nextConstructing.id;
            w.state = 'building';
            w.patrolling = false;
            w.activityAr = `يتجه لتشييد ${STRUCTURE_SPECS[nextConstructing.kind]?.labelAr ?? 'المبنى التالي'}`;
          });
        }
      } else if (worldState.tick % 4 === 0) {
        structuresDirty = true;
      }
    }

    // Autonomous Citizen & Garrison Daily Routines every 3.5 seconds (70 ticks) for idle human units
    if (worldState.tick % 70 === 0) {
      const allStructures = Object.values(worldState.structures);
      for (const unit of Object.values(worldState.units)) {
        if (unit.isBanditUnit || unit.state !== 'idle' || unit.stance === 'stand') continue;
        const myStructs = allStructures.filter((s) => s.ownerId === unit.ownerId);
        if (myStructs.length === 0) continue;

        if (unit.kind === 'worker') {
          const civicTargets = myStructs.filter(
            (s) =>
              s.kind === 'farm' ||
              s.kind === 'livestock_ranch' ||
              s.kind === 'horse_stable' ||
              s.kind === 'bedouin_tent' ||
              s.kind === 'house' ||
              s.kind === 'market' ||
              s.kind === 'keep'
          );
          const pool = civicTargets.length > 0 ? civicTargets : myStructs;
          const targetSt = pool[Math.floor(Math.random() * pool.length)];
          const angle = Math.random() * Math.PI * 2;
          const radius =
            targetSt.kind === 'farm' ||
            targetSt.kind === 'livestock_ranch' ||
            targetSt.kind === 'horse_stable'
              ? 2.2
              : 3.2;
          unit.targetX = quantize(targetSt.x + Math.cos(angle) * radius);
          unit.targetZ = quantize(targetSt.z + Math.sin(angle) * radius);
          unit.state = 'moving';
          unit.patrolling = true;
          unit.activityAr =
            targetSt.kind === 'horse_stable'
              ? 'يروّض الخيول الأصيلة ويجهز السروج'
              : targetSt.kind === 'livestock_ranch'
                ? 'يرعى المواشي ويغزل القطن والصوف'
                : targetSt.kind === 'bedouin_tent'
                  ? 'يتفقد مضارب الخيام البدوية'
                  : targetSt.kind === 'farm'
                    ? 'يرعى المحاصيل في المزرعة'
                    : targetSt.kind === 'market'
                      ? 'ينقل الغلال والأقمشة إلى السوق'
                      : targetSt.kind === 'house'
                        ? 'يتفقد أحياء السكان'
                        : 'ينقل المؤن إلى القلعة';
        } else {
          const patrolTargets = myStructs.filter(
            (s) =>
              s.kind === 'watchtower' ||
              s.kind === 'war_tent' ||
              s.kind === 'horse_stable' ||
              s.kind === 'bedouin_tent' ||
              s.kind === 'house' ||
              s.kind === 'market' ||
              s.kind === 'barracks' ||
              s.kind === 'keep'
          );
          const pool = patrolTargets.length > 0 ? patrolTargets : myStructs;
          const targetSt = pool[Math.floor(Math.random() * pool.length)];
          const angle = Math.random() * Math.PI * 2;
          unit.targetX = quantize(targetSt.x + Math.cos(angle) * 4.2);
          unit.targetZ = quantize(targetSt.z + Math.sin(angle) * 4.2);
          unit.state = 'moving';
          unit.patrolling = true;
          unit.activityAr =
            targetSt.kind === 'watchtower'
              ? 'يحرس أبراج المراقبة'
              : targetSt.kind === 'horse_stable'
                ? 'يتدرب في ميدان الفروسية ومربط الخيول'
                : targetSt.kind === 'war_tent'
                  ? 'يتمركز عند السرادق الحربي'
                  : targetSt.kind === 'market'
                    ? 'يؤمّن قوافل السوق'
                    : 'دورية حراسة لحماية الأهالي';
        }
      }
    }

    // Passive structure & farm production every 2 seconds
    if (worldState.tick % 40 === 0) {
      const structuresList = Object.values(worldState.structures);
      const unitsList = Object.values(worldState.units);
      const urbanByPlayer: Record<
        string,
        ReturnType<typeof evaluateKingdomUrbanization>
      > = {};
      const popLifeByPlayer: Record<
        string,
        ReturnType<typeof evaluatePopulationLife>
      > = {};
      const capacityByPlayer: Record<
        string,
        ReturnType<typeof evaluateKingdomCapacity>
      > = {};
      for (const pid of Object.keys(worldState.players)) {
        const p = worldState.players[pid];
        const pStructs = structuresList.filter((s) => s.ownerId === pid);
        const pUnits = unitsList.filter((u) => u.ownerId === pid);
        const pCult = normalizeCultureKind(p.culture);
        const localClimateFn = (sx: number, sz: number) =>
          getEffectiveClimateAt(sx, sz, worldState.climate);
        urbanByPlayer[pid] = evaluateKingdomUrbanization(
          pStructs,
          pCult,
          worldState.climate,
          getBiomeAt,
          localClimateFn
        );
        popLifeByPlayer[pid] = evaluatePopulationLife(
          pStructs,
          pUnits,
          pCult,
          worldState.climate,
          getBiomeAt,
          localClimateFn
        );
        capacityByPlayer[pid] = evaluateKingdomCapacity(
          pStructs,
          pCult,
          worldState.climate,
          getBiomeAt,
          localClimateFn
        );
      }

      for (const st of structuresList) {
        if (st.isConstructing) continue;
        const owner = worldState.players[st.ownerId];
        if (!owner) continue;

        const stCulture = normalizeCultureKind(st.culture ?? owner.culture);
        const stBiome = getBiomeAt(st.x, st.z);
        const stLocalClimate = getEffectiveClimateAt(st.x, st.z, worldState.climate);
        const envFit = evaluateEnvironmentalFit(
          stCulture,
          stBiome,
          stLocalClimate,
          st.level
        );

        if (envFit.rating === 'ideal' && st.hp < st.maxHp) {
          st.hp = Math.min(st.maxHp, st.hp + 4);
          structuresDirty = true;
        } else if (envFit.rating === 'harsh') {
          const floorHp = Math.round(st.maxHp * 0.55);
          if (st.hp > floorHp) {
            st.hp = Math.max(floorHp, st.hp - 2);
            structuresDirty = true;
          }
        }

        const bonus = STRUCTURE_SPECS[st.kind]?.productionBonus;
        if (bonus) {
          const urbanReport = urbanByPlayer[st.ownerId];
          const popLifeReport = popLifeByPlayer[st.ownerId];
          const storageCap = capacityByPlayer[st.ownerId]?.storageCap ?? 1500;
          let farmSynergyMult = 1.0;
          if (
            st.kind === 'farm' ||
            st.kind === 'livestock_ranch' ||
            st.kind === 'horse_stable'
          ) {
            let nearbyDwellings = 0;
            for (const other of structuresList) {
              if (
                other.ownerId === st.ownerId &&
                (!other.isConstructing || other.level > 1) &&
                (other.kind === 'house' ||
                  other.kind === 'bedouin_tent' ||
                  ((st.kind === 'livestock_ranch' || st.kind === 'horse_stable') &&
                    (other.kind === 'farm' || other.kind === 'livestock_ranch'))) &&
                Math.hypot(st.x - other.x, st.z - other.z) <= 32
              ) {
                nearbyDwellings += 1;
              }
            }
            farmSynergyMult =
              (1 + Math.min(3, nearbyDwellings) * 0.25) *
              (urbanReport?.farmingMultiplier ?? 1.0);
          }

          const stClimateSpec = CLIMATE_SPECS[stLocalClimate] ?? activeClimate;
          const mult =
            st.level *
            stClimateSpec.harvestModifier *
            envFit.productionMultiplier *
            farmSynergyMult *
            (popLifeReport?.prosperityMultiplier ?? 1.0);
          const addCapped = (cur: number, gain: number) =>
            gain <= 0 ? cur : Math.max(cur, Math.min(storageCap, cur + gain));

          owner.resources.wood = addCapped(
            owner.resources.wood,
            Math.round((bonus.wood ?? 0) * mult)
          );
          owner.resources.stone = addCapped(
            owner.resources.stone,
            Math.round((bonus.stone ?? 0) * mult)
          );
          owner.resources.gold = addCapped(
            owner.resources.gold,
            Math.round((bonus.gold ?? 0) * mult)
          );
          owner.resources.food = addCapped(
            owner.resources.food,
            Math.round((bonus.food ?? 0) * mult)
          );
          owner.resources.cloth = addCapped(
            owner.resources.cloth,
            Math.round((bonus.cloth ?? 0) * mult)
          );
          owner.resources.horses = addCapped(
            owner.resources.horses,
            Math.round((bonus.horses ?? 0) * mult)
          );
        }
      }
    }

    // Flush harvested procedural resource deltas to Cloud SQL every 10 seconds (200 ticks)
    if (worldState.tick % 200 === 0 && pendingResourceDeltaFlush.size > 0) {
      const batch = Array.from(pendingResourceDeltaFlush.values());
      pendingResourceDeltaFlush.clear();
      void upsertResourceDeltas(batch);
    }

    if (clientSockets.size > 0) {
      const includeStructures = structuresDirty || worldState.tick % 40 === 0;
      const includeResources = resourcesDirty || worldState.tick % 60 === 0;

      for (const [pid, client] of clientSockets.entries()) {
        if (client.readyState !== WebSocket.OPEN) continue;
        const slice = filterWorldSliceForPlayer(pid, includeStructures, includeResources);
        sendPacket(client, 'S2C_STATE_DELTA', {
          tick: worldState.tick,
          serverTime: worldState.serverTime,
          climate: worldState.climate,
          autoCycleClimate: worldState.autoCycleClimate,
          players: worldState.players,
          units: slice.units,
          pveTheater: worldState.pveTheater,
          combatEvents: slice.combatEvents,
          ...(slice.structures ? { structures: slice.structures } : {}),
          ...(slice.resourceNodes ? { resourceNodes: slice.resourceNodes } : {}),
        });
        if (worldState.players[pid]) {
          worldState.players[pid].packetsSent += 1;
        }
      }

      structuresDirty = false;
      resourcesDirty = false;
    }
  }, TICK_INTERVAL_MS);

  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Husun Authoritative RTS Server running on http://0.0.0.0:${PORT}`);

    // Hydrate persisted harvested resource deltas from Cloud SQL asynchronously
    // so Cloud SQL scale-to-zero wake-up never delays port 3000 readiness.
    void loadAllResourceDeltas()
      .then((deltas) => {
        const keys = Object.keys(deltas);
        if (keys.length === 0) return;
        resourceDeltasCache = { ...deltas, ...resourceDeltasCache };
        for (const [nodeId, remaining] of Object.entries(deltas)) {
          if (worldState.resourceNodes[nodeId] && !pendingResourceDeltaFlush.has(nodeId)) {
            worldState.resourceNodes[nodeId].amount = Math.min(
              worldState.resourceNodes[nodeId].amount,
              remaining
            );
          }
        }
        resourcesDirty = true;
      })
      .catch((err) => {
        console.warn('Background resource delta hydration warning:', err);
      });
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
