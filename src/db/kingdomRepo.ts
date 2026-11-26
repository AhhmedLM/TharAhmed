import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  kingdomSnapshots,
  users,
  worldResourceDeltas,
  worldStructures,
  worldUnits,
} from './schema.ts';
import { getSectorCoords } from '../shared/worldMap.ts';
import type {
  BannerPatternKind,
  BlockoutStructure,
  BlockoutUnit,
  CultureKind,
  PlayerResources,
  PlayerState,
} from '../shared/protocol.ts';

export interface KingdomSavePayload {
  displayName: string;
  factionName: string;
  primaryColor: string;
  secondaryColor: string;
  bannerPattern: BannerPatternKind;
  culture: CultureKind;
  resources: PlayerResources;
  structures: BlockoutStructure[];
  units: BlockoutUnit[];
  camera: PlayerState['camera'];
}

export async function getOrCreateUser(uid: string, email: string) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function loadKingdomByUid(uid: string, email: string) {
  try {
    const userRow = await getOrCreateUser(uid, email);
    const rows = await db
      .select()
      .from(kingdomSnapshots)
      .innerJoin(users, eq(kingdomSnapshots.userId, users.id))
      .where(eq(users.uid, userRow.uid));

    if (rows.length === 0) {
      return null;
    }

    const snap = rows[0].kingdom_snapshots;
    return {
      displayName: snap.displayName,
      factionName: snap.factionName,
      primaryColor: snap.primaryColor,
      secondaryColor: snap.secondaryColor,
      bannerPattern: snap.bannerPattern,
      culture: snap.culture,
      resources: snap.resourcesJson,
      structures: snap.structuresJson,
      units: snap.unitsJson,
      camera: snap.cameraJson,
      updatedAt: snap.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error('Database kingdom load failed:', error);
    throw new Error('Failed to load kingdom save.', { cause: error });
  }
}

export async function saveKingdomByUid(
  uid: string,
  email: string,
  payload: KingdomSavePayload
) {
  try {
    const userRow = await getOrCreateUser(uid, email);
    const now = new Date();
    const result = await db
      .insert(kingdomSnapshots)
      .values({
        userId: userRow.id,
        displayName: payload.displayName,
        factionName: payload.factionName,
        primaryColor: payload.primaryColor,
        secondaryColor: payload.secondaryColor,
        bannerPattern: payload.bannerPattern,
        culture: payload.culture,
        resourcesJson: payload.resources,
        structuresJson: payload.structures,
        unitsJson: payload.units,
        cameraJson: payload.camera,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: kingdomSnapshots.userId,
        set: {
          displayName: payload.displayName,
          factionName: payload.factionName,
          primaryColor: payload.primaryColor,
          secondaryColor: payload.secondaryColor,
          bannerPattern: payload.bannerPattern,
          culture: payload.culture,
          resourcesJson: payload.resources,
          structuresJson: payload.structures,
          unitsJson: payload.units,
          cameraJson: payload.camera,
          updatedAt: now,
        },
      })
      .returning();

    // Sync spatially indexed world_structures and world_units tables
    await db.delete(worldStructures).where(eq(worldStructures.ownerUid, uid));
    if (payload.structures.length > 0) {
      const structRows = payload.structures.map((st) => {
        const { sx, sz } = getSectorCoords(st.x, st.z);
        return {
          id: `${uid}_${st.id}`,
          ownerUid: uid,
          sectorX: sx,
          sectorZ: sz,
          x: st.x,
          z: st.z,
          kind: st.kind,
          culture: st.culture ?? payload.culture,
          level: st.level ?? 1,
          hp: Math.round(st.hp),
          maxHp: Math.round(st.maxHp),
          rotationY: st.rotationY ?? 0,
          isConstructing: Boolean(st.isConstructing),
          constructionProgress: st.constructionProgress ?? 100,
          dataJson: st,
          updatedAt: now,
        };
      });
      await db.insert(worldStructures).values(structRows).onConflictDoNothing();
    }

    await db.delete(worldUnits).where(eq(worldUnits.ownerUid, uid));
    if (payload.units.length > 0) {
      const unitRows = payload.units.map((u) => {
        const { sx, sz } = getSectorCoords(u.x, u.z);
        return {
          id: `${uid}_${u.id}`,
          ownerUid: uid,
          sectorX: sx,
          sectorZ: sz,
          x: u.x,
          z: u.z,
          targetX: u.targetX,
          targetZ: u.targetZ,
          kind: u.kind,
          speed: u.speed,
          state: u.state,
          waypointsJson: u.waypoints ?? null,
          departedAtMs: u.departedAtMs ?? null,
          etaServerMs: u.etaServerMs ?? null,
          marchOrderLabelAr: u.marchOrderLabelAr ?? null,
          dataJson: u,
          updatedAt: now,
        };
      });
      await db.insert(worldUnits).values(unitRows).onConflictDoNothing();
    }

    const saved = result[0];
    return {
      displayName: saved.displayName,
      structuresCount: saved.structuresJson.length,
      unitsCount: saved.unitsJson.length,
      updatedAt: saved.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error('Database kingdom save failed:', error);
    throw new Error('Failed to save kingdom state.', { cause: error });
  }
}

export async function deleteKingdomByUid(uid: string, email: string) {
  try {
    const userRow = await getOrCreateUser(uid, email);
    await db
      .delete(kingdomSnapshots)
      .where(eq(kingdomSnapshots.userId, userRow.id));
    await db.delete(worldStructures).where(eq(worldStructures.ownerUid, uid));
    await db.delete(worldUnits).where(eq(worldUnits.ownerUid, uid));
    return { deleted: true };
  } catch (error) {
    console.error('Database kingdom delete failed:', error);
    throw new Error('Failed to reset kingdom state.', { cause: error });
  }
}

export async function loadAllResourceDeltas(): Promise<Record<string, number>> {
  try {
    const rows = await db.select().from(worldResourceDeltas);
    const map: Record<string, number> = {};
    for (const r of rows) {
      map[r.nodeId] = r.remainingAmount;
    }
    return map;
  } catch (error) {
    console.warn('Could not load resource deltas yet:', error);
    return {};
  }
}

export async function upsertResourceDeltas(
  deltas: Array<{
    nodeId: string;
    sectorX: number;
    sectorZ: number;
    remainingAmount: number;
  }>
) {
  if (deltas.length === 0) return;
  try {
    const now = new Date();
    for (const d of deltas) {
      await db
        .insert(worldResourceDeltas)
        .values({
          nodeId: d.nodeId,
          sectorX: d.sectorX,
          sectorZ: d.sectorZ,
          remainingAmount: d.remainingAmount,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: worldResourceDeltas.nodeId,
          set: {
            remainingAmount: d.remainingAmount,
            updatedAt: now,
          },
        });
    }
  } catch (error) {
    console.warn('Resource delta persistence warning:', error);
  }
}
