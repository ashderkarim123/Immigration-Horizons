import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CASE_TYPES } from '../core/api/case-catalog';

/** What any Staff DTO says about a case. Only `id` is certain; the rest is whatever that endpoint carries. */
export interface CaseLabelRef {
  id: string;
  caseNumber?: string | null;
  title?: string | null;
  clientName?: string | null;
  caseType?: string | null;
}

export const caseTypeLabel = (value: string | null | undefined): string => CASE_TYPES.find((t) => t.value === value)?.label || value || '';

/** The name a person recognises a case by: the client, falling back to the case title, then the reference. */
export const casePrimaryName = (c: CaseLabelRef | null | undefined): string => (c ? c.clientName || c.title || c.caseNumber || 'Case' : '');

/**
 * How a case is named everywhere in the Staff app: the client's name first, then the service, with the case number
 * as a small reference. One component so no screen can drift back to leading with the number.
 */
@Component({
  selector: 'ih-case-label',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (case(); as c) {
      @if (link()) {
        <a class="who" [routerLink]="['/cases', c.id]" [queryParams]="queryParams()">{{ name() }}</a>
      } @else {
        <span class="who">{{ name() }}</span>
      }
      @if (detail()) { <span class="ref">{{ detail() }}</span> }
    }
  `,
  styles: [`
    :host { display: inline-flex; flex-direction: column; gap: .1rem; min-width: 0; vertical-align: top; }
    :host(.inline) { flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: .4rem; }
    .who { font-weight: 600; overflow-wrap: anywhere; }
    .ref { font-size: .75rem; font-weight: 400; color: var(--ih-text-secondary); overflow-wrap: anywhere; }
  `],
})
export class CaseLabelComponent {
  readonly case = input<CaseLabelRef | null | undefined>(null);
  readonly link = input(true);
  readonly queryParams = input<Record<string, string> | null>(null);

  protected readonly name = computed(() => casePrimaryName(this.case()));
  /** Service, then the matter title when it adds something, then the reference number. */
  protected readonly detail = computed(() => {
    const c = this.case();
    if (!c) return '';
    const title = c.clientName && c.title && c.title !== c.clientName ? c.title : '';
    const ref = c.caseNumber && c.caseNumber !== this.name() ? `Ref ${c.caseNumber}` : '';
    return [caseTypeLabel(c.caseType), title, ref].filter(Boolean).join(' · ');
  });
}
