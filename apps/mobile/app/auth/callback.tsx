import { useEffect, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { ScreenPlaceholder } from '@/src/components/Skeleton';
import { useAuth } from '@/src/hooks/useAuth';

export default function AuthCallbackScreen() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [canFallback, setCanFallback] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setCanFallback(true);
    }, 4000);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (session) {
      router.replace('/(host)/home');
    }
  }, [isLoading, router, session]);

  if (isLoading) {
    return <ScreenPlaceholder />;
  }

  if (!session && canFallback) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <ScreenPlaceholder />;
}
