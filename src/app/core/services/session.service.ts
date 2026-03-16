import { Injectable, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { ref, set, onValue, off, remove, child } from '@angular/fire/database';
import { Observable, Subject } from 'rxjs';
import { UserSession } from '../models/user.model';

export interface PendingSession {
  status: 'waiting' | 'confirmed';
  uid?: string;
  createdAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private readonly fbService = inject(FirebaseService);

  constructor() {}

  /**
   * Generates a pseudo-random crypto UUID for the QR Token (v4 format)
   */
  public generateQRToken(): string {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  /**
   * Creates a pending session RTDB node for the QR Code to listen to.
   * @param token The generated UUID
   */
  public async createPendingSession(token: string): Promise<void> {
    const sessionRef = child(this.fbService.rootRef, `pending-sessions/${token}`);
    const data: PendingSession = {
      status: 'waiting',
      createdAt: Date.now()
    };
    await set(sessionRef, data);
  }

  /**
   * Listens to a specific pending session token to verify when 'confirmed' happens.
   * @param token The Token to listen to
   * @returns Observable of the PendingSession state
   */
  public listenToPendingSession(token: string): Observable<PendingSession | null> {
    const subject = new Subject<PendingSession | null>();
    const sessionRef = child(this.fbService.rootRef, `pending-sessions/${token}`);

    onValue(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        subject.next(snapshot.val() as PendingSession);
      } else {
        subject.next(null);
      }
    });

    return subject.asObservable();
  }

  /**
   * Stops listening to a pending session
   */
  public stopListeningToPendingSession(token: string): void {
    const sessionRef = child(this.fbService.rootRef, `pending-sessions/${token}`);
    off(sessionRef);
  }

  /**
   * (Dev Mode) Manually updates the pending session status to confirmed.
   */
  public async simulateMobileScan(token: string, simulatedUid: string = 'mock-user-1234'): Promise<void> {
    const sessionRef = child(this.fbService.rootRef, `pending-sessions/${token}`);
    await set(sessionRef, {
      status: 'confirmed',
      uid: simulatedUid,
      createdAt: Date.now()
    });
  }

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
