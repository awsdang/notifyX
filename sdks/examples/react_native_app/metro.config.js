const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const sdkRoot = path.resolve(projectRoot, '../../react-native');
const appNodeModules = path.resolve(projectRoot, 'node_modules');
const sdkNodeModules = path.resolve(sdkRoot, 'node_modules');

const config = {
  watchFolders: [sdkRoot],
  resolver: {
    unstable_enableSymlinks: true,
    nodeModulesPaths: [appNodeModules, sdkNodeModules],
    extraNodeModules: {
      '@notifyx/react-native': sdkRoot,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
