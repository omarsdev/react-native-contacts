import type { Spec } from "../src/specs/NativeContactsLastUpdated";
import type { TurboModule } from "react-native";

type RNTestGlobal = typeof globalThis & {
  __turboModuleProxy?: {
    get<T extends TurboModule>(name: string): T | undefined;
    getEnforcing<T extends TurboModule>(name: string): T;
  };
};

const originalProxy = (globalThis as RNTestGlobal).__turboModuleProxy;

const createNativeMock = (): Spec => ({
  getContactsSortedByLastUpdated: jest.fn(async () => []),
  requestPermission: jest.fn(async () => "granted" as const),
  hasPermission: jest.fn(async () => true),
});

afterEach(() => {
  (globalThis as RNTestGlobal).__turboModuleProxy = originalProxy;
  jest.resetModules();
  jest.resetAllMocks();
  jest.dontMock("react-native");
});

describe("Native module resolution", () => {
  it("uses TurboModuleRegistry when the TurboModule proxy is present", () => {
    const fakeNative = createNativeMock();
    const getMock = jest.fn(() => fakeNative);

    (globalThis as RNTestGlobal).__turboModuleProxy = {
      get: getMock,
      getEnforcing: jest.fn(),
    };

    jest.doMock("react-native", () => ({
      TurboModuleRegistry: { get: getMock, getEnforcing: jest.fn() },
      NativeModules: {},
      Platform: { select: jest.fn(() => undefined) },
    }));

    jest.isolateModules(() => {
      const Native = require("../src/specs/NativeContactsLastUpdated").default as Spec;
      expect(Native).toBe(fakeNative);
      expect(getMock).toHaveBeenCalledWith("ContactsLastUpdated");
    });
  });

  it("falls back to NativeModules when TurboModule proxy is missing", () => {
    delete (globalThis as RNTestGlobal).__turboModuleProxy;

    const fakeNative = createNativeMock();
    const getMock = jest.fn(() => undefined);

    jest.doMock("react-native", () => ({
      TurboModuleRegistry: { get: getMock, getEnforcing: jest.fn() },
      NativeModules: { ContactsLastUpdated: fakeNative },
      Platform: { select: jest.fn(() => undefined) },
    }));

    jest.isolateModules(() => {
      const Native = require("../src/specs/NativeContactsLastUpdated").default as Spec;
      expect(Native).toBe(fakeNative);
      expect(getMock).toHaveBeenCalledWith("ContactsLastUpdated");
    });
  });

  it("throws a helpful error when the native module is unavailable", () => {
    delete (globalThis as RNTestGlobal).__turboModuleProxy;

    jest.doMock("react-native", () => ({
      TurboModuleRegistry: { get: jest.fn(() => undefined), getEnforcing: jest.fn() },
      NativeModules: {},
      Platform: { select: jest.fn(() => undefined) },
    }));

    expect(() =>
      jest.isolateModules(() => {
        require("../src/specs/NativeContactsLastUpdated");
      })
    ).toThrow(/doesn't seem to be linked correctly/);
  });
});
