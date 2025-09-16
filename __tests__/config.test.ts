import fs from "fs";
import path from "path";

describe("react-native config", () => {
  it("exposes podspec path and android package", () => {
    const config = require("../react-native.config.js");
    expect(config).toHaveProperty("dependency.platforms.ios.podspec");
    expect(config).toHaveProperty("dependency.platforms.android.packageImportPath", "com.contactsupdated.ContactsLastUpdatedPackage");
    expect(config).toHaveProperty("dependency.platforms.android.packageInstance", "new ContactsLastUpdatedPackage()");

    const podspecPath = config.dependency.platforms.ios.podspec as string;
    const resolved = path.resolve(__dirname, "..", podspecPath);
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it("includes podspec and config in published files", () => {
    const pkg = require("../package.json");
    expect(pkg.files).toEqual(
      expect.arrayContaining([
        "react-native-contacts-last-updated.podspec",
        "react-native.config.js",
      ])
    );
  });
});
