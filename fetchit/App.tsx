import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PurchasesProvider } from './src/purchases';
import { StoreProvider } from './src/store';
import { useTheme } from './src/theme';
import { RootStackParamList } from './src/types';

import BoxDetailScreen from './src/screens/BoxDetailScreen';
import BoxesScreen from './src/screens/BoxesScreen';
import PaywallScreen from './src/screens/PaywallScreen';
import PhotoViewerScreen from './src/screens/PhotoViewerScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

function Navigation() {
  const theme = useTheme();
  const navTheme = theme.dark
    ? {
        ...DarkTheme,
        colors: { ...DarkTheme.colors, background: theme.bg, card: theme.bg, text: theme.text, primary: theme.accent, border: theme.divider },
      }
    : {
        ...DefaultTheme,
        colors: { ...DefaultTheme.colors, background: theme.bg, card: theme.bg, text: theme.text, primary: theme.accent, border: theme.divider },
      };

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTitleStyle: { color: theme.text, fontWeight: '600' },
          headerTintColor: theme.accent,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen
          name="Boxes"
          component={BoxesScreen}
          options={{ title: 'FetchIt' }}
        />
        <Stack.Screen name="BoxDetail" component={BoxDetailScreen} options={{ title: 'Box' }} />
        <Stack.Screen
          name="PhotoViewer"
          component={PhotoViewerScreen}
          options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        <Stack.Screen
          name="Paywall"
          component={PaywallScreen}
          options={{ headerShown: false, presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PurchasesProvider>
          <StoreProvider>
            <Navigation />
          </StoreProvider>
        </PurchasesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
