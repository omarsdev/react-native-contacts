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
```

API reference & examples

### Types

| Type                      | Description                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `type Contact`            | Normalised contact record returned by all APIs. Includes optional `givenName`, `familyName`, and `lastUpdatedAt` (Android only). |
| `type PhoneNumberUpdate`  | Represents an individual phone number that changed within a contact delta (`previous` → `current`).                              |
| `type PhoneNumberChanges` | Buckets the numbers added/removed/updated in a `ContactChange`. Useful when reconciling diffs.                                   |
| `type ContactChange`      | Extends `Contact` with delta metadata (`changeType`, `isDeleted`, `phoneNumberChanges`, and an optional `previous` snapshot).    |

### Functions (synchronous)

- `getById(id: string): Contact | null`
  - Look up a single contact by its native identifier. Returns `null` if the contact no longer exists or if the identifier was empty.

  ```ts
  const maybeAlice = getById('42');
  if (maybeAlice) {
    console.log('Found contact', maybeAlice.displayName);
  }
  ```

- `getPersistedSince(): string`
  - Reads the last token that was committed natively (empty string if nothing has been stored yet). Handy when resuming delta sync in a fresh JS session.

  ```ts
  const lastToken = getPersistedSince();
  console.log('Native token:', lastToken);
  ```

- `commitPersisted(nextSince: string): void`
  - Persists the supplied token on the native side so subsequent delta calls start from that point. On iOS this also rebuilds the fingerprint snapshot.

  ```ts
  commitPersisted(nextToken);
  ```

- `multiply(a: number, b: number): number`
  - A simple sample used in the template (kept for backwards-compatibility with the RN library scaffold). Not used by the contacts flows.
  ```ts
  multiply(2, 3); // => 6
  ```

### Functions (promise / async)

- `getAllPaged(offset: number, limit: number): Contact[]`
  - Low-level paged fetch that mirrors the native call. On Android the result is sorted by `lastUpdatedAt` descending; iOS order is undefined.

  ```ts
  const first500 = await getAllPaged(0, 500);
  const next500 = await getAllPaged(500, 500);
  ```

- `getAll(options?: { offset?: number; limit?: number; pageSize?: number }): Promise<Contact[]>`
  - Convenience wrapper for `getAll`. When `limit` is provided it behaves like `getAllPaged`. Otherwise it will loop until all contacts are fetched (respecting `pageSize`).

  ```ts
  const everyone = await getAll({ pageSize: 400 });
  const pageTwo = await getAll({ offset: 400, limit: 200 });
  ```

- `getUpdatedSincePaged(since: string, offset: number, limit: number): { items: ContactChange[]; nextSince: string }`
  - Fetch a delta page using an explicit token. Returns changed contacts plus the token you should persist after processing all pages. Token format differs by platform (millisecond timestamp on Android, CNChangeHistory token or `fp:<timestamp>` on iOS).

  ```ts
  const { items, nextSince } = await getUpdatedSincePaged(lastToken, 0, 200);
  items.forEach((change) => console.log(change.changeType, change.id));
  ```

- `getUpdatedFromPersistedPaged(offset: number, limit: number): { items: ContactChange[]; nextSince: string }`
  - Same as above but the native layer provides the starting token (useful when you previously called `commitPersisted`).
  ```ts
  const page = await getUpdatedFromPersistedPaged(0, 300);
  ```

### Generators

- `streamAll(pageSize?: number)`
  - Async generator that yields `Contact[]` pages until the address book is exhausted. Under the hood it repeatedly calls `getAll`.

  ```ts
  for await (const contacts of streamAll(250)) {
    console.log('Received', contacts.length);
  }
  ```

- `streamUpdatedSince(since: string, pageSize?: number)`
  - Async generator that yields `{ items: ContactChange[] }` based on a provided token and returns the final token after the loop completes.

  ```ts
  let token = lastToken;
  for await (const { items } of streamUpdatedSince(token, 200)) {
    // process items
  }
  ```

- `streamUpdatedFromPersisted(pageSize?: number)`
  - Async generator that uses the native persisted token and commits the new token automatically when finished. Returns the committed token.
  ```ts
  const committedToken = await (async () => {
    let finalToken = '';
    for await (const { items } of streamUpdatedFromPersisted(200)) {
      finalToken = items.length ? finalToken : finalToken;
    }
    return finalToken;
  })();
  ```

Quick start

```ts
import {
  streamAll,
  streamUpdatedFromPersisted,
} from '@omarsdev/react-native-contacts';
import { ensureContactsPermission } from './permissions'; // from snippet above

// First run: baseline in chunks (paged)
if (await ensureContactsPermission()) {
  for await (const page of streamAll(300)) {
    // page is Contact[]
    console.log('All page', page.length);
  }
}

// Next runs: delta in chunks (token stored natively)
if (await ensureContactsPermission()) {
  for await (const { items } of streamUpdatedFromPersisted(300)) {
    // items is ContactChange[] describing created/updated/deleted contacts
    console.log('Delta page', items.length);
  }
  // streamUpdatedFromPersisted commits the new token automatically
}
```

## Example scenarios

The example app in `example/src/screens/ContactsDemoScreen.tsx` walks through the most common flows. The snippets below highlight the key cases in isolation:

```ts
import {
  commitPersisted,
  getAll,
  getById,
  getUpdatedFromPersistedPaged,
} from '@omarsdev/react-native-contacts';

// 1. Request permission on Android before touching contacts.
await ensureContactsPermission();

// 2a. Fetch the entire address book in batches (first run / re-baseline).
const allContacts: Contact[] = await getAll({ pageSize: 500 });

// 2b. Or fetch an explicit page (offset + limit) for infinite-scroll UI.
const pageTwo: Contact[] = await getAll({ offset: 500, limit: 300 });

// 3. Pull the delta since the last committed token and persist progress.
let offset = 0;
let sessionToken = '';
const delta: ContactChange[] = [];
for (;;) {
  const { items, nextSince } = await getUpdatedFromPersistedPaged(offset, 300);
  if (!sessionToken) sessionToken = nextSince;
  if (!items.length) break;
  delta.push(...items);
  offset += items.length;
  if (items.length < 300) break;
}
if (sessionToken) {
  commitPersisted(sessionToken);
}

// 4. Look up a single contact by identifier (helpful after `getAll`).
const singleContact = getById('12345'); // returns `null` if the contact was deleted
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
