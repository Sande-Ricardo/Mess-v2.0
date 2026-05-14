import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SessionService } from '../../../core/services/session.service';

import { AppLogoComponent } from '../../../shared/components/logo/logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AppLogoComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);

  public loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  public errorMessage = signal<string | null>(null);
  public isLoading = signal<boolean>(false);
  public isGoogleLoading = signal<boolean>(false);

  public async onGoogleLogin() {
    this.isGoogleLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { isNewUser } = await this.authService.signInWithGoogle();
      if (isNewUser) {
        this.router.navigate(['/auth/setup-username']);
      } else {
        this.router.navigate(['/']);
      }
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Google Login failed.');
    } finally {
      this.isGoogleLoading.set(false);
    }
  }

  public async onSubmit() {
    if (this.loginForm.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { email, password } = this.loginForm.getRawValue();
      await this.authService.signIn(email!, password!);
      this.router.navigate(['/']); // Navigate to main chat app
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') {
        this.errorMessage.set('Incorrect credentials. If you registered your account with Google (or linked it), please use the "Continue with Google" button.');
      } else {
        this.errorMessage.set(err.message || 'Login failed.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
