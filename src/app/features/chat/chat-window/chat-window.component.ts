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
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { switchMap, of, filter } from 'rxjs';
import { Message } from '../../../core/models/chat.model';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService } from '../../../core/services/chat.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { GroupService } from '../../../core/services/group.service';
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
  private readonly fbService = inject(FirebaseService);
  private readonly groupService = inject(GroupService);
  private readonly presenceService = inject(PresenceService);
  private readonly authService = inject(AuthService);
  private readonly injector = inject(Injector);

  @ViewChild('scrollViewport') viewport!: CdkVirtualScrollViewport;

  // ── Own user ──────────────────────────────────────────────────
  public readonly myUid = computed(() => this.authService.currentUser()?.uid);
  public readonly isGroup = computed(() => this.convId().startsWith('grp_'));

  // ── Streams — initialized in ngOnInit after inputs are bound ──
  public messages = signal<Message[]>([]);
  public typingUsers = signal<string[]>([]);

  // ── Contact resolution ─────────────────────────────────────────
  public readonly contactUser = signal<User | null>(null);
  public readonly groupNameVal = signal<string | null>(null);
  public readonly groupMemberCount = signal<number>(0);

  public readonly contactName = computed(() =>
    this.isGroup() 
      ? (this.groupNameVal() ?? 'Loading Group...')
      : (this.contactUser()?.displayName ?? this.contactUser()?.username ?? 'Loading...')
  );

  public readonly contactIsOnline = signal<boolean>(false);
  
  public readonly contactStatus = computed(() => {
    if (this.isGroup()) {
      return `${this.groupMemberCount()} members`;
    }
    return this.contactIsOnline() ? 'Online' : 'Offline';
  });

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
    const convId$ = toObservable(this.convId, { injector: this.injector });

    runInInjectionContext(this.injector, () => {
      // 1. Mensajes (Reacciona al cambio de ID vaciando el buffer y suscribiéndose de nuevo)
      const msgSignal = toSignal(
        convId$.pipe(
          switchMap(id => this.chatService.getMessages(id))
        ), 
        { initialValue: [] as Message[] }
      );
      effect(() => { this.messages.set(msgSignal()); }, { allowSignalWrites: true });

      // 2. Usuarios escribiendo
      const typingSignal = toSignal(
        convId$.pipe(
          switchMap(id => this.presenceService.getTypingUsers(id))
        ), 
        { initialValue: [] as string[] }
      );
      effect(() => { this.typingUsers.set(typingSignal()); }, { allowSignalWrites: true });

      // 3. Estado Online dinámico del contacto
      // Creamos un observable a partir del computed que calcula el otherUid
      const otherUid$ = toObservable(computed(() => this.getOtherUid()), { injector: this.injector });
      
      const onlineStatusSignal = toSignal(
        otherUid$.pipe(
          switchMap(uid => uid ? this.presenceService.getOnlineStatus(uid) : of(false))
        ),
        { initialValue: false }
      );

      effect(() => {
        this.contactIsOnline.set(onlineStatusSignal());
      }, { allowSignalWrites: true });
    });
  }

  ngOnDestroy(): void {
    const otherUid = this.getOtherUid();
    if (otherUid) {
      this.presenceService.stopListeningOnlineStatus(otherUid);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private async resolveContactName(convId: string): Promise<void> {
    if (this.isGroup()) {
      import('@angular/fire/database').then(async ({ child, get }) => {
        const metadataRef = child(this.fbService.rootRef, `groups/${convId}/metadata`);
        const snapshot = await get(metadataRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          this.groupNameVal.set(data.name);
          this.groupMemberCount.set(data.memberCount || 0);
        }
      });
      return;
    }

    const otherUid = this.getOtherUid();
    if (!otherUid) return;

    const user = await this.authService.getUserById(otherUid);
    this.contactUser.set(user);

    // Listen to online status
    runInInjectionContext(this.injector, () => {
      const onlineSignal = toSignal(this.presenceService.getOnlineStatus(otherUid), { initialValue: false });
      effect(() => {
        this.contactIsOnline.set(onlineSignal());
      }, { allowSignalWrites: true });
    });
  }

  private getOtherUid(): string | null {
    const convId = this.convId();
    const myUid = this.myUid();
    if (!convId || !myUid) return null;

    const parts = convId.split('_');
    return parts.find(p => p !== myUid) ?? parts[0];
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
