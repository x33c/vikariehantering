# Vikariehantering

Webbapplikation för hantering av frånvaro, vikariepass och vikarienotifieringar i skolmiljö.

## Stack

- React 18 + TypeScript
- Tailwind CSS
- Supabase (Auth, Database, Realtime, Edge Functions)
- Vite
- xlsx (Skola24-import)

---

## Kom igång

### 1. Supabase-projekt

1. Skapa ett nytt projekt på [supabase.com](https://supabase.com).
2. Kör migrationen under `supabase/migrations/001_initial_schema.sql` via SQL-editorn i Supabase-dashboarden.

### 2. Miljövariabler

```bash
cp .env.example .env
```

Fyll i:
- `VITE_SUPABASE_URL` – finns under Project Settings > API
- `VITE_SUPABASE_ANON_KEY` – finns under Project Settings > API

### 3. Installera och starta

```bash
npm install
npm run dev
```

---

## Edge Function: skicka-epost

Används för e-postnotifieringar till vikarier. Kräver Resend-konto (eller anpassas till annat SMTP-API).

### Deploy

```bash
supabase functions deploy skicka-epost
```

### Sätt miljövariabler (Edge Function)

```bash
supabase secrets set RESEND_API_KEY=din_resend_api_nyckel
supabase secrets set FROM_EMAIL=noreply@dinskola.se
```

`RESEND_API_KEY` – hämtas från [resend.com](https://resend.com/api-keys).  
Utan nyckel simuleras utskicket i konsolen (fungerar för lokal testning).

---

## Roller

| Roll     | Åtkomst                                                      |
|----------|--------------------------------------------------------------|
| `admin`  | Alla vyer: personal, frånvaro, pass, import, historik, notiser |
| `vikarie`| Lediga pass, mina pass, tillgänglighet, profil               |

Rollen sätts via `raw_user_meta_data.roll` vid skapande av användare.

### Skapa admin-användare manuellt

I Supabase SQL-editorn:

```sql
-- Skapa via Supabase Auth > Users i dashboarden
-- Sätt metadata: { "roll": "admin", "namn": "För Efternamn" }
```

Eller via Supabase Admin API / dashboarden under Authentication > Users > Invite user (lägg till metadata manuellt efteråt via `profiler`-tabellen).

---

## Projektstruktur

```
src/
├── types/          # Alla TypeScript-typer, enums och konstanter
├── lib/
│   ├── supabase.ts # Supabase-klient
│   └── api/        # Typade API-funktioner per domän
├── hooks/
│   └── useAuth.ts  # Auth context + hook
├── components/
│   ├── ui/         # Återanvändbara UI-komponenter
│   └── layout/     # Admin- och vikarie-layout
└── pages/
    ├── auth/       # Login
    ├── admin/      # Dashboard, Arbetslag, Vikarier, Frånvaro, Vikariepass, Import, Historik
    └── vikarie/    # LedigaPass, MinaPass, Tillgänglighet, Profil

supabase/
├── migrations/     # SQL-schema med RLS
└── functions/
    └── skicka-epost/  # Edge Function för e-postnotifieringar
```

---

## Skola24-import

Stöder CSV och Excel (.xlsx/.xls).

Importflöde:
1. Ladda upp fil
2. Kolumner detekteras automatiskt (datum, tid, signatur, ämne, grupp, sal)
3. Justera mappning manuellt vid behov
4. Klicka "Matcha mot personal" – systemet matchar via signatur → Skola24-ID → namnlikhet
5. Osäkra/omatchade rader kan kopplas manuellt
6. Spara import – schemarader lagras och används vid frånvaroregistrering

---

## Noteringar

- Befintlig personal skrivs **aldrig** över automatiskt vid import.
- Bokningar är first-come-first-served med optimistisk concurrency-kontroll.
- SMS och push-notifieringar är förberedda i databasschema och notis-API, men ej implementerade i v1.
- Edge Function är provider-agnostisk – byt ut Resend-anropet mot valfritt e-post-API.
