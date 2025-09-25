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
    import { PermissionsAndroid, Platform } from 'react-native';

    export async function ensureContactsPermission() {
      if (Platform.OS !== 'android') return true;
      const res = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS
      );
      return res === PermissionsAndroid.RESULTS.GRANTED;
    }
    ```

- iOS: add usage description to your app `Info.plist` and rebuild pods.
  - Info.plist:
    ```xml
    <key>NSContactsUsageDescription</key>
    <string>This app needs access to your contacts to sync changes.</string>
    ```
  - iOS will show the permission prompt the first time you access contacts.

Type shapes

```ts
type Contact = {
  id: string;
  displayName: string;
  phoneNumbers: string[];
  givenName?: string | null;
  familyName?: string | null;
  // Android only; iOS sets null
  lastUpdatedAt?: number | null;
};

type PhoneNumberUpdate = {
  previous: string;
  current: string;
};

type PhoneNumberChanges = {
  created: string[];
  deleted: string[];
  updated: PhoneNumberUpdate[];
};

type ContactChange = Contact & {
  changeType: 'created' | 'updated' | 'deleted';
  isDeleted: boolean;
  phoneNumberChanges: PhoneNumberChanges;
  previous?: {
    displayName?: string | null;
    givenName?: string | null;
    familyName?: string | null;
    phoneNumbers: string[];
  } | null;
};

type UpdatedPageBase = {
  nextSince: string;
  totalContacts: number;
};

type UpdatedPage = UpdatedPageBase & {
  mode: 'delta' | 'full';
  items: ContactChange[];
};
```

API reference & examples

### Types

| Type                      | Description                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `type Contact`            | Normalised contact record returned by all APIs. Includes optional `givenName`, `familyName`, and `lastUpdatedAt` (Android only). |
| `type PhoneNumberUpdate`  | Represents an individual phone number that changed within a contact delta (`previous` → `current`).                              |
| `type PhoneNumberChanges` | Buckets the numbers added/removed/updated in a `ContactChange`. Useful when reconciling diffs.                                   |
| `type ContactChange`      | Extends `Contact` with delta metadata (`changeType`, `isDeleted`, `phoneNumberChanges`, and an optional `previous` snapshot).    |
| `type UpdatedPage`        | Page returned by paging APIs (`mode`, `items`, `nextSince`, and `totalContacts` so you know the device book size). Items are always `ContactChange[]`. |

### Functions (promise / async)

- `getById(id: string): Promise<Contact | null>`
  - Look up a single contact by its native identifier. Resolves to `null` if the contact no longer exists or the identifier was empty.

  ```ts
  const maybeAlice = await getById('42');
  if (maybeAlice) {
    console.log('Found contact', maybeAlice.displayName);
  }
  ```

- `getPersistedSince(): Promise<string>`
  - Reads the last token that was committed natively (empty string if nothing has been stored yet). Handy when resuming delta sync in a fresh JS session.

  ```ts
  const lastToken = await getPersistedSince();
  console.log('Native token:', lastToken);
  ```

- `commitPersisted(nextSince: string): Promise<void>`
  - Persists the supplied token on the native side so subsequent delta calls start from that point. On iOS this also rebuilds the fingerprint snapshot.

  ```ts
  await commitPersisted(nextToken);
  ```

- `getAll(): Promise<Contact[]>`
  - Convenience helper that returns the full native contact list in one call.

  ```ts
  const everyone = await getAll();
  console.log('Fetched contacts', everyone.length);
  ```

- `getUpdatedSincePaged(since: string, offset: number, limit: number): Promise<UpdatedPage>`
  - Fetch a delta page using an explicit token. When native change tracking is available the result is `{ mode: 'delta' }` with changed contacts and the next token. If the platform cannot supply a delta token—or you pass an empty token on first synchronisation—it returns `{ mode: 'full' }` so you can re-sync ordinary contact pages (still respecting `offset`/`limit`). Token format differs by platform: Android always returns a millisecond timestamp, while iOS may return a base64-encoded `CNChangeHistory` token (e.g. `YnBsaXN0…`) or, when history is unavailable, a synthetic `fp:<timestamp>` token.

  ```ts
  const page = await getUpdatedSincePaged(lastToken, 0, 200);
  if (page.mode === 'full') {
    page.items.forEach((change) => console.log('Full contact', change.id));
  } else {
    page.items.forEach((change) => console.log(change.changeType, change.id));
  }
  console.log('Total contacts on device', page.totalContacts);
  ```

  - Need to walk every page? Use `getUpdatedSincePaged.listen` to stream until exhaustion (return `false` from the handler to stop early). `pageSize` is optional and defaults to `300`.

  ```ts
  await getUpdatedSincePaged.listen(
    { since: lastToken, pageSize: 250 },
    async (page) => {
      console.log(
        `Page mode=${page.mode} size=${page.items.length} total=${page.totalContacts}`
      );
    }
  );
  ```

  - Streaming signature: `getUpdatedSincePaged.listen(handler, options?)` or `getUpdatedSincePaged.listen(options, handler)`. The handler can be async and should return `false` to stop fetching. `options` accepts `{ since?: string; offset?: number; pageSize?: number }`.

> iOS tokens:
>
> - Real change-history tokens look like long base64 strings (`YnBsaXN0MDD…`).
> - Fallback fingerprints use the `fp:<timestamp>` format when history is disabled or unchanged.

Quick start

```ts
import {
  commitPersisted,
  getPersistedSince,
  getUpdatedSincePaged,
} from '@omarsdev/react-native-contacts';
import { ensureContactsPermission } from './permissions'; // from snippet above

// Delta or baseline sync (falls back to full pages when native tokens are unavailable)
if (await ensureContactsPermission()) {
  const persistedSince = await getPersistedSince();
  const pageSize = 300;
  let nextSince: string | undefined = persistedSince;
  let usedFullFallback = false;

  await getUpdatedSincePaged.listen(
    { since: persistedSince, pageSize },
    (page) => {
      if (page.nextSince) nextSince = page.nextSince;
      if (!page.items.length) return false;
      const label = page.mode === 'full' ? 'Contacts page' : 'Delta page';
      console.log(
        `${label}: ${page.items.length} items (total contacts ${page.totalContacts})`
      );
      if (page.mode === 'full') usedFullFallback = true;
      return page.items.length >= pageSize;
    }
  );

  if (nextSince && nextSince !== persistedSince) {
    await commitPersisted(nextSince);
  } else if (usedFullFallback && !nextSince) {
    console.log('Full snapshot processed; no token persisted yet.');
  }
}
```

## Example scenarios

The example app in `example/src/screens/ContactsDemoScreen.tsx` walks through the most common flows. The snippets below highlight the key cases in isolation:

```ts
import {
  commitPersisted,
  getById,
  getPersistedSince,
  getUpdatedSincePaged,
} from '@omarsdev/react-native-contacts';
import type { Contact, ContactChange } from '@omarsdev/react-native-contacts';

// 1. Request permission on Android before touching contacts.
await ensureContactsPermission();

// 2. Pull the delta (or fallback full pages) since the last committed token and persist progress.
const persistedSince = await getPersistedSince();
const pageSize = 300;
let sessionToken = persistedSince;
let totalContacts: number | undefined;
const delta: ContactChange[] = [];
let fullFallback: Contact[] = [];

await getUpdatedSincePaged.listen(
  { since: persistedSince, pageSize },
  (page) => {
    if (page.nextSince) sessionToken = page.nextSince;
    if (!page.items.length) return false;
    totalContacts = page.totalContacts;
    if (page.mode === 'delta') {
      delta.push(...page.items);
    } else {
      fullFallback = fullFallback.concat(page.items);
    }
    return page.items.length >= pageSize;
  }
);

if (sessionToken && sessionToken !== persistedSince) {
  await commitPersisted(sessionToken);
}

console.log('Total contacts reported by native layer', totalContacts ?? 'unknown');

// 3. Full fallback pages can be handled like a baseline rebuild.
console.log('Full snapshot contacts (if fallback)', fullFallback.length);

// 4. Look up a single contact by identifier (helpful after any baseline rebuild).
const singleContact = await getById('12345'); // returns `null` if the contact was deleted
```

Platform details

- Android
  - Uses `ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP` for sorting and delta (timestamp filter).
  - `lastUpdatedAt` is set from this value.
- iOS
  - Change history: uses CNContactStore change-history tokens when available.
  - Fingerprint fallback: when change history is unavailable or returns no events, a native snapshot (id → fingerprint of name + normalized numbers) detects adds/edits; snapshot updates on `commitPersisted`.
  - Synthetic tokens: when the system token doesn’t advance, we synthesize `fp:<timestamp>` to ensure forward progress.
  - Delta payloads include `changeType`, a `previous` snapshot (when available), and `phoneNumberChanges` summarising added, updated, and deleted numbers.

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
