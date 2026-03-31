import { Component, Input, Output, EventEmitter, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VoiceRecorderService } from '../../../core/services/voice-recorder.service';
import { CloudinaryService } from '../../../core/services/cloudinary.service';
import { ChatService } from '../../../core/services/chat.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-voice-recorder',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './voice-recorder.component.html',
  styleUrl: './voice-recorder.component.scss'
})
export class VoiceRecorderComponent implements OnInit, OnDestroy {
  @Input({ required: true }) chatContextId!: string;
  @Output() dismiss = new EventEmitter<void>();

  private voiceService = inject(VoiceRecorderService);
  private cloudinaryService = inject(CloudinaryService);
  private chatService = inject(ChatService);
  private cdr = inject(ChangeDetectorRef);

  public audioLevel = 0;
  // Initialize with 40 bars for a smooth scrolling waveform
  public bars: number[] = Array(40).fill(0.1); 
  public isUploading = false;
  public recordingTime = 0;
  
  private levelSub!: Subscription;
  private timerInterval: any;

  async ngOnInit() {
    try {
      await this.voiceService.startRecording();
      
      this.levelSub = this.voiceService.getAudioLevel().subscribe(level => {
        this.audioLevel = level;
        // Shift bars array for scrolling effect
        this.bars.shift();
        const height = Math.max(0.05, level); // minimum visual height
        this.bars.push(height);
        this.cdr.detectChanges();
      });
      
      this.timerInterval = setInterval(() => {
        this.recordingTime++;
        this.cdr.detectChanges();
      }, 1000);
      
    } catch (e) {
       console.error('Failed to initialize microphone:', e);
       this.dismiss.emit();
    }
  }

  ngOnDestroy() {
    if (this.levelSub) this.levelSub.unsubscribe();
    if (this.timerInterval) clearInterval(this.timerInterval);
    // Safety cancel just in case it wasn't gracefully stopped via confirm
    if (!this.isUploading) {
      this.voiceService.cancelRecording();
    }
  }

  public get formattedTime(): string {
    const min = Math.floor(this.recordingTime / 60).toString().padStart(2, '0');
    const sec = (this.recordingTime % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }

  public onCancel() {
    this.voiceService.cancelRecording();
    this.dismiss.emit();
  }

  public onConfirm() {
    if (this.isUploading) return;
    if (this.recordingTime < 1) {
      // Too short to send gracefully
      this.onCancel();
      return;
    }

    this.isUploading = true;
    
    // Stop recording, resolve the blob, and process
    this.voiceService.stopRecording().subscribe({
      next: (blob) => {
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        
        this.cloudinaryService.uploadFile(file, 'voice-messages').subscribe({
          next: async (res) => {
             await this.chatService.sendMessage(this.chatContextId, res.secureUrl, 'voice');
             this.dismiss.emit(); // Closes the UI after sending
          },
          error: (err) => {
             console.error('Failed to upload voice message to Cloudinary', err);
             this.isUploading = false;
             this.dismiss.emit();
          }
        });
      },
      error: (e) => {
        console.error('Stoppage error:', e);
        this.dismiss.emit();
      }
    });
  }
}
