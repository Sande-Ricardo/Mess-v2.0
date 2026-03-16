import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { map, take } from 'rxjs';

/**
 * Ensures a user is fully authenticated before jumping to private routes.
 * Utilizes AngularFire authState observable resolving exactly once.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  return authState(auth).pipe(
    take(1),
    map(user => {
      if (user) {
        return true;
      } else {
        // Redirection to the base auth/login routing block. Adjust later if needed.
        return router.createUrlTree(['/auth/login']);
      }
    })
  );
};
