const path = require('path');
const {getDefaultConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const packageRoot = path.resolve(__dirname, '..');

const defaultConfig = getDefaultConfig(__dirname);

module.exports = {
  ...defaultConfig,
  watchFolders: [...(defaultConfig.watchFolders ?? []), packageRoot],
  resolver: {
    ...defaultConfig.resolver,
    extraNodeModules: {
      ...(defaultConfig.resolver?.extraNodeModules ?? {}),
      'react-native-contacts-last-updated': packageRoot,
      // Ensure modules resolved from the package use the app's copies
      'react': path.join(projectRoot, 'node_modules/react'),
      'react-native': path.join(projectRoot, 'node_modules/react-native'),
      '@babel/runtime': path.join(projectRoot, 'node_modules/@babel/runtime'),
    },
  },
};
