import { useEffect, useState } from 'react';
import { notisApi } from '../../lib/api';
import type { Notis } from '../../types';
import { LaddaSida, TomtTillstånd } from '../../components/ui';

type AdminNotis = Notis & {
  vikarie?: { namn: string | null; epost: string | null };
  pass?: {
    id: string;
    datum: string;
    tid_från: string;
    tid_till: string;
    personal?: { namn: string | null };
  };
};

export default function Notiser() {
  const [notiser, setNotiser] = useState<AdminNotis[]>([]);
  const [laddar, setLaddar] = useState(true);

  useEffect(() => {
    notisApi.listaAdmin().then(res => {
      setNotiser((res.data ?? []) as AdminNotis[]);
      setLaddar(false);
    });
  }, []);

  if (laddar) return <LaddaSida />;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Notiser</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Svar och meddelanden från vikarier.
        </p>
      </div>

      {notiser.length === 0 ? (
        <TomtTillstånd text="Inga adminnotiser ännu." />
      ) : (
        <div className="space-y-3">
          {notiser.map(n => (
            <div
              key={n.id}
              className="rounded-xl border p-4 shadow-sm"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {n.ämne ?? 'Notis'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(n.created_at).toLocaleString('sv-SE')}
                  </p>
                </div>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}
                >
                  {n.status}
                </span>
              </div>

              {n.innehåll && (
                <p className="mb-3 text-sm" style={{ color: 'var(--text)' }}>{n.innehåll}</p>
              )}

              <div className="grid gap-1 text-xs sm:grid-cols-2" style={{ color: 'var(--text-muted)' }}>
                <p>Vikarie: <span style={{ color: 'var(--text)' }}>{n.vikarie?.namn ?? '-'}</span></p>
                <p>Pass: <span style={{ color: 'var(--text)' }}>
                  {n.pass ? `${n.pass.datum} ${n.pass.tid_från.slice(0, 5)}-${n.pass.tid_till.slice(0, 5)}` : '-'}
                </span></p>
                {n.pass?.personal?.namn && (
                  <p>Personal: <span style={{ color: 'var(--text)' }}>{n.pass.personal.namn}</span></p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
