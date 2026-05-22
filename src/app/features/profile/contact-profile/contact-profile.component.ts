import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutStateService } from '../../../core/services/layout-state.service';
import { PresenceService } from '../../../core/services/presence.service';
import { FirebaseService } from '../../../core/services/firebase.service';

@Component({
  selector: 'app-contact-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contact-profile.component.html',
  styleUrl: './contact-profile.component.scss'
})
export class ContactProfileComponent {
  public readonly layoutState = inject(LayoutStateService);
  private readonly authService = inject(AuthService);
  private readonly presenceService = inject(PresenceService);
  private readonly fbService = inject(FirebaseService);

  public contactUser = signal<User | null>(null);
  public isOnline = signal<boolean>(false);
  public groupData = signal<{name: string, avatarUrl: string | null, memberCount: number} | null>(null);
  public isLoading = signal<boolean>(true);

  private onlineSub: (() => void) | null = null;

  constructor() {
    effect(() => {
      const targetId = this.layoutState.activeContactId();
      const isGroup = this.layoutState.isGroupContact();
      
      this.cleanup();
      
      if (targetId) {
        this.isLoading.set(true);
        this.loadProfile(targetId, isGroup).finally(() => this.isLoading.set(false));
      }
    });
  }

  private async loadProfile(targetId: string, isGroup: boolean) {
    if (isGroup) {
      import('@angular/fire/database').then(async ({ child, get }) => {
        const metadataRef = child(this.fbService.rootRef, `groups/${targetId}/metadata`);
        const snapshot = await get(metadataRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          this.groupData.set({
            name: data.name,
            avatarUrl: data.avatarUrl || null,
            memberCount: data.memberCount || 0
          });
        }
      });
    } else {
      const user = await this.authService.getUserById(targetId);
      this.contactUser.set(user);

      import('@angular/core/rxjs-interop').then(({ toSignal }) => {
        // Start listening to online status
        const onlineObs = this.presenceService.getOnlineStatus(targetId);
        const sub = onlineObs.subscribe(status => this.isOnline.set(status));
        this.onlineSub = () => sub.unsubscribe();
      });
    }
  }

  private cleanup() {
    this.contactUser.set(null);
    this.groupData.set(null);
    this.isOnline.set(false);
    if (this.onlineSub) {
      this.onlineSub();
      this.onlineSub = null;
    }
  }
}
