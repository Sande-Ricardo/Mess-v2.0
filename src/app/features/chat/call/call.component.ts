import { Component, effect, HostListener, inject, ElementRef, ViewChild, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { WebRTCService } from '../../../core/services/webrtc.service';

@Component({
  selector: 'app-call',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './call.component.html',
  styleUrl: './call.component.scss'
})
export class CallComponent implements OnInit, OnDestroy {
  public webrtcService = inject(WebRTCService);

  @ViewChild('remoteVideo') remoteVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;

  public isMuted = signal<boolean>(false);
  public isVideoOff = signal<boolean>(false);
  public timer = signal<string>('00:00');

  public isVisible = signal<boolean>(false);
  
  private intervalId: any;
  private secondsElapsed = 0;

  constructor() {
    effect(() => {
      const local = this.webrtcService.localStream();
      const remote = this.webrtcService.remoteStream();

      // Show floating UI when either stream becomes solidly available 
      if (local || remote) {
         if (!this.isVisible()) {
            this.isVisible.set(true);
            this.startTimer();
         }
      } else {
         this.isVisible.set(false);
         this.stopTimer();
      }

      // Rebind tracks cleanly
      setTimeout(() => {
        if (this.localVideo && this.localVideo.nativeElement && local) {
           this.localVideo.nativeElement.srcObject = local;
        }
        if (this.remoteVideo && this.remoteVideo.nativeElement && remote) {
           this.remoteVideo.nativeElement.srcObject = remote;
        }
      }, 0);
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.stopTimer();
  }

  // Keyboard Shortcuts
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (!this.isVisible()) return;

    if (event.ctrlKey && event.key.toLowerCase() === 'm') {
      event.preventDefault();
      this.toggleMute();
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'w') {
      event.preventDefault();
      this.hangup();
    }
  }

  public toggleMute() {
    const isNowEnabled = this.webrtcService.toggleAudio();
    this.isMuted.set(!isNowEnabled);
  }

  public toggleVideo() {
    const isNowEnabled = this.webrtcService.toggleVideo();
    this.isVideoOff.set(!isNowEnabled);
  }

  public hangup() {
    // If it was ringing, this will decline, if active, it will end
    if (this.webrtcService.currentCallId) {
      this.webrtcService.endCall(this.webrtcService.currentCallId);
    } else {
      this.webrtcService.cleanup();
    }
    this.isVisible.set(false);
  }

  private startTimer() {
    this.secondsElapsed = 0;
    this.timer.set('00:00');
    this.intervalId = setInterval(() => {
      this.secondsElapsed++;
      const min = Math.floor(this.secondsElapsed / 60).toString().padStart(2, '0');
      const sec = Math.floor(this.secondsElapsed % 60).toString().padStart(2, '0');
      this.timer.set(`${min}:${sec}`);
    }, 1000);
  }

  private stopTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
