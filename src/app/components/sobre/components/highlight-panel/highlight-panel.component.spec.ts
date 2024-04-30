import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HighlightPanelComponent } from './highlight-panel.component';

describe('HighlightPanelComponent', () => {
  let component: HighlightPanelComponent;
  let fixture: ComponentFixture<HighlightPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HighlightPanelComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(HighlightPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
