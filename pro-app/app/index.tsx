import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/lib/SessionContext';
import { colors } from '@/lib/theme';

export default function Index() {
  const { ready, session } = useSession();
  if (!ready)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  if (!session) return <Redirect href="/login" />;
  return <Redirect href={session.user.role === 'PHARMACIST' ? '/pharmacist' : '/doctor'} />;
}
