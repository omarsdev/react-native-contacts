const path = require('path');

module.exports = {
  dependencies: {
    'react-native-contacts-last-updated': {
      // Point autolinking at the library root sitting one level up
      root: path.resolve(__dirname, '..'),
    },
  },
};
