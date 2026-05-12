import { useEffect, useMemo, useState } from 'react';
import { profilApi, vikariApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { Profil, Vikarie, UserRoll } from '../../types';
import { Alert, Button, LaddaSida, Select } from '../../components/ui';

export default function Konton() {
  const [profiler, setProfiler] = useState<Profil[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [spararId, setSpararId] = useState('');
  const [meddelande, setMeddelande] = useState('');
  const [fel, setFel] = useState('');

  useEffect(() => { ladda(); }, []);

  async function ladda() {
    const [pRes, vRes] = await Promise.all([profilApi.lista(), vikariApi.lista()]);
    setProfiler((pRes.data ?? []) as Profil[]);
    setVikarier((vRes.data ?? []) as Vikarie[]);
    setLaddar(false);
  }

  const vikariePerProfil = useMemo(() => {
    const map = new Map<string, Vikarie>();
    for (const v of vikarier) {
      if (v.profil_id) map.set(v.profil_id, v);
    }
    return map;
  }, [vikarier]);

  async function uppdateraRoll(profil: Profil, roll: UserRoll) {
    setSpararId(profil.id);
    setFel('');
    const res = await profilApi.uppdatera(profil.id, { roll });
    if (res.error) setFel(res.error.message);
    else setProfiler(prev => prev.map(p => p.id === profil.id ? { ...p, roll } : p));
    setSpararId('');
  }

  async function kopplaVikarie(profil: Profil, vikarieId: string) {
    setSpararId(profil.id);
    setFel('');

    const tidigare = vikarier.find(v => v.profil_id === profil.id);
    if (tidigare && tidigare.id !== vikarieId) {
      await vikariApi.kopplaProfil(tidigare.id, null);
    }

    if (vikarieId) {
      const res = await vikariApi.kopplaProfil(vikarieId, profil.id);
      if (res.error) {
        setFel(res.error.message);
        setSpararId('');
        return;
      }
    }

    await ladda();
    setSpararId('');
  }

  async function skickaLosenordsreset(epost: string | null) {
    if (!epost) {
      setFel('Kontot saknar e-post.');
      return;
    }

    setFel('');
    setMeddelande('');

    const { error } = await supabase.auth.resetPasswordForEmail(epost, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) setFel(error.message);
    else setMeddelande(`Lösenordsåterställning skickad till ${epost}.`);
  }

  if (laddar) return <LaddaSida />;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Admin</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Konton</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Hantera roller, koppla vikarieprofil och skicka lösenordsåterställning.
        </p>
      </div>

      {fel && <Alert typ="error" className="mb-4">{fel}</Alert>}
      {meddelande && <Alert typ="success" className="mb-4">{meddelande}</Alert>}

      <div className="overflow-hidden rounded-lg border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs" style={{ background: 'var(--hover)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <th className="px-4 py-3 text-left font-medium">Konto</th>
              <th className="px-4 py-3 text-left font-medium">Roll</th>
              <th className="px-4 py-3 text-left font-medium">Vikarieprofil</th>
              <th className="px-4 py-3 text-right font-medium">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            {profiler.map(profil => {
              const kopplad = vikariePerProfil.get(profil.id);

              return (
                <tr key={profil.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-3">
                    <p className="font-medium" style={{ color: 'var(--text)' }}>{profil.namn ?? 'Namnlöst konto'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{profil.epost ?? '-'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={profil.roll}
                      onChange={e => uppdateraRoll(profil, e.target.value as UserRoll)}
                      disabled={spararId === profil.id}
                    >
                      <option value="admin">Admin</option>
                      <option value="vikarie">Vikarie</option>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={kopplad?.id ?? ''}
                      onChange={e => kopplaVikarie(profil, e.target.value)}
                      disabled={spararId === profil.id || profil.roll !== 'vikarie'}
                    >
                      <option value="">Ingen koppling</option>
                      {vikarier.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.namn}{v.epost ? ` (${v.epost})` : ''}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => skickaLosenordsreset(profil.epost)}
                    >
                      Återställ lösenord
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
