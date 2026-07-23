import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';
import type { MoodMap } from '@/types';
import { moodMeta, todayKey } from '@/utils/mood';
import { AppText } from './ui/AppText';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Build a weekday-aligned calendar window: six weeks ending on the Saturday of
 * the current week, starting from the Sunday six rows earlier. Days after today
 * render as blanks so the grid always forms clean 7-wide rows.
 */
function calendarWeeks(): Array<Array<{ key: string; date: Date; future: boolean } | null>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay())); // Saturday of this week
  const start = new Date(end);
  start.setDate(start.getDate() - 41); // 6 rows × 7 − 1

  const weeks: Array<Array<{ key: string; date: Date; future: boolean } | null>> = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const row: Array<{ key: string; date: Date; future: boolean } | null> = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(cursor);
      row.push({ key: todayKey(date), date, future: date > today });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

/** A playful month-style mood calendar: one small emoji cell per day. */
export function MoodGrid({ moods }: { moods: MoodMap }) {
  const today = todayKey();
  const weeks = useMemo(calendarWeeks, []);
  const logged = useMemo(
    () => weeks.flat().filter((c) => c && !c.future && moods[c.key]).length,
    [weeks, moods],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        {WEEKDAYS.map((w, i) => (
          <View key={i} style={styles.headCell}>
            <AppText variant="caption" color="muted" style={styles.headText}>
              {w}
            </AppText>
          </View>
        ))}
      </View>

      <View
        style={styles.grid}
        accessibilityLabel={`Mood calendar. ${logged} days logged this period.`}
      >
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.week}>
            {week.map((cell, di) => {
              if (!cell || cell.future) return <View key={di} style={styles.cell} />;
              const level = moods[cell.key];
              const meta = level ? moodMeta(level) : null;
              const isToday = cell.key === today;
              return (
                <View
                  key={di}
                  style={[
                    styles.cell,
                    styles.dayCell,
                    meta
                      ? { backgroundColor: meta.color + '2A', borderColor: meta.color }
                      : styles.empty,
                    isToday && styles.today,
                  ]}
                  accessibilityLabel={`${cell.key}: ${meta ? meta.label : 'no entry'}`}
                >
                  {meta ? (
                    <Text allowFontScaling={false} style={styles.emoji}>
                      {meta.emoji}
                    </Text>
                  ) : (
                    <AppText style={styles.dayNum} color="muted">
                      {cell.date.getDate()}
                    </AppText>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <AppText variant="caption" color="muted">
          {logged > 0
            ? `🔥 ${logged} day${logged === 1 ? '' : 's'} logged`
            : 'Tap a face above to log today'}
        </AppText>
        <AppText variant="caption" color="muted">
          Today is ringed
        </AppText>
      </View>
    </View>
  );
}

const CELL_GAP = 4;

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, gap: CELL_GAP },
  header: { flexDirection: 'row', gap: CELL_GAP },
  headCell: { flex: 1, alignItems: 'center' },
  headText: { fontSize: 10 },
  grid: { gap: CELL_GAP },
  week: { flexDirection: 'row', gap: CELL_GAP },
  cell: { flex: 1, aspectRatio: 1 },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  empty: { backgroundColor: colors.surfaceMuted, borderColor: 'transparent' },
  today: { borderWidth: 2, borderColor: colors.primary },
  emoji: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
    ...Platform.select({ ios: { fontFamily: 'System' }, default: {} }),
  },
  dayNum: { fontSize: 9, opacity: 0.55 },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
});
