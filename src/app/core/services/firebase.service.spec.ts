import { TestBed } from '@angular/core/testing';
import { FirebaseService } from './firebase.service';
import { Database } from '@angular/fire/database';
import { Auth } from '@angular/fire/auth';

describe('FirebaseService', () => {
  let service: FirebaseService;

  const mockDatabase = {
    app: {
      name: '[DEFAULT]',
      options: {}
    },
    type: 'database'
  };

  const mockAuth = {
    currentUser: null,
    updateCurrentUser: jasmine.createSpy('updateCurrentUser')
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FirebaseService,
        { provide: Database, useValue: mockDatabase },
        { provide: Auth, useValue: mockAuth }
      ]
    });
    service = TestBed.inject(FirebaseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should exposed injected auth', () => {
    expect(service.auth).toBeTruthy();
    expect(service.auth).toBe(mockAuth as any);
  });

  // It's tricky to unit test ref() from Firebase natively without a real initialized app,
  // but we can try calling the getters and see if they throw or return an object.
  // Generally, purely wrapper services are tested just for creation and injection correctness.
});
