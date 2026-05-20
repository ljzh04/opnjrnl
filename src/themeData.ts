import { MinimalTheme, MoodConfig } from './types';

export const MOOD_SCALE = [
  { id: 'terrible', label: 'Terrible' },
  { id: 'bad', label: 'Bad' },
  { id: 'okay', label: 'Okay' },
  { id: 'good', label: 'Good' },
  { id: 'great', label: 'Great' },
];
export const MINIMAL_THEMES: Record<string, MinimalTheme> = {
  paper: {
    id: 'paper',
    name: 'Nordic Paper',
    background: '#FAF9F6', // Pure beautiful warm chalk/offwhite
    surface: '#FFFFFF',
    surfaceBorder: '#EAE9E6',
    textPrimary: '#111111',
    textSecondary: '#666666',
    accent: '#222222',
    accentLight: '#F5F4F0',
  },
  cream: {
    id: 'cream',
    name: 'Bookish Cream',
    background: '#F7F3EA', // Rich warm vintage cream
    surface: '#FDFBF7',
    surfaceBorder: '#EAE3D2',
    textPrimary: '#2B231D',
    textSecondary: '#7A6E65',
    accent: '#4C4037',
    accentLight: '#FAF7F0',
  },
  charcoal: {
    id: 'charcoal',
    name: 'Pure Obsidian',
    background: '#0D0D0E', // Absolute premium screen deep black
    surface: '#151517',
    surfaceBorder: '#232325',
    textPrimary: '#EBEBEB',
    textSecondary: '#8E8E93',
    accent: '#FFFFFF',
    accentLight: '#202022',
  },
};
