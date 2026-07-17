import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../store';
import { useTheme, Theme } from '../theme';
import { Box, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Boxes'>;

function matchingBoxes(boxes: Box[], q: string): Box[] {
  return boxes.filter(
    (b) =>
      String(b.number).includes(q) ||
      b.label.toLowerCase().includes(q) ||
      b.items.some((it) => it.toLowerCase().includes(q)),
  );
}

export default function BoxesScreen({ navigation }: Props) {
  const theme = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { boxes, ready, addBox } = useStore();
  const [query, setQuery] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable hitSlop={10} onPress={() => navigation.navigate('Settings')}>
          <Text style={{ color: theme.accent, fontSize: 22 }}>⚙︎</Text>
        </Pressable>
      ),
    });
  }, [navigation, theme.accent]);

  const q = query.trim().toLowerCase();
  const sorted = useMemo(
    () => (boxes ? [...boxes].sort((a, b) => a.number - b.number) : []),
    [boxes],
  );
  const visible = useMemo(() => (q ? matchingBoxes(sorted, q) : sorted), [sorted, q]);

  const totalItems = boxes?.reduce((n, b) => n + b.items.length, 0) ?? 0;
  const matchCount = q
    ? boxes?.reduce((n, b) => n + b.items.filter((it) => it.toLowerCase().includes(q)).length, 0) ??
      0
    : 0;

  const onAdd = () => {
    const id = addBox();
    navigation.navigate('BoxDetail', { boxId: id });
  };

  const renderHeader = () => (
    <View>
      <View style={s.hero}>
        <Text style={s.headline}>What's in the box?</Text>
        <Text style={s.meta}>
          {boxes ? `${boxes.length} boxes · ${totalItems} items` : 'Loading…'}
        </Text>
      </View>
      <View style={s.searchWrap}>
        <TextInput
          style={s.search}
          placeholder="Search — try “tarp”, “LSU”, or “cord”"
          placeholderTextColor={theme.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>
      {q ? (
        <View style={s.note}>
          <Text style={s.noteText}>
            {visible.length === 0 && matchCount === 0
              ? 'No matches — try a shorter word.'
              : `Showing ${visible.length} of ${boxes?.length ?? 0} boxes · ${matchCount} matching item${matchCount === 1 ? '' : 's'}`}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderBox = ({ item: box }: { item: Box }) => {
    const preview = box.photos[0];
    return (
      <Pressable
        style={({ pressed }) => [s.card, pressed && s.cardPressed]}
        onPress={() => navigation.navigate('BoxDetail', { boxId: box.id })}
      >
        <View style={s.boxNum}>
          <Text style={s.boxNumText}>{box.number}</Text>
        </View>
        <View style={s.cardBody}>
          <Text style={s.cardLabel} numberOfLines={1}>
            {box.label || 'Box name'}
          </Text>
          <Text style={s.cardCount}>
            {box.items.length === 0
              ? 'Empty'
              : `${box.items.length} item${box.items.length === 1 ? '' : 's'}`}
            {box.photos.length ? ` · ${box.photos.length} photo${box.photos.length === 1 ? '' : 's'}` : ''}
          </Text>
          {q ? (
            <Text style={s.cardMatch} numberOfLines={1}>
              {box.items.find((it) => it.toLowerCase().includes(q)) ?? ''}
            </Text>
          ) : null}
        </View>
        {preview ? (
          <Image source={{ uri: preview.uri }} style={s.thumb} contentFit="cover" transition={120} />
        ) : (
          <View style={[s.thumb, s.thumbEmpty]}>
            <Text style={s.thumbEmptyText}>＋</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={s.screen}>
      <FlatList
        data={ready ? visible : []}
        keyExtractor={(b) => b.id}
        renderItem={renderBox}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          ready ? (
            <View style={s.emptyState}>
              <Text style={s.emptyTitle}>{q ? 'No matching boxes' : 'No boxes yet'}</Text>
              <Text style={s.emptyBody}>
                {q ? 'Try a different search.' : 'Tap “Add Box” to start your inventory.'}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      />
      <Pressable
        style={[s.fab, { bottom: insets.bottom + 20 }]}
        onPress={onAdd}
        accessibilityLabel="Add box"
      >
        <Text style={s.fabPlus}>＋</Text>
        <Text style={s.fabText}>Add Box</Text>
      </Pressable>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    hero: { alignItems: 'center', paddingTop: 12, paddingHorizontal: 20 },
    headline: {
      fontSize: 30,
      fontWeight: '700',
      letterSpacing: -0.5,
      color: t.text,
      textAlign: 'center',
    },
    meta: { fontSize: 13, color: t.textSecondary, marginTop: 8 },
    searchWrap: { paddingHorizontal: 16, marginTop: 18 },
    search: {
      backgroundColor: t.bgSubtle,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: t.text,
    },
    note: { paddingHorizontal: 20, marginTop: 12, alignItems: 'center' },
    noteText: { fontSize: 13, color: t.textSecondary, textAlign: 'center' },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.divider,
      borderRadius: 16,
      padding: 14,
      marginHorizontal: 16,
      marginTop: 12,
    },
    cardPressed: { opacity: 0.7 },
    boxNum: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: t.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxNumText: { color: t.bg, fontSize: 20, fontWeight: '700' },
    cardBody: { flex: 1, minWidth: 0 },
    cardLabel: { fontSize: 17, fontWeight: '600', color: t.text, letterSpacing: -0.2 },
    cardCount: { fontSize: 12, color: t.textTertiary, marginTop: 2 },
    cardMatch: { fontSize: 13, color: t.accent, marginTop: 4 },
    thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: t.bgSubtle },
    thumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: t.divider, borderStyle: 'dashed' },
    thumbEmptyText: { fontSize: 22, color: t.textTertiary },
    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: t.text },
    emptyBody: { fontSize: 14, color: t.textSecondary, marginTop: 8, textAlign: 'center' },
    fab: {
      position: 'absolute',
      right: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: t.accent,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderRadius: 980,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    fabPlus: { color: '#fff', fontSize: 20, fontWeight: '400', marginTop: -2 },
    fabText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  });
