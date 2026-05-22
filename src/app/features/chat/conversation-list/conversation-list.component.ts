import { CommonModule, DatePipe } from '@angular/common';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subject, combineLatest, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { Conversation } from '../../../core/models/chat.model';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService } from '../../../core/services/chat.service';
import { GroupService } from '../../../core/services/group.service';
import { CreateGroupComponent } from '../create-group/create-group.component';
import { AppLogoComponent } from '../../../shared/components/logo/logo.component';
import { LayoutStateService } from '../../../core/services/layout-state.service';

export interface ContactFeedItem {
  id: string;
  isGroup: boolean;
  name: string;
  avatarChar: string;
  avatarUrl?: string;
  lastMessage: string;
  updatedAt: number;
}

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DatePipe, CreateGroupComponent, AppLogoComponent],
  templateUrl: './conversation-list.component.html',
  styleUrl: './conversation-list.component.scss'
})
export class ConversationListComponent {
  private readonly chatService = inject(ChatService);
  private readonly groupService = inject(GroupService);
  public readonly authService = inject(AuthService);
  public readonly layoutState = inject(LayoutStateService);
  private readonly router = inject(Router);

  public showCreateGroupModal = signal<boolean>(false);

  // Conversation list state
  public readonly searchQuery = signal('');

  // Contact profile cache: uid → User
  public readonly contactProfiles = signal<Map<string, User>>(new Map());

  public readonly feedItems = toSignal(
    combineLatest([
      this.chatService.getUserConversations(),
      this.groupService.getUserGroups(),
      toObservable(this.contactProfiles)
    ]).pipe(
      map(([chats, groups, profilesMap]) => {
        const myUid = this.authService.currentUser()?.uid;
        const items: ContactFeedItem[] = [];

        // 1-to-1 Chats
        for (const c of chats) {
          const otherUid = Object.keys(c.participants).find(id => id !== myUid);
          let name = 'Unknown';
          let char = '?';
          let avatarUrl: string | undefined;
          if (otherUid) {
            const profile = this.contactProfiles().get(otherUid);
            if (profile) {
              name = profile.displayName || profile.username;
              char = name.charAt(0).toUpperCase();
              avatarUrl = profile.avatarUrl;
            } else {
               // Initiate fetching
               this.fetchProfile(otherUid);
            }
          }
          items.push({
            id: c.id,
            isGroup: false,
            name,
            avatarChar: char,
            avatarUrl: avatarUrl,
            lastMessage: c.lastMessage || '',
            updatedAt: c.updatedAt
          });
        }

        // Groups
        for (const g of groups) {
          items.push({
            id: g.id,
            isGroup: true,
            name: g.name,
            avatarChar: g.name ? g.name.charAt(0).toUpperCase() : 'G',
            avatarUrl: g.avatarUrl,
            lastMessage: (g as any).lastMessage || '',
            updatedAt: (g as any).updatedAt || g.createdAt
          });
        }

        // Sort globally
        items.sort((a, b) => b.updatedAt - a.updatedAt);
        return items;
      })
    ),
    { initialValue: [] as ContactFeedItem[] }
  );

  // User search state
  public readonly userSearchQuery = signal('');
  public readonly foundUserResult = signal<User | null>(null);
  public readonly searchNotFound = signal(false);
  public readonly isSearching = signal(false);
  private readonly userSearch$ = new Subject<string>();

  // Computed filter logic
  public readonly filteredConversations = computed(() => {
    const term = this.searchQuery().toLowerCase();
    const list = this.feedItems();

    if (!term) return list;

    return list.filter(c => {
      const matchName = c.name.toLowerCase().includes(term);
      const matchMsg = c.lastMessage.toLowerCase().includes(term);
      return matchName || matchMsg;
    });
  });

  constructor() {
    this.userSearch$.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(async (term) => {
      if (!term.trim()) {
        this.foundUserResult.set(null);
        this.searchNotFound.set(false);
        this.isSearching.set(false);
        return;
      }
      this.isSearching.set(true);
      this.searchNotFound.set(false);
      const result = await this.authService.searchUserByUsername(term);
      this.foundUserResult.set(result);
      this.searchNotFound.set(!result);
      this.isSearching.set(false);
    });
  }

  private async fetchProfile(uid: string) {
    if (this.contactProfiles().has(uid)) return;
    const user = await this.authService.getUserById(uid);
    if (user) {
      this.contactProfiles.update(map => {
        const next = new Map(map);
        next.set(uid, user);
        return next;
      });
    }
  }

  public onUserSearchInput(term: string) {
    this.userSearchQuery.set(term);
    this.userSearch$.next(term);
  }

  // Keyboard Navigation & Shortcuts
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === 'k') {
      event.preventDefault();
      document.getElementById('searchInput')?.focus();
    }

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const currentList = this.filteredConversations();
      if (currentList.length === 0) return;

      const currentUrl = this.router.url;
      const match = currentUrl.match(/\/chat\/(.+)/);
      const activeId = match ? match[1] : null;

      let idx = activeId ? currentList.findIndex(c => c.id === activeId) : -1;

      if (event.key === 'ArrowDown') {
        idx = (idx + 1) % currentList.length;
      } else {
        idx = (idx - 1 < 0) ? currentList.length - 1 : idx - 1;
      }

      this.layoutState.clearView();
      this.router.navigate(['/chat', currentList[idx].id]);
    }
  }

  public async onSignOut(): Promise<void> {
    await this.authService.signOut();
    this.router.navigate(['/auth/login']);
  }

  public async startChat(user: User) {
    const convId = await this.chatService.getOrCreateConversation(user.uid);
    this.userSearchQuery.set('');
    this.foundUserResult.set(null);
    this.searchNotFound.set(false);
    this.layoutState.clearView();
    this.router.navigate(['/chat', convId]);
  }
}
