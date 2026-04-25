import { Injectable, inject } from '@angular/core';
import { User as FirebaseUser, authState } from '@angular/fire/auth';
import { child, get, onValue, update } from '@angular/fire/database';
import { Observable, Subject } from 'rxjs';
import { GroupMember, GroupMetadata } from '../models/chat.model';
import { AuthService } from './auth.service';
import { CryptoService } from './crypto.service';
import { FirebaseService } from './firebase.service';

@Injectable({
  providedIn: 'root'
})
export class GroupService {
  private readonly fbService = inject(FirebaseService);
  private readonly authService = inject(AuthService);
  private readonly cryptoService = inject(CryptoService);

  // MVP Mock Shared Mnemonic for Live Chat Demo between multiple devices
  private readonly SHARED_MVP_MNEMONIC = "apple banana cherry date elderberry fig grape hazelnut ice cream jelly kiwi lemon";
  private sharedCryptoKey: CryptoKey | null = null;

  private async getCryptoKey(): Promise<CryptoKey> {
    if (!this.sharedCryptoKey) {
      this.sharedCryptoKey = await this.cryptoService.deriveKeyFromMnemonic(this.SHARED_MVP_MNEMONIC);
    }
    return this.sharedCryptoKey!;
  }

  private generateId(): string {
    return 'grp_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  private generateUuid(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return 'token_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    }
  }

  private async requireAdmin(groupId: string, uid: string): Promise<void> {
    const roleRef = child(this.fbService.rootRef, `groups/${groupId}/members/${uid}/role`);
    const snap = await get(roleRef);
    if (snap.val() !== 'admin') {
      throw new Error(`User ${uid} lacks admin privileges for group ${groupId}.`);
    }
  }

  public async createGroup(name: string, avatarUrl?: string): Promise<string> {
    const currentUid = this.authService.currentUser()?.uid;
    if (!currentUid) throw new Error("No authenticated user.");

    const groupId = this.generateId();
    const metadata: GroupMetadata = {
      name,
      avatarUrl,
      createdAt: Date.now(),
      createdBy: currentUid,
      memberCount: 1
    };

    const member: GroupMember = {
      role: 'admin',
      joinedAt: Date.now()
    };

    // Multi-path update
    const updates: Record<string, any> = {};
    updates[`groups/${groupId}/metadata`] = metadata;
    updates[`groups/${groupId}/members/${currentUid}`] = member;
    updates[`users/${currentUid}/groups/${groupId}`] = true;

    await update(this.fbService.rootRef, updates);
    return groupId;
  }

  public async addMember(groupId: string, uid: string): Promise<void> {
    const currentUid = this.authService.currentUser()?.uid;
    if (!currentUid) throw new Error("No authenticated user.");
    await this.requireAdmin(groupId, currentUid);

    const member: GroupMember = {
      role: 'member',
      joinedAt: Date.now()
    };

    const metadataRef = child(this.fbService.rootRef, `groups/${groupId}/metadata/memberCount`);
    const countSnap = await get(metadataRef);
    const count = (countSnap.val() || 0) + 1;

    const updates: Record<string, any> = {};
    updates[`groups/${groupId}/members/${uid}`] = member;
    updates[`groups/${groupId}/metadata/memberCount`] = count;
    updates[`users/${uid}/groups/${groupId}`] = true;

    await update(this.fbService.rootRef, updates);
  }

  public async removeMember(groupId: string, uid: string): Promise<void> {
    const currentUid = this.authService.currentUser()?.uid;
    if (!currentUid) throw new Error("No authenticated user.");

    // Check permissions: Either user leaving themselves, or admin removing someone.
    if (currentUid !== uid) {
      await this.requireAdmin(groupId, currentUid);
    }

    const metadataRef = child(this.fbService.rootRef, `groups/${groupId}/metadata/memberCount`);
    const countSnap = await get(metadataRef);
    const count = Math.max(0, (countSnap.val() || 1) - 1);

    const updates: Record<string, any> = {};
    updates[`groups/${groupId}/members/${uid}`] = null;
    updates[`groups/${groupId}/metadata/memberCount`] = count;
    updates[`users/${uid}/groups/${groupId}`] = null;

    await update(this.fbService.rootRef, updates);
  }

  public async promoteMember(groupId: string, uid: string): Promise<void> {
    const currentUid = this.authService.currentUser()?.uid;
    if (!currentUid) throw new Error("No authenticated user.");
    await this.requireAdmin(groupId, currentUid);

    const updates: Record<string, any> = {};
    updates[`groups/${groupId}/members/${uid}/role`] = 'admin';
    await update(this.fbService.rootRef, updates);
  }

  public async generateInviteLink(groupId: string): Promise<string> {
    const currentUid = this.authService.currentUser()?.uid;
    if (!currentUid) throw new Error("No authenticated user.");
    await this.requireAdmin(groupId, currentUid);

    const token = this.generateUuid();

    const updates: Record<string, any> = {};
    updates[`inviteTokens/${token}`] = groupId;
    updates[`groups/${groupId}/metadata/inviteToken`] = token;

    await update(this.fbService.rootRef, updates);
    return token;
  }

  public async joinViaToken(token: string): Promise<string> {
    const currentUid = this.authService.currentUser()?.uid;
    if (!currentUid) throw new Error("No authenticated user.");

    const tokenRef = child(this.fbService.rootRef, `inviteTokens/${token}`);
    const tokenSnap = await get(tokenRef);
    if (!tokenSnap.exists()) throw new Error("Invalid or expired invite token.");

    const groupId = tokenSnap.val();

    const member: GroupMember = {
      role: 'member',
      joinedAt: Date.now()
    };

    const metadataRef = child(this.fbService.rootRef, `groups/${groupId}/metadata`);
    const metaSnap = await get(metadataRef);
    const count = (metaSnap.val()?.memberCount || 0) + 1;
    if (count > 256) throw new Error("Group size limit exceeded.");

    const updates: Record<string, any> = {};
    updates[`groups/${groupId}/members/${currentUid}`] = member;
    updates[`groups/${groupId}/metadata/memberCount`] = count;
    updates[`users/${currentUid}/groups/${groupId}`] = true;

    await update(this.fbService.rootRef, updates);
    return groupId;
  }

  public async updateGroupInfo(groupId: string, data: Partial<GroupMetadata>): Promise<void> {
    const currentUid = this.authService.currentUser()?.uid;
    if (!currentUid) throw new Error("No authenticated user.");
    await this.requireAdmin(groupId, currentUid);

    const updates: Record<string, any> = {};
    for (const key in data) {
      if (key !== 'memberCount' && key !== 'createdAt' && key !== 'createdBy') {
        updates[`groups/${groupId}/metadata/${key}`] = (data as any)[key];
      }
    }

    if (Object.keys(updates).length > 0) {
      await update(this.fbService.rootRef, updates);
    }
  }

  public getGroupMembers(groupId: string): Observable<Record<string, GroupMember>> {
    const subject = new Subject<Record<string, GroupMember>>();
    const membersRef = child(this.fbService.rootRef, `groups/${groupId}/members`);

    onValue(membersRef, (snapshot) => {
      subject.next(snapshot.val() || {});
    });

    return subject.asObservable();
  }

  /**
   * Retrieves all groups the current user is a part of.
   */
  public getUserGroups(): Observable<(GroupMetadata & { id: string })[]> {
    return new Observable<(GroupMetadata & { id: string })[]>(subscriber => {
      let rtdbUnsubscribe: (() => void) | null = null;

      const authUnsub = authState(this.fbService.auth).subscribe(async (fbUser: FirebaseUser | null) => {
        if (rtdbUnsubscribe) {
          rtdbUnsubscribe();
          rtdbUnsubscribe = null;
        }

        if (!fbUser) {
          subscriber.next([]);
          return;
        }

        const userGroupsRef = child(this.fbService.rootRef, `users/${fbUser.uid}/groups`);

        rtdbUnsubscribe = onValue(userGroupsRef, async (indexSnap) => {
          if (!indexSnap.exists()) {
            subscriber.next([]);
            return;
          }

          const groupIds = Object.keys(indexSnap.val());
          const groups: (GroupMetadata & { id: string })[] = [];

          for (const groupId of groupIds) {
            const groupPromise = get(child(this.fbService.rootRef, `groups/${groupId}/metadata`)).catch(() => ({ exists: () => false, val: () => null } as any));
            const chatPromise = get(child(this.fbService.rootRef, `conversations/${groupId}/metadata`)).catch(() => ({ exists: () => false, val: () => null } as any));

            const [metaSnap, chatSnap] = await Promise.all([groupPromise, chatPromise]);

            if (metaSnap.exists()) {
              const groupData = metaSnap.val();
              if (chatSnap.exists()) {
                const chatData = chatSnap.val();


                // Decrypt the last message if it exists
                let plainLastMsg = chatData.lastMessage;
                if (plainLastMsg && plainLastMsg.length > 0) {
                  try {
                    const key = await this.getCryptoKey();
                    plainLastMsg = await this.cryptoService.decryptData(plainLastMsg, key);
                    if (plainLastMsg.includes('res.cloudinary.com')) {
                      if (plainLastMsg.includes('/video/')) plainLastMsg = 'Voice message';
                      else plainLastMsg = 'Multimedia';
                    }
                  } catch (err) {
                    console.error("Decryption failed for group msg", groupId, err);
                  }
                }

                groupData.lastMessage = plainLastMsg;
                groupData.updatedAt = chatData.updatedAt;
              }
              groups.push({ ...groupData, id: groupId });
            }
          }

          // Ordinarily sorted by updatedAt. We fallback to createdAt.
          groups.sort((a, b) => {
            const aTime = (a as any).updatedAt || a.createdAt;
            const bTime = (b as any).updatedAt || b.createdAt;
            return bTime - aTime;
          });
          subscriber.next(groups);
        });
      });

      return () => {
        authUnsub.unsubscribe();
        if (rtdbUnsubscribe) rtdbUnsubscribe();
      };
    });
  }
}
