import { supabase } from './supabase';

const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

async function functionErrorText(error: unknown) {
  const context = (error as { context?: unknown })?.context;

  if (context instanceof Response) {
    try {
      const json = await context.clone().json();
      if (json?.error) return String(json.error);
      if (json?.message) return String(json.message);
      return JSON.stringify(json);
    } catch (_) {
      try {
        return await context.text();
      } catch {
        // fall through
      }
    }
  }

  return error instanceof Error ? error.message : 'Okänt fel.';
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

export function pushStods() {
  return Boolean('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && publicKey);
}

export function pushSaknasText() {
  if (!publicKey) return 'Push är inte konfigurerat.';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'På iPhone fungerar push normalt först när sidan är tillagd på hemskärmen som webbapp.';
  }
  return 'Push stöds inte här.';
}

export async function aktiveraPush() {
  if (!pushStods() || !publicKey) throw new Error(pushSaknasText());

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Push-notiser nekades i webbläsaren.');

  const registration = await navigator.serviceWorker.register('/push-sw.js');
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Du måste vara inloggad.');

  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) throw new Error('Kunde inte läsa push-prenumerationen.');

  const { error } = await supabase.from('push_prenumerationer').upsert({
    profil_id: userData.user.id,
    endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent,
    aktiv: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });

  if (error) throw error;
}

export async function avaktiveraPush() {
  const registration = await navigator.serviceWorker.getRegistration('/push-sw.js');
  const subscription = await registration?.pushManager.getSubscription();

  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase
      .from('push_prenumerationer')
      .update({ aktiv: false, updated_at: new Date().toISOString() })
      .eq('endpoint', endpoint);
  }
}

export async function testaServerPush() {
  // Säkerställ att webbläsarens subscription också finns i databasen.
  await aktiveraPush();

  const { error } = await supabase.functions.invoke('skicka-epost', {
    body: { typ: 'test_push' },
  });

  if (error) throw new Error(await functionErrorText(error));
}

export async function pushStatus() {
  if (!pushStods()) return 'saknas' as const;
  if (Notification.permission === 'denied') return 'nekad' as const;

  const registration = await navigator.serviceWorker.getRegistration('/push-sw.js');
  const sub = await registration?.pushManager.getSubscription();
  if (sub) return 'aktiv' as const;

  return Notification.permission === 'granted' ? 'redo' as const : 'ej_aktiv';
}
