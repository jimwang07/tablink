import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { TablinkDarkTheme, colors } from '@/src/theme';
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

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
      return;
    }

    if (session && inAuthGroup) {
      router.replace('/(host)/home');
    }
  }, [currentTopSegment, isLoading, navigationReady, router, session]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
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
    <ThemeProvider value={TablinkDarkTheme}>
      <StatusBar style="light" />
      <AuthProvider>
        <PendingReceiptProvider>
          <AuthAwareStack />
        </PendingReceiptProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
