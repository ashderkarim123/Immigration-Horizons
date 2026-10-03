import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChatChannel, ChatMessage } from '../../../../core/api/chat.types';
import { ChatTabComponent } from './chat-tab.component';
import { mergeMessages, pollDelay, sortMessages } from './chat-state';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    channelId: 'c1',
    senderType: 'client',
    senderDisplayName: 'Casey',
    isOwn: false,
    body: 'Hello',
    threadRootId: null,
    replyCount: 0,
    attachments: [],
    editedAt: null,
    deletedAt: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    canEdit: false,
    canDelete: false,
    canRestore: false,
    ...overrides,
  };
}

const channel = (overrides: Partial<ChatChannel> = {}): ChatChannel => ({
  id: 'c1',
  name: 'Client & Team',
  description: '',
  audience: 'client_and_team',
  clientVisible: true,
  unreadCount: 0,
  canSend: true,
  ...overrides,
});

describe('chat-state', () => {
  it('merges by id and never lets an older copy overwrite a newer one', () => {
    const edited = message({ body: 'Edited', updatedAt: '2026-01-01T10:05:00.000Z' });
    const stalePoll = message({ body: 'Hello' });
    const merged = mergeMessages(mergeMessages(new Map(), [edited]), [stalePoll]);
    expect(merged.size).toBe(1);
    expect(merged.get('m1')?.body).toBe('Edited');
  });

  it('shows a message echoed by both the send response and the next poll once', () => {
    const merged = mergeMessages(mergeMessages(new Map(), [message()]), [message()]);
    expect(sortMessages(merged.values()).length).toBe(1);
  });

  it('orders oldest-first with the id as tiebreak', () => {
    const ordered = sortMessages([
      message({ id: 'b', createdAt: '2026-01-01T10:00:00.000Z' }),
      message({ id: 'a', createdAt: '2026-01-01T10:00:00.000Z' }),
      message({ id: 'c', createdAt: '2026-01-01T09:00:00.000Z' }),
    ]);
    expect(ordered.map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('backs off exponentially and caps the poll delay', () => {
    expect(pollDelay(4000, 0, 60000)).toBe(4000);
    expect(pollDelay(4000, 2, 60000)).toBe(16000);
    expect(pollDelay(4000, 10, 60000)).toBe(60000);
  });
});

describe('ChatTabComponent', () => {
  let fixture: ComponentFixture<ChatTabComponent>;
  let http: HttpTestingController;
  let component: ChatTabComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatTabComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ChatTabComponent);
    fixture.componentRef.setInput('caseId', 'case1');
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy(); // clears the poll timer and listeners
  });

  function open(channels: ChatChannel[] = [channel()], messages: ChatMessage[] = []): void {
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/channels').flush({ data: { case: { id: 'case1', caseNumber: 'IH-1', title: 'T' }, channels }, meta: { requestId: 'r' } });
    http.expectOne('/api/v1/staff/channels/c1/messages').flush({ data: { messages, nextCursor: null, syncCursor: null }, meta: { requestId: 'r' } });
    http.match('/api/v1/staff/channels/c1/attachable-documents').forEach((r) => r.flush({ data: { documents: [] }, meta: { requestId: 'r' } }));
    http.match('/api/v1/staff/channels/c1/read').forEach((r) => r.flush({ data: { unreadCount: 0 }, meta: { requestId: 'r' } }));
    fixture.detectChanges();
  }

  it('keeps the selected restricted conversation and draft after a management refresh', () => {
    const channels = [channel(), channel({id:'c2', name:'Review', audience:'restricted', clientVisible:false})];
    open(channels);
    component.selectChannel('c2');
    http.expectOne('/api/v1/staff/channels/c2/messages').flush({data:{messages:[],nextCursor:null,syncCursor:null},meta:{requestId:'r'}});
    http.match('/api/v1/staff/channels/c2/attachable-documents').forEach(request => request.flush({data:{documents:[]},meta:{requestId:'r'}}));
    component.text.set('Unsent restricted review note');
    component.loadChannels(true);
    http.expectOne('/api/v1/staff/cases/case1/channels').flush({data:{case:{id:'case1',caseNumber:'IH-1',title:'T'},channels},meta:{requestId:'r'}});
    expect(component.selectedChannelId()).toBe('c2');
    expect(component.text()).toBe('Unsent restricted review note');
    http.expectNone('/api/v1/staff/channels/c1/messages');
  });

  it('selects the shared client channel first and labels its audience with text', () => {
    open([channel({ id: 'c0', name: 'Strategy', audience: 'staff_only', clientVisible: false }), channel()], []);
    // staff-only channel c0 is listed first, but the client+team channel is preferred
    expect(component.selectedChannelId()).toBe('c1');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('CLIENT + TEAM');
    expect(text).toContain('STAFF ONLY');
    expect(text).toContain('The client can read this message');
  });

  it('opens the channel named by the Messages inbox deep link instead of the default pick', () => {
    fixture.componentRef.setInput('initialChannelId', 'c0');
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/channels').flush({ data: { case: { id: 'case1', caseNumber: 'IH-1', title: 'T' }, channels: [channel({ id: 'c0', name: 'Strategy', audience: 'staff_only', clientVisible: false }), channel()] }, meta: { requestId: 'r' } });
    http.expectOne('/api/v1/staff/channels/c0/messages').flush({ data: { messages: [], nextCursor: null, syncCursor: null }, meta: { requestId: 'r' } });
    http.match('/api/v1/staff/channels/c0/attachable-documents').forEach((r) => r.flush({ data: { documents: [] }, meta: { requestId: 'r' } }));
    expect(component.selectedChannelId()).toBe('c0');
  });

  it('renders client messages and marks the channel read through the newest non-own message', () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/staff/cases/case1/channels').flush({ data: { case: { id: 'case1', caseNumber: 'IH-1', title: 'T' }, channels: [channel({ unreadCount: 1 })] }, meta: { requestId: 'r' } });
    http.expectOne('/api/v1/staff/channels/c1/messages').flush({ data: { messages: [message({ body: 'Question from client' })], nextCursor: null, syncCursor: 'cur1' }, meta: { requestId: 'r' } });
    http.match('/api/v1/staff/channels/c1/attachable-documents').forEach((r) => r.flush({ data: { documents: [] }, meta: { requestId: 'r' } }));
    const read = http.expectOne('/api/v1/staff/channels/c1/read');
    expect(read.request.body).toEqual({ lastReadMessageId: 'm1' });
    read.flush({ data: { unreadCount: 0 }, meta: { requestId: 'r' } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Question from client');
    expect(component.channels()[0].unreadCount).toBe(0);
  });

  it('sends with an idempotency key, merges the echo once, and reuses the key when the send fails', () => {
    open();
    component.text.set('Reply to client');
    component.send();
    const first = http.expectOne('/api/v1/staff/channels/c1/messages');
    expect(first.request.method).toBe('POST');
    const key = first.request.body.idempotencyKey;
    expect(key).toBeTruthy();
    first.flush({ error: { message: 'boom' } }, { status: 500, statusText: 'Server Error' });
    expect(component.composeError()).toBeTruthy();
    expect(component.text()).toBe('Reply to client'); // draft kept

    component.send(); // retry
    const retry = http.expectOne('/api/v1/staff/channels/c1/messages');
    expect(retry.request.body.idempotencyKey).toBe(key);
    const sent = message({ id: 'm2', senderType: 'employee', isOwn: true, body: 'Reply to client', createdAt: '2026-01-01T10:01:00.000Z', updatedAt: '2026-01-01T10:01:00.000Z' });
    retry.flush({ data: sent, meta: { requestId: 'r' } }, { status: 201, statusText: 'Created' });
    http.match((r) => r.url.endsWith('/messages/newer')).forEach((r) => r.flush({ data: { messages: [sent], syncCursor: 'c2', hasMore: false }, meta: { requestId: 'r' } }));

    expect(component.rootMessages().filter((m) => m.id === 'm2').length).toBe(1);
    expect(component.text()).toBe('');
  });

  it('applies an incremental change (a client edit) without duplicating the message', () => {
    open([channel()], [message()]);
    component.sync();
    http
      .expectOne((r) => r.url === '/api/v1/staff/channels/c1/messages/newer')
      .flush({ data: { messages: [message({ body: 'Edited by client', updatedAt: '2026-01-01T10:09:00.000Z', editedAt: '2026-01-01T10:09:00.000Z' })], syncCursor: 'c3', hasMore: false }, meta: { requestId: 'r' } });
    expect(component.rootMessages().length).toBe(1);
    expect(component.rootMessages()[0].body).toBe('Edited by client');
  });

  it('surfaces a retryable error after repeated sync failures', () => {
    open();
    for (let i = 0; i < 3; i += 1) {
      component.sync();
      http.expectOne((r) => r.url === '/api/v1/staff/channels/c1/messages/newer').flush({ error: { message: 'down' } }, { status: 503, statusText: 'Unavailable' });
    }
    expect(component.syncError()).toBeTruthy();
  });

  it('hides the composer when the actor cannot send', () => {
    open([channel({ canSend: false })]);
    expect(fixture.nativeElement.querySelector('form.composer')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('not post in it');
  });
});
