# react-native-contacts-last-updated

Access the device address book and track when contacts were last touched. This package exposes a single API surface that falls back gracefully when the new TurboModule system is unavailable.

## Installation

```sh
yarn add @omarsdev/react-native-contacts-last-updated

# iOS
cd ios && pod install
```

Rebuild your app after installing. The module automatically uses the TurboModule bridge when it is available, and falls back to the classic `NativeModules` bridge otherwise.

## Usage

```ts
import {
  getContactsSortedByLastUpdated,
  hasPermission,
  requestPermission,
  type GetOptions,
} from "@omarsdev/react-native-contacts-last-updated";

async function loadContacts() {
  const status = await requestPermission();
  if (status !== "granted") {
    return [];
  }

  const options: GetOptions = {
    iosMode: "cache",
    include: { phones: true, emails: false },
  };

  return getContactsSortedByLastUpdated(options);
}
```

## Testing

This repository uses Jest with `ts-jest` to verify the JavaScript bridge picks the correct native implementation.

```sh
yarn install
yarn test
```

The tests simulate both TurboModule and `NativeModules` environments and assert that missing native bindings surface the helpful linking error.
