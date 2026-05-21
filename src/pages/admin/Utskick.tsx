import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { frånvaroApi, passApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { Frånvaro, Vikariepass } from '../../types';
import { Button, LaddaSida } from '../../components/ui';

const länkar = [
  { label: 'Schemavisare', url: 'https://web.skola24.se/timetable/timetable-viewer/' },
  { label: 'Felanmälan', url: 'https://forms.office.com/' },
];

const kontakter = [
  'Administrationen',
  'Sjukanmälan',
];

function iso(datum: Date) {
  return datum.toISOString().slice(0, 10);
}

function startPåVecka(datum: Date) {
  const d = new Date(datum);
  const veckodag = d.getDay() || 7;
  d.setDate(d.getDate() - veckodag + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function läggTillDagar(datum: Date, dagar: number) {
  const d = new Date(datum);
  d.setDate(d.getDate() + dagar);
  return d;
}

function veckaNummer(datum: Date) {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const årStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - årStart.getTime()) / 86400000) + 1) / 7);
}

function kortDatum(datum: Date) {
  return datum.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

function långDatum(datum: Date) {
  return datum.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function tid(t?: string | null) {
  return t?.slice(0, 5) ?? '';
}

function esc(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function frånvaroFörDag(frånvaro: Frånvaro[], dag: string) {
  return frånvaro.filter((f) => f.datum_från <= dag && f.datum_till >= dag);
}

function passFörDag(pass: Vikariepass[], dag: string) {
  return pass.filter((p) => p.datum === dag && p.status !== 'avbokat');
}

function arbetslagSortIndex(value?: string | null) {
  const text = (value ?? '').toLowerCase().replace(/\s+/g, '');
  if (!text) return 99;
  if (text.includes('fsk') || text.includes('förskole') || text.includes('forskole')) return 0;

  const match = text.match(/(?:åk\.?|ak\.?)?([1-6])/) ?? text.match(/^([1-6])/);
  if (match) return Number(match[1]);

  if (text.includes('prest')) return 7;
  return 99;
}

function sorteraPass(a: Vikariepass, b: Vikariepass) {
  return (
    arbetslagSortIndex(a.grupp ?? a.personal?.arbetslag?.namn) -
      arbetslagSortIndex(b.grupp ?? b.personal?.arbetslag?.namn) ||
    (a.vikarie?.namn ?? a.personal?.namn ?? '').localeCompare(b.vikarie?.namn ?? b.personal?.namn ?? '', 'sv') ||
    tid(a.tid_från).localeCompare(tid(b.tid_från))
  );
}

type NamnFormatter = (namn?: string | null, fallback?: string) => string;

function skapaNamnFormatter(frånvaro: Frånvaro[], pass: Vikariepass[]): NamnFormatter {
  const namn = [
    ...frånvaro.map((f) => f.personal?.namn),
    ...pass.map((p) => p.vikarie?.namn),
    ...pass.map((p) => p.personal?.namn),
  ].filter(Boolean) as string[];

  const antalFörnamn = new Map<string, number>();
  for (const heltNamn of namn) {
    const förnamn = heltNamn.trim().split(/\s+/)[0]?.toLowerCase();
    if (förnamn) antalFörnamn.set(förnamn, (antalFörnamn.get(förnamn) ?? 0) + 1);
  }

  return (heltNamn, fallback = 'Okänd') => {
    if (!heltNamn) return fallback;
    const delar = heltNamn.trim().split(/\s+/);
    const förnamn = delar[0] ?? heltNamn;
    const behöverInitial = (antalFörnamn.get(förnamn.toLowerCase()) ?? 0) > 1;

    if (!behöverInitial || delar.length < 2) return förnamn;

    const efternamn = delar[delar.length - 1];
    return `${förnamn} ${efternamn[0]?.toUpperCase()}.`;
  };
}

function frånvaroText(f: Frånvaro, formatNamn: NamnFormatter) {
  const tidText = f.hel_dag ? '' : ` (${tid(f.tid_från)}-${tid(f.tid_till)})`;
  return `${formatNamn(f.personal?.namn)}${tidText}`;
}

function vikarieNamn(pass: Vikariepass, formatNamn: NamnFormatter) {
  if (pass.vikarie?.namn) return formatNamn(pass.vikarie.namn);
  if (pass.status === 'obokat') return 'Ej tillsatt';
  return 'Vikarie saknas';
}

function vikarieText(pass: Vikariepass, formatNamn: NamnFormatter) {
  const grupp = pass.grupp ? ` - ${pass.grupp}` : '';
  return `${vikarieNamn(pass, formatNamn)}${grupp}\n(${tid(pass.tid_från)}-${tid(pass.tid_till)})`;
}

function byggHtml({
  datumText,
  dagar,
  frånvaro,
  pass,
  övrigt,
}: {
  datumText: string;
  dagar: Date[];
  frånvaro: Frånvaro[];
  pass: Vikariepass[];
  övrigt: Record<string, string>;
}) {
  const formatNamn = skapaNamnFormatter(frånvaro, pass);
  const cell = 'border:1px solid #666;background-color:#333;color:#fff;padding:10px;text-align:center;vertical-align:middle;font-family:Arial,sans-serif;font-size:12px;line-height:1.35;';
  const head = 'border:1px solid #666;background-color:#3a3a3a;color:#fff;padding:8px;text-align:center;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;';
  const label = 'border:1px solid #666;background-color:#333;color:#fff;padding:10px;text-align:left;vertical-align:middle;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;';

  const tableRows = [
    `<tr><th style="${label};width:80px;">Vecka</th>${dagar.map((dag) => `<th style="${head};width:170px;">${esc(dag.toLocaleDateString('sv-SE', { weekday: 'long' }))}</th>`).join('')}</tr>`,
    `<tr><th style="${head}">${veckaNummer(dagar[0])}</th>${dagar.map((dag) => `<th style="${head}">${esc(kortDatum(dag))}</th>`).join('')}</tr>`,
    `<tr><th style="${label};height:110px;">Frånvaro</th>${dagar.map((dag) => {
      const rader = frånvaroFörDag(frånvaro, iso(dag));
      return `<td style="${cell};height:110px;">${rader.length ? rader.map((f) => esc(frånvaroText(f, formatNamn))).join('<br>') : '-'}</td>`;
    }).join('')}</tr>`,
    `<tr><th style="${label};height:210px;">Vikarie</th>${dagar.map((dag) => {
      const rader = passFörDag(pass, iso(dag)).sort(sorteraPass);
      return `<td style="${cell};height:210px;">${rader.length ? rader.map((p) => esc(vikarieText(p, formatNamn)).replaceAll('\\n', '<br>')).join('<br><br>') : '-'}</td>`;
    }).join('')}</tr>`,
    `<tr><th style="${label};height:150px;">Övrigt</th>${dagar.map((dag) => {
      const text = övrigt[iso(dag)]?.trim();
      return `<td style="${cell};height:150px;">${text ? esc(text).replaceAll('\\n', '<br>') : '-'}</td>`;
    }).join('')}</tr>`,
  ].join('');

  return `
<div style="font-family:Arial,sans-serif;font-size:13px;color:#111;background-color:#fff;">
  <p style="margin:0 0 10px 0;">God morgon,<br>här är frånvaron för ${esc(datumText)}</p>
  <p style="margin:0 0 16px 0;">Vi påminner om rutinen för frånvaroanmälan och återkoppling inför kommande tjänstgöring.</p>
  <table width="930" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;background-color:#333;color:#fff;">
    ${tableRows}
  </table>
  <p style="margin:18px 0 4px 0;"><strong>Länkar:</strong></p>
  <p style="margin:0;">${länkar.map((l) => `<a href="${esc(l.url)}" style="color:#0969da;text-decoration:underline;">${esc(l.label)}</a>`).join('<br>')}</p>
  <p style="margin:18px 0 4px 0;"><strong>Kontaktuppgifter:</strong></p>
  <p style="margin:0;">${kontakter.map(esc).join('<br>')}</p>
</div>`.trim();
}

export default function Utskick() {
  const [veckaStart, setVeckaStart] = useState(() => iso(startPåVecka(new Date())));
  const [frånvaro, setFrånvaro] = useState<Frånvaro[]>([]);
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [övrigt, setÖvrigt] = useState<Record<string, string>>({});
  const [laddar, setLaddar] = useState(true);
  const [sparar, setSparar] = useState(false);
  const [kopierat, setKopierat] = useState(false);
  const [fel, setFel] = useState('');

  const start = useMemo(() => startPåVecka(new Date(`${veckaStart}T12:00:00`)), [veckaStart]);
  const dagar = useMemo(() => [0, 1, 2, 3, 4].map((i) => läggTillDagar(start, i)), [start]);
  const startIso = iso(dagar[0]);
  const slutIso = iso(dagar[4]);
  const datumText = långDatum(new Date());
  const ämne = `Frånvarolista - ${datumText}`;
  const formatNamn = useMemo(() => skapaNamnFormatter(frånvaro, pass), [frånvaro, pass]);

  useEffect(() => {
    async function ladda() {
      setLaddar(true);
      setFel('');

      const [fRes, pRes, öRes] = await Promise.all([
        frånvaroApi.lista(startIso, slutIso),
        passApi.lista({ datumFrån: startIso, datumTill: slutIso }),
        supabase.from('utskick_ovrigt').select('*').gte('datum', startIso).lte('datum', slutIso),
      ]);

      setFrånvaro((fRes.data ?? []) as Frånvaro[]);
      setPass((pRes.data ?? []) as Vikariepass[]);

      if (öRes.error) {
        setFel('Övrigt-raden kan inte sparas förrän databasmigrationen är körd.');
        setÖvrigt({});
      } else {
        const map: Record<string, string> = {};
        for (const rad of öRes.data ?? []) map[rad.datum] = rad.text ?? '';
        setÖvrigt(map);
      }

      setLaddar(false);
    }

    ladda();
  }, [startIso, slutIso]);

  function uppdateraÖvrigt(datum: string, text: string) {
    setÖvrigt((prev) => ({ ...prev, [datum]: text }));
  }

  async function sparaÖvrigt() {
    setSparar(true);
    setFel('');

    const rader = dagar.map((dag) => ({
      datum: iso(dag),
      text: övrigt[iso(dag)] ?? '',
    }));

    const res = await supabase.from('utskick_ovrigt').upsert(rader, { onConflict: 'datum' });
    setSparar(false);

    if (res.error) {
      setFel(res.error.message);
      return;
    }
  }

  async function skickaMail() {
    const html = byggHtml({ datumText, dagar, frånvaro, pass, övrigt });
    const plain = [
      `God morgon,\n\nhär är frånvaron för ${datumText}.`,
      '',
      ...dagar.map((dag) => {
        const nyckel = iso(dag);
        const frånvaroRader = frånvaroFörDag(frånvaro, nyckel).map((f) => frånvaroText(f, formatNamn)).join(', ') || '-';
        const vikarieRader = passFörDag(pass, nyckel).sort(sorteraPass).map((p) => vikarieText(p, formatNamn)).join('; ') || '-';
        const övrigtText = övrigt[nyckel]?.trim() || '-';
        return `${dag.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'numeric' })}\nFrånvaro: ${frånvaroRader}\nVikarie: ${vikarieRader}\nÖvrigt: ${övrigtText}`;
      }),
    ].join('\n\n');

    const ClipboardItemCtor = (window as any).ClipboardItem;
    if (ClipboardItemCtor && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItemCtor({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(plain);
    }

    setKopierat(true);
    setTimeout(() => setKopierat(false), 2500);
    window.open(`mailto:?subject=${encodeURIComponent(ämne)}`, '_blank');
  }

  if (laddar) return <LaddaSida />;

  return (
    <div className="flex h-full flex-col overflow-hidden p-3 sm:p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
            Beta
          </p>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
            Utskick
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Excel-lik veckovy för frånvaro, bemanning och egen övrigt-text.
          </p>
        </div>

        <div className="grid gap-2 sm:flex sm:items-center">
          <input
            type="date"
            value={veckaStart}
            onChange={(e) => setVeckaStart(iso(startPåVecka(new Date(`${e.target.value}T12:00:00`))))}
            className="rounded-xl border px-3 py-2 text-sm"
            style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
          />
          <Button variant="secondary" onClick={() => setVeckaStart(iso(startPåVecka(läggTillDagar(start, -7))))}>Föregående</Button>
          <Button variant="secondary" onClick={() => setVeckaStart(iso(startPåVecka(new Date())))}>Idag</Button>
          <Button variant="secondary" onClick={() => setVeckaStart(iso(startPåVecka(läggTillDagar(start, 7))))}>Nästa</Button>
          <Button variant="secondary" onClick={sparaÖvrigt} loading={sparar}>Spara övrigt</Button>
          <Button onClick={skickaMail}>{kopierat ? 'Kopierat' : 'Skicka mail'}</Button>
        </div>
      </div>

      {fel && (
        <div className="mb-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#f97316', background: 'rgba(249,115,22,0.12)', color: '#fb923c' }}>
          {fel}
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <table className="min-w-[1180px] w-full border-collapse text-sm" style={{ color: 'var(--text)' }}>
          <thead>
            <tr>
              <th className="w-24 border px-3 py-3 text-left" style={{ borderColor: 'var(--border)' }}>Vecka</th>
              {dagar.map((dag) => (
                <th key={iso(dag)} className="border px-3 py-3 text-center" style={{ borderColor: 'var(--border)' }}>
                  {dag.toLocaleDateString('sv-SE', { weekday: 'long' })}
                </th>
              ))}
            </tr>
            <tr>
              <th className="border px-3 py-3 text-center text-lg" style={{ borderColor: 'var(--border)' }}>{veckaNummer(start)}</th>
              {dagar.map((dag) => (
                <th key={iso(dag)} className="border px-3 py-3 text-center text-base" style={{ borderColor: 'var(--border)' }}>
                  {kortDatum(dag)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr>
              <th className="border px-3 py-4 text-left align-middle" style={{ borderColor: 'var(--border)' }}>Frånvaro</th>
              {dagar.map((dag) => {
                const rader = frånvaroFörDag(frånvaro, iso(dag));
                return (
                  <td key={iso(dag)} className="h-36 border px-3 py-4 text-center align-middle" style={{ borderColor: 'var(--border)' }}>
                    {rader.length === 0 ? <span style={{ color: 'var(--text-subtle)' }}>-</span> : (
                      <div className="space-y-1">
                        {rader.map((f) => (
                          <Link key={f.id} to="/admin/franvaro" className="block hover:underline">
                            {frånvaroText(f, formatNamn)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>

            <tr>
              <th className="border px-3 py-4 text-left align-middle" style={{ borderColor: 'var(--border)' }}>Vikarie</th>
              {dagar.map((dag) => {
                const rader = passFörDag(pass, iso(dag)).sort(sorteraPass);
                return (
                  <td key={iso(dag)} className="h-64 border px-3 py-4 text-center align-middle" style={{ borderColor: 'var(--border)' }}>
                    {rader.length === 0 ? <span style={{ color: 'var(--text-subtle)' }}>-</span> : (
                      <div className="space-y-3">
                        {rader.map((p) => (
                          <Link key={p.id} to={`/admin/vikariepass?pass=${p.id}`} className="block rounded-lg px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5">
                            <div className="font-semibold">{vikarieNamn(p, formatNamn)}{p.grupp ? ` - ${p.grupp}` : ''}</div>
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>({tid(p.tid_från)}-{tid(p.tid_till)})</div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>

            <tr>
              <th className="border px-3 py-4 text-left align-middle" style={{ borderColor: 'var(--border)' }}>Övrigt</th>
              {dagar.map((dag) => {
                const nyckel = iso(dag);
                return (
                  <td key={nyckel} className="h-44 border p-2 align-top" style={{ borderColor: 'var(--border)' }}>
                    <textarea
                      value={övrigt[nyckel] ?? ''}
                      onChange={(e) => uppdateraÖvrigt(nyckel, e.target.value)}
                      placeholder="Skriv egen text..."
                      className="h-full min-h-36 w-full resize-none rounded-lg border px-3 py-2 text-sm"
                      style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                    />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
