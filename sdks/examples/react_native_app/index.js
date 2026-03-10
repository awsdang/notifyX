/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

setBackgroundMessageHandler(getMessaging(getApp()), async remoteMessage => {
  console.log(
    'Background push received:',
    remoteMessage?.messageId || 'unknown',
  );
});

AppRegistry.registerComponent(appName, () => App);
