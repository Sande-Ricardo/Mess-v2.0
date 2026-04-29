import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActiveCallComponent } from './active-call.component';

describe('ActiveCallComponent', () => {
  let component: ActiveCallComponent;
  let fixture: ComponentFixture<ActiveCallComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActiveCallComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ActiveCallComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
