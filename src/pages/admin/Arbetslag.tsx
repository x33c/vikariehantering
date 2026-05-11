import { useEffect, useState } from 'react';
import { arbetslagApi, personalApi } from '../../lib/api';
import type { Arbetslag, Personal, NyArbetslag, NyPersonal } from '../../types';
import {
  Button, Input, Select, Modal, Confirm, TomtTillstånd, LaddaSida, Alert
} from '../../components/ui';

// ============================================================
// Personal form modal
// ============================================================
function PersonalModal({
  öppen, onStäng, personal, arbetslag, onSparad,
}: {
  öppen: boolean;
  onStäng: () => void;
  personal?: Personal;
  arbetslag: Arbetslag[];
  onSparad: (p: Personal) => void;
}) {
  const [form, setForm] = useState<NyPersonal>({
    namn: personal?.namn ?? '',
    epost: personal?.epost ?? '',
    telefon: personal?.telefon ?? '',
    signatur: personal?.signatur ?? '',
    skola24_id: personal?.skola24_id ?? '',
    titel: personal?.titel ?? '',
    arbetslag_id: personal?.arbetslag_id ?? null,
    aktiv: personal?.aktiv ?? true,
  });
  const [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState('');

  useEffect(() => {
    if (öppen) {
      setForm({
        namn: personal?.namn ?? '',
        epost: personal?.epost ?? '',
        telefon: personal?.telefon ?? '',
        signatur: personal?.signatur ?? '',
        skola24_id: personal?.skola24_id ?? '',
        titel: personal?.titel ?? '',
        arbetslag_id: personal?.arbetslag_id ?? null,
        aktiv: personal?.aktiv ?? true,
      });
      setFel('');
    }
  }, [öppen, personal]);

  async function spara() {
    if (!form.namn.trim()) { setFel('Namn krävs.'); return; }
    setLaddar(true);
    setFel('');
    let res;
    if (personal) {
      res = await personalApi.uppdatera(personal.id, form);
    } else {
      res = await personalApi.skapa(form);
    }
    setLaddar(false);
    if (res.error) { setFel(res.error.message); return; }
    onSparad(res.data as Personal);
    onStäng();
  }

  return (
    <Modal öppen={öppen} onStäng={onStäng} titel={personal ? 'Redigera personal' : 'Lägg till personal'}>
      <div className="space-y-4">
        {fel && <Alert typ="error">{fel}</Alert>}
        <Input label="Namn *" value={form.namn} onChange={(e) => setForm({ ...form, namn: e.target.value })} />
        <Input label="E-post" type="email" value={form.epost ?? ''} onChange={(e) => setForm({ ...form, epost: e.target.value })} />
        <Input label="Telefon" value={form.telefon ?? ''} onChange={(e) => setForm({ ...form, telefon: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Signatur" value={form.signatur ?? ''} onChange={(e) => setForm({ ...form, signatur: e.target.value })} />
          <Input label="Skola24-ID" value={form.skola24_id ?? ''} onChange={(e) => setForm({ ...form, skola24_id: e.target.value })} />
        </div>
        <Input label="Titel/roll" value={form.titel ?? ''} onChange={(e) => setForm({ ...form, titel: e.target.value })} />
        <Select
          label="Arbetslag"
          value={form.arbetslag_id ?? ''}
          onChange={(e) => setForm({ ...form, arbetslag_id: e.target.value || null })}
        >
          <option value="">– Inget arbetslag –</option>
          {arbetslag.map((a) => (
            <option key={a.id} value={a.id}>{a.namn}</option>
          ))}
        </Select>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onStäng}>Avbryt</Button>
          <Button loading={laddar} onClick={spara}>Spara</Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// Arbetslag form modal
// ============================================================
function ArbetslagModal({
  öppen, onStäng, arbetslag, onSparad,
}: {
  öppen: boolean;
  onStäng: () => void;
  arbetslag?: Arbetslag;
  onSparad: (a: Arbetslag) => void;
}) {
  const [form, setForm] = useState<NyArbetslag>({
    namn: arbetslag?.namn ?? '',
    beskrivning: arbetslag?.beskrivning ?? '',
    färg: arbetslag?.färg ?? '#3B82F6',
    aktiv: true,
  });
  const [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState('');

  useEffect(() => {
    if (öppen) {
      setForm({ namn: arbetslag?.namn ?? '', beskrivning: arbetslag?.beskrivning ?? '', färg: arbetslag?.färg ?? '#3B82F6', aktiv: true });
      setFel('');
    }
  }, [öppen, arbetslag]);

  async function spara() {
    if (!form.namn.trim()) { setFel('Namn krävs.'); return; }
    setLaddar(true);
    const res = arbetslag
      ? await arbetslagApi.uppdatera(arbetslag.id, form)
      : await arbetslagApi.skapa(form);
    setLaddar(false);
    if (res.error) { setFel(res.error.message); return; }
    onSparad(res.data as Arbetslag);
    onStäng();
  }

  return (
    <Modal öppen={öppen} onStäng={onStäng} titel={arbetslag ? 'Redigera arbetslag' : 'Nytt arbetslag'} bredd="sm">
      <div className="space-y-4">
        {fel && <Alert typ="error">{fel}</Alert>}
        <Input label="Namn *" value={form.namn} onChange={(e) => setForm({ ...form, namn: e.target.value })} />
        <Input label="Beskrivning" value={form.beskrivning ?? ''} onChange={(e) => setForm({ ...form, beskrivning: e.target.value })} />
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Färg</label>
          <input type="color" value={form.färg ?? '#3B82F6'} onChange={(e) => setForm({ ...form, färg: e.target.value })}
            className="h-8 w-14 cursor-pointer rounded border border-gray-300" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onStäng}>Avbryt</Button>
          <Button loading={laddar} onClick={spara}>Spara</Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// Main page
// ============================================================
export default function Arbetslag() {
  const [arbetslag, setArbetstag] = useState<Arbetslag[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [sök, setSök] = useState('');

  const [arbetslagModal, setArbetslagModal] = useState<{ öppen: boolean; rad?: Arbetslag }>({ öppen: false });
  const [personalModal, setPersonalModal] = useState<{ öppen: boolean; rad?: Personal }>({ öppen: false });
  const [raderaPersonal, setRaderaPersonal] = useState<Personal | null>(null);
  const [raderaMarkerade, setRaderaMarkerade] = useState(false);
  const [markeradePersonalIds, setMarkeradePersonalIds] = useState<Set<string>>(new Set());
  const [raderaArbetstag, setRaderaArbetstag] = useState<Arbetslag | null>(null);

  useEffect(() => {
    async function ladda() {
      const [aRes, pRes] = await Promise.all([
        arbetslagApi.lista(),
        personalApi.lista(),
      ]);
      setArbetstag((aRes.data ?? []) as Arbetslag[]);
      setPersonal((pRes.data ?? []) as Personal[]);
      setLaddar(false);
    }
    ladda();
  }, []);

  function personalFörArbetstag(arbetslagId: string) {
    return personal.filter((p) => p.arbetslag_id === arbetslagId);
  }

  function växlaMarkeradPersonal(personalId: string, markerad: boolean) {
    setMarkeradePersonalIds((prev) => {
      const ny = new Set(prev);
      markerad ? ny.add(personalId) : ny.delete(personalId);
      return ny;
    });
  }

  const ingenArbetstag = personal.filter((p) => !p.arbetslag_id);

  const filtreradPersonal = sök
    ? personal.filter((p) =>
        p.namn.toLowerCase().includes(sök.toLowerCase()) ||
        p.signatur?.toLowerCase().includes(sök.toLowerCase())
      )
    : null;

  if (laddar) return <LaddaSida />;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Arbetslag & personal</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setArbetslagModal({ öppen: true })}>
            + Nytt arbetslag
          </Button>
          <Button onClick={() => setPersonalModal({ öppen: true })}>
            + Lägg till personal
          </Button>
        </div>
      </div>

      <input
        type="search"
        placeholder="Sök personal…"
        value={sök}
        onChange={(e) => setSök(e.target.value)}
        className="mb-5 w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {markeradePersonalIds.size > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <span className="text-sm" style={{ color: 'var(--text)' }}>{markeradePersonalIds.size} markerade</span>
          <Button size="sm" variant="danger" onClick={() => setRaderaMarkerade(true)}>Ta bort markerade</Button>
          <Button size="sm" variant="secondary" onClick={() => setMarkeradePersonalIds(new Set())}>Avmarkera</Button>
        </div>
      )}

      {filtreradPersonal ? (
        <div className="space-y-1">
          {filtreradPersonal.length === 0 ? (
            <TomtTillstånd text="Ingen personal matchade sökningen." />
          ) : filtreradPersonal.map((p) => (
            <PersonalRad key={p.id} personal={p} onRedigera={() => setPersonalModal({ öppen: true, rad: p })}
              markerad={markeradePersonalIds.has(p.id)} onMarkera={(markerad) => växlaMarkeradPersonal(p.id, markerad)} onRadera={() => setRaderaPersonal(p)} />
          ))}
        </div>
      ) : (
        <>
          {/* Grupperade per arbetslag */}
          {arbetslag.map((al) => (
            <div key={al.id} className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: al.färg }} />
                  <h2 className="text-sm font-semibold text-gray-800">{al.namn}</h2>
                  <span className="text-xs text-gray-400">
                    ({personalFörArbetstag(al.id).length} pers.)
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setArbetslagModal({ öppen: true, rad: al })}>
                    Redigera
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRaderaArbetstag(al)}>
                    Ta bort
                  </Button>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                {personalFörArbetstag(al.id).length === 0 ? (
                  <p className="px-4 py-4 text-sm text-gray-400">Inga medarbetare.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-gray-50 text-xs text-gray-500">
                      <th className="w-10 px-4 py-2.5" />
                      <th className="px-4 py-2.5 text-left font-medium">Namn</th>
                      <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Titel</th>
                      <th className="px-4 py-2.5 text-left font-medium hidden md:table-cell">Signatur</th>
                      <th className="px-4 py-2.5 text-left font-medium hidden lg:table-cell">E-post</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {personalFörArbetstag(al.id).map((p) => (
                        <PersonalRad key={p.id} personal={p}
                          onRedigera={() => setPersonalModal({ öppen: true, rad: p })}
                          markerad={markeradePersonalIds.has(p.id)} onMarkera={(markerad) => växlaMarkeradPersonal(p.id, markerad)} onRadera={() => setRaderaPersonal(p)} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ))}

          {/* Personal utan arbetslag */}
          {ingenArbetstag.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-gray-500">Utan arbetslag</h2>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {ingenArbetstag.map((p) => (
                      <PersonalRad key={p.id} personal={p}
                        onRedigera={() => setPersonalModal({ öppen: true, rad: p })}
                        markerad={markeradePersonalIds.has(p.id)} onMarkera={(markerad) => växlaMarkeradPersonal(p.id, markerad)} onRadera={() => setRaderaPersonal(p)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {arbetslag.length === 0 && personal.length === 0 && (
            <TomtTillstånd text="Inga arbetslag eller personal registrerade ännu." />
          )}
        </>
      )}

      {/* Modaler */}
      <ArbetslagModal
        öppen={arbetslagModal.öppen}
        onStäng={() => setArbetslagModal({ öppen: false })}
        arbetslag={arbetslagModal.rad}
        onSparad={(a) => {
          setArbetstag((prev) =>
            arbetslagModal.rad ? prev.map((x) => (x.id === a.id ? a : x)) : [...prev, a]
          );
        }}
      />

      <PersonalModal
        öppen={personalModal.öppen}
        onStäng={() => setPersonalModal({ öppen: false })}
        personal={personalModal.rad}
        arbetslag={arbetslag}
        onSparad={(p) => {
          setPersonal((prev) =>
            personalModal.rad ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p]
          );
        }}
      />

      <Confirm
        öppen={!!raderaPersonal}
        titel="Ta bort personal"
        text={`Ta bort ${raderaPersonal?.namn}? Registrerade frånvaron och pass påverkas inte.`}
        bekräftaText="Ta bort"
        farlig
        onBekräfta={async () => {
          if (!raderaPersonal) return;
          await personalApi.radera(raderaPersonal.id);
          setPersonal((prev) => prev.filter((p) => p.id !== raderaPersonal.id));
          setRaderaPersonal(null);
        }}
        onAvbryt={() => setRaderaPersonal(null)}
      />

      <Confirm
        öppen={raderaMarkerade}
        titel="Ta bort markerade personal"
        text={`Ta bort ${markeradePersonalIds.size} markerade personer? Registrerade frånvaron och pass påverkas inte.`}
        bekräftaText="Ta bort markerade"
        farlig
        onBekräfta={async () => {
          const ids = [...markeradePersonalIds];
          if (ids.length === 0) return;
          await personalApi.raderaMånga(ids);
          setPersonal((prev) => prev.filter((p) => !markeradePersonalIds.has(p.id)));
          setMarkeradePersonalIds(new Set());
          setRaderaMarkerade(false);
        }}
        onAvbryt={() => setRaderaMarkerade(false)}
      />

      <Confirm
        öppen={!!raderaArbetstag}
        titel="Ta bort arbetslag"
        text={`Ta bort ${raderaArbetstag?.namn}? Personal kopplas loss från arbetslaget men tas inte bort.`}
        bekräftaText="Ta bort"
        farlig
        onBekräfta={async () => {
          if (!raderaArbetstag) return;
          await arbetslagApi.radera(raderaArbetstag.id);
          setArbetstag((prev) => prev.filter((a) => a.id !== raderaArbetstag.id));
          setRaderaArbetstag(null);
        }}
        onAvbryt={() => setRaderaArbetstag(null)}
      />
    </div>
  );
}

function PersonalRad({
  personal,
  markerad,
  onMarkera,
  onRedigera,
  onRadera,
}: {
  personal: Personal;
  markerad: boolean;
  onMarkera: (markerad: boolean) => void;
  onRedigera: () => void;
  onRadera: () => void;
}) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="w-10 px-4 py-3">
        <input
          type="checkbox"
          checked={markerad}
          onChange={(e) => onMarkera(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
      </td>
      <td className="px-4 py-3 font-medium text-gray-900">{personal.namn}</td>
      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{personal.titel ?? '–'}</td>
      <td className="px-4 py-3 font-mono text-xs text-gray-500 hidden md:table-cell">{personal.signatur ?? '–'}</td>
      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{personal.epost ?? '–'}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-1">
          <button onClick={onRedigera} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">Redigera</button>
          <button onClick={onRadera} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">Ta bort</button>
        </div>
      </td>
    </tr>
  );
}