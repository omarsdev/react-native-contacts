declare module "react-native" {
  export interface TurboModule {}

  export const TurboModuleRegistry: {
    get<T>(name: string): T | undefined;
    getEnforcing<T>(name: string): T;
  };

  export const NativeModules: Record<string, unknown>;

  export const Platform: {
    select<T>(spec: { ios?: T; android?: T; default?: T }): T | undefined;
  };
}
