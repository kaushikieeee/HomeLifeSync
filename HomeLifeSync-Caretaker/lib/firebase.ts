/**
 * Firebase client — used by the caretaker Next.js app.
 *
 * Setup:
 * 1. Go to https://console.firebase.google.com → New project → "HomeLifeSync"
 * 2. Add a Web App → copy the firebaseConfig values below
 * 3. Enable Realtime Database
 * 4. [PROTOTYPE] Realtime Database rules are OPEN so the caretaker, tablet and
 *    elder apps can sync WITHOUT any authentication. Paste (Firebase console →
 *    Realtime Database → Rules → Publish) exactly:
 *    {
 *      "rules": { ".read": true, ".write": true }
 *    }
 *    (The strict auth-required set lives in /firebase-database.rules.json.)
 * 5. Enable Cloud Messaging
 *
 * NOTE: no Firebase Auth is used in this prototype — sync relies entirely on
 * the open rules above. Anyone with the DB URL could read location data or
 * trigger commands (RING/SOS/etc.) on the elder's phone, so lock these rules
 * down before this leaves prototype stage.
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            || '',
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        || '',
  databaseURL:       process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL       || '',
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         || '',
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             || '',
};

// True when the caretaker build ships with Firebase env vars → a real elder
// device feed is available. The tablet falls back to its local simulation
// (and the caretaker's connect wizard) when this is false.
export const firebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY
);

// Singleton — safe to call multiple times (Next.js hot-reload)
let app: FirebaseApp;
let db:  Database;

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length === 0
      ? initializeApp(firebaseConfig)
      : getApps()[0];
  }
  return app;
}

export function getFirebaseDb(): Database {
  if (!db) db = getDatabase(getFirebaseApp());
  return db;
}
