import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';
import type { MoodLevel } from '@/types';
import { MOODS, moodMeta } from '@/utils/mood';
import { AppText } from './ui/AppText';

/**
 * Playful daily mood picker. One tap records today's mood and locks it in; a
 * "Change" button re-opens the selector, so a stray tap can't silently
 * overwrite what they meant to log.
 */
export function MoodPicker({
  value,
  onPick,
}: {
  value?: MoodLevel;
  onPick: (level: MoodLevel) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  // Locked-in view: today's mood is set and we're not re-selecting.
  if (value != null && !editing) {
    const meta = moodMeta(value);
    return (
      <View style={[styles.lockedCard, { backgroundColor: meta.color + '1A', borderColor: meta.color + '55' }]}>
        <View style={[styles.lockedEmojiWrap, { backgroundColor: meta.color + '2E' }]}>
          <AppText style={styles.lockedEmoji}>{meta.emoji}</AppText>
        </View>
        <View style={styles.flex}>
          <AppText variant="label">You&apos;re feeling {meta.label.toLowerCase()} today</AppText>
          <AppText variant="caption" color="secondary">
            Logged for {new Date().toLocaleDateString([], { month: 'long', day: 'numeric' })}
          </AppText>
        </View>
        <Pressable
          onPress={() => setEditing(true)}
          style={styles.changeBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Change today's mood"
        >
          <Ionicons name="create-outline" size={16} color={colors.primary} />
          <AppText variant="label" color="accent">
            Change
          </AppText>
        </Pressable>
      </View>
    );
  }

  // Selector: fun, colorful, tap-to-lock.
  return (
    <View>
      <View style={styles.row}>
        {MOODS.map((m) => {
          const selected = value === m.level;
          return (
            <Pressable
              key={m.level}
              onPress={() => {
                void onPick(m.level);
                setEditing(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Mood: ${m.label}`}
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <View
                style={[
                  styles.emojiTile,
                  { backgroundColor: m.color + '1F', borderColor: m.color + '4D' },
                  selected && { backgroundColor: m.color + '38', borderColor: m.color },
                ]}
              >
                <AppText style={styles.emoji}>{m.emoji}</AppText>
              </View>
              <AppText variant="caption" color={selected ? 'primary' : 'muted'} center numberOfLines={1}>
                {m.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {value != null ? (
        <Pressable
          onPress={() => setEditing(false)}
          style={styles.cancelRow}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Keep today's current mood"
        >
          <AppText variant="caption" color="secondary">
            Keep {moodMeta(value).label.toLowerCase()}
          </AppText>
        </Pressable>
      ) : (
        <AppText variant="caption" color="muted" center style={styles.hint}>
          Tap once to log how you feel today
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  item: { flex: 1, alignItems: 'center', gap: spacing.xs },
  itemPressed: { transform: [{ scale: 0.92 }] },
  emojiTile: {
    width: '100%',
    aspectRatio: 1,
    maxWidth: 60,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 28 },
  hint: { marginTop: spacing.md },
  cancelRow: { alignSelf: 'center', marginTop: spacing.md },
  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  lockedEmojiWrap: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedEmoji: { fontSize: 28 },
  flex: { flex: 1 },
  changeBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
