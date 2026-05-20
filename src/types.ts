export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  mood?: string;
  tags: string[];
  isFavorite?: boolean;
}

export type MinimalThemeId = 'paper' | 'cream' | 'charcoal';

export interface MinimalTheme {
  id: MinimalThemeId;
  name: string;
  background: string;
  surface: string;
  surfaceBorder: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentLight: string;
}

export interface MoodConfig {
  id: string;
  emoji: string;
  label: string;
}
