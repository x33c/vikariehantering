import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { notisApi, vikariApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { Notis, Vikarie } from '../../types';

function formatTid(value: string) {
  return new Date(value).toLocaleString('sv-SE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function förhandsvisning(text?: string | null) {
  const kompakt = (text ?? '').replace(/\s+/g, ' ').trim();
  return kompakt.length > 120 ? `${kompakt.slice(0, 117)}...` : kompakt;
}

export default function VikarieNotiser() {
  const { användare } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const efterfrågadId = searchParams.get('notis');
  const [vikarie, setVikarie] = useState<Vikarie | null>(null);
  const [notiser, setNotiser] = useState<Notis[]>([]);
  const [vald, setVald] = useState<Notis | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState('');
  const [raderarId, setRaderarId] = useState<string | null>(null);

  const laddaNotiser = useCallback(async (vikarieId: string) => {
    const res = await notisApi.listaMina(vikarieId);
    if (res.error) {
      setFel(res.error.message);
      return;
    }

    const nya = (res.data ?? []) as Notis[];
    setNotiser(nya);
    if (efterfrågadId) setVald(nya.find((notis) => notis.id === efterfrågadId) ?? null);
  }, [efterfrågadId]);

  useEffect(() => {
    let aktiv = true;

    async function starta() {
      if (!användare) return;
      const vRes = await vikariApi.hämtaViaProfilId(användare.id);
      if (!aktiv) return;

      const hittad = vRes.data as Vikarie | null;
      setVikarie(hittad);
      if (hittad) await laddaNotiser(hittad.id);
      setLaddar(false);
    }

    starta();
    return () => { aktiv = false; };
  }, [användare, laddaNotiser]);

  useEffect(() => {
    if (!vikarie) return;

    const kanal = supabase
      .channel(`vikarie-notiser-${vikarie.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notiser', filter: `vikarie_id=eq.${vikarie.id}` },
        () => laddaNotiser(vikarie.id),
      )
      .subscribe();

    return () => { supabase.removeChannel(kanal); };
  }, [vikarie, laddaNotiser]);

  function öppna(notis: Notis) {
    setVald(notis);
    setSearchParams({ notis: notis.id });
  }

  function stäng() {
    setVald(null);
    setSearchParams({});
  }

  async function raderaNotis(notis: Notis) {
    if (!vikarie || !window.confirm('Ta bort notisen?')) return;
    setRaderarId(notis.id);
    setFel('');
    const res = await notisApi.raderaMin(notis.id, vikarie.id);
    setRaderarId(null);

    if (res.error) {
      setFel(res.error.message);
      return;
    }

    setNotiser((tidigare) => tidigare.filter((rad) => rad.id !== notis.id));
    if (vald?.id === notis.id) stäng();
  }

  async function rensaAlla() {
    if (!vikarie || notiser.length === 0 || !window.confirm('Ta bort alla dina notiser?')) return;
    setRaderarId('alla');
    setFel('');
    const res = await notisApi.raderaAllaMina(vikarie.id);
    setRaderarId(null);

    if (res.error) {
      setFel(res.error.message);
      return;
    }

    setNotiser([]);
    stäng();
  }

  if (laddar) {
    return <div className="flex min-h-64 items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>Laddar notiser...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-7">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Notiser</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Meddelanden och uppdateringar från admin.</p>
        </div>
        {notiser.length > 0 && (
          <button
            type="button"
            onClick={rensaAlla}
            disabled={raderarId !== null}
            className="shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
          >
            {raderarId === 'alla' ? 'Rensar...' : 'Rensa alla'}
          </button>
        )}
      </div>

      {fel && (
        <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#ef4444', color: '#ef4444' }}>{fel}</div>
      )}

      {!vikarie ? (
        <div className="rounded-xl border px-4 py-6 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          Din vikarieprofil kunde inte hittas.
        </div>
      ) : notiser.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          Du har inga notiser ännu.
        </div>
      ) : (
        <div className="space-y-2">
          {notiser.map((notis) => (
            <div key={notis.id} className="flex items-stretch rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => öppna(notis)}
                className="min-w-0 flex-1 rounded-l-xl px-4 py-3 text-left transition-colors hover:bg-[var(--hover)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold" style={{ color: 'var(--text)' }}>{notis.ämne ?? 'Meddelande'}</span>
                  <span className="shrink-0 text-xs" style={{ color: 'var(--text-subtle)' }}>{formatTid(notis.created_at)}</span>
                </div>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{förhandsvisning(notis.innehåll) || 'Öppna för detaljer.'}</p>
              </button>
              <button
                type="button"
                onClick={() => raderaNotis(notis)}
                disabled={raderarId !== null}
                className="flex w-12 shrink-0 items-center justify-center rounded-r-xl border-l disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
                aria-label={`Ta bort ${notis.ämne ?? 'notis'}`}
                title="Ta bort"
              >
                {raderarId === notis.id ? '...' : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {vald && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={stäng}>
          <div
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:max-w-lg sm:rounded-2xl sm:p-6"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{vald.ämne ?? 'Meddelande'}</h2>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{formatTid(vald.created_at)}</p>
              </div>
              <button type="button" onClick={stäng} className="rounded-lg px-2 py-1 text-xl" style={{ color: 'var(--text-muted)' }} aria-label="Stäng">×</button>
            </div>

            <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-6" style={{ color: 'var(--text)' }}>
              {vald.innehåll || 'Det finns ingen ytterligare information.'}
            </div>

            <button type="button" onClick={stäng} className="mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white" style={{ background: 'var(--blue)' }}>
              Stäng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
