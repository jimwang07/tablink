import { Stack } from 'expo-router';
import { colors } from '@/src/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
    </Stack>
  );
}
