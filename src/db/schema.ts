import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type {
  BannerPatternKind,
  BlockoutStructure,
  BlockoutUnit,
  CultureKind,
  MarchWaypoint,
  PlayerResources,
  PlayerState,
  StructureKind,
  UnitKind,
} from '../shared/protocol.ts';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const kingdomSnapshots = pgTable('kingdom_snapshots', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull()
    .unique(),
  displayName: text('display_name').notNull(),
  factionName: text('faction_name').notNull(),
  primaryColor: text('primary_color').notNull().default('#0d9488'),
  secondaryColor: text('secondary_color').notNull().default('#fbbf24'),
  bannerPattern: text('banner_pattern').$type<BannerPatternKind>().notNull().default('crescent_star'),
  culture: text('culture').$type<CultureKind>().notNull().default('iraqi_mesopotamian'),
  resourcesJson: jsonb('resources_json').$type<PlayerResources>().notNull(),
  structuresJson: jsonb('structures_json').$type<BlockoutStructure[]>().notNull(),
  unitsJson: jsonb('units_json').$type<BlockoutUnit[]>().notNull(),
  cameraJson: jsonb('camera_json').$type<PlayerState['camera']>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Spatial Persistence Table for Structures across 256m Sectors (100 x 100 km continent)
 */
export const worldStructures = pgTable(
  'world_structures',
  {
    id: text('id').primaryKey(),
    ownerUid: text('owner_uid').notNull(),
    sectorX: integer('sector_x').notNull(),
    sectorZ: integer('sector_z').notNull(),
    x: doublePrecision('x').notNull(),
    z: doublePrecision('z').notNull(),
    kind: text('kind').$type<StructureKind>().notNull(),
    culture: text('culture').$type<CultureKind>().notNull().default('iraqi_mesopotamian'),
    level: integer('level').notNull().default(1),
    hp: integer('hp').notNull(),
    maxHp: integer('max_hp').notNull(),
    rotationY: doublePrecision('rotation_y').notNull().default(0),
    isConstructing: boolean('is_constructing').notNull().default(false),
    constructionProgress: doublePrecision('construction_progress').notNull().default(100),
    dataJson: jsonb('data_json').$type<BlockoutStructure>().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('world_structures_sector_idx').on(table.sectorX, table.sectorZ),
    index('world_structures_owner_idx').on(table.ownerUid),
  ]
);

/**
 * Spatial Persistence Table for Units & Persistent Long-Range Atlas Expeditions
 */
export const worldUnits = pgTable(
  'world_units',
  {
    id: text('id').primaryKey(),
    ownerUid: text('owner_uid').notNull(),
    sectorX: integer('sector_x').notNull(),
    sectorZ: integer('sector_z').notNull(),
    x: doublePrecision('x').notNull(),
    z: doublePrecision('z').notNull(),
    targetX: doublePrecision('target_x').notNull(),
    targetZ: doublePrecision('target_z').notNull(),
    kind: text('kind').$type<UnitKind>().notNull(),
    speed: doublePrecision('speed').notNull(),
    state: text('state').notNull().default('idle'),
    waypointsJson: jsonb('waypoints_json').$type<MarchWaypoint[]>(),
    departedAtMs: doublePrecision('departed_at_ms'),
    etaServerMs: doublePrecision('eta_server_ms'),
    marchOrderLabelAr: text('march_order_label_ar'),
    dataJson: jsonb('data_json').$type<BlockoutUnit>().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('world_units_sector_idx').on(table.sectorX, table.sectorZ),
    index('world_units_owner_idx').on(table.ownerUid),
  ]
);

/**
 * Delta Store for Procedural Sector Resource Nodes (only harvested/depleted nodes are stored)
 */
export const worldResourceDeltas = pgTable(
  'world_resource_deltas',
  {
    nodeId: text('node_id').primaryKey(),
    sectorX: integer('sector_x').notNull(),
    sectorZ: integer('sector_z').notNull(),
    remainingAmount: integer('remaining_amount').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('world_resource_deltas_sector_idx').on(table.sectorX, table.sectorZ)]
);

export const usersRelations = relations(users, ({ one }) => ({
  kingdom: one(kingdomSnapshots, {
    fields: [users.id],
    references: [kingdomSnapshots.userId],
  }),
}));

export const kingdomSnapshotsRelations = relations(kingdomSnapshots, ({ one }) => ({
  owner: one(users, {
    fields: [kingdomSnapshots.userId],
    references: [users.id],
  }),
}));
