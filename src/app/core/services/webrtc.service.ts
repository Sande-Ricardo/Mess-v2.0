import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import { child, get, off, onChildAdded, onValue, push, set, update } from '@angular/fire/database';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';

export type CallStatus = 'ringing' | 'active' | 'ended' | 'declined';
export type CallType = 'voice' | 'video';

@Injectable({
  providedIn: 'root'
})
export class WebRTCService {
  private readonly fbService = inject(FirebaseService);
  private readonly authService = inject(AuthService);

  public localStream: WritableSignal<MediaStream | null> = signal(null);
  public remoteStream: WritableSignal<MediaStream | null> = signal(null);

  private pc: RTCPeerConnection | null = null;
  public currentCallId: string | null = null;

  private iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  /**
   * Initializes the RTCPeerConnection, retrieves hardware stream, and sets up local tracks.
   */
  private async initHardwareAndConnection(type: CallType): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video'
    });

    this.localStream.set(stream);

    this.pc = new RTCPeerConnection(this.iceServers);

    // Push local tracks to the connection
    stream.getTracks().forEach(track => {
      this.pc?.addTrack(track, stream);
    });

    // Listen for remote tracks
    this.pc.ontrack = (event) => {
      // Create a new stream or append to existing remote stream
      const currentRemote = this.remoteStream();
      if (!currentRemote) {
        this.remoteStream.set(new MediaStream([event.track]));
      } else {
        currentRemote.addTrack(event.track);
        // Force signal update if needed
        this.remoteStream.set(currentRemote);
      }
    };
  }

  /**
   * Initiates a call to a target user.
   */
  public async createCall(targetUid: string, type: CallType): Promise<string> {
    const callerId = this.authService.currentUser()?.uid;
    if (!callerId) throw new Error("Not authenticated");

    await this.initHardwareAndConnection(type);

    // Create call references
    const callRef = push(child(this.fbService.rootRef, 'calls'));
    const callId = callRef.key as string;
    this.currentCallId = callId;

    // Collect ICE Candidates from local and push to callerCandidates
    this.pc!.onicecandidate = (event) => {
      if (event.candidate) {
        push(child(this.fbService.rootRef, `calls/${callId}/callerCandidates`), event.candidate.toJSON());
      }
    };

    // Create Offer
    const offerDescription = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offerDescription);

    const callPayload = {
      caller: callerId,
      callee: targetUid,
      type: type,
      status: 'ringing',
      offer: {
        type: offerDescription.type,
        sdp: offerDescription.sdp
      }
    };

    await set(callRef, callPayload);

    // Listen for Answer
    const answerRef = child(this.fbService.rootRef, `calls/${callId}/answer`);
    onValue(answerRef, (snapshot) => {
      const data = snapshot.val();
      if (!this.pc?.currentRemoteDescription && data) {
        const answerDescription = new RTCSessionDescription(data);
        this.pc?.setRemoteDescription(answerDescription);
      }
    });

    // Listen for remote ICE Candidates
    const calleeCandidatesRef = child(this.fbService.rootRef, `calls/${callId}/calleeCandidates`);
    onChildAdded(calleeCandidatesRef, (data) => {
      if (data.exists()) {
        const candidate = new RTCIceCandidate(data.val());
        this.pc?.addIceCandidate(candidate);
      }
    });

    // Listen to status changes to handle declines
    onValue(child(this.fbService.rootRef, `calls/${callId}/status`), (snapshot) => {
      if (snapshot.val() === 'declined' || snapshot.val() === 'ended') {
        this.cleanup();
      }
    });

    return callId;
  }

  /**
   * Answers an incoming call.
   */
  public async answerCall(callId: string): Promise<void> {
    this.currentCallId = callId;

    // Read Call Data
    const callRef = child(this.fbService.rootRef, `calls/${callId}`);
    const callSnap = await get(callRef);
    if (!callSnap.exists()) throw new Error("Call not found");
    const callData = callSnap.val();

    await this.initHardwareAndConnection(callData.type);

    // Collect local ICE Candidates and push to calleeCandidates
    this.pc!.onicecandidate = (event) => {
      if (event.candidate) {
        push(child(this.fbService.rootRef, `calls/${callId}/calleeCandidates`), event.candidate.toJSON());
      }
    };

    // Set Remote Description (Caller's Offer)
    const offerDescription = callData.offer;
    await this.pc!.setRemoteDescription(new RTCSessionDescription(offerDescription));

    // Create Answer
    const answerDescription = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answerDescription);

    const answerPayload = {
      type: answerDescription.type,
      sdp: answerDescription.sdp
    };

    await update(callRef, {
      answer: answerPayload,
      status: 'active'
    });

    // Listen for remote ICE candidates (Caller's Candidates)
    const callerCandidatesRef = child(this.fbService.rootRef, `calls/${callId}/callerCandidates`);
    onChildAdded(callerCandidatesRef, (data) => {
      if (data.exists()) {
        const candidate = new RTCIceCandidate(data.val());
        this.pc?.addIceCandidate(candidate);
      }
    });

    // Listen to status changes for remote hangup
    onValue(child(this.fbService.rootRef, `calls/${callId}/status`), (snapshot) => {
      if (snapshot.val() === 'ended') {
        this.cleanup();
      }
    });
  }

  /**
   * Declines a ringing call.
   */
  public async declineCall(callId: string): Promise<void> {
    const callRef = child(this.fbService.rootRef, `calls/${callId}`);
    await update(callRef, { status: 'declined' });
  }

  /**
   * Ends an active call.
   */
  public async endCall(callId: string): Promise<void> {
    const callRef = child(this.fbService.rootRef, `calls/${callId}`);
    await update(callRef, { status: 'ended' });
    this.cleanup();
  }

  /**
   * Tears down connections and cleans memory.
   */
  public cleanup() {
    if (this.currentCallId) {
      // Detach listeners from RTDB to prevent ghost updates
      off(child(this.fbService.rootRef, `calls/${this.currentCallId}/answer`));
      off(child(this.fbService.rootRef, `calls/${this.currentCallId}/callerCandidates`));
      off(child(this.fbService.rootRef, `calls/${this.currentCallId}/calleeCandidates`));
      off(child(this.fbService.rootRef, `calls/${this.currentCallId}/status`));
      this.currentCallId = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    const currentLocal = this.localStream();
    if (currentLocal) {
      currentLocal.getTracks().forEach(t => t.stop());
      this.localStream.set(null);
    }

    if (this.remoteStream()) {
      this.remoteStream()!.getTracks().forEach(t => t.stop());
      this.remoteStream.set(null);
    }
  }
}
