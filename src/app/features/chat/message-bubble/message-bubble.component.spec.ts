import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageBubbleComponent } from './message-bubble.component';
import { Message } from '../../../core/models/chat.model';

describe('MessageBubbleComponent', () => {
  let component: MessageBubbleComponent;
  let fixture: ComponentFixture<MessageBubbleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MessageBubbleComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(MessageBubbleComponent);
    component = fixture.componentInstance;
  });

  function setupComponent(messageOverrides: Partial<Message>, isMine: boolean) {
    const baseMessage: Message = {
      id: 'msg-1',
      senderId: isMine ? 'me' : 'other',
      content: 'hello',
      timestamp: Date.now(),
      status: 'sent',
      type: 'text',
      ...messageOverrides
    };
    fixture.componentRef.setInput('message', baseMessage);
    fixture.componentRef.setInput('isMine', isMine);
    fixture.detectChanges();
    return baseMessage;
  }

  it('should create', () => {
    setupComponent({}, true);
    expect(component).toBeTruthy();
  });

  it('canEdit should be true if isMine and within 15 minutes', () => {
    setupComponent({ timestamp: Date.now() - (10 * 60 * 1000) }, true);
    expect(component.canEdit()).toBeTrue();
  });

  it('canEdit should be false if isMine but older than 15 minutes', () => {
    setupComponent({ timestamp: Date.now() - (20 * 60 * 1000) }, true);
    expect(component.canEdit()).toBeFalse();
  });

  it('canEdit should be false if not mine', () => {
    setupComponent({ timestamp: Date.now() }, false);
    expect(component.canEdit()).toBeFalse();
  });

  it('canDelete should be true if isMine and within 48 hours', () => {
    setupComponent({ timestamp: Date.now() - (24 * 60 * 60 * 1000) }, true);
    expect(component.canDelete()).toBeTrue();
  });

  it('canDelete should be false if isMine but older than 48 hours', () => {
    setupComponent({ timestamp: Date.now() - (50 * 60 * 60 * 1000) }, true);
    expect(component.canDelete()).toBeFalse();
  });

  it('should emit reply event', () => {
    const msg = setupComponent({}, false);
    let emittedMsg: Message | undefined;
    component.reply.subscribe(m => emittedMsg = m);

    component.onReply(new Event('click'));
    expect(emittedMsg).toEqual(msg);
  });

  it('should emit delete event only if canDelete is true', () => {
    const msg = setupComponent({}, true); // Recent message, can delete
    let emittedMsg: Message | undefined;
    component.delete.subscribe(m => emittedMsg = m);

    component.onDelete(new Event('click'));
    expect(emittedMsg).toEqual(msg);
  });
});
