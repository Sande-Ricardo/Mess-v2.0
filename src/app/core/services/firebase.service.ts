/**
 * Configuration Instructions:
 * 1. Navigate to the Firebase Console and select your project.
 * 2. Add a Web App to your project and copy the configuration object.
 * 3. Open src/environments/environment.ts and replace the placeholders with your actual credentials.
 * 4. Ensure you have created the Realtime Database instance in the Firebase console.
 * 5. Deploy the database.rules.json file rules to protect your database.
 */
import { Injectable, inject } from '@angular/core';
import { Database, ref } from '@angular/fire/database';
import { Auth } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {
  private readonly db: Database = inject(Database);
  public readonly auth: Auth = inject(Auth);

  /**
   * Base database reference for the root node
   */
  public get rootRef() {
    return ref(this.db);
  }

  /**
   * Base database reference for the '/users' node
   */
  public get usersRef() {
    return ref(this.db, 'users');
  }

  /**
   * Returns the database reference for a specific user node
   * @param uid The unique user identifier
   */
  public getUserRef(uid: string) {
    return ref(this.db, `users/${uid}`);
  }
}
