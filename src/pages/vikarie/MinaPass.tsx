import { useEffect, useState } from 'react';
import { passApi, vikariApi, passmeddelandeApi, passTidsändringApi, historikApi, notisApi } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Vikariepass, Vikarie, Passmeddelande, PassTidsändring } from '../../types';
import { PASS_STATUS_COLORS, PASS_STATUS_LABELS } from '../../types';
import { visaGruppInfo, visaKommentar, visaKortNamn } from '../../lib/display';

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

function ärPassPasserat(pass: Pick<Vikariepass, 'datum' | 'tid_till'>) {
  const sluttid = pass.tid_till?.slice(0, 5) || '23:59';
  return new Date(`${pass.datum}T${sluttid}:00`).getTime() < Date.now();
}


function meddelandeAvsandareNamn(m: Passmeddelande) {
  const namn = m.avsandare?.namn ?? m.avsandare?.epost;
  if (namn) return m.avsandare_roll === 'admin' ? `Admin: ${namn}` : namn;
  return m.avsandare_roll === 'admin' ? 'Admin' : 'Du';
}

function ärAvbokningsmeddelande(text: string) {
  const normaliserad = text.toLowerCase();
  return normaliserad.includes('avboka') || normaliserad.includes('avbokning');
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
  const gruppInfo = visaGruppInfo([pass.grupp]);

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
        <div className="flex items-start justify-between gap-3">
          <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{gruppInfo.etikett}</span>
          <span className="whitespace-pre-line text-right font-semibold" style={{ color: 'var(--text)' }}>
            {gruppInfo.text}
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
  const [minVikarie, setMinVikarie] = useState<Vikarie | null>(null);
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [meddelandeAntal, setMeddelandeAntal] = useState<Record<string, number>>({});
  const [valtPass, setValtPass] = useState<Vikariepass | null>(null);
  const [meddelanden, setMeddelanden] = useState<Passmeddelande[]>([]);
  const [nyttMeddelande, setNyttMeddelande] = useState('');
  const [modalInfo, setModalInfo] = useState('');
  const [laddar, setLaddar] = useState(true);
  const [sparar, setSparar] = useState(false);
  const [visaTidigare, setVisaTidigare] = useState(false);
  const [tidsändring, setTidsändring] = useState<PassTidsändring | null>(null);
  const [visaTidsförslag, setVisaTidsförslag] = useState(false);
  const [föreslagenTidFrån, setFöreslagenTidFrån] = useState('');
  const [föreslagenTidTill, setFöreslagenTidTill] = useState('');
  const [tidsändringsAnledning, setTidsändringsAnledning] = useState('');
  const [modalFel, setModalFel] = useState('');

  useEffect(() => {
    async function ladda() {
      if (!användare) return;

      const vRes = await vikariApi.hämtaViaProfilId(användare.id);
      const vikarie = vRes.data as Vikarie | null;
      setMinVikarie(vikarie);
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
    setModalFel('');
    setNyttMeddelande('');
    setVisaTidsförslag(false);
    setFöreslagenTidFrån(p.tid_från.slice(0, 5));
    setFöreslagenTidTill(p.tid_till.slice(0, 5));
    setTidsändringsAnledning('');

    const [meddelandeRes, tidsändringsRes] = await Promise.all([
      passmeddelandeApi.lista(p.id),
      passTidsändringApi.hämtaSenasteFörPass(p.id),
    ]);
    setMeddelanden((meddelandeRes.data ?? []) as Passmeddelande[]);
    const senaste = (tidsändringsRes.data ?? null) as PassTidsändring | null;
    setTidsändring(senaste);
    if (senaste?.status === 'vantar') {
      setFöreslagenTidFrån(senaste.foreslagen_tid_fran.slice(0, 5));
      setFöreslagenTidTill(senaste.foreslagen_tid_till.slice(0, 5));
      setTidsändringsAnledning(senaste.anledning);
    }
  }

  async function skickaTidsförslag() {
    if (!valtPass || !minVikarie) return;
    setModalFel('');
    setModalInfo('');

    if (!föreslagenTidFrån || !föreslagenTidTill || föreslagenTidFrån >= föreslagenTidTill) {
      setModalFel('Ange en giltig start- och sluttid.');
      return;
    }

    if (
      föreslagenTidFrån === valtPass.tid_från.slice(0, 5) &&
      föreslagenTidTill === valtPass.tid_till.slice(0, 5)
    ) {
      setModalFel('De föreslagna tiderna är samma som passets nuvarande tider.');
      return;
    }

    if (!tidsändringsAnledning.trim()) {
      setModalFel('Beskriv kort varför tiden behöver korrigeras.');
      return;
    }

    setSparar(true);
    const res = await passTidsändringApi.sparaFörslag({
      pass_id: valtPass.id,
      vikarie_id: minVikarie.id,
      foreslagen_tid_fran: föreslagenTidFrån,
      foreslagen_tid_till: föreslagenTidTill,
      anledning: tidsändringsAnledning.trim(),
    });

    if (res.error) {
      setSparar(false);
      setModalFel(res.error.message);
      return;
    }

    const text = `${minVikarie.namn} föreslår att passets tid ändras från ${valtPass.tid_från.slice(0, 5)}-${valtPass.tid_till.slice(0, 5)} till ${föreslagenTidFrån}-${föreslagenTidTill}.`;
    await Promise.all([
      passmeddelandeApi.skapa(valtPass.id, `${text} Anledning: ${tidsändringsAnledning.trim()}`, 'vikarie'),
      notisApi.skickaMeddelandeNotifiering(valtPass.id, 'vikarie', text),
      historikApi.skapa(valtPass.id, 'pass_uppdaterat', {
        åtgärd: 'tidsändring_föreslagen',
        vikarie_id: minVikarie.id,
        vikarie_namn: minVikarie.namn,
        tidigare_tid_från: valtPass.tid_från.slice(0, 5),
        tidigare_tid_till: valtPass.tid_till.slice(0, 5),
        föreslagen_tid_från: föreslagenTidFrån,
        föreslagen_tid_till: föreslagenTidTill,
      }, tidsändringsAnledning.trim()),
    ]);

    setTidsändring(res.data as PassTidsändring);
    setVisaTidsförslag(false);
    setModalInfo('Ditt tidsförslag är skickat till admin för godkännande.');
    await uppdateraMeddelanden(valtPass.id);
    setSparar(false);
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
    const text = nyttMeddelande.trim();
    setSparar(true);
    const res = await passmeddelandeApi.skapa(valtPass.id, text, 'vikarie');
    setSparar(false);

    if (!res.error) {
      if (ärAvbokningsmeddelande(text)) {
        await notisApi.skickaAdminAvbokning(valtPass.id);
      } else {
        await notisApi.skickaMeddelandeNotifiering(valtPass.id, 'vikarie', text);
      }

      setNyttMeddelande('');
      setModalInfo(ärAvbokningsmeddelande(text) ? 'Admin har fått din avbokningsförfrågan.' : 'Meddelandet är skickat till admin.');
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
      await notisApi.skickaAdminAvbokning(valtPass.id);
      setModalInfo('Admin har fått din avbokningsförfrågan.');
      await uppdateraMeddelanden(valtPass.id);
    }
  }

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--blue)', borderTopColor: 'transparent' }} />
    </div>
  );

  const kommande = pass.filter(p => !ärPassPasserat(p));
  const tidigare = pass.filter(ärPassPasserat).sort((a, b) => passNyckel(b).localeCompare(passNyckel(a)));

  return (
    <div className="mx-auto w-full max-w-3xl overflow-x-hidden p-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-6">
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
        <div className="mt-6 mb-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Arkiv</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tidigare.length} tidigare pass</p>
          </div>
          <button
            type="button"
            onClick={() => setVisaTidigare(v => !v)}
            className="shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            {visaTidigare ? 'Dölj' : 'Visa'}
          </button>
        </div>
      )}

      {visaTidigare && tidigare.length > 0 && (
        <section className="mt-3">
          <div className="grid gap-3 lg:grid-cols-2 opacity-80">
            {tidigare.map(p => (
              <PassKort key={p.id} pass={p} meddelanden={meddelandeAntal[p.id] ?? 0} onClick={() => öppnaPass(p)} />
            ))}
          </div>
        </section>
      )}

      {valtPass && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setValtPass(null)} />
          <div className="relative max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-2xl p-4 shadow-xl sm:max-w-lg sm:p-5" style={{ background: 'var(--bg-card)' }}>
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
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{visaGruppInfo([valtPass.grupp]).etikett}</span>
                <span className="whitespace-pre-line text-right font-semibold" style={{ color: 'var(--text)' }}>{visaGruppInfo([valtPass.grupp]).text}</span>
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

            {modalFel && (
              <p className="mb-4 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                {modalFel}
              </p>
            )}

            <section className="mb-4 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Arbetad tid</p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {tidsändring?.status === 'vantar'
                      ? 'Förslag väntar på admin'
                      : tidsändring?.status === 'godkand'
                        ? 'Senaste förslaget godkändes'
                        : tidsändring?.status === 'avslagen'
                          ? 'Senaste förslaget avslogs'
                          : 'Behöver tiden korrigeras?'}
                  </p>
                  {tidsändring && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      Föreslagen tid: {tidsändring.foreslagen_tid_fran.slice(0, 5)}-{tidsändring.foreslagen_tid_till.slice(0, 5)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setVisaTidsförslag(v => !v)}
                  className="shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--blue)' }}
                >
                  {visaTidsförslag ? 'Stäng' : tidsändring?.status === 'vantar' ? 'Ändra förslag' : 'Föreslå ändring'}
                </button>
              </div>

              {visaTidsförslag && (
                <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="min-w-0 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                      Från
                      <input
                        type="time"
                        value={föreslagenTidFrån}
                        onChange={e => setFöreslagenTidFrån(e.target.value)}
                        className="mt-1 block min-w-0 w-full rounded-lg border px-2 py-2 text-sm"
                        style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                      />
                    </label>
                    <label className="min-w-0 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                      Till
                      <input
                        type="time"
                        value={föreslagenTidTill}
                        onChange={e => setFöreslagenTidTill(e.target.value)}
                        className="mt-1 block min-w-0 w-full rounded-lg border px-2 py-2 text-sm"
                        style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                      />
                    </label>
                  </div>
                  <textarea
                    value={tidsändringsAnledning}
                    onChange={e => setTidsändringsAnledning(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="Kort anledning, exempelvis arbetade över eller började senare."
                    className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                  />
                  <button
                    type="button"
                    onClick={skickaTidsförslag}
                    disabled={sparar}
                    className="mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--blue)' }}
                  >
                    {sparar ? 'Skickar...' : 'Skicka för godkännande'}
                  </button>
                </div>
              )}
            </section>

            <button
              onClick={beOmAvbokning}
              disabled={sparar || ärPassPasserat(valtPass)}
              className="mb-4 w-full rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: '#ef4444', color: '#ef4444' }}
            >
              {ärPassPasserat(valtPass) ? 'Passet är arkiverat' : 'Jag behöver avboka'}
            </button>

            <div className="mb-4 space-y-2">
              {meddelanden.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Inga meddelanden ännu.</p>
              ) : meddelanden.map(m => (
                <div key={m.id} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                  <div className="mb-1 flex justify-between gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{meddelandeAvsandareNamn(m)}</span>
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
              placeholder="Skriv meddelande till admin. Undvik känsliga uppgifter."
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
