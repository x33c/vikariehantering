cat > src/pages/admin/Vikariepass.tsx << 'ENDOFFILE'
import { useEffect, useState, useCallback } from 'react';
import { passApi, historikApi, vikariApi, notisApi, personalApi } from '../../lib/api';
import type { Bemanning, PassStatus, Vikarie, Passhistorik, Personal, VikarieTillgänglighet } from '../../types';
import { PASS_STATUS_LABELS, PASS_STATUS_COLORS } from '../../types';
import { Button, Input, Select, TomtTillstånd, LaddaSida, StatusBadge, Alert, Modal, Confirm } from '../../components/ui';

const ALLA_STATUSAR: PassStatus[] = ['obokat', 'notifierat', 'bokat', 'bekräftat', 'avbokat'];

interface Passgrupp {
  personal_id: string;
  personalNamn: string;
  arbetslagNamn?: string;
  datum: string;
  pass: Bemanning[];
}

function grupperaPasser(pass: Bemanning[]): Passgrupp[] {
  const grupper = new Map<string, Passgrupp>();
  for (const p of pass) {
    const nyckel = `${p.personal_id ?? 'okänd'}_${p.datum}`;
    if (!grupper.has(nyckel)) {
      grupper.set(nyckel, {
        personal_id: p.personal_id ?? 'okänd',
        personalNamn: p.personal?.namn ?? 'Okänd personal',
        arbetslagNamn: p.personal?.arbetslag?.namn,
        datum: p.datum,
        pass: [],
      });
    }
    grupper.get(nyckel)!.pass.push(p);
  }
  return [...grupper.values()].sort((a, b) =>
    a.datum !== b.datum ? a.datum.localeCompare(b.datum) : a.personalNamn.localeCompare(b.personalNamn)
  );
}

function PassDetaljer({ pass, vikarier, onStäng, onUppdaterad }: {
  pass: Bemanning;
  vikarier: Vikarie[];
  onStäng: () => void;
  onUppdaterad: (p: Bemanning) => void;
}) {
  const [historik, setHistorik] = useState<Passhistorik[]>([]);
  const [valdaVikarier, setValdaVikarier] = useState<Set<string>>(new Set());
  const [tilldela, setTilldela] = useState(pass.vikarie_id ?? '');
  const [skickarNotis, setSkickarNotis] = useState(false);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState('');
  const [tillgänglighet, setTillgänglighet] = useState<Record<string, 'tillgänglig' | 'otillgänglig' | 'okänd'>>({});

  useEffect(() => {
    historikApi.listaFörPass(pass.id).then(res => {
      setHistorik((res.data ?? []) as Passhistorik[]);
      setLaddar(false);
    });
  }, [pass.id]);

  useEffect(() => {
    async function laddaTillgänglighet() {
      const passVeckodag = new Date(pass.datum).getDay();
      const resultat: Record<string, 'tillgänglig' | 'otillgänglig' | 'okänd'> = {};
      await Promise.all(vikarier.map(async (v) => {
        const res = await vikariApi.hämtaTillgänglighet(v.id);
        const poster = (res.data ?? []) as VikarieTillgänglighet[];
        const specifik = poster.find(t => t.datum === pass.datum);
        if (specifik) { resultat[v.id] = specifik.tillgänglig ? 'tillgänglig' : 'otillgänglig'; return; }
        const återkommande = poster.find(t => t.återkommande && t.veckodag === passVeckodag);
        if (återkommande) { resultat[v.id] = återkommande.tillgänglig ? 'tillgänglig' : 'otillgänglig'; return; }
        resultat[v.id] = 'okänd';
      }));
      setTillgänglighet(resultat);
    }
    if (vikarier.length > 0) laddaTillgänglighet();
  }, [pass.datum, vikarier]);

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
    onUppdaterad(res.data as Bemanning);
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
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Passdetaljer</h2>
        <button onClick={onStäng} style={{ color: 'var(--text-muted)' }}>✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {fel && <Alert typ="error">{fel}</Alert>}

        <div className="space-y-1.5 text-sm">
          {[
            { label: 'Datum', värde: pass.datum },
            { label: 'Tid', värde: `${pass.tid_från.slice(0,5)}–${pass.tid_till.slice(0,5)}` },
            { label: 'Personal', värde: pass.personal?.namn ?? '–' },
            pass.ämne ? { label: 'Ämne', värde: pass.ämne } : null,
            pass.grupp ? { label: 'Grupp', värde: pass.grupp } : null,
            pass.sal ? { label: 'Sal', värde: pass.sal } : null,
          ].filter(Boolean).map((r: any) => (
            <div key={r.label} className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
              <span className="font-medium" style={{ color: 'var(--text)' }}>{r.värde}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Status</span>
            <StatusBadge status={pass.status} />
          </div>
          {pass.vikarie_id && (
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Tillsatt vikarie</span>
              <span className="font-medium text-green-600">{vikarier.find(v => v.id === pass.vikarie_id)?.namn ?? '–'}</span>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Ändra status</p>
          <div className="flex flex-wrap gap-1.5">
            {ALLA_STATUSAR.map(s => (
              <button key={s} onClick={() => uppdateraStatus(s)} disabled={pass.status === s}
                className="rounded-md px-2.5 py-1 text-xs font-medium border transition-colors"
                style={{
                  background: pass.status === s ? 'var(--bg)' : 'transparent',
                  color: pass.status === s ? 'var(--text-subtle)' : 'var(--text-muted)',
                  borderColor: pass.status === s ? 'transparent' : 'var(--border)',
                }}>
                {PASS_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Tilldela vikarie</p>
          <div className="flex gap-2">
            <select value={tilldela} onChange={e => setTilldela(e.target.value)}
              className="flex-1 rounded-md border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}>
              <option value="">– Välj vikarie –</option>
              {vikarier.map(v => <option key={v.id} value={v.id}>{v.namn}</option>)}
            </select>
            <button onClick={tilldelaVikarie} disabled={!tilldela}
              className="rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}>
              Tilldela
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Rikta pass</p>
          <select
            value={pass.riktad_till_vikarie_id ?? ''}
            onChange={async e => {
              const val = e.target.value || null;
              const res = await passApi.uppdatera(pass.id, { riktad_till_vikarie_id: val } as any);
              if (res.data) onUppdaterad({ ...pass, riktad_till_vikarie_id: val });
            }}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}>
            <option value="">– Publikt –</option>
            {vikarier.map(v => <option key={v.id} value={v.id}>{v.namn}</option>)}
          </select>
          {pass.riktad_till_vikarie_id && (
            <p className="mt-1 text-xs text-yellow-600">
              Riktat till: {vikarier.find(v => v.id === pass.riktad_till_vikarie_id)?.namn ?? '–'}
            </p>
          )}
        </div>

        {pass.status === 'obokat' && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Notifiera vikarier</p>
            <div className="max-h-40 overflow-y-auto rounded-lg border p-2 space-y-1" style={{ borderColor: 'var(--border)' }}>
              {[...vikarier].sort((a, b) => {
                const o = { tillgänglig: 0, okänd: 1, otillgänglig: 2 };
                return o[tillgänglighet[a.id] ?? 'okänd'] - o[tillgänglighet[b.id] ?? 'okänd'];
              }).map(v => {
                const status = tillgänglighet[v.id] ?? 'okänd';
                const otillgänglig = status === 'otillgänglig';
                return (
                  <label key={v.id}
                    className={`flex items-center gap-2 cursor-pointer rounded px-2 py-1 ${otillgänglig ? 'opacity-40' : ''}`}
                    onMouseEnter={e => { if (!otillgänglig) e.currentTarget.style.background = 'var(--hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <input type="checkbox" checked={valdaVikarier.has(v.id)} disabled={otillgänglig}
                      onChange={e => {
                        const ny = new Set(valdaVikarier);
                        e.target.checked ? ny.add(v.id) : ny.delete(v.id);
                        setValdaVikarier(ny);
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300" />
                    <span className="text-sm" style={{ color: 'var(--text)' }}>{v.namn}</span>
                    {status === 'tillgänglig' && <span className="ml-auto text-xs font-medium text-green-600">Tillgänglig</span>}
                    {status === 'otillgänglig' && <span className="ml-auto text-xs font-medium text-red-500">Otillgänglig</span>}
                  </label>
                );
              })}
            </div>
            <Button size="sm" className="mt-2" loading={skickarNotis}
              disabled={valdaVikarier.size === 0} onClick={skickaNotiser}>
              Skicka fråga ({valdaVikarier.size})
            </Button>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Historik</p>
          {laddar ? <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Laddar…</p>
            : historik.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Ingen historik.</p>
            : historik.map(h => (
              <div key={h.id} className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--text-subtle)' }}>{new Date(h.created_at).toLocaleString('sv-SE')}</span>
                {' '}{h.händelse.replace(/_/g, ' ')}
              </div>
            ))}
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
        <Select label="Personal *" value={form.personal_id} onChange={e => setForm({ ...form, personal_id: e.target.value })}>
          <option value="">– Välj personal –</option>
          {personal.map(p => <option key={p.id} value={p.id}>{p.namn}</option>)}
        </Select>
        <Input label="Datum *" type="date" value={form.datum} onChange={e => setForm({ ...form, datum: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Från kl *" type="time" value={form.tid_från} onChange={e => setForm({ ...form, tid_från: e.target.value })} />
          <Input label="Till kl *" type="time" value={form.tid_till} onChange={e => setForm({ ...form, tid_till: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Ämne" value={form.ämne} onChange={e => setForm({ ...form, ämne: e.target.value })} />
          <Input label="Grupp" value={form.grupp} onChange={e => setForm({ ...form, grupp: e.target.value })} />
          <Input label="Sal" value={form.sal} onChange={e => setForm({ ...form, sal: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onStäng}>Avbryt</Button>
          <Button loading={laddar} onClick={spara}>Skapa pass</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Bemanning() {
  const [pass, setPass] = useState<Bemanning[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [valtPass, setValtPass] = useState<Bemanning | null>(null);
  const [skapaModal, setSkapaModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PassStatus | ''>('');
  const [datumFrån, setDatumFrån] = useState('');
  const [datumTill, setDatumTill] = useState('');
  const [valda, setValda] = useState<Set<string>>(new Set());
  const [raderaValda, setRaderaValda] = useState(false);
  const [raderar, setRaderar] = useState(false);

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
    setPass((pRes.data ?? []) as Bemanning[]);
    setVikarier((vRes.data ?? []) as Vikarie[]);
    setPersonal((perRes.data ?? []) as Personal[]);
    setLaddar(false);
  }, [statusFilter, datumFrån, datumTill]);

  useEffect(() => { ladda(); }, [ladda]);

  async function raderaMånga() {
    setRaderar(true);
    for (const id of valda) {
      await passApi.radera(id);
    }
    setValda(new Set());
    setRaderaValda(false);
    setRaderar(false);
    ladda();
  }

  if (laddar) return <LaddaSida />;

  const grupper = grupperaPasser(pass);

  return (
    <div className="flex h-full">
      <div className={`flex flex-col flex-1 p-4 sm:p-6 overflow-y-auto ${valtPass ? 'hidden lg:flex' : ''}`}>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Bemanning</h1>
          <div className="flex gap-2">
            {valda.size > 0 && (
              <Button variant="danger" size="sm" onClick={() => setRaderaValda(true)}>
                Ta bort ({valda.size})
              </Button>
            )}
            <Button onClick={() => setSkapaModal(true)}>+ Skapa pass</Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as PassStatus | '')}>
            <option value="">Alla statusar</option>
            {ALLA_STATUSAR.map(s => <option key={s} value={s}>{PASS_STATUS_LABELS[s]}</option>)}
          </Select>
          <Input type="date" value={datumFrån} onChange={e => setDatumFrån(e.target.value)} />
          <Input type="date" value={datumTill} onChange={e => setDatumTill(e.target.value)} />
        </div>

        {grupper.length === 0 ? (
          <TomtTillstånd text="Inga vikariepass matchar filtret." />
        ) : (
          <div className="space-y-3">
            {grupper.map(grupp => {
              const tidFrån = grupp.pass[0].tid_från.slice(0, 5);
              const tidTill = grupp.pass[grupp.pass.length - 1].tid_till.slice(0, 5);
              const ämnen = [...new Set(grupp.pass.map(p => p.ämne).filter(Boolean))];
              const vikarie = grupp.pass.find(p => p.vikarie_id);
              const vikariNamn = vikarie ? vikarier.find(v => v.id === vikarie.vikarie_id)?.namn : null;
              const statusar = [...new Set(grupp.pass.map(p => p.status))];
              const dominerandStatus = statusar.length === 1 ? statusar[0] : 'obokat';
              const alleMarkerade = grupp.pass.every(p => valda.has(p.id));

              return (
                <div key={`${grupp.personal_id}_${grupp.datum}`}
                  className="rounded-xl border p-4 shadow-sm"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={alleMarkerade}
                      onChange={e => {
                        const ny = new Set(valda);
                        grupp.pass.forEach(p => e.target.checked ? ny.add(p.id) : ny.delete(p.id));
                        setValda(ny);
                      }}
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                    <div className="flex-1 min-w-0" onClick={() => setValtPass(grupp.pass[0])} style={{ cursor: 'pointer' }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                            {new Date(grupp.datum).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </p>
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            {tidFrån}–{tidTill} · {grupp.pass.length} pass
                          </p>
                        </div>
                        <StatusBadge status={dominerandStatus as PassStatus} />
                      </div>

                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        <span className="font-medium" style={{ color: 'var(--text)' }}>{grupp.personalNamn}</span>
                        {grupp.arbetslagNamn && <> · {grupp.arbetslagNamn}</>}
                      </p>

                      {ämnen.length > 0 && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {ämnen.join(', ')}
                        </p>
                      )}

                      {vikariNamn ? (
                        <p className="text-xs mt-1 font-medium text-green-600">
                          ✓ {vikariNamn}
                        </p>
                      ) : (
                        <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>
                          Ingen vikarie tillsatt
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {valtPass && (
        <div className="flex flex-col flex-1 lg:flex-none lg:w-80 lg:shrink-0 border-l bg-white dark:bg-slate-900" style={{ borderColor: 'var(--border)' }}>
          <PassDetaljer
            pass={valtPass}
            vikarier={vikarier}
            onStäng={() => setValtPass(null)}
            onUppdaterad={uppdaterad => {
              setPass(prev => prev.map(p => p.id === uppdaterad.id ? { ...p, ...uppdaterad } : p));
              setValtPass(uppdaterad);
            }}
          />
        </div>
      )}

      <NyttPassModal öppen={skapaModal} onStäng={() => setSkapaModal(false)} personal={personal} onSkapad={ladda} />

      <Confirm
        öppen={raderaValda}
        titel="Ta bort pass"
        text={`Ta bort ${valda.size} markerade pass? Åtgärden kan inte ångras.`}
        bekräftaText={raderar ? 'Tar bort…' : `Ta bort ${valda.size} pass`}
        farlig
        onBekräfta={raderaMånga}
        onAvbryt={() => setRaderaValda(false)}
      />
    </div>
  );
}
ENDOFFILE