import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type TabIconProps = { focused: boolean; color: ColorValue; size: number };

function tabIcon(name: IconName) {
  const TabIcon = ({ color, size }: TabIconProps) => (
    <Ionicons name={name} color={color} size={size} />
  );
  TabIcon.displayName = `TabIcon(${name})`;
  return TabIcon;
}

export default function TabLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      safeAreaInsets={{ bottom: Math.max(insets.bottom, Spacing.two) }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarHideOnKeyboard: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarAccessibilityLabel: 'Home tab', tabBarIcon: tabIcon('home-outline') }}
      />
      <Tabs.Screen
        name="flashcards"
        options={{ title: 'Flashcards', tabBarAccessibilityLabel: 'Vocabulary flashcards tab', tabBarIcon: tabIcon('albums-outline') }}
      />
      <Tabs.Screen
        name="exams"
        options={{ title: 'Exams', tabBarAccessibilityLabel: 'JLPT mock exams tab', tabBarIcon: tabIcon('document-text-outline') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarAccessibilityLabel: 'Settings tab', tabBarIcon: tabIcon('settings-outline') }}
      />
    </Tabs>
  );
}
