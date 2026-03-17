import { Component, HostListener, computed, effect, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChatService } from '../../../core/services/chat.service';
import { Conversation } from '../../../core/models/chat.model';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DatePipe],
  templateUrl: './conversation-list.component.html',
  styleUrl: './conversation-list.component.scss'
})
export class ConversationListComponent implements OnInit {
  private readonly chatService = inject(ChatService);
  private readonly router = inject(Router);

  // States
  public searchQuery = signal('');
  public conversationsSignal: any;
  public conversations = signal<Conversation[]>([]);

  // Computed filter logic
  public filteredConversations = computed(() => {
    const term = this.searchQuery().toLowerCase();
    const list = this.conversations();
    
    if (!term) return list;

    return list.filter(c => {
      // Assuming contact name is mocked or derived, we'll search the last message for now
      // In a full app, you'd joined the participants' usernames to search them too.
      const matchMsg = c.lastMessage?.toLowerCase().includes(term);
      return matchMsg;
    });
  });

  ngOnInit() {
    this.conversationsSignal = toSignal(this.chatService.getUserConversations(), { initialValue: [] });
    
    effect(() => {
      this.conversations.set(this.conversationsSignal() || []);
    }, { allowSignalWrites: true });
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

  // Helper to extract the *other* user ID for UI display (mock contact)
  public getContactId(conv: Conversation): string | null {
    const myUid = this.chatService['authService'].currentUser()?.uid;
    const ids = Object.keys(conv.participants);
    return ids.find(id => id !== myUid) || 'Unknown';
  }
}
