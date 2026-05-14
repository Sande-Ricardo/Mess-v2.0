import { inject, Injectable, signal } from '@angular/core';
import {
  ApplicationVerifier,
  Auth,
  authState,
  ConfirmationResult,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  UserCredential
} from '@angular/fire/auth';
import { child, get, update } from '@angular/fire/database';
import { User, UserSettings } from '../models/user.model';
import { FirebaseService } from './firebase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly fbService = inject(FirebaseService);

  // Exposing user signal to the whole app
  public readonly currentUser = signal<User | null>(null);

  constructor() {
    // Listen to Firebase abstract auth state
    authState(this.auth).subscribe(async (fbUser) => {
      if (fbUser) {
        // Fetch custom profile from RTDB
        const userRef = this.fbService.getUserRef(fbUser.uid);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          this.currentUser.set(snapshot.val() as User);
        }
        // NOTE: If the profile doesn't exist yet, we DON'T clear currentUser.
        // This handles the race condition where authState fires before createRTDBProfile
        // finishes writing (e.g. during registration). createRTDBProfile sets the
        // signal explicitly via this.currentUser.set(newUser) after the write completes.
      } else {
        this.currentUser.set(null);
      }
    });
  }

  /**
   * Checks if a username already exists.
   */
  public async checkUsernameExists(username: string): Promise<boolean> {
    const usernameRef = child(this.fbService.rootRef, `usernames/${username}`);
    const snapshot = await get(usernameRef);
    return snapshot.exists();
  }

  /**
   * Fetches a user's full profile by UID.
   */
  public async getUserById(uid: string): Promise<User | null> {
    const userRef = this.fbService.getUserRef(uid);
    const snapshot = await get(userRef);
    return snapshot.exists() ? (snapshot.val() as User) : null;
  }

  /**
   * Searches for a user by exact username.
   * Resolves /usernames/{username} → UID → /users/{uid}.
   * Returns null if the username doesn't exist or matches the current user.
   */
  public async searchUserByUsername(username: string): Promise<User | null> {
    if (!username.trim()) return null;

    const usernameRef = child(this.fbService.rootRef, `usernames/${username.trim()}`);
    const usernameSnap = await get(usernameRef);

    if (!usernameSnap.exists()) return null;

    const targetUid = usernameSnap.val() as string;

    // Don't return the current user in search results
    if (targetUid === this.currentUser()?.uid) return null;

    const userRef = this.fbService.getUserRef(targetUid);
    const userSnap = await get(userRef);

    if (!userSnap.exists()) return null;

    return userSnap.val() as User;
  }

  /**
   * Creates RTDB profile metadata after successful auth creation
   */
  private async createRTDBProfile(
    uid: string,
    username: string,
    email: string,
    displayName: string,
    phoneNumber?: string
  ): Promise<void> {
    const timestamp = Date.now();
    const settings: UserSettings = {
      lastSeenVisibility: 'all',
      readReceiptsEnabled: true,
      avatarVisibility: 'all'
    };

    const newUser: User = {
      uid,
      username,
      email,
      displayName,
      createdAt: timestamp,
      lastSeen: timestamp,
      settings,
      ...(phoneNumber ? { phoneNumber } : {})
    };

    // Transactionally write to usernames node and users node
    // In standard RTDB, client-side we perform two writes unless using update.
    const updates: { [key: string]: any } = {};
    updates[`users/${uid}`] = newUser;
    updates[`usernames/${username}`] = uid; // Reserve the username pointing to UID

    await update(this.fbService.rootRef, updates);
    // Update local signal explicitly immediately to avoid wait time
    this.currentUser.set(newUser);
  }

  /**
   * Register flow via Email and Password
   */
  public async registerWithEmail(email: string, password: string, username: string, displayName: string): Promise<void> {
    const exists = await this.checkUsernameExists(username);
    if (exists) {
      throw new Error('username-taken');
    }

    const credentials = await createUserWithEmailAndPassword(this.auth, email, password);
    await sendEmailVerification(credentials.user);

    await this.createRTDBProfile(credentials.user.uid, username, email, displayName);
  }

  /**
   * Step 1 of internal Phone Auth: Sends SMS OTP via verification application.
   */
  public async registerWithPhone(phoneNumber: string, appVerifier: ApplicationVerifier): Promise<ConfirmationResult> {
    return signInWithPhoneNumber(this.auth, phoneNumber, appVerifier);
  }

  /**
   * Step 2 of Phone Auth: Confirms OTP and sets up username / generic data.
   */
  public async verifyOTP(
    confirmationResult: ConfirmationResult,
    code: string,
    username: string,
    displayName: string
  ): Promise<void> {
    const exists = await this.checkUsernameExists(username);
    if (exists) {
      throw new Error('username-taken');
    }

    const credentials = await confirmationResult.confirm(code);

    // Check if the user is already established, if not, create the profile
    const userRef = this.fbService.getUserRef(credentials.user.uid);
    const snapshot = await get(userRef);
    if (!snapshot.exists()) {
      await this.createRTDBProfile(
        credentials.user.uid,
        username,
        credentials.user.email || '', // In SMS Auth, email is rarely present at start
        displayName,
        credentials.user.phoneNumber || undefined
      );
    }
  }

  /**
   * Standard Sign in
   */
  public async signIn(email: string, password: string): Promise<UserCredential> {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  /**
   * Ends session and clears everything
   */
  /**
   * Ends session and clears everything
   */
  public async signOut(): Promise<void> {
    await fbSignOut(this.auth);
    this.currentUser.set(null);
  }

  /**
   * Updates the current user's profile information in RTDB.
   */
  public async updateUserProfile(updates: Partial<User>): Promise<void> {
    const user = this.currentUser();
    if (!user) throw new Error('no-user-logged-in');

    const userRef = this.fbService.getUserRef(user.uid);
    await update(userRef, updates);

    // Update local signal explicitly
    this.currentUser.set({ ...user, ...updates });
  }
}
