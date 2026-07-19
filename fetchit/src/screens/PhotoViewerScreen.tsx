import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { analyzePhoto, AuthError, BudgetExceededError, isAiAvailable, MissingKeyError } from '../ai';
import { persistPhotoFile, useBox, useStore } from '../store';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PhotoViewer'>;

interface AddReco {
  text: string;
  checked: boolean;
}
interface RemoveReco {
  text: string;
  index: number;
  checked: boolean;
}

type Analysis =
  | { phase: 'idle' }
  | { phase: 'running' }
  | {
      phase: 'reconcile';
      caption: string;
      add: AddReco[];
      remove: RemoveReco[];
      detectedCount: number;
    }
  | { phase: 'error'; message: string };

/** Loose match so "Yellow extension cord" and "yellow extension cord (heavy)"
 * aren't treated as different items when diffing a photo against the list. */
const norm = (s: string) => s.toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

export default function PhotoViewerScreen({ route, navigation }: Props) {
  const { boxId } = route.params;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const box = useBox(boxId);
  const { addPhoto, removePhoto, reorderPhoto, updatePhotoCaption, setItems } = useStore();

  const [index, setIndex] = useState(route.params.index);
  const [analysis, setAnalysis] = useState<Analysis>({ phase: 'idle' });
  const [captionDraft, setCaptionDraft] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const autoAnalyzedFor = useRef<string | null>(null);

  const photos = box?.photos ?? [];
  const clampedIndex = Math.max(0, Math.min(index, photos.length - 1));
  const current = photos[clampedIndex];

  // Close automatically if every photo in the box is gone.
  useEffect(() => {
    if (box && photos.length === 0) navigation.goBack();
  }, [box, photos.length, navigation]);

  useEffect(() => {
    if (index !== clampedIndex) setIndex(clampedIndex);
  }, [clampedIndex, index]);

  const goToKeySetup = useCallback(() => {
    Alert.alert(
      'AI analysis needs a key',
      'Add an Anthropic API key in Settings to compare a photo against your item list. The key is stored only on this device.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => navigation.navigate('Settings') },
      ],
    );
  }, [navigation]);

  // Analyze the current photo, then diff what the AI sees against the box's
  // current items: additions = seen-but-not-listed, removals = listed-but-not-seen.
  const runAnalysis = useCallback(async () => {
    const activeBox = box;
    const photo = activeBox?.photos[clampedIndex];
    if (!activeBox || !photo) return;
    setAnalysis({ phase: 'running' });
    try {
      const result = await analyzePhoto(photo.uri, activeBox.number, activeBox.label);
      const detected = result.items.map((s) => s.trim()).filter(Boolean);
      const detectedNorm = new Set(detected.map(norm));
      const existingNorm = activeBox.items.map(norm);

      const add: AddReco[] = detected
        .filter((it) => !existingNorm.includes(norm(it)))
        .map((text) => ({ text, checked: true }));
      const remove: RemoveReco[] = activeBox.items
        .map((text, i) => ({ text, index: i }))
        .filter((r) => !detectedNorm.has(norm(r.text)))
        // Removals are opt-in — a single photo rarely shows everything, so
        // default them off and let the user confirm what's actually gone.
        .map((r) => ({ ...r, checked: false }));

      setAnalysis({ phase: 'reconcile', caption: result.caption, add, remove, detectedCount: detected.length });
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        setAnalysis({ phase: 'idle' });
        Alert.alert(
          'AI analysis paused',
          'The shared AI budget for this month has been reached. It resets next month — or add your own Anthropic API key in Settings to keep going now.',
        );
      } else if (err instanceof MissingKeyError) {
        setAnalysis({ phase: 'idle' });
        goToKeySetup();
      } else if (err instanceof AuthError) {
        setAnalysis({ phase: 'idle' });
        Alert.alert('Key rejected', 'Your Anthropic API key is invalid or was revoked. Update it in Settings.');
      } else {
        setAnalysis({ phase: 'error', message: (err as Error).message });
      }
    }
  }, [box, clampedIndex, goToKeySetup]);

  // Auto-run once for a freshly added photo (only when a key is already set, so
  // we never nag someone who hasn't opted into AI).
  useEffect(() => {
    if (!route.params.autoAnalyze || !current) return;
    if (autoAnalyzedFor.current === current.id) return;
    autoAnalyzedFor.current = current.id;
    isAiAvailable().then((ok) => {
      if (ok) runAnalysis();
    });
  }, [route.params.autoAnalyze, current, runAnalysis]);

  const onScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      if (i !== index) {
        setIndex(i);
        setAnalysis({ phase: 'idle' });
      }
    },
    [width, index],
  );

  const toggleAdd = (i: number) =>
    setAnalysis((a) =>
      a.phase === 'reconcile'
        ? { ...a, add: a.add.map((r, j) => (j === i ? { ...r, checked: !r.checked } : r)) }
        : a,
    );
  const toggleRemove = (i: number) =>
    setAnalysis((a) =>
      a.phase === 'reconcile'
        ? { ...a, remove: a.remove.map((r, j) => (j === i ? { ...r, checked: !r.checked } : r)) }
        : a,
    );

  const applyReconcile = () => {
    if (analysis.phase !== 'reconcile' || !box || !current) return;
    const removeIdx = new Set(analysis.remove.filter((r) => r.checked).map((r) => r.index));
    const kept = box.items.filter((_, i) => !removeIdx.has(i));
    const added = analysis.add.filter((a) => a.checked).map((a) => a.text);
    const nAdd = added.length;
    const nRemove = removeIdx.size;
    if (nAdd || nRemove) setItems(box.id, [...kept, ...added]);

    const caption = analysis.caption.trim();
    if (caption && caption !== current.caption) updatePhotoCaption(box.id, current.id, caption);

    setAnalysis({ phase: 'idle' });
    const parts: string[] = [];
    if (nAdd) parts.push(`${nAdd} added`);
    if (nRemove) parts.push(`${nRemove} removed`);
    Alert.alert(
      'List updated',
      (parts.length ? `${parts.join(' · ')} in Box ${box.number}. ` : 'No item changes. ') +
        'The photo is kept — delete older photos yourself if they no longer apply.',
    );
  };

  const addMore = async (fromCamera: boolean) => {
    if (!box) return;
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
        });
    if (result.canceled || !result.assets?.length) return;
    const uri = await persistPhotoFile(result.assets[0].uri);
    addPhoto(box.id, uri);
    const newIndex = photos.length;
    setIndex(newIndex);
    setAnalysis({ phase: 'idle' });
    setTimeout(() => listRef.current?.scrollToOffset({ offset: newIndex * width, animated: false }), 50);
    // Newly added photo → re-analyze and reconcile against the current list.
    if (await isAiAvailable()) {
      autoAnalyzedFor.current = null; // let the effect fire for the new photo
      setTimeout(runAnalysis, 250);
    }
  };

  const confirmDelete = () => {
    if (!box || !current) return;
    Alert.alert('Delete photo', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removePhoto(box.id, current.id) },
    ]);
  };

  const saveCaption = () => {
    if (captionDraft === null || !box || !current) return;
    updatePhotoCaption(box.id, current.id, captionDraft.trim());
    setCaptionDraft(null);
  };

  if (!box) {
    return (
      <View style={styles.screen}>
        <Text style={styles.gone}>This box was deleted.</Text>
      </View>
    );
  }

  const s = styles;

  return (
    <View style={s.screen}>
      {/* Top bar */}
      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <View style={s.topTitles}>
          <Text style={s.title} numberOfLines={1}>
            Box {box.number} · {box.label}
          </Text>
          <Text style={s.counter} numberOfLines={1}>
            {photos.length
              ? `Photo ${clampedIndex + 1} of ${photos.length}${current?.caption ? ` — ${current.caption}` : ''}`
              : 'No photos'}
          </Text>
        </View>
        <Pressable style={s.roundBtn} onPress={() => navigation.goBack()} accessibilityLabel="Close">
          <Text style={s.roundBtnText}>✕</Text>
        </Pressable>
      </View>

      {/* Pager */}
      <FlatList
        ref={listRef}
        data={photos}
        keyExtractor={(p) => p.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={clampedIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => (
          <View style={{ width, height: height * 0.52, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={{ uri: item.uri }} style={s.photo} contentFit="contain" transition={150} />
          </View>
        )}
      />

      {/* Action bar */}
      <View style={s.actions}>
        <ActionBtn label="Camera" glyph="📷" onPress={() => addMore(true)} />
        <ActionBtn label="Library" glyph="🖼" onPress={() => addMore(false)} />
        <ActionBtn
          label="Earlier"
          glyph="⇤"
          disabled={clampedIndex === 0}
          onPress={() => reorderPhoto(box.id, clampedIndex, clampedIndex - 1)}
        />
        <ActionBtn
          label="Later"
          glyph="⇥"
          disabled={clampedIndex >= photos.length - 1}
          onPress={() => reorderPhoto(box.id, clampedIndex, clampedIndex + 1)}
        />
        <ActionBtn label="Caption" glyph="✎" onPress={() => setCaptionDraft(current?.caption ?? '')} />
        <ActionBtn label="Delete" glyph="🗑" tint="#ff6961" onPress={confirmDelete} />
      </View>

      {/* AI analyze/reconcile button */}
      {analysis.phase === 'idle' && captionDraft === null ? (
        <Pressable style={s.analyzeBtn} onPress={runAnalysis}>
          <Text style={s.analyzeText}>✨ Analyze photo &amp; sync item list</Text>
        </Pressable>
      ) : null}

      {/* Caption editor */}
      {captionDraft !== null ? (
        <View style={[s.panel, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={s.panelTitle}>Photo caption</Text>
          <TextInput
            style={s.input}
            value={captionDraft}
            onChangeText={setCaptionDraft}
            placeholder="Describe this photo…"
            placeholderTextColor="#8e8e93"
            autoFocus
          />
          <View style={s.panelBtns}>
            <Pressable style={s.panelSave} onPress={saveCaption}>
              <Text style={s.panelSaveText}>Save</Text>
            </Pressable>
            <Pressable style={s.panelCancel} onPress={() => setCaptionDraft(null)}>
              <Text style={s.panelCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Running */}
      {analysis.phase === 'running' ? (
        <View style={[s.panel, { paddingBottom: insets.bottom + 14 }]}>
          <View style={s.runningRow}>
            <ActivityIndicator color="#fff" />
            <Text style={s.panelNote}>Comparing this photo with your item list…</Text>
          </View>
        </View>
      ) : null}

      {/* Error */}
      {analysis.phase === 'error' ? (
        <View style={[s.panel, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={s.panelTitle}>Analysis failed</Text>
          <Text style={s.panelNote}>{analysis.message}</Text>
          <View style={s.panelBtns}>
            <Pressable style={s.panelSave} onPress={runAnalysis}>
              <Text style={s.panelSaveText}>Retry</Text>
            </Pressable>
            <Pressable style={s.panelCancel} onPress={() => setAnalysis({ phase: 'idle' })}>
              <Text style={s.panelCancelText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Reconcile */}
      {analysis.phase === 'reconcile' ? (
        <ScrollView
          style={[s.panel, { maxHeight: height * 0.56 }]}
          contentContainerStyle={{ paddingBottom: insets.bottom + 14 }}
        >
          <Text style={s.panelTitle}>Sync Box {box.number} with this photo</Text>
          <Text style={s.panelNote}>
            AI saw {analysis.detectedCount} item{analysis.detectedCount === 1 ? '' : 's'}. Pick what
            to change, then Save. Photos are never deleted automatically.
          </Text>

          {analysis.add.length > 0 ? (
            <>
              <Text style={s.groupHead}>ADD — seen in photo, not on the list</Text>
              {analysis.add.map((r, i) => (
                <CheckRow key={`a${i}`} label={r.text} checked={r.checked} accent="#30d158" onToggle={() => toggleAdd(i)} />
              ))}
            </>
          ) : null}

          {analysis.remove.length > 0 ? (
            <>
              <Text style={s.groupHead}>REMOVE — on the list, not seen in this photo</Text>
              {analysis.remove.map((r, i) => (
                <CheckRow key={`r${i}`} label={r.text} checked={r.checked} accent="#ff6961" onToggle={() => toggleRemove(i)} />
              ))}
            </>
          ) : null}

          {analysis.add.length === 0 && analysis.remove.length === 0 ? (
            <Text style={s.matchNote}>✓ Everything on the list matches this photo.</Text>
          ) : null}

          <Text style={s.inputLabel}>Photo caption</Text>
          <TextInput
            style={s.input}
            value={analysis.caption}
            onChangeText={(v) => setAnalysis({ ...analysis, caption: v })}
          />

          <View style={s.panelBtns}>
            <Pressable style={s.panelSave} onPress={applyReconcile}>
              <Text style={s.panelSaveText}>Save changes</Text>
            </Pressable>
            <Pressable style={s.panelCancel} onPress={() => setAnalysis({ phase: 'idle' })}>
              <Text style={s.panelCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function CheckRow({
  label,
  checked,
  accent,
  onToggle,
}: {
  label: string;
  checked: boolean;
  accent: string;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.checkRow} onPress={onToggle}>
      <View style={[styles.checkbox, checked && { backgroundColor: accent, borderColor: accent }]}>
        {checked ? <Text style={styles.checkMark}>✓</Text> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

function ActionBtn({
  label,
  glyph,
  onPress,
  disabled,
  tint,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  disabled?: boolean;
  tint?: string;
}) {
  return (
    <Pressable
      style={[styles.action, disabled && { opacity: 0.3 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
    >
      <Text style={[styles.actionGlyph, tint ? { color: tint } : null]}>{glyph}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  gone: { color: '#aeaeb2', textAlign: 'center', marginTop: 120, fontSize: 16 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  topTitles: { flex: 1, minWidth: 0 },
  title: { color: '#f5f5f7', fontSize: 15, fontWeight: '600' },
  counter: { color: '#a1a1a6', fontSize: 13, marginTop: 2 },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtnText: { color: '#f5f5f7', fontSize: 18 },
  photo: { width: '100%', height: '100%' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  action: { alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  actionGlyph: { fontSize: 22, color: '#f5f5f7' },
  actionLabel: { fontSize: 11, color: '#a1a1a6' },
  analyzeBtn: {
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  analyzeText: { color: '#f5f5f7', fontSize: 15, fontWeight: '500' },
  panel: {
    margin: 12,
    padding: 14,
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3a3a3c',
  },
  panelTitle: { color: '#f5f5f7', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  panelNote: { color: '#a1a1a6', fontSize: 13, marginBottom: 8 },
  runningRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupHead: {
    color: '#8e8e93',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
  },
  matchNote: { color: '#30d158', fontSize: 14, marginTop: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#5a5a5e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 18 },
  checkLabel: { flex: 1, color: '#f5f5f7', fontSize: 15 },
  inputLabel: { color: '#a1a1a6', fontSize: 12, marginTop: 16, marginBottom: 4 },
  input: {
    backgroundColor: '#2c2c2e',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3a3a3c',
    color: '#f5f5f7',
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  panelBtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  panelSave: {
    backgroundColor: '#0a84ff',
    borderRadius: 980,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  panelSaveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  panelCancel: { paddingHorizontal: 12, paddingVertical: 11 },
  panelCancelText: { color: '#a1a1a6', fontSize: 15 },
});
