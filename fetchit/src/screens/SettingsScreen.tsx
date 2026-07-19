import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { APP_NAME, PRO_PRODUCT_NAME } from '../brand';
import { exportCsv, exportJson } from '../csv';
import { usePurchases } from '../purchases';
import { clearApiKey, getApiKey, setApiKey } from '../settings';
import { useStore } from '../store';
import { Theme, useTheme } from '../theme';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const theme = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const { boxes, resetToSeed, clearAll } = useStore();
  const { isPro, priceLabel, restore, resetPro } = usePurchases();

  const [keyDraft, setKeyDraft] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getApiKey().then((k) => setHasKey(!!k));
  }, []);

  const onSaveKey = async () => {
    await setApiKey(keyDraft);
    setHasKey(!!keyDraft.trim());
    setKeyDraft('');
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const onClearKey = async () => {
    await clearApiKey();
    setHasKey(false);
    setKeyDraft('');
  };

  const onExportCsv = () => boxes && exportCsv(boxes);
  const onExportJson = () => boxes && exportJson(boxes);

  const onReset = () =>
    Alert.alert(
      'Restore sample inventory?',
      'This replaces everything with the built-in sample boxes and deletes your photos.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: resetToSeed },
      ],
    );

  const onClear = () =>
    Alert.alert('Delete everything?', 'This removes every box, item, and photo. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: clearAll },
    ]);

  const onRestore = async () => {
    const ok = await restore();
    Alert.alert(
      ok ? 'Restored' : 'Nothing to restore',
      ok ? 'Your upgrade is active.' : 'No previous purchase was found for this account.',
    );
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Plan */}
      <Text style={s.groupTitle}>PLAN</Text>
      <View style={s.card}>
        <Text style={s.status}>
          {isPro ? `✓ ${PRO_PRODUCT_NAME} — unlimited boxes` : 'Free plan — 1 box'}
        </Text>
        {isPro ? (
          <Text style={s.body}>Thanks for supporting {APP_NAME}.</Text>
        ) : (
          <>
            <Text style={s.body}>
              The free plan covers one box. Upgrade once for unlimited boxes and bins.
            </Text>
            <View style={s.row}>
              <Pressable style={s.btn} onPress={() => navigation.navigate('Paywall')}>
                <Text style={s.btnText}>Upgrade · {priceLabel}</Text>
              </Pressable>
              <Pressable style={s.btnGhost} onPress={onRestore}>
                <Text style={[s.btnGhostText, { color: theme.accent }]}>Restore</Text>
              </Pressable>
            </View>
          </>
        )}
        {__DEV__ ? (
          <Pressable onPress={resetPro}>
            <Text style={[s.link, { color: theme.textTertiary }]}>Reset purchase (dev only)</Text>
          </Pressable>
        ) : null}
      </View>

      {/* AI */}
      <Text style={s.groupTitle}>AI PHOTO ANALYSIS</Text>
      <View style={s.card}>
        <Text style={s.body}>
          Photo analysis works out of the box through {APP_NAME}'s shared AI service (subject to a
          monthly limit). Optionally add your own Anthropic API key to use your own account with no
          shared limit — it's stored only on this device's secure keychain and sent only to
          Anthropic.
        </Text>
        <Text style={s.status}>
          {hasKey ? '✓ Using your own Anthropic key.' : `Using ${APP_NAME}'s shared AI service.`}
        </Text>
        <TextInput
          style={s.input}
          value={keyDraft}
          onChangeText={setKeyDraft}
          placeholder="sk-ant-…"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <View style={s.row}>
          <Pressable
            style={[s.btn, !keyDraft.trim() && s.btnDisabled]}
            onPress={onSaveKey}
            disabled={!keyDraft.trim()}
          >
            <Text style={s.btnText}>{saved ? 'Saved ✓' : 'Save key'}</Text>
          </Pressable>
          {hasKey ? (
            <Pressable style={s.btnGhost} onPress={onClearKey}>
              <Text style={s.btnGhostText}>Remove key</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}>
          <Text style={s.link}>Get an API key ↗</Text>
        </Pressable>
      </View>

      {/* Data */}
      <Text style={s.groupTitle}>YOUR DATA</Text>
      <View style={s.card}>
        <Pressable style={s.listRow} onPress={onExportCsv}>
          <Text style={s.listText}>Export inventory as CSV</Text>
          <Text style={s.chevron}>›</Text>
        </Pressable>
        <View style={s.sep} />
        <Pressable style={s.listRow} onPress={onExportJson}>
          <Text style={s.listText}>Export full backup (JSON)</Text>
          <Text style={s.chevron}>›</Text>
        </Pressable>
        <View style={s.sep} />
        <Pressable style={s.listRow} onPress={onReset}>
          <Text style={s.listText}>Restore sample inventory</Text>
          <Text style={s.chevron}>›</Text>
        </Pressable>
        <View style={s.sep} />
        <Pressable style={s.listRow} onPress={onClear}>
          <Text style={[s.listText, { color: theme.negative }]}>Delete everything</Text>
          <Text style={s.chevron}>›</Text>
        </Pressable>
      </View>

      {/* About */}
      <Text style={s.groupTitle}>ABOUT</Text>
      <View style={s.card}>
        <Text style={s.aboutName}>{APP_NAME}</Text>
        <Text style={s.body}>
          A private, local-first way to catalog what's in your boxes and bins — search every item,
          snap a photo, and let AI list the contents. Your inventory lives on your device.
        </Text>
        <Text style={s.version}>Version {version}</Text>
      </View>
    </ScrollView>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    groupTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: t.textTertiary,
      letterSpacing: 0.5,
      marginTop: 26,
      marginBottom: 8,
      marginHorizontal: 20,
    },
    card: {
      backgroundColor: t.bgElevated,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.divider,
      marginHorizontal: 16,
      padding: 16,
    },
    body: { fontSize: 14, color: t.textSecondary, lineHeight: 20 },
    status: { fontSize: 13, color: t.text, marginTop: 12, fontWeight: '500' },
    input: {
      backgroundColor: t.bgSubtle,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 16,
      color: t.text,
      marginTop: 12,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
    btn: {
      backgroundColor: t.accent,
      borderRadius: 980,
      paddingHorizontal: 20,
      paddingVertical: 11,
    },
    btnDisabled: { backgroundColor: t.divider },
    btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    btnGhost: { paddingHorizontal: 8, paddingVertical: 11 },
    btnGhostText: { color: t.negative, fontSize: 15 },
    link: { color: t.accent, fontSize: 14, marginTop: 14 },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    listText: { fontSize: 16, color: t.text },
    chevron: { fontSize: 20, color: t.textTertiary },
    sep: { height: StyleSheet.hairlineWidth, backgroundColor: t.divider },
    aboutName: { fontSize: 18, fontWeight: '700', color: t.text, marginBottom: 8 },
    version: { fontSize: 13, color: t.textTertiary, marginTop: 14 },
  });
