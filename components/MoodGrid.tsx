import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';
import type { MoodMap } from '@/types';
import { last30Days, moodMeta, todayKey } from '@/utils/mood';
import { AppText } from './ui/AppText';

/** GitHub-style 30-day mood calendar: one colored cell per day. */
export function MoodGrid({ moods }: { moods: MoodMap }) {
  const days = last30Days();
  const today = todayKey();
  // Columns of 6 days (5 columns × 6 rows = 30) reading top-to-bottom, left-to-right.
  const columns: string[][] = [];
  for (let c = 0; c < 5; c++) columns.push(days.slice(c * 6, c * 6 + 6));

  return (
    <View>
      <View style={styles.grid} accessibilityLabel="Mood calendar for the last 30 days">
        {columns.map((col, ci) => (
          <View key={ci} style={styles.col}>
            {col.map((day) => {
              const level = moods[day];
              const bg = level ? moodMeta(level).color : colors.surfaceMuted;
              return (
                <View
                  key={day}
                  style={[styles.cell, { backgroundColor: bg }, day === today && styles.today]}
                  accessibilityLabel={`${day}: ${level ? moodMeta(level).label : 'no entry'}`}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <AppText variant="caption" color="muted">
          30 days ago
        </AppText>
        <AppText variant="caption" color="muted">
          Today
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  col: { gap: spacing.sm, flex: 1 },
  cell: { aspectRatio: 1, borderRadius: radii.sm, minHeight: 26 },
  today: { borderWidth: 2.5, borderColor: colors.primaryDark },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
});
