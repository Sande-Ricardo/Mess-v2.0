import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { CryptoService } from '../../../core/services/crypto.service';

import { AppLogoComponent } from '../../../shared/components/logo/logo.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AppLogoComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly cryptoService = inject(CryptoService);
  private readonly router = inject(Router);

  public step = signal<1 | 2 | 3 | 4>(1); // Step 4 is confirmation
  public isLoading = signal<boolean>(false);
  public errorMessage = signal<string | null>(null);

  // Recovery phrase
  public mnemonic = signal<string | null>(null);

  // Forms for each step
  public step1Form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  public step2Form = this.fb.group({
    otp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
  });

  public step3Form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20), Validators.pattern('^[a-zA-Z0-9]+$')]],
    displayName: ['', [Validators.required, Validators.maxLength(50)]]
  });

  // OTP Countdown
  public countdown = signal<number>(60);
  private intervalFn: any;

  // Username validation
  public usernameAvailable = signal<boolean | null>(null);
  public isCheckingUsername = signal<boolean>(false);
  private usernameSubject = new Subject<string>();

  constructor() {
    this.usernameSubject.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(async (username) => {
      if (this.step3Form.get('username')?.invalid) {
        this.usernameAvailable.set(null);
        return;
      }
      this.isCheckingUsername.set(true);
      try {
        const exists = await this.authService.checkUsernameExists(username);
        this.usernameAvailable.set(!exists);
      } catch (e) {
        this.usernameAvailable.set(null);
      } finally {
        this.isCheckingUsername.set(false);
      }
    });

    // Detect username changes
    this.step3Form.get('username')?.valueChanges.subscribe(value => {
      this.usernameAvailable.set(null);
      if (value) {
        this.usernameSubject.next(value);
      }
    });
  }

  public async onSubmitStep1() {
    if (this.step1Form.invalid) return;
    // Firebase Auth natively uses passwords or email links, not 6-digit email OTPs.
    // Therefore, we skip the OTP step (Step 2) for the email flow and go straight to profile creation.
    this.errorMessage.set(null);
    this.step.set(3);
  }

  public onSubmitStep2() {
    if (this.step2Form.invalid) return;
    clearInterval(this.intervalFn);
    this.errorMessage.set(null);
    this.step.set(3);
  }

  public async onSubmitStep3() {
    if (this.step3Form.invalid || this.usernameAvailable() === false) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.step1Form.getRawValue();
    const { username, displayName } = this.step3Form.getRawValue();

    try {
      // Execute the actual Firebase Registration here
      await this.authService.registerWithEmail(email!, password!, username!, displayName!);

      // Generate E2E Recovery Phrase
      const phrase = await this.cryptoService.generateMnemonic();
      this.mnemonic.set(phrase);

      this.step.set(4); // Move to final confirmation screen
    } catch (err: any) {
      if (err.message === 'username-taken') {
        this.errorMessage.set('Username is already taken. Please choose another.');
        this.usernameAvailable.set(false);
      } else {
        this.errorMessage.set(err.message || 'Registration failed.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  public finishRegistration() {
    // Navigates to app after the user acknowledges they saved the phrase
    this.router.navigate(['/']);
  }

  private startCountdown() {
    this.countdown.set(60);
    this.intervalFn = setInterval(() => {
      this.countdown.update(c => c - 1);
      if (this.countdown() <= 0) {
        clearInterval(this.intervalFn);
      }
    }, 1000);
  }

  public resendCode() {
    if (this.countdown() === 0) {
      this.startCountdown();
      // Logic to resend would go here
    }
  }
}
