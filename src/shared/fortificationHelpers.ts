import { BlockoutStructure, StructureKind } from './protocol';
import { evaluateFortificationTerrain, isBuildableTerrain } from './worldMap';

export const BUILD_GRID_CELL_SIZE = 2;

export type PlacementCellState =
  | 'valid'
  | 'bonus_high'
  | 'bonus_water'
  | 'replace_wall'
  | 'blocked_terrain'
  | 'blocked_overlap';

export interface PlacementEvaluation {
  ok: boolean;
  state: PlacementCellState;
  reasonAr?: string;
}

export interface FortPlacementItem {
  kind: StructureKind;
  x: number;
  z: number;
  rotationY: number;
  replaceWallId?: string;
}

export interface FortSnapResult {
  x: number;
  z: number;
  rotationY: number;
  snapped: boolean;
  replaceWallId?: string;
  snapTarget?: { x: number; z: number };
}

export function isLineBuildableFort(kind: StructureKind | null | undefined): boolean {
  return kind === 'stone_wall' || kind === 'moat_trench';
}

export function isSnappableFort(kind: StructureKind | null | undefined): boolean {
  return (
    kind === 'stone_wall' ||
    kind === 'gatehouse' ||
    kind === 'watchtower' ||
    kind === 'moat_trench'
  );
}

export function getFortSegmentSpacing(kind: StructureKind): number {
  if (kind === 'gatehouse') return 4.6;
  if (kind === 'watchtower') return 3.6;
  if (kind === 'moat_trench') return 4.2;
  return 4.2; // stone_wall
}

/**
 * Exact 1:1 parity with server.ts structure placement collision radii.
 */
export function getStructureCollisionDistance(
  kind: StructureKind,
  existingKind: StructureKind
): number {
  if (
    (kind === 'stone_wall' || kind === 'moat_trench') &&
    (existingKind === 'stone_wall' || existingKind === 'moat_trench')
  ) {
    return kind !== existingKind ? 2.15 : 2.55;
  }
  if (
    (kind === 'watchtower' && (existingKind === 'stone_wall' || existingKind === 'gatehouse')) ||
    (existingKind === 'watchtower' && (kind === 'stone_wall' || kind === 'gatehouse'))
  ) {
    return 2.55;
  }
  if (isSnappableFort(kind) && isSnappableFort(existingKind)) {
    return 2.85;
  }
  if (
    kind === 'house' ||
    kind === 'bedouin_tent' ||
    kind === 'war_tent' ||
    kind === 'stone_wall' ||
    kind === 'moat_trench' ||
    kind === 'watchtower'
  ) {
    return 3.2;
  }
  return 4.2;
}

/**
 * Evaluates whether a building of `kind` can be placed at world (x, z), matching server rules
 * for both terrain buildability and existing structure overlap collisions.
 */
export function evaluateBuildingPlacementAt(
  kind: StructureKind,
  x: number,
  z: number,
  structures: readonly BlockoutStructure[],
  replaceWallId?: string,
  includeTacticalBonus = true
): PlacementEvaluation {
  const terrainCheck = isBuildableTerrain(x, z);
  if (!terrainCheck.ok) {
    return {
      ok: false,
      state: 'blocked_terrain',
      reasonAr: terrainCheck.reasonAr ?? 'التضاريس غير صالحة للبناء هنا',
    };
  }

  for (let i = 0; i < structures.length; i++) {
    const s = structures[i];
    if (s.hp <= 0) continue;
    if (replaceWallId && s.id === replaceWallId) continue;
    const reqDist = getStructureCollisionDistance(kind, s.kind);
    const dx = s.x - x;
    const dz = s.z - z;
    if (dx * dx + dz * dz < reqDist * reqDist) {
      return {
        ok: false,
        state: 'blocked_overlap',
        reasonAr: 'الموقع متداخل مع مبنى آخر على الشبكة',
      };
    }
  }

  if (replaceWallId) {
    return {
      ok: true,
      state: 'replace_wall',
      reasonAr: 'تحويل السور الحجري إلى بوابة',
    };
  }

  if (includeTacticalBonus) {
    const isFortKind =
      kind === 'stone_wall' ||
      kind === 'gatehouse' ||
      kind === 'moat_trench' ||
      kind === 'watchtower' ||
      kind === 'keep';
    if (isFortKind) {
      const fortReport = evaluateFortificationTerrain(x, z);
      if (kind === 'moat_trench' && fortReport.isWaterFedMoat) {
        return {
          ok: true,
          state: 'bonus_water',
          reasonAr: 'خندق مائي طبيعي مغذّى بالنهر',
        };
      }
      if (fortReport.isHighGround) {
        return {
          ok: true,
          state: 'bonus_high',
          reasonAr: fortReport.labelAr || 'موقع مرتفع بأفضلية دفاعية',
        };
      }
    }
  }

  return { ok: true, state: 'valid' };
}

/**
 * Magnetically snaps a fortification segment end-to-end against nearby friendly walls/gates/watchtowers/moats,
 * or snaps a gatehouse directly onto a friendly stone_wall for seamless wall-to-gate conversion.
 */
export function computeFortificationSnap(
  kind: StructureKind,
  rawX: number,
  rawZ: number,
  manualRotationY: number,
  structures: Record<string, BlockoutStructure>,
  playerId: string | null
): FortSnapResult {
  const defaultX = Math.round(rawX / BUILD_GRID_CELL_SIZE) * BUILD_GRID_CELL_SIZE;
  const defaultZ = Math.round(rawZ / BUILD_GRID_CELL_SIZE) * BUILD_GRID_CELL_SIZE;
  if (!playerId || !isSnappableFort(kind)) {
    return { x: defaultX, z: defaultZ, rotationY: manualRotationY, snapped: false };
  }

  // 1. Seamless Gatehouse-on-Wall conversion: aiming a gatehouse onto an existing friendly stone_wall
  if (kind === 'gatehouse') {
    let bestWall: BlockoutStructure | null = null;
    let bestWallDist = 3.2;
    for (const s of Object.values(structures)) {
      if (s.ownerId !== playerId || s.kind !== 'stone_wall' || s.hp <= 0) continue;
      const d = Math.hypot(s.x - rawX, s.z - rawZ);
      if (d < bestWallDist) {
        bestWallDist = d;
        bestWall = s;
      }
    }
    if (bestWall) {
      return {
        x: bestWall.x,
        z: bestWall.z,
        rotationY: bestWall.rotationY,
        snapped: true,
        replaceWallId: bestWall.id,
        snapTarget: { x: bestWall.x, z: bestWall.z },
      };
    }
  }

  // 2. Magnetic end-to-end / corner snap to nearest friendly fortification segment (including watchtowers!)
  const step = getFortSegmentSpacing(kind);
  let bestCandidate: {
    x: number;
    z: number;
    rotationY: number;
    dist: number;
    anchorX: number;
    anchorZ: number;
  } | null = null;

  for (const s of Object.values(structures)) {
    if (s.ownerId !== playerId || s.hp <= 0) continue;
    if (!isSnappableFort(s.kind)) continue;
    // Moats snap primarily to moats; walls, gatehouses & watchtowers interlock together
    if (kind === 'moat_trench' && s.kind !== 'moat_trench') continue;
    if (kind !== 'moat_trench' && s.kind === 'moat_trench') continue;

    const centerDist = Math.hypot(s.x - rawX, s.z - rawZ);
    if (centerDist > 7.6) continue;

    const neighborStep =
      s.kind === 'gatehouse' || kind === 'gatehouse'
        ? 4.6
        : s.kind === 'watchtower' || kind === 'watchtower'
          ? 3.6
          : step;
    const cosR = Math.cos(s.rotationY);
    const sinR = Math.sin(s.rotationY);
    // In proceduralBlockout, stone_wall/gatehouse/moat_trench length runs along local X axis.
    // Rotated around Y by rotY: local (+1, 0, 0) maps to world (cosR, 0, -sinR).
    const candidates = [
      { x: s.x + cosR * neighborStep, z: s.z - sinR * neighborStep, rotationY: s.rotationY },
      { x: s.x - cosR * neighborStep, z: s.z + sinR * neighborStep, rotationY: s.rotationY },
      // 90-degree corner extensions
      {
        x: s.x + sinR * neighborStep,
        z: s.z + cosR * neighborStep,
        rotationY: (s.rotationY + Math.PI / 2) % (Math.PI * 2),
      },
      {
        x: s.x - sinR * neighborStep,
        z: s.z - cosR * neighborStep,
        rotationY: (s.rotationY + Math.PI / 2) % (Math.PI * 2),
      },
    ];

    for (const cand of candidates) {
      const d = Math.hypot(cand.x - rawX, cand.z - rawZ);
      if (d < 3.0 && (!bestCandidate || d < bestCandidate.dist)) {
        let occupied = false;
        for (const other of Object.values(structures)) {
          if (other.hp <= 0) continue;
          const reqDist = getStructureCollisionDistance(kind, other.kind);
          if (Math.hypot(other.x - cand.x, other.z - cand.z) < Math.min(2.65, reqDist)) {
            occupied = true;
            break;
          }
        }
        if (!occupied) {
          bestCandidate = { ...cand, dist: d, anchorX: s.x, anchorZ: s.z };
        }
      }
    }
  }

  if (bestCandidate) {
    return {
      x: Math.round(bestCandidate.x * 10) / 10,
      z: Math.round(bestCandidate.z * 10) / 10,
      rotationY: bestCandidate.rotationY,
      snapped: true,
      snapTarget: { x: bestCandidate.anchorX, z: bestCandidate.anchorZ },
    };
  }

  return { x: defaultX, z: defaultZ, rotationY: manualRotationY, snapped: false };
}

/**
 * Generates an aligned line of wall or moat segments between two world coordinates.
 * When `includeCornerTowers` is true on a stone_wall line (>= 3 segments),
 * places watchtower bastions at both ends (and every 5th slot on long curtain lines).
 */
export function computeFortificationLineSegments(
  kind: StructureKind,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  fallbackRotationY: number,
  structures: Record<string, BlockoutStructure>,
  maxSegments = 18,
  includeCornerTowers = false
): Array<FortPlacementItem & { valid: boolean }> {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const totalDist = Math.hypot(dx, dz);
  const spacing = getFortSegmentSpacing(kind);

  const checkValid = (segKind: StructureKind, px: number, pz: number): boolean => {
    if (!isBuildableTerrain(px, pz).ok) return false;
    for (const s of Object.values(structures)) {
      if (s.hp <= 0) continue;
      const req = getStructureCollisionDistance(segKind, s.kind);
      if (Math.hypot(s.x - px, s.z - pz) < req) return false;
    }
    return true;
  };

  if (totalDist < spacing * 0.65) {
    const px = Math.round(startX * 10) / 10;
    const pz = Math.round(startZ * 10) / 10;
    return [
      {
        kind,
        x: px,
        z: pz,
        rotationY: fallbackRotationY,
        valid: checkValid(kind, px, pz),
      },
    ];
  }

  // Local +X rotated by rotY points along (cos(rotY), -sin(rotY))
  const rawAngle = Math.atan2(-dz, dx);
  // Gently snap angle to nearest 15° increment for crisp castle geometry
  const snapStep = Math.PI / 12;
  const rotY = Math.round(rawAngle / snapStep) * snapStep;
  const dirX = Math.cos(rotY);
  const dirZ = -Math.sin(rotY);

  const count = Math.max(1, Math.min(maxSegments, Math.floor(totalDist / spacing) + 1));
  const useTowers = includeCornerTowers && kind === 'stone_wall' && count >= 3;
  const result: Array<FortPlacementItem & { valid: boolean }> = [];

  for (let i = 0; i < count; i++) {
    const isBastionSlot =
      useTowers && (i === 0 || i === count - 1 || (count >= 7 && i % 5 === 0 && i < count - 2));
    const segKind: StructureKind = isBastionSlot ? 'watchtower' : kind;
    const px = Math.round((startX + dirX * spacing * i) * 10) / 10;
    const pz = Math.round((startZ + dirZ * spacing * i) * 10) / 10;
    result.push({
      kind: segKind,
      x: px,
      z: pz,
      rotationY: rotY,
      valid: checkValid(segKind, px, pz),
    });
  }

  return result;
}

/**
 * Generates a fortified medieval castle ring around the Keep:
 * 4 corner Watchtower bastions + interlocking Stone Wall curtains + central South Gatehouse.
 */
export function computeKeepFortressRing(
  keepX: number,
  keepZ: number,
  structures: Record<string, BlockoutStructure>,
  halfExtent = 16.8
): FortPlacementItem[] {
  const step = 4.2;
  const items: FortPlacementItem[] = [];
  const halfCount = Math.round(halfExtent / step); // 4 -> 9 slots per side

  const canPlace = (kind: StructureKind, px: number, pz: number): boolean => {
    if (!isBuildableTerrain(px, pz).ok) return false;
    for (const s of Object.values(structures)) {
      if (s.hp <= 0) continue;
      const req = getStructureCollisionDistance(kind, s.kind);
      if (Math.hypot(s.x - px, s.z - pz) < req) return false;
    }
    return true;
  };

  // South side (+Z): corner watchtowers at ends, central gatehouse, stone walls between
  for (let i = -halfCount; i <= halfCount; i++) {
    const kind: StructureKind =
      Math.abs(i) === halfCount ? 'watchtower' : i === 0 ? 'gatehouse' : 'stone_wall';
    const px = Math.round((keepX + i * step) * 10) / 10;
    const pz = Math.round((keepZ + halfCount * step) * 10) / 10;
    if (canPlace(kind, px, pz)) {
      items.push({ kind, x: px, z: pz, rotationY: 0 });
    }
  }

  // North side (-Z): corner watchtowers at ends, solid stone wall between
  for (let i = -halfCount; i <= halfCount; i++) {
    const kind: StructureKind = Math.abs(i) === halfCount ? 'watchtower' : 'stone_wall';
    const px = Math.round((keepX + i * step) * 10) / 10;
    const pz = Math.round((keepZ - halfCount * step) * 10) / 10;
    if (canPlace(kind, px, pz)) {
      items.push({ kind, x: px, z: pz, rotationY: 0 });
    }
  }

  // East (+X) and West (-X) sides: stone walls rotated 90° linking the corner watchtowers
  for (let i = -(halfCount - 1); i <= halfCount - 1; i++) {
    const pxEast = Math.round((keepX + halfCount * step) * 10) / 10;
    const pzBoth = Math.round((keepZ + i * step) * 10) / 10;
    if (canPlace('stone_wall', pxEast, pzBoth)) {
      items.push({ kind: 'stone_wall', x: pxEast, z: pzBoth, rotationY: Math.PI / 2 });
    }

    const pxWest = Math.round((keepX - halfCount * step) * 10) / 10;
    if (canPlace('stone_wall', pxWest, pzBoth)) {
      items.push({ kind: 'stone_wall', x: pxWest, z: pzBoth, rotationY: Math.PI / 2 });
    }
  }

  return items;
}
