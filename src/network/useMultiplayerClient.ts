import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BannerPatternKind,
  CameraTransform,
  CombatEvent,
  CultureKind,
  DiplomacyRelation,
  MarchWaypoint,
  MatchStatusState,
  NetworkPacket,
  PacketLogEntry,
  PacketType,
  PveDifficulty,
  PveTheaterState,
  StructureKind,
  UnitKind,
  WorldDirectorConfig,
  WorldState,
} from '../shared/protocol';
import { ClimateKind, WORLD_MAP_SIZE } from '../shared/worldMap';

export interface MatchOutcomeEvent {
  outcome: 'victory' | 'defeat';
  winnerPlayerId?: string;
  winnerNameAr?: string;
  reasonAr?: string;
}

interface UseMultiplayerOptions {
  clientLabel?: string;
  enabled?: boolean;
}

export function useMultiplayerClient(options: UseMultiplayerOptions = {}) {
  const { clientLabel, enabled = true } = options;

  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [tickRateHz, setTickRateHz] = useState<number>(20);
  const [rttMs, setRttMs] = useState<number>(0);
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [packetLogs, setPacketLogs] = useState<PacketLogEntry[]>([]);
  const [lastAckMessage, setLastAckMessage] = useState<string>('جاهز للاتصال بالخادم...');
  const [matchEvent, setMatchEvent] = useState<MatchOutcomeEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef<number>(1);
  const rttRef = useRef<number>(12);
  const worldRef = useRef<WorldState | null>(null);
  const bytesAccRef = useRef<{ inBytes: number; outBytes: number }>({ inBytes: 0, outBytes: 0 });
  const lastCameraSyncRef = useRef<number>(0);

  const clearMatchEvent = useCallback(() => {
    setMatchEvent(null);
  }, []);

  const appendPacketLog = useCallback(
    (direction: 'IN' | 'OUT', pkt: NetworkPacket<unknown>, rawBytes: number, summary: string) => {
      if (pkt.type === 'S2C_STATE_DELTA' && pkt.seq % 25 !== 0) {
        return;
      }
      if (pkt.type === 'C2S_CAMERA_SYNC' && pkt.seq % 8 !== 0) {
        return;
      }
      setPacketLogs((prev) => {
        const entry: PacketLogEntry = {
          id: `${direction}_${pkt.seq}_${pkt.timestamp}_${Math.random().toString(36).slice(2, 6)}`,
          direction,
          seq: pkt.seq,
          type: pkt.type,
          bytes: rawBytes,
          timestamp: pkt.timestamp,
          summary,
        };
        return [entry, ...prev.slice(0, 39)];
      });
    },
    []
  );

  const sendPacket = useCallback(
    <T,>(type: PacketType, payload: T, summaryText: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const pkt: NetworkPacket<T> = {
        seq: seqRef.current++,
        type,
        timestamp: Date.now(),
        payload,
      };
      const raw = JSON.stringify(pkt);
      bytesAccRef.current.outBytes += raw.length;
      ws.send(raw);
      appendPacketLog('OUT', pkt, raw.length, summaryText);
    },
    [appendPacketLog]
  );

  useEffect(() => {
    if (!enabled) return;

    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;
    let uiFlushTimer: number | undefined;
    let lastUiStateCommitMs = 0;
    let isUnmounted = false;

    const commitWorldStateToUi = (nextWorld: WorldState, immediate: boolean) => {
      const now = performance.now();
      if (immediate || now - lastUiStateCommitMs >= 240) {
        if (uiFlushTimer !== undefined) {
          window.clearTimeout(uiFlushTimer);
          uiFlushTimer = undefined;
        }
        lastUiStateCommitMs = now;
        setWorldState(nextWorld);
      } else if (uiFlushTimer === undefined) {
        const waitMs = Math.max(30, 240 - (now - lastUiStateCommitMs));
        uiFlushTimer = window.setTimeout(() => {
          uiFlushTimer = undefined;
          if (!isUnmounted && worldRef.current) {
            lastUiStateCommitMs = performance.now();
            setWorldState(worldRef.current);
          }
        }, waitMs);
      }
    };

    const sessionStorageKey = clientLabel
      ? `thar_ahmed_session_token_${clientLabel}`
      : 'thar_ahmed_session_token_v1';

    function connect() {
      if (isUnmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams();
      try {
        const savedToken = window.sessionStorage.getItem(sessionStorageKey);
        if (savedToken) params.set('sessionToken', savedToken);
        const savedAdminKey = window.sessionStorage.getItem('thar_ahmed_admin_key_v1');
        if (savedAdminKey) params.set('adminKey', savedAdminKey);
      } catch {
        // Ignore sessionStorage restriction
      }
      const queryStr = params.toString();
      const wsUrl = `${protocol}//${window.location.host}/ws${queryStr ? `?${queryStr}` : ''}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmounted) return;
        setConnected(true);
        if (clientLabel) {
          sendPacket('C2S_HANDSHAKE', { name: clientLabel }, `مصافحة العميل (${clientLabel})`);
        }
      };

      ws.onmessage = (event) => {
        if (isUnmounted) return;
        const raw = String(event.data);
        bytesAccRef.current.inBytes += raw.length;

        try {
          const pkt = JSON.parse(raw) as NetworkPacket<Record<string, unknown>>;

          switch (pkt.type) {
            case 'S2C_WELCOME': {
              const pid = String(pkt.payload.playerId);
              const nextToken =
                typeof pkt.payload.sessionToken === 'string' ? pkt.payload.sessionToken : '';
              if (nextToken) {
                try {
                  window.sessionStorage.setItem(sessionStorageKey, nextToken);
                } catch {
                  // Ignore storage restriction
                }
              }
              const rate = Number(pkt.payload.tickRateHz || 20);
              const rawWorld = (pkt.payload.world || {}) as Partial<WorldState>;
              const world: WorldState = {
                tick: Number(rawWorld.tick ?? 0),
                serverTime: Number(rawWorld.serverTime ?? Date.now()),
                mapSize: Number(rawWorld.mapSize ?? WORLD_MAP_SIZE),
                climate: (rawWorld.climate as ClimateKind) ?? 'temperate_clear',
                autoCycleClimate:
                  typeof rawWorld.autoCycleClimate === 'boolean'
                    ? rawWorld.autoCycleClimate
                    : true,
                players: rawWorld.players ?? {},
                structures: rawWorld.structures ?? {},
                units: rawWorld.units ?? {},
                resourceNodes: rawWorld.resourceNodes ?? {},
                pveTheater: rawWorld.pveTheater,
                combatEvents: rawWorld.combatEvents ?? [],
                diplomacy: rawWorld.diplomacy ?? {},
                directorConfig: rawWorld.directorConfig,
                matchStatus: rawWorld.matchStatus,
              };
              setPlayerId(pid);
              setTickRateHz(rate);
              worldRef.current = world;
              setWorldState(world);
              setLastAckMessage(`متصل بالخادم — معرف الجلسة: ${pid}`);
              appendPacketLog('IN', pkt, raw.length, `تهيئة الجلسة (${pid})`);
              break;
            }

            case 'S2C_WORLD_SNAPSHOT': {
              const rawWorld = (pkt.payload.world || {}) as Partial<WorldState>;
              const world: WorldState = {
                tick: Number(rawWorld.tick ?? 0),
                serverTime: Number(rawWorld.serverTime ?? Date.now()),
                mapSize: Number(rawWorld.mapSize ?? WORLD_MAP_SIZE),
                climate: (rawWorld.climate as ClimateKind) ?? 'temperate_clear',
                autoCycleClimate:
                  typeof rawWorld.autoCycleClimate === 'boolean'
                    ? rawWorld.autoCycleClimate
                    : true,
                players: rawWorld.players ?? {},
                structures: rawWorld.structures ?? {},
                units: rawWorld.units ?? {},
                resourceNodes: rawWorld.resourceNodes ?? {},
                pveTheater: rawWorld.pveTheater,
                combatEvents: rawWorld.combatEvents ?? [],
                diplomacy: rawWorld.diplomacy ?? {},
                directorConfig: rawWorld.directorConfig,
                matchStatus: rawWorld.matchStatus,
              };
              const reason = String(pkt.payload.reason || 'تحديث شامل للخريطة');
              worldRef.current = world;
              setWorldState(world);
              setLastAckMessage(reason);
              appendPacketLog('IN', pkt, raw.length, reason);
              break;
            }

            case 'S2C_STATE_DELTA': {
              const prevWorld = worldRef.current;
              const nextWorld: WorldState = {
                tick: Number(pkt.payload.tick ?? prevWorld?.tick ?? 0),
                serverTime: Number(pkt.payload.serverTime ?? Date.now()),
                mapSize: prevWorld?.mapSize ?? WORLD_MAP_SIZE,
                climate:
                  (pkt.payload.climate as ClimateKind) ??
                  prevWorld?.climate ??
                  'temperate_clear',
                autoCycleClimate:
                  typeof pkt.payload.autoCycleClimate === 'boolean'
                    ? pkt.payload.autoCycleClimate
                    : (prevWorld?.autoCycleClimate ?? true),
                players:
                  (pkt.payload.players as WorldState['players']) ??
                  prevWorld?.players ??
                  {},
                units:
                  (pkt.payload.units as WorldState['units']) ??
                  prevWorld?.units ??
                  {},
                structures:
                  (pkt.payload.structures as WorldState['structures']) ??
                  prevWorld?.structures ??
                  {},
                resourceNodes:
                  (pkt.payload.resourceNodes as WorldState['resourceNodes']) ??
                  prevWorld?.resourceNodes ??
                  {},
                pveTheater:
                  (pkt.payload.pveTheater as PveTheaterState | undefined) ?? prevWorld?.pveTheater,
                combatEvents: (pkt.payload.combatEvents as CombatEvent[] | undefined) ?? [],
                diplomacy:
                  (pkt.payload.diplomacy as Record<string, DiplomacyRelation> | undefined) ??
                  prevWorld?.diplomacy,
                directorConfig:
                  (pkt.payload.directorConfig as WorldDirectorConfig | undefined) ??
                  prevWorld?.directorConfig,
                matchStatus:
                  (pkt.payload.matchStatus as MatchStatusState | undefined) ??
                  prevWorld?.matchStatus,
              };
              worldRef.current = nextWorld;
              const hasImportantUiChange =
                Boolean(pkt.payload.structures) ||
                (nextWorld.combatEvents?.length ?? 0) > 0 ||
                nextWorld.climate !== prevWorld?.climate ||
                nextWorld.matchStatus?.status !== prevWorld?.matchStatus?.status ||
                Object.keys(nextWorld.players).length !== Object.keys(prevWorld?.players ?? {}).length;
              commitWorldStateToUi(nextWorld, hasImportantUiChange);
              appendPacketLog(
                'IN',
                pkt,
                raw.length,
                `تحديث مضغوط Tick #${nextWorld.tick} (${raw.length} بايت)`
              );
              break;
            }

            case 'S2C_MATCH_EVENT': {
              const outcome = pkt.payload.outcome === 'victory' ? 'victory' : 'defeat';
              setMatchEvent({
                outcome,
                winnerPlayerId:
                  typeof pkt.payload.winnerPlayerId === 'string'
                    ? pkt.payload.winnerPlayerId
                    : undefined,
                winnerNameAr:
                  typeof pkt.payload.winnerNameAr === 'string'
                    ? pkt.payload.winnerNameAr
                    : undefined,
                reasonAr:
                  typeof pkt.payload.reasonAr === 'string' ? pkt.payload.reasonAr : undefined,
              });
              appendPacketLog('IN', pkt, raw.length, `نتيجة المعركة: ${outcome}`);
              break;
            }

            case 'S2C_PONG': {
              const sentAt = Number(pkt.payload.clientTime || Date.now());
              const measuredRtt = Math.max(1, Date.now() - sentAt);
              rttRef.current = measuredRtt;
              setRttMs(measuredRtt);
              appendPacketLog('IN', pkt, raw.length, `نبضة اتصال RTT=${measuredRtt}ms`);
              break;
            }

            case 'S2C_PACKET_ACK': {
              const msg = String(pkt.payload.message || 'تم استلام الحزمة');
              setLastAckMessage(msg);
              appendPacketLog('IN', pkt, raw.length, msg);
              break;
            }
          }
        } catch (err) {
          console.error('Failed to parse server packet:', err);
        }
      };

      ws.onclose = () => {
        if (isUnmounted) return;
        setConnected(false);
        setLastAckMessage('انقطع الاتصال بالخادم — جارٍ إعادة المحاولة...');
        reconnectTimer = window.setTimeout(connect, 1500);
      };
    }

    connect();

    pingTimer = window.setInterval(() => {
      sendPacket(
        'C2S_PING',
        { clientTime: Date.now(), lastRttMs: rttRef.current },
        'فحص زمن الاستجابة (PING)'
      );
    }, 2000);

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (uiFlushTimer) clearTimeout(uiFlushTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [clientLabel, enabled, appendPacketLog, sendPacket]);

  const syncCamera = useCallback(
    (cam: CameraTransform) => {
      const now = Date.now();
      if (now - lastCameraSyncRef.current < 90) return;
      lastCameraSyncRef.current = now;
      sendPacket(
        'C2S_CAMERA_SYNC',
        cam,
        `مزامنة كاميرا (${Math.round(cam.targetX)}, ${Math.round(cam.targetZ)})`
      );
    },
    [sendPacket]
  );

  const placeStructure = useCallback(
    (kind: StructureKind, x: number, z: number, rotationY = 0, culture?: CultureKind) => {
      sendPacket(
        'C2S_PLACE_STRUCTURE',
        { kind, x, z, rotationY, culture },
        `طلب بناء ${kind} عند (${Math.round(x)}, ${Math.round(z)})`
      );
    },
    [sendPacket]
  );

  const placeFortBatch = useCallback(
    (
      items: Array<{
        kind: StructureKind;
        x: number;
        z: number;
        rotationY: number;
        culture?: CultureKind;
      }>
    ) => {
      if (items.length === 0) return;
      sendPacket(
        'C2S_PLACE_FORT_BATCH',
        { items },
        `تشييد صف تحصينات (${items.length} قطعة)`
      );
    },
    [sendPacket]
  );

  const setCulture = useCallback(
    (
      culture: CultureKind,
      applyToExisting = true,
      extra?: { structureId?: string; adaptAllToBiomes?: boolean }
    ) => {
      sendPacket(
        'C2S_SET_CULTURE',
        {
          culture,
          applyToExisting,
          structureId: extra?.structureId,
          adaptAllToBiomes: extra?.adaptAllToBiomes,
        },
        extra?.adaptAllToBiomes
          ? 'تكييف جميع المباني تلقائياً مع بيئاتها المحلية'
          : extra?.structureId
            ? `تكييف المبنى (${extra.structureId}) إلى الطراز (${culture})`
            : `تغيير الطراز المعماري (${culture})`
      );
    },
    [sendPacket]
  );

  const upgradeStructure = useCallback(
    (structureId: string) => {
      sendPacket(
        'C2S_UPGRADE_STRUCTURE',
        { structureId },
        `طلب تطوير المبنى (${structureId})`
      );
    },
    [sendPacket]
  );

  const spawnUnit = useCallback(
    (kind: UnitKind, structureId?: string) => {
      sendPacket(
        'C2S_SPAWN_UNIT',
        { kind, structureId },
        `طلب تدريب وحدة (${kind})${structureId ? ` في المعسكر (${structureId})` : ''}`
      );
    },
    [sendPacket]
  );

  const moveUnits = useCallback(
    (unitIds: string[], targetX: number, targetZ: number, resourceId?: string) => {
      if (unitIds.length === 0) return;
      sendPacket(
        'C2S_MOVE_UNITS',
        { unitIds, targetX, targetZ, resourceId },
        `أمر تحريك (${unitIds.length}) وحدات إلى (${Math.round(targetX)}, ${Math.round(targetZ)})`
      );
    },
    [sendPacket]
  );

  const dispatchAtlasMarch = useCallback(
    (unitIds: string[], waypoints: MarchWaypoint[]) => {
      if (unitIds.length === 0 || waypoints.length === 0) return;
      const dest = waypoints[waypoints.length - 1];
      sendPacket(
        'C2S_ATLAS_DISPATCH',
        { unitIds, waypoints },
        `حملة عسكرية عبر الأطلس (${unitIds.length} وحدة · ${waypoints.length} نقاط عبور إلى ${Math.round(dest.x / 1000)}كم)`
      );
    },
    [sendPacket]
  );

  const updatePlayerName = useCallback(
    (
      name: string,
      heraldry?: {
        primaryColor?: string;
        secondaryColor?: string;
        bannerPattern?: BannerPatternKind;
      }
    ) => {
      sendPacket(
        'C2S_HANDSHAKE',
        {
          name,
          primaryColor: heraldry?.primaryColor,
          secondaryColor: heraldry?.secondaryColor,
          bannerPattern: heraldry?.bannerPattern,
        },
        `تحديث هوية وراية المملكة (${name})`
      );
    },
    [sendPacket]
  );

  const resetWorld = useCallback(() => {
    sendPacket('C2S_RESET_WORLD', {}, 'إعادة تهيئة عالم الـ Blockout');
  }, [sendPacket]);

  const setClimate = useCallback(
    (climate?: ClimateKind, autoCycleClimate?: boolean) => {
      sendPacket(
        'C2S_SET_CLIMATE',
        { climate, autoCycleClimate },
        `تغيير حالة المناخ (${climate ?? 'تلقائي'})`
      );
    },
    [sendPacket]
  );

  const tradeResource = useCallback(
    (
      action: 'buy' | 'sell',
      resource: 'wood' | 'stone' | 'food' | 'cloth' | 'horses',
      amount = 100
    ) => {
      sendPacket(
        'C2S_TRADE_RESOURCE',
        { action, resource, amount },
        `تبادل السوق (${action === 'sell' ? 'بيع' : 'شراء'} ${amount} ${resource})`
      );
    },
    [sendPacket]
  );

  const hydrateFromCloud = useCallback(
    (payload: {
      idToken?: string;
      displayName: string;
      factionName?: string;
      primaryColor?: string;
      secondaryColor?: string;
      bannerPattern?: BannerPatternKind;
      culture?: CultureKind;
    }) => {
      sendPacket(
        'C2S_HYDRATE_FROM_CLOUD',
        payload,
        `مزامنة قاعدة ${payload.displayName} من الحفظ السحابي`
      );
    },
    [sendPacket]
  );

  const demolishStructure = useCallback(
    (structureId: string) => {
      sendPacket('C2S_DEMOLISH_STRUCTURE', { structureId }, `هدم المبنى (${structureId})`);
    },
    [sendPacket]
  );

  const queueUnit = useCallback(
    (unitKind: UnitKind, campId?: string) => {
      sendPacket('C2S_QUEUE_UNIT', { unitKind, campId }, `إضافة ${unitKind} لطابور التدريب`);
    },
    [sendPacket]
  );

  const cancelTraining = useCallback(
    (itemId: string) => {
      sendPacket('C2S_CANCEL_TRAINING', { itemId }, `إلغاء تدريب وحدة`);
    },
    [sendPacket]
  );

  const sendDiplomacyAction = useCallback(
    (
      targetId: string,
      action: 'declare_war' | 'propose_ally' | 'accept_ally' | 'break_ally' | 'set_neutral'
    ) => {
      sendPacket('C2S_DIPLOMACY_ACTION', { targetId, action }, `إجراء دبلوماسي (${action})`);
    },
    [sendPacket]
  );

  const claimRole = useCallback(
    (role: 'sultan_hassan') => {
      sendPacket('C2S_CLAIM_ROLE', { role }, 'طلب تولي عرش السلطان حسن');
    },
    [sendPacket]
  );

  const attackTarget = useCallback(
    (
      unitIds: string[],
      opts: {
        targetUnitId?: string;
        targetStructureId?: string;
        targetX?: number;
        targetZ?: number;
        attackMove?: boolean;
      }
    ) => {
      if (unitIds.length === 0) return;
      sendPacket(
        'C2S_ATTACK_TARGET',
        { unitIds, ...opts },
        opts.targetUnitId
          ? `أمر هجوم على وحدة معادية (${unitIds.length})`
          : opts.targetStructureId
            ? `أمر حصار مبنى معادٍ (${unitIds.length})`
            : `تقدم هجومي لـ ${unitIds.length} وحدة`
      );
    },
    [sendPacket]
  );

  const setUnitStance = useCallback(
    (unitIds: string[], action: 'stop' | 'aggressive' | 'defensive' | 'stand') => {
      if (unitIds.length === 0) return;
      sendPacket('C2S_UNIT_STANCE', { unitIds, action }, `أمر تكتيكي (${action})`);
    },
    [sendPacket]
  );

  const repairStructure = useCallback(
    (unitIds: string[], structureId: string) => {
      if (unitIds.length === 0) return;
      sendPacket('C2S_REPAIR_STRUCTURE', { unitIds, structureId }, `ترميم المبنى (${structureId})`);
    },
    [sendPacket]
  );

  const deployPveFronts = useCallback(
    (difficulty: PveDifficulty, strongholdCount: number, replenishOnly = true) => {
      sendPacket(
        'C2S_SPAWN_PVE_FRONTS',
        { difficulty, strongholdCount, replenishOnly },
        `تحديث أوكار قطاع الطرق (${strongholdCount} أوكار · ${difficulty})`
      );
    },
    [sendPacket]
  );

  const reclaimKeep = useCallback(() => {
    sendPacket('C2S_RECLAIM_KEEP', {}, 'إعادة تأسيس المعقل والحامية');
  }, [sendPacket]);

  const toggleGate = useCallback(
    (structureId: string) => {
      sendPacket('C2S_TOGGLE_GATE', { structureId }, `تبديل مزلاج البوابة (${structureId})`);
    },
    [sendPacket]
  );

  return {
    connected,
    playerId,
    tickRateHz,
    rttMs,
    worldState,
    worldRef,
    packetLogs,
    lastAckMessage,
    matchEvent,
    clearMatchEvent,
    syncCamera,
    placeStructure,
    placeFortBatch,
    demolishStructure,
    setCulture,
    upgradeStructure,
    spawnUnit,
    queueUnit,
    cancelTraining,
    moveUnits,
    attackTarget,
    setUnitStance,
    repairStructure,
    toggleGate,
    deployPveFronts,
    sendDiplomacyAction,
    claimRole,
    reclaimKeep,
    dispatchAtlasMarch,
    tradeResource,
    updatePlayerName,
    resetWorld,
    setClimate,
    hydrateFromCloud,
  };
}
