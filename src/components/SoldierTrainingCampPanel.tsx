import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpCircle,
  Eye,
  Shield,
  Sparkles,
  Swords,
  X,
} from 'lucide-react';
import {
  BannerPatternKind,
  BlockoutStructure,
  BlockoutUnit,
  CULTURE_SPECS,
  CultureKind,
  getStructureUpgradeRequirement,
  getUnitTrainingDurationSeconds,
  normalizeCultureKind,
  PlayerResources,
  STRUCTURE_SPECS,
  StructureKind,
  UNIT_SPECS,
  UnitKind,
  UnitSkillIconKind,
  URBANIZATION_TIERS,
  UrbanizationTier,
} from '../shared/protocol';
import {
  BrassCornerMountSvg,
  ResourceArtworkSvg,
} from './Retro2000sIcons';

export interface QueuedTrainingItem {
  id: string;
  unitKind: UnitKind;
  campId: string;
  durationSec: number;
  elapsedSec: number;
}

export interface SoldierTrainingCampPanelProps {
  selectedCamp: BlockoutStructure;
  allMyStructures: BlockoutStructure[];
  myUnits: BlockoutUnit[];
  resources: PlayerResources;
  maxPopulation: number;
  urbanTier: UrbanizationTier;
  unitHpMultiplier: number;
  unitHpBonusPct: number;
  primaryColor: string;
  secondaryColor: string;
  bannerPattern: BannerPatternKind;
  defaultCulture: CultureKind;
  trainingQueue: QueuedTrainingItem[];
  onQueueTraining: (items: QueuedTrainingItem[]) => void;
  onCancelQueueItem: (itemId: string) => void;
  initialSoldierKind?: UnitKind | null;
  onSelectCamp: (structureId: string, focusCamera?: boolean) => void;
  onUpgradeCamp: (structureId: string) => void;
  onSelectUnitsByKind: (kind: UnitKind) => void;
  onClose: () => void;
  embedded?: boolean;
}

export const TRAINING_CAMP_KINDS: StructureKind[] = [
  'barracks',
  'war_tent',
  'horse_stable',
  'siege_workshop',
  'keep',
];

export function isTrainingCampStructure(kind: StructureKind): boolean {
  return (
    kind === 'barracks' ||
    kind === 'war_tent' ||
    kind === 'horse_stable' ||
    kind === 'siege_workshop' ||
    kind === 'keep'
  );
}

/** Custom SVG Icon for Each Unique Soldier Skill */
export const SoldierSkillIconSvg: React.FC<{
  iconKind: UnitSkillIconKind;
  className?: string;
}> = ({ iconKind, className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    className={`pointer-events-none select-none ${className}`}
    aria-hidden="true"
  >
    {iconKind === 'shield_wall' && (
      <g>
        <path
          d="M5,4 L12,2 L19,4 L19,12 C19,17 12,21 12,21 C12,21 5,17 5,12 Z"
          fill="#2b1d0d"
          stroke="#e2b857"
          strokeWidth="1.6"
        />
        <line x1="12" y1="3" x2="12" y2="20" stroke="#e2b857" strokeWidth="1.4" />
        <line x1="6" y1="10" x2="18" y2="10" stroke="#e2b857" strokeWidth="1.4" />
      </g>
    )}
    {iconKind === 'cleave_sword' && (
      <g stroke="#e2b857" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M19,4 L8,15 L5,19 L9,16 L20,5 Z" fill="#d6c3a5" />
        <line x1="6" y1="12" x2="12" y2="18" stroke="#c8902e" strokeWidth="2.2" />
        <path d="M13,4 Q20,10 17,17" stroke="#b5594f" strokeWidth="1.4" strokeDasharray="2 2" />
      </g>
    )}
    {iconKind === 'garrison_guard' && (
      <g>
        <polygon
          points="12,2 20,6 18,16 12,21 6,16 4,6"
          fill="#354622"
          stroke="#a3b87c"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="11" r="3.5" fill="#e2b857" />
      </g>
    )}
    {iconKind === 'pike_phalanx' && (
      <g stroke="#d6c3a5" strokeWidth="1.7" strokeLinecap="round">
        <line x1="4" y1="20" x2="18" y2="4" />
        <polygon points="20,2 15,5 18,8" fill="#e2b857" stroke="none" />
        <line x1="8" y1="21" x2="21" y2="7" stroke="#a89070" />
        <polygon points="22,5 17,8 20,11" fill="#b5594f" stroke="none" />
      </g>
    )}
    {iconKind === 'charge_breaker' && (
      <g>
        <polygon
          points="4,18 12,4 20,18"
          fill="#5e1a15"
          stroke="#d47a70"
          strokeWidth="1.5"
        />
        <line x1="12" y1="8" x2="12" y2="14" stroke="#e2b857" strokeWidth="2" />
        <circle cx="12" cy="16.5" r="1.3" fill="#e2b857" />
      </g>
    )}
    {iconKind === 'gate_sentinel' && (
      <g>
        <rect
          x="4"
          y="5"
          width="16"
          height="15"
          rx="1"
          fill="#362717"
          stroke="#e2b857"
          strokeWidth="1.5"
        />
        <path d="M8,20 L8,11 A4,4 0 0,1 16,11 L16,20 Z" fill="#160f08" stroke="#c8902e" />
      </g>
    )}
    {iconKind === 'fire_volley' && (
      <g>
        <line x1="4" y1="19" x2="17" y2="6" stroke="#e2b857" strokeWidth="1.8" />
        <polygon points="20,3 14,6 17,9" fill="#c87a28" />
        <circle cx="18" cy="5" r="3" fill="#992d2d" opacity="0.65" />
        <path d="M7,16 Q10,12 14,14" stroke="#d4a656" strokeWidth="1.3" fill="none" />
      </g>
    )}
    {iconKind === 'eagle_eye' && (
      <g fill="none" stroke="#d4a656" strokeWidth="1.6">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" fill="#e2b857" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </g>
    )}
    {iconKind === 'skirmish_step' && (
      <g fill="none" stroke="#a3b87c" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4,15 Q10,8 19,11" />
        <polygon points="21,11 16,8 17,14" fill="#a3b87c" stroke="none" />
        <path d="M6,19 Q12,14 18,17" stroke="#e2b857" strokeWidth="1.3" />
      </g>
    )}
    {iconKind === 'lance_charge' && (
      <g>
        <polygon points="21,4 6,15 4,19 9,17" fill="#e2b857" stroke="#78350f" strokeWidth="1" />
        <polygon points="15,5 20,10 13,11" fill="#872b24" />
      </g>
    )}
    {iconKind === 'barded_armor' && (
      <g>
        <path
          d="M5,7 L12,3 L19,7 L18,17 L12,21 L6,17 Z"
          fill="#3b2b1b"
          stroke="#d4a656"
          strokeWidth="1.6"
        />
        <polygon points="12,6 16,12 12,18 8,12" fill="#9a3412" />
      </g>
    )}
    {iconKind === 'flanking_raid' && (
      <g fill="none" stroke="#d4a656" strokeWidth="1.8" strokeLinecap="round">
        <path d="M5,18 C5,9 12,6 19,7" />
        <polygon points="21,7 16,4 16,10" fill="#e2b857" stroke="none" />
        <circle cx="6" cy="18" r="2" fill="#9a3412" />
      </g>
    )}
    {iconKind === 'royal_banner' && (
      <g>
        <line x1="6" y1="3" x2="6" y2="21" stroke="#e2b857" strokeWidth="2" />
        <polygon
          points="7,4 20,6 17,10 20,14 7,14"
          fill="#872b24"
          stroke="#e2b857"
          strokeWidth="1.2"
        />
        <circle cx="13" cy="9" r="2" fill="#e2b857" />
      </g>
    )}
    {iconKind === 'imperial_aegis' && (
      <g>
        <polygon
          points="4,15 6,6 10,10 12,4 14,10 18,6 20,15"
          fill="#c8902e"
          stroke="#ffebb0"
          strokeWidth="1.3"
        />
        <rect x="5" y="16" width="14" height="3" rx="1" fill="#8c5e15" />
      </g>
    )}
    {iconKind === 'war_rally' && (
      <g>
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="#4a2810"
          stroke="#e2b857"
          strokeWidth="1.6"
        />
        <polygon points="12,5 14,10 19,10 15,13 16.5,18 12,15 7.5,18 9,13 5,10 10,10" fill="#e2b857" />
      </g>
    )}
    {(iconKind === 'scaffold_craft' ||
      iconKind === 'master_harvest' ||
      iconKind === 'fort_repair') && (
      <g stroke="#e2b857" strokeWidth="1.7" strokeLinecap="round">
        <line x1="6" y1="18" x2="17" y2="7" />
        <path d="M13,5 L19,11" stroke="#d6c3a5" strokeWidth="2.6" />
        <rect x="4" y="16" width="5" height="4" fill="#92400e" stroke="none" />
      </g>
    )}
  </svg>
);

/**
 * Custom 2000s Pixel-Art / Heraldic Soldier Portrait SVG
 */
export const SoldierPortraitSvg: React.FC<{
  kind: UnitKind;
  primaryColor: string;
  secondaryColor: string;
  bannerPattern: BannerPatternKind;
  className?: string;
}> = ({
  kind,
  primaryColor,
  secondaryColor,
  className = 'w-12 h-12',
}) => (
  <svg
    viewBox="0 0 48 48"
    className={`pointer-events-none select-none ${className}`}
    aria-hidden="true"
  >
    <rect
      x="2"
      y="2"
      width="44"
      height="44"
      rx="2"
      fill="#160f08"
      stroke="#8c672b"
      strokeWidth="1.5"
    />
    <circle cx="24" cy="26" r="16" fill={primaryColor} opacity="0.22" />

    {kind === 'infantry' && (
      <g>
        <line x1="34" y1="9" x2="24" y2="28" stroke="#d6c3a5" strokeWidth="3" />
        <line x1="29" y1="15" x2="36" y2="18" stroke={secondaryColor} strokeWidth="2" />
        <path d="M17,15 Q24,7 31,15 L31,21 L17,21 Z" fill="#a89f91" stroke="#160f08" strokeWidth="1.2" />
        <rect x="19" y="18" width="10" height="5" fill="#d9a76a" />
        <line x1="24" y1="13" x2="24" y2="21" stroke="#e5dccb" strokeWidth="1.6" />
        <path d="M14,24 L34,24 L36,41 L12,41 Z" fill={primaryColor} stroke="#160f08" strokeWidth="1.2" />
        <path
          d="M11,23 L23,23 L23,33 C23,38 17,42 17,42 C17,42 11,38 11,33 Z"
          fill={primaryColor}
          stroke={secondaryColor}
          strokeWidth="1.8"
        />
        <circle cx="17" cy="31" r="2.6" fill={secondaryColor} />
      </g>
    )}

    {kind === 'spearman' && (
      <g>
        <line x1="10" y1="42" x2="38" y2="7" stroke="#78350f" strokeWidth="2.4" />
        <polygon points="41,4 34,8 38,12" fill="#e5dccb" stroke="#160f08" strokeWidth="0.8" />
        <polygon points="35,10 31,7 33,13" fill={secondaryColor} />
        <ellipse cx="23" cy="15" rx="9" ry="3.5" fill="#9c9283" stroke="#160f08" strokeWidth="1" />
        <path d="M17,15 Q23,8 29,15 Z" fill="#bfb5a4" stroke="#160f08" strokeWidth="1" />
        <rect x="19" y="16" width="8" height="6" fill="#d9a76a" />
        <path d="M14,23 L32,23 L34,41 L12,41 Z" fill={primaryColor} stroke={secondaryColor} strokeWidth="1.2" />
        <line x1="18" y1="23" x2="18" y2="41" stroke={secondaryColor} strokeWidth="1.3" />
        <line x1="28" y1="23" x2="28" y2="41" stroke={secondaryColor} strokeWidth="1.3" />
      </g>
    )}

    {kind === 'archer' && (
      <g>
        <rect x="12" y="16" width="5" height="14" transform="rotate(-18 12 16)" fill="#5c3a18" />
        <path d="M16,17 Q22,8 29,17 L28,23 L16,23 Z" fill={primaryColor} stroke={secondaryColor} strokeWidth="1.1" />
        <rect x="19" y="16" width="7" height="6" fill="#d9a76a" />
        <path d="M14,23 L30,23 L32,41 L12,41 Z" fill={primaryColor} stroke="#160f08" strokeWidth="1.1" />
        <path d="M31,8 Q41,24 31,40" fill="none" stroke="#b4782c" strokeWidth="2.4" />
        <line x1="31" y1="8" x2="31" y2="40" stroke="#ebd9b4" strokeWidth="0.9" />
        <line x1="21" y1="24" x2="40" y2="24" stroke="#e2b857" strokeWidth="1.8" />
        <circle cx="40" cy="24" r="3" fill="#b85d19" />
        <circle cx="40" cy="24" r="1.5" fill="#ffebb0" />
      </g>
    )}

    {kind === 'knight' && (
      <g>
        <line x1="8" y1="30" x2="42" y2="9" stroke="#8c5820" strokeWidth="2.2" />
        <polygon points="36,12 43,8 40,16" fill={secondaryColor} />
        <path d="M16,9 Q22,5 25,11" fill="none" stroke={secondaryColor} strokeWidth="2.5" />
        <rect x="18" y="11" width="9" height="9" rx="1" fill="#bfb5a4" stroke="#160f08" strokeWidth="1.1" />
        <line x1="19" y1="15" x2="26" y2="15" stroke="#160f08" strokeWidth="1.4" />
        <path d="M15,20 L29,20 L30,33 L14,33 Z" fill={primaryColor} stroke={secondaryColor} strokeWidth="1.2" />
        <path
          d="M24,42 L26,27 L33,21 L39,25 L36,30 L32,29 L33,42 Z"
          fill="#6e3214"
          stroke={secondaryColor}
          strokeWidth="1.3"
        />
        <circle cx="34" cy="24.5" r="1.2" fill="#ffebb0" />
      </g>
    )}

    {kind === 'commander' && (
      <g>
        <line x1="36" y1="6" x2="36" y2="42" stroke="#e2b857" strokeWidth="2" />
        <polygon points="36,7 45,10 42,14 45,18 36,18" fill={primaryColor} stroke={secondaryColor} strokeWidth="1" />
        <polygon
          points="15,15 16,9 20,12 23,7 26,12 30,9 31,15"
          fill="#e2b857"
          stroke="#6e4512"
          strokeWidth="1"
        />
        <rect x="18" y="15" width="10" height="7" fill="#d9a76a" />
        <path d="M11,22 L34,22 L36,42 L9,42 Z" fill={primaryColor} stroke={secondaryColor} strokeWidth="1.6" />
        <polygon points="23,25 28,31 23,38 18,31" fill={secondaryColor} />
      </g>
    )}

    {kind === 'worker' && (
      <g>
        <line x1="33" y1="13" x2="33" y2="39" stroke="#78350f" strokeWidth="2.4" />
        <path d="M26,15 Q33,10 40,15" fill="none" stroke="#bfb5a4" strokeWidth="3" />
        <path d="M15,17 Q22,9 29,17 Z" fill={primaryColor} stroke={secondaryColor} strokeWidth="1.2" />
        <rect x="18" y="17" width="8" height="6" fill="#d9a76a" />
        <path d="M13,24 L31,24 L33,41 L11,41 Z" fill={primaryColor} stroke="#160f08" strokeWidth="1.1" />
        <rect x="14" y="32" width="16" height="2.5" fill={secondaryColor} />
      </g>
    )}

    {kind === 'battering_ram' && (
      <g>
        {/* Heavy Armored Siege Roof Canopy */}
        <polygon points="10,27 24,13 38,27" fill="#5c3a18" stroke={secondaryColor} strokeWidth="1.5" />
        <rect x="12" y="25" width="24" height="10" fill={primaryColor} stroke="#160f08" strokeWidth="1.2" />
        {/* Iron-Tipped Suspended Battering Log */}
        <rect x="6" y="29" width="32" height="5" rx="1.5" fill="#78350f" stroke="#d6c3a5" strokeWidth="1" />
        <polygon points="37,27 44,31.5 37,36" fill="#e5dccb" stroke="#160f08" strokeWidth="1" />
        {/* Heavy Iron-Rimmed Siege Wheels */}
        <circle cx="17" cy="38" r="4.5" fill="#2b1d0d" stroke={secondaryColor} strokeWidth="1.5" />
        <circle cx="31" cy="38" r="4.5" fill="#2b1d0d" stroke={secondaryColor} strokeWidth="1.5" />
        <circle cx="17" cy="38" r="1.4" fill="#d6c3a5" />
        <circle cx="31" cy="38" r="1.4" fill="#d6c3a5" />
      </g>
    )}

    {kind === 'trebuchet' && (
      <g>
        {/* Heavy Timber A-Frame Chassis */}
        <line x1="12" y1="39" x2="24" y2="18" stroke="#78350f" strokeWidth="3" />
        <line x1="36" y1="39" x2="24" y2="18" stroke="#78350f" strokeWidth="3" />
        <rect x="9" y="37" width="30" height="4" fill="#5c3a18" stroke={secondaryColor} strokeWidth="1" />
        {/* Counterweight Throwing Arm */}
        <line x1="11" y1="24" x2="39" y2="10" stroke="#b4782c" strokeWidth="2.8" />
        {/* Stone Counterweight Box */}
        <rect x="9" y="24" width="8" height="9" fill="#64748b" stroke={secondaryColor} strokeWidth="1.2" />
        {/* Sling & Flaming Siege Boulder */}
        <line x1="39" y1="10" x2="35" y2="19" stroke="#e5dccb" strokeWidth="1.2" />
        <circle cx="35" cy="20" r="4" fill="#ea580c" stroke="#fde047" strokeWidth="1.2" />
        <circle cx="35" cy="20" r="1.8" fill="#ffebb0" />
        {/* Pivot Bolt & Banner */}
        <circle cx="24" cy="18" r="2.2" fill={secondaryColor} />
        <polygon points="24,18 24,25 30,22" fill={primaryColor} />
      </g>
    )}
  </svg>
);

export const SoldierTrainingCampPanel: React.FC<SoldierTrainingCampPanelProps> = ({
  selectedCamp,
  allMyStructures,
  myUnits,
  resources,
  maxPopulation,
  urbanTier,
  unitHpMultiplier,
  primaryColor,
  secondaryColor,
  bannerPattern,
  defaultCulture,
  trainingQueue,
  onQueueTraining,
  onCancelQueueItem,
  initialSoldierKind,
  onSelectCamp,
  onUpgradeCamp,
  onSelectUnitsByKind,
  onClose,
  embedded = true,
}) => {
  const soldierKindsOrder: UnitKind[] = useMemo(
    () => [
      'infantry',
      'spearman',
      'archer',
      'knight',
      'battering_ram',
      'trebuchet',
      'commander',
      'worker',
    ],
    []
  );

  const [selectedSoldierKind, setSelectedSoldierKind] = useState<UnitKind>(() => {
    if (initialSoldierKind) return initialSoldierKind;
    if (selectedCamp.kind === 'horse_stable') return 'knight';
    if (selectedCamp.kind === 'siege_workshop') return 'battering_ram';
    if (selectedCamp.kind === 'keep') return 'commander';
    return 'infantry';
  });

  useEffect(() => {
    if (initialSoldierKind) {
      setSelectedSoldierKind(initialSoldierKind);
      return;
    }
    if (selectedCamp.kind === 'horse_stable') {
      setSelectedSoldierKind('knight');
    } else if (selectedCamp.kind === 'siege_workshop') {
      setSelectedSoldierKind((prev) =>
        prev === 'battering_ram' || prev === 'trebuchet' ? prev : 'battering_ram'
      );
    } else if (selectedCamp.kind === 'keep') {
      setSelectedSoldierKind((prev) => (prev === 'knight' ? 'commander' : prev));
    }
  }, [selectedCamp.id, selectedCamp.kind, initialSoldierKind]);

  const [batchCount, setBatchCount] = useState<1 | 2 | 3 | 5>(1);

  const myTrainingCamps = useMemo(
    () => allMyStructures.filter((s) => isTrainingCampStructure(s.kind)),
    [allMyStructures]
  );

  const highestStableLevel = useMemo(() => {
    let maxLvl = 0;
    for (const st of allMyStructures) {
      if (st.kind === 'horse_stable' && !st.isConstructing && st.level > maxLvl) {
        maxLvl = st.level;
      }
    }
    return maxLvl;
  }, [allMyStructures]);

  const reservedResources = useMemo(() => {
    const totals: PlayerResources = {
      wood: 0,
      stone: 0,
      gold: 0,
      food: 0,
      cloth: 0,
      horses: 0,
    };
    for (const item of trainingQueue) {
      const uCost = UNIT_SPECS[item.unitKind].cost;
      totals.wood += uCost.wood ?? 0;
      totals.stone += uCost.stone ?? 0;
      totals.gold += uCost.gold ?? 0;
      totals.food += uCost.food ?? 0;
      totals.cloth += uCost.cloth ?? 0;
      totals.horses += uCost.horses ?? 0;
    }
    return totals;
  }, [trainingQueue]);

  const availableResources: PlayerResources = useMemo(
    () => ({
      wood: Math.max(0, resources.wood - reservedResources.wood),
      stone: Math.max(0, resources.stone - reservedResources.stone),
      gold: Math.max(0, resources.gold - reservedResources.gold),
      food: Math.max(0, resources.food - reservedResources.food),
      cloth: Math.max(0, resources.cloth - reservedResources.cloth),
      horses: Math.max(0, resources.horses - reservedResources.horses),
    }),
    [resources, reservedResources]
  );

  const activeSoldierSpec = UNIT_SPECS[selectedSoldierKind];
  const campSpec = STRUCTURE_SPECS[selectedCamp.kind];
  const campCulture = normalizeCultureKind(selectedCamp.culture ?? defaultCulture);
  const campCultureSpec = CULTURE_SPECS[campCulture] ?? CULTURE_SPECS.iraqi_mesopotamian;

  const isCavalry =
    selectedSoldierKind === 'knight' || selectedSoldierKind === 'commander';
  const cavalrySpeedBonusPct = isCavalry ? highestStableLevel * 8 : 0;
  const effectiveSpeed =
    Math.round(activeSoldierSpec.speed * (1 + cavalrySpeedBonusPct / 100) * 10) / 10;
  const effectiveHp = Math.round(activeSoldierSpec.maxHp * unitHpMultiplier);

  const { seconds: effectiveTrainSeconds } =
    getUnitTrainingDurationSeconds(
      selectedSoldierKind,
      selectedCamp.kind,
      selectedCamp.level
    );

  const foodCost = activeSoldierSpec.cost.food ?? 0;
  const woodCost = activeSoldierSpec.cost.wood ?? 0;
  const stoneCost = activeSoldierSpec.cost.stone ?? 0;
  const goldCost = activeSoldierSpec.cost.gold ?? 0;
  const clothCost = activeSoldierSpec.cost.cloth ?? 0;
  const horsesCost = activeSoldierSpec.cost.horses ?? 0;

  const hasFood = availableResources.food >= foodCost;
  const hasWood = availableResources.wood >= woodCost;
  const hasStone = availableResources.stone >= stoneCost;
  const hasGold = availableResources.gold >= goldCost;
  const hasCloth = availableResources.cloth >= clothCost;
  const hasHorses = availableResources.horses >= horsesCost;

  const canAffordOne =
    hasFood && hasWood && hasStone && hasGold && hasCloth && hasHorses;
  const urbanUnlocked = urbanTier >= activeSoldierSpec.requiredUrbanTier;
  const popAvailable = myUnits.length + trainingQueue.length < maxPopulation;
  const campReady = !selectedCamp.isConstructing || selectedCamp.level > 1;

  const canStartTraining =
    canAffordOne && urbanUnlocked && popAvailable && campReady;

  const handleStartTrainingProcess = () => {
    if (!canStartTraining) return;

    const remainingPopSlots = Math.max(
      0,
      maxPopulation - (myUnits.length + trainingQueue.length)
    );
    const maxByFood = foodCost > 0 ? Math.floor(availableResources.food / foodCost) : 99;
    const maxByWood = woodCost > 0 ? Math.floor(availableResources.wood / woodCost) : 99;
    const maxByStone = stoneCost > 0 ? Math.floor(availableResources.stone / stoneCost) : 99;
    const maxByGold = goldCost > 0 ? Math.floor(availableResources.gold / goldCost) : 99;
    const maxByCloth = clothCost > 0 ? Math.floor(availableResources.cloth / clothCost) : 99;
    const maxByHorses = horsesCost > 0 ? Math.floor(availableResources.horses / horsesCost) : 99;

    const affordableCount = Math.min(
      batchCount,
      remainingPopSlots,
      maxByFood,
      maxByWood,
      maxByStone,
      maxByGold,
      maxByCloth,
      maxByHorses
    );

    if (affordableCount <= 0) return;

    const newItems: QueuedTrainingItem[] = Array.from(
      { length: affordableCount },
      (_, idx) => ({
        id: `trn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${idx}`,
        unitKind: selectedSoldierKind,
        campId: selectedCamp.id,
        durationSec: effectiveTrainSeconds,
        elapsedSec: 0,
      })
    );

    onQueueTraining(newItems);
  };

  const activeHeadItem = trainingQueue[0] ?? null;
  const activeHeadProgressPct = activeHeadItem
    ? Math.min(
        100,
        Math.round((activeHeadItem.elapsedSec / activeHeadItem.durationSec) * 100)
      )
    : 0;

  const upgradeReq = !selectedCamp.isConstructing
    ? getStructureUpgradeRequirement(selectedCamp.kind, selectedCamp.level)
    : null;
  const upgradeCost = upgradeReq?.cost ?? {};
  const canAffordUpgrade =
    resources.wood >= (upgradeCost.wood ?? 0) &&
    resources.stone >= (upgradeCost.stone ?? 0) &&
    resources.gold >= (upgradeCost.gold ?? 0) &&
    resources.food >= (upgradeCost.food ?? 0) &&
    resources.cloth >= (upgradeCost.cloth ?? 0);
  const tierMetForUpgrade = upgradeReq ? urbanTier >= upgradeReq.requiredTier : false;
  const canUpgradeCamp = Boolean(upgradeReq && canAffordUpgrade && tierMetForUpgrade);
  const upgradeCostSummary = upgradeReq
    ? [
        upgradeCost.wood ? `${upgradeCost.wood} خشب` : null,
        upgradeCost.stone ? `${upgradeCost.stone} حجر` : null,
        upgradeCost.gold ? `${upgradeCost.gold} ذهب` : null,
        upgradeCost.cloth ? `${upgradeCost.cloth} قماش` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div
      aria-label="منصة معسكر تدريب الجنود ومهاراتهم"
      className={
        embedded
          ? 'w-full h-full flex flex-col sm:flex-row items-stretch gap-1 sm:gap-2 overflow-hidden select-none'
          : 'pointer-events-auto fixed bottom-[156px] left-2 lg:left-[208px] z-30 w-[calc(100vw-1rem)] sm:w-[540px] flex flex-col rts2k-stone-frame p-2 select-none'
      }
    >
      {/* RIGHT SECTION: CAMP SELECTOR BAR + 6 SQUARE CHISELED SOLDIER PORTRAIT TILES */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col justify-between gap-1 overflow-hidden">
        {/* Top Sub-Strip: Owned Training Camps + Upgrade Button */}
        <div className="flex items-center justify-between gap-1.5 px-1.5 py-0.5 sm:py-1 rts2k-ink-well shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-bold text-[#ffebb0] flex items-center gap-1 shrink-0">
              <Swords className="w-3.5 h-3.5 text-[#d4a656]" />
              <span className="hidden md:inline">
                {campSpec.labelAr.split(' (')[0]} Lv.{selectedCamp.level}:
              </span>
            </span>

            {myTrainingCamps.map((camp) => {
              const isSelected = camp.id === selectedCamp.id;
              const cLabel = STRUCTURE_SPECS[camp.kind].labelAr.split(' (')[0];
              return (
                <button
                  key={camp.id}
                  type="button"
                  onClick={() => onSelectCamp(camp.id, true)}
                  className={`h-5 px-1.5 text-[9.5px] font-bold flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'rts2k-bevel-btn-gold'
                      : 'rts2k-bevel-btn text-[#d6c3a5]'
                  }`}
                >
                  <Shield className="w-2.5 h-2.5 shrink-0" />
                  <span>
                    {cLabel} Lv.{camp.level}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {upgradeReq && (
              <button
                type="button"
                disabled={!canUpgradeCamp}
                onClick={() => onUpgradeCamp(selectedCamp.id)}
                title={
                  !tierMetForUpgrade
                    ? `يتطلب التطوير إلى Lv.${upgradeReq.nextLevel} مرتبة التحضر Lv.${upgradeReq.requiredTier} (${upgradeCostSummary})`
                    : !canAffordUpgrade
                      ? `الموارد غير كافية للتطوير (${upgradeCostSummary})`
                      : `تطوير المعسكر إلى Lv.${upgradeReq.nextLevel}: ${upgradeCostSummary}`
                }
                className="h-5 px-2 rts2k-bevel-btn-gold disabled:opacity-45 flex items-center gap-1 text-[9px] font-bold cursor-pointer whitespace-nowrap"
              >
                <ArrowUpCircle className="w-3 h-3 shrink-0" />
                <span>تطوير Lv.{upgradeReq.nextLevel}</span>
              </button>
            )}

            <span className="text-[9px] font-mono text-[#c8b28e] hidden xl:inline">
              طراز {campCultureSpec.shortAr}
            </span>
          </div>
        </div>

        {/* 6 Square Chiseled Soldier Tiles Row + Active Training Progress Bar */}
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {soldierKindsOrder.map((uKind) => {
            const uSpec = UNIT_SPECS[uKind];
            const isSelected = selectedSoldierKind === uKind;
            const ownedCount = myUnits.filter((u) => u.kind === uKind).length;
            const queuedCount = trainingQueue.filter((q) => q.unitKind === uKind).length;
            const unlocked = urbanTier >= uSpec.requiredUrbanTier;
            const isPreferredHere = uSpec.preferredCamps.includes(selectedCamp.kind);

            return (
              <button
                key={uKind}
                type="button"
                onClick={() => setSelectedSoldierKind(uKind)}
                onDoubleClick={() => {
                  setSelectedSoldierKind(uKind);
                  handleStartTrainingProcess();
                }}
                title={`${uSpec.labelAr} — نقرة لعرض المهارات، دبل كليك لبدء التدريب`}
                className={`rts2k-hud-soldier-tile relative w-[62px] h-[64px] sm:w-[76px] sm:h-[94px] p-1 flex flex-col items-center justify-between shrink-0 cursor-pointer ${
                  isSelected ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn'
                } ${!unlocked ? 'opacity-55' : ''}`}
              >
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (ownedCount > 0) {
                      onSelectUnitsByKind(uKind);
                    }
                  }}
                  title={`لديك ${ownedCount} في الميدان`}
                  className={`absolute top-0.5 right-1 text-[8px] sm:text-[8.5px] font-mono font-bold ${
                    isSelected ? 'text-[#241609]' : 'text-[#ffebb0]'
                  }`}
                >
                  {ownedCount}
                  {queuedCount > 0 ? `+${queuedCount}` : ''}
                </span>

                {isPreferredHere && (
                  <span
                    title="اختصاص مثالي لهذا المعسكر (-15% زمن)"
                    className={`absolute top-0.5 left-1 ${
                      isSelected ? 'text-[#593807]' : 'text-[#d4a656]'
                    }`}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                  </span>
                )}

                <SoldierPortraitSvg
                  kind={uKind}
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                  bannerPattern={bannerPattern}
                  className="rts2k-hud-soldier-art w-8 h-8 sm:w-12 sm:h-12 mt-1 sm:mt-2"
                />

                <div className="w-full text-center leading-none">
                  <div
                    className={`text-[9px] sm:text-[10px] font-bold truncate ${
                      isSelected ? 'text-[#190f04]' : 'text-[#f3e5c8]'
                    }`}
                  >
                    {uSpec.shortAr}
                  </div>
                  <div
                    className={`rts2k-compact-hide text-[7.5px] sm:text-[8px] font-mono mt-0.5 truncate ${
                      isSelected ? 'text-[#3b2208]' : 'text-[#c8b28e]'
                    }`}
                  >
                    {unlocked ? `${effectiveTrainSeconds}ث` : `Lv.${uSpec.requiredUrbanTier}`}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Active Training Queue Card right beside the soldier tiles */}
          {trainingQueue.length > 0 && activeHeadItem && (
            <div className="rts2k-hud-soldier-tile w-[134px] sm:w-[164px] h-[64px] sm:h-[94px] p-1 sm:p-1.5 rts2k-ink-well flex flex-col justify-between shrink-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9.5px] font-bold text-[#ffebb0] truncate">
                  تدريب: {UNIT_SPECS[activeHeadItem.unitKind].shortAr}
                </span>
                <button
                  type="button"
                  onClick={() => onCancelQueueItem(activeHeadItem.id)}
                  title="إلغاء الوحدة الحالية"
                  className="w-4 h-4 rts2k-bevel-btn-crimson flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>

              <div className="text-[8.5px] font-mono text-[#d6c3a5] flex items-center justify-between">
                <span>{activeHeadProgressPct}%</span>
                <span>الطابور: {trainingQueue.length}</span>
              </div>

              <div className="w-full h-2.5 bg-[#090603] border border-[#8c672b] p-[1px]">
                <div
                  className="h-full bg-gradient-to-b from-[#ffebb0] via-[#d4a656] to-[#8c5e15] rts2k-segmented-bar transition-all duration-100"
                  style={{ width: `${activeHeadProgressPct}%` }}
                />
              </div>

              <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
                {trainingQueue.slice(0, 4).map((qItem, idx) => (
                  <button
                    key={qItem.id}
                    type="button"
                    onClick={() => onCancelQueueItem(qItem.id)}
                    title={`إلغاء #${idx + 1} (${UNIT_SPECS[qItem.unitKind].shortAr})`}
                    className="px-1 py-0.5 rts2k-bevel-btn text-[8px] font-mono shrink-0 cursor-pointer"
                  >
                    #{idx + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LEFT SECTION: AGED VELLUM PARCHMENT SOLDIER DOSSIER + 3 UNIQUE SKILLS + START TRAINING BUTTON */}
      <div className="rts2k-hud-parchment relative w-full sm:w-[295px] md:w-[345px] lg:w-[455px] flex-1 sm:flex-none sm:h-full rts2k-parchment px-3 sm:px-3.5 py-1 sm:py-1.5 flex flex-col justify-between shrink-0 overflow-hidden">
        <BrassCornerMountSvg corner="tr" className="hidden sm:block absolute top-0.5 right-0.5 pointer-events-none" />
        <BrassCornerMountSvg corner="tl" className="hidden sm:block absolute top-0.5 left-0.5 pointer-events-none" />

        {/* Row 1: Soldier Title, Role, Stats & Select-in-Field Button */}
        <div className="flex items-center justify-between gap-1.5 border-b border-[#7d5929]/50 pb-0.5 sm:pb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-chronicle text-xs sm:text-sm font-bold text-[#241609] truncate">
              {activeSoldierSpec.labelAr.split(' (')[0]}
            </span>
            <span className="rts2k-compact-hide text-[9px] font-semibold text-[#6e4512] hidden md:inline truncate">
              ({activeSoldierSpec.roleAr})
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 text-[8.5px] sm:text-[9px] font-mono font-bold text-[#3d250d] shrink-0">
            <span>هجـ:{activeSoldierSpec.attack}</span>
            <span>درع:{activeSoldierSpec.defense}</span>
            <span>صحة:{effectiveHp}</span>
            <span className="hidden md:inline">سرعة:{effectiveSpeed}</span>
            {myUnits.some((u) => u.kind === selectedSoldierKind) && (
              <button
                type="button"
                onClick={() => onSelectUnitsByKind(selectedSoldierKind)}
                title="تحديد كل هذا الصنف في الميدان"
                className="h-4 px-1 rts2k-bevel-btn text-[8px] flex items-center gap-0.5 cursor-pointer"
              >
                <Eye className="w-2.5 h-2.5 text-[#ffebb0]" />
                <span>تحديد</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: The 3 Unique Skills of This Soldier Class */}
        <div className="grid grid-cols-3 gap-1 my-0.5">
          {activeSoldierSpec.skills.map((skill) => (
            <div
              key={skill.id}
              title={`${skill.nameAr} (${skill.typeAr}): ${skill.descAr}`}
              className="px-1 sm:px-1.5 py-0.5 sm:py-1 bg-[#d8bc86]/70 border border-[#7d5929]/70 flex items-center gap-1 min-w-0"
            >
              <div className="w-4 h-4 sm:w-5 sm:h-5 rts2k-ink-well flex items-center justify-center shrink-0">
                <SoldierSkillIconSvg iconKind={skill.iconKind} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-[8px] sm:text-[9px] font-bold text-[#241609] truncate">
                  {skill.nameAr}
                </div>
                <div className="rts2k-compact-hide text-[7px] sm:text-[8px] font-mono font-bold text-[#593807] truncate">
                  {skill.bonusBadgeAr}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Row 3: Costs, Batch Size & Prominent "بدء عملية التدريب" Button */}
        <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[#7d5929]/50">
          {/* Resource Cost Icons */}
          <div className="min-w-0 flex-1 flex items-center gap-1.5 text-[9.5px] font-mono font-bold overflow-x-auto no-scrollbar">
            {foodCost > 0 && (
              <span
                className={`flex items-center gap-0.5 ${
                  hasFood ? 'text-[#241609]' : 'text-[#872b24]'
                }`}
              >
                <ResourceArtworkSvg kind="food" className="w-3.5 h-3.5" />
                {foodCost * batchCount}
              </span>
            )}
            {woodCost > 0 && (
              <span
                className={`flex items-center gap-0.5 ${
                  hasWood ? 'text-[#241609]' : 'text-[#872b24]'
                }`}
              >
                <ResourceArtworkSvg kind="wood" className="w-3.5 h-3.5" />
                {woodCost * batchCount}
              </span>
            )}
            {stoneCost > 0 && (
              <span
                className={`flex items-center gap-0.5 ${
                  hasStone ? 'text-[#241609]' : 'text-[#872b24]'
                }`}
              >
                <ResourceArtworkSvg kind="stone" className="w-3.5 h-3.5" />
                {stoneCost * batchCount}
              </span>
            )}
            {goldCost > 0 && (
              <span
                className={`flex items-center gap-0.5 ${
                  hasGold ? 'text-[#241609]' : 'text-[#872b24]'
                }`}
              >
                <ResourceArtworkSvg kind="gold" className="w-3.5 h-3.5" />
                {goldCost * batchCount}
              </span>
            )}
            {clothCost > 0 && (
              <span
                className={`flex items-center gap-0.5 ${
                  hasCloth ? 'text-[#241609]' : 'text-[#872b24]'
                }`}
              >
                <ResourceArtworkSvg kind="cloth" className="w-3.5 h-3.5" />
                {clothCost * batchCount}
              </span>
            )}
            {horsesCost > 0 && (
              <span
                className={`flex items-center gap-0.5 ${
                  hasHorses ? 'text-[#241609]' : 'text-[#872b24]'
                }`}
              >
                <ResourceArtworkSvg kind="horses" className="w-3.5 h-3.5" />
                {horsesCost * batchCount}
              </span>
            )}
          </div>

          {/* Batch Multiplier Buttons */}
          <div className="hidden sm:flex items-center gap-0.5 shrink-0">
            {([1, 2, 3, 5] as const).map((cnt) => (
              <button
                key={cnt}
                type="button"
                onClick={() => setBatchCount(cnt)}
                className={`h-5 px-1 text-[8.5px] font-mono font-bold cursor-pointer ${
                  batchCount === cnt
                    ? 'rts2k-bevel-btn-gold'
                    : 'rts2k-bevel-btn text-[#d6c3a5]'
                }`}
              >
                ×{cnt}
              </button>
            ))}
          </div>

          {/* Primary Start Training Action Button */}
          <button
            type="button"
            disabled={!canStartTraining}
            onClick={handleStartTrainingProcess}
            className="flex-1 h-7 px-2 rts2k-bevel-btn-gold disabled:opacity-45 font-bold text-[10px] sm:text-[11px] flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Swords className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {!campReady
                ? 'المعسكر يُبنى...'
                : !urbanUnlocked
                  ? `يتطلب (${URBANIZATION_TIERS[activeSoldierSpec.requiredUrbanTier].nameAr})`
                  : !popAvailable
                    ? 'السكان ممتلئ'
                    : !canAffordOne
                      ? 'موارد غير كافية'
                      : `بدء عملية التدريب (${batchCount > 1 ? `${batchCount}× ` : ''}${activeSoldierSpec.shortAr})`}
            </span>
          </button>

          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 rts2k-bevel-btn-crimson flex items-center justify-center shrink-0 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
