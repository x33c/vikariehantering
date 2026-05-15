import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [notiser, setNotiser] = useState<AdminNotis[]>([]);
  const [lasta, setLasta] = useState<Set<string>>(() => hamtaLasta());
  const [oppen, setOppen] = useState(false);

  const ladda = useCallback(async () => {
    const res = await notisApi.listaAdmin();
    setNotiser((res.data ?? []) as AdminNotis[]);
  }, []);

  useEffect(() => {
    ladda();
  }, [ladda]);

  useRealtimeRefresh(true, ladda, ['notiser', 'passmeddelanden'], 6000);

  const olasta = useMemo(() => notiser.filter(n => !lasta.has(n.id)), [notiser, lasta]);
  const synliga = notiser.slice(0, 10);

  function markeraSomLast(id: string) {
    setLasta(prev => {
      const ny = new Set(prev);
      ny.add(id);
      sparaLasta(ny);
      return ny;
    });
  }

  function markeraAlla() {
    const ny = new Set([...lasta, ...notiser.map(n => n.id)]);
    setLasta(ny);
    sparaLasta(ny);
  }

  function oppnaNotis(notis: AdminNotis) {
    markeraSomLast(notis.id);
    setOppen(false);
    navigate('/admin/vikariepass');
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOppen(v => !v)}
        className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition"
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
        <span className="hidden sm:inline">Notiser</span>
      </button>

      {oppen && (
        <div
          className={`absolute z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border shadow-xl ${
            placement === 'up' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'
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
            {notiser.length > 0 && (
              <button type="button" onClick={markeraAlla} className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>
                Markera lästa
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
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
      )}
    </div>
  );
}
