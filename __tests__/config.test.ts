import fs from "fs";
import path from "path";

describe("package metadata", () => {
  const root = path.resolve(__dirname, "..");

  it("ships the podspec in the published files", () => {
    const pkg = require("../package.json");
    expect(pkg.files).toEqual(
      expect.arrayContaining(["react-native-contacts-last-updated.podspec"])
    );
    expect(pkg.files).not.toEqual(
      expect.arrayContaining(["react-native.config.js"])
    );
  });

  it("defines iOS sources in the podspec", () => {
    const podspec = fs.readFileSync(
      path.join(root, "react-native-contacts-last-updated.podspec"),
      "utf8"
    );
    expect(podspec).toMatch(/s\.source_files\s*=\s*"ios\/\*\*\/\*\.\{h,m,mm,swift}/);
  });

  it("imports React in the Swift bridge", () => {
    const bridge = fs.readFileSync(
      path.join(root, "ios", "ContactsLastUpdatedBridge.swift"),
      "utf8"
    );
    expect(bridge).toMatch(/import React/);
    expect(bridge).toMatch(/ContactsLastUpdatedSpec/);
    expect(bridge).toMatch(/@escaping RCTPromiseResolveBlock/);
  });

  it("exposes an Android ReactPackage", () => {
    const pkgSource = fs.readFileSync(
      path.join(
        root,
        "android",
        "src",
        "main",
        "java",
        "com",
        "contactsupdated",
        "ContactsLastUpdatedPackage.kt"
      ),
      "utf8"
    );
    expect(pkgSource).toContain("class ContactsLastUpdatedPackage : ReactPackage");
  });

  it("implements the TurboModule spec on Android", () => {
    const specSource = fs.readFileSync(
      path.join(
        root,
        "android",
        "src",
        "main",
        "java",
        "com",
        "contactsupdated",
        "NativeContactsLastUpdatedSpec.kt"
      ),
      "utf8"
    );
    expect(specSource).toContain("ReactModuleWithSpec");
    expect(specSource).toContain("TurboModule");
  });

  it("configures Kotlin support and clean manifest", () => {
    const gradle = fs.readFileSync(path.join(root, "android", "build.gradle"), "utf8");
    expect(gradle).toMatch(/kotlin-android/);
    expect(gradle).toMatch(/kotlin-stdlib/);

    const manifest = fs.readFileSync(
      path.join(root, "android", "src", "main", "AndroidManifest.xml"),
      "utf8"
    );
    expect(manifest).not.toMatch(/package=/);
  });

  it("defines a TurboModule spec for iOS", () => {
    const iosSpec = fs.readFileSync(
      path.join(root, "ios", "NativeContactsLastUpdatedSpec.swift"),
      "utf8"
    );
    expect(iosSpec).toContain("protocol ContactsLastUpdatedSpec");
    expect(iosSpec).toContain("RCTTurboModule");
  });
});
