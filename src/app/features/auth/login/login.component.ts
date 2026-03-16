import { Component, inject, signal, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SessionService, PendingSession } from '../../../core/services/session.service';
import { Subscription } from 'rxjs';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);

  @ViewChild('qrCanvas', { static: false }) qrCanvas!: ElementRef<HTMLCanvasElement>;

  public loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  public errorMessage = signal<string | null>(null);
  public isLoading = signal<boolean>(false);
  
  // QR State
  public loginMethod = signal<'email' | 'qr'>('email');
  public currentQRToken = signal<string | null>(null);
  private qrSubscription?: Subscription;

  ngOnDestroy() {
    this.cleanupQRSession();
  }

  public toggleLoginMethod() {
    this.loginMethod.update(m => m === 'email' ? 'qr' : 'email');
    if (this.loginMethod() === 'qr') {
      this.initQRSession();
    } else {
      this.cleanupQRSession();
    }
  }

  private async initQRSession() {
    this.errorMessage.set(null);
    try {
      const token = this.sessionService.generateQRToken();
      this.currentQRToken.set(token);
      
      await this.sessionService.createPendingSession(token);
      
      // Delay canvas drawing slightly so *ngIf/ViewChild catches up
      setTimeout(() => {
        if (this.qrCanvas?.nativeElement) {
          QRCode.toCanvas(this.qrCanvas.nativeElement, token, {
            width: 250,
            color: { dark: '#ffffff', light: '#00000000' } // White QR on transparent bg
          }, (error) => {
            if (error) console.error('QR rendering failed', error);
          });
        }
      }, 50);

      this.qrSubscription = this.sessionService.listenToPendingSession(token).subscribe((session: PendingSession | null) => {
        if (session && session.status === 'confirmed') {
          // Success! User confirmed from Mobile
          this.cleanupQRSession();
          // Mock login for MVP web visualization (since we can't mint custom tokens securely here)
          console.log(`QR Session Confirmed! Logging in user: ${session.uid}`);
          this.router.navigate(['/']); 
        }
      });
    } catch (err: any) {
      this.errorMessage.set('Failed to initiate QR session.');
    }
  }

  private cleanupQRSession() {
    if (this.qrSubscription) {
      this.qrSubscription.unsubscribe();
    }
    if (this.currentQRToken()) {
      this.sessionService.stopListeningToPendingSession(this.currentQRToken()!);
      this.currentQRToken.set(null);
    }
  }

  public async simulateMobileScan() {
    const token = this.currentQRToken();
    if (token) {
      this.isLoading.set(true);
      await this.sessionService.simulateMobileScan(token, 'mock-simulated-user-id');
      this.isLoading.set(false);
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
      this.errorMessage.set(err.message || 'Login failed.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
