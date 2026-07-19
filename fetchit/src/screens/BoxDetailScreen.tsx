import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { persistPhotoFile, useBox, useStore } from '../store';
import { Theme, useTheme } from '../theme';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'BoxDetail'>;

export default function BoxDetailScreen({ route, navigation }: Props) {
  const { boxId } = route.params;
  const theme = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const box = useBox(boxId);
  const {
    boxes,
    updateBox,
    deleteBox,
    addItem,
    updateItem,
    removeItem,
    moveItem,
    addPhoto,
  } = useStore();

  const [numDraft, setNumDraft] = useState('');
  const [editingNum, setEditingNum] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [moveFor, setMoveFor] = useState<number | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: box ? `Box ${box.number}` : 'Box' });
  }, [navigation, box?.number]);

  if (!box) {
    return (
      <View style={s.screen}>
        <Text style={s.missing}>This box was deleted.</Text>
      </View>
    );
  }

  const commitNum = () => {
    const n = parseInt(numDraft, 10);
    if (!isNaN(n) && n > 0) updateBox(box.id, { number: n });
    setEditingNum(false);
  };

  const onAddItem = () => {
    const t = newItem.trim();
    if (!t) return;
    addItem(box.id, t);
    setNewItem('');
  };

  const pickPhoto = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        fromCamera
          ? 'Allow camera access in Settings to take a photo.'
          : 'Allow photo access in Settings to add a photo.',
      );
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          allowsMultipleSelection: false,
        });
    if (result.canceled || !result.assets?.length) return;
    try {
      const uri = await persistPhotoFile(result.assets[0].uri);
      addPhoto(box.id, uri);
      // Jump to the viewer on the freshly added photo; autoAnalyze re-reads it
      // and reconciles the detected contents against this box's item list.
      navigation.navigate('PhotoViewer', {
        boxId: box.id,
        index: box.photos.length,
        autoAnalyze: true,
      });
    } catch {
      Alert.alert('Could not add photo', 'Something went wrong saving the image.');
    }
  };

  const addPhotoPrompt = () => {
    Alert.alert('Add a photo', 'Where should the photo come from?', [
      { text: 'Take Photo', onPress: () => pickPhoto(true) },
      { text: 'Choose from Library', onPress: () => pickPhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmDeleteBox = () => {
    Alert.alert(
      `Delete Box ${box.number}?`,
      box.items.length
        ? `This removes the box and its ${box.items.length} item${box.items.length === 1 ? '' : 's'}.`
        : 'This removes the box.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteBox(box.id);
            navigation.goBack();
          },
        },
      ],
    );
  };

  const otherBoxes = (boxes ?? [])
    .filter((b) => b.id !== box.id)
    .sort((a, b) => a.number - b.number);

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {/* Header card: number + label + note */}
        <View style={s.headCard}>
          <View style={s.headRow}>
            {editingNum ? (
              <TextInput
                style={s.numInput}
                value={numDraft}
                onChangeText={(v) => setNumDraft(v.replace(/\D/g, '').slice(0, 3))}
                keyboardType="number-pad"
                autoFocus
                onBlur={commitNum}
                onSubmitEditing={commitNum}
                returnKeyType="done"
              />
            ) : (
              <Pressable
                style={s.boxNum}
                onPress={() => {
                  setNumDraft(String(box.number));
                  setEditingNum(true);
                }}
              >
                <Text style={s.boxNumText}>{box.number}</Text>
              </Pressable>
            )}
            <TextInput
              style={s.labelInput}
              value={box.label}
              placeholder="Box name"
              placeholderTextColor={theme.textTertiary}
              onChangeText={(v) => updateBox(box.id, { label: v })}
              returnKeyType="done"
            />
          </View>
          <TextInput
            style={s.noteInput}
            value={box.note}
            placeholder="Add a note (optional)…"
            placeholderTextColor={theme.textTertiary}
            onChangeText={(v) => updateBox(box.id, { note: v })}
            multiline
          />
        </View>

        {/* Photos */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Photos</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.thumbRow}
          >
            {box.photos.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => navigation.navigate('PhotoViewer', { boxId: box.id, index: i })}
              >
                <Image source={{ uri: p.uri }} style={s.thumb} contentFit="cover" transition={120} />
              </Pressable>
            ))}
            <Pressable style={[s.thumb, s.thumbAdd]} onPress={addPhotoPrompt}>
              <Text style={s.thumbAddText}>＋</Text>
              <Text style={s.thumbAddLabel}>Photo</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Items */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>
            {box.items.length} item{box.items.length === 1 ? '' : 's'}
          </Text>
          {box.items.length === 0 ? (
            <Text style={s.empty}>No items yet — add the first one below.</Text>
          ) : (
            box.items.map((item, i) => (
              <View key={`${i}-${item}`} style={s.itemBlock}>
                <View style={s.itemRow}>
                  <TextInput
                    style={s.itemText}
                    defaultValue={item}
                    onEndEditing={(e) => updateItem(box.id, i, e.nativeEvent.text)}
                    returnKeyType="done"
                    multiline
                  />
                  <Pressable
                    hitSlop={8}
                    style={s.iconBtn}
                    onPress={() => setMoveFor(moveFor === i ? null : i)}
                  >
                    <Text style={[s.iconTxt, { color: theme.accent }]}>⇄</Text>
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    style={s.iconBtn}
                    onPress={() =>
                      Alert.alert('Remove item', `Remove “${item}”?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => removeItem(box.id, i),
                        },
                      ])
                    }
                  >
                    <Text style={[s.iconTxt, { color: theme.negative }]}>✕</Text>
                  </Pressable>
                </View>
                {moveFor === i ? (
                  <View style={s.moveRow}>
                    <Text style={s.moveLabel}>Move to:</Text>
                    {otherBoxes.length === 0 ? (
                      <Text style={s.moveLabel}>No other boxes</Text>
                    ) : (
                      otherBoxes.map((target) => (
                        <Pressable
                          key={target.id}
                          style={s.chip}
                          onPress={() => {
                            moveItem(box.id, i, target.id);
                            setMoveFor(null);
                          }}
                        >
                          <Text style={s.chipText}>#{target.number}</Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            ))
          )}

          <View style={s.addRow}>
            <TextInput
              style={s.addInput}
              value={newItem}
              onChangeText={setNewItem}
              placeholder="Add an item…"
              placeholderTextColor={theme.textTertiary}
              onSubmitEditing={onAddItem}
              returnKeyType="done"
              blurOnSubmit={false}
            />
            <Pressable
              style={[s.addBtn, !newItem.trim() && s.addBtnDisabled]}
              onPress={onAddItem}
              disabled={!newItem.trim()}
            >
              <Text style={s.addBtnText}>Add</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={s.deleteBox} onPress={confirmDeleteBox}>
          <Text style={s.deleteBoxText}>Delete box</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    missing: { color: t.textSecondary, textAlign: 'center', marginTop: 60, fontSize: 16 },
    headCard: {
      backgroundColor: t.bgElevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.divider,
      padding: 16,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    boxNum: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: t.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxNumText: { color: t.bg, fontSize: 22, fontWeight: '700' },
    numInput: {
      width: 48,
      height: 48,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: t.accent,
      color: t.text,
      fontSize: 22,
      fontWeight: '700',
      textAlign: 'center',
    },
    labelInput: {
      flex: 1,
      fontSize: 20,
      fontWeight: '600',
      color: t.text,
      paddingVertical: 6,
    },
    noteInput: {
      marginTop: 10,
      fontSize: 15,
      color: t.textSecondary,
      backgroundColor: t.bgSubtle,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 40,
    },
    section: { paddingHorizontal: 16, paddingTop: 20 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      color: t.textTertiary,
      marginBottom: 10,
    },
    thumbRow: { gap: 10, paddingRight: 16 },
    thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: t.bgSubtle },
    thumbAdd: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.divider,
    },
    thumbAddText: { fontSize: 26, color: t.accent, lineHeight: 28 },
    thumbAddLabel: { fontSize: 11, color: t.textTertiary },
    empty: { fontSize: 14, color: t.textTertiary, paddingVertical: 8 },
    itemBlock: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.divider,
    },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
    itemText: {
      flex: 1,
      fontSize: 15,
      color: t.text,
      paddingVertical: 8,
    },
    iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    iconTxt: { fontSize: 17 },
    moveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      backgroundColor: t.bgSubtle,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8,
    },
    moveLabel: { fontSize: 13, color: t.textSecondary },
    chip: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.divider,
      backgroundColor: t.bg,
      borderRadius: 980,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    chipText: { fontSize: 14, fontWeight: '500', color: t.accent },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
    addInput: {
      flex: 1,
      fontSize: 16,
      color: t.text,
      backgroundColor: t.bgSubtle,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    addBtn: {
      backgroundColor: t.accent,
      borderRadius: 980,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },
    addBtnDisabled: { backgroundColor: t.divider },
    addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    deleteBox: { alignItems: 'center', marginTop: 30 },
    deleteBoxText: { color: t.negative, fontSize: 15 },
  });
