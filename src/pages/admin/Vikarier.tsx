import { useEffect, useState } from 'react';
import { vikariApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { Alert, Modal } from '../../components/ui';
import type { Vikarie, NyVikarie, VikarieTillgänglighet } from '../../types';
import { VECKODAG_LABELS } from '../../types';

async function anropaHanteraAnvandare(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('hantera-anvandare', {
    body: payload,
  });

  if (error) {
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        return {
          data: null,
          error: new Error(body?.error || error.message),
        };
      } catch {
        // Fall through to generic error below.
      }
    }

    return { data: null, error };
  }

  return { data, error: null };
}

function VikarieModal({ öppen, onStäng, vikarie, onSparad }: {
  öppen: boolean; onStäng: () => void; vikarie?: Vikarie; onSparad: (v: Vikarie) => void;
}) {
  const [form, setForm] = useState<NyVikarie>({
    profil_id: null, namn: '', epost: '', telefon: '', ämnen: [], stadier: [], anteckning: '', aktiv: true,
  });
  const [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState('');

  useEffect(() => {
    if (öppen) {
      setForm({ profil_id: vikarie?.profil_id ?? null, namn: vikarie?.namn ?? '', epost: vikarie?.epost ?? '',
        telefon: vikarie?.telefon ?? '', ämnen: [], stadier: [], anteckning: vikarie?.anteckning ?? '', aktiv: true });
      setFel('');
    }
  }, [öppen, vikarie]);

  async function spara() {
    if (!form.namn.trim()) { setFel('Namn krävs.'); return; }
    setLaddar(true);
    const data = { ...form, ämnen: [], stadier: [] };
    const res = vikarie ? await vikariApi.uppdatera(vikarie.id, data) : await vikariApi.skapa(data);
    setLaddar(false);
    if (res.error) { setFel(res.error.message); return; }
    onSparad(res.data as Vikarie);
    onStäng();
  }

  if (!öppen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onStäng} />
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold">{vikarie ? 'Redigera vikarie' : 'Lägg till vikarie'}</h2>
          <button onClick={onStäng} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="space-y-4 px-6 py-4">
          {fel && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{fel}</p>}
          {[
            { label: 'Namn *', key: 'namn', type: 'text' },
            { label: 'E-post', key: 'epost', type: 'email' },
            { label: 'Telefon', key: 'telefon', type: 'text' },
          ].map(({ label, key, type }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{label}</label>
              <input type={type} value={(form as any)[key] ?? ''}
                onChange={e => setForm({ ...form, [key]: e.target.value })}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onStäng} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Avbryt</button>
            <button onClick={spara} disabled={laddar} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {laddar ? 'Sparar…' : 'Spara'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const STANDARD_LOSENORD = 'Vikarie2026!';

function KontoModal({ vikarie, öppen, onStäng, onUppdaterad }: {
  vikarie: Vikarie | null;
  öppen: boolean;
  onStäng: () => void;
  onUppdaterad: () => void;
}) {
  const [epost, setEpost] = useState('');
  const [lösenord, setLösenord] = useState(STANDARD_LOSENORD);
  const [laddar, setLaddar] = useState(false);
  const [laddarRoll, setLaddarRoll] = useState(false);
  const [roll, setRoll] = useState<'vikarie' | 'admin'>('vikarie');
  const [adminLosenord, setAdminLosenord] = useState('');
  const [fel, setFel] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    if (!öppen || !vikarie) return;

    setEpost(vikarie.epost ?? '');
    setLösenord(STANDARD_LOSENORD);
    setRoll('vikarie');
    setAdminLosenord('');
    setFel('');
    setOk('');

    if (vikarie.profil_id) {
      supabase
        .from('profiler')
        .select('roll')
        .eq('id', vikarie.profil_id)
        .maybeSingle()
        .then(({ data }) => {
          setRoll(data?.roll === 'admin' ? 'admin' : 'vikarie');
        });
    }
  }, [vikarie, öppen]);

  if (!öppen || !vikarie) return null;

  async function sparaRoll() {
    setFel('');
    setOk('');

    if (!vikarie?.profil_id) {
      setFel('Skapa kontot först. Därefter kan du ändra roll.');
      return;
    }

    if (roll === 'admin' && !adminLosenord.trim()) {
      setFel('Ange ditt adminlösenord för att tilldela adminroll.');
      return;
    }

    setLaddarRoll(true);
    const { error } = await anropaHanteraAnvandare({
      åtgärd: 'uppdatera_roll',
      profil_id: vikarie.profil_id,
      roll,
      namn: vikarie.namn,
      aktiv: true,
      admin_losenord: roll === 'admin' ? adminLosenord : undefined,
    });
    setLaddarRoll(false);

    if (error) {
      setFel(error.message || 'Kunde inte uppdatera rollen.');
      return;
    }

    setAdminLosenord('');
    setOk(roll === 'admin' ? 'Klart. Kontot har adminbehörighet.' : 'Klart. Kontot är nu vikarie.');
    onUppdaterad();
  }

  async function sparaKonto() {
    setFel('');
    setOk('');
    if (!vikarie) return;

    if (!epost.trim()) {
      setFel('Ange e-post.');
      return;
    }

    if (lösenord.length < 8) {
      setFel('Lösenordet måste vara minst 8 tecken.');
      return;
    }

    setLaddar(true);
    const { error } = await anropaHanteraAnvandare({
      åtgärd: 'skapa',
      epost: epost.trim(),
      namn: vikarie.namn,
      vikarie_id: vikarie.id,
      tillfalligt_losenord: lösenord,
    });
    setLaddar(false);

    if (error) {
      setFel(error.message || 'Kunde inte spara kontot.');
      return;
    }

    setOk('Klart. Vikarien loggar in med det tillfälliga lösenordet och måste sedan byta lösenord.');
    onUppdaterad();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-md rounded-xl border shadow-xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Kontoinställningar
          </h2>
          <button
            type="button"
            onClick={onStäng}
            className="rounded px-2 py-1 text-xl leading-none"
            style={{ color: 'var(--text-muted)' }}
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            {vikarie.namn}
          </p>

          {fel && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fel}
            </div>
          )}

          {ok && (
            <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-500">
              {ok}
            </div>
          )}

          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Skapa eller återställ vikariens konto med ett tillfälligt lösenord. Vid första inloggning måste vikarien välja ett nytt lösenord.
          </p>

          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--text)' }}>E-post</span>
            <input
              type="email"
              value={epost}
              onChange={e => setEpost(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--text)' }}>Tillfälligt lösenord</span>
            <input
              type="text"
              value={lösenord}
              onChange={e => setLösenord(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
          </label>

          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Roll och behörighet</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Gör bara någon till admin om personen ska kunna ändra konton, pass och inställningar.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRoll('vikarie')}
                className="rounded-lg border px-3 py-2 text-sm font-medium"
                style={{
                  borderColor: roll === 'vikarie' ? 'var(--blue)' : 'var(--border)',
                  background: roll === 'vikarie' ? 'color-mix(in srgb, var(--blue) 12%, var(--bg-card))' : 'var(--bg-card)',
                  color: 'var(--text)',
                }}
              >
                Vikarie
              </button>
              <button
                type="button"
                onClick={() => setRoll('admin')}
                className="rounded-lg border px-3 py-2 text-sm font-medium"
                style={{
                  borderColor: roll === 'admin' ? 'var(--danger)' : 'var(--border)',
                  background: roll === 'admin' ? 'rgba(239, 68, 68, 0.10)' : 'var(--bg-card)',
                  color: roll === 'admin' ? 'var(--danger)' : 'var(--text)',
                }}
              >
                Admin
              </button>
            </div>

            {roll === 'admin' && (
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--text)' }}>Ditt adminlösenord</span>
                <input
                  type="password"
                  value={adminLosenord}
                  onChange={e => setAdminLosenord(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                  placeholder="Krävs för adminroll"
                />
              </label>
            )}

            <button
              type="button"
              onClick={sparaRoll}
              disabled={laddarRoll || !vikarie.profil_id}
              className="mt-3 w-full rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: roll === 'admin' ? 'var(--danger)' : 'var(--blue)' }}
            >
              {laddarRoll ? 'Sparar roll…' : vikarie.profil_id ? 'Spara roll' : 'Skapa konto först'}
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onStäng}
              className="rounded-lg border px-4 py-2 text-sm font-medium"
              style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
            >
              Avbryt
            </button>
            <button
              type="button"
              onClick={sparaKonto}
              disabled={laddar}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ background: 'var(--blue)' }}
            >
              {laddar ? 'Sparar…' : 'Spara konto'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function datumIdag() {
  return new Date().toISOString().slice(0, 10);
}

function veckodagFörDatum(datum: string) {
  return new Date(`${datum}T12:00:00`).getDay();
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


function hittaTillgänglighetFörDatum(poster: VikarieTillgänglighet[], datum: string) {
  const specifik = poster.find(t => t.datum === datum);
  if (specifik) return specifik;

  const veckodag = veckodagFörDatum(datum);
  return poster.find(t => t.återkommande && t.veckodag === veckodag) ?? null;
}

function tillgänglighetText(rad: VikarieTillgänglighet | null | undefined) {
  if (!rad) return { label: 'Okänd', detail: 'Ingen tid angiven', color: 'var(--text-muted)', bg: 'var(--hover)' };

  const tid = rad.tid_från && rad.tid_till
    ? `${rad.tid_från.slice(0, 5)}–${rad.tid_till.slice(0, 5)}`
    : 'Heldag';

  return rad.tillgänglig
    ? { label: 'Tillgänglig', detail: tid, color: '#22c55e', bg: 'rgba(34,197,94,0.14)' }
    : { label: 'Inte tillgänglig', detail: tid, color: '#ef4444', bg: 'rgba(239,68,68,0.14)' };
}



function tomTillgänglighetsForm(rad?: VikarieTillgänglighet) {
  return {
    typ: rad?.återkommande ? 'återkommande' : 'datum',
    datum: rad?.datum ?? new Date().toISOString().slice(0, 10),
    datum_till: rad?.datum ?? new Date().toISOString().slice(0, 10),
    veckodag: String(rad?.veckodag ?? 1),
    tid_från: rad?.tid_från?.slice(0, 5) ?? '',
    tid_till: rad?.tid_till?.slice(0, 5) ?? '',
    tillgänglig: rad?.tillgänglig ?? true,
    anteckning: rad?.anteckning ?? '',
  };
}

function tillgänglighetsRadText(rad: VikarieTillgänglighet) {
  const dag = rad.återkommande
    ? VECKODAG_LABELS[rad.veckodag ?? 0] ?? 'Veckodag'
    : rad.datum ?? 'Datum';
  const tid = rad.tid_från && rad.tid_till
    ? `${rad.tid_från.slice(0, 5)}-${rad.tid_till.slice(0, 5)}`
    : 'Heldag';

  return `${dag} · ${tid}`;
}

function TillgänglighetModal({
  öppen,
  vikarie,
  onStäng,
}: {
  öppen: boolean;
  vikarie: Vikarie;
  onStäng: () => void;
}) {
  const [rader, setRader] = useState<VikarieTillgänglighet[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');
  const [redigerar, setRedigerar] = useState<VikarieTillgänglighet | null>(null);
  const [form, setForm] = useState(tomTillgänglighetsForm());

  useEffect(() => {
    if (!öppen) return;

    let aktiv = true;
    setLaddar(true);
    setFel('');
    setRedigerar(null);
    setForm(tomTillgänglighetsForm());

    vikariApi.hämtaTillgänglighet(vikarie.id).then((res) => {
      if (!aktiv) return;
      setRader((res.data ?? []) as VikarieTillgänglighet[]);
      setLaddar(false);
    });

    return () => {
      aktiv = false;
    };
  }, [öppen, vikarie.id]);

  function börjaRedigera(rad: VikarieTillgänglighet) {
    setRedigerar(rad);
    setForm(tomTillgänglighetsForm(rad));
    setFel('');
  }

  function rensaForm() {
    setRedigerar(null);
    setForm(tomTillgänglighetsForm());
    setFel('');
  }

  async function sparaTillgänglighet() {
    if (form.typ === 'datum' && !form.datum) {
      setFel('Välj datum.');
      return;
    }

    if (form.typ === 'datum' && form.datum_till && form.datum_till < form.datum) {
      setFel('T.o.m. datum måste vara samma dag eller senare.');
      return;
    }

    if (form.tid_från && form.tid_till && form.tid_från >= form.tid_till) {
      setFel('Ange en giltig start- och sluttid.');
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

    const raderAttSkapa: Omit<VikarieTillgänglighet, 'id' | 'created_at' | 'updated_at'>[] = form.typ === 'datum'
      ? datumIntervall(form.datum, form.datum_till || form.datum).map(datum => ({
          ...basdata,
          datum,
          veckodag: null,
          återkommande: false,
        }))
      : [{
          ...basdata,
          datum: null,
          veckodag: Number(form.veckodag),
          återkommande: true,
        }];

    const skapade: VikarieTillgänglighet[] = [];
    for (const data of raderAttSkapa) {
      const res = await vikariApi.sättTillgänglighet(data);
      if (res.error) {
        setFel(res.error.message);
        setSparar(false);
        return;
      }
      skapade.push(res.data as VikarieTillgänglighet);
    }

    if (redigerar) {
      await vikariApi.raderaTillgänglighet(redigerar.id);
    }

    setRader((prev) => [...skapade, ...prev.filter((rad) => rad.id !== redigerar?.id)]);
    setSparar(false);
    rensaForm();
  }

  async function taBortTillgänglighet(rad: VikarieTillgänglighet) {
    if (!window.confirm('Ta bort tillgängligheten?')) return;

    const res = await vikariApi.raderaTillgänglighet(rad.id);
    if (res.error) {
      setFel(res.error.message);
      return;
    }

    setRader((prev) => prev.filter((item) => item.id !== rad.id));
    if (redigerar?.id === rad.id) rensaForm();
  }

  return (
    <Modal öppen={öppen} onStäng={onStäng} titel={`Tillgänglighet: ${vikarie.namn}`} bredd="lg">
      <div className="space-y-4">
        {fel && <Alert typ="error">{fel}</Alert>}

        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <div className="mb-3 flex rounded-lg border p-1" style={{ borderColor: 'var(--border)' }}>
            {(['datum', 'återkommande'] as const).map((typ) => {
              const aktiv = form.typ === typ;
              return (
                <button
                  key={typ}
                  type="button"
                  onClick={() => setForm({ ...form, typ })}
                  className="flex-1 rounded-md px-3 py-2 text-sm font-semibold transition"
                  style={{
                    background: aktiv ? 'var(--blue)' : 'transparent',
                    color: aktiv ? '#fff' : 'var(--text)',
                  }}
                >
                  {typ === 'datum' ? 'Datum' : 'Veckodag'}
                </button>
              );
            })}
          </div>

          {form.typ === 'datum' ? (
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block min-w-0 text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Från datum
                  <input
                    type="date"
                    value={form.datum}
                    onChange={(e) => setForm({ ...form, datum: e.target.value, datum_till: form.datum_till || e.target.value })}
                    className="mt-1 w-full min-w-0 rounded-lg border px-3 py-2 text-sm"
                    style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                  />
                </label>
                <label className="block min-w-0 text-sm font-medium" style={{ color: 'var(--text)' }}>
                  T.o.m. datum
                  <input
                    type="date"
                    value={form.datum_till}
                    onChange={(e) => setForm({ ...form, datum_till: e.target.value })}
                    className="mt-1 w-full min-w-0 rounded-lg border px-3 py-2 text-sm"
                    style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                  />
                </label>
              </div>
            ) : (
            <label className="mb-3 block text-sm font-medium" style={{ color: 'var(--text)' }}>
              Veckodag
              <select
                value={form.veckodag}
                onChange={(e) => setForm({ ...form, veckodag: e.target.value })}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
              >
                {VECKODAG_LABELS.slice(1, 6).map((dag, index) => (
                  <option key={index + 1} value={index + 1}>{dag}</option>
                ))}
              </select>
            </label>
          )}

          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium" style={{ color: 'var(--text)' }}>
              Från
              <input
                type="time"
                value={form.tid_från}
                onChange={(e) => setForm({ ...form, tid_från: e.target.value })}
                className="mt-1 w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
              />
            </label>
            <label className="block text-sm font-medium" style={{ color: 'var(--text)' }}>
              Till
              <input
                type="time"
                value={form.tid_till}
                onChange={(e) => setForm({ ...form, tid_till: e.target.value })}
                className="mt-1 w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
              />
            </label>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, tillgänglig: true })}
              className="rounded-md border px-3 py-2 text-sm font-semibold"
              style={{
                borderColor: form.tillgänglig ? '#22c55e' : 'var(--border)',
                color: form.tillgänglig ? '#22c55e' : 'var(--text-muted)',
              }}
            >
              Tillgänglig
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, tillgänglig: false })}
              className="rounded-md border px-3 py-2 text-sm font-semibold"
              style={{
                borderColor: !form.tillgänglig ? '#ef4444' : 'var(--border)',
                color: !form.tillgänglig ? '#ef4444' : 'var(--text-muted)',
              }}
            >
              Inte tillgänglig
            </button>
          </div>

          <input
            value={form.anteckning}
            onChange={(e) => setForm({ ...form, anteckning: e.target.value })}
            placeholder="Anteckning"
            className="mb-3 w-full rounded-md border px-3 py-2 text-sm"
            style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={rensaForm}
              className="rounded-md border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              Rensa
            </button>
            <button
              type="button"
              onClick={sparaTillgänglighet}
              disabled={sparar}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}
            >
              {sparar ? 'Sparar...' : redigerar ? 'Spara ändring' : 'Lägg till'}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Registrerad tillgänglighet
          </p>

          {laddar ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Laddar...</p>
          ) : rader.length === 0 ? (
            <p className="rounded-lg border px-3 py-4 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              Ingen tillgänglighet registrerad.
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {rader.map((rad) => (
                <div
                  key={rad.id}
                  className="rounded-lg border px-3 py-3"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                        {tillgänglighetsRadText(rad)}
                      </p>
                      <p className="text-xs font-semibold" style={{ color: rad.tillgänglig ? '#22c55e' : '#ef4444' }}>
                        {rad.tillgänglig ? 'Tillgänglig' : 'Inte tillgänglig'}
                      </p>
                      {rad.anteckning && (
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{rad.anteckning}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => börjaRedigera(rad)}
                        className="rounded px-2 py-1 text-xs font-semibold"
                        style={{ color: 'var(--blue)', background: 'color-mix(in srgb, var(--blue) 12%, transparent)' }}
                      >
                        Ändra
                      </button>
                      <button
                        type="button"
                        onClick={() => taBortTillgänglighet(rad)}
                        className="rounded px-2 py-1 text-xs font-semibold"
                        style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.10)' }}
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}


export default function Vikarier() {
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [modal, setModal] = useState<{ öppen: boolean; rad?: Vikarie }>({ öppen: false });
  const [kontoModal, setKontoModal] = useState<{ öppen: boolean; rad?: Vikarie }>({ öppen: false });
  const [tillgModal, setTillgModal] = useState<{ öppen: boolean; rad?: Vikarie }>({ öppen: false });
  const [raderaId, setRaderaId] = useState<string | null>(null);
  const [markeradeIds, setMarkeradeIds] = useState<Set<string>>(new Set());
  const [massModal, setMassModal] = useState(false);
  const [massTitel, setMassTitel] = useState('Meddelande från admin');
  const [massText, setMassText] = useState('');
  const [massFel, setMassFel] = useState('');
  const [massOk, setMassOk] = useState('');
  const [skickarMass, setSkickarMass] = useState(false);
  const [sök, setSök] = useState('');
  const [tillgDatum, setTillgDatum] = useState(datumIdag());
  const [tillgMap, setTillgMap] = useState<Record<string, VikarieTillgänglighet | null>>({});
  const [laddarTillg, setLaddarTillg] = useState(false);
  const [pushAntalByProfilId, setPushAntalByProfilId] = useState<Record<string, number>>({});

  async function laddaVikarier() {
    const res = await vikariApi.lista();
    const lista = (res.data ?? []) as Vikarie[];
    setVikarier(lista);

    const profilIds = lista.map(v => v.profil_id).filter(Boolean) as string[];
    if (profilIds.length > 0) {
      const { data } = await supabase
        .from('push_prenumerationer')
        .select('profil_id')
        .in('profil_id', profilIds)
        .eq('aktiv', true);

      const antal: Record<string, number> = {};
      for (const rad of data ?? []) {
        if (rad.profil_id) antal[rad.profil_id] = (antal[rad.profil_id] ?? 0) + 1;
      }
      setPushAntalByProfilId(antal);
    } else {
      setPushAntalByProfilId({});
    }

    setLaddar(false);
  }

  useEffect(() => {
    laddaVikarier();
  }, []);

  useEffect(() => {
    if (vikarier.length === 0) return;

    let aktiv = true;
    setLaddarTillg(true);

    Promise.all(
      vikarier.map(async (v) => {
        const res = await vikariApi.hämtaTillgänglighet(v.id);
        const rad = hittaTillgänglighetFörDatum((res.data ?? []) as VikarieTillgänglighet[], tillgDatum);
        return [v.id, rad] as const;
      })
    ).then((poster) => {
      if (!aktiv) return;
      setTillgMap(Object.fromEntries(poster));
      setLaddarTillg(false);
    });

    return () => { aktiv = false; };
  }, [vikarier, tillgDatum]);


  const filtrerade = sök
    ? vikarier.filter(v => v.namn.toLowerCase().includes(sök.toLowerCase()) || v.epost?.toLowerCase().includes(sök.toLowerCase()))
    : vikarier;

  const allaFiltreradeMarkerade = filtrerade.length > 0 && filtrerade.every(v => markeradeIds.has(v.id));

  function växlaMarkerad(id: string) {
    setMarkeradeIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function växlaAllaFiltrerade() {
    setMarkeradeIds(prev => {
      if (allaFiltreradeMarkerade) return new Set();
      return new Set([...prev, ...filtrerade.map(v => v.id)]);
    });
  }

  async function skickaMassmeddelande() {
    setMassFel('');
    setMassOk('');

    if (markeradeIds.size === 0) {
      setMassFel('Välj minst en vikarie.');
      return;
    }

    if (!massText.trim()) {
      setMassFel('Skriv ett meddelande.');
      return;
    }

    setSkickarMass(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setSkickarMass(false);
      setMassFel('Du måste logga in igen innan du kan skicka meddelanden.');
      return;
    }

    const { data, error } = await supabase.functions.invoke('skicka-epost', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        typ: 'massmeddelande_vikarier',
        vikarie_ids: [...markeradeIds],
        titel: massTitel,
        meddelande: massText,
      },
    });
    setSkickarMass(false);

    if (error) {
      const context = (error as any).context;
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.json();
          setMassFel(body?.error || error.message || 'Meddelandet kunde inte skickas.');
          return;
        } catch {
          // Visa standardfel nedan.
        }
      }

      setMassFel(error.message || 'Meddelandet kunde inte skickas.');
      return;
    }

    setMassOk(`Skickat till ${data?.skickade ?? 0} mottagare. ${data?.utan_push ? `${data.utan_push} saknar aktiva push-notiser.` : ''}`);
    setMassText('');
  }

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Konton</h1>
        <button onClick={() => setModal({ öppen: true })}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Lägg till konto
        </button>
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <input type="search" placeholder="Sök konto…" value={sök} onChange={e => setSök(e.target.value)}
          className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

        <div className="flex flex-wrap gap-2">
          <button onClick={växlaAllaFiltrerade}
            className="rounded-md border px-3 py-2 text-sm font-medium">
            {allaFiltreradeMarkerade ? 'Avmarkera alla' : 'Markera alla'}
          </button>
          <button
            onClick={() => setMassModal(true)}
            disabled={markeradeIds.size === 0}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            Skicka meddelande ({markeradeIds.size})
          </button>
        </div>
      </div>
      {filtrerade.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 py-16">
          <p className="text-sm text-gray-500">Inga konton registrerade.</p>
          <button onClick={() => setModal({ öppen: true })}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">Lägg till konto</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500">
<th className="px-4 py-2.5 text-left font-medium w-10"></th>
<th className="px-4 py-2.5 text-left font-medium">Namn</th>
              <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">E-post</th>
              <th className="px-4 py-2.5 text-left font-medium hidden md:table-cell">Telefon</th>
              <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Konto</th>
              <th className="px-4 py-2.5 text-left font-medium hidden lg:table-cell">Notiser</th>
              <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrerade.map(v => (
                <tr key={v.id} className="hover:bg-gray-50">
<td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={markeradeIds.has(v.id)}
                      onChange={() => växlaMarkerad(v.id)}
                      className="h-4 w-4 rounded"
                    />
                  </td>
<td className="px-4 py-3 font-medium text-gray-900">{v.namn}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{v.epost ?? '–'}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{v.telefon ?? '–'}</td>
                  <td className="px-4 py-3">
                    {v.profil_id
                      ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Aktivt konto</span>
                      : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inget konto</span>}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {!v.profil_id ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inget konto</span>
                    ) : (pushAntalByProfilId[v.profil_id] ?? 0) > 0 ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        På ({pushAntalByProfilId[v.profil_id]})
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">Av</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setKontoModal({ öppen: true, rad: v })}
                        className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Konto</button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTillgModal({ öppen: true, rad: v });
                        }}
                        className="rounded px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50"
                      >
                        Tillgänglighet
                      </button>
                      <button onClick={() => setModal({ öppen: true, rad: v })}
                        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">Redigera</button>
                      <button onClick={() => setRaderaId(v.id)}
                        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">Ta bort</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VikarieModal öppen={modal.öppen} onStäng={() => setModal({ öppen: false })} vikarie={modal.rad}
        onSparad={v => { setVikarier(prev => modal.rad ? prev.map(x => x.id === v.id ? v : x) : [...prev, v]); setModal({ öppen: false }); }} />

      {tillgModal.öppen && tillgModal.rad && (
        <TillgänglighetModal
          öppen={tillgModal.öppen}
          vikarie={tillgModal.rad}
          onStäng={() => setTillgModal({ öppen: false })}
        />
      )}


      {kontoModal.öppen && kontoModal.rad && (
        <KontoModal
          öppen={kontoModal.öppen}
          onStäng={() => setKontoModal({ öppen: false })}
          vikarie={kontoModal.rad}
          onUppdaterad={laddaVikarier}
        />
      )}

        {tillgModal.öppen && tillgModal.rad && (
          <TillgänglighetModal
            öppen={tillgModal.öppen}
            vikarie={tillgModal.rad}
            onStäng={() => setTillgModal({ öppen: false })}
          />
        )}

      {massModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border p-5 shadow-xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Skicka meddelande</h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{markeradeIds.size} valda mottagare</p>
              </div>
              <button onClick={() => setMassModal(false)} className="text-xl" style={{ color: 'var(--text-muted)' }}>×</button>
            </div>

            {massFel && <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{massFel}</div>}
            {massOk && <div className="mb-3 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-600">{massOk}</div>}

            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--text)' }}>Rubrik</span>
              <input
                value={massTitel}
                onChange={e => setMassTitel(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--text)' }}>Meddelande</span>
              <textarea
                value={massText}
                onChange={e => setMassText(e.target.value)}
                rows={4}
                placeholder="Exempel: Appen har uppdaterats. Starta gärna om appen om du inte ser nya pass."
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setMassModal(false)} className="rounded-md border px-4 py-2 text-sm">Stäng</button>
              <button
                onClick={skickaMassmeddelande}
                disabled={skickarMass}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {skickarMass ? 'Skickar…' : 'Skicka'}
              </button>
            </div>
          </div>
        </div>
      )}

      {raderaId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRaderaId(null)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold">Ta bort vikarie</h2>
            <p className="mb-6 text-sm text-gray-600">Bekräfta att du vill ta bort vikarie. Bokade pass påverkas inte.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRaderaId(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Avbryt</button>
              <button onClick={async () => { await vikariApi.radera(raderaId); setVikarier(prev => prev.filter(v => v.id !== raderaId)); setRaderaId(null); }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Ta bort</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
