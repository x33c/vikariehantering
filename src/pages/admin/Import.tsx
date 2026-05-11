import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { importApi, personalApi } from '../../lib/api';
import { parsaNovaschemaFil, expanderaLektioner, detekteraNovaschema, parsaPersonalFrånNovaschema } from '../../lib/novaschem';
import type { NovaschemaImportRad, NovaschemaPersonal } from '../../lib/novaschem';
import type { Schemarad, Personal, Schemaimport, Matchningsstatus } from '../../types';
import { Button, Alert, TomtTillstånd, LaddaSida } from '../../components/ui';

function matchaPersonal(signatur: string, personal: Personal[]): {
  match: Personal | null;
  status: Matchningsstatus;
} {
  if (!signatur) return { match: null, status: 'omatchad' };
  const exakt = personal.find(p => p.signatur?.toLowerCase() === signatur.toLowerCase());
  if (exakt) return { match: exakt, status: 'matchad' };
  const s24 = personal.find(p => p.skola24_id === signatur);
  if (s24) return { match: s24, status: 'matchad' };
  const partiell = personal.filter(p => p.namn.toLowerCase().includes(signatur.toLowerCase()));
  if (partiell.length === 1) return { match: partiell[0], status: 'osäker' };
  return { match: null, status: 'omatchad' };
}

function MatchningsBadge({ status }: { status: Matchningsstatus }) {
  const s: Record<Matchningsstatus, { label: string; cls: string }> = {
    matchad: { label: 'Matchad', cls: 'bg-green-100 text-green-700' },
    osäker: { label: 'Osäker', cls: 'bg-yellow-100 text-yellow-700' },
    omatchad: { label: 'Omatchad', cls: 'bg-red-100 text-red-700' },
    ignorerad: { label: 'Ignorerad', cls: 'bg-gray-100 text-gray-500' },
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${s[status].cls}`}>
      {s[status].label}
    </span>
  );
}

export default function Import() {
  const [importer, setImporter] = useState<Schemaimport[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [steg, setSteg] = useState<'lista' | 'förhandsvisning'>('lista');
  const [filnamn, setFilnamn] = useState('');
  const [fel, setFel] = useState('');
  const [sparar, setSparar] = useState(false);
  const [importerarPersonal, setImporterarPersonal] = useState(false);
  const [personalFrånFil, setPersonalFrånFil] = useState<NovaschemaPersonal[]>([]);
  const [personalMeddelande, setPersonalMeddelande] = useState('');
  const filRef = useRef<HTMLInputElement>(null);

  const [förbehandlade, setFörbehandlade] = useState<{
    rad: NovaschemaImportRad;
    match: Personal | null;
    status: Matchningsstatus;
    åsidosattPersonalId?: string;
  }[]>([]);

  useEffect(() => {
    Promise.all([importApi.listaImporter(), personalApi.lista()]).then(([iRes, pRes]) => {
      setImporter((iRes.data ?? []) as Schemaimport[]);
      setPersonal((pRes.data ?? []) as Personal[]);
      setLaddar(false);
    });
  }, []);

  function hanteraFil(e: React.ChangeEvent<HTMLInputElement>) {
    const fil = e.target.files?.[0];
    if (!fil) return;
    setFilnamn(fil.name);
    setFel('');
    setPersonalMeddelande('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const resultat = ev.target?.result;
      if (!resultat) return;

      try {
        const text = typeof resultat === 'string' ? resultat : new TextDecoder('latin1').decode(resultat as ArrayBuffer);

        if (detekteraNovaschema(text)) {
          // Novaschem TXT-format
          const lektioner = parsaNovaschemaFil(text);
          if (lektioner.length === 0) {
            setFel('Inga lektioner hittades i filen. Kontrollera att det är en giltig Novaschem-export.');
            return;
          }
          setPersonalFrånFil(parsaPersonalFrånNovaschema(text));
          const expanderade = expanderaLektioner(lektioner);
          const fb = expanderade.map(rad => {
            const { match, status } = matchaPersonal(rad.signatur, personal);
            return { rad, match, status };
          });
          setFörbehandlade(fb);
          setSteg('förhandsvisning');
        } else {
          setPersonalFrånFil([]);
          // Excel/CSV-format
          const data = ev.target?.result;
          const wb = XLSX.read(data, { type: 'binary', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
          if (json.length === 0) { setFel('Filen är tom eller kunde inte läsas.'); return; }

          // Konvertera Excel-rader till NovaschemaImportRad-format
          const rader: NovaschemaImportRad[] = json.map((r, i) => ({
            datum: String(r['datum'] || r['Datum'] || ''),
            tidFrån: String(r['tid_från'] || r['Tid från'] || r['Start'] || ''),
            tidTill: String(r['tid_till'] || r['Tid till'] || r['Slut'] || ''),
            ämne: String(r['ämne'] || r['Ämne'] || r['Kurs'] || ''),
            signatur: String(r['signatur'] || r['Signatur'] || ''),
            grupp: String(r['grupp'] || r['Grupp'] || r['Klass'] || ''),
            sal: String(r['sal'] || r['Sal'] || ''),
            lektionsId: String(i),
          }));

          const fb = rader.map(rad => {
            const { match, status } = matchaPersonal(rad.signatur, personal);
            return { rad, match, status };
          });
          setFörbehandlade(fb);
          setSteg('förhandsvisning');
        }
      } catch (err) {
        setFel('Kunde inte läsa filen. Kontrollera att det är en giltig fil.');
        console.error(err);
      }
    };

    if (fil.name.toLowerCase().endsWith('.txt')) {
      reader.readAsArrayBuffer(fil);
    } else {
      reader.readAsBinaryString(fil);
    }
  }

  async function importeraPersonalFrånFil() {
    setImporterarPersonal(true);
    setFel('');
    setPersonalMeddelande('');

    const befintligaSignaturer = new Set(
      personal.map(p => p.signatur?.toLowerCase()).filter(Boolean)
    );
    const befintligaEposter = new Set(
      personal.map(p => p.epost?.toLowerCase()).filter(Boolean)
    );

    const nya = personalFrånFil.filter(p => {
      const signaturFinns = befintligaSignaturer.has(p.signatur.toLowerCase());
      const epostFinns = p.epost ? befintligaEposter.has(p.epost.toLowerCase()) : false;
      return !signaturFinns && !epostFinns;
    });

    let skapade = 0;
    for (const person of nya) {
      const res = await personalApi.skapa({
        arbetslag_id: null,
        namn: person.namn,
        epost: person.epost || null,
        telefon: person.telefon || null,
        signatur: person.signatur,
        skola24_id: null,
        titel: person.titel || null,
        aktiv: true,
      });

      if (!res.error) skapade += 1;
    }

    const pRes = await personalApi.lista();
    const uppdateradPersonal = (pRes.data ?? []) as Personal[];
    const importeradeSignaturer = new Set(personalFrånFil.map(p => p.signatur.toLowerCase()));
    const personalMedImporteradSignatur = uppdateradPersonal.filter(p =>
      p.signatur && importeradeSignaturer.has(p.signatur.toLowerCase())
    );

    await importApi.matchaSchemaraderMotPersonal(personalMedImporteradSignatur);

    setPersonal(uppdateradPersonal);
    setPersonalMeddelande(`Importerade ${skapade} ny personal. ${personalFrånFil.length - skapade} fanns redan eller hoppades över. Befintliga schemarader har matchats om mot signaturer.`);
    setImporterarPersonal(false);
  }

  async function spara() {
    setSparar(true);
    setFel('');

    const matchade = förbehandlade.filter(r => r.status === 'matchad' || r.åsidosattPersonalId).length;
    const omatchade = förbehandlade.filter(r => r.status === 'omatchad' && !r.åsidosattPersonalId).length;

    const importRes = await importApi.skapaImport(filnamn, förbehandlade.length, {});
    if (importRes.error || !importRes.data) {
      setFel(importRes.error?.message ?? 'Kunde inte spara importen.');
      setSparar(false);
      return;
    }

    const importId = importRes.data.id;
    const schemadataRader = förbehandlade.map(fb => ({
      import_id: importId,
      personal_id: fb.åsidosattPersonalId ?? fb.match?.id ?? null,
      rå_data: fb.rad as unknown as Record<string, unknown>,
      datum: fb.rad.datum || null,
      tid_från: fb.rad.tidFrån || null,
      tid_till: fb.rad.tidTill || null,
      ämne: fb.rad.ämne || null,
      grupp: fb.rad.grupp || null,
      sal: fb.rad.sal || null,
      signatur: fb.rad.signatur || null,
      matchningsstatus: (fb.åsidosattPersonalId ? 'matchad' : fb.status) as Matchningsstatus,
    }));

    // Spara i batchar om 500
    for (let i = 0; i < schemadataRader.length; i += 500) {
      await importApi.skapaSchemarader(schemadataRader.slice(i, i + 500));
    }

    await importApi.uppdateraImportStatistik(importId, matchade, omatchade);
    setSparar(false);
    setImporter(prev => [importRes.data as Schemaimport, ...prev]);
    setSteg('lista');
    setFörbehandlade([]);
    if (filRef.current) filRef.current.value = '';
  }

  if (laddar) return <LaddaSida />;

  if (steg === 'förhandsvisning') {
    const matchade = förbehandlade.filter(r => r.status === 'matchad' || r.åsidosattPersonalId).length;
    const osäkra = förbehandlade.filter(r => r.status === 'osäker' && !r.åsidosattPersonalId).length;
    const omatchade = förbehandlade.filter(r => r.status === 'omatchad' && !r.åsidosattPersonalId).length;

    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => { setSteg('lista'); setFörbehandlade([]); }}
            className="rounded-lg border px-3 py-2 text-sm font-medium"
            style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
          >
            Tillbaka
          </button>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Förhandsvisning</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
              {filnamn}
            </h1>
          </div>
        </div>

        {fel && <Alert typ="error" className="mb-4">{fel}</Alert>}
        {personalMeddelande && <Alert typ="success" className="mb-4">{personalMeddelande}</Alert>}

        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Matchade', värde: matchade, color: '#047857' },
            { label: 'Osäkra', värde: osäkra, color: '#b45309' },
            { label: 'Omatchade', värde: omatchade, color: '#b91c1c' },
            { label: 'Totalt', värde: förbehandlade.length, color: 'var(--text)' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: stat.color }}>{stat.värde}</p>
            </div>
          ))}
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Visar en förhandsvisning av de första raderna. Alla rader sparas vid import.
          </p>
          <div className="flex flex-wrap gap-2">
            {personalFrånFil.length > 0 && (
              <Button variant="secondary" loading={importerarPersonal} onClick={importeraPersonalFrånFil}>
                Importera personal ({personalFrånFil.length})
              </Button>
            )}
            <Button loading={sparar} onClick={spara}>
              Spara import ({förbehandlade.length} rader)
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text-muted)' }}>
                  <th className="px-4 py-2.5 text-left font-medium">Datum</th>
                  <th className="px-4 py-2.5 text-left font-medium">Tid</th>
                  <th className="px-4 py-2.5 text-left font-medium">Ämne</th>
                  <th className="px-4 py-2.5 text-left font-medium">Grupp</th>
                  <th className="px-4 py-2.5 text-left font-medium">Signatur</th>
                  <th className="px-4 py-2.5 text-left font-medium">Matchad personal</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Åsidosätt</th>
                </tr>
              </thead>
              <tbody>
                {förbehandlade.slice(0, 200).map((fb, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text)' }}>{fb.rad.datum}</td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                      {fb.rad.tidFrån}–{fb.rad.tidTill}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text)' }}>{fb.rad.ämne || '–'}</td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{fb.rad.grupp || '–'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      {fb.rad.signatur || '–'}
                    </td>
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text)' }}>
                      {fb.åsidosattPersonalId
                        ? personal.find(p => p.id === fb.åsidosattPersonalId)?.namn
                        : fb.match?.namn ?? '–'}
                    </td>
                    <td className="px-4 py-2.5">
                      <MatchningsBadge status={fb.åsidosattPersonalId ? 'matchad' : fb.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        className="rounded border px-2 py-1 text-xs"
                        style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                        value={fb.åsidosattPersonalId ?? ''}
                        onChange={(e) => {
                          const ny = [...förbehandlade];
                          ny[i] = { ...ny[i], åsidosattPersonalId: e.target.value || undefined };
                          setFörbehandlade(ny);
                        }}
                      >
                        <option value="">– Koppla manuellt –</option>
                        {personal.map(p => (
                          <option key={p.id} value={p.id}>{p.namn} {p.signatur ? `(${p.signatur})` : ''}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {förbehandlade.length > 200 && (
            <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              Visar 200 av {förbehandlade.length} rader. Alla sparas vid import.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
            Schema
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            Schemaimport
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Importera Novaschem TXT, CSV eller Excel och matcha mot personal.
          </p>
        </div>
      </div>

      <div
        className="mb-8 rounded-lg border p-6 sm:p-8"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              Ladda upp schemafil
            </h2>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--text-muted)' }}>
              TXT-export från Novaschem kan även innehålla personal. Efter uppladdning får du förhandsgranska matchning innan importen sparas.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="rounded-full border px-2.5 py-1" style={{ borderColor: 'var(--border)' }}>.txt</span>
              <span className="rounded-full border px-2.5 py-1" style={{ borderColor: 'var(--border)' }}>.csv</span>
              <span className="rounded-full border px-2.5 py-1" style={{ borderColor: 'var(--border)' }}>.xlsx</span>
            </div>
          </div>

          <div className="shrink-0">
            <input
              ref={filRef}
              type="file"
              accept=".txt,.csv,.xlsx,.xls"
              onChange={hanteraFil}
              className="hidden"
              id="fil-upload"
            />
            <label
              htmlFor="fil-upload"
              className="inline-flex cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              Välj fil
            </label>
          </div>
        </div>
        {fel && <Alert typ="error" className="mt-5">{fel}</Alert>}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Tidigare importer</h2>
        <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>{importer.length} importer</span>
      </div>
      {importer.length === 0 ? (
        <TomtTillstånd text="Inga importer genomförda ännu." />
      ) : (
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text-muted)' }}>
                <th className="px-4 py-2.5 text-left font-medium">Fil</th>
                <th className="px-4 py-2.5 text-left font-medium">Rader</th>
                <th className="px-4 py-2.5 text-left font-medium">Matchade</th>
                <th className="px-4 py-2.5 text-left font-medium">Omatchade</th>
                <th className="px-4 py-2.5 text-left font-medium">Datum</th>
              </tr>
            </thead>
            <tbody>
              {importer.map(imp => (
                <tr key={imp.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{imp.filnamn}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text)' }}>{imp.radantal ?? '–'}</td>
                  <td className="px-4 py-3 font-medium text-green-600">{imp.matchade}</td>
                  <td className="px-4 py-3 font-medium text-red-500">{imp.omatchade}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                    {new Date(imp.created_at).toLocaleDateString('sv-SE')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}