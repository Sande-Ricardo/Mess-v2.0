import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { SessionService } from '../../../core/services/session.service';
import { Router, RouterLink, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ElementRef } from '@angular/core';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockSessionService: jasmine.SpyObj<SessionService>;
  let mockRouter: Router;

  beforeEach(async () => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['signIn']);
    mockSessionService = jasmine.createSpyObj('SessionService', [
      'generateQRToken',
      'createPendingSession',
      'listenToPendingSession',
      'stopListeningToPendingSession',
      'simulateMobileScan'
    ]);
    // We will inject the real Router from provideRouter and spy on it
    // mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [LoginComponent, ReactiveFormsModule],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: SessionService, useValue: mockSessionService },
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    mockRouter = TestBed.inject(Router);
    spyOn(mockRouter, 'navigate');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have an invalid form initially', () => {
    expect(component.loginForm.invalid).toBeTrue();
  });

  it('should call authService.signIn on valid form submit', async () => {
    component.loginForm.patchValue({ email: 'test@test.com', password: 'password123' });
    mockAuthService.signIn.and.returnValue(Promise.resolve({} as any));

    await component.onSubmit();

    expect(mockAuthService.signIn).toHaveBeenCalledWith('test@test.com', 'password123');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
  });

  it('should show error message when signIn fails', async () => {
    component.loginForm.patchValue({ email: 'test@test.com', password: 'password123' });
    mockAuthService.signIn.and.returnValue(Promise.reject(new Error('Invalid credentials')));

    await component.onSubmit();

    expect(component.errorMessage()).toBe('Invalid credentials');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should initialize QR session on toggle', fakeAsync(() => {
    mockSessionService.generateQRToken.and.returnValue('mocked-uuid');
    mockSessionService.listenToPendingSession.and.returnValue(of({ status: 'confirmed', createdAt: 123 }));
    mockSessionService.createPendingSession.and.returnValue(Promise.resolve());

    component.qrCanvas = { nativeElement: document.createElement('canvas') } as ElementRef;

    component.toggleLoginMethod();
    tick(100);

    expect(component.loginMethod()).toBe('qr');
    expect(mockSessionService.generateQRToken).toHaveBeenCalled();
    expect(mockSessionService.createPendingSession).toHaveBeenCalledWith('mocked-uuid');
    
    // We expect it to navigate since the mocked observable returns 'confirmed' immediately
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
  }));
});
