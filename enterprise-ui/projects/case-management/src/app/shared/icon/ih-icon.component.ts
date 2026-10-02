/**
 * IhIconComponent — inline SVG icon adapter.
 *
 * Replaces lucide-angular (which has no Angular 22 peer-dependency support).
 * Renders the exact SVG paths for the icons used in this application.
 * All icons are from the Lucide icon set (ISC licence) — paths are embedded
 * directly to avoid any runtime package dependency.
 *
 * Usage:
 *   <ih-icon name="layout-dashboard" />
 *   <ih-icon name="briefcase" [size]="20" />
 */
import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

// ─── Icon path registry ───────────────────────────────────────────────────
// Each entry: { path: string, viewBox?: string }
// viewBox defaults to "0 0 24 24" (standard Lucide viewBox).

const ICONS: Record<string, string> = {
  'layout-dashboard':
    'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  'briefcase':
    'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2',
  'users':
    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M9 7a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  'check-square':
    'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  'log-out':
    'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  'chevron-right':
    'M9 18l6-6-6-6',
  'chevron-left':
    'M15 18l-6-6 6-6',
  'chevron-down':
    'M6 9l6 6 6-6',
  'chevron-up':
    'M18 15l-6-6-6 6',
  'x':
    'M18 6L6 18 M6 6l12 12',
  'check':
    'M20 6L9 17l-5-5',
  'search':
    'M21 21l-4.35-4.35 M11 19A8 8 0 1 0 11 3a8 8 0 0 0 0 16z',
  'filter':
    'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  'plus':
    'M12 5v14 M5 12h14',
  'plus-circle':
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v8 M8 12h8',
  'alert-circle':
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v4 M12 16h.01',
  'info':
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
  'loader':
    'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83',
  'refresh-cw':
    'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  'trash-2':
    'M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  'edit':
    'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  'eye':
    'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  'clock':
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  'calendar':
    'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18',
  'user':
    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'user-check':
    'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M8.5 7a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M17 11l2 2 4-4',
  'user-plus':
    'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M8.5 7a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M20 8v6 M23 11h-6',
  'user-minus':
    'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M8.5 7a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M23 11h-6',
  'folder':
    'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  'file':
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  'file-text':
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  'archive':
    'M21 8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z M3 6h18 M10 12h4',
  'send':
    'M22 2L11 13 M22 2L15 22l-4-9-9-4 22-7z',
  'bell':
    'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  'message-square':
    'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'activity':
    'M22 12h-4l-3 9L9 3l-3 9H2',
  'shield':
    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  'lock':
    'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4',
  'settings':
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
};

// ─── Component ────────────────────────────────────────────────────────────

@Component({
  selector: 'ih-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.viewBox]="viewBox"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      [innerHTML]="svgPaths()"
    ></svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    svg {
      display: block;
      flex-shrink: 0;
    }
  `],
})
export class IhIconComponent {
  readonly name = input<string>('');
  readonly size = input<number>(24);
  readonly strokeWidth = input<number>(2);

  readonly viewBox = '0 0 24 24';

  readonly svgPaths = computed<string>(() => {
    const iconName = this.name();
    const pathData = ICONS[iconName];
    if (!pathData) {
      // Fallback: render an X circle for unknown icon names in dev
      return '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>';
    }
    // Each space-separated segment starting with an uppercase letter is a new path element
    return pathData
      .split(/(?=[MLHVCSQTAZM])/g)
      .filter(Boolean)
      // Group into full sub-paths by splitting on M at start of each shape
      .join('')
      .split(/ (?=[M])/)
      .map((d) => `<path d="${d.trim()}" />`)
      .join('');
  });
}
