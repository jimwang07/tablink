import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  Alert,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  Pressable,
  View,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { CameraView, useCameraPermissions} from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@/src/theme';
import { uploadReceiptImage } from '@/src/lib/imageUpload';
import { useAuth } from '@/src/hooks/useAuth';
import { usePendingReceipt } from '@/src/hooks/usePendingReceipt';
import {
  getParseFunctionName,
  invokeParseReceipt,
  PARSE_FUNCTIONS,
  setParseFunctionOverride,
  type ParseFunctionName,
} from '@/src/lib/api/parseReceipt';
import { getScanUsage, recordScan, type ScanUsage } from '@/src/services/scanLimitService';
import { ScanLimitPaywall } from '@/src/components/ScanLimitPaywall';
import type { ParsedReceipt } from '@/src/types/receipt';

const FOOTER_OVERLAY_SPACE = 220;
const MIN_STAGE_DURATION_MS = 600;

type ScanState = 'idle' | 'preview' | 'processing' | 'error';
type PhotoLight = { uri: string; width?: number; height?: number };
type ProcessingStage = 'upload' | 'extract' | 'finalize';

export default function ScanReceiptScreen() {
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView | null>(null);
  const router = useRouter();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = ImagePicker.useMediaLibraryPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastPhoto, setLastPhoto] = useState<PhotoLight | null>(null);
  const [importPreview, setImportPreview] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(FOOTER_OVERLAY_SPACE);
  const [flowState, setFlowState] = useState<ScanState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const continueStartRef = useRef<number | null>(null);
  const stageStartedAtRef = useRef<number>(0);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('upload');
  const [parseFunction, setParseFunction] = useState<ParseFunctionName>('parse-receipt-groq');

  const { session } = useAuth();
  const { setPendingReceipt } = usePendingReceipt();
  const [scanUsage, setScanUsage] = useState<ScanUsage | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (session?.user?.id) {
      getScanUsage(session.user.id).then(setScanUsage);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!__DEV__) return;

    let isMounted = true;
    getParseFunctionName().then((name) => {
      if (isMounted) setParseFunction(name);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const logFlowTiming = useCallback(
    (event: string) => {
      if (continueStartRef.current != null) {
        const elapsed = Date.now() - continueStartRef.current;
        console.log(`[perf][scan] ${event} after ${elapsed}ms`);
        continueStartRef.current = null;
      }
    },
    [continueStartRef]
  );

  const hasCameraPermission = useMemo(() => cameraPermission?.granted === true, [cameraPermission]);
  const hasPreview = Boolean(lastPhoto || importPreview);
  const isPreviewActive = flowState === 'preview' && hasPreview;

  const requestPermissions = useCallback(async () => {
    const { status } = await requestCameraPermission();
    if (status !== 'granted') {
      Alert.alert(
        'Camera access needed',
        'We use your camera to scan receipts. Enable access in Settings to continue.'
      );
    }
  }, [requestCameraPermission]);

  const checkScanLimit = useCallback((): boolean => {
    if (!scanUsage) return true; // Still loading, allow optimistically
    if (scanUsage.isSubscribed) return true;
    if (scanUsage.remaining > 0) return true;
    setShowPaywall(true);
    return false;
  }, [scanUsage]);

  const handleImport = useCallback(async () => {
    if (!checkScanLimit()) return;
    const ensurePermission = async () => {
      if (!mediaPermission || mediaPermission.status !== 'granted') {
        const { status } = await requestMediaPermission();
        return status === 'granted';
      }
      return true;
    };

    const permitted = await ensurePermission();
    if (!permitted) {
      Alert.alert(
        'Photo library access needed',
        'Grant access to your photo library to import an existing receipt image.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsMultipleSelection: false,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      setImportPreview(asset.uri);
      setLastPhoto(null);
      setFlowState('preview');
    }
  }, [checkScanLimit, mediaPermission, requestMediaPermission]);

  const cropToGuide = useCallback(async (photo: { uri: string; width: number; height: number }) => {
    const targetAspect = 3 / 4; // width:height to mirror the on-screen guide
    const maxWidth = photo.width * 0.9;
    const maxHeight = photo.height * 0.9;

    let cropHeight = maxHeight;
    let cropWidth = cropHeight * targetAspect;

    if (cropWidth > maxWidth) {
      cropWidth = maxWidth;
      cropHeight = cropWidth / targetAspect;
    }

    const originX = Math.max(0, Math.round((photo.width - cropWidth) / 2));
    const originY = Math.max(0, Math.round((photo.height - cropHeight) / 2));
    const width = Math.round(cropWidth);
    const height = Math.round(cropHeight);

    const cropped = await ImageManipulator.manipulateAsync(
      photo.uri,
      [{ crop: { originX, originY, width, height } }],
      { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
    );

    return { uri: cropped.uri, width: cropped.width ?? width, height: cropped.height ?? height };
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) {
      return;
    }
    if (!checkScanLimit()) return;

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: Platform.OS === 'android',
      });
      const cropped = await cropToGuide({ uri: photo.uri, width: photo.width, height: photo.height });
      setLastPhoto({ uri: cropped.uri, width: cropped.width, height: cropped.height });
      setImportPreview(null);
      Alert.alert('Receipt captured', 'We will parse the image right after you confirm details.');
      setFlowState('preview');
    } catch (error) {
      console.warn('Failed to capture photo', error);
      Alert.alert('Capture failed', 'We could not capture the photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [checkScanLimit, cropToGuide, isCapturing]);

  const ensureStageDuration = useCallback(async () => {
    const elapsed = Date.now() - stageStartedAtRef.current;
    const remaining = MIN_STAGE_DURATION_MS - elapsed;
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
  }, []);

  const beginUploadAndParse = useCallback(
    async (localUri: string, userId: string) => {
      try {
        setFlowState('processing');
        setErrorMessage(null);
        setProcessingStage('upload');
        stageStartedAtRef.current = Date.now();

        // 1. Upload downsized-only image (this is now the canonical receipt image)
        let uploadResult;
        try {
          uploadResult = await uploadReceiptImage(localUri, userId);
        } catch (uploadErr: any) {
          await ensureStageDuration();
          logFlowTiming('upload failed');
          setErrorMessage(uploadErr?.message || 'Failed to upload receipt.');
          setFlowState('error');
          setProcessingStage('upload');
          return;
        }
        await ensureStageDuration();

        if (!uploadResult?.storagePath) {
          logFlowTiming('upload failed');
          setErrorMessage('Failed to upload receipt.');
          setFlowState('error');
          setProcessingStage('upload');
          return;
        }

        // 2. Move to parsing stage
        setProcessingStage('extract');
        stageStartedAtRef.current = Date.now();

        // 3. Call parse edge fn with that storagePath
        let receipt: ParsedReceipt | null = null;
        try {
          receipt = await invokeParseReceipt(uploadResult.storagePath, userId);
        } catch (err: any) {
          await ensureStageDuration();
          logFlowTiming('parse receipt failed');
          setErrorMessage(
            err?.message || 'Failed to parse receipt. Please try again.'
          );
          setFlowState('error');
          setProcessingStage('upload');
          return;
        }
        await ensureStageDuration();

        if (!receipt) {
          logFlowTiming('parse receipt returned empty');
          setErrorMessage('Failed to parse receipt. Please try again.');
          setFlowState('error');
          setProcessingStage('upload');
          return;
        }

        // 3.5 Finalize stage
        setProcessingStage('finalize');
        stageStartedAtRef.current = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 450));

        // 4. Record scan usage
        recordScan(userId);
        setScanUsage((prev) =>
          prev && !prev.isSubscribed
            ? { ...prev, used: prev.used + 1, remaining: Math.max(0, prev.remaining - 1) }
            : prev
        );

        // 5. Put it in PendingReceipt so /receipt/review can render
        setPendingReceipt({
          localUri: uploadResult.localPreviewUri || localUri,
          storagePath: uploadResult.storagePath ?? null,
          publicUrl: uploadResult.publicUrl ?? null,
          parsed: receipt,
        });

        // 6. Reset camera flow + navigate
        setFlowState('idle');
        setLastPhoto(null);
        setImportPreview(null);
        setProcessingStage('upload');
        logFlowTiming('navigating to review');
        router.push('/receipt/review');
      } catch (error: any) {
        logFlowTiming('flow error');
        setErrorMessage(error?.message || 'Failed to process receipt');
        setFlowState('error');
        setProcessingStage('upload');
      }
    },
    [ensureStageDuration, logFlowTiming, router, setPendingReceipt]
  );

  const handleFooterLayout = useCallback(
    ({ nativeEvent }: { nativeEvent: { layout: { height: number } } }) => {
      const nextHeight = nativeEvent.layout.height;
      if (nextHeight > 0 && Math.abs(nextHeight - footerHeight) > 2) {
        setFooterHeight(nextHeight);
      }
    },
    [footerHeight]
  );

  const handleParseFunctionChange = useCallback(async (nextFunction: ParseFunctionName) => {
    await setParseFunctionOverride(nextFunction);
    setParseFunction(nextFunction);
  }, []);

  if (cameraPermission?.granted === false) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <View style={styles.permissionIconWrap}>
            <Ionicons name="camera-outline" size={24} color={colors.primary} />
          </View>
          <Text style={styles.permissionTitle}>Enable your camera</Text>
          <Text style={styles.permissionBody}>
            We only use the camera to snap your receipt so we can itemize it for you. You stay in control—no photos are
            saved to your library.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={requestPermissions}
          >
            <Ionicons name="scan-outline" size={16} color="#04110D" />
            <Text style={styles.primaryButtonText}>Allow camera access</Text>
            <Ionicons name="arrow-forward" size={16} color="#04110D" />
          </Pressable>
          <Text style={styles.permissionFootnote}>
            You can change this anytime in Settings.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.cameraContainer, { paddingBottom: footerHeight + 16 }]}>
        {!hasCameraPermission ? (
          <View style={styles.permissionLoader}>
            <Pressable
              style={({ pressed }) => [styles.permissionLink, pressed && styles.pressed]}
              onPress={requestPermissions}
            >
              <Text style={styles.permissionLinkText}>Tap to enable camera access</Text>
            </Pressable>
          </View>
        ) : isPreviewActive ? (
          <View style={styles.cameraPlaceholder} />
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            active={isFocused && flowState === 'idle'}
          />
        )}

        {hasCameraPermission && flowState === 'idle' && (
          <View pointerEvents="none" style={[styles.overlayContainer, { paddingBottom: footerHeight + 16 }]}>
            <View style={styles.overlayTopMask} />
            <View style={styles.overlayCenterWrapper}>
              <View style={styles.overlayCenter}>
               <View style={styles.cornerTopLeft} />
               <View style={styles.cornerTopRight} />
               <View style={styles.cornerBottomLeft} />
               <View style={styles.cornerBottomRight} />
             </View>
           </View>
         </View>
       )}
      </View>

      <SafeAreaView
        style={[
          styles.footer,
          isPreviewActive || flowState === 'processing'
            ? styles.footerFullScreen
            : styles.footerActions,
        ]}
        onLayout={handleFooterLayout}
      >
        {isPreviewActive ? (
          <View style={styles.confirmationContainer}>
            <Image source={{ uri: lastPhoto?.uri ?? importPreview ?? '' }} style={styles.previewImage} />
            <Text style={styles.previewHint}>
              Looks good? We&apos;ll parse the receipt on the next screen when you continue.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.retakeButton, pressed && styles.pressed]}
              onPress={() => {
                setLastPhoto(null);
                setImportPreview(null);
                setFlowState('idle');
              }}
            >
              <Ionicons name="refresh" size={18} color={colors.text} />
              <Text style={styles.retakeButtonText}>Retake</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}
              onPress={() => {
                if (!session?.user?.id) {
                  Alert.alert('Sign in required', 'You must be signed in to process receipts.');
                  return;
                }

                const sourceUri = lastPhoto?.uri ?? importPreview;
                if (!sourceUri) {
                  Alert.alert('No image', 'Please capture or import a receipt first.');
                  return;
                }

                continueStartRef.current = Date.now();
                console.log('[perf][scan] continue tapped');
                beginUploadAndParse(sourceUri, session.user.id);
              }}
            >
              <Ionicons name="arrow-forward" size={16} color="#04110D" />
              <Text style={styles.continueButtonText}>Continue</Text>
            </Pressable>
          </View>
        ) : flowState === 'processing' ? (
          <ProcessingStatus stage={processingStage} />
        ) : flowState === 'error' && errorMessage ? (
          <View style={styles.statusContainer}>
            <View style={styles.errorIconWrap}>
              <Ionicons name="alert-circle-outline" size={24} color={colors.danger} />
            </View>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              onPress={() => {
                setErrorMessage(null);
                setFlowState('idle');
              }}
            >
              <Ionicons name="refresh" size={16} color={colors.text} />
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.footerButtons}>
            {__DEV__ && (
              <View style={styles.devParserCard}>
                <Text style={styles.devParserLabel}>Parser for testing</Text>
                <View style={styles.devParserOptions}>
                  {PARSE_FUNCTIONS.map((option) => {
                    const isSelected = option === parseFunction;
                    return (
                      <Pressable
                        key={option}
                        style={({ pressed }) => [
                          styles.devParserChip,
                          isSelected && styles.devParserChipSelected,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => {
                          void handleParseFunctionChange(option);
                        }}
                      >
                        <Text
                          style={[
                            styles.devParserChipText,
                            isSelected && styles.devParserChipTextSelected,
                          ]}
                        >
                          {option === 'parse-receipt-groq' ? 'Groq' : 'OpenAI'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.devParserHint}>{parseFunction}</Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.captureButton,
                isCapturing && styles.captureButtonDisabled,
                pressed && styles.pressed,
              ]}
              onPress={handleCapture}
              disabled={isCapturing || !hasCameraPermission}
            >
              <Ionicons name="camera" size={28} color="#000" />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.importButton, pressed && styles.pressed]}
              onPress={handleImport}
            >
              <Ionicons name="images-outline" size={20} color={colors.text} />
              <Text style={styles.importButtonText}>Import photo</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>

      {showPaywall && scanUsage && (
        <ScanLimitPaywall
          usage={scanUsage}
          onDismiss={() => setShowPaywall(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: colors.background,
  },
  camera: {
    flex: 1,
  },
  permissionLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 16,
  },
  permissionLink: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: colors.surface,
  },
  permissionLinkText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  overlayTopMask: {
    flexGrow: 0.3,
  },
  overlayCenterWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 8,
  },
  overlayCenter: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 3 / 4,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(8,10,12,0.18)',
  },
  cornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 48,
    height: 48,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.primary,
  },
  cornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 48,
    height: 48,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: colors.primary,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 48,
    height: 48,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.primary,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 48,
    height: 48,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: colors.primary,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footerActions: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: Platform.OS === 'android' ? 48 : 44,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  footerButtons: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    marginTop: 24,
    marginBottom: 32,
  },
  devParserCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  devParserLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  devParserOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  devParserChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  devParserChipSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  devParserChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  devParserChipTextSelected: {
    color: colors.text,
  },
  devParserHint: {
    color: colors.muted,
    fontSize: 12,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: colors.surface,
  },
  importButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  footerFullScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'android' ? 32 : 28,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  confirmationContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  previewImage: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginTop: 16,
  },
  previewHint: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 32,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: colors.surface,
  },
  retakeButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  continueButton: {
    marginTop: 12,
    marginBottom: 24,
    backgroundColor: '#57E6AE',
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(87, 230, 174, 0.55)',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#57E6AE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  continueButtonText: {
    color: '#04110D',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.7,
  },
  statusContainer: {
    alignItems: 'center',
    gap: 12,
  },
  errorIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 92, 92, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  errorMessage: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryButtonText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  /* Permission screen */
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: 'center',
  },
  permissionContent: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 14,
  },
  permissionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
  },
  permissionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  permissionBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  permissionFootnote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  primaryButton: {
    backgroundColor: '#57E6AE',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(87, 230, 174, 0.55)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    shadowColor: '#57E6AE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#04110D',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  /* Processing */
  processingWrapper: {
    width: '100%',
    paddingHorizontal: 12,
  },
  processingCard: {
    gap: 20,
  },
  processingHero: {
    alignItems: 'center',
    gap: 12,
  },
  processingHeroCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  processingHeroScan: {
    position: 'absolute',
    width: '160%',
    height: 2,
    top: '48%',
    backgroundColor: 'rgba(52, 211, 153, 0.5)',
  },
  processingTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  processingSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  processingProgressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    overflow: 'hidden',
  },
  processingProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  processingStepsList: {
    gap: 0,
  },
  processingStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  processingStepRowActive: {
    backgroundColor: 'rgba(52, 211, 153, 0.04)',
  },
  processingStepRowDone: {},
  processingStepIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  processingStepIndicatorActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  processingStepIndicatorDone: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  processingStepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  processingStepIndexText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  processingStepCopy: {
    flex: 1,
    gap: 2,
  },
  processingStepTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  processingStepSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  processingFooterNote: {
    marginTop: 16,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
  },
});

const PROCESSING_STEPS: {
  key: ProcessingStage;
  title: string;
  subtitle: string;
}[] = [
  {
    key: 'upload',
    title: 'Securing your photo',
    subtitle: 'Polishing the image so tab math stays sharp.',
  },
  {
    key: 'extract',
    title: 'Extracting items with AI',
    subtitle: 'Reading line items, totals, and every nuance.',
  },
  {
    key: 'finalize',
    title: 'Balancing the tab',
    subtitle: 'Matching tax & tip for a perfect split.',
  },
];

const STAGE_COPY: Record<ProcessingStage, { headline: string; helper: string }> = {
  upload: {
    headline: 'Uploading your receipt',
    helper: 'Hang tight\u2014we\u2019re securing a crystal clear copy.',
  },
  extract: {
    headline: 'Extracting items',
    helper: 'Tablink is reading every line for quick claiming.',
  },
  finalize: {
    headline: 'Finishing touches',
    helper: 'Balancing tax and tip so everyone pays their share.',
  },
};

function ProcessingStatus({ stage }: { stage: ProcessingStage }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pulseAnim.setValue(1);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    return () => {
      pulseLoop.stop();
    };
  }, [pulseAnim]);

  useEffect(() => {
    shimmerAnim.setValue(0);
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    shimmerLoop.start();
    return () => {
      shimmerLoop.stop();
    };
  }, [shimmerAnim]);

  useEffect(() => {
    const currentIndex = PROCESSING_STEPS.findIndex((step) => step.key === stage);
    const denominator = Math.max(PROCESSING_STEPS.length - 1, 1);
    const target = currentIndex / denominator;

    Animated.timing(progressAnim, {
      toValue: target,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [stage, progressAnim]);

  const currentIndex = PROCESSING_STEPS.findIndex((step) => step.key === stage);
  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-160, 160],
  });
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.processingWrapper}>
      <View style={styles.processingCard}>
        <View style={styles.processingHero}>
          <Animated.View style={[styles.processingHeroCircle, { transform: [{ scale: pulseAnim }] }]}>
            <Ionicons name="receipt-outline" size={32} color={colors.primary} />
            <Animated.View
              style={[
                styles.processingHeroScan,
                { transform: [{ translateX }] },
              ]}
            />
          </Animated.View>
          <Text style={styles.processingTitle}>{STAGE_COPY[stage].headline}</Text>
          <Text style={styles.processingSubtitle}>{STAGE_COPY[stage].helper}</Text>
        </View>
        <View style={styles.processingProgressTrack}>
          <Animated.View style={[styles.processingProgressFill, { width: progressWidth }]} />
        </View>
        <View style={styles.processingStepsList}>
          {PROCESSING_STEPS.map((step, index) => {
            const status = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'pending';
            return (
              <View
                key={step.key}
                style={[
                  styles.processingStepRow,
                  status === 'active' && styles.processingStepRowActive,
                  status === 'done' && styles.processingStepRowDone,
                ]}
              >
                <View
                  style={[
                    styles.processingStepIndicator,
                    status === 'active' && styles.processingStepIndicatorActive,
                    status === 'done' && styles.processingStepIndicatorDone,
                  ]}
                >
                  {status === 'done' ? (
                    <Ionicons name="checkmark" size={16} color="#000" />
                  ) : status === 'active' ? (
                    <View style={styles.processingStepDot} />
                  ) : (
                    <Text style={styles.processingStepIndexText}>{index + 1}</Text>
                  )}
                </View>
                <View style={styles.processingStepCopy}>
                  <Text style={styles.processingStepTitle}>{step.title}</Text>
                  <Text style={styles.processingStepSubtitle}>{step.subtitle}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
      <Text style={styles.processingFooterNote}>Tablink keeps everything private while we prep your tab.</Text>
    </View>
  );
}
