import { useEffect, useMemo, useState } from 'react';
import { frånvaroApi, passApi } from '../../lib/api';
import type { Frånvaro, Vikariepass } from '../../types';
import { Button, LaddaSida } from '../../components/ui';

const länkar = [
  { label: 'Anmälan - kränkning', url: 'https://journal.prorenata.se/contactform/sundbybergs-s/anmalan_krankning/' },
  { label: 'Rutin vid kränkning', url: 'https://sundbybergsstad.sharepoint.com/:b:/r/sites/ORG-LoB-Ursvikskolan/Delade%20dokument/Allm%C3%A4nt/Rutiner/Kr%C3%A4nkningsanm%C3%A4lan.pdf?csf=1&web=1&e=lhtHDW' },
  { label: 'Schemavisare', url: 'https://web.skola24.se/timetable/timetable-viewer/sundbyberg.skola24.se/Ursvikskolan/' },
  { label: 'Anmälan EHT', url: 'https://journal.prorenata.se/contactform/sundbybergs-s/anmalan_eht/' },
  { label: 'Ramtider - Fritids', url: 'https://sundbybergsstad-my.sharepoint.com/:x:/r/personal/nima_wasell_sundbyberg_se/Documents/Ramtider%2025-26.xlsx?d=wd4c9d41ed320400a9bbade700b408fdc&csf=1&web=1&e=HnNs0G' },
  { label: 'Felanmälan', url: 'https://forms.office.com/e/kDZnwE1f2H' },
  { label: 'Schema - Ursviks IP', url: 'https://sundbyberg.actorsmartbook.se/ResourceBookingRequest.aspx' },
];

const kontakter = [
  'Emelie: 08 - 706 82 73',
  'Åsa: 08 - 706 88 45',
  'Benny: 08 - 706 66 89',
  'Jakob: 08 - 706 85 96',
  'Nima + sjukanmälan: 08 - 706 67 41',
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

function frånvaroFörDag(frånvaro: Frånvaro[], dag: string) {
  return frånvaro.filter((f) => f.datum_från <= dag && f.datum_till >= dag);
}

function passFörDag(pass: Vikariepass[], dag: string) {
  return pass.filter((p) => p.datum === dag && p.status !== 'avbokat');
}

function esc(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function frånvaroText(f: Frånvaro) {
  const tidText = f.hel_dag ? '' : ` (${tid(f.tid_från)}-${tid(f.tid_till)})`;
  return `${f.personal?.namn ?? 'Okänd'}${tidText}`;
}

function vikarieText(pass: Vikariepass) {
  const vikarie = pass.vikarie?.namn ?? (pass.status === 'obokat' ? 'Ej tillsatt' : 'Vikarie saknas');
  const grupp = pass.grupp ? ` - ${pass.grupp}` : '';
  const ämne = pass.ämne ? ` (${pass.ämne})` : '';
  return `${vikarie}${grupp}${ämne}\n(${tid(pass.tid_från)}-${tid(pass.tid_till)})`;
}

function byggHtml({
  datumText,
  dagar,
  frånvaro,
  pass,
}: {
  datumText: string;
  dagar: Date[];
  frånvaro: Frånvaro[];
  pass: Vikariepass[];
}) {
  const tableRows = [
    `<tr><th style="border:1px solid #666;padding:8px;text-align:left;">Vecka</th>${dagar.map((dag) => `<th style="border:1px solid #666;padding:8px;text-align:center;">${esc(dag.toLocaleDateString('sv-SE', { weekday: 'long' }))}</th>`).join('')}</tr>`,
    `<tr><th style="border:1px solid #666;padding:8px;text-align:center;">${veckaNummer(dagar[0])}</th>${dagar.map((dag) => `<th style="border:1px solid #666;padding:8px;text-align:center;">${esc(kortDatum(dag))}</th>`).join('')}</tr>`,
    `<tr><th style="border:1px solid #666;padding:12px;text-align:left;">Frånvaro</th>${dagar.map((dag) => {
      const rader = frånvaroFörDag(frånvaro, iso(dag));
      return `<td style="border:1px solid #666;padding:14px;text-align:center;height:120px;vertical-align:middle;">${rader.length ? rader.map((f) => esc(frånvaroText(f))).join('<br>') : '-'}</td>`;
    }).join('')}</tr>`,
    `<tr><th style="border:1px solid #666;padding:12px;text-align:left;">Vikarie</th>${dagar.map((dag) => {
      const rader = passFörDag(pass, iso(dag));
      return `<td style="border:1px solid #666;padding:14px;text-align:center;height:170px;vertical-align:middle;">${rader.length ? rader.map((p) => esc(vikarieText(p)).replaceAll('\\n', '<br>')).join('<br><br>') : '-'}</td>`;
    }).join('')}</tr>`,
    `<tr><th style="border:1px solid #666;padding:12px;text-align:left;">Övrigt</th>${dagar.map(() => `<td style="border:1px solid #666;padding:14px;text-align:center;height:110px;vertical-align:middle;">-</td>`).join('')}</tr>`,
  ].join('');

  return `
<div style="font-family:Arial,sans-serif;font-size:13px;color:#ffffff;background:#252525;padding:12px;">
  <p>God morgon,<br>här är frånvaron för ${esc(datumText)}</p>
  <p>Vi påminner om rutinen att medarbetares frånvaroanmälan vid VAB och sjukdom görs till Nima (+ närmsta chef) via sms till nummer: 070-087 63 05 före kl. 07.00. Du återkommer till mig senast kl. 14.00 dagen innan du beräknar vara i tjänst eller fortsatt sjuk.</p>
  <table style="border-collapse:collapse;background:#333333;color:#ffffff;min-width:900px;">
    ${tableRows}
  </table>
  <p style="margin-top:24px;"><strong>Länkar:</strong><br>
    ${länkar.map((l) => `<a href="${esc(l.url)}" style="color:#9bd3e8;">${esc(l.label)}</a>`).join('<br>')}
  </p>
  <p style="margin-top:20px;"><strong>Kontaktuppgifter:</strong><br>
    ${kontakter.map(esc).join('<br>')}
  </p>
</div>`.trim();
}

export default function Utskick() {
  const [veckaStart, setVeckaStart] = useState(() => iso(startPåVecka(new Date())));
  const [frånvaro, setFrånvaro] = useState<Frånvaro[]>([]);
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [kopierat, setKopierat] = useState(false);

  const start = useMemo(() => startPåVecka(new Date(veckaStart)), [veckaStart]);
  const dagar = useMemo(() => [0, 1, 2, 3, 4].map((i) => läggTillDagar(start, i)), [start]);
  const slut = iso(dagar[4]);
  const datumText = långDatum(new Date());
  const ämne = `Frånvarolista - ${datumText}`;

  useEffect(() => {
    async function ladda() {
      setLaddar(true);
      const [fRes, pRes] = await Promise.all([
        frånvaroApi.lista(iso(start), slut),
        passApi.lista({ datumFrån: iso(start), datumTill: slut }),
      ]);
      setFrånvaro((fRes.data ?? []) as Frånvaro[]);
      setPass((pRes.data ?? []) as Vikariepass[]);
      setLaddar(false);
    }
    ladda();
  }, [veckaStart]);

  const intro = `God morgon,

här är frånvaron för ${datumText}.

Vi påminner om rutinen att medarbetares frånvaroanmälan vid VAB och sjukdom görs till Nima (+ närmsta chef) via sms till nummer: 070-087 63 05 före kl. 07.00. Du återkommer till mig senast kl. 14.00 dagen innan du beräknar vara i tjänst eller fortsatt sjuk.`;

  async function kopieraHtmlMejl() {
    const html = byggHtml({ datumText, dagar, frånvaro, pass });
    const plain = [
      intro,
      '',
      ...dagar.map((dag) => {
        const nyckel = iso(dag);
        const frånvaroRader = frånvaroFörDag(frånvaro, nyckel).map(frånvaroText).join(', ') || '-';
        const vikarieRader = passFörDag(pass, nyckel).map(vikarieText).join('; ') || '-';
        return `${dag.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'numeric' })}\nFrånvaro: ${frånvaroRader}\nVikarie: ${vikarieRader}`;
      }),
      '',
      'Länkar:',
      ...länkar.map((l) => `${l.label}: ${l.url}`),
      '',
      'Kontaktuppgifter:',
      ...kontakter,
    ].join('\n');

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
    setTimeout(() => setKopierat(false), 2000);
  }

  function öppnaMejl() {
    const body = encodeURIComponent(intro);
    window.location.href = `mailto:?subject=${encodeURIComponent(ämne)}&body=${body}`;
  }

  if (laddar) return <LaddaSida />;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
            Kommunikation
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            Utskick
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Veckosammanställning av frånvaro och vikariepass som Outlook-klart mejl.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={veckaStart}
            onChange={(e) => setVeckaStart(iso(startPåVecka(new Date(e.target.value))))}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <Button variant="secondary" onClick={öppnaMejl}>Öppna mejl</Button>
          <Button onClick={kopieraHtmlMejl}>{kopierat ? 'Kopierat' : 'Kopiera HTML-mejl'}</Button>
        </div>
      </div>

      <div className="mb-6 rounded-lg border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>Mejltext</p>
        <div className="whitespace-pre-line text-sm leading-6" style={{ color: 'var(--text-muted)' }}>
          {intro}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ background: '#30302f', borderColor: '#5a5a56' }}>
        <table className="min-w-[960px] w-full border-collapse text-sm text-white">
          <thead>
            <tr>
              <th className="w-24 border px-3 py-3 text-left" style={{ borderColor: '#5a5a56' }}>Vecka</th>
              {dagar.map((dag) => (
                <th key={iso(dag)} className="border px-3 py-3 text-center" style={{ borderColor: '#5a5a56' }}>
                  {dag.toLocaleDateString('sv-SE', { weekday: 'long' })}
                </th>
              ))}
            </tr>
            <tr>
              <th className="border px-3 py-3 text-center" style={{ borderColor: '#5a5a56' }}>{veckaNummer(start)}</th>
              {dagar.map((dag) => (
                <th key={iso(dag)} className="border px-3 py-3 text-center" style={{ borderColor: '#5a5a56' }}>
                  {kortDatum(dag)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="border px-3 py-4 text-left align-middle" style={{ borderColor: '#5a5a56' }}>Frånvaro</th>
              {dagar.map((dag) => {
                const rader = frånvaroFörDag(frånvaro, iso(dag));
                return (
                  <td key={iso(dag)} className="h-36 border px-3 py-4 text-center align-middle" style={{ borderColor: '#5a5a56' }}>
                    {rader.length === 0 ? <span className="text-white/35">-</span> : (
                      <div className="space-y-1">{rader.map((f) => <div key={f.id}>{frånvaroText(f)}</div>)}</div>
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th className="border px-3 py-4 text-left align-middle" style={{ borderColor: '#5a5a56' }}>Vikarie</th>
              {dagar.map((dag) => {
                const rader = passFörDag(pass, iso(dag));
                return (
                  <td key={iso(dag)} className="h-48 border px-3 py-4 text-center align-middle" style={{ borderColor: '#5a5a56' }}>
                    {rader.length === 0 ? <span className="text-white/35">-</span> : (
                      <div className="space-y-3">
                        {rader.map((p) => (
                          <div key={p.id}>
                            <div className="font-semibold">{p.vikarie?.namn ?? (p.status === 'obokat' ? 'Ej tillsatt' : 'Vikarie saknas')}</div>
                            <div>{p.grupp}{p.ämne ? ` · ${p.ämne}` : ''}</div>
                            <div className="text-xs text-white/80">({tid(p.tid_från)}-{tid(p.tid_till)})</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th className="border px-3 py-4 text-left align-middle" style={{ borderColor: '#5a5a56' }}>Övrigt</th>
              {dagar.map((dag) => (
                <td key={iso(dag)} className="h-28 border px-3 py-4 text-center align-middle text-white/45" style={{ borderColor: '#5a5a56' }}>
                  -
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>Länkar</p>
          <div className="space-y-1 text-sm">
            {länkar.map((länk) => (
              <a key={länk.label} href={länk.url} target="_blank" rel="noreferrer" className="block underline" style={{ color: 'var(--accent)' }}>
                {länk.label}
              </a>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>Kontaktuppgifter</p>
          <div className="space-y-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {kontakter.map((kontakt) => <p key={kontakt}>{kontakt}</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}
