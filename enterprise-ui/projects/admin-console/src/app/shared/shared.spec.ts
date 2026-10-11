import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MediaItem } from '../core/api/admin.types';
import { mount, paged } from '../testing/harness';
import { MediaPickerComponent } from './media-picker.component';
import { ModalComponent } from './modal.component';
import { RichTextComponent } from './rich-text.component';
import { FileDropzoneComponent, formatBytes, humanize } from './widgets';

@Component({
  imports: [ModalComponent],
  template: `
    <button id="opener" (click)="open.set(true)">Open</button>
    <iha-modal [open]="open()" title="Edit thing" (closed)="open.set(false)">
      <input id="first" /><button id="last">Last</button>
      <button modal-footer id="footer">Done</button>
    </iha-modal>`,
})
class ModalHost { readonly open = signal(false); }

@Component({
  imports: [RichTextComponent],
  template: `<iha-rich-text label="Content" [(value)]="html" (imageRequested)="asked = asked + 1" />`,
})
class EditorHost {
  html = '<p>Hello</p>';
  asked = 0;
  readonly editor = viewChild.required(RichTextComponent);
}

describe('Shared Admin UI', () => {
  it('modal: labelled, focus moves in, Tab stays inside, Escape closes, and focus returns to the opener', async () => {
    const fixture = TestBed.createComponent(ModalHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const opener = root.querySelector<HTMLButtonElement>('#opener')!;
    opener.focus();
    opener.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = root.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(root.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)?.textContent).toBe('Edit thing');
    expect(document.activeElement).toBe(dialog);

    const footer = root.querySelector<HTMLButtonElement>('#footer')!;
    footer.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    footer.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close dialog'); // wrapped to the first control

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    fixture.nativeElement.remove();
  });

  it('rich text: renders stored HTML through the sanitizer and never executes it', async () => {
    const fixture = TestBed.createComponent(EditorHost);
    fixture.componentInstance.html = '<p>Hello <strong>there</strong></p><img src="x" onerror="window.__xss = 1"><script>window.__xss = 2</script>';
    fixture.detectChanges();
    await fixture.whenStable();
    const surface = (fixture.nativeElement as HTMLElement).querySelector('.surface')!;
    expect(surface.getAttribute('role')).toBe('textbox');
    expect(surface.getAttribute('aria-label')).toBe('Content');
    expect(surface.innerHTML).toContain('<strong>there</strong>');
    expect(surface.innerHTML).not.toMatch(/onerror|<script/i);
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('rich text: typing in the surface updates the value, an emptied surface is empty, and HTML mode edits the same value', async () => {
    const fixture = TestBed.createComponent(EditorHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const surface = root.querySelector<HTMLElement>('.surface')!;
    surface.innerHTML = '<p>Edited</p>';
    surface.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.html).toBe('<p>Edited</p>');
    surface.innerHTML = '<br>';
    surface.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.html).toBe('');

    const mode = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Edit HTML'))!;
    mode.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mode.getAttribute('aria-pressed')).toBe('true');
    const source = root.querySelector('textarea')!;
    source.value = '<h2>Heading</h2>';
    source.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(fixture.componentInstance.html).toBe('<h2>Heading</h2>');
    expect(root.querySelector('[aria-label="Bold"]')).toBeNull(); // formatting tools belong to the visual surface

    fixture.componentInstance.editor().insertImage('/uploads/a.png', 'An "alt"');
    expect(fixture.componentInstance.html).toContain('<img src="/uploads/a.png" alt="An &quot;alt&quot;">');
  });

  it('rich text: the Image button asks the parent, and every tool has an accessible name', async () => {
    const fixture = TestBed.createComponent(EditorHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const toolbar = root.querySelector('[role="toolbar"]')!;
    expect(toolbar.getAttribute('aria-label')).toBe('Content formatting');
    for (const name of ['Bold', 'Italic', 'Heading 2', 'Bulleted list', 'Quote']) expect(toolbar.querySelector(`[aria-label="${name}"]`)).toBeTruthy();
    Array.from(toolbar.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Image')!.click();
    expect(fixture.componentInstance.asked).toBe(1);
  });

  it('media picker: lists library images when opened and returns the chosen one', async () => {
    const t = mount(MediaPickerComponent, { inputs: { open: true } });
    const item: MediaItem = { id: 'm1', url: '/uploads/a.png', originalName: 'a.png', mimeType: 'image/png', size: 1, altText: 'An image', folder: '/', uploadedBy: 'Ada', createdAt: '', actions: { edit: true, delete: true } };
    const picked: MediaItem[] = [];
    t.component.picked.subscribe((m) => picked.push(m));
    await t.respond('GET', '/media', paged([item]));
    expect(t.dialog()?.querySelector('img')?.getAttribute('alt')).toBe('An image');
    (t.dialog()!.querySelector('.tile') as HTMLButtonElement).click();
    expect(picked).toEqual([item]);
  });

  it('dropzone: a real button opens the picker, a dropped or chosen file is emitted, and it can be disabled', () => {
    const fixture = TestBed.createComponent(FileDropzoneComponent);
    const files: File[] = [];
    fixture.componentInstance.fileSelected.subscribe((f) => files.push(f));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    const opened = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    root.querySelector('button')!.click();
    expect(opened).toHaveBeenCalled();
    expect(input.getAttribute('accept')).toBe('image/png,image/jpeg,image/webp,image/gif');

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const drop = Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: { files: [file] } });
    root.querySelector('.zone')!.dispatchEvent(drop);
    expect(files).toEqual([file]);

    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    root.querySelector('.zone')!.dispatchEvent(Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: { files: [file] } }));
    expect(files).toHaveLength(1);
    expect(root.querySelector('button')!.disabled).toBe(true);
  });

  it('formatting helpers', () => {
    expect([formatBytes(512), formatBytes(2048), formatBytes(5 * 1024 * 1024)]).toEqual(['512 B', '2.0 KB', '5.0 MB']);
    expect([humanize('admin_user_created'), humanize('security_events.view'), humanize('')]).toEqual(['Admin user created', 'Security events view', '']);
  });
});
