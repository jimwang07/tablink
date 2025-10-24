import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Welcome to Tablink</Text>
          <Text style={styles.heading}>Settle group tabs without friction.</Text>
          <Text style={styles.body}>
            Scan receipts, generate share links, and let friends claim what they owe—no app required on their end.
          </Text>
        </View>

        <View style={styles.authCard}>
          <Text style={styles.sectionLabel}>Continue with</Text>
          <TouchableOpacity style={styles.authButton} onPress={handleGoogle} disabled={isAuthenticating}>
            <Ionicons name="logo-google" size={20} color={colors.text} style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Continue with Google</Text>
            {isAuthenticating && <ActivityIndicator size="small" color={colors.primary} style={styles.buttonSpinner} />}
          </TouchableOpacity>

          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.authButton} onPress={handleApple} disabled={isAuthenticating}>
              <Ionicons name="logo-apple" size={20} color={colors.text} style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Continue with Apple</Text>
              {isAuthenticating && <ActivityIndicator size="small" color={colors.primary} style={styles.buttonSpinner} />}
            </TouchableOpacity>
          )}

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>or use email</Text>
            <View style={styles.line} />
          </View>

          <View style={styles.emailBlock}>
            <Text style={styles.emailLabel}>Email address</Text>
            <TextInput
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
            />
            <TouchableOpacity
              style={[styles.primaryButton, !emailIsValid && styles.primaryButtonDisabled]}
              onPress={handleEmail}
              disabled={!emailIsValid || isAuthenticating}
            >
              {isAuthenticating ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={styles.primaryButtonText}>Send magic link</Text>
              )}
            </TouchableOpacity>
            {magicLinkSent && (
              <Text style={styles.successMessage}>
                Magic link sent! Open the link on this device to finish signing in.
              </Text>
            )}
          </View>
        </View>

        {(message || lastAuthError) && (
          <View style={styles.messageArea}>
            <Text style={styles.messageText}>
              {message || lastAuthError?.message}
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By continuing you agree to keep things fair and transparent with your friends. We never handle funds—only
            the tab math.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
    gap: 32,
  },
  hero: {
    gap: 12,
  },
  kicker: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
  authCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  buttonIcon: {
    marginRight: 12,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  buttonSpinner: {
    marginLeft: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.surfaceBorder,
  },
  dividerText: {
    color: colors.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emailBlock: {
    gap: 12,
  },
  emailLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  input: {
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: colors.surfaceBorder,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  successMessage: {
    color: colors.primary,
    fontSize: 13,
    lineHeight: 18,
  },
  messageArea: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  messageText: {
    color: colors.warning,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    paddingBottom: 24,
  },
  footerText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
