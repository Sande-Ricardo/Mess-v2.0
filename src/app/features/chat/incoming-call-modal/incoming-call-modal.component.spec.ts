import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { IncomingCallModalComponent } from './incoming-call-modal.component';
import { WebRTCService } from '../../../core/services/webrtc.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { signal } from '@angular/core';

describe('IncomingCallModalComponent', () => {
  let component: IncomingCallModalComponent;
  let fixture: ComponentFixture<IncomingCallModalComponent>;
  let mockWebRTCService: any;
  let mockFirebaseService: any;

  beforeEach(async () => {
    mockWebRTCService = {
      incomingCall: signal<any>(null),
      answerCall: jasmine.createSpy('answerCall').and.returnValue(Promise.resolve()),
      declineCall: jasmine.createSpy('declineCall').and.returnValue(Promise.resolve())
    };

    mockFirebaseService = {
      usersRef: {}
    };

    await TestBed.configureTestingModule({
      imports: [IncomingCallModalComponent],
      providers: [
        { provide: WebRTCService, useValue: mockWebRTCService },
        { provide: FirebaseService, useValue: mockFirebaseService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IncomingCallModalComponent);
    component = fixture.componentInstance;
    spyOn<any>(component, 'fetchCallerDetails'); // Prevent Firebase calls in test
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show the overlay when incomingCall signal is populated', () => {
    expect(fixture.nativeElement.querySelector('.incoming-call-overlay')).toBeNull();
    
    mockWebRTCService.incomingCall.set({ callId: 'call123', caller: 'user1', type: 'video' });
    fixture.detectChanges();
    
    const overlay = fixture.nativeElement.querySelector('.incoming-call-overlay');
    expect(overlay).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.call-type').textContent).toContain('Video');
  });

  it('should call acceptCall and clear the signal on success', fakeAsync(() => {
    mockWebRTCService.incomingCall.set({ callId: 'call123', caller: 'user1', type: 'voice' });
    fixture.detectChanges();
    
    component.acceptCall();
    expect(component.isAccepting()).toBeTrue();
    expect(mockWebRTCService.answerCall).toHaveBeenCalledWith('call123');
    
    tick(); // wait for promise
    
    expect(mockWebRTCService.incomingCall()).toBeNull();
  }));

  it('should call declineCall and clear the signal on success', fakeAsync(() => {
    mockWebRTCService.incomingCall.set({ callId: 'call123', caller: 'user1', type: 'voice' });
    fixture.detectChanges();
    
    component.declineCall();
    expect(mockWebRTCService.declineCall).toHaveBeenCalledWith('call123');
    
    tick(); // wait for promise
    
    expect(mockWebRTCService.incomingCall()).toBeNull();
  }));
});
