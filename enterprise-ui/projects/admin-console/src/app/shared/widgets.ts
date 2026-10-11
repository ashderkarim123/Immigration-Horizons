import { Component, input, output, signal } from '@angular/core';

/** Copies a value and says so; falls back to selecting a field where the Clipboard API is unavailable. */
@Component({
  selector: 'iha-copy-button',
  template: `<button type="button" class="btn btn-sm" (click)="copy()">{{ copied() ? 'Copied' : label() }}</button>
    <span class="sr-only" role="status">{{ copied() ? 'Copied to clipboard' : '' }}</span>`,
})
export class CopyButtonComponent {
  readonly text = input.required<string>();
  readonly label = input('Copy');
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.text());
    } catch {
      const field = Object.assign(document.createElement('textarea'), { value: this.text() });
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}

/** Drop target that is also a real button, so a keyboard or screen-reader user gets the same file picker. */
@Component({
  selector: 'iha-file-dropzone',
  template: `
    <div class="zone" [class.over]="over()" [class.disabled]="disabled()"
      (dragover)="onDrag($event, true)" (dragleave)="onDrag($event, false)" (drop)="onDrop($event)">
      <p>Drag an image here, or</p>
      <button type="button" class="btn" [disabled]="disabled()" (click)="fileInput.click()">Choose a file</button>
      <p class="hint">{{ hint() }}</p>
      <input #fileInput type="file" class="sr-only" tabindex="-1" aria-hidden="true" [accept]="accept()" (change)="onPick($event)" />
    </div>
  `,
  styles: `
    .zone { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1.5rem 1rem; border: 2px dashed var(--ih-border-medium); border-radius: var(--ih-radius-lg); background: #fff; text-align: center; }
    .zone.over { border-color: var(--ih-accent-500); background: var(--ih-brand-50); }
    .zone.disabled { opacity: 0.6; }
    .hint { font-size: var(--ih-font-size-xs); color: var(--ih-text-muted); }
  `,
})
export class FileDropzoneComponent {
  readonly accept = input('image/png,image/jpeg,image/webp,image/gif');
  readonly hint = input('PNG, JPG, WebP or GIF, up to 5 MB.');
  readonly disabled = input(false);
  readonly fileSelected = output<File>();

  protected readonly over = signal(false);

  protected onDrag(event: DragEvent, over: boolean): void {
    event.preventDefault();
    if (!this.disabled()) this.over.set(over);
  }
  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && !this.disabled()) this.fileSelected.emit(file);
  }
  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.fileSelected.emit(file);
    input.value = ''; // choosing the same file again must fire again
  }
}

/** "1.4 MB" — binary units, one decimal above a kilobyte. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** security_event / admin_user_created -> "Admin user created". */
export function humanize(code: string): string {
  const text = code.replace(/[_.]+/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}
