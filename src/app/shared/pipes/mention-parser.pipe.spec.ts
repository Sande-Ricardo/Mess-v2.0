import { TestBed } from '@angular/core/testing';
import { MentionParserPipe } from './mention-parser.pipe';
import { DomSanitizer, BrowserModule } from '@angular/platform-browser';

describe('MentionParserPipe', () => {
  let pipe: MentionParserPipe;
  let sanitizer: DomSanitizer;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BrowserModule]
    });
    sanitizer = TestBed.inject(DomSanitizer);
    pipe = new MentionParserPipe(sanitizer);
  });

  it('create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should wrap @usernames in span tags', () => {
    const inputText = 'Hello @john_doe how are you?';
    const result = pipe.transform(inputText) as any;
    
    // In unit testing bypassSecurityTrustHtml returns an object with a private field,
    // so we can test the unwrapped value or just assert it contains the injected span depending on Angular environment.
    // However, `result.changingThisBreaksApplicationSecurity` holds the string.
    const htmlString = result.changingThisBreaksApplicationSecurity;
    expect(htmlString).toContain('<span class="mention" data-username="john_doe">@john_doe</span>');
    expect(htmlString).toContain('Hello ');
    expect(htmlString).toContain(' how are you?');
  });

  it('should return empty string on null or undefined', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });

  it('should not wrap emails like test@test.com', () => {
    const inputText = 'Contact test@example.com';
    const result = pipe.transform(inputText) as any;
    const htmlString = result.changingThisBreaksApplicationSecurity;
    
    // Debería devolverse igual, sin crear la etiqueta span
    expect(htmlString).not.toContain('<span class="mention"');
    expect(htmlString).toEqual('Contact test@example.com');
  });
});
