import { Injectable, inject } from '@angular/core';
import { User as FirebaseUser, authState } from '@angular/fire/auth';
import { child, get, onValue, set, update } from '@angular/fire/database';
import { Observable } from 'rxjs';
import { Conversation, Message, MessageStatus, MessageType } from '../models/chat.model';
import { AuthService } from './auth.service';
import { CryptoService } from './crypto.service';
import { FirebaseService } from './firebase.service';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly fbService = inject(FirebaseService);
  private readonly cryptoService = inject(CryptoService);
  private readonly authService = inject(AuthService);

  // MVP Mock Shared Mnemonic for Live Chat Demo between multiple devices
  private readonly SHARED_MVP_MNEMONIC = "apple banana cherry date elderberry fig grape hazelnut ice cream jelly kiwi lemon";
  private sharedCryptoKey: CryptoKey | null = null;

  constructor() {
    this.initSharedCrypto();
  }

  private async initSharedCrypto() {
    this.sharedCryptoKey = await this.cryptoService.deriveKeyFromMnemonic(this.SHARED_MVP_MNEMONIC);
  }

  /**
   * Helper to ensure safe key access before encrypting/decrypting
   */
  private async getCryptoKey(): Promise<CryptoKey> {
    if (!this.sharedCryptoKey) {
      await this.initSharedCrypto();
    }
    return this.sharedCryptoKey!;
  }

  /**
   * Generates a predictable 1-on-1 Conversation ID.
   */
  public generateConversationId(uid1: string, uid2: string): string {
    return [uid1, uid2].sort().join('_');
  }

  /**
   * Ensures a conversation node exists between two users and indexes it.
   */
  public async getOrCreateConversation(targetUid: string): Promise<string> {
    const currentUid = this.authService.currentUser()?.uid;
    if (!currentUid) throw new Error("No authenticated user.");

    const convId = this.generateConversationId(currentUid, targetUid);
    const metadataRef = child(this.fbService.rootRef, `conversations/${convId}/metadata`);

    const snapshot = await get(metadataRef);
    if (!snapshot.exists()) {
      // Create chat metadata
      const newConv: Omit<Conversation, 'id'> = {
        participants: { [currentUid]: true, [targetUid]: true },
        lastMessage: '',
        updatedAt: Date.now()
      };

      const updates: Record<string, any> = {};
      updates[`conversations/${convId}/metadata`] = newConv;
      // Write Index to both users
      updates[`users/${currentUid}/conversations/${convId}`] = true;
      updates[`users/${targetUid}/conversations/${convId}`] = true;

      await update(this.fbService.rootRef, updates);
    }

    return convId;
  }

  /**
   * Get all active conversations for the current user.
   * Reactive to auth state — starts the RTDB listener only after auth resolves.
   */
  public getUserConversations(): Observable<Conversation[]> {
    return new Observable<Conversation[]>(subscriber => {
      let rtdbUnsubscribe: (() => void) | null = null;

      // Wait for Firebase auth to resolve before setting up the RTDB listener
      const authUnsub = authState(this.fbService.auth).subscribe(async (fbUser: FirebaseUser | null) => {
        // Tear down previous RTDB listener if user changed
        if (rtdbUnsubscribe) {
          rtdbUnsubscribe();
          rtdbUnsubscribe = null;
        }

        if (!fbUser) {
          subscriber.next([]);
          return;
        }

        const currentUid = fbUser.uid;
        const userConvsRef = child(this.fbService.rootRef, `users/${currentUid}/conversations`);

        // onValue returns the unsubscribe function
        rtdbUnsubscribe = onValue(userConvsRef, async (indexSnap) => {
          if (!indexSnap.exists()) {
            subscriber.next([]);
            return;
          }

          const convIds = Object.keys(indexSnap.val());
          const convs: Conversation[] = [];
          const key = await this.getCryptoKey();

          for (const convId of convIds) {
            const metaSnap = await get(child(this.fbService.rootRef, `conversations/${convId}/metadata`));
            if (metaSnap.exists()) {
              const data = metaSnap.val() as Omit<Conversation, 'id'>;

              let plainLastMsg = data.lastMessage;
              if (plainLastMsg && plainLastMsg.length > 0) {
                try {
                  plainLastMsg = await this.cryptoService.decryptData(plainLastMsg, key);
                  if (plainLastMsg.includes('res.cloudinary.com')) {
                    if (plainLastMsg.includes('/video/')) plainLastMsg = 'Voice message';
                    else plainLastMsg = 'Multimedia';
                  }
                } catch {
                  // Leave as-is if decryption fails
                }
              }

              convs.push({ ...data, id: convId, lastMessage: plainLastMsg });
            }
          }

          convs.sort((a, b) => b.updatedAt - a.updatedAt);
          subscriber.next(convs);
        });
      });

      // Cleanup both listeners on unsubscribe
      return () => {
        authUnsub.unsubscribe();
        if (rtdbUnsubscribe) rtdbUnsubscribe();
      };
    });
  }

  /**
   * Sends an encrypted message.
   */
  public async sendMessage(convId: string, plainText: string, type: MessageType = 'text', quotedId?: string): Promise<void> {
    const currentUid = this.authService.currentUser()?.uid;
    if (!currentUid) throw new Error("No authenticated user.");

    const key = await this.getCryptoKey();
    const encryptedContent = await this.cryptoService.encryptData(plainText, key);

    const messagesRef = child(this.fbService.rootRef, `conversations/${convId}/messages`);
    // Mock push ID (In real app, use native push() ref)
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const msgRef = child(messagesRef, msgId);

    const newMessage: Message = {
      id: msgId,
      senderId: currentUid,
      content: encryptedContent,
      type,
      status: 'sent',
      timestamp: Date.now(),
      ...(quotedId ? { quotedMessageId: quotedId } : {})
    };

    // We do a multi-path update to write the message and update the metadata simultaneously
    const updates: Record<string, any> = {};
    updates[`conversations/${convId}/messages/${msgId}`] = newMessage;

    let previewText = plainText;
    if (type === 'voice') {
      previewText = 'Voice message';
    } else if (type === 'image') {
      previewText = 'Image';
    } else if (type === 'file') {
      previewText = 'File';
    }

    const encryptedPreview = await this.cryptoService.encryptData(previewText, key);

    updates[`conversations/${convId}/metadata/lastMessage`] = encryptedPreview; // Keep last msg encrypted in DB too
    updates[`conversations/${convId}/metadata/updatedAt`] = Date.now();

    await update(this.fbService.rootRef, updates);
  }

  /**
   * Streams a conversation's messages and decrypts them on the fly.
   */
  public getMessages(convId: string): Observable<Message[]> {
    return new Observable<Message[]>(subscriber => {
      const messagesRef = child(this.fbService.rootRef, `conversations/${convId}/messages`);

      const rtdbUnsubscribe = onValue(messagesRef, async (snapshot) => {
        if (snapshot.exists()) {
          const rawMessages = snapshot.val() as Record<string, Message>;
          const key = await this.getCryptoKey();

          // Decrypt all contents
          const decryptedMessages: Message[] = [];
          for (const msgId in rawMessages) {
            const rawMsg = rawMessages[msgId];
            let plainContent = "🔒 [Decoding error]";

            if (rawMsg.type === 'deleted') {
              plainContent = "🚫 This message was deleted";
            } else {
              try {
                plainContent = await this.cryptoService.decryptData(rawMsg.content, key);
              } catch (err) {
                console.error("Decryption failed for msg", msgId, err);
              }
            }

            decryptedMessages.push({
              ...rawMsg,
              id: msgId,
              content: plainContent
            });
          }

          // Sort by timestamp asc
          decryptedMessages.sort((a, b) => a.timestamp - b.timestamp);
          subscriber.next(decryptedMessages);
        } else {
          subscriber.next([]);
        }
      });

      return () => rtdbUnsubscribe();
    });
  }

  /**
   * Unsubscribe from message streams (cleanup memory)
   */
  public stopListeningMessages(convId: string): void {
    // Deprecated: Streams are now self-managing via Observable cleanup natively
  }

  /**
   * Edits a message using multi-path update.
   */
  public async editMessage(convId: string, msgId: string, newPlainText: string): Promise<void> {
    const key = await this.getCryptoKey();
    const newEncryptedContent = await this.cryptoService.encryptData(newPlainText, key);

    const updates: Record<string, any> = {};
    updates[`conversations/${convId}/messages/${msgId}/content`] = newEncryptedContent;
    // We could optionally flag edited: true here later

    await update(this.fbService.rootRef, updates);
  }

  /**
   * "Deletes" a message for everyone by marking it specifically in RTDB.
   */
  public async deleteMessageForAll(convId: string, msgId: string): Promise<void> {
    const updates: Record<string, any> = {};
    updates[`conversations/${convId}/messages/${msgId}/type`] = 'deleted';
    updates[`conversations/${convId}/messages/${msgId}/content`] = ''; // Erase ciphertext payload

    await update(this.fbService.rootRef, updates);
  }

  /**
   * Updates read receipts / delivery status.
   */
  public async updateMessageStatus(convId: string, msgId: string, status: MessageStatus): Promise<void> {
    const statusRef = child(this.fbService.rootRef, `conversations/${convId}/messages/${msgId}/status`);
    await set(statusRef, status);
  }
}
