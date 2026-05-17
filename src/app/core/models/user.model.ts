export interface UserSettings {
  lastSeenVisibility: 'all' | 'contacts' | 'none';
  readReceiptsEnabled: boolean;
  avatarVisibility: 'all' | 'contacts' | 'none';
}

export type NotificationLevel = 'urgent' | 'normal' | 'silent';

export interface NotificationSettings {
  defaultLevel: NotificationLevel;
  dailySummary: boolean;
  conversations?: Record<string, NotificationLevel>;
}

export interface User {
  uid: string;
  username: string;
  email: string;
  phoneNumber?: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: number;
  lastSeen: number;
  settings: UserSettings;
  notificationSettings?: NotificationSettings;
}

export interface UserSession {
  sessionId: string;
  deviceInfo: string;
  lastActive: number;
  ipCountry: string;
}
