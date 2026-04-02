import { Injectable, inject, signal } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import { WebRTCService } from './webrtc.service';
import { child, get, onChildAdded, onValue, push, ref, set, remove, off } from '@angular/fire/database';

@Injectable({
  providedIn: 'root'
})
export class GroupCallService {
  private readonly fbService = inject(FirebaseService);
  private readonly authService = inject(AuthService);

  // Exposing a massive merged stream or individual streams for a UI is complex. 
  // For MVP mesh network, we merge all incoming audio tracks into one stream.
  public groupMixedStream = signal<MediaStream | null>(null);
  
  private peers = new Map<string, RTCPeerConnection>();
  private localStream: MediaStream | null = null;
  private currentGroupId: string | null = null;

  private iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  /**
   * Connects to a group call using a mesh topology (P2P with everyone).
   */
  public async joinGroupCall(groupId: string): Promise<void> {
    const myUid = this.authService.currentUser()?.uid;
    if (!myUid) throw new Error("Unauthenticated");

    this.currentGroupId = groupId;

    // Get hardware
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); // Voice group call as per spec
    
    // Register as participant
    const myParticipantRef = child(this.fbService.rootRef, `group-calls/${groupId}/participants/${myUid}`);
    await set(myParticipantRef, true);

    // Initial fetch of existing participants missing us
    const participantsRef = child(this.fbService.rootRef, `group-calls/${groupId}/participants`);
    const snap = await get(participantsRef);
    if (snap.exists()) {
       const uids = Object.keys(snap.val());
       for (const uid of uids) {
          if (uid !== myUid) {
             await this.createPeerConnection(groupId, myUid, uid, true);
          }
       }
    }

    // Listen for NEW signals targeted directly at myUid
    const mySignalsRef = child(this.fbService.rootRef, `group-calls/${groupId}/signals/${myUid}`);
    onChildAdded(mySignalsRef, async (snapshot) => {
       const signalPayload = snapshot.val();
       const senderUid = signalPayload.sender;

       if (signalPayload.type === 'offer') {
          // Received an offer from a newly joined peer
          await this.handleOffer(groupId, myUid, senderUid, signalPayload);
       } else if (signalPayload.type === 'answer') {
          // Received an answer from a peer we offered to
          const pc = this.peers.get(senderUid);
          if (pc) {
             await pc.setRemoteDescription(new RTCSessionDescription(signalPayload.sdp));
          }
       } else if (signalPayload.type === 'ice') {
          const pc = this.peers.get(senderUid);
          if (pc) {
             await pc.addIceCandidate(new RTCIceCandidate(signalPayload.candidate));
          }
       }
    });

  }

  private async createPeerConnection(groupId: string, myUid: string, targetUid: string, isInitiator: boolean) {
    if (this.peers.has(targetUid)) return; // Prevent duplications

    if (this.peers.size >= 8) {
      console.warn("Max group call capacity reached");
      return; 
    }

    const pc = new RTCPeerConnection(this.iceServers);
    this.peers.set(targetUid, pc);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream!));
    }

    // Handle remote tracks binding into a unified group stream for UI simplicity
    pc.ontrack = (event) => {
       const currentStream = this.groupMixedStream();
       if (!currentStream) {
          this.groupMixedStream.set(new MediaStream([event.track]));
       } else {
          currentStream.addTrack(event.track);
          this.groupMixedStream.set(currentStream);
       }
    };

    // Relay ICE candidates
    pc.onicecandidate = (event) => {
       if (event.candidate) {
          push(child(this.fbService.rootRef, `group-calls/${groupId}/signals/${targetUid}`), {
             sender: myUid,
             type: 'ice',
             candidate: event.candidate.toJSON()
          });
       }
    };

    if (isInitiator) {
       const offer = await pc.createOffer();
       await pc.setLocalDescription(offer);
       push(child(this.fbService.rootRef, `group-calls/${groupId}/signals/${targetUid}`), {
          sender: myUid,
          type: 'offer',
          sdp: offer
       });
    }
  }

  private async handleOffer(groupId: string, myUid: string, senderUid: string, signalPayload: any) {
    if (!this.peers.has(senderUid)) {
       await this.createPeerConnection(groupId, myUid, senderUid, false);
    }
    const pc = this.peers.get(senderUid)!;
    
    await pc.setRemoteDescription(new RTCSessionDescription(signalPayload.sdp));
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    push(child(this.fbService.rootRef, `group-calls/${groupId}/signals/${senderUid}`), {
       sender: myUid,
       type: 'answer',
       sdp: answer
    });
  }

  /**
   * Leaves the mesh network and cleans up connections.
   */
  public leaveGroupCall(): void {
    if (!this.currentGroupId) return;
    const myUid = this.authService.currentUser()?.uid;

    if (myUid) {
       const myParticipantRef = child(this.fbService.rootRef, `group-calls/${this.currentGroupId}/participants/${myUid}`);
       remove(myParticipantRef); // Triggers network disconnect
       
       const mySignalsRef = child(this.fbService.rootRef, `group-calls/${this.currentGroupId}/signals/${myUid}`);
       off(mySignalsRef); // Stop listening to new signals
    }

    this.peers.forEach(pc => pc.close());
    this.peers.clear();

    if (this.localStream) {
       this.localStream.getTracks().forEach(t => t.stop());
       this.localStream = null;
    }

    this.groupMixedStream.set(null);
    this.currentGroupId = null;
  }
}
