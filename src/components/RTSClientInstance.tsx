import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpCircle,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudRain,
  CloudSnow,
  Compass,
  Crosshair,
  Eye,
  Flag,
  Grid3X3,
  Hammer,
  Hand,
  Home,
  Landmark,
  Layers,
  Lock,
  Magnet,
  Map as MapIcon,
  Maximize,
  Minimize,
  MousePointer,
  Pause,
  Pickaxe,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Route,
  Send,
  Shield,
  Sliders,
  Store,
  Sun,
  Swords,
  Trash2,
  TrendingUp,
  Unlock,
  Users,
  Volume2,
  VolumeX,
  Wind,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCloudSync } from '../firebase/useCloudSync';
import { useMultiplayerClient } from '../network/useMultiplayerClient';
import {
  BANDIT_CLAN_OUTFIT_AR,
  BANDIT_STATE_LABELS_AR,
  BannerPatternKind,
  CULTURE_SPECS,
  CultureKind,
  evaluateEnvironmentalFit,
  evaluateKingdomCapacity,
  evaluateKingdomUrbanization,
  evaluatePopulationLife,
  getClimateVisionMultiplier,
  getRecommendedCultureForBiome,
  getStructureDefenseSpec,
  getStructureUpgradeRequirement,
  getTotalCarriedLoot,
  getUnitEffectiveCombatStats,
  MarchWaypoint,
  PveDifficulty,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  normalizeCultureKind,
  ResourceNode,
  STRUCTURE_SPECS,
  StructureKind,
  UNIT_SPECS,
  UnitKind,
  UnitStanceKind,
} from '../shared/protocol';
import { soundFx } from '../utils/soundFx';
import {
  BIOME_SPECS,
  calculateMarchRouteStats,
  CLIMATE_SPECS,
  ClimateKind,
  evaluateFortificationTerrain,
  formatDurationAr,
  formatWorldCoordKm,
  getBiomeAt,
  getClimateZoneLabelAr,
  getEffectiveClimateAt,
  getMoistureAt,
  getTemperatureCAt,
  WORLD_MAP_SIZE,
} from '../shared/worldMap';
import {
  FortPlacementItem,
  isLineBuildableFort,
} from '../shared/fortificationHelpers';
import {
  BuildGridNudgeCommand,
  BuildPreviewStatus,
  CameraPresetCommand,
  CameraProjectionMode,
  HoverTerrainInfo,
  PixelScaleMode,
  RenderPerfStats,
  RenderQualityMode,
  StrategicViewport,
  TouchInteractionMode,
} from './StrategicViewport';
import {
  ProceduralStrategicMap,
  StrategicMapFlyToCommand,
} from './ProceduralStrategicMap';
import {
  isTrainingCampStructure,
  QueuedTrainingItem,
  SoldierTrainingCampPanel,
} from './SoldierTrainingCampPanel';
import {
  BrassCornerMountSvg,
  ChiseledSeparatorSvg,
  HeraldicBannerShieldSvg,
  ResourceArtworkSvg,
  ResourceKind,
  TacticalMinimapSvg,
} from './Retro2000sIcons';
import { ChronicleModals, RESOURCE_META } from './ChronicleModals';

interface RTSClientInstanceProps {
  clientLabel: string;
  isSplitView?: boolean;
  onToggleSplitView?: () => void;
}

type PopupModalKind =
  | 'resources'
  | 'structures'
  | 'units'
  | 'world'
  | 'cloud'
  | 'settings'
  | null;

type BuildCategoryTab =
  | 'all'
  | 'housing_farming'
  | 'economy'
  | 'military'
  | 'civic';


/**
 * 2.5D Isometric Architectural Building Portrait SVG
 * Renders a detailed isometric illustration of each building kind styled with the active Culture's palette & roof geometry.
 */
const BuildingIsometricPortrait: React.FC<{
  kind: StructureKind;
  culture: CultureKind;
  className?: string;
}> = ({ kind, culture, className = 'w-full h-14' }) => {
  const normCulture = normalizeCultureKind(culture);
  const cSpec = CULTURE_SPECS[normCulture] ?? CULTURE_SPECS.iraqi_mesopotamian;
  const wallLight = `#${cSpec.wallHex.toString(16).padStart(6, '0')}`;
  const wallDark = `#${cSpec.darkWallHex.toString(16).padStart(6, '0')}`;
  const roofHex = cSpec.roofAccentHex;
  const trimHex = `#${cSpec.timberHex.toString(16).padStart(6, '0')}`;
  const isIraqi = normCulture === 'iraqi_mesopotamian';
  const isShami = normCulture === 'levantine_shami';
  const isHejazi = normCulture === 'hejazi_arabian';
  const isBedouin = normCulture === 'bedouin_nomadic';

  return (
    <svg
      viewBox="0 0 96 68"
      className={`pointer-events-none select-none ${className}`}
      aria-hidden="true"
    >
      {/* Isometric Ground Foundation Plinth */}
      <polygon
        points="48,58 84,41 48,25 12,41"
        fill="#261c12"
        stroke="#785421"
        strokeWidth="1"
      />
      <polygon points="48,55 79,41 48,27 17,41" fill="#362819" opacity="0.85" />

      {kind === 'house' && (
        <g>
          {isBedouin ? (
            <>
              {/* Bedouin Black Goat-Hair Bayt al-Sha'r Tent Dwelling with Sadu Stripe */}
              <polygon points="18,43 36,18 48,23 62,17 78,43 48,52" fill="#231c17" stroke="#b91c1c" strokeWidth="0.9" />
              <line x1="23" y1="36" x2="73" y2="36" stroke="#dc2626" strokeWidth="2.2" />
              <line x1="27" y1="32" x2="69" y2="32" stroke="#fde047" strokeWidth="1.2" strokeDasharray="3 2" />
              <circle cx="48" cy="49" r="3" fill="#f97316" />
              <circle cx="48" cy="49" r="1.5" fill="#fde047" />
            </>
          ) : (
            <>
              {/* Left & Right Isometric Walls */}
              <polygon points="26,42 48,52 48,31 26,22" fill={wallLight} stroke="#1a1109" strokeWidth="0.8" />
              <polygon points="70,42 48,52 48,31 70,22" fill={wallDark} stroke="#1a1109" strokeWidth="0.8" />
              {isIraqi ? (
                <>
                  {/* Iraqi Terraced Brick Roof + Turquoise Dome + Barjeel Windcatcher */}
                  <polygon points="48,13 72,22 48,31 24,22" fill={wallLight} stroke={trimHex} strokeWidth="1" />
                  <path d="M38,22 Q48,8 58,22 Z" fill={roofHex} stroke="#fde047" strokeWidth="0.8" />
                  <rect x="56" y="10" width="7" height="11" fill={wallDark} stroke={trimHex} strokeWidth="0.7" />
                </>
              ) : isShami ? (
                <>
                  {/* Shami Ablaq Stone Stripes + Stone Vaulted Dome */}
                  <line x1="26" y1="30" x2="48" y2="39" stroke="#3f3b36" strokeWidth="2" />
                  <line x1="48" y1="39" x2="70" y2="30" stroke="#2c2824" strokeWidth="2" />
                  <polygon points="48,14 72,22 48,31 24,22" fill={wallLight} stroke={trimHex} strokeWidth="1" />
                  <path d="M37,22 Q48,9 59,22 Z" fill={roofHex} stroke="#e7dfd1" strokeWidth="0.9" />
                </>
              ) : (
                <>
                  {/* Hejazi Tall Coral-Stone Tower + Projecting Wooden Roshan Balconies */}
                  <polygon points="48,12 72,22 48,31 24,22" fill={wallLight} stroke={trimHex} strokeWidth="1" />
                  <rect x="30" y="25" width="12" height="9" fill={trimHex} stroke="#fde047" strokeWidth="0.7" />
                  <rect x="54" y="26" width="10" height="8" fill={trimHex} stroke="#fde047" strokeWidth="0.7" />
                  {isHejazi && <rect x="44" y="11" width="8" height="8" fill={wallLight} stroke={trimHex} strokeWidth="0.7" />}
                </>
              )}
              {/* Warm Lit Windows & Door */}
              <polygon points="33,38 39,41 39,34 33,31" fill="#fde047" />
              <polygon points="55,46 61,43 61,34 55,37" fill="#78350f" stroke="#fde047" strokeWidth="0.5" />
              {/* Courtyard Palm / Citrus Shrub */}
              <circle cx="23" cy="41" r="4" fill="#15803d" />
              <circle cx="22" cy="39.5" r="2.5" fill="#4ade80" />
            </>
          )}
        </g>
      )}

      {kind === 'farm' && (
        <g>
          {/* Irrigated Golden Wheat Furrows */}
          <polygon points="48,54 76,41 48,28 20,41" fill="#3f6212" />
          <line x1="28" y1="41" x2="48" y2="50" stroke="#facc15" strokeWidth="2.2" />
          <line x1="34" y1="38" x2="54" y2="47" stroke="#eab308" strokeWidth="2.2" />
          <line x1="40" y1="35" x2="60" y2="44" stroke="#facc15" strokeWidth="2.2" />
          <line x1="46" y1="32" x2="66" y2="41" stroke="#38bdf8" strokeWidth="1.8" />
          {/* Granary Barn & Waterwheel / Windmill */}
          <polygon points="26,37 40,43 40,28 26,22" fill={wallLight} stroke="#1a1109" strokeWidth="0.7" />
          <polygon points="52,37 40,43 40,28 52,22" fill={wallDark} stroke="#1a1109" strokeWidth="0.7" />
          <polygon points="39,14 54,22 39,28 24,22" fill={roofHex} stroke={trimHex} strokeWidth="0.8" />
          {/* Windmill / Norias Wheel */}
          <circle cx="62" cy="28" r="7" fill="none" stroke="#fde047" strokeWidth="1.3" />
          <line x1="55" y1="28" x2="69" y2="28" stroke="#fde047" strokeWidth="1" />
          <line x1="62" y1="21" x2="62" y2="35" stroke="#fde047" strokeWidth="1" />
        </g>
      )}

      {kind === 'lumber_camp' && (
        <g>
          {/* Timber Shed */}
          <polygon points="24,42 44,50 44,33 24,25" fill={trimHex} stroke="#1a1109" strokeWidth="0.8" />
          <polygon points="62,42 44,50 44,33 62,25" fill={wallDark} stroke="#1a1109" strokeWidth="0.8" />
          <polygon points="43,17 65,25 43,33 21,25" fill={roofHex} stroke="#fde047" strokeWidth="0.8" />
          {/* Stacked Logs */}
          <ellipse cx="62" cy="43" rx="7" ry="3.2" fill="#92400e" stroke="#fde68a" strokeWidth="0.8" />
          <ellipse cx="64" cy="39.5" rx="6.5" ry="3" fill="#b45309" stroke="#fde68a" strokeWidth="0.8" />
          {/* Pine Tree */}
          <polygon points="24,14 31,28 17,28" fill="#166534" />
          <polygon points="24,9 29,20 19,20" fill="#22c55e" />
        </g>
      )}

      {kind === 'quarry' && (
        <g>
          {/* Stepped Stone Pit & Marble Blocks */}
          <polygon points="48,53 74,41 48,30 22,41" fill="#475569" stroke="#94a3b8" strokeWidth="0.9" />
          <polygon points="48,48 66,40 48,33 30,40" fill="#1e293b" />
          {/* Cut Stone & Gold Vein */}
          <rect x="28" y="29" width="12" height="9" fill="#cbd5e1" stroke="#334155" strokeWidth="0.8" />
          <rect x="33" y="23" width="11" height="8" fill="#e2e8f0" stroke="#334155" strokeWidth="0.8" />
          {/* Wooden Crane Derrick */}
          <line x1="56" y1="43" x2="56" y2="14" stroke={trimHex} strokeWidth="2.4" />
          <line x1="56" y1="15" x2="72" y2="22" stroke="#f59e0b" strokeWidth="2" />
          <line x1="70" y1="22" x2="70" y2="35" stroke="#fde047" strokeWidth="1" />
          <polygon points="66,35 74,35 72,41 68,41" fill="#facc15" />
        </g>
      )}

      {kind === 'market' && (
        <g>
          {/* Bazaar Hall */}
          <polygon points="24,42 48,52 48,31 24,22" fill={wallLight} stroke="#1a1109" strokeWidth="0.8" />
          <polygon points="72,42 48,52 48,31 72,22" fill={wallDark} stroke="#1a1109" strokeWidth="0.8" />
          {/* Striped Caravan Awning Canopies */}
          <polygon points="48,13 75,23 48,32 21,23" fill={roofHex} stroke="#fde047" strokeWidth="1" />
          <polygon points="48,13 62,27 48,32 34,27" fill="#f59e0b" opacity="0.85" />
          {/* Gold Dome / Finial */}
          <circle cx="48" cy="12" r="3.5" fill="#fde047" />
          {/* Spice & Gold Crates */}
          <rect x="29" y="42" width="6" height="5" fill="#d97706" stroke="#fde047" strokeWidth="0.6" />
          <rect x="60" y="42" width="6" height="5" fill="#eab308" stroke="#fef08a" strokeWidth="0.6" />
        </g>
      )}

      {kind === 'barracks' && (
        <g>
          {/* Fortified Garrison Walls */}
          <polygon points="22,43 48,53 48,30 22,20" fill={wallLight} stroke="#1a1109" strokeWidth="0.9" />
          <polygon points="74,43 48,53 48,30 74,20" fill={wallDark} stroke="#1a1109" strokeWidth="0.9" />
          <polygon points="48,11 75,20 48,30 21,20" fill={roofHex} stroke="#f87171" strokeWidth="1" />
          {/* Crenelated Battlement Towers */}
          <rect x="20" y="16" width="8" height="24" fill={wallDark} stroke="#1a1109" strokeWidth="0.7" />
          <rect x="68" y="16" width="8" height="24" fill={wallDark} stroke="#1a1109" strokeWidth="0.7" />
          {/* Crossed Swords / Shield Crest */}
          <polygon points="48,22 54,26 48,34 42,26" fill="#dc2626" stroke="#fde047" strokeWidth="1" />
        </g>
      )}

      {kind === 'watchtower' && (
        <g>
          {/* Tall Isometric Defense Tower */}
          <polygon points="36,48 48,54 48,16 36,11" fill={wallLight} stroke="#1a1109" strokeWidth="0.9" />
          <polygon points="60,48 48,54 48,16 60,11" fill={wallDark} stroke="#1a1109" strokeWidth="0.9" />
          {/* Spire / Turret Roof */}
          <polygon points="48,3 64,12 48,18 32,12" fill={roofHex} stroke="#fde047" strokeWidth="1" />
          {/* Beacon Brazier Glow */}
          <circle cx="48" cy="24" r="3" fill="#fde047" />
          <circle cx="48" cy="24" r="5" fill="#f59e0b" opacity="0.35" />
        </g>
      )}

      {kind === 'temple' && (
        <g>
          {/* Sanctuary Base */}
          <polygon points="24,44 48,54 48,30 24,20" fill={wallLight} stroke="#1a1109" strokeWidth="0.9" />
          <polygon points="72,44 48,54 48,30 72,20" fill={wallDark} stroke="#1a1109" strokeWidth="0.9" />
          {/* Grand Golden / Cultural Dome & Minaret Spire */}
          <path d="M33,24 Q48,4 63,24 Z" fill={roofHex} stroke="#fde047" strokeWidth="1.1" />
          <circle cx="48" cy="6" r="2.5" fill="#fde047" />
          {/* Slender Minaret / Bell / Pagoda Spire */}
          <rect x="67" y="8" width="5" height="32" fill={wallLight} stroke="#fde047" strokeWidth="0.7" />
          <polygon points="69.5,3 74,9 65,9" fill="#fde047" />
        </g>
      )}

      {kind === 'keep' && (
        <g>
          {/* Outer Citadel Bastions */}
          <rect x="18" y="20" width="10" height="24" fill={wallDark} stroke="#1a1109" strokeWidth="0.8" />
          <rect x="68" y="20" width="10" height="24" fill={wallDark} stroke="#1a1109" strokeWidth="0.8" />
          {/* Central Royal Keep */}
          <polygon points="26,45 48,55 48,24 26,15" fill={wallLight} stroke="#1a1109" strokeWidth="0.9" />
          <polygon points="70,45 48,55 48,24 70,15" fill={wallDark} stroke="#1a1109" strokeWidth="0.9" />
          {/* Royal Crown Roof */}
          <polygon points="48,5 72,15 48,25 24,15" fill={roofHex} stroke="#fde047" strokeWidth="1.2" />
          {/* Gatehouse Arch */}
          <polygon points="43,52 53,52 53,40 43,40" fill="#17110a" stroke="#fde047" strokeWidth="0.8" />
          {/* Royal Banner */}
          <circle cx="48" cy="5" r="2.8" fill="#fde047" />
        </g>
      )}

      {kind === 'livestock_ranch' && (
        <g>
          {/* Green Pasture & Wooden Corral Fence */}
          <polygon points="48,54 78,41 48,28 18,41" fill="#365314" stroke="#a16207" strokeWidth="1" />
          {/* Shearing & Cotton Weaving Barn */}
          <polygon points="24,38 42,46 42,29 24,21" fill={wallLight} stroke="#1a1109" strokeWidth="0.8" />
          <polygon points="56,38 42,46 42,29 56,21" fill={wallDark} stroke="#1a1109" strokeWidth="0.8" />
          <polygon points="40,13 58,21 40,29 22,21" fill={roofHex} stroke={trimHex} strokeWidth="0.8" />
          {/* White Fluffy Sheep & Cotton Bolls */}
          <ellipse cx="55" cy="43" rx="5.5" ry="3.6" fill="#f8fafc" stroke="#475569" strokeWidth="0.7" />
          <circle cx="59" cy="42" r="2" fill="#1e293b" />
          <ellipse cx="64" cy="38" rx="5" ry="3.2" fill="#f1f5f9" stroke="#475569" strokeWidth="0.7" />
          <circle cx="67.5" cy="37" r="1.8" fill="#1e293b" />
          {/* Rolled Dyed Cloth Bale */}
          <rect x="33" y="44" width="9" height="4.5" rx="2" fill="#c084fc" stroke="#fde047" strokeWidth="0.7" />
        </g>
      )}

      {kind === 'bedouin_tent' && (
        <g>
          {/* Woven Desert Carpet Plinth */}
          <polygon points="48,54 76,41 48,29 20,41" fill="#7f1d1d" stroke="#fde047" strokeWidth="0.7" />
          {/* Authentic Multi-Pole Goat-Hair Bayt al-Sha'r Tent */}
          <polygon points="18,41 34,20 48,24 62,18 78,41 48,51" fill="#29221c" stroke="#a16207" strokeWidth="0.9" />
          {/* Traditional Crimson & Ivory Sadu Woven Stripes */}
          <line x1="23" y1="36" x2="73" y2="36" stroke="#dc2626" strokeWidth="2.2" />
          <line x1="26" y1="32" x2="70" y2="32" stroke="#fef3c7" strokeWidth="1.2" strokeDasharray="3 2" />
          {/* Tent Guy Ropes & Brass Finials */}
          <line x1="34" y1="20" x2="14" y2="43" stroke="#d6c3a5" strokeWidth="0.8" />
          <line x1="62" y1="18" x2="82" y2="43" stroke="#d6c3a5" strokeWidth="0.8" />
          <circle cx="34" cy="19" r="1.8" fill="#fde047" />
          <circle cx="62" cy="17" r="1.8" fill="#fde047" />
          {/* Warm Hospitality Coffee Hearth Fire in Front */}
          <circle cx="48" cy="49" r="3.2" fill="#f97316" />
          <circle cx="48" cy="49" r="1.8" fill="#fde047" />
        </g>
      )}

      {kind === 'war_tent' && (
        <g>
          {/* Octagonal Military Campaign Pavilion Body */}
          <polygon points="24,44 48,54 72,44 72,27 48,35 24,27" fill="#fef3c7" stroke="#b45309" strokeWidth="0.9" />
          {/* Striped Conical Pavilion Canopy */}
          <polygon points="48,7 75,27 48,35 21,27" fill={roofHex} stroke="#fde047" strokeWidth="1" />
          <polygon points="48,7 61,31 48,35 35,31" fill="#fde047" opacity="0.85" />
          {/* Golden Spear Finial & Pennant */}
          <circle cx="48" cy="6" r="2.6" fill="#fde047" />
          {/* Crossed Spears & Heraldic Shield at Entrance */}
          <line x1="36" y1="49" x2="44" y2="31" stroke="#fde047" strokeWidth="1.2" />
          <line x1="60" y1="49" x2="52" y2="31" stroke="#fde047" strokeWidth="1.2" />
          <polygon points="48,35 53,39 48,47 43,39" fill="#dc2626" stroke="#fde047" strokeWidth="0.9" />
        </g>
      )}

      {kind === 'horse_stable' && (
        <g>
          {/* Golden Sand Taming Ring & Wooden Paddock Rails */}
          <ellipse cx="58" cy="43" rx="16" ry="7" fill="#d4a656" stroke="#78350f" strokeWidth="1.1" />
          <line x1="58" y1="43" x2="58" y2="34" stroke="#78350f" strokeWidth="1.5" />
          <circle cx="58" cy="34" r="1.5" fill="#fde047" />
          {/* Arched Cavalry Stables Hall */}
          <polygon points="20,40 44,49 44,30 20,21" fill={wallLight} stroke="#1a1109" strokeWidth="0.8" />
          <polygon points="58,40 44,49 44,30 58,21" fill={wallDark} stroke="#1a1109" strokeWidth="0.8" />
          <polygon points="39,13 60,21 39,30 18,21" fill={roofHex} stroke="#fde047" strokeWidth="0.9" />
          {/* Noble Arabian Stallion Silhouette in the Taming Ring */}
          <polygon points="53,44 56,37 61,35 64,38 62,44 65,47 51,47" fill="#9a3412" stroke="#fed7aa" strokeWidth="0.6" />
          <circle cx="62" cy="36.5" r="1" fill="#fde047" />
        </g>
      )}

      {kind === 'stone_wall' && (
        <g>
          {/* Heavy Battlement Stone Curtain Wall */}
          <polygon points="18,45 78,45 78,24 18,24" fill={wallLight} stroke="#1a1109" strokeWidth="1" />
          <polygon points="78,45 84,41 84,21 78,24" fill={wallDark} stroke="#1a1109" strokeWidth="0.9" />
          <polygon points="18,24 24,20 84,20 78,24" fill={wallDark} stroke="#785421" strokeWidth="0.8" />
          {/* Crenellated Merlons along Top Parapet */}
          <rect x="20" y="17" width="9" height="7" fill={wallLight} stroke="#1a1109" strokeWidth="0.8" />
          <rect x="34" y="17" width="9" height="7" fill={wallLight} stroke="#1a1109" strokeWidth="0.8" />
          <rect x="48" y="17" width="9" height="7" fill={wallLight} stroke="#1a1109" strokeWidth="0.8" />
          <rect x="62" y="17" width="9" height="7" fill={wallLight} stroke="#1a1109" strokeWidth="0.8" />
          {/* Stone Masonry Courses & Arrow Slits */}
          <line x1="18" y1="33" x2="78" y2="33" stroke="#1a1109" strokeWidth="0.7" opacity="0.5" />
          <line x1="18" y1="40" x2="78" y2="40" stroke="#1a1109" strokeWidth="0.7" opacity="0.5" />
          <rect x="31" y="29" width="2.5" height="7" fill="#17110a" />
          <rect x="62" y="29" width="2.5" height="7" fill="#17110a" />
        </g>
      )}

      {kind === 'gatehouse' && (
        <g>
          {/* Twin Flanking Bastion Towers */}
          <polygon points="16,47 34,47 34,15 16,15" fill={wallLight} stroke="#1a1109" strokeWidth="1" />
          <polygon points="62,47 80,47 80,15 62,15" fill={wallDark} stroke="#1a1109" strokeWidth="1" />
          {/* Central Gate Archway Bridge */}
          <rect x="34" y="20" width="28" height="27" fill={wallLight} stroke="#1a1109" strokeWidth="1" />
          {/* Pointed Islamic Archway & Iron Portcullis Bars */}
          <path d="M39,47 L39,33 Q48,25 57,33 L57,47 Z" fill="#17110a" stroke="#fde047" strokeWidth="1" />
          <line x1="44" y1="30" x2="44" y2="47" stroke="#94a3b8" strokeWidth="1.2" />
          <line x1="48" y1="28" x2="48" y2="47" stroke="#94a3b8" strokeWidth="1.2" />
          <line x1="52" y1="30" x2="52" y2="47" stroke="#94a3b8" strokeWidth="1.2" />
          <line x1="39" y1="37" x2="57" y2="37" stroke="#94a3b8" strokeWidth="1.1" />
          {/* Tower Battlement Caps & War Banners */}
          <polygon points="14,15 25,8 36,15" fill={roofHex} stroke="#fde047" strokeWidth="0.8" />
          <polygon points="60,15 71,8 82,15" fill={roofHex} stroke="#fde047" strokeWidth="0.8" />
          <circle cx="48" cy="23" r="2.2" fill="#f97316" />
        </g>
      )}

      {kind === 'moat_trench' && (
        <g>
          {/* Excavated Defensive Trench Basin */}
          <polygon points="48,54 80,41 48,28 16,41" fill="#3b2613" stroke="#785421" strokeWidth="1" />
          <polygon points="48,50 72,41 48,32 24,41" fill="#1d4e66" stroke="#38bdf8" strokeWidth="0.9" />
          {/* Water Ripples */}
          <line x1="36" y1="40" x2="54" y2="40" stroke="#7dd3fc" strokeWidth="1.2" opacity="0.8" />
          <line x1="43" y1="44" x2="60" y2="44" stroke="#7dd3fc" strokeWidth="1.1" opacity="0.7" />
          {/* Sharpened Wooden Cheval-de-Frise Defensive Stakes */}
          <line x1="25" y1="38" x2="29" y2="27" stroke="#d97706" strokeWidth="2.2" />
          <line x1="36" y1="34" x2="40" y2="24" stroke="#d97706" strokeWidth="2.2" />
          <line x1="56" y1="34" x2="60" y2="24" stroke="#d97706" strokeWidth="2.2" />
          <line x1="67" y1="38" x2="71" y2="27" stroke="#d97706" strokeWidth="2.2" />
          <polygon points="29,25 27,29 31,29" fill="#fef3c7" />
          <polygon points="40,22 38,26 42,26" fill="#fef3c7" />
          <polygon points="60,22 58,26 62,26" fill="#fef3c7" />
          <polygon points="71,25 69,29 73,29" fill="#fef3c7" />
        </g>
      )}

      {kind === 'siege_workshop' && (
        <g>
          {/* Timber Engineering Shed & Forge */}
          <polygon points="20,43 46,52 46,30 20,21" fill={wallLight} stroke="#1a1109" strokeWidth="0.9" />
          <polygon points="64,43 46,52 46,30 64,21" fill={wallDark} stroke="#1a1109" strokeWidth="0.9" />
          <polygon points="42,13 66,21 42,30 18,21" fill={roofHex} stroke="#fde047" strokeWidth="1" />
          {/* Trebuchet Arm Under Construction Beside Workshop */}
          <line x1="64" y1="46" x2="74" y2="23" stroke="#92400e" strokeWidth="2.4" />
          <line x1="58" y1="33" x2="82" y2="18" stroke="#d97706" strokeWidth="2.2" />
          <circle cx="82" cy="18" r="2.6" fill="#f97316" stroke="#fde047" strokeWidth="0.8" />
          {/* Stacked Siege Boulders & Iron Wheel */}
          <circle cx="30" cy="45" r="3.5" fill="#64748b" stroke="#cbd5e1" strokeWidth="0.8" />
          <circle cx="36" cy="47" r="3" fill="#475569" stroke="#cbd5e1" strokeWidth="0.8" />
          <circle cx="56" cy="46" r="4" fill="none" stroke="#fde047" strokeWidth="1.4" />
        </g>
      )}
    </svg>
  );
};

export const RTSClientInstance: React.FC<RTSClientInstanceProps> = ({
  clientLabel,
  isSplitView = false,
  onToggleSplitView,
}) => {
  const {
    connected,
    playerId,
    tickRateHz,
    rttMs,
    worldState,
    worldRef,
    lastAckMessage,
    bytesPerSec,
    syncCamera,
    placeStructure,
    placeFortBatch,
    setCulture,
    upgradeStructure,
    spawnUnit,
    moveUnits,
    dispatchAtlasMarch,
    attackTarget,
    setUnitStance,
    repairStructure,
    toggleGate,
    deployPveFronts,
    reclaimKeep,
    tradeResource,
    resetWorld,
    setClimate,
    hydrateFromCloud,
    updatePlayerName,
  } = useMultiplayerClient({ clientLabel });

  const {
    user,
    cloudStatus,
    lastSyncedAt,
    cloudStructuresCount,
    cloudUnitsCount,
    isSyncing,
    signInWithGoogle,
    signOutFromCloud,
    saveCurrentWorldToCloud,
    persistPlacedStructure,
    persistSpawnedUnit,
    resetCloudWorld,
  } = useCloudSync({
    playerId,
    worldRef,
    onHydrateServerFromCloud: hydrateFromCloud,
  });

  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);
  const [selectedEnemyUnitId, setSelectedEnemyUnitId] = useState<string | null>(null);
  const [commandMode, setCommandMode] = useState<'normal' | 'attack_move'>('normal');
  const [sfxMuted, setSfxMuted] = useState<boolean>(() => soundFx.isMuted());
  const [underAttackAlert, setUnderAttackAlert] = useState<{
    x: number;
    z: number;
    atMs: number;
    labelAr?: string;
    tone?: 'danger' | 'loot' | 'recovered';
  } | null>(null);
  const [pveModalOpen, setPveModalOpen] = useState<boolean>(false);
  const [pveDiff, setPveDiff] = useState<PveDifficulty>('balanced');
  const [pveStrongholdCount, setPveStrongholdCount] = useState<number>(3);
  const [buildMode, setBuildMode] = useState<StructureKind | null>(null);
  const [buildRotationY, setBuildRotationY] = useState<number>(0);
  const [showBuildGrid, setShowBuildGrid] = useState<boolean>(true);
  const [fortLineMode, setFortLineMode] = useState<boolean>(true);
  const [wallLineWithTowers, setWallLineWithTowers] = useState<boolean>(true);
  const [confirmBuildTrigger, setConfirmBuildTrigger] = useState<number>(0);
  const [cancelLineTrigger, setCancelLineTrigger] = useState<number>(0);
  const [nudgeBuildCommand, setNudgeBuildCommand] = useState<BuildGridNudgeCommand | null>(null);
  const [buildPreview, setBuildPreview] = useState<BuildPreviewStatus | null>(null);
  const [inspectedBuildKind, setInspectedBuildKind] = useState<StructureKind | null>('house');
  const [selectedCulture, setSelectedCulture] = useState<CultureKind>('iraqi_mesopotamian');
  const [placementCultureOverride, setPlacementCultureOverride] =
    useState<CultureKind | null>(null);
  const [autoMatchBiomeCulture, setAutoMatchBiomeCulture] = useState<boolean>(false);
  const [convertExistingOnCultureChange, setConvertExistingOnCultureChange] = useState(false);
  const [touchMode, setTouchMode] = useState<TouchInteractionMode>('pan');
  const [qualityMode, setQualityMode] = useState<RenderQualityMode>('balanced');
  const [pixelScale, setPixelScale] = useState<PixelScaleMode>(2);
  const [projectionMode, setProjectionMode] =
    useState<CameraProjectionMode>('isometric_2000s');
  const [activePopup, setActivePopup] = useState<PopupModalKind>(null);
  const [buildCategory, setBuildCategory] = useState<BuildCategoryTab>('all');
  const [trainingQueue, setTrainingQueue] = useState<QueuedTrainingItem[]>([]);
  const [requestedTrainingUnitKind, setRequestedTrainingUnitKind] =
    useState<UnitKind | null>(null);
  const lastBuildTapRef = useRef<{ kind: StructureKind; time: number } | null>(null);
  const [resourceFilter, setResourceFilter] = useState<ResourceKind | 'all'>('all');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMinimapMobile, setShowMinimapMobile] = useState(false);
  const [isDeckCollapsed, setIsDeckCollapsed] = useState(false);
  const [showNudgePad, setShowNudgePad] = useState(false);

  useEffect(() => {
    if (!buildMode) {
      setShowNudgePad(false);
    }
  }, [buildMode]);

  useEffect(() => {
    if (selectedStructureId || selectedEnemyUnitId || selectedUnitIds.length > 0) {
      setIsDeckCollapsed(false);
    }
  }, [selectedStructureId, selectedEnemyUnitId, selectedUnitIds.length]);

  useEffect(() => {
    if (selectedUnitIds.length === 0 && commandMode !== 'normal') {
      setCommandMode('normal');
    }
  }, [selectedUnitIds.length, commandMode]);

  useEffect(() => {
    if (!underAttackAlert) return;
    const timer = window.setTimeout(() => {
      setUnderAttackAlert((prev) =>
        prev && Date.now() - prev.atMs >= 8500 ? null : prev
      );
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [underAttackAlert]);
  const [hoverTerrain, setHoverTerrain] = useState<HoverTerrainInfo>({
    x: 0,
    z: 0,
    elevation: 0,
    biome: 'fertile_plains',
  });
  const [cameraCommand, setCameraCommand] = useState<CameraPresetCommand | null>(null);
  const [strategicMap, setStrategicMap] = useState<{
    open: boolean;
    centerX: number;
    centerZ: number;
    spanM: number;
    mode: 'jump' | 'march';
    waypoints: MarchWaypoint[];
  }>({
    open: false,
    centerX: 4800,
    centerZ: 3200,
    spanM: 3_200,
    mode: 'jump',
    waypoints: [],
  });
  const [strategicFlyTo, setStrategicFlyTo] = useState<StrategicMapFlyToCommand | null>(null);
  const lastMapTransitionRef = useRef<number>(0);

  const [perfStats, setPerfStats] = useState<RenderPerfStats>({
    fps: 60,
    drawCalls: 18,
    triangles: 1200,
    geometriesInVram: 16,
    texturesInVram: 3,
    resolutionLabel: '420×260px',
  });

  // Full-Screen API Synchronization & Keyboard Shortcuts (F for Fullscreen, Escape to close Pop-ups)
  const toggleFullscreen = useCallback(async () => {
    try {
      const docWithVendor = document as Document & {
        webkitFullscreenElement?: Element;
        webkitExitFullscreen?: () => Promise<void>;
      };
      const elemWithVendor = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };

      const currentlyFull = Boolean(
        document.fullscreenElement || docWithVendor.webkitFullscreenElement
      );

      if (!currentlyFull) {
        if (elemWithVendor.requestFullscreen) {
          await elemWithVendor.requestFullscreen();
        } else if (elemWithVendor.webkitRequestFullscreen) {
          await elemWithVendor.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (docWithVendor.webkitExitFullscreen) {
          await docWithVendor.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Fullscreen toggle error:', err);
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const docWithVendor = document as Document & {
        webkitFullscreenElement?: Element;
      };
      setIsFullscreen(
        Boolean(document.fullscreenElement || docWithVendor.webkitFullscreenElement)
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'KeyF') {
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        setStrategicMap((prev) => {
          const now = performance.now();
          if (now - lastMapTransitionRef.current < 250) return prev;
          lastMapTransitionRef.current = now;
          if (prev.open) {
            return { ...prev, open: false };
          }
          const cam = worldRef.current?.players?.[playerId ?? '']?.camera;
          return {
            ...prev,
            open: true,
            centerX: cam?.targetX ?? 4800,
            centerZ: cam?.targetZ ?? 3200,
            spanM: 64_000,
          };
        });
      } else if (e.code === 'Escape') {
        setActivePopup(null);
        setBuildMode(null);
        setCommandMode('normal');
        setSelectedEnemyUnitId(null);
        setPveModalOpen(false);
        setStrategicMap((prev) => (prev.open ? { ...prev, open: false } : prev));
      }
    };

    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [toggleFullscreen, playerId, worldRef]);

  const myPlayer = playerId && worldState?.players ? worldState.players[playerId] : null;
  const playersList = worldState ? Object.values(worldState.players ?? {}) : [];

  // Kingdom Heraldry Customization State (Name, Primary Color, Secondary Color, Flag Pattern)
  const [customKingdomName, setCustomKingdomName] = useState<string>('');
  const [customPrimaryColor, setCustomPrimaryColor] = useState<string>('#0d9488');
  const [customSecondaryColor, setCustomSecondaryColor] = useState<string>('#fbbf24');
  const [customBannerPattern, setCustomBannerPattern] =
    useState<BannerPatternKind>('crescent_star');
  const heraldryInitRef = useRef(false);

  useEffect(() => {
    if (myPlayer && !heraldryInitRef.current) {
      heraldryInitRef.current = true;
      setCustomKingdomName(myPlayer.name || 'مملكة الحصون');
      setCustomPrimaryColor(myPlayer.color || '#0d9488');
      setCustomSecondaryColor(myPlayer.secondaryColor || '#fbbf24');
      setCustomBannerPattern(myPlayer.bannerPattern || 'crescent_star');
    }
  }, [myPlayer]);

  const applyHeraldryCustomization = useCallback(
    (overrides?: {
      name?: string;
      primaryColor?: string;
      secondaryColor?: string;
      bannerPattern?: BannerPatternKind;
    }) => {
      const nextName = (overrides?.name ?? customKingdomName).trim() || myPlayer?.name || 'قائد الحصون';
      const nextPrimary = overrides?.primaryColor ?? customPrimaryColor;
      const nextSecondary = overrides?.secondaryColor ?? customSecondaryColor;
      const nextPattern = overrides?.bannerPattern ?? customBannerPattern;

      updatePlayerName(nextName, {
        primaryColor: nextPrimary,
        secondaryColor: nextSecondary,
        bannerPattern: nextPattern,
      });
    },
    [
      customKingdomName,
      customPrimaryColor,
      customSecondaryColor,
      customBannerPattern,
      myPlayer?.name,
      updatePlayerName,
    ]
  );
  const myUnits = useMemo(
    () =>
      worldState && playerId
        ? Object.values(worldState.units ?? {}).filter((u) => u.ownerId === playerId)
        : [],
    [worldState, playerId]
  );
  const myStructures = useMemo(
    () =>
      worldState && playerId
        ? Object.values(worldState.structures ?? {}).filter((s) => s.ownerId === playerId)
        : [],
    [worldState, playerId]
  );

  const selectedStructure =
    selectedStructureId && worldState?.structures
      ? worldState.structures[selectedStructureId]
      : null;

  const selectedEnemyUnit =
    selectedEnemyUnitId && worldState?.units && worldState.units[selectedEnemyUnitId]?.hp > 0
      ? worldState.units[selectedEnemyUnitId]
      : null;

  const pveEnemyFronts = useMemo(
    () => playersList.filter((p) => Boolean(p.isAi || p.isBandit)),
    [playersList]
  );
  const alivePveFronts = useMemo(
    () => pveEnemyFronts.filter((p) => !p.isDefeated),
    [pveEnemyFronts]
  );
  const aliveBanditFronts = useMemo(
    () => alivePveFronts.filter((p) => Boolean(p.isBandit)),
    [alivePveFronts]
  );
  const totalBanditFronts = useMemo(
    () => pveEnemyFronts.filter((p) => Boolean(p.isBandit)),
    [pveEnemyFronts]
  );
  const aliveGovernedCities = useMemo(
    () => alivePveFronts.filter((p) => !p.isBandit),
    [alivePveFronts]
  );
  const alliedCommanders = useMemo(
    () => playersList.filter((p) => p.id !== playerId && !p.isAi && !p.isBandit),
    [playersList, playerId]
  );
  const myKeep = useMemo(
    () => myStructures.find((s) => s.kind === 'keep' && s.hp > 0) ?? myStructures[0] ?? null,
    [myStructures]
  );
  const hasMyKeep = Boolean(myKeep && myKeep.kind === 'keep' && myKeep.hp > 0);
  const militaryUnits = useMemo(
    () => myUnits.filter((u) => u.kind !== 'worker'),
    [myUnits]
  );

  const pveInfo = worldState?.pveTheater;
  const pveElapsedSec = useMemo(() => {
    if (!pveInfo) return 0;
    const nowMs = worldState?.serverTime ?? Date.now();
    return Math.max(0, Math.floor((nowMs - pveInfo.startedAtMs) / 1000));
  }, [pveInfo, worldState?.serverTime]);

  const activeClimateId: ClimateKind = worldState?.climate ?? 'temperate_clear';
  const activeClimate = CLIMATE_SPECS[activeClimateId] ?? CLIMATE_SPECS.temperate_clear;
  const activeBiome = BIOME_SPECS[hoverTerrain.biome] ?? BIOME_SPECS.fertile_plains;

  const hoverLocalClimateId = useMemo(
    () => getEffectiveClimateAt(hoverTerrain.x, hoverTerrain.z, activeClimateId),
    [hoverTerrain.x, hoverTerrain.z, activeClimateId]
  );
  const hoverLocalClimate =
    CLIMATE_SPECS[hoverLocalClimateId] ?? CLIMATE_SPECS.temperate_clear;
  const hoverTempC = useMemo(
    () => getTemperatureCAt(hoverTerrain.x, hoverTerrain.z, Math.max(0, hoverTerrain.elevation)),
    [hoverTerrain.x, hoverTerrain.z, hoverTerrain.elevation]
  );
  const hoverHumidityPct = useMemo(
    () => Math.round(getMoistureAt(hoverTerrain.x, hoverTerrain.z) * 100),
    [hoverTerrain.x, hoverTerrain.z]
  );
  const hoverClimateZoneAr = useMemo(
    () => getClimateZoneLabelAr(hoverTerrain.x, hoverTerrain.z),
    [hoverTerrain.x, hoverTerrain.z]
  );

  const activeCulture: CultureKind = normalizeCultureKind(myPlayer?.culture ?? selectedCulture);
  const activeCultureSpec = CULTURE_SPECS[activeCulture] ?? CULTURE_SPECS.iraqi_mesopotamian;

  // Determine which architectural culture will be used when placing a new building at cursor
  const effectiveBuildCulture: CultureKind = useMemo(() => {
    if (autoMatchBiomeCulture) {
      return getRecommendedCultureForBiome(hoverTerrain.biome, hoverLocalClimateId);
    }
    return placementCultureOverride ?? activeCulture;
  }, [autoMatchBiomeCulture, hoverTerrain.biome, hoverLocalClimateId, placementCultureOverride, activeCulture]);

  const hoverEnvFit = useMemo(
    () =>
      evaluateEnvironmentalFit(
        effectiveBuildCulture,
        hoverTerrain.biome,
        hoverLocalClimateId,
        1
      ),
    [effectiveBuildCulture, hoverTerrain.biome, hoverLocalClimateId]
  );

  const structBiomeCacheRef = useRef<Map<string, ReturnType<typeof getBiomeAt>>>(new Map());
  const structClimateCacheRef = useRef<Map<string, ClimateKind>>(new Map());

  // Complete Economy, Storage, Population & Environmental Adaptation Calculations (1:1 parity with server.ts)
  const economyStats = useMemo(() => {
    const passivePerMin: Record<ResourceKind, number> = {
      wood: 0,
      stone: 0,
      gold: 0,
      food: 0,
      cloth: 0,
      horses: 0,
    };
    const gatheringPerMin: Record<ResourceKind, number> = {
      wood: 0,
      stone: 0,
      gold: 0,
      food: 0,
      cloth: 0,
      horses: 0,
    };
    const workersByResource: Record<ResourceKind | 'idle' | 'moving' | 'building', number> = {
      wood: 0,
      stone: 0,
      gold: 0,
      food: 0,
      cloth: 0,
      horses: 0,
      idle: 0,
      moving: 0,
      building: 0,
    };

    let idealStructuresCount = 0;
    let compatibleStructuresCount = 0;
    let harshStructuresCount = 0;
    let farmsCount = 0;
    let housesCount = 0;

    const cachedBiomeFn = (sx: number, sz: number) => {
      const k = `${Math.round(sx)},${Math.round(sz)}`;
      let b = structBiomeCacheRef.current.get(k);
      if (b === undefined) {
        if (structBiomeCacheRef.current.size > 512) structBiomeCacheRef.current.clear();
        b = getBiomeAt(sx, sz);
        structBiomeCacheRef.current.set(k, b);
      }
      return b;
    };

    const localClimateFn = (sx: number, sz: number) => {
      const k = `${Math.round(sx)},${Math.round(sz)}_${activeClimateId}`;
      let c = structClimateCacheRef.current.get(k);
      if (c === undefined) {
        if (structClimateCacheRef.current.size > 512) structClimateCacheRef.current.clear();
        c = getEffectiveClimateAt(sx, sz, activeClimateId);
        structClimateCacheRef.current.set(k, c);
      }
      return c;
    };

    const urbanReport = evaluateKingdomUrbanization(
      myStructures,
      activeCulture,
      activeClimateId,
      cachedBiomeFn,
      localClimateFn
    );

    const popLifeReport = evaluatePopulationLife(
      myStructures,
      myUnits,
      activeCulture,
      activeClimateId,
      cachedBiomeFn,
      localClimateFn
    );

    const capacityReport = evaluateKingdomCapacity(
      myStructures,
      activeCulture,
      activeClimateId,
      cachedBiomeFn,
      localClimateFn
    );

    const myHouses = myStructures.filter(
      (s) =>
        (!s.isConstructing || s.level > 1) &&
        (s.kind === 'house' || s.kind === 'bedouin_tent')
    );

    for (const st of myStructures) {
      const spec = STRUCTURE_SPECS[st.kind];
      const stCulture = st.culture ?? activeCulture;
      const stBiome = cachedBiomeFn(st.x, st.z);
      const stLocalClimate = localClimateFn(st.x, st.z);
      const envFit = evaluateEnvironmentalFit(
        stCulture,
        stBiome,
        stLocalClimate,
        st.level
      );

      if (envFit.rating === 'ideal') idealStructuresCount += 1;
      else if (envFit.rating === 'harsh') harshStructuresCount += 1;
      else compatibleStructuresCount += 1;

      if (st.kind === 'house' || st.kind === 'bedouin_tent') {
        housesCount += 1;
      }
      if (
        st.kind === 'farm' ||
        st.kind === 'livestock_ranch' ||
        st.kind === 'horse_stable'
      ) {
        farmsCount += 1;
      }

      // Passive income matches server.ts: only completed structures generate passive resources
      if (st.isConstructing) continue;

      let farmSynergyMult = 1.0;
      if (
        st.kind === 'farm' ||
        st.kind === 'livestock_ranch' ||
        st.kind === 'horse_stable'
      ) {
        let nearbyDwellings = 0;
        for (const h of myHouses) {
          if (Math.hypot(st.x - h.x, st.z - h.z) <= 32) {
            nearbyDwellings += 1;
          }
        }
        if (st.kind === 'livestock_ranch' || st.kind === 'horse_stable') {
          for (const other of myStructures) {
            if (
              (!other.isConstructing || other.level > 1) &&
              (other.kind === 'farm' || other.kind === 'livestock_ranch') &&
              Math.hypot(st.x - other.x, st.z - other.z) <= 32
            ) {
              nearbyDwellings += 1;
            }
          }
        }
        farmSynergyMult =
          (1 + Math.min(3, nearbyDwellings) * 0.25) * urbanReport.farmingMultiplier;
      }

      const bonus = spec?.productionBonus;
      if (bonus) {
        const stClimateSpec = CLIMATE_SPECS[stLocalClimate] ?? activeClimate;
        const mult =
          st.level *
          stClimateSpec.harvestModifier *
          envFit.productionMultiplier *
          farmSynergyMult *
          popLifeReport.prosperityMultiplier;
        passivePerMin.wood += Math.round((bonus.wood ?? 0) * mult) * 30;
        passivePerMin.stone += Math.round((bonus.stone ?? 0) * mult) * 30;
        passivePerMin.gold += Math.round((bonus.gold ?? 0) * mult) * 30;
        passivePerMin.food += Math.round((bonus.food ?? 0) * mult) * 30;
        passivePerMin.cloth += Math.round((bonus.cloth ?? 0) * mult) * 30;
        passivePerMin.horses += Math.round((bonus.horses ?? 0) * mult) * 30;
      }
    }

    const resourceNodesMap = worldState?.resourceNodes ?? {};
    for (const u of myUnits) {
      if (u.state === 'gathering' && u.assignedResourceId) {
        const rNode = resourceNodesMap[u.assignedResourceId];
        if (rNode && rNode.amount > 0) {
          workersByResource[rNode.kind] += 1;
          const nodeBiome = BIOME_SPECS[getBiomeAt(rNode.x, rNode.z)];
          const biomeBonus =
            nodeBiome.harvestBonusKind === rNode.kind
              ? 1 + nodeBiome.harvestBonusPct / 100
              : 1.0;

          let campBonus = 1.0;
          for (const st of myStructures) {
            const dCamp = Math.hypot(st.x - rNode.x, st.z - rNode.z);
            if (dCamp <= 26) {
              if (
                st.kind === 'keep' ||
                (rNode.kind === 'wood' && st.kind === 'lumber_camp') ||
                ((rNode.kind === 'stone' || rNode.kind === 'gold') && st.kind === 'quarry') ||
                (rNode.kind === 'food' &&
                  (st.kind === 'house' ||
                    st.kind === 'farm' ||
                    st.kind === 'livestock_ranch' ||
                    st.kind === 'bedouin_tent')) ||
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
                const stCulture = st.culture ?? activeCulture;
                const campEnvFit = evaluateEnvironmentalFit(
                  stCulture,
                  getBiomeAt(st.x, st.z),
                  getEffectiveClimateAt(st.x, st.z, activeClimateId),
                  st.level
                );
                campBonus = Math.max(
                  campBonus,
                  1 + 0.15 * st.level * campEnvFit.campBonusMultiplier
                );
              }
            }
          }

          const baseYield = u.kind === 'worker' ? 9 : 4;
          const nodeClimateSpec =
            CLIMATE_SPECS[getEffectiveClimateAt(rNode.x, rNode.z, activeClimateId)] ??
            activeClimate;
          const yieldPerSec = Math.round(
            baseYield * biomeBonus * campBonus * nodeClimateSpec.harvestModifier
          );
          gatheringPerMin[rNode.kind] += yieldPerSec * 60;
        } else {
          workersByResource.idle += 1;
        }
      } else if (u.state === 'building') {
        workersByResource.building += 1;
      } else if (u.state === 'moving') {
        workersByResource.moving += 1;
      } else {
        workersByResource.idle += 1;
      }
    }

    const totalPerMin: Record<ResourceKind, number> = {
      wood: passivePerMin.wood + gatheringPerMin.wood,
      stone: passivePerMin.stone + gatheringPerMin.stone,
      gold: passivePerMin.gold + gatheringPerMin.gold,
      food: passivePerMin.food + gatheringPerMin.food,
      cloth: passivePerMin.cloth + gatheringPerMin.cloth,
      horses: passivePerMin.horses + gatheringPerMin.horses,
    };

    const {
      maxPopulation,
      civilianPopulation,
      storageCap,
      highestMarketLevel,
      sellGoldPer100,
      buyGoldPer100,
    } = capacityReport;

    return {
      passivePerMin,
      gatheringPerMin,
      totalPerMin,
      workersByResource,
      maxPopulation,
      civilianPopulation,
      storageCap,
      highestMarketLevel,
      sellGoldPer100,
      buyGoldPer100,
      idealStructuresCount,
      compatibleStructuresCount,
      harshStructuresCount,
      farmsCount,
      housesCount,
      urbanReport,
      popLifeReport,
    };
  }, [
    myStructures,
    myUnits,
    worldState?.resourceNodes,
    activeClimate.harvestModifier,
    activeClimateId,
    activeCulture,
  ]);

  const triggerCameraPreset = useCallback((preset: Omit<CameraPresetCommand, 'id'>) => {
    setCameraCommand({ id: Date.now() + Math.random(), ...preset });
  }, []);

  const openStrategicMapAt = useCallback(
    (wx: number, wz: number, initialSpanM = 3_200) => {
      const now = performance.now();
      if (now - lastMapTransitionRef.current < 420) return;
      lastMapTransitionRef.current = now;
      setActivePopup(null);
      setBuildMode(null);
      setShowMinimapMobile(false);
      setStrategicMap((prev) => ({
        ...prev,
        open: true,
        centerX: wx,
        centerZ: wz,
        spanM: initialSpanM,
      }));
    },
    []
  );

  const closeStrategicMapTo3D = useCallback(
    (targetX?: number, targetZ?: number, zoom = 520) => {
      const now = performance.now();
      if (now - lastMapTransitionRef.current < 420) return;
      lastMapTransitionRef.current = now;
      setStrategicMap((prev) => {
        const destX = typeof targetX === 'number' ? targetX : prev.centerX;
        const destZ = typeof targetZ === 'number' ? targetZ : prev.centerZ;
        triggerCameraPreset({ targetX: destX, targetZ: destZ, zoom });
        return { ...prev, open: false };
      });
    },
    [triggerCameraPreset]
  );

  const flyStrategicMapTo = useCallback((x: number, z: number, spanM?: number) => {
    setStrategicFlyTo({ x, z, spanM, nonce: Date.now() + Math.random() });
  }, []);

  const strategicMapViewCenter = useMemo(
    () => ({ x: strategicMap.centerX, z: strategicMap.centerZ }),
    [strategicMap.centerX, strategicMap.centerZ]
  );

  const handleZoomOutToStrategicMap = useCallback(
    (wx: number, wz: number) => openStrategicMapAt(wx, wz, 3_200),
    [openStrategicMapAt]
  );

  const handleStrategicMapViewChange = useCallback(
    (nextCenter: { x: number; z: number }, nextSpanM: number) =>
      setStrategicMap((prev) => ({
        ...prev,
        centerX: nextCenter.x,
        centerZ: nextCenter.z,
        spanM: nextSpanM,
      })),
    []
  );

  const handleStrategicZoomBelowThreshold = useCallback(
    (wx: number, wz: number) => closeStrategicMapTo3D(wx, wz, 540),
    [closeStrategicMapTo3D]
  );

  const handleStrategicClickWorld = useCallback(
    (wx: number, wz: number) => {
      setStrategicMap((prev) =>
        prev.mode === 'march'
          ? { ...prev, waypoints: [...prev.waypoints.slice(-7), { x: wx, z: wz }] }
          : prev
      );
    },
    []
  );

  const handleStrategicRightClickWorld = useCallback((wx: number, wz: number) => {
    setStrategicMap((prev) => ({
      ...prev,
      mode: 'march',
      waypoints: [...prev.waypoints.slice(-7), { x: wx, z: wz }],
    }));
  }, []);

  const handleStrategicDoubleClickWorld = useCallback(
    (wx: number, wz: number) => closeStrategicMapTo3D(wx, wz, 340),
    [closeStrategicMapTo3D]
  );

  const strategicDispatchUnitIds = useMemo(() => {
    if (selectedUnitIds.length > 0) return selectedUnitIds;
    return myUnits.filter((u) => u.kind !== 'worker').map((u) => u.id);
  }, [selectedUnitIds, myUnits]);

  const strategicLeadUnit = useMemo(
    () => myUnits.find((u) => strategicDispatchUnitIds.includes(u.id)) ?? myUnits[0] ?? null,
    [myUnits, strategicDispatchUnitIds]
  );

  const strategicMarchStats = useMemo(() => {
    if (!strategicLeadUnit || strategicMap.waypoints.length === 0) return null;
    const baseSpeed = UNIT_SPECS[strategicLeadUnit.kind]?.speed ?? strategicLeadUnit.speed;
    return calculateMarchRouteStats(
      strategicLeadUnit.x,
      strategicLeadUnit.z,
      strategicMap.waypoints,
      baseSpeed,
      strategicLeadUnit.kind,
      activeClimateId
    );
  }, [strategicLeadUnit, strategicMap.waypoints, activeClimateId]);

  const centerOnMyKeep = () => {
    if (!worldState || !playerId) return;
    const myKeep = Object.values(worldState.structures ?? {}).find(
      (s) => s.ownerId === playerId && s.kind === 'keep'
    );
    if (myKeep) {
      triggerCameraPreset({ targetX: myKeep.x, targetZ: myKeep.z, zoom: 22 });
      setSelectedStructureId(myKeep.id);
    }
  };

  const selectAllMyUnits = () => {
    setSelectedUnitIds(myUnits.map((u) => u.id));
    setSelectedStructureId(null);
    setSelectedEnemyUnitId(null);
    soundFx.playSelect();
  };

  const selectMilitaryUnits = () => {
    const ids =
      militaryUnits.length > 0
        ? militaryUnits.map((u) => u.id)
        : myUnits.map((u) => u.id);
    if (ids.length === 0) return;
    setSelectedUnitIds(ids);
    setSelectedStructureId(null);
    setSelectedEnemyUnitId(null);
    soundFx.playSelect();
  };

  const handleToggleSfx = () => {
    const next = !sfxMuted;
    soundFx.setMuted(next);
    setSfxMuted(next);
  };

  const handleJumpNearestEnemy = () => {
    if (!worldState || !playerId) return;
    const myKeep = myStructures.find((s) => s.kind === 'keep') ?? myStructures[0];
    const refX = myKeep?.x ?? 0;
    const refZ = myKeep?.z ?? 0;

    let best: { x: number; z: number; dist: number } | null = null;
    for (const st of Object.values(worldState.structures ?? {})) {
      if (st.ownerId === playerId || st.hp <= 0) continue;
      if (!worldState.players?.[st.ownerId]?.isAi) continue;
      const d = Math.hypot(st.x - refX, st.z - refZ);
      if (!best || d < best.dist) best = { x: st.x, z: st.z, dist: d };
    }
    if (!best) {
      for (const u of Object.values(worldState.units ?? {})) {
        if (u.ownerId === playerId || u.hp <= 0) continue;
        if (!worldState.players?.[u.ownerId]?.isAi) continue;
        const d = Math.hypot(u.x - refX, u.z - refZ);
        if (!best || d < best.dist) best = { x: u.x, z: u.z, dist: d };
      }
    }
    if (!best) {
      for (const rival of alivePveFronts) {
        const d = Math.hypot(rival.camera.targetX - refX, rival.camera.targetZ - refZ);
        if (!best || d < best.dist) {
          best = { x: rival.camera.targetX, z: rival.camera.targetZ, dist: d };
        }
      }
    }
    if (best) {
      triggerCameraPreset({ targetX: best.x, targetZ: best.z, zoom: 34 });
    }
  };

  const handleSelectCulture = (culture: CultureKind) => {
    setSelectedCulture(culture);
    setPlacementCultureOverride(culture);
    setCulture(culture, convertExistingOnCultureChange);
    setTimeout(() => {
      saveCurrentWorldToCloud();
    }, 350);
  };

  const handleAdaptSingleStructure = (structureId: string, targetCulture: CultureKind) => {
    setCulture(targetCulture, false, { structureId });
    setTimeout(() => {
      saveCurrentWorldToCloud();
    }, 350);
  };

  const handleAdaptAllStructuresToBiomes = () => {
    setCulture(activeCulture, false, { adaptAllToBiomes: true });
    setTimeout(() => {
      saveCurrentWorldToCloud();
    }, 350);
  };

  const handleRotateBuild = useCallback(() => {
    setBuildRotationY((prev) => {
      const next = (prev + Math.PI / 4) % (Math.PI * 2);
      return Math.abs(next) < 0.001 ? 0 : next;
    });
    soundFx.playSelect();
  }, []);

  const triggerGridNudge = useCallback((dxCells: number, dzCells: number) => {
    setNudgeBuildCommand((prev) => ({
      id: (prev?.id ?? 0) + 1,
      dxCells,
      dzCells,
    }));
    soundFx.playSelect();
  }, []);

  const handlePlaceStructure = (kind: StructureKind, x: number, z: number, rot: number) => {
    const chosenCulture = autoMatchBiomeCulture
      ? getRecommendedCultureForBiome(
          getBiomeAt(x, z),
          getEffectiveClimateAt(x, z, activeClimateId)
        )
      : (placementCultureOverride ?? activeCulture);
    placeStructure(kind, x, z, rot, chosenCulture);
    persistPlacedStructure(kind, x, z, rot, chosenCulture);
    // Keep placement mode active for walls & moats so players can lay fortress perimeters rapidly
    if (kind !== 'stone_wall' && kind !== 'moat_trench') {
      setBuildMode(null);
      setBuildPreview(null);
    }
  };

  const handlePlaceFortBatch = (items: FortPlacementItem[]) => {
    if (items.length === 0) return;
    const enriched = items.map((it) => {
      const chosenCulture = autoMatchBiomeCulture
        ? getRecommendedCultureForBiome(
            getBiomeAt(it.x, it.z),
            getEffectiveClimateAt(it.x, it.z, activeClimateId)
          )
        : (placementCultureOverride ?? activeCulture);
      return {
        kind: it.kind,
        x: it.x,
        z: it.z,
        rotationY: it.rotationY,
        culture: chosenCulture,
      };
    });
    placeFortBatch(enriched);
    enriched.forEach((it) => {
      persistPlacedStructure(it.kind, it.x, it.z, it.rotationY, it.culture);
    });
  };

  const handleUpgradeStructure = (structureId: string) => {
    upgradeStructure(structureId);
    setTimeout(() => {
      saveCurrentWorldToCloud();
    }, 350);
  };

  const handleSpawnUnit = useCallback(
    (kind: UnitKind, structureId?: string) => {
      spawnUnit(kind, structureId);
      persistSpawnedUnit(kind);
    },
    [spawnUnit, persistSpawnedUnit]
  );

  // Advance lifted training queue continuously even if Training Camp panel is closed
  useEffect(() => {
    if (trainingQueue.length === 0) return;
    const timer = window.setInterval(() => {
      setTrainingQueue((prev) => {
        if (prev.length === 0) return prev;
        const head = prev[0];
        const nextElapsed = head.elapsedSec + 0.1;
        if (nextElapsed >= head.durationSec) {
          handleSpawnUnit(head.unitKind, head.campId);
          return prev.slice(1);
        }
        return [
          {
            ...head,
            elapsedSec: nextElapsed,
          },
          ...prev.slice(1),
        ];
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [trainingQueue.length, handleSpawnUnit]);

  const selectPrimaryTrainingCamp = useCallback(
    (preferredKinds?: StructureKind[], focusUnitKind?: UnitKind) => {
      let camp: (typeof myStructures)[number] | undefined;
      if (preferredKinds && preferredKinds.length > 0) {
        for (const pk of preferredKinds) {
          camp = myStructures.find(
            (s) => s.kind === pk && (!s.isConstructing || s.level > 1)
          );
          if (camp) break;
        }
      }
      if (!camp) {
        camp =
          myStructures.find((s) => s.kind === 'barracks') ??
          myStructures.find((s) => s.kind === 'siege_workshop') ??
          myStructures.find((s) => s.kind === 'war_tent') ??
          myStructures.find((s) => s.kind === 'horse_stable') ??
          myStructures.find((s) => s.kind === 'keep');
      }
      if (camp) {
        setRequestedTrainingUnitKind(focusUnitKind ?? null);
        setSelectedStructureId(camp.id);
        setActivePopup(null);
        triggerCameraPreset({ targetX: camp.x, targetZ: camp.z, zoom: 22 });
      }
    },
    [myStructures]
  );

  const openTrainingCampForUnit = useCallback(
    (kind: UnitKind) => {
      selectPrimaryTrainingCamp(UNIT_SPECS[kind].preferredCamps, kind);
    },
    [selectPrimaryTrainingCamp]
  );

  const handleMoveUnits = (
    unitIds: string[],
    targetX: number,
    targetZ: number,
    resourceId?: string
  ) => {
    moveUnits(unitIds, targetX, targetZ, resourceId);
    setTimeout(() => {
      saveCurrentWorldToCloud();
    }, 500);
  };

  // Dispatch 1 idle worker (or available worker) to the nearest rich node of `kind`
  const assignWorkerToResourceKind = (kind: ResourceKind, focusCamera = false) => {
    if (!worldState) return;
    const myKeep = myStructures.find((s) => s.kind === 'keep') ?? myStructures[0];
    const refX = myKeep?.x ?? 0;
    const refZ = myKeep?.z ?? 0;

    const candidateUnit =
      myUnits.find((u) => u.kind === 'worker' && u.state === 'idle') ||
      myUnits.find((u) => u.state === 'idle') ||
      myUnits.find(
        (u) =>
          u.kind === 'worker' &&
          (!u.assignedResourceId ||
            worldState.resourceNodes[u.assignedResourceId]?.kind !== kind)
      ) ||
      myUnits[0];

    if (!candidateUnit) return;

    const nodes = Object.values(worldState.resourceNodes ?? {}).filter(
      (n) => n.kind === kind && n.amount > 0
    );
    if (nodes.length === 0) return;

    nodes.sort(
      (a, b) =>
        Math.hypot(a.x - candidateUnit.x, a.z - candidateUnit.z) * 0.6 +
        Math.hypot(a.x - refX, a.z - refZ) * 0.4 -
        (Math.hypot(b.x - candidateUnit.x, b.z - candidateUnit.z) * 0.6 +
          Math.hypot(b.x - refX, b.z - refZ) * 0.4)
    );

    const targetNode = nodes[0];
    handleMoveUnits([candidateUnit.id], targetNode.x, targetNode.z, targetNode.id);
    setSelectedUnitIds([candidateUnit.id]);
    if (focusCamera) {
      triggerCameraPreset({ targetX: targetNode.x, targetZ: targetNode.z, zoom: 28 });
    }
  };

  // Auto-distribute all idle units across the 5 resource kinds
  const autoDistributeIdleUnits = () => {
    if (!worldState) return;
    const idleUnits = myUnits.filter((u) => u.state === 'idle');
    const pool = idleUnits.length > 0 ? idleUnits : myUnits.filter((u) => u.kind === 'worker');
    if (pool.length === 0) return;

    const kindsOrder: ResourceKind[] = ['wood', 'food', 'cloth', 'horses', 'stone', 'gold'];
    const myKeep = myStructures.find((s) => s.kind === 'keep') ?? myStructures[0];
    const refX = myKeep?.x ?? 0;
    const refZ = myKeep?.z ?? 0;

    pool.forEach((u, idx) => {
      const targetKind = kindsOrder[idx % kindsOrder.length];
      const nodes = Object.values(worldState.resourceNodes ?? {})
        .filter((n) => n.kind === targetKind && n.amount > 0)
        .sort(
          (a, b) =>
            Math.hypot(a.x - refX, a.z - refZ) - Math.hypot(b.x - refX, b.z - refZ)
        );
      if (nodes.length > 0) {
        const chosen = nodes[0];
        moveUnits([u.id], chosen.x, chosen.z, chosen.id);
      }
    });

    setTimeout(() => {
      saveCurrentWorldToCloud();
    }, 500);
  };

  const dispatchWorkersToSpecificNode = (node: ResourceNode) => {
    const chosenUnits =
      selectedUnitIds.length > 0
        ? selectedUnitIds
        : myUnits.filter((u) => u.state === 'idle').map((u) => u.id);
    const finalIds =
      chosenUnits.length > 0
        ? chosenUnits
        : myUnits.slice(0, Math.min(2, myUnits.length)).map((u) => u.id);

    if (finalIds.length > 0) {
      handleMoveUnits(finalIds, node.x, node.z, node.id);
      setSelectedUnitIds(finalIds);
    }
    triggerCameraPreset({ targetX: node.x, targetZ: node.z, zoom: 26 });
    setActivePopup(null);
  };

  const handleResetWorld = () => {
    resetWorld();
    resetCloudWorld();
  };

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

  const filteredStructureKinds = useMemo(() => {
    const allKinds = Object.keys(STRUCTURE_SPECS) as StructureKind[];
    switch (buildCategory) {
      case 'housing_farming':
        return allKinds.filter(
          (k) =>
            k === 'house' ||
            k === 'bedouin_tent' ||
            k === 'farm' ||
            k === 'livestock_ranch' ||
            k === 'horse_stable'
        );
      case 'economy':
        return allKinds.filter(
          (k) =>
            k === 'livestock_ranch' ||
            k === 'horse_stable' ||
            k === 'lumber_camp' ||
            k === 'quarry' ||
            k === 'market'
        );
      case 'military':
        return allKinds.filter(
          (k) =>
            k === 'stone_wall' ||
            k === 'gatehouse' ||
            k === 'moat_trench' ||
            k === 'watchtower' ||
            k === 'siege_workshop' ||
            k === 'barracks' ||
            k === 'war_tent' ||
            k === 'horse_stable' ||
            k === 'keep'
        );
      case 'civic':
        return allKinds.filter(
          (k) =>
            k === 'bedouin_tent' ||
            k === 'temple' ||
            k === 'house' ||
            k === 'farm'
        );
      default:
        return allKinds;
    }
  }, [buildCategory]);

  const togglePopup = (kind: Exclude<PopupModalKind, null>) => {
    if (kind === 'structures') {
      // Focus the embedded bottom Build Deck directly instead of opening a floating popup
      setSelectedStructureId(null);
      setSelectedUnitIds([]);
      setActivePopup(null);
      if (!inspectedBuildKind && filteredStructureKinds.length > 0) {
        setInspectedBuildKind(filteredStructureKinds[0]);
      }
      return;
    }
    setActivePopup((prev) => (prev === kind ? null : kind));
  };

  // Keep inspectedBuildKind valid inside the active category tab in the embedded bottom deck
  useEffect(() => {
    if (filteredStructureKinds.length > 0) {
      if (!inspectedBuildKind || !filteredStructureKinds.includes(inspectedBuildKind)) {
        setInspectedBuildKind(filteredStructureKinds[0]);
      }
    }
  }, [filteredStructureKinds, inspectedBuildKind]);

  const sortedResourceNodes = useMemo(() => {
    const allNodes = Object.values(worldState?.resourceNodes ?? {}).filter(
      (n) => n.amount > 0 && (resourceFilter === 'all' || n.kind === resourceFilter)
    );
    const myKeep = myStructures.find((s) => s.kind === 'keep') ?? myStructures[0];
    const refX = myKeep?.x ?? 0;
    const refZ = myKeep?.z ?? 0;
    return allNodes.sort(
      (a, b) => Math.hypot(a.x - refX, a.z - refZ) - Math.hypot(b.x - refX, b.z - refZ)
    );
  }, [worldState?.resourceNodes, resourceFilter, myStructures]);

  const isTrainingDeckActive = Boolean(
    !buildMode &&
      selectedStructure &&
      selectedStructure.ownerId === playerId &&
      isTrainingCampStructure(selectedStructure.kind)
  );

  return (
    <div
      dir="rtl"
      className="relative w-full h-full overflow-hidden bg-[#0c0906] text-[#f3e5c8] select-none touch-none"
    >
      {/* 100% Full-Viewport 2000s Isometric Pixel-Art 3D World Scene */}
      <StrategicViewport
        playerId={playerId}
        worldRef={worldRef}
        selectedUnitIds={selectedUnitIds}
        onSelectUnits={(ids) => {
          setSelectedUnitIds(ids);
          if (ids.length > 0) {
            setSelectedEnemyUnitId(null);
          }
        }}
        selectedStructureId={selectedStructureId}
        onSelectStructure={(sid) => {
          setSelectedStructureId(sid);
          if (sid) {
            setSelectedEnemyUnitId(null);
            setRequestedTrainingUnitKind(null);
            setActivePopup(null);
          }
        }}
        onSelectEnemyUnit={(eid) => {
          setSelectedEnemyUnitId(eid);
          if (eid) {
            setSelectedStructureId(null);
            setSelectedUnitIds([]);
            setActivePopup(null);
          }
        }}
        buildMode={buildMode}
        buildCulture={effectiveBuildCulture}
        buildRotationY={buildRotationY}
        showBuildGrid={showBuildGrid}
        nudgeBuildCommand={nudgeBuildCommand}
        fortLineMode={fortLineMode}
        wallLineWithTowers={wallLineWithTowers}
        confirmBuildTrigger={confirmBuildTrigger}
        cancelLineTrigger={cancelLineTrigger}
        onRotateBuild={handleRotateBuild}
        onBuildPreviewChange={setBuildPreview}
        commandMode={commandMode}
        onClearCommandMode={() => setCommandMode('normal')}
        onCancelBuildMode={() => {
          setBuildMode(null);
          setBuildPreview(null);
        }}
        onPlaceStructure={handlePlaceStructure}
        onPlaceFortBatch={handlePlaceFortBatch}
        onMoveUnits={handleMoveUnits}
        onAttackTarget={attackTarget}
        onRepairStructure={repairStructure}
        onUnitStance={setUnitStance}
        onUnderAttackAlert={(x, z, labelAr, tone) =>
          setUnderAttackAlert({ x, z, atMs: Date.now(), labelAr, tone })
        }
        onSyncCamera={syncCamera}
        cameraCommand={cameraCommand}
        touchMode={touchMode}
        qualityMode={qualityMode}
        pixelScale={pixelScale}
        projectionMode={projectionMode}
        onHoverCoordsChange={setHoverTerrain}
        onPerfStatsChange={setPerfStats}
        onZoomOutToStrategicMap={handleZoomOutToStrategicMap}
        paused={strategicMap.open}
      />

      {/* Full-Viewport Unlimited-Resolution WebGL2 Procedural Strategic Map (Persistently mounted so WebGL2 shader stays warm across scroll-zoom transitions) */}
      <section
        aria-label="الخريطة الاستراتيجية الإجرائية عالية الدقة"
        aria-hidden={!strategicMap.open}
        className={
          strategicMap.open
            ? 'pointer-events-auto absolute inset-0 z-[18] bg-[#040e1c]'
            : 'pointer-events-none invisible opacity-0 absolute inset-0 -z-10 bg-[#040e1c]'
        }
      >
        <ProceduralStrategicMap
          isActive={strategicMap.open}
          structures={worldState?.structures ?? {}}
          units={worldState?.units ?? {}}
          players={playersList}
          myPlayerId={playerId}
          activeClimate={activeClimateId}
          viewCenter={strategicMapViewCenter}
          viewSpanM={strategicMap.spanM}
          onChangeView={handleStrategicMapViewChange}
          mode={strategicMap.mode}
          waypoints={strategicMap.waypoints}
          leadDispatchUnit={strategicLeadUnit}
          minSpanM={850}
          maxSpanM={130_000}
          zoomInto3DThresholdM={1_050}
          onZoomBelowThreshold={handleStrategicZoomBelowThreshold}
          onClickWorld={handleStrategicClickWorld}
          onRightClickWorld={handleStrategicRightClickWorld}
          onDoubleClickWorld={handleStrategicDoubleClickWorld}
          flyToCommand={strategicFlyTo}
          enableKeyboardNav={true}
          showInternalTelemetry={true}
        />

        {strategicMap.open && (
          <>
            {/* Unified War-Table Control Bar & Quick-Focus Capitals Strip (Compact Single-Row Mobile + Full Desktop) */}
            <div className="pointer-events-none absolute top-[38px] sm:top-[44px] right-1.5 left-1.5 sm:right-2 sm:left-2 flex flex-col gap-1 sm:gap-1.5 z-10">
              <div className="flex flex-nowrap items-center justify-between gap-1 overflow-x-auto no-scrollbar">
                <div className="pointer-events-auto flex items-center gap-0.5 sm:gap-1 rts2k-stone-frame p-0.5 sm:p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => closeStrategicMapTo3D(strategicMap.centerX, strategicMap.centerZ, 480)}
                    className="h-6 sm:h-7 px-1.5 sm:px-2.5 rts2k-bevel-btn-gold text-[10px] sm:text-[10.5px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ZoomIn className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span className="sm:hidden">رجوع 3D</span>
                    <span className="hidden sm:inline">العودة للمشهد 3D</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setStrategicMap((prev) => ({ ...prev, mode: 'jump' }))
                    }
                    className={`h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-[10.5px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                      strategicMap.mode === 'jump' ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn text-[#e6d5b8]'
                    }`}
                  >
                    <Compass className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span>استكشاف</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setStrategicMap((prev) => ({ ...prev, mode: 'march' }))
                    }
                    className={`h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-[10.5px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                      strategicMap.mode === 'march' ? 'rts2k-bevel-btn-emerald' : 'rts2k-bevel-btn text-[#e6d5b8]'
                    }`}
                  >
                    <Route className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span className="sm:hidden">مسير ({strategicDispatchUnitIds.length})</span>
                    <span className="hidden sm:inline">مسار مسير ({strategicDispatchUnitIds.length})</span>
                  </button>
                </div>

                <div className="pointer-events-auto flex items-center gap-0.5 sm:gap-1 rts2k-stone-frame p-0.5 sm:p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (strategicMap.spanM <= 1_450) {
                        closeStrategicMapTo3D(strategicMap.centerX, strategicMap.centerZ, 540);
                        return;
                      }
                      flyStrategicMapTo(
                        strategicMap.centerX,
                        strategicMap.centerZ,
                        Math.max(850, Math.round(strategicMap.spanM * 0.52))
                      );
                    }}
                    title="تقريب الخريطة (والتقريب الكامل يعيدك للمشهد 3D)"
                    className="w-6 h-6 sm:w-7 sm:h-7 rts2k-bevel-btn flex items-center justify-center cursor-pointer"
                  >
                    <ZoomIn className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      flyStrategicMapTo(
                        strategicMap.centerX,
                        strategicMap.centerZ,
                        Math.min(130_000, Math.round(strategicMap.spanM * 1.9))
                      )
                    }
                    title="تبعيد حتى عرض مسرح العمليات كاملاً"
                    className="w-6 h-6 sm:w-7 sm:h-7 rts2k-bevel-btn flex items-center justify-center cursor-pointer"
                  >
                    <ZoomOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const aspect =
                        typeof window !== 'undefined'
                          ? window.innerWidth / Math.max(1, window.innerHeight)
                          : 1;
                      const fullSpan =
                        aspect < 1
                          ? Math.max(42_000, Math.round(WORLD_MAP_SIZE * 1.08 * aspect))
                          : WORLD_MAP_SIZE;
                      flyStrategicMapTo(0, 2000, fullSpan);
                    }}
                    title="عرض الخريطة كاملة 100 × 100 كم"
                    className="h-6 sm:h-7 px-1.5 sm:px-2 rts2k-bevel-btn text-[9.5px] sm:text-[10px] font-mono tabular-nums font-bold text-[#ffebb0] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
                    <span>
                      {strategicMap.spanM >= 2000
                        ? `${Math.round(strategicMap.spanM / 1000)} كم`
                        : `${(strategicMap.spanM / 1000).toFixed(1)} كم`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Single-Line Quick-Focus Capitals & Fronts Bar (Thar Ahmad Theater) */}
              <div className="pointer-events-auto flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full self-start bg-[#140e08]/88 border border-[#8c672b]/80 px-1 sm:px-1.5 py-0.5 sm:py-1">
                {myKeep && (
                  <button
                    type="button"
                    onClick={() => flyStrategicMapTo(myKeep.x, myKeep.z, 12_000)}
                    className="h-5 sm:h-6 px-1.5 sm:px-2 rts2k-bevel-btn-gold text-[9.5px] sm:text-[10px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    معقلي
                  </button>
                )}
                {(
                  [
                    { label: 'مرقاب', short: 'مرقاب', x: 18200, z: -2800, span: 18_000 },
                    { label: 'حصن القفول', short: 'حصن القفول', x: 4800, z: 3200, span: 18_000 },
                    { label: 'الرصافة (البصرة)', short: 'الرصافة', x: 25200, z: 14800, span: 20_000 },
                    { label: 'القدس', short: 'القدس', x: -26000, z: 13800, span: 20_000 },
                    { label: 'نصيبين', short: 'نصيبين', x: 1800, z: -27200, span: 20_000 },
                    { label: 'الوادي الأسود', short: 'الوادي الأسود', x: 24800, z: -9800, span: 18_000 },
                    { label: 'دمشق', short: 'دمشق', x: -21200, z: -1800, span: 22_000 },
                    { label: 'حلب', short: 'حلب', x: -17800, z: -24200, span: 22_000 },
                  ] as const
                ).map((spot) => (
                  <button
                    key={spot.label}
                    type="button"
                    onClick={() => flyStrategicMapTo(spot.x, spot.z, spot.span)}
                    className="h-5 sm:h-6 px-1.5 sm:px-2 rts2k-bevel-btn text-[9.5px] sm:text-[10px] font-semibold text-[#ebd7b4] hover:text-[#ffebb0] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span className="sm:hidden">{spot.short}</span>
                    <span className="hidden sm:inline">{spot.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* March Planner Dock (Full-width bottom on mobile, bottom-left on desktop) */}
            {strategicMap.mode === 'march' && (
              <div className="pointer-events-auto absolute bottom-2 left-2 right-2 sm:bottom-12 sm:left-3 sm:right-auto sm:w-[420px] p-2 sm:p-2.5 rts2k-parchment border-2 border-[#7d5929] text-[#241609] flex flex-col gap-1.5 z-10 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-1 text-[10.5px] sm:text-[11px] font-bold">
                  <span className="flex items-center gap-1">
                    <Flag className="w-3.5 h-3.5 text-[#7c2d12] shrink-0" />
                    {strategicMap.waypoints.length === 0
                      ? 'انقر على الخريطة لإضافة نقاط المسير'
                      : `نقاط المسار: ${strategicMap.waypoints.length} محطة`}
                  </span>
                  {strategicMarchStats && (
                    <span className="font-mono tabular-nums text-[10.5px] text-[#14532d]">
                      {formatWorldCoordKm(strategicMarchStats.totalDistanceM)} ·{' '}
                      {formatDurationAr(strategicMarchStats.estimatedSeconds)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  {strategicMap.waypoints.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setStrategicMap((prev) => ({ ...prev, waypoints: [] }))
                      }
                      className="h-7 px-2 rts2k-bevel-btn-crimson text-[10.5px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>مسح</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={
                      strategicMap.waypoints.length === 0 ||
                      strategicDispatchUnitIds.length === 0
                    }
                    onClick={() => {
                      dispatchAtlasMarch(strategicDispatchUnitIds, strategicMap.waypoints);
                      setStrategicMap((prev) => ({ ...prev, waypoints: [] }));
                      setTimeout(() => {
                        saveCurrentWorldToCloud();
                      }, 500);
                    }}
                    className="h-7 px-3 rts2k-bevel-btn-emerald disabled:opacity-45 text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>انطلاق الحملة ({strategicDispatchUnitIds.length} وحدة)</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* =====================================================================
          1. CLEAN, REGAL 2000s CARVED OAK & BRASS TOP RESOURCE STRIP
             (No nested boxes-inside-boxes; pure icon + number on carved oak)
         ===================================================================== */}
      <header
        aria-label="شريط الخزانة والمملكة العلوي"
        className="pointer-events-auto absolute top-0 inset-x-0 z-20 rts2k-hud-top rts2k-oak-bar px-1.5 sm:px-3 flex flex-nowrap items-center justify-between gap-1 sm:gap-2"
      >
        <BrassCornerMountSvg corner="tr" className="hidden lg:block absolute top-0.5 right-0.5 pointer-events-none" />
        <BrassCornerMountSvg corner="tl" className="hidden lg:block absolute top-0.5 left-0.5 pointer-events-none" />

        {/* Right Cluster: Heraldic Kingdom Crest + Horizontally Scrollable 6 Clean Resource Counters */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={centerOnMyKeep}
            title={`التركيز على معقل ${myPlayer?.name ?? 'مملكة الحصون'} (${activeCultureSpec.shortAr})`}
            className="h-6 sm:h-7 px-1.5 sm:px-2 rts2k-bevel-btn flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <HeraldicBannerShieldSvg
              primaryColor={myPlayer?.color || customPrimaryColor || '#0d9488'}
              secondaryColor={myPlayer?.secondaryColor || customSecondaryColor || '#fbbf24'}
              pattern={myPlayer?.bannerPattern || customBannerPattern || 'crescent_star'}
              className="w-4 h-4 sm:w-5 sm:h-6 shrink-0"
            />
            <span className="font-chronicle text-[11px] sm:text-xs font-bold text-[#ffebb0] truncate max-w-[96px] hidden md:inline">
              {myPlayer?.name ?? 'مملكة الحصون'}
            </span>
          </button>

          <ChiseledSeparatorSvg className="w-1 h-5 hidden sm:block shrink-0" />

          {/* 6 Pure 2000s Resource Counters (Single-line Scrollable on Mobile) */}
          <div className="flex flex-nowrap items-center gap-1 sm:gap-2 min-w-0 overflow-x-auto no-scrollbar">
            {(['wood', 'stone', 'gold', 'food', 'cloth', 'horses'] as ResourceKind[]).map(
              (rKind, idx) => {
                const meta = RESOURCE_META[rKind];
                const currentVal = myPlayer?.resources[rKind] ?? 0;
                const ratePerMin = economyStats.totalPerMin[rKind];
                const assignedWorkers = economyStats.workersByResource[rKind];

                return (
                  <button
                    key={rKind}
                    type="button"
                    onClick={() => togglePopup('resources')}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      assignWorkerToResourceKind(rKind, false);
                    }}
                    title={`${meta.nameAr}: ${currentVal} / ${economyStats.storageCap} (+${ratePerMin}/د · عمال: ${assignedWorkers}) — نقرة يسار لفتح الخزانة، نقرة يمين لإرسال عامل`}
                    className={`h-6 sm:h-7 px-1 sm:px-1.5 flex items-center gap-1 text-right shrink-0 cursor-pointer hover:brightness-125 transition ${
                      idx > 0 ? 'border-r border-[#5c4320]/60 pr-1 sm:pr-2' : ''
                    }`}
                  >
                    <ResourceArtworkSvg
                      kind={rKind}
                      className="w-3.5 h-3.5 sm:w-[18px] sm:h-[18px] shrink-0"
                    />
                    <span
                      className={`text-[10.5px] sm:text-xs font-mono font-bold tabular-nums ${meta.colorText} whitespace-nowrap`}
                    >
                      {currentVal}
                    </span>
                    {assignedWorkers > 0 && (
                      <span className="text-[8.5px] font-mono text-[#c8b28e] hidden xl:inline whitespace-nowrap">
                        ({assignedWorkers})
                      </span>
                    )}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Left Cluster: Compact Single-Row Population, Urbanization & Ledger Controls */}
        <nav
          aria-label="سجلات المملكة ومؤشرات الحكم"
          className="flex flex-nowrap items-center gap-0.5 sm:gap-1 shrink-0"
        >
          {/* Population & Morale Counter */}
          <button
            type="button"
            onClick={() => togglePopup('units')}
            title={`الجيش والعمال: ${myUnits.length}/${economyStats.maxPopulation} | سكان المدينة: ${economyStats.civilianPopulation.toLocaleString('en-US')} نسمة (سعادة ${economyStats.popLifeReport.happinessPct}%)`}
            className={`h-6 sm:h-7 px-1.5 sm:px-2 flex items-center gap-1 text-[9.5px] sm:text-[10px] font-bold shrink-0 cursor-pointer ${
              activePopup === 'units'
                ? 'rts2k-bevel-btn-gold'
                : 'rts2k-ink-well text-[#f3e5c8]'
            }`}
          >
            <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#d4a656] shrink-0" />
            <span className="font-mono font-bold whitespace-nowrap">
              {myUnits.length}/{economyStats.maxPopulation}
            </span>
            <span className="text-[9px] font-mono text-[#f6d99a] hidden md:inline whitespace-nowrap border-r border-[#5c4223]/70 pr-1.5 mr-0.5">
              {economyStats.civilianPopulation >= 1000
                ? `${(economyStats.civilianPopulation / 1000).toFixed(1)}k`
                : economyStats.civilianPopulation}{' '}
              نسمة
            </span>
            <span className="text-[8.5px] font-mono text-[#c8b28e] hidden xl:inline">
              ({economyStats.popLifeReport.happinessPct}%)
            </span>
          </button>

          {/* Urbanization Counter */}
          <button
            type="button"
            onClick={() => {
              setSelectedStructureId(null);
              setActivePopup(null);
            }}
            title={`${economyStats.urbanReport.tierSpec.nameAr} (${economyStats.urbanReport.score} نقطة تحضر)`}
            className="hidden sm:flex h-6 sm:h-7 px-1.5 sm:px-2 rts2k-ink-well text-[#ffebb0] items-center gap-1 text-[9.5px] sm:text-[10px] font-mono font-bold shrink-0 cursor-pointer"
          >
            <Landmark className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#d4a656] shrink-0" />
            <span>Lv.{economyStats.urbanReport.tier}</span>
          </button>

          {/* Compact Zoom, Regional Temperature & Climate Line-of-Sight Badge */}
          <div
            title={`نطاق الزوم الحالي: ${Math.round(myPlayer?.camera.zoom ?? 38)} م · ${hoverClimateZoneAr} (${hoverTempC}°C · رطوبة ${hoverHumidityPct}%) · الطقس المحلي: ${hoverLocalClimate.nameAr} (${Math.round(getClimateVisionMultiplier(hoverLocalClimateId) * 100)}%)`}
            className="hidden md:flex h-6 sm:h-7 px-1.5 sm:px-2 rts2k-ink-well text-[#a5f3fc] items-center gap-1 text-[9.5px] font-mono font-bold shrink-0"
          >
            <Eye className="w-3 h-3 text-[#38bdf8] shrink-0" />
            <span>{Math.round(myPlayer?.camera.zoom ?? 38)}م</span>
            <span className="text-[#fde047] text-[8.5px]" dir="ltr">
              ·{hoverTempC}°C
            </span>
            <span className="text-[#7dd3fc] text-[8.5px]">
              ·{Math.round(getClimateVisionMultiplier(hoverLocalClimateId) * 100)}%
            </span>
          </div>

          <ChiseledSeparatorSvg className="w-1 h-5 hidden md:block shrink-0" />

          {/* Treasury & Market Ledger */}
          <button
            type="button"
            onClick={() => togglePopup('resources')}
            title="خزانة الموارد وسوق القوافل وتوزيع العمال"
            className={`h-6 sm:h-7 px-1.5 sm:px-2 flex items-center gap-1 text-[10px] font-bold shrink-0 cursor-pointer ${
              activePopup === 'resources'
                ? 'rts2k-bevel-btn-gold'
                : 'rts2k-bevel-btn text-[#f3e5c8]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-[#d4a656] shrink-0" />
            <span className="hidden lg:inline whitespace-nowrap">الخزانة</span>
          </button>

          {/* Atlas & Climate Ledger */}
          <button
            type="button"
            onClick={() => togglePopup('world')}
            title={`الأطلس والمناخ — جبهة: ${activeClimate.nameAr} · محلياً: ${hoverLocalClimate.nameAr}`}
            className={`h-6 sm:h-7 px-1.5 sm:px-2 flex items-center gap-1 text-[10px] font-bold shrink-0 cursor-pointer ${
              activePopup === 'world'
                ? 'rts2k-bevel-btn-gold'
                : 'rts2k-bevel-btn text-[#f3e5c8]'
            }`}
          >
            {renderClimateIcon(hoverLocalClimateId, 'w-3.5 h-3.5')}
            <span className="hidden lg:inline whitespace-nowrap">الأطلس</span>
          </button>

          {/* Direct Unlimited-Resolution Strategic Map Toggle (M) */}
          <button
            type="button"
            onClick={() => {
              if (strategicMap.open) {
                closeStrategicMapTo3D(strategicMap.centerX, strategicMap.centerZ, 480);
              } else {
                const isPortrait =
                  typeof window !== 'undefined' && window.innerWidth < window.innerHeight;
                openStrategicMapAt(
                  myPlayer?.camera.targetX ?? 0,
                  myPlayer?.camera.targetZ ?? 0,
                  isPortrait ? 46_000 : 64_000
                );
              }
            }}
            title="خريطة القارة عالية الدقة (مفتاح M أو عند الزوم البعيد)"
            className={`h-6 sm:h-7 px-1.5 sm:px-2 flex items-center gap-1 text-[10px] font-bold shrink-0 cursor-pointer ${
              strategicMap.open
                ? 'rts2k-bevel-btn-gold'
                : 'rts2k-bevel-btn text-[#ffebb0]'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5 text-[#d4a656] shrink-0" />
            <span className="hidden lg:inline whitespace-nowrap">الخريطة</span>
          </button>

          {/* Cloud Sync Ledger */}
          <button
            type="button"
            onClick={() => togglePopup('cloud')}
            title={user ? 'الحفظ السحابي متصل' : 'الحفظ السحابي والمزامنة'}
            className={`h-6 sm:h-7 px-1.5 flex items-center gap-1 text-[10px] font-bold shrink-0 cursor-pointer ${
              activePopup === 'cloud'
                ? 'rts2k-bevel-btn-gold'
                : 'rts2k-bevel-btn text-[#d6c3a5]'
            }`}
          >
            <span
              className={`w-1.5 h-3 shrink-0 border border-black/70 ${
                user ? 'bg-[#a3b87c]' : 'bg-[#c8902e]'
              }`}
            />
            <Cloud className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline whitespace-nowrap">السحابة</span>
          </button>

          {/* Heraldry & Settings Ledger */}
          <button
            type="button"
            onClick={() => togglePopup('settings')}
            title="راية المملكة وإعدادات البكسل والشبكة"
            className={`h-6 sm:h-7 px-1.5 flex items-center gap-1 text-[10px] font-bold shrink-0 cursor-pointer ${
              activePopup === 'settings'
                ? 'rts2k-bevel-btn-gold'
                : 'rts2k-bevel-btn text-[#d6c3a5]'
            }`}
          >
            <span
              className={`w-1.5 h-3 shrink-0 border border-black/70 ${
                connected ? 'bg-[#a3b87c]' : 'bg-[#872b24]'
              }`}
            />
            <Sliders className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline whitespace-nowrap">الراية</span>
          </button>

          {/* Co-op PvE Fronts & Governed Cities Modal Toggle */}
          <button
            type="button"
            onClick={() => setPveModalOpen(true)}
            title={`الجبهات والمدن: ${aliveBanditFronts.length}/${Math.max(1, totalBanditFronts.length)} أوكار · ${aliveGovernedCities.length} مدن وولايات · قتلى: ${myPlayer?.kills ?? 0}`}
            className={`h-6 sm:h-7 px-1.5 sm:px-2 flex items-center gap-1 text-[10px] font-bold shrink-0 cursor-pointer ${
              pveModalOpen ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn text-[#ffebb0]'
            }`}
          >
            <Swords className="w-3.5 h-3.5 text-[#f59e0b] shrink-0" />
            <span className="font-mono text-[9.5px] tabular-nums text-[#fca5a5]">
              {alivePveFronts.length}
            </span>
            <span className="hidden lg:inline whitespace-nowrap">الجبهات</span>
          </button>

          {/* Web Audio SFX Mute Toggle */}
          <button
            type="button"
            onClick={handleToggleSfx}
            title={sfxMuted ? 'تفعيل المؤثرات الصوتية' : 'كتم المؤثرات الصوتية'}
            className="h-6 sm:h-7 px-1.5 rts2k-bevel-btn text-[#ffebb0] flex items-center justify-center shrink-0 cursor-pointer"
          >
            {sfxMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-[#f87171]" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-[#a3e635]" />
            )}
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title="وضع ملء الشاشة (مفتاح F)"
            className="h-6 sm:h-7 px-1.5 rts2k-bevel-btn text-[#ffebb0] flex items-center justify-center shrink-0 cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize className="w-3.5 h-3.5" />
            ) : (
              <Maximize className="w-3.5 h-3.5" />
            )}
          </button>
        </nav>
      </header>

      {/* 1B. URGENT ALERTS ONLY (Shown strictly during active attack, lost keep, or attack-move — never clutters normal view) */}
      {!strategicMap.open &&
        ((playerId && myPlayer && !hasMyKeep) ||
          Boolean(underAttackAlert) ||
          commandMode === 'attack_move') && (
          <div
            aria-label="تنبيهات المعركة العاجلة"
            className="pointer-events-none fixed top-[36px] sm:top-[40px] right-2 z-[18] flex flex-wrap items-center gap-1.5"
          >
            {playerId && myPlayer && !hasMyKeep && (
              <button
                type="button"
                onClick={() => reclaimKeep()}
                className="pointer-events-auto h-6 px-2 rts2k-bevel-btn-emerald text-[9.5px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Landmark className="w-3 h-3 shrink-0" />
                <span>إعادة تأسيس المعقل</span>
              </button>
            )}

            {underAttackAlert && (
              <button
                type="button"
                onClick={() => {
                  triggerCameraPreset({
                    targetX: underAttackAlert.x,
                    targetZ: underAttackAlert.z,
                    zoom: 24,
                  });
                  setUnderAttackAlert(null);
                }}
                className={`pointer-events-auto h-6 px-2 text-[9.5px] font-bold flex items-center gap-1 cursor-pointer ${
                  underAttackAlert.tone === 'recovered'
                    ? 'rts2k-bevel-btn-emerald'
                    : underAttackAlert.tone === 'loot'
                      ? 'rts2k-bevel-btn-gold'
                      : 'rts2k-bevel-btn-crimson'
                }`}
              >
                <AlertTriangle className="w-3 h-3 text-[#fde047] shrink-0" />
                <span>{underAttackAlert.labelAr ?? 'مملكتك تحت الهجوم!'}</span>
              </button>
            )}

            {commandMode === 'attack_move' && (
              <button
                type="button"
                onClick={() => setCommandMode('normal')}
                className="pointer-events-auto h-6 px-2 rts2k-bevel-btn-gold text-[9.5px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Crosshair className="w-3 h-3 shrink-0" />
                <span>هجوم-تحرك (إلغاء)</span>
              </button>
            )}
          </div>
        )}

      {/* =====================================================================
          2. UNIFIED BOTTOM SCULPTED STONE FORTRESS WALL:
             DESKTOP LEFT MINIMAP BASTION + RESPONSIVE MOBILE RADAR OVERLAY
             + ULTRA-SLIM BUILD PLACEMENT DOCK + COLLAPSIBLE COMMAND DECK
         ===================================================================== */}
      {/* 2A-1. DESKTOP DOCKED LEFT MINIMAP BASTION (Hidden on mobile, short landscape, and active build placement) */}
      <aside
        aria-label="خريطة الرادار التكتيكية وأدوات الكاميرا"
        className={`rts2k-desktop-minimap pointer-events-auto fixed bottom-0 left-0 z-20 w-[176px] rts2k-hud-minimap rts2k-stone-frame p-1 gap-1 ${
          strategicMap.open || buildMode ? 'hidden' : 'hidden lg:flex'
        }`}
      >
        <BrassCornerMountSvg corner="tr" className="absolute top-0.5 right-0.5 z-10 pointer-events-none" />
        <BrassCornerMountSvg corner="tl" className="absolute top-0.5 left-0.5 z-10 pointer-events-none" />

        <div className="relative flex-1 h-full rts2k-ink-well overflow-hidden">
          <TacticalMinimapSvg
            resourceNodes={worldState?.resourceNodes ?? {}}
            structures={worldState?.structures ?? {}}
            units={worldState?.units ?? {}}
            players={playersList}
            myPlayerId={playerId}
            climate={worldState?.climate}
            onJumpToWorld={(wx, wz) =>
              triggerCameraPreset({ targetX: wx, targetZ: wz })
            }
          />
          <div className="pointer-events-none absolute bottom-0 inset-x-0 px-1 py-0.5 bg-black/75 border-t border-[#5c4320]/70 flex items-center justify-between text-[8px] font-mono text-[#d6c3a5]">
            <span className="truncate max-w-[74px]">{activeBiome.nameAr.split(' (')[0]}</span>
            <span dir="ltr">
              {formatWorldCoordKm(hoverTerrain.x)},{formatWorldCoordKm(hoverTerrain.z)}
            </span>
          </div>
        </div>

        <div className="w-[32px] flex flex-col justify-between gap-0.5 shrink-0">
          <button
            type="button"
            onClick={centerOnMyKeep}
            title="التركيز على المعقل"
            className="flex-1 rts2k-bevel-btn text-[#ffebb0] flex items-center justify-center cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => triggerCameraPreset({ yawDelta: Math.PI / 2 })}
            title="تدوير الكاميرا 90° (Q/E)"
            className="flex-1 rts2k-bevel-btn text-[#d6c3a5] flex items-center justify-center cursor-pointer"
          >
            <RotateCw className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() =>
              triggerCameraPreset({
                zoom: Math.max(
                  MIN_CAMERA_ZOOM,
                  Math.round((myPlayer?.camera.zoom ?? 38) * 0.72)
                ),
              })
            }
            title="تقريب الكاميرا"
            className="flex-1 rts2k-bevel-btn text-[#d6c3a5] flex items-center justify-center cursor-pointer"
          >
            <ZoomIn className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => {
              const curZoom = myPlayer?.camera.zoom ?? 38;
              if (curZoom >= MAX_CAMERA_ZOOM * 0.92) {
                openStrategicMapAt(
                  myPlayer?.camera.targetX ?? 0,
                  myPlayer?.camera.targetZ ?? 0,
                  3_200
                );
              } else {
                triggerCameraPreset({
                  zoom: Math.min(MAX_CAMERA_ZOOM, Math.round(curZoom * 1.38)),
                });
              }
            }}
            title="تصغير الكاميرا (والتصغير الكامل يفتح الخريطة الاستراتيجية)"
            className="flex-1 rts2k-bevel-btn text-[#d6c3a5] flex items-center justify-center cursor-pointer"
          >
            <ZoomOut className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() =>
              setPixelScale((prev) =>
                prev === 1 ? 2 : prev === 2 ? 3 : prev === 3 ? 4 : 1
              )
            }
            title="حجم البكسل الثابت (1x–4x)"
            className="flex-1 rts2k-bevel-btn text-[#ffebb0] text-[8.5px] font-mono font-bold flex items-center justify-center cursor-pointer"
          >
            {pixelScale}x
          </button>

          <button
            type="button"
            onClick={() =>
              setProjectionMode((prev) =>
                prev === 'isometric_2000s' ? 'perspective_3d' : 'isometric_2000s'
              )
            }
            title="تبديل منظور 2.5D / 3D"
            className="flex-1 rts2k-bevel-btn text-[#d6c3a5] text-[8px] font-mono font-bold flex items-center justify-center cursor-pointer"
          >
            {projectionMode === 'isometric_2000s' ? '2.5D' : '3D'}
          </button>

          {onToggleSplitView && (
            <button
              type="button"
              onClick={onToggleSplitView}
              title={isSplitView ? 'إغلاق الشاشة المزدوجة' : 'اختبار لاعبين'}
              className={`flex-1 flex items-center justify-center cursor-pointer ${
                isSplitView
                  ? 'rts2k-bevel-btn-gold'
                  : 'rts2k-bevel-btn text-[#d6c3a5]'
              }`}
            >
              <Users className="w-3 h-3" />
            </button>
          )}
        </div>
      </aside>

      {/* 2A-2. MOBILE / SHORT-LANDSCAPE POPUP RADAR BASTION (Docked cleanly below top bar on left) */}
      {showMinimapMobile && !strategicMap.open && (
        <aside
          aria-label="خريطة الرادار للجوال"
          className="pointer-events-auto fixed top-[38px] left-2 z-[25] w-[184px] h-[128px] rts2k-stone-frame p-1.5 flex gap-1.5"
        >
          <div className="relative flex-1 h-full rts2k-ink-well overflow-hidden">
            <TacticalMinimapSvg
              resourceNodes={worldState?.resourceNodes ?? {}}
              structures={worldState?.structures ?? {}}
              units={worldState?.units ?? {}}
              players={playersList}
              myPlayerId={playerId}
              climate={worldState?.climate}
              onJumpToWorld={(wx, wz) => {
                triggerCameraPreset({ targetX: wx, targetZ: wz });
                setShowMinimapMobile(false);
              }}
            />
            <div className="pointer-events-none absolute bottom-0 inset-x-0 px-1 py-0.5 bg-black/75 border-t border-[#5c4320]/70 flex items-center justify-between text-[8px] font-mono text-[#d6c3a5]">
              <span className="truncate max-w-[64px]">{activeBiome.nameAr.split(' (')[0]}</span>
              <span dir="ltr">
                {formatWorldCoordKm(hoverTerrain.x)},{formatWorldCoordKm(hoverTerrain.z)}
              </span>
            </div>
          </div>

          <div className="w-[46px] grid grid-cols-2 gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowMinimapMobile(false)}
              title="إغلاق الرادار"
              className="rts2k-bevel-btn-crimson flex items-center justify-center cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={centerOnMyKeep}
              title="التركيز على المعقل"
              className="rts2k-bevel-btn text-[#ffebb0] flex items-center justify-center cursor-pointer"
            >
              <Shield className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() =>
                triggerCameraPreset({
                  zoom: Math.max(
                    MIN_CAMERA_ZOOM,
                    Math.round((myPlayer?.camera.zoom ?? 38) * 0.72)
                  ),
                })
              }
              title="تقريب"
              className="rts2k-bevel-btn text-[#d6c3a5] flex items-center justify-center cursor-pointer"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                const curZoom = myPlayer?.camera.zoom ?? 38;
                if (curZoom >= MAX_CAMERA_ZOOM * 0.92) {
                  openStrategicMapAt(
                    myPlayer?.camera.targetX ?? 0,
                    myPlayer?.camera.targetZ ?? 0,
                    3_200
                  );
                } else {
                  triggerCameraPreset({
                    zoom: Math.min(MAX_CAMERA_ZOOM, Math.round(curZoom * 1.38)),
                  });
                }
              }}
              title="تصغير (والتصغير الكامل يفتح الخريطة الاستراتيجية)"
              className="rts2k-bevel-btn text-[#d6c3a5] flex items-center justify-center cursor-pointer"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => triggerCameraPreset({ yawDelta: Math.PI / 2 })}
              title="تدوير"
              className="rts2k-bevel-btn text-[#d6c3a5] flex items-center justify-center cursor-pointer"
            >
              <RotateCw className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() =>
                setProjectionMode((prev) =>
                  prev === 'isometric_2000s' ? 'perspective_3d' : 'isometric_2000s'
                )
              }
              title="منظور 2.5D / 3D"
              className="rts2k-bevel-btn text-[#ffebb0] text-[7.5px] font-mono font-bold flex items-center justify-center cursor-pointer"
            >
              {projectionMode === 'isometric_2000s' ? '2.5D' : '3D'}
            </button>
          </div>
        </aside>
      )}

      {/* 2B-1. ULTRA-SLIM SINGLE-ROW BUILD PLACEMENT DOCK (Replaces entire bottom deck during buildMode so 90% of screen stays open!) */}
      {buildMode && !strategicMap.open && (
        <>
          {/* Optional Compact Corner Nudge D-Pad (Closed by default — opens cleanly in bottom-left corner only when tapped) */}
          {showNudgePad && (
            <div
              dir="ltr"
              aria-label="تحريك دقيق خانة واحدة على الشبكة"
              className="pointer-events-auto fixed bottom-12 left-2 z-30 p-1 bg-[#140e08]/90 border border-[#b68d43]/85 shadow-lg grid grid-cols-3 gap-0.5"
            >
              <span />
              <button
                type="button"
                onClick={() => triggerGridNudge(0, 1)}
                title="للأمام (2م)"
                className="w-8 h-8 rts2k-bevel-btn flex items-center justify-center text-[#ffebb0] cursor-pointer"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <span />
              <button
                type="button"
                onClick={() => triggerGridNudge(-1, 0)}
                title="لليسار (2م)"
                className="w-8 h-8 rts2k-bevel-btn flex items-center justify-center text-[#ffebb0] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowNudgePad(false)}
                title="إخفاء الأسهم"
                className="w-8 h-8 rts2k-ink-well flex items-center justify-center text-[#c8b28e] hover:text-[#ffebb0] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => triggerGridNudge(1, 0)}
                title="لليمين (2م)"
                className="w-8 h-8 rts2k-bevel-btn flex items-center justify-center text-[#ffebb0] cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <span />
              <button
                type="button"
                onClick={() => triggerGridNudge(0, -1)}
                title="للخلف (2م)"
                className="w-8 h-8 rts2k-bevel-btn flex items-center justify-center text-[#ffebb0] cursor-pointer"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <span />
            </div>
          )}

          {/* Single Non-Wrapping Bottom Strip (~40px tall total) */}
          <div
            role="toolbar"
            aria-label="شريط وضع البناء المختصر"
            className="pointer-events-none fixed bottom-1.5 inset-x-1.5 z-30 flex justify-center"
          >
            <div className="pointer-events-auto max-w-full flex flex-nowrap items-center gap-1 px-1.5 py-1 bg-[#140e08]/92 border border-[#b68d43]/90 shadow-[0_4px_16px_rgba(0,0,0,0.75)] overflow-x-auto no-scrollbar">
              {/* Compact Validity Icon + Building Name */}
              <div className="flex items-center gap-1 px-1 text-[10px] font-bold shrink-0">
                {buildPreview && !buildPreview.canPlace ? (
                  <Ban className="w-3.5 h-3.5 text-[#f87171] shrink-0" />
                ) : buildPreview?.replaceWallWithGate || buildPreview?.snapped ? (
                  <Magnet className="w-3.5 h-3.5 text-[#facc15] shrink-0" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-[#4ade80] shrink-0" />
                )}
                <span
                  className={`whitespace-nowrap ${
                    buildPreview && !buildPreview.canPlace
                      ? 'text-[#fca5a5]'
                      : buildPreview?.replaceWallWithGate || buildPreview?.snapped
                        ? 'text-[#fde047]'
                        : 'text-[#ffebb0]'
                  }`}
                >
                  {buildPreview?.lineAnchored
                    ? `${buildPreview.validCount}/${buildPreview.lineCount}`
                    : STRUCTURE_SPECS[buildMode].labelAr.split(' (')[0]}
                </span>
              </div>

              {/* Primary Confirm Build CTA */}
              <button
                type="button"
                disabled={buildPreview !== null && !buildPreview.canPlace}
                onClick={() => setConfirmBuildTrigger((n) => n + 1)}
                className={`h-8 px-2.5 text-[10.5px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap ${
                  buildPreview !== null && !buildPreview.canPlace
                    ? 'bg-[#3b1515] border border-[#991b1b] text-[#fca5a5]/75 cursor-not-allowed opacity-75'
                    : 'bg-[#166534] hover:bg-[#15803d] border border-[#4ade80] text-[#f0fdf4] cursor-pointer'
                }`}
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {buildPreview?.lineAnchored
                    ? `تثبيت (${buildPreview.validCount})`
                    : fortLineMode && isLineBuildableFort(buildMode)
                      ? 'بداية الخط'
                      : buildPreview?.replaceWallWithGate
                        ? 'بوابة'
                        : 'تشييد'}
                </span>
              </button>

              {/* Rotate 45° */}
              <button
                type="button"
                onClick={handleRotateBuild}
                title="تدوير 45° (R)"
                className="h-8 px-2 rts2k-bevel-btn text-[10px] font-bold text-[#ffebb0] flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
              >
                <RotateCw className="w-3.5 h-3.5 shrink-0" />
                <span dir="ltr" className="font-mono tabular-nums">
                  {Math.round(((buildRotationY * 180) / Math.PI) % 360)}°
                </span>
              </button>

              {/* Grid Overlay Toggle */}
              <button
                type="button"
                onClick={() => {
                  setShowBuildGrid((prev) => !prev);
                  soundFx.playSelect();
                }}
                title={showBuildGrid ? 'إخفاء الشبكة' : 'إظهار الشبكة'}
                className={`h-8 px-2 text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap ${
                  showBuildGrid ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn text-[#c8b28e]'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">شبكة</span>
              </button>

              {/* Wall/Moat Line Mode Toggle */}
              {isLineBuildableFort(buildMode) && (
                <button
                  type="button"
                  onClick={() => {
                    setFortLineMode((prev) => !prev);
                    soundFx.playSelect();
                  }}
                  title={fortLineMode ? 'قطعة واحدة' : 'رسم خط متواصل'}
                  className={`h-8 px-2 text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap ${
                    fortLineMode ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn text-[#c8b28e]'
                  }`}
                >
                  <Route className="w-3.5 h-3.5 shrink-0" />
                  <span>{fortLineMode ? 'خط' : 'مفرد'}</span>
                </button>
              )}

              {/* Wall Auto Corner Towers Toggle */}
              {buildMode === 'stone_wall' && fortLineMode && (
                <button
                  type="button"
                  onClick={() => {
                    setWallLineWithTowers((prev) => !prev);
                    soundFx.playSelect();
                  }}
                  title={wallLineWithTowers ? 'إيقاف أبراج الزوايا' : 'أبراج رصد تلقائية عند الزوايا'}
                  className={`h-8 px-2 text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap ${
                    wallLineWithTowers ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn text-[#c8b28e]'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  <span>أبراج</span>
                </button>
              )}

              {/* Optional Nudge D-Pad Toggle */}
              <button
                type="button"
                onClick={() => {
                  setShowNudgePad((prev) => !prev);
                  soundFx.playSelect();
                }}
                title="إظهار أو إخفاء أسهم التحريك الدقيق"
                className={`h-8 px-2 text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap ${
                  showNudgePad ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn text-[#c8b28e]'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">تحريك</span>
              </button>

              {buildPreview?.lineAnchored && (
                <button
                  type="button"
                  onClick={() => {
                    setCancelLineTrigger((n) => n + 1);
                    soundFx.playSelect();
                  }}
                  title="فك نقطة البداية"
                  className="h-8 px-2 rts2k-bevel-btn-crimson text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3 shrink-0" />
                  <span>فك</span>
                </button>
              )}

              {/* Cancel Build Mode */}
              <button
                type="button"
                onClick={() => {
                  setBuildMode(null);
                  setBuildPreview(null);
                  setShowNudgePad(false);
                }}
                title="إلغاء البناء (Esc)"
                className="h-8 w-8 rts2k-bevel-btn-crimson flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* 2B-2. MAIN UNIFIED BOTTOM STONE COMMAND CONSOLE (Hidden while placing buildings so the entire screen stays open!) */}
      <footer
        aria-label="منصة القيادة والتشييد والتدريب السفلية"
        data-collapsed={isDeckCollapsed ? 'true' : 'false'}
        className={`pointer-events-auto fixed bottom-0 right-0 left-0 lg:left-[176px] z-20 rts2k-hud-footer rts2k-stone-frame px-1.5 sm:px-2 py-1 flex-col sm:flex-row items-stretch justify-between gap-1 sm:gap-2 ${
          strategicMap.open || buildMode ? 'hidden' : 'flex'
        }`}
      >
        <BrassCornerMountSvg corner="tr" className="hidden lg:block absolute top-0.5 right-0.5 pointer-events-none" />
        <BrassCornerMountSvg corner="tl" className="hidden lg:block absolute top-0.5 left-0.5 pointer-events-none" />

        {/* PHYSICAL CARVED STONE & BRASS FILE-TAB RAIL STICKING UP ABOVE THE DECK (RTL-safe justify-start) */}
        <div
          role="tablist"
          aria-label="أبواب التشييد والتدريب والطراز"
          className="pointer-events-auto absolute -top-[23px] sm:-top-[26px] right-1.5 left-1.5 flex items-end justify-start gap-1 overflow-x-auto no-scrollbar"
        >
          {/* Right Tabs: 5 Building Categories + Soldier Training Camp Tab */}
          <div className="flex items-end gap-0.5 sm:gap-1 shrink-0">
            {(
              [
                { id: 'all', labelAr: 'الكل', fullLabelAr: 'كل المباني', icon: Layers },
                { id: 'housing_farming', labelAr: 'سكن ومعاش', fullLabelAr: 'سكن ومعاش', icon: Home },
                { id: 'economy', labelAr: 'اقتصاد', fullLabelAr: 'اقتصاد', icon: Store },
                { id: 'military', labelAr: 'عسكر', fullLabelAr: 'حصون وعسكر', icon: Shield },
                { id: 'civic', labelAr: 'تحضر', fullLabelAr: 'تحضر', icon: Landmark },
              ] as const
            ).map((cat) => {
              const IconComp = cat.icon;
              const isActive = !isDeckCollapsed && !isTrainingDeckActive && buildCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setBuildCategory(cat.id);
                    setIsDeckCollapsed(false);
                    if (
                      selectedStructure &&
                      isTrainingCampStructure(selectedStructure.kind)
                    ) {
                      setSelectedStructureId(null);
                    }
                  }}
                  className={`h-[22px] sm:h-[24px] px-1.5 sm:px-2.5 flex items-center gap-1 text-[9px] sm:text-[10.5px] font-bold leading-none shrink-0 cursor-pointer ${
                    isActive
                      ? 'rts2k-file-tab-active'
                      : 'rts2k-file-tab hover:brightness-110'
                  }`}
                >
                  <IconComp className="w-3 h-3 shrink-0" />
                  <span className="whitespace-nowrap sm:hidden">{cat.labelAr}</span>
                  <span className="whitespace-nowrap hidden sm:inline">{cat.fullLabelAr}</span>
                </button>
              );
            })}

            {/* Direct Embedded Training Camp Tab */}
            <button
              type="button"
              role="tab"
              aria-selected={!isDeckCollapsed && isTrainingDeckActive}
              onClick={() => {
                if (!isDeckCollapsed && isTrainingDeckActive) {
                  setSelectedStructureId(null);
                } else {
                  setIsDeckCollapsed(false);
                  selectPrimaryTrainingCamp();
                }
              }}
              className={`h-[22px] sm:h-[24px] px-2 sm:px-3 flex items-center gap-1 text-[9px] sm:text-[10.5px] font-bold leading-none shrink-0 cursor-pointer ${
                !isDeckCollapsed && isTrainingDeckActive
                  ? 'rts2k-file-tab-active'
                  : 'rts2k-file-tab text-[#ffebb0] hover:brightness-115'
              }`}
            >
              <Shield className="w-3 h-3 shrink-0" />
              <span className="whitespace-nowrap">
                {trainingQueue.length > 0
                  ? `التدريب (${trainingQueue.length})`
                  : 'معسكر التدريب'}
              </span>
            </button>
          </div>

          {/* Left Tab Rail Controls (pushed cleanly to left via mr-auto) */}
          <div className="mr-auto flex items-end gap-0.5 sm:gap-1 shrink-0">
            <div className="flex xl:hidden items-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  const order: CultureKind[] = [
                    'iraqi_mesopotamian',
                    'levantine_shami',
                    'hejazi_arabian',
                    'bedouin_nomadic',
                  ];
                  const cur = placementCultureOverride ?? activeCulture;
                  const next = order[(order.indexOf(cur) + 1) % order.length];
                  setAutoMatchBiomeCulture(false);
                  handleSelectCulture(next);
                }}
                title={`تبديل الطراز المعماري (الحالي: ${CULTURE_SPECS[placementCultureOverride ?? activeCulture].shortAr})`}
                className="h-[21px] sm:h-[22px] px-1.5 rts2k-file-tab text-[8.5px] sm:text-[9px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <span
                  className="w-2 h-2 border border-black/70 shrink-0"
                  style={{
                    backgroundColor:
                      CULTURE_SPECS[placementCultureOverride ?? activeCulture].roofAccentHex,
                  }}
                />
                <span className="whitespace-nowrap">
                  {CULTURE_SPECS[placementCultureOverride ?? activeCulture].shortAr.split(' ')[0]}
                </span>
              </button>
            </div>

            <div className="hidden xl:flex items-end gap-0.5">
              {(Object.keys(CULTURE_SPECS) as CultureKind[]).map((cKey) => {
                const cSpec = CULTURE_SPECS[cKey];
                const isSelected =
                  !autoMatchBiomeCulture &&
                  (placementCultureOverride ?? activeCulture) === cKey;
                return (
                  <button
                    key={cKey}
                    type="button"
                    onClick={() => {
                      setAutoMatchBiomeCulture(false);
                      handleSelectCulture(cKey);
                    }}
                    title={`الطراز المعماري: ${cSpec.nameAr}`}
                    className={`h-[22px] px-1.5 text-[9px] font-bold flex items-center gap-1 shrink-0 cursor-pointer ${
                      isSelected ? 'rts2k-file-tab-active' : 'rts2k-file-tab'
                    }`}
                  >
                    <span
                      className="w-2 h-2 border border-black/70 shrink-0"
                      style={{ backgroundColor: cSpec.roofAccentHex }}
                    />
                    <span>{cSpec.shortAr.split(' ')[0]}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setAutoMatchBiomeCulture((prev) => !prev)}
                title="تكيّف تلقائي للطراز المعماري حسب تضاريس الموقع"
                className={`h-[22px] px-1.5 text-[9px] font-bold shrink-0 cursor-pointer ${
                  autoMatchBiomeCulture ? 'rts2k-file-tab-active' : 'rts2k-file-tab'
                }`}
              >
                تلقائي
              </button>
            </div>

            <button
              type="button"
              onClick={selectMilitaryUnits}
              title={`تحديد كافة الوحدات القتالية (${militaryUnits.length})`}
              className={`h-[21px] sm:h-[22px] px-1.5 sm:px-2 text-[8.5px] sm:text-[9px] font-bold flex items-center gap-1 shrink-0 cursor-pointer ${
                militaryUnits.length > 0 &&
                selectedUnitIds.length >= militaryUnits.length &&
                militaryUnits.every((m) => selectedUnitIds.includes(m.id))
                  ? 'rts2k-file-tab-active'
                  : 'rts2k-file-tab'
              }`}
            >
              <Swords className="w-2.5 h-2.5 shrink-0 text-[#fca5a5]" />
              <span className="whitespace-nowrap">الجيش: {militaryUnits.length}</span>
            </button>

            <button
              type="button"
              onClick={autoDistributeIdleUnits}
              title={`توزيع العمال العاطلين (${economyStats.workersByResource.idle})`}
              className={`h-[21px] sm:h-[22px] px-1.5 sm:px-2 text-[8.5px] sm:text-[9px] font-bold flex items-center gap-1 shrink-0 cursor-pointer ${
                economyStats.workersByResource.idle > 0
                  ? 'rts2k-file-tab-active'
                  : 'rts2k-file-tab'
              }`}
            >
              <Pickaxe className="w-2.5 h-2.5 shrink-0" />
              <span className="whitespace-nowrap">عاطلون: {economyStats.workersByResource.idle}</span>
            </button>

            <button
              type="button"
              onClick={() => setTouchMode((prev) => (prev === 'pan' ? 'select' : 'pan'))}
              title="التبديل بين سحب الكاميرا وتحديد الصناديق"
              className={`h-[21px] sm:h-[22px] px-1.5 sm:px-2 text-[8.5px] sm:text-[9px] font-bold flex items-center gap-1 shrink-0 cursor-pointer ${
                touchMode === 'select' ? 'rts2k-file-tab-active' : 'rts2k-file-tab'
              }`}
            >
              {touchMode === 'pan' ? (
                <>
                  <Hand className="w-2.5 h-2.5 shrink-0" />
                  <span>سحب</span>
                </>
              ) : (
                <>
                  <MousePointer className="w-2.5 h-2.5 shrink-0" />
                  <span>تحديد</span>
                </>
              )}
            </button>

            {/* Mobile & Short Landscape Radar Toggle directly on Tab Rail */}
            <button
              type="button"
              onClick={() => setShowMinimapMobile((prev) => !prev)}
              title="فتح أو إغلاق خريطة الرادار"
              className={`rts2k-mobile-radar-btn lg:hidden h-[21px] sm:h-[22px] px-1.5 sm:px-2 text-[8.5px] sm:text-[9px] font-bold flex items-center gap-1 shrink-0 cursor-pointer ${
                showMinimapMobile ? 'rts2k-file-tab-active' : 'rts2k-file-tab'
              }`}
            >
              <MapIcon className="w-2.5 h-2.5 shrink-0" />
              <span>الرادار</span>
            </button>

            {/* Collapse/Expand Deck Toggle for Maximum Map Visibility on Phones */}
            <button
              type="button"
              onClick={() => setIsDeckCollapsed((prev) => !prev)}
              title={isDeckCollapsed ? 'إظهار لوحة القيادة' : 'طيّ لوحة القيادة لمشاهدة الخريطة'}
              className="h-[21px] sm:h-[22px] px-1.5 rts2k-file-tab flex items-center justify-center shrink-0 cursor-pointer"
            >
              {isDeckCollapsed ? (
                <ChevronUp className="w-3 h-3 text-[#ffebb0]" />
              ) : (
                <ChevronDown className="w-3 h-3 text-[#ffebb0]" />
              )}
            </button>
          </div>
        </div>

        {!isDeckCollapsed && (
          <>

        {/* =================================================================
            DECK BODY MODE A: EMBEDDED SOLDIER TRAINING CAMP & SKILLS DECK
           ================================================================= */}
        {isTrainingDeckActive && selectedStructure ? (
          <SoldierTrainingCampPanel
            embedded={true}
            selectedCamp={selectedStructure}
            allMyStructures={myStructures}
            myUnits={myUnits}
            resources={
              myPlayer?.resources ?? {
                wood: 0,
                stone: 0,
                gold: 0,
                food: 0,
                cloth: 0,
                horses: 0,
              }
            }
            maxPopulation={economyStats.maxPopulation}
            urbanTier={economyStats.urbanReport.tier}
            unitHpMultiplier={economyStats.urbanReport.unitHpMultiplier}
            unitHpBonusPct={economyStats.urbanReport.tierSpec.unitHpBonusPct}
            primaryColor={myPlayer?.color || customPrimaryColor || '#0d9488'}
            secondaryColor={
              myPlayer?.secondaryColor || customSecondaryColor || '#fbbf24'
            }
            bannerPattern={
              myPlayer?.bannerPattern || customBannerPattern || 'crescent_star'
            }
            defaultCulture={activeCulture}
            trainingQueue={trainingQueue}
            onQueueTraining={(items) =>
              setTrainingQueue((prev) => [...prev, ...items])
            }
            onCancelQueueItem={(itemId) =>
              setTrainingQueue((prev) => prev.filter((it) => it.id !== itemId))
            }
            initialSoldierKind={requestedTrainingUnitKind}
            onSelectCamp={(structureId, focusCam) => {
              setRequestedTrainingUnitKind(null);
              setSelectedStructureId(structureId);
              if (focusCam && worldState?.structures?.[structureId]) {
                const st = worldState.structures[structureId];
                triggerCameraPreset({ targetX: st.x, targetZ: st.z, zoom: 22 });
              }
            }}
            onUpgradeCamp={(structureId) => {
              handleUpgradeStructure(structureId);
            }}
            onSelectUnitsByKind={(kind) => {
              const matchingIds = myUnits
                .filter((u) => u.kind === kind)
                .map((u) => u.id);
              if (matchingIds.length > 0) {
                setSelectedUnitIds(matchingIds);
              }
            }}
            onClose={() => {
              setRequestedTrainingUnitKind(null);
              setSelectedStructureId(null);
            }}
          />
        ) : (
          /* =================================================================
             DECK BODY MODE B: EMBEDDED 2000s SQUARE BUILDING ICON GRID
                               + AGED VELLUM PARCHMENT SCROLL PLAQUE
             ================================================================= */
          <>
            {/* RIGHT/CENTER SECTION: CLEAN SQUARE CHISELED BUILDING ICON TILES (Hidden on mobile when inspecting a selected unit/structure so panels never stack) */}
            <div
              className={`w-full h-[60px] sm:h-full sm:flex-1 min-w-0 rts2k-ink-well px-1 sm:px-1.5 py-0.5 sm:py-1 items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar shrink-0 sm:shrink ${
                selectedStructure || selectedEnemyUnit || selectedUnitIds.length > 0
                  ? 'hidden sm:flex'
                  : 'flex'
              }`}
            >
              {filteredStructureKinds.map((kind) => {
                const spec = STRUCTURE_SPECS[kind];
                const woodCost = spec.cost.wood ?? 0;
                const stoneCost = spec.cost.stone ?? 0;
                const goldCost = spec.cost.gold ?? 0;
                const foodCost = spec.cost.food ?? 0;
                const clothCost = spec.cost.cloth ?? 0;
                const canAfford =
                  (myPlayer?.resources.wood ?? 0) >= woodCost &&
                  (myPlayer?.resources.stone ?? 0) >= stoneCost &&
                  (myPlayer?.resources.gold ?? 0) >= goldCost &&
                  (myPlayer?.resources.food ?? 0) >= foodCost &&
                  (myPlayer?.resources.cloth ?? 0) >= clothCost;
                const urbanUnlocked =
                  economyStats.urbanReport.tier >= spec.requiredUrbanTier;

                const shortNameAr = spec.labelAr.split(' (')[0];
                const isInspected = inspectedBuildKind === kind;
                const isSelectedBuild = buildMode === kind;
                const ownedCount = myStructures.filter((s) => s.kind === kind).length;

                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      const now = performance.now();
                      const prev = lastBuildTapRef.current;
                      if (prev && prev.kind === kind && now - prev.time < 420) {
                        lastBuildTapRef.current = null;
                        if (canAfford && urbanUnlocked) {
                          setBuildMode(kind);
                        }
                        return;
                      }
                      lastBuildTapRef.current = { kind, time: now };
                      setInspectedBuildKind(kind);
                      if (selectedStructureId) setSelectedStructureId(null);
                      if (selectedUnitIds.length > 0) setSelectedUnitIds([]);
                    }}
                    onDoubleClick={() => {
                      if (canAfford && urbanUnlocked) {
                        setBuildMode(kind);
                      }
                    }}
                    title={`${shortNameAr} — نقرة لعرض التكلفة، نقرتان للتشييد`}
                    className={`rts2k-hud-tile group relative w-[62px] h-[52px] sm:w-[76px] sm:h-[96px] lg:h-[100px] p-0.5 sm:p-1 flex flex-col items-center justify-between shrink-0 cursor-pointer select-none ${
                      isSelectedBuild
                        ? 'rts2k-bevel-btn-emerald'
                        : isInspected
                          ? 'rts2k-bevel-btn-gold'
                          : 'rts2k-bevel-btn'
                    } ${!canAfford || !urbanUnlocked ? 'opacity-55' : ''}`}
                  >
                    {/* Top Corner Subtle Badge: Lock Tier or Owned Count */}
                    {!urbanUnlocked ? (
                      <span className="absolute top-0.5 right-0.5 text-[7px] sm:text-[8px] font-mono font-bold text-[#d47a70]">
                        Lv.{spec.requiredUrbanTier}
                      </span>
                    ) : ownedCount > 0 ? (
                      <span
                        className={`absolute top-0.5 right-0.5 text-[7px] sm:text-[8px] font-mono font-bold ${
                          isInspected ? 'text-[#241609]' : 'text-[#c8b28e]'
                        }`}
                      >
                        ×{ownedCount}
                      </span>
                    ) : null}

                    {/* Center Large Hand-Crafted Isometric Building Artwork */}
                    <div className="w-full flex-1 flex items-center justify-center">
                      <BuildingIsometricPortrait
                        kind={kind}
                        culture={effectiveBuildCulture}
                        className="rts2k-hud-tile-art w-8 h-7 sm:w-12 sm:h-11 transition-transform duration-150 group-hover:scale-105"
                      />
                    </div>

                    {/* Clean Single-Line Building Title */}
                    <div
                      className={`w-full text-center text-[8.5px] sm:text-[10px] font-bold leading-tight truncate ${
                        isInspected ? 'text-[#190f04]' : 'text-[#ffebb0]'
                      }`}
                    >
                      {shortNameAr}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* LEFT SECTION: COMPACT AGED VELLUM PARCHMENT SCROLL PLAQUE */}
            <div className="rts2k-hud-parchment relative w-full sm:w-[275px] md:w-[325px] lg:w-[410px] flex-1 sm:flex-none sm:h-full rts2k-parchment px-2.5 sm:px-3 py-1 flex flex-col justify-between shrink-0 overflow-hidden">
              <BrassCornerMountSvg corner="tr" className="hidden sm:block absolute top-0.5 right-0.5 pointer-events-none" />
              <BrassCornerMountSvg corner="tl" className="hidden sm:block absolute top-0.5 left-0.5 pointer-events-none" />

              {buildMode ? (
                /* PARCHMENT CONTEXT A: ACTIVE BUILD PLACEMENT ON MAP */
                (() => {
                  const fortTerrain = evaluateFortificationTerrain(hoverTerrain.x, hoverTerrain.z);
                  const rotDeg = Math.round(((buildRotationY * 180) / Math.PI) % 360);
                  const isContinuous = buildMode === 'stone_wall' || buildMode === 'moat_trench';
                  return (
                    <div className="h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between gap-1.5 border-b border-[#7d5929]/50 pb-0.5 sm:pb-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <div className="w-7 h-7 sm:w-9 sm:h-9 rts2k-ink-well flex items-center justify-center shrink-0">
                            <BuildingIsometricPortrait
                              kind={buildMode}
                              culture={effectiveBuildCulture}
                              className="w-6 h-5 sm:w-8 sm:h-7"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-chronicle text-xs sm:text-sm font-bold text-[#241609] truncate">
                              تشييد: {STRUCTURE_SPECS[buildMode].labelAr.split(' (')[0]}
                            </div>
                            <div className="text-[9px] sm:text-[9.5px] font-semibold text-[#593d18] truncate">
                              {buildPreview && !buildPreview.canPlace
                                ? buildPreview.reasonAr ?? 'اختر خانة خضراء متاحة على الشبكة'
                                : isContinuous
                                  ? `شبكة محاذاة 2م نشطة · ${fortLineMode ? 'حدد البداية ثم النهاية لمدّ السور' : 'انقر للتثبيت المتتابع'}`
                                  : `شبكة محاذاة 2م نشطة · ${hoverEnvFit.ratingLabelAr}`}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setShowBuildGrid((prev) => !prev);
                              soundFx.playSelect();
                            }}
                            title="إظهار أو إخفاء شبكة البناء"
                            className={`h-7 px-1.5 text-[9.5px] font-bold flex items-center gap-1 shrink-0 cursor-pointer ${
                              showBuildGrid ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn'
                            }`}
                          >
                            <Grid3X3 className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={handleRotateBuild}
                            title="تدوير اتجاه البناء 45° (اختصار: R)"
                            className="h-7 px-2 rts2k-bevel-btn-gold text-[9.5px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3" />
                            <span dir="ltr">{rotDeg}°</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setBuildMode(null);
                              setBuildPreview(null);
                            }}
                            className="h-7 px-2 rts2k-bevel-btn-crimson text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>إلغاء</span>
                          </button>
                        </div>
                      </div>

                      <div className="rts2k-compact-hide flex items-center justify-between gap-2 text-[9px] sm:text-[9.5px] text-[#3d250d] font-semibold">
                        <span className="truncate">
                          التضاريس: {fortTerrain.labelAr}
                          {fortTerrain.isHighGround
                            ? ` (+${fortTerrain.rangeBonusPct}% مدى · +${fortTerrain.defenseBonusPct}% متانة)`
                            : fortTerrain.isWaterFedMoat && buildMode === 'moat_trench'
                              ? ' (خندق مائي طبيعي!)'
                              : ''}
                        </span>
                        <span dir="ltr" className="font-mono shrink-0">
                          ↑{Math.round(fortTerrain.elevationM)}م · {hoverTempC}°C
                        </span>
                      </div>

                      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-1 border-t border-[#7d5929]/50">
                        {(Object.keys(CULTURE_SPECS) as CultureKind[]).map((cKey) => {
                          const cSpec = CULTURE_SPECS[cKey];
                          const isCurrent =
                            !autoMatchBiomeCulture && effectiveBuildCulture === cKey;
                          return (
                            <button
                              key={cKey}
                              type="button"
                              onClick={() => {
                                setAutoMatchBiomeCulture(false);
                                setPlacementCultureOverride(cKey);
                              }}
                              className={`h-6 px-1.5 text-[9px] font-bold flex items-center gap-1 shrink-0 cursor-pointer ${
                                isCurrent ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn'
                              }`}
                            >
                              <span>{cSpec.shortAr.split(' ')[0]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()
              ) : selectedStructure ? (
                /* PARCHMENT CONTEXT B: SELECTED STRUCTURE ON MAP (FRIENDLY OR RIVAL) */
                (() => {
                  const isMine = selectedStructure.ownerId === playerId;
                  const ownerPlayer = worldState?.players?.[selectedStructure.ownerId];
                  const stSpec = STRUCTURE_SPECS[selectedStructure.kind];
                  const stCult = normalizeCultureKind(selectedStructure.culture ?? activeCulture);
                  const stCultSpec = CULTURE_SPECS[stCult] ?? CULTURE_SPECS.iraqi_mesopotamian;
                  const stBiome = getBiomeAt(selectedStructure.x, selectedStructure.z);
                  const fit = evaluateEnvironmentalFit(
                    stCult,
                    stBiome,
                    getEffectiveClimateAt(
                      selectedStructure.x,
                      selectedStructure.z,
                      activeClimateId
                    ),
                    selectedStructure.level
                  );
                  const hpPct = Math.max(
                    0,
                    Math.min(
                      100,
                      Math.round(
                        (selectedStructure.hp / Math.max(1, selectedStructure.maxHp)) * 100
                      )
                    )
                  );
                  const defSpec = getStructureDefenseSpec(
                    selectedStructure.kind,
                    selectedStructure.level
                  );
                  const buildPct = Math.round(selectedStructure.constructionProgress ?? 0);
                  const upgradeReq =
                    isMine && !selectedStructure.isConstructing
                      ? getStructureUpgradeRequirement(
                          selectedStructure.kind,
                          selectedStructure.level
                        )
                      : null;
                  const uCost = upgradeReq?.cost ?? {};
                  const hasRes =
                    (myPlayer?.resources.wood ?? 0) >= (uCost.wood ?? 0) &&
                    (myPlayer?.resources.stone ?? 0) >= (uCost.stone ?? 0) &&
                    (myPlayer?.resources.gold ?? 0) >= (uCost.gold ?? 0) &&
                    (myPlayer?.resources.food ?? 0) >= (uCost.food ?? 0) &&
                    (myPlayer?.resources.cloth ?? 0) >= (uCost.cloth ?? 0);
                  const tierOk = upgradeReq
                    ? economyStats.urbanReport.tier >= upgradeReq.requiredTier
                    : false;
                  const stFortTerrain = evaluateFortificationTerrain(
                    selectedStructure.x,
                    selectedStructure.z
                  );
                  const isDamaged =
                    isMine &&
                    !selectedStructure.isConstructing &&
                    selectedStructure.hp < selectedStructure.maxHp;

                  return (
                    <div className="h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between gap-2 border-b border-[#7d5929]/50 pb-0.5 sm:pb-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <div className="w-7 h-7 sm:w-9 sm:h-9 rts2k-ink-well flex items-center justify-center shrink-0">
                            <BuildingIsometricPortrait
                              kind={selectedStructure.kind}
                              culture={stCult}
                              className="w-6 h-5 sm:w-8 sm:h-7"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-chronicle text-xs sm:text-sm font-bold text-[#241609] truncate">
                              {stSpec.labelAr.split(' (')[0]} · Lv.{selectedStructure.level}
                            </div>
                            <div className="text-[9px] font-semibold text-[#593d18] truncate">
                              {isMine ? (
                                `${stCultSpec.shortAr}${
                                  selectedStructure.kind === 'gatehouse'
                                    ? selectedStructure.isGateLocked
                                      ? ' · البوابة مغلقة بالكامل'
                                      : ' · مفتوحة لجنودك فقط'
                                    : selectedStructure.kind === 'moat_trench'
                                      ? selectedStructure.isWaterMoat
                                        ? ' · خندق مائي غامر (-64% سرعة العدو)'
                                        : ' · خندق وأوتاد (-58% سرعة العدو)'
                                      : stFortTerrain.isHighGround
                                        ? ` · ${stFortTerrain.labelAr} (+${stFortTerrain.rangeBonusPct}% مدى)`
                                        : ` · ${fit.ratingLabelAr}`
                                }`
                              ) : (
                                <span className="text-[#872b24] font-bold">
                                  {ownerPlayer?.isBandit
                                    ? `وكر قطاع الطرق: ${ownerPlayer?.name ?? 'عصابة قطاع الطرق'}`
                                    : ownerPlayer?.isAi
                                      ? `${
                                          ownerPlayer.aiFactionKind === 'crusaders'
                                            ? 'الصليبيون'
                                            : ownerPlayer.aiFactionKind === 'local_emirate'
                                              ? 'إمارة محلية'
                                              : 'الدولة السندية'
                                        } · ${
                                          ownerPlayer.administrationTitleAr ??
                                          ownerPlayer.factionName ??
                                          ownerPlayer.name
                                        }${ownerPlayer.provinceAr ? ` (${ownerPlayer.provinceAr})` : ''}`
                                      : `حصن حليف: ${ownerPlayer?.name ?? 'قائد حليف'}`}
                                  {defSpec.canAttack
                                    ? ` · رمي ${defSpec.damage} (مدى ${defSpec.rangeMeters}م)`
                                    : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedStructureId(null)}
                          title="العودة لمخطوطة البناء"
                          className="w-6 h-6 rts2k-bevel-btn-crimson flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Segmented 2000s Health / Construction Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-mono font-bold text-[#3d250d]">
                          <span>
                            {selectedStructure.isConstructing
                              ? `قيد التشييد: ${buildPct}% (عمال البناء: ${selectedStructure.activeBuildersCount ?? 0})`
                              : `المتانة: ${selectedStructure.hp} / ${selectedStructure.maxHp} HP`}
                          </span>
                          <span>{selectedStructure.isConstructing ? `${buildPct}%` : `${hpPct}%`}</span>
                        </div>
                        <div className="h-3 rts2k-ink-well p-[1px]">
                          <div
                            className={`h-full rts2k-segmented-bar ${
                              !isMine
                                ? 'bg-[#b91c1c]'
                                : selectedStructure.isConstructing
                                  ? 'bg-[#d4a656]'
                                  : hpPct > 55
                                    ? 'bg-[#6b8c42]'
                                    : hpPct > 25
                                      ? 'bg-[#c8902e]'
                                      : 'bg-[#872b24]'
                            }`}
                            style={{
                              width: `${selectedStructure.isConstructing ? buildPct : hpPct}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#7d5929]/50 overflow-x-auto no-scrollbar">
                        {!isMine ? (
                          <button
                            type="button"
                            onClick={() => {
                              const attackers =
                                selectedUnitIds.length > 0
                                  ? selectedUnitIds
                                  : militaryUnits.length > 0
                                    ? militaryUnits.map((u) => u.id)
                                    : myUnits.map((u) => u.id);
                              if (attackers.length > 0) {
                                setSelectedUnitIds(attackers);
                                attackTarget(attackers, {
                                  targetStructureId: selectedStructure.id,
                                });
                                soundFx.playAttackOrder();
                              }
                            }}
                            className="h-7 px-3 rts2k-bevel-btn-crimson text-[10px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            <Swords className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              أمر الجيش بالمهاجمة ({militaryUnits.length > 0 ? militaryUnits.length : myUnits.length})
                            </span>
                          </button>
                        ) : (
                          <>
                            {selectedStructure.kind === 'gatehouse' &&
                              !selectedStructure.isConstructing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    toggleGate(selectedStructure.id);
                                    soundFx.playSelect();
                                  }}
                                  className={`h-7 px-2.5 text-[9.5px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer ${
                                    selectedStructure.isGateLocked
                                      ? 'rts2k-bevel-btn-crimson'
                                      : 'rts2k-bevel-btn-emerald'
                                  }`}
                                >
                                  {selectedStructure.isGateLocked ? (
                                    <>
                                      <Unlock className="w-3 h-3 shrink-0" />
                                      <span>فتح البوابة للحلفاء</span>
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="w-3 h-3 shrink-0" />
                                      <span>إغلاق المزلاج</span>
                                    </>
                                  )}
                                </button>
                              )}

                            {fit.rating !== 'ideal' && fit.recommendedCulture !== stCult && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAdaptSingleStructure(
                                    selectedStructure.id,
                                    fit.recommendedCulture
                                  )
                                }
                                className="h-7 px-2 rts2k-bevel-btn-emerald text-[9.5px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3 shrink-0" />
                                <span>
                                  تكييف ({CULTURE_SPECS[fit.recommendedCulture].shortAr.split(' ')[0]})
                                </span>
                              </button>
                            )}

                            {isDamaged && (
                              <button
                                type="button"
                                onClick={() => {
                                  const w =
                                    myUnits.find(
                                      (u) => u.kind === 'worker' && u.state === 'idle'
                                    ) ??
                                    myUnits.find((u) => u.kind === 'worker') ??
                                    myUnits[0];
                                  if (w) {
                                    repairStructure([w.id], selectedStructure.id);
                                    soundFx.playMoveOrder();
                                  }
                                }}
                                className="h-7 px-2 rts2k-bevel-btn-emerald text-[9.5px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                              >
                                <Wrench className="w-3 h-3 shrink-0" />
                                <span>ترميم بالعامل</span>
                              </button>
                            )}

                            {selectedStructure.isConstructing ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const candidateWorker =
                                    myUnits.find(
                                      (u) =>
                                        u.kind === 'worker' &&
                                        u.assignedStructureId !== selectedStructure.id &&
                                        u.state === 'idle'
                                    ) ??
                                    myUnits.find(
                                      (u) =>
                                        u.kind === 'worker' &&
                                        u.assignedStructureId !== selectedStructure.id
                                    );
                                  if (candidateWorker) {
                                    handleMoveUnits(
                                      [candidateWorker.id],
                                      selectedStructure.x,
                                      selectedStructure.z
                                    );
                                  }
                                }}
                                className="h-7 px-2.5 rts2k-bevel-btn-gold text-[10px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                              >
                                <Pickaxe className="w-3 h-3 shrink-0" />
                                <span>+إرسال عامل للبناء</span>
                              </button>
                            ) : (
                              upgradeReq && (
                                <button
                                  type="button"
                                  disabled={!hasRes || !tierOk}
                                  onClick={() => handleUpgradeStructure(selectedStructure.id)}
                                  className="h-7 px-2.5 rts2k-bevel-btn-gold disabled:opacity-45 text-[10px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                                >
                                  <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>
                                    {!tierOk
                                      ? `تطوير Lv.${upgradeReq.nextLevel} (تحضر Lv.${upgradeReq.requiredTier})`
                                      : `تطوير إلى Lv.${upgradeReq.nextLevel}`}
                                  </span>
                                </button>
                              )
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : selectedEnemyUnit ? (
                /* PARCHMENT CONTEXT B2: INSPECTED ENEMY / BANDIT UNIT */
                (() => {
                  const enemyOwner = worldState?.players?.[selectedEnemyUnit.ownerId];
                  const isBandit = Boolean(
                    selectedEnemyUnit.isBanditUnit || enemyOwner?.isBandit
                  );
                  const effStats = getUnitEffectiveCombatStats(selectedEnemyUnit);
                  const clanKey =
                    selectedEnemyUnit.banditClanArchetype ?? enemyOwner?.banditCampArchetype;
                  const clanOutfit = isBandit && clanKey ? BANDIT_CLAN_OUTFIT_AR[clanKey] : null;
                  const banditStateLabel =
                    isBandit && selectedEnemyUnit.banditState
                      ? BANDIT_STATE_LABELS_AR[selectedEnemyUnit.banditState]
                      : null;
                  const loot = selectedEnemyUnit.carriedLoot;
                  const totalLoot = getTotalCarriedLoot(loot);
                  const hpPct = Math.max(
                    0,
                    Math.min(
                      100,
                      Math.round(
                        (selectedEnemyUnit.hp / Math.max(1, selectedEnemyUnit.maxHp)) * 100
                      )
                    )
                  );
                  return (
                    <div className="h-full flex flex-col justify-between gap-1">
                      <div className="flex items-center justify-between gap-2 border-b border-[#7d5929]/50 pb-1">
                        <div className="min-w-0">
                          <div className="font-chronicle text-xs sm:text-sm font-bold text-[#872b24] truncate">
                            {isBandit ? 'قاطع طريق' : 'جندي حامية'}: {effStats.shortAr}
                          </div>
                          <div className="text-[9px] font-semibold text-[#593d18] truncate">
                            {enemyOwner?.administrationTitleAr ??
                              enemyOwner?.name ??
                              (isBandit ? 'عصابة قطاع طرق' : 'إدارة إقليمية')}{' '}
                            · هجوم {effStats.attack} · دفاع {effStats.defense} · سرعة{' '}
                            {effStats.speed.toFixed(1)} · مدى {effStats.rangeMeters}م
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedEnemyUnitId(null)}
                          className="w-6 h-6 rts2k-bevel-btn-crimson flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-mono font-bold text-[#3d250d]">
                          <span>{isBandit ? 'صحة قاطع الطريق (عتاد خفيف)' : 'صحة الهدف العدو'}</span>
                          <span>
                            {Math.round(selectedEnemyUnit.hp)} / {selectedEnemyUnit.maxHp} ({hpPct}%)
                          </span>
                        </div>
                        <div className="h-2.5 rts2k-ink-well p-[1px]">
                          <div
                            className="h-full bg-[#b91c1c] rts2k-segmented-bar"
                            style={{ width: `${hpPct}%` }}
                          />
                        </div>

                        {isBandit && (
                          <div className="grid grid-cols-1 gap-0.5 text-[8.5px] leading-tight text-[#43290e]">
                            {banditStateLabel && (
                              <div className="font-bold text-[#7c2d12] truncate">
                                الحالة التكتيكية: {banditStateLabel}
                              </div>
                            )}
                            {effStats.weaponAr && (
                              <div className="truncate">
                                العتاد: {effStats.weaponAr}
                                {effStats.armorAr ? ` · ${effStats.armorAr}` : ''}
                              </div>
                            )}
                            {clanOutfit && !totalLoot && (
                              <div className="truncate text-[#5c3d1a]">
                                الزي: {clanOutfit.attireAr}
                              </div>
                            )}
                            {totalLoot > 0 && loot && (
                              <div className="px-1.5 py-0.5 bg-[#fef3c7]/80 border border-[#b45309]/60 text-[#78350f] font-bold truncate">
                                غنائم مسروقة: {loot.gold} ذهب · {loot.wood} خشب · {loot.food} غذاء
                                (اعترضه لاستعادتها)
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#7d5929]/50">
                        <button
                          type="button"
                          onClick={() => {
                            const attackers =
                              militaryUnits.length > 0
                                ? militaryUnits.map((u) => u.id)
                                : myUnits.map((u) => u.id);
                            if (attackers.length > 0) {
                              setSelectedUnitIds(attackers);
                              setSelectedEnemyUnitId(null);
                              attackTarget(attackers, { targetUnitId: selectedEnemyUnit.id });
                              soundFx.playAttackOrder();
                            }
                          }}
                          className="h-7 px-3 rts2k-bevel-btn-crimson text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Swords className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {totalLoot > 0 ? 'اعتراض واستعادة الغنائم' : 'مهاجمة الهدف بالجيش'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : selectedUnitIds.length > 0 ? (
                /* PARCHMENT CONTEXT C: SELECTED SQUAD OF UNITS */
                (() => {
                  const selectedList = myUnits.filter((u) =>
                    selectedUnitIds.includes(u.id)
                  );
                  const leadUnit = selectedList[0];
                  const leadSpec = leadUnit ? UNIT_SPECS[leadUnit.kind] : null;
                  const avgHpPct =
                    selectedList.length > 0
                      ? Math.round(
                          (selectedList.reduce(
                            (sum, u) => sum + u.hp / Math.max(1, u.maxHp),
                            0
                          ) /
                            selectedList.length) *
                            100
                        )
                      : 100;
                  const curStance: UnitStanceKind = leadUnit?.stance ?? 'aggressive';
                  const stanceAr =
                    curStance === 'aggressive'
                      ? 'هجومي'
                      : curStance === 'defensive'
                        ? 'دفاعي'
                        : 'ثابت';
                  const nextStance: UnitStanceKind =
                    curStance === 'aggressive'
                      ? 'defensive'
                      : curStance === 'defensive'
                        ? 'stand'
                        : 'aggressive';
                  const hasNavalUnit = selectedList.some((u) => u.isNaval);

                  return (
                    <div className="h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between gap-2 border-b border-[#7d5929]/50 pb-1">
                        <div className="min-w-0">
                          <div className="font-chronicle text-xs sm:text-sm font-bold text-[#241609] truncate">
                            كتيبة: {selectedList.length}{' '}
                            {leadSpec ? `(${leadSpec.labelAr.split(' (')[0]})` : 'وحدة'}
                            {hasNavalUnit ? ' · سفن حربية' : ''}
                          </div>
                          <div className="text-[9px] font-semibold text-[#593d18] truncate">
                            {commandMode === 'attack_move'
                              ? 'انقر على الخريطة لبدء زحف هجومي (هجوم-تحرك)'
                              : 'انقر على عدو أو مبنى معادٍ للاشتباك أو على الأرض للتحرك'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUnitIds([]);
                            setCommandMode('normal');
                          }}
                          className="w-6 h-6 rts2k-bevel-btn-crimson flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-mono font-bold text-[#3d250d]">
                          <span>
                            صحة الكتيبة · نمط: {stanceAr}
                            {leadSpec ? ` · هجوم ${leadSpec.attack}` : ''}
                          </span>
                          <span>{avgHpPct}%</span>
                        </div>
                        <div className="h-3 rts2k-ink-well p-[1px]">
                          <div
                            className="h-full bg-[#6b8c42] rts2k-segmented-bar"
                            style={{ width: `${avgHpPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#7d5929]/50 overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setCommandMode((prev) =>
                                prev === 'attack_move' ? 'normal' : 'attack_move'
                              )
                            }
                            title="تفعيل وضع هجوم-تحرك: تتحرك الكتيبة وتقاتل أي عدو في طريقها"
                            className={`h-7 px-2 text-[9.5px] font-bold flex items-center gap-1 shrink-0 cursor-pointer ${
                              commandMode === 'attack_move'
                                ? 'rts2k-bevel-btn-crimson'
                                : 'rts2k-bevel-btn-gold'
                            }`}
                          >
                            <Crosshair className="w-3 h-3 shrink-0" />
                            <span>هجوم-تحرك</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setUnitStance(selectedUnitIds, 'stop');
                              setCommandMode('normal');
                            }}
                            title="إيقاف فوري (مفتاح X)"
                            className="h-7 px-2 rts2k-bevel-btn text-[9.5px] font-bold flex items-center gap-1 shrink-0 cursor-pointer text-[#ffebb0]"
                          >
                            <Pause className="w-3 h-3 shrink-0" />
                            <span>إيقاف</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setUnitStance(selectedUnitIds, nextStance)}
                            title="تبديل نمط الاشتباك: هجومي / دفاعي / ثابت (مفتاح H)"
                            className="h-7 px-2 rts2k-bevel-btn-emerald text-[9.5px] font-bold shrink-0 cursor-pointer"
                          >
                            نمط: {stanceAr}
                          </button>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setActivePopup('world')}
                            className="h-7 px-2 rts2k-bevel-btn-gold text-[9.5px] font-bold shrink-0 cursor-pointer"
                          >
                            أطلس
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* PARCHMENT CONTEXT D (DEFAULT): INSPECTED BUILDING BLUEPRINT DOSSIER */
                (() => {
                  const targetKind =
                    inspectedBuildKind ?? filteredStructureKinds[0] ?? 'house';
                  const spec = STRUCTURE_SPECS[targetKind];
                  const buildCultSpec = CULTURE_SPECS[effectiveBuildCulture];
                  const shortNameAr = spec.labelAr.split(' (')[0];
                  const woodCost = spec.cost.wood ?? 0;
                  const stoneCost = spec.cost.stone ?? 0;
                  const goldCost = spec.cost.gold ?? 0;
                  const foodCost = spec.cost.food ?? 0;
                  const clothCost = spec.cost.cloth ?? 0;
                  const hasWood = (myPlayer?.resources.wood ?? 0) >= woodCost;
                  const hasStone = (myPlayer?.resources.stone ?? 0) >= stoneCost;
                  const hasGold = (myPlayer?.resources.gold ?? 0) >= goldCost;
                  const hasFood = (myPlayer?.resources.food ?? 0) >= foodCost;
                  const hasCloth = (myPlayer?.resources.cloth ?? 0) >= clothCost;
                  const canAfford = hasWood && hasStone && hasGold && hasFood && hasCloth;
                  const urbanUnlocked =
                    economyStats.urbanReport.tier >= spec.requiredUrbanTier;

                  const roleTextAr =
                    targetKind === 'house'
                      ? 'حي بيوت متلاصقة الجدران ومختلفة التخطيط: يأوي +650..3,800 نسمة (+5..16 وحدة) ويمنح +25% للمزارع المجاورة.'
                      : targetKind === 'bedouin_tent'
                        ? 'مضرب وبيوت شعر بدوية بالسدو: يأوي +420..2,100 نسمة (+7..20 وحدة) وينتج القماش والغذاء.'
                        : targetKind === 'farm'
                          ? 'ينتج الغذاء والقطن باستمرار ويزداد +25% بجوار كل بيت أو مضرب بدوي.'
                          : targetKind === 'livestock_ranch'
                            ? 'مراح مواشي ومغزل صوف: ينتج القماش والقطن (+10) والغذاء وترعى حوله الإبل والضأن.'
                            : targetKind === 'horse_stable'
                              ? 'مربط ترويض الخيول الأصيلة: ينتج الخيول (+7) ويرفع سعة الجيش ويمنح الفرسان +8% سرعة.'
                              : targetKind === 'market'
                                ? 'يدر الذهب من القوافل ويفتح تجارة الموارد والقماش والخيول ويرفع سعادة الأهالي.'
                                : targetKind === 'lumber_camp'
                                  ? 'ينتج الخشب ويرفع سعة تخزين المملكة +600 لكل مستوى.'
                                  : targetKind === 'quarry'
                                    ? 'يستخرج الحجر والذهب ويرفع سعة المخازن +600 لكل مستوى.'
                                    : targetKind === 'stone_wall'
                                      ? 'سور حجري محصّن يصدّ الغزاة ويقبل التدوير (R) والرصف المتواصل؛ في Lv.2 يرمي السهام ويستفيد من المرتفعات.'
                                      : targetKind === 'gatehouse'
                                        ? 'بوابة حصن ببرجين ومزلاج حديدي: تسمح بعبور جيشك وتمنع العدو وتمطرهم بالسهام، وتقبل الفتح والإغلاق.'
                                        : targetKind === 'moat_trench'
                                          ? 'خندق دفاعي وأوتاد يبطئ جيش العدو -58% ويلحق به ضرراً مستمراً؛ يصبح خندقاً مائياً قرب الأنهار والواحات.'
                                          : targetKind === 'siege_workshop'
                                            ? 'ورشة هندسة عسكرية لصناعة كبش النطاح المدرّع والمنجنيق الثقيل لدكّ الأسوار والبوابات المحصّنة.'
                                            : targetKind === 'war_tent'
                                              ? 'فسطاط حربي ميداني: يرفع سعة الجيش (+6..16) ويدرّب الجند والفرسان.'
                                              : targetKind === 'barracks'
                                                ? 'ثكنة عسكرية لتدريب المشاة والرماة وحراسة حدود المستوطنة.'
                                                : targetKind === 'watchtower'
                                                  ? 'برج رصد يحمي حدود المستوطنة ويكسب +14%..24% مدى وضرراً إضافياً عند بنائه على المرتفعات.'
                                                  : targetKind === 'temple'
                                                    ? `صرح حضاري يمنح +${spec.urbanPoints} نقطة تحضر ويرفع سعادة السكان والذهب.`
                                                    : 'معقل المملكة الحصين، يرفع السكان (+12..20) والمخازن (+1200..3600) ويستفيد من المرتفعات.';

                  return (
                    <div
                      onDoubleClick={() => {
                        if (canAfford && urbanUnlocked) {
                          setBuildMode(targetKind);
                        }
                      }}
                      className="h-full flex flex-col justify-between"
                    >
                      {/* Row 1: Title + Stats (Desktop/Tablet) */}
                      <div className="hidden sm:flex items-center justify-between gap-1.5 border-b border-[#7d5929]/50 pb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-chronicle text-xs font-bold text-[#241609] truncate">
                            {shortNameAr}
                          </span>
                          <span className="text-[9px] font-semibold text-[#6e4512] hidden md:inline truncate">
                            ({buildCultSpec.shortAr})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[8.5px] font-mono font-bold text-[#3d250d] shrink-0">
                          <span>متانة:{spec.maxHp}</span>
                          <span>بناء:{spec.buildTimeSeconds}ث</span>
                          <span>تحضر:+{spec.urbanPoints}ن</span>
                        </div>
                      </div>

                      {/* Row 2: Concise Historical Description (Desktop/Tablet) */}
                      <p className="hidden sm:block rts2k-compact-hide text-[9.5px] text-[#241609] font-medium leading-tight line-clamp-2 my-0.5">
                        {roleTextAr}
                      </p>

                      {/* Row 3: Resource Cost Icons (Horizontally Scrollable) + Direct Build Button */}
                      <div className="flex items-center justify-between gap-1.5 sm:pt-0.5 sm:border-t sm:border-[#7d5929]/50 my-auto sm:my-0">
                        <div className="min-w-0 flex-1 flex items-center gap-1.5 text-[9.5px] font-mono font-bold overflow-x-auto no-scrollbar">
                          <span className="sm:hidden font-chronicle text-[11px] font-bold text-[#241609] shrink-0">
                            {shortNameAr}
                          </span>
                          {woodCost > 0 && (
                            <span
                              className={`flex items-center gap-0.5 ${
                                hasWood ? 'text-[#241609]' : 'text-[#872b24]'
                              }`}
                            >
                              <ResourceArtworkSvg kind="wood" className="w-3.5 h-3.5" />
                              {woodCost}
                            </span>
                          )}
                          {stoneCost > 0 && (
                            <span
                              className={`flex items-center gap-0.5 ${
                                hasStone ? 'text-[#241609]' : 'text-[#872b24]'
                              }`}
                            >
                              <ResourceArtworkSvg kind="stone" className="w-3.5 h-3.5" />
                              {stoneCost}
                            </span>
                          )}
                          {foodCost > 0 && (
                            <span
                              className={`flex items-center gap-0.5 ${
                                hasFood ? 'text-[#241609]' : 'text-[#872b24]'
                              }`}
                            >
                              <ResourceArtworkSvg kind="food" className="w-3.5 h-3.5" />
                              {foodCost}
                            </span>
                          )}
                          {clothCost > 0 && (
                            <span
                              className={`flex items-center gap-0.5 ${
                                hasCloth ? 'text-[#241609]' : 'text-[#872b24]'
                              }`}
                            >
                              <ResourceArtworkSvg kind="cloth" className="w-3.5 h-3.5" />
                              {clothCost}
                            </span>
                          )}
                          {goldCost > 0 && (
                            <span
                              className={`flex items-center gap-0.5 ${
                                hasGold ? 'text-[#241609]' : 'text-[#872b24]'
                              }`}
                            >
                              <ResourceArtworkSvg kind="gold" className="w-3.5 h-3.5" />
                              {goldCost}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={!canAfford || !urbanUnlocked}
                          onClick={() => {
                            if (canAfford && urbanUnlocked) {
                              setBuildMode(targetKind);
                            }
                          }}
                          className="h-6 sm:h-7 px-2 sm:px-2.5 rts2k-bevel-btn-gold disabled:opacity-45 text-[9.5px] sm:text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Hammer className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {!urbanUnlocked
                              ? `يتطلب تحضر Lv.${spec.requiredUrbanTier}`
                              : !canAfford
                                ? 'موارد غير كافية'
                                : 'تشييد المبنى'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </>
        )}
          </>
        )}
      </footer>

      {/* =====================================================================
          3. 2000s ROYAL CAMPAIGN CHRONICLE MODALS
         ===================================================================== */}
      {activePopup !== null && activePopup !== 'structures' && (
        <ChronicleModals
          activePopup={activePopup}
          onSwitchPopup={(nextKind) => setActivePopup(nextKind)}
          onClose={() => setActivePopup(null)}
          lastAckMessage={lastAckMessage}
          myPlayer={myPlayer}
          playerId={playerId}
          playersList={playersList}
          worldState={worldState}
          myUnits={myUnits}
          myStructures={myStructures}
          queuedTrainingCount={trainingQueue.length}
          economyStats={economyStats}
          resourceFilter={resourceFilter}
          onChangeResourceFilter={setResourceFilter}
          sortedResourceNodes={sortedResourceNodes}
          hoverTerrain={hoverTerrain}
          activeBiomeNameAr={activeBiome.nameAr.split(' (')[0]}
          activeClimateId={activeClimateId}
          activeClimateNameAr={activeClimate.nameAr}
          onSpawnUnit={(kind) => handleSpawnUnit(kind)}
          onOpenTrainingCampForUnit={openTrainingCampForUnit}
          onAutoDistributeIdle={autoDistributeIdleUnits}
          onAssignWorkerToResourceKind={assignWorkerToResourceKind}
          onTradeResource={tradeResource}
          onDispatchWorkersToNode={dispatchWorkersToSpecificNode}
          onSelectAllMyUnits={selectAllMyUnits}
          onSelectUnitAndFocus={(u) => {
            triggerCameraPreset({ targetX: u.x, targetZ: u.z, zoom: 20 });
            setSelectedUnitIds([u.id]);
          }}
          onJumpCamera={(targetX, targetZ, zoom) =>
            triggerCameraPreset({ targetX, targetZ, ...(zoom ? { zoom } : {}) })
          }
          onSetClimate={(c, autoCycle) => setClimate(c, autoCycle)}
          selectedUnitIds={selectedUnitIds}
          onDispatchAtlasMarch={(unitIds, waypoints) => {
            dispatchAtlasMarch(unitIds, waypoints);
            setTimeout(() => {
              saveCurrentWorldToCloud();
            }, 500);
          }}
          user={user}
          cloudStatus={cloudStatus}
          lastSyncedAt={lastSyncedAt}
          cloudStructuresCount={cloudStructuresCount}
          cloudUnitsCount={cloudUnitsCount}
          isSyncing={isSyncing}
          onSignInWithGoogle={signInWithGoogle}
          onSaveToCloud={() => saveCurrentWorldToCloud()}
          onSignOutFromCloud={signOutFromCloud}
          customKingdomName={customKingdomName}
          setCustomKingdomName={setCustomKingdomName}
          customPrimaryColor={customPrimaryColor}
          setCustomPrimaryColor={setCustomPrimaryColor}
          customSecondaryColor={customSecondaryColor}
          setCustomSecondaryColor={setCustomSecondaryColor}
          customBannerPattern={customBannerPattern}
          setCustomBannerPattern={setCustomBannerPattern}
          onApplyHeraldry={applyHeraldryCustomization}
          pixelScale={pixelScale}
          setPixelScale={setPixelScale}
          qualityMode={qualityMode}
          setQualityMode={setQualityMode}
          perfStats={perfStats}
          rttMs={rttMs}
          tickRateHz={tickRateHz}
          onResetWorld={handleResetWorld}
        />
      )}

      {/* =====================================================================
          4. PERSISTENT ONLINE CO-OP PVE FRONTS DIRECTOR MODAL
         ===================================================================== */}
      {pveModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="أوكار قطاع الطرق التعاونية"
          className="pointer-events-auto fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-3"
        >
          <div className="w-full max-w-lg rts2k-stone-frame p-3 sm:p-4 text-[#f3e5c8] space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-[#7d5929]/60 pb-2">
              <div className="flex items-center gap-2">
                <Swords className="w-5 h-5 text-[#f59e0b] shrink-0" />
                <div>
                  <h2 className="font-chronicle text-base sm:text-lg font-bold text-[#ffebb0]">
                    مسرح القوى والجبهات (1080م · PvE التعاوني)
                  </h2>
                  <p className="text-[10px] text-[#c8b28e]">
                    عالم أونلاين تعاوني — ولايات الدولة السندية وحامية ساحل القدس وعصابات قطاع الطرق كقوى ذكاء اصطناعي دون المساس بممالك اللاعبين
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPveModalOpen(false)}
                className="w-7 h-7 rts2k-bevel-btn-crimson flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Co-op PvE Summary */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rts2k-ink-well p-2">
                <div className="text-[10px] text-[#c8b28e]">قتلى الخصوم</div>
                <div className="font-mono text-sm font-bold text-[#a3e635] tabular-nums">
                  {myPlayer?.kills ?? 0}
                </div>
              </div>
              <div className="rts2k-ink-well p-2">
                <div className="text-[10px] text-[#c8b28e]">تحصينات مدمرة</div>
                <div className="font-mono text-sm font-bold text-[#fde047] tabular-nums">
                  {myPlayer?.structuresRazed ?? 0}
                </div>
              </div>
              <div className="rts2k-ink-well p-2">
                <div className="text-[10px] text-[#c8b28e]">معاقل مطهرة</div>
                <div className="font-mono text-sm font-bold text-[#7dd3fc] tabular-nums">
                  {pveInfo?.strongholdsCleared ?? 0}
                </div>
              </div>
              <div className="rts2k-ink-well p-2">
                <div className="text-[10px] text-[#c8b28e]">حلفاء متصلون</div>
                <div className="font-mono text-sm font-bold text-[#a3e635] tabular-nums">
                  {alliedCommanders.length + 1}
                </div>
              </div>
            </div>

            {/* Organized AI Factions + Bandit Hideouts Roster */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-[#ffebb0]">القوى والولايات النشطة في المسرح</div>
              <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
                {pveEnemyFronts.length === 0 ? (
                  <div className="rts2k-ink-well p-2 text-xs text-[#c8b28e]">
                    لا توجد قوى نشطة حالياً — اضغط تعزيز الأوكار لنشر عصابات قطاع الطرق.
                  </div>
                ) : (
                  pveEnemyFronts.map((front) => {
                    const fKind = front.aiFactionKind ?? (front.isBandit ? 'bandits' : 'sindhi_state');
                    const factionBadge =
                      fKind === 'sindhi_state'
                        ? { label: 'الدولة السندية', cls: 'text-[#5eead4] bg-[#042f2e]' }
                        : fKind === 'crusaders'
                          ? { label: 'الصليبيون', cls: 'text-[#fca5a5] bg-[#450a0a]' }
                          : fKind === 'local_emirate'
                            ? { label: 'إمارة محلية', cls: 'text-[#ddd6fe] bg-[#2e1065]' }
                            : { label: 'قطاع طرق', cls: 'text-[#fdba74] bg-[#431407]' };
                    const cultSpec = CULTURE_SPECS[normalizeCultureKind(front.culture)];
                    return (
                      <div
                        key={front.id}
                        className="rts2k-ink-well px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3 h-3 border border-black shrink-0"
                            style={{ backgroundColor: front.color }}
                          />
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 shrink-0 ${factionBadge.cls}`}>
                            {factionBadge.label}
                          </span>
                          <span className="font-bold truncate text-[#f3e5c8]">
                            {front.administrationTitleAr ?? front.name}
                          </span>
                          <span className="text-[10px] text-[#c8b28e] hidden sm:inline shrink-0">
                            ({cultSpec.shortAr})
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 shrink-0 ${
                            front.isDefeated
                              ? 'text-[#fde047] bg-[#451a03]'
                              : 'text-[#fca5a5] bg-[#450a0a]'
                          }`}
                        >
                          {front.isDefeated
                            ? front.isBandit
                              ? 'مطهّر · تتجمع قريباً'
                              : 'معقل مفتوح'
                            : front.isBandit
                              ? 'وكر نشط'
                              : 'حامية نشطة'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Co-op Allies */}
            {alliedCommanders.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#7dd3fc]">القادة الحلفاء في العالم</div>
                <div className="flex flex-wrap gap-1.5">
                  {alliedCommanders.map((ally) => (
                    <span
                      key={ally.id}
                      className="rts2k-ink-well px-2 py-1 text-[10px] font-bold text-[#bae6fd] flex items-center gap-1.5"
                    >
                      <span
                        className="w-2.5 h-2.5 border border-black"
                        style={{ backgroundColor: ally.color }}
                      />
                      {ally.factionName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Bandit Threat & Hideout Count Controls */}
            <div className="rts2k-parchment p-2.5 text-[#241609] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold">شراسة قطاع الطرق:</span>
                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'casual', label: 'هادئ' },
                      { id: 'balanced', label: 'متوازن' },
                      { id: 'aggressive', label: 'شرس' },
                    ] as const
                  ).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setPveDiff(d.id)}
                      className={`h-7 px-2.5 text-[11px] font-bold cursor-pointer ${
                        pveDiff === d.id
                          ? 'rts2k-bevel-btn-gold'
                          : 'rts2k-bevel-btn text-[#f3e5c8]'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold">عدد أوكار قطاع الطرق النشطة:</span>
                <div className="flex items-center gap-1">
                  {[2, 3, 4].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setPveStrongholdCount(cnt)}
                      className={`h-7 px-3 text-[11px] font-mono font-bold cursor-pointer ${
                        pveStrongholdCount === cnt
                          ? 'rts2k-bevel-btn-gold'
                          : 'rts2k-bevel-btn text-[#f3e5c8]'
                      }`}
                    >
                      {cnt} أوكار
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {playerId && myPlayer && !hasMyKeep ? (
                <button
                  type="button"
                  onClick={() => {
                    reclaimKeep();
                    setPveModalOpen(false);
                  }}
                  className="h-8 px-3 rts2k-bevel-btn-gold text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Landmark className="w-4 h-4 shrink-0" />
                  <span>إعادة تأسيس معقلي</span>
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPveModalOpen(false)}
                  className="h-8 px-3 rts2k-bevel-btn text-xs font-bold cursor-pointer"
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deployPveFronts(pveDiff, pveStrongholdCount, false);
                    setPveModalOpen(false);
                  }}
                  className="h-8 px-3 rts2k-bevel-btn text-xs font-bold cursor-pointer text-[#fde047]"
                >
                  تغيير مواقع الأوكار
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deployPveFronts(pveDiff, pveStrongholdCount, true);
                    setPveModalOpen(false);
                  }}
                  className="h-8 px-4 rts2k-bevel-btn-emerald text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Swords className="w-4 h-4 shrink-0" />
                  <span>تعزيز الأوكار</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

