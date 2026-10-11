import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BlogPost } from '../../core/api/admin.types';
import { mount, paged } from '../../testing/harness';
import { BlogEditorComponent } from './blog-editor';
import { BlogListComponent } from './blog-list';

const post = (over: Partial<BlogPost> = {}): BlogPost => ({
  id: 'p1', title: 'How the NIW prongs fit together', slug: 'niw-prongs', category: 'EB-2 NIW', excerpt: 'A summary.', content: '<p>Body</p>', coverImage: '',
  author: 'Immigration Horizons Team', tags: ['niw', 'eb-2'], readingTime: 4, published: false, publishDate: null, createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z', previewUrl: null, actions: { edit: true, publish: true, delete: true }, ...over,
});
const CATEGORIES = ['EB-2 NIW', 'EB-1A', 'Immigration Tips'];
const list = (items: BlogPost[]) => paged(items, { categories: CATEGORIES });

describe('Blog list', () => {
  it('shows each post with its status in words, and a website link only for a post that is live', async () => {
    const t = mount(BlogListComponent);
    expect(t.root.querySelector('ih-skeleton')).toBeTruthy();
    await t.respond('GET', '/blog', list([post(), post({ id: 'p2', title: 'Live post', slug: 'live', published: true, previewUrl: 'https://immigrationhorizons.com/blog/live' })]));
    const rows = Array.from(t.root.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Draft');
    expect(rows[0].querySelector('a[target="_blank"]')).toBeNull();
    expect(rows[1].textContent).toContain('Published');
    expect(rows[1].querySelector('a[target="_blank"]')?.getAttribute('href')).toBe('https://immigrationhorizons.com/blog/live');
    expect(t.button('New post')?.getAttribute('href')).toBe('/content/blog/new');
    expect(t.root.querySelector('caption')?.textContent).toBe('Blog posts');
  });

  it('sends search, status and category to the server and explains an empty result', async () => {
    const t = mount(BlogListComponent);
    await t.respond('GET', '/blog', list([post()]));
    await t.type('#blog-search', '  prongs ');
    await t.type('#blog-status', 'draft');
    const req = t.request('GET', '/blog');
    expect(req.request.params.get('search')).toBe('prongs');
    expect(req.request.params.get('status')).toBe('draft');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ data: list([]) });
    await t.settle();
    expect(t.text('ih-empty-state')).toContain('No post matches these filters.');
  });

  it('publishes from the list and updates the row in place', async () => {
    const t = mount(BlogListComponent);
    await t.respond('GET', '/blog', list([post()]));
    await t.click('Publish');
    const req = t.request('POST', '/blog/p1/publish');
    expect(req.request.body).toEqual({ published: true });
    req.flush({ data: post({ published: true, previewUrl: 'https://immigrationhorizons.com/blog/niw-prongs' }) });
    await t.settle();
    expect(t.text('tbody tr')).toContain('Published');
    expect(t.button('Unpublish')).toBeTruthy();
  });

  it('asks before deleting, names the post, and deletes only on confirmation', async () => {
    const t = mount(BlogListComponent);
    await t.respond('GET', '/blog', list([post()]));
    await t.click('Delete');
    expect(t.dialog()?.textContent).toContain('How the NIW prongs fit together');
    await t.click('Cancel', t.dialog()!);
    t.http.expectNone((r) => r.method === 'DELETE');
    await t.click('Delete');
    await t.click('Delete post', t.dialog()!);
    await t.respond('DELETE', '/blog/p1', { deleted: true });
    await t.respond('GET', '/blog', list([]));
    expect(t.text('ih-empty-state')).toContain('Write the first post');
  });

  it('shows a retryable error, and hides every mutation from a role that cannot manage the blog', async () => {
    const t = mount(BlogListComponent, { capabilities: ['admin.cms.access'] });
    await t.fail('GET', '/blog', 500, { code: 'server_error', message: 'Internal Server Error' });
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('Posts could not be loaded');
    await t.click('Try Again');
    await t.respond('GET', '/blog', list([post({ actions: { edit: false, publish: false, delete: false } })]));
    expect(t.button('New post')).toBeUndefined();
    expect(t.button('Publish')).toBeUndefined();
    expect(t.button('Delete')).toBeUndefined();
  });
});

describe('Blog editor', () => {
  const open = async (existing?: BlogPost) => {
    const t = mount(BlogEditorComponent, { inputs: existing ? { id: existing.id } : {} });
    await t.respond('GET', '/blog', list([]));
    if (existing) await t.respond('GET', `/blog/${existing.id}`, existing);
    return t;
  };

  it('creates a draft: tags become a list, nothing is published by default, and the editor moves to the new post', async () => {
    const t = await open();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    expect(t.text('h1')).toBe('New post');
    await t.type('#title', 'A new post');
    await t.type('#excerpt', 'Short summary');
    await t.type('#tags', ' niw , , eb-2 ');
    expect(t.text('#excerpt-hint')).toBe('13 / 300 characters');
    expect(t.component.hasUnsavedChanges()).toBe(true);
    expect(t.text('[role="status"]')).toBe('Unsaved changes');

    await t.click('Save draft');
    const req = t.request('POST', '/blog');
    expect(req.request.body).toMatchObject({ title: 'A new post', excerpt: 'Short summary', tags: ['niw', 'eb-2'], slug: '' });
    expect('published' in req.request.body).toBe(false);
    req.flush({ data: post({ id: 'new1', title: 'A new post' }) });
    await t.settle();
    expect(navigate).toHaveBeenCalledWith(['/content/blog', 'new1'], { replaceUrl: true });
    expect(t.component.hasUnsavedChanges()).toBe(false);
  });

  it('shows server validation beside the field it belongs to and keeps what was typed', async () => {
    const t = await open();
    await t.type('#title', 'Dup');
    await t.click('Save draft');
    await t.fail('POST', '/blog', 409, { code: 'conflict', message: 'Another post already uses that slug.', fieldErrors: [{ field: 'slug', message: 'Another post already uses that slug.' }] });
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('already uses that slug');
    expect(t.root.querySelector('#slug')?.getAttribute('aria-invalid')).toBe('true');
    expect((t.root.querySelector('#title') as HTMLInputElement).value).toBe('Dup');
    expect(t.component.hasUnsavedChanges()).toBe(true);
  });

  it('loads an existing post, publishes it in the same save, and offers the website link once it is live', async () => {
    const t = await open(post());
    expect(t.text('h1')).toBe('Edit post');
    expect((t.root.querySelector('#tags') as HTMLInputElement).value).toBe('niw, eb-2');
    expect(t.text('.page-subtitle .badge')).toBe('Draft');
    expect(t.component.hasUnsavedChanges()).toBe(false);
    expect(t.button('View on website')).toBeUndefined();

    await t.click('Publish');
    const req = t.request('PATCH', '/blog/p1');
    expect(req.request.body.published).toBe(true);
    expect('publishDate' in req.request.body).toBe(false); // untouched date is not re-sent
    req.flush({ data: post({ published: true, publishDate: '2026-10-11T09:00:00.000Z', previewUrl: 'https://immigrationhorizons.com/blog/niw-prongs' }) });
    await t.settle();
    expect(t.text('.page-subtitle .badge')).toBe('Published');
    expect(t.button('View on website')?.getAttribute('href')).toBe('https://immigrationhorizons.com/blog/niw-prongs');
    expect(t.button('Unpublish')).toBeTruthy();
    expect(t.button('Save changes')).toBeTruthy();
  });

  it('is read-only for a role without blog.manage', async () => {
    const t = mount(BlogEditorComponent, { capabilities: ['admin.cms.access'], inputs: { id: 'p1' } });
    await t.respond('GET', '/blog', list([]));
    await t.respond('GET', '/blog/p1', post({ actions: { edit: false, publish: false, delete: false } }));
    expect((t.root.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    expect(t.button('Save draft')).toBeUndefined();
    expect(t.button('Delete')).toBeUndefined();
    expect(t.root.textContent).toContain('your role cannot change it');
    expect(t.component.hasUnsavedChanges()).toBe(false);
  });

  it('deletes after confirmation and returns to the list', async () => {
    const t = await open(post());
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await t.click('Delete');
    await t.click('Delete post', t.dialog()!);
    await t.respond('DELETE', '/blog/p1', { deleted: true });
    expect(navigate).toHaveBeenCalledWith(['/content/blog']);
  });

  it('reports a post that cannot be loaded instead of an empty form', async () => {
    const t = mount(BlogEditorComponent, { inputs: { id: 'gone' } });
    await t.respond('GET', '/blog', list([]));
    await t.fail('GET', '/blog/gone', 404, { code: 'not_found', message: 'Blog post was not found.' });
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('Blog post was not found.');
    expect(t.root.querySelector('form')).toBeNull();
  });
});
