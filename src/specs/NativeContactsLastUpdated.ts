import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

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

export default TurboModuleRegistry.getEnforcing<Spec>("ContactsLastUpdated");
