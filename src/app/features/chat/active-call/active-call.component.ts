import { Component, Directive, ElementRef, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebRTCService } from '../../../core/services/webrtc.service';

@Directive({
  selector: '[appMediaStream]',
  standalone: true
})
export class MediaStreamDirective {
  private el = inject(ElementRef);
  
  @Input() set appMediaStream(stream: MediaStream | null | undefined) {
    if (this.el.nativeElement) {
      this.el.nativeElement.srcObject = stream || null;
    }
  }
}

@Component({
  selector: 'app-active-call',
  standalone: true,
  imports: [CommonModule, MediaStreamDirective],
  templateUrl: './active-call.component.html',
  styleUrl: './active-call.component.scss'
})
export class ActiveCallComponent {
  public webrtcService = inject(WebRTCService);

  public isAudioMuted = signal(false);
  public isVideoMuted = signal(false);

  public toggleAudio() {
    const isMuted = !this.webrtcService.toggleAudio();
    this.isAudioMuted.set(isMuted);
  }

  public toggleVideo() {
    const isMuted = !this.webrtcService.toggleVideo();
    this.isVideoMuted.set(isMuted);
  }

  public endCall() {
    if (this.webrtcService.currentCallId) {
      this.webrtcService.endCall(this.webrtcService.currentCallId);
    } else {
      this.webrtcService.cleanup();
    }
  }
}
