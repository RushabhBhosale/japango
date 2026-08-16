import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type TabIconProps = { focused: boolean; color: ColorValue; size: number };

function tabIcon(inactiveName: IconName, activeName: IconName) {
  const TabIcon = ({ focused, color, size }: TabIconProps) => (
    <Ionicons name={focused ? activeName : inactiveName} color={color} size={size} />
  );
  TabIcon.displayName = `TabIcon(${inactiveName})`;
  return TabIcon;
}

export default function TabLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      safeAreaInsets={{ bottom: Math.max(insets.bottom, Spacing.two) + Spacing.one }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border, borderTopWidth: 1, paddingTop: Spacing.one },
        tabBarItemStyle: { paddingVertical: Spacing.one },
        tabBarHideOnKeyboard: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarAccessibilityLabel: 'Home tab', tabBarIcon: tabIcon('home-outline', 'home') }}
      />
      <Tabs.Screen
        name="flashcards"
        options={{ title: 'Vocabulary', tabBarAccessibilityLabel: 'Vocabulary flashcards tab', tabBarIcon: tabIcon('albums-outline', 'albums') }}
      />
      <Tabs.Screen
        name="exams"
        options={{ title: 'Exams', tabBarAccessibilityLabel: 'JLPT mock exams tab', tabBarIcon: tabIcon('document-text-outline', 'document-text') }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: 'Practice',
          tabBarAccessibilityLabel: 'ChatGPT Practice tab',
          tabBarIcon: tabIcon('journal-outline', 'journal'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarAccessibilityLabel: 'Settings tab', tabBarIcon: tabIcon('settings-outline', 'settings') }}
      />
    </Tabs>
  );
}
