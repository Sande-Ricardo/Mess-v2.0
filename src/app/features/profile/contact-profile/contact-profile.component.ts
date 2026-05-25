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
  public isLoading = signal<boolean>(true);

  private onlineSub: (() => void) | null = null;

  constructor() {
    effect(() => {
      const targetId = this.layoutState.activeContactId();
      
      this.cleanup();
      
      if (targetId) {
        this.isLoading.set(true);
        this.loadProfile(targetId).finally(() => this.isLoading.set(false));
      }
    });
  }

  private async loadProfile(targetId: string) {
    const user = await this.authService.getUserById(targetId);
    this.contactUser.set(user);

    import('@angular/core/rxjs-interop').then(({ toSignal }) => {
      // Start listening to online status
      const onlineObs = this.presenceService.getOnlineStatus(targetId);
      const sub = onlineObs.subscribe(status => this.isOnline.set(status));
      this.onlineSub = () => sub.unsubscribe();
    });
  }

  private cleanup() {
    this.contactUser.set(null);
    this.isOnline.set(false);
    if (this.onlineSub) {
      this.onlineSub();
      this.onlineSub = null;
    }
  }
}
