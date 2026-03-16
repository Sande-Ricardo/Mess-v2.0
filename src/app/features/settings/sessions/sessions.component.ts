import { DatePipe } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { UserSession } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { SessionService } from '../../../core/services/session.service';

@Component({
  selector: 'app-sessions',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './sessions.component.html',
  styleUrl: './sessions.component.scss'
})
export class SessionsComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly sessionService = inject(SessionService);

  public sessions = signal<Array<UserSession & { id: string }>>([]);
  public isLoading = signal<boolean>(true);

  private sessionsSub?: Subscription;

  ngOnInit() {
    // Current user can be obtained from auth service
    const user = this.authService.currentUser();
    if (user?.uid) {
      this.sessionsSub = this.sessionService.getActiveSessions(user.uid).subscribe(data => {
        // Convert map to array
        const sessionsArray = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => b.lastActive - a.lastActive); // Sort by most recent

        this.sessions.set(sessionsArray);
        this.isLoading.set(false);
      });
    } else {
      this.isLoading.set(false);
    }
  }

  ngOnDestroy() {
    if (this.sessionsSub) {
      this.sessionsSub.unsubscribe();
    }
  }

  public async revokeSession(sessionId: string) {
    const user = this.authService.currentUser();
    if (user?.uid) {
      await this.sessionService.revokeSession(user.uid, sessionId);
    }
  }
}
