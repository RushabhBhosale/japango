import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getYuiUnreadCount, subscribeToYuiUnreadCount } from '@/services/database/ai-chat-repository';

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
  const [unreadYuiMessages, setUnreadYuiMessages] = useState(0);

  useEffect(() => {
    void getYuiUnreadCount().then(setUnreadYuiMessages).catch(() => setUnreadYuiMessages(0));
    return subscribeToYuiUnreadCount(setUnreadYuiMessages);
  }, []);
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
        name="chats"
        options={{
          title: 'Chats',
          tabBarAccessibilityLabel: unreadYuiMessages ? `Chats with Yui tab, ${unreadYuiMessages} unread messages` : 'Chats with Yui tab',
          tabBarBadge: unreadYuiMessages || undefined,
          tabBarBadgeStyle: { backgroundColor: theme.primary, color: theme.onPrimary },
          tabBarIcon: tabIcon('chatbubble-outline', 'chatbubble'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarAccessibilityLabel: 'Settings tab', tabBarIcon: tabIcon('settings-outline', 'settings') }}
      />
    </Tabs>
  );
}
