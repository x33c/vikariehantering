import { useEffect, useState } from 'react';
import { vikariApi } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Vikarie, VikarieTillgänglighet } from '../../types';
import { VECKODAG_LABELS } from '../../types';

type Typ = 'specifikt' | 'återkommande';

const tomForm = {
  datum: '',
  datum_till: '',
  veckodag: '1',
  tid_från: '',
  tid_till: '',
  tillgänglig: true,
  anteckning: '',
};

function veckaFörDatum(datum: string) {
  const d = new Date(`${datum}T12:00:00`);
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);

  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function datumIntervall(start: string, slut: string) {
  const rader: string[] = [];
  const aktuell = new Date(`${start}T12:00:00`);
  const sista = new Date(`${slut}T12:00:00`);

  while (aktuell <= sista) {
    rader.push(aktuell.toISOString().slice(0, 10));
    aktuell.setDate(aktuell.getDate() + 1);
  }

  return rader;
}

function formatDatum(datum: string) {
  return new Date(`${datum}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatRad(t: VikarieTillgänglighet) {
  const dag = t.datum ? formatDatum(t.datum) : (t.veckodag !== null ? VECKODAG_LABELS[t.veckodag] : '–');
  const vecka = t.datum ? `Vecka ${veckaFörDatum(t.datum)}` : null;
  const tid = t.tid_från && t.tid_till ? `${t.tid_från.slice(0, 5)}–${t.tid_till.slice(0, 5)}` : 'Heldag';
  return { dag, tid, vecka };
}

export default function Tillganglighet() {
  const { användare } = useAuth();
  const [vikarie, setVikarie] = useState<Vikarie | null>(null);
  const [tillg, setTillg] = useState<VikarieTillgänglighet[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [modalÖppen, setModalÖppen] = useState(false);
  const [raderaId, setRaderaId] = useState<string | null>(null);
  const [typ, setTyp] = useState<Typ>('specifikt');
  const [form, setForm] = useState(tomForm);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');

  useEffect(() => {
    async function ladda() {
      if (!användare) return;
      const vRes = await vikariApi.hämtaViaProfilId(användare.id);
      const v = vRes.data as Vikarie | null;
      setVikarie(v);
      if (v) {
        const tRes = await vikariApi.hämtaTillgänglighet(v.id);
        setTillg((tRes.data ?? []) as VikarieTillgänglighet[]);
      }
      setLaddar(false);
    }
    ladda();
  }, [användare]);

  function öppnaModal(nyTyp: Typ = 'specifikt') {
    setTyp(nyTyp);
    setForm(tomForm);
    setFel('');
    setModalÖppen(true);
  }

  function snabbTid(tid_från: string, tid_till: string) {
    setForm(prev => ({ ...prev, tid_från, tid_till }));
  }

  function ärSnabbTid(tid_från: string, tid_till: string) {
    return form.tid_från === tid_från && form.tid_till === tid_till;
  }

  async function spara() {
    if (!vikarie) return;
    if (typ === 'specifikt' && !form.datum) {
      setFel('Välj från-datum.');
      return;
    }

    if (typ === 'specifikt' && form.datum_till && form.datum_till < form.datum) {
      setFel('T.o.m. datum måste vara samma dag eller senare.');
      return;
    }

    setSparar(true);
    setFel('');

    const basdata = {
      vikarie_id: vikarie.id,
      tillgänglig: form.tillgänglig,
      tid_från: form.tid_från || null,
      tid_till: form.tid_till || null,
      anteckning: form.anteckning || null,
    };

    const rader = typ === 'specifikt'
      ? datumIntervall(form.datum, form.datum_till || form.datum).map(datum => ({
          ...basdata,
          datum,
          veckodag: null,
          återkommande: false,
        }))
      : [{
          ...basdata,
          datum: null,
          veckodag: parseInt(form.veckodag),
          återkommande: true,
        }];

    const skapade: VikarieTillgänglighet[] = [];
    for (const data of rader) {
      const res = await vikariApi.sättTillgänglighet(data as Omit<VikarieTillgänglighet, 'id' | 'created_at' | 'updated_at'>);
      if (res.error) {
        setSparar(false);
        setFel(res.error.message);
        return;
      }
      skapade.push(res.data as VikarieTillgänglighet);
    }

    setSparar(false);
    setTillg(prev => [...skapade, ...prev]);
    setModalÖppen(false);
    setForm(tomForm);
  }

  async function radera() {
    if (!raderaId) return;
    await vikariApi.raderaTillgänglighet(raderaId);
    setTillg(prev => prev.filter(t => t.id !== raderaId));
    setRaderaId(null);
  }

  if (laddar) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--blue)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const återkommande = tillg.filter(t => t.återkommande);
  const specifika = tillg.filter(t => !t.återkommande);

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Tillgänglighet</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Lägg in när du kan eller inte kan arbeta.
        </p>
      </div>

      {!vikarie && (
        <div className="mb-4 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'rgba(234,179,8,0.45)', background: 'rgba(234,179,8,0.12)', color: '#eab308' }}>
          Din vikarieprofil är inte konfigurerad. Kontakta administratören.
        </div>
      )}

      <div className="mb-5">
        <button
          onClick={() => öppnaModal('specifikt')}
          className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white sm:w-auto"
          style={{ background: 'var(--blue)' }}
        >
          Lägg till tillgänglighet
        </button>
      </div>

      {tillg.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-12 text-center" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Ingen tillgänglighet registrerad.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Specifika datum</h2>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{specifika.length}</span>
            </div>
            <div className="space-y-2">
              {specifika.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Inga datum ännu.</p>
              ) : specifika.map(t => {
                const { dag, tid, vecka } = formatRad(t);
                return (
                  <article key={t.id} className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{dag}</p>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{tid}</p>
                        {vecka && <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>{vecka}</p>}
                      </div>
                      <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{
                        background: t.tillgänglig ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
                        color: t.tillgänglig ? '#22c55e' : '#ef4444',
                      }}>
                        {t.tillgänglig ? 'Tillgänglig' : 'Inte tillgänglig'}
                      </span>
                    </div>
                    {t.anteckning && <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{t.anteckning}</p>}
                    <button onClick={() => setRaderaId(t.id)} className="mt-3 text-xs font-medium" style={{ color: 'var(--danger)' }}>Ta bort</button>
                  </article>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Återkommande</h2>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{återkommande.length}</span>
            </div>
            <div className="space-y-2">
              {återkommande.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Inga återkommande dagar ännu.</p>
              ) : återkommande.map(t => {
                const { dag, tid } = formatRad(t);
                return (
                  <article key={t.id} className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{dag}</p>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{tid}</p>
                      </div>
                      <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{
                        background: t.tillgänglig ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
                        color: t.tillgänglig ? '#22c55e' : '#ef4444',
                      }}>
                        {t.tillgänglig ? 'Tillgänglig' : 'Inte tillgänglig'}
                      </span>
                    </div>
                    {t.anteckning && <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{t.anteckning}</p>}
                    <button onClick={() => setRaderaId(t.id)} className="mt-3 text-xs font-medium" style={{ color: 'var(--danger)' }}>Ta bort</button>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {modalÖppen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalÖppen(false)} />
          <div className="relative w-full rounded-t-2xl border p-5 shadow-xl sm:max-w-sm sm:rounded-2xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Lägg till tillgänglighet</h2>
              <button onClick={() => setModalÖppen(false)} style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>

            {fel && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{fel}</p>}

            <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              {(['specifikt', 'återkommande'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTyp(t)}
                  className="py-2.5 text-sm font-semibold"
                  style={{
                    background: typ === t ? 'var(--blue)' : 'var(--bg-card)',
                    color: typ === t ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {t === 'specifikt' ? 'Datum' : 'Veckodag'}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {typ === 'specifikt' ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--text)' }}>Från datum</span>
                    <input
                      type="date"
                      value={form.datum}
                      onChange={e => setForm({ ...form, datum: e.target.value, datum_till: form.datum_till || e.target.value })}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--text)' }}>T.o.m. datum</span>
                    <input
                      type="date"
                      value={form.datum_till}
                      onChange={e => setForm({ ...form, datum_till: e.target.value })}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                    />
                  </label>
                  {form.datum && (
                    <p className="col-span-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {form.datum_till && form.datum_till !== form.datum
                        ? `Vecka ${veckaFörDatum(form.datum)}–${veckaFörDatum(form.datum_till)}`
                        : `Vecka ${veckaFörDatum(form.datum)}`}
                    </p>
                  )}
                </div>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--text)' }}>Veckodag</span>
                  <select value={form.veckodag} onChange={e => setForm({ ...form, veckodag: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}>
                    {VECKODAG_LABELS.slice(1, 6).map((dag, i) => (
                      <option key={i + 1} value={i + 1}>{dag}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Heldag', från: '', till: '' },
                  { label: 'FM', från: '08:00', till: '12:00' },
                  { label: 'EM', från: '12:00', till: '17:00' },
                ].map(val => {
                  const aktiv = ärSnabbTid(val.från, val.till);
                  return (
                    <button
                      key={val.label}
                      type="button"
                      onClick={() => snabbTid(val.från, val.till)}
                      className="rounded-lg border px-2 py-2 text-xs font-semibold transition-all"
                      style={{
                        background: aktiv ? 'var(--blue)' : 'var(--bg-card)',
                        borderColor: aktiv ? 'var(--blue)' : 'var(--border)',
                        color: aktiv ? '#fff' : 'var(--text)',
                        boxShadow: aktiv ? '0 0 0 3px var(--nav-active-ring-soft)' : 'none',
                      }}
                    >
                      {val.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--text)' }}>Från</span>
                  <input type="time" value={form.tid_från} onChange={e => setForm({ ...form, tid_från: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--text)' }}>Till</span>
                  <input type="time" value={form.tid_till} onChange={e => setForm({ ...form, tid_till: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setForm({ ...form, tillgänglig: true })} className="rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: form.tillgänglig ? '#22c55e' : 'var(--border)', color: form.tillgänglig ? '#22c55e' : 'var(--text)' }}>Tillgänglig</button>
                <button onClick={() => setForm({ ...form, tillgänglig: false })} className="rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: !form.tillgänglig ? '#ef4444' : 'var(--border)', color: !form.tillgänglig ? '#ef4444' : 'var(--text)' }}>Inte tillgänglig</button>
              </div>

              <input value={form.anteckning} onChange={e => setForm({ ...form, anteckning: e.target.value })}
                placeholder="Anteckning"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }} />

              <div className="flex gap-2 pt-2">
                <button onClick={() => setModalÖppen(false)} className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>Avbryt</button>
                <button onClick={spara} disabled={sparar} className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--blue)' }}>
                  {sparar ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {raderaId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRaderaId(null)} />
          <div className="relative w-full rounded-t-2xl border p-5 shadow-xl sm:max-w-sm sm:rounded-2xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="mb-4 text-base font-semibold" style={{ color: 'var(--text)' }}>Ta bort tillgänglighet?</h2>
            <div className="flex gap-2">
              <button onClick={() => setRaderaId(null)} className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>Avbryt</button>
              <button onClick={radera} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">Ta bort</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
