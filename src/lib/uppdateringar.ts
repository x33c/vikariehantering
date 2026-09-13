interface VikarieUppdateringar {
  uppdaterad: string;
  punkter: string[];
}

function ärVikarieUppdateringar(data: unknown): data is VikarieUppdateringar {
  if (!data || typeof data !== 'object') return false;
  const { uppdaterad, punkter } = data as Partial<VikarieUppdateringar>;
  return typeof uppdaterad === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(uppdaterad)
    && Number.isFinite(new Date(`${uppdaterad}T12:00:00`).getTime())
    && Array.isArray(punkter)
    && punkter.length > 0
    && punkter.every(punkt => typeof punkt === 'string' && punkt.trim().length > 0);
}

export async function hämtaVikarieUppdateringar() {
  // Läs den publicerade listan vid varje öppning, även om appen varit öppen
  // sedan en tidigare driftsättning. Använd inte en gammal mall vid nätverksfel.
  const svar = await fetch('/vikarie-uppdateringar.json', { cache: 'no-store' });
  if (!svar.ok) throw new Error('Kunde inte hämta uppdateringslistan.');
  const data: unknown = await svar.json();
  if (!ärVikarieUppdateringar(data)) throw new Error('Uppdateringslistan har ett ogiltigt format.');

  const datum = new Date(`${data.uppdaterad}T12:00:00`).toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return {
    titel: 'Passportalen har uppdaterats',
    datum,
    text: `Hej!

Här är de senaste förbättringarna för dig som vikarie i Passportalen (uppdaterat ${datum}):

${data.punkter.map(punkt => `• ${punkt}`).join('\n\n')}

Stäng Passportalen helt och öppna appen igen för att få den senaste versionen. Använder du webbläsaren kan du ladda om sidan.

Vänliga hälsningar
Administrationen`,
  };
}
