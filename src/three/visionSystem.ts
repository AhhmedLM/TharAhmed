import * as THREE from 'three';
import {
  BlockoutStructure,
  BlockoutUnit,
  getStructureVisionRadius,
  getUnitVisionRadius,
} from '../shared/protocol';
import {
  CHUNK_SIZE,
  ClimateKind,
  getEffectiveClimateAt,
  getTerrainHeight,
  WATER_LEVEL_Y,
} from '../shared/worldMap';

const VISION_GRID_RES = 72;
const HEIGHT_SAMPLE_RES = 32;
const SECTOR_SUBGRID = 32; // 32 x 32 cells of 8m inside each 256m sector
const CELL_PER_SECTOR_M = CHUNK_SIZE / SECTOR_SUBGRID; // 8m

function packSectorKey(sx: number, sz: number): number {
  return (sx + 512) * 1024 + (sz + 512);
}

const fallbackData = new Uint8Array([255, 255, 255, 255]);
const fallbackWhiteTex = new THREE.DataTexture(fallbackData, 1, 1, THREE.RGBAFormat);
fallbackWhiteTex.magFilter = THREE.NearestFilter;
fallbackWhiteTex.minFilter = THREE.NearestFilter;
fallbackWhiteTex.needsUpdate = true;

/**
 * Shared shader uniforms updated synchronously by the active StrategicViewport
 * immediately before `renderer.render(...)`, keeping compiled WebGL programs shared.
 */
export const SHARED_VISION_UNIFORMS = {
  uVisionTex: { value: fallbackWhiteTex as THREE.Texture },
  uVisionCenterRelXZ: { value: new THREE.Vector2(0, 0) },
  uVisionInvSpan: { value: 1 / 1200 },
  uVisionEnabled: { value: 0.0 },
};

interface RayTrigTable {
  count: number;
  cos: Float32Array;
  sin: Float32Array;
}

const RAY_TABLES = new Map<number, RayTrigTable>();

function getRayTable(count: number): RayTrigTable {
  let table = RAY_TABLES.get(count);
  if (!table) {
    const cos = new Float32Array(count);
    const sin = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      cos[i] = Math.cos(angle);
      sin[i] = Math.sin(angle);
    }
    table = { count, cos, sin };
    RAY_TABLES.set(count, table);
  }
  return table;
}

interface ObstacleBlocker {
  x: number;
  z: number;
  radiusSq: number;
  topY: number;
}

export interface VisionObserverSnapshot {
  x: number;
  z: number;
  radius: number;
  eyeY: number;
}

/**
 * Among-Us Style Line-of-Sight & Occlusion Vision Solver.
 * Computes radial cliff/building occlusion polygons into a GPU DataTexture
 * and exposes O(1) visibility queries for hiding unseen enemies & remote cursors.
 */
export class AmongUsVisionSystem {
  public readonly texture: THREE.DataTexture;
  private readonly rgbaBuffer: Uint8Array;
  private readonly liveVisGrid: Uint8Array;
  private readonly heightGrid: Float32Array;
  private readonly rayDistBuf = new Float32Array(128);
  private readonly exploredSectors = new Map<number, Uint8Array>();
  private readonly structHeightCache = new Map<string, number>();

  private centerX = 0;
  private centerZ = 0;
  private spanM = 1120;
  private minX = -560;
  private minZ = -560;
  private cachedHeightMinX = Number.NaN;
  private cachedHeightMinZ = Number.NaN;
  private cachedHeightSpanM = -1;
  private lastComputeMs = 0;
  private lastSignature = '';
  private hasActiveObservers = false;

  private readonly activeObservers: VisionObserverSnapshot[] = [];
  private readonly blockers: ObstacleBlocker[] = [];

  constructor() {
    const pixelCount = VISION_GRID_RES * VISION_GRID_RES;
    this.rgbaBuffer = new Uint8Array(pixelCount * 4);
    this.liveVisGrid = new Uint8Array(pixelCount);
    this.heightGrid = new Float32Array(HEIGHT_SAMPLE_RES * HEIGHT_SAMPLE_RES);

    for (let i = 0; i < pixelCount; i++) {
      const o = i * 4;
      this.rgbaBuffer[o] = 255;
      this.rgbaBuffer[o + 1] = 255;
      this.rgbaBuffer[o + 2] = 0;
      this.rgbaBuffer[o + 3] = 255;
    }

    this.texture = new THREE.DataTexture(
      this.rgbaBuffer,
      VISION_GRID_RES,
      VISION_GRID_RES,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
  }

  private getExploredSector(sx: number, sz: number, createIfMissing: boolean): Uint8Array | undefined {
    const key = packSectorKey(sx, sz);
    let arr = this.exploredSectors.get(key);
    if (!arr && createIfMissing) {
      // Cap total cached sectors cleanly across the 100km continent
      if (this.exploredSectors.size > 1200) {
        const firstKey = this.exploredSectors.keys().next().value;
        if (firstKey !== undefined) this.exploredSectors.delete(firstKey);
      }
      arr = new Uint8Array(SECTOR_SUBGRID * SECTOR_SUBGRID);
      this.exploredSectors.set(key, arr);
    }
    return arr;
  }

  private isCellExplored(wx: number, wz: number): boolean {
    const sx = Math.floor(wx / CHUNK_SIZE);
    const sz = Math.floor(wz / CHUNK_SIZE);
    const sec = this.exploredSectors.get(packSectorKey(sx, sz));
    if (!sec) return false;
    const lx = Math.floor((wx - sx * CHUNK_SIZE) / CELL_PER_SECTOR_M);
    const lz = Math.floor((wz - sz * CHUNK_SIZE) / CELL_PER_SECTOR_M);
    if (lx < 0 || lx >= SECTOR_SUBGRID || lz < 0 || lz >= SECTOR_SUBGRID) return false;
    return sec[lz * SECTOR_SUBGRID + lx] === 1;
  }

  private sampleTerrainCached(wx: number, wz: number): number {
    if (!Number.isNaN(this.cachedHeightMinX)) {
      const u = (wx - this.cachedHeightMinX) / this.cachedHeightSpanM;
      const v = (wz - this.cachedHeightMinZ) / this.cachedHeightSpanM;
      if (u >= 0 && u < 1 && v >= 0 && v < 1) {
        const gx = Math.min(HEIGHT_SAMPLE_RES - 1, Math.max(0, (u * HEIGHT_SAMPLE_RES) | 0));
        const gz = Math.min(HEIGHT_SAMPLE_RES - 1, Math.max(0, (v * HEIGHT_SAMPLE_RES) | 0));
        return this.heightGrid[gz * HEIGHT_SAMPLE_RES + gx];
      }
    }
    return getTerrainHeight(wx, wz);
  }

  public update(
    nowMs: number,
    camX: number,
    camZ: number,
    camZoom: number,
    myPlayerId: string | null,
    structures: Record<string, BlockoutStructure>,
    units: Record<string, BlockoutUnit>,
    climate: ClimateKind,
    force = false
  ): void {
    const targetSpan =
      Math.round(Math.max(800, Math.min(2640, camZoom * 2.8)) / 160) * 160;
    const movedDist = Math.hypot(camX - this.centerX, camZ - this.centerZ);
    const spanChanged = Math.abs(targetSpan - this.spanM) > this.spanM * 0.1;

    if (!force && nowMs - this.lastComputeMs < 200 && movedDist < this.spanM * 0.14 && !spanChanged) {
      return;
    }
    this.lastComputeMs = nowMs;

    // Quantize grid center to 96m steps so normal camera panning rarely triggers heightGrid rebuilds
    const qCenterX = Math.round(camX / 96) * 96;
    const qCenterZ = Math.round(camZ / 96) * 96;
    const localCenterClimate = getEffectiveClimateAt(qCenterX, qCenterZ, climate);

    // 1. Collect friendly observers (my structures + units near or inside vision window)
    this.activeObservers.length = 0;
    this.blockers.length = 0;

    const collectRange = targetSpan * 0.68 + 320;
    let sig = `${qCenterX},${qCenterZ},${targetSpan},${localCenterClimate}|`;

    if (myPlayerId) {
      for (const stId in structures) {
        const st = structures[stId];
        const dx = Math.abs(st.x - qCenterX);
        if (dx > collectRange) continue;
        const dz = Math.abs(st.z - qCenterZ);
        if (dz > collectRange) continue;

        let baseH = this.structHeightCache.get(st.id);
        if (baseH === undefined) {
          baseH = Math.max(WATER_LEVEL_Y, getTerrainHeight(st.x, st.z));
          if (this.structHeightCache.size > 400) this.structHeightCache.clear();
          this.structHeightCache.set(st.id, baseH);
        }

        if (st.ownerId === myPlayerId) {
          const radius = getStructureVisionRadius(st.kind, st.level ?? 1, localCenterClimate);
          const eyeOffset =
            st.kind === 'watchtower'
              ? 8.5 + (st.level ?? 1) * 1.3
              : st.kind === 'keep'
                ? 6.4 + (st.level ?? 1) * 0.8
                : st.kind === 'temple'
                  ? 4.8
                  : 3.0;
          this.activeObservers.push({
            x: st.x,
            z: st.z,
            radius,
            eyeY: baseH + eyeOffset,
          });
          sig += `s${(st.x / 4) | 0},${(st.z / 4) | 0},${radius | 0};`;
        } else {
          // Enemy/external solid buildings cast crisp Among-Us sight shadows behind them
          const isTallBlocker =
            st.kind === 'keep' ||
            st.kind === 'watchtower' ||
            st.kind === 'temple' ||
            st.kind === 'barracks' ||
            st.kind === 'war_tent';
          if (isTallBlocker) {
            const bRad = st.kind === 'keep' ? 4.4 : st.kind === 'watchtower' ? 2.6 : 3.2;
            const bHeight =
              st.kind === 'watchtower' ? 9.5 : st.kind === 'keep' ? 8.2 : st.kind === 'temple' ? 7.2 : 4.8;
            this.blockers.push({
              x: st.x,
              z: st.z,
              radiusSq: bRad * bRad,
              topY: baseH + bHeight,
            });
          }
        }
      }

      for (const uId in units) {
        const u = units[uId];
        if (u.ownerId !== myPlayerId) continue;
        const dx = Math.abs(u.x - qCenterX);
        if (dx > collectRange) continue;
        const dz = Math.abs(u.z - qCenterZ);
        if (dz > collectRange) continue;

        const radius = getUnitVisionRadius(u.kind, localCenterClimate);
        // Deduplicate tightly clustered friendly units so squads don't cast 20 identical ray fans
        let redundant = false;
        for (let k = 0; k < this.activeObservers.length; k++) {
          const existing = this.activeObservers[k];
          if (existing.radius >= radius) {
            const odx = existing.x - u.x;
            const odz = existing.z - u.z;
            if (odx * odx + odz * odz < 64) {
              redundant = true;
              break;
            }
          }
        }
        if (redundant) continue;

        const eyeOffset = u.kind === 'commander' || u.kind === 'knight' ? 2.3 : 1.7;
        const baseH = Math.max(WATER_LEVEL_Y, this.sampleTerrainCached(u.x, u.z));
        this.activeObservers.push({
          x: u.x,
          z: u.z,
          radius,
          eyeY: baseH + eyeOffset,
        });
        sig += `u${(u.x / 4) | 0},${(u.z / 4) | 0},${radius | 0};`;
      }
    }

    if (this.activeObservers.length === 0) {
      this.hasActiveObservers = false;
      return;
    }
    this.hasActiveObservers = true;

    if (!force && sig === this.lastSignature) {
      return;
    }
    this.lastSignature = sig;

    this.centerX = qCenterX;
    this.centerZ = qCenterZ;
    this.spanM = targetSpan;
    this.minX = qCenterX - targetSpan * 0.5;
    this.minZ = qCenterZ - targetSpan * 0.5;
    const cellM = targetSpan / VISION_GRID_RES;

    // 2. Rebuild coarse 32x32 terrain elevation cache only when quantized viewport bounds shift
    if (
      Math.abs(this.minX - this.cachedHeightMinX) > 1 ||
      Math.abs(this.minZ - this.cachedHeightMinZ) > 1 ||
      Math.abs(this.spanM - this.cachedHeightSpanM) > 1
    ) {
      this.cachedHeightMinX = this.minX;
      this.cachedHeightMinZ = this.minZ;
      this.cachedHeightSpanM = this.spanM;
      const hStepM = targetSpan / HEIGHT_SAMPLE_RES;
      for (let gz = 0; gz < HEIGHT_SAMPLE_RES; gz++) {
        const wz = this.minZ + (gz + 0.5) * hStepM;
        const rowOffset = gz * HEIGHT_SAMPLE_RES;
        for (let gx = 0; gx < HEIGHT_SAMPLE_RES; gx++) {
          const wx = this.minX + (gx + 0.5) * hStepM;
          this.heightGrid[rowOffset + gx] = getTerrainHeight(wx, wz);
        }
      }
    }

    // 3. Clear live visibility grid and cast radial Among-Us sight rays for each observer
    this.liveVisGrid.fill(0);
    const marchStepM = Math.max(5.5, cellM * 0.9);
    const localBlockers: ObstacleBlocker[] = [];

    for (let oIdx = 0; oIdx < this.activeObservers.length; oIdx++) {
      const obs = this.activeObservers[oIdx];
      const radius = obs.radius;
      const radiusSq = radius * radius;
      const numRays = radius >= 130 ? 64 : 48;
      const trig = getRayTable(numRays);

      // Gather only blockers intersecting this observer's circle
      localBlockers.length = 0;
      for (let b = 0; b < this.blockers.length; b++) {
        const blk = this.blockers[b];
        const bdx = blk.x - obs.x;
        const bdz = blk.z - obs.z;
        if (bdx * bdx + bdz * bdz <= radiusSq && blk.topY > obs.eyeY) {
          localBlockers.push(blk);
        }
      }

      // Ray-march each angle outward until cliff/ridge or tall building occlusion
      for (let r = 0; r < numRays; r++) {
        const ca = trig.cos[r];
        const sa = trig.sin[r];
        let blockedAt = radius;

        for (let d = marchStepM; d <= radius; d += marchStepM) {
          const rx = obs.x + ca * d;
          const rz = obs.z + sa * d;

          if (d > 14) {
            const h = this.sampleTerrainCached(rx, rz);
            if (h > obs.eyeY + 2.05) {
              blockedAt = Math.min(radius, d + marchStepM * 0.65);
              break;
            }
            if (localBlockers.length > 0) {
              let hitBuilding = false;
              for (let b = 0; b < localBlockers.length; b++) {
                const blk = localBlockers[b];
                const dxB = rx - blk.x;
                const dzB = rz - blk.z;
                if (dxB * dxB + dzB * dzB <= blk.radiusSq) {
                  blockedAt = Math.min(radius, d + 2.5);
                  hitBuilding = true;
                  break;
                }
              }
              if (hitBuilding) break;
            }
          }
        }
        this.rayDistBuf[r] = blockedAt;
      }

      // Rasterize gap-free angular visibility cone into liveVisGrid AABB
      const gxMin = Math.max(0, Math.floor((obs.x - radius - this.minX) / cellM));
      const gxMax = Math.min(VISION_GRID_RES - 1, Math.ceil((obs.x + radius - this.minX) / cellM));
      const gzMin = Math.max(0, Math.floor((obs.z - radius - this.minZ) / cellM));
      const gzMax = Math.min(VISION_GRID_RES - 1, Math.ceil((obs.z + radius - this.minZ) / cellM));

      const rayScale = numRays / (Math.PI * 2);
      const edgeFeather = Math.max(6.5, cellM * 1.15);
      const rangeFadeSpan = Math.max(10, radius * 0.14);

      for (let gz = gzMin; gz <= gzMax; gz++) {
        const wz = this.minZ + (gz + 0.5) * cellM;
        const dz = wz - obs.z;
        const dzSq = dz * dz;
        const rowOffset = gz * VISION_GRID_RES;

        for (let gx = gxMin; gx <= gxMax; gx++) {
          const wx = this.minX + (gx + 0.5) * cellM;
          const dx = wx - obs.x;
          const dSq = dx * dx + dzSq;
          if (dSq > radiusSq) continue;

          const d = Math.sqrt(dSq);
          let val = 255;

          if (d > 4.0) {
            let ang = Math.atan2(dz, dx);
            if (ang < 0) ang += Math.PI * 2;
            const exactIdx = ang * rayScale;
            const i0 = Math.floor(exactIdx) % numRays;
            const i1 = (i0 + 1) % numRays;
            const frac = exactIdx - Math.floor(exactIdx);
            const maxRayD =
              this.rayDistBuf[i0] * (1 - frac) + this.rayDistBuf[i1] * frac;

            if (d > maxRayD + edgeFeather) continue;
            const losMask =
              d <= maxRayD
                ? 1.0
                : Math.max(0, Math.min(1, (maxRayD + edgeFeather - d) / edgeFeather));
            const rangeFade =
              d < radius - rangeFadeSpan
                ? 1.0
                : Math.max(0, Math.min(1, (radius - d) / rangeFadeSpan));
            val = (losMask * rangeFade * 255) | 0;
          }

          if (val > 0) {
            const idx = rowOffset + gx;
            if (val > this.liveVisGrid[idx]) {
              this.liveVisGrid[idx] = val;
            }
          }
        }
      }
    }

    // 4. Commit live visibility + explored persistent memory to RGBA DataTexture (with cached sector lookups)
    let cachedSx = Number.NaN;
    let cachedSz = Number.NaN;
    let cachedSec: Uint8Array | undefined;

    for (let gz = 0; gz < VISION_GRID_RES; gz++) {
      const wz = this.minZ + (gz + 0.5) * cellM;
      const sz = Math.floor(wz / CHUNK_SIZE);
      const lz = Math.floor((wz - sz * CHUNK_SIZE) / CELL_PER_SECTOR_M);
      const lzRow = lz * SECTOR_SUBGRID;
      const validLz = lz >= 0 && lz < SECTOR_SUBGRID;
      const rowOffset = gz * VISION_GRID_RES;

      for (let gx = 0; gx < VISION_GRID_RES; gx++) {
        const idx = rowOffset + gx;
        const live = this.liveVisGrid[idx];
        const wx = this.minX + (gx + 0.5) * cellM;
        const sx = Math.floor(wx / CHUNK_SIZE);
        let explored = 0;

        if (validLz) {
          const lx = Math.floor((wx - sx * CHUNK_SIZE) / CELL_PER_SECTOR_M);
          if (lx >= 0 && lx < SECTOR_SUBGRID) {
            if (sx !== cachedSx || sz !== cachedSz) {
              cachedSx = sx;
              cachedSz = sz;
              cachedSec = this.getExploredSector(sx, sz, live >= 96);
            } else if (!cachedSec && live >= 96) {
              cachedSec = this.getExploredSector(sx, sz, true);
            }
            if (cachedSec) {
              const cellIdx = lzRow + lx;
              if (live >= 96) {
                cachedSec[cellIdx] = 1;
                explored = 255;
              } else if (cachedSec[cellIdx] === 1) {
                explored = 255;
              }
            }
          }
        }

        const o = idx * 4;
        this.rgbaBuffer[o] = live;
        this.rgbaBuffer[o + 1] = explored;
        this.rgbaBuffer[o + 2] = 0;
        this.rgbaBuffer[o + 3] = 255;
      }
    }

    this.texture.needsUpdate = true;
  }

  public bindToShaders(originX: number, originZ: number): void {
    SHARED_VISION_UNIFORMS.uVisionTex.value = this.texture;
    SHARED_VISION_UNIFORMS.uVisionCenterRelXZ.value.set(
      this.centerX - originX,
      this.centerZ - originZ
    );
    SHARED_VISION_UNIFORMS.uVisionInvSpan.value = 1 / Math.max(1, this.spanM);
    SHARED_VISION_UNIFORMS.uVisionEnabled.value = this.hasActiveObservers ? 1.0 : 0.0;
  }

  /**
   * Returns true if world coordinate (wx, wz) is currently inside a friendly line-of-sight cone.
   */
  public isWorldPointVisible(wx: number, wz: number, threshold = 0.22): boolean {
    if (!this.hasActiveObservers) return true;
    const u = (wx - this.minX) / this.spanM;
    const v = (wz - this.minZ) / this.spanM;
    if (u >= 0 && u < 1 && v >= 0 && v < 1) {
      const gx = Math.min(VISION_GRID_RES - 1, Math.max(0, (u * VISION_GRID_RES) | 0));
      const gz = Math.min(VISION_GRID_RES - 1, Math.max(0, (v * VISION_GRID_RES) | 0));
      return this.liveVisGrid[gz * VISION_GRID_RES + gx] >= threshold * 255;
    }
    // Outside local texture window: conservative distance check against observers
    for (let i = 0; i < this.activeObservers.length; i++) {
      const obs = this.activeObservers[i];
      if (Math.hypot(wx - obs.x, wz - obs.z) <= obs.radius) return true;
    }
    return false;
  }

  public isWorldPointExplored(wx: number, wz: number): boolean {
    if (!this.hasActiveObservers) return true;
    return this.isCellExplored(wx, wz) || this.isWorldPointVisible(wx, wz, 0.22);
  }

  public getObservers(): readonly VisionObserverSnapshot[] {
    return this.activeObservers;
  }
}
