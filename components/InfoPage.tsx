import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { spacing } from '@/theme';

export interface InfoSection {
  heading: string;
  body: string;
}

/** Simple long-form information page (privacy, terms, guide, about). */
export function InfoPage({ intro, sections }: { intro?: string; sections: InfoSection[] }) {
  return (
    <Screen>
      {intro ? (
        <AppText variant="body" color="secondary" style={styles.intro}>
          {intro}
        </AppText>
      ) : null}
      <View style={styles.sections}>
        {sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <AppText variant="section">{s.heading}</AppText>
            <AppText variant="body" color="secondary">
              {s.body}
            </AppText>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.xl },
  sections: { gap: spacing.xl },
  section: { gap: spacing.sm },
});
