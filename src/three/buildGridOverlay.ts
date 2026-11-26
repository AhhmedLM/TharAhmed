import * as THREE from 'three';
import { BlockoutStructure, STRUCTURE_SPECS, StructureKind } from '../shared/protocol';
import {
  BUILD_GRID_CELL_SIZE,
  evaluateBuildingPlacementAt,
  PlacementCellState,
} from '../shared/fortificationHelpers';
import { getTerrainHeight } from '../shared/worldMap';

const GRID_RADIUS = 7; // 15 x 15 cells = 30m x 30m tactical surveyor grid
const GRID_DIM = GRID_RADIUS * 2 + 1;
const CELL_COUNT = GRID_DIM * GRID_DIM; // 225 cells
const HALF_QUAD = BUILD_GRID_CELL_SIZE * 0.455; // 0.91m inset inside 2.0m cell

// Semantic colors (sRGB-tuned for legibility over desert, plains, forest, stone, and snow)
const COLOR_VALID = new THREE.Color(0x22c55e);
const COLOR_BONUS_HIGH = new THREE.Color(0x10b981);
const COLOR_BONUS_WATER = new THREE.Color(0x38bdf8);
const COLOR_REPLACE_WALL = new THREE.Color(0xfacc15);
const COLOR_BLOCKED_TERRAIN = new THREE.Color(0xef4444);
const COLOR_BLOCKED_OVERLAP = new THREE.Color(0xf97316);
const COLOR_FOOTPRINT_VALID = new THREE.Color(0x4ade80);
const COLOR_FOOTPRINT_SNAP = new THREE.Color(0xfde047);
const COLOR_FOOTPRINT_WATER = new THREE.Color(0x7dd3fc);
const COLOR_FOOTPRINT_BLOCKED = new THREE.Color(0xf87171);

const GRID_LINE_COLOR = new THREE.Color(0xf3dfb6);

export interface BuildGridUpdateParams {
  kind: StructureKind;
  snappedX: number;
  snappedZ: number;
  rotationY: number;
  originX: number;
  originZ: number;
  structures: Record<string, BlockoutStructure>;
  snapped: boolean;
  replaceWallId?: string;
  snapTarget?: { x: number; z: number };
  centerState: PlacementCellState;
  centerOk: boolean;
  isDrawingLine: boolean;
}

/**
 * High-performance, terrain-conforming 3D tactical building placement grid overlay.
 * Renders a 15x15 (30m x 30m) 2m-snapped cell validity grid, alignment axis guides,
 * rotated building footprint outline with facing chevron, and magnetic snap tether.
 * Zero per-frame heap allocations; dirty-checked so static frames cost ~0ms.
 */
export class BuildPlacementGridOverlay {
  public readonly root: THREE.Group;

  private readonly cellsGeom: THREE.BufferGeometry;
  private readonly cellsMat: THREE.ShaderMaterial;
  private readonly cellsMesh: THREE.Mesh;
  private readonly cellPosAttr: THREE.BufferAttribute;
  private readonly cellColorAttr: THREE.BufferAttribute;
  private readonly cellStyleAttr: THREE.BufferAttribute;

  private readonly gridLinesGeom: THREE.BufferGeometry;
  private readonly gridLinesMat: THREE.LineBasicMaterial;
  private readonly gridLines: THREE.LineSegments;
  private readonly gridLinePosAttr: THREE.BufferAttribute;
  private readonly gridLineColorAttr: THREE.BufferAttribute;

  private readonly axisGeom: THREE.BufferGeometry;
  private readonly axisMat: THREE.LineBasicMaterial;
  private readonly axisLines: THREE.LineSegments;
  private readonly axisPosAttr: THREE.BufferAttribute;

  private readonly footprintGeom: THREE.BufferGeometry;
  private readonly footprintMat: THREE.LineBasicMaterial;
  private readonly footprintLines: THREE.LineSegments;
  private readonly footprintPosAttr: THREE.BufferAttribute;

  private readonly arrowGeom: THREE.BufferGeometry;
  private readonly arrowMat: THREE.MeshBasicMaterial;
  private readonly arrowMesh: THREE.Mesh;
  private readonly arrowPosAttr: THREE.BufferAttribute;

  private readonly snapTetherGeom: THREE.BufferGeometry;
  private readonly snapTetherMat: THREE.LineBasicMaterial;
  private readonly snapTetherLine: THREE.Line;
  private readonly snapTetherPosAttr: THREE.BufferAttribute;

  // Reusable scratch array for nearby structures (zero GC)
  private readonly nearbyStructures: BlockoutStructure[] = [];

  // Dirty-check keys to avoid redundant height/validity rebuilds
  private lastAnchorX = Number.NaN;
  private lastAnchorZ = Number.NaN;
  private lastOriginX = Number.NaN;
  private lastOriginZ = Number.NaN;
  private lastKind: StructureKind | null = null;
  private lastSnappedX = Number.NaN;
  private lastSnappedZ = Number.NaN;
  private lastRotationY = Number.NaN;
  private lastStructSignature = '';
  private lastReplaceWallId: string | undefined = undefined;
  private lastCenterState: PlacementCellState | null = null;

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'BuildPlacementGridOverlay';
    this.root.visible = false;

    // 1. Terrain-Conforming Validity Cell Tiles (1 draw call for all 225 cells)
    const cellVertCount = CELL_COUNT * 4;
    const cellPositions = new Float32Array(cellVertCount * 3);
    const cellUvs = new Float32Array(cellVertCount * 2);
    const cellColors = new Float32Array(cellVertCount * 3);
    const cellStyles = new Float32Array(cellVertCount * 2);
    const cellIndices = new Uint16Array(CELL_COUNT * 6);

    for (let i = 0; i < CELL_COUNT; i++) {
      const vBase = i * 4;
      const uvBase = vBase * 2;
      cellUvs[uvBase] = 0;
      cellUvs[uvBase + 1] = 0;
      cellUvs[uvBase + 2] = 1;
      cellUvs[uvBase + 3] = 0;
      cellUvs[uvBase + 4] = 1;
      cellUvs[uvBase + 5] = 1;
      cellUvs[uvBase + 6] = 0;
      cellUvs[uvBase + 7] = 1;

      const idxBase = i * 6;
      cellIndices[idxBase] = vBase;
      cellIndices[idxBase + 1] = vBase + 1;
      cellIndices[idxBase + 2] = vBase + 2;
      cellIndices[idxBase + 3] = vBase;
      cellIndices[idxBase + 4] = vBase + 2;
      cellIndices[idxBase + 5] = vBase + 3;
    }

    this.cellsGeom = new THREE.BufferGeometry();
    this.cellPosAttr = new THREE.BufferAttribute(cellPositions, 3);
    this.cellColorAttr = new THREE.BufferAttribute(cellColors, 3);
    this.cellStyleAttr = new THREE.BufferAttribute(cellStyles, 2);
    this.cellsGeom.setAttribute('position', this.cellPosAttr);
    this.cellsGeom.setAttribute('uv', new THREE.BufferAttribute(cellUvs, 2));
    this.cellsGeom.setAttribute('aColor', this.cellColorAttr);
    this.cellsGeom.setAttribute('aStyle', this.cellStyleAttr);
    this.cellsGeom.setIndex(new THREE.BufferAttribute(cellIndices, 1));

    this.cellsMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 aColor;
        attribute vec2 aStyle;
        varying vec2 vUv;
        varying vec3 vColor;
        varying vec2 vStyle;
        void main() {
          vUv = uv;
          vColor = aColor;
          vStyle = aStyle;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vColor;
        varying vec2 vStyle;
        void main() {
          float alpha = vStyle.x;
          if (alpha <= 0.005) discard;
          float mode = vStyle.y;
          float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
          float borderMask = 1.0 - smoothstep(0.06, 0.11, edgeDist);
          vec3 col = vColor;
          float finalAlpha = alpha;

          if (mode > 1.5) {
            // Blocked cell: crisp diagonal hazard stripes for color-blind accessibility
            float diag = fract((vUv.x + vUv.y) * 3.5);
            float stripe = step(0.52, diag);
            finalAlpha = alpha * (0.48 + stripe * 0.52);
            col = mix(col, vec3(1.0, 0.92, 0.92), borderMask * 0.35);
            finalAlpha = max(finalAlpha, borderMask * alpha * 1.25);
          } else if (mode > 0.5) {
            // Active building footprint cell: strong illuminated border & higher clarity
            col = mix(col, vec3(1.0, 0.98, 0.88), borderMask * 0.65);
            finalAlpha = clamp(alpha * (0.85 + borderMask * 0.55), 0.0, 0.82);
          } else {
            // Valid open buildable cell: crisp subtle corner/edge read
            col = mix(col, vec3(0.95, 1.0, 0.92), borderMask * 0.3);
            finalAlpha = alpha * (0.72 + borderMask * 0.45);
          }

          gl_FragColor = vec4(col, finalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.cellsMesh = new THREE.Mesh(this.cellsGeom, this.cellsMat);
    this.cellsMesh.frustumCulled = false;
    this.cellsMesh.renderOrder = 4;
    this.root.add(this.cellsMesh);

    // 2. Terrain-Conforming Surveyor Grid Lines ((GRID_DIM + 1) * GRID_DIM * 2 segments)
    const lineSegCount = (GRID_DIM + 1) * GRID_DIM * 2;
    const gridLinePositions = new Float32Array(lineSegCount * 2 * 3);
    const gridLineColors = new Float32Array(lineSegCount * 2 * 3);
    this.gridLinesGeom = new THREE.BufferGeometry();
    this.gridLinePosAttr = new THREE.BufferAttribute(gridLinePositions, 3);
    this.gridLineColorAttr = new THREE.BufferAttribute(gridLineColors, 3);
    this.gridLinesGeom.setAttribute('position', this.gridLinePosAttr);
    this.gridLinesGeom.setAttribute('color', this.gridLineColorAttr);

    this.gridLinesMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    });
    this.gridLines = new THREE.LineSegments(this.gridLinesGeom, this.gridLinesMat);
    this.gridLines.frustumCulled = false;
    this.gridLines.renderOrder = 5;
    this.root.add(this.gridLines);

    // 3. High-Contrast X/Z Alignment Crosshair Axes passing through snapped placement center
    // 2 axes * 14 segments each = 28 segments = 56 vertices
    const axisVertCount = 28 * 2;
    this.axisGeom = new THREE.BufferGeometry();
    this.axisPosAttr = new THREE.BufferAttribute(new Float32Array(axisVertCount * 3), 3);
    this.axisGeom.setAttribute('position', this.axisPosAttr);
    this.axisMat = new THREE.LineBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    this.axisLines = new THREE.LineSegments(this.axisGeom, this.axisMat);
    this.axisLines.frustumCulled = false;
    this.axisLines.renderOrder = 6;
    this.root.add(this.axisLines);

    // 4. Exact Rotated Building Footprint Perimeter + 4 Corner L-Brackets + Vertical Corner Pins
    // 4 perimeter edges (subdivided 2x = 8 segs) + 8 outer L-bracket segs + 4 vertical corner ticks = 20 segs (40 verts)
    this.footprintGeom = new THREE.BufferGeometry();
    this.footprintPosAttr = new THREE.BufferAttribute(new Float32Array(40 * 3), 3);
    this.footprintGeom.setAttribute('position', this.footprintPosAttr);
    this.footprintMat = new THREE.LineBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    });
    this.footprintLines = new THREE.LineSegments(this.footprintGeom, this.footprintMat);
    this.footprintLines.frustumCulled = false;
    this.footprintLines.renderOrder = 7;
    this.root.add(this.footprintLines);

    // 5. Front-Facing Orientation Chevron Arrow (triangle on ground indicating building front)
    this.arrowGeom = new THREE.BufferGeometry();
    this.arrowPosAttr = new THREE.BufferAttribute(new Float32Array(3 * 3), 3);
    this.arrowGeom.setAttribute('position', this.arrowPosAttr);
    this.arrowMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.arrowMesh = new THREE.Mesh(this.arrowGeom, this.arrowMat);
    this.arrowMesh.frustumCulled = false;
    this.arrowMesh.renderOrder = 7;
    this.root.add(this.arrowMesh);

    // 6. Magnetic Snap Tether Line (connects snapped neighbor fort to current placement)
    this.snapTetherGeom = new THREE.BufferGeometry();
    this.snapTetherPosAttr = new THREE.BufferAttribute(new Float32Array(2 * 3), 3);
    this.snapTetherGeom.setAttribute('position', this.snapTetherPosAttr);
    this.snapTetherMat = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.snapTetherLine = new THREE.Line(this.snapTetherGeom, this.snapTetherMat);
    this.snapTetherLine.frustumCulled = false;
    this.snapTetherLine.renderOrder = 7;
    this.snapTetherLine.visible = false;
    this.root.add(this.snapTetherLine);
  }

  public hide(): void {
    this.root.visible = false;
  }

  public update(params: BuildGridUpdateParams): void {
    const {
      kind,
      snappedX,
      snappedZ,
      rotationY,
      originX,
      originZ,
      structures,
      snapped,
      replaceWallId,
      snapTarget,
      centerState,
      centerOk,
      isDrawingLine,
    } = params;

    this.root.visible = true;

    const anchorX = Math.round(snappedX / BUILD_GRID_CELL_SIZE) * BUILD_GRID_CELL_SIZE;
    const anchorZ = Math.round(snappedZ / BUILD_GRID_CELL_SIZE) * BUILD_GRID_CELL_SIZE;

    // Collect nearby living structures within 42m into scratch buffer & compute lightweight signature
    this.nearbyStructures.length = 0;
    let nearbyCount = 0;
    let nearbyHash = 0;
    for (const id in structures) {
      const s = structures[id];
      if (!s || s.hp <= 0) continue;
      const dx = s.x - anchorX;
      const dz = s.z - anchorZ;
      if (dx * dx + dz * dz <= 42 * 42) {
        this.nearbyStructures.push(s);
        nearbyCount += 1;
        nearbyHash = (nearbyHash + Math.round(s.x * 3 + s.z * 7)) | 0;
      }
    }
    const structSig = `${nearbyCount}_${nearbyHash}`;

    const gridDirty =
      anchorX !== this.lastAnchorX ||
      anchorZ !== this.lastAnchorZ ||
      originX !== this.lastOriginX ||
      originZ !== this.lastOriginZ ||
      kind !== this.lastKind ||
      snappedX !== this.lastSnappedX ||
      snappedZ !== this.lastSnappedZ ||
      rotationY !== this.lastRotationY ||
      structSig !== this.lastStructSignature ||
      replaceWallId !== this.lastReplaceWallId ||
      centerState !== this.lastCenterState;

    if (gridDirty) {
      this.lastAnchorX = anchorX;
      this.lastAnchorZ = anchorZ;
      this.lastOriginX = originX;
      this.lastOriginZ = originZ;
      this.lastKind = kind;
      this.lastSnappedX = snappedX;
      this.lastSnappedZ = snappedZ;
      this.lastRotationY = rotationY;
      this.lastStructSignature = structSig;
      this.lastReplaceWallId = replaceWallId;
      this.lastCenterState = centerState;

      this.rebuildCellsAndGridLines(
        kind,
        anchorX,
        anchorZ,
        snappedX,
        snappedZ,
        rotationY,
        originX,
        originZ,
        replaceWallId,
        centerOk,
        centerState,
        isDrawingLine
      );
      this.rebuildAxisGuides(snappedX, snappedZ, originX, originZ, centerOk, snapped, centerState);
      this.rebuildFootprintAndArrow(
        kind,
        snappedX,
        snappedZ,
        rotationY,
        originX,
        originZ,
        centerOk,
        snapped,
        centerState,
        isDrawingLine
      );
    }

    // Update magnetic snap tether whenever snapped to a distinct adjacent fortification
    if (
      !isDrawingLine &&
      snapped &&
      snapTarget &&
      Math.hypot(snapTarget.x - snappedX, snapTarget.z - snappedZ) > 0.35
    ) {
      const y0 = getTerrainHeight(snappedX, snappedZ) + 0.45;
      const y1 = getTerrainHeight(snapTarget.x, snapTarget.z) + 0.45;
      this.snapTetherPosAttr.setXYZ(0, snappedX - originX, y0, snappedZ - originZ);
      this.snapTetherPosAttr.setXYZ(1, snapTarget.x - originX, y1, snapTarget.z - originZ);
      this.snapTetherPosAttr.needsUpdate = true;
      this.snapTetherLine.visible = true;
    } else {
      this.snapTetherLine.visible = false;
    }
  }

  private rebuildCellsAndGridLines(
    kind: StructureKind,
    anchorX: number,
    anchorZ: number,
    snappedX: number,
    snappedZ: number,
    rotationY: number,
    originX: number,
    originZ: number,
    replaceWallId: string | undefined,
    centerOk: boolean,
    centerState: PlacementCellState,
    isDrawingLine: boolean
  ): void {
    const spec = STRUCTURE_SPECS[kind];
    const halfW = Math.max(1.2, (spec?.footprint.w ?? 3.4) * 0.5);
    const halfD = Math.max(1.2, (spec?.footprint.d ?? 3.4) * 0.5);
    const cosNegR = Math.cos(-rotationY);
    const sinNegR = Math.sin(-rotationY);
    const maxRadiusM = (GRID_RADIUS + 0.65) * BUILD_GRID_CELL_SIZE;

    const posArr = this.cellPosAttr.array as Float32Array;
    const colArr = this.cellColorAttr.array as Float32Array;
    const styArr = this.cellStyleAttr.array as Float32Array;

    let cellIdx = 0;
    for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz++) {
      const cz = anchorZ + gz * BUILD_GRID_CELL_SIZE;
      for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx++) {
        const cx = anchorX + gx * BUILD_GRID_CELL_SIZE;

        // Check if this grid cell falls inside the rotated active building footprint
        const dxS = cx - snappedX;
        const dzS = cz - snappedZ;
        const localX = dxS * cosNegR - dzS * sinNegR;
        const localZ = dxS * sinNegR + dzS * cosNegR;
        const inFootprint =
          !isDrawingLine &&
          Math.abs(localX) <= halfW + 0.35 &&
          Math.abs(localZ) <= halfD + 0.35;

        const radialDist = Math.hypot(cx - anchorX, cz - anchorZ);
        const radialFade = Math.max(0, 1 - Math.pow(radialDist / maxRadiusM, 2.2));

        // Evaluate placement rules (skip expensive fortification bonus check on outer cells unless fort)
        const evalRes = evaluateBuildingPlacementAt(
          kind,
          cx,
          cz,
          this.nearbyStructures,
          inFootprint ? replaceWallId : undefined,
          true
        );

        let cellColor = COLOR_VALID;
        let patternMode = 0.0;
        let baseAlpha = 0.24;

        if (inFootprint) {
          if (!centerOk || !evalRes.ok) {
            cellColor = COLOR_FOOTPRINT_BLOCKED;
            patternMode = 2.0;
            baseAlpha = 0.62;
          } else if (centerState === 'replace_wall') {
            cellColor = COLOR_FOOTPRINT_SNAP;
            patternMode = 1.0;
            baseAlpha = 0.56;
          } else if (centerState === 'bonus_water') {
            cellColor = COLOR_FOOTPRINT_WATER;
            patternMode = 1.0;
            baseAlpha = 0.52;
          } else {
            cellColor = COLOR_FOOTPRINT_VALID;
            patternMode = 1.0;
            baseAlpha = 0.48;
          }
        } else {
          switch (evalRes.state) {
            case 'blocked_terrain':
              cellColor = COLOR_BLOCKED_TERRAIN;
              patternMode = 2.0;
              baseAlpha = 0.38;
              break;
            case 'blocked_overlap':
              cellColor = COLOR_BLOCKED_OVERLAP;
              patternMode = 2.0;
              baseAlpha = 0.42;
              break;
            case 'bonus_water':
              cellColor = COLOR_BONUS_WATER;
              patternMode = 0.0;
              baseAlpha = 0.32;
              break;
            case 'bonus_high':
              cellColor = COLOR_BONUS_HIGH;
              patternMode = 0.0;
              baseAlpha = 0.28;
              break;
            case 'replace_wall':
              cellColor = COLOR_REPLACE_WALL;
              patternMode = 0.0;
              baseAlpha = 0.38;
              break;
            default:
              cellColor = COLOR_VALID;
              patternMode = 0.0;
              baseAlpha = 0.22;
              break;
          }
        }

        const alpha = inFootprint ? baseAlpha : baseAlpha * radialFade;

        // 4 terrain-conforming corners for this cell quad
        const x0 = cx - HALF_QUAD;
        const x1 = cx + HALF_QUAD;
        const z0 = cz - HALF_QUAD;
        const z1 = cz + HALF_QUAD;

        const y00 = getTerrainHeight(x0, z0) + 0.14;
        const y10 = getTerrainHeight(x1, z0) + 0.14;
        const y11 = getTerrainHeight(x1, z1) + 0.14;
        const y01 = getTerrainHeight(x0, z1) + 0.14;

        const pBase = cellIdx * 12;
        posArr[pBase] = x0 - originX;
        posArr[pBase + 1] = y00;
        posArr[pBase + 2] = z0 - originZ;

        posArr[pBase + 3] = x1 - originX;
        posArr[pBase + 4] = y10;
        posArr[pBase + 5] = z0 - originZ;

        posArr[pBase + 6] = x1 - originX;
        posArr[pBase + 7] = y11;
        posArr[pBase + 8] = z1 - originZ;

        posArr[pBase + 9] = x0 - originX;
        posArr[pBase + 10] = y01;
        posArr[pBase + 11] = z1 - originZ;

        const sBase = cellIdx * 8;
        for (let k = 0; k < 4; k++) {
          const cOff = pBase + k * 3;
          colArr[cOff] = cellColor.r;
          colArr[cOff + 1] = cellColor.g;
          colArr[cOff + 2] = cellColor.b;

          const sOff = sBase + k * 2;
          styArr[sOff] = alpha;
          styArr[sOff + 1] = patternMode;
        }

        cellIdx += 1;
      }
    }

    this.cellPosAttr.needsUpdate = true;
    this.cellColorAttr.needsUpdate = true;
    this.cellStyleAttr.needsUpdate = true;

    // Rebuild terrain-conforming 2m grid boundary lines
    const linePos = this.gridLinePosAttr.array as Float32Array;
    const lineCol = this.gridLineColorAttr.array as Float32Array;
    const halfSpan = (GRID_RADIUS + 0.5) * BUILD_GRID_CELL_SIZE;
    const startX = anchorX - halfSpan;
    const startZ = anchorZ - halfSpan;

    let vCursor = 0;
    const pushLineVertex = (wx: number, wz: number) => {
      const dist = Math.hypot(wx - anchorX, wz - anchorZ);
      const fade = Math.max(0.08, 1 - Math.pow(dist / (maxRadiusM * 1.05), 1.8));
      const y = getTerrainHeight(wx, wz) + 0.17;
      linePos[vCursor] = wx - originX;
      linePos[vCursor + 1] = y;
      linePos[vCursor + 2] = wz - originZ;
      lineCol[vCursor] = GRID_LINE_COLOR.r * fade;
      lineCol[vCursor + 1] = GRID_LINE_COLOR.g * fade;
      lineCol[vCursor + 2] = GRID_LINE_COLOR.b * fade;
      vCursor += 3;
    };

    // Lines parallel to X
    for (let iz = 0; iz <= GRID_DIM; iz++) {
      const wz = startZ + iz * BUILD_GRID_CELL_SIZE;
      for (let ix = 0; ix < GRID_DIM; ix++) {
        const wx0 = startX + ix * BUILD_GRID_CELL_SIZE;
        const wx1 = wx0 + BUILD_GRID_CELL_SIZE;
        pushLineVertex(wx0, wz);
        pushLineVertex(wx1, wz);
      }
    }

    // Lines parallel to Z
    for (let ix = 0; ix <= GRID_DIM; ix++) {
      const wx = startX + ix * BUILD_GRID_CELL_SIZE;
      for (let iz = 0; iz < GRID_DIM; iz++) {
        const wz0 = startZ + iz * BUILD_GRID_CELL_SIZE;
        const wz1 = wz0 + BUILD_GRID_CELL_SIZE;
        pushLineVertex(wx, wz0);
        pushLineVertex(wx, wz1);
      }
    }

    this.gridLinePosAttr.needsUpdate = true;
    this.gridLineColorAttr.needsUpdate = true;
  }

  private rebuildAxisGuides(
    snappedX: number,
    snappedZ: number,
    originX: number,
    originZ: number,
    centerOk: boolean,
    snapped: boolean,
    centerState: PlacementCellState
  ): void {
    const arr = this.axisPosAttr.array as Float32Array;
    const segsPerAxis = 14;
    const step = BUILD_GRID_CELL_SIZE;
    const halfLen = (segsPerAxis * step) * 0.5;
    let cursor = 0;

    // X-axis alignment guide through snappedZ
    for (let i = 0; i < segsPerAxis; i++) {
      const x0 = snappedX - halfLen + i * step;
      const x1 = x0 + step;
      arr[cursor++] = x0 - originX;
      arr[cursor++] = getTerrainHeight(x0, snappedZ) + 0.22;
      arr[cursor++] = snappedZ - originZ;
      arr[cursor++] = x1 - originX;
      arr[cursor++] = getTerrainHeight(x1, snappedZ) + 0.22;
      arr[cursor++] = snappedZ - originZ;
    }

    // Z-axis alignment guide through snappedX
    for (let i = 0; i < segsPerAxis; i++) {
      const z0 = snappedZ - halfLen + i * step;
      const z1 = z0 + step;
      arr[cursor++] = snappedX - originX;
      arr[cursor++] = getTerrainHeight(snappedX, z0) + 0.22;
      arr[cursor++] = z0 - originZ;
      arr[cursor++] = snappedX - originX;
      arr[cursor++] = getTerrainHeight(snappedX, z1) + 0.22;
      arr[cursor++] = z1 - originZ;
    }

    this.axisPosAttr.needsUpdate = true;
    this.axisMat.color.setHex(
      !centerOk
        ? 0xf87171
        : snapped || centerState === 'replace_wall'
          ? 0xfacc15
          : centerState === 'bonus_water'
            ? 0x38bdf8
            : 0xfef08a
    );
  }

  private rebuildFootprintAndArrow(
    kind: StructureKind,
    snappedX: number,
    snappedZ: number,
    rotationY: number,
    originX: number,
    originZ: number,
    centerOk: boolean,
    snapped: boolean,
    centerState: PlacementCellState,
    isDrawingLine: boolean
  ): void {
    if (isDrawingLine) {
      this.footprintLines.visible = false;
      this.arrowMesh.visible = false;
      return;
    }
    this.footprintLines.visible = true;
    this.arrowMesh.visible = true;

    const spec = STRUCTURE_SPECS[kind];
    const hw = Math.max(1.2, (spec?.footprint.w ?? 3.4) * 0.5);
    const hd = Math.max(1.2, (spec?.footprint.d ?? 3.4) * 0.5);
    const cosR = Math.cos(rotationY);
    const sinR = Math.sin(rotationY);

    // Local (lx, lz) rotated around Y by rotationY -> world (lx*cosR + lz*sinR, -lx*sinR + lz*cosR)
    const toWorldX = (lx: number, lz: number) => snappedX + lx * cosR + lz * sinR;
    const toWorldZ = (lx: number, lz: number) => snappedZ - lx * sinR + lz * cosR;

    const arr = this.footprintPosAttr.array as Float32Array;
    let cursor = 0;
    const pushSeg = (ax: number, az: number, bx: number, bz: number, yOff = 0.26) => {
      arr[cursor++] = ax - originX;
      arr[cursor++] = getTerrainHeight(ax, az) + yOff;
      arr[cursor++] = az - originZ;
      arr[cursor++] = bx - originX;
      arr[cursor++] = getTerrainHeight(bx, bz) + yOff;
      arr[cursor++] = bz - originZ;
    };

    const corners: Array<[number, number]> = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ];

    // 4 perimeter sides subdivided into 2 segments each (8 segments total) for hill conformance
    for (let i = 0; i < 4; i++) {
      const [axL, azL] = corners[i];
      const [bxL, bzL] = corners[(i + 1) % 4];
      const mxL = (axL + bxL) * 0.5;
      const mzL = (azL + bzL) * 0.5;
      pushSeg(toWorldX(axL, azL), toWorldZ(axL, azL), toWorldX(mxL, mzL), toWorldZ(mxL, mzL), 0.26);
      pushSeg(toWorldX(mxL, mzL), toWorldZ(mxL, mzL), toWorldX(bxL, bzL), toWorldZ(bxL, bzL), 0.26);
    }

    // 4 outer L-bracket corner ticks (8 segments total)
    const pad = 0.28;
    const arm = Math.min(0.85, Math.min(hw, hd) * 0.45);
    const signs: Array<[number, number]> = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (let i = 0; i < 4; i++) {
      const [sx, sz] = signs[i];
      const cxL = sx * (hw + pad);
      const czL = sz * (hd + pad);
      pushSeg(
        toWorldX(cxL, czL),
        toWorldZ(cxL, czL),
        toWorldX(cxL - sx * arm, czL),
        toWorldZ(cxL - sx * arm, czL),
        0.3
      );
      pushSeg(
        toWorldX(cxL, czL),
        toWorldZ(cxL, czL),
        toWorldX(cxL, czL - sz * arm),
        toWorldZ(cxL, czL - sz * arm),
        0.3
      );
    }

    // 4 short vertical corner stakes (4 segments total -> 8 + 8 + 4 = 20 segments = 40 vertices)
    for (let i = 0; i < 4; i++) {
      const [lx, lz] = corners[i];
      const wx = toWorldX(lx, lz);
      const wz = toWorldZ(lx, lz);
      const gy = getTerrainHeight(wx, wz);
      arr[cursor++] = wx - originX;
      arr[cursor++] = gy + 0.12;
      arr[cursor++] = wz - originZ;
      arr[cursor++] = wx - originX;
      arr[cursor++] = gy + 0.95;
      arr[cursor++] = wz - originZ;
    }

    this.footprintPosAttr.needsUpdate = true;

    const frameHex = !centerOk
      ? 0xef4444
      : snapped || centerState === 'replace_wall'
        ? 0xfacc15
        : centerState === 'bonus_water'
          ? 0x38bdf8
          : 0x4ade80;
    this.footprintMat.color.setHex(frameHex);

    // Front-facing directional arrow chevron at local +Z side
    const tipX = toWorldX(0, hd + 1.25);
    const tipZ = toWorldZ(0, hd + 1.25);
    const leftX = toWorldX(-0.62, hd + 0.35);
    const leftZ = toWorldZ(-0.62, hd + 0.35);
    const rightX = toWorldX(0.62, hd + 0.35);
    const rightZ = toWorldZ(0.62, hd + 0.35);

    this.arrowPosAttr.setXYZ(0, tipX - originX, getTerrainHeight(tipX, tipZ) + 0.28, tipZ - originZ);
    this.arrowPosAttr.setXYZ(1, leftX - originX, getTerrainHeight(leftX, leftZ) + 0.28, leftZ - originZ);
    this.arrowPosAttr.setXYZ(2, rightX - originX, getTerrainHeight(rightX, rightZ) + 0.28, rightZ - originZ);
    this.arrowPosAttr.needsUpdate = true;
    this.arrowMat.color.setHex(centerOk ? 0xfef08a : 0xf87171);
  }

  public dispose(): void {
    this.cellsGeom.dispose();
    this.cellsMat.dispose();
    this.gridLinesGeom.dispose();
    this.gridLinesMat.dispose();
    this.axisGeom.dispose();
    this.axisMat.dispose();
    this.footprintGeom.dispose();
    this.footprintMat.dispose();
    this.arrowGeom.dispose();
    this.arrowMat.dispose();
    this.snapTetherGeom.dispose();
    this.snapTetherMat.dispose();
  }
}
