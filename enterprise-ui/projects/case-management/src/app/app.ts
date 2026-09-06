import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FirebaseService } from './core/firebase/firebase.service';

@Component({
  imports: [RouterOutlet],
  selector: 'ih-root',
  template: '<router-outlet />',
})
export class App {
  private _firebase = inject(FirebaseService);
}
