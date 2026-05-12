import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button, Input, Alert } from '../../components/ui';

export default function BytLosenord() {
  const [losenord, setLosenord] = useState('');
  const [bekrafta, setBekrafta] = useState('');
  const [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState('');

  async function spara() {
    setFel('');
    if (losenord.length < 8) {
      setFel('Lösenordet måste vara minst 8 tecken.');
      return;
    }
    if (losenord !== bekrafta) {
      setFel('Lösenorden matchar inte.');
      return;
    }

    setLaddar(true);
    const { error } = await supabase.auth.updateUser({ password: losenord });
    if (error) {
      setFel(error.message);
      setLaddar(false);
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase.from('profiler').update({ maste_byta_losenord: false }).eq('id', data.user.id);
    }

    window.location.href = '/';
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm rounded-xl border p-6 shadow-sm" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h1 className="mb-1 text-xl font-semibold" style={{ color: 'var(--text)' }}>Byt lösenord</h1>
        <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
          Du behöver välja ett eget lösenord innan du fortsätter.
        </p>

        {fel && <Alert typ="error" className="mb-4">{fel}</Alert>}

        <div className="space-y-3">
          <Input label="Nytt lösenord" type="password" value={losenord} onChange={e => setLosenord(e.target.value)} />
          <Input label="Bekräfta lösenord" type="password" value={bekrafta} onChange={e => setBekrafta(e.target.value)} />
          <Button className="w-full" loading={laddar} onClick={spara}>Spara lösenord</Button>
        </div>
      </div>
    </div>
  );
}
