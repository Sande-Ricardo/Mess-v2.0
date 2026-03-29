import { Directive, ElementRef, HostListener, Input, Output, EventEmitter, inject, OnDestroy, OnInit } from '@angular/core';
import { GroupService } from '../../core/services/group.service';
import { FirebaseService } from '../../core/services/firebase.service';
import { get, child } from '@angular/fire/database';
import { User } from '../../core/models/user.model';

@Directive({
  selector: '[appMention]',
  standalone: true
})
export class MentionDirective implements OnInit, OnDestroy {
  @Input('appMention') groupId!: string;
  @Output() mentionAdded = new EventEmitter<string>(); // Emits the uid of the mentioned user

  private el = inject(ElementRef<HTMLInputElement | HTMLTextAreaElement>);
  private groupService = inject(GroupService);
  private fbService = inject(FirebaseService);

  private popupElement: HTMLDivElement | null = null;
  private membersCache: Array<{ uid: string, username: string, displayName: string, avatarUrl?: string }> = [];
  
  private isMentioning = false;
  private mentionStartIndex = -1;
  private currentSearch = '';

  ngOnInit() {
    if (this.groupId) {
      this.loadMembers();
    }
  }

  ngOnDestroy() {
    this.removePopup();
  }

  private loadMembers() {
    // Ideally this listens or caches effectively. simplified for directive
    this.groupService.getGroupMembers(this.groupId).subscribe(async (members) => {
      const arr = [];
      for (const uid of Object.keys(members || {})) {
        const uSnap = await get(child(this.fbService.rootRef, `users/${uid}`));
        if (uSnap.exists()) {
          const user = uSnap.val() as User;
          arr.push({
             uid, 
             username: user.username, 
             displayName: user.displayName, 
             avatarUrl: user.avatarUrl 
          });
        }
      }
      this.membersCache = arr;
    });
  }

  @HostListener('input', ['$event'])
  onInput(event: Event) {
    const input = this.el.nativeElement;
    const val = input.value;
    const cursor = input.selectionStart || 0;

    // Check if we just typed '@' or are currently typing a mention
    if (!this.isMentioning) {
      const lastChar = val.substring(cursor - 1, cursor);
      if (lastChar === '@') {
        // Start mention flow
        this.isMentioning = true;
        this.mentionStartIndex = cursor;
        this.currentSearch = '';
        this.showPopup();
        this.updatePopupPosition();
      }
    } else {
      // We are in mention mode, track what's typed after @
      const textAfterAt = val.substring(this.mentionStartIndex, cursor);
      
      // If user typed space or deleted the '@', cancel mention
      if (textAfterAt.includes(' ') || val.substring(this.mentionStartIndex - 1, this.mentionStartIndex) !== '@') {
        this.cancelMention();
        return;
      }
      
      this.currentSearch = textAfterAt.toLowerCase();
      this.updatePopupContent();
      this.updatePopupPosition();
    }
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (!this.isMentioning || !this.popupElement) return;

    if (event.key === 'Escape') {
      this.cancelMention();
      event.preventDefault();
    }
    
    // We could add ArrowUp/ArrowDown/Enter logic here for full keyboard navigation of the popup.
  }

  private showPopup() {
    if (this.popupElement) return;

    this.popupElement = document.createElement('div');
    this.popupElement.className = 'mention-popup';
    Object.assign(this.popupElement.style, {
      position: 'absolute',
      background: '#2a2a35',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      maxHeight: '200px',
      overflowY: 'auto',
      zIndex: '9999',
      width: '250px',
      display: 'lex',
      flexDirection: 'column'
    });

    document.body.appendChild(this.popupElement);
    this.updatePopupContent();
  }

  private updatePopupPosition() {
    if (!this.popupElement) return;
    const rect = this.el.nativeElement.getBoundingClientRect();
    // Simplified positioning right below the input for now
    this.popupElement.style.top = `${rect.bottom + window.scrollY + 4}px`;
    this.popupElement.style.left = `${rect.left + window.scrollX}px`;
  }

  private updatePopupContent() {
    if (!this.popupElement) return;

    const filtered = this.membersCache.filter(m => 
      m.username.toLowerCase().includes(this.currentSearch) || 
      m.displayName.toLowerCase().includes(this.currentSearch)
    );

    this.popupElement.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No matching members';
      empty.style.padding = '10px';
      empty.style.color = '#aaa';
      empty.style.fontSize = '0.85rem';
      this.popupElement.appendChild(empty);
      return;
    }

    filtered.forEach(m => {
      const item = document.createElement('div');
      Object.assign(item.style, {
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
      });

      // Hover effect via JS
      item.onmouseenter = () => item.style.background = 'rgba(255,255,255,0.1)';
      item.onmouseleave = () => item.style.background = 'transparent';

      item.onclick = () => this.selectUser(m);

      const img = document.createElement('img');
      img.src = m.avatarUrl || 'assets/default-avatar.png';
      Object.assign(img.style, {
        width: '24px', height: '24px', borderRadius: '50%', marginRight: '10px', objectFit: 'cover'
      });

      const span = document.createElement('span');
      span.textContent = m.displayName;
      span.style.color = '#fff';
      span.style.fontSize = '0.9rem';

      const userSpan = document.createElement('span');
      userSpan.textContent = `@${m.username}`;
      userSpan.style.color = '#aaa';
      userSpan.style.fontSize = '0.75rem';
      userSpan.style.marginLeft = '8px';

      item.appendChild(img);
      item.appendChild(span);
      item.appendChild(userSpan);

      this.popupElement!.appendChild(item);
    });
  }

  private selectUser(user: { uid: string, username: string }) {
    const input = this.el.nativeElement;
    const val = input.value;
    
    // Replace the '@...' with the fully formed '@username '
    const before = val.substring(0, this.mentionStartIndex - 1); // remove the '@'
    const after = val.substring(input.selectionStart || val.length);
    
    const insert = `@${user.username} `;
    input.value = before + insert + after;
    
    // Trigger input event to update ngModel/FormControl
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Reset cursor after inserted text
    const newCursor = before.length + insert.length;
    input.setSelectionRange(newCursor, newCursor);
    input.focus();

    this.mentionAdded.emit(user.uid);
    this.cancelMention();
  }

  private cancelMention() {
    this.isMentioning = false;
    this.mentionStartIndex = -1;
    this.currentSearch = '';
    this.removePopup();
  }

  private removePopup() {
    if (this.popupElement && this.popupElement.parentNode) {
      this.popupElement.parentNode.removeChild(this.popupElement);
      this.popupElement = null;
    }
  }
}
