import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'iha-not-found',
  imports: [RouterLink],
  template: `
    <div class="page-header"><h1>Page not found</h1></div>
    <p>That address is not part of the Admin Console. <a routerLink="/dashboard">Go to the dashboard</a>.</p>
  `,
})
export class AdminNotFound {}
