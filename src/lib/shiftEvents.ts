import type { Vikariepass } from '../types';

const eventName = 'passportalen:pass-uppdaterat';

export function publishShiftUpdate(pass: Vikariepass) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: pass }));
}

export function subscribeShiftUpdates(listener: (pass: Vikariepass) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<Vikariepass>).detail);
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
