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
});
