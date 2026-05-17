# Passportalen

Passportalen är en webbapp för att hantera frånvaro, vikariepass, bokningar, tillgänglighet, meddelanden och notiser på ett enkelt och samlat sätt.

Appen finns på:

https://passportalen.vercel.app

## Kom igång som vikarie

### 1. Få ett konto

Administratören skapar ditt konto och ger dig en inloggningslänk eller inloggningsadress. Om du får ett tillfälligt lösenord behöver du byta lösenord första gången du loggar in.

### 2. Logga in

1. Öppna länken du fått av administratören.
2. Skriv in din e-postadress och ditt lösenord.
3. Byt lösenord om appen ber dig göra det.

### 3. Lägg appen på hemskärmen

På iPhone:

1. Öppna appen i Safari.
2. Tryck på dela-knappen.
3. Välj Lägg till på hemskärmen.
4. Bekräfta med Lägg till.

På Android:

1. Öppna appen i Chrome.
2. Tryck på menyn.
3. Välj Lägg till på startskärmen eller Installera app.
4. Bekräfta.

### 4. Aktivera notiser

När appen visar notisknappen kan du aktivera push-notiser. Då kan du få information om nya förfrågningar och meddelanden utan att behöva uppdatera sidan manuellt.

Om notiser inte fungerar:

1. Kontrollera att notiser är tillåtna i webbläsaren.
2. Kontrollera att notiser är tillåtna för hemskärmsappen.
3. På iPhone behöver appen normalt vara sparad på hemskärmen för att web push ska fungera.

### 5. Lägg in tillgänglighet

1. Gå till Tillgänglighet.
2. Lägg in datum eller veckodagar då du kan arbeta.
3. Välj om du är tillgänglig hela dagen, förmiddag, eftermiddag eller egna tider.
4. Spara.

Du kan ändra eller ta bort tillgänglighet i efterhand.

### 6. Svara på förfrågningar

1. Gå till Pass.
2. Titta under Förfrågningar.
3. Välj ett pass.
4. Tacka ja eller nej.

Om du redan är bokad på en tid som överlappar ska appen hindra dubbelbokning.

### 7. Boka lediga pass

1. Gå till Pass.
2. Titta under Lediga pass.
3. Välj ett pass som passar din tillgänglighet.
4. Bekräfta bokningen.

### 8. Följ dina bokade pass

1. Gå till Mina pass.
2. Kontrollera datum, tid och information.
3. Skriv meddelande till admin om något behöver förtydligas.
4. Om du behöver avboka ska du meddela admin via passets meddelandefält.

## Kom igång som admin

### 1. Logga in som admin

Administratörskonto skapas med adminroll. Rollen ska bara ges till personer som behöver hantera pass, användare och historik.

### 2. Lägg in personal och grupper

1. Gå till personalvyn.
2. Lägg till personal som kan vara frånvarande.
3. Koppla personal till rätt grupp om det behövs.
4. Kontrollera att signaturer och kopplingar stämmer.

### 3. Lägg in vikarier

1. Gå till Vikarier.
2. Lägg till namn, e-post och telefonnummer.
3. Skapa konto om vikarien ska kunna logga in.
4. Ge ett tillfälligt lösenord om appen använder det flödet.
5. Be vikarien byta lösenord vid första inloggning.

### 4. Kontrollera tillgänglighet

Vikarier kan lägga in när de kan arbeta. Som admin använder du detta som stöd när du väljer vem som ska få en förfrågan eller bokas direkt.

### 5. Registrera frånvaro

1. Gå till Frånvaro.
2. Välj person, datum och tid.
3. Välj om vikarie behövs eller inte.
4. Skapa pass om frånvaron ska bemannas.

### 6. Skapa pass direkt

1. Gå till Bemanning.
2. Välj Skapa pass.
3. Välj personal om passet gäller en frånvarande person, eller skapa ett fristående pass.
4. Ange datum, grupp, starttid och sluttid.
5. Välj om passet ska publiceras direkt eller hållas dolt.
6. Spara.

För flera dagar kan du skapa veckopass och justera tiderna dag för dag innan du sparar.

### 7. Arbeta från Att göra

Bemanningens Att göra-flik är adminens huvudsakliga arbetslista. Där ska pass synas när de kräver beslut, till exempel:

- opublicerade pass
- riktade förfrågningar
- avbokningsförfrågningar
- avbokade pass

### 8. Bemanna pass

För varje pass kan admin:

1. publicera passet som ledigt
2. skicka en riktad förfrågan till en vikarie
3. boka en vikarie direkt
4. ändra tid
5. avpublicera passet
6. avboka passet

Appen ska varna om en vikarie redan är bokad på en överlappande tid.

### 9. Följ meddelanden och notiser

Vikarier och admin kan skriva meddelanden kopplade till bokade pass. Meddelanden används för frågor, förtydliganden och avbokningsönskemål.

Admin bör bevaka notiser och Att göra-fliken löpande.

### 10. Kontrollera historik

Historiken visar vad som har hänt med pass och viktiga åtgärder. Använd historiken för att följa ändringar, felsöka och förstå vem som gjort vad och när.

## Rekommenderat arbetssätt för admin

1. Börja dagen i Bemanning.
2. Öppna Att göra.
3. Hantera avbokade pass och avbokningsförfrågningar först.
4. Publicera eller rikta opublicerade pass.
5. Kontrollera nya meddelanden.
6. Följ upp pass som saknar vikarie.

## Lokal utveckling

Installera beroenden och starta utvecklingsservern:

npm install
npm run dev

Bygg projektet:

npm run build

Miljövariabler ska ligga lokalt och aldrig committas. Använd .env.example som mall om en sådan finns.

## Projektstruktur

src/
  components/    återanvändbara komponenter och layout
  hooks/         delad React-logik
  lib/           API-klienter och hjälpfunktioner
  pages/admin/   adminvyer
  pages/vikarie/ vikarievyer
  types/         TypeScript-typer

supabase/
  functions/     Edge Functions
  migrations/    databasändringar

## Grundprinciper

- Vikarier ska snabbt se vad de kan boka och vad de redan har bokat.
- Admin ska kunna arbeta från en tydlig Att göra-lista.
- Ingen ska behöva uppdatera sidan manuellt för att se nya pass eller meddelanden.
- Notiser ska användas för sådant som kräver uppmärksamhet.
- Dokumentation och kodexempel ska alltid vara fria från känsliga uppgifter.
