import { Injectable, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { ref, set, onValue, off, remove, child } from '@angular/fire/database';
import { Observable, Subject } from 'rxjs';
import { UserSession } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private readonly fbService = inject(FirebaseService);

  constructor() {}

  /**
   * Stream of a user's active sessions
   */
  public getActiveSessions(uid: string): Observable<Record<string, UserSession>> {
    const subject = new Subject<Record<string, UserSession>>();
    const sessionsRef = child(this.fbService.rootRef, `users/${uid}/sessions`);

    onValue(sessionsRef, (snapshot) => {
      if (snapshot.exists()) {
        subject.next(snapshot.val());
      } else {
        subject.next({});
      }
    });

    return subject.asObservable();
  }

  /**
   * Removes a specific session (revoking access)
   */
  public async revokeSession(uid: string, sessionId: string): Promise<void> {
    const sessionRef = child(this.fbService.rootRef, `users/${uid}/sessions/${sessionId}`);
    await remove(sessionRef);
  }
}
