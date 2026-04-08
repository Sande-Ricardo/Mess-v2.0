import { TestBed } from '@angular/core/testing';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CryptoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should generate a 12-word mnemonic', async () => {
    // Mock the wordlist fetch
    const mockWordlist = Array.from({ length: 2048 }, (_, i) => `word${i}`);
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify(mockWordlist), {
        status: 200,
        headers: { 'Content-type': 'application/json' }
      }))
    );

    const mnemonic = await service.generateMnemonic();
    const words = mnemonic.split(' ');
    
    expect(words.length).toBe(12);
    words.forEach(word => {
      expect(mockWordlist).toContain(word);
    });
  });

  it('should derive key, encrypt and decrypt correctly', async () => {
    const testMnemonic = 'test test test test test test test test test test test test';
    const testText = 'Hello E2E World!';

    const key = await service.deriveKeyFromMnemonic(testMnemonic);
    expect(key).toBeTruthy();

    const encrypted = await service.encryptData(testText, key);
    expect(encrypted).toContain(':');
    expect(encrypted).not.toEqual(testText);

    const decrypted = await service.decryptData(encrypted, key);
    expect(decrypted).toEqual(testText);
  });
});
