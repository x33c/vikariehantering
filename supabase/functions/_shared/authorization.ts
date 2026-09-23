import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function authenticate(req: Request, client: SupabaseClient) {
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: 'Inloggning krävs.', status: 401 } as const;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { error: 'Ogiltig inloggning.', status: 401 } as const;
  const { data: profile, error: profileError } = await client.from('profiler')
    .select('id, roll, epost, aktiv').eq('id', data.user.id).maybeSingle();
  if (profileError || !profile?.aktiv) return { error: 'Kontot saknar behörighet.', status: 403 } as const;
  return { user: data.user, profile } as const;
}

export async function mayNotify(client: SupabaseClient, profile: { id: string; roll: string }, body: Record<string, unknown>) {
  if (body.typ === 'test_push' || body.typ === 'koppla_vikarieprofil') return true;
  if (profile.roll === 'admin') return true;
  if (profile.roll !== 'vikarie' || typeof body.pass_id !== 'string') return false;
  if (!['admin_vikarie_svar', 'admin_avbokning', 'pass_meddelande'].includes(String(body.typ))) return false;
  if (body.typ === 'pass_meddelande' && body.avsandare_roll !== 'vikarie') return false;

  const { data: substitutes, error } = await client.from('vikarier').select('id')
    .eq('profil_id', profile.id).eq('aktiv', true);
  if (error || !substitutes?.length) return false;
  const ids = substitutes.map((row: { id: string }) => row.id);
  if (body.typ === 'admin_vikarie_svar' && !ids.includes(body.vikarie_id)) return false;
  const { data: shift, error: shiftError } = await client.from('vikariepass')
    .select('vikarie_id, riktad_till_vikarie_id').eq('id', body.pass_id).maybeSingle();
  if (shiftError || !shift) return false;
  if (ids.includes(shift.vikarie_id)) return true;
  if (body.typ === 'admin_avbokning') return false;
  if (ids.includes(shift.riktad_till_vikarie_id)) return true;
  // Answers are notified after the request status has changed, including a decline.
  let query = client.from('pass_forfragningar').select('id').eq('pass_id', body.pass_id)
    .in('vikarie_id', body.typ === 'admin_vikarie_svar' ? [body.vikarie_id] : ids);
  if (body.typ === 'pass_meddelande') query = query.eq('status', 'vantar');
  const { data: requests, error: requestError } = await query.limit(1);
  return !requestError && Boolean(requests?.length);
}
