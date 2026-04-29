import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebRTCService } from '../../../core/services/webrtc.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { get, child } from '@angular/fire/database';

@Component({
  selector: 'app-incoming-call-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './incoming-call-modal.component.html',
  styleUrl: './incoming-call-modal.component.scss'
})
export class IncomingCallModalComponent {
  public readonly webrtcService = inject(WebRTCService);
  private readonly fbService = inject(FirebaseService);

  public callerName = signal<string>('Unknown Caller');
  public callerAvatar = signal<string | null>(null);
  public isAccepting = signal(false);

  constructor() {
    effect(() => {
      const call = this.webrtcService.incomingCall();
      if (call) {
        this.fetchCallerDetails(call.caller);
      } else {
        // Reset state when call ends/is cleared
        this.isAccepting.set(false);
      }
    });
  }

  private async fetchCallerDetails(uid: string) {
    try {
      const snapshot = await get(child(this.fbService.usersRef, uid));
      if (snapshot.exists()) {
        const user = snapshot.val();
        this.callerName.set(user.displayName || user.username || 'Unknown Caller');
        this.callerAvatar.set(user.photoURL || null);
      }
    } catch (e) {
      console.error('Failed to fetch caller details', e);
    }
  }

  public get avatarChar(): string {
    const name = this.callerName();
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  public async acceptCall() {
    const call = this.webrtcService.incomingCall();
    if (!call) return;
    
    this.isAccepting.set(true);
    try {
      await this.webrtcService.answerCall(call.callId);
      // Wait for ActiveCallComponent to render and clear this via routing or state
      this.webrtcService.incomingCall.set(null); 
    } catch (e) {
      console.error('Failed to accept call', e);
      this.isAccepting.set(false);
    }
  }

  public async declineCall() {
    const call = this.webrtcService.incomingCall();
    if (!call) return;
    
    try {
      await this.webrtcService.declineCall(call.callId);
      this.webrtcService.incomingCall.set(null);
    } catch (e) {
      console.error('Failed to decline call', e);
    }
  }
}
