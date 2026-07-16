import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import 'react-native-reanimated';

import Onboarding from '@/components/onboarding';
import { SimulationProvider } from '@/context/simulation';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // Shown on every launch; Skip / Get started dismisses it to reveal the tabs.
  const [showOnboarding, setShowOnboarding] = useState(true);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SimulationProvider>
        {/* statusBarStyle on the Stack so react-native-screens doesn't revert the
            bar to its default after a screen transition (the standalone StatusBar
            component alone loses that race). */}
        <Stack screenOptions={{ statusBarStyle: colorScheme === 'dark' ? 'light' : 'dark' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </SimulationProvider>
    </ThemeProvider>
  );
}
