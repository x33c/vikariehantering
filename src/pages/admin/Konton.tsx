import { useEffect, useState } from 'react';
import { profilApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { Profil, UserRoll } from '../../types';
import { Alert, Button, LaddaSida, Select } from '../../components/ui';

export default function Konton() {
  const [profiler, setProfiler] = useState<Profil[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [spararId, setSpararId] = useState('');
  const [meddelande, setMeddelande] = useState('');
  const [fel, setFel] = useState('');
  const [adminRollVal, setAdminRollVal] = useState<{ profil: Profil; roll: UserRoll } | null>(null);
  const [adminLosenord, setAdminLosenord] = useState('');

  useEffect(() => { ladda(); }, []);

  async function ladda() {
    const pRes = await profilApi.lista();
    setProfiler(((pRes.data ?? []) as Profil[]).filter(p => p.roll === 'admin'));
    setLaddar(false);
  }

  async function uppdateraRoll(profil: Profil, roll: UserRoll, admin_losenord?: string) {
    if (roll === 'admin' && !admin_losenord) {
      setAdminRollVal({ profil, roll });
      setAdminLosenord('');
      return;
    }

    setSpararId(profil.id);
    setFel('');
    setMeddelande('');

    const { data: sessionData } = await supabase.auth.getSession();
    const res = await supabase.functions.invoke('hantera-anvandare', {
      body: {
        åtgärd: 'uppdatera_roll',
        profil_id: profil.id,
        roll,
        admin_losenord,
      },
      headers: sessionData.session?.access_token
        ? { Authorization: `Bearer ${sessionData.session.access_token}` }
        : undefined,
    });

    if (res.error || (res.data as any)?.error) {
      setFel((res.data as any)?.error ?? res.error?.message ?? 'Kunde inte ändra roll.');
    } else {
      setProfiler(prev => prev.map(p => p.id === profil.id ? { ...p, roll } : p).filter(p => p.roll === 'admin'));
      setMeddelande(`Rollen ändrades för ${profil.epost ?? profil.namn ?? 'kontot'}.`);
      setAdminRollVal(null);
      setAdminLosenord('');
    }

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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Admin-konton</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Hantera administratörskonton. Vikariekonton hanteras under Vikarier.
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
              <th className="px-4 py-3 text-right font-medium">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            {profiler.map(profil => (
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
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="secondary" onClick={() => skickaLosenordsreset(profil.epost)}>
                    Återställ lösenord
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adminRollVal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAdminRollVal(null)} />
          <div className="relative w-full rounded-t-2xl p-5 shadow-xl sm:max-w-md sm:rounded-xl" style={{ background: 'var(--bg-card)' }}>
            <h2 className="mb-2 text-base font-semibold" style={{ color: 'var(--text)' }}>Bekräfta adminroll</h2>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              Skriv ditt lösenord för att tilldela adminroll till {adminRollVal.profil.epost ?? adminRollVal.profil.namn}.
            </p>
            <input
              type="password"
              value={adminLosenord}
              onChange={e => setAdminLosenord(e.target.value)}
              className="mb-4 w-full rounded-md border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAdminRollVal(null)}>Avbryt</Button>
              <Button
                onClick={() => uppdateraRoll(adminRollVal.profil, adminRollVal.roll, adminLosenord)}
                disabled={!adminLosenord || spararId === adminRollVal.profil.id}
              >
                Tilldela adminroll
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
