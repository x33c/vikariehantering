import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { HändelsTyp } from '../../types';
import { HÄNDELSE_LABELS } from '../../types';
import { LaddaSida, TomtTillstånd } from '../../components/ui';

interface HistorikRad {
  id: string;
  pass_id: string;
  händelse: HändelsTyp;
  anteckning: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  utförd_av_profil?: { namn: string; epost: string } | null;
  vikariepass?: {
    datum: string;
    tid_från: string;
    tid_till: string;
    personal?: { namn: string } | null;
    vikarie?: { namn: string } | null;
  } | null;
}

function MetadataDetalj({ händelse, metadata, vikariepass }: {
  händelse: HändelsTyp;
  metadata: Record<string, unknown> | null;
  vikariepass: HistorikRad['vikariepass'];
}) {
  const delar: string[] = [];

  if (vikariepass) {
    delar.push(`${vikariepass.datum} ${vikariepass.tid_från?.slice(0,5)}–${vikariepass.tid_till?.slice(0,5)}`);
    if (vikariepass.personal?.namn) delar.push(vikariepass.personal.namn);
  }

  if (metadata) {
    if (metadata.ny_status) delar.push(`→ ${metadata.ny_status}`);
    if (metadata.antal) delar.push(`${metadata.antal} notifierade`);
    if (vikariepass?.vikarie?.namn && händelse === 'vikarie_bokat') {
      delar.push(vikariepass.vikarie.namn);
    }
  }

  if (delar.length === 0) return <span style={{ color: 'var(--text-subtle)' }}>–</span>;

  return (
    <span style={{ color: 'var(--text-muted)' }}>
      {delar.join(' · ')}
    </span>
  );
}

const HÄNDELSE_FÄRG: Partial<Record<HändelsTyp, string>> = {
  pass_skapat: '#3b82f6',
  vikarie_bokat: '#16a34a',
  bokning_bekräftad: '#15803d',
  pass_avbokat: '#dc2626',
  vikarie_borttagen: '#f97316',
  vikarie_notifierat: '#7c3aed',
  pass_uppdaterat: '#6b7280',
};

export default function Historik() {
  const [rader, setRader] = useState<HistorikRad[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [händelseFilter, setHändelseFilter] = useState<HändelsTyp | ''>('');
  const [datumFrån, setDatumFrån] = useState('');
  const [datumTill, setDatumTill] = useState('');
  const [sök, setSök] = useState('');

  useEffect(() => {
    async function ladda() {
      setLaddar(true);
      let q = supabase
        .from('passhistorik')
        .select(`
          *,
          utförd_av_profil:profiler(namn, epost),
          vikariepass(
            datum, tid_från, tid_till,
            personal(namn),
            vikarie:vikarier!vikariepass_vikarie_id_fkey(namn)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (händelseFilter) q = q.eq('händelse', händelseFilter);
      if (datumFrån) q = q.gte('created_at', datumFrån);
      if (datumTill) q = q.lte('created_at', datumTill + 'T23:59:59');

      const { data } = await q;
      setRader((data ?? []) as HistorikRad[]);
      setLaddar(false);
    }
    ladda();
  }, [händelseFilter, datumFrån, datumTill]);

  const filtrerade = sök
    ? rader.filter(r =>
        r.vikariepass?.personal?.namn?.toLowerCase().includes(sök.toLowerCase()) ||
        r.utförd_av_profil?.namn?.toLowerCase().includes(sök.toLowerCase()) ||
        HÄNDELSE_LABELS[r.händelse]?.toLowerCase().includes(sök.toLowerCase())
      )
    : rader;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Historik</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{filtrerade.length} händelser</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={händelseFilter}
          onChange={e => setHändelseFilter(e.target.value as HändelsTyp | '')}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
        >
          <option value="">Alla händelser</option>
          {(Object.keys(HÄNDELSE_LABELS) as HändelsTyp[]).map(h => (
            <option key={h} value={h}>{HÄNDELSE_LABELS[h]}</option>
          ))}
        </select>
        <input type="date" value={datumFrån} onChange={e => setDatumFrån(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
        />
        <input type="date" value={datumTill} onChange={e => setDatumTill(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
        />
        <input type="search" placeholder="Sök…" value={sök} onChange={e => setSök(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
        />
      </div>

      {laddar ? <LaddaSida /> : filtrerade.length === 0 ? (
        <TomtTillstånd text="Ingen historik att visa." />
      ) : (
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text-muted)' }}>
                  <th className="px-4 py-2.5 text-left font-medium">Tidpunkt</th>
                  <th className="px-4 py-2.5 text-left font-medium">Händelse</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Detaljer</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden md:table-cell">Utförd av</th>
                </tr>
              </thead>
              <tbody>
                {filtrerade.map(r => (
                  <tr key={r.id} className="border-b" style={{ borderColor: 'var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(r.created_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: HÄNDELSE_FÄRG[r.händelse] ?? 'var(--text-subtle)' }} />
                        <span className="font-medium" style={{ color: 'var(--text)' }}>
                          {HÄNDELSE_LABELS[r.händelse]}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs hidden sm:table-cell">
                      <MetadataDetalj
                        händelse={r.händelse}
                        metadata={r.metadata}
                        vikariepass={r.vikariepass}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>
                      {r.utförd_av_profil?.namn ?? r.utförd_av_profil?.epost ?? 'System'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
