import ContactsLastUpdated from './NativeContactsLastUpdated';
export type { Contact } from './NativeContactsLastUpdated';

export function multiply(a: number, b: number): number {
  return ContactsLastUpdated.multiply(a, b);
}

// Paged API: Full list. On Android sorted by last updated desc; iOS order undefined.
export function getAllPaged(offset: number, limit: number) {
  return ContactsLastUpdated.getAll(offset, limit);
}

// Paged API: Delta list since a token.
// Android: token is a millisecond timestamp string.
// iOS: token is a base64-encoded CNChangeHistory token.
export function getUpdatedSincePaged(
  since: string,
  offset: number,
  limit: number
) {
  return ContactsLastUpdated.getUpdatedSince(since, offset, limit);
}

// Persisted-delta helpers
export function getPersistedSince() {
  return ContactsLastUpdated.getPersistedSince();
}

export function getUpdatedFromPersistedPaged(offset: number, limit: number) {
  return ContactsLastUpdated.getUpdatedFromPersisted(offset, limit);
}

export function commitPersisted(nextSince: string) {
  return ContactsLastUpdated.commitPersisted(nextSince);
}

// Convenience: stream all contacts in chunks. Yields arrays of contacts.
export async function* streamAll(pageSize = 200) {
  let offset = 0;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const page = await ContactsLastUpdated.getAll(offset, pageSize);
    if (!page || page.length === 0) break;
    yield page;
    offset += page.length;
  }
}

// Convenience: stream updated contacts in chunks. Yields arrays of contacts and returns final token.
export async function* streamUpdatedSince(since: string, pageSize = 200) {
  let offset = 0;
  let nextSince = since;
  // We keep the same `since` across pages; only adopt `nextSince` after finishing all pages
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { items, nextSince: proposed } =
      await ContactsLastUpdated.getUpdatedSince(since, offset, pageSize);
    if (!items || items.length === 0) {
      nextSince = proposed || nextSince;
      break;
    }
    yield { items } as any;
    offset += items.length;
    nextSince = proposed || nextSince;
  }
  return nextSince;
}

// Convenience: stream delta using native-persisted token. Returns final token committed.
export async function* streamUpdatedFromPersisted(pageSize = 200) {
  let offset = 0;
  let sessionToken: string | undefined;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { items, nextSince } =
      await ContactsLastUpdated.getUpdatedFromPersisted(offset, pageSize);
    if (sessionToken == null) sessionToken = nextSince;
    if (!items || items.length === 0) break;
    yield { items } as any;
    offset += items.length;
    if (items.length < pageSize) break;
  }
  if (sessionToken) ContactsLastUpdated.commitPersisted(sessionToken);
  return sessionToken || (await ContactsLastUpdated.getPersistedSince());
}
