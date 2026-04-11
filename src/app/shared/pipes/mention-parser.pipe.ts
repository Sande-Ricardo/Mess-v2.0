import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'mentionParser',
  standalone: true
})
export class MentionParserPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string | undefined | null): SafeHtml {
    if (!value) return '';
    
    // RegEx matches @username (only at start of string or preceded by whitespace)
    const parsedText = value.replace(
      /(^|\s)@([a-zA-Z0-9_]+)/g,
      '$1<span class="mention" data-username="$2">@$2</span>'
    );
    
    return this.sanitizer.bypassSecurityTrustHtml(parsedText);
  }
}
