import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CryptoService {
  private readonly ITERATIONS = 100000;
  private readonly KEY_LENGTH = 256;

  constructor() {}

  /**
   * Generates a 12-word recovery phrase using the BIP-39 English wordlist.
   * Entropy is generated using the securely random Web Crypto API.
   * @returns A string of 12 space-separated words.
   */
  public async generateMnemonic(): Promise<string> {
    const wordlistResponse = await fetch('/assets/wordlist_english.json');
    const wordlist: string[] = await wordlistResponse.json();

    if (!wordlist || wordlist.length !== 2048) {
      throw new Error('Invalid or missing wordlist.');
    }

    // 12 words * 11 bits = 132 bits. We generate 16 bytes (128 bits) of entropy.
    // In standard BIP-39, a 128-bit checksum adds 4 bits, but for MVP we will use direct mapping 
    // of 16 random bytes, taking bits to map directly to indices.
    // Note: Standard BIP39 includes a checksum. For standard compliance we should implement it.
    // For MVP simplicity without external libs, we use secure random to pick 12 indices.
    
    // To cleanly map random bytes to the 2048-word list without bias:
    const mnemonicWords: string[] = [];
    const array = new Uint32Array(12);
    window.crypto.getRandomValues(array);

    for (let i = 0; i < 12; i++) {
        const index = array[i] % 2048;
        mnemonicWords.push(wordlist[index]);
    }

    return mnemonicWords.join(' ');
  }

  /**
   * Derives an AES-256-GCM symmetric CryptoKey from a given mnemonic using PBKDF2 (SHA-256).
   * @param mnemonic The 12-word recovery phrase.
   * @returns The derived AES-GCM CryptoKey.
   */
  public async deriveKeyFromMnemonic(mnemonic: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(mnemonic),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    // Using a static salt for derivation, ideally tied to the user/app context
    // In a real BIP39/BIP32 standard, salt is "mnemonic" + passphrase.
    const salt = encoder.encode('mess-app-salt');

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: this.KEY_LENGTH },
      false, // non-extractable
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts a plaintext string symmetrically using AES-256-GCM.
   * @param data The plaintext string to encrypt.
   * @param key The derived AES-GCM CryptoKey.
   * @returns A Base64 string containing the Initialization Vector and Ciphertext (e.g. `iv:ciphertext`).
   */
  public async encryptData(data: string, key: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for AES-GCM
    const encodedData = encoder.encode(data);

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encodedData
    );

    const ciphertext = new Uint8Array(ciphertextBuffer);
    
    // Base64 encode IV and Ciphertext
    const ivBase64 = this.arrayBufferToBase64(iv);
    const ciphertextBase64 = this.arrayBufferToBase64(ciphertext);

    return `${ivBase64}:${ciphertextBase64}`;
  }

  /**
   * Decrypts a Base64 combination string symmetrically using AES-256-GCM.
   * @param encryptedPayload Base64 encoded `iv:ciphertext`
   * @param key The derived AES-GCM CryptoKey.
   * @returns The original plaintext string.
   */
  public async decryptData(encryptedPayload: string, key: CryptoKey): Promise<string> {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted payload format');
    }

    const iv = this.base64ToArrayBuffer(parts[0]);
    const ciphertext = this.base64ToArrayBuffer(parts[1]);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv)
      },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }

  // --- Helper Methods ---

  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
