import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IncomingCallModalComponent } from './incoming-call-modal.component';

describe('IncomingCallModalComponent', () => {
  let component: IncomingCallModalComponent;
  let fixture: ComponentFixture<IncomingCallModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncomingCallModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IncomingCallModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
