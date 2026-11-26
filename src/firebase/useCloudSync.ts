import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from './firebaseClient';
import {
  normalizeCultureKind,
  type BannerPatternKind,
  type CultureKind,
  type StructureKind,
  type UnitKind,
  type WorldState,
} from '../shared/protocol';

interface HydrateCloudPayload {
  idToken?: string;
  displayName: string;
  factionName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  bannerPattern?: BannerPatternKind;
  culture?: CultureKind;
}

interface UseCloudSyncOptions {
  playerId: string | null;
  worldRef: React.MutableRefObject<WorldState | null>;
  onHydrateServerFromCloud: (payload: HydrateCloudPayload) => void;
}

const LOCAL_BACKUP_KEY = 'thar_ahmed_local_kingdom_v1';

export function useCloudSync({
  playerId,
  worldRef,
  onHydrateServerFromCloud,
}: UseCloudSyncOptions) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<string>(
    'غير مسجل — العب محلياً أو اربط حسابك للحفظ الدائم'
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [cloudStructuresCount, setCloudStructuresCount] = useState<number>(0);
  const [cloudUnitsCount, setCloudUnitsCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const hydratedUidRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const isSavingRef = useRef<boolean>(false);

  const saveLocalBackup = useCallback(
    (uid: string) => {
      try {
        const world = worldRef.current;
        if (!world || !playerId) return;
        const me = world.players?.[playerId];
        if (!me) return;
        const myStructures = Object.values(world.structures ?? {}).filter(
          (s) => s.ownerId === playerId
        );
        const myUnits = Object.values(world.units ?? {}).filter(
          (u) => u.ownerId === playerId
        );
        localStorage.setItem(
          `${LOCAL_BACKUP_KEY}_${uid}`,
          JSON.stringify({
            displayName: me.name || 'قائد الحصن',
            factionName: me.factionName || me.name || 'قائد الحصن',
            primaryColor: me.color,
            secondaryColor: me.secondaryColor ?? '#fbbf24',
            bannerPattern: me.bannerPattern ?? 'crescent_star',
            culture: normalizeCultureKind(me.culture),
            resources: me.resources,
            structures: myStructures,
            units: myUnits,
            camera: me.camera,
            savedAt: new Date().toLocaleTimeString('ar-EG'),
          })
        );
        setCloudStructuresCount(myStructures.length);
        setCloudUnitsCount(myUnits.length);
      } catch {
        // Ignore browser storage limits
      }
    },
    [playerId, worldRef]
  );

  // Track Firebase Authentication state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        hydratedUidRef.current = null;
        setCloudStatus('غير مسجل — العب محلياً أو سجل دخولك لحفظ قاعدتك بشكل دائم');
      } else {
        setCloudStatus(`متصل بحساب (${currentUser.displayName || 'قائد الحصن'})`);
      }
    });
    return () => unsub();
  }, []);

  // Save current live commander kingdom snapshot to the backend API
  const saveCurrentWorldToCloud = useCallback(
    async (activeUser?: User | null) => {
      const targetUser = activeUser ?? user;
      const world = worldRef.current;
      if (!targetUser || !world || !playerId || isSavingRef.current) return;

      const uid = targetUser.uid;
      saveLocalBackup(uid);

      const me = world.players?.[playerId];
      if (!me) return;

      const myStructures = Object.values(world.structures ?? {}).filter(
        (s) => s.ownerId === playerId
      );
      const myUnits = Object.values(world.units ?? {}).filter(
        (u) => u.ownerId === playerId
      );

      isSavingRef.current = true;
      setIsSyncing(true);

      try {
        const token = await targetUser.getIdToken();
        const displayName = (me.name || targetUser.displayName || 'قائد الحصن')
          .trim()
          .slice(0, 40);
        const factionName = (me.factionName || displayName).trim().slice(0, 60);

        const res = await fetch('/api/kingdom', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            displayName,
            factionName,
            primaryColor: me.color,
            secondaryColor: me.secondaryColor ?? '#fbbf24',
            bannerPattern: me.bannerPattern ?? 'crescent_star',
            culture: normalizeCultureKind(me.culture),
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        setCloudStructuresCount(myStructures.length);
        setCloudUnitsCount(myUnits.length);
        setLastSyncedAt(new Date().toLocaleTimeString('ar-EG'));
        setCloudStatus('تم حفظ المملكة والموارد والجيوش على الخادم الدائم بنجاح');
      } catch (err) {
        console.warn('Cloud kingdom save warning:', err);
        setLastSyncedAt(new Date().toLocaleTimeString('ar-EG'));
        setCloudStatus('تعذر الوصول للخادم مؤقتاً — تم الاحتفاظ بنسخة احتياطية محلية');
      } finally {
        isSavingRef.current = false;
        setIsSyncing(false);
      }
    },
    [playerId, user, worldRef, saveLocalBackup]
  );

  const scheduleCloudSave = useCallback(() => {
    if (!user) return;
    saveLocalBackup(user.uid);
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      saveCurrentWorldToCloud(user);
    }, 2500);
  }, [user, saveCurrentWorldToCloud, saveLocalBackup]);

  // Periodic background autosave every 35 seconds while signed in
  useEffect(() => {
    if (!authReady || !user || !playerId) return;
    const interval = window.setInterval(() => {
      if (hydratedUidRef.current === user.uid) {
        saveCurrentWorldToCloud(user);
      }
    }, 35000);
    return () => window.clearInterval(interval);
  }, [authReady, user, playerId, saveCurrentWorldToCloud]);

  // Hydrate kingdom snapshot from backend once on login
  useEffect(() => {
    if (!authReady || !user || !playerId) return;

    const uid = user.uid;
    if (hydratedUidRef.current === uid) return;

    let isCancelled = false;

    async function bootstrapCloudCommander() {
      setIsSyncing(true);
      try {
        const token = await user!.getIdToken();
        const res = await fetch('/api/kingdom', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
          kingdom: (HydrateCloudPayload & {
            structures?: unknown[];
            units?: unknown[];
            updatedAt?: string;
          }) | null;
        };

        if (isCancelled) return;

        if (!data.kingdom) {
          hydratedUidRef.current = uid;
          await saveCurrentWorldToCloud(user);
          return;
        }

        const k = data.kingdom;
        const loadedStructures = Array.isArray(k.structures) ? k.structures : [];
        const loadedUnits = Array.isArray(k.units) ? k.units : [];

        setCloudStructuresCount(loadedStructures.length);
        setCloudUnitsCount(loadedUnits.length);
        hydratedUidRef.current = uid;

        onHydrateServerFromCloud({
          idToken: token,
          displayName: String(k.displayName || user?.displayName || 'قائد الحصن'),
          factionName: k.factionName,
          primaryColor: k.primaryColor,
          secondaryColor: k.secondaryColor,
          bannerPattern: k.bannerPattern,
          culture: k.culture,
        });

        setLastSyncedAt(new Date().toLocaleTimeString('ar-EG'));
        setCloudStatus('تم استرجاع مملكتك ومواردك وجيوشك من الخادم الدائم');
      } catch (err) {
        console.warn('Cloud kingdom load warning:', err);
        setCloudStatus('تعذر تحميل الحفظ السحابي مؤقتاً — يتم اللعب بالنسخة الحالية');
      } finally {
        if (!isCancelled) {
          setIsSyncing(false);
        }
      }
    }

    bootstrapCloudCommander();

    return () => {
      isCancelled = true;
    };
  }, [authReady, user, playerId, onHydrateServerFromCloud, saveCurrentWorldToCloud]);

  const persistPlacedStructure = useCallback(
    (_kind: StructureKind, _x: number, _z: number, _rotationY: number, _culture?: string) => {
      scheduleCloudSave();
    },
    [scheduleCloudSave]
  );

  const persistSpawnedUnit = useCallback(
    (_kind: UnitKind) => {
      scheduleCloudSave();
    },
    [scheduleCloudSave]
  );

  const resetCloudWorld = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/kingdom', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setTimeout(() => {
        saveCurrentWorldToCloud(user);
      }, 650);
    } catch (err) {
      console.warn('Cloud kingdom reset warning:', err);
    }
  }, [user, saveCurrentWorldToCloud]);

  const signInWithGoogle = useCallback(async () => {
    try {
      setCloudStatus('جارٍ المصادقة عبر حساب Google...');
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.warn('Google Sign-In warning:', err);
      setCloudStatus('تعذر تسجيل الدخول — تأكد من السماح بالنافذة المنبثقة');
    }
  }, []);

  const signOutFromCloud = useCallback(async () => {
    await signOut(auth);
  }, []);

  return {
    user,
    authReady,
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
  };
}
