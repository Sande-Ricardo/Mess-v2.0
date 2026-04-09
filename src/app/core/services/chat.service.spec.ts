import { TestBed } from '@angular/core/testing';
import { ChatService } from './chat.service';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';
import { CryptoService } from './crypto.service';

describe('ChatService', () => {
  let service: ChatService;

  const mockAuthService = {
    currentUser: jasmine.createSpy('currentUser').and.returnValue({ uid: 'user_a' })
  };

  const mockFirebaseService = {
    rootRef: {},
    auth: {}
  };

  const mockCryptoService = {
    deriveKeyFromMnemonic: jasmine.createSpy('deriveKeyFromMnemonic').and.returnValue(Promise.resolve({} as CryptoKey)),
    encryptData: jasmine.createSpy('encryptData').and.callFake(async (data) => `encrypted_${data}`),
    decryptData: jasmine.createSpy('decryptData').and.callFake(async (data) => data.replace('encrypted_', ''))
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ChatService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: FirebaseService, useValue: mockFirebaseService },
        { provide: CryptoService, useValue: mockCryptoService }
      ]
    });
    service = TestBed.inject(ChatService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    expect(mockCryptoService.deriveKeyFromMnemonic).toHaveBeenCalled();
  });

  it('should generate a predictable conversation ID regardless of arg order', () => {
    const id1 = service.generateConversationId('user_a', 'user_b');
    const id2 = service.generateConversationId('user_b', 'user_a');
    expect(id1).toEqual('user_a_user_b');
    expect(id1).toEqual(id2);
  });

  // DB functions are external, unit testing focuses on service isolated logic.
});
