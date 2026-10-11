import { HttpEventType } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Dashboard, Faq, MediaItem, SeoPage, ServiceItem, Testimonial } from '../core/api/admin.types';
import { UnsavedChangesService } from '../core/guards/unsaved-changes.guard';
import { ADMIN_CAPS, mount, paged } from '../testing/harness';
import { AdminDashboard } from './dashboard/dashboard';
import { FaqsComponent } from './faqs/faqs';
import { MediaComponent } from './media/media';
import { SeoEditorComponent, SeoListComponent, ServicesComponent } from './seo/seo';
import { TestimonialsComponent } from './testimonials/testimonials';

const dashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  blog: { total: 7, published: 5, drafts: 2 }, faqs: { total: 12, published: 10 }, testimonials: { total: 4, published: 3 }, media: { total: 9 },
  seo: { configuredPages: 6 }, users: null, recentPosts: [], recentSecurityEvents: null, asOf: '2026-10-11T09:00:00.000Z', ...over,
});

describe('Dashboard', () => {
  it('shows the real totals and omits what the administrator may not see, rather than showing a zero', async () => {
    const t = mount(AdminDashboard);
    expect(t.root.querySelector('ih-skeleton')).toBeTruthy();
    await t.respond('GET', '/dashboard', dashboard());
    const column = (selector: string) => Array.from(t.root.querySelectorAll(selector)).map((el) => el.textContent?.trim());
    expect(column('.m-label')).toEqual(['Blog posts', 'FAQs', 'Testimonials', 'Media items', 'SEO entries']);
    expect(column('.m-value')).toEqual(['7', '12', '4', '9', '6']);
    expect(column('.m-note')).toEqual(['5 published · 2 drafts', '10 published', '3 published', 'in the library', 'pages with saved metadata']);
    expect(t.root.textContent).not.toContain('Active accounts');
    expect(t.root.textContent).not.toContain('Recent security events');
    expect(t.root.textContent).not.toMatch(/cases|leads|petitions/i);
  });

  it('adds accounts and recent security events for an administrator who holds those capabilities', async () => {
    const t = mount(AdminDashboard, { capabilities: ADMIN_CAPS });
    await t.respond('GET', '/dashboard', dashboard({
      users: { active: 11 },
      recentSecurityEvents: [{ id: 'e1', type: 'admin_user_created', result: 'success', surface: 'admin_cms', actorType: 'admin_user', actorAdmin: { id: 'a' }, actorName: 'Ada Admin', subjectEmail: 'new@ih.test', ipMasked: '203.0.113.x', createdAt: '2026-10-11T08:00:00.000Z', meta: {} }],
    }));
    expect(t.text('.metric[href="/users"] .m-label')).toBe('Active accounts');
    expect(t.text('.metric[href="/users"] .m-value')).toBe('11');
    expect(t.root.textContent).toContain('Admin user created');
    expect(t.root.querySelector('a[href="/security"]')).toBeTruthy();
  });

  it('offers a retry when the dashboard cannot be loaded', async () => {
    const t = mount(AdminDashboard);
    await t.fail('GET', '/dashboard', 500, { message: 'Internal Server Error' });
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('The dashboard could not be loaded');
    await t.click('Try Again');
    await t.respond('GET', '/dashboard', dashboard());
    expect(t.root.querySelectorAll('.metric')).toHaveLength(5);
  });
});

const faq = (over: Partial<Faq> = {}): Faq => ({
  id: 'f1', question: 'Do you guarantee approval?', answer: 'No. Nobody can.', category: 'General', displayOrder: 1, showOnHomepage: true, showOnServicePage: 'eb1a',
  schemaEnabled: true, status: 'published', updatedAt: '2026-10-01T00:00:00.000Z', actions: { edit: true, delete: true }, ...over,
});
const faqList = (items: Faq[]) => paged(items, { categories: ['General', 'Process'], statuses: ['published', 'draft'], serviceSlugs: ['eb2-niw', 'eb1a'] });

describe('FAQs', () => {
  it('lists FAQs with where each is shown, and filters on the server', async () => {
    const t = mount(FaqsComponent);
    await t.respond('GET', '/faqs', faqList([faq(), faq({ id: 'f2', question: 'Hidden one', showOnHomepage: false, showOnServicePage: '', status: 'draft' })]));
    const rows = Array.from(t.root.querySelectorAll('tbody tr')).map((r) => r.textContent ?? '');
    expect(rows[0]).toContain('Homepage, Service: eb1a');
    expect(rows[1]).toContain('FAQ page only');
    expect(rows[1]).toContain('Draft');
    await t.type('#faq-status', 'draft');
    expect(t.request('GET', '/faqs').request.params.get('status')).toBe('draft');
  });

  it('creates an FAQ from the dialog with real service slugs as the targeting choices', async () => {
    const t = mount(FaqsComponent);
    await t.respond('GET', '/faqs', faqList([]));
    expect(t.text('ih-empty-state')).toContain('Add the first question');
    await t.click('New FAQ');
    const dialog = t.dialog()!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelector('h2')?.textContent).toBe('New FAQ');
    expect(Array.from(dialog.querySelectorAll('#servicePage option')).map((o) => o.textContent)).toEqual(['None', 'eb2-niw', 'eb1a']);
    await t.type('#question', 'What is a priority date?');
    await t.type('#answer', 'The date USCIS received the petition.');
    await t.submit('#faq-form');
    const req = t.request('POST', '/faqs');
    expect(req.request.body).toEqual({ question: 'What is a priority date?', answer: 'The date USCIS received the petition.', category: 'General', displayOrder: 0, showOnHomepage: false, showOnServicePage: '', schemaEnabled: true, status: 'published' });
    req.flush({ data: faq() });
    await t.settle();
    await t.respond('GET', '/faqs', faqList([faq()]));
    expect(t.dialog()).toBeNull();
    expect(t.root.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('edits with field-level server errors, and asks before discarding unsaved changes', async () => {
    const t = mount(FaqsComponent);
    await t.respond('GET', '/faqs', faqList([faq()]));
    await t.click('Edit');
    expect((t.root.querySelector('#question') as HTMLInputElement).value).toBe('Do you guarantee approval?');
    await t.type('#question', '');
    await t.submit('#faq-form');
    await t.fail('PATCH', '/faqs/f1', 422, { code: 'validation_error', message: 'Please correct the highlighted fields.', fieldErrors: [{ field: 'question', message: 'Question is required.' }] });
    expect(t.root.querySelector('#question')?.getAttribute('aria-invalid')).toBe('true');
    expect(t.dialog()?.textContent).toContain('Question is required.');

    const unsaved = TestBed.inject(UnsavedChangesService);
    await t.click('Cancel', t.dialog()!);
    expect(unsaved.asking()).toBe(true);
    unsaved.answer(false);
    await t.settle();
    expect(t.dialog()).toBeTruthy(); // stayed open: nothing lost
    await t.click('Cancel', t.dialog()!);
    unsaved.answer(true);
    await t.settle();
    expect(t.dialog()).toBeNull();
  });

  it('deletes only after a named confirmation, and offers no mutation to a read-only role', async () => {
    const t = mount(FaqsComponent);
    await t.respond('GET', '/faqs', faqList([faq()]));
    await t.click('Delete');
    expect(t.dialog()?.textContent).toContain('Do you guarantee approval?');
    await t.click('Delete FAQ', t.dialog()!);
    await t.respond('DELETE', '/faqs/f1', { deleted: true });
    await t.respond('GET', '/faqs', faqList([]));

    TestBed.resetTestingModule();
    const readOnly = mount(FaqsComponent, { capabilities: ['admin.cms.access'] });
    await readOnly.respond('GET', '/faqs', faqList([faq({ actions: { edit: false, delete: false } })]));
    expect(readOnly.button('New FAQ')).toBeUndefined();
    expect(readOnly.button('Edit')).toBeUndefined();
    expect(readOnly.button('Delete')).toBeUndefined();
  });
});

const testimonial = (over: Partial<Testimonial> = {}): Testimonial => ({
  id: 't1', name: 'Juliet M.', country: 'US', profession: 'Researcher', service: 'EB-1A', review: 'Organised and timely.', rating: 5, photo: '', verificationUrl: 'https://www.fiverr.com/x',
  featured: true, displayOrder: 1, status: 'published', updatedAt: '2026-10-01T00:00:00.000Z', actions: { edit: true, delete: true }, ...over,
});
const testimonialList = (items: Testimonial[]) => paged(items, { statuses: ['published', 'draft', 'archived'] });

describe('Testimonials', () => {
  it('lists reviews with status, featured marker and a safe verification link', async () => {
    const t = mount(TestimonialsComponent);
    await t.respond('GET', '/testimonials', testimonialList([testimonial(), testimonial({ id: 't2', name: 'No Link', verificationUrl: '', featured: false, status: 'archived' })]));
    const rows = Array.from(t.root.querySelectorAll('tbody tr'));
    expect(rows[0].textContent).toContain('Featured');
    expect(rows[0].textContent).toContain('5 of 5');
    const link = rows[0].querySelector('a[target="_blank"]')!;
    expect([link.getAttribute('href'), link.getAttribute('rel')]).toEqual(['https://www.fiverr.com/x', 'noopener noreferrer']);
    expect(rows[1].textContent).toContain('No link');
    expect(rows[1].textContent).toContain('Archived');
  });

  it('creates a testimonial, sending the rating as a number, and shows server validation on the link', async () => {
    const t = mount(TestimonialsComponent);
    await t.respond('GET', '/testimonials', testimonialList([]));
    await t.click('New testimonial');
    await t.type('#name', 'Sohail A.');
    await t.type('#review', 'Approved. Thank you.');
    await t.type('#verificationUrl', 'javascript:alert(1)');
    await t.submit('#testimonial-form');
    const req = t.request('POST', '/testimonials');
    expect(req.request.body).toMatchObject({ name: 'Sohail A.', review: 'Approved. Thank you.', rating: 5, featured: false, status: 'published', displayOrder: 0 });
    req.flush({ error: { code: 'validation_error', message: 'Please correct the highlighted fields.', fieldErrors: [{ field: 'verificationUrl', message: 'Verification URL must be a full http(s) URL.' }] } }, { status: 422, statusText: 'Unprocessable' });
    await t.settle();
    expect(t.root.querySelector('#verificationUrl')?.getAttribute('aria-invalid')).toBe('true');
    expect(t.dialog()?.textContent).toContain('must be a full http(s) URL');
  });

  it('edits, and explains archiving as the alternative when deleting', async () => {
    const t = mount(TestimonialsComponent);
    await t.respond('GET', '/testimonials', testimonialList([testimonial()]));
    await t.click('Edit');
    await t.type('#tstatus', 'archived');
    await t.submit('#testimonial-form');
    const req = t.request('PATCH', '/testimonials/t1');
    expect(req.request.body.status).toBe('archived');
    req.flush({ data: testimonial({ status: 'archived' }) });
    await t.settle();
    await t.respond('GET', '/testimonials', testimonialList([testimonial({ status: 'archived' })]));
    await t.click('Delete');
    expect(t.dialog()?.textContent).toContain('set its status to Archived');
    await t.click('Delete testimonial', t.dialog()!);
    await t.respond('DELETE', '/testimonials/t1', { deleted: true });
    await t.respond('GET', '/testimonials', testimonialList([]));
    expect(t.text('ih-empty-state')).toContain('Add a real client review');
  });
});

const media = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: 'm1', url: '/uploads/office-1.png', originalName: 'office.png', mimeType: 'image/png', size: 2048, altText: '', folder: '/', uploadedBy: 'Ada Admin',
  createdAt: '2026-10-01T00:00:00.000Z', actions: { edit: true, delete: true }, ...over,
});
const mediaList = (items: MediaItem[]) => paged(items, { folders: ['/'], mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] });
const file = (name: string, type: string, size = 10) => { const f = new File(['x'.repeat(10)], name, { type }); Object.defineProperty(f, 'size', { value: size }); return f; };

describe('Media Library', () => {
  it('shows lazy thumbnails with size, uploader and a missing-alt warning; no folder filter when there is one folder', async () => {
    const t = mount(MediaComponent);
    await t.respond('GET', '/media', mediaList([media(), media({ id: 'm2', originalName: 'chart.webp', altText: 'Quarterly chart' })]));
    const tiles = Array.from(t.root.querySelectorAll('.tile'));
    expect(tiles[0].querySelector('img')?.getAttribute('loading')).toBe('lazy');
    expect(tiles[0].textContent).toContain('2.0 KB');
    expect(tiles[0].textContent).toContain('No alt text');
    expect(tiles[1].querySelector('img')?.getAttribute('alt')).toBe('Quarterly chart');
    expect(t.root.querySelector('#media-folder')).toBeNull();
  });

  it('refuses a wrong type or an oversized file before uploading, then uploads with alt text and progress', async () => {
    const t = mount(MediaComponent);
    await t.respond('GET', '/media', mediaList([]));
    const drop = t.fixture.debugElement.query((d) => d.name === 'iha-file-dropzone');
    drop.triggerEventHandler('fileSelected', file('notes.pdf', 'application/pdf'));
    await t.settle();
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('Only PNG, JPG, WebP or GIF');
    drop.triggerEventHandler('fileSelected', file('huge.png', 'image/png', 6 * 1024 * 1024));
    await t.settle();
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('5 MB limit');
    t.http.expectNone((r) => r.method === 'POST');

    await t.type('#upload-alt', ' The office ');
    drop.triggerEventHandler('fileSelected', file('office.png', 'image/png'));
    await t.settle();
    const req = t.request('POST', '/media');
    const form = req.request.body as FormData;
    expect(form.get('altText')).toBe('The office');
    expect((form.get('file') as File).name).toBe('office.png');
    req.event({ type: HttpEventType.UploadProgress, loaded: 5, total: 10 });
    await t.settle();
    expect(t.root.querySelector('progress')?.getAttribute('value')).toBe('50');
    req.flush({ data: media() });
    await t.settle();
    await t.respond('GET', '/media', mediaList([media()]));
    expect(t.root.querySelector('progress')).toBeNull();
    expect(t.root.querySelectorAll('.tile')).toHaveLength(1);
  });

  it('reports a server refusal of the upload in words', async () => {
    const t = mount(MediaComponent);
    await t.respond('GET', '/media', mediaList([]));
    t.fixture.debugElement.query((d) => d.name === 'iha-file-dropzone').triggerEventHandler('fileSelected', file('x.png', 'image/png'));
    await t.settle();
    await t.fail('POST', '/media', 422, { code: 'validation_error', message: 'Only image files are allowed (png, jpg, jpeg, webp, gif).' });
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('Only image files are allowed');
  });

  it('edits alt text inline, copies the public URL, and deletes after a warning about broken images', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const t = mount(MediaComponent);
    await t.respond('GET', '/media', mediaList([media()]));

    // No settle here: whenStable would also wait out the two seconds after which the label reverts.
    t.button('Copy URL')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    t.fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/uploads/office-1.png`);
    expect(t.button('Copied')).toBeTruthy();

    await t.click('Edit alt text');
    await t.type('#alt-m1', 'Our office');
    await t.click('Save');
    const req = t.request('PATCH', '/media/m1/alt');
    expect(req.request.body).toEqual({ altText: 'Our office' });
    req.flush({ data: media({ altText: 'Our office' }) });
    await t.settle();
    expect(t.text('.alt')).toBe('Our office');

    await t.click('Delete');
    expect(t.dialog()?.textContent).toContain('will show a broken image');
    await t.click('Delete image', t.dialog()!);
    await t.respond('DELETE', '/media/m1', { deleted: true });
    await t.respond('GET', '/media', mediaList([]));
    expect(t.text('ih-empty-state')).toContain('Upload the first image above.');
  });

  it('hides upload, alt editing and delete from a role without media.manage', async () => {
    const t = mount(MediaComponent, { capabilities: ['admin.cms.access'] });
    await t.respond('GET', '/media', mediaList([media({ actions: { edit: false, delete: false } })]));
    expect(t.root.querySelector('iha-file-dropzone')).toBeNull();
    expect(t.button('Edit alt text')).toBeUndefined();
    expect(t.button('Delete')).toBeUndefined();
    expect(t.button('Copy URL')).toBeTruthy();
  });
});

const seoPage = (over: Partial<SeoPage> = {}): SeoPage => ({
  pageRef: 'home', label: 'Homepage', pageType: 'static', publicUrl: 'https://immigrationhorizons.com/', configured: false, updatedAt: null, actions: { edit: true },
  seoTitle: '', metaDescription: '', keywords: '', canonicalUrl: '', ogTitle: '', ogDescription: '', ogImage: '', twitterImage: '', slug: '', robots: 'index,follow', noindex: false, schemaType: 'WebPage', ...over,
});
const seoList = (items: SeoPage[]) => ({ items, robotsDirectives: ['index', 'noindex', 'follow', 'nofollow'], schemaTypes: ['WebPage', 'Organization', 'Service'] });

describe('Services and SEO', () => {
  it('Services is a read-only catalogue with a public preview and a link to each SEO record', async () => {
    const t = mount(ServicesComponent);
    const service: ServiceItem = { slug: 'eb1a', title: 'EB-1A', tagline: 'Extraordinary Ability', publicUrl: 'https://immigrationhorizons.com/services/eb1a', seoPageRef: 'service-eb1a', seo: { configured: false, seoTitle: '', hasDescription: false, noindex: false } };
    await t.respond('GET', '/services', { items: [service] });
    expect(t.text('tbody tr')).toContain('EB-1A');
    expect(t.text('tbody tr')).toContain('Not set');
    expect(t.button('View')?.getAttribute('href')).toBe('https://immigrationhorizons.com/services/eb1a');
    expect(t.button('Edit SEO')?.getAttribute('href')).toBe('/content/seo/service-eb1a');
    expect(t.root.querySelector('form, input, textarea')).toBeNull();
    expect(t.root.textContent).toContain("part of the website's code");
  });

  it('the SEO list states facts — title, description length, indexing, canonical — and no invented score', async () => {
    const t = mount(SeoListComponent);
    await t.respond('GET', '/seo', seoList([seoPage(), seoPage({ pageRef: 'about', label: 'About', seoTitle: 'About us', metaDescription: 'x'.repeat(140), noindex: true, canonicalUrl: 'https://immigrationhorizons.com/about' }), seoPage({ pageRef: '404', label: '404 Page', publicUrl: null })]));
    const rows = Array.from(t.root.querySelectorAll('tbody tr')).map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));
    expect(rows[0]).toContain('Not set');
    expect(rows[0]).toContain('Indexable');
    expect(rows[1]).toContain('140 characters');
    expect(rows[1]).toContain('Noindex');
    expect(t.root.querySelectorAll('tbody tr')[2].querySelector('a[target="_blank"]')).toBeNull();
    expect(t.root.textContent).not.toMatch(/score|%|\/100/i);
  });

  it('the SEO editor saves the whole record, tracks unsaved changes and shows field errors', async () => {
    const t = mount(SeoEditorComponent, { inputs: { pageRef: 'home' } });
    await t.respond('GET', '/seo', seoList([]));
    await t.respond('GET', '/seo/home', seoPage());
    expect(t.text('h1')).toBe('SEO: Homepage');
    expect(t.component.hasUnsavedChanges()).toBe(false);
    await t.type('#seoTitle', 'Immigration Horizons');
    expect(t.text('#seoTitle-hint')).toContain('20 characters');
    expect(t.component.hasUnsavedChanges()).toBe(true);
    await t.type('#canonicalUrl', 'javascript:alert(1)');
    await t.submit();
    const req = t.request('PUT', '/seo/home');
    expect(req.request.body).toMatchObject({ seoTitle: 'Immigration Horizons', canonicalUrl: 'javascript:alert(1)', robots: 'index,follow', noindex: false, schemaType: 'WebPage' });
    req.flush({ error: { code: 'validation_error', message: 'Please correct the highlighted fields.', fieldErrors: [{ field: 'canonicalUrl', message: 'Canonical URL must be an http(s) URL or a path starting with /.' }] } }, { status: 422, statusText: 'Unprocessable' });
    await t.settle();
    expect(t.root.querySelector('#canonicalUrl')?.getAttribute('aria-invalid')).toBe('true');

    await t.type('#canonicalUrl', 'https://immigrationhorizons.com/');
    await t.submit();
    await t.respond('PUT', '/seo/home', seoPage({ seoTitle: 'Immigration Horizons', canonicalUrl: 'https://immigrationhorizons.com/', configured: true, updatedAt: '2026-10-11T09:00:00.000Z' }));
    expect(t.component.hasUnsavedChanges()).toBe(false);
    expect(t.text('[role="status"]')).toBe('All changes saved');
  });

  it('keeps a legacy schema type selectable, and is read-only without seo.manage', async () => {
    const t = mount(SeoEditorComponent, { capabilities: ['admin.cms.access'], inputs: { pageRef: 'legacy' } });
    await t.respond('GET', '/seo', seoList([]));
    await t.respond('GET', '/seo/legacy', seoPage({ pageRef: 'legacy', label: 'legacy', schemaType: 'LegacyType', robots: 'max-snippet:20', actions: { edit: false } }));
    expect(Array.from(t.root.querySelectorAll('#schemaType option')).map((o) => o.textContent)).toContain('LegacyType');
    expect(Array.from(t.root.querySelectorAll('#robots option')).map((o) => o.textContent)).toContain('max-snippet:20');
    expect((t.root.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    expect(t.button('Save metadata')).toBeUndefined();
  });
});
