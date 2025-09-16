import Native from "./specs/NativeContactsLastUpdated";

export type {
  Contact,
  GetOptions,
  IOSMode,
} from "./specs/NativeContactsLastUpdated";

export async function requestPermission() {
  return Native.requestPermission();
}

export async function hasPermission() {
  return Native.hasPermission();
}

export async function getContactsSortedByLastUpdated(options?: GetOptions) {
  return Native.getContactsSortedByLastUpdated(options);
}
