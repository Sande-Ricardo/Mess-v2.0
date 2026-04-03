import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { TextFieldModule } from '@angular/cdk/text-field';
import { CommonModule } from '@angular/common';
import {
  Component,
  Injector,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  runInInjectionContext,
  signal
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Message } from '../../../core/models/chat.model';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService } from '../../../core/services/chat.service';
import { PresenceService } from '../../../core/services/presence.service';
import { VoiceMessageComponent } from '../voice-message/voice-message.component';
import { VoiceRecorderComponent } from '../voice-recorder/voice-recorder.component';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollingModule, TextFieldModule, VoiceRecorderComponent, VoiceMessageComponent],
  templateUrl: './chat-window.component.html',
  styleUrl: './chat-window.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class ChatWindowComponent implements OnInit, OnDestroy {
  /** Route input — provided via chat.routes.ts :convId param */
  public readonly convId = input.required<string>();

  private readonly chatService = inject(ChatService);
  private readonly presenceService = inject(PresenceService);
  private readonly authService = inject(AuthService);
  private readonly injector = inject(Injector);

  @ViewChild('scrollViewport') viewport!: CdkVirtualScrollViewport;

  // ── Own user ──────────────────────────────────────────────────
  public readonly myUid = computed(() => this.authService.currentUser()?.uid);

  // ── Streams — initialized in ngOnInit after inputs are bound ──
  public messages = signal<Message[]>([]);
  public typingUsers = signal<string[]>([]);

  // ── Contact resolution ─────────────────────────────────────────
  public readonly contactUser = signal<User | null>(null);
  public readonly contactName = computed(() =>
    this.contactUser()?.displayName ?? this.contactUser()?.username ?? 'Loading...'
  );
  public readonly contactStatus = 'Online';

  // ── Compose state ──────────────────────────────────────────────
  public newMessage = '';
  public isRecordingVoice = false;

  constructor() {
    // Auto-scroll effect — runs whenever messages update
    effect(() => {
      const msgs = this.messages();
      if (msgs && msgs.length > 0) this.scrollToBottom();
    });

    // Resolve contact name reactively — retries when currentUser() becomes available
    // This handles page reloads where auth state resolves after component init
    effect(() => {
      const currentUser = this.authService.currentUser();
      if (!currentUser) return;
      // convId() is safe inside effects since they run after the first change detection
      // (by which time withComponentInputBinding has bound the route param)
      try {
        const convId = this.convId();
        if (convId) this.resolveContactName(convId);
      } catch {
        // convId not yet bound — will retry on next effect run
      }
    });
  }

  ngOnInit(): void {
    const convId = this.convId();

    runInInjectionContext(this.injector, () => {
      const msgSignal = toSignal(this.chatService.getMessages(convId), { initialValue: [] as Message[] });
      const typingSignal = toSignal(this.presenceService.getTypingUsers(convId), { initialValue: [] as string[] });

      effect(() => { this.messages.set(msgSignal()); }, { allowSignalWrites: true });
      effect(() => { this.typingUsers.set(typingSignal()); }, { allowSignalWrites: true });
    });
  }

  ngOnDestroy(): void {
    this.chatService.stopListeningMessages(this.convId());
    this.presenceService.stopListeningTyping(this.convId());
  }

  // ── Helpers ────────────────────────────────────────────────────

  private async resolveContactName(convId: string): Promise<void> {
    if (!convId) return;

    const myUid = this.authService.currentUser()?.uid;
    if (!myUid) return;

    // The convId is formatted as "uid1_uid2" (sorted alphabetically)
    const parts = convId.split('_');
    const otherUid = parts.find(p => p !== myUid) ?? parts[0];

    if (!otherUid || otherUid === myUid) return;

    const user = await this.authService.getUserById(otherUid);
    this.contactUser.set(user);
  }

  // ── Actions ────────────────────────────────────────────────────

  public onInput(): void {
    const isTyping = this.newMessage.trim().length > 0;
    this.presenceService.setTyping(this.convId(), isTyping);
  }

  public async sendMessage(event?: Event): Promise<void> {
    if (event) event.preventDefault();

    const text = this.newMessage.trim();
    if (!text) return;

    this.newMessage = '';
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
