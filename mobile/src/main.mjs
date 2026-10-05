import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { configureNativeApi } from '../../frontend/src/api/client.js';
import { installNativeApiFetch, configureSessionRuntime } from '../../frontend/src/api/runtimeFetch.mjs';
import { createNativeApiFetch } from './native-fetch.mjs';
import { createSessionStorage } from './session-storage.mjs';

if (!Capacitor.isNativePlatform()) throw new Error('This build requires the Android app');
const nativeFetch = createNativeApiFetch((options) => CapacitorHttp.request(options));
configureNativeApi(nativeFetch);
installNativeApiFetch(nativeFetch);
if (typeof __COOKBOOK_SESSION_AUTH__ !== 'undefined' && __COOKBOOK_SESSION_AUTH__) {
  configureSessionRuntime({ transport: 'native', fetchImpl: nativeFetch,
    storage: createSessionStorage(registerPlugin('SessionVault')) });
}
// Transport must be installed before auth initialization or planning consumers run.
await import('../../frontend/src/main.jsx');
