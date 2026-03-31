import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, Subscriber } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class VoiceRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private mediaStream: MediaStream | null = null;

  private audioLevelSubject = new BehaviorSubject<number>(0);
  private animationFrameId: number | null = null;

  private recordingSubscriber: Subscriber<Blob> | null = null;

  constructor() {}

  /**
   * Requests microphone access, initializes Web Audio for analysis, and starts MediaRecorder.
   * @throws Error if microphone access is denied or unavailable.
   */
  public async startRecording(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      return;
    }

    this.audioChunks = [];
    
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup Web Audio API for waveform analysis
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.mediaStreamSource.connect(this.analyser);
      
      this.startAudioLevelAnalysis();

      // Configure MediaRecorder (prefer webm/opus)
      const options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        // Fallback or empty options for default browser support
        this.mediaRecorder = new MediaRecorder(this.mediaStream);
      } else {
        this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
      }

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.cleanupAudioContext();
        if (this.recordingSubscriber) {
           const blob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
           this.recordingSubscriber.next(blob);
           this.recordingSubscriber.complete();
           this.recordingSubscriber = null;
        }
        this.audioChunks = [];
      };

      this.mediaRecorder.start(100); // collect 100ms chunks

    } catch (err) {
      console.error('Failed to start recording:', err);
      this.cleanupAudioContext();
      throw err;
    }
  }

  /**
   * Returns an Observable of the real-time audio level (0 to 1 approx).
   */
  public getAudioLevel(): Observable<number> {
    return this.audioLevelSubject.asObservable();
  }

  /**
   * Stops the recording and triggers the emission of the final Blob.
   * Returns an Observable that will resolve with the audio Blob.
   */
  public stopRecording(): Observable<Blob> {
    return new Observable<Blob>((subscriber) => {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.recordingSubscriber = subscriber;
        this.mediaRecorder.stop();
      } else {
        subscriber.error(new Error('Recorder is not active.'));
      }
    });
  }

  /**
   * Cancels the recording without emitting the blob.
   */
  public cancelRecording(): void {
    if (this.recordingSubscriber) {
      this.recordingSubscriber.error(new Error('Recording cancelled'));
      this.recordingSubscriber = null;
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      // Overriding onstop so no blob is emitted after cancel
      this.mediaRecorder.onstop = () => {
        this.cleanupAudioContext();
        this.audioChunks = [];
      };
      this.mediaRecorder.stop();
    } else {
      this.cleanupAudioContext();
    }
  }

  /**
   * Polls the AnalyserNode and pushes RMS / amplitude values to the BehaviorSubject.
   */
  private startAudioLevelAnalysis() {
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateLevel = () => {
      if (!this.analyser) return;
      
      this.analyser.getByteFrequencyData(dataArray);
      
      // Calculate average roughly
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      
      const average = sum / bufferLength;
      // Normalize between 0 and 1, max is 255
      let level = average / 255.0;
      // Apply a smooth curve / multiplier for visibility
      level = Math.min(1.0, level * 1.5); 
      
      this.audioLevelSubject.next(level);
      this.animationFrameId = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }

  /**
   * Closes tracks and cleans memory.
   */
  private cleanupAudioContext() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.audioLevelSubject.next(0);

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }
}
