export interface UserSettings {
  lastSeenVisibility: 'all' | 'contacts' | 'none';
  readReceiptsEnabled: boolean;
  avatarVisibility: 'all' | 'contacts' | 'none';
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
}

export interface UserSession {
  sessionId: string;
  deviceInfo: string;
  lastActive: number;
  ipCountry: string;
}
