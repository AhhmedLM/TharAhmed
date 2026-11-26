import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  type BespokeCityBlueprint,
  type CityAvenueSpec,
  type CityCrowdHotspot,
  type CityMonumentKind,
  getBespokeCityBlueprintByPlateau,
} from '../shared/cityBlueprints';
import {
  type CityUrbanStyle,
  getTerrainHeight,
  hash2D,
  SPAWN_PLATEAUS,
  WATER_LEVEL_Y,
} from '../shared/worldMap';
import { applyRetroPixelShader } from './proceduralBlockout';

type SpawnPlateauEntry = (typeof SPAWN_PLATEAUS)[number];

interface WalkSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  len: number;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
  halfWidth: number;
}

interface RingPath {
  radius: number;
  width: number;
  arcStart: number;
  arcEnd: number;
  isFullCircle: boolean;
}

interface CrowdAgent {
  mode: 'segment' | 'ring' | 'hotspot';
  segIdx: number;
  ringIdx: number;
  spotX: number;
  spotZ: number;
  spotRadius: number;
  laneOffset: number;
  t: number; // 0..1 along segment, or angle in radians for ring/hotspot
  radialRatio: number;
  speed: number;
  dir: number;
  phase: number;
  scale: number;
}

interface CaravanAgent {
  segIdx: number;
  t: number;
  laneOffset: number;
  speed: number;
  dir: number;
  phase: number;
  scale: number;
}

interface BuiltCityPlaza {
  plateau: SpawnPlateauEntry;
  group: THREE.Group;
  crowdMesh: THREE.InstancedMesh | null;
  caravanMesh: THREE.InstancedMesh | null;
  agents: CrowdAgent[];
  caravans: CaravanAgent[];
  walkSegments: WalkSegment[];
  ringPaths: RingPath[];
  outerR: number;
  isVisible: boolean;
}

export interface HistoricCityQuartersSystem {
  update: (
    delta: number,
    centerWorldX: number,
    centerWorldZ: number,
    originX: number,
    originZ: number,
    isPerspective3D: boolean,
    cameraZoom: number
  ) => void;
  dispose: () => void;
}

interface PlazaPalette {
  cobbleMain: number;
  cobbleAccent: number;
  avenueStone: number;
  awningColors: number[];
  waterHex: number;
  crowdRobes: number[];
}

const PLAZA_PALETTES: Record<CityUrbanStyle, PlazaPalette> = {
  iraqi_mesopotamian: {
    cobbleMain: 0xc2a274,
    cobbleAccent: 0xa38052,
    avenueStone: 0xd6bc92,
    awningColors: [0xb43e2d, 0xd8a346, 0x266a74, 0xe8dcc2, 0x7d3625],
    waterHex: 0x2a7686,
    crowdRobes: [0xefe5d0, 0xc79558, 0x286b76, 0x993a2b, 0x5d4a36, 0xd9a954, 0x385742, 0xdccbb0],
  },
  levantine_shami: {
    cobbleMain: 0xb9afa0,
    cobbleAccent: 0x80776c,
    avenueStone: 0xd4cab8,
    awningColors: [0xa8382c, 0x2e6472, 0xd5a84e, 0xeee4d2, 0x5c7548],
    waterHex: 0x2c7a88,
    crowdRobes: [0xf4ede0, 0xa23c2c, 0x355d70, 0x6b5842, 0xcda459, 0x486544, 0x8c7b6a, 0xe3d6c0],
  },
  hejazi_arabian: {
    cobbleMain: 0xd9c9af,
    cobbleAccent: 0xbaa686,
    avenueStone: 0xe8ddc8,
    awningColors: [0xb84c28, 0xd8a64e, 0x2f685c, 0xf2e9d6],
    waterHex: 0x297b84,
    crowdRobes: [0xf8f4ec, 0xe9dac0, 0x9e4824, 0x2d5e58, 0xcf9a4a, 0x5a4634, 0xdfd0b4],
  },
  bedouin_nomadic: {
    cobbleMain: 0xb9986b,
    cobbleAccent: 0x977750,
    avenueStone: 0xcbad82,
    awningColors: [0x9e2d24, 0x3a2d26, 0xd19c48, 0xe8dcc4],
    waterHex: 0x2d7b82,
    crowdRobes: [0xf1e6d2, 0x3a2e28, 0xa32e24, 0xcc9b52, 0x5d4c3c, 0xdcc6a0, 0x7c482e],
  },
};

const CARAVAN_TINTS = [0xc9a36f, 0xb88f59, 0xd6b583, 0x9e794c, 0xc29a66];

const _tmpMat4 = new THREE.Matrix4();
const _tmpPos = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpScale = new THREE.Vector3();
const _tmpEuler = new THREE.Euler();
const _tmpColor = new THREE.Color();

function pushColoredGeom(
  list: THREE.BufferGeometry[],
  rawGeom: THREE.BufferGeometry,
  colorHex: number | null,
  tx: number,
  ty: number,
  tz: number,
  rotY = 0,
  rotX = 0,
  rotZ = 0
): void {
  const geom = rawGeom.index ? rawGeom.toNonIndexed() : rawGeom;
  if (geom !== rawGeom) rawGeom.dispose();

  if (rotY !== 0 || rotX !== 0 || rotZ !== 0) {
    _tmpEuler.set(rotX, rotY, rotZ, 'YXZ');
    _tmpQuat.setFromEuler(_tmpEuler);
    _tmpPos.set(tx, ty, tz);
    _tmpScale.set(1, 1, 1);
    _tmpMat4.compose(_tmpPos, _tmpQuat, _tmpScale);
    geom.applyMatrix4(_tmpMat4);
  } else if (tx !== 0 || ty !== 0 || tz !== 0) {
    geom.translate(tx, ty, tz);
  }

  if (geom.getAttribute('uv')) geom.deleteAttribute('uv');
  if (!geom.getAttribute('normal')) geom.computeVertexNormals();

  if (colorHex !== null) {
    _tmpColor.setHex(colorHex);
    const count = geom.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = _tmpColor.r;
      colors[i * 3 + 1] = _tmpColor.g;
      colors[i * 3 + 2] = _tmpColor.b;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  list.push(geom);
}

function mergeAndDispose(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geoms.length === 0) return null;
  const merged = mergeGeometries(geoms, false);
  for (let i = 0; i < geoms.length; i++) geoms[i].dispose();
  if (!merged) return null;
  merged.computeBoundingSphere();
  return merged;
}

function createSharedCityAssets() {
  const pavingMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const archMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.06,
    flatShading: true,
  });

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.24,
    metalness: 0.14,
    flatShading: true,
  });

  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xffd066,
    emissive: 0xff6e1a,
    emissiveIntensity: 0.95,
    roughness: 0.4,
    metalness: 0.0,
    flatShading: true,
  });

  const crowdMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.04,
    flatShading: true,
  });

  const caravanMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.04,
    flatShading: true,
  });

  applyRetroPixelShader(pavingMat, { enableVisionFog: true });
  applyRetroPixelShader(archMat, { enableVisionFog: true });
  applyRetroPixelShader(waterMat, { enableVisionFog: true });
  applyRetroPixelShader(crowdMat, { enableVisionFog: true });
  applyRetroPixelShader(caravanMat, { enableVisionFog: true });

  // Composite robed medieval townsfolk silhouette (robe + mantle + turbaned head)
  const crowdParts: THREE.BufferGeometry[] = [];
  pushColoredGeom(crowdParts, new THREE.CylinderGeometry(0.15, 0.26, 0.82, 5), null, 0, 0.41, 0);
  pushColoredGeom(crowdParts, new THREE.BoxGeometry(0.34, 0.16, 0.22), null, 0, 0.74, 0);
  pushColoredGeom(crowdParts, new THREE.CylinderGeometry(0.13, 0.15, 0.22, 5), null, 0, 0.96, 0);
  const crowdGeom = mergeAndDispose(crowdParts) ?? new THREE.BoxGeometry(0.3, 1.05, 0.3);

  // Composite pack-camel merchant caravan silhouette (body + hump + twin cargo packs + neck/head + legs)
  const camelParts: THREE.BufferGeometry[] = [];
  // Torso
  pushColoredGeom(camelParts, new THREE.BoxGeometry(0.54, 0.56, 1.25), null, 0, 0.88, 0);
  // Hump
  pushColoredGeom(camelParts, new THREE.ConeGeometry(0.28, 0.38, 5), null, 0, 1.32, -0.05);
  // Twin woven spice/silk saddle packs
  pushColoredGeom(camelParts, new THREE.BoxGeometry(0.24, 0.42, 0.78), null, -0.36, 0.96, -0.04);
  pushColoredGeom(camelParts, new THREE.BoxGeometry(0.24, 0.42, 0.78), null, 0.36, 0.96, -0.04);
  // Neck & head facing +Z
  pushColoredGeom(camelParts, new THREE.BoxGeometry(0.22, 0.62, 0.24), null, 0, 1.22, 0.62, 0, 0.36, 0);
  pushColoredGeom(camelParts, new THREE.BoxGeometry(0.24, 0.22, 0.42), null, 0, 1.48, 0.82);
  // 4 legs
  pushColoredGeom(camelParts, new THREE.BoxGeometry(0.12, 0.64, 0.12), null, -0.18, 0.32, 0.42);
  pushColoredGeom(camelParts, new THREE.BoxGeometry(0.12, 0.64, 0.12), null, 0.18, 0.32, 0.42);
  pushColoredGeom(camelParts, new THREE.BoxGeometry(0.12, 0.64, 0.12), null, -0.18, 0.32, -0.44);
  pushColoredGeom(camelParts, new THREE.BoxGeometry(0.12, 0.64, 0.12), null, 0.18, 0.32, -0.44);
  const caravanGeom = mergeAndDispose(camelParts) ?? new THREE.BoxGeometry(0.8, 1.2, 1.6);

  return {
    pavingMat,
    archMat,
    waterMat,
    flameMat,
    crowdMat,
    caravanMat,
    crowdGeom,
    caravanGeom,
    dispose: () => {
      pavingMat.dispose();
      archMat.dispose();
      waterMat.dispose();
      flameMat.dispose();
      crowdMat.dispose();
      caravanMat.dispose();
      crowdGeom.dispose();
      caravanGeom.dispose();
    },
  };
}

// ---------- Architectural & Botanical Micro-Builders ----------

function addDatePalm(
  archGeoms: THREE.BufferGeometry[],
  x: number,
  gy: number,
  z: number,
  scale: number,
  seed: number
): void {
  const h = (3.4 + (seed % 1) * 1.4) * scale;
  const leanX = (((seed * 7.3) % 1) - 0.5) * 0.18;
  const leanZ = (((seed * 13.1) % 1) - 0.5) * 0.18;
  // Curved/stepped trunk
  pushColoredGeom(
    archGeoms,
    new THREE.CylinderGeometry(0.15 * scale, 0.28 * scale, h, 5),
    0x7c5a38,
    x,
    gy + h * 0.5,
    z,
    0,
    leanX,
    leanZ
  );
  const topX = x + Math.sin(leanZ) * h * 0.45;
  const topZ = z + Math.sin(leanX) * h * 0.45;
  const topY = gy + h;
  // Golden date cluster
  pushColoredGeom(
    archGeoms,
    new THREE.DodecahedronGeometry(0.28 * scale, 0),
    0xc48b2d,
    topX,
    topY - 0.25 * scale,
    topZ
  );
  // 6 radiating drooping palm fronds
  const frondCount = 6;
  const rotBase = seed * Math.PI * 2;
  for (let f = 0; f < frondCount; f++) {
    const ang = rotBase + (f / frondCount) * Math.PI * 2;
    const fx = topX + Math.cos(ang) * 0.95 * scale;
    const fz = topZ + Math.sin(ang) * 0.95 * scale;
    const frondCol = f % 2 === 0 ? 0x3b6e34 : 0x4b7f3d;
    pushColoredGeom(
      archGeoms,
      new THREE.BoxGeometry(1.75 * scale, 0.12 * scale, 0.46 * scale),
      frondCol,
      fx,
      topY - 0.08 * scale,
      fz,
      -ang,
      0,
      -0.34
    );
  }
}

function addCypressOrOlive(
  archGeoms: THREE.BufferGeometry[],
  x: number,
  gy: number,
  z: number,
  scale: number,
  seed: number
): void {
  const isCypress = seed > 0.44;
  if (isCypress) {
    const h = (3.8 + (seed * 3.1 % 1) * 1.6) * scale;
    pushColoredGeom(
      archGeoms,
      new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, 0.9 * scale, 5),
      0x684c33,
      x,
      gy + 0.45 * scale,
      z
    );
    pushColoredGeom(
      archGeoms,
      new THREE.ConeGeometry(0.75 * scale, h, 6),
      0x274d2c,
      x,
      gy + 0.7 * scale + h * 0.5,
      z
    );
  } else {
    // Gnarled olive tree with silvery-green canopy
    pushColoredGeom(
      archGeoms,
      new THREE.CylinderGeometry(0.18 * scale, 0.28 * scale, 1.35 * scale, 5),
      0x6e543b,
      x,
      gy + 0.68 * scale,
      z
    );
    pushColoredGeom(
      archGeoms,
      new THREE.DodecahedronGeometry(1.22 * scale, 0),
      0x5a764c,
      x,
      gy + 1.95 * scale,
      z,
      seed * 4
    );
    pushColoredGeom(
      archGeoms,
      new THREE.DodecahedronGeometry(0.82 * scale, 0),
      0x6f8b5d,
      x + 0.55 * scale,
      gy + 1.68 * scale,
      z - 0.35 * scale
    );
  }
}

function addSouqStallAndAwning(
  archGeoms: THREE.BufferGeometry[],
  x: number,
  gy: number,
  z: number,
  rotY: number,
  awningHex: number,
  seed: number
): void {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  // 4 timber posts
  const postOffsets: Array<[number, number]> = [
    [-1.15, -0.75],
    [1.15, -0.75],
    [-1.15, 0.75],
    [1.15, 0.75],
  ];
  for (const [px, pz] of postOffsets) {
    const wx = x + px * cos + pz * sin;
    const wz = z - px * sin + pz * cos;
    pushColoredGeom(
      archGeoms,
      new THREE.BoxGeometry(0.11, 2.15, 0.11),
      0x6b4a2b,
      wx,
      gy + 1.08,
      wz,
      rotY
    );
  }
  // Sloped woven silk canopy roof
  pushColoredGeom(
    archGeoms,
    new THREE.BoxGeometry(2.65, 0.12, 1.85),
    awningHex,
    x,
    gy + 2.22,
    z,
    rotY,
    0.16,
    0
  );
  // Counter table + spice baskets / folded cloth bolts
  pushColoredGeom(
    archGeoms,
    new THREE.BoxGeometry(2.05, 0.65, 0.78),
    0x855c37,
    x,
    gy + 0.33,
    z,
    rotY
  );
  const goodsColor = seed > 0.66 ? 0xd99b2e : seed > 0.33 ? 0xb53c28 : 0x3b7a78;
  pushColoredGeom(
    archGeoms,
    new THREE.BoxGeometry(0.62, 0.34, 0.48),
    goodsColor,
    x - 0.45 * cos,
    gy + 0.82,
    z + 0.45 * sin,
    rotY
  );
  pushColoredGeom(
    archGeoms,
    new THREE.CylinderGeometry(0.24, 0.2, 0.38, 5),
    0xc49c6c,
    x + 0.48 * cos,
    gy + 0.84,
    z - 0.48 * sin
  );
}

function addFountainPool(
  archGeoms: THREE.BufferGeometry[],
  waterGeoms: THREE.BufferGeometry[],
  x: number,
  gy: number,
  z: number,
  radius: number,
  stoneHex: number,
  waterHex: number
): void {
  // Octagonal carved stone basin rim
  pushColoredGeom(
    archGeoms,
    new THREE.CylinderGeometry(radius, radius * 1.06, 0.56, 8),
    stoneHex,
    x,
    gy + 0.28,
    z
  );
  // Water surface
  pushColoredGeom(
    waterGeoms,
    new THREE.CylinderGeometry(radius * 0.84, radius * 0.84, 0.12, 8),
    waterHex,
    x,
    gy + 0.54,
    z
  );
  // Central tiered marble water spout
  pushColoredGeom(
    archGeoms,
    new THREE.CylinderGeometry(0.26, 0.42, 1.35, 6),
    0xebe2d0,
    x,
    gy + 0.92,
    z
  );
  pushColoredGeom(
    archGeoms,
    new THREE.CylinderGeometry(0.62, 0.32, 0.26, 8),
    0xdfd4bf,
    x,
    gy + 1.48,
    z
  );
}

function addFireBrazier(
  archGeoms: THREE.BufferGeometry[],
  flameGeoms: THREE.BufferGeometry[],
  x: number,
  gy: number,
  z: number,
  plinthHex = 0x56504b,
  scale = 1.0
): void {
  pushColoredGeom(
    archGeoms,
    new THREE.CylinderGeometry(0.52 * scale, 0.68 * scale, 1.05 * scale, 6),
    plinthHex,
    x,
    gy + 0.52 * scale,
    z
  );
  pushColoredGeom(
    archGeoms,
    new THREE.CylinderGeometry(0.65 * scale, 0.36 * scale, 0.35 * scale, 6),
    0x2c2826,
    x,
    gy + 1.18 * scale,
    z
  );
  pushColoredGeom(
    flameGeoms,
    new THREE.ConeGeometry(0.42 * scale, 0.95 * scale, 5),
    null,
    x,
    gy + 1.78 * scale,
    z
  );
}

function addMedievalShip(
  archGeoms: THREE.BufferGeometry[],
  x: number,
  y: number,
  z: number,
  rotY: number,
  sailHex: number,
  isGalley: boolean
): void {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const hullLen = isGalley ? 7.6 : 6.6;
  const hullW = isGalley ? 2.15 : 2.3;
  // Main timber hull
  pushColoredGeom(
    archGeoms,
    new THREE.BoxGeometry(hullW, 0.95, hullLen),
    0x6e4828,
    x,
    y + 0.45,
    z,
    rotY
  );
  // Tapered prow & raised stern deck
  pushColoredGeom(
    archGeoms,
    new THREE.ConeGeometry(hullW * 0.54, 2.2, 4),
    0x5e3c20,
    x + sin * (hullLen * 0.5 + 0.8),
    y + 0.62,
    z + cos * (hullLen * 0.5 + 0.8),
    rotY + Math.PI / 4,
    Math.PI / 2,
    0
  );
  pushColoredGeom(
    archGeoms,
    new THREE.BoxGeometry(hullW * 0.92, 0.72, 1.85),
    0x7f5532,
    x - sin * (hullLen * 0.35),
    y + 1.24,
    z - cos * (hullLen * 0.35),
    rotY
  );
  // Central tall mast
  pushColoredGeom(
    archGeoms,
    new THREE.CylinderGeometry(0.11, 0.16, 6.2, 5),
    0x563920,
    x,
    y + 3.6,
    z
  );
  // Yardarm + billowing lateen/square sail
  if (isGalley) {
    pushColoredGeom(
      archGeoms,
      new THREE.BoxGeometry(3.8, 0.12, 0.12),
      0x52341d,
      x,
      y + 5.2,
      z,
      rotY
    );
    pushColoredGeom(
      archGeoms,
      new THREE.BoxGeometry(3.5, 2.85, 0.14),
      sailHex,
      x + sin * 0.24,
      y + 3.7,
      z + cos * 0.24,
      rotY,
      0.1,
      0
    );
  } else {
    // Arab dhow angled lateen yard & triangular billowing sail
    pushColoredGeom(
      archGeoms,
      new THREE.BoxGeometry(0.12, 0.12, 5.8),
      0x52341d,
      x,
      y + 4.8,
      z,
      rotY,
      0.42,
      0
    );
    pushColoredGeom(
      archGeoms,
      new THREE.ConeGeometry(2.15, 3.8, 3),
      sailHex,
      x + cos * 0.22,
      y + 3.65,
      z - sin * 0.22,
      rotY,
      0.24,
      0.16
    );
  }
}

function addHarborPier(
  archGeoms: THREE.BufferGeometry[],
  x: number,
  y: number,
  z: number,
  len: number,
  width: number,
  rotY: number
): void {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  // Timber deck
  pushColoredGeom(
    archGeoms,
    new THREE.BoxGeometry(width, 0.28, len),
    0x7c5834,
    x,
    y + 0.58,
    z,
    rotY
  );
  // Pilings along both edges
  const pileCount = Math.max(3, Math.floor(len / 3.2));
  for (let i = 0; i <= pileCount; i++) {
    const along = -len * 0.46 + (i / pileCount) * len * 0.92;
    for (const side of [-1, 1]) {
      const across = side * (width * 0.44);
      const px = x + across * cos + along * sin;
      const pz = z - across * sin + along * cos;
      pushColoredGeom(
        archGeoms,
        new THREE.CylinderGeometry(0.14, 0.17, 1.9, 5),
        0x523820,
        px,
        y - 0.1,
        pz
      );
    }
  }
  // Stacked spice crates & barrels at pier base
  pushColoredGeom(
    archGeoms,
    new THREE.BoxGeometry(0.95, 0.72, 0.95),
    0x9c7244,
    x + sin * (-len * 0.32) + cos * 0.65,
    y + 1.08,
    z + cos * (-len * 0.32) - sin * 0.65,
    rotY + 0.2
  );
  pushColoredGeom(
    archGeoms,
    new THREE.CylinderGeometry(0.32, 0.32, 0.78, 6),
    0x784a28,
    x + sin * (-len * 0.22) - cos * 0.72,
    y + 1.1,
    z + cos * (-len * 0.22) + sin * 0.72
  );
}

// ---------- 16 Bespoke City Monument Builders ----------

function addCityMonument(
  kind: CityMonumentKind,
  plateau: SpawnPlateauEntry,
  pal: PlazaPalette,
  pavingGeoms: THREE.BufferGeometry[],
  archGeoms: THREE.BufferGeometry[],
  waterGeoms: THREE.BufferGeometry[],
  flameGeoms: THREE.BufferGeometry[]
): void {
  const gyAt = (lx: number, lz: number) => getTerrainHeight(plateau.x + lx, plateau.z + lz);

  switch (kind) {
    case 'mirqab_round_imperial': {
      // 1. Towering Spiral Malwiya Minaret overlooking the Great Mosque courtyard
      const mx = 0;
      const mz = -16.5;
      const mgy = gyAt(mx, mz);
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(5.6, 1.4, 5.6), 0xc9ab7c, mx, mgy + 0.7, mz);
      const tiers = 5;
      for (let t = 0; t < tiers; t++) {
        const rBot = 2.45 - t * 0.34;
        const rTop = 2.15 - t * 0.32;
        const h = 1.65;
        const y = mgy + 1.4 + t * 1.55 + h * 0.5;
        pushColoredGeom(
          archGeoms,
          new THREE.CylinderGeometry(rTop, rBot, h, 10),
          t % 2 === 0 ? 0xd9be8f : 0xc6a674,
          mx,
          y,
          mz
        );
        // Spiral ramp ledge accent
        const ang = t * 1.25;
        pushColoredGeom(
          archGeoms,
          new THREE.BoxGeometry(rBot * 1.2, 0.32, 0.52),
          0xb4905c,
          mx + Math.cos(ang) * (rTop + 0.22),
          y + 0.1,
          mz + Math.sin(ang) * (rTop + 0.22),
          -ang
        );
      }
      // Golden Abbasid dome & finial atop the spiral minaret
      pushColoredGeom(archGeoms, new THREE.SphereGeometry(0.86, 8, 6), 0xdca734, mx, mgy + 9.45, mz);
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(0.06, 0.08, 1.15, 5), 0xf0c752, mx, mgy + 10.6, mz);

      // 2. Twin turquoise royal reflecting pools & fountains in the inner palace courtyard
      addFountainPool(archGeoms, waterGeoms, -10.5, gyAt(-10.5, 2.5), 2.5, 2.6, 0xceb388, pal.waterHex);
      addFountainPool(archGeoms, waterGeoms, 10.5, gyAt(10.5, 2.5), 2.5, 2.6, 0xceb388, pal.waterHex);

      // 3. Four grand arched ceremonial portals framing the 4 imperial avenues
      const portals: Array<[number, number, number]> = [
        [0, 22, 0],
        [0, -22, 0],
        [22, 0, Math.PI / 2],
        [-22, 0, Math.PI / 2],
      ];
      for (const [px, pz, rot] of portals) {
        const pgy = gyAt(px, pz);
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.1, 4.2, 1.4), 0xcda977, px - 2.6 * cos, pgy + 2.1, pz + 2.6 * sin, rot);
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.1, 4.2, 1.4), 0xcda977, px + 2.6 * cos, pgy + 2.1, pz - 2.6 * sin, rot);
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(6.6, 1.15, 1.5), 0xdab986, px, pgy + 4.35, pz, rot);
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(6.9, 0.32, 1.65), 0x267480, px, pgy + 5.05, pz, rot);
      }
      // Brazier beacons flanking South Royal Gate
      addFireBrazier(archGeoms, flameGeoms, -3.8, gyAt(-3.8, 49), 49, 0x8e7250, 1.15);
      addFireBrazier(archGeoms, flameGeoms, 3.8, gyAt(3.8, 49), 49, 0x8e7250, 1.15);
      break;
    }

    case 'damascus_umayyad_straight': {
      // 1. Umayyad Treasury Pavilion (Qubbat al-Khazna) on 8 slender columns in the Mosque plaza
      const qx = 3.5;
      const qz = -10.5;
      const qgy = gyAt(qx, qz);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pushColoredGeom(
          archGeoms,
          new THREE.CylinderGeometry(0.14, 0.17, 3.1, 6),
          0xe6decb,
          qx + Math.cos(a) * 1.45,
          qgy + 1.55,
          qz + Math.sin(a) * 1.45
        );
      }
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(1.78, 1.72, 1.55, 8), 0x3b6e68, qx, qgy + 3.85, qz);
      pushColoredGeom(archGeoms, new THREE.SphereGeometry(1.68, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x8c969a, qx, qgy + 4.62, qz);

      // 2. Umayyad Courtyard Marble Fountain
      addFountainPool(archGeoms, waterGeoms, -4.5, gyAt(-4.5, -10.5), -10.5, 2.5, 0xded4c2, pal.waterHex);

      // 3. Triumphal Roman-Damascene Arch on Straight Street (Bab Sharqi approach)
      const ax = 20;
      const az = 2;
      const agy = gyAt(ax, az);
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.2, 4.6, 1.2), 0xd5cbb8, ax, agy + 2.3, az - 3.1);
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.2, 4.6, 1.2), 0xd5cbb8, ax, agy + 2.3, az + 3.1);
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.35, 1.25, 7.6), 0xe2d8c6, ax, agy + 4.85, az);
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.5, 0.38, 7.9), 0x8a7d6c, ax, agy + 5.65, az);
      break;
    }

    case 'aleppo_glacis_citadel': {
      // Massive stepped limestone glacis mound crowning the Aleppo Citadel hill at (8, -4)
      const cx = 8;
      const cz = -4;
      const cgy = gyAt(cx, cz);
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(11.8, 15.8, 1.15, 10), 0xaba192, cx, cgy + 0.45, cz);
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(9.6, 11.9, 0.72, 10), 0xc5bba9, cx, cgy + 1.25, cz);
      // Iconic Multi-Arched Monumental Viaduct Bridge climbing from south (8, 13) up to the Citadel
      for (let step = 0; step < 5; step++) {
        const bz = 13.5 - step * 2.2;
        const bgy = gyAt(cx, bz);
        const h = 1.1 + step * 0.28;
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(3.2, 0.34, 2.25), 0xd2c7b4, cx, bgy + h, bz);
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(0.45, h, 0.65), 0xa89e8e, cx - 1.3, bgy + h * 0.5, bz);
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(0.45, h, 0.65), 0xa89e8e, cx + 1.3, bgy + h * 0.5, bz);
      }
      addFountainPool(archGeoms, waterGeoms, -10, gyAt(-10, 4), 4, 2.2, 0xcac0ae, pal.waterHex);
      break;
    }

    case 'basra_harbor_canals': {
      // Expanded Southern Basra Harbor Water Basin + 3 Timber Piers + 5 Arab Dhows!
      const hgy = gyAt(0, 36);
      pushColoredGeom(waterGeoms, new THREE.BoxGeometry(58, 0.14, 18), pal.waterHex, 0, hgy + 0.06, 37.5);
      // Stone quay sea-wall embankment along z = 28.5
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(60, 0.9, 1.9), 0xb89a6e, 0, hgy + 0.38, 28.5);
      // 3 Timber Harbor Piers jutting into the Shatt al-Arab basin
      addHarborPier(archGeoms, -15, hgy, 35.5, 13, 3.0, 0);
      addHarborPier(archGeoms, 0, hgy, 36.5, 14.5, 3.4, 0);
      addHarborPier(archGeoms, 15, hgy, 35.5, 13, 3.0, 0);
      // 5 Medieval Arab Dhows with billowing lateen sails moored along the piers
      addMedievalShip(archGeoms, -20.5, hgy + 0.1, 36.5, 0.15, 0xf2e8d4, false);
      addMedievalShip(archGeoms, -9.2, hgy + 0.1, 39.2, -0.25, 0xd8a84e, false);
      addMedievalShip(archGeoms, 5.8, hgy + 0.1, 38.5, 0.22, 0xeee4d2, false);
      addMedievalShip(archGeoms, 20.8, hgy + 0.1, 36.8, -0.18, 0xb84232, false);
      addMedievalShip(archGeoms, -1.5, hgy + 0.1, 44.5, 1.42, 0xf2e9d8, false);
      // Harbor Lighthouse Braziers on East & West Quay Heads
      addFireBrazier(archGeoms, flameGeoms, -26, gyAt(-26, 28.5), 28.5, 0x9c7f56, 1.35);
      addFireBrazier(archGeoms, flameGeoms, 26, gyAt(26, 28.5), 28.5, 0x9c7f56, 1.35);
      break;
    }

    case 'jerusalem_sacred_terrace': {
      // Raised Golden-Limestone Sacred Esplanade Terrace on the eastern quarter (x=18, z=0)
      const ex = 18;
      const ez = 0;
      const egy = gyAt(ex, ez);
      pushColoredGeom(pavingGeoms, new THREE.BoxGeometry(19.5, 1.15, 25.5), 0xe6dac2, ex, egy + 0.56, ez);
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(20.1, 0.26, 26.1), 0xd4c5a8, ex, egy + 1.16, ez);
      // Western monumental steps & Qanatir triple-arched colonnade portal
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(2.2, 0.45, 7.4), 0xd8cab0, ex - 10.6, egy + 0.22, ez);
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.3, 0.85, 7.0), 0xe2d5bc, ex - 10.1, egy + 0.44, ez);
      for (const dz of [-3.2, -1.1, 1.1, 3.2]) {
        pushColoredGeom(archGeoms, new THREE.CylinderGeometry(0.18, 0.21, 3.4, 6), 0xede3cf, ex - 9.4, egy + 2.85, ez + dz);
      }
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(0.95, 0.72, 7.4), 0xe8dcc4, ex - 9.4, egy + 4.82, ez);
      // Octagonal Turquoise & Golden-Domed Sacred Shrine centerpiece
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(4.4, 4.5, 2.85, 8), 0x2a6c78, ex, egy + 2.6, ez);
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(4.65, 4.65, 0.45, 8), 0xe6d9be, ex, egy + 4.15, ez);
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(2.65, 2.75, 1.55, 10), 0xdfd0ae, ex, egy + 4.95, ez);
      pushColoredGeom(
        archGeoms,
        new THREE.SphereGeometry(2.65, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62),
        0xe5b232,
        ex,
        egy + 5.75,
        ez
      );
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(0.08, 0.1, 1.35, 5), 0xf6cf55, ex, egy + 8.6, ez);
      break;
    }

    case 'mosul_leaning_minaret': {
      // Iconic Al-Hadba Leaning Minaret (tilted 6.5° gracefully)
      const lx = -2;
      const lz = -11.5;
      const gy = gyAt(lx, lz);
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(3.8, 2.4, 3.8), 0xb89265, lx, gy + 1.2, lz);
      // Leaning cylindrical brick shaft
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(0.98, 1.32, 9.2, 10), 0xcfa97a, lx + 0.52, gy + 6.7, lz, 0, 0, -0.115);
      // Decorative terracotta brick bands
      for (let b = 0; b < 3; b++) {
        pushColoredGeom(
          archGeoms,
          new THREE.CylinderGeometry(1.24 - b * 0.1, 1.26 - b * 0.1, 0.45, 10),
          0x9c7246,
          lx + 0.28 + b * 0.24,
          gy + 4.2 + b * 2.1,
          lz,
          0,
          0,
          -0.115
        );
      }
      pushColoredGeom(archGeoms, new THREE.SphereGeometry(0.85, 8, 6), 0x2c6e78, lx + 1.05, gy + 11.45, lz);
      // Tigris riverfront stone steps along east bank
      for (let s = 0; s < 3; s++) {
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.4, 0.35, 36), 0xb4966e, 26.5 + s * 1.1, gyAt(26.5, 0) - s * 0.15, 0);
      }
      break;
    }

    case 'antioch_mountain_bastion': {
      // Elevated Eastern Acropolis Stone Terrace + Stone Aqueduct Arches
      const ax = 20;
      const az = 0;
      const agy = gyAt(ax, az);
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(9.5, 11.5, 1.3, 8), 0xb0a493, ax, agy + 0.62, az);
      // Roman-era aqueduct arches spanning north-south along the ridge
      for (let i = -2; i <= 2; i++) {
        const qz = i * 5.2;
        const qgy = gyAt(27.5, qz);
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.15, 4.6, 1.15), 0xc2b6a4, 27.5, qgy + 2.3, qz);
      }
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.25, 0.95, 23.5), 0xd4c8b5, 27.5, gyAt(27.5, 0) + 4.9, 0);
      addFireBrazier(archGeoms, flameGeoms, -22, gyAt(-22, 4), 4, 0x7b7267, 1.15);
      addFireBrazier(archGeoms, flameGeoms, -22, gyAt(-22, -4), -4, 0x7b7267, 1.15);
      break;
    }

    case 'kufa_rahba_grid': {
      // Expansive Kufan Rahba Plaza Courtyard with Arched Brick Riwaqs & Marble Fountain
      const rgy = gyAt(0, 6);
      pushColoredGeom(pavingGeoms, new THREE.BoxGeometry(20, 0.14, 14), 0xdcc59e, 0, rgy + 0.05, 6);
      addFountainPool(archGeoms, waterGeoms, 0, rgy, 6, 2.8, 0xd4b686, pal.waterHex);
      // East & West Abbasid brick arcades framing the Rahba
      for (const sideX of [-11, 11]) {
        for (let p = -2; p <= 2; p++) {
          const pz = 6 + p * 3.0;
          pushColoredGeom(archGeoms, new THREE.BoxGeometry(0.85, 3.2, 0.85), 0xc49c6a, sideX, gyAt(sideX, pz) + 1.6, pz);
        }
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.05, 0.72, 13.4), 0xd6b482, sideX, rgy + 3.45, 6);
      }
      break;
    }

    case 'nusaybin_hex_fortress': {
      // Hexagonal military parade dais & twin frontier warning braziers
      const hgy = gyAt(0, 0);
      pushColoredGeom(pavingGeoms, new THREE.CylinderGeometry(11.5, 12.2, 0.22, 6), 0xb8a384, 0, hgy + 0.08, 0);
      addFireBrazier(archGeoms, flameGeoms, -3.5, gyAt(-3.5, 34), 34, 0x6f6458, 1.25);
      addFireBrazier(archGeoms, flameGeoms, 3.5, gyAt(3.5, 34), 34, 0x6f6458, 1.25);
      addFireBrazier(archGeoms, flameGeoms, -3.5, gyAt(-3.5, -34), -34, 0x6f6458, 1.25);
      addFireBrazier(archGeoms, flameGeoms, 3.5, gyAt(3.5, -34), -34, 0x6f6458, 1.25);
      break;
    }

    case 'homs_basalt_citadel': {
      // Dark volcanic black basalt stepped citadel mound at (0, 12) + Ablaq striped northern square
      const cgy = gyAt(0, 12);
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(10.5, 14.2, 1.2, 10), 0x3b3838, 0, cgy + 0.56, 12);
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(8.5, 10.6, 0.7, 10), 0x4f4a48, 0, cgy + 1.42, 12);
      // Black-and-white Ablaq mosaic stripes on the northern plaza
      for (let i = -3; i <= 3; i++) {
        pushColoredGeom(
          pavingGeoms,
          new THREE.BoxGeometry(13.5, 0.11, 1.1),
          i % 2 === 0 ? 0x3e3b3a : 0xe4dccb,
          0,
          gyAt(0, -10 + i * 1.3) + 0.06,
          -10 + i * 1.3
        );
      }
      addFountainPool(archGeoms, waterGeoms, 0, gyAt(0, -10), -10, 2.2, 0x464242, pal.waterHex);
      break;
    }

    case 'raqqa_horseshoe_gate': {
      // Famous Abbasid Terracotta-Brick Baghdad Gate at SE corner (22, 18)
      const gx = 22;
      const gz = 18;
      const gy = gyAt(gx, gz);
      const rot = -Math.PI / 4;
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(9.2, 4.8, 1.85), 0xb8734b, gx, gy + 2.4, gz, rot);
      // Blind arched facade niches & merlons
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(9.6, 0.52, 2.05), 0xc9885e, gx, gy + 5.05, gz, rot);
      for (let i = -3; i <= 3; i++) {
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        pushColoredGeom(
          archGeoms,
          new THREE.BoxGeometry(0.65, 0.65, 0.65),
          0xd49a6e,
          gx + i * 1.25 * cos,
          gy + 5.55,
          gz - i * 1.25 * sin,
          rot
        );
      }
      addFountainPool(archGeoms, waterGeoms, 0, gyAt(0, 0), 0, 2.4, 0xc99668, pal.waterHex);
      break;
    }

    case 'tikrit_cliff_rampart': {
      // Terraced Tigris cliff-edge stone retaining bastions along eastern edge (x=21)
      for (let i = -3; i <= 3; i++) {
        const bz = i * 8.2;
        const bgy = gyAt(21.5, bz);
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(2.8, 1.8, 6.2), 0xb5956c, 21.5, bgy + 0.85, bz);
      }
      addFireBrazier(archGeoms, flameGeoms, 21.5, gyAt(21.5, -18), -18, 0x7d654b, 1.15);
      addFireBrazier(archGeoms, flameGeoms, 21.5, gyAt(21.5, 18), 18, 0x7d654b, 1.15);
      break;
    }

    case 'acre_crusader_port': {
      // Crusader Mediterranean Port Basin + Seawall + 2 Timber Piers + 4 Galleys/Cogs
      const pgy = gyAt(0, 26);
      pushColoredGeom(waterGeoms, new THREE.BoxGeometry(46, 0.14, 16), 0x206882, 0, pgy + 0.06, 29.5);
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(48, 0.95, 2.0), 0xc7bea9, 0, pgy + 0.42, 21.5);
      // Twin Harbor Chain Bastion Towers framing the sea entrance
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(2.1, 2.4, 5.2, 8), 0xd4cab4, -18, pgy + 2.6, 36.5);
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(2.1, 2.4, 5.2, 8), 0xd4cab4, 18, pgy + 2.6, 36.5);
      addFireBrazier(archGeoms, flameGeoms, -18, pgy + 5.2, 36.5, 0x7a7368, 1.1);
      addFireBrazier(archGeoms, flameGeoms, 18, pgy + 5.2, 36.5, 0x7a7368, 1.1);
      // 2 Timber Piers + 4 Crusader Galleys
      addHarborPier(archGeoms, -9.5, pgy, 27.5, 11.5, 3.0, 0);
      addHarborPier(archGeoms, 9.5, pgy, 27.5, 11.5, 3.0, 0);
      addMedievalShip(archGeoms, -14.8, pgy + 0.1, 28.5, 0.12, 0xf2ece0, true);
      addMedievalShip(archGeoms, -3.5, pgy + 0.1, 30.8, -0.18, 0xb8362a, true);
      addMedievalShip(archGeoms, 4.2, pgy + 0.1, 29.2, 0.2, 0xf0e9dc, true);
      addMedievalShip(archGeoms, 15.2, pgy + 0.1, 28.8, -0.15, 0xd4a448, true);
      break;
    }

    case 'marid_oasis_fort': {
      // Golden Sandstone Citadel Mound + Conical Stone Umar Minaret + Desert Oasis Spring Pool
      const cgy = gyAt(0, -4);
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(9.2, 11.8, 1.1, 8), 0xd4b688, 0, cgy + 0.52, -4);
      // Conical Umar Minaret
      const mgy = gyAt(-12, 6);
      pushColoredGeom(archGeoms, new THREE.ConeGeometry(1.55, 7.2, 4), 0xdecaa4, -12, mgy + 3.6, 6, Math.PI / 4);
      // Sparkling Oasis Spring Pool framed by limestone coping
      addFountainPool(archGeoms, waterGeoms, 11, gyAt(11, 10), 10, 4.4, 0xd8c39d, pal.waterHex);
      break;
    }

    case 'palmyra_colonnade_oasis': {
      // Iconic Monumental Triple Triumphal Arch at (0, 0) straddling Palmyra's Great Colonnade!
      const agy = gyAt(0, 0);
      const pillarZ = [-5.2, -2.0, 2.0, 5.2];
      for (const pz of pillarZ) {
        pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.55, 5.4, 1.35), 0xdcc398, 0, agy + 2.7, pz);
      }
      pushColoredGeom(archGeoms, new THREE.BoxGeometry(1.75, 1.45, 12.2), 0xe8d1a8, 0, agy + 5.85, 0);
      pushColoredGeom(archGeoms, new THREE.ConeGeometry(2.6, 1.45, 4), 0xd4b786, 0, agy + 7.2, 0, Math.PI / 4);
      // Sanctuary of Bel Raised Sandstone Peristyle Terrace at (26, 2)
      const bgy = gyAt(26, 2);
      pushColoredGeom(pavingGeoms, new THREE.BoxGeometry(14, 0.9, 14), 0xdec79d, 26, bgy + 0.45, 2);
      for (let i = -2; i <= 2; i++) {
        pushColoredGeom(archGeoms, new THREE.CylinderGeometry(0.24, 0.28, 4.2, 6), 0xe6d2ac, 19.8, bgy + 2.9, 2 + i * 2.8);
        pushColoredGeom(archGeoms, new THREE.CylinderGeometry(0.24, 0.28, 4.2, 6), 0xe6d2ac, 32.2, bgy + 2.9, 2 + i * 2.8);
      }
      // Efqa Desert Oasis Pool
      addFountainPool(archGeoms, waterGeoms, -16, gyAt(-16, 16), 16, 4.2, 0xd4ba8e, pal.waterHex);
      break;
    }

    case 'black_valley_prison': {
      // Grim Obsidian-Dark Judgment Dais + 4 Blazing Iron Braziers + Jagged Obsidian Spires
      const bgy = gyAt(0, 0);
      pushColoredGeom(archGeoms, new THREE.CylinderGeometry(8.5, 10.5, 0.95, 8), 0x2a2626, 0, bgy + 0.46, 0);
      const brazierCoords: Array<[number, number]> = [
        [-7.5, 7.5],
        [7.5, 7.5],
        [-7.5, -7.5],
        [7.5, -7.5],
        [-4.2, 29],
        [4.2, 29],
      ];
      for (const [bx, bz] of brazierCoords) {
        addFireBrazier(archGeoms, flameGeoms, bx, gyAt(bx, bz), bz, 0x2b2626, 1.35);
      }
      // Grim obsidian jagged rock spires around the outer forced-labor quarries
      const spireCoords: Array<[number, number, number]> = [
        [-24, -14, 4.8],
        [25, -12, 5.2],
        [-22, 16, 4.1],
        [23, 18, 4.6],
      ];
      for (const [sx, sz, sh] of spireCoords) {
        pushColoredGeom(archGeoms, new THREE.ConeGeometry(1.75, sh, 5), 0x262324, sx, gyAt(sx, sz) + sh * 0.45, sz, sx * 0.3);
      }
      break;
    }
  }
}

// ---------- Avenue, Canal, Streetscape & Orchard Builders ----------

function buildAvenueGeometry(
  av: CityAvenueSpec,
  plateau: SpawnPlateauEntry,
  pal: PlazaPalette,
  treeKind: BespokeCityBlueprint['treeKind'],
  pavingGeoms: THREE.BufferGeometry[],
  archGeoms: THREE.BufferGeometry[],
  waterGeoms: THREE.BufferGeometry[],
  seedOffset: number
): WalkSegment | null {
  const dx = av.bx - av.ax;
  const dz = av.bz - av.az;
  const len = Math.hypot(dx, dz);
  if (len < 2) return null;

  const ux = dx / len;
  const uz = dz / len;
  const nx = -uz;
  const nz = ux;
  const rotY = Math.atan2(-dz, dx);

  if (av.isCanal) {
    // Sparkling water canal with raised stone quay walls & arched stone footbridges
    const segStep = 4.0;
    const count = Math.max(2, Math.round(len / segStep));
    const pieceLen = len / count;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const lx = av.ax + dx * t;
      const lz = av.az + dz * t;
      const gy = getTerrainHeight(plateau.x + lx, plateau.z + lz);
      if (gy < WATER_LEVEL_Y + 0.1) continue;
      // Water channel
      pushColoredGeom(
        waterGeoms,
        new THREE.BoxGeometry(pieceLen + 0.15, 0.14, av.width),
        pal.waterHex,
        lx,
        gy + 0.04,
        lz,
        rotY
      );
      // Stone quay walls on both banks
      for (const side of [-1, 1]) {
        const bx = lx + nx * side * (av.width * 0.5 + 0.38);
        const bz = lz + nz * side * (av.width * 0.5 + 0.38);
        pushColoredGeom(
          archGeoms,
          new THREE.BoxGeometry(pieceLen + 0.1, 0.46, 0.72),
          pal.cobbleAccent,
          bx,
          gy + 0.22,
          bz,
          rotY
        );
      }
      // Arched stone footbridge across the canal every 4 segments
      if (i > 0 && i < count - 1 && i % 4 === 2) {
        pushColoredGeom(
          archGeoms,
          new THREE.BoxGeometry(2.6, 0.34, av.width + 2.2),
          pal.avenueStone,
          lx,
          gy + 0.68,
          lz,
          rotY
        );
        // Low stone bridge parapets
        pushColoredGeom(
          archGeoms,
          new THREE.BoxGeometry(0.28, 0.55, av.width + 2.0),
          pal.cobbleAccent,
          lx - ux * 1.15,
          gy + 1.02,
          lz - uz * 1.15,
          rotY
        );
        pushColoredGeom(
          archGeoms,
          new THREE.BoxGeometry(0.28, 0.55, av.width + 2.0),
          pal.cobbleAccent,
          lx + ux * 1.15,
          gy + 1.02,
          lz + uz * 1.15,
          rotY
        );
      }
    }
    return null; // Canals are water, not walking lanes
  }

  // Cobblestone road slabs
  const tileStep = 3.8;
  const count = Math.max(2, Math.round(len / tileStep));
  const pieceLen = len / count;

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const lx = av.ax + dx * t;
    const lz = av.az + dz * t;
    const gy = getTerrainHeight(plateau.x + lx, plateau.z + lz);
    if (gy < WATER_LEVEL_Y + 0.25) continue;
    const tint = i % 2 === 0 ? pal.avenueStone : pal.cobbleMain;
    pushColoredGeom(
      pavingGeoms,
      new THREE.BoxGeometry(pieceLen + 0.12, 0.11, av.width),
      tint,
      lx,
      gy + 0.03,
      lz,
      rotY
    );

    // Streetscape details along both sides (skipping immediate intersections near center)
    const distFromCenter = Math.hypot(lx, lz);
    if (distFromCenter < 6.2) continue;

    // 1. Colorful Medieval Souq Canopies & Market Stalls
    if (av.hasSouqCanopies && i % 2 === 0) {
      for (const side of [-1, 1]) {
        const sx = lx + nx * side * (av.width * 0.5 + 1.15);
        const sz = lz + nz * side * (av.width * 0.5 + 1.15);
        const sgy = getTerrainHeight(plateau.x + sx, plateau.z + sz);
        if (sgy < WATER_LEVEL_Y + 0.3) continue;
        const h = hash2D(seedOffset + i * 17 + side * 31, Math.round(sx + sz));
        const awningHex = pal.awningColors[Math.floor(h * pal.awningColors.length) % pal.awningColors.length];
        addSouqStallAndAwning(
          archGeoms,
          sx,
          sgy,
          sz,
          rotY + (side > 0 ? Math.PI : 0),
          awningHex,
          h
        );
      }
    }

    // 2. Classical / Umayyad Stone Colonnade Pillars + Architraves
    if (av.hasColonnade) {
      for (const side of [-1, 1]) {
        const cx = lx + nx * side * (av.width * 0.5 + 0.55);
        const cz = lz + nz * side * (av.width * 0.5 + 0.55);
        const cgy = getTerrainHeight(plateau.x + cx, plateau.z + cz);
        if (cgy < WATER_LEVEL_Y + 0.3) continue;
        pushColoredGeom(
          archGeoms,
          new THREE.CylinderGeometry(0.22, 0.27, 4.1, 6),
          pal.avenueStone,
          cx,
          cgy + 2.05,
          cz
        );
        pushColoredGeom(
          archGeoms,
          new THREE.BoxGeometry(0.68, 0.32, 0.68),
          pal.cobbleMain,
          cx,
          cgy + 4.18,
          cz,
          rotY
        );
        if (i < count - 1) {
          pushColoredGeom(
            archGeoms,
            new THREE.BoxGeometry(pieceLen + 0.2, 0.42, 0.58),
            pal.avenueStone,
            cx + ux * (pieceLen * 0.5),
            cgy + 4.5,
            cz + uz * (pieceLen * 0.5),
            rotY
          );
        }
      }
    }

    // 3. Boulevard Shade Trees
    if (av.hasTrees && !av.hasColonnade && treeKind !== 'barren' && i % 3 === 1) {
      for (const side of [-1, 1]) {
        const tx = lx + nx * side * (av.width * 0.5 + (av.hasSouqCanopies ? 2.8 : 1.45));
        const tz = lz + nz * side * (av.width * 0.5 + (av.hasSouqCanopies ? 2.8 : 1.45));
        const tgy = getTerrainHeight(plateau.x + tx, plateau.z + tz);
        if (tgy < WATER_LEVEL_Y + 0.3) continue;
        const h = hash2D(seedOffset + i * 23, side * 59 + Math.round(tx));
        if (treeKind === 'cypress_olive') {
          addCypressOrOlive(archGeoms, tx, tgy, tz, 0.85 + h * 0.25, h);
        } else {
          addDatePalm(archGeoms, tx, tgy, tz, 0.88 + h * 0.28, h);
        }
      }
    }
  }

  return {
    ax: av.ax,
    az: av.az,
    bx: av.bx,
    bz: av.bz,
    len,
    ux,
    uz,
    nx,
    nz,
    halfWidth: Math.max(1.1, av.width * 0.42),
  };
}

function buildOrchards(
  bp: BespokeCityBlueprint,
  plateau: SpawnPlateauEntry,
  archGeoms: THREE.BufferGeometry[],
  seedBase: number
): void {
  if (bp.treeKind === 'barren') return;
  for (let zIdx = 0; zIdx < bp.orchardZones.length; zIdx++) {
    const zone = bp.orchardZones[zIdx];
    const treeCount = Math.max(4, Math.min(28, Math.round(zone.density)));
    for (let i = 0; i < treeCount; i++) {
      const r1 = hash2D(seedBase + zIdx * 71 + i * 19, i * 37 + 11);
      const r2 = hash2D(i * 53 + zIdx * 29, seedBase - i * 13);
      const ang = r1 * Math.PI * 2;
      const dist = Math.sqrt(r2) * zone.radius;
      const lx = zone.x + Math.cos(ang) * dist;
      const lz = zone.z + Math.sin(ang) * dist;
      const gy = getTerrainHeight(plateau.x + lx, plateau.z + lz);
      if (gy < WATER_LEVEL_Y + 0.35) continue;
      const scale = 0.78 + r1 * 0.45;
      if (bp.treeKind === 'palm') {
        addDatePalm(archGeoms, lx, gy, lz, scale, r2);
      } else if (bp.treeKind === 'cypress_olive') {
        addCypressOrOlive(archGeoms, lx, gy, lz, scale, r2);
      } else {
        if (r1 > 0.45) addDatePalm(archGeoms, lx, gy, lz, scale, r2);
        else addCypressOrOlive(archGeoms, lx, gy, lz, scale * 0.9, r2);
      }
    }
  }
}

// ---------- Main City Builder (16 Bespoke + 24 Regional Towns) ----------

function buildHistoricCityPlaza(
  plateauIndex: number,
  plateau: SpawnPlateauEntry,
  mats: ReturnType<typeof createSharedCityAssets>
): BuiltCityPlaza {
  const group = new THREE.Group();
  const bp = getBespokeCityBlueprintByPlateau(plateauIndex);
  const style = plateau.urbanStyle;
  const basePal = PLAZA_PALETTES[style];
  const pal: PlazaPalette = bp?.customPalette
    ? {
        cobbleMain: bp.customPalette.cobbleMain,
        cobbleAccent: bp.customPalette.cobbleAccent,
        avenueStone: bp.customPalette.avenueStone,
        awningColors: bp.customPalette.awningColors,
        waterHex: bp.customPalette.waterHex ?? basePal.waterHex,
        crowdRobes: basePal.crowdRobes,
      }
    : basePal;

  const pavingGeoms: THREE.BufferGeometry[] = [];
  const archGeoms: THREE.BufferGeometry[] = [];
  const waterGeoms: THREE.BufferGeometry[] = [];
  const flameGeoms: THREE.BufferGeometry[] = [];

  const walkSegments: WalkSegment[] = [];
  const ringPaths: RingPath[] = [];
  const hotspots: CityCrowdHotspot[] = [];

  const seedBase = Math.round(plateau.x * 0.13 + plateau.z * 0.29) + plateauIndex * 101;
  const centerGy = getTerrainHeight(plateau.x, plateau.z);

  let outerR = 22;
  let crowdCount = 55;
  let caravanCount = 3;

  if (bp) {
    outerR = bp.outerRadius;
    crowdCount = bp.crowdCount;
    caravanCount = bp.caravanCount;
    hotspots.push(...bp.hotspots);

    if (centerGy >= WATER_LEVEL_Y + 0.3) {
      // 1. Central Civic Plaza Flagstones
      if (bp.plazaRadius > 0) {
        pushColoredGeom(
          pavingGeoms,
          new THREE.CylinderGeometry(bp.plazaRadius, bp.plazaRadius + 0.45, 0.12, 16),
          pal.cobbleMain,
          0,
          centerGy + 0.03,
          0
        );
        pushColoredGeom(
          pavingGeoms,
          new THREE.RingGeometry(bp.plazaRadius + 0.2, bp.plazaRadius + 1.05, 20).rotateX(-Math.PI / 2),
          pal.cobbleAccent,
          0,
          centerGy + 0.095,
          0
        );
      }

      // 2. Bespoke Avenues, Souqs, Colonnades & Water Canals
      for (let i = 0; i < bp.avenues.length; i++) {
        const seg = buildAvenueGeometry(
          bp.avenues[i],
          plateau,
          pal,
          bp.treeKind,
          pavingGeoms,
          archGeoms,
          waterGeoms,
          seedBase + i * 97
        );
        if (seg) walkSegments.push(seg);
      }

      // 3. Bespoke Ring Roads & Arcs
      for (const ring of bp.ringRoads) {
        const arcStart = ring.arcStart ?? 0;
        const arcEnd = ring.arcEnd ?? Math.PI * 2;
        const span = Math.abs(arcEnd - arcStart);
        const isFullCircle = span >= Math.PI * 1.98;
        const circumference = ring.radius * span;
        const segCount = Math.max(8, Math.round(circumference / 3.9));
        for (let i = 0; i < segCount; i++) {
          const a = arcStart + ((i + 0.5) / segCount) * (arcEnd - arcStart);
          const lx = Math.cos(a) * ring.radius;
          const lz = Math.sin(a) * ring.radius;
          const gy = getTerrainHeight(plateau.x + lx, plateau.z + lz);
          if (gy < WATER_LEVEL_Y + 0.25) continue;
          pushColoredGeom(
            pavingGeoms,
            new THREE.BoxGeometry(ring.width, 0.1, (circumference / segCount) + 0.28),
            i % 2 === 0 ? pal.cobbleMain : pal.cobbleAccent,
            lx,
            gy + 0.024,
            lz,
            -a
          );
        }
        ringPaths.push({
          radius: ring.radius,
          width: ring.width,
          arcStart,
          arcEnd,
          isFullCircle,
        });
      }

      // 4. Unique Hand-Crafted City Monument(s)
      addCityMonument(
        bp.monumentKind,
        plateau,
        pal,
        pavingGeoms,
        archGeoms,
        waterGeoms,
        flameGeoms
      );

      // 5. Lush Suburban Orchards & Palm/Olive Groves
      buildOrchards(bp, plateau, archGeoms, seedBase);
    }
  } else {
    // Non-AI Historic Regional Town (lively oasis/market town with awnings, fountain, trees & bustling locals)
    const pop = plateau.populationEst;
    outerR = pop >= 14000 ? 28 : pop >= 9000 ? 24 : 20;
    crowdCount = pop >= 14000 ? 95 : pop >= 9000 ? 72 : 52;
    caravanCount = pop >= 10000 ? 4 : 2;

    if (centerGy >= WATER_LEVEL_Y + 0.3) {
      if (style !== 'bedouin_nomadic') {
        pushColoredGeom(
          pavingGeoms,
          new THREE.CylinderGeometry(8.2, 8.6, 0.12, 12),
          pal.cobbleMain,
          0,
          centerGy + 0.03,
          0
        );
        addFountainPool(archGeoms, waterGeoms, 0, centerGy, 0, 2.0, pal.avenueStone, pal.waterHex);
      } else {
        addFountainPool(archGeoms, waterGeoms, 6, getTerrainHeight(plateau.x + 6, plateau.z + 4), 4, 2.8, pal.cobbleMain, pal.waterHex);
      }

      const defaultAvenues: CityAvenueSpec[] = [
        { ax: -outerR, az: 0, bx: outerR, bz: 0, width: 3.4, hasSouqCanopies: true, hasTrees: true },
        { ax: 0, az: -outerR, bx: 0, bz: outerR, width: 3.4, hasTrees: true },
      ];
      const regionalTreeKind: BespokeCityBlueprint['treeKind'] =
        style === 'levantine_shami' ? 'cypress_olive' : 'palm';

      for (let i = 0; i < defaultAvenues.length; i++) {
        const seg = buildAvenueGeometry(
          defaultAvenues[i],
          plateau,
          pal,
          regionalTreeKind,
          pavingGeoms,
          archGeoms,
          waterGeoms,
          seedBase + i * 73
        );
        if (seg) walkSegments.push(seg);
      }

      // Ring road around center
      const ringR = Math.min(14.5, outerR * 0.62);
      const ringSegs = 16;
      for (let i = 0; i < ringSegs; i++) {
        const a = (i / ringSegs) * Math.PI * 2;
        const lx = Math.cos(a) * ringR;
        const lz = Math.sin(a) * ringR;
        const gy = getTerrainHeight(plateau.x + lx, plateau.z + lz);
        if (gy < WATER_LEVEL_Y + 0.25) continue;
        pushColoredGeom(
          pavingGeoms,
          new THREE.BoxGeometry(2.4, 0.09, 3.8),
          i % 2 === 0 ? pal.cobbleMain : pal.cobbleAccent,
          lx,
          gy + 0.02,
          lz,
          -a
        );
      }
      ringPaths.push({ radius: ringR, width: 2.4, arcStart: 0, arcEnd: Math.PI * 2, isFullCircle: true });
      hotspots.push(
        { x: 0, z: 0, radius: 7.5, weight: 2, kind: 'plaza' },
        { x: 10, z: 0, radius: 5.5, weight: 2, kind: 'souq' },
        { x: -10, z: 0, radius: 5.5, weight: 2, kind: 'souq' }
      );
    }
  }

  // Merge static layers into minimal draw calls
  const mergedPaving = mergeAndDispose(pavingGeoms);
  if (mergedPaving) {
    const mesh = new THREE.Mesh(mergedPaving, mats.pavingMat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const mergedArch = mergeAndDispose(archGeoms);
  if (mergedArch) {
    const mesh = new THREE.Mesh(mergedArch, mats.archMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const mergedWater = mergeAndDispose(waterGeoms);
  if (mergedWater) {
    const mesh = new THREE.Mesh(mergedWater, mats.waterMat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const mergedFlame = mergeAndDispose(flameGeoms);
  if (mergedFlame) {
    const mesh = new THREE.Mesh(mergedFlame, mats.flameMat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  // ---------- Populate Living Instanced Citizens ----------
  const agents: CrowdAgent[] = [];
  let crowdMesh: THREE.InstancedMesh | null = null;
  if (crowdCount > 0 && (walkSegments.length > 0 || ringPaths.length > 0 || hotspots.length > 0)) {
    crowdMesh = new THREE.InstancedMesh(mats.crowdGeom, mats.crowdMat, crowdCount);
    crowdMesh.castShadow = false;
    crowdMesh.receiveShadow = false;
    crowdMesh.frustumCulled = false;

    const totalHotspotWeight = hotspots.reduce((acc, h) => acc + Math.max(0.5, h.weight), 0);
    const pickHotspot = (r: number): CityCrowdHotspot => {
      let acc = 0;
      const target = r * totalHotspotWeight;
      for (let i = 0; i < hotspots.length; i++) {
        acc += Math.max(0.5, hotspots[i].weight);
        if (target <= acc) return hotspots[i];
      }
      return hotspots[hotspots.length - 1];
    };

    for (let i = 0; i < crowdCount; i++) {
      const r1 = hash2D(seedBase + i * 13, i * 29 + 7);
      const r2 = hash2D(i * 41 - 11, seedBase + i * 19);
      const r3 = hash2D(i * 7 + 53, seedBase - i * 31);
      const r4 = hash2D(seedBase - i * 17, i * 61 + 3);

      let mode: CrowdAgent['mode'] = 'segment';
      if (hotspots.length > 0 && r4 > 0.56) {
        mode = 'hotspot';
      } else if (ringPaths.length > 0 && r4 > 0.38 && r4 <= 0.56) {
        mode = 'ring';
      } else if (walkSegments.length === 0) {
        mode = ringPaths.length > 0 ? 'ring' : 'hotspot';
      }

      if (mode === 'segment') {
        const segIdx = i % walkSegments.length;
        const seg = walkSegments[segIdx];
        agents.push({
          mode: 'segment',
          segIdx,
          ringIdx: 0,
          spotX: 0,
          spotZ: 0,
          spotRadius: 0,
          laneOffset: (r1 - 0.5) * 2 * seg.halfWidth,
          t: r3,
          radialRatio: 0,
          speed: (1.25 + r2 * 1.45) / Math.max(6, seg.len),
          dir: r1 > 0.5 ? 1 : -1,
          phase: r3 * Math.PI * 2,
          scale: 0.84 + r2 * 0.28,
        });
      } else if (mode === 'ring') {
        const ringIdx = i % ringPaths.length;
        const ring = ringPaths[ringIdx];
        const t = ring.arcStart + r3 * (ring.arcEnd - ring.arcStart);
        agents.push({
          mode: 'ring',
          segIdx: 0,
          ringIdx,
          spotX: 0,
          spotZ: 0,
          spotRadius: 0,
          laneOffset: (r1 - 0.5) * Math.max(1.2, ring.width * 0.85),
          t,
          radialRatio: 0,
          speed: (1.2 + r2 * 1.1) / Math.max(6, ring.radius),
          dir: r1 > 0.5 ? 1 : -1,
          phase: r2 * Math.PI * 2,
          scale: 0.84 + r1 * 0.28,
        });
      } else {
        const spot = pickHotspot(r1);
        agents.push({
          mode: 'hotspot',
          segIdx: 0,
          ringIdx: 0,
          spotX: spot.x,
          spotZ: spot.z,
          spotRadius: spot.radius,
          laneOffset: (r2 - 0.5) * 1.2,
          t: r3 * Math.PI * 2,
          radialRatio: 0.24 + Math.sqrt(r2) * 0.76,
          speed: 0.22 + r1 * 0.35,
          dir: r2 > 0.5 ? 1 : -1,
          phase: r3 * Math.PI * 2,
          scale: 0.82 + r4 * 0.28,
        });
      }

      const robeHex = pal.crowdRobes[i % pal.crowdRobes.length];
      _tmpColor.setHex(robeHex);
      crowdMesh.setColorAt(i, _tmpColor);
    }

    if (crowdMesh.instanceColor) {
      crowdMesh.instanceColor.needsUpdate = true;
    }
    group.add(crowdMesh);
  }

  // ---------- Populate Living Instanced Merchant Caravans ----------
  const caravans: CaravanAgent[] = [];
  let caravanMesh: THREE.InstancedMesh | null = null;
  if (caravanCount > 0 && walkSegments.length > 0) {
    // Prefer the longest main trade avenues for pack-camel caravans
    const sortedSegIndices = walkSegments
      .map((s, idx) => ({ idx, len: s.len }))
      .sort((a, b) => b.len - a.len)
      .slice(0, Math.min(4, walkSegments.length))
      .map((x) => x.idx);

    caravanMesh = new THREE.InstancedMesh(mats.caravanGeom, mats.caravanMat, caravanCount);
    caravanMesh.castShadow = false;
    caravanMesh.receiveShadow = false;
    caravanMesh.frustumCulled = false;

    for (let c = 0; c < caravanCount; c++) {
      const segIdx = sortedSegIndices[c % sortedSegIndices.length];
      const seg = walkSegments[segIdx];
      const r1 = hash2D(seedBase + c * 31, c * 47 + 9);
      const r2 = hash2D(c * 23 + 17, seedBase - c * 19);
      caravans.push({
        segIdx,
        t: r1,
        laneOffset: (r2 > 0.5 ? 1 : -1) * Math.min(1.1, seg.halfWidth * 0.45),
        speed: (1.55 + r2 * 0.7) / Math.max(12, seg.len),
        dir: r2 > 0.5 ? 1 : -1,
        phase: r1 * Math.PI * 2,
        scale: 0.92 + r1 * 0.16,
      });

      _tmpColor.setHex(CARAVAN_TINTS[c % CARAVAN_TINTS.length]);
      caravanMesh.setColorAt(c, _tmpColor);
    }
    if (caravanMesh.instanceColor) {
      caravanMesh.instanceColor.needsUpdate = true;
    }
    group.add(caravanMesh);
  }

  group.visible = false;

  return {
    plateau,
    group,
    crowdMesh,
    caravanMesh,
    agents,
    caravans,
    walkSegments,
    ringPaths,
    outerR,
    isVisible: false,
  };
}

export function createHistoricCityQuartersSystem(
  root: THREE.Group
): HistoricCityQuartersSystem {
  const mats = createSharedCityAssets();
  const builtCities = new Map<number, BuiltCityPlaza>();
  const dummy = new THREE.Object3D();
  let animClock = 0;

  const update = (
    delta: number,
    centerWorldX: number,
    centerWorldZ: number,
    originX: number,
    originZ: number,
    isPerspective3D: boolean,
    cameraZoom: number
  ) => {
    animClock += delta;
    const loadRadius = isPerspective3D ? 1750 : 1250;
    const hideRadius = isPerspective3D ? 2150 : 1550;
    const showCrowd = cameraZoom < 165;

    let builtThisFrame = 0;

    for (let i = 0; i < SPAWN_PLATEAUS.length; i++) {
      const plateau = SPAWN_PLATEAUS[i];
      const dist = Math.hypot(plateau.x - centerWorldX, plateau.z - centerWorldZ);
      let entry = builtCities.get(i);

      if (!entry) {
        if (dist < loadRadius && builtThisFrame < 1) {
          entry = buildHistoricCityPlaza(i, plateau, mats);
          root.add(entry.group);
          builtCities.set(i, entry);
          builtThisFrame += 1;
        } else {
          continue;
        }
      }

      if (dist > hideRadius) {
        if (entry.isVisible) {
          entry.isVisible = false;
          entry.group.visible = false;
        }
        continue;
      }

      if (!entry.isVisible) {
        entry.isVisible = true;
        entry.group.visible = true;
      }

      entry.group.position.set(plateau.x - originX, 0, plateau.z - originZ);

      const shouldAnimateLife = showCrowd && dist < 390;

      // Update dense animated citizen crowds
      if (entry.crowdMesh) {
        entry.crowdMesh.visible = shouldAnimateLife;
        if (shouldAnimateLife) {
          const agents = entry.agents;
          const segs = entry.walkSegments;
          const rings = entry.ringPaths;

          for (let a = 0; a < agents.length; a++) {
            const ag = agents[a];
            let lx = 0;
            let lz = 0;
            let rotY = 0;

            if (ag.mode === 'segment') {
              const seg = segs[ag.segIdx];
              ag.t += ag.speed * ag.dir * delta;
              if (ag.t > 1) {
                ag.t = 1;
                ag.dir = -1;
              } else if (ag.t < 0) {
                ag.t = 0;
                ag.dir = 1;
              }
              lx = seg.ax + (seg.bx - seg.ax) * ag.t + seg.nx * ag.laneOffset;
              lz = seg.az + (seg.bz - seg.az) * ag.t + seg.nz * ag.laneOffset;
              rotY = Math.atan2(seg.ux * ag.dir, seg.uz * ag.dir);
            } else if (ag.mode === 'ring') {
              const ring = rings[ag.ringIdx];
              ag.t += ag.speed * ag.dir * delta;
              if (ring.isFullCircle) {
                if (ag.t > Math.PI * 2) ag.t -= Math.PI * 2;
                if (ag.t < 0) ag.t += Math.PI * 2;
              } else {
                const lo = Math.min(ring.arcStart, ring.arcEnd);
                const hi = Math.max(ring.arcStart, ring.arcEnd);
                if (ag.t > hi) {
                  ag.t = hi;
                  ag.dir = -1;
                } else if (ag.t < lo) {
                  ag.t = lo;
                  ag.dir = 1;
                }
              }
              const rad = ring.radius + ag.laneOffset;
              lx = Math.cos(ag.t) * rad;
              lz = Math.sin(ag.t) * rad;
              rotY = -ag.t + (ag.dir > 0 ? 0 : Math.PI);
            } else {
              // Bustling souq / mosque / harbor / gate crowd circulation
              ag.t += ag.speed * ag.dir * delta;
              const rad =
                ag.spotRadius *
                ag.radialRatio *
                (0.84 + 0.16 * Math.sin(animClock * 0.7 + ag.phase));
              lx = ag.spotX + Math.cos(ag.t) * rad;
              lz = ag.spotZ + Math.sin(ag.t) * rad;
              rotY = -ag.t + (ag.dir > 0 ? 0 : Math.PI);
            }

            const gy = getTerrainHeight(plateau.x + lx, plateau.z + lz);
            const bob = Math.abs(Math.sin(animClock * 7.8 + ag.phase)) * 0.085;
            dummy.position.set(lx, gy + bob, lz);
            dummy.rotation.set(0, rotY, 0);
            dummy.scale.set(ag.scale, ag.scale, ag.scale);
            dummy.updateMatrix();
            entry.crowdMesh.setMatrixAt(a, dummy.matrix);
          }
          entry.crowdMesh.instanceMatrix.needsUpdate = true;
        }
      }

      // Update animated pack-camel trade caravans
      if (entry.caravanMesh) {
        entry.caravanMesh.visible = shouldAnimateLife;
        if (shouldAnimateLife) {
          const caravans = entry.caravans;
          const segs = entry.walkSegments;
          for (let c = 0; c < caravans.length; c++) {
            const cv = caravans[c];
            const seg = segs[cv.segIdx];
            cv.t += cv.speed * cv.dir * delta;
            if (cv.t > 1) {
              cv.t = 1;
              cv.dir = -1;
            } else if (cv.t < 0) {
              cv.t = 0;
              cv.dir = 1;
            }
            const lx = seg.ax + (seg.bx - seg.ax) * cv.t + seg.nx * cv.laneOffset;
            const lz = seg.az + (seg.bz - seg.az) * cv.t + seg.nz * cv.laneOffset;
            const rotY = Math.atan2(seg.ux * cv.dir, seg.uz * cv.dir);
            const gy = getTerrainHeight(plateau.x + lx, plateau.z + lz);
            const gaitBob = Math.abs(Math.sin(animClock * 4.4 + cv.phase)) * 0.07;
            const gaitSway = Math.sin(animClock * 4.4 + cv.phase) * 0.045;
            dummy.position.set(lx, gy + gaitBob, lz);
            dummy.rotation.set(0, rotY, gaitSway);
            dummy.scale.set(cv.scale, cv.scale, cv.scale);
            dummy.updateMatrix();
            entry.caravanMesh.setMatrixAt(c, dummy.matrix);
          }
          entry.caravanMesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  };

  const dispose = () => {
    for (const entry of builtCities.values()) {
      entry.group.traverse((child) => {
        if (
          (child as THREE.Mesh).geometry &&
          child !== entry.crowdMesh &&
          child !== entry.caravanMesh
        ) {
          (child as THREE.Mesh).geometry.dispose();
        }
      });
      root.remove(entry.group);
    }
    builtCities.clear();
    mats.dispose();
  };

  return { update, dispose };
}
