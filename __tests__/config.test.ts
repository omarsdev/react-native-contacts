import fs from "fs";
import path from "path";

describe("react-native config", () => {
  it("exposes podspec path and android package", () => {
    const config = require("../react-native.config.js");
    expect(config).toHaveProperty("dependency.platforms.ios.podspecPath");
    expect(config).toHaveProperty("dependency.platforms.android.packageImportPath", "com.contactsupdated.ContactsLastUpdatedPackage");
    expect(config).toHaveProperty("dependency.platforms.android.packageInstance", "new ContactsLastUpdatedPackage()");

    const podspecPath = config.dependency.platforms.ios.podspecPath as string;
    const resolved = path.resolve(__dirname, "..", podspecPath);
    expect(fs.existsSync(resolved)).toBe(true);
  });
});
