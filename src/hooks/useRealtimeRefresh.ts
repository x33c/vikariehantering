import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const STANDARD_TABELLER = ['vikariepass', 'passmeddelanden', 'notiser'];

export function useRealtimeRefresh(
  aktiv: boolean,
  uppdatera: () => void | Promise<void>,
  tabeller: string[] = STANDARD_TABELLER
) {
  const uppdateraRef = useRef(uppdatera);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    uppdateraRef.current = uppdatera;
  }, [uppdatera]);

  useEffect(() => {
    if (!aktiv) return;

    const channel = supabase.channel(`realtime-refresh-${tabeller.join('-')}`);

    for (const tabell of tabeller) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabell },
        () => {
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => {
            void uppdateraRef.current();
          }, 250);
        }
      );
    }

    channel.subscribe();

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [aktiv, tabeller.join('|')]);
}
