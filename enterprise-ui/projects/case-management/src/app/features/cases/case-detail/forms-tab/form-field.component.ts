import { Component, computed, input, output } from '@angular/core';

import { FormAnswers, FormFieldDef } from '../../../../core/api/form.types';
import { countryOptions, isFieldVisible } from './forms-state';

type Row = FormAnswers;

const ADDRESS_PARTS = [
  { key: 'line1', label: 'Street address', wide: true },
  { key: 'line2', label: 'Apartment, suite, etc.', wide: true },
  { key: 'city', label: 'City', wide: false },
  { key: 'region', label: 'State / region', wide: false },
  { key: 'postalCode', label: 'Postal code', wide: false },
  { key: 'country', label: 'Country', wide: false },
] as const;

const MAX_ROWS = 25;

/**
 * One form field, rendered from the template definition the server sent.
 * Self-referencing for `repeated_group` rows. Emits the new raw value; the
 * server normalises and validates it.
 */
@Component({
  selector: 'ih-form-field',
  standalone: true,
  imports: [],
  templateUrl: './form-field.component.html',
  styleUrl: './form-field.component.scss',
})
export class FormFieldComponent {
  field = input.required<FormFieldDef>();
  value = input<unknown>(undefined);
  error = input<string | undefined>(undefined);
  /** Every error on the form, so a group row can find `group[0].child`. */
  errors = input<Record<string, string>>({});
  disabled = input(false);
  idPrefix = input('f');

  valueChange = output<unknown>();

  readonly addressParts = ADDRESS_PARTS;
  readonly countries = countryOptions();

  id = computed(() => `${this.idPrefix()}-${this.field().key}`);
  errorId = computed(() => `${this.id()}-error`);
  describedBy = computed(() => (this.error() ? this.errorId() : null));

  text = computed(() => {
    const v = this.value();
    return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  });
  address = computed<Record<string, string>>(() => {
    const v = this.value();
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
  });
  selected = computed<string[]>(() => {
    const v = this.value();
    return Array.isArray(v) ? (v as string[]) : [];
  });
  rows = computed<Row[]>(() => {
    const v = this.value();
    return Array.isArray(v) ? (v as Row[]) : [];
  });
  maxRows = computed(() => Math.min(this.field().validation?.maxItems ?? MAX_ROWS, MAX_ROWS));
  inputType = computed(() => ({ email: 'email', phone: 'tel', number: 'number', date: 'date' } as Record<string, string>)[this.field().type] ?? 'text');

  isVisibleChild = (child: FormFieldDef, row: Row): boolean => isFieldVisible(child, row);

  onInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value);
  }

  setAddress(part: string, event: Event): void {
    this.valueChange.emit({ ...this.address(), [part]: (event.target as HTMLInputElement | HTMLSelectElement).value });
  }

  toggle(optionValue: string, event: Event): void {
    const current = this.selected();
    const checked = (event.target as HTMLInputElement).checked;
    this.valueChange.emit(checked ? [...current, optionValue] : current.filter((v) => v !== optionValue));
  }

  addRow(): void {
    this.valueChange.emit([...this.rows(), {}]);
  }

  removeRow(index: number): void {
    this.valueChange.emit(this.rows().filter((_, i) => i !== index));
  }

  setRowValue(index: number, key: string, value: unknown): void {
    this.valueChange.emit(this.rows().map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  rowError(index: number, childKey: string): string | undefined {
    return this.errors()[`${this.field().key}[${index}].${childKey}`];
  }
}
