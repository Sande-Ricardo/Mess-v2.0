import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-voice-message',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './voice-message.component.html',
  styleUrl: './voice-message.component.scss'
})
export class VoiceMessageComponent implements OnInit, OnDestroy {
  @Input({ required: true }) audioUrl!: string;
  
  public isPlaying = false;
  public currentTime = 0;
  public duration = 0;
  public playbackRate = 1;
  public progressPercent = 0;
  
  // Create a static visual footprint for demo purposes
  public staticWaveform = Array(30).fill(0).map(() => Math.random() * 0.8 + 0.2);
  
  private audio!: HTMLAudioElement;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.audio = new Audio(this.audioUrl);
    
    this.audio.addEventListener('loadedmetadata', () => {
      // Browsers handle duration for complete blobs properly, but streaming formats (like WebM) can be infinity
      if (this.audio.duration === Infinity || isNaN(this.audio.duration)) {
        // Workaround for Chrome WebM duration bug: Jump to a huge number to force duration calculation
        this.audio.currentTime = 1e10;
        
        const getDuration = () => {
          this.audio.removeEventListener('timeupdate', getDuration);
          if (this.audio.duration !== Infinity) {
            this.duration = this.audio.duration;
          }
          this.audio.currentTime = 0; // Reset to start
          this.cdr.detectChanges();
        };
        
        this.audio.addEventListener('timeupdate', getDuration);
      } else {
        this.duration = this.audio.duration;
        this.cdr.detectChanges();
      }
    });
    
    this.audio.addEventListener('timeupdate', () => {
      // Ignore time updates if we are in the middle of fixing the duration workaround
      if (this.audio.currentTime > 1e9) return;
      
      this.currentTime = this.audio.currentTime;
      // Guard against infinity if metadata hasn't properly resolved
      if (this.duration && this.duration !== Infinity) {
         this.progressPercent = (this.currentTime / this.duration) * 100 || 0;
      }
      this.cdr.detectChanges();
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this.currentTime = 0;
      this.progressPercent = 0;
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
    }
  }

  public togglePlay(): void {
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play();
    }
    this.isPlaying = !this.isPlaying;
  }

  public toggleSpeed(): void {
    if (this.playbackRate === 1) {
      this.playbackRate = 1.5;
    } else if (this.playbackRate === 1.5) {
      this.playbackRate = 2;
    } else {
      this.playbackRate = 1;
    }
    this.audio.playbackRate = this.playbackRate;
  }

  public seek(event: MouseEvent, progressBar: HTMLElement): void {
    if (!this.duration || this.duration === Infinity) return;
    const rect = progressBar.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    this.audio.currentTime = percentage * this.duration;
  }

  public formatTime(timeInSeconds: number): string {
    if (isNaN(timeInSeconds) || !isFinite(timeInSeconds)) return '00:00';
    const min = Math.floor(timeInSeconds / 60).toString().padStart(2, '0');
    const sec = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }
}
