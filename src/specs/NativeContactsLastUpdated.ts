import type { TurboModule } from "react-native";
import { NativeModules, Platform, TurboModuleRegistry } from "react-native";

export type Phone = { label?: string; number: string };
export type Email = { label?: string; address: string };

export type Contact = {
  id: string;
  displayName: string;
  phones: Phone[];
  emails: Email[];
  lastUpdated: number | null; // ms since epoch or null
};

export type IOSMode = "alpha" | "cache";

export type GetOptions = {
  iosMode?: IOSMode; // default 'alpha'
  include?: { phones?: boolean; emails?: boolean }; // defaults true
};

export interface Spec extends TurboModule {
  getContactsSortedByLastUpdated(options?: GetOptions): Promise<Contact[]>;
  requestPermission(): Promise<"granted" | "denied" | "blocked">;
  hasPermission(): Promise<boolean>;
}

const LINKING_ERROR =
  `The package 'react-native-contacts-last-updated' doesn't seem to be linked correctly.\n` +
  "Make sure: \n" +
  Platform.select({
    ios: "- You have run 'pod install'\n",
    default: "",
  }) +
  "- You rebuilt the app after installing the package\n" +
  "- You are not using Expo managed workflow";

type RNGlobal = typeof globalThis & {
  __turboModuleProxy?: {
    getEnforcing<T extends TurboModule>(name: string): T;
    get<T extends TurboModule>(name: string): T | undefined;
  };
};

const globalProxy = globalThis as RNGlobal;

const Native: Spec | undefined = globalProxy.__turboModuleProxy
  ? TurboModuleRegistry.get<Spec>("ContactsLastUpdated")
  : (NativeModules.ContactsLastUpdated as Spec | undefined);

if (!Native) {
  throw new Error(LINKING_ERROR);
}

export default Native;
