import React, { createContext, useContext, useState } from 'react';

export type Theme = 'golden' | 'dreamy' | 'moonlight' | 'blossom' | 'cosmic';

export interface ThemeConfig {
  name: string;
  label: string;
  bg: string;
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
  particle: string;
  treeTrunk: string;
  treeleaf: string;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
}

export const THEMES: Record<Theme, ThemeConfig> = {
  golden: {
    name: 'golden',
    label: 'Solar Circuit',
    bg: 'from-[#06070b] via-[#101321] to-[#06070b]',
    primary: '#ffd166',
    secondary: '#00e5ff',
    accent: '#ff4ecd',
    glow: 'rgba(0,229,255,0.36)',
    particle: '#00e5ff',
    treeTrunk: '#7c4a26',
    treeleaf: '#36f1cd',
    gradientFrom: '#06070b',
    gradientVia: '#101321',
    gradientTo: '#06070b',
  },
  dreamy: {
    name: 'dreamy',
    label: 'Aurora Pop',
    bg: 'from-[#05070c] via-[#0d1720] to-[#05070c]',
    primary: '#7cf7ff',
    secondary: '#ff5fd2',
    accent: '#b8ff6a',
    glow: 'rgba(124,247,255,0.34)',
    particle: '#7cf7ff',
    treeTrunk: '#4c1d95',
    treeleaf: '#b8ff6a',
    gradientFrom: '#05070c',
    gradientVia: '#0d1720',
    gradientTo: '#05070c',
  },
  moonlight: {
    name: 'moonlight',
    label: 'Lunar Pulse',
    bg: 'from-[#030507] via-[#101418] to-[#030507]',
    primary: '#d8f3ff',
    secondary: '#36f1cd',
    accent: '#ff4d8d',
    glow: 'rgba(54,241,205,0.32)',
    particle: '#36f1cd',
    treeTrunk: '#1e293b',
    treeleaf: '#8ee3ff',
    gradientFrom: '#030507',
    gradientVia: '#101418',
    gradientTo: '#030507',
  },
  blossom: {
    name: 'blossom',
    label: 'Rose Signal',
    bg: 'from-[#070508] via-[#151018] to-[#070508]',
    primary: '#ff5fd2',
    secondary: '#4dffdf',
    accent: '#ffe66d',
    glow: 'rgba(255,95,210,0.32)',
    particle: '#ff5fd2',
    treeTrunk: '#9d174d',
    treeleaf: '#4dffdf',
    gradientFrom: '#070508',
    gradientVia: '#151018',
    gradientTo: '#070508',
  },
  cosmic: {
    name: 'cosmic',
    label: 'Prism Night',
    bg: 'from-[#020406] via-[#0b1117] to-[#020406]',
    primary: '#9bffec',
    secondary: '#ff4ecd',
    accent: '#8ee3ff',
    glow: 'rgba(155,255,236,0.34)',
    particle: '#9bffec',
    treeTrunk: '#4c1d95',
    treeleaf: '#ff4ecd',
    gradientFrom: '#020406',
    gradientVia: '#0b1117',
    gradientTo: '#020406',
  },
};

interface ThemeContextType {
  theme: Theme;
  config: ThemeConfig;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'golden',
  config: THEMES.golden,
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('cosmic');

  return (
    <ThemeContext.Provider value={{ theme, config: THEMES[theme], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
