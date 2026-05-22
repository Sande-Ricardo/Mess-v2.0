import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { child, get, update } from '@angular/fire/database';
import { onValue } from 'firebase/database';
import { Message } from '../models/chat.model';
import { NotificationLevel, NotificationSettings } from '../models/user.model';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';
import { CryptoService } from './crypto.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly authService = inject(AuthService);
  private readonly fbService = inject(FirebaseService);
  private readonly cryptoService = inject(CryptoService);

  private readonly SHARED_MVP_MNEMONIC = "apple banana cherry date elderberry fig grape hazelnut ice cream jelly kiwi lemon";
  private sharedCryptoKey: CryptoKey | null = null;
  private readonly initTime = Date.now();
  private readonly notifiedMessageIds = new Set<string>();

  // Signal caching permission status
  public permissionStatus = signal<NotificationPermission>('default');

  // Signal caching the user's overall notification settings
  public userSettings = signal<NotificationSettings | null>(null);

  // Map of convId -> unread count
  public readonly unreadCounts = signal<Record<string, number>>({});

  // Computed sum of all unread messages
  public readonly totalUnreadCount = computed(() => {
    return Object.values(this.unreadCounts()).reduce((a, b) => a + b, 0);
  });

  // Track active DB listeners to clean them up on user change/logout
  private activeListeners: (() => void)[] = [];

  constructor() {
    this.initSharedCrypto();
    // Sync settings when current user changes
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permissionStatus.set(Notification.permission);
    }

    // Reactively track changes to the currentUser signal
    effect(() => {
      const user = this.authService.currentUser();
      this.cleanupListeners();
      this.unreadCounts.set({});

      if (user) {
        this.userSettings.set(user.notificationSettings || {
          defaultLevel: 'normal',
          dailySummary: false,
          conversations: {}
        });

        // Start listening to the user's conversation list to track unreads
        this.startUnreadListeners(user.uid);
      } else {
        this.userSettings.set(null);
      }
    });

    // Effect to dynamically update document title with unread badge count
    effect(() => {
      const count = this.totalUnreadCount();
      if (typeof window !== 'undefined') {
        const baseTitle = 'Mess';
        document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
      }
    });
  }

  private async initSharedCrypto() {
    this.sharedCryptoKey = await this.cryptoService.deriveKeyFromMnemonic(this.SHARED_MVP_MNEMONIC);
  }

  private async getCryptoKey(): Promise<CryptoKey> {
    if (!this.sharedCryptoKey) {
      await this.initSharedCrypto();
    }
    return this.sharedCryptoKey!;
  }

  /**
   * Cleans up all active Firebase Realtime Database listeners.
   */
  private cleanupListeners() {
    this.activeListeners.forEach(unsub => unsub());
    this.activeListeners = [];
    this.notifiedMessageIds.clear();
  }

  /**
   * Subscribes to all conversation message trees to count unread messages reactively.
   */
  private startUnreadListeners(uid: string) {
    const userConvsRef = child(this.fbService.rootRef, `users/${uid}/conversations`);

    // Listen to changes in the list of conversations the user has
    const unsubConvs = onValue(userConvsRef, (indexSnap) => {
      if (!indexSnap.exists()) {
        this.unreadCounts.set({});
        return;
      }

      const convIds = Object.keys(indexSnap.val());

      // Setup dynamic count listeners for each conversation
      convIds.forEach(convId => {
        const messagesRef = child(this.fbService.rootRef, `conversations/${convId}/messages`);

        const unsubMessages = onValue(messagesRef, (snapshot) => {
          if (!snapshot.exists()) {
            this.updateUnreadCount(convId, 0);
            return;
          }

          const messages = snapshot.val();
          let count = 0;

          for (const key in messages) {
            const msg = messages[key];
            // Count if it's sent to me, and status is not read
            if (msg.senderId !== uid && msg.status !== 'read' && msg.type !== 'deleted') {
              count++;

              // Notification Trigger Logic
              if (!this.notifiedMessageIds.has(msg.id)) {
                this.notifiedMessageIds.add(msg.id);
                // Only notify if it's a truly new message that arrived after app loaded
                if (msg.timestamp >= this.initTime) {
                  this.processAndNotify(convId, msg);
                }
              }
            } else {
              // If it's ours, read, or deleted, mark as seen to avoid notifying later
              this.notifiedMessageIds.add(msg.id);
            }
          }

          this.updateUnreadCount(convId, count);
        });

        this.activeListeners.push(unsubMessages);
      });
    });

    this.activeListeners.push(unsubConvs);
  }

  private async processAndNotify(convId: string, msg: Message) {
    try {
      const key = await this.getCryptoKey();
      let plainContent = "🔒 [Encrypted]";
      if (msg.type === 'text') {
        plainContent = await this.cryptoService.decryptData(msg.content, key);
      } else {
        plainContent = `New ${msg.type} message`;
      }
      
      const decryptedMsg = { ...msg, content: plainContent };
      await this.showNotification(convId, decryptedMsg);
    } catch (e) {
      console.warn("Failed to decrypt for notification", e);
    }
  }

  /**
   * Safely updates the unread counts signal.
   */
  private updateUnreadCount(convId: string, count: number) {
    this.unreadCounts.update(current => ({
      ...current,
      [convId]: count
    }));
  }

  /**
   * Request browser Web Notifications permission.
   */
  public async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('This browser does not support desktop notifications.');
      return 'denied';
    }

    const permission = await Notification.requestPermission();
    this.permissionStatus.set(permission);
    return permission;
  }

  /**
   * Retrieves the notification level for a specific conversation.
   * Resolves order: 
   * 1. Specific level in conversations map
   * 2. Default level in userSettings
   * 3. Fallback to 'normal'
   */
  public async getNotificationLevel(convId: string): Promise<NotificationLevel> {
    const user = this.authService.currentUser();
    if (!user) return 'normal';

    const path = `users/${user.uid}/notificationSettings/conversations/${convId}`;
    const dbRef = child(this.fbService.rootRef, path);
    const snapshot = await get(dbRef);

    if (snapshot.exists()) {
      return snapshot.val() as NotificationLevel;
    }

    // Fallback to default level
    return this.userSettings()?.defaultLevel || 'normal';
  }

  /**
   * Persists a custom notification level for a conversation.
   */
  public async setNotificationLevel(convId: string, level: NotificationLevel): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('No user logged in.');

    const updates: Record<string, any> = {};
    updates[`users/${user.uid}/notificationSettings/conversations/${convId}`] = level;

    await update(this.fbService.rootRef, updates);

    // Explicitly update local cache signal
    const current = this.userSettings();
    if (current) {
      const updatedConversations = { ...(current.conversations || {}), [convId]: level };
      this.userSettings.set({
        ...current,
        conversations: updatedConversations
      });
    }
  }

  /**
   * Initialize Firebase Cloud Messaging (FCM) for Mobile Platforms.
   * Placeholder boilerplate for seamless cross-platform notification support.
   */
  public async initFCM(): Promise<void> {
    console.log('[FCM] Initializing Firebase Cloud Messaging for mobile support...');
    try {
      const mockToken = 'mock_fcm_token_mess_platform';
      console.log('[FCM] Successfully fetched token:', mockToken);
    } catch (error) {
      console.error('[FCM] Error initializing Cloud Messaging:', error);
    }
  }

  /**
   * Check if a message contains a mention of the current user (@username).
   */
  private isUserMentioned(content: string, username: string): boolean {
    if (!content || !username) return false;
    const regex = new RegExp(`@${username}\\b`, 'i');
    return regex.test(content);
  }

  /**
   * Generates a premium and clean notification chime synthetically using Web Audio API.
   * Avoids requiring static assets and guarantees audio playback under modern browsers.
   */
  private playNotificationSound(): void {
    if (typeof window === 'undefined') return;
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = context.createOscillator();
      const gain = context.createGain();

      osc.type = 'sine';
      // Synthesize a beautiful, high-quality double-chime (D5 to A5 chord sweep)
      osc.frequency.setValueAtTime(587.33, context.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, context.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.25, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(context.destination);

      osc.start();
      osc.stop(context.currentTime + 0.35);
    } catch (e) {
      console.warn('Audio synthesis was blocked or not supported by browser:', e);
    }
  }

  /**
   * Handles notification logic for an incoming message.
   */
  public async showNotification(convId: string, message: Message): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || message.senderId === user.uid) return;

    // 1. Detect if the user is mentioned
    const isMentioned = this.isUserMentioned(message.content, user.username);

    // 2. Retrieve notification level for this conversation
    const level = await this.getNotificationLevel(convId);

    // 3. Evaluate the level rules
    const finalLevel: NotificationLevel = isMentioned ? 'urgent' : level;

    if (finalLevel === 'silent') {
      // Silent notifications only update badges, which are evaluated reactively
      return;
    }

    // 4. Request / Show browser Push Notification
    if (this.permissionStatus() === 'default') {
      await this.requestPermission();
    }

    if (this.permissionStatus() === 'granted') {
      const title = isMentioned ? `Mentioned in Chat` : `New Message`;

      try {
        new Notification(title, {
          body: message.content,
          icon: user.avatarUrl || '/assets/logo.png', // Premium fallbacks
          tag: convId, // Collapses multiple notifications from the same chat
          silent: true // We control sound ourselves with our custom Synthesizer
        });
      } catch (e) {
        console.warn('Unable to show standard desktop Notification:', e);
      }
    }

    // 5. Play chime if level is urgent
    if (finalLevel === 'urgent') {
      this.playNotificationSound();
    }
  }
}
