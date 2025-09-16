module.exports = {
  dependency: {
    platforms: {
      ios: {
        podspec: './react-native-contacts-last-updated.podspec',
      },
      android: {
        sourceDir: './android',
        packageImportPath: 'com.contactsupdated.ContactsLastUpdatedPackage',
        packageInstance: 'new ContactsLastUpdatedPackage()',
      },
    },
  },
};
