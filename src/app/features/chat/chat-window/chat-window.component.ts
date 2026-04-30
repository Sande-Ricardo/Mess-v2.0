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
import { Router } from '@angular/router';
import { of, switchMap } from 'rxjs';
import { Message } from '../../../core/models/chat.model';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService } from '../../../core/services/chat.service';
import { CloudinaryService } from '../../../core/services/cloudinary.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { GroupService } from '../../../core/services/group.service';
import { PresenceService } from '../../../core/services/presence.service';
import { CallType, WebRTCService } from '../../../core/services/webrtc.service';
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { VoiceMessageComponent } from '../voice-message/voice-message.component';
import { VoiceRecorderComponent } from '../voice-recorder/voice-recorder.component';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollingModule, TextFieldModule, VoiceRecorderComponent, VoiceMessageComponent, ImageViewerComponent],
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
  private readonly router = inject(Router);
  private readonly cloudinaryService = inject(CloudinaryService);
  private readonly webrtcService = inject(WebRTCService);

  @ViewChild('scrollViewport') viewport!: CdkVirtualScrollViewport;
  @ViewChild('imageInput') imageInput!: import('@angular/core').ElementRef<HTMLInputElement>;

  // ── Own user ──────────────────────────────────────────────────
  public readonly myUid = computed(() => this.authService.currentUser()?.uid);
  public readonly isGroup = computed(() => this.convId().startsWith('grp_'));

  // ── Streams — initialized in ngOnInit after inputs are bound ──
  public messages = signal<Message[]>([]);
  public typingUsers = signal<string[]>([]);

  // ── Media Gallery ──
  public readonly chatImages = computed(() => this.messages().filter(m => m.type === 'image').map(m => m.content));
  public activeImageIndex = signal<number | null>(null);

  // ── Contact resolution ─────────────────────────────────────────
  public readonly contactUser = signal<User | null>(null);
  public readonly contactAvatarUrl = signal<string | null>(null);
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

  public selectedImageFile: File | null = null;
  public selectedImagePreview: string | null = null;
  public isUploadingAttachment = false;

  public isConnectingCall = false;

  private lastMessageId: string | null = null;

  constructor() {
    // Auto-scroll effect — runs whenever messages update
    effect(() => {
      const msgs = this.messages();
      if (msgs && msgs.length > 0) {
        const currentLastId = msgs[msgs.length - 1].id;
        // Only scroll if a new message has actually been added
        if (currentLastId !== this.lastMessageId) {
          const wasNearBottom = this.viewport?.measureScrollOffset('bottom') < 100;
          this.lastMessageId = currentLastId;
          this.scrollToBottom(wasNearBottom);
        }
      }
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
      // 1. Messages (Reacts to ID change by emptying the buffer and subscribing again)
      const msgSignal = toSignal(
        convId$.pipe(
          switchMap(id => this.chatService.getMessages(id))
        ),
        { initialValue: [] as Message[] }
      );
      effect(() => { this.messages.set(msgSignal()); }, { allowSignalWrites: true });

      // 2. Typing users
      const typingSignal = toSignal(
        convId$.pipe(
          switchMap(id => this.presenceService.getTypingUsers(id))
        ),
        { initialValue: [] as string[] }
      );
      effect(() => { this.typingUsers.set(typingSignal()); }, { allowSignalWrites: true });

      // 3. Dynamic online status of the contact
      // We create an observable from the computed that calculates the otherUid
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
          this.contactAvatarUrl.set(data.avatarUrl || null);
          this.groupMemberCount.set(data.memberCount || 0);
        }
      });
      return;
    }

    const otherUid = this.getOtherUid();
    if (!otherUid) return;

    const user = await this.authService.getUserById(otherUid);
    this.contactUser.set(user);
    this.contactAvatarUrl.set(user?.avatarUrl || null);

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

  public async startAudioCall() {
    await this.initiateCall('voice');
  }

  public async startVideoCall() {
    await this.initiateCall('video');
  }

  private async initiateCall(type: CallType) {
    if (this.isGroup()) return; // Group calls to be implemented in Phase 4/Future
    const targetUid = this.getOtherUid();
    if (!targetUid) return;

    this.isConnectingCall = true;
    try {
      await this.webrtcService.createCall(targetUid, type);
      // Wait for the active call view to render
    } catch (e) {
      console.error('Failed to initiate call', e);
    } finally {
      this.isConnectingCall = false;
    }
  }

  public onInput(): void {
    const isTyping = this.newMessage.trim().length > 0;
    this.presenceService.setTyping(this.convId(), isTyping);
  }

  public triggerImageSelection(): void {
    if (this.imageInput) {
      this.imageInput.nativeElement.click();
    }
  }

  public onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (!file.type.startsWith('image/')) return;

      this.selectedImageFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.selectedImagePreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
    // Clear input value so same file can be selected again if needed
    input.value = '';
  }

  public clearAttachment(): void {
    this.selectedImageFile = null;
    this.selectedImagePreview = null;
  }

  public async sendMessage(event?: Event): Promise<void> {
    if (event) event.preventDefault();
    if (this.isUploadingAttachment) return;

    const text = this.newMessage.trim();
    const hasImage = !!this.selectedImageFile;

    if (!text && !hasImage) return;

    // UI Feedback
    this.newMessage = '';
    await this.presenceService.setTyping(this.convId(), false);

    try {
      if (hasImage) {
        this.isUploadingAttachment = true;
        const fileToUpload = this.selectedImageFile!;

        // We use a Promise wrapper to cleanly await the observable
        const secureUrl = await new Promise<string>((resolve, reject) => {
          this.cloudinaryService.uploadFile(fileToUpload, 'chat-attachments').subscribe({
            next: (res) => resolve(res.secureUrl),
            error: (err) => reject(err)
          });
        });

        await this.chatService.sendMessage(this.convId(), secureUrl, 'image');
        this.clearAttachment();
        this.isUploadingAttachment = false;
      }

      if (text) {
        await this.chatService.sendMessage(this.convId(), text, 'text');
      }

      // The effect() will handle the scroll automatically when the message arrives from the DB
    } catch (e) {
      console.error('Failed to send message/attachment:', e);
      this.isUploadingAttachment = false;
    }
  }

  public onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(force = false): void {
    setTimeout(() => {
      if (!this.viewport) return;
      
      const distanceToBottom = this.viewport.measureScrollOffset('bottom');
      const lastMsg = this.messages()[this.messages().length - 1];
      const isMyMessage = lastMsg?.senderId === this.myUid();

      // We only scroll if:
      // 1. We just sent the message (always follow own actions)
      // 2. OR we were already at the bottom (auto-follow new messages)
      // 3. OR it's a forced scroll
      if (isMyMessage || force) {
        if (distanceToBottom > 2) {
          this.viewport.scrollTo({ bottom: 0, behavior: 'smooth' });
        }
      }
    }, 150); // Increased slightly to ensure DOM has settled
  }

  public goBack() {
    this.router.navigate(['/chat']);
  }

  // ── Media Gallery Methods ──────────────────────────────────────

  public openImage(url: string) {
    const idx = this.chatImages().indexOf(url);
    if (idx !== -1) {
      this.activeImageIndex.set(idx);
    }
  }

  public closeImageViewer() {
    this.activeImageIndex.set(null);
  }

  public trackByMessageId(index: number, msg: Message): string {
    return msg.id;
  }
}
