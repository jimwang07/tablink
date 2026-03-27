import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors } from '@/src/theme';
import { useAuth } from '@/src/hooks/useAuth';

const emailRegex = /.+@.+\..+/;

export default function SignInScreen() {
  const {
    signInWithGoogle,
    signInWithApple,
    signInWithEmail,
    isAuthenticating,
    lastAuthError,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (lastAuthError) {
      Alert.alert('Authentication issue', lastAuthError.message);
    }
  }, [lastAuthError]);

  const emailIsValid = useMemo(() => emailRegex.test(email.trim().toLowerCase()), [email]);

  const handleGoogle = async () => {
    setMessage(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setMessage((error as Error).message || 'Google sign-in cancelled');
    }
  };

  const handleApple = async () => {
    setMessage(null);
    try {
      await signInWithApple();
    } catch (error) {
      setMessage((error as Error).message || 'Apple sign-in cancelled');
    }
  };

  const handleEmail = async () => {
    setMessage(null);
    setMagicLinkSent(false);
    try {
      await signInWithEmail(email.trim().toLowerCase());
      setMagicLinkSent(true);
      setMessage('Magic link sent! Check your inbox to continue.');
    } catch (error) {
      setMessage((error as Error).message || 'Failed to send magic link.');
    }
  };

  return (
    <SafeAreaView style={s.safeArea}>
      <KeyboardAvoidingView
        style={s.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Brand ── */}
          <Animated.View entering={FadeInDown.duration(600)} style={s.hero}>
            <Text style={s.brandName}>Tablink</Text>
            <View style={s.accent} />
            <Text style={s.tagline}>
              Split receipts.{'\n'}
              Share a link.{'\n'}
              Settle up.
            </Text>
          </Animated.View>

          {/* ── Auth section ── */}
          <Animated.View entering={FadeInDown.delay(200).duration(600)} style={s.authSection}>
            {/* OAuth buttons */}
            <Pressable
              style={({ pressed }) => [s.oauthButton, pressed && s.pressed]}
              onPress={handleGoogle}
              disabled={isAuthenticating}
            >
              <Ionicons name="logo-google" size={18} color={colors.text} />
              <Text style={s.oauthText}>Continue with Google</Text>
              {isAuthenticating && (
                <ActivityIndicator size="small" color={colors.muted} />
              )}
            </Pressable>

            {Platform.OS === 'ios' && (
              <Pressable
                style={({ pressed }) => [s.oauthButton, pressed && s.pressed]}
                onPress={handleApple}
                disabled={isAuthenticating}
              >
                <Ionicons name="logo-apple" size={18} color={colors.text} />
                <Text style={s.oauthText}>Continue with Apple</Text>
                {isAuthenticating && (
                  <ActivityIndicator size="small" color={colors.muted} />
                )}
              </Pressable>
            )}

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerLabel}>or</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Email */}
            <View style={s.emailGroup}>
              <TextInput
                placeholder="Email address"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={s.input}
                value={email}
                onChangeText={setEmail}
              />
              <Pressable
                style={({ pressed }) => [
                  s.ctaButton,
                  !emailIsValid && s.ctaButtonDisabled,
                  pressed && emailIsValid && s.ctaButtonPressed,
                ]}
                onPress={handleEmail}
                disabled={!emailIsValid || isAuthenticating}
              >
                {isAuthenticating ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={[s.ctaText, !emailIsValid && s.ctaTextDisabled]}>
                    Send magic link
                  </Text>
                )}
              </Pressable>
            </View>

            {/* Success state */}
            {magicLinkSent && (
              <Animated.View entering={FadeInDown.duration(400)} style={s.successRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={s.successText}>
                  Check your inbox — open the link on this device to finish signing in.
                </Text>
              </Animated.View>
            )}

            {/* Error state */}
            {message && !magicLinkSent && (
              <Animated.View entering={FadeInDown.duration(400)} style={s.errorRow}>
                <Text style={s.errorText}>{message}</Text>
              </Animated.View>
            )}
          </Animated.View>

          {/* ── Footer ── */}
          <Animated.View entering={FadeInDown.delay(400).duration(600)} style={s.footer}>
            <Text style={s.footerText}>
              By continuing you agree to keep things fair and transparent with your friends.
              We never handle funds — only the tab math.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ── Styles ────────────────────────────────────────────────── */

const s = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },

  /* Hero / Brand */
  hero: {
    marginBottom: 48,
  },
  brandName: {
    color: colors.text,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
  },
  accent: {
    width: 32,
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginTop: 16,
    marginBottom: 20,
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 30,
    letterSpacing: -0.2,
  },

  /* Auth section */
  authSection: {
    gap: 12,
    marginBottom: 48,
  },

  /* OAuth buttons — same surface treatment as receipt cards */
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  oauthText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },

  /* Divider — same 0.06 opacity as home tab bar and bottom bar */
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  dividerLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  /* Email — input matches surface treatment */
  emailGroup: {
    gap: 10,
  },
  input: {
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: colors.surface,
  },

  /* CTA — matches home FAB / empty state button */
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonDisabled: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  ctaButtonPressed: {
    opacity: 0.85,
  },
  ctaText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  ctaTextDisabled: {
    color: colors.muted,
  },

  /* Feedback states */
  successRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 4,
  },
  successText: {
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  errorRow: {
    paddingTop: 4,
  },
  errorText: {
    color: colors.warning,
    fontSize: 14,
    lineHeight: 20,
  },

  /* Footer */
  footer: {
    paddingTop: 24,
  },
  footerText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
