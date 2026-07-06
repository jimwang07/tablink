import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { TablinkDarkTheme, colors } from '@/src/theme';
import { ScreenPlaceholder } from '@/src/components/Skeleton';
import { AuthProvider } from '@/src/providers/AuthProvider';
import { PendingReceiptProvider } from '@/src/providers/PendingReceiptProvider';
import { useAuth } from '@/src/hooks/useAuth';
import { ThemeProvider } from '@react-navigation/native';

function AuthAwareStack() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const navigationReady = navigationState?.key != null;
  const currentTopSegment = segments[0];

  useEffect(() => {
    if (!navigationReady || isLoading) {
      return;
    }

    const inAuthGroup = currentTopSegment === '(auth)';
    const inAuthCallback = currentTopSegment === 'auth';

    if (!session && !inAuthGroup && !inAuthCallback) {
      router.replace('/(auth)/sign-in');
      return;
    }

    if (session && (inAuthGroup || inAuthCallback)) {
      router.replace('/(host)/home');
    }
  }, [currentTopSegment, isLoading, navigationReady, router, session]);

  if (isLoading) {
    return <ScreenPlaceholder />;
  }

  if (!session) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      </Stack>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="(host)" options={{ headerShown: false }} />
      <Stack.Screen
        name="receipt/[id]"
        options={{
          title: 'Receipt',
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="receipt/review"
        options={{
          title: 'Review & Edit',
          presentation: 'modal',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="receipt/your-items"
        options={{
          title: 'Your Items',
          presentation: 'modal',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="scan"
        options={{
          title: 'Scan Receipt',
          presentation: 'modal',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShown: true,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={TablinkDarkTheme}>
        <StatusBar style="light" />
        <AuthProvider>
          <PendingReceiptProvider>
            <AuthAwareStack />
          </PendingReceiptProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
