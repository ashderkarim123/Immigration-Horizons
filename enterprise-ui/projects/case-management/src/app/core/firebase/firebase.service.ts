import { Injectable } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAnalytics, Analytics } from 'firebase/analytics';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  public readonly app: FirebaseApp;
  public readonly analytics: Analytics;

  constructor() {
    this.app = initializeApp(environment.firebase);
    this.analytics = getAnalytics(this.app);
  }
}
