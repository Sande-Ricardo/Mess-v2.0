import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActiveCallComponent, MediaStreamDirective } from './active-call.component';
import { WebRTCService } from '../../../core/services/webrtc.service';
import { signal } from '@angular/core';

describe('ActiveCallComponent', () => {
  let component: ActiveCallComponent;
  let fixture: ComponentFixture<ActiveCallComponent>;
  let mockWebRTCService: any;

  beforeEach(async () => {
    mockWebRTCService = {
      localStream: signal<any>(null),
      remoteStream: signal<any>(null),
      currentCallId: 'call123',
      toggleAudio: jasmine.createSpy('toggleAudio').and.returnValue(false), // Returns new state
      toggleVideo: jasmine.createSpy('toggleVideo').and.returnValue(false),
      endCall: jasmine.createSpy('endCall'),
      cleanup: jasmine.createSpy('cleanup')
    };

    await TestBed.configureTestingModule({
      imports: [ActiveCallComponent, MediaStreamDirective],
      providers: [
        { provide: WebRTCService, useValue: mockWebRTCService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ActiveCallComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the overlay only when localStream is active', () => {
    expect(fixture.nativeElement.querySelector('.active-call-overlay')).toBeNull();
    
    const stream = new MediaStream();
    mockWebRTCService.localStream.set(stream);
    fixture.detectChanges();
    
    expect(fixture.nativeElement.querySelector('.active-call-overlay')).toBeTruthy();
  });

  it('should display the waiting screen when remoteStream is null', () => {
    const stream = new MediaStream();
    mockWebRTCService.localStream.set(stream);
    fixture.detectChanges();
    
    expect(fixture.nativeElement.querySelector('.waiting-screen')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.remote-video')).toBeNull();
  });

  it('should display remote video when remoteStream is active', () => {
    const stream1 = new MediaStream();
    const stream2 = new MediaStream();
    mockWebRTCService.localStream.set(stream1);
    mockWebRTCService.remoteStream.set(stream2);
    fixture.detectChanges();
    
    expect(fixture.nativeElement.querySelector('.waiting-screen')).toBeNull();
    expect(fixture.nativeElement.querySelector('.remote-video')).toBeTruthy();
  });

  it('should toggle audio correctly via service', () => {
    const stream = new MediaStream();
    mockWebRTCService.localStream.set(stream);
    fixture.detectChanges();

    component.toggleAudio();
    expect(mockWebRTCService.toggleAudio).toHaveBeenCalled();
    expect(component.isAudioMuted()).toBeTrue(); // toggleAudio mocked to return false, so !false = true
  });

  it('should call endCall on service when hangup is clicked', () => {
    const stream = new MediaStream();
    mockWebRTCService.localStream.set(stream);
    fixture.detectChanges();

    component.endCall();
    expect(mockWebRTCService.endCall).toHaveBeenCalledWith('call123');
  });
});
