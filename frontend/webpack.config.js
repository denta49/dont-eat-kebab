const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const Dotenv = require('dotenv-webpack');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);
  
  // Add the Dotenv plugin
  config.plugins.push(new Dotenv());
  
  // Customize the config before returning it.
  config.resolve.alias = {
    ...config.resolve.alias,
    'react-native$': 'react-native-web',
  };

  return config;
}; 