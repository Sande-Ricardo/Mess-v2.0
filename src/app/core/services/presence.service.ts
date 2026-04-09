  import { Injectable, inject, OnDestroy, effect } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import { ref, set, remove, get, child, onValue, off, onDisconnect, serverTimestamp } from '@angular/fire/database';
import { Observable, Subject, Subscription, timer } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class PresenceService implements OnDestroy {
  private readonly fbService = inject(FirebaseService);
  private readonly authService = inject(AuthService);

  // Map to hold typing subjects per conversation
  private typingSubjects = new Map<string, Subject<boolean>>();
  private typingSubscriptions = new Map<string, Subscription>();

  private connectedRefUnsub?: () => void;

  constructor() {
    // Al reaccionar al signal del usuario, activamos o desactivamos su presencia en DB
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.initializeOnlinePresence(user.uid, user.settings?.lastSeenVisibility !== 'none');
      } else if (this.connectedRefUnsub) {
        this.connectedRefUnsub();
        this.connectedRefUnsub = undefined;
      }
    });
  }

  ngOnDestroy() {
    this.typingSubjects.forEach(subject => subject.complete());
    this.typingSubscriptions.forEach(sub => sub.unsubscribe());
    if (this.connectedRefUnsub) this.connectedRefUnsub();
  }

  /**
   * Se acopla a '.info/connected' para reaccionar a caídas de red o cierres abruptos
   */
  private initializeOnlinePresence(uid: string, canSetLastSeen: boolean) {
    const connectedRef = child(this.fbService.rootRef, '.info/connected');
    const isOnlineRef = child(this.fbService.rootRef, `users/${uid}/isOnline`);
    const lastSeenRef = child(this.fbService.rootRef, `users/${uid}/lastSeen`);

    if (this.connectedRefUnsub) {
      this.connectedRefUnsub();
    }

    this.connectedRefUnsub = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        onDisconnect(isOnlineRef).set(false);
        if (canSetLastSeen) {
           onDisconnect(lastSeenRef).set(serverTimestamp());
        }
        
        // Establecer como conectado
        set(isOnlineRef, true);
      }
    });
  }

  /**
   * Sets the typing status for the current user in a specific conversation.
   * Auto-clears after 3 seconds of no incoming calls.
   */
  public async setTyping(convId: string, isTyping: boolean): Promise<void> {
    const uid = this.authService.currentUser()?.uid;
    if (!uid) return;

    const typingRef = child(this.fbService.rootRef, `typing/${convId}/${uid}`);

    if (!this.typingSubjects.has(convId)) {
      const subject = new Subject<boolean>();
      this.typingSubjects.set(convId, subject);

      // Debounce logic: if no new 'true' events come within 3000ms, emit false
      this.typingSubscriptions.set(
        convId,
        subject.pipe(debounceTime(3000)).subscribe(async () => {
          await remove(typingRef); // clear typing state
        })
      );
    }

    if (isTyping) {
      await set(typingRef, Date.now());
      // Setup Firebase native cleanup for unexpected disconnects (like tab close)
      onDisconnect(typingRef).remove();
      // Tick the debounce clock
      this.typingSubjects.get(convId)?.next(true);
    } else {
      await remove(typingRef);
      // Cancel the onDisconnect if we cleared manually
      onDisconnect(typingRef).cancel();
    }
  }

  /**
   * Reads the active typing users for a conversation in real-time.
   */
  public getTypingUsers(convId: string): Observable<string[]> {
    const subject = new Subject<string[]>();
    const typingListRef = child(this.fbService.rootRef, `typing/${convId}`);

    onValue(typingListRef, (snapshot) => {
      if (snapshot.exists()) {
        const uids = Object.keys(snapshot.val());
        // Filter out our own uid
        const myUid = this.authService.currentUser()?.uid;
        subject.next(uids.filter(id => id !== myUid));
      } else {
        subject.next([]);
      }
    });

    return subject.asObservable();
  }

  public stopListeningTyping(convId: string): void {
    const typingListRef = child(this.fbService.rootRef, `typing/${convId}`);
    off(typingListRef);
  }

  /**
   * Updates the current user's "lastSeen" timestamp, IF their privacy setting allows it.
   */
  public async updateLastSeen(): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) return;

    // Check privacy settings before pushing
    if (user.settings?.lastSeenVisibility === 'none') {
      return; 
    }

    const lastSeenRef = child(this.fbService.rootRef, `users/${user.uid}/lastSeen`);
    await set(lastSeenRef, Date.now());
  }

  /**
   * Retrieves a target user's lastSeen timestamp. 
   * Returns null if the user's settings explicitly hide it ("none").
   * Contact-only logic requires friend arrays, assuming public or none right now for MVP.
   */
  public async getLastSeen(uid: string): Promise<number | null> {
    const userRef = child(this.fbService.rootRef, `users/${uid}`);
    const snapshot = await get(userRef);
    
    if (snapshot.exists()) {
      const userData = snapshot.val() as User;
      if (userData.settings?.lastSeenVisibility === 'none') {
        return null;
      }
      return userData.lastSeen || null;
    }
    
    return null;
  }
}
