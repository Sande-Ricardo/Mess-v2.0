import { Component, Input, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GroupService } from '../../../core/services/group.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { AuthService } from '../../../core/services/auth.service';
import { GroupMember, GroupMetadata } from '../../../core/models/chat.model';
import { get, child, onValue, off } from '@angular/fire/database';
import { User } from '../../../core/models/user.model';

interface MemberWithProfile extends GroupMember {
  uid: string;
  profile?: User;
}

@Component({
  selector: 'app-group-info',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './group-info.component.html',
  styleUrl: './group-info.component.scss'
})
export class GroupInfoComponent implements OnInit {
  @Input({ required: true }) groupId!: string;

  private groupService = inject(GroupService);
  private fbService = inject(FirebaseService);
  private authService = inject(AuthService);

  public metadata = signal<GroupMetadata | null>(null);
  public members = signal<MemberWithProfile[]>([]);
  public isAdmin = signal<boolean>(false);
  public isEditingDesc = signal<boolean>(false);
  public editDescText = signal<string>('');

  private profilesCache = new Map<string, User>();

  ngOnInit() {
    this.listenToGroupInfo();
    this.listenToMembers();
  }

  ngOnDestroy() {
    const metaRef = child(this.fbService.rootRef, `groups/${this.groupId}/metadata`);
    off(metaRef);
  }

  private listenToGroupInfo() {
    const metaRef = child(this.fbService.rootRef, `groups/${this.groupId}/metadata`);
    onValue(metaRef, (snap) => {
      if (snap.exists()) {
        this.metadata.set(snap.val() as GroupMetadata);
      }
    });
  }

  private listenToMembers() {
    this.groupService.getGroupMembers(this.groupId).subscribe(async (rawMembers) => {
      const myUid = this.authService.currentUser()?.uid;
      const combined: MemberWithProfile[] = [];

      let currentUserRole = 'member';

      for (const [uid, memberData] of Object.entries(rawMembers || {})) {
        if (uid === myUid) currentUserRole = memberData.role;

        let profile = this.profilesCache.get(uid);
        if (!profile) {
          const uSnap = await get(child(this.fbService.rootRef, `users/${uid}`));
          if (uSnap.exists()) {
            profile = uSnap.val() as User;
            this.profilesCache.set(uid, profile);
          }
        }
        combined.push({ uid, ...memberData, profile });
      }

      this.isAdmin.set(currentUserRole === 'admin');

      // Sort: Admins first, then by display name
      combined.sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        const nameA = a.profile?.displayName || '';
        const nameB = b.profile?.displayName || '';
        return nameA.localeCompare(nameB);
      });

      this.members.set(combined);
    });
  }

  public enableDescEdit() {
    if (!this.isAdmin()) return;
    this.editDescText.set(this.metadata()?.description || '');
    this.isEditingDesc.set(true);
  }

  public async saveDescription() {
    try {
      await this.groupService.updateGroupInfo(this.groupId, { description: this.editDescText() });
      this.isEditingDesc.set(false);
    } catch (e) {
      console.error('Failed to update desc', e);
    }
  }

  public async promoteUser(uid: string) {
    if (confirm('Promote to Admin?')) {
      await this.groupService.promoteMember(this.groupId, uid);
    }
  }

  public async expelUser(uid: string) {
    if (confirm('Expel this user from the group?')) {
      await this.groupService.removeMember(this.groupId, uid);
    }
  }

  public async generateInvite() {
    try {
      await this.groupService.generateInviteLink(this.groupId);
    } catch (e) {
      console.error('Failed to generate invite');
    }
  }

  public copyInviteLink() {
    const token = this.metadata()?.inviteToken;
    if (token) {
      // In a real app we'd construct a full URL, e.g. https://domain.com/join/token
      const url = `${window.location.origin}/join/${token}`;
      navigator.clipboard.writeText(url).then(() => alert('Link copied!'));
    }
  }

  public async revokeInvite() {
    if (confirm('Revoke current invite link? Only a new link will work.')) {
      try {
         // Generating a new one effectively revokes the old mapped token internally if we don't delete it
         // But deleting the old one from /inviteTokens is cleaner.
         // A simple update clears the invite token field for the group to avoid immediate regen
         // But our prompt said: "botones de copiar y revocar".
         // Let's just regenerate to replace it, or clear it.
         await this.groupService.updateGroupInfo(this.groupId, { inviteToken: '' });
      } catch (e) {
        console.error(e);
      }
    }
  }
}
