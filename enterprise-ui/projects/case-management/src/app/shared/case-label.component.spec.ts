import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CaseLabelComponent, CaseLabelRef, casePrimaryName } from './case-label.component';

describe('CaseLabelComponent', () => {
  function render(ref: CaseLabelRef | null, inputs: Record<string, unknown> = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CaseLabelComponent);
    fixture.componentRef.setInput('case', ref);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('leads with the client, then the service and matter, and keeps the case number as a reference', () => {
    const el = render({ id: 'k1', caseNumber: 'IH-2026-AAA111', title: 'Alpha petition', clientName: 'John Smith', caseType: 'eb2_niw' }, { queryParams: { tab: 'tasks' } });
    expect(el.querySelector('a.who')?.textContent).toBe('John Smith');
    expect(el.querySelector('a.who')?.getAttribute('href')).toBe('/cases/k1?tab=tasks');
    expect(el.querySelector('.ref')?.textContent).toBe('EB-2 NIW · Alpha petition · Ref IH-2026-AAA111');
  });

  it('falls back to the case title, then the number, and never repeats itself', () => {
    const untitled = render({ id: 'k1', caseNumber: 'IH-2026-AAA111', title: 'Alpha petition' });
    expect(untitled.querySelector('.who')?.textContent).toBe('Alpha petition');
    expect(untitled.querySelector('.ref')?.textContent).toBe('Ref IH-2026-AAA111');
    const bare = render({ id: 'k1', caseNumber: 'IH-2026-AAA111' });
    expect(bare.querySelector('.who')?.textContent).toBe('IH-2026-AAA111');
    expect(bare.querySelector('.ref')).toBeNull();
    expect(casePrimaryName(null)).toBe('');
  });

  it('can be plain text, and renders nothing without a case', () => {
    expect(render({ id: 'k1', clientName: 'John Smith' }, { link: false }).querySelector('a')).toBeNull();
    expect(render(null).textContent?.trim()).toBe('');
  });
});
