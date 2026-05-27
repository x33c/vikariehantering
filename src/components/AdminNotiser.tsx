import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notisApi } from '../lib/api';
import type { Notis } from '../types';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';

type AdminNotis = Notis & {
  pass?: {
    datum?: string | null;
    tid_från?: string | null;
    tid_till?: string | null;
    personal?: { namn?: string | null } | null;
  } | null;
  vikarie?: { namn?: string | null; epost?: string | null } | null;
};

const STORAGE_KEY = 'admin_notiser_lasta_v1';
const DISMISSED_KEY = 'admin_notiser_dolda_v1';

function hamtaLasta() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return new Set<string>();
  }
}

function sparaLasta(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

function hamtaDolda() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]'));
  } catch {
    return new Set<string>();
  }
}

function sparaDolda(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

function datumText(notis: AdminNotis) {
  const datum = notis.pass?.datum;
  const fran = notis.pass?.tid_från?.slice(0, 5);
  const till = notis.pass?.tid_till?.slice(0, 5);

  if (datum && fran && till) return `${datum} ${fran}-${till}`;
  if (datum) return datum;

  return new Date(notis.created_at).toLocaleString('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function notisTone(notis: AdminNotis) {
  const text = `${notis.ämne ?? ''} ${notis.innehåll ?? ''}`.toLowerCase();

  if (text.includes('avbok')) return { color: '#f97316', bg: 'rgba(249, 115, 22, 0.14)' };
  if (text.includes('meddelande')) return { color: 'var(--blue)', bg: 'color-mix(in srgb, var(--blue) 14%, transparent)' };
  if (text.includes('tackade ja')) return { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.14)' };
  if (text.includes('tackade nej')) return { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' };

  return { color: 'var(--text-muted)', bg: 'var(--hover)' };
}

export default function AdminNotiser({ placement = 'down' }: { placement?: 'down' | 'up' }) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [notiser, setNotiser] = useState<AdminNotis[]>([]);
  const [lasta, setLasta] = useState<Set<string>>(() => hamtaLasta());
  const [dolda, setDolda] = useState<Set<string>>(() => hamtaDolda());
  const [oppen, setOppen] = useState(false);

  const ladda = useCallback(async () => {
    const res = await notisApi.listaAdmin();
    setNotiser((res.data ?? []) as AdminNotis[]);
  }, []);

  useEffect(() => {
    ladda();
  }, [ladda]);

  useRealtimeRefresh(true, ladda, ['notiser', 'passmeddelanden'], 6000);

  useEffect(() => {
    if (!oppen) return;

    function stangVidKlickUtanfor(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOppen(false);
      }
    }

    document.addEventListener('mousedown', stangVidKlickUtanfor);
    document.addEventListener('touchstart', stangVidKlickUtanfor);

    return () => {
      document.removeEventListener('mousedown', stangVidKlickUtanfor);
      document.removeEventListener('touchstart', stangVidKlickUtanfor);
    };
  }, [oppen]);

  const synligaNotiser = useMemo(() => notiser.filter(n => !dolda.has(n.id)), [notiser, dolda]);
  const olasta = useMemo(() => synligaNotiser.filter(n => !lasta.has(n.id)), [synligaNotiser, lasta]);
  const synliga = synligaNotiser.slice(0, 10);

  function markeraSomLast(id: string) {
    setLasta(prev => {
      const ny = new Set(prev);
      ny.add(id);
      sparaLasta(ny);
      return ny;
    });
  }

  function markeraAlla() {
    const ny = new Set([...lasta, ...synligaNotiser.map(n => n.id)]);
    setLasta(ny);
    sparaLasta(ny);
  }

  function rensaNotiser() {
    const ny = new Set([...dolda, ...synligaNotiser.map(n => n.id)]);
    setDolda(ny);
    sparaDolda(ny);
    setOppen(false);
  }

  function oppnaNotis(notis: AdminNotis) {
    markeraSomLast(notis.id);
    setOppen(false);

    if (notis.pass_id) {
      navigate(`/admin/vikariepass?pass=${notis.pass_id}`);
      return;
    }

    navigate('/admin/vikariepass');
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOppen(v => !v)}
        className="flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition"
        style={{
          borderColor: olasta.length > 0 ? 'var(--blue)' : 'var(--border)',
          color: olasta.length > 0 ? 'var(--blue)' : 'var(--text)',
          background: olasta.length > 0 ? 'color-mix(in srgb, var(--blue) 10%, var(--bg-card))' : 'transparent',
        }}
        aria-label="Adminnotiser"
        title="Adminnotiser"
      >
        <span className="relative inline-flex">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0" />
          </svg>
          {olasta.length > 0 && (
            <span className="absolute -right-2 -top-2 min-w-5 rounded-full px-1 text-center text-[10px] font-bold text-white" style={{ background: '#ef4444' }}>
              {Math.min(olasta.length, 9)}
            </span>
          )}
        </span>
        <span className="sr-only">Notiser</span>
      </button>

      {oppen && (
        <>
          <button
            type="button"
            aria-label="Stäng notiser"
            className="fixed inset-0 z-40 bg-transparent sm:hidden"
            onClick={() => setOppen(false)}
          />
          <div
            className={`fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-hidden rounded-2xl border shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:w-80 sm:max-w-[calc(100vw-2rem)] ${
              placement === 'up' ? 'sm:bottom-full sm:left-0 sm:mb-2' : 'sm:right-0 sm:top-full sm:mt-2'
            }`}
            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
          >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Adminnotiser</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {olasta.length > 0 ? `${olasta.length} nya` : 'Inget nytt'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {synligaNotiser.length > 0 && (
                <>
                  <button type="button" onClick={markeraAlla} className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>
                    Markera lästa
                  </button>
                  <button type="button" onClick={rensaNotiser} className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Rensa
                  </button>
                </>
              )}
              <button type="button" onClick={() => setOppen(false)} className="text-lg leading-none sm:hidden" style={{ color: 'var(--text-muted)' }}>
                ×
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto p-2 sm:max-h-96">
            {synliga.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Inga notiser ännu.
              </p>
            ) : synliga.map(notis => {
              const tone = notisTone(notis);
              const arNy = !lasta.has(notis.id);

              return (
                <button
                  key={notis.id}
                  type="button"
                  onClick={() => oppnaNotis(notis)}
                  className="mb-2 w-full rounded-xl border px-3 py-3 text-left transition hover:opacity-90"
                  style={{
                    borderColor: arNy ? tone.color : 'var(--border)',
                    background: arNy ? tone.bg : 'var(--bg)',
                  }}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      {notis.ämne ?? 'Ny händelse'}
                    </p>
                    {arNy && <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: tone.color }} />}
                  </div>
                  <p className="line-clamp-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {notis.innehåll ?? 'Klicka för att öppna bemanning.'}
                  </p>
                  <p className="mt-2 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                    {notis.vikarie?.namn ? `${notis.vikarie.namn} · ` : ''}{datumText(notis)}
                  </p>
                </button>
              );
            })}
          </div>
          </div>
        </>
      )}
    </div>
  );
}
