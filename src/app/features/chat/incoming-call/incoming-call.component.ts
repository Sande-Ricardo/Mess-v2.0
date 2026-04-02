import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebRTCService, IncomingCallPayload } from '../../../core/services/webrtc.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { get, child } from '@angular/fire/database';

@Component({
  selector: 'app-incoming-call',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './incoming-call.component.html',
  styleUrl: './incoming-call.component.scss'
})
export class IncomingCallComponent {
  private webrtcService = inject(WebRTCService);
  private fbService = inject(FirebaseService);

  public callerName = signal<string>('Unknown User');
  public isVisible = signal<boolean>(false);
  public currentCall = signal<IncomingCallPayload | null>(null);

  private ringtoneAudio = new Audio(); // Muted or silent base for MVP without actual mp3 file overhead unless required

  constructor() {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }

    // Effect on incoming signals
    effect(() => {
      const call = this.webrtcService.incomingCall();
      if (call) {
        this.currentCall.set(call);
        this.isVisible.set(true);
        this.resolveCallerName(call.caller);
        this.notifySystem(call);
        this.playRingtone();
      } else {
        this.isVisible.set(false);
        this.currentCall.set(null);
        this.stopRingtone();
      }
    });
  }

  private async resolveCallerName(uid: string) {
    try {
      const snap = await get(child(this.fbService.rootRef, `users/${uid}/displayName`));
      if (snap.exists()) {
        this.callerName.set(snap.val());
      }
    } catch {
       // fallback
    }
  }

  private notifySystem(call: IncomingCallPayload) {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('Incoming Call', {
        body: `Incoming ${call.type} call...`,
        icon: '/assets/icons/call.png' // Default mock route
      });
    }
  }

  private playRingtone() {
    try {
       // If tracking actual MP3: this.ringtoneAudio.src = 'assets/ringtone.mp3';
       // this.ringtoneAudio.loop = true;
       // this.ringtoneAudio.play();
    } catch(e) {
       console.log("Audio playback requires user interaction layer");
    }
  }

  private stopRingtone() {
    this.ringtoneAudio.pause();
    this.ringtoneAudio.currentTime = 0;
  }

  public answer() {
    const call = this.currentCall();
    if (call) {
       this.webrtcService.answerCall(call.callId);
    }
    this.isVisible.set(false);
    this.stopRingtone();
  }

  public decline() {
    const call = this.currentCall();
    if (call) {
       this.webrtcService.declineCall(call.callId);
    }
    this.isVisible.set(false);
    this.stopRingtone();
  }
}
