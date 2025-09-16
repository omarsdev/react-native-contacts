# @omarsdev/react-native-contacts

Contacts at scale for React Native, with fast first-run paging and efficient “delta since last sync” on Android and iOS.

Why this library

- Large address books without jank: fetch 10k+ contacts in pages (200–500) to keep UI responsive.
- Real delta sync: only fetch contacts that changed since your last run.
- Native tokens, minimal JS state: tokens are persisted natively to avoid storing massive lists in JS.
- Android sorted by last updated: newest changes first for better UX.
- iOS resilient strategy: uses Contacts change history when available, and a native fingerprint snapshot fallback when it isn’t.

Install

```sh
# with Yarn
yarn add @omarsdev/react-native-contacts

# with npm
npm install @omarsdev/react-native-contacts
```

Permissions

- Android: request `READ_CONTACTS` at runtime before usage.
  - Optional (manifest) — if you prefer declaring in your app too:
    ```xml
    <!-- android/app/src/main/AndroidManifest.xml -->
    <manifest ...>
      <uses-permission android:name="android.permission.READ_CONTACTS" />
    </manifest>
    ```
  - Runtime request (JS):
    ```ts
    import {PermissionsAndroid, Platform} from 'react-native'

    export async function ensureContactsPermission() {
      if (Platform.OS !== 'android') return true
      const res = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS
      )
      return res === PermissionsAndroid.RESULTS.GRANTED
    }
    ```
- iOS: add usage description to your app `Info.plist` and rebuild pods.
  - Info.plist:
    ```xml
    <key>NSContactsUsageDescription</key>
    <string>This app needs access to your contacts to sync changes.</string>
    ```
  - iOS will show the permission prompt the first time you access contacts.

Type shape

```ts
type Contact = {
  id: string
  displayName: string
  phoneNumbers: string[]
  givenName?: string | null
  familyName?: string | null
  // Android only; iOS sets null
  lastUpdatedAt?: number | null
}
```

API reference (JS)

- `getAllPaged(offset: number, limit: number): Contact[]`
  - Paged full fetch. Android is sorted by last updated desc. iOS order is undefined.
- `getUpdatedSincePaged(since: string, offset: number, limit: number): { items: Contact[], nextSince: string }`
  - Paged delta since provided token.
  - Android token: millisecond timestamp string.
  - iOS token: base64 CNChangeHistory token (or synthetic `fp:<timestamp>` when change history doesn’t advance).
- `getPersistedSince(): string`
  - Returns the current native‑persisted token (empty string if none).
- `getUpdatedFromPersistedPaged(offset: number, limit: number): { items: Contact[], nextSince: string }`
  - Paged delta using the native‑persisted token without passing it from JS.
- `commitPersisted(nextSince: string): void`
  - Commits the token at the end of a delta session and advances the iOS snapshot baseline.
- `streamAll(pageSize?: number)`
  - Async generator yielding pages of `Contact[]` until exhausted.
- `streamUpdatedSince(since: string, pageSize?: number)`
  - Async generator yielding `{ items: Contact[] }` pages; returns the final token when done.
- `streamUpdatedFromPersisted(pageSize?: number)`
  - Async generator using the native token; returns the committed token when done.

Quick start

```ts
import { streamAll, streamUpdatedFromPersisted } from '@omarsdev/react-native-contacts'
import { ensureContactsPermission } from './permissions' // from snippet above

// First run: baseline in chunks (paged)
if (await ensureContactsPermission()) {
  for await (const page of streamAll(300)) {
    // page is Contact[]
    console.log('All page', page.length)
  }
}

// Next runs: delta in chunks (token stored natively)
if (await ensureContactsPermission()) {
  for await (const { items } of streamUpdatedFromPersisted(300)) {
    // items is Contact[] changed since last commit
    console.log('Delta page', items.length)
  }
  // streamUpdatedFromPersisted commits the new token automatically
}
```

Platform details

- Android
  - Uses `ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP` for sorting and delta (timestamp filter).
  - `lastUpdatedAt` is set from this value.
- iOS
  - Change history: uses CNContactStore change-history tokens when available.
  - Fingerprint fallback: when change history is unavailable or returns no events, a native snapshot (id → fingerprint of name + normalized numbers) detects adds/edits; snapshot updates on `commitPersisted`.
  - Synthetic tokens: when the system token doesn’t advance, we synthesize `fp:<timestamp>` to ensure forward progress.
  - Note: deleted contacts aren’t returned as items (no data to fetch by ID). If you need `deletedIds` surfaced, open an issue.

Recommended paging & usage

- Page size 200–500 works well for large books.
- Always commit a delta token after finishing a delta session.
- First run: do a full fetch; then do a delta to seed/commit a token.

Build & development

- Prereqs: Node 20+, Yarn 3 (Berry).
- Install deps and build the lib:
  - `yarn` (at repo root)
  - `yarn prepare` (runs bob/codegen; generates `lib/` and TS types)
- Example app — Android:
  - `cd example && yarn android`
- Example app — iOS:
  - `cd example/ios && pod install`
  - `cd .. && yarn ios`
- Using in your app:
  - `yarn add @omarsdev/react-native-contacts`
  - iOS: `cd ios && pod install`
  - Rebuild the app

Why install

- You need to sync very large contact sets without freezing the UI.
- You want reliable “delta since last run” on both Android and iOS.
- You don’t want to persist huge JS arrays; tokens are handled natively.
- You want Android sorted by latest updates and an iOS strategy that works even when change history is unavailable.

License

MIT

Contributing

- See CONTRIBUTING.md for development workflow and conventions.
