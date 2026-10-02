import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { supabase } from '@/lib/supabase/client';
import { resolveNotificationRoute, type NotificationRoute } from '@/lib/notifications/navigation';
import type { UserRole } from '@/constants/enums';

interface WalkerPushNative {
  requestPermissions(): Promise<{ granted: boolean; status: string }>;
  registerForRemoteNotifications(): Promise<{ registered: boolean }>;
  getPermissionStatus(): Promise<{ status: string }>;
}

const NativeModule = (NativeModules as { WalkerPushModule?: WalkerPushNative }).WalkerPushModule;
const events = NativeModule ? new NativeEventEmitter(NativeModules.WalkerPushModule as never) : null;

let tokenSubscription: { remove: () => void } | null = null;
let failSubscription: { remove: () => void } | null = null;
let tapSubscription: { remove: () => void } | null = null;
let foregroundUnsubscribe: (() => void) | null = null;

type DeepLinkHandler = (route: NotificationRoute | null) => void;

let onDeepLink: DeepLinkHandler = () => {};
let currentRole: UserRole | null = null;

/**
 * Configure where notification taps route the user. Called once at app start
 * from the navigator so the push service can fire deep-links without
 * importing the navigation singleton (avoids circular deps).
 */
export function setPushDeepLinkHandler(handler: DeepLinkHandler) {
  onDeepLink = handler;
}

export function setPushCurrentRole(role: UserRole | null) {
  currentRole = role;
}

/**
 * Run on every successful sign-in to make sure this device's APNs token is
 * registered against the current user. Idempotent: safe to call any number
 * of times.
 *
 * Android push (FCM) is intentionally not wired in this cleanup pass —
 * only iOS/APNs is supported. Callers should treat Android as no-op.
 */
export async function initPushForUser(userId: string, role: UserRole | null): Promise<void> {
  setPushCurrentRole(role);
  if (Platform.OS !== 'ios' || !NativeModule || !events) {
    if (Platform.OS === 'android') {
      console.log('[push] Android push skipped — FCM not configured in this build.');
    }
    return;
  }

  // Wire up listeners exactly once per process lifetime. We re-register them
  // on each call to handle hot-reload cleanly.
  tokenSubscription?.remove();
  failSubscription?.remove();
  tokenSubscription = events.addListener('apnsTokenReceived', async (payload: { token: string }) => {
    await saveDeviceToken(userId, payload.token);
  });
  failSubscription = events.addListener('apnsRegistrationFailed', (payload: { error: string }) => {
    console.warn('[push] APNs registration failed:', payload.error);
  });

  tapSubscription?.remove();
  tapSubscription = events.addListener('notificationTapped', (payload: { data: Record<string, unknown> }) => {
    handleNotificationTap(payload.data);
  });

  // Also handle taps that come through Notifee (e.g. an in-app banner shown
  // while the app was foregrounded — APNs delivers payload to AppDelegate
  // first, but Notifee owns the local display & tap handling.)
  foregroundUnsubscribe?.();
  foregroundUnsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS && detail.notification?.data) {
      handleNotificationTap(detail.notification.data);
    }
  });

  // Ask for permission. If already granted from a prior session this resolves
  // immediately with status 'authorized'. If denied, we surface the status
  // but don't throw — the user can re-enable in Settings later.
  const perm = await NativeModule.requestPermissions();
  if (!perm.granted) {
    console.log('[push] permission not granted:', perm.status);
    return;
  }

  // Trigger APNs registration. Token arrives async via the listener above,
  // which writes it to the device_tokens table.
  await NativeModule.registerForRemoteNotifications();
}

/**
 * Read current notification permission state without prompting. Useful for
 * settings screens that want to display "Notifications: Allowed/Denied".
 */
export async function getPushPermissionStatus(): Promise<string> {
  if (Platform.OS !== 'ios' || !NativeModule) return 'unsupported';
  try {
    const { status } = await NativeModule.getPermissionStatus();
    return status;
  } catch {
    return 'unknown';
  }
}

/**
 * Mark this user's tokens as inactive when they sign out so push doesn't
 * deliver to a device whose session is gone.
 */
export async function deactivatePushForUser(userId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await supabase
      .from('device_tokens')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('platform', 'ios');
  } catch (err) {
    console.warn('[push] failed to deactivate tokens:', err);
  }
}

/**
 * Upsert the device token into the device_tokens table. Marks any prior
 * row for the same token as active again in case the user signed out and
 * back in.
 */
async function saveDeviceToken(userId: string, token: string): Promise<void> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const currentAuthId = authData.user?.id;
    if (!currentAuthId || currentAuthId !== userId) {
      // Session not yet established or signed out
      return;
    }

    // Attempt registration via SECURITY DEFINER RPC first to bypass cross-user RLS conflicts
    const { error: rpcError } = await supabase.rpc('register_device_token', {
      p_token: token,
      p_platform: 'ios',
    });
    if (!rpcError) {
      console.log('[push] device token saved via rpc');
      return;
    }

    const { error } = await supabase
      .from('device_tokens')
      .upsert(
        {
          user_id: currentAuthId,
          token,
          platform: 'ios',
          is_active: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'token', ignoreDuplicates: false },
      );
    if (error) {
      console.warn('[push] failed to save device token:', error.message);
      return;
    }
    console.log('[push] device token saved');
  } catch (err) {
    console.warn('[push] failed to save device token:', err);
  }
}

/**
 * Notification payload data shape from the backend (set by send-push).
 * The shared notification route resolver maps notification type to a stack
 * + screen + params — we just call it and hand the result to the navigator.
 */
function handleNotificationTap(data: Record<string, unknown>): void {
  const type = typeof data.type === 'string' ? data.type : null;
  if (!type) {
    console.warn('[push] notification tap ignored — missing type', data);
    return;
  }
  // resolveNotificationRoute expects the raw notification payload. The
  // send-push function forwards canonical project_id/slot_id/order_id keys
  // and deep_link directly in APNs userInfo, so we can hand data through.
  const route = resolveNotificationRoute(type, data, currentRole);
  if (!route) {
    console.warn('[push] notification tap ignored — no route for', {
      type,
      role: currentRole,
      keys: Object.keys(data),
    });
    return;
  }
  onDeepLink(route);
}
