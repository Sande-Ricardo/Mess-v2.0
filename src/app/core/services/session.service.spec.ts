import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';
import { FirebaseService } from './firebase.service';
import { Database } from '@angular/fire/database';

describe('SessionService', () => {
  let service: SessionService;
  
  const mockDatabase = {};

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SessionService,
        {
           provide: FirebaseService,
           useValue: {
             rootRef: 'mockRootRef',
           }
        },
        { provide: Database, useValue: mockDatabase }
      ]
    });
    service = TestBed.inject(SessionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should generate UUID v4 looking QR Token', () => {
    const token = service.generateQRToken();
    expect(token).toBeTruthy();
    // basic regex for UUIDv4
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(token)).toBeTrue();
  });

  // DB operations like createPendingSession depend on firebase/database specific functions (set, child, etc).
  // Mocking them deeply can be extremely verbose, so standard practice in pure unit tests 
  // is to verify the deterministic methods, and let integration tests handle DB writes.
});
