import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'onboarding@resend.dev';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function skickaKontoMejl(epost: string, namn: string | null | undefined, link: string) {
  if (!RESEND_API_KEY) return false;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [epost],
      subject: 'Skapa lösenord till Vikariehantering',
      text: [
        `Hej ${namn ?? ''}`.trim() + ',',
        '',
        'Ett konto har skapats åt dig i Vikariehantering.',
        'Klicka på länken nedan för att sätta ditt lösenord:',
        '',
        link,
        '',
        'Om du inte väntade dig detta kan du ignorera mejlet.',
      ].join('\n'),
    }),
  });

  return resp.ok;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { åtgärd, ...data } = await req.json();

  try {
    if (åtgärd === 'skapa') {
      const { epost, namn, vikarie_id } = data;

      if (!epost || typeof epost !== 'string') {
        return json({ error: 'E-post krävs.' }, 400);
      }

      const normaliseradEpost = epost.trim().toLowerCase();
      const tempPassword = crypto.randomUUID() + crypto.randomUUID();

      let userId: string | null = null;

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: normaliseradEpost,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { roll: 'vikarie', namn },
      });

      if (authData?.user?.id) {
        userId = authData.user.id;
      } else if (authError) {
        const meddelande = authError.message.toLowerCase();

        if (meddelande.includes('already') || meddelande.includes('registered') || meddelande.includes('exists')) {
          const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          });
          if (usersError) throw usersError;

          const befintlig = usersData.users.find((user) =>
            user.email?.toLowerCase() === normaliseradEpost
          );

          if (!befintlig) throw authError;
          userId = befintlig.id;
        } else {
          throw authError;
        }
      }

      if (!userId) return json({ error: 'Kunde inte skapa eller hitta kontot.' }, 500);

      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPassword,
        email_confirm: true,
        user_metadata: { roll: 'vikarie', namn },
      });
      if (passwordError) throw passwordError;

      const { error: profilError } = await supabaseAdmin.from('profiler').upsert({
        id: userId,
        roll: 'vikarie',
        epost: normaliseradEpost,
        namn,
        aktiv: true,
      }, { onConflict: 'id' });
      if (profilError) throw profilError;

      if (vikarie_id) {
        const { error: vikarieError } = await supabaseAdmin
          .from('vikarier')
          .update({ profil_id: userId, epost: normaliseradEpost, aktiv: true })
          .eq('id', vikarie_id);
        if (vikarieError) throw vikarieError;
      }

      const { data: recoveryData, error: recoveryError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: normaliseradEpost,
      });
      if (recoveryError) throw recoveryError;

      const actionLink = recoveryData.properties?.action_link ?? null;
      const mejlSkickat = actionLink
        ? await skickaKontoMejl(normaliseradEpost, typeof namn === 'string' ? namn : null, actionLink)
        : false;

      return json({
        ok: true,
        user_id: userId,
        email_sent: mejlSkickat,
        action_link: actionLink,
      });
    }

    if (åtgärd === 'återställ_lösenord') {
      const { epost, namn } = data;
      if (!epost || typeof epost !== 'string') return json({ error: 'E-post krävs.' }, 400);

      const normaliseradEpost = epost.trim().toLowerCase();
      const { data: recoveryData, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: normaliseradEpost,
      });
      if (error) throw error;

      const actionLink = recoveryData.properties?.action_link ?? null;
      const mejlSkickat = actionLink
        ? await skickaKontoMejl(normaliseradEpost, typeof namn === 'string' ? namn : null, actionLink)
        : false;

      return json({ ok: true, email_sent: mejlSkickat, action_link: actionLink });
    }

    if (åtgärd === 'uppdatera_roll') {
      const token = req.headers.get('Authorization')?.replace('Bearer ', '');
      if (!token) return json({ error: 'Saknar inloggning.' }, 401);

      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !userData.user) return json({ error: 'Ogiltig inloggning.' }, 401);

      const { data: adminProfil, error: adminProfilError } = await supabaseAdmin
        .from('profiler')
        .select('id, roll, epost')
        .eq('id', userData.user.id)
        .single();

      if (adminProfilError || adminProfil?.roll !== 'admin') {
        return json({ error: 'Endast administratörer kan ändra roller.' }, 403);
      }

      const { profil_id, roll, namn, aktiv, admin_losenord } = data;

      if (roll === 'admin') {
        if (!admin_losenord || typeof admin_losenord !== 'string') {
          return json({ error: 'Lösenord krävs för att tilldela adminroll.' }, 400);
        }

        const adminEpost = adminProfil.epost ?? userData.user.email;
        if (!adminEpost) return json({ error: 'Administratörskontot saknar e-post.' }, 400);

        const { error: loginError } = await supabaseAuth.auth.signInWithPassword({
          email: adminEpost,
          password: admin_losenord,
        });

        if (loginError) return json({ error: 'Fel lösenord.' }, 401);
      }

      const { error } = await supabaseAdmin
        .from('profiler')
        .update({ roll, namn, aktiv })
        .eq('id', profil_id);

      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Okänd åtgärd.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Okänt fel.' }, 500);
  }
});
