import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CameraTransform,
  CombatEvent,
  CultureKind,
  evaluateEnvironmentalFit,
  getBanditRoleForUnitKind,
  getTotalCarriedLoot,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  normalizeCultureKind,
  STRUCTURE_SPECS,
  StructureKind,
  StructureLevel,
  UNIT_SPECS,
  WorldState,
} from '../shared/protocol';

const RESOURCE_LABELS_AR: Record<string, string> = {
  wood: 'أخشاب',
  stone: 'حجارة',
  gold: 'ذهب',
  food: 'غذاء',
  cloth: 'قماش وقطن',
  horses: 'خيول أصيلة',
};
import {
  BiomeKind,
  CHUNK_SIZE,
  CLIMATE_SPECS,
  ClimateKind,
  describeSpatialLocationAt,
  evaluateFortificationTerrain,
  formatBearingAr,
  formatDistanceAr,
  getBiomeAt,
  getEffectiveClimateAt,
  getTerrainHeight,
  MACRO_LANDMARKS,
  SPAWN_PLATEAUS,
  WORLD_HALF_SIZE,
} from '../shared/worldMap';
import {
  BUILD_GRID_CELL_SIZE,
  computeFortificationLineSegments,
  computeFortificationSnap,
  evaluateBuildingPlacementAt,
  FortPlacementItem,
  isLineBuildableFort,
  PlacementCellState,
} from '../shared/fortificationHelpers';
import { BuildPlacementGridOverlay } from '../three/buildGridOverlay';
import {
  build2DPixelResourceSprite,
  build2DPixelUnitSprite,
  getBanditSpriteMaterials,
  getNavalBoatSpriteMaterial,
  getResourceSpriteMaterial,
  getUnitSpriteMaterials,
} from '../three/pixelSprites';
import {
  buildOrUpdateStructureLOD,
  buildRemotePlayerPresence,
  createWallJunctionPier,
  updateGatehouseDoorVisual,
  updateStructureConstructionVisual,
} from '../three/proceduralBlockout';
import { buildWorldTerrain } from '../three/terrainBuilder';
import { AmongUsVisionSystem } from '../three/visionSystem';
import { soundFx } from '../utils/soundFx';

// Module-scope reusable math helpers (Zero GC in render loop)
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPoint = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _targetSkyColor = new THREE.Color();
const _targetFogColor = new THREE.Color();
const _targetSunColor = new THREE.Color();
const _targetHemiSky = new THREE.Color();
const _targetHemiGround = new THREE.Color();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _focusVec = new THREE.Vector3();

const COMPASS_CARDINALS: ReadonlyArray<{ label: string; deg: number; major: boolean }> = [
  { label: 'ش', deg: 0, major: true },
  { label: 'ش.شر', deg: 45, major: false },
  { label: 'شر', deg: 90, major: true },
  { label: 'ج.شر', deg: 135, major: false },
  { label: 'ج', deg: 180, major: true },
  { label: 'ج.غ', deg: 225, major: false },
  { label: 'غ', deg: 270, major: true },
  { label: 'ش.غ', deg: 315, major: false },
];

const COMPASS_LANDMARK_PIPS = 3;

export function getWorldPixelsPerMeter(
  scale: PixelScaleMode,
  quality: RenderQualityMode
): number {
  const basePpm = scale === 1 ? 24 : scale === 2 ? 16 : scale === 3 ? 12 : 9;
  return quality === 'mobile_battery' ? Math.round(basePpm * 0.85) : basePpm;
}

export type TouchInteractionMode = 'pan' | 'select';
export type RenderQualityMode = 'mobile_battery' | 'balanced' | 'high';
export type PixelScaleMode = 1 | 2 | 3 | 4;
export type CameraProjectionMode = 'isometric_2000s' | 'perspective_3d';

export interface RenderPerfStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometriesInVram: number;
  texturesInVram: number;
  resolutionLabel?: string;
  worldPixelsPerMeter?: number;
}

export interface HoverTerrainInfo {
  x: number;
  z: number;
  elevation: number;
  biome: BiomeKind;
}

export interface HoveredEntityInfo {
  entityKind: 'unit' | 'structure' | 'resource';
  id: string;
  titleAr: string;
  subtitleAr: string;
  hpPct?: number;
  accentColor?: string;
}

export interface CameraPresetCommand {
  id: number;
  targetX?: number;
  targetZ?: number;
  zoom?: number;
  pitch?: number;
  yaw?: number;
  yawDelta?: number;
  panDeltaX?: number;
  panDeltaZ?: number;
}

export interface BuildPreviewStatus {
  snapped: boolean;
  replaceWallWithGate: boolean;
  lineAnchored: boolean;
  lineCount: number;
  validCount: number;
  canPlace: boolean;
  isTouchAim: boolean;
  gridX: number;
  gridZ: number;
  placementState: PlacementCellState;
  reasonAr?: string;
}

export interface BuildGridNudgeCommand {
  id: number;
  dxCells: number;
  dzCells: number;
}

interface StrategicViewportProps {
  playerId: string | null;
  worldRef: React.MutableRefObject<WorldState | null>;
  selectedUnitIds: string[];
  onSelectUnits: (ids: string[]) => void;
  selectedStructureId: string | null;
  onSelectStructure: (id: string | null) => void;
  onSelectEnemyUnit?: (id: string | null) => void;
  buildMode: StructureKind | null;
  buildCulture?: CultureKind;
  buildRotationY?: number;
  showBuildGrid?: boolean;
  nudgeBuildCommand?: BuildGridNudgeCommand | null;
  fortLineMode?: boolean;
  wallLineWithTowers?: boolean;
  confirmBuildTrigger?: number;
  cancelLineTrigger?: number;
  onRotateBuild?: () => void;
  onBuildPreviewChange?: (status: BuildPreviewStatus) => void;
  commandMode?: 'normal' | 'attack_move';
  onClearCommandMode?: () => void;
  onCancelBuildMode: () => void;
  onPlaceStructure: (kind: StructureKind, x: number, z: number, rotationY: number) => void;
  onPlaceFortBatch?: (items: FortPlacementItem[]) => void;
  onMoveUnits: (unitIds: string[], targetX: number, targetZ: number, resourceId?: string) => void;
  onAttackTarget?: (
    unitIds: string[],
    opts: {
      targetUnitId?: string;
      targetStructureId?: string;
      targetX?: number;
      targetZ?: number;
      attackMove?: boolean;
    }
  ) => void;
  onRepairStructure?: (unitIds: string[], structureId: string) => void;
  onUnitStance?: (unitIds: string[], action: 'stop' | 'aggressive' | 'defensive' | 'stand') => void;
  onUnderAttackAlert?: (
    x: number,
    z: number,
    labelAr?: string,
    tone?: 'danger' | 'loot' | 'recovered'
  ) => void;
  onSyncCamera: (cam: CameraTransform) => void;
  cameraCommand: CameraPresetCommand | null;
  touchMode: TouchInteractionMode;
  qualityMode: RenderQualityMode;
  pixelScale?: PixelScaleMode;
  projectionMode?: CameraProjectionMode;
  onHoverCoordsChange?: (info: HoverTerrainInfo) => void;
  onHoverEntityChange?: (info: HoveredEntityInfo | null) => void;
  onPerfStatsChange?: (stats: RenderPerfStats) => void;
  onZoomOutToStrategicMap?: (worldX: number, worldZ: number, currentZoom: number) => void;
  paused?: boolean;
}

export const StrategicViewport: React.FC<StrategicViewportProps> = React.memo(({
  playerId,
  worldRef,
  selectedUnitIds,
  onSelectUnits,
  selectedStructureId,
  onSelectStructure,
  onSelectEnemyUnit,
  buildMode,
  buildCulture,
  buildRotationY = 0,
  showBuildGrid = true,
  nudgeBuildCommand = null,
  fortLineMode = true,
  wallLineWithTowers = true,
  confirmBuildTrigger = 0,
  cancelLineTrigger = 0,
  onRotateBuild,
  onBuildPreviewChange,
  commandMode = 'normal',
  onClearCommandMode,
  onCancelBuildMode,
  onPlaceStructure,
  onPlaceFortBatch,
  onMoveUnits,
  onAttackTarget,
  onRepairStructure,
  onUnitStance,
  onUnderAttackAlert,
  onSyncCamera,
  cameraCommand,
  touchMode,
  qualityMode,
  pixelScale = 3,
  projectionMode = 'isometric_2000s',
  onHoverCoordsChange,
  onHoverEntityChange,
  onPerfStatsChange,
  onZoomOutToStrategicMap,
  paused = false,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [webglContextLost, setWebglContextLost] = useState(false);
  const [selectionBoxRect, setSelectionBoxRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const playerIdRef = useRef<string | null>(playerId);
  playerIdRef.current = playerId;

  const selectedUnitIdsRef = useRef<string[]>(selectedUnitIds);
  selectedUnitIdsRef.current = selectedUnitIds;

  const selectedStructureIdRef = useRef<string | null>(selectedStructureId);
  selectedStructureIdRef.current = selectedStructureId;

  const buildModeRef = useRef<StructureKind | null>(buildMode);
  buildModeRef.current = buildMode;

  const buildCultureRef = useRef<CultureKind | undefined>(buildCulture);
  buildCultureRef.current = buildCulture;

  const buildRotationYRef = useRef<number>(buildRotationY);
  buildRotationYRef.current = buildRotationY;

  const showBuildGridRef = useRef<boolean>(showBuildGrid);
  showBuildGridRef.current = showBuildGrid;

  const fortLineModeRef = useRef<boolean>(fortLineMode);
  fortLineModeRef.current = fortLineMode;

  const wallLineWithTowersRef = useRef<boolean>(wallLineWithTowers);
  wallLineWithTowersRef.current = wallLineWithTowers;

  const isTouchAimRef = useRef<boolean>(
    typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(pointer: coarse)')?.matches)
  );
  const [showCenterCrosshair, setShowCenterCrosshair] = useState<boolean>(
    isTouchAimRef.current
  );
  const lineAnchorRef = useRef<{ x: number; z: number } | null>(null);
  const confirmBuildActionRef = useRef<(() => void) | null>(null);
  const reticleRingRef = useRef<SVGCircleElement | null>(null);
  const reticleDotRef = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    lineAnchorRef.current = null;
  }, [buildMode, fortLineMode, cancelLineTrigger]);

  useEffect(() => {
    if (confirmBuildTrigger > 0) {
      confirmBuildActionRef.current?.();
    }
  }, [confirmBuildTrigger]);

  const commandModeRef = useRef<'normal' | 'attack_move'>(commandMode);
  commandModeRef.current = commandMode;

  const touchModeRef = useRef<TouchInteractionMode>(touchMode);
  touchModeRef.current = touchMode;

  const qualityModeRef = useRef<RenderQualityMode>(qualityMode);
  qualityModeRef.current = qualityMode;

  const pixelScaleRef = useRef<PixelScaleMode>(pixelScale);
  pixelScaleRef.current = pixelScale;

  const projectionModeRef = useRef<CameraProjectionMode>(projectionMode);
  projectionModeRef.current = projectionMode;

  const pausedRef = useRef<boolean>(paused);
  pausedRef.current = paused;
  const resumeTickRef = useRef<(() => void) | null>(null);
  const clearInputRef = useRef<(() => void) | null>(null);

  // Zero-Rerender 3D Spatial Awareness HUD Refs (Compass, Location Headline, Keep Homing & Horizon Beacons)
  const locationHeadlineElRef = useRef<HTMLSpanElement | null>(null);
  const locationCoordsElRef = useRef<HTMLSpanElement | null>(null);
  const keepBtnElRef = useRef<HTMLButtonElement | null>(null);
  const keepBtnTextElRef = useRef<HTMLSpanElement | null>(null);
  const headingDegElRef = useRef<HTMLSpanElement | null>(null);
  const compassCardRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const compassKeepPipRef = useRef<HTMLSpanElement | null>(null);
  const compassLmPipRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const keepTargetPosRef = useRef<{ x: number; z: number } | null>(null);

  useEffect(() => {
    if (paused) {
      clearInputRef.current?.();
    } else {
      resumeTickRef.current?.();
    }
  }, [paused]);

  const callbacksRef = useRef({
    onSelectUnits,
    onSelectStructure,
    onSelectEnemyUnit,
    onRotateBuild,
    onBuildPreviewChange,
    onClearCommandMode,
    onCancelBuildMode,
    onPlaceStructure,
    onPlaceFortBatch,
    onMoveUnits,
    onAttackTarget,
    onRepairStructure,
    onUnitStance,
    onUnderAttackAlert,
    onSyncCamera,
    onHoverCoordsChange,
    onHoverEntityChange,
    onPerfStatsChange,
    onZoomOutToStrategicMap,
  });
  callbacksRef.current = {
    onSelectUnits,
    onSelectStructure,
    onSelectEnemyUnit,
    onRotateBuild,
    onBuildPreviewChange,
    onClearCommandMode,
    onCancelBuildMode,
    onPlaceStructure,
    onPlaceFortBatch,
    onMoveUnits,
    onAttackTarget,
    onRepairStructure,
    onUnitStance,
    onUnderAttackAlert,
    onSyncCamera,
    onHoverCoordsChange,
    onHoverEntityChange,
    onPerfStatsChange,
    onZoomOutToStrategicMap,
  };

  const WORLD_BOUND = WORLD_HALF_SIZE - 500;
  const clampWorld = (v: number) => Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, v));

  // Classic 2000s Isometric Diamond Camera Rig (Full 64-bit World Meters across 100 x 100 km)
  const camRigRef = useRef({
    currentX: 4800,
    currentZ: 3200,
    targetX: 4800,
    targetZ: 3200,
    currentZoom: 34,
    targetZoom: 34,
    currentYaw: Math.PI / 4,
    targetYaw: Math.PI / 4,
    currentPitch: 38,
    targetPitch: 38,
    cursorX: 4800,
    cursorZ: 3200,
    initializedToSpawn: false,
  });

  useEffect(() => {
    if (!cameraCommand) return;
    const rig = camRigRef.current;
    if (typeof cameraCommand.targetX === 'number') {
      const nextX = clampWorld(cameraCommand.targetX);
      if (Math.hypot(nextX - rig.currentX, (cameraCommand.targetZ ?? rig.currentZ) - rig.currentZ) > 900) {
        rig.currentX = nextX;
      }
      rig.targetX = nextX;
    }
    if (typeof cameraCommand.targetZ === 'number') {
      const nextZ = clampWorld(cameraCommand.targetZ);
      if (Math.hypot((cameraCommand.targetX ?? rig.currentX) - rig.currentX, nextZ - rig.currentZ) > 900) {
        rig.currentZ = nextZ;
      }
      rig.targetZ = nextZ;
    }
    if (typeof cameraCommand.zoom === 'number') {
      rig.targetZoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, cameraCommand.zoom));
    }
    if (typeof cameraCommand.pitch === 'number') rig.targetPitch = cameraCommand.pitch;
    if (typeof cameraCommand.yaw === 'number') rig.targetYaw = cameraCommand.yaw;
    if (typeof cameraCommand.yawDelta === 'number') {
      rig.targetYaw += cameraCommand.yawDelta;
    }
    if (typeof cameraCommand.panDeltaX === 'number' || typeof cameraCommand.panDeltaZ === 'number') {
      const dx = cameraCommand.panDeltaX ?? 0;
      const dz = cameraCommand.panDeltaZ ?? 0;
      const cosYaw = Math.cos(rig.currentYaw);
      const sinYaw = Math.sin(rig.currentYaw);
      rig.targetX = clampWorld(rig.targetX + dx * cosYaw - dz * sinYaw);
      rig.targetZ = clampWorld(rig.targetZ + dx * sinYaw + dz * cosYaw);
    }
  }, [cameraCommand]);

  // 1-Cell (2m) Precision Grid Nudge relative to camera facing for effortless touchscreen alignment
  useEffect(() => {
    if (!nudgeBuildCommand || !buildModeRef.current) return;
    const rig = camRigRef.current;
    // Quantize camera yaw to nearest 90° cardinal so grid nudges always align cleanly with world grid axes
    const snappedYaw = Math.round(rig.currentYaw / (Math.PI / 2)) * (Math.PI / 2);
    const forwardX = -Math.round(Math.sin(snappedYaw));
    const forwardZ = -Math.round(Math.cos(snappedYaw));
    const rightX = Math.round(Math.cos(snappedYaw));
    const rightZ = -Math.round(Math.sin(snappedYaw));

    const stepX = (nudgeBuildCommand.dxCells * rightX + nudgeBuildCommand.dzCells * forwardX) * BUILD_GRID_CELL_SIZE;
    const stepZ = (nudgeBuildCommand.dxCells * rightZ + nudgeBuildCommand.dzCells * forwardZ) * BUILD_GRID_CELL_SIZE;

    const baseX = Math.round((isTouchAimRef.current ? rig.targetX : rig.cursorX) / BUILD_GRID_CELL_SIZE) * BUILD_GRID_CELL_SIZE;
    const baseZ = Math.round((isTouchAimRef.current ? rig.targetZ : rig.cursorZ) / BUILD_GRID_CELL_SIZE) * BUILD_GRID_CELL_SIZE;
    const nextX = clampWorld(baseX + stepX);
    const nextZ = clampWorld(baseZ + stepZ);

    if (isTouchAimRef.current) {
      rig.targetX = nextX;
      rig.targetZ = nextZ;
    } else {
      rig.cursorX = nextX;
      rig.cursorZ = nextZ;
    }
  }, [nudgeBuildCommand]);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // Antialias disabled so polygon silhouettes rasterize as crisp 2000s pixel steps
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = !isSoftwareGl;
    // BasicShadowMap casts crisp, hard-edged pixelated shadows like 2000s RTS classics
    renderer.shadowMap.type = THREE.BasicShadowMap;

    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.imageRendering = 'pixelated';
    renderer.domElement.style.touchAction = 'none';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x6ea6cc);
    scene.background = skyColor;
    const sceneFog = new THREE.FogExp2(0xa8cbe0, 0.00038);
    scene.fog = sceneFog;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 1. Primary 2000s Isometric Orthographic Camera (zero perspective distortion, deep far clip)
    const initialAspect = Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight);
    const initialHalfH = 42 * 0.68;
    const orthoCamera = new THREE.OrthographicCamera(
      -initialHalfH * initialAspect,
      initialHalfH * initialAspect,
      initialHalfH,
      -initialHalfH,
      -2600,
      7500
    );

    // 2. Expansive 3D Perspective Camera (sweeping panoramic horizon up to 13 km)
    const perspCamera = new THREE.PerspectiveCamera(50, initialAspect, 1.5, 13000);

    const getActiveCamera = (): THREE.Camera =>
      projectionModeRef.current === 'isometric_2000s' ? orthoCamera : perspCamera;

    // Crisp 2000s Isometric Directional Sun + Sky Fill
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.92);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.05);
    keyLight.position.set(82, 135, 72);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 512;
    keyLight.shadow.mapSize.height = 512;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 520;
    let lastShadowFrustumD = 135;
    keyLight.shadow.camera.left = -lastShadowFrustumD;
    keyLight.shadow.camera.right = lastShadowFrustumD;
    keyLight.shadow.camera.top = lastShadowFrustumD;
    keyLight.shadow.camera.bottom = -lastShadowFrustumD;
    keyLight.shadow.bias = -0.0008;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-85, 65, -75);
    scene.add(rimLight);

    // Floating-Origin Coordinate Offset (keeps Three.js scene near 0,0,0 so WebGL Float32 never jitters even 600km out)
    let originX = Math.round(camRigRef.current.currentX / CHUNK_SIZE) * CHUNK_SIZE;
    let originZ = Math.round(camRigRef.current.currentZ / CHUNK_SIZE) * CHUNK_SIZE;

    // Streaming Multi-Biome 1:1 Continental Terrain, Oceans, Rivers, Waterfalls & Weather
    const terrainBundle = buildWorldTerrain(renderer);
    scene.add(terrainBundle.root);

    // Among-Us Line-of-Sight & Occlusion Vision Engine
    const visionSystem = new AmongUsVisionSystem();

    // Dynamic Scene Registries with THREE.LOD for structures
    const structureLods = new Map<string, THREE.LOD>();
    const unitMeshes = new Map<
      string,
      {
        group: THREE.Group;
        selectionRing: THREE.Mesh;
        targetLine: THREE.Line;
        worldX: number;
        worldZ: number;
        lastGroundX: number;
        lastGroundZ: number;
        lastGroundY: number;
        lastTargetX: number;
        lastTargetZ: number;
        lastTargetY: number;
      }
    >();
    const resourceMeshes = new Map<string, THREE.Group>();
    const remotePlayerMeshes = new Map<
      string,
      ReturnType<typeof buildRemotePlayerPresence>
    >();

    const UNIT_SELECTION_RING_GEOM = new THREE.RingGeometry(0.85, 1.1, 8);
    UNIT_SELECTION_RING_GEOM.rotateX(-Math.PI / 2);

    // Selected structure isometric diamond highlight ring
    const structSelectRingGeom = new THREE.RingGeometry(3.4, 3.9, 8);
    structSelectRingGeom.rotateX(-Math.PI / 2);
    const structSelectRingMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide });
    const structSelectRing = new THREE.Mesh(structSelectRingGeom, structSelectRingMat);
    structSelectRing.position.y = 0.15;
    structSelectRing.visible = false;
    scene.add(structSelectRing);

    // Placement ghost preview (Real 3D Cultural Building Model + Footprint Ring)
    const ghostGroup = new THREE.Group();
    const ghostRingGeom = new THREE.RingGeometry(2.6, 3.2, 8);
    ghostRingGeom.rotateX(-Math.PI / 2);
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      side: THREE.DoubleSide,
    });
    const ghostRing = new THREE.Mesh(ghostRingGeom, ghostMat);
    ghostRing.position.y = 0.16;
    ghostGroup.add(ghostRing);
    const ghostLod = new THREE.LOD();
    ghostGroup.add(ghostLod);
    ghostGroup.visible = false;
    scene.add(ghostGroup);

    // Terrain-Conforming 3D Tactical Placement Grid Overlay (2m snap cells + alignment axes + rotated footprint)
    const buildGridOverlay = new BuildPlacementGridOverlay();
    scene.add(buildGridOverlay.root);

    // 2-Point Fortification Line Preview Pool (Up to 18 aligned wall/moat preview pads + start anchor beacon)
    const LINE_PREVIEW_MAX = 18;
    const lineWallGeom = new THREE.BoxGeometry(3.95, 2.35, 1.35);
    const lineMoatGeom = new THREE.BoxGeometry(3.95, 0.35, 2.55);
    const lineTowerGeom = new THREE.CylinderGeometry(1.15, 1.35, 4.2, 8);
    const wallJunctionPiers = new Map<
      string,
      { group: THREE.Group; x: number; z: number; y: number }
    >();
    let lastWallJunctionKey = '';
    const lineValidMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.52,
    });
    const lineInvalidMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.55,
    });
    const lineWaterMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.56,
    });
    const linePreviewMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < LINE_PREVIEW_MAX; i++) {
      const m = new THREE.Mesh(lineWallGeom, lineValidMat);
      m.visible = false;
      scene.add(m);
      linePreviewMeshes.push(m);
    }
    const lineAnchorBeaconGeom = new THREE.CylinderGeometry(0.45, 0.7, 3.6, 8);
    const lineAnchorBeaconMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.85,
    });
    const lineAnchorBeacon = new THREE.Mesh(lineAnchorBeaconGeom, lineAnchorBeaconMat);
    lineAnchorBeacon.visible = false;
    scene.add(lineAnchorBeacon);

    // Move command ground marker (8-sided pixel ring)
    const moveMarkerGeom = new THREE.RingGeometry(0.5, 1.35, 8);
    moveMarkerGeom.rotateX(-Math.PI / 2);
    const moveMarkerMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const moveMarker = new THREE.Mesh(moveMarkerGeom, moveMarkerMat);
    moveMarker.position.y = 0.15;
    scene.add(moveMarker);
    let moveMarkerAge = 99;

    // 3D Floating HP Bars & Combat VFX Registries
    const hpBgGeom = new THREE.PlaneGeometry(1, 1);
    const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x090d16, side: THREE.DoubleSide });
    function createHpBarMesh(width: number, height: number, fillHex: number) {
      const group = new THREE.Group();
      const bg = new THREE.Mesh(hpBgGeom, hpBgMat);
      bg.scale.set(width + 0.14, height + 0.1, 1);
      group.add(bg);
      const fillMat = new THREE.MeshBasicMaterial({ color: fillHex, side: THREE.DoubleSide });
      const fill = new THREE.Mesh(hpBgGeom, fillMat);
      fill.scale.set(width, height, 1);
      fill.position.z = 0.02;
      group.add(fill);
      return { group, fill, fillMat, width, height };
    }
    const structHpBars = new Map<
      string,
      { group: THREE.Group; fill: THREE.Mesh; fillMat: THREE.MeshBasicMaterial; width: number; height: number }
    >();

    const seenCombatEventIds = new Set<string>();
    const fxArrowGeom = new THREE.BoxGeometry(0.18, 0.18, 1.05);
    const fxSparkGeom = new THREE.OctahedronGeometry(0.5, 0);
    const fxBoulderGeom = new THREE.DodecahedronGeometry(0.58, 0);
    const fxArrowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const fxFireArrowMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
    const fxBoulderMat = new THREE.MeshBasicMaterial({ color: 0xea580c });
    const fxMeleeMat = new THREE.MeshBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0.9 });
    const fxRepairMat = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.9 });
    const fxBoomMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9 });
    const fxAmbushMat = new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.95 });
    const fxLootMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.95 });
    const activeCombatFx: Array<{
      mesh: THREE.Mesh;
      kind: CombatEvent['kind'];
      fromX: number;
      fromY: number;
      fromZ: number;
      toX: number;
      toY: number;
      toZ: number;
      age: number;
      duration: number;
    }> = [];

    // World-Locked Constant Pixel Density (Stronghold / 2000s RTS Constant Texels-Per-Meter Engine)
    let currentRenderW = 480;
    let currentRenderH = 300;
    let currentWorldPpm = 12;
    let spritePixelPreservationScale = 1.0;
    let lastAppliedPixelScale = -1;
    let lastAppliedQuality: RenderQualityMode | null = null;

    let cachedMountW = Math.max(1, mount.clientWidth);
    let cachedMountH = Math.max(1, mount.clientHeight);
    let cachedRect = renderer.domElement.getBoundingClientRect();

    const refreshMountMetrics = () => {
      cachedMountW = Math.max(1, mount.clientWidth);
      cachedMountH = Math.max(1, mount.clientHeight);
      cachedRect = renderer.domElement.getBoundingClientRect();
    };

    const syncPixelBufferResolution = (forceResize = false) => {
      if (!mount) return;
      const w = cachedMountW;
      const h = cachedMountH;
      const aspect = w / h;

      currentWorldPpm = getWorldPixelsPerMeter(
        pixelScaleRef.current,
        qualityModeRef.current
      );

      // In World-Locked Pixel Density mode, every world meter always gets `currentWorldPpm` pixels
      // regardless of how far the player zooms in or out!
      const halfH = camRigRef.current.currentZoom * 0.68;
      const worldSpanH = halfH * 2;
      const desiredRenderH = Math.round(worldSpanH * currentWorldPpm);

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const maxBufferH = isSoftwareGl
        ? 576
        : qualityModeRef.current === 'mobile_battery'
          ? 640
          : qualityModeRef.current === 'balanced'
            ? Math.min(1056, Math.max(720, Math.round(h * Math.min(dpr, 1.25))))
            : Math.min(1344, Math.max(960, Math.round(h * dpr)));

      const clampedH = Math.max(144, Math.min(maxBufferH, desiredRenderH));
      // Quantize drawing buffer height to 48px steps so smooth zoom damping does NOT reallocate GPU framebuffers every frame
      const targetH = Math.max(144, Math.min(maxBufferH, Math.round(clampedH / 48) * 48));
      const targetW = Math.max(192, Math.round(targetH * aspect));

      // If zoomed out to regional/continental view beyond hardware buffer cap, preserve sprite readability
      spritePixelPreservationScale = Math.max(
        1.0,
        Math.min(3.6, desiredRenderH / Math.max(1, targetH))
      );

      if (
        forceResize ||
        Math.abs(targetH - currentRenderH) >= 48 ||
        Math.abs(targetW - currentRenderW) >= 64
      ) {
        currentRenderW = targetW;
        currentRenderH = targetH;
        // Update drawing buffer resolution while keeping CSS 100% width/height with Nearest-Neighbor upscaling
        // (CSS size does not change when updateStyle=false, so skip getBoundingClientRect to avoid forced layout reflow!)
        renderer.setSize(currentRenderW, currentRenderH, false);
      }

      perspCamera.aspect = aspect;
      perspCamera.updateProjectionMatrix();
    };

    syncPixelBufferResolution(true);

    if (!isSoftwareGl) {
      renderer.compile(scene, getActiveCamera());
    }

    // ========================================================================
    // MOBILE MULTI-TOUCH (PINCH / TWIST / 1-FINGER PAN & TAP) + DESKTOP INPUT
    // ========================================================================
    const keysPressed: Record<string, boolean> = {};
    const activeTouchPointers = new Map<number, { x: number; y: number }>();
    let lastPinchDist = 0;
    let lastPinchAngle = 0;
    let lastPinchMidX = 0;
    let lastPinchMidY = 0;

    let isPanningCamera = false;
    let isRotatingCamera = false;
    let isBoxSelecting = false;
    let panLastX = 0;
    let panLastY = 0;
    let dragStartX = 0;
    let dragStartY = 0;
    let pointerDownClientX = 0;
    let pointerDownClientY = 0;

    const getGroundIntersection = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const rect = cachedRect;
      _mouse.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      _mouse.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      _raycaster.setFromCamera(_mouse, getActiveCamera());

      const ray = _raycaster.ray;
      const dy = ray.direction.y;
      if (dy < -0.02) {
        const invDy = 1 / dy;
        const tTop = Math.max(0, (34 - ray.origin.y) * invDy);
        const tBot = Math.max(tTop + 0.1, (-9.0 - ray.origin.y) * invDy);
        const steps = 12;
        const dt = (tBot - tTop) / steps;
        let prevT = tTop;
        let hitLo = -1;
        let hitHi = -1;
        for (let i = 1; i <= steps; i++) {
          const t = tTop + dt * i;
          const rx = ray.origin.x + ray.direction.x * t + originX;
          const ry = ray.origin.y + dy * t;
          const rz = ray.origin.z + ray.direction.z * t + originZ;
          if (ry <= getTerrainHeight(rx, rz)) {
            hitLo = prevT;
            hitHi = t;
            break;
          }
          prevT = t;
        }
        if (hitLo >= 0) {
          for (let b = 0; b < 4; b++) {
            const mid = (hitLo + hitHi) * 0.5;
            const rx = ray.origin.x + ray.direction.x * mid + originX;
            const ry = ray.origin.y + dy * mid;
            const rz = ray.origin.z + ray.direction.z * mid + originZ;
            if (ry <= getTerrainHeight(rx, rz)) {
              hitHi = mid;
            } else {
              hitLo = mid;
            }
          }
          const finalT = (hitLo + hitHi) * 0.5;
          _hitPoint.copy(ray.origin).addScaledVector(ray.direction, finalT);
          _hitPoint.x += originX;
          _hitPoint.z += originZ;
          _hitPoint.y = getTerrainHeight(_hitPoint.x, _hitPoint.z);
          return _hitPoint;
        }
      }

      const fallback = ray.intersectPlane(_groundPlane, _hitPoint);
      if (fallback) {
        fallback.x += originX;
        fallback.z += originZ;
        fallback.y = getTerrainHeight(fallback.x, fallback.z);
      }
      return fallback;
    };

    const findVisibleEnemyAt = (
      wx: number,
      wz: number,
      pid: string,
      world: WorldState,
      isTouchTap: boolean
    ):
      | { kind: 'unit'; id: string; x: number; z: number }
      | { kind: 'structure'; id: string; x: number; z: number }
      | null => {
      const isHostile = (ownerId: string) =>
        ownerId !== pid && Boolean(world.players?.[ownerId]?.isAi);

      const unitRad = isTouchTap ? 4.4 : 3.2;
      let bestUId: string | null = null;
      let bestUDist = unitRad;
      for (const u of Object.values(world.units ?? {})) {
        if (!isHostile(u.ownerId) || u.hp <= 0) continue;
        if (!visionSystem.isWorldPointVisible(u.x, u.z, 0.22)) continue;
        const d = Math.hypot(u.x - wx, u.z - wz);
        if (d < bestUDist) {
          bestUDist = d;
          bestUId = u.id;
        }
      }
      if (bestUId && world.units?.[bestUId]) {
        const eu = world.units[bestUId];
        return { kind: 'unit', id: eu.id, x: eu.x, z: eu.z };
      }

      const lodEntries = Array.from(structureLods.entries());
      const lodObjects = lodEntries.map(([, lod]) => lod);
      if (lodObjects.length > 0) {
        const structHits = _raycaster.intersectObjects(lodObjects, true);
        if (structHits.length > 0) {
          let obj: THREE.Object3D | null = structHits[0].object;
          while (obj) {
            const matchedEntry = lodEntries.find(([, lod]) => lod === obj);
            if (matchedEntry) {
              const candSt = world.structures?.[matchedEntry[0]];
              const candOwner = candSt ? world.players?.[candSt.ownerId] : undefined;
              const isStructVisibleForClick =
                !candOwner?.isBandit ||
                visionSystem.isWorldPointVisible(candSt?.x ?? 0, candSt?.z ?? 0, 0.22);
              if (
                candSt &&
                isHostile(candSt.ownerId) &&
                candSt.hp > 0 &&
                isStructVisibleForClick
              ) {
                return { kind: 'structure', id: candSt.id, x: candSt.x, z: candSt.z };
              }
              break;
            }
            obj = obj.parent;
          }
        }
      }

      let bestStId: string | null = null;
      let bestStDist = 5.2;
      for (const st of Object.values(world.structures ?? {})) {
        if (!isHostile(st.ownerId) || st.hp <= 0) continue;
        const stOwner = world.players?.[st.ownerId];
        if (stOwner?.isBandit && !visionSystem.isWorldPointVisible(st.x, st.z, 0.22)) continue;
        const d = Math.hypot(st.x - wx, st.z - wz);
        if (d < bestStDist) {
          bestStDist = d;
          bestStId = st.id;
        }
      }
      if (bestStId && world.structures?.[bestStId]) {
        const es = world.structures[bestStId];
        return { kind: 'structure', id: es.id, x: es.x, z: es.z };
      }
      return null;
    };

    const flashGroundMarker = (x: number, z: number, hexColor: number) => {
      const groundY = getTerrainHeight(x, z);
      moveMarkerMat.color.setHex(hexColor);
      moveMarker.position.set(x - originX, groundY + 0.18, z - originZ);
      moveMarkerAge = 0;
    };

    const executeBuildActionAt = (rawX: number, rawZ: number) => {
      const bKind = buildModeRef.current;
      const world = worldRef.current;
      const pid = playerIdRef.current;
      if (!bKind || !world || !pid) return;

      const strMap = world.structures ?? {};
      const snap = computeFortificationSnap(
        bKind,
        rawX,
        rawZ,
        buildRotationYRef.current,
        strMap,
        pid
      );

      if (fortLineModeRef.current && isLineBuildableFort(bKind)) {
        const anchor = lineAnchorRef.current;
        if (!anchor) {
          const anchorEval = evaluateBuildingPlacementAt(
            bKind,
            snap.x,
            snap.z,
            Object.values(strMap),
            snap.replaceWallId,
            false
          );
          if (!anchorEval.ok) {
            flashGroundMarker(snap.x, snap.z, 0xef4444);
            return;
          }
          lineAnchorRef.current = { x: snap.x, z: snap.z };
          flashGroundMarker(snap.x, snap.z, 0xfacc15);
          soundFx.playSelect();
          return;
        }
        const segments = computeFortificationLineSegments(
          bKind,
          anchor.x,
          anchor.z,
          rawX,
          rawZ,
          buildRotationYRef.current,
          strMap,
          LINE_PREVIEW_MAX,
          wallLineWithTowersRef.current
        );
        const validItems: FortPlacementItem[] = segments
          .filter((s) => s.valid)
          .map(({ kind, x, z, rotationY }) => ({ kind, x, z, rotationY }));
        lineAnchorRef.current = null;
        if (validItems.length === 1) {
          soundFx.playBuildPlaced();
          callbacksRef.current.onPlaceStructure(
            validItems[0].kind,
            validItems[0].x,
            validItems[0].z,
            validItems[0].rotationY
          );
        } else if (validItems.length > 1) {
          soundFx.playBuildPlaced();
          if (callbacksRef.current.onPlaceFortBatch) {
            callbacksRef.current.onPlaceFortBatch(validItems);
          } else {
            validItems.forEach((it) =>
              callbacksRef.current.onPlaceStructure(it.kind, it.x, it.z, it.rotationY)
            );
          }
        } else {
          flashGroundMarker(snap.x, snap.z, 0xef4444);
        }
        return;
      }

      const evalRes = evaluateBuildingPlacementAt(
        bKind,
        snap.x,
        snap.z,
        Object.values(strMap),
        snap.replaceWallId,
        false
      );
      if (!evalRes.ok) {
        flashGroundMarker(snap.x, snap.z, 0xef4444);
        return;
      }

      soundFx.playBuildPlaced();
      callbacksRef.current.onPlaceStructure(bKind, snap.x, snap.z, snap.rotationY);
    };

    confirmBuildActionRef.current = () => {
      const rig = camRigRef.current;
      const aimX = isTouchAimRef.current ? rig.currentX : rig.cursorX;
      const aimZ = isTouchAimRef.current ? rig.currentZ : rig.cursorZ;
      executeBuildActionAt(aimX, aimZ);
    };

    const handleTapAtWorldPoint = (hit: THREE.Vector3, isTouchTap: boolean) => {
      const world = worldRef.current;
      const pid = playerIdRef.current;
      if (!world || !pid) return;

      if (buildModeRef.current) {
        if (isTouchTap && isTouchAimRef.current) {
          const rig = camRigRef.current;
          const bKind = buildModeRef.current;
          const strMap = world.structures ?? {};
          const tappedSnap = computeFortificationSnap(
            bKind,
            hit.x,
            hit.z,
            buildRotationYRef.current,
            strMap,
            pid
          );
          const distFromCurrentAim = Math.hypot(
            tappedSnap.x - rig.currentX,
            tappedSnap.z - rig.currentZ
          );
          // On touchscreens, tapping a distant grid cell smoothly aligns the ghost onto that exact cell
          // so players can verify validity & alignment before confirming (tapping near the ghost or pressing Confirm builds).
          if (distFromCurrentAim > 2.4) {
            rig.targetX = clampWorld(tappedSnap.x);
            rig.targetZ = clampWorld(tappedSnap.z);
            flashGroundMarker(tappedSnap.x, tappedSnap.z, 0xfacc15);
            soundFx.playSelect();
            return;
          }
          executeBuildActionAt(rig.currentX, rig.currentZ);
          return;
        }
        executeBuildActionAt(hit.x, hit.z);
        return;
      }

      if (commandModeRef.current === 'attack_move' && selectedUnitIdsRef.current.length > 0) {
        const enemyTarget = findVisibleEnemyAt(hit.x, hit.z, pid, world, isTouchTap);
        if (enemyTarget) {
          flashGroundMarker(enemyTarget.x, enemyTarget.z, 0xef4444);
          callbacksRef.current.onAttackTarget?.(
            selectedUnitIdsRef.current,
            enemyTarget.kind === 'unit'
              ? { targetUnitId: enemyTarget.id }
              : { targetStructureId: enemyTarget.id }
          );
        } else {
          flashGroundMarker(hit.x, hit.z, 0xef4444);
          callbacksRef.current.onAttackTarget?.(selectedUnitIdsRef.current, {
            targetX: hit.x,
            targetZ: hit.z,
            attackMove: true,
          });
        }
        soundFx.playAttackOrder();
        callbacksRef.current.onClearCommandMode?.();
        return;
      }

      // 1. Direct 3D Mesh Raycast against structureLods (catches clicks on tall roofs, towers, tents & banners)
      let clickedStructureId: string | null = null;
      const lodEntries = Array.from(structureLods.entries());
      const lodObjects = lodEntries.map(([, lod]) => lod);
      if (lodObjects.length > 0) {
        const structHits = _raycaster.intersectObjects(lodObjects, true);
        if (structHits.length > 0) {
          let obj: THREE.Object3D | null = structHits[0].object;
          while (obj) {
            const matchedEntry = lodEntries.find(([, lod]) => lod === obj);
            if (matchedEntry) {
              const candidateSt = world.structures?.[matchedEntry[0]];
              if (
                candidateSt &&
                (candidateSt.ownerId === pid ||
                  visionSystem.isWorldPointVisible(candidateSt.x, candidateSt.z, 0.22))
              ) {
                clickedStructureId = candidateSt.id;
              }
              break;
            }
            obj = obj.parent;
          }
        }
      }

      // 2. Ground Footprint Distance Fallback
      if (!clickedStructureId) {
        let bestDist = 4.6;
        for (const st of Object.values(world.structures ?? {})) {
          if (st.ownerId === pid || visionSystem.isWorldPointVisible(st.x, st.z, 0.22)) {
            const d = Math.hypot(st.x - hit.x, st.z - hit.z);
            if (d < bestDist) {
              bestDist = d;
              clickedStructureId = st.id;
            }
          }
        }
      }

      if (clickedStructureId && world.structures?.[clickedStructureId]) {
        const st = world.structures[clickedStructureId];
        const hasSelectedWorker = selectedUnitIdsRef.current.some(
          (uid) => world.units?.[uid]?.kind === 'worker'
        );
        const isHostileSt = st.ownerId !== pid && Boolean(world.players?.[st.ownerId]?.isAi);
        if (isTouchTap && selectedUnitIdsRef.current.length > 0 && isHostileSt) {
          flashGroundMarker(st.x, st.z, 0xef4444);
          callbacksRef.current.onAttackTarget?.(selectedUnitIdsRef.current, {
            targetStructureId: st.id,
          });
          soundFx.playAttackOrder();
          return;
        }
        if (isTouchTap && st.ownerId === pid && st.hp < st.maxHp && !st.isConstructing && hasSelectedWorker) {
          flashGroundMarker(st.x, st.z, 0xfbbf24);
          callbacksRef.current.onRepairStructure?.(selectedUnitIdsRef.current, st.id);
          soundFx.playMoveOrder();
          return;
        }
        if (isTouchTap && st.ownerId === pid && st.isConstructing && hasSelectedWorker) {
          flashGroundMarker(st.x, st.z, 0x22c55e);
          callbacksRef.current.onMoveUnits(selectedUnitIdsRef.current, st.x, st.z);
          soundFx.playMoveOrder();
          return;
        }
        soundFx.playSelect();
        callbacksRef.current.onSelectStructure(st.id);
        callbacksRef.current.onSelectUnits([]);
        callbacksRef.current.onSelectEnemyUnit?.(null);
        return;
      }

      // Check visible enemy unit tap
      const tappedEnemy = findVisibleEnemyAt(hit.x, hit.z, pid, world, isTouchTap);
      if (tappedEnemy && tappedEnemy.kind === 'unit') {
        if (isTouchTap && selectedUnitIdsRef.current.length > 0) {
          flashGroundMarker(tappedEnemy.x, tappedEnemy.z, 0xef4444);
          callbacksRef.current.onAttackTarget?.(selectedUnitIdsRef.current, {
            targetUnitId: tappedEnemy.id,
          });
          soundFx.playAttackOrder();
          return;
        }
        soundFx.playSelect();
        callbacksRef.current.onSelectEnemyUnit?.(tappedEnemy.id);
        callbacksRef.current.onSelectUnits([]);
        callbacksRef.current.onSelectStructure(null);
        return;
      }

      const myUnits = Object.values(world.units ?? {}).filter((u) => u.ownerId === pid);
      const unitTapRadius = isTouchTap ? 3.8 : 2.6;
      for (const u of myUnits) {
        if (Math.hypot(u.x - hit.x, u.z - hit.z) < unitTapRadius) {
          soundFx.playSelect();
          callbacksRef.current.onSelectUnits([u.id]);
          callbacksRef.current.onSelectStructure(null);
          callbacksRef.current.onSelectEnemyUnit?.(null);
          return;
        }
      }

      if (isTouchTap && selectedUnitIdsRef.current.length > 0) {
        let targetResId: string | undefined;
        for (const rNode of Object.values(world.resourceNodes ?? {})) {
          if (Math.hypot(rNode.x - hit.x, rNode.z - hit.z) < 3.6) {
            targetResId = rNode.id;
            break;
          }
        }
        flashGroundMarker(hit.x, hit.z, targetResId ? 0xfbbf24 : 0x22c55e);
        callbacksRef.current.onMoveUnits(
          selectedUnitIdsRef.current,
          hit.x,
          hit.z,
          targetResId
        );
        soundFx.playMoveOrder();
        return;
      }

      callbacksRef.current.onSelectUnits([]);
      callbacksRef.current.onSelectStructure(null);
      callbacksRef.current.onSelectEnemyUnit?.(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keysPressed[e.code] = true;
      if (e.code === 'Escape') {
        if (lineAnchorRef.current) {
          lineAnchorRef.current = null;
        } else if (buildModeRef.current) {
          callbacksRef.current.onCancelBuildMode();
        }
        if (commandModeRef.current !== 'normal') callbacksRef.current.onClearCommandMode?.();
      }
      if (e.code === 'KeyR' && buildModeRef.current) {
        callbacksRef.current.onRotateBuild?.();
      }
      if (e.code === 'KeyH' && selectedUnitIdsRef.current.length > 0) {
        callbacksRef.current.onUnitStance?.(selectedUnitIdsRef.current, 'stand');
      }
      if (e.code === 'KeyX' && selectedUnitIdsRef.current.length > 0) {
        callbacksRef.current.onUnitStance?.(selectedUnitIdsRef.current, 'stop');
      }
      if (e.code === 'Space') {
        const world = worldRef.current;
        const pid = playerIdRef.current;
        if (world && pid) {
          const myKeep = Object.values(world.structures ?? {}).find(
            (s) => s.ownerId === pid && s.kind === 'keep'
          );
          if (myKeep) {
            camRigRef.current.targetX = myKeep.x;
            camRigRef.current.targetZ = myKeep.z;
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed[e.code] = false;
    };

    const onPointerDown = (e: PointerEvent) => {
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is not supported for synthetic events
      }
      const rect = renderer.domElement.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      pointerDownClientX = e.clientX;
      pointerDownClientY = e.clientY;

      if (e.pointerType === 'touch') {
        if (!isTouchAimRef.current) {
          isTouchAimRef.current = true;
          setShowCenterCrosshair(true);
        }
        activeTouchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activeTouchPointers.size === 2) {
          isPanningCamera = false;
          isBoxSelecting = false;
          setSelectionBoxRect(null);
          const pts = Array.from(activeTouchPointers.values());
          lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          lastPinchAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
          lastPinchMidX = (pts[0].x + pts[1].x) / 2;
          lastPinchMidY = (pts[0].y + pts[1].y) / 2;
          return;
        }

        if (activeTouchPointers.size === 1) {
          if (touchModeRef.current === 'select' && !buildModeRef.current) {
            isBoxSelecting = true;
            dragStartX = localX;
            dragStartY = localY;
            setSelectionBoxRect({ left: localX, top: localY, width: 0, height: 0 });
          } else {
            isPanningCamera = true;
            panLastX = e.clientX;
            panLastY = e.clientY;
          }
          return;
        }
      }

      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isRotatingCamera = true;
        panLastX = e.clientX;
        panLastY = e.clientY;
        return;
      }

      if (e.button === 2) {
        isPanningCamera = true;
        panLastX = e.clientX;
        panLastY = e.clientY;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        return;
      }

      if (e.button === 0) {
        const hit = getGroundIntersection(e.clientX, e.clientY);
        if (buildModeRef.current && hit) {
          executeBuildActionAt(hit.x, hit.z);
          return;
        }

        isBoxSelecting = true;
        dragStartX = localX;
        dragStartY = localY;
        setSelectionBoxRect({ left: localX, top: localY, width: 0, height: 0 });
      }
    };

    let lastHoverEmitMs = 0;
    let lastHoverEmitX = Number.NaN;
    let lastHoverEmitZ = Number.NaN;

    const onPointerMove = (e: PointerEvent) => {
      const rig = camRigRef.current;

      if (e.pointerType === 'touch' && activeTouchPointers.has(e.pointerId)) {
        activeTouchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activeTouchPointers.size === 2) {
          const pts = Array.from(activeTouchPointers.values());
          const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;

          if (lastPinchDist > 10 && dist > 5) {
            const pinchFactor = Math.pow(Math.max(0.45, Math.min(2.2, lastPinchDist / dist)), 1.05);
            const rawNext = rig.targetZoom * pinchFactor;
            if (pinchFactor > 1.015 && rig.targetZoom >= MAX_CAMERA_ZOOM * 0.95) {
              pinchOutOvershoot += pinchFactor - 1.0;
              if (pinchOutOvershoot >= 0.14) {
                pinchOutOvershoot = 0;
                activeTouchPointers.clear();
                callbacksRef.current.onZoomOutToStrategicMap?.(
                  rig.currentX,
                  rig.currentZ,
                  rig.currentZoom
                );
                return;
              }
            } else if (pinchFactor < 0.99) {
              pinchOutOvershoot = 0;
            }
            rig.targetZoom = Math.max(
              MIN_CAMERA_ZOOM,
              Math.min(MAX_CAMERA_ZOOM, rawNext)
            );
          }

          let angleDiff = angle - lastPinchAngle;
          if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          rig.targetYaw -= angleDiff * 0.85;

          const dx = midX - lastPinchMidX;
          const dy = midY - lastPinchMidY;
          const panFactor = rig.currentZoom * 0.0022;
          const cosYaw = Math.cos(rig.currentYaw);
          const sinYaw = Math.sin(rig.currentYaw);
          rig.targetX = clampWorld(rig.targetX - (dx * cosYaw + dy * sinYaw) * panFactor);
          rig.targetZ = clampWorld(rig.targetZ - (-dx * sinYaw + dy * cosYaw) * panFactor);

          lastPinchDist = dist;
          lastPinchAngle = angle;
          lastPinchMidX = midX;
          lastPinchMidY = midY;
          return;
        }
      }

      if (isRotatingCamera) {
        const dx = e.clientX - panLastX;
        const dy = e.clientY - panLastY;
        panLastX = e.clientX;
        panLastY = e.clientY;
        rig.targetYaw -= dx * 0.007;
        const minPitch = projectionModeRef.current === 'perspective_3d' ? 18 : 28;
        rig.targetPitch = Math.max(minPitch, Math.min(82, rig.targetPitch + dy * 0.25));
        return;
      }

      if (isPanningCamera) {
        const dx = e.clientX - panLastX;
        const dy = e.clientY - panLastY;
        panLastX = e.clientX;
        panLastY = e.clientY;

        const panFactor = rig.currentZoom * 0.0024;
        const cosYaw = Math.cos(rig.currentYaw);
        const sinYaw = Math.sin(rig.currentYaw);

        rig.targetX = clampWorld(rig.targetX - (dx * cosYaw + dy * sinYaw) * panFactor);
        rig.targetZ = clampWorld(rig.targetZ - (-dx * sinYaw + dy * cosYaw) * panFactor);
        return;
      }

      if (isBoxSelecting) {
        const rect = cachedRect;
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        setSelectionBoxRect({
          left: Math.min(dragStartX, curX),
          top: Math.min(dragStartY, curY),
          width: Math.abs(curX - dragStartX),
          height: Math.abs(curY - dragStartY),
        });
        return;
      }

      if (e.pointerType === 'mouse' && isTouchAimRef.current) {
        isTouchAimRef.current = false;
        setShowCenterCrosshair(false);
      }

      const nowMs = performance.now();
      const hoverDue = nowMs - lastHoverEmitMs >= 160;
      if (!buildModeRef.current && !hoverDue) {
        return;
      }

      const hit = getGroundIntersection(e.clientX, e.clientY);
      if (hit) {
        rig.cursorX = Math.round(hit.x * 10) / 10;
        rig.cursorZ = Math.round(hit.z * 10) / 10;
        if (hoverDue) {
          const rx = Math.round(hit.x);
          const rz = Math.round(hit.z);
          if (
            Number.isNaN(lastHoverEmitX) ||
            Math.abs(rx - lastHoverEmitX) >= 2 ||
            Math.abs(rz - lastHoverEmitZ) >= 2
          ) {
            lastHoverEmitMs = nowMs;
            lastHoverEmitX = rx;
            lastHoverEmitZ = rz;
            const elev = hit.y;
            const biome = getBiomeAt(hit.x, hit.z);
            callbacksRef.current.onHoverCoordsChange?.({
              x: rx,
              z: rz,
              elevation: elev,
              biome,
            });
          } else {
            lastHoverEmitMs = nowMs;
          }

          if (callbacksRef.current.onHoverEntityChange) {
            const curWorld = worldRef.current;
            let hovered: HoveredEntityInfo | null = null;
            if (curWorld && !buildModeRef.current) {
              const curPid = playerIdRef.current;
              let bestDist = 4.2;

              // 1. Check nearby visible units
              for (const uId in curWorld.units) {
                const u = curWorld.units[uId];
                const isOwn = u.ownerId === curPid;
                if (!isOwn && (u.isBanditUnit && u.isStealthed)) continue;
                if (!isOwn && !visionSystem.isWorldPointVisible(u.x, u.z, 0.22)) continue;
                const d = Math.hypot(u.x - hit.x, u.z - hit.z);
                if (d < Math.min(2.6, bestDist)) {
                  bestDist = d;
                  const ownerName = curWorld.players?.[u.ownerId]?.name ?? 'قوة مجهولة';
                  const uSpec = UNIT_SPECS[u.kind];
                  hovered = {
                    entityKind: 'unit',
                    id: u.id,
                    titleAr: u.isHeroSultan ? `السلطان حسن (${uSpec?.shortAr ?? u.kind})` : (uSpec?.shortAr ?? u.kind),
                    subtitleAr: `${ownerName} · صحة ${Math.round(u.hp)}/${u.maxHp}`,
                    hpPct: u.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((u.hp / u.maxHp) * 100))) : 100,
                    accentColor: u.ownerColor,
                  };
                }
              }

              // 2. Check nearby visible structures
              if (!hovered) {
                bestDist = 5.4;
                for (const sId in curWorld.structures) {
                  const st = curWorld.structures[sId];
                  const ownerPlr = curWorld.players?.[st.ownerId];
                  const isOwnOrCity = st.ownerId === curPid || Boolean(ownerPlr && !ownerPlr.isBandit);
                  if (!isOwnOrCity && !visionSystem.isWorldPointVisible(st.x, st.z, 0.22)) continue;
                  const d = Math.hypot(st.x - hit.x, st.z - hit.z);
                  const rad = st.kind === 'keep' ? 5.2 : 3.6;
                  if (d < rad && d < bestDist) {
                    bestDist = d;
                    const sSpec = STRUCTURE_SPECS[st.kind];
                    const ownerName = ownerPlr?.name ?? 'بناء مستقل';
                    hovered = {
                      entityKind: 'structure',
                      id: st.id,
                      titleAr: `${sSpec?.labelAr?.split(' (')[0] ?? st.kind} (م${st.level ?? 1})`,
                      subtitleAr: `${ownerName} · متانة ${Math.round(st.hp)}/${st.maxHp}`,
                      hpPct: st.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((st.hp / st.maxHp) * 100))) : 100,
                      accentColor: st.ownerColor,
                    };
                  }
                }
              }

              // 3. Check nearby resource nodes
              if (!hovered) {
                bestDist = 3.2;
                for (const rId in curWorld.resourceNodes) {
                  const rn = curWorld.resourceNodes[rId];
                  const d = Math.hypot(rn.x - hit.x, rn.z - hit.z);
                  if (d < bestDist) {
                    bestDist = d;
                    hovered = {
                      entityKind: 'resource',
                      id: rn.id,
                      titleAr: RESOURCE_LABELS_AR[rn.kind] ?? rn.kind,
                      subtitleAr: `متبقي ${Math.round(rn.amount)} / ${rn.maxAmount}`,
                      hpPct: rn.maxAmount > 0 ? Math.round((rn.amount / rn.maxAmount) * 100) : 100,
                    };
                  }
                }
              }
            }
            callbacksRef.current.onHoverEntityChange(hovered);
          }
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const wasSingleTouch = activeTouchPointers.size === 1;
        activeTouchPointers.delete(e.pointerId);

        const totalMoved = Math.hypot(
          e.clientX - pointerDownClientX,
          e.clientY - pointerDownClientY
        );

        if (wasSingleTouch && totalMoved < 12 && !isBoxSelecting) {
          isPanningCamera = false;
          const hit = getGroundIntersection(e.clientX, e.clientY);
          if (hit) {
            handleTapAtWorldPoint(hit, true);
          }
          return;
        }

        if (activeTouchPointers.size < 2) {
          pinchOutOvershoot = 0;
        }
        if (activeTouchPointers.size === 0) {
          isPanningCamera = false;
        }
      }

      if (e.button === 1 || isRotatingCamera) {
        isRotatingCamera = false;
      }

      if (e.button === 2 && isPanningCamera) {
        isPanningCamera = false;
        const movedDist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
        if (movedDist < 6) {
          if (buildModeRef.current) {
            callbacksRef.current.onCancelBuildMode();
            return;
          }
          if (commandModeRef.current !== 'normal') {
            callbacksRef.current.onClearCommandMode?.();
            return;
          }
          const hit = getGroundIntersection(e.clientX, e.clientY);
          const world = worldRef.current;
          const pid = playerIdRef.current;
          if (hit && selectedUnitIdsRef.current.length > 0 && world && pid) {
            const enemyTarget = findVisibleEnemyAt(hit.x, hit.z, pid, world, false);
            if (enemyTarget) {
              flashGroundMarker(enemyTarget.x, enemyTarget.z, 0xef4444);
              callbacksRef.current.onAttackTarget?.(
                selectedUnitIdsRef.current,
                enemyTarget.kind === 'unit'
                  ? { targetUnitId: enemyTarget.id }
                  : { targetStructureId: enemyTarget.id }
              );
              soundFx.playAttackOrder();
              return;
            }

            const hasSelectedWorker = selectedUnitIdsRef.current.some(
              (uid) => world.units?.[uid]?.kind === 'worker'
            );
            if (hasSelectedWorker) {
              const damagedOwnSt = Object.values(world.structures ?? {}).find(
                (s) =>
                  s.ownerId === pid &&
                  !s.isConstructing &&
                  s.hp < s.maxHp &&
                  Math.hypot(s.x - hit.x, s.z - hit.z) < 5.0
              );
              if (damagedOwnSt) {
                flashGroundMarker(damagedOwnSt.x, damagedOwnSt.z, 0xfbbf24);
                callbacksRef.current.onRepairStructure?.(selectedUnitIdsRef.current, damagedOwnSt.id);
                soundFx.playMoveOrder();
                return;
              }
            }

            let targetResId: string | undefined;
            for (const rNode of Object.values(world.resourceNodes ?? {})) {
              if (Math.hypot(rNode.x - hit.x, rNode.z - hit.z) < 3.2) {
                targetResId = rNode.id;
                break;
              }
            }

            flashGroundMarker(hit.x, hit.z, targetResId ? 0xfbbf24 : 0x22c55e);
            callbacksRef.current.onMoveUnits(
              selectedUnitIdsRef.current,
              hit.x,
              hit.z,
              targetResId
            );
            soundFx.playMoveOrder();
          }
        }
      }

      if (isBoxSelecting) {
        isBoxSelecting = false;
        const rect = renderer.domElement.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        const boxW = Math.abs(endX - dragStartX);
        const boxH = Math.abs(endY - dragStartY);
        setSelectionBoxRect(null);

        const world = worldRef.current;
        const pid = playerIdRef.current;
        if (!world || !pid) return;

        if (boxW < 10 && boxH < 10) {
          const hit = getGroundIntersection(e.clientX, e.clientY);
          if (hit) {
            handleTapAtWorldPoint(hit, e.pointerType === 'touch');
          }
        } else {
          const minX = Math.min(dragStartX, endX);
          const maxX = Math.max(dragStartX, endX);
          const minY = Math.min(dragStartY, endY);
          const maxY = Math.max(dragStartY, endY);

          const activeCam = getActiveCamera();
          const rig = camRigRef.current;
          const myUnits = Object.values(world.units ?? {}).filter((u) => u.ownerId === pid);
          const matched: string[] = [];
          for (const u of myUnits) {
            if (Math.hypot(u.x - rig.currentX, u.z - rig.currentZ) > 900) continue;
            const uy = getTerrainHeight(u.x, u.z) + 1.0;
            _hitPoint.set(u.x - originX, uy, u.z - originZ).project(activeCam);
            const sx = ((_hitPoint.x + 1) / 2) * rect.width;
            const sy = ((-_hitPoint.y + 1) / 2) * rect.height;
            if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
              matched.push(u.id);
            }
          }
          callbacksRef.current.onSelectUnits(matched);
          if (matched.length > 0) {
            callbacksRef.current.onSelectStructure(null);
          }
        }
      }
    };

    let wheelOutOvershoot = 0;
    let pinchOutOvershoot = 0;
    let lastWheelOutTime = 0;

    const onWheel = (e: WheelEvent) => {
      if (pausedRef.current) return;
      e.preventDefault();
      const rig = camRigRef.current;
      const now = performance.now();
      if (now - lastWheelOutTime > 450) {
        wheelOutOvershoot = 0;
      }

      if (e.deltaY > 0 && rig.targetZoom >= MAX_CAMERA_ZOOM * 0.93) {
        wheelOutOvershoot += Math.min(160, e.deltaY);
        lastWheelOutTime = now;
        if (wheelOutOvershoot >= 45) {
          wheelOutOvershoot = 0;
          callbacksRef.current.onZoomOutToStrategicMap?.(
            rig.currentX,
            rig.currentZ,
            rig.currentZoom
          );
          return;
        }
      } else if (e.deltaY < 0) {
        wheelOutOvershoot = 0;
      }

      const absDelta = Math.min(260, Math.abs(e.deltaY));
      const factor = 1 + absDelta * 0.0014;
      const nextZoom = e.deltaY > 0 ? rig.targetZoom * factor : rig.targetZoom / factor;
      rig.targetZoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, nextZoom));
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onWebglContextLost = (e: Event) => {
      e.preventDefault();
      setWebglContextLost(true);
    };
    const onWebglContextRestored = () => {
      setWebglContextLost(false);
    };

    const domElem = renderer.domElement;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    domElem.addEventListener('pointerdown', onPointerDown);
    domElem.addEventListener('pointermove', onPointerMove);
    domElem.addEventListener('pointerup', onPointerUp);
    domElem.addEventListener('pointercancel', onPointerUp);
    domElem.addEventListener('wheel', onWheel, { passive: false });
    domElem.addEventListener('contextmenu', onContextMenu);
    domElem.addEventListener('webglcontextlost', onWebglContextLost);
    domElem.addEventListener('webglcontextrestored', onWebglContextRestored);

    const handleResize = () => {
      refreshMountMetrics();
      syncPixelBufferResolution(true);
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            refreshMountMetrics();
            syncPixelBufferResolution(true);
          })
        : null;
    resizeObserver?.observe(mount);

    // Continuous RTS Loop + Adaptive 2000s Pixel Buffer & GPU Telemetry
    const clock = new THREE.Clock();
    let frameId = 0;
    let frameCounter = 0;
    let lastPerfReportTime = performance.now();

      // Pre-allocated tick scratch collections & caches (Zero per-frame GC churn)
    const selectedSet = new Set<string>();
    const activeCityPlateauSet = new Set<number>();
    let lastFocusCamX = Number.NaN;
    let lastFocusCamZ = Number.NaN;
    let cachedFocusElevation = 2.0;
    let lastClimateCheckX = Number.NaN;
    let lastClimateCheckZ = Number.NaN;
    let lastActiveClimate: ClimateKind | null = null;
    let cachedLocalClimate: ClimateKind = 'temperate_clear';
    let lastGhostSx = Number.NaN;
    let lastGhostSz = Number.NaN;
    let cachedGhostSy = 0;
    let cachedGhostColorHex = 0x22c55e;
    let lastPreviewEmitKey = '';
    const nearbyBuildStructs: Array<WorldState['structures'][string]> = [];

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (pausedRef.current) {
        frameId = 0;
        return;
      }
      const delta = Math.min(0.1, clock.getDelta());
      const rig = camRigRef.current;
      const world = worldRef.current;
      const pid = playerIdRef.current;

      // Sync pixel buffer scale & quality settings dynamically
      const settingsChanged =
        lastAppliedPixelScale !== pixelScaleRef.current ||
        lastAppliedQuality !== qualityModeRef.current;
      if (settingsChanged) {
        lastAppliedPixelScale = pixelScaleRef.current;
        lastAppliedQuality = qualityModeRef.current;
        if (!isSoftwareGl) {
          keyLight.castShadow = lastAppliedQuality !== 'mobile_battery';
          renderer.shadowMap.enabled = lastAppliedQuality !== 'mobile_battery';
        }
      }

      if (!rig.initializedToSpawn && world && pid && world.players[pid]) {
        const me = world.players[pid];
        rig.targetX = me.camera.targetX;
        rig.targetZ = me.camera.targetZ;
        rig.currentX = me.camera.targetX;
        rig.currentZ = me.camera.targetZ;
        rig.initializedToSpawn = true;
      }

      // Smoothly transition atmosphere & weather particles based on local regional climate at camera
      const activeClimateId: ClimateKind = world?.climate ?? 'temperate_clear';
      if (
        activeClimateId !== lastActiveClimate ||
        Number.isNaN(lastClimateCheckX) ||
        Math.abs(rig.currentX - lastClimateCheckX) > 32 ||
        Math.abs(rig.currentZ - lastClimateCheckZ) > 32
      ) {
        lastActiveClimate = activeClimateId;
        lastClimateCheckX = rig.currentX;
        lastClimateCheckZ = rig.currentZ;
        cachedLocalClimate = getEffectiveClimateAt(
          rig.currentX,
          rig.currentZ,
          activeClimateId
        );
      }
      const climateSpec = CLIMATE_SPECS[cachedLocalClimate] ?? CLIMATE_SPECS.temperate_clear;

      _targetSkyColor.setHex(climateSpec.skyHex);
      _targetFogColor.setHex(climateSpec.fogHex);
      _targetSunColor.setHex(climateSpec.sunHex);
      _targetHemiSky.setHex(climateSpec.hemiSkyHex);
      _targetHemiGround.setHex(climateSpec.hemiGroundHex);

      const isPersp3D = projectionModeRef.current === 'perspective_3d';
      const zoomFogAtten = rig.currentZoom > 95 ? Math.max(0.28, 95 / rig.currentZoom) : 1.0;
      skyColor.lerp(_targetSkyColor, delta * 2.5);
      sceneFog.color.lerp(_targetFogColor, delta * 2.5);
      sceneFog.density = THREE.MathUtils.damp(
        sceneFog.density,
        climateSpec.fogDensity * (isPersp3D ? 0.68 : 0.58) * zoomFogAtten,
        3,
        delta
      );
      keyLight.color.lerp(_targetSunColor, delta * 2.5);
      keyLight.intensity = THREE.MathUtils.damp(
        keyLight.intensity,
        climateSpec.sunIntensity,
        3,
        delta
      );
      hemiLight.color.lerp(_targetHemiSky, delta * 2.5);
      hemiLight.groundColor.lerp(_targetHemiGround, delta * 2.5);

      // Recenter Floating Origin when camera crosses sector boundary
      rig.targetX = clampWorld(rig.targetX);
      rig.targetZ = clampWorld(rig.targetZ);

      rig.currentX = THREE.MathUtils.damp(rig.currentX, rig.targetX, 10, delta);
      rig.currentZ = THREE.MathUtils.damp(rig.currentZ, rig.targetZ, 10, delta);
      rig.currentZoom = THREE.MathUtils.damp(rig.currentZoom, rig.targetZoom, 9, delta);
      rig.currentYaw = THREE.MathUtils.damp(rig.currentYaw, rig.targetYaw, 9, delta);
      rig.currentPitch = THREE.MathUtils.damp(rig.currentPitch, rig.targetPitch, 9, delta);

      if (
        Math.abs(rig.currentX - originX) > CHUNK_SIZE ||
        Math.abs(rig.currentZ - originZ) > CHUNK_SIZE
      ) {
        originX = Math.round(rig.currentX / CHUNK_SIZE) * CHUNK_SIZE;
        originZ = Math.round(rig.currentZ / CHUNK_SIZE) * CHUNK_SIZE;
      }

      activeCityPlateauSet.clear();
      if (world?.structures) {
        const structs = world.structures;
        for (const stId in structs) {
          const st = structs[stId];
          for (let pi = 0; pi < SPAWN_PLATEAUS.length; pi++) {
            if (activeCityPlateauSet.has(pi)) continue;
            const p = SPAWN_PLATEAUS[pi];
            if (Math.hypot(st.x - p.x, st.z - p.z) <= 85) {
              activeCityPlateauSet.add(pi);
              break;
            }
          }
        }
      }

      terrainBundle.weatherSystem.update(
        delta,
        activeClimateId,
        rig.currentX,
        rig.currentZ,
        originX,
        originZ,
        rig.currentYaw,
        rig.currentZoom,
        isPersp3D,
        activeCityPlateauSet
      );

      if (world) {
        visionSystem.update(
          performance.now(),
          rig.currentX,
          rig.currentZ,
          rig.currentZoom,
          pid,
          world.structures ?? {},
          world.units ?? {},
          activeClimateId
        );
      }

      // Keyboard WASD / Arrow strategic camera panning
      const panSpeed = rig.currentZoom * 0.85 * delta;
      _forward.set(-Math.sin(rig.currentYaw), 0, -Math.cos(rig.currentYaw));
      _right.set(Math.cos(rig.currentYaw), 0, -Math.sin(rig.currentYaw));

      if (keysPressed['KeyW'] || keysPressed['ArrowUp']) {
        rig.targetX = clampWorld(rig.targetX + _forward.x * panSpeed);
        rig.targetZ = clampWorld(rig.targetZ + _forward.z * panSpeed);
      }
      if (keysPressed['KeyS'] || keysPressed['ArrowDown']) {
        rig.targetX = clampWorld(rig.targetX - _forward.x * panSpeed);
        rig.targetZ = clampWorld(rig.targetZ - _forward.z * panSpeed);
      }
      if (keysPressed['KeyD'] || keysPressed['ArrowRight']) {
        rig.targetX = clampWorld(rig.targetX + _right.x * panSpeed);
        rig.targetZ = clampWorld(rig.targetZ + _right.z * panSpeed);
      }
      if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) {
        rig.targetX = clampWorld(rig.targetX - _right.x * panSpeed);
        rig.targetZ = clampWorld(rig.targetZ - _right.z * panSpeed);
      }
      if (keysPressed['KeyQ']) {
        rig.targetYaw += 1.6 * delta;
      }
      if (keysPressed['KeyE']) {
        rig.targetYaw -= 1.6 * delta;
      }

      const camRelX = rig.currentX - originX;
      const camRelZ = rig.currentZ - originZ;
      if (
        Number.isNaN(lastFocusCamX) ||
        Math.abs(rig.currentX - lastFocusCamX) > 0.2 ||
        Math.abs(rig.currentZ - lastFocusCamZ) > 0.2
      ) {
        lastFocusCamX = rig.currentX;
        lastFocusCamZ = rig.currentZ;
        cachedFocusElevation = Math.max(0, getTerrainHeight(rig.currentX, rig.currentZ));
      }
      const focusElevation = cachedFocusElevation;
      const pitchRad = THREE.MathUtils.degToRad(rig.currentPitch);

      // Keep crisp 2000s directional shadow frustum scaled and centered around Floating-Origin focus
      const desiredShadowD = Math.round(Math.min(280, Math.max(135, rig.currentZoom * 0.65)));
      if (Math.abs(desiredShadowD - lastShadowFrustumD) >= 12) {
        lastShadowFrustumD = desiredShadowD;
        keyLight.shadow.camera.left = -desiredShadowD;
        keyLight.shadow.camera.right = desiredShadowD;
        keyLight.shadow.camera.top = desiredShadowD;
        keyLight.shadow.camera.bottom = -desiredShadowD;
        keyLight.shadow.camera.updateProjectionMatrix();
      }
      keyLight.position.set(camRelX + 115, 195, camRelZ + 100);
      keyLight.target.position.set(camRelX, focusElevation, camRelZ);
      keyLight.target.updateMatrixWorld();

      syncPixelBufferResolution(settingsChanged);

      const activeCamera = getActiveCamera();
      if (projectionModeRef.current === 'isometric_2000s') {
        const w = cachedMountW;
        const h = cachedMountH;
        const aspect = w / h;
        const halfH = rig.currentZoom * 0.68;

        const orthoRayDist = Math.max(240, rig.currentZoom * 1.15);
        const horizDist = Math.cos(pitchRad) * orthoRayDist;
        const vertDist = Math.sin(pitchRad) * orthoRayDist;

        _camOffset.set(
          Math.sin(rig.currentYaw) * horizDist,
          vertDist,
          Math.cos(rig.currentYaw) * horizDist
        );

        orthoCamera.position.set(
          camRelX + _camOffset.x,
          focusElevation + _camOffset.y,
          camRelZ + _camOffset.z
        );
        orthoCamera.lookAt(camRelX, focusElevation, camRelZ);
        orthoCamera.updateMatrixWorld();

        orthoCamera.matrixWorld.extractBasis(_camRight, _camUp, _camForward);
        const worldSpanH = halfH * 2;
        const worldSpanW = worldSpanH * aspect;
        const texelW = worldSpanW / Math.max(1, currentRenderW);
        const texelH = worldSpanH / Math.max(1, currentRenderH);

        _focusVec.set(camRelX, focusElevation, camRelZ);
        const projU = _focusVec.dot(_camRight);
        const projV = _focusVec.dot(_camUp);
        const offsetU = Math.round(projU / texelW) * texelW - projU;
        const offsetV = Math.round(projV / texelH) * texelH - projV;

        orthoCamera.left = -halfH * aspect + offsetU;
        orthoCamera.right = halfH * aspect + offsetU;
        orthoCamera.top = halfH + offsetV;
        orthoCamera.bottom = -halfH + offsetV;
        orthoCamera.updateProjectionMatrix();
      } else {
        const horizDist = Math.cos(pitchRad) * rig.currentZoom;
        const vertDist = Math.sin(pitchRad) * rig.currentZoom;
        _camOffset.set(
          Math.sin(rig.currentYaw) * horizDist,
          vertDist,
          Math.cos(rig.currentYaw) * horizDist
        );
        perspCamera.position.set(
          camRelX + _camOffset.x,
          focusElevation + _camOffset.y,
          camRelZ + _camOffset.z
        );
        perspCamera.lookAt(camRelX, focusElevation, camRelZ);
      }

      callbacksRef.current.onSyncCamera({
        targetX: rig.currentX,
        targetZ: rig.currentZ,
        zoom: rig.currentZoom,
        yaw: rig.currentYaw,
        pitch: rig.currentPitch,
        cursorX: rig.cursorX,
        cursorZ: rig.cursorZ,
      });

      if (buildModeRef.current) {
        const bKind = buildModeRef.current;
        const me = world && pid ? world.players?.[pid] : undefined;
        const activeCult = normalizeCultureKind(buildCultureRef.current ?? me?.culture);
        const myColor = me?.color ?? '#0d9488';
        const mySecondary = me?.secondaryColor ?? '#fbbf24';
        const myBanner = me?.bannerPattern ?? 'crescent_star';
        const strMapForBuild = world?.structures ?? {};

        // On touch devices, aim smoothly from viewport center so fingers never cover the building
        const aimX = isTouchAimRef.current ? rig.currentX : rig.cursorX;
        const aimZ = isTouchAimRef.current ? rig.currentZ : rig.cursorZ;

        // Keep live terrain elevation readout updated while panning on mobile in build mode
        if (isTouchAimRef.current && frameCounter % 6 === 0) {
          const rx = Math.round(aimX);
          const rz = Math.round(aimZ);
          if (
            Number.isNaN(lastHoverEmitX) ||
            Math.abs(rx - lastHoverEmitX) >= 1.5 ||
            Math.abs(rz - lastHoverEmitZ) >= 1.5
          ) {
            lastHoverEmitX = rx;
            lastHoverEmitZ = rz;
            callbacksRef.current.onHoverCoordsChange?.({
              x: rx,
              z: rz,
              elevation: getTerrainHeight(aimX, aimZ),
              biome: getBiomeAt(aimX, aimZ),
            });
          }
        }

        const snap = computeFortificationSnap(
          bKind,
          aimX,
          aimZ,
          buildRotationYRef.current,
          strMapForBuild,
          pid
        );
        const sx = snap.x;
        const sz = snap.z;
        const sy = getTerrainHeight(sx, sz);

        // Collect nearby structures within 16m for fast 1:1 server-parity placement check
        nearbyBuildStructs.length = 0;
        for (const sId in strMapForBuild) {
          const st = strMapForBuild[sId];
          if (!st || st.hp <= 0) continue;
          const dx = st.x - sx;
          const dz = st.z - sz;
          if (dx * dx + dz * dz <= 16 * 16) {
            nearbyBuildStructs.push(st);
          }
        }
        const centerEval = evaluateBuildingPlacementAt(
          bKind,
          sx,
          sz,
          nearbyBuildStructs,
          snap.replaceWallId,
          true
        );

        const isDrawingLine =
          fortLineModeRef.current &&
          isLineBuildableFort(bKind) &&
          lineAnchorRef.current !== null;

        // Update 3D terrain-conforming placement grid overlay
        if (showBuildGridRef.current) {
          buildGridOverlay.update({
            kind: bKind,
            snappedX: sx,
            snappedZ: sz,
            rotationY: snap.rotationY,
            originX,
            originZ,
            structures: strMapForBuild,
            snapped: snap.snapped,
            replaceWallId: snap.replaceWallId,
            snapTarget: snap.snapTarget,
            centerState: centerEval.state,
            centerOk: centerEval.ok,
            isDrawingLine,
          });
        } else {
          buildGridOverlay.hide();
        }

        // Update touch crosshair reticle color directly via DOM ref (zero React re-renders)
        const reticleColor = !centerEval.ok
          ? '#ef4444'
          : snap.snapped || centerEval.state === 'replace_wall'
            ? '#facc15'
            : centerEval.state === 'bonus_water'
              ? '#38bdf8'
              : '#4ade80';
        if (reticleRingRef.current) reticleRingRef.current.setAttribute('stroke', reticleColor);
        if (reticleDotRef.current) reticleDotRef.current.setAttribute('fill', reticleColor);

        if (isDrawingLine && lineAnchorRef.current) {
          ghostGroup.visible = false;
          const anchor = lineAnchorRef.current;
          const anchorY = getTerrainHeight(anchor.x, anchor.z);
          lineAnchorBeacon.visible = true;
          lineAnchorBeacon.position.set(anchor.x - originX, anchorY + 1.8, anchor.z - originZ);

          const segments = computeFortificationLineSegments(
            bKind,
            anchor.x,
            anchor.z,
            aimX,
            aimZ,
            buildRotationYRef.current,
            strMapForBuild,
            LINE_PREVIEW_MAX,
            wallLineWithTowersRef.current
          );
          let validCount = 0;

          for (let i = 0; i < LINE_PREVIEW_MAX; i++) {
            const m = linePreviewMeshes[i];
            const seg = segments[i];
            if (!seg) {
              m.visible = false;
              continue;
            }
            if (seg.valid) validCount += 1;
            const segGroundY = getTerrainHeight(seg.x, seg.z);
            const isTowerSeg = seg.kind === 'watchtower';
            const segGeom = isTowerSeg
              ? lineTowerGeom
              : bKind === 'moat_trench'
                ? lineMoatGeom
                : lineWallGeom;
            const segYOffset = isTowerSeg
              ? 2.1
              : bKind === 'moat_trench'
                ? 0.2
                : 1.18;
            if (m.geometry !== segGeom) m.geometry = segGeom;
            const isWater =
              seg.valid &&
              seg.kind === 'moat_trench' &&
              evaluateFortificationTerrain(seg.x, seg.z).isWaterFedMoat;
            m.material = !seg.valid
              ? lineInvalidMat
              : isWater
                ? lineWaterMat
                : lineValidMat;
            m.position.set(seg.x - originX, segGroundY + segYOffset, seg.z - originZ);
            m.rotation.set(0, seg.rotationY, 0);
            m.visible = true;
          }

          if (frameCounter % 4 === 0) {
            const key = `L_${snap.snapped}_${segments.length}_${validCount}_${Math.round(sx)}_${Math.round(sz)}_${isTouchAimRef.current}`;
            if (key !== lastPreviewEmitKey) {
              lastPreviewEmitKey = key;
              callbacksRef.current.onBuildPreviewChange?.({
                snapped: snap.snapped,
                replaceWallWithGate: false,
                lineAnchored: true,
                lineCount: segments.length,
                validCount,
                canPlace: validCount > 0,
                isTouchAim: isTouchAimRef.current,
                gridX: Math.round(sx),
                gridZ: Math.round(sz),
                placementState: validCount > 0 ? 'valid' : 'blocked_terrain',
                reasonAr:
                  validCount > 0
                    ? `خط تحصين جاهز (${validCount} من ${segments.length} قطعة)`
                    : 'لا توجد خانات صالحة على طول الخط',
              });
            }
          }
        } else {
          lineAnchorBeacon.visible = false;
          for (let i = 0; i < LINE_PREVIEW_MAX; i++) {
            linePreviewMeshes[i].visible = false;
          }

          if (
            ghostLod.userData.kind !== bKind ||
            ghostLod.userData.culture !== activeCult ||
            ghostLod.userData.factionColor !== myColor ||
            ghostLod.userData.secondaryColor !== mySecondary ||
            ghostLod.userData.bannerPattern !== myBanner
          ) {
            buildOrUpdateStructureLOD(
              bKind,
              1,
              myColor,
              activeCult,
              ghostLod,
              mySecondary,
              myBanner
            );
            lastGhostSx = Number.NaN;
          }
          ghostGroup.visible = true;

          const canPlaceSingle = centerEval.ok;
          let nextGhostHex = 0x22c55e;
          if (!centerEval.ok) {
            nextGhostHex = centerEval.state === 'blocked_overlap' ? 0xf97316 : 0xef4444;
          } else if (centerEval.state === 'replace_wall' || snap.snapped) {
            nextGhostHex = 0xfacc15;
          } else if (centerEval.state === 'bonus_water') {
            nextGhostHex = 0x38bdf8;
          } else if (centerEval.state === 'bonus_high') {
            nextGhostHex = 0x10b981;
          } else if (sx !== lastGhostSx || sz !== lastGhostSz) {
            const envFit = evaluateEnvironmentalFit(
              activeCult,
              getBiomeAt(sx, sz),
              getEffectiveClimateAt(sx, sz, activeClimateId),
              1
            );
            nextGhostHex =
              envFit.rating === 'ideal'
                ? 0x22c55e
                : envFit.rating === 'compatible'
                  ? 0x4ade80
                  : 0xf59e0b;
          } else {
            nextGhostHex = cachedGhostColorHex;
          }

          if (sx !== lastGhostSx || sz !== lastGhostSz || nextGhostHex !== cachedGhostColorHex) {
            lastGhostSx = sx;
            lastGhostSz = sz;
            cachedGhostSy = sy;
            cachedGhostColorHex = nextGhostHex;
            ghostMat.color.setHex(cachedGhostColorHex);
          }

          ghostGroup.position.set(sx - originX, cachedGhostSy, sz - originZ);
          ghostLod.rotation.y = snap.rotationY;
          ghostRing.rotation.y = snap.rotationY;
          ghostLod.update(activeCamera);
          updateStructureConstructionVisual(
            ghostLod,
            true,
            52,
            clock.elapsedTime,
            rig.currentYaw
          );

          if (frameCounter % 4 === 0) {
            const key = `S_${snap.snapped}_${Boolean(snap.replaceWallId)}_${canPlaceSingle}_${centerEval.state}_${Math.round(sx)}_${Math.round(sz)}_${isTouchAimRef.current}`;
            if (key !== lastPreviewEmitKey) {
              lastPreviewEmitKey = key;
              callbacksRef.current.onBuildPreviewChange?.({
                snapped: snap.snapped,
                replaceWallWithGate: Boolean(snap.replaceWallId),
                lineAnchored: false,
                lineCount: 0,
                validCount: canPlaceSingle ? 1 : 0,
                canPlace: canPlaceSingle,
                isTouchAim: isTouchAimRef.current,
                gridX: Math.round(sx),
                gridZ: Math.round(sz),
                placementState: centerEval.state,
                reasonAr: centerEval.reasonAr,
              });
            }
          }
        }
      } else {
        ghostGroup.visible = false;
        buildGridOverlay.hide();
        lineAnchorBeacon.visible = false;
        lastPreviewEmitKey = '';
        for (let i = 0; i < LINE_PREVIEW_MAX; i++) {
          linePreviewMeshes[i].visible = false;
        }
      }

      if (moveMarkerAge < 1.0) {
        moveMarkerAge += delta * 2.2;
        const s = 0.6 + moveMarkerAge * 1.4;
        moveMarker.scale.set(s, s, s);
        moveMarkerMat.opacity = Math.max(0, 1 - moveMarkerAge);
      } else {
        moveMarkerMat.opacity = 0;
      }

      if (world) {
        const resMap = world.resourceNodes ?? {};
        const strMap = world.structures ?? {};
        const unitMap = world.units ?? {};
        const plrMap = world.players ?? {};

        const viewCullRadius = Math.max(
          isPersp3D ? 3800 : 2400,
          rig.currentZoom * (isPersp3D ? 5.2 : 3.6)
        );

        // 1. 2D Pixel-Art Resource Node Sprites positioned on 3D heightmap (Floating-Origin Relative)
        for (const [id, mesh] of resourceMeshes.entries()) {
          if (!resMap[id]) {
            scene.remove(mesh);
            resourceMeshes.delete(id);
          }
        }
        const resCullRadius =
          rig.currentZoom > 270 ? 0 : Math.min(680, Math.max(240, rig.currentZoom * 1.8));
        for (const rId in resMap) {
          const rNode = resMap[rId];
          const distFromCam = Math.hypot(rNode.x - rig.currentX, rNode.z - rig.currentZ);
          let rMesh = resourceMeshes.get(rNode.id);
          if (distFromCam > resCullRadius) {
            if (rMesh) rMesh.visible = false;
            continue;
          }
          if (!rMesh) {
            rMesh = build2DPixelResourceSprite(rNode.kind);
            rMesh.userData.groundY = getTerrainHeight(rNode.x, rNode.z);
            scene.add(rMesh);
            resourceMeshes.set(rNode.id, rMesh);
          }
          rMesh.visible = true;
          const resVisState: 'visible' | 'explored' | 'shroud' =
            visionSystem.isWorldPointVisible(rNode.x, rNode.z, 0.22)
              ? 'visible'
              : visionSystem.isWorldPointExplored(rNode.x, rNode.z)
                ? 'explored'
                : 'shroud';
          const rSprite = rMesh.userData?.spriteMesh as THREE.Mesh | undefined;
          if (rSprite && rMesh.userData.lastVisState !== resVisState) {
            rMesh.userData.lastVisState = resVisState;
            rSprite.material = getResourceSpriteMaterial(rNode.kind, resVisState);
          }
          const ry =
            typeof rMesh.userData.groundY === 'number'
              ? rMesh.userData.groundY
              : (rMesh.userData.groundY = getTerrainHeight(rNode.x, rNode.z));
          rMesh.position.set(rNode.x - originX, ry, rNode.z - originZ);
          const ratio = Math.max(0.35, rNode.amount / rNode.maxAmount);
          rMesh.scale.setScalar(ratio * spritePixelPreservationScale);
          rMesh.rotation.y = rig.currentYaw;
        }

        // 2. 3D Isometric Structures with 3-Tier THREE.LOD & Among-Us Line-of-Sight Occlusion
        for (const [id, lod] of structureLods.entries()) {
          if (!strMap[id]) {
            scene.remove(lod);
            structureLods.delete(id);
          }
        }
        const visibleWallsForPiers: Array<{
          id: string;
          ownerId: string;
          x: number;
          z: number;
          rotationY: number;
          culture: CultureKind;
          level: StructureLevel;
        }> = [];
        const visibleTowerOrGateCoords: Array<{ x: number; z: number }> = [];
        let wallPierFingerprint = '';
        for (const stId in strMap) {
          const st = strMap[stId];
          const distFromCam = Math.hypot(st.x - rig.currentX, st.z - rig.currentZ);
          const isOwnStructure = st.ownerId === pid;
          const ownerPlr = plrMap[st.ownerId];
          const isGovernedCityStruct = Boolean(ownerPlr && !ownerPlr.isBandit);
          const isStructVisible =
            distFromCam <= viewCullRadius &&
            (isOwnStructure ||
              isGovernedCityStruct ||
              visionSystem.isWorldPointVisible(st.x, st.z, 0.22));
          let sLod = structureLods.get(st.id);
          if (!isStructVisible) {
            if (sLod) sLod.visible = false;
            continue;
          }
          const stCulture = normalizeCultureKind(st.culture ?? ownerPlr?.culture);
          const stPrimary = st.ownerColor || ownerPlr?.color || '#0d9488';
          const stSecondary =
            st.secondaryColor ?? ownerPlr?.secondaryColor ?? '#fbbf24';
          const stBanner =
            st.bannerPattern ?? ownerPlr?.bannerPattern ?? 'crescent_star';
          const stVariant = (st.kind === 'house'
            ? (Math.abs(Math.round(st.x * 7 + st.z * 13)) % 3)
            : 0) as 0 | 1 | 2;
          let sy: number;
          if (!sLod) {
            sy = getTerrainHeight(st.x, st.z);
            sLod = buildOrUpdateStructureLOD(
              st.kind,
              st.level ?? 1,
              stPrimary,
              stCulture,
              undefined,
              stSecondary,
              stBanner,
              stVariant
            );
            sLod.userData.groundY = sy;
            sLod.position.set(st.x - originX, sy, st.z - originZ);
            sLod.rotation.y = st.rotationY;
            scene.add(sLod);
            structureLods.set(st.id, sLod);
          } else {
            sy =
              typeof sLod.userData.groundY === 'number'
                ? sLod.userData.groundY
                : (sLod.userData.groundY = getTerrainHeight(st.x, st.z));
            sLod.visible = true;
            sLod.position.set(st.x - originX, sy, st.z - originZ);
            if (
              sLod.userData.level !== (st.level ?? 1) ||
              sLod.userData.culture !== stCulture ||
              sLod.userData.factionColor !== stPrimary ||
              sLod.userData.secondaryColor !== stSecondary ||
              sLod.userData.bannerPattern !== stBanner ||
              sLod.userData.variant !== stVariant
            ) {
              buildOrUpdateStructureLOD(
                st.kind,
                st.level ?? 1,
                stPrimary,
                stCulture,
                sLod,
                stSecondary,
                stBanner,
                stVariant
              );
            }
          }
          sLod.update(activeCamera);
          updateStructureConstructionVisual(
            sLod,
            Boolean(st.isConstructing),
            st.constructionProgress ?? 100,
            clock.elapsedTime,
            rig.currentYaw
          );
          if (st.kind === 'gatehouse') {
            updateGatehouseDoorVisual(sLod, Boolean(st.isGateLocked), delta);
          }
          if (st.kind === 'stone_wall' && !st.isConstructing) {
            visibleWallsForPiers.push({
              id: st.id,
              ownerId: st.ownerId,
              x: st.x,
              z: st.z,
              rotationY: st.rotationY,
              culture: stCulture,
              level: st.level ?? 1,
            });
            wallPierFingerprint += `${st.id}:${st.level ?? 1}|`;
          } else if (st.kind === 'watchtower' || st.kind === 'gatehouse') {
            visibleTowerOrGateCoords.push({ x: st.x, z: st.z });
          }

          const isHostileStruct =
            st.ownerId !== pid && Boolean(world.players?.[st.ownerId]?.isAi);
          const showStHp =
            st.hp < st.maxHp || st.id === selectedStructureIdRef.current || isHostileStruct;
          let stBar = structHpBars.get(st.id);
          if (showStHp) {
            if (!stBar) {
              stBar = createHpBarMesh(
                3.2,
                0.28,
                st.ownerId === pid ? 0x22c55e : isHostileStruct ? 0xef4444 : 0x38bdf8
              );
              scene.add(stBar.group);
              structHpBars.set(st.id, stBar);
            }
            stBar.group.visible = true;
            const stH = STRUCTURE_SPECS[st.kind]?.footprint.h ?? 3.5;
            stBar.group.position.set(st.x - originX, sy + stH + 1.0, st.z - originZ);
            stBar.group.rotation.y = rig.currentYaw;
            const ratio = Math.max(0.02, Math.min(1, st.hp / Math.max(1, st.maxHp)));
            stBar.fill.scale.x = stBar.width * ratio;
            stBar.fill.position.x = -stBar.width * (1 - ratio) * 0.5;
            stBar.fillMat.color.setHex(
              isHostileStruct
                ? 0xef4444
                : st.ownerId !== pid
                  ? 0x38bdf8
                  : ratio > 0.5
                    ? 0x22c55e
                    : ratio > 0.25
                      ? 0xf59e0b
                      : 0xef4444
            );
          } else if (stBar) {
            stBar.group.visible = false;
          }
        }

        // Automatic Corner Bastion Junction Piers where adjacent angled stone_wall segments meet
        if (wallPierFingerprint !== lastWallJunctionKey) {
          lastWallJunctionKey = wallPierFingerprint;
          for (const [, pier] of wallJunctionPiers.entries()) {
            scene.remove(pier.group);
          }
          wallJunctionPiers.clear();
          const nWalls = Math.min(visibleWallsForPiers.length, 240);
          for (let i = 0; i < nWalls; i++) {
            const a = visibleWallsForPiers[i];
            for (let j = i + 1; j < nWalls; j++) {
              const b = visibleWallsForPiers[j];
              if (a.ownerId !== b.ownerId) continue;
              const d = Math.hypot(a.x - b.x, a.z - b.z);
              if (d < 2.6 || d > 5.4) continue;
              const angleSin = Math.abs(Math.sin(a.rotationY - b.rotationY));
              if (angleSin < 0.42) continue;
              const mx = (a.x + b.x) * 0.5;
              const mz = (a.z + b.z) * 0.5;
              let nearTowerOrGate = false;
              for (let k = 0; k < visibleTowerOrGateCoords.length; k++) {
                const tg = visibleTowerOrGateCoords[k];
                if (Math.hypot(tg.x - mx, tg.z - mz) < 2.75) {
                  nearTowerOrGate = true;
                  break;
                }
              }
              if (nearTowerOrGate) continue;
              const key = `${Math.round(mx * 0.5)}_${Math.round(mz * 0.5)}`;
              if (wallJunctionPiers.has(key)) continue;
              const pierLevel: StructureLevel = Math.max(a.level, b.level) >= 2 ? 2 : 1;
              const pierGroup = createWallJunctionPier(a.culture, pierLevel);
              const py = getTerrainHeight(mx, mz);
              pierGroup.position.set(mx - originX, py, mz - originZ);
              scene.add(pierGroup);
              wallJunctionPiers.set(key, { group: pierGroup, x: mx, z: mz, y: py });
            }
          }
        }
        for (const [, pier] of wallJunctionPiers.entries()) {
          pier.group.position.set(pier.x - originX, pier.y, pier.z - originZ);
        }

        // Cleanup HP bars for removed/culled structures
        for (const [sid, bar] of structHpBars.entries()) {
          const st = strMap[sid];
          if (!st || !structureLods.get(sid)?.visible) {
            if (!st) {
              scene.remove(bar.group);
              bar.fillMat.dispose();
              structHpBars.delete(sid);
            } else {
              bar.group.visible = false;
            }
          }
        }

        // Highlight selected structure
        const selStruct =
          selectedStructureIdRef.current && strMap[selectedStructureIdRef.current];
        if (
          selStruct &&
          Math.hypot(selStruct.x - rig.currentX, selStruct.z - rig.currentZ) <= viewCullRadius
        ) {
          structSelectRing.visible = true;
          const cachedLodY = structureLods.get(selStruct.id)?.userData.groundY;
          const sy =
            typeof cachedLodY === 'number'
              ? cachedLodY
              : getTerrainHeight(selStruct.x, selStruct.z);
          structSelectRing.position.set(selStruct.x - originX, sy + 0.16, selStruct.z - originZ);
        } else {
          structSelectRing.visible = false;
        }

        // 3. 2D Pixel-Art Unit Sprites (Among-Us Line-of-Sight Hides Enemy Units Behind Ridges/Fog)
        for (const [id, entry] of unitMeshes.entries()) {
          if (!unitMap[id]) {
            scene.remove(entry.group);
            scene.remove(entry.targetLine);
            (entry.selectionRing.material as THREE.Material).dispose();
            const hpBar = entry.group.userData?.hpBar as
              | { fillMat?: THREE.Material }
              | undefined;
            hpBar?.fillMat?.dispose();
            entry.targetLine.geometry.dispose();
            (entry.targetLine.material as THREE.Material).dispose();
            unitMeshes.delete(id);
          }
        }
        selectedSet.clear();
        const selArr = selectedUnitIdsRef.current;
        for (let i = 0; i < selArr.length; i++) selectedSet.add(selArr[i]);

        const elapsedTime = clock.elapsedTime;
        let unitCounter = 0;

        for (const uId in unitMap) {
          const u = unitMap[uId];
          unitCounter += 1;
          const distFromCam = Math.hypot(u.x - rig.currentX, u.z - rig.currentZ);
          const isOwnUnit = u.ownerId === pid;
          const isStealthedEnemy = !isOwnUnit && Boolean(u.isBanditUnit && u.isStealthed);
          const isUnitVisible =
            !isStealthedEnemy &&
            distFromCam <= viewCullRadius &&
            (isOwnUnit || visionSystem.isWorldPointVisible(u.x, u.z, 0.22));
          let entry = unitMeshes.get(u.id);
          if (!isUnitVisible) {
            if (entry) {
              entry.group.visible = false;
              entry.targetLine.visible = false;
            }
            continue;
          }
          const ownerPlr = plrMap[u.ownerId];
          const uPrimary = u.ownerColor || ownerPlr?.color || '#0d9488';
          const uSecondary =
            u.secondaryColor ?? ownerPlr?.secondaryColor ?? '#fbbf24';
          const uBanner =
            u.bannerPattern ?? ownerPlr?.bannerPattern ?? 'crescent_star';
          const isBandit = Boolean(u.isBanditUnit || ownerPlr?.isBandit);
          const bRole = u.banditRole ?? getBanditRoleForUnitKind(u.kind);
          const bArch =
            u.banditClanArchetype ?? ownerPlr?.banditCampArchetype ?? 'forest_ambush';
          const hasLoot = isBandit && getTotalCarriedLoot(u.carriedLoot) > 0;
          if (!entry) {
            const group = build2DPixelUnitSprite(
              u.kind,
              uPrimary,
              uSecondary,
              uBanner,
              isBandit ? { role: bRole, archetype: bArch, carryingLoot: hasLoot } : undefined
            );
            const uy = getTerrainHeight(u.x, u.z);
            group.position.set(u.x - originX, uy, u.z - originZ);

            const selectionRing = new THREE.Mesh(
              UNIT_SELECTION_RING_GEOM,
              new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                side: THREE.DoubleSide,
              })
            );
            selectionRing.position.y = 0.08;
            selectionRing.visible = false;
            group.add(selectionRing);

            const hpBar = createHpBarMesh(1.5, 0.22, isOwnUnit ? 0x22c55e : 0xef4444);
            hpBar.group.position.set(0, 2.85, 0);
            hpBar.group.visible = false;
            group.add(hpBar.group);
            group.userData.hpBar = hpBar;

            const tyInit = getTerrainHeight(u.targetX, u.targetZ);
            const lineGeom = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(u.x - originX, uy + 0.2, u.z - originZ),
              new THREE.Vector3(u.targetX - originX, tyInit + 0.2, u.targetZ - originZ),
            ]);
            const targetLine = new THREE.Line(
              lineGeom,
              new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 })
            );
            scene.add(group);
            scene.add(targetLine);
            entry = {
              group,
              selectionRing,
              targetLine,
              worldX: u.x,
              worldZ: u.z,
              lastGroundX: u.x,
              lastGroundZ: u.z,
              lastGroundY: uy,
              lastTargetX: u.targetX,
              lastTargetZ: u.targetZ,
              lastTargetY: tyInit,
            };
            unitMeshes.set(u.id, entry);
          } else {
            entry.group.visible = true;
            if (isBandit) {
              if (
                !entry.group.userData.isBanditUnit ||
                entry.group.userData.banditRole !== bRole ||
                entry.group.userData.banditArchetype !== bArch ||
                Boolean(entry.group.userData.carryingLoot) !== hasLoot
              ) {
                entry.group.userData.isBanditUnit = true;
                entry.group.userData.banditRole = bRole;
                entry.group.userData.banditArchetype = bArch;
                entry.group.userData.carryingLoot = hasLoot;
                entry.group.userData.mats = getBanditSpriteMaterials(bRole, bArch, hasLoot);
              }
            } else if (
              entry.group.userData.isBanditUnit ||
              entry.group.userData.factionColor !== uPrimary ||
              entry.group.userData.secondaryColor !== uSecondary ||
              entry.group.userData.bannerPattern !== uBanner
            ) {
              entry.group.userData.isBanditUnit = false;
              entry.group.userData.factionColor = uPrimary;
              entry.group.userData.secondaryColor = uSecondary;
              entry.group.userData.bannerPattern = uBanner;
              entry.group.userData.mats = getUnitSpriteMaterials(
                u.kind,
                uPrimary,
                uSecondary,
                uBanner
              );
              const bMesh = entry.group.userData.boatMesh as THREE.Mesh | undefined;
              if (bMesh) {
                bMesh.material = getNavalBoatSpriteMaterial(uPrimary, uSecondary);
              }
            }
          }

          if (Math.hypot(u.x - entry.worldX, u.z - entry.worldZ) > 250) {
            entry.worldX = u.x;
            entry.worldZ = u.z;
          } else {
            entry.worldX = THREE.MathUtils.damp(entry.worldX, u.x, 14, delta);
            entry.worldZ = THREE.MathUtils.damp(entry.worldZ, u.z, 14, delta);
          }
          const isNaval = Boolean(u.isNaval);
          let uyCur: number;
          if (isNaval) {
            uyCur = -0.2 + Math.sin(elapsedTime * 3.6 + unitCounter) * 0.08;
          } else {
            if (
              Math.abs(entry.worldX - entry.lastGroundX) > 0.15 ||
              Math.abs(entry.worldZ - entry.lastGroundZ) > 0.15
            ) {
              entry.lastGroundX = entry.worldX;
              entry.lastGroundZ = entry.worldZ;
              entry.lastGroundY = getTerrainHeight(entry.worldX, entry.worldZ);
            }
            uyCur = entry.lastGroundY;
          }
          entry.group.position.set(entry.worldX - originX, uyCur, entry.worldZ - originZ);

          entry.group.rotation.y = rig.currentYaw;
          entry.group.scale.setScalar(spritePixelPreservationScale);

          const uData = entry.group.userData as {
            mats?: { frame0: THREE.MeshBasicMaterial; frame1: THREE.MeshBasicMaterial };
            spriteMesh?: THREE.Mesh;
            boatMesh?: THREE.Mesh;
            shadow?: THREE.Mesh;
            hpBar?: { group: THREE.Group; fill: THREE.Mesh; fillMat: THREE.MeshBasicMaterial; width: number };
          };
          if (uData.boatMesh && uData.shadow && uData.spriteMesh) {
            uData.boatMesh.visible = isNaval;
            uData.shadow.visible = !isNaval;
            uData.spriteMesh.position.y = isNaval ? 0.55 : 0;
          }
          if (uData.spriteMesh && uData.mats) {
            const isActive =
              u.state === 'moving' ||
              u.state === 'gathering' ||
              u.state === 'building' ||
              u.state === 'attacking' ||
              u.state === 'repairing';
            const frameIdx = isActive ? Math.floor(elapsedTime * 6.5 + unitCounter) % 2 : 0;
            uData.spriteMesh.material = frameIdx === 1 ? uData.mats.frame1 : uData.mats.frame0;

            const relAngle = u.rotationY - rig.currentYaw;
            const facingSign = Math.sin(relAngle) < -0.15 ? -1 : 1;
            uData.spriteMesh.scale.x = facingSign;
          }

          const isSelected = selectedSet.has(u.id);
          entry.selectionRing.visible = isSelected;

          if (uData.hpBar) {
            const isHostileUnit = !isOwnUnit && Boolean(world.players?.[u.ownerId]?.isAi);
            const showUHp = u.hp < u.maxHp || isSelected || isHostileUnit;
            uData.hpBar.group.visible = showUHp;
            if (showUHp) {
              const ratio = Math.max(0.02, Math.min(1, u.hp / Math.max(1, u.maxHp)));
              uData.hpBar.fill.scale.x = uData.hpBar.width * ratio;
              uData.hpBar.fill.position.x = -uData.hpBar.width * (1 - ratio) * 0.5;
              uData.hpBar.fillMat.color.setHex(
                isHostileUnit
                  ? 0xef4444
                  : !isOwnUnit
                    ? 0x38bdf8
                    : ratio > 0.5
                      ? 0x22c55e
                      : ratio > 0.25
                        ? 0xf59e0b
                        : 0xef4444
              );
            }
          }

          if (isSelected && u.state !== 'idle') {
            entry.targetLine.visible = true;
            const lineMat = entry.targetLine.material as THREE.LineBasicMaterial;
            lineMat.color.setHex(u.state === 'attacking' ? 0xef4444 : 0x38bdf8);
            const posAttr = entry.targetLine.geometry.getAttribute(
              'position'
            ) as THREE.BufferAttribute;
            if (
              Math.abs(u.targetX - entry.lastTargetX) > 0.1 ||
              Math.abs(u.targetZ - entry.lastTargetZ) > 0.1
            ) {
              entry.lastTargetX = u.targetX;
              entry.lastTargetZ = u.targetZ;
              entry.lastTargetY = getTerrainHeight(u.targetX, u.targetZ);
            }
            posAttr.setXYZ(
              0,
              entry.group.position.x,
              entry.group.position.y + 0.2,
              entry.group.position.z
            );
            posAttr.setXYZ(1, u.targetX - originX, entry.lastTargetY + 0.2, u.targetZ - originZ);
            posAttr.needsUpdate = true;
          } else {
            entry.targetLine.visible = false;
          }
        }

        // 3A. Live 3D Combat VFX Projectiles, Sparks, Destructions & Sound Triggers
        const combatEvs = world.combatEvents;
        if (combatEvs) {
          for (let i = 0; i < combatEvs.length; i++) {
            const ev = combatEvs[i];
            if (seenCombatEventIds.has(ev.id)) continue;
            seenCombatEventIds.add(ev.id);
            if (seenCombatEventIds.size > 400) {
              const oldest = seenCombatEventIds.values().next().value;
              if (oldest !== undefined) seenCombatEventIds.delete(oldest);
            }

            if (ev.kind === 'alert' && ev.targetOwnerId === pid) {
              callbacksRef.current.onUnderAttackAlert?.(ev.toX, ev.toZ, ev.labelAr, 'danger');
              soundFx.playUnderAttackAlert();
              continue;
            }

            if (
              (ev.kind === 'ambush' || ev.kind === 'loot_stolen' || ev.kind === 'loot_recovered') &&
              ev.targetOwnerId === pid
            ) {
              const tone =
                ev.kind === 'loot_recovered'
                  ? 'recovered'
                  : ev.kind === 'loot_stolen'
                    ? 'loot'
                    : 'danger';
              callbacksRef.current.onUnderAttackAlert?.(ev.toX, ev.toZ, ev.labelAr, tone);
              if (ev.kind === 'ambush') soundFx.playUnderAttackAlert();
              else if (ev.kind === 'loot_stolen') soundFx.playMeleeClash();
              else soundFx.playAttackOrder();
            }

            if (Math.hypot(ev.toX - rig.currentX, ev.toZ - rig.currentZ) > viewCullRadius) {
              continue;
            }

            if (ev.kind === 'arrow' || ev.kind === 'fire_arrow') soundFx.playArrowShot();
            else if (ev.kind === 'melee') soundFx.playMeleeClash();
            else if (ev.kind === 'siege' || ev.kind === 'siege_boulder') soundFx.playSiegeHit();
            else if (ev.kind === 'destruction') soundFx.playDestruction();

            const isArrow = ev.kind === 'arrow' || ev.kind === 'fire_arrow';
            const isBoulder = ev.kind === 'siege_boulder';
            const mat = isBoulder
              ? fxBoulderMat
              : ev.kind === 'fire_arrow'
                ? fxFireArrowMat
                : ev.kind === 'arrow'
                  ? fxArrowMat
                  : ev.kind === 'repair' || ev.kind === 'loot_recovered'
                    ? fxRepairMat
                    : ev.kind === 'destruction'
                      ? fxBoomMat
                      : ev.kind === 'ambush'
                        ? fxAmbushMat
                        : ev.kind === 'loot_stolen'
                          ? fxLootMat
                          : fxMeleeMat;
            const mesh = new THREE.Mesh(
              isBoulder ? fxBoulderGeom : isArrow ? fxArrowGeom : fxSparkGeom,
              mat
            );
            const fromY = getTerrainHeight(ev.fromX, ev.fromZ);
            const toY = getTerrainHeight(ev.toX, ev.toZ);
            mesh.position.set(ev.fromX - originX, fromY + (isBoulder ? 2.6 : 1.4), ev.fromZ - originZ);
            scene.add(mesh);
            activeCombatFx.push({
              mesh,
              kind: ev.kind,
              fromX: ev.fromX,
              fromY,
              fromZ: ev.fromZ,
              toX: ev.toX,
              toY,
              toZ: ev.toZ,
              age: 0,
              duration: isBoulder
                ? 0.78
                : isArrow
                  ? 0.36
                  : ev.kind === 'destruction' || ev.kind === 'ambush'
                    ? 0.65
                    : ev.kind === 'loot_stolen' || ev.kind === 'loot_recovered'
                      ? 0.55
                      : 0.32,
            });
          }
        }

        for (let i = activeCombatFx.length - 1; i >= 0; i--) {
          const fx = activeCombatFx[i];
          fx.age += delta;
          const t = Math.min(1, fx.age / fx.duration);
          if (t >= 1) {
            scene.remove(fx.mesh);
            activeCombatFx.splice(i, 1);
            continue;
          }
          if (fx.kind === 'siege_boulder') {
            const cx = THREE.MathUtils.lerp(fx.fromX, fx.toX, t);
            const cz = THREE.MathUtils.lerp(fx.fromZ, fx.toZ, t);
            const cy =
              THREE.MathUtils.lerp(fx.fromY + 2.8, fx.toY + 1.2, t) +
              Math.sin(t * Math.PI) * 9.5;
            fx.mesh.position.set(cx - originX, cy, cz - originZ);
            fx.mesh.rotation.x += delta * 7.5;
            fx.mesh.rotation.z += delta * 5.2;
            const bScale = 1.0 + Math.sin(t * Math.PI) * 0.35;
            fx.mesh.scale.setScalar(bScale);
          } else if (fx.kind === 'arrow' || fx.kind === 'fire_arrow') {
            const cx = THREE.MathUtils.lerp(fx.fromX, fx.toX, t);
            const cz = THREE.MathUtils.lerp(fx.fromZ, fx.toZ, t);
            const cy =
              THREE.MathUtils.lerp(fx.fromY + 1.8, fx.toY + 1.1, t) +
              Math.sin(t * Math.PI) * 3.2;
            fx.mesh.position.set(cx - originX, cy, cz - originZ);
            fx.mesh.lookAt(fx.toX - originX, fx.toY + 1.1, fx.toZ - originZ);
          } else {
            const ty = fx.toY + 1.2 + t * 1.4;
            fx.mesh.position.set(fx.toX - originX, ty, fx.toZ - originZ);
            const s =
              fx.kind === 'destruction'
                ? 1.0 + t * 3.4
                : fx.kind === 'ambush'
                  ? 1.2 + t * 2.5
                  : fx.kind === 'loot_stolen' || fx.kind === 'loot_recovered'
                    ? 0.8 + t * 1.6
                    : 0.7 + t * 1.2;
            fx.mesh.scale.setScalar(s);
            fx.mesh.rotation.y += delta * 6;
          }
        }

        // 4. Remote Players' Camera Frustums (Hidden outside friendly Among-Us Line-of-Sight)
        for (const [id, pres] of remotePlayerMeshes.entries()) {
          if (!plrMap[id] || id === pid) {
            scene.remove(pres.root);
            remotePlayerMeshes.delete(id);
          }
        }

        for (const pId in plrMap) {
          const p = plrMap[pId];
          if (p.id === pid) continue;
          const distToCam = Math.hypot(
            p.camera.targetX - rig.currentX,
            p.camera.targetZ - rig.currentZ
          );
          const isRemoteInSight =
            distToCam <= viewCullRadius &&
            (visionSystem.isWorldPointVisible(p.camera.targetX, p.camera.targetZ, 0.22) ||
              visionSystem.isWorldPointVisible(p.camera.cursorX, p.camera.cursorZ, 0.22));
          let pres = remotePlayerMeshes.get(p.id);
          if (!isRemoteInSight) {
            if (pres) pres.root.visible = false;
            continue;
          }
          if (!pres) {
            pres = buildRemotePlayerPresence(p.color);
            scene.add(pres.root);
            remotePlayerMeshes.set(p.id, pres);
          }
          pres.root.visible = true;
          const targetRelX = p.camera.targetX - originX;
          const targetRelZ = p.camera.targetZ - originZ;
          pres.frustumFrame.position.x = targetRelX;
          pres.frustumFrame.position.z = targetRelZ;
          pres.frustumFrame.position.y = getTerrainHeight(p.camera.targetX, p.camera.targetZ);
          pres.frustumFrame.rotation.y = p.camera.yaw;
          const zoomScale = p.camera.zoom / 38;
          pres.frustumFrame.scale.set(zoomScale, 1, zoomScale);

          pres.cursorBeacon.position.x = p.camera.cursorX - originX;
          pres.cursorBeacon.position.z = p.camera.cursorZ - originZ;
          pres.cursorBeacon.position.y = getTerrainHeight(p.camera.cursorX, p.camera.cursorZ);
        }
      }

      visionSystem.bindToShaders(originX, originZ);
      renderer.render(scene, activeCamera);

      // Update Zero-Rerender 3D Compass, Location Readout & Horizon Landmark Signposts
      const nowPerf = performance.now();
      const headingDeg = (((-rig.currentYaw * 180) / Math.PI) % 360 + 360) % 360;
      if (headingDegElRef.current) {
        headingDegElRef.current.textContent = `${Math.round(headingDeg)}°`;
      }
      for (let ci = 0; ci < COMPASS_CARDINALS.length; ci++) {
        const el = compassCardRefs.current[ci];
        if (!el) continue;
        const cDeg = COMPASS_CARDINALS[ci].deg;
        const deltaDeg = ((cDeg - headingDeg + 540) % 360) - 180;
        if (Math.abs(deltaDeg) > 88) {
          el.style.opacity = '0';
        } else {
          const pct = 50 + (deltaDeg / 85) * 50;
          el.style.left = `${pct.toFixed(1)}%`;
          el.style.opacity = String(Math.max(0.2, 1 - Math.abs(deltaDeg) / 92));
        }
      }

      // Locate player's Keep for live compass homing & horizon beacon
      let myKeepStruct: { x: number; z: number } | null = null;
      if (world && pid && world.structures) {
        for (const sId in world.structures) {
          const st = world.structures[sId];
          if (st.ownerId === pid && st.kind === 'keep' && st.hp > 0) {
            myKeepStruct = st;
            break;
          }
        }
      }
      keepTargetPosRef.current = myKeepStruct ? { x: myKeepStruct.x, z: myKeepStruct.z } : null;

      if (compassKeepPipRef.current) {
        if (myKeepStruct) {
          const kdx = myKeepStruct.x - rig.currentX;
          const kdz = myKeepStruct.z - rig.currentZ;
          const kDist = Math.hypot(kdx, kdz);
          if (kDist > 90) {
            const kBear = ((Math.atan2(kdx, -kdz) * 180) / Math.PI + 360) % 360;
            const kDelta = ((kBear - headingDeg + 540) % 360) - 180;
            const clampedPct = Math.max(4, Math.min(96, 50 + (kDelta / 85) * 50));
            compassKeepPipRef.current.style.left = `${clampedPct.toFixed(1)}%`;
            compassKeepPipRef.current.style.opacity = Math.abs(kDelta) > 85 ? '0.65' : '1';
          } else {
            compassKeepPipRef.current.style.opacity = '0';
          }
        } else {
          compassKeepPipRef.current.style.opacity = '0';
        }
      }

      // Update regional location headline & Keep distance readout (~every 140ms, zero React rerenders)
      if (frameCounter % 8 === 0) {
        const loc = describeSpatialLocationAt(rig.currentX, rig.currentZ);
        if (locationHeadlineElRef.current) {
          locationHeadlineElRef.current.textContent = loc.headlineAr;
        }
        if (locationCoordsElRef.current) {
          const ewKm = (Math.abs(rig.currentX) / 1000).toFixed(1);
          const nsKm = (Math.abs(rig.currentZ) / 1000).toFixed(1);
          const ewDir = rig.currentX >= 0 ? 'شر' : 'غ';
          const nsDir = rig.currentZ <= 0 ? 'ش' : 'ج';
          locationCoordsElRef.current.textContent = `${ewKm} كم ${ewDir} · ${nsKm} كم ${nsDir}`;
        }
        if (keepBtnElRef.current && keepBtnTextElRef.current) {
          if (myKeepStruct) {
            const kdx = myKeepStruct.x - rig.currentX;
            const kdz = myKeepStruct.z - rig.currentZ;
            const kDist = Math.hypot(kdx, kdz);
            keepBtnElRef.current.style.display = 'inline-flex';
            keepBtnTextElRef.current.textContent =
              kDist < 120
                ? 'عند معقلك'
                : `معقلك · ${formatDistanceAr(kDist)} ${formatBearingAr(kdx, kdz)}`;
          } else {
            keepBtnElRef.current.style.display = 'none';
          }
        }
      }

      // Project nearest major Thar Ahmad landmarks + Keep onto compass pips & 3D Horizon Signposts
      const lmCandidates: Array<{
        label: string;
        x: number;
        z: number;
        dist: number;
        isKeep: boolean;
      }> = [];
      if (myKeepStruct) {
        const kd = Math.hypot(myKeepStruct.x - rig.currentX, myKeepStruct.z - rig.currentZ);
        if (kd > 220) {
          lmCandidates.push({
            label: 'معقلك',
            x: myKeepStruct.x,
            z: myKeepStruct.z,
            dist: kd,
            isKeep: true,
          });
        }
      }
      const maxBeaconDist = isPersp3D ? 18_000 : 5_500;
      for (let i = 0; i < MACRO_LANDMARKS.length; i++) {
        const lm = MACRO_LANDMARKS[i];
        if (lm.priority > 2) continue;
        const d = Math.hypot(lm.x - rig.currentX, lm.z - rig.currentZ);
        if (d < 140 || d > maxBeaconDist) continue;
        lmCandidates.push({
          label: lm.nameAr.split(' (')[0],
          x: lm.x,
          z: lm.z,
          dist: d,
          isKeep: false,
        });
      }
      lmCandidates.sort((a, b) => (a.isKeep ? -1 : b.isKeep ? 1 : a.dist - b.dist));

      // Place top 3 landmark pips onto compass tape
      let pipIdx = 0;
      for (let i = 0; i < lmCandidates.length && pipIdx < COMPASS_LANDMARK_PIPS; i++) {
        const item = lmCandidates[i];
        if (item.isKeep) continue;
        const pipEl = compassLmPipRefs.current[pipIdx];
        if (pipEl) {
          const bear = ((Math.atan2(item.x - rig.currentX, -(item.z - rig.currentZ)) * 180) / Math.PI + 360) % 360;
          const dDeg = ((bear - headingDeg + 540) % 360) - 180;
          if (Math.abs(dDeg) <= 84) {
            pipEl.style.left = `${(50 + (dDeg / 85) * 50).toFixed(1)}%`;
            pipEl.style.opacity = '0.9';
            pipEl.title = `${item.label} (${formatDistanceAr(item.dist)})`;
          } else {
            pipEl.style.opacity = '0';
          }
        }
        pipIdx += 1;
      }
      for (; pipIdx < COMPASS_LANDMARK_PIPS; pipIdx++) {
        const pipEl = compassLmPipRefs.current[pipIdx];
        if (pipEl) pipEl.style.opacity = '0';
      }

      // Report GPU Render Optimization Telemetry every 600ms
      frameCounter += 1;
      if (nowPerf - lastPerfReportTime >= 600) {
        const fps = Math.round((frameCounter * 1000) / (nowPerf - lastPerfReportTime));
        frameCounter = 0;
        lastPerfReportTime = nowPerf;
        callbacksRef.current.onPerfStatsChange?.({
          fps,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometriesInVram: renderer.info.memory.geometries,
          texturesInVram: renderer.info.memory.textures,
          resolutionLabel: `${currentRenderW}×${currentRenderH}px`,
          worldPixelsPerMeter: currentWorldPpm,
        });
      }

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    clearInputRef.current = () => {
      for (const k in keysPressed) {
        keysPressed[k] = false;
      }
      activeTouchPointers.clear();
      isPanningCamera = false;
      isRotatingCamera = false;
      isBoxSelecting = false;
      wheelOutOvershoot = 0;
      pinchOutOvershoot = 0;
      setSelectionBoxRect(null);
    };

    resumeTickRef.current = () => {
      if (pausedRef.current || frameId !== 0) return;
      clock.getDelta();
      lastPerfReportTime = performance.now();
      frameCounter = 0;
      frameId = requestAnimationFrame(tick);
    };

    if (!pausedRef.current) {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      clearInputRef.current = null;
      resumeTickRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      domElem.removeEventListener('pointerdown', onPointerDown);
      domElem.removeEventListener('pointermove', onPointerMove);
      domElem.removeEventListener('pointerup', onPointerUp);
      domElem.removeEventListener('pointercancel', onPointerUp);
      domElem.removeEventListener('wheel', onWheel);
      domElem.removeEventListener('contextmenu', onContextMenu);
      domElem.removeEventListener('webglcontextlost', onWebglContextLost);
      domElem.removeEventListener('webglcontextrestored', onWebglContextRestored);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      visionSystem.dispose();
      terrainBundle.dispose();
      buildGridOverlay.dispose();
      scene.environment?.dispose();
      for (const [, entry] of unitMeshes.entries()) {
        scene.remove(entry.group);
        scene.remove(entry.targetLine);
        (entry.selectionRing.material as THREE.Material).dispose();
        const hpBar = entry.group.userData?.hpBar as { fillMat?: THREE.Material } | undefined;
        hpBar?.fillMat?.dispose();
        entry.targetLine.geometry.dispose();
        (entry.targetLine.material as THREE.Material).dispose();
      }
      unitMeshes.clear();
      for (const [, bar] of structHpBars.entries()) {
        scene.remove(bar.group);
        bar.fillMat.dispose();
      }
      structHpBars.clear();
      for (const [, pier] of wallJunctionPiers.entries()) {
        scene.remove(pier.group);
      }
      wallJunctionPiers.clear();
      UNIT_SELECTION_RING_GEOM.dispose();
      structSelectRingGeom.dispose();
      structSelectRingMat.dispose();
      ghostRingGeom.dispose();
      ghostMat.dispose();
      lineValidMat.dispose();
      lineInvalidMat.dispose();
      lineWaterMat.dispose();
      lineWallGeom.dispose();
      lineMoatGeom.dispose();
      lineTowerGeom.dispose();
      lineAnchorBeaconGeom.dispose();
      lineAnchorBeaconMat.dispose();
      moveMarkerGeom.dispose();
      moveMarkerMat.dispose();
      hpBgGeom.dispose();
      hpBgMat.dispose();
      fxArrowGeom.dispose();
      fxSparkGeom.dispose();
      fxBoulderGeom.dispose();
      fxArrowMat.dispose();
      fxFireArrowMat.dispose();
      fxBoulderMat.dispose();
      fxMeleeMat.dispose();
      fxRepairMat.dispose();
      fxBoomMat.dispose();
      fxAmbushMat.dispose();
      fxLootMat.dispose();
      renderer.dispose();
      if (mount.contains(domElem)) {
        mount.removeChild(domElem);
      }
    };
  }, [worldRef]);

  const handleFlyToWorldPoint = (tx: number, tz: number) => {
    const rig = camRigRef.current;
    const dist = Math.hypot(tx - rig.currentX, tz - rig.currentZ);
    if (dist > 1400) {
      rig.currentX = clampWorld(tx);
      rig.currentZ = clampWorld(tz);
    }
    rig.targetX = clampWorld(tx);
    rig.targetZ = clampWorld(tz);
  };

  return (
    <div className="relative w-full h-full overflow-hidden touch-none">
      <div ref={canvasMountRef} className="w-full h-full cursor-crosshair touch-none" />

      {webglContextLost && (
        <div
          dir="rtl"
          className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#0f0a05]/92 text-[#fde68a] p-6 text-center gap-3"
        >
          <div className="text-base font-bold">انقطع سياق الرسوميات (WebGL Context Lost)</div>
          <p className="text-xs text-[#cbb68e] max-w-sm">
            قد يكون المتصفح أو البطاقة الرسومية أعادت تشغيل الذاكرة. جاري الانتظار للاستعادة أو أعد تحميل الصفحة.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rts2k-bevel-btn-gold text-xs font-bold cursor-pointer"
          >
            إعادة تحميل المشهد
          </button>
        </div>
      )}

      {/* Single Ultra-Slim Top-Center Location & Compass Ribbon (Auto-hides during build placement & short landscape) */}
      {!paused && !buildMode && (
        <div
          aria-label="بوصلة الموقع والاتجاه ثلاثي الأبعاد"
          className="rts2k-hud-compass pointer-events-none absolute top-[35px] sm:top-[38px] left-1/2 -translate-x-1/2 z-[15] max-w-[92vw]"
        >
          <div className="pointer-events-auto h-[22px] px-2 bg-[#120c07]/78 border border-[#8e6a2e]/70 flex items-center gap-1.5 text-[9.5px] text-[#f5e3ba] shadow">
            <span
              ref={locationHeadlineElRef}
              className="font-bold text-[#ffebb0] truncate max-w-[170px] sm:max-w-[220px] whitespace-nowrap"
            >
              بادية الشام · قرب حصن القفول
            </span>

            <span
              ref={locationCoordsElRef}
              className="hidden md:inline font-mono tabular-nums text-[9px] text-[#cbb68e] whitespace-nowrap"
            >
              4.8 كم ش · 3.2 كم ج
            </span>

            {/* Compact Inline Rotating Compass Ribbon (Desktop only so mobile stays crystal clear) */}
            <div className="hidden lg:block relative w-[132px] h-4 bg-[#0d0804]/85 border border-[#7c5c2c]/60 overflow-hidden select-none shrink-0">
              <div dir="ltr" className="relative w-full h-full">
                {COMPASS_CARDINALS.map((c, idx) => (
                  <span
                    key={c.label}
                    ref={(el) => {
                      compassCardRefs.current[idx] = el;
                    }}
                    style={{ left: '50%', opacity: 0 }}
                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap ${
                      c.major
                        ? 'text-[9.5px] font-bold text-[#ffebb0]'
                        : 'text-[8px] font-semibold text-[#bca67f]'
                    }`}
                  >
                    {c.label}
                  </span>
                ))}
                {Array.from({ length: COMPASS_LANDMARK_PIPS }).map((_, idx) => (
                  <span
                    key={idx}
                    ref={(el) => {
                      compassLmPipRefs.current[idx] = el;
                    }}
                    style={{ left: '50%', opacity: 0 }}
                    className="absolute bottom-0 -translate-x-1/2 w-1 h-1 bg-[#d9b264]"
                  />
                ))}
                <span
                  ref={compassKeepPipRef}
                  style={{ left: '50%', opacity: 0 }}
                  title="اتجاه معقلك"
                  className="absolute top-0 -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-[#facc15]"
                />
              </div>
              <span className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[1.5px] h-1 bg-[#fbbf24]" />
            </div>

            <span
              ref={headingDegElRef}
              className="hidden sm:inline font-mono tabular-nums text-[8.5px] text-[#c8b28e] whitespace-nowrap"
            >
              315°
            </span>

            <button
              ref={keepBtnElRef}
              type="button"
              onClick={() => {
                if (keepTargetPosRef.current) {
                  handleFlyToWorldPoint(keepTargetPosRef.current.x, keepTargetPosRef.current.z);
                }
              }}
              style={{ display: 'none' }}
              title="العودة السريعة إلى معقلك"
              className="h-4 px-1.5 rts2k-bevel-btn-gold text-[9px] font-bold items-center cursor-pointer whitespace-nowrap shrink-0"
            >
              <span ref={keepBtnTextElRef}>معقلك</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Center-Aim Build Reticle (SVG only — live validity tint lets players pan with 1 finger to align without finger blocking the grid) */}
      {!paused && buildMode && showCenterCrosshair && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[16] flex items-center justify-center"
        >
          <svg viewBox="0 0 64 64" className="w-14 h-14 drop-shadow-[0_1px_3px_rgba(0,0,0,0.92)]">
            <circle
              ref={reticleRingRef}
              cx="32"
              cy="32"
              r="20"
              fill="none"
              stroke="#4ade80"
              strokeWidth="1.6"
              strokeDasharray="6 4"
              opacity="0.92"
            />
            <path d="M22 14 L14 14 L14 22" fill="none" stroke="#fef08a" strokeWidth="1.6" opacity="0.85" />
            <path d="M42 14 L50 14 L50 22" fill="none" stroke="#fef08a" strokeWidth="1.6" opacity="0.85" />
            <path d="M22 50 L14 50 L14 42" fill="none" stroke="#fef08a" strokeWidth="1.6" opacity="0.85" />
            <path d="M42 50 L50 50 L50 42" fill="none" stroke="#fef08a" strokeWidth="1.6" opacity="0.85" />
            <line x1="32" y1="5" x2="32" y2="15" stroke="#fef08a" strokeWidth="1.8" />
            <line x1="32" y1="49" x2="32" y2="59" stroke="#fef08a" strokeWidth="1.8" />
            <line x1="5" y1="32" x2="15" y2="32" stroke="#fef08a" strokeWidth="1.8" />
            <line x1="49" y1="32" x2="59" y2="32" stroke="#fef08a" strokeWidth="1.8" />
            <circle ref={reticleDotRef} cx="32" cy="32" r="2.6" fill="#4ade80" />
          </svg>
        </div>
      )}

      {selectionBoxRect && (
        <div
          className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-500/15"
          style={{
            left: selectionBoxRect.left,
            top: selectionBoxRect.top,
            width: selectionBoxRect.width,
            height: selectionBoxRect.height,
          }}
        />
      )}
    </div>
  );
});
