import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ChatWindowComponent } from './chat-window.component';
import { WebRTCService } from '../../../core/services/webrtc.service';
import { ChatService } from '../../../core/services/chat.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { GroupService } from '../../../core/services/group.service';
import { PresenceService } from '../../../core/services/presence.service';
import { AuthService } from '../../../core/services/auth.service';
import { CloudinaryService } from '../../../core/services/cloudinary.service';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';

describe('ChatWindowComponent (WebRTC Integration)', () => {
  let component: ChatWindowComponent;
  let fixture: ComponentFixture<ChatWindowComponent>;
  let mockWebRTCService: any;
  let mockAuthService: any;
  let mockPresenceService: any;
  let mockChatService: any;

  beforeEach(async () => {
    mockWebRTCService = {
      createCall: jasmine.createSpy('createCall').and.returnValue(Promise.resolve())
    };

    mockAuthService = {
      currentUser: signal({ uid: 'myuid' }),
      getUserById: jasmine.createSpy('getUserById').and.returnValue(Promise.resolve({ uid: 'otheruid', username: 'other_user' }))
    };

    mockPresenceService = {
      getTypingUsers: jasmine.createSpy('getTypingUsers').and.returnValue(of([])),
      getOnlineStatus: jasmine.createSpy('getOnlineStatus').and.returnValue(of(true)),
      stopListeningOnlineStatus: jasmine.createSpy('stopListeningOnlineStatus'),
      setTyping: jasmine.createSpy('setTyping')
    };

    mockChatService = {
      getMessages: jasmine.createSpy('getMessages').and.returnValue(of([]))
    };

    await TestBed.configureTestingModule({
      imports: [ChatWindowComponent],
      providers: [
        { provide: WebRTCService, useValue: mockWebRTCService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: PresenceService, useValue: mockPresenceService },
        { provide: ChatService, useValue: mockChatService },
        { provide: FirebaseService, useValue: { rootRef: {} } },
        { provide: GroupService, useValue: {} },
        { provide: CloudinaryService, useValue: {} },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatWindowComponent);
    component = fixture.componentInstance;
    
    spyOn<any>(component, 'resolveContactName').and.returnValue(Promise.resolve());
    
    // Set required input
    fixture.componentRef.setInput('convId', 'myuid_otheruid');
    
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start an audio call with the correct target user', fakeAsync(() => {
    component.startAudioCall();
    expect(component.isConnectingCall).toBeTrue();
    
    tick(); // wait for createCall
    
    expect(mockWebRTCService.createCall).toHaveBeenCalledWith('otheruid', 'voice');
    expect(component.isConnectingCall).toBeFalse();
  }));

  it('should start a video call with the correct target user', fakeAsync(() => {
    component.startVideoCall();
    expect(component.isConnectingCall).toBeTrue();
    
    tick(); // wait for createCall
    
    expect(mockWebRTCService.createCall).toHaveBeenCalledWith('otheruid', 'video');
    expect(component.isConnectingCall).toBeFalse();
  }));

  it('should not allow calls in group chats (current implementation restriction)', fakeAsync(() => {
    fixture.componentRef.setInput('convId', 'grp_123');
    fixture.detectChanges();
    
    component.startAudioCall();
    expect(mockWebRTCService.createCall).not.toHaveBeenCalled();
    expect(component.isConnectingCall).toBeFalse();
  }));

  it('should handle call initiation errors gracefully', fakeAsync(() => {
    mockWebRTCService.createCall.and.returnValue(Promise.reject('Hardware error'));
    spyOn(console, 'error');
    
    component.startAudioCall();
    tick();
    
    expect(console.error).toHaveBeenCalledWith('Failed to initiate call', 'Hardware error');
    expect(component.isConnectingCall).toBeFalse();
  }));
});
