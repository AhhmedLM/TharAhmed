import type { BiomeKind, ClimateKind } from './worldMap.ts';

export type PacketType =
  | 'C2S_HANDSHAKE'
  | 'C2S_PING'
  | 'C2S_CAMERA_SYNC'
  | 'C2S_PLACE_STRUCTURE'
  | 'C2S_PLACE_FORT_BATCH'
  | 'C2S_UPGRADE_STRUCTURE'
  | 'C2S_DEMOLISH_STRUCTURE'
  | 'C2S_SPAWN_UNIT'
  | 'C2S_QUEUE_UNIT'
  | 'C2S_CANCEL_TRAINING'
  | 'C2S_MOVE_UNITS'
  | 'C2S_ATTACK_TARGET'
  | 'C2S_UNIT_STANCE'
  | 'C2S_REPAIR_STRUCTURE'
  | 'C2S_SPAWN_PVE_FRONTS'
  | 'C2S_RECLAIM_KEEP'
  | 'C2S_ATLAS_DISPATCH'
  | 'C2S_TRADE_RESOURCE'
  | 'C2S_HYDRATE_FROM_CLOUD'
  | 'C2S_SET_CLIMATE'
  | 'C2S_SET_CULTURE'
  | 'C2S_TOGGLE_GATE'
  | 'C2S_DIPLOMACY_ACTION'
  | 'C2S_CLAIM_ROLE'
  | 'C2S_CREATE_CHARACTER'
  | 'C2S_FOUND_EXILE_KEEP'
  | 'C2S_RESET_WORLD'
  | 'S2C_WELCOME'
  | 'S2C_PONG'
  | 'S2C_STATE_DELTA'
  | 'S2C_WORLD_SNAPSHOT'
  | 'S2C_PACKET_ACK'
  | 'S2C_MATCH_EVENT'
  | 'S2C_CHARACTER_DEATH';

export type CultureKind =
  | 'iraqi_mesopotamian'
  | 'levantine_shami'
  | 'hejazi_arabian'
  | 'bedouin_nomadic';

export function normalizeCultureKind(raw?: string | null): CultureKind {
  switch (raw) {
    case 'iraqi_mesopotamian':
    case 'arabian_abbasid':
      return 'iraqi_mesopotamian';
    case 'levantine_shami':
    case 'european_gothic':
      return 'levantine_shami';
    case 'hejazi_arabian':
    case 'east_asian':
      return 'hejazi_arabian';
    case 'bedouin_nomadic':
    case 'nordic_viking':
      return 'bedouin_nomadic';
    default:
      return 'iraqi_mesopotamian';
  }
}

export type StructureKind =
  | 'house'
  | 'farm'
  | 'livestock_ranch'
  | 'horse_stable'
  | 'bedouin_tent'
  | 'war_tent'
  | 'market'
  | 'temple'
  | 'keep'
  | 'barracks'
  | 'lumber_camp'
  | 'quarry'
  | 'watchtower'
  | 'stone_wall'
  | 'gatehouse'
  | 'moat_trench'
  | 'siege_workshop';

export type StructureLevel = 1 | 2 | 3;

export type UrbanizationTier = 1 | 2 | 3 | 4;

export type UnitKind =
  | 'worker'
  | 'infantry'
  | 'spearman'
  | 'archer'
  | 'knight'
  | 'commander'
  | 'battering_ram'
  | 'trebuchet';

export type ResourceKind = 'wood' | 'stone' | 'gold' | 'food' | 'cloth' | 'horses';

export interface PlayerResources {
  wood: number;
  stone: number;
  gold: number;
  food: number;
  cloth: number;
  horses: number;
}

export const MIN_CAMERA_ZOOM = 14;
export const MAX_CAMERA_ZOOM = 720;

export interface CameraTransform {
  targetX: number;
  targetZ: number;
  zoom: number;
  yaw: number;
  pitch: number;
  cursorX: number;
  cursorZ: number;
}

export type BannerPatternKind =
  | 'crescent_star'
  | 'crossed_swords'
  | 'crusader_cross'
  | 'royal_lion'
  | 'nordic_raven'
  | 'imperial_sun';

export interface BannerPatternSpec {
  id: BannerPatternKind;
  nameAr: string;
  shortAr: string;
  descAr: string;
}

export const BANNER_PATTERN_SPECS: Record<BannerPatternKind, BannerPatternSpec> = {
  crescent_star: {
    id: 'crescent_star',
    nameAr: 'راية الهلال والنجمة',
    shortAr: 'هلال ونجمة',
    descAr: 'شعار حواضر الرافدين والشام فوق القلاع والرايات',
  },
  crossed_swords: {
    id: 'crossed_swords',
    nameAr: 'راية السيفين المتقاطعين',
    shortAr: 'سيفان متقاطعان',
    descAr: 'شعار فرسان الثغور وطلائع القبائل في الميدان',
  },
  crusader_cross: {
    id: 'crusader_cross',
    nameAr: 'راية صليب الساحل الغربي',
    shortAr: 'صليب الساحل',
    descAr: 'شعار الحاميات الصليبية على الشريط الساحلي للقدس وعكا',
  },
  royal_lion: {
    id: 'royal_lion',
    nameAr: 'راية الأسد السلطاني',
    shortAr: 'الأسد السلطاني',
    descAr: 'شعار البلاط والولايات المهيبة وحرس الحصون',
  },
  nordic_raven: {
    id: 'nordic_raven',
    nameAr: 'راية العقاب الأسود',
    shortAr: 'العقاب الأسود',
    descAr: 'شعار عشائر البادية والفرسان الأحرار فوق المضارب',
  },
  imperial_sun: {
    id: 'imperial_sun',
    nameAr: 'راية شمس الرافدين الذهبية',
    shortAr: 'شمس الرافدين',
    descAr: 'شعار ولايات دجلة وشط العرب وتجار القوافل الكبرى',
  },
};

export const FACTION_PRIMARY_SWATCHES: Array<{ hex: string; nameAr: string }> = [
  { hex: '#0d9488', nameAr: 'فيروزي عباسي' },
  { hex: '#dc2626', nameAr: 'قرمزي ملكي' },
  { hex: '#2563eb', nameAr: 'أزرق لازوردي' },
  { hex: '#d97706', nameAr: 'ذهبي عنبري' },
  { hex: '#16a34a', nameAr: 'زمردي أندلسي' },
  { hex: '#7c3aed', nameAr: 'أرجواني بيزنطي' },
  { hex: '#1e293b', nameAr: 'كحلي الحرس الأسود' },
  { hex: '#991b1b', nameAr: 'عنابي الإمبراطورية' },
];

export const FACTION_SECONDARY_SWATCHES: Array<{ hex: string; nameAr: string }> = [
  { hex: '#fbbf24', nameAr: 'ذهب خالص' },
  { hex: '#f8fafc', nameAr: 'فضي ناصع' },
  { hex: '#fde047', nameAr: 'أصفر شمس' },
  { hex: '#38bdf8', nameAr: 'سماوي مضيء' },
  { hex: '#4ade80', nameAr: 'أخضر واحة' },
  { hex: '#f43f5e', nameAr: 'ياقوتي متوهج' },
  { hex: '#fb923c', nameAr: 'نحاسي ناري' },
  { hex: '#0f172a', nameAr: 'أسود فولاذي' },
];

export type PveDifficulty = 'casual' | 'balanced' | 'aggressive';

export type BanditCampArchetype =
  | 'forest_ambush'
  | 'highway_raiders'
  | 'mountain_brigands'
  | 'ruin_marauders';

export type BanditRoleKind =
  | 'cutthroat'
  | 'poacher'
  | 'brigand'
  | 'raider_horse'
  | 'looter';

export type BanditTacticalState =
  | 'guard_lair'
  | 'ambush_wait'
  | 'ambush_strike'
  | 'raiding'
  | 'retreating';

export interface CarriedLoot {
  gold: number;
  wood: number;
  food: number;
}

export type AiFactionKind = 'sindhi_state' | 'crusaders' | 'local_emirate' | 'bandits';

export type DiplomacyRelation = 'war' | 'neutral' | 'ally';
export type PvpMode = 'diplomacy' | 'free_for_all' | 'coop';
export type SultanHassanMode = 'ai_ruler' | 'human_claimable' | 'disabled';
export type CommanderRank = 1 | 2 | 3 | 4;
export type CharacterStatus = 'active' | 'exile_fleeing' | 'dead';

export interface SeasonState {
  seasonNumber: number;
  seasonNameAr: string;
  startedAtMs: number;
}

export interface CommanderRankSpec {
  rank: CommanderRank;
  titleAr: string;
  badgeColor: string;
  heroHpBonus: number;
  unlockedStructures: StructureKind[];
  economyGoalAr: string;
  fieldGoalAr: string;
}

export const COMMANDER_RANK_SPECS: Record<CommanderRank, CommanderRankSpec> = {
  1: {
    rank: 1,
    titleAr: 'قائد ناشئ',
    badgeColor: '#cbd5e1',
    heroHpBonus: 0,
    unlockedStructures: ['house', 'farm', 'lumber_camp', 'quarry', 'barracks'],
    economyGoalAr: 'ابنِ بيتاً ومزرعة (أو 3 مبانٍ)',
    fieldGoalAr: 'سيطر على مصدر موارد واحد أو اهزم خصماً',
  },
  2: {
    rank: 2,
    titleAr: 'أمير ثغر',
    badgeColor: '#38bdf8',
    heroHpBonus: 120,
    unlockedStructures: [
      'bedouin_tent',
      'livestock_ranch',
      'horse_stable',
      'market',
      'watchtower',
      'stone_wall',
      'war_tent',
    ],
    economyGoalAr: 'شيّد 6 مبانٍ وبلوغ تحضر Lv.2',
    fieldGoalAr: 'سيطر على مصدري موارد أو 5 قتلى أو مدينة',
  },
  3: {
    rank: 3,
    titleAr: 'والي إقليم',
    badgeColor: '#c084fc',
    heroHpBonus: 280,
    unlockedStructures: ['gatehouse', 'moat_trench', 'siege_workshop', 'temple', 'keep'],
    economyGoalAr: 'بلوغ مستوى تحضر Lv.3',
    fieldGoalAr: 'سيطر على 4 مصادر موارد أو مدينتين أو 15 قتيلاً',
  },
  4: {
    rank: 4,
    titleAr: 'سلطان',
    badgeColor: '#fbbf24',
    heroHpBonus: 500,
    unlockedStructures: [],
    economyGoalAr: 'أعلى رتبة إدارية وعمرانية في الموسم',
    fieldGoalAr: 'توسّع بسيطرتك على مرقاب والقدس ومصادر الإقليم',
  },
};

export const STRUCTURE_REQUIRED_RANK: Record<StructureKind, CommanderRank> = {
  house: 1,
  farm: 1,
  lumber_camp: 1,
  quarry: 1,
  barracks: 1,
  bedouin_tent: 2,
  livestock_ranch: 2,
  horse_stable: 2,
  market: 2,
  watchtower: 2,
  stone_wall: 2,
  war_tent: 2,
  gatehouse: 3,
  moat_trench: 3,
  siege_workshop: 3,
  temple: 3,
  keep: 3,
};

export function getRequiredRankForStructure(kind: StructureKind): CommanderRank {
  return STRUCTURE_REQUIRED_RANK[kind] ?? 1;
}

export interface CommanderRankReport {
  rank: CommanderRank;
  spec: CommanderRankSpec;
  nextSpec: CommanderRankSpec | null;
  economyDone: boolean;
  economyProgressAr: string;
  fieldDone: boolean;
  fieldProgressAr: string;
  capturedNodesCount: number;
  capturedCitiesCount: number;
}

export function evaluateCommanderRank(
  structures: BlockoutStructure[],
  urbanTier: UrbanizationTier,
  capturedNodesCount: number,
  capturedCitiesCount: number,
  kills: number,
  isSultanHassan?: boolean
): CommanderRankReport {
  const nonKeepCount = structures.filter((s) => s.kind !== 'keep' && s.hp > 0).length;
  const hasHouse = structures.some((s) => (s.kind === 'house' || s.kind === 'bedouin_tent') && s.hp > 0);
  const hasFarm = structures.some((s) => s.kind === 'farm' && s.hp > 0);

  const r2Eco = (hasHouse && hasFarm) || nonKeepCount >= 3;
  const r2Field = capturedNodesCount >= 1 || kills >= 1 || capturedCitiesCount >= 1;

  const r3Eco = nonKeepCount >= 6 && urbanTier >= 2;
  const r3Field = capturedNodesCount >= 2 || kills >= 5 || capturedCitiesCount >= 1;

  const r4Eco = urbanTier >= 3;
  const r4Field = capturedNodesCount >= 4 || kills >= 15 || capturedCitiesCount >= 2;

  let rank: CommanderRank = 1;
  if (isSultanHassan) {
    rank = 4;
  } else if (r2Eco && r2Field) {
    rank = 2;
    if (r3Eco && r3Field) {
      rank = 3;
      if (r4Eco && r4Field) {
        rank = 4;
      }
    }
  }

  const spec = COMMANDER_RANK_SPECS[rank];
  const nextSpec = rank < 4 ? COMMANDER_RANK_SPECS[(rank + 1) as CommanderRank] : null;

  let economyDone = true;
  let economyProgressAr = spec.economyGoalAr;
  let fieldDone = true;
  let fieldProgressAr = spec.fieldGoalAr;

  if (rank === 1) {
    economyDone = r2Eco;
    economyProgressAr = `المباني: ${hasHouse ? '✓بيت' : 'بيت'} · ${hasFarm ? '✓مزرعة' : 'مزرعة'} (أو ${nonKeepCount}/3 مبانٍ)`;
    fieldDone = r2Field;
    fieldProgressAr = `السيطرة الميدانية: ${capturedNodesCount}/1 مصدر موارد أو ${kills}/1 خصم`;
  } else if (rank === 2) {
    economyDone = r3Eco;
    economyProgressAr = `المباني: ${nonKeepCount}/6 · التحضر Lv.${urbanTier}/2`;
    fieldDone = r3Field;
    fieldProgressAr = `النفوذ: ${capturedNodesCount}/2 مصادر أو ${kills}/5 قتلى أو ${capturedCitiesCount}/1 مدينة`;
  } else if (rank === 3) {
    economyDone = r4Eco;
    economyProgressAr = `مستوى التحضر: Lv.${urbanTier}/3`;
    fieldDone = r4Field;
    fieldProgressAr = `النفوذ: ${capturedNodesCount}/4 مصادر أو ${capturedCitiesCount}/2 مدن أو ${kills}/15 قتيلاً`;
  }

  return {
    rank,
    spec,
    nextSpec,
    economyDone,
    economyProgressAr,
    fieldDone,
    fieldProgressAr,
    capturedNodesCount,
    capturedCitiesCount,
  };
}

export interface TrainingQueueItem {
  id: string;
  unitKind: UnitKind;
  campId: string;
  durationSec: number;
  remainingSec: number;
  ownerId: string;
}

export interface WorldDirectorConfig {
  pvpMode: PvpMode;
  sultanHassanMode: SultanHassanMode;
  sultanHassanAssignedUid: string | null;
  enabledCities: Record<string, boolean>;
  banditsEnabled: boolean;
  banditDifficulty: PveDifficulty;
  banditCampCount: number;
  dominionVictoryTargetCities: number;
}

export interface MatchStatusState {
  status: 'active' | 'ended';
  winnerPlayerId?: string;
  winnerNameAr?: string;
  victoryReasonAr?: string;
  endedAtMs?: number;
}

export interface PlayerState {
  id: string;
  uid?: string;
  name: string;
  color: string;
  secondaryColor?: string;
  bannerPattern?: BannerPatternKind;
  factionName: string;
  administrationTitleAr?: string;
  cityNameAr?: string;
  provinceAr?: string;
  culture?: CultureKind;
  connectedAt: number;
  pingMs: number;
  camera: CameraTransform;
  resources: PlayerResources;
  packetsReceived: number;
  packetsSent: number;
  isAi?: boolean;
  isBandit?: boolean;
  isSultanHassan?: boolean;
  roleId?: 'sultan_hassan' | 'standard';
  aiFactionKind?: AiFactionKind;
  banditCampArchetype?: BanditCampArchetype;
  isDefeated?: boolean;
  defeatedAtMs?: number;
  disconnectedAtMs?: number;
  aiDifficulty?: PveDifficulty;
  kills?: number;
  losses?: number;
  structuresRazed?: number;
  capturedCapitals?: number;
  trainingQueue?: TrainingQueueItem[];
  heroUnitId?: string | null;
  characterCreated?: boolean;
  characterStatus?: CharacterStatus;
  commanderRank?: CommanderRank;
  capturedNodesCount?: number;
  capturedCitiesCount?: number;
  fallenAtMs?: number;
  killedByNameAr?: string;
}

export interface BlockoutStructure {
  id: string;
  ownerId: string;
  ownerColor: string;
  secondaryColor?: string;
  bannerPattern?: BannerPatternKind;
  kind: StructureKind;
  culture?: CultureKind;
  level: StructureLevel;
  x: number;
  z: number;
  rotationY: number;
  hp: number;
  maxHp: number;
  createdAtTick: number;
  isConstructing?: boolean;
  constructionProgress?: number;
  buildTimeSeconds?: number;
  activeBuildersCount?: number;
  lastAttackTick?: number;
  isGateLocked?: boolean;
  isWaterMoat?: boolean;
  burnUntilTick?: number;
  burnAttackerId?: string;
  captureProgress?: number;
  capturingOwnerId?: string | null;
}

export type CitizenRoleKind =
  | 'farmer'
  | 'merchant'
  | 'scholar'
  | 'water_carrier'
  | 'shepherd'
  | 'livestock_sheep'
  | 'livestock_camel'
  | 'horse_trainer'
  | 'wild_horse'
  | 'tamed_stallion';

export interface MarchWaypoint {
  x: number;
  z: number;
}

export type UnitStanceKind = 'aggressive' | 'defensive' | 'stand';

export interface BlockoutUnit {
  id: string;
  ownerId: string;
  ownerColor: string;
  secondaryColor?: string;
  bannerPattern?: BannerPatternKind;
  kind: UnitKind;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  rotationY: number;
  speed: number;
  state: 'idle' | 'moving' | 'gathering' | 'building' | 'attacking' | 'repairing';
  stance?: UnitStanceKind;
  isNaval?: boolean;
  assignedResourceId?: string;
  assignedStructureId?: string;
  targetUnitId?: string;
  targetStructureId?: string;
  attackMoveTarget?: MarchWaypoint;
  lastAttackTick?: number;
  activityAr?: string;
  patrolling?: boolean;
  waypoints?: MarchWaypoint[];
  departedAtMs?: number;
  totalDistanceM?: number;
  etaServerMs?: number;
  marchOrderLabelAr?: string;
  hp: number;
  maxHp: number;
  isBanditUnit?: boolean;
  banditClanArchetype?: BanditCampArchetype;
  banditRole?: BanditRoleKind;
  banditState?: BanditTacticalState;
  isStealthed?: boolean;
  ambushBonusUntilTick?: number;
  carriedLoot?: CarriedLoot;
  ambushAnchor?: MarchWaypoint;
  burnUntilTick?: number;
  burnAttackerId?: string;
  slowUntilTick?: number;
  lastChargeTick?: number;
  movedMetersSinceCharge?: number;
  isHeroSultan?: boolean;
  isPlayerHero?: boolean;
  displayNameAr?: string;
}

export interface ResourceNode {
  id: string;
  kind: ResourceKind;
  x: number;
  z: number;
  amount: number;
  maxAmount: number;
  ownerId?: string | null;
  ownerColor?: string;
  ownerNameAr?: string;
  captureProgress?: number;
  capturingOwnerId?: string | null;
}

export interface CombatEvent {
  id: string;
  tick: number;
  kind:
    | 'arrow'
    | 'fire_arrow'
    | 'melee'
    | 'siege'
    | 'siege_boulder'
    | 'repair'
    | 'destruction'
    | 'alert'
    | 'ambush'
    | 'loot_stolen'
    | 'loot_recovered';
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  attackerOwnerId?: string;
  targetOwnerId?: string;
  damage?: number;
  color?: string;
  labelAr?: string;
}

export interface PveTheaterState {
  id: string;
  difficulty: PveDifficulty;
  strongholdCount: number;
  strongholdsCleared: number;
  startedAtMs: number;
  lastRespawnAtMs?: number;
}

export interface WorldState {
  tick: number;
  serverTime: number;
  mapSize: number;
  climate: ClimateKind;
  autoCycleClimate: boolean;
  players: Record<string, PlayerState>;
  structures: Record<string, BlockoutStructure>;
  units: Record<string, BlockoutUnit>;
  resourceNodes: Record<string, ResourceNode>;
  pveTheater?: PveTheaterState;
  combatEvents?: CombatEvent[];
  diplomacy?: Record<string, DiplomacyRelation>;
  directorConfig?: WorldDirectorConfig;
  pendingAlliances?: Array<{ fromId: string; toId: string; createdAtMs: number }>;
  pvpMode?: PvpMode;
  sultanHassanMode?: SultanHassanMode;
  sultanHassanOwnerId?: string | null;
  matchStatus?: MatchStatusState;
  season?: SeasonState;
}

export interface NetworkPacket<T = unknown> {
  seq: number;
  type: PacketType;
  timestamp: number;
  senderId?: string;
  payload: T;
}

export interface PacketLogEntry {
  id: string;
  direction: 'IN' | 'OUT';
  seq: number;
  type: PacketType;
  bytes: number;
  timestamp: number;
  summary: string;
}

export type EnvironmentalFitRating = 'ideal' | 'compatible' | 'harsh';

export interface EnvironmentalFitEvaluation {
  rating: EnvironmentalFitRating;
  ratingLabelAr: string;
  badgeColorClass: string;
  productionMultiplier: number;
  populationDelta: number;
  maxHpMultiplier: number;
  campBonusMultiplier: number;
  recommendedCulture: CultureKind;
  reasonAr: string;
  featureHighlightAr: string;
}

export interface CultureSpec {
  id: CultureKind;
  nameAr: string;
  shortAr: string;
  architectureAr: string;
  houseNamesAr: Record<StructureLevel, string>;
  farmNamesAr: Record<StructureLevel, string>;
  templeNamesAr: Record<StructureLevel, string>;
  wallHex: number;
  darkWallHex: number;
  timberHex: number;
  roofAccentHex: string;
  idealBiomes: BiomeKind[];
  compatibleBiomes: BiomeKind[];
  harshBiomes: BiomeKind[];
  idealClimates: ClimateKind[];
  harshClimates: ClimateKind[];
  envTitleAr: string;
  envStrengthsAr: string;
  envWeaknessAr: string;
}

export const CULTURE_SPECS: Record<CultureKind, CultureSpec> = {
  iraqi_mesopotamian: {
    id: 'iraqi_mesopotamian',
    nameAr: 'الطراز العراقي الرافديني (مرقاب والرصافة)',
    shortAr: 'عراقي',
    architectureAr:
      'آجر ذهبي مشوي، شناشيل خشبية متدلية، إيوانات مقوسة، مآذن أسطوانية ملوية، قباب فيروزية ومذهّبة، وبراجيل هواء',
    houseNamesAr: {
      1: 'بيت آجر رافديني بشناشيل خشبية',
      2: 'دار عراقية بفناء داخلي وبارجيل هوائي',
      3: 'قصر مرقاب المقبب بالآجر المذهّب والنوافير',
    },
    farmNamesAr: {
      1: 'بستان نخيل وسواقي دجلة والفرات',
      2: 'مزرعة نواعير مائية وصومعة غلال رافدينية',
      3: 'جنان السواد والرصافة الزراعية الكبرى',
    },
    templeNamesAr: {
      1: 'مسجد آجر ومدرسة علمية',
      2: 'جامع بمئذنة ملوية وقبة فيروزية',
      3: 'الجامع السلطاني الأعظم ودار العلم',
    },
    wallHex: 0xe2c38f,
    darkWallHex: 0xa67c47,
    timberHex: 0x6b3e22,
    roofAccentHex: '#0d9488',
    idealBiomes: ['river_basin', 'fertile_plains', 'ocean_coast'],
    compatibleBiomes: ['southern_dunes', 'eastern_basalt'],
    harshBiomes: ['northern_peaks', 'western_forest', 'waterfall_gorge'],
    idealClimates: ['temperate_clear', 'desert_sandstorm'],
    harshClimates: ['northern_blizzard'],
    envTitleAr: 'سيادة حوض دجلة والفرات والسهول الخصبة (الشناشيل والبراجيل)',
    envStrengthsAr:
      'جدران الآجر السميكة والشناشيل والبراجيل المبردة مثالية لضفاف الأنهار والسهول الدافئة وشط العرب: +45% إنتاج ذهب ومؤن، +2 إلى +6 سعة سكانية إضافية، و+25% متانة.',
    envWeaknessAr:
      'الأفنية المفتوحة وجدران الطوب المشوي تتأثر ببرودة القمم الشمالية والغابات الجبلية شديدة الرطوبة (-45% كفاءة إنتاجية).',
  },
  levantine_shami: {
    id: 'levantine_shami',
    nameAr: 'الطراز الشامي الأبلق (دمشق وحلب والقدس)',
    shortAr: 'شامي',
    architectureAr:
      'حجر أبلق متناوب (أبيض دمشقي وبازلت أسود)، عقود مدببة، بحرات وأفنية نوافير، مآذن حجرية مربعة، وقلاع صخرية منيعة',
    houseNamesAr: {
      1: 'بيت حجر شامي بساحة داخلية وظل عريش',
      2: 'دار شامية أبلق بإيوان وبحرة ماء',
      3: 'قصر الأعيان الشامي بالحجر المنقوش والقباب الحجرية',
    },
    farmNamesAr: {
      1: 'بستان زيتون وتين وحقول قمح شامية',
      2: 'ضيعة الغوطة بنواعير العاصي ومعصرة زيت',
      3: 'بساتين الشام والجزيرة الكبرى',
    },
    templeNamesAr: {
      1: 'مسجد حجري شامي بقبة بيضاء',
      2: 'جامع أبلق بمئذنة حجرية مربعة وصحن فسيح',
      3: 'الجامع الأموي الكبير ذو القباب الرصاصية والفسيفساء',
    },
    wallHex: 0xe8e2d5,
    darkWallHex: 0x57534e,
    timberHex: 0x6b3a24,
    roofAccentHex: '#b45309',
    idealBiomes: ['western_forest', 'northern_peaks', 'waterfall_gorge', 'fertile_plains'],
    compatibleBiomes: ['river_basin', 'ocean_coast'],
    harshBiomes: ['southern_dunes', 'eastern_basalt'],
    idealClimates: ['monsoon_rain', 'temperate_clear', 'northern_blizzard'],
    harshClimates: ['desert_sandstorm'],
    envTitleAr: 'سيادة مرتفعات الشام والغابات وثغور الشمال (الحجر الأبلق المنيع)',
    envStrengthsAr:
      'الحجر الدمشقي والبازلت المتماسك والعقود السميكة تصمد أمام الأمطار والبرد والجبال في الشام ونصيبين: +45% إنتاج أخشاب وحجارة ومؤن، +2 إلى +6 سعة سكانية، و+25% متانة.',
    envWeaknessAr:
      'البناء الحجري الثقيل أقل مرونة ومكلف التبريد في عمق كثبان النفود وعواصف البادية الرملية (-45% كفاءة إنتاجية).',
  },
  hejazi_arabian: {
    id: 'hejazi_arabian',
    nameAr: 'الطراز الحجازي العريق (الحجاز وتخومه)',
    shortAr: 'حجازي',
    architectureAr:
      'حجر منقبي مرجاني أبيض وجص ناصع، رواشين خشبية منحوتة متعددة الطبقات، مشربيات تهوية عالية، وخانات قوافل محصّنة',
    houseNamesAr: {
      1: 'بيت حجازي أبيض برواشين خشب منقوشة',
      2: 'دار رواشين حجازية بطابقين ومقعد نسيم',
      3: 'قصر أعيان الحجاز ذو الرواشين المتدرجة والقباب البيضاء',
    },
    farmNamesAr: {
      1: 'بستان نخيل وعيون ماء حجازية',
      2: 'مزرعة واحة مسورة بآبار وسواقي حجرية',
      3: 'بساتين الواحات الكبرى ومستودع التمور والغلال',
    },
    templeNamesAr: {
      1: 'مصلى أبيض بأروقة حجرية مظللة',
      2: 'جامع حجازي بمئذنة بيضاء وأقواس متكررة',
      3: 'المسجد الجامع الحجازي ذو الأروقة الرخامية والقباب',
    },
    wallHex: 0xf4efe4,
    darkWallHex: 0xb8a58a,
    timberHex: 0x5c3419,
    roofAccentHex: '#d97706',
    idealBiomes: ['southern_dunes', 'ocean_coast', 'eastern_basalt'],
    compatibleBiomes: ['river_basin', 'fertile_plains'],
    harshBiomes: ['northern_peaks', 'western_forest', 'waterfall_gorge'],
    idealClimates: ['desert_sandstorm', 'temperate_clear'],
    harshClimates: ['northern_blizzard'],
    envTitleAr: 'سيادة تخوم الحجاز والثغور الساحلية والحرات الصخرية (الرواشين والمنقبي)',
    envStrengthsAr:
      'الحجر المرجاني الفاتح والرواشين الخشبية المرتفعة تسحب النسيم وتكسر وهج الشمس في الجنوب والساحل والحرات: +45% إنتاج ذهب وحجارة، +2 إلى +6 سعة سكانية، و+25% متانة.',
    envWeaknessAr:
      'الرواشين الخشبية المفتوحة والجص الفاتح يتضرران في الصقيع الجبلي الشمالي والأمطار الجبلية الكثيفة (-45% كفاءة).',
  },
  bedouin_nomadic: {
    id: 'bedouin_nomadic',
    nameAr: 'الطراز البدوي للخيام (مضارب وبيوت الشعر)',
    shortAr: 'بدوي',
    architectureAr:
      'بيوت شعر سوداء منسوجة من صوف الماعز، شرائط السدو الأحمر والذهبي، سرادقات الشيوخ والفرسان، حظائر الإبل والخيل، وأبراج رصد صحراوية',
    houseNamesAr: {
      1: 'بيت شعر بدوي منسوج بالسدو ونار الضيافة',
      2: 'مضرب شيوخ مزدوج بأروقة قماشية وساحة خيل',
      3: 'سرادق البادية السلطاني الكبير ومضرب العشائر',
    },
    farmNamesAr: {
      1: 'مراعي البادية ومضرب الرعاة وحظيرة إبل',
      2: 'واحة المضرب وبئر قوافل وقطيع ماشية',
      3: 'مضارب المراعي الكبرى ومربط القوافل والغلال',
    },
    templeNamesAr: {
      1: 'مصلى البادية الحجري ومجلس الشيوخ',
      2: 'مسجد خيمة السرادق الفسيح برواق مظلل',
      3: 'مصلى القوافل الكبير ومجمع شيوخ القبائل',
    },
    wallHex: 0x3b312b,
    darkWallHex: 0x1f1916,
    timberHex: 0x7c4a21,
    roofAccentHex: '#b91c1c',
    idealBiomes: ['southern_dunes', 'eastern_basalt', 'fertile_plains'],
    compatibleBiomes: ['river_basin', 'ocean_coast'],
    harshBiomes: ['northern_peaks', 'waterfall_gorge'],
    idealClimates: ['desert_sandstorm', 'temperate_clear'],
    harshClimates: ['northern_blizzard'],
    envTitleAr: 'سيادة بادية الشام والنفود والشعاب الصخرية (مرونة الخيام ومضارب الفرسان)',
    envStrengthsAr:
      'بيوت الشعر والسرادقات المنسوجة تتحمل رياح البادية وعواصف الرمال وتدعم الخيل والقوافل في السهول والصحراء: +45% إنتاج قماش وخيول ومؤن، +2 إلى +6 سعة سكانية، و+25% متانة.',
    envWeaknessAr:
      'الخيام المنسوجة أقل عزلاً في العواصف الثلجية القاسية فوق قمم الجبال الشمالية والخوانق الجليدية (-45% كفاءة).',
  },
};

/**
 * Returns the optimal architectural culture for a given geographic biome & active climate.
 */
export function getRecommendedCultureForBiome(
  biome: BiomeKind,
  climate: ClimateKind = 'temperate_clear'
): CultureKind {
  switch (biome) {
    case 'southern_dunes':
      return climate === 'desert_sandstorm' ? 'bedouin_nomadic' : 'hejazi_arabian';
    case 'eastern_basalt':
      return climate === 'desert_sandstorm' ? 'bedouin_nomadic' : 'hejazi_arabian';
    case 'ocean_coast':
      return climate === 'desert_sandstorm' ? 'hejazi_arabian' : 'iraqi_mesopotamian';
    case 'northern_peaks':
    case 'western_forest':
    case 'waterfall_gorge':
      return 'levantine_shami';
    case 'river_basin':
      return 'iraqi_mesopotamian';
    case 'fertile_plains':
    default:
      if (climate === 'desert_sandstorm') return 'bedouin_nomadic';
      if (climate === 'northern_blizzard' || climate === 'monsoon_rain') return 'levantine_shami';
      return 'iraqi_mesopotamian';
  }
}

/**
 * Evaluates how well a building/house of `culture` performs in `biome` under `climate`.
 * Compels strategic biome-specific architecture selection across the 100x100 km theater.
 */
export function evaluateEnvironmentalFit(
  culture: CultureKind,
  biome: BiomeKind,
  climate: ClimateKind = 'temperate_clear',
  level: StructureLevel = 1
): EnvironmentalFitEvaluation {
  const safeCulture = normalizeCultureKind(culture);
  const cSpec = CULTURE_SPECS[safeCulture];
  const recommendedCulture = getRecommendedCultureForBiome(biome, climate);
  const recSpec = CULTURE_SPECS[recommendedCulture];

  const isIdealBiome = cSpec.idealBiomes.includes(biome);
  const isHarshBiome = cSpec.harshBiomes.includes(biome);
  const isIdealClimate = cSpec.idealClimates.includes(climate);
  const isHarshClimate = cSpec.harshClimates.includes(climate);

  if (isIdealBiome && !isHarshClimate) {
    const climateBoost = isIdealClimate ? 0.15 : 0;
    const prodMult = Math.round((1.45 + climateBoost) * 100) / 100;
    const popDelta = level * 2; // +2 at Lv1, +4 at Lv2, +6 at Lv3!
    return {
      rating: 'ideal',
      ratingLabelAr: `توافق بيئي مثالي (+${Math.round((prodMult - 1) * 100)}%)`,
      badgeColorClass: 'text-[#6ee7b7] border-[#10b981] bg-[#064e3b]/80',
      productionMultiplier: prodMult,
      populationDelta: popDelta,
      maxHpMultiplier: 1.25,
      campBonusMultiplier: 1.35,
      recommendedCulture,
      reasonAr: `عمارة (${cSpec.shortAr}) مصممة خصيصاً لهذه البيئة وتمنح +${Math.round((prodMult - 1) * 100)}% إنتاج و+${popDelta} سعة سكانية.`,
      featureHighlightAr: cSpec.envStrengthsAr,
    };
  }

  if (isHarshBiome || (isHarshClimate && !isIdealBiome)) {
    const prodMult = isHarshBiome && isHarshClimate ? 0.45 : 0.55;
    const popDelta = -level; // -1 at Lv1, -2 at Lv2, -3 at Lv3
    return {
      rating: 'harsh',
      ratingLabelAr: `بيئة معاكسة للطراز (-${Math.round((1 - prodMult) * 100)}%)`,
      badgeColorClass: 'text-[#fca5a5] border-[#ef4444] bg-[#7f1d1d]/85',
      productionMultiplier: prodMult,
      populationDelta: popDelta,
      maxHpMultiplier: 0.8,
      campBonusMultiplier: 0.65,
      recommendedCulture,
      reasonAr: `تحذير بيئي: ${cSpec.shortAr} يفقد ${Math.round((1 - prodMult) * 100)}% من كفاءته هنا! الطراز الأمثل لهذه الأرض هو (${recSpec.shortAr}).`,
      featureHighlightAr: cSpec.envWeaknessAr,
    };
  }

  // Compatible / Neutral fit
  const prodMult = isIdealClimate ? 1.15 : 1.0;
  return {
    rating: 'compatible',
    ratingLabelAr:
      prodMult > 1 ? 'توافق مناخي جيد (+15%)' : 'توافق بيئي معتدل (100%)',
    badgeColorClass: 'text-[#fde047] border-[#eab308] bg-[#422006]/80',
    productionMultiplier: prodMult,
    populationDelta: 0,
    maxHpMultiplier: 1.0,
    campBonusMultiplier: 1.0,
    recommendedCulture,
    reasonAr: `يعمل بكفاءة طبيعية، لكن البناء بطراز (${recSpec.shortAr}) في هذه المنطقة سيمنحك مكافأة بيئية +45%!`,
    featureHighlightAr: cSpec.envTitleAr,
  };
}

export const STRUCTURE_SPECS: Record<
  StructureKind,
  {
    labelAr: string;
    code: string;
    categoryAr: 'سكني ومدني' | 'اقتصادي وتجاري' | 'عسكري ودفاعي' | 'ثقافي وديني';
    requiredUrbanTier: UrbanizationTier;
    urbanPoints: number;
    cost: Partial<PlayerResources>;
    upgradeCosts: Record<2 | 3, Partial<PlayerResources>>;
    tierNamesAr: Record<StructureLevel, string>;
    footprint: { w: number; d: number; h: number };
    maxHp: number;
    buildTimeSeconds: number;
    visionRadius: number;
    productionBonus?: Partial<PlayerResources>;
  }
> = {
  house: {
    labelAr: 'حي سكني متلاصق (Residential Quarter)',
    code: 'BLK_HOUS_01',
    categoryAr: 'سكني ومدني',
    requiredUrbanTier: 1,
    urbanPoints: 22,
    cost: { wood: 35, stone: 15 },
    upgradeCosts: {
      2: { wood: 55, stone: 35, gold: 20 },
      3: { wood: 90, stone: 75, gold: 50 },
    },
    tierNamesAr: {
      1: 'المستوى 1: محلة بيوت متلاصقة الجدران (+650 نسمة)',
      2: 'المستوى 2: حي عمراني كثيف بالشناشيل والقباب (+1,650 نسمة)',
      3: 'المستوى 3: ربض مديني عامر وقصور أعيان (+3,800 نسمة)',
    },
    footprint: { w: 3.4, d: 3.4, h: 3.6 },
    maxHp: 360,
    buildTimeSeconds: 12,
    visionRadius: 68,
    productionBonus: { food: 3, gold: 2 },
  },
  farm: {
    labelAr: 'مزرعة وحقول ري (Farm)',
    code: 'BLK_FARM_09',
    categoryAr: 'اقتصادي وتجاري',
    requiredUrbanTier: 1,
    urbanPoints: 26,
    cost: { wood: 45, stone: 10 },
    upgradeCosts: {
      2: { wood: 65, stone: 30, gold: 20 },
      3: { wood: 110, stone: 60, gold: 45 },
    },
    tierNamesAr: {
      1: 'المستوى 1: حقول زراعية وسواقي ري',
      2: 'المستوى 2: طاحونة ونواعير وصومعة غلال',
      3: 'المستوى 3: الضيعة الزراعية الإمبراطورية الكبرى',
    },
    footprint: { w: 4.2, d: 4.2, h: 3.0 },
    maxHp: 380,
    buildTimeSeconds: 11,
    visionRadius: 72,
    productionBonus: { food: 9, gold: 1, cloth: 2 },
  },
  livestock_ranch: {
    labelAr: 'مراح المواشي والقطن (Ranch & Cotton)',
    code: 'BLK_RNCH_10',
    categoryAr: 'اقتصادي وتجاري',
    requiredUrbanTier: 1,
    urbanPoints: 28,
    cost: { wood: 45, food: 25, stone: 10 },
    upgradeCosts: {
      2: { wood: 70, food: 45, gold: 25 },
      3: { wood: 115, stone: 50, gold: 55 },
    },
    tierNamesAr: {
      1: 'المستوى 1: حظيرة أغنام وماعز وحقل قطن ومغزل صوف',
      2: 'المستوى 2: مراح الإبل والضأن ومعمل حلج القطن والنسيج',
      3: 'المستوى 3: دار الطراز السلطانية ومراعي القماش والكتان والحرير',
    },
    footprint: { w: 4.4, d: 4.4, h: 3.1 },
    maxHp: 410,
    buildTimeSeconds: 11,
    visionRadius: 72,
    productionBonus: { cloth: 10, food: 5, gold: 2 },
  },
  horse_stable: {
    labelAr: 'مربط الخيول والترويض (Horse Stables)',
    code: 'BLK_STBL_13',
    categoryAr: 'عسكري ودفاعي',
    requiredUrbanTier: 1,
    urbanPoints: 30,
    cost: { wood: 55, food: 30, cloth: 20, stone: 15 },
    upgradeCosts: {
      2: { wood: 85, food: 50, cloth: 35, gold: 30 },
      3: { wood: 135, stone: 65, cloth: 60, gold: 65 },
    },
    tierNamesAr: {
      1: 'المستوى 1: حظيرة ترويض الخيول البرية ومربط الأفراس',
      2: 'المستوى 2: إسطبل الخيول العربية الأصيلة وميدان الفروسية',
      3: 'المستوى 3: المربط السلطاني للجياد المدرعة وفرسان الصاعقة',
    },
    footprint: { w: 4.6, d: 4.6, h: 3.4 },
    maxHp: 480,
    buildTimeSeconds: 12,
    visionRadius: 90,
    productionBonus: { horses: 7, gold: 3 },
  },
  bedouin_tent: {
    labelAr: 'خيام ومضارب بدوية (Bedouin Tents)',
    code: 'BLK_BDWN_11',
    categoryAr: 'سكني ومدني',
    requiredUrbanTier: 1,
    urbanPoints: 24,
    cost: { wood: 25, cloth: 45 },
    upgradeCosts: {
      2: { wood: 45, cloth: 75, gold: 20 },
      3: { wood: 75, cloth: 120, gold: 45 },
    },
    tierNamesAr: {
      1: 'المستوى 1: بيت شعر بدوي (منسوج من الصوف وشعر الماعز والسدو)',
      2: 'المستوى 2: مضرب الشيوخ والضيافة المزدوج بنقوش السدو ونار القهوة',
      3: 'المستوى 3: سرادق البادية السلطاني ومضرب القوافل والفرسان الكبير',
    },
    footprint: { w: 3.8, d: 3.8, h: 3.2 },
    maxHp: 360,
    buildTimeSeconds: 9,
    visionRadius: 74,
    productionBonus: { cloth: 4, food: 4, gold: 3 },
  },
  war_tent: {
    labelAr: 'خيام وسرادقات حربية (War Tents)',
    code: 'BLK_WTNT_12',
    categoryAr: 'عسكري ودفاعي',
    requiredUrbanTier: 1,
    urbanPoints: 22,
    cost: { wood: 55, cloth: 65, gold: 30 },
    upgradeCosts: {
      2: { wood: 85, cloth: 105, gold: 60 },
      3: { wood: 135, cloth: 165, gold: 115 },
    },
    tierNamesAr: {
      1: 'المستوى 1: خيمة الجند والسلاح الميدانية (مخيم الرماح والدروع)',
      2: 'المستوى 2: فسطاط الفرسان وخيمة أركان الحرب التكتيكية',
      3: 'المستوى 3: السرادق الحربي السلطاني وخيمة الحصار العظمى',
    },
    footprint: { w: 4.3, d: 4.3, h: 4.2 },
    maxHp: 580,
    buildTimeSeconds: 12,
    visionRadius: 96,
    productionBonus: { gold: 3 },
  },
  market: {
    labelAr: 'سوق تجاري (Market)',
    code: 'BLK_MRKT_02',
    categoryAr: 'اقتصادي وتجاري',
    requiredUrbanTier: 2,
    urbanPoints: 34,
    cost: { wood: 65, stone: 40, gold: 30 },
    upgradeCosts: {
      2: { wood: 95, stone: 75, gold: 65 },
      3: { wood: 150, stone: 130, gold: 120 },
    },
    tierNamesAr: {
      1: 'المستوى 1: سوق مظلات تجارية',
      2: 'المستوى 2: خان القوافل والمستودعات',
      3: 'المستوى 3: البازار الكبير ومركز التجارة',
    },
    footprint: { w: 4.4, d: 4.4, h: 3.6 },
    maxHp: 520,
    buildTimeSeconds: 16,
    visionRadius: 85,
    productionBonus: { gold: 5, food: 3 },
  },
  temple: {
    labelAr: 'صرح ثقافي (Temple)',
    code: 'BLK_TMPL_03',
    categoryAr: 'ثقافي وديني',
    requiredUrbanTier: 3,
    urbanPoints: 48,
    cost: { wood: 90, stone: 120, gold: 75 },
    upgradeCosts: {
      2: { wood: 130, stone: 170, gold: 110 },
      3: { wood: 200, stone: 260, gold: 180 },
    },
    tierNamesAr: {
      1: 'المستوى 1: معبد / مصلى محلي',
      2: 'المستوى 2: صرح معماري ببرج/مئذنة',
      3: 'المستوى 3: الصرح الحضاري الأعظم',
    },
    footprint: { w: 4.8, d: 4.8, h: 6.8 },
    maxHp: 780,
    buildTimeSeconds: 22,
    visionRadius: 96,
    productionBonus: { gold: 6 },
  },
  keep: {
    labelAr: 'القلعة الرئيسية (Keep)',
    code: 'BLK_KEEP_04',
    categoryAr: 'عسكري ودفاعي',
    requiredUrbanTier: 3,
    urbanPoints: 40,
    cost: { wood: 150, stone: 200, gold: 100 },
    upgradeCosts: {
      2: { wood: 180, stone: 240, gold: 140 },
      3: { wood: 260, stone: 380, gold: 240 },
    },
    tierNamesAr: {
      1: 'المستوى 1: حصن أولي',
      2: 'المستوى 2: قلعة حجرية محصنة',
      3: 'المستوى 3: القلعة الملكية العظمى',
    },
    footprint: { w: 6, d: 6, h: 7 },
    maxHp: 1200,
    buildTimeSeconds: 26,
    visionRadius: 142,
    productionBonus: { food: 3, gold: 3 },
  },
  barracks: {
    labelAr: 'ثكنة الجنود (Barracks)',
    code: 'BLK_BRKS_05',
    categoryAr: 'عسكري ودفاعي',
    requiredUrbanTier: 2,
    urbanPoints: 18,
    cost: { wood: 100, stone: 60 },
    upgradeCosts: {
      2: { wood: 120, stone: 100, gold: 60 },
      3: { wood: 180, stone: 180, gold: 120 },
    },
    tierNamesAr: {
      1: 'المستوى 1: ساحة تدريب أولية',
      2: 'المستوى 2: ثكنة المشاة المدرعين',
      3: 'المستوى 3: أكاديمية الفرسان الملكية',
    },
    footprint: { w: 4.5, d: 4.5, h: 3.8 },
    maxHp: 650,
    buildTimeSeconds: 18,
    visionRadius: 96,
  },
  lumber_camp: {
    labelAr: 'معسكر الأخشاب (Lumber)',
    code: 'BLK_LMBR_06',
    categoryAr: 'اقتصادي وتجاري',
    requiredUrbanTier: 1,
    urbanPoints: 12,
    cost: { wood: 50, stone: 20 },
    upgradeCosts: {
      2: { wood: 80, stone: 50, gold: 30 },
      3: { wood: 130, stone: 100, gold: 70 },
    },
    tierNamesAr: {
      1: 'المستوى 1: مخيم حطابين',
      2: 'المستوى 2: منشرة آلية مزدوجة',
      3: 'المستوى 3: مصنع الأخشاب الإمبراطوري',
    },
    footprint: { w: 3.5, d: 3.5, h: 2.8 },
    maxHp: 400,
    buildTimeSeconds: 13,
    visionRadius: 76,
    productionBonus: { wood: 5 },
  },
  quarry: {
    labelAr: 'مقلع الحجارة (Quarry)',
    code: 'BLK_QRRY_07',
    categoryAr: 'اقتصادي وتجاري',
    requiredUrbanTier: 1,
    urbanPoints: 14,
    cost: { wood: 70, stone: 30 },
    upgradeCosts: {
      2: { wood: 100, stone: 70, gold: 40 },
      3: { wood: 160, stone: 140, gold: 90 },
    },
    tierNamesAr: {
      1: 'المستوى 1: حفرة تنقيب سطحية',
      2: 'المستوى 2: مقلع برافعات ثقيلة',
      3: 'المستوى 3: منجم الحجر والذهب العميق',
    },
    footprint: { w: 4, d: 4, h: 2.6 },
    maxHp: 450,
    buildTimeSeconds: 14,
    visionRadius: 76,
    productionBonus: { stone: 4, gold: 2 },
  },
  watchtower: {
    labelAr: 'برج المراقبة (Tower)',
    code: 'BLK_TOWR_08',
    categoryAr: 'عسكري ودفاعي',
    requiredUrbanTier: 2,
    urbanPoints: 15,
    cost: { wood: 60, stone: 90 },
    upgradeCosts: {
      2: { wood: 90, stone: 140, gold: 50 },
      3: { wood: 140, stone: 220, gold: 110 },
    },
    tierNamesAr: {
      1: 'المستوى 1: برج استطلاع أولي',
      2: 'المستوى 2: برج دفاعي حجري',
      3: 'المستوى 3: برج الحصار المدرع',
    },
    footprint: { w: 2.4, d: 2.4, h: 8.5 },
    maxHp: 500,
    buildTimeSeconds: 15,
    visionRadius: 195,
  },
  stone_wall: {
    labelAr: 'سور حجري محصّن (Stone Wall)',
    code: 'BLK_WALL_14',
    categoryAr: 'عسكري ودفاعي',
    requiredUrbanTier: 1,
    urbanPoints: 6,
    cost: { stone: 22, wood: 8 },
    upgradeCosts: {
      2: { stone: 38, wood: 14 },
      3: { stone: 65, wood: 20, gold: 15 },
    },
    tierNamesAr: {
      1: 'المستوى 1: سور حجري مترابط بمتاريس دفاعية',
      2: 'المستوى 2: سور مزدوج السماكة بشرفات رمي السهام',
      3: 'المستوى 3: سور القلعة العظيم المصفّح بالجرانيت',
    },
    footprint: { w: 3.6, d: 1.5, h: 4.2 },
    maxHp: 980,
    buildTimeSeconds: 6,
    visionRadius: 88,
  },
  gatehouse: {
    labelAr: 'بوابة الحصن المحصّنة (Gatehouse)',
    code: 'BLK_GATE_15',
    categoryAr: 'عسكري ودفاعي',
    requiredUrbanTier: 1,
    urbanPoints: 18,
    cost: { stone: 65, wood: 45, gold: 25 },
    upgradeCosts: {
      2: { stone: 105, wood: 70, gold: 45 },
      3: { stone: 170, wood: 110, gold: 90 },
    },
    tierNamesAr: {
      1: 'المستوى 1: بوابة حجرية ببرجين ومزلاج حديدي',
      2: 'المستوى 2: بوابة محصنة بمزاغل رمي السهام والزيت المغلي',
      3: 'المستوى 3: البوابة السلطانية العظمى المصفّحة بالفولاذ',
    },
    footprint: { w: 4.8, d: 2.8, h: 6.2 },
    maxHp: 1480,
    buildTimeSeconds: 12,
    visionRadius: 132,
  },
  moat_trench: {
    labelAr: 'خندق دفاعي وأوتاد (Moat & Stakes)',
    code: 'BLK_MOAT_16',
    categoryAr: 'عسكري ودفاعي',
    requiredUrbanTier: 1,
    urbanPoints: 5,
    cost: { wood: 18, stone: 14 },
    upgradeCosts: {
      2: { wood: 28, stone: 24 },
      3: { wood: 45, stone: 42, gold: 15 },
    },
    tierNamesAr: {
      1: 'المستوى 1: خندق محفور بأوتاد خشبية حادة (-58% سرعة العدو)',
      2: 'المستوى 2: خندق مائي عميق بحاجز شائك وممر حلفاء',
      3: 'المستوى 3: خندق قلعة مصفّح بالحجر وأوتاد فولاذية قاتلة',
    },
    footprint: { w: 3.6, d: 2.4, h: 1.1 },
    maxHp: 620,
    buildTimeSeconds: 5,
    visionRadius: 56,
  },
  siege_workshop: {
    labelAr: 'ورشة آلات الحصار (Siege Workshop)',
    code: 'BLK_SIEG_17',
    categoryAr: 'عسكري ودفاعي',
    requiredUrbanTier: 2,
    urbanPoints: 26,
    cost: { wood: 110, stone: 70, gold: 55 },
    upgradeCosts: {
      2: { wood: 155, stone: 110, gold: 95 },
      3: { wood: 225, stone: 175, gold: 155 },
    },
    tierNamesAr: {
      1: 'المستوى 1: ساحة نجارة كبش النطاح والسلالم',
      2: 'المستوى 2: دار صناعة المجانيق الثقيلة وقذائف النفط',
      3: 'المستوى 3: ترسانة الحصار السلطانية العظمى',
    },
    footprint: { w: 4.8, d: 4.6, h: 4.0 },
    maxHp: 740,
    buildTimeSeconds: 18,
    visionRadius: 92,
  },
};

export type UnitSkillIconKind =
  | 'shield_wall'
  | 'cleave_sword'
  | 'garrison_guard'
  | 'pike_phalanx'
  | 'charge_breaker'
  | 'gate_sentinel'
  | 'fire_volley'
  | 'eagle_eye'
  | 'skirmish_step'
  | 'lance_charge'
  | 'barded_armor'
  | 'flanking_raid'
  | 'royal_banner'
  | 'imperial_aegis'
  | 'war_rally'
  | 'scaffold_craft'
  | 'master_harvest'
  | 'fort_repair';

export interface UnitSkillSpec {
  id: string;
  nameAr: string;
  typeAr: 'مهارة هجومية' | 'مهارة دفاعية' | 'مهارة تكتيكية' | 'قدرة قيادية' | 'مهارة هندسية';
  bonusBadgeAr: string;
  descAr: string;
  iconKind: UnitSkillIconKind;
}

export interface UnitSpec {
  labelAr: string;
  shortAr: string;
  roleAr: string;
  summaryAr: string;
  code: string;
  requiredUrbanTier: UrbanizationTier;
  cost: Partial<PlayerResources>;
  speed: number;
  maxHp: number;
  attack: number;
  defense: number;
  rangeMeters: number;
  visionRadius: number;
  trainingTimeSeconds: number;
  preferredCamps: StructureKind[];
  skills: [UnitSkillSpec, UnitSkillSpec, UnitSkillSpec];
}

export const UNIT_SPECS: Record<UnitKind, UnitSpec> = {
  infantry: {
    labelAr: 'مشاة السيوف والدروع (Swordsman)',
    shortAr: 'مشاة الدروع',
    roleAr: 'خط دفاع أول واقتحام',
    summaryAr:
      'جنود مشاة مدرعون بالحديد والزرد مع ترس المملكة الطويل وسيف فولاذي قاطع، يشكلون العمود الفقري لحامية الحصن.',
    code: 'UNT_INF_02',
    requiredUrbanTier: 1,
    cost: { food: 45, gold: 20, cloth: 10 },
    speed: 6.4,
    maxHp: 150,
    attack: 24,
    defense: 22,
    rangeMeters: 1.8,
    visionRadius: 72,
    trainingTimeSeconds: 4,
    preferredCamps: ['barracks', 'war_tent', 'keep'],
    skills: [
      {
        id: 'shield_wall',
        nameAr: 'تشكيل جدار التروس الفولاذي',
        typeAr: 'مهارة دفاعية',
        bonusBadgeAr: '-35% ضرر السهام',
        descAr: 'يرفع التروس المتراصة لصد وابل السهام وتقليل الضرر المتلقى في خطوط المواجهة.',
        iconKind: 'shield_wall',
      },
      {
        id: 'cleave_sword',
        nameAr: 'ضربة السيف الدمشقي القاطع',
        typeAr: 'مهارة هجومية',
        bonusBadgeAr: '+24 هجوم اشتباك',
        descAr: 'ضربة سيف مزدوجة تخترق الدروع الخفيفة وتحدث ضرراً واسعاً في صفوف المشاة.',
        iconKind: 'cleave_sword',
      },
      {
        id: 'garrison_guard',
        nameAr: 'انضباط حرس الحواضر',
        typeAr: 'مهارة تكتيكية',
        bonusBadgeAr: '+15% أمن وسعادة',
        descAr: 'يسير دوريات منظمة حول البيوت والأسواق لرفع مؤشر الأمان وازدهار الأهالي.',
        iconKind: 'garrison_guard',
      },
    ],
  },
  spearman: {
    labelAr: 'حرس الرماح الطويلة (Pikeman)',
    shortAr: 'حرس الرماح',
    roleAr: 'مضاد الفرسان وحارس البوابات',
    summaryAr:
      'فيلق مسلح بالرماح الطويلة والمطارد الفولاذية، متخصص في تحطيم هجمات الخيالة وحراسة المضايق والجسور.',
    code: 'UNT_SPR_04',
    requiredUrbanTier: 1,
    cost: { food: 40, wood: 25, cloth: 10 },
    speed: 6.0,
    maxHp: 165,
    attack: 21,
    defense: 26,
    rangeMeters: 3.2,
    visionRadius: 76,
    trainingTimeSeconds: 4,
    preferredCamps: ['barracks', 'war_tent', 'keep'],
    skills: [
      {
        id: 'pike_phalanx',
        nameAr: 'غابة الرماح الشائكة (Phalanx)',
        typeAr: 'مهارة هجومية',
        bonusBadgeAr: '300% ضد الخيالة',
        descAr: 'يثبت الرماح الطويلة في الأرض ليضاعف الضرر ثلاث مرات ضد أي فارس أو جواد مندفع.',
        iconKind: 'pike_phalanx',
      },
      {
        id: 'charge_breaker',
        nameAr: 'كسر جموح الفرسان',
        typeAr: 'مهارة دفاعية',
        bonusBadgeAr: '-60% سرعة العدو',
        descAr: 'يوقف صدمة الخيول المدرعة عند الاصطدام ويمنعها من اختراق صفوف الرماة الخلفية.',
        iconKind: 'charge_breaker',
      },
      {
        id: 'gate_sentinel',
        nameAr: 'ثبات حراس البوابات',
        typeAr: 'مهارة تكتيكية',
        bonusBadgeAr: '+30% دفاع بالمضايق',
        descAr: 'يكتسب صلابة دفاعية إضافية عند التمركز أمام بوابات القلعة وأبراج المراقبة.',
        iconKind: 'gate_sentinel',
      },
    ],
  },
  archer: {
    labelAr: 'رماة القسي والسهام الحارقة (Archer)',
    shortAr: 'رماة السهام',
    roleAr: 'قصف بعيد المدى وسهام نارية',
    summaryAr:
      'رماة مهرة بالقسي المركبة والسهام المشتعلة، يمطرون الأعداء من مسافة آمنة ويشعلون الخيام والسقالات.',
    code: 'UNT_ARC_05',
    requiredUrbanTier: 2,
    cost: { food: 45, wood: 30, gold: 15, cloth: 10 },
    speed: 7.2,
    maxHp: 110,
    attack: 28,
    defense: 12,
    rangeMeters: 22.0,
    visionRadius: 92,
    trainingTimeSeconds: 5,
    preferredCamps: ['barracks', 'war_tent', 'watchtower'],
    skills: [
      {
        id: 'fire_volley',
        nameAr: 'وابل السهام المشتعلة بالنفط',
        typeAr: 'مهارة هجومية',
        bonusBadgeAr: '+35% ضرر حارق',
        descAr: 'يطلق رشقات من السهام النارية بعيدة المدى التي تلحق ضرراً مستمراً بالجنود والمباني.',
        iconKind: 'fire_volley',
      },
      {
        id: 'eagle_eye',
        nameAr: 'عين الصقر القناصة',
        typeAr: 'مهارة تكتيكية',
        bonusBadgeAr: 'مدى 22 متر',
        descAr: 'دقة تصويب عالية تمنحه مدى رماية واسعاً خاصة عند التمركز قرب الأبراج والمرتفعات.',
        iconKind: 'eagle_eye',
      },
      {
        id: 'skirmish_step',
        nameAr: 'خفة الكر والفر الميدانية',
        typeAr: 'مهارة دفاعية',
        bonusBadgeAr: '+15% سرعة مناورة',
        descAr: 'خفة حركة تتيح له الرماية والتراجع السريع قبل وصول مشاة العدو الثقيلة.',
        iconKind: 'skirmish_step',
      },
    ],
  },
  knight: {
    labelAr: 'فارس ثقيل مدرع (Royal Knight)',
    shortAr: 'فارس مدرع',
    roleAr: 'خيالة صاعقة سريعة واختراق',
    summaryAr:
      'فارس نبيل يمتطي جواداً عربياً أصيلاً مروضاً ومصفحاً، يجمع بين السرعة الخاطفة وقوة الصدمة الساحقة.',
    code: 'UNT_KNT_03',
    requiredUrbanTier: 2,
    cost: { food: 70, gold: 55, cloth: 15, horses: 15 },
    speed: 10.5,
    maxHp: 230,
    attack: 42,
    defense: 34,
    rangeMeters: 2.2,
    visionRadius: 104,
    trainingTimeSeconds: 6,
    preferredCamps: ['horse_stable', 'war_tent', 'barracks'],
    skills: [
      {
        id: 'lance_charge',
        nameAr: 'صدمة الرمح السلطاني الخاطفة',
        typeAr: 'مهارة هجومية',
        bonusBadgeAr: '+42 هجوم صدمة',
        descAr: 'اندفاعة فروسية صاعقة بالرمح الطويل تضاعف قوة الضربة الأولى عند اقتحام الصفوف.',
        iconKind: 'lance_charge',
      },
      {
        id: 'barded_armor',
        nameAr: 'تدريع الجواد الفولاذي (Barding)',
        typeAr: 'مهارة دفاعية',
        bonusBadgeAr: '230 نقطة صحة',
        descAr: 'كسوة درع معدني وقماش مطرز تحمي الفارس والجواد من السهام وضربات السيوف.',
        iconKind: 'barded_armor',
      },
      {
        id: 'flanking_raid',
        nameAr: 'غارة الالتفاف والخيول الأصيلة',
        typeAr: 'مهارة تكتيكية',
        bonusBadgeAr: '+8%..24% سرعة إسطبل',
        descAr: 'يكتسب سرعة إضافية من كل مستوى لمربط الخيول للالتفاف حول جيش العدو بسرعة فائقة.',
        iconKind: 'flanking_raid',
      },
    ],
  },
  commander: {
    labelAr: 'القائد الملكي وحامل الراية (Warlord)',
    shortAr: 'القائد الملكي',
    roleAr: 'قيادة عليا ورفع معنويات الجيش',
    summaryAr:
      'قائد الجيوش الأعلى على جواد ملكي أبيض بتاج مذهب وراية المملكة الخفاقة، يلهم الفرسان والجنود في المعركة.',
    code: 'UNT_CMD_00',
    requiredUrbanTier: 3,
    cost: { food: 100, gold: 100, cloth: 30, horses: 25 },
    speed: 11.2,
    maxHp: 500,
    attack: 58,
    defense: 48,
    rangeMeters: 2.5,
    visionRadius: 128,
    trainingTimeSeconds: 7,
    preferredCamps: ['keep', 'war_tent', 'horse_stable', 'barracks'],
    skills: [
      {
        id: 'royal_banner',
        nameAr: 'هالة الراية السلطانية الخفاقة',
        typeAr: 'قدرة قيادية',
        bonusBadgeAr: '+25% قوة للفيالق',
        descAr: 'يرفع راية المملكة في الميدان فيزيد من حماسة وقوة هجوم ودفاع جميع الجنود المحيطين به.',
        iconKind: 'royal_banner',
      },
      {
        id: 'imperial_aegis',
        nameAr: 'درع الحرس الإمبراطوري المذهب',
        typeAr: 'مهارة دفاعية',
        bonusBadgeAr: '500 نقطة صحة',
        descAr: 'تدريع ملكي فائق الصلابة يجعله صامداً في قلب المعارك الكبرى والحصارات الطويلة.',
        iconKind: 'imperial_aegis',
      },
      {
        id: 'war_rally',
        nameAr: 'نداء النفير وحشد الطليعة',
        typeAr: 'قدرة قيادية',
        bonusBadgeAr: '+15% سرعة الفيلق',
        descAr: 'ينظم صفوف الفرسان والمشاة حوله ويوجههم تلقائياً لحماية حدود المملكة الاستراتيجية.',
        iconKind: 'war_rally',
      },
    ],
  },
  worker: {
    labelAr: 'عامل ومهندس ميداني (Engineer)',
    shortAr: 'عامل ومهندس',
    roleAr: 'تشييد الحصون وحصاد وترويض',
    summaryAr:
      'عماد الاقتصاد والعمران: يرفع سقالات البناء، يحصد الموارد الستة، ويروّض الخيول البرية في المراعي.',
    code: 'UNT_WRK_01',
    requiredUrbanTier: 1,
    cost: { food: 40, wood: 10 },
    speed: 7.5,
    maxHp: 90,
    attack: 8,
    defense: 8,
    rangeMeters: 1.5,
    visionRadius: 62,
    trainingTimeSeconds: 3,
    preferredCamps: ['keep', 'barracks', 'war_tent'],
    skills: [
      {
        id: 'scaffold_craft',
        nameAr: 'هندسة السقالات والتشييد السريع',
        typeAr: 'مهارة هندسية',
        bonusBadgeAr: '+65% سرعة بناء',
        descAr: 'ينصب الهياكل الخشبية والسقالات ويرفع سرعة إتمام المباني وتطويرها عند التعاون.',
        iconKind: 'scaffold_craft',
      },
      {
        id: 'master_harvest',
        nameAr: 'خبير الغلال وترويض الجياد',
        typeAr: 'مهارة هندسية',
        bonusBadgeAr: '+15%..45% عائد المعسكر',
        descAr: 'يحصد الأخشاب والحجر والذهب والقطن ويروّض الخيول البرية بعائد مضاعف قرب المعسكرات.',
        iconKind: 'master_harvest',
      },
      {
        id: 'fort_repair',
        nameAr: 'إمداد المعسكرات وترميم القلاع',
        typeAr: 'مهارة تكتيكية',
        bonusBadgeAr: 'إمداد مستمر',
        descAr: 'يتنقل تلقائياً بين الحقول والمخازن لضمان تدفق المؤن والعتاد لثكنات الجيش.',
        iconKind: 'fort_repair',
      },
    ],
  },
  battering_ram: {
    labelAr: 'كبش النطاح المدرّع (Battering Ram)',
    shortAr: 'كبش النطاح',
    roleAr: 'تحطيم البوابات والأسوار الحجرية',
    summaryAr:
      'آلة حصار مغطاة بسقف خشبي مصفّح بالجلود المبللة تقاوم سهام الأبراج وتحطم البوابات والأسوار بضربات ساحقة.',
    code: 'UNT_RAM_07',
    requiredUrbanTier: 2,
    cost: { wood: 115, stone: 25, gold: 55 },
    speed: 3.4,
    maxHp: 380,
    attack: 48,
    defense: 58,
    rangeMeters: 2.3,
    visionRadius: 68,
    trainingTimeSeconds: 9,
    preferredCamps: ['siege_workshop', 'war_tent', 'keep'],
    skills: [
      {
        id: 'gate_breaker',
        nameAr: 'دكّ البوابات والأسوار الحجرية',
        typeAr: 'مهارة هجومية',
        bonusBadgeAr: 'x3.6 ضرر ضد التحصينات',
        descAr: 'يسدد ضربات جذع حديدي ثقيل تضاعف الضرر 3.6 مرة ضد الأسوار والبوابات والقلاع.',
        iconKind: 'gate_sentinel',
      },
      {
        id: 'iron_roof',
        nameAr: 'سقف مصفّح مضاد للسهام',
        typeAr: 'مهارة دفاعية',
        bonusBadgeAr: '-55% ضرر السهام',
        descAr: 'تحمي المظلة المصفّحة طاقم الكبش من رماة الأبراج والبوابات أثناء الاقتراب.',
        iconKind: 'shield_wall',
      },
      {
        id: 'breach_push',
        nameAr: 'اقتحام الثغرة وفتح الطريق',
        typeAr: 'مهارة هندسية',
        bonusBadgeAr: 'ثبات عالٍ',
        descAr: 'يشق ثغرات في خطوط السور ليتدفق الفرسان والمشاة إلى قلب قلعة الخصم.',
        iconKind: 'fort_repair',
      },
    ],
  },
  trebuchet: {
    labelAr: 'المنجنيق الثقيل (Heavy Trebuchet)',
    shortAr: 'منجنيق ثقيل',
    roleAr: 'قصف بعيد المدى للأسوار والأبراج',
    summaryAr:
      'أعظم آلات القصف في العصور الوسطى: يقذف صخوراً مشتعلة من مسافة 34 متراً تتجاوز مدى الأبراج وتهدم التحصينات.',
    code: 'UNT_TRB_08',
    requiredUrbanTier: 2,
    cost: { wood: 150, stone: 85, gold: 105 },
    speed: 2.7,
    maxHp: 240,
    attack: 62,
    defense: 14,
    rangeMeters: 34.0,
    visionRadius: 118,
    trainingTimeSeconds: 12,
    preferredCamps: ['siege_workshop', 'keep'],
    skills: [
      {
        id: 'flaming_boulder',
        nameAr: 'قذائف الصخر المشتعل بعيدة المدى',
        typeAr: 'مهارة هجومية',
        bonusBadgeAr: 'مدى 34م · x3.2 هدم',
        descAr: 'يدكّ الأبراج والأسوار من خارج مدى السهام مع ضرر انفجاري يصيب المدافعين المجاورين.',
        iconKind: 'fire_volley',
      },
      {
        id: 'high_arc_siege',
        nameAr: 'رماية قوسية تتخطى الأسوار',
        typeAr: 'مهارة تكتيكية',
        bonusBadgeAr: 'قصف من المرتفعات',
        descAr: 'يزداد مداه وضرره عند نصبه على التلال والمرتفعات المشرفة على الحصون.',
        iconKind: 'eagle_eye',
      },
      {
        id: 'counterweight_crew',
        nameAr: 'ثقل موازن وهندسة الحصار',
        typeAr: 'مهارة هندسية',
        bonusBadgeAr: 'يحتاج حراسة الفرسان',
        descAr: 'بطيء الحركة وعرضة لغارات الفرسان؛ احمه بالرماح والمشاة أثناء القصف.',
        iconKind: 'scaffold_craft',
      },
    ],
  },
};

export function getClimateVisionMultiplier(climate: ClimateKind = 'temperate_clear'): number {
  switch (climate) {
    case 'desert_sandstorm':
      return 0.72;
    case 'northern_blizzard':
      return 0.74;
    case 'monsoon_rain':
      return 0.86;
    case 'temperate_clear':
    default:
      return 1.0;
  }
}

export function getStructureVisionRadius(
  kind: StructureKind,
  level: StructureLevel = 1,
  climate: ClimateKind = 'temperate_clear'
): number {
  const base = STRUCTURE_SPECS[kind]?.visionRadius ?? 72;
  const levelBonus =
    kind === 'watchtower'
      ? (level - 1) * 38
      : kind === 'keep'
        ? (level - 1) * 26
        : (level - 1) * 12;
  return Math.round((base + levelBonus) * getClimateVisionMultiplier(climate));
}

export function getUnitVisionRadius(
  kind: UnitKind,
  climate: ClimateKind = 'temperate_clear'
): number {
  const base = UNIT_SPECS[kind]?.visionRadius ?? 70;
  return Math.round(base * getClimateVisionMultiplier(climate));
}

export interface UrbanizationTierSpec {
  tier: UrbanizationTier;
  nameAr: string;
  minScore: number;
  nextScore: number | null;
  farmingBonusPct: number;
  unitHpBonusPct: number;
  unlocksSummaryAr: string;
  pillarsDescAr: string;
}

export const URBANIZATION_TIERS: Record<UrbanizationTier, UrbanizationTierSpec> = {
  1: {
    tier: 1,
    nameAr: 'المرتبة 1: مستوطنة ريفية وزراعية',
    minScore: 0,
    nextScore: 120,
    farmingBonusPct: 0,
    unitHpBonusPct: 0,
    unlocksSummaryAr:
      'البيوت، الخيام البدوية والحربية، المزارع، مراح المواشي، مربط الخيول، المعسكرات + العمال ومشاة الدروع وحرس الرماح',
    pillarsDescAr:
      'ابنِ البيوت والخيام المتكيفة مع البيئة والمزارع المجاورة لها للوصول إلى 120 نقطة تحضر وفتح الثكنات والأسواق والرماة والفرسان.',
  },
  2: {
    tier: 2,
    nameAr: 'المرتبة 2: بلدة تجارية وعسكرية',
    minScore: 120,
    nextScore: 280,
    farmingBonusPct: 25,
    unitHpBonusPct: 10,
    unlocksSummaryAr:
      'الأسواق التجارية، ثكنات الجنود، أبراج المراقبة، تطوير المباني Lv.2 + تجنيد رماة السهام والفرسان الثقيلة',
    pillarsDescAr:
      '+25% غلة المزارع والمراعي و+10% صحة الجيوش. طوّر البيوت والأسواق للوصول إلى 280 نقطة تحضر.',
  },
  3: {
    tier: 3,
    nameAr: 'المرتبة 3: حاضرة إقليمية كبرى',
    minScore: 280,
    nextScore: 480,
    farmingBonusPct: 50,
    unitHpBonusPct: 20,
    unlocksSummaryAr:
      'الصروح الحضارية، تأسيس القلاع الجديدة، تطوير المباني Lv.3 + تجنيد القائد الملكي الأعظم',
    pillarsDescAr:
      '+50% غلة المزارع والمراعي و+20% صحة الجيوش، وإمكانية تأسيس قلاع جديدة وتجنيد القائد الملكي وحامل الراية.',
  },
  4: {
    tier: 4,
    nameAr: 'المرتبة 4: عاصمة إمبراطورية عظمى',
    minScore: 480,
    nextScore: null,
    farmingBonusPct: 80,
    unitHpBonusPct: 35,
    unlocksSummaryAr:
      'الذروة الحضارية: +80% إنتاج زراعي، +35% دروع وصحة الجيوش النخبة، وازدهار تجاري شامل',
    pillarsDescAr:
      'حاضرتك بلغت أسمى مراتب التحضر والعمران والزراعة وتقود العالم القاري.',
  },
};

export interface KingdomUrbanizationReport {
  score: number;
  tier: UrbanizationTier;
  tierSpec: UrbanizationTierSpec;
  progressPct: number;
  housingPoints: number;
  farmingPoints: number;
  civicPoints: number;
  environmentalHarmonyBonus: number;
  neighborhoodSynergyBonus: number;
  housesCount: number;
  farmsCount: number;
  farmingMultiplier: number;
  unitHpMultiplier: number;
}

/**
 * Evaluates a player's total Urbanization Score & Civilization Tier.
 * Urbanization is the core foundation for Recruiting, Building/Upgrading, Farming, and Empire growth.
 */
export function evaluateKingdomUrbanization(
  structures: BlockoutStructure[],
  defaultCulture: CultureKind,
  climate: ClimateKind,
  getBiomeFn: (x: number, z: number) => BiomeKind,
  getLocalClimateFn?: (x: number, z: number) => ClimateKind
): KingdomUrbanizationReport {
  let housingPoints = 0;
  let farmingPoints = 0;
  let civicPoints = 0;
  let environmentalHarmonyBonus = 0;
  let neighborhoodSynergyBonus = 0;
  let housesCount = 0;
  let farmsCount = 0;

  const houses = structures.filter(
    (s) => s.kind === 'house' || s.kind === 'bedouin_tent'
  );
  const farms = structures.filter(
    (s) =>
      s.kind === 'farm' ||
      s.kind === 'livestock_ranch' ||
      s.kind === 'horse_stable'
  );
  housesCount = houses.length;
  farmsCount = farms.length;

  for (const st of structures) {
    const spec = STRUCTURE_SPECS[st.kind];
    if (!spec) continue;
    const lvlMult = st.level === 1 ? 1.0 : st.level === 2 ? 1.85 : 3.0;
    const basePts = Math.round(spec.urbanPoints * lvlMult);

    if (st.kind === 'house' || st.kind === 'bedouin_tent') {
      housingPoints += basePts;
    } else if (
      st.kind === 'farm' ||
      st.kind === 'livestock_ranch' ||
      st.kind === 'horse_stable'
    ) {
      farmingPoints += basePts;
    } else {
      civicPoints += basePts;
    }

    const stCulture = st.culture ?? defaultCulture;
    const localClimate = getLocalClimateFn ? getLocalClimateFn(st.x, st.z) : climate;
    const fit = evaluateEnvironmentalFit(
      stCulture,
      getBiomeFn(st.x, st.z),
      localClimate,
      st.level
    );
    if (fit.rating === 'ideal') {
      environmentalHarmonyBonus += Math.round(basePts * 0.45);
    } else if (fit.rating === 'harsh') {
      environmentalHarmonyBonus -= Math.round(basePts * 0.35);
    }
  }

  // Urban Neighborhood Synergy: Farms & Ranches near Houses/Bedouin Tents (within 32m) and Markets/Temples near Houses (within 36m)
  for (const farm of farms) {
    let nearbyHouses = 0;
    for (const h of houses) {
      if (Math.hypot(farm.x - h.x, farm.z - h.z) <= 32) {
        nearbyHouses += 1;
      }
    }
    neighborhoodSynergyBonus += Math.min(3, nearbyHouses) * 12 * farm.level;
  }

  for (const st of structures) {
    if (st.kind === 'market' || st.kind === 'temple') {
      let nearbyHouses = 0;
      for (const h of houses) {
        if (Math.hypot(st.x - h.x, st.z - h.z) <= 36) {
          nearbyHouses += 1;
        }
      }
      neighborhoodSynergyBonus += Math.min(4, nearbyHouses) * 10 * st.level;
    }
  }

  const rawScore =
    housingPoints +
    farmingPoints +
    civicPoints +
    environmentalHarmonyBonus +
    neighborhoodSynergyBonus;
  const score = Math.max(0, Math.round(rawScore));

  let tier: UrbanizationTier = 1;
  if (score >= URBANIZATION_TIERS[4].minScore) tier = 4;
  else if (score >= URBANIZATION_TIERS[3].minScore) tier = 3;
  else if (score >= URBANIZATION_TIERS[2].minScore) tier = 2;

  const tierSpec = URBANIZATION_TIERS[tier];
  const progressPct =
    tierSpec.nextScore === null
      ? 100
      : Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((score - tierSpec.minScore) /
                Math.max(1, tierSpec.nextScore - tierSpec.minScore)) *
                100
            )
          )
        );

  return {
    score,
    tier,
    tierSpec,
    progressPct,
    housingPoints,
    farmingPoints,
    civicPoints,
    environmentalHarmonyBonus,
    neighborhoodSynergyBonus,
    housesCount,
    farmsCount,
    farmingMultiplier: 1 + tierSpec.farmingBonusPct / 100,
    unitHpMultiplier: 1 + tierSpec.unitHpBonusPct / 100,
  };
}

export interface PopulationLifeReport {
  happinessPct: number;
  moodLabelAr: string;
  moodSummaryAr: string;
  prosperityBonusPct: number;
  prosperityMultiplier: number;
  ambientCitizensCount: number;
  farmersCount: number;
  merchantsCount: number;
  scholarsCount: number;
  waterCarriersCount: number;
  patrolGuardsCount: number;
  foodSecurityScore: number;
  housingComfortScore: number;
  marketAccessScore: number;
  spiritualCivicScore: number;
  safetyGuardScore: number;
}

/**
 * Evaluates the daily life, happiness, and bustling activity of the kingdom's population.
 */
export function evaluatePopulationLife(
  structures: BlockoutStructure[],
  units: BlockoutUnit[],
  defaultCulture: CultureKind,
  climate: ClimateKind,
  getBiomeFn: (x: number, z: number) => BiomeKind,
  getLocalClimateFn?: (x: number, z: number) => ClimateKind
): PopulationLifeReport {
  const houses = structures.filter(
    (s) => s.kind === 'house' || s.kind === 'bedouin_tent'
  );
  const farms = structures.filter(
    (s) =>
      s.kind === 'farm' ||
      s.kind === 'livestock_ranch' ||
      s.kind === 'horse_stable'
  );
  const markets = structures.filter((s) => s.kind === 'market');
  const temples = structures.filter((s) => s.kind === 'temple');
  const keeps = structures.filter((s) => s.kind === 'keep');
  const defenseStructs = structures.filter(
    (s) =>
      s.kind === 'watchtower' ||
      s.kind === 'barracks' ||
      s.kind === 'war_tent' ||
      s.kind === 'horse_stable' ||
      s.kind === 'keep'
  );

  // 1. Housing Environmental Comfort (0..100)
  let idealHouses = 0;
  let harshHouses = 0;
  let totalHouseLevels = 0;
  for (const h of houses) {
    totalHouseLevels += h.level;
    const localClimate = getLocalClimateFn ? getLocalClimateFn(h.x, h.z) : climate;
    const fit = evaluateEnvironmentalFit(
      h.culture ?? defaultCulture,
      getBiomeFn(h.x, h.z),
      localClimate,
      h.level
    );
    if (fit.rating === 'ideal') idealHouses += 1;
    else if (fit.rating === 'harsh') harshHouses += 1;
  }
  const housingComfortScore =
    houses.length === 0
      ? 50
      : Math.max(
          15,
          Math.min(
            100,
            Math.round(
              70 +
                (idealHouses / houses.length) * 30 -
                (harshHouses / houses.length) * 45
            )
          )
        );

  // 2. Food & Agricultural Abundance (0..100)
  const totalFarmLevels = farms.reduce((acc, f) => acc + f.level, 0);
  const foodSecurityScore = Math.min(
    100,
    Math.round(
      35 +
        (totalFarmLevels / Math.max(1, houses.length)) * 45 +
        keeps.length * 10
    )
  );

  // 3. Market & Caravan Prosperity (0..100)
  const totalMarketLevels = markets.reduce((acc, m) => acc + m.level, 0);
  const marketAccessScore = Math.min(100, 30 + totalMarketLevels * 35);

  // 4. Spiritual & Cultural Fulfillment (0..100)
  const totalTempleLevels = temples.reduce((acc, t) => acc + t.level, 0);
  const spiritualCivicScore = Math.min(100, 30 + totalTempleLevels * 35);

  // 5. Garrison Security & Town Patrols (0..100) + Royal Commander Presence
  const militaryUnits = units.filter(
    (u) =>
      u.kind === 'infantry' ||
      u.kind === 'spearman' ||
      u.kind === 'archer' ||
      u.kind === 'knight' ||
      u.kind === 'commander'
  );
  const hasCommander = units.some((u) => u.kind === 'commander');
  const safetyGuardScore = Math.min(
    100,
    35 +
      defenseStructs.length * 15 +
      militaryUnits.length * 10 +
      (hasCommander ? 12 : 0)
  );

  const happinessPct = Math.max(
    10,
    Math.min(
      100,
      Math.round(
        housingComfortScore * 0.28 +
          foodSecurityScore * 0.26 +
          marketAccessScore * 0.16 +
          spiritualCivicScore * 0.15 +
          safetyGuardScore * 0.15
      )
    )
  );

  let moodLabelAr = 'حياة مستقرة ونشطة';
  let moodSummaryAr =
    'الأهالي يمارسون أعمالهم اليومية بين البيوت والمزارع والأسواق بانتظام.';
  let prosperityBonusPct = 10;

  if (happinessPct >= 82) {
    moodLabelAr = 'بهجة وازدهار حضاري';
    moodSummaryAr =
      'السكان في قمة السعادة بفضل وفرة المزارع وتكيّف البيوت مع المناخ وازدهار الأسواق (+25% بركة إنتاج).';
    prosperityBonusPct = 25;
  } else if (happinessPct >= 62) {
    moodLabelAr = 'حياة نشطة ومطمئنة';
    moodSummaryAr =
      'حركة دؤوبة للفلاحين والتجار والحراس في أرجاء المدينة (+12% كفاءة إنتاج).';
    prosperityBonusPct = 12;
  } else {
    moodLabelAr = 'إجهاد معيشي ومناخي';
    moodSummaryAr =
      'يحتاج الأهالي إلى بيوت متكيفة مع البيئة ومزارع وأسواق قريبة لرفع سعادتهم.';
    prosperityBonusPct = 0;
  }

  // Count of ambient 2D pixel-art citizens walking around the settlement
  const farmersCount = totalFarmLevels * 2 + Math.ceil(totalHouseLevels * 0.6);
  const merchantsCount = totalMarketLevels * 2 + keeps.length;
  const scholarsCount = totalTempleLevels * 2 + keeps.length;
  const waterCarriersCount = Math.max(1, houses.length + farms.length);
  const ambientCitizensCount =
    farmersCount + merchantsCount + scholarsCount + waterCarriersCount;

  return {
    happinessPct,
    moodLabelAr,
    moodSummaryAr,
    prosperityBonusPct,
    prosperityMultiplier: 1 + prosperityBonusPct / 100,
    ambientCitizensCount,
    farmersCount,
    merchantsCount,
    scholarsCount,
    waterCarriersCount,
    patrolGuardsCount: militaryUnits.length,
    foodSecurityScore,
    housingComfortScore,
    marketAccessScore,
    spiritualCivicScore,
    safetyGuardScore,
  };
}

export interface StructureUpgradeRequirement {
  nextLevel: 2 | 3;
  cost: Partial<PlayerResources>;
  requiredTier: UrbanizationTier;
}

/**
 * Canonical upgrade rules shared between server validation and client UI buttons.
 */
export function getStructureUpgradeRequirement(
  kind: StructureKind,
  currentLevel: StructureLevel
): StructureUpgradeRequirement | null {
  if (currentLevel >= 3) return null;
  const spec = STRUCTURE_SPECS[kind];
  if (!spec) return null;
  const nextLevel = (currentLevel + 1) as 2 | 3;
  const isUrbanDriver =
    kind === 'house' ||
    kind === 'farm' ||
    kind === 'bedouin_tent' ||
    kind === 'livestock_ranch';
  const requiredTier = (isUrbanDriver ? (nextLevel === 3 ? 2 : 1) : nextLevel) as UrbanizationTier;
  return {
    nextLevel,
    cost: spec.upgradeCosts[nextLevel],
    requiredTier,
  };
}

/**
 * Canonical unit training time based on camp level & specialization match.
 * Preferred camps train 15% faster; non-preferred camps train 35% slower.
 */
export function getUnitTrainingDurationSeconds(
  unitKind: UnitKind,
  campKind: StructureKind,
  campLevel: StructureLevel
): { seconds: number; isPreferred: boolean } {
  const spec = UNIT_SPECS[unitKind];
  const isPreferred = spec.preferredCamps.includes(campKind);
  const campLevelMult = campLevel === 3 ? 0.65 : campLevel === 2 ? 0.8 : 1.0;
  const specializationMult = isPreferred ? 0.85 : 1.35;
  const seconds = Math.max(
    1.5,
    Math.round(spec.trainingTimeSeconds * campLevelMult * specializationMult * 10) / 10
  );
  return { seconds, isPreferred };
}

export interface KingdomCapacityReport {
  maxPopulation: number;
  civilianPopulation: number;
  storageCap: number;
  highestMarketLevel: number;
  highestStableLevel: number;
  sellGoldPer100: number;
  buyGoldPer100: number;
}

/**
 * Canonical kingdom housing, realistic medieval urban civilian population (in thousands),
 * warehouse capacity, market rates & cavalry stable level.
 * Structures currently raising Lv.1 scaffolding do not grant capacity until built;
 * structures upgrading from Lv.1->Lv.2 or Lv.2->Lv.3 retain their completed previous level.
 */
export function evaluateKingdomCapacity(
  structures: BlockoutStructure[],
  defaultCulture: CultureKind,
  climate: ClimateKind,
  getBiomeFn: (x: number, z: number) => BiomeKind,
  getLocalClimateFn?: (x: number, z: number) => ClimateKind
): KingdomCapacityReport {
  let maxPopulation = 10;
  let civilianPopulation = 280;
  let storageCap = 1500;
  let highestMarketLevel = 0;
  let highestStableLevel = 0;

  for (const st of structures) {
    const effectiveLevel = st.isConstructing ? st.level - 1 : st.level;
    if (effectiveLevel <= 0) continue;

    const stCulture = st.culture ?? defaultCulture;
    const localClimate = getLocalClimateFn ? getLocalClimateFn(st.x, st.z) : climate;
    const envFit = evaluateEnvironmentalFit(
      stCulture,
      getBiomeFn(st.x, st.z),
      localClimate,
      effectiveLevel as StructureLevel
    );

    if (st.kind === 'keep') {
      maxPopulation += 8 + effectiveLevel * 4;
      civilianPopulation += effectiveLevel === 1 ? 1200 : effectiveLevel === 2 ? 3500 : 8500;
      storageCap += effectiveLevel * 1200;
    } else if (st.kind === 'house') {
      const basePop = effectiveLevel === 1 ? 5 : effectiveLevel === 2 ? 10 : 16;
      maxPopulation += Math.max(2, basePop + envFit.populationDelta);
      const baseCiv = effectiveLevel === 1 ? 650 : effectiveLevel === 2 ? 1650 : 3800;
      civilianPopulation += Math.max(240, baseCiv + envFit.populationDelta * 120);
    } else if (st.kind === 'bedouin_tent') {
      const basePop = effectiveLevel === 1 ? 7 : effectiveLevel === 2 ? 13 : 20;
      maxPopulation += Math.max(3, basePop + envFit.populationDelta);
      const baseCiv = effectiveLevel === 1 ? 420 : effectiveLevel === 2 ? 950 : 2100;
      civilianPopulation += Math.max(180, baseCiv + envFit.populationDelta * 90);
      storageCap += effectiveLevel * 350;
    } else if (st.kind === 'war_tent') {
      const basePop = effectiveLevel === 1 ? 6 : effectiveLevel === 2 ? 10 : 16;
      maxPopulation += basePop;
      civilianPopulation += effectiveLevel * 180;
      storageCap += effectiveLevel * 300;
    } else if (st.kind === 'horse_stable') {
      const basePop = effectiveLevel === 1 ? 6 : effectiveLevel === 2 ? 11 : 18;
      maxPopulation += basePop;
      civilianPopulation += effectiveLevel * 150;
      storageCap += effectiveLevel * 500;
      highestStableLevel = Math.max(highestStableLevel, effectiveLevel);
    } else if (st.kind === 'farm' || st.kind === 'livestock_ranch') {
      civilianPopulation += effectiveLevel === 1 ? 180 : effectiveLevel === 2 ? 420 : 850;
      storageCap += effectiveLevel * 550;
    } else if (st.kind === 'market') {
      civilianPopulation += effectiveLevel === 1 ? 400 : effectiveLevel === 2 ? 900 : 1600;
      storageCap += effectiveLevel * 900;
      highestMarketLevel = Math.max(highestMarketLevel, effectiveLevel);
    } else if (st.kind === 'temple') {
      civilianPopulation += effectiveLevel === 1 ? 350 : effectiveLevel === 2 ? 800 : 1400;
    } else if (st.kind === 'gatehouse') {
      maxPopulation += effectiveLevel * 2;
      civilianPopulation += effectiveLevel * 90;
    } else if (st.kind === 'siege_workshop') {
      maxPopulation += effectiveLevel * 4;
      civilianPopulation += effectiveLevel * 160;
      storageCap += effectiveLevel * 450;
    } else if (st.kind === 'lumber_camp' || st.kind === 'quarry') {
      civilianPopulation += effectiveLevel * 140;
      storageCap += effectiveLevel * 600;
    }
  }

  const sellGoldPer100 =
    highestMarketLevel >= 3
      ? 75
      : highestMarketLevel === 2
        ? 65
        : highestMarketLevel === 1
          ? 55
          : 45;

  const buyGoldPer100 =
    highestMarketLevel >= 3
      ? 88
      : highestMarketLevel === 2
        ? 95
        : highestMarketLevel === 1
          ? 105
          : 115;

  return {
    maxPopulation,
    civilianPopulation,
    storageCap,
    highestMarketLevel,
    highestStableLevel,
    sellGoldPer100,
    buyGoldPer100,
  };
}

export interface StructureDefenseSpec {
  canAttack: boolean;
  rangeMeters: number;
  damage: number;
  cooldownTicks: number;
}

/**
 * Shared defensive arrow volley stats for Watchtowers and Keeps.
 */
export function getStructureDefenseSpec(
  kind: StructureKind,
  level: StructureLevel = 1
): StructureDefenseSpec {
  if (kind === 'watchtower') {
    return {
      canAttack: true,
      rangeMeters: 28 + (level - 1) * 6,
      damage: 20 + (level - 1) * 11,
      cooldownTicks: 22,
    };
  }
  if (kind === 'gatehouse') {
    return {
      canAttack: true,
      rangeMeters: 24 + (level - 1) * 5,
      damage: 18 + (level - 1) * 9,
      cooldownTicks: 24,
    };
  }
  if (kind === 'stone_wall' && level >= 2) {
    return {
      canAttack: true,
      rangeMeters: 18 + (level - 2) * 5,
      damage: 11 + (level - 2) * 7,
      cooldownTicks: 28,
    };
  }
  if (kind === 'keep') {
    return {
      canAttack: true,
      rangeMeters: 32 + (level - 1) * 6,
      damage: 24 + (level - 1) * 12,
      cooldownTicks: 24,
    };
  }
  return {
    canAttack: false,
    rangeMeters: 0,
    damage: 0,
    cooldownTicks: 0,
  };
}

export interface BanditUnitSpec {
  role: BanditRoleKind;
  unitKind: UnitKind;
  labelAr: string;
  shortAr: string;
  weaponAr: string;
  armorAr: string;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  rangeMeters: number;
  ambushMultiplier: number;
  lootCapacity: number;
  stealPerHit: number;
}

/**
 * Dedicated Bandit combat & looting profiles:
 * Individually weaker HP & light armor than royal troops, but faster, stealth-capable,
 * lethal on first-strike forest ambushes (+45%), and able to steal resources.
 */
export const BANDIT_UNIT_SPECS: Record<BanditRoleKind, BanditUnitSpec> = {
  cutthroat: {
    role: 'cutthroat',
    unitKind: 'infantry',
    labelAr: 'سفّاح أحراش (Cutthroat)',
    shortAr: 'سفّاح أحراش',
    weaponAr: 'فأس خشنة وخنجر معقوف',
    armorAr: 'سترة جلدية مهترئة بلا درع ثقيل',
    maxHp: 70,
    attack: 17,
    defense: 6,
    speed: 7.4,
    rangeMeters: 1.9,
    ambushMultiplier: 1.48,
    lootCapacity: 35,
    stealPerHit: 14,
  },
  poacher: {
    role: 'poacher',
    unitKind: 'archer',
    labelAr: 'قنّاص كمين (Poacher)',
    shortAr: 'قنّاص كمين',
    weaponAr: 'قوس صيد خشبي وسهام مسمومة',
    armorAr: 'عباءة غابات مموّهة',
    maxHp: 56,
    attack: 16,
    defense: 4,
    speed: 7.2,
    rangeMeters: 16.5,
    ambushMultiplier: 1.5,
    lootCapacity: 24,
    stealPerHit: 10,
  },
  brigand: {
    role: 'brigand',
    unitKind: 'spearman',
    labelAr: 'قاطع طريق برمح صيد (Brigand)',
    shortAr: 'قاطع طريق',
    weaponAr: 'رمح صيد مسنّن وترس خشبي مشقوق',
    armorAr: 'جلد مقوّى بقطع حديد صدئ',
    maxHp: 76,
    attack: 16,
    defense: 8,
    speed: 7.0,
    rangeMeters: 2.3,
    ambushMultiplier: 1.45,
    lootCapacity: 30,
    stealPerHit: 12,
  },
  raider_horse: {
    role: 'raider_horse',
    unitKind: 'knight',
    labelAr: 'خيّال نهّاب (Highway Raider)',
    shortAr: 'خيّال نهّاب',
    weaponAr: 'سيف منجلي معقوف ورمح خفيف',
    armorAr: 'لثام داكن وفرس نهب سريع بلا تجحيف',
    maxHp: 106,
    attack: 22,
    defense: 9,
    speed: 11.4,
    rangeMeters: 2.2,
    ambushMultiplier: 1.45,
    lootCapacity: 55,
    stealPerHit: 22,
  },
  looter: {
    role: 'looter',
    unitKind: 'worker',
    labelAr: 'نشّال ومُهرّب غنائم (Looter)',
    shortAr: 'نشّال غنائم',
    weaponAr: 'خنجر نهب وحقيبة مسروقات كبيرة',
    armorAr: 'ثياب ممزقة خفيفة للفرار السريع',
    maxHp: 58,
    attack: 10,
    defense: 4,
    speed: 8.3,
    rangeMeters: 1.6,
    ambushMultiplier: 1.25,
    lootCapacity: 65,
    stealPerHit: 24,
  },
};

export const BANDIT_STATE_LABELS_AR: Record<BanditTacticalState, string> = {
  guard_lair: 'يحرس الوكر ومخازن المسروقات',
  ambush_wait: 'متخفٍ في الغابة يترصّد كميناً',
  ambush_strike: 'انقضاض كمين مفاجئ (+45% ضرر)',
  raiding: 'غارة انتهازية لنهب الموارد',
  retreating: 'ينسحب بسرعة نحو الوكر بالغنائم',
};

export const BANDIT_CLAN_OUTFIT_AR: Record<
  BanditCampArchetype,
  { titleAr: string; attireAr: string; cloakHex: string; hoodHex: string; sashHex: string }
> = {
  forest_ambush: {
    titleAr: 'كمائن الغابات والأحراش',
    attireAr: 'عباءات غابات بقلنسوة داكنة ولثام قماشي ممزق',
    cloakHex: '#1f3a29',
    hoodHex: '#15281c',
    sashHex: '#991b1b',
  },
  highway_raiders: {
    titleAr: 'لصوص القوافل والطرق',
    attireAr: 'لثام وعمائم داكنة وأوشحة قرمزية ونحاسية باهتة',
    cloakHex: '#3f2618',
    hoodHex: '#18181b',
    sashHex: '#c2410c',
  },
  mountain_brigands: {
    titleAr: 'متمردو الممرات والمضيق',
    attireAr: 'فراء داكن وجلود خشنة وخوذ حديدية صدئة',
    cloakHex: '#31253c',
    hoodHex: '#1e1b24',
    sashHex: '#be123c',
  },
  ruin_marauders: {
    titleAr: 'نهّابو الأطلال والوديان',
    attireAr: 'أردية رثة فحمية وأقنعة قماشية وحقائب غنائم',
    cloakHex: '#3b1d24',
    hoodHex: '#171717',
    sashHex: '#b45309',
  },
};

export function getBanditRoleForUnitKind(kind: UnitKind): BanditRoleKind {
  switch (kind) {
    case 'archer':
      return 'poacher';
    case 'spearman':
      return 'brigand';
    case 'knight':
    case 'commander':
      return 'raider_horse';
    case 'worker':
      return 'looter';
    case 'infantry':
    default:
      return 'cutthroat';
  }
}

export function getTotalCarriedLoot(loot?: CarriedLoot): number {
  if (!loot) return 0;
  return (loot.gold ?? 0) + (loot.wood ?? 0) + (loot.food ?? 0);
}

export function getUnitEffectiveCombatStats(unit: Pick<BlockoutUnit, 'kind' | 'isBanditUnit' | 'banditRole'>): {
  labelAr: string;
  shortAr: string;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  rangeMeters: number;
  ambushMultiplier: number;
  lootCapacity: number;
  stealPerHit: number;
  weaponAr?: string;
  armorAr?: string;
} {
  if (unit.isBanditUnit) {
    const role = unit.banditRole ?? getBanditRoleForUnitKind(unit.kind);
    const bSpec = BANDIT_UNIT_SPECS[role];
    return {
      labelAr: bSpec.labelAr,
      shortAr: bSpec.shortAr,
      maxHp: bSpec.maxHp,
      attack: bSpec.attack,
      defense: bSpec.defense,
      speed: bSpec.speed,
      rangeMeters: bSpec.rangeMeters,
      ambushMultiplier: bSpec.ambushMultiplier,
      lootCapacity: bSpec.lootCapacity,
      stealPerHit: bSpec.stealPerHit,
      weaponAr: bSpec.weaponAr,
      armorAr: bSpec.armorAr,
    };
  }
  const uSpec = UNIT_SPECS[unit.kind];
  return {
    labelAr: uSpec.labelAr,
    shortAr: uSpec.shortAr,
    maxHp: uSpec.maxHp,
    attack: uSpec.attack,
    defense: uSpec.defense,
    speed: uSpec.speed,
    rangeMeters: uSpec.rangeMeters,
    ambushMultiplier: 1.0,
    lootCapacity: 0,
    stealPerHit: 0,
  };
}


