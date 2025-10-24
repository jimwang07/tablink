import { PropsWithChildren, createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';

import { getSupabaseClient } from '@/src/lib/supabaseClient';

WebBrowser.maybeCompleteAuthSession();

type OAuthProvider = 'google' | 'apple';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  lastAuthError: AuthError | Error | null;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function buildRedirectUri() {
  return makeRedirectUri({
    scheme: 'tablink',
    path: 'auth/callback',
  });
}

export function AuthProvider({ children }: PropsWithChildren) {
  const clientRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const [clientReady, setClientReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [lastAuthError, setLastAuthError] = useState<AuthError | Error | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      clientRef.current = getSupabaseClient();
    } catch (error) {
      console.warn('Failed to create Supabase client', error);
    } finally {
      setClientReady(true);
    }
  }, []);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (isMounted) {
          setSession(data.session ?? null);
        }
      } catch (error) {
        console.warn('Failed to fetch auth session', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [clientReady]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    if (!session?.user?.id) return;
    if (profileChecked) return;

    const userId = session.user.id;
    const displayName = session.user.user_metadata?.full_name || session.user.email || 'Unknown';
    const avatarUrl = session.user.user_metadata?.avatar_url || null;

    (async () => {
      try {
        const { error } = await client
          .from('user_profiles')
          .insert({
            user_id: userId,
            display_name: displayName,
            avatar_url: avatarUrl,
          })
          .select('user_id')
          .single();

        if (error && error.code !== '23505') {
          console.warn('Failed to upsert user profile', error);
        }
      } catch (error) {
        console.warn('Profile creation error', error);
      } finally {
        setProfileChecked(true);
      }
    })();
  }, [profileChecked, session]);

  const handleSessionFromUrl = useCallback(
    async (url?: string | null) => {
      if (!url) return;
      const client = clientRef.current;
      if (!client) return;

      try {
        setLastAuthError(null);

        if (typeof client.auth.getSessionFromUrl === 'function') {
          const { data, error } = await client.auth.getSessionFromUrl({ url, storeSession: true });
          if (error) {
            throw error;
          }
          if (data.session) {
            setSession(data.session);
          }
          return;
        }

        const parsed = Linking.parse(url);
        const queryParams = parsed?.queryParams ?? {};

        const authCode = typeof queryParams.code === 'string' ? queryParams.code : undefined;
        if (authCode && typeof client.auth.exchangeCodeForSession === 'function') {
          const { data, error } = await client.auth.exchangeCodeForSession({ authCode });
          if (error) {
            throw error;
          }
          if (data.session) {
            setSession(data.session);
          }
          return;
        }

        const fragment = url.split('#')[1] ?? '';
        if (!fragment) {
          return;
        }
        const fragmentParams = new URLSearchParams(fragment);

        const accessToken = fragmentParams.get('access_token');
        const refreshToken = fragmentParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const expiresAt = fragmentParams.get('expires_at');
          const expiresIn = fragmentParams.get('expires_in');

          const { data, error } = await client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt ? Number(expiresAt) : undefined,
            expires_in: expiresIn ? Number(expiresIn) : undefined,
          });

          if (error) {
            throw error;
          }

          if (!data.session) {
            const { data: latest } = await client.auth.getSession();
            if (latest.session) {
              setSession(latest.session);
            }
          } else {
            setSession(data.session);
          }
        }
      } catch (error) {
        setLastAuthError(error as AuthError | Error);
        if (__DEV__) {
          console.warn('Failed to handle auth URL', error);
        }
        throw error;
      }
    },
    []
  );

  useEffect(() => {
    if (!clientReady) return;

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleSessionFromUrl(url).catch((error) => {
        if (__DEV__) {
          console.warn('Failed to handle auth callback', error);
        }
      });
    });

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleSessionFromUrl(url).catch((error) => {
          if (__DEV__) {
            console.warn('Failed to process initial auth URL', error);
          }
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [clientReady, handleSessionFromUrl]);

  const handleOAuthSignIn = useCallback(
    async (provider: OAuthProvider) => {
      const client = clientRef.current;
      if (!client) {
        throw new Error('Supabase client is not ready');
      }
      try {
        setLastAuthError(null);
        setIsAuthenticating(true);

        const redirectTo = buildRedirectUri();
        const { data, error } = await client.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });

        if (error) {
          throw error;
        }

        if (data?.url) {
          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

          if (result.type === 'dismiss' || result.type === 'cancel') {
            throw new Error('Authentication was cancelled');
          }

          if (result.type === 'success') {
            await handleSessionFromUrl(result.url);
          }
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('OAuth sign-in failed', error);
        }
        setLastAuthError(error as AuthError | Error);
        throw error;
      } finally {
        setIsAuthenticating(false);
      }
    },
    [handleSessionFromUrl]
  );

  const signInWithEmail = useCallback(
    async (email: string) => {
      const client = clientRef.current;
      if (!client) {
        throw new Error('Supabase client is not ready');
      }
      try {
        setLastAuthError(null);
        setIsAuthenticating(true);

        const redirectTo = buildRedirectUri();
        const { error } = await client.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: redirectTo,
            createUser: true,
            shouldCreateUser: true,
          },
        });

        if (error) {
          throw error;
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Magic link sign-in failed', error);
        }
        setLastAuthError(error as AuthError | Error);
        throw error;
      } finally {
        setIsAuthenticating(false);
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      throw new Error('Supabase client is not ready');
    }
    try {
      setLastAuthError(null);
      setIsAuthenticating(true);
      await client.auth.signOut();
      setSession(null);
    } catch (error) {
      setLastAuthError(error as AuthError | Error);
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isAuthenticating,
      lastAuthError,
      signInWithGoogle: () => handleOAuthSignIn('google'),
      signInWithApple: () => handleOAuthSignIn('apple'),
      signInWithEmail,
      signOut,
    }),
    [handleOAuthSignIn, isAuthenticating, isLoading, lastAuthError, session, signInWithEmail, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
