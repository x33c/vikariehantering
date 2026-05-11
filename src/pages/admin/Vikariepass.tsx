import { useEffect, useState, useCallback } from 'react';
import { passApi, historikApi, vikariApi, notisApi, personalApi } from '../../lib/api';
import type { Vikariepass, PassStatus, Vikarie, Passhistorik, Notis, Personal } from '../../types';
import { PASS_STATUS_LABELS, PASS_STATUS_COLORS } from '../../types';
import {
  Button, Input, Select, Modal, TomtTillstånd, LaddaSida,
  StatusBadge, Alert
} from '../../components/ui';

const ALLA_STATUSAR: PassStatus[] = ['obokat', 'notifierat', 'bokat', 'bekräftat', 'avbokat'];

function PassDetaljer({
  pass, vikarier, onStäng, onUppdaterad,
}: {
  pass: Vikariepass;
  vikarier: Vikarie[];
  onStäng: () => void;
  onUppdaterad: (p: Vikariepass) => void;
}) {
  const [historik, setHistorik] = useState<Passhistorik[]>([]);
  const [notiser, setNotiser] = useState<Notis[]>([]);
  const [valdaVikarier, setValdaVikarier] = useState<Set<string>>(new Set());
  const [tilldela, setTilldela] = useState(pass.vikarie_id ?? '');
  const [skickarNotis, setSkickarNotis] = useState(false);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState('');

  useEffect(() => {
    Promise.all([
      historikApi.listaFörPass(pass.id),
      notisApi.listaFörPass(pass.id),
    ]).then(([hRes, nRes]) => {
      setHistorik((hRes.data ?? []) as Passhistorik[]);
      setNotiser((nRes.data ?? []) as Notis[]);
      setLaddar(false);
    });
  }, [pass.id]);

  async function uppdateraStatus(status: PassStatus) {
    const res = await passApi.uppdateraStatus(pass.id, status);
    if (res.error) return;
    await historikApi.skapa(pass.id, 'pass_uppdaterat', { ny_status: status });
    onUppdaterad({ ...pass, status });
  }

  async function tilldelaVikarie() {
    if (!tilldela) return;
    const res = await passApi.tilldelVikarie(pass.id, tilldela);
    if (res.error) { setFel(res.error.message); return; }
    await historikApi.skapa(pass.id, 'vikarie_bokat', { vikarie_id: tilldela });
    onUppdaterad(res.data as Vikariepass);
  }

  async function skickaNotiser() {
    if (valdaVikarier.size === 0) return;
    setSkickarNotis(true);
    setFel('');
    const { error } = await notisApi.skickaNotiser(pass.id, [...valdaVikarier]);
    if (error) { setFel('Notifiering misslyckades: ' + error.message); }
    else {
      await passApi.uppdateraStatus(pass.id, 'notifierat');
      await historikApi.skapa(pass.id, 'vikarie_notifierat', { antal: valdaVikarier.size });
      onUppdaterad({ ...pass, status: 'notifierat' });
    }
    setSkickarNotis(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Vikariepass</h2>
        <button onClick={onStäng} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {fel && <Alert typ="error">{fel}</Alert>}
        <div className="space-y-1.5 text-sm">
          {[
            { label: 'Datum', värde: pass.datum },
            { label: 'Tid', värde: `${pass.tid_från.slice(0,5)}–${pass.tid_till.slice(0,5)}` },
            { label: 'Personal', värde: pass.personal?.namn ?? '–' },
            pass.ämne ? { label: 'Ämne', värde: pass.ämne } : null,
            pass.grupp ? { label: 'Grupp/klass', värde: pass.grupp } : null,
            pass.sal ? { label: 'Sal', värde: pass.sal } : null,
          ].filter(Boolean).map((r: any) => (
            <div key={r.label} className="flex justify-between">
              <span className="text-gray-500">{r.label}</span>
              <span className="font-medium">{r.värde}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span className="text-gray-500">Status</span>
            <StatusBadge status={pass.status} />
          </div>
          {pass.vikarie_id && (
            <div className="flex justify-between">
              <span className="text-gray-500">Vikarie</span>
              <span className="font-medium">{vikarier.find(v => v.id === pass.vikarie_id)?.namn ?? '–'}</span>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Ändra status</p>
          <div className="flex flex-wrap gap-1.5">
            {ALLA_STATUSAR.map((s) => (
              <button key={s} onClick={() => uppdateraStatus(s)} disabled={pass.status === s}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors border ${
                  pass.status === s
                    ? 'border-transparent bg-gray-100 text-gray-400 cursor-default'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}>
                {PASS_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Tilldela vikarie</p>
          <div className="flex gap-2">
            <select value={tilldela} onChange={(e) => setTilldela(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">– Välj vikarie –</option>
              {vikarier.map((v) => <option key={v.id} value={v.id}>{v.namn}</option>)}
            </select>
            <button onClick={tilldelaVikarie} disabled={!tilldela}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              Tilldela
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Rikta pass till specifik vikarie</p>
          <p className="mb-2 text-xs text-gray-400">Passet syns bara för den valda vikarien.</p>
          <select
            value={pass.riktad_till_vikarie_id ?? ''}
            onChange={async (e) => {
              const val = e.target.value || null;
              const res = await passApi.uppdatera(pass.id, { riktad_till_vikarie_id: val } as any);
              if (res.data) onUppdaterad({ ...pass, riktad_till_vikarie_id: val });
            }}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">– Publikt (alla vikarier) –</option>
            {vikarier.map((v) => <option key={v.id} value={v.id}>{v.namn}</option>)}
          </select>
          {pass.riktad_till_vikarie_id && (
            <p className="mt-1.5 text-xs text-yellow-600">
              Riktat till: {vikarier.find(v => v.id === pass.riktad_till_vikarie_id)?.namn ?? '–'}
            </p>
          )}
        </div>

        {pass.status === 'obokat' && (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Notifiera vikarier</p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
              {vikarier.map((v) => (
                <label key={v.id} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-gray-50">
                  <input type="checkbox" checked={valdaVikarier.has(v.id)}
                    onChange={(e) => {
                      const ny = new Set(valdaVikarier);
                      e.target.checked ? ny.add(v.id) : ny.delete(v.id);
                      setValdaVikarier(ny);
                    }}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">{v.namn}</span>
                  {v.epost && <span className="text-xs text-gray-400 truncate">{v.epost}</span>}
                </label>
              ))}
            </div>
            <Button size="sm" className="mt-2" loading={skickarNotis}
              disabled={valdaVikarier.size === 0} onClick={skickaNotiser}>
              Skicka notiser ({valdaVikarier.size})
            </Button>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Historik</p>
          {laddar ? (
            <p className="text-xs text-gray-400">Laddar…</p>
          ) : historik.length === 0 ? (
            <p className="text-xs text-gray-400">Ingen historik.</p>
          ) : (
            <div className="space-y-1.5">
              {historik.map((h) => (
                <div key={h.id} className="text-xs text-gray-600">
                  <span className="text-gray-400">{new Date(h.created_at).toLocaleString('sv-SE')}</span>
                  {' '}{h.händelse.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NyttPassModal({ öppen, onStäng, personal, onSkapad }: {
  öppen: boolean; onStäng: () => void; personal: Personal[]; onSkapad: () => void;
}) {
  const [form, setForm] = useState({
    personal_id: '', datum: new Date().toISOString().slice(0, 10),
    tid_från: '08:00', tid_till: '17:00', ämne: '', grupp: '', sal: '',
  });
  const [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState('');

  async function spara() {
    if (!form.personal_id) { setFel('Välj personal.'); return; }
    setLaddar(true);
    const res = await passApi.skapa({
      personal_id: form.personal_id, frånvaro_id: null, schemarad_id: null, vikarie_id: null,
      datum: form.datum, tid_från: form.tid_från, tid_till: form.tid_till, typ: 'del_av_dag',
      ämne: form.ämne || null, grupp: form.grupp || null, sal: form.sal || null,
      anteckning: null, status: 'obokat', skapad_av: null,
    });
    setLaddar(false);
    if (res.error) { setFel(res.error.message); return; }
    if (res.data) await historikApi.skapa(res.data.id, 'pass_skapat');
    onSkapad();
    onStäng();
  }

  return (
    <Modal öppen={öppen} onStäng={onStäng} titel="Skapa vikariepass" bredd="lg">
      <div className="space-y-4">
        {fel && <Alert typ="error">{fel}</Alert>}
        <Select label="Personal *" value={form.personal_id} onChange={(e) => setForm({ ...form, personal_id: e.target.value })}>
          <option value="">– Välj personal –</option>
          {personal.map((p) => <option key={p.id} value={p.id}>{p.namn}</option>)}
        </Select>
        <Input label="Datum *" type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Från kl *" type="time" value={form.tid_från} onChange={(e) => setForm({ ...form, tid_från: e.target.value })} />
          <Input label="Till kl *" type="time" value={form.tid_till} onChange={(e) => setForm({ ...form, tid_till: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Ämne" value={form.ämne} onChange={(e) => setForm({ ...form, ämne: e.target.value })} />
          <Input label="Grupp/klass" value={form.grupp} onChange={(e) => setForm({ ...form, grupp: e.target.value })} />
          <Input label="Sal" value={form.sal} onChange={(e) => setForm({ ...form, sal: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onStäng}>Avbryt</Button>
          <Button loading={laddar} onClick={spara}>Skapa pass</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Vikariepass() {
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [valtPass, setValtPass] = useState<Vikariepass | null>(null);
  const [skapaModal, setSkapaModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PassStatus | ''>('');
  const [datumFrån, setDatumFrån] = useState('');
  const [datumTill, setDatumTill] = useState('');

  const ladda = useCallback(async () => {
    const [pRes, vRes, perRes] = await Promise.all([
      passApi.lista({
        status: statusFilter ? [statusFilter] : undefined,
        datumFrån: datumFrån || undefined,
        datumTill: datumTill || undefined,
      }),
      vikariApi.lista(),
      personalApi.lista(),
    ]);
    setPass((pRes.data ?? []) as Vikariepass[]);
    setVikarier((vRes.data ?? []) as Vikarie[]);
    setPersonal((perRes.data ?? []) as Personal[]);
    setLaddar(false);
  }, [statusFilter, datumFrån, datumTill]);

  useEffect(() => { ladda(); }, [ladda]);

  if (laddar) return <LaddaSida />;

  return (
    <div className="flex h-full">
      <div className={`flex flex-col flex-1 p-4 sm:p-6 overflow-y-auto ${valtPass ? 'hidden lg:flex' : ''}`}>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Vikariepass</h1>
          <Button onClick={() => setSkapaModal(true)}>+ Skapa pass</Button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PassStatus | '')}>
            <option value="">Alla statusar</option>
            {ALLA_STATUSAR.map((s) => (
              <option key={s} value={s}>{PASS_STATUS_LABELS[s]}</option>
            ))}
          </Select>
          <Input type="date" value={datumFrån} onChange={(e) => setDatumFrån(e.target.value)} />
          <Input type="date" value={datumTill} onChange={(e) => setDatumTill(e.target.value)} />
        </div>

        {pass.length === 0 ? (
          <TomtTillstånd text="Inga vikariepass matchar filtret." />
        ) : (
          <>
            {/* Tabell på desktop */}
            <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-2.5 text-left font-medium">Datum</th>
                    <th className="px-4 py-2.5 text-left font-medium">Tid</th>
                    <th className="px-4 py-2.5 text-left font-medium">Personal</th>
                    <th className="px-4 py-2.5 text-left font-medium">Ämne</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pass.map((p) => (
                    <tr key={p.id}
                      className={`cursor-pointer hover:bg-gray-50 ${valtPass?.id === p.id ? 'bg-blue-50' : ''}`}
                      onClick={() => setValtPass(p)}>
                      <td className="px-4 py-3 text-gray-700">{p.datum}</td>
                      <td className="px-4 py-3 text-gray-700">{p.tid_från.slice(0,5)}–{p.tid_till.slice(0,5)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{p.personal?.namn ?? '–'}</p>
                        {p.personal?.arbetslag && <p className="text-xs text-gray-500">{p.personal.arbetslag.namn}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.ämne ?? '–'}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Kort på mobil */}
            <div className="md:hidden space-y-2">
              {pass.map((p) => (
                <div key={p.id} onClick={() => setValtPass(p)}
                  className={`rounded-xl border bg-white p-4 shadow-sm cursor-pointer ${valtPass?.id === p.id ? 'border-blue-400' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {new Date(p.datum).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </p>
                      <p className="text-xs text-gray-500">{p.tid_från.slice(0,5)}–{p.tid_till.slice(0,5)}</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-sm text-gray-700">{p.personal?.namn ?? '–'}</p>
                  {p.personal?.arbetslag && <p className="text-xs text-gray-400">{p.personal.arbetslag.namn}</p>}
                  {p.ämne && <p className="text-xs text-gray-500 mt-1">Ämne: {p.ämne}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Side panel – på mobil: fullskärm */}
      {valtPass && (
        <div className="flex flex-col flex-1 lg:flex-none lg:w-80 lg:shrink-0 border-l border-gray-200 bg-white">
          <PassDetaljer
            pass={valtPass}
            vikarier={vikarier}
            onStäng={() => setValtPass(null)}
            onUppdaterad={(uppdaterad) => {
              setPass((prev) => prev.map((p) => p.id === uppdaterad.id ? { ...p, ...uppdaterad } : p));
              setValtPass(uppdaterad);
            }}
          />
        </div>
      )}

      <NyttPassModal öppen={skapaModal} onStäng={() => setSkapaModal(false)} personal={personal} onSkapad={ladda} />
    </div>
  );
}