import { Component, ElementRef, OnInit, ViewChild, ViewEncapsulation, effect, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { TextFieldModule } from '@angular/cdk/text-field';
import { ChatService } from '../../../core/services/chat.service';
import { PresenceService } from '../../../core/services/presence.service';
import { AuthService } from '../../../core/services/auth.service';
import { Message } from '../../../core/models/chat.model';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollingModule, TextFieldModule],
  templateUrl: './chat-window.component.html',
  styleUrl: './chat-window.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class ChatWindowComponent implements OnInit {
  public convId = input.required<string>();
  
  private readonly chatService = inject(ChatService);
  private readonly presenceService = inject(PresenceService);
  public readonly authService = inject(AuthService);

  @ViewChild('scrollViewport') viewport!: CdkVirtualScrollViewport;

  // State
  public newMessage = '';
  public messages = [] as Message[];
  public typingUsers = [] as string[];
  public myUid = this.authService.currentUser()?.uid;

  // (Mock) Remote Contact Details based on convId and me
  public contactName = 'Contact'; 
  public contactStatus = 'Online';

  // Signals for reactivity
  public messagesSignal: any;
  public typingSignal: any;

  constructor() {
    // Effect to auto-scroll when new messages arrive
    effect(() => {
      const msgs = this.messagesSignal();
      if (msgs && msgs.length > 0) {
        this.scrollToBottom();
      }
    });
  }

  ngOnInit(): void {
    // We bind the observable streams to Signals
    this.messagesSignal = toSignal(this.chatService.getMessages(this.convId()), { initialValue: [] });
    this.typingSignal = toSignal(this.presenceService.getTypingUsers(this.convId()), { initialValue: [] });

    // For the template
    effect(() => {
      this.messages = this.messagesSignal();
      this.typingUsers = this.typingSignal();
    });
  }

  public onInput(): void {
    const isTyping = this.newMessage.trim().length > 0;
    this.presenceService.setTyping(this.convId(), isTyping);
  }

  public async sendMessage(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
    }

    const text = this.newMessage.trim();
    if (!text) return;

    this.newMessage = '';
    // Clear typing instantly
    await this.presenceService.setTyping(this.convId(), false);

    try {
      await this.chatService.sendMessage(this.convId(), text, 'text');
      this.scrollToBottom();
    } catch (e) {
      console.error('Failed to send message:', e);
    }
  }

  public onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.viewport) {
        this.viewport.scrollTo({ bottom: 0, behavior: 'smooth' });
      }
    }, 100);
  }
}
