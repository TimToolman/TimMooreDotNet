import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FREE_BOX_LIMIT } from '../limits';
import { usePurchases } from '../purchases';
import { Theme, useTheme } from '../theme';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Paywall'>;

const PERKS = [
  'Unlimited boxes and bins',
  'Every item, photo, and AI sync — no limits',
  'One-time purchase, yours forever',
  'Your data still stays private on your device',
];

export default function PaywallScreen({ navigation }: Props) {
  const theme = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { priceLabel, purchasePro, restore } = usePurchases();
  const [busy, setBusy] = useState<null | 'buy' | 'restore'>(null);

  const onBuy = async () => {
    setBusy('buy');
    try {
      const ok = await purchasePro();
      if (ok) {
        Alert.alert('Unlocked 🎉', 'You now have unlimited boxes. Thank you!');
        navigation.goBack();
      }
    } catch {
      Alert.alert('Purchase failed', 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async () => {
    setBusy('restore');
    try {
      const ok = await restore();
      Alert.alert(
        ok ? 'Restored' : 'Nothing to restore',
        ok ? 'Your upgrade is active again.' : 'No previous purchase was found for this account.',
      );
      if (ok) navigation.goBack();
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}>
        <View style={s.badge}>
          <Text style={s.badgeText}>FetchIt Unlimited</Text>
        </View>
        <Text style={s.headline}>Room for everything you own</Text>
        <Text style={s.sub}>
          The free plan covers {FREE_BOX_LIMIT} box. Upgrade once to catalog as many boxes and bins
          as you like.
        </Text>

        <View style={s.card}>
          {PERKS.map((p) => (
            <View key={p} style={s.perkRow}>
              <Text style={s.check}>✓</Text>
              <Text style={s.perkText}>{p}</Text>
            </View>
          ))}
        </View>

        <Pressable style={s.buyBtn} onPress={onBuy} disabled={busy !== null}>
          {busy === 'buy' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.buyText}>Unlock Unlimited · {priceLabel}</Text>
          )}
        </Pressable>

        <Pressable style={s.restoreBtn} onPress={onRestore} disabled={busy !== null}>
          <Text style={s.restoreText}>{busy === 'restore' ? 'Restoring…' : 'Restore purchase'}</Text>
        </Pressable>

        <Pressable style={s.laterBtn} onPress={() => navigation.goBack()} disabled={busy !== null}>
          <Text style={s.laterText}>Maybe later</Text>
        </Pressable>

        <Text style={s.fine}>
          A one-time purchase unlocks unlimited boxes on this account. Payment is charged to your
          App Store / Google Play account.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: t.accentTint,
      borderRadius: 980,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginBottom: 16,
    },
    badgeText: { color: t.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
    headline: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, color: t.text },
    sub: { fontSize: 16, color: t.textSecondary, marginTop: 12, lineHeight: 22 },
    card: {
      backgroundColor: t.bgElevated,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.divider,
      padding: 18,
      marginTop: 26,
      gap: 14,
    },
    perkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    check: { color: t.accent, fontSize: 18, fontWeight: '700', width: 20 },
    perkText: { flex: 1, fontSize: 15, color: t.text },
    buyBtn: {
      backgroundColor: t.accent,
      borderRadius: 980,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 28,
    },
    buyText: { color: '#fff', fontSize: 17, fontWeight: '600' },
    restoreBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
    restoreText: { color: t.accent, fontSize: 15, fontWeight: '500' },
    laterBtn: { alignItems: 'center', paddingVertical: 8 },
    laterText: { color: t.textSecondary, fontSize: 15 },
    fine: { fontSize: 12, color: t.textTertiary, marginTop: 20, lineHeight: 17, textAlign: 'center' },
  });
