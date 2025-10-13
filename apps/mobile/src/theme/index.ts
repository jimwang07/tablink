import { DarkTheme, Theme } from '@react-navigation/native';
import { colors } from './colors';

export const TablinkDarkTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    primary: colors.primary,
    border: colors.surfaceBorder,
    text: colors.text,
    notification: colors.primary,
  },
};

export { colors };
