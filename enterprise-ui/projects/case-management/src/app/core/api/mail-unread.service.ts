import { Injectable, Injector, NgZone, inject, signal } from '@angular/core';
import { MailApi } from './mail-api.service';

const POLL_MS = 60_000;

/**
 * The unread count beside Mail in the menu. Started only for someone who may read the mailbox, polls once a minute while the
 * tab is visible, and never surfaces an error: a count that cannot be fetched simply is not shown. The mail API is resolved
 * lazily so that nothing here touches the network for people without Mail.
 */
@Injectable({ providedIn: 'root' })
export class MailUnreadService {
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);
  readonly count = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.refresh();
    // Outside Angular's zone so the poll never keeps the app "unstable" (tests, SSR, router idle checks).
    this.timer = this.zone.runOutsideAngular(() => setInterval(() => { if (!document.hidden) this.refresh(); }, POLL_MS));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.count.set(0);
  }

  refresh(): void {
    this.injector.get(MailApi).unread().subscribe({ next: (result) => this.count.set(result.unread), error: () => undefined });
  }
}
