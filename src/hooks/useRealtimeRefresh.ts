import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const STANDARD_TABELLER = ['vikariepass', 'passmeddelanden', 'notiser'];

export function useRealtimeRefresh(
  aktiv: boolean,
  uppdatera: () => void | Promise<void>,
  tabeller: string[] = STANDARD_TABELLER,
  pollingMs = 60000
) {
  const uppdateraRef = useRef(uppdatera);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    uppdateraRef.current = uppdatera;
  }, [uppdatera]);

  useEffect(() => {
    if (!aktiv) return;

    let disposed = false;
    let running = false;
    let pending = false;

    async function refresh() {
      if (disposed || document.visibilityState === 'hidden') return;
      if (running) { pending = true; return; }
      running = true;
      try {
        await uppdateraRef.current();
      } catch {
        // A failed background refresh must not start an immediate retry loop.
      } finally {
        running = false;
        if (pending && !disposed) {
          pending = false;
          schemalaggUppdatering();
        }
      }
    }

    function schemalaggUppdatering() {
      if (disposed || document.visibilityState === 'hidden') return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void refresh();
      }, 250);
    }

    const channel = supabase.channel(`realtime-refresh-${tabeller.join('-')}-${Math.random().toString(36).slice(2)}`);

    for (const tabell of tabeller) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabell },
        schemalaggUppdatering
      );
    }

    channel.subscribe();

    // Backup: även om Realtime inte är aktiverat i Supabase-publicationen
    // slipper användaren manuellt ladda om sidan.
    const poll = window.setInterval(() => {
      void refresh();
    }, Math.max(pollingMs, 60000));

    document.addEventListener('visibilitychange', schemalaggUppdatering);
    window.addEventListener('online', schemalaggUppdatering);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', schemalaggUppdatering);
      window.removeEventListener('online', schemalaggUppdatering);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [aktiv, pollingMs, tabeller.join('|')]);
}
