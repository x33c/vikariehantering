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


export default PassDetaljer;
