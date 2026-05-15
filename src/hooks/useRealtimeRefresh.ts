import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const STANDARD_TABELLER = ['vikariepass', 'passmeddelanden', 'notiser'];

export function useRealtimeRefresh(
  aktiv: boolean,
  uppdatera: () => void | Promise<void>,
  tabeller: string[] = STANDARD_TABELLER,
  pollingMs = 8000
) {
  const uppdateraRef = useRef(uppdatera);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    uppdateraRef.current = uppdatera;
  }, [uppdatera]);

  useEffect(() => {
    if (!aktiv) return;

    function schemalaggUppdatering() {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void uppdateraRef.current();
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
      void uppdateraRef.current();
    }, pollingMs);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [aktiv, pollingMs, tabeller.join('|')]);
}
