import { CommonModule, DatePipe } from '@angular/common';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { Conversation } from '../../../core/models/chat.model';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService } from '../../../core/services/chat.service';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DatePipe],
  templateUrl: './conversation-list.component.html',
  styleUrl: './conversation-list.component.scss'
})
export class ConversationListComponent {
  private readonly chatService = inject(ChatService);
  public readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Conversation list state
  public readonly searchQuery = signal('');
  public readonly conversations = toSignal(
    this.chatService.getUserConversations(),
    { initialValue: [] as Conversation[] }
  );

  // User search state
  public readonly userSearchQuery = signal('');
  public readonly foundUserResult = signal<User | null>(null);
  public readonly searchNotFound = signal(false);
  public readonly isSearching = signal(false);
  private readonly userSearch$ = new Subject<string>();

  // Contact profile cache: uid → User
  public readonly contactProfiles = signal<Map<string, User>>(new Map());

  // Computed filter logic
  public readonly filteredConversations = computed(() => {
    const term = this.searchQuery().toLowerCase();
    const list = this.conversations();

    if (!term) return list;

    return list.filter(c => {
      const otherUid = this.getContactId(c);
      const profile = otherUid ? this.contactProfiles().get(otherUid) : null;
      const matchName = profile?.username?.toLowerCase().includes(term)
        || profile?.displayName?.toLowerCase().includes(term);
      const matchMsg = c.lastMessage?.toLowerCase().includes(term);
      return matchName || matchMsg;
    });
  });

  constructor() {
    // Resolve contact profiles whenever the conversation list updates
    effect(() => {
      const convs = this.conversations();
      const myUid = this.authService.currentUser()?.uid;
      if (!myUid || convs.length === 0) return;

      const current = new Map(this.contactProfiles());
      for (const conv of convs) {
        const otherUid = Object.keys(conv.participants).find(id => id !== myUid);
        if (otherUid && !current.has(otherUid)) {
          // Fetch async, then update the map signal
          this.authService.getUserById(otherUid).then(user => {
            if (user) {
              this.contactProfiles.update(map => {
                const next = new Map(map);
                next.set(otherUid, user);
                return next;
              });
            }
          });
        }
      }
    });

    // Wire the debounced user search — must be in constructor for injection context
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

      // Find currently active from URL route (simplified)
      const currentUrl = this.router.url;
      const match = currentUrl.match(/\/chat\/(.+)/);
      const activeId = match ? match[1] : null;

      let idx = activeId ? currentList.findIndex(c => c.id === activeId) : -1;

      if (event.key === 'ArrowDown') {
        idx = (idx + 1) % currentList.length; // Loop around
      } else {
        idx = (idx - 1 < 0) ? currentList.length - 1 : idx - 1;
      }

      this.router.navigate(['/chat', currentList[idx].id]);
    }
  }

  /** Returns the other participant's UID in a conversation. */
  public getContactId(conv: Conversation): string | null {
    const myUid = this.authService.currentUser()?.uid;
    const ids = Object.keys(conv.participants);
    return ids.find(id => id !== myUid) || null;
  }

  /** Returns the display name (username preferred) for the other participant. */
  public getContactName(conv: Conversation): string {
    const uid = this.getContactId(conv);
    if (!uid) return 'Unknown';
    const profile = this.contactProfiles().get(uid);
    return profile?.username ?? profile?.displayName ?? uid.substring(0, 8) + '...';
  }

  /** Returns the first letter for the avatar. */
  public getContactInitial(conv: Conversation): string {
    const uid = this.getContactId(conv);
    if (!uid) return '?';
    const profile = this.contactProfiles().get(uid);
    return (profile?.displayName ?? profile?.username ?? uid).charAt(0).toUpperCase();
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
    this.router.navigate(['/chat', convId]);
  }
}
