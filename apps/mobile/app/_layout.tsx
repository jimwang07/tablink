import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { TablinkDarkTheme } from '@/src/theme';
import { ThemeProvider } from '@react-navigation/native';

export default function RootLayout() {
  return (
    <ThemeProvider value={TablinkDarkTheme}>
      <StatusBar style="light" />
      <Stack>
        <Stack.Screen name="(host)" options={{ headerShown: false }} />
        <Stack.Screen
          name="receipt/[id]"
          options={{
            title: 'Receipt',
            presentation: 'modal',
            headerShown: false,
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
