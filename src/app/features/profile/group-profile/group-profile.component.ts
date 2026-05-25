import { Component, OnDestroy, inject, signal, effect, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LayoutStateService } from '../../../core/services/layout-state.service';
import { GroupService } from '../../../core/services/group.service';
import { AuthService } from '../../../core/services/auth.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { ChatService } from '../../../core/services/chat.service';
import { GroupMetadata, GroupMember } from '../../../core/models/chat.model';
import { User } from '../../../core/models/user.model';
import { child, get, onValue, off } from '@angular/fire/database';
import { Subject, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

export interface MemberWithProfile extends GroupMember {
  uid: string;
  profile?: User;
}

@Component({
  selector: 'app-group-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './group-profile.component.html',
  styleUrl: './group-profile.component.scss'
})
export class GroupProfileComponent implements OnDestroy {
  public readonly layoutState = inject(LayoutStateService);
  private readonly groupService = inject(GroupService);
  private readonly authService = inject(AuthService);
  private readonly fbService = inject(FirebaseService);
  private readonly chatService = inject(ChatService);

  public readonly currentUserId = computed(() => this.authService.currentUser()?.uid);

  public metadata = signal<GroupMetadata | null>(null);
  public members = signal<MemberWithProfile[]>([]);
  public isAdmin = signal<boolean>(false);
  public isLoading = signal<boolean>(true);

  // Editing state
  public isEditingName = signal<boolean>(false);
  public editNameText = signal<string>('');
  public isEditingDesc = signal<boolean>(false);
  public editDescText = signal<string>('');

  // Add members feature
  public showAddMembers = signal<boolean>(false);
  public searchQuery = signal<string>('');
  public searchResults = signal<User[]>([]);
  public isSearching = signal<boolean>(false);
  public existingContacts = signal<User[]>([]);
  private userSearch$ = new Subject<string>();
  private searchSub: any = null;

  private profilesCache = new Map<string, User>();
  private activeGroupId: string | null = null;
  private membersSub: any = null;

  constructor() {
    effect(() => {
      const groupId = this.layoutState.activeContactId();
      this.cleanup();
      if (groupId && this.layoutState.activeMenuView() === 'group-profile') {
        this.activeGroupId = groupId;
        this.isLoading.set(true);
        this.listenToGroup(groupId);
      }
    });

    this.searchSub = this.userSearch$.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(async (term) => {
      if (!term.trim()) {
        this.filterAndSetContacts(this.existingContacts());
        this.isSearching.set(false);
        return;
      }

      this.isSearching.set(true);
      const lowerTerm = term.toLowerCase();

      // 1. Local contacts match
      const localMatches = this.existingContacts().filter(u =>
        (u.displayName || '').toLowerCase().includes(lowerTerm) ||
        (u.username || '').toLowerCase().includes(lowerTerm)
      );

      // 2. Global exact search
      let globalUser: User | null = null;
      try {
        globalUser = await this.authService.searchUserByUsername(term);
      } catch (e) {
        // Ignore errors
      }

      const map = new Map<string, User>();
      for (const u of localMatches) map.set(u.uid, u);
      if (globalUser) map.set(globalUser.uid, globalUser);

      this.filterAndSetContacts(Array.from(map.values()));
      this.isSearching.set(false);
    });
  }

  ngOnDestroy() {
    this.cleanup();
    if (this.searchSub) {
      this.searchSub.unsubscribe();
      this.searchSub = null;
    }
  }

  private listenToGroup(groupId: string) {
    // 1. Escuchar metadata
    const metaRef = child(this.fbService.rootRef, `groups/${groupId}/metadata`);
    onValue(metaRef, (snap) => {
      if (snap.exists()) {
        this.metadata.set(snap.val() as GroupMetadata);
      }
    });

    // 2. Escuchar miembros
    this.membersSub = this.groupService.getGroupMembers(groupId).subscribe(async (rawMembers) => {
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

      // Sort: Admins first, then alphabetically by display name
      combined.sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        const nameA = a.profile?.displayName || '';
        const nameB = b.profile?.displayName || '';
        return nameA.localeCompare(nameB);
      });

      this.members.set(combined);
      this.isLoading.set(false);
    });
  }

  private cleanup() {
    if (this.activeGroupId) {
      const metaRef = child(this.fbService.rootRef, `groups/${this.activeGroupId}/metadata`);
      off(metaRef);
      this.activeGroupId = null;
    }
    if (this.membersSub) {
      this.membersSub.unsubscribe();
      this.membersSub = null;
    }
    this.metadata.set(null);
    this.members.set([]);
    this.isAdmin.set(false);
    this.isEditingName.set(false);
    this.isEditingDesc.set(false);
    this.showAddMembers.set(false);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.isSearching.set(false);
  }

  // Member search and invitation logic
  private filterAndSetContacts(users: User[]) {
    const memberUids = new Set(this.members().map(m => m.uid));
    const filtered = users.filter(u => !memberUids.has(u.uid));
    this.searchResults.set(filtered);
  }

  public async openAddMembers() {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.showAddMembers.set(true);
    await this.loadContacts();
  }

  private async loadContacts() {
    try {
      const convs = await firstValueFrom(this.chatService.getUserConversations());
      const myUid = this.authService.currentUser()?.uid;
      const uids = new Set<string>();

      for (const c of convs) {
        if (!c.participants) continue;
        for (const uid of Object.keys(c.participants)) {
          if (uid !== myUid) uids.add(uid);
        }
      }

      const loadedUsers: User[] = [];
      for (const uid of uids) {
        const u = await this.authService.getUserById(uid);
        if (u) loadedUsers.push(u);
      }

      this.existingContacts.set(loadedUsers);
      this.filterAndSetContacts(loadedUsers);
    } catch (e) {
      console.error('Failed to load contacts', e);
    }
  }

  public onSearchInput(term: string) {
    this.searchQuery.set(term);
    this.userSearch$.next(term);
  }

  public async addMemberToGroup(user: User) {
    const groupId = this.activeGroupId;
    if (!groupId) return;

    try {
      await this.groupService.addMember(groupId, user.uid);
      this.searchResults.update(list => list.filter(u => u.uid !== user.uid));
    } catch (e) {
      console.error('Failed to add member to group', e);
    }
  }

  // Name editing
  public enableNameEdit() {
    if (!this.isAdmin()) return;
    this.editNameText.set(this.metadata()?.name || '');
    this.isEditingName.set(true);
  }

  public async saveName() {
    const groupId = this.activeGroupId;
    if (!groupId) return;
    try {
      await this.groupService.updateGroupInfo(groupId, { name: this.editNameText() });
      this.isEditingName.set(false);
    } catch (e) {
      console.error('Failed to update name', e);
    }
  }

  // Description editing
  public enableDescEdit() {
    if (!this.isAdmin()) return;
    this.editDescText.set(this.metadata()?.description || '');
    this.isEditingDesc.set(true);
  }

  public async saveDescription() {
    const groupId = this.activeGroupId;
    if (!groupId) return;
    try {
      await this.groupService.updateGroupInfo(groupId, { description: this.editDescText() });
      this.isEditingDesc.set(false);
    } catch (e) {
      console.error('Failed to update description', e);
    }
  }

  // Leave Group
  public async leaveGroup() {
    const groupId = this.activeGroupId;
    const myUid = this.authService.currentUser()?.uid;
    if (!groupId || !myUid) return;

    if (confirm('Are you sure you want to leave this group?')) {
      try {
        await this.groupService.removeMember(groupId, myUid);
        this.layoutState.clearView();
      } catch (e) {
        console.error('Failed to leave group', e);
      }
    }
  }

  // Admin Actions: Promote to Admin
  public async promoteUser(uid: string) {
    const groupId = this.activeGroupId;
    if (!groupId) return;

    if (confirm('Are you sure you want to promote this member to Admin?')) {
      try {
        await this.groupService.promoteMember(groupId, uid);
      } catch (e) {
        console.error('Failed to promote member', e);
      }
    }
  }

  // Admin Actions: Expel User
  public async expelUser(uid: string) {
    const groupId = this.activeGroupId;
    if (!groupId) return;

    if (confirm('Are you sure you want to expel this member from the group?')) {
      try {
        await this.groupService.removeMember(groupId, uid);
      } catch (e) {
        console.error('Failed to expel member', e);
      }
    }
  }

  // Clear Chat Messages Locally
  public async clearMessages() {
    const groupId = this.activeGroupId;
    if (!groupId) return;

    if (confirm('Are you sure you want to clear all messages for yourself in this group?')) {
      try {
        await this.chatService.clearChat(groupId);
      } catch (e) {
        console.error('Failed to clear messages', e);
      }
    }
  }
}
