import { Redirect } from 'expo-router';

import { ScreenPlaceholder } from '@/src/components/Skeleton';
import { useAuth } from '@/src/hooks/useAuth';

export default function Index() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return <ScreenPlaceholder />;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <Redirect href="/(host)/home" />;
}
