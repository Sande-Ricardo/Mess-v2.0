import { CommonModule, DatePipe } from '@angular/common';
import { Component, HostListener, computed, input, output, signal } from '@angular/core';
import { Message } from '../../../core/models/chat.model';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './message-bubble.component.html',
  styleUrl: './message-bubble.component.scss'
})
export class MessageBubbleComponent {
  public message = input.required<Message>();
  public isMine = input.required<boolean>();
  public quotedMessage = input<Message | null>(null);

  // Component outputs for parent ChatWindow to handle RTDB calls
  public reply = output<Message>();
  public edit = output<Message>();
  public delete = output<Message>();
  public react = output<{ msg: Message, emoji: string }>();

  // State
  public showContextMenu = signal(false);
  public contextMenuPosition = signal({ x: 0, y: 0 });
  public showReactionPicker = signal(false);

  public readonly emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥'];

  // Time-based permission checks
  public canEdit = computed(() => {
    if (!this.isMine()) return false;
    const diff = Date.now() - this.message().timestamp;
    return diff < 15 * 60 * 1000; // 15 mins
  });

  public canDelete = computed(() => {
    if (!this.isMine()) return false;
    const diff = Date.now() - this.message().timestamp;
    return diff < 48 * 60 * 60 * 1000; // 48 hours
  });

  // Calculate generic reaction counts map
  public reactionsList = computed(() => {
    const reacts = this.message().reactions || {};
    const counts = new Map<string, number>();
    Object.values(reacts).forEach(e => {
      counts.set(e, (counts.get(e) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count }));
  });

  // Context Menu Listeners (Web)
  @HostListener('contextmenu', ['$event'])
  onRightClick(event: MouseEvent) {
    event.preventDefault();
    this.openContextMenu(event.clientX, event.clientY);
  }

  // Context Menu Listeners (Mobile Long Press)
  private touchTimeout: any;
  private touchStartX = 0;
  private touchStartY = 0;

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    if (event.touches.length === 1) {
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
      this.touchTimeout = setTimeout(() => {
        this.openContextMenu(this.touchStartX, this.touchStartY);
      }, 500);
    }
  }

  @HostListener('touchend', ['$event'])
  @HostListener('touchmove', ['$event'])
  onTouchEnd(event: TouchEvent) {
    if (event.type === 'touchmove') {
      const touch = event.touches[0];
      // Cancel if they scrolled/moved finger
      if (Math.abs(touch.clientX - this.touchStartX) > 10 || Math.abs(touch.clientY - this.touchStartY) > 10) {
        clearTimeout(this.touchTimeout);
      }
    } else {
      clearTimeout(this.touchTimeout);
    }
  }

  // Close context menu if clicked outside
  @HostListener('document:click', ['$event'])
  @HostListener('document:touchstart', ['$event'])
  onDocumentClick(event: Event) {
    this.closeContextMenu();
  }

  private openContextMenu(x: number, y: number) {
    this.contextMenuPosition.set({ x, y });
    this.showContextMenu.set(true);
    this.showReactionPicker.set(false);
  }

  private closeContextMenu() {
    this.showContextMenu.set(false);
    this.showReactionPicker.set(false);
  }

  // Actions
  public onReply(event: Event) {
    event.stopPropagation();
    this.reply.emit(this.message());
    this.closeContextMenu();
  }

  public async onCopy(event: Event) {
    event.stopPropagation();
    try {
      if (this.message().type !== 'deleted') {
        await navigator.clipboard.writeText(this.message().content);
      }
    } catch (e) {
      console.error('Failed to copy', e);
    }
    this.closeContextMenu();
  }

  public onEdit(event: Event) {
    event.stopPropagation();
    if (this.canEdit()) {
      this.edit.emit(this.message());
    }
    this.closeContextMenu();
  }

  public onDelete(event: Event) {
    event.stopPropagation();
    if (this.canDelete()) {
      this.delete.emit(this.message());
    }
    this.closeContextMenu();
  }

  public toggleReactionPicker(event: Event) {
    event.stopPropagation();
    this.showReactionPicker.set(true);
  }

  public onReact(emoji: string, event: Event) {
    event.stopPropagation();
    this.react.emit({ msg: this.message(), emoji });
    this.closeContextMenu();
  }
}
