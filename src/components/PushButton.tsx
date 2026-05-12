import { useEffect, useState } from 'react';
import { aktiveraPush, pushStatus } from '../lib/push';

export default function PushButton() {
  const [status, setStatus] = useState<'saknas' | 'nekad' | 'aktiv' | 'redo' | 'ej_aktiv'>('saknas');
  const [fel, setFel] = useState('');
  const [laddar, setLaddar] = useState(false);

  useEffect(() => {
    pushStatus().then(setStatus).catch(() => setStatus('saknas'));
  }, []);

  async function aktivera() {
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

  return (
    <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Push-notiser</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {status === 'aktiv' ? 'Aktiverat på denna enhet' : status === 'nekad' ? 'Blockerat i webbläsaren' : 'Få förfrågningar och svar direkt'}
          </p>
        </div>
        {status !== 'aktiv' && status !== 'nekad' && (
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
