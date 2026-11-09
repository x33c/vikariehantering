import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { Button, Input, Select, Textarea } from '../components/ui';

const statuses: Record<string, string> = { nytt: 'Nytt', arbete: 'Under arbete', information: 'Behöver mer information', lost: 'Löst' };
const categories: Record<string, string> = { problem: 'Problem', forslag: 'Förbättringsförslag', ovrigt: 'Övrigt' };
const pages: Record<string, string> = { pass: 'Pass', 'mina-pass': 'Mina pass', tid: 'Tillgänglighet', schema: 'Schema', notiser: 'Notiser', profil: 'Profil', annat: 'Annat' };
type Ticket = { id: string; author_name: string; category: string; title: string; description: string; status: string; page: string; app_version: string | null; browser: string | null; created_at: string; updated_at: string };
type Message = { id: string; body: string; author_role: string; created_at: string };
const date = (value: string) => new Date(value).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

export default function Feedback() {
  const { profil } = useAuth();
  const admin = profil?.roll === 'admin';
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [messageLimit, setMessageLimit] = useState(50);
  const [moreMessages, setMoreMessages] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('problem');
  const [affectedPage, setAffectedPage] = useState('pass');
  const [technical, setTechnical] = useState(false);
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('nytt');
  const submitId = useRef(crypto.randomUUID());
  const messageId = useRef(crypto.randomUUID());
  const submitPayload = useRef('');
  const replyPayload = useRef('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    async function load() {
      try {
        let query = supabase.from('feedback').select('*').order('updated_at', { ascending: false }).order('id').range(page * 25, page * 25 + 25);
        if (filter) query = query.eq('status', filter);
        const result = await query;
        if (!active) return;
        if (result.error) throw result.error;
        setHasMore((result.data?.length ?? 0) > 25);
        setTickets((result.data ?? []).slice(0, 25) as Ticket[]);
      } catch { if (active) setError('Kunde inte hämta feedback. Försök uppdatera listan.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [page, filter, refresh]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoadingThread(true);
    async function load() {
      try {
        const result = await supabase.from('feedback_messages').select('*').eq('feedback_id', selected!.id).order('created_at', { ascending: false }).order('id').limit(messageLimit + 1);
        if (!active) return;
        if (result.error) throw result.error;
        setMoreMessages((result.data?.length ?? 0) > messageLimit);
        setMessages((result.data ?? []).slice(0, messageLimit).reverse() as Message[]);
      } catch { if (active) setError('Kunde inte hämta svaren. Försök igen.'); }
      finally { if (active) setLoadingThread(false); }
    }
    void load();
    return () => { active = false; };
  }, [selected?.id, messageLimit, refresh]);

  function open(ticket: Ticket) {
    if (busy) return;
    setSelected(ticket); setStatus(ticket.status); setBody(''); setMessages([]); setMessageLimit(50);
    setCreating(false); setError(''); setNotice(''); messageId.current = crypto.randomUUID();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = {
        p_category: category, p_title: title.trim(), p_description: description.trim(), p_page: affectedPage,
        p_version: technical ? (import.meta.env.VITE_APP_VERSION || 'local') : null,
        p_browser: technical ? navigator.userAgent.slice(0, 500) : null,
      };
      const signature = JSON.stringify(payload);
      if (submitPayload.current && submitPayload.current !== signature) submitId.current = crypto.randomUUID();
      submitPayload.current = signature;
      const result = await supabase.rpc('submit_feedback', { p_id: submitId.current, ...payload });
      if (result.error) throw result.error;
      setTitle(''); setDescription(''); setCreating(false); setPage(0); setFilter(''); setRefresh(v => v + 1);
      submitId.current = crypto.randomUUID(); setNotice('Tack! Ditt ärende är inskickat.');
    } catch { setError('Kunde inte bekräfta att ärendet skickats. Texten finns kvar. Försök igen; samma inskick skapar ingen dubblett.'); }
    finally { setBusy(false); }
  }

  async function reply(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const text = body.trim() || (admin && status !== selected.status ? `Status ändrad till ${statuses[status]}.` : '');
      if (!text) { setError('Skriv ett svar eller ändra status.'); return; }
      const payload = { p_id: selected.id, p_body: text, p_status: admin && status !== selected.status ? status : null };
      const signature = JSON.stringify(payload);
      if (replyPayload.current && replyPayload.current !== signature) messageId.current = crypto.randomUUID();
      replyPayload.current = signature;
      const result = await supabase.rpc('reply_feedback', { p_message_id: messageId.current, ...payload });
      if (result.error) throw result.error;
      setSelected({ ...selected, status: admin ? status : selected.status }); setBody('');
      messageId.current = crypto.randomUUID(); setRefresh(v => v + 1); setNotice('Ärendet är uppdaterat.');
    } catch { setError('Kunde inte bekräfta svaret. Texten finns kvar. Försök igen.'); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto w-full max-w-5xl space-y-5 p-3 sm:p-6" style={{ color: 'var(--text)' }}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{admin ? 'Feedback' : 'Min feedback'}</h1>
      {!admin && <Link to="/vikarie/profil" className="text-sm underline">Till profil</Link>}
      {!admin && <Button disabled={busy} onClick={() => { setCreating(true); setSelected(null); setError(''); setNotice(''); }}>Rapportera problem / lämna förslag</Button>}
    </header>
    {error && <p role="alert" className="rounded-md border border-red-500 p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="text-sm" style={{ color: 'var(--blue)' }}>{notice}</p>}
    {creating && <form onSubmit={submit} className="border-y py-4" style={{ borderColor: 'var(--border)' }}><fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Typ av ärende" value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
        <Select label="Vilken sida gäller det?" value={affectedPage} onChange={e => setAffectedPage(e.target.value)}>{Object.entries(pages).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
      </div>
      <Input label="Rubrik" required minLength={3} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} />
      <Textarea label="Beskriv problemet eller förslaget" required minLength={10} maxLength={5000} rows={5} value={description} onChange={e => setDescription(e.target.value)} placeholder="Vad hände och vad förväntade du dig?" />
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ange inte lösenord, elevuppgifter eller känsliga personuppgifter.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={technical} onChange={e => setTechnical(e.target.checked)} className="mt-1" />Bifoga appversion och webbläsarinformation</label>
      <div className="flex gap-2"><Button type="submit" loading={busy}>Skicka feedback</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setCreating(false)}>Avbryt</Button></div>
    </fieldset></form>}
    {selected ? <section className="space-y-4">
      <Button variant="secondary" disabled={busy} onClick={() => { setSelected(null); setNotice(''); }}>Till ärendelistan</Button>
      <div className="border-b pb-4" style={{ borderColor: 'var(--border)' }}>
        <h2 className="break-words text-lg font-semibold">{selected.title}</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{statuses[selected.status]} · {categories[selected.category]} · {pages[selected.page]} · {date(selected.created_at)}{admin ? ` · ${selected.author_name}` : ''}</p>
        <p className="mt-4 whitespace-pre-wrap break-words text-sm">{selected.description}</p>
        {admin && selected.browser && <details className="mt-3 text-xs"><summary>Teknisk information</summary><p className="mt-2 break-all">Version: {selected.app_version}<br />{selected.browser}</p></details>}
      </div>
      {loadingThread ? <p role="status">Laddar svar...</p> : <>
        {moreMessages && <Button variant="secondary" onClick={() => setMessageLimit(v => v + 50)}>Visa äldre svar</Button>}
        {!messages.length && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Inga svar ännu.</p>}
        {messages.map(message => <article key={message.id} className="border-l-2 pl-3" style={{ borderColor: message.author_role === 'admin' ? 'var(--blue)' : 'var(--border)' }}><p className="text-xs" style={{ color: 'var(--text-muted)' }}>{message.author_role === 'admin' ? 'Admin' : selected.author_name} · {date(message.created_at)}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.body}</p></article>)}
      </>}
      <form onSubmit={reply}><fieldset disabled={busy} className="space-y-3">
        {admin && <Select label="Status" value={status} onChange={e => setStatus(e.target.value)}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>}
        <Textarea label="Ditt svar" maxLength={5000} rows={4} value={body} onChange={e => setBody(e.target.value)} />
        <Button type="submit" loading={busy} disabled={!body.trim() && (!admin || status === selected.status)}>Spara svar{admin ? ' / status' : ''}</Button>
      </fieldset></form>
    </section> : <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Filtrera status" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="">Alla</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
        <Button variant="secondary" disabled={loading || busy} onClick={() => { setError(''); setRefresh(v => v + 1); }}>Uppdatera</Button>
      </div>
      {loading ? <p role="status">Laddar ärenden...</p> : !tickets.length ? <p className="py-6 text-sm" style={{ color: 'var(--text-muted)' }}>Inga ärenden att visa.</p> : <div className="divide-y" style={{ borderColor: 'var(--border)' }}>{tickets.map(ticket => <button key={ticket.id} disabled={busy} onClick={() => open(ticket)} className="flex w-full flex-wrap items-center justify-between gap-2 py-4 text-left">
        <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{ticket.title}</span><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{admin ? `${ticket.author_name} · ` : ''}{categories[ticket.category]} · {date(ticket.updated_at)}</span></span>
        <span className="shrink-0 text-xs font-semibold" style={{ color: ticket.status === 'nytt' ? 'var(--blue)' : 'var(--text-muted)' }}>{statuses[ticket.status]}</span>
      </button>)}</div>}
      <div className="flex items-center gap-3"><Button variant="secondary" disabled={page === 0 || loading} onClick={() => setPage(v => v - 1)}>Föregående</Button><span className="text-sm">Sida {page + 1}</span><Button variant="secondary" disabled={!hasMore || loading} onClick={() => setPage(v => v + 1)}>Nästa</Button></div>
    </section>}
  </div>;
}
