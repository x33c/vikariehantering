export function cleanupDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());
}

export function canArchiveDuringCleanup(shift: { datum: string; status: string; vikarie_id?: string | null }, today = cleanupDate()) {
  return shift.datum < today && shift.status === 'obokat' && !shift.vikarie_id;
}
