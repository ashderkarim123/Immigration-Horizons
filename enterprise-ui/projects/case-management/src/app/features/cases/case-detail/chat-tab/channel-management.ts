import { Component, input, output, inject, signal, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../../core/api/api.service';
import { apiErrorMessage } from '../../../../core/api/api-error';
import { ChatChannel } from '../../../../core/api/chat.types';
interface ChannelMember { workspaceMemberId: string; displayName: string; memberType: string; channelMemberId: string | null }
@Component({ selector: 'ih-channel-management', standalone: true, imports: [FormsModule],
  template: `<details class="channel-management"><summary>Manage conversations</summary>
    @if (error()) { <p role="alert" class="alert alert-error">{{ error() }}</p> }
    @if (canCreate()) {
      <form (ngSubmit)="create()"><h4>Create a channel</h4>
        <label>Channel name<input name="newName" [(ngModel)]="newName" required maxlength="100" /></label>
        <label>Audience<select name="audience" [(ngModel)]="newVisibility"><option value="clients_and_team">Client and team</option><option value="employees_only">Staff only</option><option value="restricted_members">Selected members</option></select></label>
        <p>{{ newVisibility === 'clients_and_team' ? 'The client and all case team members can read this conversation.' : newVisibility === 'employees_only' ? 'Only staff assigned to this case can read this conversation.' : 'Only selected members and authorized operations administrators can read this conversation.' }}</p>
        <button class="btn btn-primary" type="submit" [disabled]="busy() || !newName.trim()">Create channel</button>
      </form>
    }
    @if (channel(); as selected) {
      @if (selected.canManage) { <form (ngSubmit)="rename()"><h4>Edit {{ selected.name }}</h4><label>Channel name<input name="name" [(ngModel)]="name" required maxlength="100" /></label><label>Description<textarea name="description" [(ngModel)]="description" maxlength="2000"></textarea></label><button class="btn btn-secondary" type="submit" [disabled]="busy() || !name.trim()">Save channel</button></form> }
      @if (selected.audience === 'restricted' && selected.canManageMembers) {
        <h4>Selected members</h4><button type="button" (click)="loadMembers()" [disabled]="busy()">Load members</button>
        <ul>@for (member of members(); track member.workspaceMemberId) { <li>{{ member.displayName }} · {{ member.memberType === 'client' ? 'Client' : 'Staff' }} <button type="button" (click)="toggleMember(member)" [disabled]="busy()">{{ member.channelMemberId ? 'Remove access' : 'Add access' }}</button></li> }</ul>
      }
      @if (selected.canArchive) {
        @if (confirmArchive()) { <p>Archive {{ selected.name }}? The conversation is retained in case history.</p><button type="button" (click)="archive()" [disabled]="busy()">Confirm archive</button> <button type="button" (click)="confirmArchive.set(false)">Cancel</button> }
        @else { <button type="button" (click)="confirmArchive.set(true)">Archive channel</button> }
      }
    }
    @if (canReorder() && channels().length > 1) {
      <h4>Conversation order</h4><ol>@for (item of channels(); track item.id; let index = $index) { <li>{{ item.name }} <button type="button" [attr.aria-label]="'Move ' + item.name + ' earlier'" [disabled]="index === 0 || busy()" (click)="move(index, -1)">↑</button><button type="button" [attr.aria-label]="'Move ' + item.name + ' later'" [disabled]="index === channels().length - 1 || busy()" (click)="move(index, 1)">↓</button></li> }</ol>
    }
  </details>`,
  styles: [`.channel-management { padding: 1rem; border: 1px solid var(--ih-border-light); border-radius: .5rem; margin-bottom: 1rem; } summary { cursor: pointer; font-weight: 600; } form { display: grid; gap: .7rem; margin: 1rem 0; max-width: 36rem; } label { display: grid; gap: .3rem; } input, select, textarea { padding: .6rem; border: 1px solid var(--ih-border-medium); border-radius: .3rem; font: inherit; } li { margin: .5rem 0; }`],
})
export class ChannelManagement implements OnChanges {
  private api = inject(ApiService);
  caseId = input.required<string>(); channels = input<ChatChannel[]>([]); channel = input<ChatChannel | null>(null);
  canCreate = input(false); canReorder = input(false); changed = output<void>();
  busy = signal(false); error = signal(''); members = signal<ChannelMember[]>([]); confirmArchive = signal(false);
  name = ''; description = ''; newName = ''; newVisibility = 'employees_only';
  private lastChannelId = '';
  ngOnChanges() { if (this.lastChannelId === (this.channel()?.id || '')) return; this.lastChannelId = this.channel()?.id || ''; this.name = this.channel()?.name || ''; this.description = this.channel()?.description || ''; this.members.set([]); this.confirmArchive.set(false); }
  private failure(error: unknown) { this.busy.set(false); this.error.set(apiErrorMessage(error, 'Could not update this conversation.')); }
  private begin() { if (this.busy()) return false; this.error.set(''); this.busy.set(true); return true; }
  create() { if (!this.newName.trim() || !this.begin()) return; this.api.post(`/staff/cases/${this.caseId()}/channels`, { name: this.newName, visibility: this.newVisibility, channelType: 'standard' }).subscribe({ next: () => { this.newName = ''; this.busy.set(false); this.changed.emit(); }, error: error => this.failure(error) }); }
  rename() { if (!this.channel() || !this.name.trim() || !this.begin()) return; this.api.patch(`/staff/channels/${this.channel()!.id}`, { name: this.name, description: this.description }).subscribe({ next: () => { this.busy.set(false); this.changed.emit(); }, error: error => this.failure(error) }); }
  archive() { if (!this.channel() || !this.begin()) return; this.api.post(`/staff/channels/${this.channel()!.id}/archive`, {}).subscribe({ next: () => { this.busy.set(false); this.confirmArchive.set(false); this.changed.emit(); }, error: error => this.failure(error) }); }
  loadMembers() { if (!this.channel() || !this.begin()) return; this.api.get<{ members: ChannelMember[] }>(`/staff/channels/${this.channel()!.id}/members`).subscribe({ next: ({ data }) => { this.members.set(data.members); this.busy.set(false); }, error: error => this.failure(error) }); }
  toggleMember(member: ChannelMember) { if (!this.channel() || !this.begin()) return; const path = `/staff/channels/${this.channel()!.id}/members`; const request = member.channelMemberId ? this.api.delete<{ members: ChannelMember[] }>(`${path}/${member.channelMemberId}`) : this.api.post<{ members: ChannelMember[] }>(path, { workspaceMemberId: member.workspaceMemberId }); request.subscribe({ next: ({ data }) => { this.members.set(data.members); this.busy.set(false); this.changed.emit(); }, error: error => this.failure(error) }); }
  move(index: number, direction: number) { if (!this.begin()) return; const ids = this.channels().map(channel => channel.id); [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]]; this.api.post(`/staff/cases/${this.caseId()}/channels/reorder`, { orderedChannelIds: ids }).subscribe({ next: () => { this.busy.set(false); this.changed.emit(); }, error: error => this.failure(error) }); }
}
