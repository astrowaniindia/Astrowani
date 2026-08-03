/**
 * @format
 */

// Polyfill TextEncoder/TextDecoder for Supabase Realtime
import { TextEncoder, TextDecoder } from 'text-encoding';
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
// Registers messaging().setBackgroundMessageHandler (and the other FCM listeners). Must be
// imported directly from index.js, not just from App.js — when Android wakes the app for a
// background/killed-state FCM message, it runs a minimal "headless JS" context that only
// executes index.js's top-level code, never the React component tree. Importing this only via
// App.js meant the handler was never registered in that context ("No task registered for key
// ReactNativeFirebaseMessagingHeadlessTask"), so every backgrounded push silently vanished.
import './src/utils/PushNotification';

AppRegistry.registerComponent(appName, () => App);
