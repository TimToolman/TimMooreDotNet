import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { SEED_BOXES } from './seed';
import { Box, InventorySnapshot, Photo } from './types';

const STORAGE_KEY = 'stow-a-way:inventory:v1';
const SEEDED_KEY = 'stow-a-way:seeded:v1';
const PHOTO_DIR = FileSystem.documentDirectory + 'photos/';

let idCounter = 0;
/** Monotonic id that stays unique even within the same millisecond. */
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

async function ensurePhotoDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  }
}

/**
 * Copy a captured/picked image into the app's document directory so the URI
 * survives across launches (picker/cache URIs do not). Returns the new URI.
 */
export async function persistPhotoFile(sourceUri: string): Promise<string> {
  await ensurePhotoDir();
  const ext = (sourceUri.split('.').pop() || 'jpg').split('?')[0].slice(0, 4) || 'jpg';
  const dest = `${PHOTO_DIR}${newId('img')}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

async function deletePhotoFile(uri: string): Promise<void> {
  if (!uri.startsWith(FileSystem.documentDirectory ?? '')) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* file already gone — nothing to do */
  }
}

interface StoreValue {
  boxes: Box[] | null;
  ready: boolean;
  addBox: () => string;
  updateBox: (id: string, patch: Partial<Omit<Box, 'id'>>) => void;
  deleteBox: (id: string) => void;
  addItem: (boxId: string, text: string) => void;
  addItems: (boxId: string, texts: string[]) => void;
  updateItem: (boxId: string, index: number, text: string) => void;
  removeItem: (boxId: string, index: number) => void;
  moveItem: (fromBoxId: string, index: number, toBoxId: string) => void;
  addPhoto: (boxId: string, uri: string, caption?: string) => void;
  updatePhotoCaption: (boxId: string, photoId: string, caption: string) => void;
  removePhoto: (boxId: string, photoId: string) => void;
  reorderPhoto: (boxId: string, from: number, to: number) => void;
  replaceAll: (boxes: Box[]) => void;
  resetToSeed: () => void;
  clearAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load once on mount, seeding the sample inventory on first run.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const snap: InventorySnapshot = JSON.parse(raw);
          setBoxes(Array.isArray(snap.boxes) ? snap.boxes : []);
        } else {
          const seeded = await AsyncStorage.getItem(SEEDED_KEY);
          if (seeded) {
            setBoxes([]);
          } else {
            setBoxes(SEED_BOXES);
            await AsyncStorage.setItem(SEEDED_KEY, '1');
          }
        }
      } catch {
        setBoxes([]);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Debounced persistence whenever the inventory changes.
  useEffect(() => {
    if (!ready || boxes === null) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const snap: InventorySnapshot = { updated: new Date().toISOString(), boxes };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snap)).catch(() => {
        /* storage full or unavailable — in-memory state still holds */
      });
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [boxes, ready]);

  const mutate = useCallback((fn: (prev: Box[]) => Box[]) => {
    setBoxes((prev) => (prev === null ? prev : fn(prev)));
  }, []);

  const addBox = useCallback((): string => {
    const id = newId('box');
    setBoxes((prev) => {
      const list = prev ?? [];
      const nextNum = list.length ? Math.max(...list.map((b) => b.number)) + 1 : 1;
      return [...list, { id, number: nextNum, label: 'New box', note: '', items: [], photos: [] }];
    });
    return id;
  }, []);

  const updateBox = useCallback(
    (id: string, patch: Partial<Omit<Box, 'id'>>) => {
      mutate((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [mutate],
  );

  const deleteBox = useCallback(
    (id: string) => {
      setBoxes((prev) => {
        if (!prev) return prev;
        const box = prev.find((b) => b.id === id);
        box?.photos.forEach((p) => deletePhotoFile(p.uri));
        return prev.filter((b) => b.id !== id);
      });
    },
    [],
  );

  const addItem = useCallback(
    (boxId: string, text: string) => {
      const t = text.trim();
      if (!t) return;
      mutate((prev) => prev.map((b) => (b.id === boxId ? { ...b, items: [...b.items, t] } : b)));
    },
    [mutate],
  );

  const addItems = useCallback(
    (boxId: string, texts: string[]) => {
      const clean = texts.map((s) => s.trim()).filter(Boolean);
      if (!clean.length) return;
      mutate((prev) =>
        prev.map((b) => (b.id === boxId ? { ...b, items: [...b.items, ...clean] } : b)),
      );
    },
    [mutate],
  );

  const updateItem = useCallback(
    (boxId: string, index: number, text: string) => {
      const t = text.trim();
      if (!t) return;
      mutate((prev) =>
        prev.map((b) =>
          b.id === boxId ? { ...b, items: b.items.map((it, i) => (i === index ? t : it)) } : b,
        ),
      );
    },
    [mutate],
  );

  const removeItem = useCallback(
    (boxId: string, index: number) => {
      mutate((prev) =>
        prev.map((b) =>
          b.id === boxId ? { ...b, items: b.items.filter((_, i) => i !== index) } : b,
        ),
      );
    },
    [mutate],
  );

  const moveItem = useCallback(
    (fromBoxId: string, index: number, toBoxId: string) => {
      mutate((prev) => {
        const from = prev.find((b) => b.id === fromBoxId);
        if (!from) return prev;
        const item = from.items[index];
        if (item === undefined) return prev;
        return prev.map((b) => {
          if (b.id === fromBoxId) return { ...b, items: b.items.filter((_, i) => i !== index) };
          if (b.id === toBoxId) return { ...b, items: [...b.items, item] };
          return b;
        });
      });
    },
    [mutate],
  );

  const addPhoto = useCallback(
    (boxId: string, uri: string, caption = '') => {
      const photo: Photo = { id: newId('photo'), uri, caption };
      mutate((prev) =>
        prev.map((b) => (b.id === boxId ? { ...b, photos: [...b.photos, photo] } : b)),
      );
    },
    [mutate],
  );

  const updatePhotoCaption = useCallback(
    (boxId: string, photoId: string, caption: string) => {
      mutate((prev) =>
        prev.map((b) =>
          b.id === boxId
            ? { ...b, photos: b.photos.map((p) => (p.id === photoId ? { ...p, caption } : p)) }
            : b,
        ),
      );
    },
    [mutate],
  );

  const removePhoto = useCallback(
    (boxId: string, photoId: string) => {
      setBoxes((prev) => {
        if (!prev) return prev;
        return prev.map((b) => {
          if (b.id !== boxId) return b;
          const photo = b.photos.find((p) => p.id === photoId);
          if (photo) deletePhotoFile(photo.uri);
          return { ...b, photos: b.photos.filter((p) => p.id !== photoId) };
        });
      });
    },
    [],
  );

  const reorderPhoto = useCallback(
    (boxId: string, from: number, to: number) => {
      mutate((prev) =>
        prev.map((b) => {
          if (b.id !== boxId) return b;
          const photos = [...b.photos];
          if (from < 0 || to < 0 || from >= photos.length || to >= photos.length) return b;
          const [moved] = photos.splice(from, 1);
          photos.splice(to, 0, moved);
          return { ...b, photos };
        }),
      );
    },
    [mutate],
  );

  const replaceAll = useCallback((next: Box[]) => setBoxes(next), []);

  const resetToSeed = useCallback(() => {
    setBoxes((prev) => {
      prev?.forEach((b) => b.photos.forEach((p) => deletePhotoFile(p.uri)));
      return SEED_BOXES;
    });
  }, []);

  const clearAll = useCallback(() => {
    setBoxes((prev) => {
      prev?.forEach((b) => b.photos.forEach((p) => deletePhotoFile(p.uri)));
      return [];
    });
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      boxes,
      ready,
      addBox,
      updateBox,
      deleteBox,
      addItem,
      addItems,
      updateItem,
      removeItem,
      moveItem,
      addPhoto,
      updatePhotoCaption,
      removePhoto,
      reorderPhoto,
      replaceAll,
      resetToSeed,
      clearAll,
    }),
    [
      boxes,
      ready,
      addBox,
      updateBox,
      deleteBox,
      addItem,
      addItems,
      updateItem,
      removeItem,
      moveItem,
      addPhoto,
      updatePhotoCaption,
      removePhoto,
      reorderPhoto,
      replaceAll,
      resetToSeed,
      clearAll,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within a StoreProvider');
  return ctx;
}

export function useBox(boxId: string): Box | undefined {
  const { boxes } = useStore();
  return boxes?.find((b) => b.id === boxId);
}
