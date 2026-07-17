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

import { analyzePhoto, AuthError, MissingKeyError } from '../ai';
import { persistPhotoFile, useBox, useStore } from '../store';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PhotoViewer'>;

type Analysis =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'review'; caption: string; items: string }
  | { phase: 'error'; message: string };

export default function PhotoViewerScreen({ route, navigation }: Props) {
  const { boxId } = route.params;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const box = useBox(boxId);
  const {
    addItems,
    addPhoto,
    removePhoto,
    reorderPhoto,
    updatePhotoCaption,
  } = useStore();

  const [index, setIndex] = useState(route.params.index);
  const [analysis, setAnalysis] = useState<Analysis>({ phase: 'idle' });
  const [captionDraft, setCaptionDraft] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

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

  const goToKeySetup = () => {
    Alert.alert(
      'AI analysis needs a key',
      'Add an Anthropic API key in Settings to auto-identify items in your photos. The key is stored only on this device.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => navigation.navigate('Settings') },
      ],
    );
  };

  const runAnalysis = async () => {
    if (!box || !current) return;
    setAnalysis({ phase: 'running' });
    try {
      const result = await analyzePhoto(current.uri, box.number, box.label);
      setAnalysis({
        phase: 'review',
        caption: result.caption,
        items: result.items.join('\n'),
      });
    } catch (err) {
      if (err instanceof MissingKeyError) {
        setAnalysis({ phase: 'idle' });
        goToKeySetup();
      } else if (err instanceof AuthError) {
        setAnalysis({ phase: 'idle' });
        Alert.alert('Key rejected', 'Your Anthropic API key is invalid or was revoked. Update it in Settings.');
      } else {
        setAnalysis({ phase: 'error', message: (err as Error).message });
      }
    }
  };

  const saveAnalysis = () => {
    if (analysis.phase !== 'review' || !box || !current) return;
    const items = analysis.items
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length) addItems(box.id, items);
    const caption = analysis.caption.trim();
    if (caption) updatePhotoCaption(box.id, current.id, caption);
    setAnalysis({ phase: 'idle' });
    Alert.alert(
      'Saved',
      items.length
        ? `${items.length} item${items.length === 1 ? '' : 's'} added to Box ${box.number}.`
        : 'Caption saved.',
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
    setTimeout(() => listRef.current?.scrollToOffset({ offset: newIndex * width, animated: false }), 50);
    setAnalysis({ phase: 'idle' });
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
          <View style={{ width, height: height * 0.62, alignItems: 'center', justifyContent: 'center' }}>
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
        <ActionBtn
          label="Caption"
          glyph="✎"
          onPress={() => setCaptionDraft(current?.caption ?? '')}
        />
        <ActionBtn label="Delete" glyph="🗑" tint="#ff6961" onPress={confirmDelete} />
      </View>

      {/* AI analyze button */}
      {analysis.phase === 'idle' ? (
        <Pressable style={s.analyzeBtn} onPress={runAnalysis}>
          <Text style={s.analyzeText}>✨ Analyze this photo with AI</Text>
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

      {/* AI analysis panel */}
      {analysis.phase === 'running' ? (
        <View style={[s.panel, { paddingBottom: insets.bottom + 14 }]}>
          <View style={s.runningRow}>
            <ActivityIndicator color="#fff" />
            <Text style={s.panelNote}>Asking AI what's in this photo…</Text>
          </View>
        </View>
      ) : null}

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

      {analysis.phase === 'review' ? (
        <ScrollView
          style={[s.panel, { maxHeight: height * 0.5 }]}
          contentContainerStyle={{ paddingBottom: insets.bottom + 14 }}
        >
          <Text style={s.panelTitle}>AI photo analysis — is this accurate?</Text>
          <Text style={s.panelNote}>
            Edit below, then save. Each line becomes an item in Box {box.number}.
          </Text>
          <Text style={s.inputLabel}>Photo caption</Text>
          <TextInput
            style={s.input}
            value={analysis.caption}
            onChangeText={(v) => setAnalysis({ ...analysis, caption: v })}
          />
          <Text style={s.inputLabel}>Detected items (one per line)</Text>
          <TextInput
            style={[s.input, s.textarea]}
            value={analysis.items}
            onChangeText={(v) => setAnalysis({ ...analysis, items: v })}
            multiline
          />
          <View style={s.panelBtns}>
            <Pressable style={s.panelSave} onPress={saveAnalysis}>
              <Text style={s.panelSaveText}>Save to box</Text>
            </Pressable>
            <Pressable style={s.panelCancel} onPress={() => setAnalysis({ phase: 'idle' })}>
              <Text style={s.panelCancelText}>Discard</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : null}
    </View>
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
  inputLabel: { color: '#a1a1a6', fontSize: 12, marginTop: 12, marginBottom: 4 },
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
  textarea: { minHeight: 110, textAlignVertical: 'top' },
  panelBtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
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
