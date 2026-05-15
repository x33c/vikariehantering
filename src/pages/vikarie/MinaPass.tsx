import { useEffect, useState } from 'react';
import { passApi, vikariApi, passmeddelandeApi } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Vikariepass, Vikarie, Passmeddelande } from '../../types';
import { PASS_STATUS_COLORS, PASS_STATUS_LABELS } from '../../types';
import { visaArskurs, visaKommentar, visaKortNamn } from '../../lib/display';

function idagIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDatum(datum: string) {
  return new Date(`${datum}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function passNyckel(p: Vikariepass) {
  return `${p.datum}T${p.tid_från.slice(0, 5)}`;
}

function PassKort({
  pass,
  meddelanden,
  onClick,
}: {
  pass: Vikariepass;
  meddelanden: number;
  onClick: () => void;
}) {
  const kommentar = visaKommentar(pass.anteckning);

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border p-4 text-left shadow-sm transition hover:opacity-90"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text)' }}>
            {formatDatum(pass.datum)}
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--text)' }}>
            {pass.tid_från.slice(0, 5)}-{pass.tid_till.slice(0, 5)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${PASS_STATUS_COLORS[pass.status]}`}>
          {PASS_STATUS_LABELS[pass.status]}
        </span>
      </div>

      <div className="grid gap-2 rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--bg)' }}>
        {pass.personal?.namn && (
          <div className="flex justify-between gap-3">
            <span style={{ color: 'var(--text-muted)' }}>Vikarierar för</span>
            <span className="text-right font-semibold" style={{ color: 'var(--text)' }}>
              {visaKortNamn(pass.personal?.namn)}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <span style={{ color: 'var(--text-muted)' }}>Årskurs</span>
          <span className="text-right font-semibold" style={{ color: 'var(--text)' }}>
            {visaArskurs([pass.grupp])}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {kommentar && (
          <span className="rounded-full px-2.5 py-1 font-medium" style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}>
            Kommentar
          </span>
        )}
        {meddelanden > 0 && (
          <span className="rounded-full px-2.5 py-1 font-medium" style={{ background: 'color-mix(in srgb, var(--blue) 16%, transparent)', color: 'var(--blue)' }}>
            {meddelanden} från admin
          </span>
        )}
      </div>
    </button>
  );
}

export default function MinaPass() {
  const { användare } = useAuth();
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [meddelandeAntal, setMeddelandeAntal] = useState<Record<string, number>>({});
  const [valtPass, setValtPass] = useState<Vikariepass | null>(null);
  const [meddelanden, setMeddelanden] = useState<Passmeddelande[]>([]);
  const [nyttMeddelande, setNyttMeddelande] = useState('');
  const [modalInfo, setModalInfo] = useState('');
  const [laddar, setLaddar] = useState(true);
  const [sparar, setSparar] = useState(false);

  useEffect(() => {
    async function ladda() {
      if (!användare) return;

      const vRes = await vikariApi.hämtaViaProfilId(användare.id);
      const vikarie = vRes.data as Vikarie | null;
      if (!vikarie) {
        setLaddar(false);
        return;
      }

      const pRes = await passApi.lista({ status: ['bokat', 'bekräftat'] });
      const mina = ((pRes.data ?? []) as Vikariepass[])
        .filter(p => p.vikarie_id === vikarie.id)
        .sort((a, b) => passNyckel(a).localeCompare(passNyckel(b)));

      setPass(mina);

      const antal = await Promise.all(mina.map(async p => {
        const res = await passmeddelandeApi.lista(p.id);
        const adminAntal = ((res.data ?? []) as Passmeddelande[])
          .filter(m => m.avsandare_roll === 'admin')
          .length;
        return [p.id, adminAntal] as const;
      }));
      setMeddelandeAntal(Object.fromEntries(antal));
      setLaddar(false);
    }

    ladda();
  }, [användare]);

  async function öppnaPass(p: Vikariepass) {
    setValtPass(p);
    setModalInfo('');
    setNyttMeddelande('');
    const res = await passmeddelandeApi.lista(p.id);
    setMeddelanden((res.data ?? []) as Passmeddelande[]);
  }

  async function uppdateraMeddelanden(passId: string) {
    const ny = await passmeddelandeApi.lista(passId);
    const lista = (ny.data ?? []) as Passmeddelande[];
    setMeddelanden(lista);
    setMeddelandeAntal(prev => ({
      ...prev,
      [passId]: lista.filter(m => m.avsandare_roll === 'admin').length,
    }));
  }

  async function skickaMeddelande() {
    if (!valtPass || !nyttMeddelande.trim()) return;
    setSparar(true);
    const res = await passmeddelandeApi.skapa(valtPass.id, nyttMeddelande.trim(), 'vikarie');
    setSparar(false);

    if (!res.error) {
      setNyttMeddelande('');
      setModalInfo('Meddelandet är skickat till admin.');
      await uppdateraMeddelanden(valtPass.id);
    }
  }

  async function beOmAvbokning() {
    if (!valtPass) return;

    const text = `Jag behöver avboka passet ${valtPass.datum} ${valtPass.tid_från.slice(0, 5)}-${valtPass.tid_till.slice(0, 5)}.`;
    setSparar(true);
    const res = await passmeddelandeApi.skapa(valtPass.id, text, 'vikarie');
    setSparar(false);

    if (!res.error) {
      setModalInfo('Admin har fått din avbokningsförfrågan.');
      await uppdateraMeddelanden(valtPass.id);
    }
  }

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--blue)', borderTopColor: 'transparent' }} />
    </div>
  );

  const idag = idagIso();
  const kommande = pass.filter(p => p.datum >= idag);
  const tidigare = pass.filter(p => p.datum < idag).sort((a, b) => passNyckel(b).localeCompare(passNyckel(a)));

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-5 rounded-2xl border p-4 sm:p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Mina pass</p>
        <h1 className="mt-1 text-2xl font-semibold" style={{ color: 'var(--text)' }}>
          {kommande.length > 0 ? `${kommande.length} kommande pass` : 'Inga kommande pass'}
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Behöver du ändra eller avboka ett pass, skicka meddelande till admin.
        </p>
      </div>

      {kommande.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Du har inga kommande pass. Lägg gärna in tillgänglighet så kan admin hitta dig lättare.
          </p>
        </div>
      ) : (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Kommande</h2>
            <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}>
              {kommande.length}
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {kommande.map(p => (
              <PassKort key={p.id} pass={p} meddelanden={meddelandeAntal[p.id] ?? 0} onClick={() => öppnaPass(p)} />
            ))}
          </div>
        </section>
      )}

      {tidigare.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Tidigare</h2>
            <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}>
              {tidigare.length}
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2 opacity-80">
            {tidigare.map(p => (
              <PassKort key={p.id} pass={p} meddelanden={meddelandeAntal[p.id] ?? 0} onClick={() => öppnaPass(p)} />
            ))}
          </div>
        </section>
      )}

      {valtPass && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setValtPass(null)} />
          <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl p-4 shadow-xl sm:max-w-lg sm:rounded-2xl sm:p-5" style={{ background: 'var(--bg-card)' }}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Pass</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatDatum(valtPass.datum)} · {valtPass.tid_från.slice(0,5)}-{valtPass.tid_till.slice(0,5)}
                </p>
              </div>
              <button onClick={() => setValtPass(null)} style={{ color: 'var(--text-muted)' }}>Stäng</button>
            </div>

            <div className="mb-4 grid gap-2 rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--bg)' }}>
              {valtPass.personal?.namn && (
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>Vikarierar för</span>
                  <span className="text-right font-semibold" style={{ color: 'var(--text)' }}>{visaKortNamn(valtPass.personal?.namn)}</span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span style={{ color: 'var(--text-muted)' }}>Årskurs</span>
                <span className="text-right font-semibold" style={{ color: 'var(--text)' }}>{visaArskurs([valtPass.grupp])}</span>
              </div>
              {visaKommentar(valtPass.anteckning) && (
                <p className="pt-2 text-sm" style={{ color: 'var(--text)' }}>{visaKommentar(valtPass.anteckning)}</p>
              )}
            </div>

            {modalInfo && (
              <p className="mb-4 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'rgba(34,197,94,0.45)', background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                {modalInfo}
              </p>
            )}

            <button
              onClick={beOmAvbokning}
              disabled={sparar}
              className="mb-4 w-full rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: '#ef4444', color: '#ef4444' }}
            >
              Jag behöver avboka
            </button>

            <div className="mb-4 space-y-2">
              {meddelanden.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Inga meddelanden ännu.</p>
              ) : meddelanden.map(m => (
                <div key={m.id} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
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
              className="mb-2 w-full rounded-xl border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <button
              onClick={skickaMeddelande}
              disabled={sparar || !nyttMeddelande.trim()}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
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
