import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/src/theme';

export default function ScanReceiptScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Scan a Receipt</Text>
      <Text style={styles.body}>
        This will open the camera flow to capture a receipt image for OCR. We’ll wire it up soon.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: 'center',
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
});
