import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogActivitiesComponent } from './dialog-activities.component';

describe('DialogActivitiesComponent', () => {
  let component: DialogActivitiesComponent;
  let fixture: ComponentFixture<DialogActivitiesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogActivitiesComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DialogActivitiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
