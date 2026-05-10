import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { importApi, personalApi } from '../../lib/api';
import type { Schemarad, Personal, Schemaimport, Matchningsstatus } from '../../types';
import { Button, Select, Alert, TomtTillstånd, LaddaSida, Badge } from '../../components/ui';

// Column mapping: internal field -> display label
const FÄLT: Record<string, string> = {
  datum: 'Datum',
  tid_från: 'Tid från',
  tid_till: 'Tid till',
  signatur: 'Signatur',
  ämne: 'Ämne',
  grupp: 'Grupp/klass',
  sal: 'Sal',
};

function detekteraKolumner(kolumner: string[]): Record<string, string> {
  const mappning: Record<string, string> = {};
  const lcKolumner = kolumner.map((k) => k.toLowerCase());

  const mönster: Record<string, string[]> = {
    datum: ['datum', 'date', 'dag'],
    tid_från: ['tid från', 'start', 'från', 'starttid'],
    tid_till: ['tid till', 'slut', 'till', 'sluttid'],
    signatur: ['signatur', 'sign', 'förkortning', 'initials'],
    ämne: ['ämne', 'kurs', 'subject', 'aktivitet'],
    grupp: ['grupp', 'klass', 'group', 'class'],
    sal: ['sal', 'rum', 'lokal', 'room'],
  };

  for (const [fält, möjliga] of Object.entries(mönster)) {
    for (const möjlig of möjliga) {
      const idx = lcKolumner.findIndex((k) => k.includes(möjlig));
      if (idx !== -1) {
        mappning[fält] = kolumner[idx];
        break;
      }
    }
  }
  return mappning;
}

function matchaPersonal(rad: Record<string, string>, personal: Personal[], mappning: Record<string, string>): {
  match: Personal | null;
  status: Matchningsstatus;
} {
  const signatur = rad[mappning.signatur ?? '']?.trim();
  if (!signatur) return { match: null, status: 'omatchad' };

  // Exakt signaturmatch
  const exakt = personal.find((p) => p.signatur?.toLowerCase() === signatur.toLowerCase());
  if (exakt) return { match: exakt, status: 'matchad' };

  // Skola24 ID
  const s24match = personal.find((p) => p.skola24_id === signatur);
  if (s24match) return { match: s24match, status: 'matchad' };

  // Partiell namnsökning
  const partiell = personal.filter((p) => p.namn.toLowerCase().includes(signatur.toLowerCase()));
  if (partiell.length === 1) return { match: partiell[0], status: 'osäker' };

  return { match: null, status: 'omatchad' };
}

// ============================================================
// Main page
// ============================================================
export default function Import() {
  const [importer, setImporter] = useState<Schemaimport[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [steg, setSteg] = useState<'lista' | 'förhandsvisning'>('lista');
  const [rader, setRader] = useState<Record<string, string>[]>([]);
  const [kolumner, setKolumner] = useState<string[]>([]);
  const [mappning, setMappning] = useState<Record<string, string>>({});
  const [filnamn, setFilnamn] = useState('');
  const [förbehandlade, setFörbehandlade] = useState<{
    rad: Record<string, string>;
    match: Personal | null;
    status: Matchningsstatus;
    åsidosattPersonalId?: string;
  }[]>([]);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');
  const filRef = useRef<HTMLInputElement>(null);

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

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        if (json.length === 0) { setFel('Filen är tom eller kunde inte läsas.'); return; }
        const kols = Object.keys(json[0]);
        const detekterad = detekteraKolumner(kols);
        setKolumner(kols);
        setMappning(detekterad);
        setRader(json);
        setFörbehandlade([]);
        setSteg('förhandsvisning');
      } catch {
        setFel('Kunde inte läsa filen. Kontrollera att det är en giltig CSV eller Excel-fil.');
      }
    };
    reader.readAsBinaryString(fil);
  }

  function förbehandla() {
    const fb = rader.map((rad) => {
      const { match, status } = matchaPersonal(rad, personal, mappning);
      return { rad, match, status };
    });
    setFörbehandlade(fb);
  }

  async function spara() {
    setSparar(true);
    setFel('');

    const matchade = förbehandlade.filter((r) => r.status === 'matchad').length;
    const omatchade = förbehandlade.filter((r) => r.status === 'omatchad').length;

    const importRes = await importApi.skapaImport(filnamn, rader.length, mappning);
    if (importRes.error || !importRes.data) {
      setFel(importRes.error?.message ?? 'Kunde inte spara importen.');
      setSparar(false);
      return;
    }

    const importId = importRes.data.id;
    const schemadataRader = förbehandlade.map((fb) => ({
      import_id: importId,
      personal_id: fb.åsidosattPersonalId ?? fb.match?.id ?? null,
      rå_data: fb.rad as Record<string, unknown>,
      datum: fb.rad[mappning.datum] || null,
      tid_från: fb.rad[mappning.tid_från] || null,
      tid_till: fb.rad[mappning.tid_till] || null,
      ämne: fb.rad[mappning.ämne] || null,
      grupp: fb.rad[mappning.grupp] || null,
      sal: fb.rad[mappning.sal] || null,
      signatur: fb.rad[mappning.signatur] || null,
      matchningsstatus: (fb.åsidosattPersonalId ? 'matchad' : fb.status) as Matchningsstatus,
    }));

    await importApi.skapaSchemarader(schemadataRader);
    await importApi.uppdateraImportStatistik(importId, matchade, omatchade);
    setSparar(false);
    setImporter((prev) => [importRes.data as Schemaimport, ...prev]);
    setSteg('lista');
    setRader([]);
    setFörbehandlade([]);
    if (filRef.current) filRef.current.value = '';
  }

  if (laddar) return <LaddaSida />;

  if (steg === 'förhandsvisning') {
    return (
      <div className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => { setSteg('lista'); setRader([]); setFörbehandlade([]); }}
            className="text-sm text-gray-500 hover:text-gray-800">← Tillbaka</button>
          <h1 className="text-xl font-semibold text-gray-900">Importera schema: {filnamn}</h1>
        </div>

        {fel && <Alert typ="error" className="mb-4">{fel}</Alert>}

        {/* Kolumnmappning */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Kolumnmappning</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(FÄLT).map(([fält, etikett]) => (
              <Select
                key={fält}
                label={etikett}
                value={mappning[fält] ?? ''}
                onChange={(e) => setMappning({ ...mappning, [fält]: e.target.value })}
              >
                <option value="">– Ignorera –</option>
                {kolumner.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            ))}
          </div>
          <Button className="mt-4" onClick={förbehandla}>Matcha mot personal</Button>
        </div>

        {/* Förhandsvisning */}
        {förbehandlade.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex gap-4 text-sm text-gray-600">
                <span className="text-green-600 font-medium">{förbehandlade.filter(r=>r.status==='matchad').length} matchade</span>
                <span className="text-yellow-600 font-medium">{förbehandlade.filter(r=>r.status==='osäker').length} osäkra</span>
                <span className="text-red-600 font-medium">{förbehandlade.filter(r=>r.status==='omatchad').length} omatchade</span>
              </div>
              <Button loading={sparar} onClick={spara}>Spara import ({rader.length} rader)</Button>
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-2 text-left font-medium">Datum</th>
                    <th className="px-4 py-2 text-left font-medium">Tid</th>
                    <th className="px-4 py-2 text-left font-medium">Signatur</th>
                    <th className="px-4 py-2 text-left font-medium">Matchad personal</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Åsidosätt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {förbehandlade.map((fb, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700">{fb.rad[mappning.datum] ?? '–'}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {fb.rad[mappning.tid_från] ?? ''}–{fb.rad[mappning.tid_till] ?? ''}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                        {fb.rad[mappning.signatur] ?? '–'}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {fb.åsidosattPersonalId
                          ? personal.find(p=>p.id===fb.åsidosattPersonalId)?.namn
                          : fb.match?.namn ?? '–'}
                      </td>
                      <td className="px-4 py-2.5">
                        <MatchningsBadge status={fb.åsidosattPersonalId ? 'matchad' : fb.status} />
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          className="rounded border border-gray-200 px-2 py-1 text-xs"
                          value={fb.åsidosattPersonalId ?? ''}
                          onChange={(e) => {
                            const ny = [...förbehandlade];
                            ny[i] = { ...ny[i], åsidosattPersonalId: e.target.value || undefined };
                            setFörbehandlade(ny);
                          }}
                        >
                          <option value="">– Manuell koppling –</option>
                          {personal.map((p) => <option key={p.id} value={p.id}>{p.namn}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Schemaimport</h1>
      </div>

      {/* Upload zone */}
      <div className="mb-8 rounded-xl border-2 border-dashed border-gray-200 bg-white p-8 text-center">
        <p className="mb-2 text-sm text-gray-600">Ladda upp schema från Skola24 (CSV eller Excel)</p>
        <p className="mb-4 text-xs text-gray-400">Kolumner matchas automatiskt. Manuell justering möjlig.</p>
        <input
          ref={filRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={hanteraFil}
          className="hidden"
          id="fil-upload"
        />
        <label
          htmlFor="fil-upload"
          className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Välj fil
        </label>
        {fel && <Alert typ="error" className="mt-4">{fel}</Alert>}
      </div>

      {/* Import history */}
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Tidigare importer</h2>
      {importer.length === 0 ? (
        <TomtTillstånd text="Inga importer genomförda ännu." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500">
                <th className="px-4 py-2.5 text-left font-medium">Fil</th>
                <th className="px-4 py-2.5 text-left font-medium">Rader</th>
                <th className="px-4 py-2.5 text-left font-medium">Matchade</th>
                <th className="px-4 py-2.5 text-left font-medium">Omatchade</th>
                <th className="px-4 py-2.5 text-left font-medium">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {importer.map((imp) => (
                <tr key={imp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{imp.filnamn}</td>
                  <td className="px-4 py-3 text-gray-700">{imp.radantal ?? '–'}</td>
                  <td className="px-4 py-3 text-green-600 font-medium">{imp.matchade}</td>
                  <td className="px-4 py-3 text-red-600 font-medium">{imp.omatchade}</td>
                  <td className="px-4 py-3 text-gray-500">
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
