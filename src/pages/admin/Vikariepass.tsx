import { useEffect, useState, useCallback } from 'react';
import { passApi, historikApi, vikariApi, notisApi, personalApi, frånvaroApi, passmeddelandeApi } from '../../lib/api';
import type { Bemanning, PassStatus, Vikarie, Passhistorik, Personal, VikarieTillgänglighet, Schemarad, Passmeddelande } from '../../types';
import { PASS_STATUS_LABELS, PASS_STATUS_COLORS } from '../../types';
import { Button, Input, Select, TomtTillstånd, LaddaSida, StatusBadge, Alert, Modal, Confirm } from '../../components/ui';

const ALLA_STATUSAR: PassStatus[] = ['obokat', 'notifierat', 'bokat', 'bekräftat', 'avbokat'];

function minuter(tid?: string | null) {
  const [h, m] = (tid?.slice(0, 5) ?? '00:00').split(':').map(Number);
  return h * 60 + m;
}

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
  const [valdVikarieId, setValdVikarieId] = useState(pass.vikarie_id ?? pass.riktad_till_vikarie_id ?? '');
  const [tidFrån, setTidFrån] = useState(pass.tid_från.slice(0, 5));
  const [tidTill, setTidTill] = useState(pass.tid_till.slice(0, 5));
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState('');
  const [sparar, setSparar] = useState(false);
  const [meddelanden, setMeddelanden] = useState<Passmeddelande[]>([]);
  const [nyttMeddelande, setNyttMeddelande] = useState('');
  const [skickarMeddelande, setSkickarMeddelande] = useState(false);

  useEffect(() => {
    setTidFrån(pass.tid_från.slice(0, 5));
    setTidTill(pass.tid_till.slice(0, 5));
    setValdVikarieId(pass.vikarie_id ?? pass.riktad_till_vikarie_id ?? '');
  }, [pass.id, pass.tid_från, pass.tid_till, pass.vikarie_id, pass.riktad_till_vikarie_id]);

  useEffect(() => {
    async function laddaPassdata() {
      const [historikRes, meddelandeRes] = await Promise.all([
        historikApi.listaFörPass(pass.id),
        passmeddelandeApi.lista(pass.id),
      ]);
      setHistorik((historikRes.data ?? []) as Passhistorik[]);
      setMeddelanden((meddelandeRes.data ?? []) as Passmeddelande[]);
      setLaddar(false);
    }
    laddaPassdata();
  }, [pass.id]);

  async function uppdateraPass(data: Partial<Bemanning>, historik: Record<string, unknown>) {
    setSparar(true);
    setFel('');

    const res = await passApi.uppdatera(pass.id, data as any);
    setSparar(false);

    if (res.error) {
      setFel(res.error.message);
      return false;
    }

    await historikApi.skapa(pass.id, 'pass_uppdaterat', historik);
    onUppdaterad({ ...pass, ...data });
    return true;
  }

  async function sparaTider() {
    if (!tidFrån || !tidTill || tidFrån >= tidTill) {
      setFel('Ange en giltig start- och sluttid.');
      return;
    }

    await uppdateraPass(
      { tid_från: tidFrån, tid_till: tidTill } as Partial<Bemanning>,
      { åtgärd: 'ändrade_tider', tid_från: tidFrån, tid_till: tidTill }
    );
  }

  async function publiceraLedigt() {
    await uppdateraPass(
      {
        status: 'obokat',
        publicerad: true,
        vikarie_id: null,
        riktad_till_vikarie_id: null,
      } as Partial<Bemanning>,
      { åtgärd: 'publicerade_ledigt' }
    );
  }

  async function avpublicera() {
    await uppdateraPass(
      { publicerad: false } as Partial<Bemanning>,
      { åtgärd: 'avpublicerade_ledigt' }
    );
  }

  async function skickaFörfrågan() {
    if (!valdVikarieId) {
      setFel('Välj en vikarie först.');
      return;
    }

    setSparar(true);
    setFel('');

    const res = await passApi.uppdatera(pass.id, {
      status: 'notifierat',
      publicerad: false,
      vikarie_id: null,
      riktad_till_vikarie_id: valdVikarieId,
    } as any);

    if (res.error) {
      setSparar(false);
      setFel(res.error.message);
      return;
    }

    await notisApi.skickaNotiser(pass.id, [valdVikarieId]);
    await historikApi.skapa(pass.id, 'vikarie_notifierat', { vikarie_id: valdVikarieId });

    setSparar(false);
    onUppdaterad({
      ...pass,
      status: 'notifierat',
      publicerad: false,
      vikarie_id: null,
      riktad_till_vikarie_id: valdVikarieId,
    });
  }

  async function bokaDirekt() {
    if (!valdVikarieId) {
      setFel('Välj en vikarie först.');
      return;
    }

    const ok = await uppdateraPass(
      {
        status: 'bokat',
        publicerad: false,
        vikarie_id: valdVikarieId,
        riktad_till_vikarie_id: null,
      } as Partial<Bemanning>,
      { åtgärd: 'bokade_direkt', vikarie_id: valdVikarieId }
    );

    if (ok) await historikApi.skapa(pass.id, 'vikarie_bokat', { vikarie_id: valdVikarieId });
  }

  async function avbokaPass() {
    await uppdateraPass(
      {
        status: 'avbokat',
        publicerad: false,
        riktad_till_vikarie_id: null,
      } as Partial<Bemanning>,
      { åtgärd: 'avbokade_pass' }
    );
  }

  async function skickaMeddelande() {
    if (!nyttMeddelande.trim()) return;
    setSkickarMeddelande(true);
    setFel('');

    const res = await passmeddelandeApi.skapa(pass.id, nyttMeddelande.trim(), 'admin');

    if (res.error) {
      setFel(res.error.message);
    } else {
      await historikApi.skapa(pass.id, 'pass_uppdaterat', { åtgärd: 'admin_meddelande' }, nyttMeddelande.trim());
      const ny = await passmeddelandeApi.lista(pass.id);
      setMeddelanden((ny.data ?? []) as Passmeddelande[]);
      setNyttMeddelande('');
    }

    setSkickarMeddelande(false);
  }

  const tillsattVikarie = vikarier.find(v => v.id === pass.vikarie_id);
  const riktadVikarie = vikarier.find(v => v.id === pass.riktad_till_vikarie_id);
  const valdVikarie = vikarier.find(v => v.id === valdVikarieId);

  return (
    <div className="flex max-h-[88vh] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Pass</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {pass.datum} · {pass.tid_från.slice(0, 5)}-{pass.tid_till.slice(0, 5)}
          </p>
        </div>
        <button onClick={onStäng} style={{ color: 'var(--text-muted)' }}>✕</button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        {fel && <Alert typ="error">{fel}</Alert>}

        <section className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{pass.personal?.namn ?? 'Okänd personal'}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {pass.grupp ? `Grupp: ${pass.grupp}` : 'Ingen grupp angiven'}
              </p>
            </div>
            <StatusBadge status={pass.status} />
          </div>

          <div className="grid gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <p>Synligt för vikarier: <span style={{ color: 'var(--text)' }}>{pass.publicerad ? 'Ja, som ledigt pass' : 'Nej'}</span></p>
            {riktadVikarie && <p>Förfrågan skickad till: <span style={{ color: 'var(--text)' }}>{riktadVikarie.namn}</span></p>}
            {tillsattVikarie && <p>Bokad vikarie: <span style={{ color: 'var(--text)' }}>{tillsattVikarie.namn}</span></p>}
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Tid</p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              type="time"
              value={tidFrån}
              onChange={e => setTidFrån(e.target.value)}
              className="rounded-md border px-2 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <input
              type="time"
              value={tidTill}
              onChange={e => setTidTill(e.target.value)}
              className="rounded-md border px-2 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <Button size="sm" onClick={sparaTider} loading={sparar} disabled={tidFrån === pass.tid_från.slice(0, 5) && tidTill === pass.tid_till.slice(0, 5)}>
              Spara
            </Button>
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Bemanning</p>
          <select
            value={valdVikarieId}
            onChange={e => setValdVikarieId(e.target.value)}
            className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
            style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
          >
            <option value="">Välj vikarie</option>
            {vikarier.map(v => <option key={v.id} value={v.id}>{v.namn}</option>)}
          </select>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="sm" onClick={skickaFörfrågan} loading={sparar} disabled={!valdVikarieId}>
              Skicka förfrågan
            </Button>
            <Button size="sm" variant="secondary" onClick={bokaDirekt} loading={sparar} disabled={!valdVikarieId}>
              Boka direkt
            </Button>
          </div>

          {valdVikarie && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Vald vikarie: <span style={{ color: 'var(--text)' }}>{valdVikarie.namn}</span>
            </p>
          )}
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Publicering</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="sm" variant="secondary" onClick={publiceraLedigt} loading={sparar}>
              Publicera som ledigt
            </Button>
            <Button size="sm" variant="secondary" onClick={avpublicera} loading={sparar} disabled={!pass.publicerad}>
              Avpublicera
            </Button>
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Meddelanden</p>
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
              {meddelanden.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Inga meddelanden ännu.</p>
              ) : meddelanden.map(m => (
                <div key={m.id} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <div className="mb-1 flex justify-between gap-2" style={{ color: 'var(--text-muted)' }}>
                    <span>{m.avsandare_roll === 'admin' ? 'Admin' : 'Vikarie'}</span>
                    <span>{new Date(m.created_at).toLocaleString('sv-SE')}</span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text)' }}>{m.meddelande}</p>
                </div>
              ))}
            </div>
            <textarea
              value={nyttMeddelande}
              onChange={e => setNyttMeddelande(e.target.value)}
              rows={3}
              placeholder={pass.vikarie_id ? 'Skriv meddelande till vikarien...' : 'Meddelanden kan skickas när passet är bokat.'}
              disabled={!pass.vikarie_id}
              className="mb-2 w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <Button size="sm" onClick={skickaMeddelande} loading={skickarMeddelande} disabled={!pass.vikarie_id || !nyttMeddelande.trim()}>
              Skicka meddelande
            </Button>
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Övrigt</p>
          <Button size="sm" variant="danger" onClick={avbokaPass} loading={sparar} disabled={pass.status === 'avbokat'}>
            Avboka pass
          </Button>
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Historik</p>
          {laddar ? <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Laddar...</p>
            : historik.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Ingen historik.</p>
            : historik.map(h => (
              <div key={h.id} className="mb-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--text-subtle)' }}>{new Date(h.created_at).toLocaleString('sv-SE')}</span>
                {' '}{h.händelse.replace(/_/g, ' ')}
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}
function NyttPassModal({ öppen, onStäng, personal, onSkapad }: {
  öppen: boolean; onStäng: () => void; personal: Personal[]; onSkapad: () => void;
}) {
  const [form, setForm] = useState({
    personal_id: '', datum: new Date().toISOString().slice(0, 10),
    tid_från: '08:00', tid_till: '17:00', grupp: '', anteckning: '', publicerad: false,
  });
  const [laddar, setLaddar] = useState(false);
  const [hämtarSchema, setHämtarSchema] = useState(false);
  const [schemaInfo, setSchemaInfo] = useState('');
  const [fel, setFel] = useState('');

  async function hämtaSchemaTid(personalId: string, datum: string) {
    if (!personalId || !datum) {
      setSchemaInfo('');
      return;
    }

    setHämtarSchema(true);
    setSchemaInfo('');

    const res = await frånvaroApi.hämtaSchemaraderFörFrånvaro(personalId, datum, datum);
    const rader = ((res.data ?? []) as Schemarad[])
      .filter(r => r.datum === datum && r.tid_från && r.tid_till)
      .sort((a, b) => minuter(a.tid_från) - minuter(b.tid_från));

    setHämtarSchema(false);

    if (rader.length === 0) {
      setSchemaInfo('Inget schema hittades för vald person och dag. Tiderna kan anges manuellt.');
      return;
    }

    const första = rader[0];
    const sista = rader.reduce((senast, rad) =>
      minuter(rad.tid_till) > minuter(senast.tid_till) ? rad : senast
    , rader[0]);

    setForm(prev => ({
      ...prev,
      tid_från: första.tid_från!.slice(0, 5),
      tid_till: sista.tid_till!.slice(0, 5),
      grupp: [...new Set(rader.map(r => r.grupp).filter(Boolean))].slice(0, 3).join(', ') || prev.grupp,
    }));

    setSchemaInfo(`Tider hämtade från schema: ${första.tid_från!.slice(0, 5)}-${sista.tid_till!.slice(0, 5)} (${rader.length} lektioner).`);
  }

  async function spara() {
    if (!form.personal_id) { setFel('Välj personal.'); return; }
    setLaddar(true);
    const res = await passApi.skapa({
      personal_id: form.personal_id, frånvaro_id: null, schemarad_id: null, vikarie_id: null,
      datum: form.datum, tid_från: form.tid_från, tid_till: form.tid_till, typ: 'del_av_dag',
      ämne: null, grupp: form.grupp || null, sal: null,
      anteckning: form.anteckning || null, riktad_till_vikarie_id: null, publicerad: form.publicerad, status: 'obokat', skapad_av: null,
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
        <Select
          label="Personal *"
          value={form.personal_id}
          onChange={e => {
            const personal_id = e.target.value;
            setForm({ ...form, personal_id });
            hämtaSchemaTid(personal_id, form.datum);
          }}
        >
          <option value="">– Välj personal –</option>
          {personal.map(p => <option key={p.id} value={p.id}>{p.namn}</option>)}
        </Select>
        <Input
          label="Datum *"
          type="date"
          value={form.datum}
          onChange={e => {
            const datum = e.target.value;
            setForm({ ...form, datum });
            hämtaSchemaTid(form.personal_id, datum);
          }}
        />
        {(hämtarSchema || schemaInfo) && (
          <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            {hämtarSchema ? 'Hämtar tider från schema...' : schemaInfo}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Från kl *" type="time" value={form.tid_från} onChange={e => setForm({ ...form, tid_från: e.target.value })} />
          <Input label="Till kl *" type="time" value={form.tid_till} onChange={e => setForm({ ...form, tid_till: e.target.value })} />
        </div>
        <Input label="Grupp" value={form.grupp} onChange={e => setForm({ ...form, grupp: e.target.value })} />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Kommentar</label>
          <textarea
            value={form.anteckning}
            onChange={e => setForm({ ...form, anteckning: e.target.value })}
            rows={3}
            className="rounded-md border px-3 py-2 text-sm"
            style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
          />
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
          <input
            type="checkbox"
            checked={form.publicerad}
            onChange={e => setForm({ ...form, publicerad: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300"
          />
          Publicera direkt för vikarier
        </label>
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
  const [senastMarkeradIndex, setSenastMarkeradIndex] = useState<number | null>(null);

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
  const allaSynligaIds = grupper.flatMap(grupp => grupp.pass.map(p => p.id));
  const allaSynligaMarkerade = allaSynligaIds.length > 0 && allaSynligaIds.every(id => valda.has(id));

  function sättGruppMarkerad(grupp: Passgrupp, markerad: boolean, index: number, shiftKey = false) {
    const ny = new Set(valda);

    if (shiftKey && senastMarkeradIndex !== null) {
      const start = Math.min(senastMarkeradIndex, index);
      const slut = Math.max(senastMarkeradIndex, index);
      grupper.slice(start, slut + 1).forEach(g => {
        g.pass.forEach(p => markerad ? ny.add(p.id) : ny.delete(p.id));
      });
    } else {
      grupp.pass.forEach(p => markerad ? ny.add(p.id) : ny.delete(p.id));
    }

    setValda(ny);
    setSenastMarkeradIndex(index);
  }

  function växlaAllaSynliga() {
    if (allaSynligaMarkerade) {
      setValda(new Set());
    } else {
      setValda(new Set(allaSynligaIds));
    }
  }


  return (
    <div className="flex h-full">
      <div className={`flex flex-col flex-1 p-3 sm:p-6 overflow-y-auto ${valtPass ? 'hidden lg:flex' : ''}`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Bemanning</h1>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {grupper.length > 0 && (
              <Button variant="secondary" size="sm" onClick={växlaAllaSynliga}>
                {allaSynligaMarkerade ? 'Avmarkera alla' : 'Markera alla'}
              </Button>
            )}
            {valda.size > 0 && (
              <Button variant="danger" size="sm" onClick={() => setRaderaValda(true)}>
                Ta bort ({valda.size})
              </Button>
            )}
            <Button onClick={() => setSkapaModal(true)}>+ Skapa pass</Button>
          </div>
        </div>

        <div className="mb-4 grid gap-2 sm:flex sm:flex-wrap">
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
            {grupper.map((grupp, index) => {
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
                  className="rounded-xl border p-3 shadow-sm sm:p-4"
                  style={{
                    background: alleMarkerade ? 'color-mix(in srgb, var(--blue) 8%, var(--bg-card))' : 'var(--bg-card)',
                    borderColor: alleMarkerade ? 'var(--blue)' : 'var(--border)',
                  }}>
                  <div className="flex items-start gap-2 sm:gap-3">
                    <button
                      type="button"
                      aria-pressed={alleMarkerade}
                      aria-label={alleMarkerade ? 'Avmarkera pass' : 'Markera pass'}
                      onClick={(e) => {
                        e.stopPropagation();
                        sättGruppMarkerad(grupp, !alleMarkerade, index, e.shiftKey);
                      }}
                      className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition"
                      style={{
                        background: alleMarkerade ? 'var(--blue)' : 'var(--input-bg)',
                        borderColor: alleMarkerade ? 'var(--blue)' : 'var(--border)',
                        color: alleMarkerade ? '#fff' : 'var(--text-subtle)',
                        boxShadow: alleMarkerade ? '0 0 0 3px color-mix(in srgb, var(--blue) 18%, transparent)' : 'none',
                      }}
                    >
                      {alleMarkerade ? (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M5 10.5 8.2 13.5 15 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
                      )}
                    </button>
                    <div className="min-w-0 flex-1" onClick={() => setValtPass(grupp.pass[0])} style={{ cursor: 'pointer' }}>
                      <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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

                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        {vikariNamn ? (
                          <span className="font-medium text-green-600">✓ {vikariNamn}</span>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)' }}>Ingen vikarie tillsatt</span>
                        )}
                        <span style={{ color: grupp.pass.some(p => p.publicerad) ? 'var(--blue)' : 'var(--text-subtle)' }}>
                          {grupp.pass.some(p => p.publicerad) ? 'Publicerad' : 'Ej publicerad'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {valtPass && (
        <Modal öppen={!!valtPass} onStäng={() => setValtPass(null)} bredd="xl">
          <PassDetaljer
            pass={valtPass}
            vikarier={vikarier}
            onStäng={() => setValtPass(null)}
            onUppdaterad={uppdaterad => {
              setPass(prev => prev.map(p => p.id === uppdaterad.id ? { ...p, ...uppdaterad } : p));
              setValtPass(uppdaterad);
            }}
          />
        </Modal>
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
