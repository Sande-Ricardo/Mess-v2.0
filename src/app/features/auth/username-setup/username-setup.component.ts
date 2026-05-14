import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { AuthService } from '../../../core/services/auth.service';
import { AppLogoComponent } from '../../../shared/components/logo/logo.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-username-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, AppLogoComponent],
  templateUrl: './username-setup.component.html',
  styleUrl: './username-setup.component.scss'
})
export class UsernameSetupComponent {
  private readonly auth = inject(Auth);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  public firebaseUser$ = user(this.auth);
  public username = signal('');
  public isLoading = signal(false);
  public error = signal<string | null>(null);

  async onFinish() {
    const fbUser = await firstValueFrom(this.firebaseUser$);

    if (!fbUser || !this.username().trim()) {
      this.error.set('Authentication error. Please try again.');
      return;
    }

    const cleanUsername = this.username().trim().toLowerCase();
    if (cleanUsername.length < 3) {
      this.error.set('Username must be at least 3 characters.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    try {
      await this.authService.finalizeGoogleRegistration(
        fbUser.uid,
        cleanUsername,
        fbUser.email || '',
        fbUser.displayName || 'Mess User'
      );
      this.router.navigate(['/']);
    } catch (err: any) {
      if (err.message === 'username-taken') {
        this.error.set('This username is already taken.');
      } else {
        this.error.set('Failed to save profile. Please try again.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
