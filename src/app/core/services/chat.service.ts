import { Injectable, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { CryptoService } from './crypto.service';
import { AuthService } from './auth.service';
import { ref, set, update, get, child, onValue, off } from '@angular/fire/database';
import { Observable, Subject } from 'rxjs';
import { Conversation, Message, MessageStatus, MessageType } from '../models/chat.model';

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
   * Ensures a conversation node exists between two users.
   */
  public async getOrCreateConversation(targetUid: string): Promise<string> {
    const currentUid = this.authService.currentUser()?.uid;
    if (!currentUid) throw new Error("No authenticated user.");

    const convId = this.generateConversationId(currentUid, targetUid);
    const metadataRef = child(this.fbService.rootRef, `conversations/${convId}/metadata`);
    
    const snapshot = await get(metadataRef);
    if (!snapshot.exists()) {
      // Create it
      const newConv: Omit<Conversation, 'id'> = {
        participants: { [currentUid]: true, [targetUid]: true },
        lastMessage: '',
        updatedAt: Date.now()
      };
      await set(metadataRef, newConv);
    }

    return convId;
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
      quotedMessageId: quotedId
    };

    // We do a multi-path update to write the message and update the metadata simultaneously
    const updates: Record<string, any> = {};
    updates[`conversations/${convId}/messages/${msgId}`] = newMessage;
    updates[`conversations/${convId}/metadata/lastMessage`] = encryptedContent; // Keep last msg encrypted in DB too
    updates[`conversations/${convId}/metadata/updatedAt`] = Date.now();

    await update(this.fbService.rootRef, updates);
  }

  /**
   * Streams a conversation's messages and decrypts them on the fly.
   */
  public getMessages(convId: string): Observable<Message[]> {
    const subject = new Subject<Message[]>();
    const messagesRef = child(this.fbService.rootRef, `conversations/${convId}/messages`);

    onValue(messagesRef, async (snapshot) => {
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
        subject.next(decryptedMessages);
      } else {
        subject.next([]);
      }
    });

    return subject.asObservable();
  }

  /**
   * Unsubscribe from message streams (cleanup memory)
   */
  public stopListeningMessages(convId: string): void {
    const messagesRef = child(this.fbService.rootRef, `conversations/${convId}/messages`);
    off(messagesRef);
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
