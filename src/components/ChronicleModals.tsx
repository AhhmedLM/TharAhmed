import React, { useRef, useState } from 'react';
import {
  ArrowRightLeft,
  Box,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudUpload,
  Compass,
  Crown,
  Droplets,
  Eye,
  Home,
  LogIn,
  LogOut,
  Map as MapIcon,
  Pickaxe,
  Plus,
  RefreshCw,
  Shield,
  Sliders,
  Sparkles,
  Store,
  Sun,
  Swords,
  TrendingUp,
  Users,
  Volume2,
  Wind,
  X,
} from 'lucide-react';
import {
  BANNER_PATTERN_SPECS,
  BannerPatternKind,
  BlockoutStructure,
  BlockoutUnit,
  DiplomacyRelation,
  FACTION_PRIMARY_SWATCHES,
  FACTION_SECONDARY_SWATCHES,
  MarchWaypoint,
  ResourceNode,
  UNIT_SPECS,
  UnitKind,
  URBANIZATION_TIERS,
  UrbanizationTier,
  PlayerState,
  WorldState,
} from '../shared/protocol';
import { soundFx } from '../utils/soundFx';
import {
  BIOME_SPECS,
  BiomeKind,
  CLIMATE_SPECS,
  ClimateKind,
  formatDurationAr,
  formatWorldCoordKm,
  MACRO_LANDMARKS,
  WATERFALL_SITES,
  getBiomeAt,
  getClimateZoneLabelAr,
  getEffectiveClimateAt,
  getMoistureAt,
  getTemperatureCAt,
} from '../shared/worldMap';
import {
  PixelScaleMode,
  RenderPerfStats,
  RenderQualityMode,
} from './StrategicViewport';
import {
  BrassCornerMountSvg,
  HeraldicBannerShieldSvg,
  HeraldicEmblemSvg,
  ResourceArtworkSvg,
  ResourceKind,
} from './Retro2000sIcons';
import { ContinentalAtlasCanvas } from './ContinentalAtlasCanvas';

export type ChronicleModalKind =
  | 'resources'
  | 'units'
  | 'world'
  | 'cloud'
  | 'settings';

export const RESOURCE_META: Record<
  ResourceKind,
  {
    nameAr: string;
    descAr: string;
    colorText: string;
    barColor: string;
    emblemBg: string;
  }
> = {
  wood: {
    nameAr: 'خشب',
    descAr: 'أساسي لبناء المنازل، معسكرات الحطابين، الأسواق، وتطوير المباني',
    colorText: 'text-[#e6b872]',
    barColor: 'bg-[#b87b31]',
    emblemBg: 'from-[#5c3814] to-[#2e1a08] border-[#b87b31]',
  },
  stone: {
    nameAr: 'حجر',
    descAr: 'ضروري لتشييد القلاع، الأبراج، المعابد، وتحصين الأسوار',
    colorText: 'text-[#d6d0c4]',
    barColor: 'bg-[#8c857b]',
    emblemBg: 'from-[#4a453e] to-[#26231f] border-[#9c9488]',
  },
  gold: {
    nameAr: 'ذهب',
    descAr: 'عملة التجارة وتدريب الفرسان وبناء الأسواق والخيام الحربية والمعابد',
    colorText: 'text-[#ffdf70]',
    barColor: 'bg-[#d4a656]',
    emblemBg: 'from-[#785411] to-[#3b2705] border-[#d4a656]',
  },
  food: {
    nameAr: 'غذاء',
    descAr: 'وقود السكان وتدريب العمال والمشاة والفرسان في الثكنات والخيام',
    colorText: 'text-[#c8d68a]',
    barColor: 'bg-[#7a8f3e]',
    emblemBg: 'from-[#3f4d1f] to-[#222910] border-[#8fa650]',
  },
  cloth: {
    nameAr: 'قماش وقطن',
    descAr: 'ينسج من صوف المواشي وحقول القطن، وأساسي لنصب الخيام البدوية والخيام الحربية والرايات',
    colorText: 'text-[#ebd8b7]',
    barColor: 'bg-[#b59264]',
    emblemBg: 'from-[#5e4629] to-[#302314] border-[#c4a172]',
  },
  horses: {
    nameAr: 'خيول أصيلة',
    descAr: 'تُربّى وتُروّض في مرابط الخيول ومن قطعان البرية، وأساسية لتدريب الفرسان المدرعة والقادة',
    colorText: 'text-[#e09f67]',
    barColor: 'bg-[#a85824]',
    emblemBg: 'from-[#6b3010] to-[#361707] border-[#c87338]',
  },
};

const BIOME_JUMP_TARGETS: Record<BiomeKind, { x: number; z: number; zoom: number }> = {
  northern_peaks: { x: -2000, z: -34000, zoom: 75 },
  western_forest: { x: -7000, z: -24400, zoom: 70 },
  fertile_plains: { x: 25200, z: 14800, zoom: 60 },
  river_basin: { x: 19970, z: -2240, zoom: 55 },
  eastern_basalt: { x: 24800, z: -9800, zoom: 70 },
  southern_dunes: { x: 4800, z: 3200, zoom: 75 },
  waterfall_gorge: { x: -11200, z: -33200, zoom: 55 },
  ocean_coast: { x: -27600, z: 6200, zoom: 75 },
};

export interface ChronicleModalsProps {
  activePopup: ChronicleModalKind;
  onSwitchPopup: (kind: ChronicleModalKind) => void;
  onClose: () => void;
  lastAckMessage: string;
  myPlayer: PlayerState | null;
  playerId: string | null;
  playersList: PlayerState[];
  worldState: WorldState | null;
  myUnits: BlockoutUnit[];
  myStructures: BlockoutStructure[];
  queuedTrainingCount?: number;
  economyStats: {
    passivePerMin: Record<ResourceKind, number>;
    gatheringPerMin: Record<ResourceKind, number>;
    totalPerMin: Record<ResourceKind, number>;
    workersByResource: Record<ResourceKind | 'idle' | 'moving' | 'building', number>;
    maxPopulation: number;
    storageCap: number;
    highestMarketLevel: number;
    sellGoldPer100: number;
    buyGoldPer100: number;
    urbanReport: {
      tier: UrbanizationTier;
      score: number;
      unitHpMultiplier: number;
      tierSpec: { nameAr: string; unitHpBonusPct: number };
    };
    popLifeReport: {
      moodLabelAr: string;
      moodSummaryAr: string;
      happinessPct: number;
      prosperityBonusPct: number;
      farmersCount: number;
      merchantsCount: number;
      scholarsCount: number;
      waterCarriersCount: number;
      foodSecurityScore: number;
      housingComfortScore: number;
      marketAccessScore: number;
      spiritualCivicScore: number;
      safetyGuardScore: number;
    };
  };
  resourceFilter: ResourceKind | 'all';
  onChangeResourceFilter: (filter: ResourceKind | 'all') => void;
  sortedResourceNodes: ResourceNode[];
  hoverTerrain: { x: number; z: number };
  activeBiomeNameAr: string;
  activeClimateId: ClimateKind;
  activeClimateNameAr: string;
  // Actions
  onSpawnUnit: (kind: UnitKind) => void;
  onOpenTrainingCampForUnit?: (kind: UnitKind) => void;
  onAutoDistributeIdle: () => void;
  onAssignWorkerToResourceKind: (kind: ResourceKind, focusCamera?: boolean) => void;
  onTradeResource: (action: 'sell' | 'buy', kind: 'wood' | 'stone' | 'food' | 'cloth' | 'horses', amount: number) => void;
  onDispatchWorkersToNode: (node: ResourceNode) => void;
  onSelectAllMyUnits: () => void;
  onSelectUnitAndFocus: (unit: BlockoutUnit) => void;
  onJumpCamera: (targetX: number, targetZ: number, zoom?: number) => void;
  onSetClimate: (climate?: ClimateKind, autoCycle?: boolean) => void;
  selectedUnitIds?: string[];
  onDispatchAtlasMarch?: (unitIds: string[], waypoints: MarchWaypoint[]) => void;
  // Cloud props
  user: { displayName?: string | null; email?: string | null } | null;
  cloudStatus: string;
  lastSyncedAt: string | null;
  cloudStructuresCount: number;
  cloudUnitsCount: number;
  isSyncing: boolean;
  onSignInWithGoogle: () => void;
  onSaveToCloud: () => void;
  onSignOutFromCloud: () => void;
  // Heraldry & Settings props
  customKingdomName: string;
  setCustomKingdomName: (val: string) => void;
  customPrimaryColor: string;
  setCustomPrimaryColor: (val: string) => void;
  customSecondaryColor: string;
  setCustomSecondaryColor: (val: string) => void;
  customBannerPattern: BannerPatternKind;
  setCustomBannerPattern: (val: BannerPatternKind) => void;
  onApplyHeraldry: (overrides?: {
    name?: string;
    primaryColor?: string;
    secondaryColor?: string;
    bannerPattern?: BannerPatternKind;
  }) => void;
  pixelScale: PixelScaleMode;
  setPixelScale: (scale: PixelScaleMode) => void;
  qualityMode: RenderQualityMode;
  setQualityMode: (mode: RenderQualityMode) => void;
  perfStats: RenderPerfStats;
  rttMs: number;
  tickRateHz: number;
  onResetWorld: () => void;
  onAdaptAllToBiomes?: () => void;
  onDiplomacyAction?: (
    targetId: string,
    action: 'declare_war' | 'propose_ally' | 'accept_ally' | 'break_ally' | 'set_neutral'
  ) => void;
  onClaimSultanHassan?: () => void;
}

const renderClimateIcon = (climateId: ClimateKind, className = 'w-4 h-4') => {
  switch (climateId) {
    case 'northern_blizzard':
      return <CloudSnow className={`${className} text-sky-300 shrink-0`} />;
    case 'desert_sandstorm':
      return <Wind className={`${className} text-amber-400 shrink-0`} />;
    case 'monsoon_rain':
      return <CloudRain className={`${className} text-blue-400 shrink-0`} />;
    default:
      return <Sun className={`${className} text-amber-300 shrink-0`} />;
  }
};

export const ChronicleModals: React.FC<ChronicleModalsProps> = ({
  activePopup,
  onSwitchPopup,
  onClose,
  lastAckMessage,
  myPlayer,
  playerId,
  playersList,
  worldState,
  myUnits,
  myStructures,
  queuedTrainingCount = 0,
  economyStats,
  resourceFilter,
  onChangeResourceFilter,
  sortedResourceNodes,
  hoverTerrain,
  activeBiomeNameAr,
  activeClimateId,
  activeClimateNameAr,
  onSpawnUnit,
  onOpenTrainingCampForUnit,
  onAutoDistributeIdle,
  onAssignWorkerToResourceKind,
  onTradeResource,
  onDispatchWorkersToNode,
  onSelectAllMyUnits,
  onSelectUnitAndFocus,
  onJumpCamera,
  onSetClimate,
  selectedUnitIds = [],
  onDispatchAtlasMarch,
  user,
  cloudStatus,
  lastSyncedAt,
  cloudStructuresCount,
  cloudUnitsCount,
  isSyncing,
  onSignInWithGoogle,
  onSaveToCloud,
  onSignOutFromCloud,
  customKingdomName,
  setCustomKingdomName,
  customPrimaryColor,
  setCustomPrimaryColor,
  customSecondaryColor,
  setCustomSecondaryColor,
  customBannerPattern,
  setCustomBannerPattern,
  onApplyHeraldry,
  pixelScale,
  setPixelScale,
  qualityMode,
  setQualityMode,
  perfStats,
  rttMs,
  tickRateHz,
  onResetWorld,
  onAdaptAllToBiomes,
  onDiplomacyAction,
  onClaimSultanHassan,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);
  const [sfxVolume, setSfxVolume] = useState<number>(() => Math.round(soundFx.getVolume() * 100));
  const colorDebounceRef = useRef<number | null>(null);

  const scheduleColorHeraldry = (patch: { primaryColor?: string; secondaryColor?: string }) => {
    if (colorDebounceRef.current) window.clearTimeout(colorDebounceRef.current);
    colorDebounceRef.current = window.setTimeout(() => {
      onApplyHeraldry(patch);
    }, 250);
  };

  const getRel = (otherId: string): DiplomacyRelation => {
    if (!playerId || !worldState) return 'neutral';
    const key = playerId < otherId ? `${playerId}::${otherId}` : `${otherId}::${playerId}`;
    const explicit = worldState.diplomacy?.[key];
    if (explicit) return explicit;
    const other = worldState.players?.[otherId];
    if (other?.isAi || other?.isBandit) return 'war';
    const pvp = worldState.directorConfig?.pvpMode ?? 'diplomacy';
    if (pvp === 'free_for_all') return 'war';
    if (pvp === 'coop') return 'ally';
    return 'neutral';
  };
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center p-1 sm:p-4 bg-black/75"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[94dvh] sm:max-h-[86dvh] flex flex-col rts2k-stone-frame overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <BrassCornerMountSvg corner="tr" className="hidden sm:block absolute top-1 right-1 z-10 pointer-events-none" />
        <BrassCornerMountSvg corner="tl" className="hidden sm:block absolute top-1 left-1 z-10 pointer-events-none" />
        <BrassCornerMountSvg corner="br" className="hidden sm:block absolute bottom-1 right-1 z-10 pointer-events-none" />
        <BrassCornerMountSvg corner="bl" className="hidden sm:block absolute bottom-1 left-1 z-10 pointer-events-none" />

        {/* 2000s Carved Oak & Hammered Brass Modal Header */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 px-2.5 sm:px-4 py-1.5 sm:py-2.5 rts2k-oak-bar shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {activePopup === 'resources' && (
              <>
                <span className="w-7 h-7 sm:w-8 sm:h-8 rts2k-bevel-btn-gold flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-chronicle text-sm sm:text-lg font-bold text-[#ffe8b3] leading-none truncate">
                    ديوان الخزانة وسوق القوافل
                  </h2>
                  <p className="hidden sm:block text-[11px] text-[#c8b28e] truncate mt-0.5">
                    مراقبة الإنتاج، توجيه العمال، سعة المخازن، وتبادل الغلال بالذهب
                  </p>
                </div>
              </>
            )}
            {activePopup === 'units' && (
              <>
                <span className="w-7 h-7 sm:w-8 sm:h-8 rts2k-bevel-btn flex items-center justify-center text-[#7dd3fc] shrink-0">
                  <Users className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-chronicle text-sm sm:text-lg font-bold text-[#ffe8b3] leading-none truncate">
                    سجل الأهالي وثكنات الجيش
                  </h2>
                  <p className="hidden sm:block text-[11px] text-[#c8b28e] truncate mt-0.5">
                    أحوال الرعية، تجنيد العمال والمقاتلين، ومتابعة الدوريات الميدانية
                  </p>
                </div>
              </>
            )}
            {activePopup === 'world' && (
              <>
                <span className="w-7 h-7 sm:w-8 sm:h-8 rts2k-bevel-btn flex items-center justify-center text-[#fcd34d] shrink-0">
                  <MapIcon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-chronicle text-sm sm:text-lg font-bold text-[#ffe8b3] leading-none truncate">
                    أطلس الشام والرافدين وبادية مرقاب
                  </h2>
                  <p className="hidden sm:block text-[11px] text-[#c8b28e] truncate mt-0.5">
                    انقر على أي حاضرة أو ثغر للانتقال الفوري بالكاميرا أو ضبط حالة الطقس
                  </p>
                </div>
              </>
            )}
            {activePopup === 'cloud' && (
              <>
                <span className="w-7 h-7 sm:w-8 sm:h-8 rts2k-bevel-btn flex items-center justify-center text-[#fde047] shrink-0">
                  <Cloud className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-chronicle text-sm sm:text-lg font-bold text-[#ffe8b3] leading-none truncate">
                    سجل المملكة السحابي
                  </h2>
                  <p className="hidden sm:block text-[11px] text-[#c8b28e] truncate mt-0.5">
                    حفظ واسترجاع مملكتك ومواردك وجيوشك سحابياً بشكل دائم على مدار الساعة
                  </p>
                </div>
              </>
            )}
            {activePopup === 'settings' && (
              <>
                <span className="w-7 h-7 sm:w-8 sm:h-8 rts2k-bevel-btn flex items-center justify-center text-[#d8b4fe] shrink-0">
                  <Sliders className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-chronicle text-sm sm:text-lg font-bold text-[#ffe8b3] leading-none truncate">
                    الراية الملكية وإعدادات المحرك
                  </h2>
                  <p className="hidden sm:block text-[11px] text-[#c8b28e] truncate mt-0.5">
                    تخصيص شعار وألوان المملكة، كثافة البكسل 2000s، وجودة العرض
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:inline text-[10.5px] text-[#d6c3a5] font-mono px-2 py-1 rts2k-ink-well">
              {lastAckMessage}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rts2k-bevel-btn-crimson cursor-pointer"
              title="إغلاق النافذة (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Unified Chronicle Wooden File-Tabs Navigation Bar (Scrollable on narrow portrait, 5-col grid on sm+) */}
        <nav
          aria-label="التبديل بين سجلات المملكة"
          className="flex items-end gap-1 px-2 pt-1.5 sm:grid sm:grid-cols-5 sm:px-3 bg-[#160f08] border-b-2 border-[#a87e38] overflow-x-auto no-scrollbar shrink-0"
        >
          {(
            [
              { id: 'resources', labelAr: 'الخزانة والسوق', icon: TrendingUp },
              { id: 'units', labelAr: 'الأهالي والجيش', icon: Users },
              { id: 'world', labelAr: 'الأطلس والطقس', icon: MapIcon },
              { id: 'cloud', labelAr: 'الحفظ السحابي', icon: Cloud },
              { id: 'settings', labelAr: 'الراية والإعدادات', icon: Sliders },
            ] as const
          ).map((tab) => {
            const TabIcon = tab.icon;
            const isTabActive = activePopup === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSwitchPopup(tab.id)}
                className={`py-1.5 px-2.5 sm:px-1.5 text-[10.5px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                  isTabActive
                    ? 'rts2k-file-tab-active'
                    : 'rts2k-file-tab text-[#d6c3a5] hover:text-[#ffe8b3]'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.labelAr}</span>
              </button>
            );
          })}
        </nav>

        {/* Modal Body */}
        <div className="p-2.5 sm:p-4 overflow-y-auto space-y-2.5 sm:space-y-3.5 bg-[#140e09]">
          {/* 1. TREASURY & MARKET */}
          {activePopup === 'resources' && (() => {
            const workerSpec = UNIT_SPECS.worker;
            const workerFood = workerSpec.cost.food ?? 0;
            const workerWood = workerSpec.cost.wood ?? 0;
            const canAffordWorker =
              (myPlayer?.resources.food ?? 0) >= workerFood &&
              (myPlayer?.resources.wood ?? 0) >= workerWood;
            const popOkForWorker =
              myUnits.length + queuedTrainingCount < economyStats.maxPopulation;

            return (
            <div className="space-y-3.5">
              <div className="p-3 rts2k-parchment flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-[#241609]">
                  <div className="flex items-center gap-1.5">
                    <Home className="w-4 h-4 text-[#7c2d12]" />
                    <span>السكان:</span>
                    <span className="font-mono">
                      {myUnits.length} / {economyStats.maxPopulation}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Box className="w-4 h-4 text-[#1e3a8a]" />
                    <span>سعة المخازن:</span>
                    <span className="font-mono">
                      {economyStats.storageCap} لكل مورد
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Pickaxe className="w-4 h-4 text-[#065f46]" />
                    <span>العاطلون:</span>
                    <span className="font-mono text-[#991b1b]">
                      {economyStats.workersByResource.idle}
                    </span>
                    {economyStats.workersByResource.building > 0 && (
                      <span className="font-mono text-[#065f46] text-[11px]">
                        (تشييد: {economyStats.workersByResource.building})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={!canAffordWorker || !popOkForWorker}
                    onClick={() => onSpawnUnit('worker')}
                    title={
                      !popOkForWorker
                        ? 'السكان ممتلئة — ابنِ بيوتاً أو خياماً'
                        : !canAffordWorker
                          ? `يتطلب ${workerFood} غذاء و${workerWood} خشب`
                          : 'تدريب عامل جديد عند القلعة'
                    }
                    className="flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 rts2k-bevel-btn disabled:opacity-45 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#6ee7b7] shrink-0" />
                    <span>
                      {!popOkForWorker
                        ? 'السكان ممتلئة'
                        : `تدريب عامل (${workerFood} غذاء · ${workerWood} خشب)`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={onAutoDistributeIdle}
                    className="flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 rts2k-bevel-btn-gold text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Pickaxe className="w-3.5 h-3.5 shrink-0" />
                    <span>توزيع العمال تلقائياً</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {(['wood', 'stone', 'gold', 'food', 'cloth', 'horses'] as ResourceKind[]).map((rKind) => {
                  const meta = RESOURCE_META[rKind];
                  const currentVal = myPlayer?.resources[rKind] ?? 0;
                  const passive = economyStats.passivePerMin[rKind];
                  const activeGather = economyStats.gatheringPerMin[rKind];
                  const totalRate = economyStats.totalPerMin[rKind];
                  const workersCount = economyStats.workersByResource[rKind];
                  const pct = Math.min(100, Math.round((currentVal / economyStats.storageCap) * 100));

                  return (
                    <div
                      key={rKind}
                      className="p-3 rts2k-ink-well flex flex-col justify-between gap-2.5"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-7 h-7 bg-gradient-to-b ${meta.emblemBg} border flex items-center justify-center`}>
                              <ResourceArtworkSvg kind={rKind} className="w-4 h-4" />
                            </span>
                            <span className="text-xs font-bold text-[#ffe8b3]">
                              {meta.nameAr}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono font-bold text-[#6ee7b7]">
                            +{totalRate}/د
                          </span>
                        </div>

                        <div className="mt-2 flex items-baseline justify-between font-mono">
                          <span className={`text-xl font-bold ${meta.colorText}`}>
                            {currentVal}
                          </span>
                          <span className="text-[11px] text-[#c8b28e]">
                            / {economyStats.storageCap} ({pct}%)
                          </span>
                        </div>

                        <div className="w-full h-2 bg-[#090603] border border-[#5c4320] p-[1px] my-1.5">
                          <div
                            className={`h-full ${meta.barColor} rts2k-segmented-bar`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        <p className="text-[11px] text-[#c8b28e] leading-relaxed">
                          {meta.descAr}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-[#4d3616] space-y-1.5 text-[11px]">
                        <div className="flex justify-between text-[#d6c3a5]">
                          <span>إنتاج المباني:</span>
                          <span className="font-mono text-[#7dd3fc]">+{passive}/د</span>
                        </div>
                        <div className="flex justify-between text-[#d6c3a5]">
                          <span>حصاد العمال ({workersCount}):</span>
                          <span className="font-mono text-[#6ee7b7]">+{activeGather}/د</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onAssignWorkerToResourceKind(rKind, true)}
                          className="w-full mt-1 py-1.5 px-2 rts2k-bevel-btn font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Pickaxe className="w-3.5 h-3.5 text-[#f6c467]" />
                          <span>
                            {rKind === 'horses'
                              ? 'إرسال سيّاس لترويض قطيع خيول'
                              : 'إرسال عامل لأقرب حقل'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Market Caravan Exchange */}
              <div className="p-3 rts2k-ink-well space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-[#fde047]" />
                    <h3 className="font-chronicle text-sm sm:text-base font-bold text-[#ffe8b3]">
                      سوق القوافل وتبادل الغلال بالذهب
                    </h3>
                    <span className="text-[11px] font-mono text-[#f6c467]">
                      · مستوى السوق Lv.{economyStats.highestMarketLevel}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#c8b28e]">
                    طوّر السوق لرفع عائد البيع وخفض كلفة الشراء
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-2">
                  {(['wood', 'stone', 'food', 'cloth', 'horses'] as const).map((tradable) => {
                    const meta = RESOURCE_META[tradable];
                    const currentStock = myPlayer?.resources[tradable] ?? 0;
                    const currentGold = myPlayer?.resources.gold ?? 0;

                    return (
                      <div
                        key={tradable}
                        className="p-2 bg-[#16100a] border border-[#5c4320] flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <ResourceArtworkSvg kind={tradable} className="w-4 h-4" />
                            <span className="text-xs font-bold text-[#ffe8b3]">
                              {meta.nameAr}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-[#d6c3a5]">
                            {currentStock}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            disabled={currentStock < 100}
                            onClick={() => onTradeResource('sell', tradable, 100)}
                            className="py-1.5 px-1.5 rts2k-bevel-btn-gold disabled:opacity-40 text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <ArrowRightLeft className="w-3 h-3 shrink-0" />
                            <span>بيع (+{economyStats.sellGoldPer100})</span>
                          </button>

                          <button
                            type="button"
                            disabled={
                              currentGold < economyStats.buyGoldPer100 ||
                              currentStock >= economyStats.storageCap
                            }
                            onClick={() => onTradeResource('buy', tradable, 100)}
                            title={
                              currentStock >= economyStats.storageCap
                                ? 'مخازن هذا المورد ممتلئة'
                                : `شراء 100 مقابل ${economyStats.buyGoldPer100} ذهب`
                            }
                            className="py-1.5 px-1.5 rts2k-bevel-btn-emerald disabled:opacity-40 text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3 shrink-0" />
                            <span>
                              {currentStock >= economyStats.storageCap
                                ? 'ممتلئ'
                                : `شراء (-${economyStats.buyGoldPer100})`}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Continental Resource Nodes Explorer */}
              <div className="p-3 rts2k-ink-well space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#7dd3fc]" />
                    <h3 className="text-xs sm:text-sm font-bold text-[#ffe8b3]">
                      كشاف الحقول ومرابط الخيول ({sortedResourceNodes.length} حقل نشط)
                    </h3>
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full sm:w-auto sm:flex-wrap pb-0.5">
                    {(['all', 'wood', 'stone', 'gold', 'food', 'cloth', 'horses'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => onChangeResourceFilter(f)}
                        className={`px-2 py-1 text-[10.5px] font-bold shrink-0 whitespace-nowrap cursor-pointer ${
                          resourceFilter === f
                            ? 'rts2k-bevel-btn-gold'
                            : 'rts2k-bevel-btn text-[#d6c3a5]'
                        }`}
                      >
                        {f === 'all' ? 'الكل' : RESOURCE_META[f].nameAr}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                  {sortedResourceNodes.slice(0, 12).map((node) => {
                    const meta = RESOURCE_META[node.kind];
                    const biomeSpec = BIOME_SPECS[getBiomeAt(node.x, node.z)];
                    const hasBonus = biomeSpec.harvestBonusKind === node.kind;

                    return (
                      <div
                        key={node.id}
                        className="p-2 bg-[#16100a] border border-[#5c4320] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <ResourceArtworkSvg kind={node.kind} className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold text-[#ffe8b3] truncate">
                              {meta.nameAr} ({node.amount})
                            </span>
                          </div>
                          <div className="text-[10px] text-[#c8b28e] mt-0.5 flex items-center gap-1.5">
                            <span>{biomeSpec.nameAr.split(' (')[0]}</span>
                            {hasBonus && (
                              <span className="text-[#6ee7b7] font-mono">
                                +{biomeSpec.harvestBonusPct}%
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onJumpCamera(node.x, node.z, 26);
                              onClose();
                            }}
                            title="انتقال بالكاميرا إلى الحقل"
                            className="p-1.5 rts2k-bevel-btn cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDispatchWorkersToNode(node)}
                            title="إرسال العمال لحصاد هذا الحقل"
                            className="px-2 py-1 rts2k-bevel-btn-emerald text-[10.5px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Pickaxe className="w-3 h-3" />
                            <span>حصاد</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            );
          })()}

          {/* 2. CITIZEN LIFE & ARMY GARRISON */}
          {activePopup === 'units' && (
            <div className="space-y-3.5">
              <div className="p-3 rts2k-parchment space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-[#7c2d12]" />
                      <span className="font-chronicle text-sm sm:text-base font-bold text-[#241609]">
                        أحوال الرعية والأهالي ({economyStats.popLifeReport.moodLabelAr} ·{' '}
                        {economyStats.popLifeReport.happinessPct}%)
                      </span>
                      <span className="text-[11px] font-mono font-bold text-[#065f46]">
                        · بركة السعادة +{economyStats.popLifeReport.prosperityBonusPct}%
                      </span>
                    </div>
                    <p className="text-[11px] text-[#3f2912] mt-0.5">
                      {economyStats.popLifeReport.moodSummaryAr}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const targetHouse =
                        myStructures.find((s) => s.kind === 'house') ??
                        myStructures.find((s) => s.kind === 'farm') ??
                        myStructures[0];
                      if (targetHouse) {
                        onJumpCamera(targetHouse.x, targetHouse.z, 18);
                        onClose();
                      }
                    }}
                    className="px-3 py-1.5 rts2k-bevel-btn-emerald text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>مشاهدة الأحياء والعمال ({myUnits.filter((u) => u.kind === 'worker').length})</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[#241609]">
                  <div className="p-2 bg-[#d4b680]/60 border border-[#8f6834] space-y-0.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>المزارعون</span>
                      <span className="font-mono">{economyStats.popLifeReport.farmersCount}</span>
                    </div>
                    <p className="text-[10px] text-[#4e3417]">
                      يرعون المحاصيل ويحملون الغلال
                    </p>
                  </div>
                  <div className="p-2 bg-[#d4b680]/60 border border-[#8f6834] space-y-0.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>التجار</span>
                      <span className="font-mono">{economyStats.popLifeReport.merchantsCount}</span>
                    </div>
                    <p className="text-[10px] text-[#4e3417]">
                      يحملون البضائع بين السوق والقلعة
                    </p>
                  </div>
                  <div className="p-2 bg-[#d4b680]/60 border border-[#8f6834] space-y-0.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>العلماء والمصلون</span>
                      <span className="font-mono">{economyStats.popLifeReport.scholarsCount}</span>
                    </div>
                    <p className="text-[10px] text-[#4e3417]">
                      يتوافدون من الأحياء إلى الصروح
                    </p>
                  </div>
                  <div className="p-2 bg-[#d4b680]/60 border border-[#8f6834] space-y-0.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>السقاة والحرفيون</span>
                      <span className="font-mono">{economyStats.popLifeReport.waterCarriersCount}</span>
                    </div>
                    <p className="text-[10px] text-[#4e3417]">
                      يحملون جرار المياه والمؤن للأحياء
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 sm:gap-1.5 text-center text-[9.5px] sm:text-[10px] font-mono text-[#241609]">
                  <div className="p-1 bg-[#d4b680]/45 border border-[#8f6834]">
                    الغذاء: <strong>{economyStats.popLifeReport.foodSecurityScore}%</strong>
                  </div>
                  <div className="p-1 bg-[#d4b680]/45 border border-[#8f6834]">
                    المساكن: <strong>{economyStats.popLifeReport.housingComfortScore}%</strong>
                  </div>
                  <div className="p-1 bg-[#d4b680]/45 border border-[#8f6834]">
                    السوق: <strong>{economyStats.popLifeReport.marketAccessScore}%</strong>
                  </div>
                  <div className="p-1 bg-[#d4b680]/45 border border-[#8f6834]">
                    الروحية: <strong>{economyStats.popLifeReport.spiritualCivicScore}%</strong>
                  </div>
                  <div className="p-1 bg-[#d4b680]/45 border border-[#8f6834]">
                    الأمن: <strong>{economyStats.popLifeReport.safetyGuardScore}%</strong>
                  </div>
                </div>
              </div>

              <div className="p-3 rts2k-ink-well flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#ffe8b3]">
                    <Shield className="w-4 h-4 text-[#fde047]" />
                    <span>
                      تجنيد الوحدات ({economyStats.urbanReport.tierSpec.nameAr})
                    </span>
                  </div>
                  <p className="text-[11px] text-[#c8b28e] mt-0.5">
                    مكافأة التحضر تمنح جميع وحداتك{' '}
                    <strong className="text-[#6ee7b7]">
                      +{economyStats.urbanReport.tierSpec.unitHpBonusPct}% صحة إضافية
                    </strong>
                  </p>
                </div>
                <div className="text-xs font-mono text-[#fde047]">
                  الجيش: {myUnits.length}/{economyStats.maxPopulation} · التحضر: {economyStats.urbanReport.score}ن
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(Object.keys(UNIT_SPECS) as UnitKind[]).map((kind) => {
                  const spec = UNIT_SPECS[kind];
                  const count = myUnits.filter((u) => u.kind === kind).length;
                  const foodCost = spec.cost.food ?? 0;
                  const woodCost = spec.cost.wood ?? 0;
                  const goldCost = spec.cost.gold ?? 0;
                  const clothCost = spec.cost.cloth ?? 0;
                  const horsesCost = spec.cost.horses ?? 0;
                  const canAfford =
                    (myPlayer?.resources.food ?? 0) >= foodCost &&
                    (myPlayer?.resources.wood ?? 0) >= woodCost &&
                    (myPlayer?.resources.gold ?? 0) >= goldCost &&
                    (myPlayer?.resources.cloth ?? 0) >= clothCost &&
                    (myPlayer?.resources.horses ?? 0) >= horsesCost;
                  const urbanUnlocked = economyStats.urbanReport.tier >= spec.requiredUrbanTier;
                  const popAvailable =
                    myUnits.length + queuedTrainingCount < economyStats.maxPopulation;
                  const boostedHp = Math.round(spec.maxHp * economyStats.urbanReport.unitHpMultiplier);

                  return (
                    <div
                      key={kind}
                      className="p-3 rts2k-ink-well flex flex-col justify-between gap-2.5"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-bold text-[#ffe8b3]">
                            {spec.labelAr.split(' (')[0]}
                          </span>
                          <span
                            className={`text-xs font-mono font-bold ${
                              urbanUnlocked ? 'text-[#6ee7b7]' : 'text-[#fca5a5]'
                            }`}
                          >
                            {urbanUnlocked ? `العدد: ${count}` : `Lv.${spec.requiredUrbanTier}`}
                          </span>
                        </div>
                        <div className="mt-1.5 text-[11px] text-[#c8b28e] space-y-1">
                          <div>
                            سرعة: {spec.speed} م/ث · صحة:{' '}
                            <strong className="text-[#6ee7b7]">{boostedHp}</strong> · هجوم:{' '}
                            <strong className="text-[#fca5a5]">{spec.attack}</strong>
                          </div>
                          <div className="font-mono text-[#fde047] flex flex-wrap items-center gap-1.5">
                            {foodCost > 0 && <span>{foodCost} غذاء</span>}
                            {woodCost > 0 && <span className="text-[#f6c467]">· {woodCost} خشب</span>}
                            {goldCost > 0 && <span>· {goldCost} ذهب</span>}
                            {clothCost > 0 && <span className="text-[#f5d0fe]">· {clothCost} قماش</span>}
                            {horsesCost > 0 && <span className="text-[#fdba74]">· {horsesCost} خيول</span>}
                          </div>
                          <div className="text-[10px] text-[#d6c3a5]">
                            متطلب: {URBANIZATION_TIERS[spec.requiredUrbanTier].nameAr}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!canAfford || !urbanUnlocked || !popAvailable}
                          onClick={() => onSpawnUnit(kind)}
                          className="flex-1 py-1.5 px-2 rts2k-bevel-btn-gold disabled:opacity-40 font-bold text-xs cursor-pointer"
                        >
                          {!urbanUnlocked
                            ? `مغلق (Lv.${spec.requiredUrbanTier})`
                            : !popAvailable
                              ? 'السكان ممتلئة'
                              : !canAfford
                                ? 'موارد غير كافية'
                                : `تدريب ${spec.shortAr}`}
                        </button>
                        {onOpenTrainingCampForUnit && (
                          <button
                            type="button"
                            onClick={() => onOpenTrainingCampForUnit(kind)}
                            title={`فتح معسكر التدريب لاستعراض مهارات ${spec.shortAr}`}
                            className="py-1.5 px-2 rts2k-bevel-btn text-[10.5px] font-bold text-[#7dd3fc] shrink-0 cursor-pointer"
                          >
                            المهارات
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 rts2k-ink-well space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#ffe8b3]">
                    دوريات الحراسة والعمال ({myUnits.length} وحدة)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAllMyUnits();
                        onClose();
                      }}
                      className="px-3 py-1 rts2k-bevel-btn-emerald text-[11px] font-bold cursor-pointer"
                    >
                      تحديد كل جيشي ({myUnits.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onAutoDistributeIdle();
                        onClose();
                      }}
                      className="px-3 py-1 rts2k-bevel-btn-gold text-[11px] font-bold cursor-pointer"
                    >
                      توزيع للحصاد التلقائي
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                  {myUnits.map((u) => (
                    <div
                      key={u.id}
                      className="p-2 bg-[#16100a] border border-[#5c4320] flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#ffe8b3] truncate">
                          {UNIT_SPECS[u.kind].labelAr.split(' (')[0]}
                        </div>
                        <div className="text-[10px] text-[#6ee7b7] truncate">
                          {u.marchOrderLabelAr
                            ? u.marchOrderLabelAr
                            : (u.activityAr ??
                              (u.state === 'gathering'
                                ? 'يحصد الموارد'
                                : u.state === 'building'
                                  ? 'يشيّد مبنى'
                                  : u.state === 'moving'
                                    ? 'في مسير'
                                    : 'حراسة'))}
                          {u.etaServerMs && u.etaServerMs > Date.now()
                            ? ` · متبقٍ ${formatDurationAr(Math.ceil((u.etaServerMs - Date.now()) / 1000))}`
                            : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectUnitAndFocus(u);
                          onClose();
                        }}
                        title="تتبع هذه الوحدة بالكاميرا"
                        className="p-1.5 rts2k-bevel-btn text-[#fde047] shrink-0 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. CONTINENTAL ATLAS & CLIMATE */}
          {activePopup === 'world' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
              <div className="lg:col-span-7 p-2.5 sm:p-3 rts2k-ink-well space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <span className="font-bold text-[#ffe8b3]">
                    أطلس مسرح «ثار أحمد» الجغرافي (100 × 100 كم · مقياس 1:1)
                  </span>
                  <span className="font-mono text-[11px] text-[#c8b28e]">
                    ({formatWorldCoordKm(hoverTerrain.x)}, {formatWorldCoordKm(hoverTerrain.z)}) ·{' '}
                    {activeBiomeNameAr}
                  </span>
                </div>

                <ContinentalAtlasCanvas
                  structures={worldState?.structures ?? {}}
                  units={worldState?.units ?? {}}
                  players={playersList}
                  myPlayerId={playerId}
                  selectedUnitIds={selectedUnitIds}
                  activeClimate={activeClimateId}
                  onJumpToWorld={(wx, wz) => {
                    onJumpCamera(wx, wz, 56);
                    onClose();
                  }}
                  onDispatchMarch={(unitIds, waypoints) => {
                    if (onDispatchAtlasMarch) {
                      onDispatchAtlasMarch(unitIds, waypoints);
                    }
                  }}
                />
              </div>

              <div className="lg:col-span-5 space-y-3">
                <div className="p-3 rts2k-ink-well space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#ffe8b3]">
                      جبهة الطقس العالمية ({activeClimateNameAr})
                    </span>
                    <button
                      type="button"
                      onClick={() => onSetClimate(undefined, !worldState?.autoCycleClimate)}
                      className={`px-2 py-0.5 text-[10px] font-bold cursor-pointer ${
                        worldState?.autoCycleClimate
                          ? 'rts2k-bevel-btn-emerald'
                          : 'rts2k-bevel-btn text-[#c8b28e]'
                      }`}
                    >
                      {worldState?.autoCycleClimate ? 'تلقائي: مفعل' : 'يدوي'}
                    </button>
                  </div>

                  {(() => {
                    const localZoneAr = getClimateZoneLabelAr(hoverTerrain.x, hoverTerrain.z);
                    const localTempC = getTemperatureCAt(hoverTerrain.x, hoverTerrain.z);
                    const localHumidityPct = Math.round(getMoistureAt(hoverTerrain.x, hoverTerrain.z) * 100);
                    const localWeatherId = getEffectiveClimateAt(hoverTerrain.x, hoverTerrain.z, activeClimateId);
                    const localWeatherNameAr = (CLIMATE_SPECS[localWeatherId]?.nameAr ?? activeClimateNameAr).split(' (')[0];
                    return (
                      <div className="px-2 py-1.5 bg-[#120d08] border border-[#5c4320] text-[10.5px] text-[#e7d4b3] flex flex-wrap items-center justify-between gap-1.5">
                        <span className="font-bold text-[#93c5fd]">{localZoneAr}</span>
                        <span className="font-mono text-[#c8b28e]">
                          {localTempC}°م · رطوبة {localHumidityPct}% · الطقس المحلي: {localWeatherNameAr}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(CLIMATE_SPECS) as ClimateKind[]).map((cKey) => {
                      const cSpec = CLIMATE_SPECS[cKey];
                      return (
                        <button
                          key={cKey}
                          type="button"
                          onClick={() => onSetClimate(cKey, false)}
                          className={`p-2 text-right flex items-center gap-2 text-xs cursor-pointer ${
                            activeClimateId === cKey
                              ? 'rts2k-bevel-btn-gold'
                              : 'rts2k-bevel-btn'
                          }`}
                        >
                          {renderClimateIcon(cKey, 'w-4 h-4')}
                          <span className="truncate font-semibold">
                            {cSpec.nameAr.split(' (')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 rts2k-ink-well space-y-2">
                  <span className="text-xs font-bold text-[#ffe8b3] block">
                    المعالم الكبرى (من الرصافة شرقاً إلى القدس غرباً ونصيبين شمالاً)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-0.5">
                    {MACRO_LANDMARKS.map((lm) => (
                      <button
                        key={lm.id}
                        type="button"
                        onClick={() => {
                          onJumpCamera(lm.x, lm.z, 58);
                          onClose();
                        }}
                        className="p-2 rts2k-bevel-btn text-right flex flex-col gap-0.5 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-[#ffe8b3]">
                          <span className="truncate">{lm.nameAr}</span>
                          <Compass className="w-3 h-3 text-[#f59e0b] shrink-0" />
                        </div>
                        <div className="text-[9.5px] text-[#c8b28e] truncate">
                          {lm.regionAr}
                        </div>
                      </button>
                    ))}

                    {WATERFALL_SITES.map((wf) => (
                      <button
                        key={wf.id}
                        type="button"
                        onClick={() => {
                          onJumpCamera(wf.cliffX, wf.cliffZ, 44);
                          onClose();
                        }}
                        className="p-2 rts2k-bevel-btn text-[#7dd3fc] text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Droplets className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
                        <span className="truncate">{wf.nameAr}</span>
                      </button>
                    ))}

                    {(Object.keys(BIOME_SPECS) as BiomeKind[]).map((bKey) => (
                      <button
                        key={bKey}
                        type="button"
                        onClick={() => {
                          const t = BIOME_JUMP_TARGETS[bKey];
                          onJumpCamera(t.x, t.z, t.zoom);
                          onClose();
                        }}
                        className="p-2 rts2k-bevel-btn text-[11px] truncate text-right cursor-pointer"
                      >
                        {BIOME_SPECS[bKey].nameAr.split(' (')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Diplomacy, Online Rivals & Sultan Hassan Role */}
                <div className="p-3 rts2k-ink-well space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#ffe8b3] flex items-center gap-1.5">
                      <Swords className="w-3.5 h-3.5 text-[#f59e0b]" />
                      <span>الدبلوماسية والمنافسون</span>
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-black/50 border border-[#7c5c2c] text-[#fde047]">
                      {worldState?.directorConfig?.pvpMode === 'free_for_all'
                        ? 'حرب مفتوحة (PvP)'
                        : worldState?.directorConfig?.pvpMode === 'coop'
                          ? 'تعاوني (Co-op)'
                          : 'دبلوماسية وتحالفات'}
                    </span>
                  </div>

                  {worldState?.directorConfig?.sultanHassanMode === 'human_claimable' &&
                    !playersList.some((p) => !p.isAi && p.isSultanHassan) &&
                    onClaimSultanHassan && (
                      <button
                        type="button"
                        onClick={() => {
                          onClaimSultanHassan();
                          onClose();
                        }}
                        className="w-full py-2 px-3 rts2k-bevel-btn-gold text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Crown className="w-4 h-4" />
                        <span>تولّي عرش السلطان حسن وقيادة الدولة السندية في مرقاب</span>
                      </button>
                    )}

                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                    {playersList
                      .filter((p) => p.id !== playerId && !p.isBandit)
                      .map((other) => {
                        const rel = getRel(other.id);
                        return (
                          <div
                            key={other.id}
                            className="p-1.5 bg-[#120d07] border border-[#5c4320] flex flex-wrap items-center justify-between gap-1.5 text-[11px]"
                          >
                            <div className="min-w-0 flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 shrink-0 border border-white/40"
                                style={{ backgroundColor: other.color }}
                              />
                              <span className="font-bold text-[#ffe8b3] truncate max-w-[130px]">
                                {other.name}
                              </span>
                              <span
                                className={`text-[9.5px] px-1 border font-bold ${
                                  rel === 'war'
                                    ? 'border-rose-500 text-rose-300 bg-rose-950/60'
                                    : rel === 'ally'
                                      ? 'border-emerald-500 text-emerald-300 bg-emerald-950/60'
                                      : 'border-amber-500 text-amber-300 bg-amber-950/60'
                                }`}
                              >
                                {rel === 'war' ? 'حرب' : rel === 'ally' ? 'تحالف' : 'هدنة'}
                              </span>
                            </div>

                            {onDiplomacyAction && !other.isAi && (
                              <div className="flex items-center gap-1">
                                {rel !== 'war' && (
                                  <button
                                    type="button"
                                    onClick={() => onDiplomacyAction(other.id, 'declare_war')}
                                    className="px-1.5 py-0.5 bg-rose-900 hover:bg-rose-800 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    حرب
                                  </button>
                                )}
                                {rel !== 'ally' && (
                                  <button
                                    type="button"
                                    onClick={() => onDiplomacyAction(other.id, 'propose_ally')}
                                    className="px-1.5 py-0.5 bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    تحالف
                                  </button>
                                )}
                                {rel !== 'neutral' && (
                                  <button
                                    type="button"
                                    onClick={() => onDiplomacyAction(other.id, 'set_neutral')}
                                    className="px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    هدنة
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. CLOUD ARCHIVE */}
          {activePopup === 'cloud' && (
            <div className="p-4 rts2k-parchment flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-chronicle text-base font-bold text-[#241609]">
                  {user
                    ? `متصل بحساب: ${user.displayName || user.email}`
                    : 'وضع الضيف المحلي — سجل الدخول لحفظ مملكتك سحابياً'}
                </div>
                <div className="text-xs text-[#4e3417] mt-1">{cloudStatus}</div>
                {lastSyncedAt && (
                  <div className="text-[11px] font-mono font-bold text-[#065f46] mt-1">
                    آخر حفظ: {lastSyncedAt} ({cloudStructuresCount} مبنى · {cloudUnitsCount} وحدة)
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {!user ? (
                  <button
                    type="button"
                    onClick={onSignInWithGoogle}
                    className="px-4 py-2 rts2k-bevel-btn-gold font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>تسجيل الدخول بـ Google</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onSaveToCloud}
                      disabled={isSyncing}
                      className="px-3.5 py-2 rts2k-bevel-btn-emerald font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <CloudUpload className="w-4 h-4" />
                      <span>{isSyncing ? 'جارٍ الحفظ...' : 'حفظ الآن'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onSignOutFromCloud}
                      className="px-3 py-2 rts2k-bevel-btn-crimson text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>خروج</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 5. HERALDRY & ENGINE SETTINGS */}
          {activePopup === 'settings' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rts2k-ink-well space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#5c4320] pb-2.5">
                  <div>
                    <span className="font-chronicle text-sm sm:text-base font-bold text-[#fde047] block">
                      تخصيص هوية المملكة والراية وألوان الجنود والقلاع
                    </span>
                    <span className="text-[11px] text-[#c8b28e]">
                      يؤثر فوراً على لباس الجنود ودروعهم ورايات الخيالة وأعلام القلاع
                    </span>
                  </div>

                  <div className="flex items-center gap-3 px-3 py-1.5 bg-[#120d07] border border-[#785421]">
                    <svg viewBox="0 0 60 38" className="w-14 h-9 shrink-0">
                      <rect x="2" y="1" width="3" height="36" fill={customSecondaryColor} />
                      <circle cx="3.5" cy="2" r="2" fill={customSecondaryColor} />
                      <polygon
                        points="5,4 56,4 44,19 56,34 5,34"
                        fill={customPrimaryColor}
                        stroke={customSecondaryColor}
                        strokeWidth="2.4"
                      />
                      <foreignObject x="13" y="8" width="22" height="22">
                        <HeraldicEmblemSvg
                          pattern={customBannerPattern}
                          color={customSecondaryColor}
                          className="w-5 h-5"
                        />
                      </foreignObject>
                    </svg>

                    <div className="flex items-center gap-2 border-r border-[#5c4320] pr-2.5">
                      <HeraldicBannerShieldSvg
                        primaryColor={customPrimaryColor}
                        secondaryColor={customSecondaryColor}
                        pattern={customBannerPattern}
                        className="w-8 h-9"
                      />
                      <div className="text-[10px] leading-tight">
                        <div className="font-bold text-[#ffe8b3] truncate max-w-[110px]">
                          {customKingdomName || myPlayer?.name || 'مملكة ثار أحمد'}
                        </div>
                        <div className="text-[#fde047] font-mono text-[9px]">
                          {BANNER_PATTERN_SPECS[customBannerPattern].nameAr}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-[#ffe8b3] block">
                      اسم القائد / المملكة:
                    </label>
                    <input
                      type="text"
                      maxLength={28}
                      value={customKingdomName}
                      onChange={(e) => setCustomKingdomName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onApplyHeraldry({ name: customKingdomName });
                        }
                      }}
                      placeholder="أدخل اسم مملكتك أو القائد..."
                      className="w-full px-3 py-1.5 bg-[#0c0805] border border-[#8b6528] text-xs font-bold text-[#ffe8b3] focus:outline-none focus:border-[#fde047]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onApplyHeraldry()}
                    className="w-full py-2 px-3 rts2k-bevel-btn-gold text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Shield className="w-4 h-4 shrink-0" />
                    <span>اعتماد الاسم والألوان والراية</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-2.5 bg-[#120d07] border border-[#5c4320] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#ffe8b3]">
                        اللون الأساسي (الجنود والراية):
                      </span>
                      <label className="flex items-center gap-1 text-[10px] font-mono text-[#fde047] cursor-pointer">
                        <span>مخصص</span>
                        <input
                          type="color"
                          value={customPrimaryColor}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomPrimaryColor(val);
                            scheduleColorHeraldry({ primaryColor: val });
                          }}
                          className="w-5 h-5 border border-[#9e7634] bg-transparent cursor-pointer"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {FACTION_PRIMARY_SWATCHES.map((sw) => {
                        const active = customPrimaryColor.toLowerCase() === sw.hex.toLowerCase();
                        return (
                          <button
                            key={sw.hex}
                            type="button"
                            onClick={() => {
                              setCustomPrimaryColor(sw.hex);
                              onApplyHeraldry({ primaryColor: sw.hex });
                            }}
                            className={`px-1.5 py-1 text-[9.5px] font-bold flex items-center gap-1 cursor-pointer ${
                              active ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn'
                            }`}
                          >
                            <span
                              className="w-3 h-3 shrink-0 border border-black/60"
                              style={{ backgroundColor: sw.hex }}
                            />
                            <span className="truncate">{sw.nameAr}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#120d07] border border-[#5c4320] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#ffe8b3]">
                        اللون الثانوي (الشعار والحواف):
                      </span>
                      <label className="flex items-center gap-1 text-[10px] font-mono text-[#fde047] cursor-pointer">
                        <span>مخصص</span>
                        <input
                          type="color"
                          value={customSecondaryColor}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomSecondaryColor(val);
                            scheduleColorHeraldry({ secondaryColor: val });
                          }}
                          className="w-5 h-5 border border-[#9e7634] bg-transparent cursor-pointer"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {FACTION_SECONDARY_SWATCHES.map((sw) => {
                        const active = customSecondaryColor.toLowerCase() === sw.hex.toLowerCase();
                        return (
                          <button
                            key={sw.hex}
                            type="button"
                            onClick={() => {
                              setCustomSecondaryColor(sw.hex);
                              onApplyHeraldry({ secondaryColor: sw.hex });
                            }}
                            className={`px-1.5 py-1 text-[9.5px] font-bold flex items-center gap-1 cursor-pointer ${
                              active ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn'
                            }`}
                          >
                            <span
                              className="w-3 h-3 shrink-0 border border-black/60"
                              style={{ backgroundColor: sw.hex }}
                            />
                            <span className="truncate">{sw.nameAr}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-[#ffe8b3] block">
                    قالب العلم والشعار الملكي:
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {(Object.keys(BANNER_PATTERN_SPECS) as BannerPatternKind[]).map((patKey) => {
                      const patSpec = BANNER_PATTERN_SPECS[patKey];
                      const isSelected = customBannerPattern === patKey;
                      return (
                        <button
                          key={patKey}
                          type="button"
                          onClick={() => {
                            setCustomBannerPattern(patKey);
                            onApplyHeraldry({ bannerPattern: patKey });
                          }}
                          className={`p-2 flex flex-col items-center gap-1 text-center cursor-pointer ${
                            isSelected ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn'
                          }`}
                        >
                          <div
                            className="w-9 h-7 flex items-center justify-center border"
                            style={{
                              backgroundColor: customPrimaryColor,
                              borderColor: customSecondaryColor,
                            }}
                          >
                            <HeraldicEmblemSvg
                              pattern={patKey}
                              color={customSecondaryColor}
                              className="w-5 h-5"
                            />
                          </div>
                          <span className="text-[10px] font-bold leading-tight">
                            {patSpec.nameAr}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rts2k-ink-well space-y-2">
                  <span className="text-xs font-bold text-[#f6c467] block">
                    كثافة البكسل الثابتة (Stronghold Lock)
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([1, 2, 3, 4] as PixelScaleMode[]).map((scale) => {
                      const ppmLabel =
                        scale === 1 ? '24px/m' : scale === 2 ? '16px/m' : scale === 3 ? '12px/m' : '9px/m';
                      return (
                        <button
                          key={scale}
                          type="button"
                          onClick={() => setPixelScale(scale)}
                          className={`py-1 font-mono text-[10px] font-bold flex flex-col items-center justify-center cursor-pointer ${
                            pixelScale === scale ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn'
                          }`}
                        >
                          <span>{scale}x</span>
                          <span className="text-[8.5px] opacity-85">{ppmLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 rts2k-ink-well space-y-2">
                  <span className="text-xs font-bold text-[#7dd3fc] block">
                    جودة الظلال والمجسمات
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['mobile_battery', 'balanced', 'high'] as RenderQualityMode[]).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQualityMode(q)}
                        className={`py-1.5 text-[11px] font-bold cursor-pointer ${
                          qualityMode === q ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn'
                        }`}
                      >
                        {q === 'mobile_battery' ? 'خفيف' : q === 'balanced' ? 'متوازن' : 'فائق'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 rts2k-ink-well space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-[#ffe8b3]">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-[#f59e0b]" />
                      <span>مستوى صوت المؤثرات</span>
                    </span>
                    <span className="font-mono text-[#fde047]">{sfxVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={sfxVolume}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setSfxVolume(next);
                      soundFx.setVolume(next / 100);
                    }}
                    className="w-full accent-[#d97706] cursor-pointer"
                  />
                  {onAdaptAllToBiomes && (
                    <button
                      type="button"
                      onClick={() => {
                        onAdaptAllToBiomes();
                        onClose();
                      }}
                      className="w-full py-1.5 px-2 rts2k-bevel-btn-emerald text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>تكييف كل المباني مع بيئاتها (+45%)</span>
                    </button>
                  )}
                  <div className="font-mono text-[10px] text-[#c8b28e] pt-0.5">
                    {perfStats.fps} FPS · {rttMs}ms · {tickRateHz}Hz
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#5c4320]">
                <span className="text-xs text-[#c8b28e]">
                  إعادة تهيئة الخريطة بالكامل وإعادة توزيع الحواضر والحصون:
                </span>
                {!confirmReset ? (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="px-3 py-1.5 rts2k-bevel-btn-crimson text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>إعادة تهيئة العالم</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmReset(false);
                        onResetWorld();
                        onClose();
                      }}
                      className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer"
                    >
                      تأكيد إعادة التهيئة الآن
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="px-3 py-1.5 rts2k-bevel-btn text-xs font-bold cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
