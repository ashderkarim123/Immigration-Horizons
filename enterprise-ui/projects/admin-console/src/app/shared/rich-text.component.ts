import { Component, ElementRef, effect, input, model, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * HTML editor for Blog bodies. HTML stays the stored format: a visual surface for everyday formatting, and the raw
 * HTML one click away. Nothing here is trusted — the surface is filled through Angular's sanitizing [innerHTML], and
 * the server applies the real allowlist when the post is saved. No editor dependency, no second document format.
 */
@Component({
  selector: 'iha-rich-text',
  imports: [FormsModule],
  template: `
    <div class="rte">
      <div class="toolbar" role="toolbar" [attr.aria-label]="label() + ' formatting'">
        @if (!source()) {
          @for (tool of tools; track tool.label) {
            <button type="button" class="tool" [attr.aria-label]="tool.label" [title]="tool.label" (mousedown)="$event.preventDefault()" (click)="tool.block ? run('formatBlock', tool.block) : run(tool.command!)">{{ tool.text }}</button>
          }
          <button type="button" class="tool" (mousedown)="keepSelection($event)" (click)="linking.set(!linking())" [attr.aria-expanded]="linking()">Link</button>
          <button type="button" class="tool" (mousedown)="keepSelection($event)" (click)="imageRequested.emit()">Image</button>
        }
        <button type="button" class="tool mode" [attr.aria-pressed]="source()" (click)="toggleSource()">{{ source() ? 'Visual editor' : 'Edit HTML' }}</button>
      </div>
      @if (linking() && !source()) {
        <div class="link-row">
          <label [for]="id + '-link'">Link address</label>
          <input [id]="id + '-link'" type="url" placeholder="https://" [(ngModel)]="linkUrl" (keydown.enter)="$event.preventDefault(); applyLink()" />
          <button type="button" class="btn btn-sm" (click)="applyLink()">Apply</button>
        </div>
      }
      @if (source()) {
        <textarea rows="18" spellcheck="false" [attr.aria-label]="label() + ' (HTML)'" [ngModel]="value()" (ngModelChange)="emit($event)"></textarea>
      } @else {
        <div #surface class="surface" contenteditable="true" role="textbox" aria-multiline="true" [attr.aria-label]="label()"
          [innerHTML]="seed()" (input)="sync()" (blur)="sync()"></div>
      }
    </div>
  `,
  styles: `
    .rte { border: 1px solid var(--ih-border-medium); border-radius: var(--ih-radius-md); background: #fff; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 0.25rem; padding: 0.4rem; border-bottom: 1px solid var(--ih-border-light); background: var(--ih-gray-50); border-radius: var(--ih-radius-md) var(--ih-radius-md) 0 0; }
    .tool { min-width: 2.25rem; min-height: 2.25rem; padding: 0 0.55rem; border: 1px solid transparent; border-radius: var(--ih-radius-sm); background: transparent; font-size: var(--ih-font-size-xs); font-weight: 600; color: var(--ih-brand-900); }
    .tool:hover { background: #fff; border-color: var(--ih-border-medium); }
    .mode { margin-left: auto; }
    .link-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border-bottom: 1px solid var(--ih-border-light); font-size: var(--ih-font-size-xs); }
    .link-row label { font-weight: 600; white-space: nowrap; }
    .surface { min-height: 20rem; max-height: 60dvh; overflow-y: auto; padding: 1rem; font-size: var(--ih-font-size-base); line-height: 1.7; outline: none; }
    .surface:focus-visible { box-shadow: inset 0 0 0 2px var(--ih-accent-500); }
    textarea { border: 0 !important; border-radius: 0 0 var(--ih-radius-md) var(--ih-radius-md) !important; font-family: ui-monospace, Consolas, monospace; font-size: 0.8125rem; }
  `,
})
export class RichTextComponent {
  private static nextId = 0;
  readonly label = input('Content');
  readonly value = model('');
  /** The parent owns the media library; it answers by calling insertImage(). */
  readonly imageRequested = output<void>();

  protected readonly id = `iha-rte-${++RichTextComponent.nextId}`;
  protected readonly source = signal(false);
  protected readonly linking = signal(false);
  /** What the visual surface renders. Updated only for outside changes, never per keystroke (that would move the caret). */
  protected readonly seed = signal('');
  protected linkUrl = '';
  protected readonly tools: { label: string; text: string; command?: string; block?: string }[] = [
    { label: 'Bold', text: 'B', command: 'bold' },
    { label: 'Italic', text: 'I', command: 'italic' },
    { label: 'Heading 2', text: 'H2', block: 'h2' },
    { label: 'Heading 3', text: 'H3', block: 'h3' },
    { label: 'Paragraph', text: 'P', block: 'p' },
    { label: 'Bulleted list', text: '• List', command: 'insertUnorderedList' },
    { label: 'Numbered list', text: '1. List', command: 'insertOrderedList' },
    { label: 'Quote', text: 'Quote', block: 'blockquote' },
  ];

  private readonly surface = viewChild<ElementRef<HTMLElement>>('surface');
  private lastEmitted: string | null = null;
  private savedRange: Range | null = null;

  constructor() {
    effect(() => {
      const value = this.value();
      if (value !== this.lastEmitted) {
        this.lastEmitted = value;
        this.seed.set(value);
      }
    });
  }

  protected emit(html: string): void {
    this.lastEmitted = html;
    this.value.set(html);
  }

  protected sync(): void {
    const el = this.surface()?.nativeElement;
    if (!el) return;
    // An emptied surface still holds a stray <br>; that is "no content", not content.
    const empty = !el.textContent?.trim() && !el.querySelector('img');
    this.emit(empty ? '' : el.innerHTML);
  }

  protected toggleSource(): void {
    if (!this.source()) this.sync();
    else this.seed.set(this.value());
    this.linking.set(false);
    this.source.set(!this.source());
  }

  protected run(command: string, argument?: string): void {
    this.surface()?.nativeElement.focus();
    document.execCommand?.(command, false, argument);
    this.sync();
  }

  /** Toolbar buttons would otherwise steal the selection the command is meant to act on. */
  protected keepSelection(event: Event): void {
    event.preventDefault();
    const selection = window.getSelection();
    const el = this.surface()?.nativeElement;
    this.savedRange = selection && selection.rangeCount && el?.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
  }

  private restoreSelection(): void {
    const el = this.surface()?.nativeElement;
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    if (this.savedRange) selection.addRange(this.savedRange);
    else { const end = document.createRange(); end.selectNodeContents(el); end.collapse(false); selection.addRange(end); }
  }

  protected applyLink(): void {
    const url = this.linkUrl.trim();
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return; // the server would strip anything else anyway
    this.restoreSelection();
    document.execCommand?.('createLink', false, url);
    this.linkUrl = '';
    this.linking.set(false);
    this.sync();
  }

  /** Inserts an image (from the media library) at the caret, or at the end when the editor never had focus. */
  insertImage(url: string, alt: string): void {
    if (this.source()) {
      this.emit(`${this.value()}\n<p><img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}"></p>`);
      return;
    }
    const img = Object.assign(document.createElement('img'), { src: url, alt });
    this.restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
    } else {
      this.surface()?.nativeElement.appendChild(img);
    }
    this.sync();
  }
}

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
