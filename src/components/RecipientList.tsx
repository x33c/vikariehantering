import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseRecipients } from '../lib/recipients';
import { Button } from './ui';

const key = { datum: '1970-01-01', typ: 'mottagare' };

export function RecipientList() {
  const [saved, setSaved] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const parsed = parseRecipients(draft);
  const stored = parseRecipients(saved).addresses;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await supabase.from('utskick_celler').select('text').match(key).maybeSingle();
      if (result.error) throw result.error;
      const text = result.data?.text ?? '';
      setSaved(text);
      setDraft(text);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      setError('Mottagarlistan kunde inte hämtas. Försök igen.');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    if (parsed.invalid.length || saving || loadFailed) return;
    if (!parsed.addresses.length && saved && !window.confirm('Töm mottagarlistan All personal?')) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const text = parsed.addresses.join('\n');
      const result = await supabase.from('utskick_celler').upsert({ ...key, text }, { onConflict: 'datum,typ' }).select('text').single();
      if (result.error || !result.data) throw result.error ?? new Error('Ingen sparad lista');
      setSaved(result.data.text);
      setDraft(result.data.text);
      setEditing(false);
      setStatus('Mottagarlistan är sparad.');
    } catch { setError('Listan kunde inte sparas. Dina ändringar finns kvar.'); }
    finally { setSaving(false); }
  }

  async function copy() {
    setError('');
    setStatus('');
    try {
      await navigator.clipboard.writeText(stored.join('; '));
      setStatus(`${stored.length} mottagare kopierade.`);
      setManualCopy(false);
    } catch {
      setManualCopy(true);
      setError('Automatisk kopiering misslyckades. Markera och kopiera adresserna nedan.');
    }
  }

  return <section className="mb-3 min-w-0 border-y py-2" aria-label="Mottagarlista" style={{ borderColor: 'var(--border)' }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-sm"><strong>All personal</strong><span className="ml-2" style={{ color: 'var(--text-muted)' }}>{loading ? 'Laddar…' : loadFailed ? 'Ej tillgänglig' : `${stored.length} mottagare`}</span></div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={loading || loadFailed || editing || !stored.length} onClick={copy}>Kopiera mottagare</Button>
        {!editing && <Button size="sm" variant="secondary" disabled={loading || loadFailed} onClick={() => { setEditing(true); setStatus(''); setManualCopy(false); }}>Redigera lista</Button>}
        {loadFailed && <Button size="sm" onClick={load} disabled={loading}>Försök igen</Button>}
      </div>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    {status && <p role="status" className="mt-2 text-sm">{status}</p>}
    {editing && <div className="mt-3 space-y-2">
      <label htmlFor="recipient-addresses" className="block text-sm font-medium">E-postadresser</label>
      <textarea id="recipient-addresses" value={draft} disabled={saving} onChange={event => { setDraft(event.target.value); setStatus(''); }} rows={6}
        spellCheck={false} autoCapitalize="none" placeholder="namn@skola.se; kollega@skola.se"
        className="w-full min-w-0 rounded-md border p-2 text-base" style={{ background: 'var(--bg)', color: 'var(--text)', borderColor: 'var(--border)' }}/>
      <p className="text-sm">{parsed.addresses.length} unika mottagare{parsed.duplicates > 0 ? ` · ${parsed.duplicates} dubbletter tas bort` : ''}</p>
      {parsed.invalid.length > 0 && <p role="alert" className="break-words text-sm text-red-600">Kontrollera adresserna: {parsed.invalid.join('; ')}</p>}
      <div className="flex gap-2">
        <Button size="sm" loading={saving} disabled={!!parsed.invalid.length || draft === saved} onClick={save}>Spara lista</Button>
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => { setDraft(saved); setEditing(false); setError(''); }}>Avbryt</Button>
      </div>
    </div>}
    {manualCopy && <textarea aria-label="Mottagare för manuell kopiering" readOnly value={stored.join('; ')} onFocus={event => event.target.select()} rows={4} className="mt-2 w-full rounded-md border p-2 text-base" style={{ background: 'var(--bg)', color: 'var(--text)' }}/>}
  </section>;
}
