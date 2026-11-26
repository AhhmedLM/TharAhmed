import * as THREE from 'three';
import {
  BanditCampArchetype,
  BanditRoleKind,
  BannerPatternKind,
  ResourceKind,
  UnitKind,
} from '../shared/protocol';
import { applyRetroPixelShader } from './proceduralBlockout';
import {
  createHighCraftBanditCanvas,
  createHighCraftUnitCanvas,
} from './unitPixelArt';

/**
 * ============================================================================
 * 2000s RTS 2D PIXEL-ART SPRITE ENGINE (UNITS, TREES, SOUTHERN PROPS & RESOURCES)
 * ============================================================================
 * Generates authentic 100% procedural 2D Pixel-Art Sprites (Stronghold / AoE2 style)
 * with crisp 1px dark outlines, Nearest-Neighbor filtering, alphaTest cutouts,
 * and 2-frame walk/action animations that sit on top of the 3D terrain.
 */

type PixelGrid = string[];

function drawPixelArtGrid(
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  palette: Record<string, string>,
  offsetX = 0,
  offsetY = 0
) {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const color = palette[ch];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(offsetX + x, offsetY + y, 1, 1);
      }
    }
  }
}

function finalizePixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

/**
 * Shared tilted 2D Billboard Plane Geometry anchored at bottom-center (y = 0)
 * and angled back by 22 degrees so it faces the 38-degree isometric camera squarely.
 */
const BILLBOARD_GEOM_CACHE = new Map<string, THREE.BufferGeometry>();

export function getSharedBillboardGeometry(width: number, height: number): THREE.BufferGeometry {
  const key = `${width.toFixed(2)}_${height.toFixed(2)}`;
  let geom = BILLBOARD_GEOM_CACHE.get(key);
  if (!geom) {
    geom = new THREE.PlaneGeometry(width, height);
    // Anchor bottom edge at y = 0
    geom.translate(0, height * 0.5, 0);
    // Tilt slightly backward so 2D sprite faces the isometric camera cleanly
    geom.rotateX(-THREE.MathUtils.degToRad(20));
    BILLBOARD_GEOM_CACHE.set(key, geom);
  }
  return geom;
}

// ============================================================================
// 1. 2D PIXEL-ART UNIT SPRITES (2-FRAME ANIMATED: WORKER, INFANTRY, CAVALRY)
// ============================================================================

const MAX_MATERIAL_CACHE_ENTRIES = 120;

function setBoundedCacheEntry<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  maxSize: number,
  onEvict: (old: V) => void
): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= maxSize) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      const oldestVal = cache.get(oldestKey);
      cache.delete(oldestKey);
      if (oldestVal !== undefined) onEvict(oldestVal);
    }
  }
  cache.set(key, value);
}

const UNIT_SPRITE_MATERIAL_CACHE = new Map<
  string,
  { frame0: THREE.MeshBasicMaterial; frame1: THREE.MeshBasicMaterial }
>();

export function getUnitSpriteMaterials(
  kind: UnitKind,
  factionColor: string,
  secondaryColor = '#fbbf24',
  bannerPattern: BannerPatternKind = 'crescent_star'
): { frame0: THREE.MeshBasicMaterial; frame1: THREE.MeshBasicMaterial } {
  const key = `${kind}_${factionColor}_${secondaryColor}_${bannerPattern}`;
  let cached = UNIT_SPRITE_MATERIAL_CACHE.get(key);
  if (!cached) {
    const tex0 = finalizePixelTexture(
      createHighCraftUnitCanvas(kind, factionColor, 0, secondaryColor, bannerPattern)
    );
    const tex1 = finalizePixelTexture(
      createHighCraftUnitCanvas(kind, factionColor, 1, secondaryColor, bannerPattern)
    );
    cached = {
      frame0: new THREE.MeshBasicMaterial({
        map: tex0,
        transparent: true,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
      }),
      frame1: new THREE.MeshBasicMaterial({
        map: tex1,
        transparent: true,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
      }),
    };
    setBoundedCacheEntry(
      UNIT_SPRITE_MATERIAL_CACHE,
      key,
      cached,
      MAX_MATERIAL_CACHE_ENTRIES,
      (old) => {
        old.frame0.map?.dispose();
        old.frame0.dispose();
        old.frame1.map?.dispose();
        old.frame1.dispose();
      }
    );
  } else {
    UNIT_SPRITE_MATERIAL_CACHE.delete(key);
    UNIT_SPRITE_MATERIAL_CACHE.set(key, cached);
  }
  return cached;
}

export function getBanditSpriteMaterials(
  role: BanditRoleKind,
  archetype: BanditCampArchetype,
  carryingLoot: boolean
): { frame0: THREE.MeshBasicMaterial; frame1: THREE.MeshBasicMaterial } {
  const key = `bandit_${role}_${archetype}_${carryingLoot ? 'loot' : 'clean'}`;
  let cached = UNIT_SPRITE_MATERIAL_CACHE.get(key);
  if (!cached) {
    const tex0 = finalizePixelTexture(
      createHighCraftBanditCanvas(role, archetype, 0, carryingLoot)
    );
    const tex1 = finalizePixelTexture(
      createHighCraftBanditCanvas(role, archetype, 1, carryingLoot)
    );
    cached = {
      frame0: new THREE.MeshBasicMaterial({
        map: tex0,
        transparent: true,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
      }),
      frame1: new THREE.MeshBasicMaterial({
        map: tex1,
        transparent: true,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
      }),
    };
    setBoundedCacheEntry(
      UNIT_SPRITE_MATERIAL_CACHE,
      key,
      cached,
      MAX_MATERIAL_CACHE_ENTRIES,
      (old) => {
        old.frame0.map?.dispose();
        old.frame0.dispose();
        old.frame1.map?.dispose();
        old.frame1.dispose();
      }
    );
  } else {
    UNIT_SPRITE_MATERIAL_CACHE.delete(key);
    UNIT_SPRITE_MATERIAL_CACHE.set(key, cached);
  }
  return cached;
}

const SHADOW_OVAL_GEOM = (() => {
  const g = new THREE.CircleGeometry(0.48, 12);
  g.rotateX(-Math.PI / 2);
  return g;
})();

const SHADOW_OVAL_MAT = new THREE.MeshBasicMaterial({
  color: 0x090d16,
  transparent: true,
  opacity: 0.44,
  depthWrite: false,
});

const COMMANDER_AURA_RING_GEOM = (() => {
  const g = new THREE.RingGeometry(0.92, 1.18, 28);
  g.rotateX(-Math.PI / 2);
  return g;
})();

const COMMANDER_AURA_MAT = new THREE.MeshBasicMaterial({
  color: 0xfacc15,
  transparent: true,
  opacity: 0.65,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const NAVAL_BOAT_MAT_CACHE = new Map<string, THREE.MeshBasicMaterial>();

function createNavalBoatTexture(factionColor: string, secondaryColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 24;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 24);

  const fCol = new THREE.Color(factionColor);
  const fHex = `#${fCol.getHexString()}`;
  const sCol = new THREE.Color(secondaryColor || '#fbbf24');
  const sHex = `#${sCol.getHexString()}`;

  const grid: PixelGrid = [
    '................................',
    '..............##................',
    '.............#FF#...............',
    '............#FFFF#..............',
    '...........#FFGGFF#.............',
    '...........#FFFFFF#.............',
    '............#GGGG#..............',
    '.............#BB#...............',
    '.......##....#BB#.....##........',
    '......#BW#...#BB#....#WB#.......',
    '....###BB#####BB######BB###.....',
    '...#BBBBBBBBBBBBBBBBBBBBBBB#....',
    '..#BBGGGGGGGGGGGGGGGGGGGGGBB#...',
    '..#bb#FF#bb#FF#bb#FF#bb#FF#b#...',
    '...#bbbbbbbbbbbbbbbbbbbbbbb#....',
    '....#wwwwwwwwwwwwwwwwwwwww#.....',
    '.....#####################......',
    '................................',
  ];

  drawPixelArtGrid(
    ctx,
    grid,
    {
      '#': '#0f172a',
      B: '#92400e',
      b: '#451a03',
      F: fHex,
      G: sHex,
      W: '#f8fafc',
      w: '#7dd3fc',
    },
    0,
    5
  );

  return finalizePixelTexture(canvas);
}

export function getNavalBoatSpriteMaterial(
  factionColor: string,
  secondaryColor = '#fbbf24'
): THREE.MeshBasicMaterial {
  const key = `${factionColor}_${secondaryColor}`;
  let mat = NAVAL_BOAT_MAT_CACHE.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      map: createNavalBoatTexture(factionColor, secondaryColor),
      transparent: true,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
    });
    setBoundedCacheEntry(
      NAVAL_BOAT_MAT_CACHE,
      key,
      mat,
      MAX_MATERIAL_CACHE_ENTRIES,
      (old) => {
        old.map?.dispose();
        old.dispose();
      }
    );
  }
  return mat;
}

export function build2DPixelUnitSprite(
  kind: UnitKind,
  factionColor: string,
  secondaryColor = '#fbbf24',
  bannerPattern: BannerPatternKind = 'crescent_star',
  banditVisual?: {
    role: BanditRoleKind;
    archetype: BanditCampArchetype;
    carryingLoot: boolean;
  }
): THREE.Group {
  const group = new THREE.Group();
  const mats = banditVisual
    ? getBanditSpriteMaterials(
        banditVisual.role,
        banditVisual.archetype,
        banditVisual.carryingLoot
      )
    : getUnitSpriteMaterials(kind, factionColor, secondaryColor, bannerPattern);

  // Soft pixel shadow oval on the ground (scaled proportionally to unit footprint)
  const shadow = new THREE.Mesh(SHADOW_OVAL_GEOM, SHADOW_OVAL_MAT);
  shadow.position.y = 0.05;
  const isMountedUnit =
    kind === 'knight' || kind === 'commander' || banditVisual?.role === 'raider_horse';
  const isSiegeUnit = kind === 'battering_ram' || kind === 'trebuchet';
  if (isSiegeUnit) {
    shadow.scale.set(2.1, 1, 2.1);
  } else if (isMountedUnit) {
    shadow.scale.set(1.45, 1, 1.25);
  } else {
    shadow.scale.set(0.9, 1, 0.9);
  }
  if (kind === 'commander' && !banditVisual) {
    const auraRing = new THREE.Mesh(COMMANDER_AURA_RING_GEOM, COMMANDER_AURA_MAT);
    auraRing.position.y = 0.08;
    auraRing.name = 'commanderAuraRing';
    group.add(auraRing);
  }
  group.add(shadow);

  // Naval transport galley hull (visible when crossing deep ocean water)
  const boatMat = getNavalBoatSpriteMaterial(factionColor, secondaryColor);
  const boatMesh = new THREE.Mesh(getSharedBillboardGeometry(3.4, 2.55), boatMat);
  boatMesh.name = 'unitNavalBoat';
  boatMesh.position.y = -0.12;
  boatMesh.visible = false;
  group.add(boatMesh);

  // 2D High-Craft Pixel Billboard Quad (authentic anatomical width x height vs buildings)
  const [quadW, quadH]: [number, number] = banditVisual
    ? banditVisual.role === 'raider_horse'
      ? [1.82, 1.96]
      : [1.14, 1.52]
    : kind === 'trebuchet'
      ? [3.05, 3.05]
      : kind === 'battering_ram'
        ? [2.55, 2.25]
        : kind === 'commander'
          ? [2.02, 2.20]
          : kind === 'knight'
            ? [1.84, 1.98]
            : [1.18, 1.58];
  const spriteMesh = new THREE.Mesh(getSharedBillboardGeometry(quadW, quadH), mats.frame0);
  spriteMesh.name = 'unitSpriteQuad';
  spriteMesh.castShadow = false;
  group.add(spriteMesh);

  group.userData = {
    kind,
    factionColor,
    secondaryColor,
    bannerPattern,
    isBanditUnit: Boolean(banditVisual),
    banditRole: banditVisual?.role,
    banditArchetype: banditVisual?.archetype,
    carryingLoot: Boolean(banditVisual?.carryingLoot),
    mats,
    spriteMesh,
    boatMesh,
    shadow,
  };

  return group;
}

// ============================================================================
// 2. 2D PIXEL-ART FLORA, TREES & SOUTHERN DESERT / CONTINENTAL PROPS
// ============================================================================

export type FloraSpriteKind =
  | 'forest_tree'
  | 'forest_oak_cluster'
  | 'forest_undergrowth'
  | 'desert_palm'
  | 'alpine_pine'
  | 'southern_cactus_rock';

const FLORA_MAT_CACHE = new Map<FloraSpriteKind, THREE.MeshStandardMaterial>();

function createFloraPixelTexture(kind: FloraSpriteKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 32);

  if (kind === 'forest_tree') {
    // Lush 2000s RTS Pixel Oak / Broadleaf Tree
    const pals = [
      { x: 16, y: 12, r: 9, c1: '#0f172a', c2: '#14532d', c3: '#15803d', c4: '#22c55e' },
      { x: 11, y: 15, r: 6, c1: '#0f172a', c2: '#14532d', c3: '#166534', c4: '#15803d' },
      { x: 21, y: 15, r: 6, c1: '#0f172a', c2: '#14532d', c3: '#166534', c4: '#4ade80' },
      { x: 16, y: 7, r: 6, c1: '#0f172a', c2: '#166534', c3: '#15803d', c4: '#4ade80' },
    ];
    // Trunk with 1px dark outline
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(13, 19, 6, 12);
    ctx.fillStyle = '#5c4033';
    ctx.fillRect(14, 19, 4, 11);
    ctx.fillStyle = '#78553a';
    ctx.fillRect(15, 20, 2, 9);

    // Pixelated canopy clusters
    pals.forEach((p) => {
      for (let py = -p.r; py <= p.r; py++) {
        for (let px = -p.r; px <= p.r; px++) {
          const dist = Math.hypot(px, py);
          if (dist <= p.r) {
            if (dist > p.r - 1.1) ctx.fillStyle = p.c1;
            else if (py > 2) ctx.fillStyle = p.c2;
            else if (px + py < -2 && (px + py) % 2 === 0) ctx.fillStyle = p.c4;
            else ctx.fillStyle = p.c3;
            ctx.fillRect(p.x + px, p.y + py, 1, 1);
          }
        }
      }
    });
  } else if (kind === 'forest_oak_cluster') {
    // Broad Ancient Woodland Grove (Twin Overlapping Oaks + Mossy Trunk Roots)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(9, 19, 5, 12);
    ctx.fillRect(18, 17, 6, 14);
    ctx.fillStyle = '#4a3222';
    ctx.fillRect(10, 19, 3, 11);
    ctx.fillRect(19, 17, 4, 13);
    ctx.fillStyle = '#6b472d';
    ctx.fillRect(11, 20, 1, 9);
    ctx.fillRect(20, 18, 2, 11);

    const domes = [
      { x: 10, y: 14, r: 7, c1: '#0a1612', c2: '#0f3d21', c3: '#14532d', c4: '#22c55e' },
      { x: 22, y: 13, r: 8, c1: '#0a1612', c2: '#0f3d21', c3: '#166534', c4: '#4ade80' },
      { x: 16, y: 9, r: 8, c1: '#0a1612', c2: '#14532d', c3: '#15803d', c4: '#86efac' },
      { x: 16, y: 16, r: 6, c1: '#0a1612', c2: '#0f3d21', c3: '#14532d', c4: '#15803d' },
    ];
    domes.forEach((p) => {
      for (let py = -p.r; py <= p.r; py++) {
        for (let px = -p.r; px <= p.r; px++) {
          const dist = Math.hypot(px, py);
          if (dist <= p.r) {
            if (dist > p.r - 1.15) ctx.fillStyle = p.c1;
            else if (py > 2) ctx.fillStyle = p.c2;
            else if (px + py < -2 && (px + py) % 2 === 0) ctx.fillStyle = p.c4;
            else ctx.fillStyle = p.c3;
            ctx.fillRect(p.x + px, p.y + py, 1, 1);
          }
        }
      }
    });
  } else if (kind === 'forest_undergrowth') {
    // Lush Woodland Ferns, Mossy Shrubs & Fallen Forest Bracken
    const shrubs = [
      { x: 9, y: 24, r: 5, c1: '#091510', c2: '#14532d', c3: '#166534', c4: '#4ade80' },
      { x: 22, y: 24, r: 5, c1: '#091510', c2: '#14532d', c3: '#15803d', c4: '#22c55e' },
      { x: 16, y: 21, r: 6, c1: '#091510', c2: '#0f3d21', c3: '#15803d', c4: '#86efac' },
    ];
    shrubs.forEach((p) => {
      for (let py = -p.r; py <= p.r; py++) {
        for (let px = -p.r; px <= p.r; px++) {
          const dist = Math.hypot(px, py * 1.15);
          if (dist <= p.r) {
            if (dist > p.r - 1.1) ctx.fillStyle = p.c1;
            else if (py > 1) ctx.fillStyle = p.c2;
            else if (px + py < -1 && (px + py) % 2 === 0) ctx.fillStyle = p.c4;
            else ctx.fillStyle = p.c3;
            ctx.fillRect(p.x + px, p.y + py, 1, 1);
          }
        }
      }
    });
    // Mossy fallen branch accent at forest floor
    ctx.fillStyle = '#091510';
    ctx.fillRect(11, 28, 10, 3);
    ctx.fillStyle = '#5c4033';
    ctx.fillRect(12, 29, 8, 1);
  } else if (kind === 'desert_palm') {
    // Southern Continent Desert Date Palm & Oasis Shrub (2D Pixel Sprite)
    // Curved segmented palm trunk
    for (let y = 12; y <= 30; y++) {
      const curveX = 16 + Math.round(Math.sin((30 - y) * 0.16) * 2.2);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(curveX - 2, y, 5, 1);
      ctx.fillStyle = y % 2 === 0 ? '#78350f' : '#92400e';
      ctx.fillRect(curveX - 1, y, 3, 1);
    }
    // Dates cluster
    ctx.fillStyle = '#d97706';
    ctx.fillRect(16, 11, 4, 2);

    // Arching pixel palm fronds
    const fronds = [
      [-9, -2],
      [-7, 3],
      [-5, -5],
      [9, -2],
      [8, 3],
      [5, -5],
      [0, -7],
    ];
    fronds.forEach(([dx, dy]) => {
      for (let s = 0; s <= 8; s++) {
        const t = s / 8;
        const fx = Math.round(18 + dx * t);
        const fy = Math.round(10 + dy * t + t * t * 3.5);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(fx - 1, fy - 1, 3, 3);
        ctx.fillStyle = s < 5 ? '#22c55e' : '#15803d';
        ctx.fillRect(fx, fy, 2, 1);
      }
    });
  } else if (kind === 'southern_cactus_rock') {
    // Southern Desert Sandstone Spire + Saguaro Cactus & Dry Scrub
    // Red sandstone rock base
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(6, 20, 14, 11);
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(7, 21, 12, 9);
    ctx.fillStyle = '#c2410c';
    ctx.fillRect(8, 21, 9, 5);
    ctx.fillStyle = '#fdba74';
    ctx.fillRect(9, 21, 6, 2);

    // Tall Saguaro Cactus next to rock
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(20, 10, 5, 20);
    ctx.fillRect(16, 14, 4, 4);
    ctx.fillRect(25, 13, 4, 4);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(21, 11, 3, 18);
    ctx.fillRect(17, 15, 4, 2);
    ctx.fillRect(24, 14, 4, 2);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(22, 12, 1, 15);
  } else {
    // Northern Snow-Dusted Alpine Pine
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(14, 24, 4, 7);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(15, 24, 2, 6);

    const tiers = [
      { topY: 3, h: 8, halfW: 5 },
      { topY: 9, h: 9, halfW: 8 },
      { topY: 16, h: 9, halfW: 10 },
    ];
    tiers.forEach((tr) => {
      for (let ry = 0; ry < tr.h; ry++) {
        const w = Math.max(1, Math.round((ry / tr.h) * tr.halfW));
        const y = tr.topY + ry;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(16 - w - 1, y, w * 2 + 2, 1);
        ctx.fillStyle = ry < 3 ? '#f1f5f9' : ry < 5 ? '#cbd5e1' : '#1e3a2f';
        ctx.fillRect(16 - w, y, w * 2, 1);
      }
    });
  }

  return finalizePixelTexture(canvas);
}

export function getFloraSpriteMaterial(kind: FloraSpriteKind): THREE.MeshStandardMaterial {
  let mat = FLORA_MAT_CACHE.get(kind);
  if (!mat) {
    const tex = createFloraPixelTexture(kind);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.48,
      roughness: 0.9,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    applyRetroPixelShader(mat, { enableVisionFog: true });
    FLORA_MAT_CACHE.set(kind, mat);
  }
  return mat;
}

// ============================================================================
// 3. 2D PIXEL-ART RESOURCE NODE SPRITES (WOOD, STONE, GOLD, FOOD)
// ============================================================================

const RESOURCE_SPRITE_MAT_CACHE = new Map<ResourceKind, THREE.MeshBasicMaterial>();

function createResourcePixelTexture(kind: ResourceKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 32);

  if (kind === 'wood') {
    // Dense 2D Pixel Timber Grove + Stacked Logs
    const treeTex = createFloraPixelTexture('forest_tree');
    ctx.drawImage(treeTex.image as HTMLCanvasElement, -4, -2, 26, 26);
    ctx.drawImage(treeTex.image as HTMLCanvasElement, 10, 0, 24, 24);
    // Log pile at bottom
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(6, 23, 20, 7);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(7, 24, 18, 5);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(8, 25, 3, 3);
    ctx.fillRect(14, 25, 3, 3);
    ctx.fillRect(20, 25, 3, 3);
  } else if (kind === 'stone') {
    // 2D Pixel Quarry Granite Outcrop
    const blobs = [
      { x: 16, y: 18, rx: 11, ry: 9, c1: '#475569', c2: '#94a3b8', c3: '#e2e8f0' },
      { x: 10, y: 22, rx: 7, ry: 6, c1: '#334155', c2: '#64748b', c3: '#cbd5e1' },
      { x: 22, y: 21, rx: 7, ry: 6, c1: '#334155', c2: '#64748b', c3: '#cbd5e1' },
    ];
    blobs.forEach((b) => {
      for (let py = -b.ry; py <= b.ry; py++) {
        for (let px = -b.rx; px <= b.rx; px++) {
          const d = (px * px) / (b.rx * b.rx) + (py * py) / (b.ry * b.ry);
          if (d <= 1.0) {
            ctx.fillStyle =
              d > 0.78 ? '#0f172a' : py < -2 ? b.c3 : py > 2 ? b.c1 : b.c2;
            ctx.fillRect(b.x + px, b.y + py, 1, 1);
          }
        }
      }
    });
  } else if (kind === 'gold') {
    // 2D Pixel Gold Vein Mine Outcrop
    for (let py = -10; py <= 10; py++) {
      for (let px = -12; px <= 12; px++) {
        const d = (px * px) / 144 + (py * py) / 100;
        if (d <= 1.0) {
          const isGoldNugget = (px + py * 3) % 5 === 0 || (px * py) % 7 === 0;
          ctx.fillStyle =
            d > 0.8
              ? '#0f172a'
              : isGoldNugget
                ? py < 0
                  ? '#fef08a'
                  : '#f59e0b'
                : '#451a03';
          ctx.fillRect(16 + px, 19 + py, 1, 1);
        }
      }
    }
  } else if (kind === 'cloth') {
    // 2D Pixel Cotton Field & Grazing White Sheep Pasture + Woven Cloth Bale
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(2, 16, 28, 14);
    ctx.fillStyle = '#14532d';
    ctx.fillRect(3, 17, 26, 12);
    // Lush green pasture tufts + white cotton bolls
    for (let x = 5; x < 27; x += 5) {
      for (let y = 11; y < 25; y += 6) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(x - 2, y, 5, 5);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(x - 1, y + 1, 3, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 1, y, 3, 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(x, y + 1, 2, 1);
      }
    }
    // Rolled dyed cloth bale at bottom right
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(18, 21, 10, 7);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(19, 22, 8, 5);
    ctx.fillStyle = '#0d9488';
    ctx.fillRect(21, 22, 4, 5);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(22, 22, 2, 5);
  } else if (kind === 'horses') {
    // 2D Pixel Wild Arabian & Steppe Horse Herd Pasture + Taming Hitching Post & Lasso
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(2, 16, 28, 14);
    ctx.fillStyle = '#365314';
    ctx.fillRect(3, 17, 26, 12);
    // Wooden taming corral rail at back
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(4, 12, 24, 6);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(5, 13, 2, 5);
    ctx.fillRect(15, 13, 2, 5);
    ctx.fillRect(25, 13, 2, 5);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(5, 14, 22, 2);
    // Chestnut wild stallion on left
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(5, 16, 11, 10);
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(6, 19, 8, 5);
    ctx.fillRect(11, 16, 4, 4);
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(10, 16, 2, 3);
    // Purebred white Arabian mare on right
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(16, 17, 11, 10);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(17, 20, 8, 5);
    ctx.fillRect(22, 17, 4, 4);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(19, 20, 4, 2);
  } else {
    // 2D Pixel Golden Wheat Farm Field
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(2, 16, 28, 14);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(3, 17, 26, 12);
    // Golden pixel wheat stalks
    for (let x = 4; x < 28; x += 2) {
      for (let y = 9; y < 26; y += 4) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(x - 1, y, 3, 5);
        ctx.fillStyle = '#eab308';
        ctx.fillRect(x, y, 1, 5);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(x, y, 1, 2);
      }
    }
  }

  return finalizePixelTexture(canvas);
}

const RESOURCE_SPRITE_TINT_CACHE = new Map<string, THREE.MeshBasicMaterial>();

export function getResourceSpriteMaterial(
  kind: ResourceKind,
  visState: 'visible' | 'explored' | 'shroud'
): THREE.MeshBasicMaterial {
  const key = `${kind}_${visState}`;
  let mat = RESOURCE_SPRITE_TINT_CACHE.get(key);
  if (!mat) {
    let base = RESOURCE_SPRITE_MAT_CACHE.get(kind);
    if (!base) {
      base = new THREE.MeshBasicMaterial({
        map: createResourcePixelTexture(kind),
        transparent: true,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
      });
      RESOURCE_SPRITE_MAT_CACHE.set(kind, base);
    }
    if (visState === 'visible') {
      mat = base;
    } else {
      mat = base.clone();
      mat.color.setHex(visState === 'explored' ? 0x64748b : 0x263244);
    }
    setBoundedCacheEntry(
      RESOURCE_SPRITE_TINT_CACHE,
      key,
      mat,
      MAX_MATERIAL_CACHE_ENTRIES,
      (old) => {
        if (!Array.from(RESOURCE_SPRITE_MAT_CACHE.values()).includes(old)) {
          old.dispose();
        }
      }
    );
  }
  return mat;
}

export function build2DPixelResourceSprite(kind: ResourceKind): THREE.Group {
  const group = new THREE.Group();
  const mat = getResourceSpriteMaterial(kind, 'visible');

  const shadow = new THREE.Mesh(SHADOW_OVAL_GEOM, SHADOW_OVAL_MAT);
  shadow.scale.setScalar(2.1);
  shadow.position.y = 0.05;
  group.add(shadow);

  const spriteMesh = new THREE.Mesh(getSharedBillboardGeometry(4.4, 4.2), mat);
  spriteMesh.name = 'resourceSpriteQuad';
  group.add(spriteMesh);
  group.userData = { kind, spriteMesh };

  return group;
}

