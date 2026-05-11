import { useEffect, useState } from 'react';
import { frånvaroApi, personalApi, passApi, historikApi } from '../../lib/api';
import type { Frånvaro, Personal, Schemarad } from '../../types';
import {
  Button, Input, Select, Textarea, Modal, Confirm, TomtTillstånd, LaddaSida, Alert, StatusBadge
} from '../../components/ui';

function datumIdag() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// Frånvaro-modal: registrera frånvaro + föreslå pass
// ============================================================
function FrånvaroModal({
  öppen, onStäng, personal, valtPersonalId, onRegistrerad,
}: {
  öppen: boolean;
  onStäng: () => void;
  personal: Personal[];
  valtPersonalId?: string;
  onRegistrerad: () => void;
}) {
  const [personalId, setPersonalId] = useState(valtPersonalId ?? '');
  const [datumFrån, setDatumFrån] = useState(datumIdag());
  const [datumTill, setDatumTill] = useState(datumIdag());
  const [helDag, setHelDag] = useState(true);
  const [tidFrån, setTidFrån] = useState('08:00');
  const [tidTill, setTidTill] = useState('17:00');
  const [orsak, setOrsak] = useState('');
  const [anteckning, setAnteckning] = useState('');
  const [steg, setSteg] = useState<'formulär' | 'pass'>('formulär');
  const [schemarader, setSchemarader] = useState<Schemarad[]>([]);
  const [skapadFrånvaro, setSkapadFrånvaro] = useState<Frånvaro | null>(null);
  const [valda, setValda] = useState<Set<string>>(new Set());
  const [laddar, setLaddar] = useState(false);
  const [skaparPass, setSkaparPass] = useState(false);
  const [fel, setFel] = useState('');

  useEffect(() => {
    if (öppen) {
      setPersonalId(valtPersonalId ?? '');
      setDatumFrån(datumIdag());
      setDatumTill(datumIdag());
      setHelDag(true);
      setSteg('formulär');
      setFel('');
      setSchemarader([]);
    }
  }, [öppen, valtPersonalId]);

  async function registreraFrånvaro() {
    if (!personalId) { setFel('Välj personal.'); return; }
    if (datumTill < datumFrån) { setFel('Slutdatum kan inte vara före startdatum.'); return; }
    setLaddar(true);
    setFel('');

    const res = await frånvaroApi.skapa({
      personal_id: personalId,
      datum_från: datumFrån,
      datum_till: datumTill,
      hel_dag: helDag,
      tid_från: helDag ? null : tidFrån,
      tid_till: helDag ? null : tidTill,
      orsak: orsak || null,
      anteckning: anteckning || null,
      skapad_av: null,
    });
    setLaddar(false);

    if (res.error) { setFel(res.error.message); return; }
    setSkapadFrånvaro(res.data as Frånvaro);

    // Hämta matchande schemarader
    const sRes = await frånvaroApi.hämtaSchemaraderFörFrånvaro(personalId, datumFrån, datumTill);
    const rader = (sRes.data ?? []) as Schemarad[];
    setSchemarader(rader);
    setValda(new Set(rader.map((r) => r.id)));
    setSteg('pass');
  }

  async function skapaVikariepass() {
    if (!skapadFrånvaro) return;
    setSkaparPass(true);

    const valdaRader = schemarader.filter((r) => valda.has(r.id));

    if (valdaRader.length > 0) {
      // Skapa pass baserade på schemarader
      for (const rad of valdaRader) {
        const res = await passApi.skapa({
          frånvaro_id: skapadFrånvaro.id,
          schemarad_id: rad.id,
          personal_id: personalId,
          vikarie_id: null,
          datum: rad.datum!,
          tid_från: rad.tid_från!,
          tid_till: rad.tid_till!,
          typ: 'del_av_dag',
          ämne: rad.ämne,
          grupp: rad.grupp,
          sal: rad.sal,
          anteckning: null,
          status: 'obokat',
          skapad_av: null,
        });
        if (res.data) {
          await historikApi.skapa(res.data.id, 'pass_skapat');
        }
      }
    } else {
      // Förenklat pass från frånvarotider
      const res = await passApi.skapa({
        frånvaro_id: skapadFrånvaro.id,
        schemarad_id: null,
        personal_id: personalId,
        vikarie_id: null,
        datum: datumFrån,
        tid_från: helDag ? '08:00' : tidFrån,
        tid_till: helDag ? '17:00' : tidTill,
        typ: helDag ? 'hel_dag' : 'del_av_dag',
        ämne: null,
        grupp: null,
        sal: null,
        anteckning: null,
        status: 'obokat',
        skapad_av: null,
      });
      if (res.data) {
        await historikApi.skapa(res.data.id, 'pass_skapat');
      }
    }

    setSkaparPass(false);
    onRegistrerad();
    onStäng();
  }

  return (
    <Modal öppen={öppen} onStäng={onStäng} titel="Registrera frånvaro" bredd="lg">
      {steg === 'formulär' ? (
        <div className="space-y-4">
          {fel && <Alert typ="error">{fel}</Alert>}
          <Select label="Personal *" value={personalId} onChange={(e) => setPersonalId(e.target.value)}>
            <option value="">– Välj personal –</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>{p.namn} {p.arbetslag ? `(${p.arbetslag.namn})` : ''}</option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Från datum *" type="date" value={datumFrån} onChange={(e) => setDatumFrån(e.target.value)} />
            <Input label="Till datum *" type="date" value={datumTill} onChange={(e) => setDatumTill(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="hel-dag" checked={helDag} onChange={(e) => setHelDag(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600" />
            <label htmlFor="hel-dag" className="text-sm text-gray-700">Heldag</label>
          </div>
          {!helDag && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Från kl" type="time" value={tidFrån} onChange={(e) => setTidFrån(e.target.value)} />
              <Input label="Till kl" type="time" value={tidTill} onChange={(e) => setTidTill(e.target.value)} />
            </div>
          )}
          <Input label="Orsak" value={orsak} onChange={(e) => setOrsak(e.target.value)} placeholder="Sjukdom, VAB…" />
          <Textarea label="Anteckning" value={anteckning} onChange={(e) => setAnteckning(e.target.value)} rows={2} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onStäng}>Avbryt</Button>
            <Button loading={laddar} onClick={registreraFrånvaro}>Nästa: Skapa vikariepass</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert typ="success">Frånvaron är registrerad.</Alert>
          {schemarader.length > 0 ? (
            <>
              <p className="text-sm text-gray-700">
                {schemarader.length} schemarad(er) hittades. Välj vilka vikariepass som ska skapas.
              </p>
              <div className="space-y-1 max-h-64 overflow-y-auto rounded-lg border p-2">
                {schemarader.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 hover:bg-gray-50">
                    <input type="checkbox" checked={valda.has(r.id)}
                      onChange={(e) => {
                        const ny = new Set(valda);
                        e.target.checked ? ny.add(r.id) : ny.delete(r.id);
                        setValda(ny);
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">
                      <strong>{r.datum}</strong> {r.tid_från?.slice(0, 5)}–{r.tid_till?.slice(0, 5)}
                      {r.ämne && <> &middot; {r.ämne}</>}
                      {r.grupp && <> &middot; {r.grupp}</>}
                      {r.sal && <> &middot; sal {r.sal}</>}
                    </span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              Inga schemarader hittades. Ett förenklat vikariepass skapas baserat på frånvarotiden.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onStäng}>Stäng utan pass</Button>
            <Button loading={skaparPass} onClick={skapaVikariepass}>
              Skapa {valda.size > 0 ? `${valda.size} vikariepass` : 'vikariepass'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ============================================================
// Main page
// ============================================================
export default function Franvaro() {
  const [frånvaron, setFrånvaron] = useState<Frånvaro[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [modal, setModal] = useState<{ öppen: boolean; personalId?: string }>({ öppen: false });
  const [raderaId, setRaderaId] = useState<string | null>(null);
  const [sök, setSök] = useState('');

  useEffect(() => { ladda(); }, []);

  async function ladda() {
    const [fRes, pRes] = await Promise.all([
      frånvaroApi.lista(),
      personalApi.lista(),
    ]);
    setFrånvaron((fRes.data ?? []) as Frånvaro[]);
    setPersonal((pRes.data ?? []) as Personal[]);
    setLaddar(false);
  }

  const filtrerade = sök
    ? frånvaron.filter((f) => f.personal?.namn.toLowerCase().includes(sök.toLowerCase()))
    : frånvaron;

  if (laddar) return <LaddaSida />;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Frånvaro</h1>
        <Button onClick={() => setModal({ öppen: true })}>+ Registrera frånvaro</Button>
      </div>

      <input
        type="search"
        placeholder="Filtrera på namn…"
        value={sök}
        onChange={(e) => setSök(e.target.value)}
        className="mb-4 w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {filtrerade.length === 0 ? (
        <TomtTillstånd text="Ingen frånvaro registrerad." åtgärd={
          <Button size="sm" onClick={() => setModal({ öppen: true })}>Registrera frånvaro</Button>
        } />
) : (
        <>
        {/* Tabell på desktop */}
        <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500">
                <th className="px-4 py-2.5 text-left font-medium">Personal</th>
                <th className="px-4 py-2.5 text-left font-medium">Arbetslag</th>
                <th className="px-4 py-2.5 text-left font-medium">Från</th>
                <th className="px-4 py-2.5 text-left font-medium">Till</th>
                <th className="px-4 py-2.5 text-left font-medium">Typ</th>
                <th className="px-4 py-2.5 text-left font-medium">Orsak</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrerade.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{f.personal?.namn ?? '–'}</td>
                  <td className="px-4 py-3 text-gray-600">{f.personal?.arbetslag?.namn ?? '–'}</td>
                  <td className="px-4 py-3 text-gray-700">{f.datum_från}</td>
                  <td className="px-4 py-3 text-gray-700">{f.datum_till}</td>
                  <td className="px-4 py-3 text-gray-600">{f.hel_dag ? 'Heldag' : `${f.tid_från?.slice(0,5)}–${f.tid_till?.slice(0,5)}`}</td>
                  <td className="px-4 py-3 text-gray-600">{f.orsak ?? '–'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setRaderaId(f.id)}
                      className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">
                      Ta bort
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Kort på mobil */}
        <div className="md:hidden space-y-2">
          {filtrerade.map((f) => (
            <div key={f.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{f.personal?.namn ?? '–'}</p>
                  {f.personal?.arbetslag && (
                    <p className="text-xs text-gray-500">{f.personal.arbetslag.namn}</p>
                  )}
                </div>
                <button onClick={() => setRaderaId(f.id)}
                  className="shrink-0 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">
                  Ta bort
                </button>
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-gray-600">
                <p>{f.datum_från} – {f.datum_till}</p>
                <p>{f.hel_dag ? 'Heldag' : `${f.tid_från?.slice(0,5)}–${f.tid_till?.slice(0,5)}`}</p>
                {f.orsak && <p>Orsak: {f.orsak}</p>}
              </div>
            </div>
          ))}
</div>
        </>
      )}

      <FrånvaroModal
        öppen={modal.öppen}
        onStäng={() => setModal({ öppen: false })}
        personal={personal}
        valtPersonalId={modal.personalId}
        onRegistrerad={ladda}
      />

      <Confirm
        öppen={!!raderaId}
        titel="Ta bort frånvaro"
        text="Ta bort frånvaroregistreringen? Kopplade vikariepass påverkas inte."
        bekräftaText="Ta bort"
        farlig
        onBekräfta={async () => {
          if (!raderaId) return;
          await frånvaroApi.radera(raderaId);
          setFrånvaron((prev) => prev.filter((f) => f.id !== raderaId));
          setRaderaId(null);
        }}
        onAvbryt={() => setRaderaId(null)}
      />
    </div>
  );
}
