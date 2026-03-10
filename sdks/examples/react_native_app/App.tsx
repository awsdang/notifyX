import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
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
} from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  getToken,
  getInitialNotification,
  onNotificationOpenedApp,
  onTokenRefresh,
  setAutoInitEnabled,
  requestPermission,
  AuthorizationStatus,
  type FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import { NotifyX } from '@notifyx/react-native';

// const APP_ID = 'YOUR_APP_ID';
// const API_KEY = 'YOUR_API_KEY';
// const BASE_URL = 'https://your-api-url.com';

const APP_ID = '6feb573a-cff9-4759-84fb-3394ac538068';
const API_KEY = 'nk_live_XxMcjTOgU4viSIQ0-rlIczDG3ZhWC6Ca';
const BASE_URL = 'http://172.18.7.133:3000/'; // Android uses adb reverse tcp:3000 tcp:3000
const MANUAL_PUSH_TOKEN = ''; // Optional fallback for manual testing.
const MANUAL_PROVIDER: 'fcm' | 'apns' | 'hms' = 'fcm';

const toOptionalTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveActionUrlFromData = (
  data: Record<string, unknown> | undefined,
): string | undefined => {
  if (!data) return undefined;

  const actionUrl = toOptionalTrimmedString(data.actionUrl);
  if (actionUrl) return actionUrl;

  const fallbackPrimary = toOptionalTrimmedString(data.actionUrl_open_link_primary);
  if (fallbackPrimary) return fallbackPrimary;

  const rawActions = toOptionalTrimmedString(data.actions);
  if (!rawActions) return undefined;

  try {
    const parsed = JSON.parse(rawActions);
    if (!Array.isArray(parsed)) return undefined;
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const url = toOptionalTrimmedString((item as { url?: unknown }).url);
      if (url) return url;
    }
  } catch {
    // Ignore malformed actions payload.
  }

  return undefined;
};

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const [status, setStatus] = useState<string>('Not initialized');
  const [sdkState, setSdkState] = useState<Record<string, any> | null>(null);

  // Initialize SDK instance
  const notifyX = new NotifyX({
    appId: APP_ID,
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    debug: true,
  });

  const loadState = async () => {
    const state = await notifyX.getState();
    setSdkState(state);
    if (state) {
      setStatus(`Initialized (User: ${state.externalUserId})`);
    } else {
      setStatus('Not initialized');
    }
  };

  useEffect(() => {
    loadState();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      return;
    }

    const app = getApp();
    const messaging = getMessaging(app);

    const openFromRemoteMessage = async (
      remoteMessage: FirebaseMessagingTypes.RemoteMessage,
      source: 'background' | 'cold_start',
    ) => {
      const url = resolveActionUrlFromData(
        remoteMessage?.data as Record<string, unknown> | undefined,
      );

      if (!url) {
        setStatus(`Notification opened from ${source}, but no actionUrl found.`);
        return;
      }

      try {
        await Linking.openURL(url);
        setStatus(`Notification opened link from ${source}: ${url}`);
      } catch (error: any) {
        setStatus(
          `Failed to open notification URL (${source}): ${
            error?.message || 'Unknown error'
          }`,
        );
      }
    };

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

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      return;
    }

    const app = getApp();
    const messaging = getMessaging(app);

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
          platform: Platform.OS as 'ios' | 'android',
          provider: 'fcm',
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

  type PushTokenResult =
    | {
        token: string;
        provider: 'fcm' | 'apns' | 'hms';
      }
    | {
        errorMessage: string;
      };

  const getPushTokenAndProvider = async (): Promise<PushTokenResult> => {
    try {
      if (MANUAL_PUSH_TOKEN.trim()) {
        return { token: MANUAL_PUSH_TOKEN.trim(), provider: MANUAL_PROVIDER };
      }

      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        const version =
          typeof Platform.Version === 'number'
            ? Platform.Version
            : Number(Platform.Version);

        if (Platform.OS === 'android' && version >= 33) {
          const permission = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
          if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
            return {
              errorMessage: 'Notification permission denied on Android.',
            };
          }
        }

        if (Platform.OS === 'ios') {
          const app = getApp();
          const messaging = getMessaging(app);
          const authStatus = await requestPermission(messaging);
          const enabled =
            authStatus === AuthorizationStatus.AUTHORIZED ||
            authStatus === AuthorizationStatus.PROVISIONAL;
          if (!enabled) {
            return { errorMessage: 'Notification permission denied on iOS.' };
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
      if (Platform.OS === 'android') {
        const message = String(error?.message || 'Unknown error');
        if (message.includes('SERVICE_NOT_AVAILABLE')) {
          console.warn('Failed to get token', error);
          return {
            errorMessage:
              'FCM unavailable (SERVICE_NOT_AVAILABLE). Use a Play Store emulator or a real device with Google Play Services + internet, then retry.',
          };
        }

        return {
          errorMessage: `Android FCM setup error: ${
            error?.message || 'Unknown error'
          }. Verify google-services.json and Firebase Cloud Messaging setup.`,
        };
      }

      return {
        errorMessage: String(error?.message || 'Failed to get push token'),
      };
    }
  };

  const handleInit = async () => {
    setStatus('Initializing...');
    try {
      const tokenResult = await getPushTokenAndProvider();
      const externalUserId = `demo-user-${Date.now()}`;
      if (!('token' in tokenResult)) {
        await notifyX.init({ externalUserId });
        await loadState();
        setStatus(`SDK initialized (user only). ${tokenResult.errorMessage}`);
        return;
      }

      await notifyX.init({
        externalUserId,
        pushToken: tokenResult.token,
        platform: Platform.OS as 'ios' | 'android' | 'huawei',
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
            Note: iOS and Android both use FCM in this demo. CTA metadata is
            included in payload data (actionUrl + actions) for your own native
            handling. This example opens `actionUrl` when the notification is
            tapped.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
