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

function tomTillNull(value?: string | null) {
  return value && value.trim() ? value : null;
}

function veckodagarFörVecka(start: string) {
  const bas = new Date(`${start}T12:00:00`);
  const dag = bas.getDay() || 7;
  bas.setDate(bas.getDate() - dag + 1);

  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(bas);
    d.setDate(bas.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function veckodagFörDatum(datum: string) {
  return new Date(`${datum}T12:00:00`).getDay();
}

function hittaTillgänglighetFörDatum(poster: VikarieTillgänglighet[], datum: string) {
  const specifik = poster.find(t => t.datum === datum);
  if (specifik) return specifik;

  const veckodag = veckodagFörDatum(datum);
  return poster.find(t => t.veckopass && t.veckodag === veckodag) ?? null;
}

function ärAvbokningsförfrågan(meddelande?: string | null) {
  const text = (meddelande ?? '').toLowerCase();
  return text.includes('avboka') || text.includes('avbokning');
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
    const nyckel = `${p.personal_id ?? p.id}_${p.datum}`;
    if (!grupper.has(nyckel)) {
      grupper.set(nyckel, {
        personal_id: p.personal_id ?? p.id,
        personalNamn: p.personal?.namn ?? 'Fristående pass',
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
  const [bokadeVikarier, setBokadeVikarier] = useState<Record<string, Bemanning>>({});
  const [tillgMap, setTillgMap] = useState<Record<string, VikarieTillgänglighet | null>>({});
  const [nyttMeddelande, setNyttMeddelande] = useState('');
  const [skickarMeddelande, setSkickarMeddelande] = useState(false);
  const [visaHistorik, setVisaHistorik] = useState(false);

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
  useEffect(() => {
    async function laddaBokade() {
      const res = await passApi.lista({ datumFrån: pass.datum, datumTill: pass.datum, status: ["bokat", "bekräftat"] });
      const bokade: Record<string, Bemanning> = {};

      ((res.data ?? []) as Bemanning[]).forEach(p => {
        if (!p.vikarie_id || p.id === pass.id) return;

        const överlappar = pass.tid_från < p.tid_till && pass.tid_till > p.tid_från;
        if (överlappar) bokade[p.vikarie_id] = p;
      });

      setBokadeVikarier(bokade);
    }

    laddaBokade();
  }, [pass.datum, pass.id, pass.tid_från, pass.tid_till]);

  async function uppdateraPass(data: Partial<Bemanning>, historik: Record<string, unknown>) {
    setSparar(true);
    setFel('');

    const res = await passApi.uppdatera(pass.id, data as any);
    setSparar(false);

    if (res.error) {
      setFel(res.error.message.includes('dubbelbokad') || res.error.message.includes('redan bokad') ? 'Vikarien är redan bokad på ett pass som överlappar denna tid.' : res.error.message);
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
      setFel(res.error.message.includes('dubbelbokad') || res.error.message.includes('redan bokad') ? 'Vikarien är redan bokad på ett pass som överlappar denna tid.' : res.error.message);
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
        vikarie_id: null,
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
      setFel(res.error.message.includes('dubbelbokad') || res.error.message.includes('redan bokad') ? 'Vikarien är redan bokad på ett pass som överlappar denna tid.' : res.error.message);
    } else {
      await historikApi.skapa(pass.id, 'pass_uppdaterat', { åtgärd: 'admin_meddelande' }, nyttMeddelande.trim());
      const ny = await passmeddelandeApi.lista(pass.id);
      setMeddelanden((ny.data ?? []) as Passmeddelande[]);
      setNyttMeddelande('');
    }

    setSkickarMeddelande(false);
  }

  async function raderaMeddelande(id: string) {
    if (!window.confirm('Ta bort meddelandet?')) return;

    const res = await passmeddelandeApi.radera(id);
    if (res.error) {
      setFel(res.error.message);
      return;
    }

    setMeddelanden(prev => prev.filter(m => m.id !== id));
    await historikApi.skapa(pass.id, 'pass_uppdaterat', { åtgärd: 'raderade_meddelande', meddelande_id: id });
  }


  useEffect(() => {
    let aktiv = true;

    Promise.all(
      vikarier.map(async (v) => {
        const res = await vikariApi.hämtaTillgänglighet(v.id);
        const rad = hittaTillgänglighetFörDatum((res.data ?? []) as VikarieTillgänglighet[], pass.datum);
        return [v.id, rad] as const;
      })
    ).then((poster) => {
      if (!aktiv) return;
      setTillgMap(Object.fromEntries(poster));
    });

    return () => { aktiv = false; };
  }, [vikarier, pass.datum]);

  function vikarieValLabel(v: Vikarie) {
    const tillg = tillgMap[v.id];
    const bokad = bokadeVikarier[v.id];

    if (bokad) return `⚠ ${v.namn} (bokad ${bokad.tid_från.slice(0, 5)}-${bokad.tid_till.slice(0, 5)})`;
    if (!tillg) return `${v.namn} (okänd tillgänglighet)`;

    const tid = tillg.tid_från && tillg.tid_till
      ? ` ${tillg.tid_från.slice(0, 5)}-${tillg.tid_till.slice(0, 5)}`
      : ' heldag';

    return tillg.tillgänglig
      ? `✓ ${v.namn} (${tid})`
      : `✕ ${v.namn} (inte tillgänglig)`;
  }

  const tillsattVikarie = vikarier.find(v => v.id === pass.vikarie_id);
  const riktadVikarie = vikarier.find(v => v.id === pass.riktad_till_vikarie_id);
  const valdVikarie = vikarier.find(v => v.id === valdVikarieId);
  const rekommenderadeVikarier = [...vikarier]
    .map(v => {
      const tillg = tillgMap[v.id];
      const bokad = bokadeVikarier[v.id];
      let status = "okänd";
      let detalj = "Okänd tillgänglighet";

      if (bokad) {
        status = "bokad";
        detalj = `Bokad ${bokad.tid_från.slice(0, 5)}-${bokad.tid_till.slice(0, 5)}`;
      } else if (tillg?.tillgänglig) {
        status = "ledig";
        detalj = tillg.tid_från && tillg.tid_till
          ? `Tillgänglig ${tillg.tid_från.slice(0, 5)}-${tillg.tid_till.slice(0, 5)}`
          : "Tillgänglig heldag";
      } else if (tillg) {
        status = "otillgänglig";
        detalj = tillg.tid_från && tillg.tid_till
          ? `Inte tillgänglig ${tillg.tid_från.slice(0, 5)}-${tillg.tid_till.slice(0, 5)}`
          : "Inte tillgänglig";
      }

      return { vikarie: v, status, detalj };
    })
    .sort((a, b) => {
      const prioritet: Record<string, number> = { ledig: 0, okänd: 1, otillgänglig: 2, bokad: 3 };
      return (prioritet[a.status] ?? 9) - (prioritet[b.status] ?? 9) || a.vikarie.namn.localeCompare(b.vikarie.namn);
    });
  const rekommenderadeSynliga = rekommenderadeVikarier.slice(0, 5);
  const harAktivBokning = !!pass.vikarie_id && (pass.status === 'bokat' || pass.status === 'bekräftat');
  const harAvbokningsförfrågan = harAktivBokning && meddelanden.some(m => m.avsandare_roll === 'vikarie' && ärAvbokningsförfrågan(m.meddelande));

  return (
    <div className="flex max-h-[88vh] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{pass.personal?.namn ?? 'Fristående pass'}</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {pass.datum} · {pass.tid_från.slice(0, 5)}-{pass.tid_till.slice(0, 5)}
          </p>
        </div>
        <button onClick={onStäng} className="rounded-full px-2 py-1 text-lg leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        {fel && <Alert typ="error">{fel}</Alert>}

        {harAvbokningsförfrågan && (
          <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#f97316', background: 'rgba(249, 115, 22, 0.12)', color: '#fb923c' }}>
            Vikarien har skickat en avbokningsförfrågan. Läs meddelandet nedan innan du ändrar passet.
          </div>
        )}

        <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Översikt</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {pass.grupp ? `Grupp: ${pass.grupp}` : 'Ingen grupp angiven'}
              </p>
              {pass.anteckning && (
                <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{pass.anteckning}</p>
              )}
            </div>
            <StatusBadge status={pass.status} />
          </div>

          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
              Synlighet<br />
              <span className="font-semibold" style={{ color: pass.publicerad ? 'var(--blue)' : 'var(--text)' }}>
                {pass.publicerad ? 'Publicerad som ledig' : 'Inte publicerad'}
              </span>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
              Vikarie<br />
              <span className="font-semibold" style={{ color: tillsattVikarie ? '#22c55e' : 'var(--text)' }}>
                {tillsattVikarie?.namn ?? riktadVikarie?.namn ?? 'Ingen vald'}
              </span>
            </div>
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

        <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Bemanning</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {valdVikarie ? valdVikarie.namn : 'Välj vikarie'}
              </p>
            </div>
          </div>

          {rekommenderadeSynliga.length > 0 && (
            <div className="mb-3">
              <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Rekommenderade vikarier</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {rekommenderadeSynliga.map(({ vikarie, status, detalj }) => {
                  const vald = vikarie.id === valdVikarieId;
                  const ärBokad = status === 'bokad';
                  const färg = status === 'ledig' ? '#16a34a' : status === 'bokad' ? '#ef4444' : status === 'otillgänglig' ? '#f59e0b' : 'var(--text-muted)';

                  return (
                    <button
                      key={vikarie.id}
                      type="button"
                      onClick={() => setValdVikarieId(vikarie.id)}
                      disabled={ärBokad}
                      className="rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55"
                      style={{
                        borderColor: vald ? 'var(--blue)' : 'var(--border)',
                        background: vald ? 'color-mix(in srgb, var(--blue) 10%, var(--bg-card))' : 'var(--bg-card)',
                      }}
                    >
                      <span className="block text-sm font-semibold" style={{ color: 'var(--text)' }}>{vikarie.namn}</span>
                      <span className="block text-xs" style={{ color: färg }}>{detalj}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <select
            value={valdVikarieId}
            onChange={e => setValdVikarieId(e.target.value)}
            className="mb-3 w-full rounded-md border px-3 py-2 text-sm"
            style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
          >
            <option value="">Välj annan vikarie</option>
            {vikarier.map(v => <option key={v.id} value={v.id}>{vikarieValLabel(v)}</option>)}
          </select>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="sm" onClick={skickaFörfrågan} loading={sparar} disabled={!valdVikarieId || !!bokadeVikarier[valdVikarieId]}>
              Skicka förfrågan
            </Button>
            <Button size="sm" variant="secondary" onClick={bokaDirekt} loading={sparar} disabled={!valdVikarieId || !!bokadeVikarier[valdVikarieId]}>
              Boka direkt
            </Button>
          </div>

          {valdVikarieId && bokadeVikarier[valdVikarieId] && (
            <p className="mt-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: '#ef4444', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.10)' }}>
              Den valda vikarien är redan bokad {bokadeVikarier[valdVikarieId].tid_från.slice(0, 5)}-{bokadeVikarier[valdVikarieId].tid_till.slice(0, 5)}.
            </p>
          )}
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Synlighet</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="sm" variant="secondary" onClick={publiceraLedigt} loading={sparar}>
              Gör ledigt
            </Button>
            <Button size="sm" variant="secondary" onClick={avpublicera} loading={sparar} disabled={!pass.publicerad}>
              Dölj
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
                  <div className="mb-1 flex items-center justify-between gap-2" style={{ color: 'var(--text-muted)' }}>
                    <span>{m.avsandare_roll === 'admin' ? 'Admin' : 'Vikarie'}</span>
                    <div className="flex items-center gap-2">
                      <span>{new Date(m.created_at).toLocaleString('sv-SE')}</span>
                      <button
                        type="button"
                        onClick={() => raderaMeddelande(m.id)}
                        className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.10)' }}
                      >
                        Ta bort
                      </button>
                    </div>
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
          <button
            type="button"
            onClick={() => setVisaHistorik(!visaHistorik)}
            className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg)' }}
          >
            <span>Historik ({historik.length})</span>
            <span>{visaHistorik ? 'Dölj' : 'Visa'}</span>
          </button>
          {visaHistorik && (
            <div className="mt-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              {laddar ? <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Laddar...</p>
                : historik.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Ingen historik.</p>
                : historik.map(h => (
                  <div key={h.id} className="mb-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--text-subtle)' }}>{new Date(h.created_at).toLocaleString('sv-SE')}</span>
                    {' '}{h.händelse.replace(/_/g, ' ')}
                  </div>
                ))}
            </div>
          )}
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
    veckopass: false,
  });
  const [laddar, setLaddar] = useState(false);
  const [hämtarSchema, setHämtarSchema] = useState(false);
  const [schemaInfo, setSchemaInfo] = useState('');
  const [veckopassTider, setVeckopassTider] = useState<Record<string, { aktiv: boolean; tid_från: string; tid_till: string }>>({});
  const [fel, setFel] = useState('');

  const veckopassDatum = form.veckopass && form.datum ? veckodagarFörVecka(form.datum) : [];

  function tidFörDatum(datum: string) {
    return veckopassTider[datum] ?? { aktiv: true, tid_från: form.tid_från, tid_till: form.tid_till };
  }

  function uppdateraVeckopassTid(datum: string, data: Partial<{ aktiv: boolean; tid_från: string; tid_till: string }>) {
    setVeckopassTider(prev => ({
      ...prev,
      [datum]: {
        aktiv: prev[datum]?.aktiv ?? true,
        tid_från: prev[datum]?.tid_från ?? form.tid_från,
        tid_till: prev[datum]?.tid_till ?? form.tid_till,
        ...data,
      },
    }));
  }

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
    setLaddar(true);
    const res = await passApi.skapa({
      personal_id: form.personal_id, frånvaro_id: null, schemarad_id: null, vikarie_id: null,
      datum: form.datum, tid_från: form.tid_från, tid_till: form.tid_till, typ: 'del_av_dag',
      ämne: null, grupp: form.grupp || null, sal: null,
      anteckning: form.anteckning || null, riktad_till_vikarie_id: null, publicerad: form.publicerad, status: 'obokat', skapad_av: null,
    }
);
    setLaddar(false);
    if (res.error) { setFel(res.error.message.includes('dubbelbokad') || res.error.message.includes('redan bokad') ? 'Vikarien är redan bokad på ett pass som överlappar denna tid.' : res.error.message); return; }
    if (res.data) await historikApi.skapa(res.data.id, 'pass_skapat');
    onSkapad();
    onStäng();
  }


  useEffect(() => {
    if (!öppen || laddar) return;

    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        spara();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [öppen, laddar, form]);

  return (
    <Modal öppen={öppen} onStäng={onStäng} titel="Skapa vikariepass" bredd="lg">
      <div className="space-y-4">
        {fel && <Alert typ="error">{fel}</Alert>}

        <Select
          label="Personal, valfritt"
          value={form.personal_id}
          onChange={e => {
            const personal_id = e.target.value;
            setForm({ ...form, personal_id });
            hämtaSchemaTid(personal_id, form.datum);
          }}
        >
          <option value="">Fristående pass</option>
          {personal.map(p => <option key={p.id} value={p.id}>{p.namn}</option>)}
        </Select>
        <Input
          label={form.veckopass ? "Vecka som ska skapas *" : "Datum *"}
          type="date"
          value={form.datum}
          onChange={e => {
            const datum = e.target.value;
            setForm({ ...form, datum });
            setVeckopassTider({});
            hämtaSchemaTid(form.personal_id, datum);
          }}
        />
        <label className="flex items-start gap-2 rounded-xl border p-3 text-sm" style={{ color: 'var(--text)', borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <input
            type="checkbox"
            checked={form.veckopass}
            onChange={e => {
              setForm({ ...form, veckopass: e.target.checked });
              setVeckopassTider({});
            }}
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <span>
            Skapa veckopass
            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
              Skapar ett pass per vald vardag i veckan. Tider kan justeras per dag.
            </span>
          </span>
        </label>

        {form.veckopass && veckopassDatum.length > 0 && (
          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Veckans pass
              </p>
              <button
                type="button"
                onClick={() => setVeckopassTider({})}
                className="text-xs font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                Återställ
              </button>
            </div>

            <div className="space-y-2">
              {veckopassDatum.map(datum => {
                const dagensTid = tidFörDatum(datum);

                return (
                  <div key={datum} className="grid grid-cols-[24px_1fr_92px_92px] items-end gap-2 rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
                    <input
                      type="checkbox"
                      checked={dagensTid.aktiv}
                      onChange={e => uppdateraVeckopassTid(datum, { aktiv: e.target.checked })}
                      className="mb-2 h-4 w-4 rounded"
                    />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                        {new Date(`${datum}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{datum}</p>
                    </div>
                    <label>
                      <span className="mb-1 block text-[11px]" style={{ color: 'var(--text-muted)' }}>Från</span>
                      <input
                        type="time"
                        value={dagensTid.tid_från}
                        disabled={!dagensTid.aktiv}
                        onChange={e => uppdateraVeckopassTid(datum, { tid_från: e.target.value })}
                        className="w-full rounded-md border px-2 py-1.5 text-sm disabled:opacity-40"
                        style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-[11px]" style={{ color: 'var(--text-muted)' }}>Till</span>
                      <input
                        type="time"
                        value={dagensTid.tid_till}
                        disabled={!dagensTid.aktiv}
                        onChange={e => uppdateraVeckopassTid(datum, { tid_till: e.target.value })}
                        className="w-full rounded-md border px-2 py-1.5 text-sm disabled:opacity-40"
                        style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(hämtarSchema || schemaInfo) && (
          <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            {hämtarSchema ? 'Hämtar tider från schema...' : schemaInfo}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label={form.veckopass ? "Standard från kl *" : "Från kl *"} type="time" value={form.tid_från} onChange={e => setForm({ ...form, tid_från: e.target.value })} />
          <Input label={form.veckopass ? "Standard till kl *" : "Till kl *"} type="time" value={form.tid_till} onChange={e => setForm({ ...form, tid_till: e.target.value })} />
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
          <Button loading={laddar} onClick={spara}>
            {form.veckopass ? 'Skapa veckopass' : 'Skapa pass'}
          </Button>
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
  const [snabbFilter, setSnabbFilter] = useState<'alla' | 'atgard' | 'lediga' | 'bokade' | 'ej_publicerade'>('alla');
  const [datumFrån, setDatumFrån] = useState('');
  const [datumTill, setDatumTill] = useState('');
  const [valda, setValda] = useState<Set<string>>(new Set());
  const [avbokningsPassIds, setAvbokningsPassIds] = useState<Set<string>>(new Set());
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
    const passLista = (pRes.data ?? []) as Bemanning[];
    setPass(passLista);
    setVikarier((vRes.data ?? []) as Vikarie[]);
    setPersonal((perRes.data ?? []) as Personal[]);

    const avbokningsIds = new Set<string>();
    await Promise.all(passLista.map(async (passrad) => {
      const res = await passmeddelandeApi.lista(passrad.id);
      const meddelanden = (res.data ?? []) as Passmeddelande[];
      const harAktivBokning = !!passrad.vikarie_id && (passrad.status === 'bokat' || passrad.status === 'bekräftat');
      if (harAktivBokning && meddelanden.some(m => m.avsandare_roll === 'vikarie' && ärAvbokningsförfrågan(m.meddelande))) {
        avbokningsIds.add(passrad.id);
      }
    }));
    setAvbokningsPassIds(avbokningsIds);

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
  const filtreradeGrupper = grupper.filter(grupp => {
    if (snabbFilter === 'alla') return true;

    const harBokad = grupp.pass.some(p => !!p.vikarie_id && (p.status === 'bokat' || p.status === 'bekräftat'));
    const harAvbokningsförfrågan = grupp.pass.some(p => avbokningsPassIds.has(p.id) && !!p.vikarie_id && (p.status === 'bokat' || p.status === 'bekräftat'));
    const harRiktadFörfrågan = grupp.pass.some(p => !!p.riktad_till_vikarie_id && p.status === 'notifierat');
    const publicerad = grupp.pass.some(p => p.publicerad);
    const avbokad = grupp.pass.every(p => p.status === 'avbokat');

    if (snabbFilter === 'atgard') return harAvbokningsförfrågan || harRiktadFörfrågan || (!harBokad && !publicerad && !avbokad);
    if (snabbFilter === 'lediga') return publicerad && !harBokad && !avbokad;
    if (snabbFilter === 'bokade') return harBokad;
    if (snabbFilter === 'ej_publicerade') return !publicerad && !harBokad && !harRiktadFörfrågan && !avbokad;

    return true;
  });
  const allaSynligaIds = filtreradeGrupper.flatMap(grupp => grupp.pass.map(p => p.id));
  const allaSynligaMarkerade = allaSynligaIds.length > 0 && allaSynligaIds.every(id => valda.has(id));

  function sättGruppMarkerad(grupp: Passgrupp, markerad: boolean, index: number, shiftKey = false) {
    const ny = new Set(valda);

    if (shiftKey && senastMarkeradIndex !== null) {
      const start = Math.min(senastMarkeradIndex, index);
      const slut = Math.max(senastMarkeradIndex, index);
      filtreradeGrupper.slice(start, slut + 1).forEach(g => {
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

        <div className="mb-3 grid gap-2 sm:flex sm:flex-wrap">
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as PassStatus | '')}>
            <option value="">Alla statusar</option>
            {ALLA_STATUSAR.map(s => <option key={s} value={s}>{PASS_STATUS_LABELS[s]}</option>)}
          </Select>
          <Input type="date" value={datumFrån} onChange={e => setDatumFrån(e.target.value)} />
          <Input type="date" value={datumTill} onChange={e => setDatumTill(e.target.value)} />
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {[
            { id: 'alla', label: 'Alla' },
            { id: 'atgard', label: 'Åtgärd krävs' },
            { id: 'lediga', label: 'Lediga' },
            { id: 'bokade', label: 'Bokade' },
            { id: 'ej_publicerade', label: 'Ej publicerade' },
          ].map(f => {
            const aktiv = snabbFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSnabbFilter(f.id as typeof snabbFilter)}
                className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                style={{
                  background: aktiv ? 'var(--blue)' : 'var(--bg-card)',
                  borderColor: aktiv ? 'var(--blue)' : 'var(--border)',
                  color: aktiv ? '#fff' : 'var(--text-muted)',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {filtreradeGrupper.length === 0 ? (
          <TomtTillstånd text="Inga vikariepass matchar filtret." />
        ) : (
          <div className="space-y-3">
            {filtreradeGrupper.map((grupp, index) => {
              const tidFrån = grupp.pass[0].tid_från.slice(0, 5);
              const tidTill = grupp.pass[grupp.pass.length - 1].tid_till.slice(0, 5);
              const ämnen = [...new Set(grupp.pass.map(p => p.ämne).filter(Boolean))];
              const vikarie = grupp.pass.find(p => p.vikarie_id && (p.status === 'bokat' || p.status === 'bekräftat'));
              const vikariNamn = vikarie ? vikarier.find(v => v.id === vikarie.vikarie_id)?.namn : null;
              const statusar = [...new Set(grupp.pass.map(p => p.status))];
              const dominerandStatus = statusar.length === 1 ? statusar[0] : 'obokat';
              const alleMarkerade = grupp.pass.every(p => valda.has(p.id));
              const publicerad = grupp.pass.some(p => p.publicerad);
              const harRiktadFörfrågan = grupp.pass.some(p => !!p.riktad_till_vikarie_id && p.status === 'notifierat');
              const harAvbokningsförfrågan = grupp.pass.some(p => avbokningsPassIds.has(p.id) && !!p.vikarie_id && (p.status === 'bokat' || p.status === 'bekräftat'));
              const ärAvbokat = dominerandStatus === 'avbokat';
              const statusPiller = [
                ärAvbokat ? { text: 'Avbokat', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' } : null,
                !ärAvbokat && harAvbokningsförfrågan ? { text: 'Avbokningsförfrågan', color: '#fb923c', bg: 'rgba(249, 115, 22, 0.14)' } : null,
                !ärAvbokat && vikariNamn ? { text: `Bokad: ${vikariNamn}`, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)' } : null,
                !ärAvbokat && !vikariNamn && harRiktadFörfrågan ? { text: 'Förfrågan skickad', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)' } : null,
                !ärAvbokat && !vikariNamn && publicerad ? { text: 'Publicerad som ledig', color: 'var(--blue)', bg: 'color-mix(in srgb, var(--blue) 14%, transparent)' } : null,
                !ärAvbokat && !vikariNamn && !publicerad && !harRiktadFörfrågan ? { text: 'Ej publicerad', color: 'var(--text-subtle)', bg: 'var(--hover)' } : null,
              ].filter(Boolean) as { text: string; color: string; bg: string }[];

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

                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                        {statusPiller.map(piller => (
                          <span
                            key={piller.text}
                            className="rounded-full px-2.5 py-1 font-semibold"
                            style={{ color: piller.color, background: piller.bg }}
                          >
                            {piller.text}
                          </span>
                        ))}
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
