import { TestBed } from '@angular/core/testing';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CryptoService);
    
    // Mock the fetch call for the wordlist so tests don't make network requests
    spyOn(window, 'fetch').and.returnValue(Promise.resolve({
      json: () => Promise.resolve(Array.from({length: 2048}, (_, i) => `word${i}`))
    } as Response));
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('generateMnemonic', () => {
    it('should generate a 12-word mnemonic phrase', async () => {
      const mnemonic = await service.generateMnemonic();
      const words = mnemonic.split(' ');
      
      expect(words.length).toBe(12);
      expect(typeof mnemonic).toBe('string');
    });

    it('should generate different mnemonics on subsequent calls', async () => {
      const mnemonic1 = await service.generateMnemonic();
      const mnemonic2 = await service.generateMnemonic();
      
      expect(mnemonic1).not.toBe(mnemonic2);
    });
  });

  describe('deriveKeyFromMnemonic & Cryptography', () => {
    const testMnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
    let testKey: CryptoKey;

    beforeEach(async () => {
      testKey = await service.deriveKeyFromMnemonic(testMnemonic);
    });

    it('should derive a CryptoKey from a mnemonic', () => {
      expect(testKey).toBeDefined();
      expect(testKey.type).toBe('secret');
      expect(testKey.algorithm.name).toBe('AES-GCM');
      expect(testKey.extractable).toBeFalse();
    });

    it('should successfully encrypt and decrypt a message', async () => {
      const originalMessage = 'Hello Mess E2E!';
      
      const encryptedPayload = await service.encryptData(originalMessage, testKey);
      expect(encryptedPayload).toContain(':');
      expect(encryptedPayload).not.toEqual(originalMessage);

      const decryptedMessage = await service.decryptData(encryptedPayload, testKey);
      expect(decryptedMessage).toEqual(originalMessage);
    });

    it('should throw an error when decrypting with the wrong key', async () => {
      const originalMessage = 'Secret Message';
      const encryptedPayload = await service.encryptData(originalMessage, testKey);
      
      const wrongMnemonic = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
      const wrongKey = await service.deriveKeyFromMnemonic(wrongMnemonic);

      await expectAsync(service.decryptData(encryptedPayload, wrongKey)).toBeRejected();
    });

    it('should throw an error for malformed payload format', async () => {
      await expectAsync(service.decryptData('invalidFormatWithoutColon', testKey))
        .toBeRejectedWithError('Invalid encrypted payload format');
    });
    
    it('should throw an error if data is tampered with', async () => {
       const originalMessage = 'Secret Message';
       const encryptedPayload = await service.encryptData(originalMessage, testKey);
       
       // Tamper with the ciphertext part
       const parts = encryptedPayload.split(':');
       // Change a character in the ciphertext to simulate tampering/corruption
       let tamperedCipher = parts[1];
       tamperedCipher = tamperedCipher.substring(0, tamperedCipher.length - 1) + (tamperedCipher.endsWith('a') ? 'b' : 'a');
       
       const tamperedPayload = `${parts[0]}:${tamperedCipher}`;
       
       await expectAsync(service.decryptData(tamperedPayload, testKey)).toBeRejected();
    });
  });
});
