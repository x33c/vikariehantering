import { useEffect, useState } from 'react';
import { aktiveraPush, pushStatus } from '../lib/push';

export default function PushButton({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<'saknas' | 'nekad' | 'aktiv' | 'redo' | 'ej_aktiv'>('saknas');
  const [fel, setFel] = useState('');
  const [laddar, setLaddar] = useState(false);

  useEffect(() => {
    pushStatus().then(setStatus).catch(() => setStatus('saknas'));
  }, []);

  async function aktivera() {
    if (status === 'aktiv' || status === 'nekad') return;

    setLaddar(true);
    setFel('');
    try {
      await aktiveraPush();
      setStatus(await pushStatus());
    } catch (err) {
      setFel(err instanceof Error ? err.message : 'Kunde inte aktivera push-notiser.');
    } finally {
      setLaddar(false);
    }
  }

  if (status === 'saknas') return null;

  const aktiv = status === 'aktiv';
  const nekad = status === 'nekad';

  if (compact) {
    return (
      <button
        type="button"
        onClick={aktivera}
        disabled={laddar || aktiv || nekad}
        className="relative rounded-xl border p-2 disabled:opacity-60"
        style={{
          color: aktiv ? 'var(--blue)' : 'var(--text)',
          borderColor: aktiv ? 'var(--blue)' : 'var(--border)',
          background: aktiv ? 'color-mix(in srgb, var(--blue) 10%, var(--bg-card))' : 'transparent',
        }}
        aria-label={aktiv ? 'Push-notiser är aktiva' : 'Aktivera push-notiser'}
        title={aktiv ? 'Push-notiser är aktiva' : nekad ? 'Push är blockerat i webbläsaren' : 'Aktivera push-notiser'}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0" />
        </svg>
        {aktiv && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: '#22c55e' }} />}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Push-notiser</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {aktiv ? 'Aktiverat på denna enhet' : nekad ? 'Blockerat i webbläsaren' : 'Få nya pass och svar direkt'}
          </p>
        </div>
        {!aktiv && !nekad && (
          <button
            onClick={aktivera}
            disabled={laddar}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--blue)' }}
          >
            {laddar ? 'Aktiverar...' : 'Aktivera'}
          </button>
        )}
      </div>
      {fel && <p className="text-xs text-red-500">{fel}</p>}
    </div>
  );
}
