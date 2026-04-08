import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { Auth } from '@angular/fire/auth';
import { FirebaseService } from './firebase.service';
import { of } from 'rxjs';

describe('AuthService', () => {
  let service: AuthService;

  const mockAuth = {
    currentUser: null,
  };

  const mockFirebaseService = {
    rootRef: {},
    getUserRef: jasmine.createSpy('getUserRef').and.returnValue({})
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Auth, useValue: mockAuth },
        { provide: FirebaseService, useValue: mockFirebaseService }
      ]
    });
    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with null currentUser', () => {
    expect(service.currentUser()).toBeNull();
  });
});
