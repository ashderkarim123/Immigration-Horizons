import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusBadgeComponent } from './status-badge.component';

describe('StatusBadgeComponent', () => {
  let component: StatusBadgeComponent;
  let fixture: ComponentFixture<StatusBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusBadgeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(StatusBadgeComponent);
    component = fixture.componentInstance;
  });

  it('should create and format label with spaces', () => {
    fixture.componentRef.setInput('status', 'in_progress');
    fixture.detectChanges();

    expect(component.formattedLabel()).toBe('in progress');
    expect(fixture.nativeElement.textContent.trim()).toBe('in progress');
  });

  it('should compute badge-success for active stage', () => {
    fixture.componentRef.setInput('status', 'active');
    fixture.detectChanges();

    expect(component.badgeClass()).toBe('badge badge-success');
  });

  it('should compute badge-danger for archived stage', () => {
    fixture.componentRef.setInput('status', 'archived');
    fixture.detectChanges();

    expect(component.badgeClass()).toBe('badge badge-danger');
  });
});
