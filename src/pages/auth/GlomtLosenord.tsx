import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button, Input, Alert } from '../../components/ui';

export default function GlomtLosenord() {
  const [epost, setEpost] = useState('');
  const [sparar, setSparar] = useState(false);
  const [skickat, setSkickat] = useState(false);
  const [fel, setFel] = useState('');

  async function skicka(e: React.FormEvent) {
    e.preventDefault();
    if (sparar || skickat) return;
    setSparar(true);
    setFel('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(epost.trim(), {
        redirectTo: `${window.location.origin}/nytt-losenord`,
      });
      if (error) {
        setFel(error.status === 429 ? 'För många försök. Vänta en stund innan du försöker igen.' : 'Återställningen kunde inte skickas. Försök senare eller kontakta administratören.');
      } else {
        setSkickat(true);
      }
    } catch {
      setFel('Kunde inte nå återställningstjänsten. Kontrollera anslutningen.');
    } finally {
      setSparar(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm rounded-lg border p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h1 className="mb-5 text-xl font-semibold">Återställ lösenord</h1>
        {fel && <Alert typ="error" className="mb-4">{fel}</Alert>}
        {skickat ? <p role="status" className="mb-4 text-sm">Om adressen tillhör ett konto får du ett mejl med en återställningslänk. Kontrollera även skräpposten.</p> : (
          <form onSubmit={skicka} className="space-y-4">
            <Input label="E-postadress" type="email" autoComplete="email" value={epost} onChange={e => setEpost(e.target.value)} required />
            <Button type="submit" className="w-full" loading={sparar}>Skicka återställningslänk</Button>
          </form>
        )}
        <Link className="mt-5 block text-sm underline" to="/login">Tillbaka till inloggning</Link>
      </div>
    </div>
  );
}
