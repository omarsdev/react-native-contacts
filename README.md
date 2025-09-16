# react-native-contacts-last-updated

Access the device address book with support for:

- Paged fetch of all contacts (Android sorted by last updated, iOS order undefined)
- Paged delta sync (only contacts added/updated since a token)

## Installation


```sh
npm install react-native-contacts-last-updated
```


## Usage


```js
import {
  getAllPaged,
  getUpdatedSincePaged,
  streamAll,
  streamUpdatedSince,
  type Contact,
} from 'react-native-contacts-last-updated';

// First run: fetch everything in chunks to avoid blocking
for await (const page of streamAll(300)) {
  // page is Contact[]
  console.log('Got', page.length, 'contacts');
}

// Second run: fetch only changes since your saved token
// Android: token is a millisecond timestamp string (e.g., `${Date.now()}`)
// iOS: token is a base64-encoded CNChangeHistory token
let since = await loadTokenFromStorage();
let finalToken = since;
for await (const { items } of streamUpdatedSince(since, 300)) {
  // items is Contact[] of added/updated contacts
  console.log('Delta items', items.length);
}
// After finishing all pages, streamUpdatedSince returns the new token
finalToken = await (async () => {
  const iterator = streamUpdatedSince(since, 300);
  let r = await iterator.next();
  while (!r.done) r = await iterator.next();
  return r.value; // new token
})();
await saveTokenToStorage(finalToken);
```

Notes

- Android sorts by `ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP` (desc) and uses `Date.now()` as the next delta token.
- iOS does not expose per-contact last updated timestamps; full fetch order is undefined. For delta, we use `CNContactStore` change history tokens. On the first run, call `getAllPaged`/`streamAll` and store the token from `getUpdatedSincePaged('', 0, 1).nextSince` if desired.
- Ensure your app requests Contacts permission at runtime.

Permissions

- Android: the library declares `READ_CONTACTS` in its manifest. You must request runtime permission before calling APIs.
- iOS: add `NSContactsUsageDescription` to your app `Info.plist`.


## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
