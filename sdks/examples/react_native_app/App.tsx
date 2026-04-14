import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  Linking,
  NativeModules,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  getToken,
  getInitialNotification,
  onNotificationOpenedApp,
  onTokenRefresh,
  setAutoInitEnabled,
  type FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import { NotifyX, type NotificationActionPayload } from '@notifyx/react-native';

// const APP_ID = 'YOUR_APP_ID';
// const API_KEY = 'YOUR_API_KEY';
// const BASE_URL = 'https://your-api-url.com';

const APP_ID = '6feb573a-cff9-4759-84fb-3394ac538068';
const API_KEY = 'nk_live_XxMcjTOgU4viSIQ0-rlIczDG3ZhWC6Ca';
const BASE_URL = 'https://iu8nuqgn5i0v.share.zrok.io';
const MANUAL_PUSH_TOKEN = '';
const MANUAL_PROVIDER: 'fcm' | 'apns' | 'hms' = 'fcm';

type PushTokenResult =
  | {
      token: string;
      provider: 'fcm' | 'apns' | 'hms';
      errorMessage?: undefined;
    }
  | { token?: undefined; provider?: undefined; errorMessage: string };

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const [status, setStatus] = useState<string>('Not initialized');
  const [sdkState, setSdkState] = useState<Record<string, any> | null>(null);

  const notifyXRef = useRef(
    new NotifyX({
      appId: APP_ID,
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      debug: true,
    }),
  );
  const notifyX = notifyXRef.current;

  const loadState = async () => {
    const state = await notifyX.getState();
    setSdkState(state);
    if (state) {
      setStatus(`Initialized (User: ${state.externalUserId})`);
    } else {
      setStatus('Not initialized');
    }
  };

  const platformValue = (): string => {
    if (Platform.OS === 'ios') return 'ios';
    if (Platform.OS === 'android') return 'android';
    return Platform.OS;
  };

  const openFromActionPayload = async (
    payload: NotificationActionPayload,
    source: string,
  ) => {
    const opened = await notifyX.openNotificationAction(
      payload,
      async (url: string) => {
        const canOpen = await Linking.canOpenURL(url);
        if (!canOpen) {
          throw new Error(`Could not launch URL: ${url}`);
        }
        await Linking.openURL(url);
      },
    );

    if (!opened) {
      setStatus(`Notification opened from ${source}, but no actionUrl found.`);
      return;
    }

    setStatus(`Notification opened link from ${source}.`);
  };

  const openFromRemoteMessage = async (
    remoteMessage: FirebaseMessagingTypes.RemoteMessage,
    source: string,
  ) => {
    await openFromActionPayload(
      { data: remoteMessage.data as Record<string, unknown> | undefined },
      source,
    );
  };

  useEffect(() => {
    void loadState();
  }, []);

  // Android-only: notification open handlers (cold start + background)
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    let app: ReturnType<typeof getApp>;
    let messaging: ReturnType<typeof getMessaging>;
    try {
      app = getApp();
      messaging = getMessaging(app);
    } catch {
      return;
    }

    getInitialNotification(messaging)
      .then(initialMessage => {
        if (initialMessage) {
          void openFromRemoteMessage(initialMessage, 'cold_start');
        }
      })
      .catch(() => {
        // Ignore startup notification parsing failures in example app.
      });

    const unsubscribe = onNotificationOpenedApp(messaging, remoteMessage => {
      void openFromRemoteMessage(remoteMessage, 'background');
    });

    return unsubscribe;
  }, []);

  // Android-only: token refresh handler
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    let app: ReturnType<typeof getApp>;
    let messaging: ReturnType<typeof getMessaging>;
    try {
      app = getApp();
      messaging = getMessaging(app);
    } catch {
      return;
    }

    const unsubscribe = onTokenRefresh(messaging, async token => {
      try {
        const normalized = token.trim();
        if (!normalized) {
          return;
        }

        console.log('FCM token refreshed:', normalized);
        const state = await notifyX.getState();
        if (!state?.userId) {
          return;
        }

        await notifyX.registerDevice({
          userId: state.userId,
          pushToken: normalized,
          platform: platformValue() as 'ios' | 'android',
          provider: 'fcm',
          deviceId: state.deviceId,
        });
        await loadState();
        setStatus('FCM token refreshed and device registered.');
      } catch (error: any) {
        setStatus(
          `FCM token refresh received but device registration failed: ${
            error?.message || 'Unknown error'
          }`,
        );
      }
    });

    return unsubscribe;
  }, []);

  const fetchFcmToken = async (): Promise<string> => {
    const app = getApp();
    const messaging = getMessaging(app);

    await setAutoInitEnabled(messaging, true);

    let lastError: unknown;
    const retryDelaysMs = [0, 1500, 3000, 5000];

    for (const delayMs of retryDelaysMs) {
      if (delayMs > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, delayMs));
      }

      try {
        const token = await getToken(messaging);
        if (token && token.trim()) {
          return token.trim();
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new Error('FCM token was empty after retries.');
  };

  const fetchApnsToken = async (): Promise<string> => {
    const { ApnsToken } = NativeModules;
    if (!ApnsToken) {
      throw new Error(
        'ApnsToken native module not available. Ensure ApnsTokenModule.m is in the Xcode project.',
      );
    }

    let lastError: unknown;
    const retryDelaysMs = [0, 1500, 3000, 5000];

    for (const delayMs of retryDelaysMs) {
      if (delayMs > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, delayMs));
      }

      try {
        const token: string = await ApnsToken.getToken();
        const normalized = token?.trim();
        if (normalized) {
          return normalized;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new Error('APNs token was empty after retries.');
  };

  const getPushTokenAndProvider = async (): Promise<PushTokenResult> => {
    try {
      const manualToken = MANUAL_PUSH_TOKEN.trim();
      if (manualToken) {
        return { token: manualToken, provider: MANUAL_PROVIDER };
      }

      if (Platform.OS === 'ios') {
        const token = await fetchApnsToken();
        console.log('APNS token fetched:', token);
        return { token, provider: 'apns' };
      }

      if (Platform.OS === 'android') {
        const version =
          typeof Platform.Version === 'number'
            ? Platform.Version
            : Number(Platform.Version);

        if (version >= 33) {
          const permission = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
          if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
            return {
              errorMessage: 'Notification permission denied on Android.',
            };
          }
        }

        const token = await fetchFcmToken();
        if (!token) {
          return { errorMessage: 'Failed to fetch FCM token.' };
        }

        console.log('FCM token fetched:', token);
        return { token, provider: 'fcm' };
      }

      return { errorMessage: `Unsupported platform: ${Platform.OS}` };
    } catch (error: any) {
      const message = String(error?.message || 'Unknown error');

      if (
        Platform.OS === 'android' &&
        message.includes('SERVICE_NOT_AVAILABLE')
      ) {
        return {
          errorMessage:
            'FCM unavailable (SERVICE_NOT_AVAILABLE). Use a Play Store emulator or a real device with Google Play Services + internet, then retry.',
        };
      }

      if (Platform.OS === 'android') {
        return {
          errorMessage: `Android FCM setup error: ${message}. Verify google-services.json and Firebase Cloud Messaging setup.`,
        };
      }

      if (Platform.OS === 'ios') {
        return {
          errorMessage: `iOS APNs setup error: ${message}. Verify Push Notifications capability, valid provisioning profile, and APNs key/certificate in Apple Developer account.`,
        };
      }

      return { errorMessage: `Failed to get push token: ${message}` };
    }
  };

  const handleInit = async () => {
    setStatus('Initializing...');
    try {
      const tokenResult = await getPushTokenAndProvider();
      const externalUserId = `demo-user-${Date.now()}`;

      if (!tokenResult.token) {
        await notifyX.init({ externalUserId });
        await loadState();
        setStatus(`SDK initialized (user only). ${tokenResult.errorMessage}`);
        return;
      }

      await notifyX.init({
        externalUserId,
        pushToken: tokenResult.token,
        platform: platformValue() as 'ios' | 'android' | 'huawei',
        provider: tokenResult.provider,
      });

      await loadState();
      setStatus('Success! Init complete with device registration.');
    } catch (error: any) {
      setStatus(`Init failed: ${error.message}`);
    }
  };

  const handleTestPush = async () => {
    setStatus('Sending test push to provider...');
    try {
      const result = await notifyX.sendTestNotification({
        title: 'Hello from React Native!',
        body: 'This push notification was triggered by the React Native SDK.',
        image: 'https://picsum.photos/900/420',
        actionUrl: 'https://google.com',
        actions: [
          {
            action: 'open_link_primary',
            title: 'Open Offer',
            url: 'https://google.com/search?q=offer',
          },
          {
            action: 'open_link_secondary',
            title: 'Open Help',
            url: 'https://google.com/search?q=help',
          },
        ],
      });
      const provider = result?.provider ? ` (${result.provider})` : '';
      setStatus(`Test push sent successfully${provider}.`);
    } catch (error: any) {
      setStatus(`Failed to send test push: ${error.message}`);
    }
  };

  const handleClearState = async () => {
    await notifyX.clearState();
    await loadState();
    setStatus('State cleared. Need to re-initialize.');
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[
          styles.background,
          isDarkMode ? styles.darkBackground : styles.lightBackground,
        ]}
      >
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>NotifyX Demo</Text>
          </View>

          <View style={styles.container}>
            <View style={styles.statusBox}>
              <Text style={styles.statusLabel}>Status:</Text>
              <Text style={styles.statusText}>{status}</Text>
            </View>

            {sdkState && (
              <View style={styles.stateBox}>
                <Text style={styles.stateLabel}>Current SDK State:</Text>
                <Text style={styles.stateContent}>
                  {JSON.stringify(sdkState, null, 2)}
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.primaryButton} onPress={handleInit}>
              <Text style={styles.buttonText}>
                Initialize SDK (Registers User & Device)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!sdkState || !sdkState.deviceId) && styles.disabledButton,
              ]}
              onPress={handleTestPush}
              disabled={!sdkState || !sdkState.deviceId}
            >
              <Text style={styles.buttonText}>Send Test Notification</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleClearState}
            >
              <Text style={styles.secondaryButtonText}>Clear Local State</Text>
            </TouchableOpacity>

            <Text style={styles.noteText}>
              Note: Android uses FCM and iOS uses APNS in this demo.
              Notification taps resolve CTA/default URLs and open them
              externally.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  lightBackground: {
    backgroundColor: '#F3F4F6',
  },
  darkBackground: {
    backgroundColor: '#111827',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    padding: 24,
    backgroundColor: '#6366f1',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  container: {
    padding: 20,
    gap: 16,
  },
  statusBox: {
    backgroundColor: '#e5e7eb',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  statusLabel: {
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  statusText: {
    color: '#1f2937',
  },
  stateBox: {
    backgroundColor: '#1f2937',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  stateLabel: {
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 8,
  },
  stateContent: {
    color: '#10b981',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 4,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 4,
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButtonText: {
    color: '#6366f1',
    fontWeight: '600',
    fontSize: 16,
  },
  noteText: {
    marginTop: 24,
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default App;
