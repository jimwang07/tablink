import { PropsWithChildren, createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';

import { getSupabaseClient } from '@/src/lib/supabaseClient';

WebBrowser.maybeCompleteAuthSession();

type OAuthProvider = 'google';

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

function getQueryParamValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
}

function buildDefaultDisplayName(): string {
  return 'Host';
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
    if (Platform.OS !== 'ios') return;

    const subscription = AppleAuthentication.addRevokeListener(() => {
      const client = clientRef.current;
      if (!client) return;

      client.auth
        .signOut({ scope: 'local' })
        .catch((error) => {
          if (__DEV__) {
            console.warn('Failed to clear session after Apple credential revocation', error);
          }
        })
        .finally(() => {
          setSession(null);
        });
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    if (!session?.user?.id) return;
    if (profileChecked) return;

    const userId = session.user.id;
    const displayName = buildDefaultDisplayName();
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

        const parsed = Linking.parse(url);
        const queryParams = parsed?.queryParams ?? {};

        const authCode = getQueryParamValue(queryParams.code);
        if (authCode) {
          const { data, error } = await client.auth.exchangeCodeForSession(authCode);
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
          const { data, error } = await client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
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

  const handleAppleSignIn = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      throw new Error('Supabase client is not ready');
    }

    if (Platform.OS !== 'ios') {
      throw new Error('Apple Sign In is only available on iOS');
    }

    // In Expo Go, Apple returns an identity token for the Expo client
    // (`host.exp.Exponent`), which Supabase will reject for this app.
    if (Constants.appOwnership === 'expo') {
      throw new Error('Apple Sign In requires a development or production iOS build. It will not work in Expo Go.');
    }

    try {
      setLastAuthError(null);
      setIsAuthenticating(true);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identity token returned from Apple');
      }

      const { error } = await client.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) {
        throw error;
      }
    } catch (error: any) {
      if (error?.code === 'ERR_REQUEST_CANCELED') {
        throw new Error('Authentication was cancelled');
      }
      if (__DEV__) {
        console.warn('Apple sign-in failed', error);
      }
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
      signInWithApple: handleAppleSignIn,
      signInWithEmail,
      signOut,
    }),
    [handleAppleSignIn, handleOAuthSignIn, isAuthenticating, isLoading, lastAuthError, session, signInWithEmail, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
