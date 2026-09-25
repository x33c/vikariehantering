export function loginError(error: unknown): string {
  const details = error as { status?: number; code?: string; name?: string } | null;
  if (details?.code === 'invalid_credentials') return 'Felaktig e-postadress eller lösenord.';
  if (details?.status === 402) return 'Tjänsten är tillfälligt spärrad hos leverantören. Kontakta administratören. Ditt lösenord behöver inte vara fel.';
  if (details?.status === 429) return 'För många inloggningsförsök. Vänta en stund och försök igen.';
  if (details?.code === 'email_not_confirmed') return 'E-postadressen behöver bekräftas innan du kan logga in.';
  if (details?.name === 'AuthRetryableFetchError' || details?.name === 'TypeError') return 'Kunde inte nå inloggningstjänsten. Kontrollera anslutningen och försök igen.';
  return 'Inloggningen kunde inte genomföras. Försök igen senare eller kontakta administratören.';
}
