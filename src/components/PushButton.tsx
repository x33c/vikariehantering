import { useEffect, useState } from 'react';
import { aktiveraPush, avaktiveraPush, pushSaknasText, pushStatus, testaLokalNotis, testaServerPush } from '../lib/push';

export default function PushButton({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<'saknas' | 'nekad' | 'aktiv' | 'redo' | 'ej_aktiv'>('saknas');
  const [fel, setFel] = useState('');
  const [info, setInfo] = useState('');
  const [laddar, setLaddar] = useState(false);

  useEffect(() => {
    pushStatus().then(setStatus).catch(() => setStatus('saknas'));
  }, []);

  function visaInfo(text: string) {
    setInfo(text);
    if (compact) window.alert(text);
  }

  function visaFel(text: string) {
    setFel(text);
    if (compact) window.alert(text);
  }

  async function aktivera() {
    if (status === 'nekad' || status === 'saknas') {
      visaFel(pushSaknasText());
      return;
    }

    setLaddar(true);
    setFel('');
    setInfo('');
    try {
      await aktiveraPush();
      setStatus(await pushStatus());
      visaInfo('Push är aktiverat på denna enhet.');
    } catch (err) {
      visaFel(err instanceof Error ? err.message : 'Kunde inte aktivera push-notiser.');
    } finally {
      setLaddar(false);
    }
  }

  async function testa() {
    setLaddar(true);
    setFel('');
    setInfo('');
    try {
      await testaLokalNotis();
      await testaServerPush();
      visaInfo('Testnotis skickad. Om du inte ser den: kontrollera webbläsarens/operativsystemets notisinställningar.');
    } catch (err) {
      visaFel(err instanceof Error ? err.message : 'Kunde inte skicka testnotis.');
    } finally {
      setLaddar(false);
    }
  }

  async function stangAv() {
    setLaddar(true);
    setFel('');
    setInfo('');
    try {
      await avaktiveraPush();
      setStatus(await pushStatus());
      visaInfo('Push är avstängt på denna enhet.');
    } catch (err) {
      visaFel(err instanceof Error ? err.message : 'Kunde inte stänga av push-notiser.');
    } finally {
      setLaddar(false);
    }
  }

  const aktiv = status === 'aktiv';
  const nekad = status === 'nekad';
  const saknas = status === 'saknas';

  if (compact) {
    return (
      <button
        type="button"
        onClick={aktiv ? testa : aktivera}
        disabled={laddar}
        className="relative rounded-xl border p-2 disabled:opacity-60"
        style={{
          color: aktiv ? 'var(--blue)' : saknas || nekad ? 'var(--text-subtle)' : 'var(--text)',
          borderColor: aktiv ? 'var(--blue)' : 'var(--border)',
          background: aktiv ? 'color-mix(in srgb, var(--blue) 10%, var(--bg-card))' : 'transparent',
        }}
        aria-label={aktiv ? 'Testa push-notis' : 'Aktivera push-notiser'}
        title={aktiv ? 'Testa push-notis' : saknas ? pushSaknasText() : 'Aktivera push-notiser'}
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
            {aktiv ? 'Aktiverat på denna enhet' : nekad ? 'Blockerat i webbläsaren' : saknas ? pushSaknasText() : 'Få nya pass och svar direkt'}
          </p>
        </div>
        <div className="flex gap-2">
          {aktiv && (
            <button onClick={testa} disabled={laddar} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ background: 'var(--blue)' }}>
              Testa
            </button>
          )}
          {!nekad && !saknas && (
            <button
              onClick={aktiv ? stangAv : aktivera}
              disabled={laddar}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: aktiv ? '#ef4444' : 'var(--blue)' }}
            >
              {laddar ? 'Vänta...' : aktiv ? 'Stäng av' : 'Aktivera'}
            </button>
          )}
        </div>
      </div>
      {info && <p className="text-xs" style={{ color: '#22c55e' }}>{info}</p>}
      {fel && <p className="text-xs text-red-500">{fel}</p>}
    </div>
  );
}
