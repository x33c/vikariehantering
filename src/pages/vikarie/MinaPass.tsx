import { useEffect, useState } from 'react';
import { passApi, vikariApi, passmeddelandeApi } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Vikariepass, Vikarie, Passmeddelande } from '../../types';
import { PASS_STATUS_COLORS, PASS_STATUS_LABELS } from '../../types';
import { visaKortNamn } from '../../lib/display';

export default function MinaPass() {
  const { användare } = useAuth();
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [valtPass, setValtPass] = useState<Vikariepass | null>(null);
  const [meddelanden, setMeddelanden] = useState<Passmeddelande[]>([]);
  const [nyttMeddelande, setNyttMeddelande] = useState('');
  const [laddar, setLaddar] = useState(true);
  const [sparar, setSparar] = useState(false);

  useEffect(() => {
    async function ladda() {
      if (!användare) return;
      const vRes = await vikariApi.hämtaViaProfilId(användare.id);
      const vikarie = vRes.data as Vikarie | null;
      if (!vikarie) { setLaddar(false); return; }

      const pRes = await passApi.lista({ status: ['bokat', 'bekräftat'] });
      const mina = ((pRes.data ?? []) as Vikariepass[]).filter(p => p.vikarie_id === vikarie.id);
      setPass(mina);
      setLaddar(false);
    }
    ladda();
  }, [användare]);

  async function öppnaPass(p: Vikariepass) {
    setValtPass(p);
    const res = await passmeddelandeApi.lista(p.id);
    setMeddelanden((res.data ?? []) as Passmeddelande[]);
  }

  async function skickaMeddelande() {
    if (!valtPass || !nyttMeddelande.trim()) return;
    setSparar(true);
    const res = await passmeddelandeApi.skapa(valtPass.id, nyttMeddelande.trim(), 'vikarie');
    setSparar(false);
    if (!res.error) {
      setNyttMeddelande('');
      const ny = await passmeddelandeApi.lista(valtPass.id);
      setMeddelanden((ny.data ?? []) as Passmeddelande[]);
    }
  }

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Mina pass</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Meddela admin om du behöver ändra eller avboka ett pass.
        </p>
      </div>

      {pass.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Du har inga bokade pass.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pass.map(p => (
            <button
              key={p.id}
              onClick={() => öppnaPass(p)}
              className="w-full rounded-xl border p-4 text-left shadow-sm transition hover:opacity-90"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {new Date(p.datum).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {p.tid_från.slice(0,5)}-{p.tid_till.slice(0,5)}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Ersätter {visaKortNamn(p.personal?.namn)}
                  </p>
                  {p.anteckning && (
                    <p className="mt-2 text-xs" style={{ color: 'var(--text)' }}>{p.anteckning}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${PASS_STATUS_COLORS[p.status]}`}>
                  {PASS_STATUS_LABELS[p.status]}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {valtPass && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setValtPass(null)} />
          <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl p-5 shadow-xl sm:max-w-lg sm:rounded-xl" style={{ background: 'var(--bg-card)' }}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Meddelanden</h2>
              <button onClick={() => setValtPass(null)} style={{ color: 'var(--text-muted)' }}>Stäng</button>
            </div>

            <div className="mb-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              {valtPass.datum} · {valtPass.tid_från.slice(0,5)}-{valtPass.tid_till.slice(0,5)}
            </div>

            <div className="mb-4 space-y-2">
              {meddelanden.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Inga meddelanden ännu.</p>
              ) : meddelanden.map(m => (
                <div key={m.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                  <div className="mb-1 flex justify-between gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{m.avsandare_roll === 'admin' ? 'Admin' : 'Du'}</span>
                    <span>{new Date(m.created_at).toLocaleString('sv-SE')}</span>
                  </div>
                  <p style={{ color: 'var(--text)' }}>{m.meddelande}</p>
                </div>
              ))}
            </div>

            <textarea
              value={nyttMeddelande}
              onChange={e => setNyttMeddelande(e.target.value)}
              rows={3}
              placeholder="Skriv meddelande till admin..."
              className="mb-2 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <button
              onClick={skickaMeddelande}
              disabled={sparar || !nyttMeddelande.trim()}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}
            >
              {sparar ? 'Skickar...' : 'Skicka meddelande'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
