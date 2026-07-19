import { useColorScheme } from 'react-native';

/**
 * Apple-flavored palette, carried over from the original Garage Boxes web tab
 * (styles/garage.css) and extended with a dark variant so the app respects the
 * system appearance setting.
 */
export interface Theme {
  dark: boolean;
  bg: string;
  bgElevated: string;
  bgSubtle: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  divider: string;
  accent: string;
  accentHover: string;
  accentTint: string;
  negative: string;
  card: string;
  overlay: string;
}

const light: Theme = {
  dark: false,
  bg: '#ffffff',
  bgElevated: '#fbfbfd',
  bgSubtle: '#f5f5f7',
  text: '#1d1d1f',
  textSecondary: '#6e6e73',
  textTertiary: '#86868b',
  divider: '#d2d2d7',
  accent: '#0071e3',
  accentHover: '#0077ed',
  accentTint: 'rgba(0,113,227,0.15)',
  negative: '#d70015',
  card: '#fbfbfd',
  overlay: 'rgba(0,0,0,0.92)',
};

const dark: Theme = {
  dark: true,
  bg: '#000000',
  bgElevated: '#1c1c1e',
  bgSubtle: '#2c2c2e',
  text: '#f5f5f7',
  textSecondary: '#aeaeb2',
  textTertiary: '#8e8e93',
  divider: '#38383a',
  accent: '#0a84ff',
  accentHover: '#409cff',
  accentTint: 'rgba(10,132,255,0.22)',
  negative: '#ff453a',
  card: '#1c1c1e',
  overlay: 'rgba(0,0,0,0.94)',
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export { light as lightTheme, dark as darkTheme };
