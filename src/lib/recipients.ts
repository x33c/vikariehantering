export function parseRecipients(input: string) {
  // Keep quoted Outlook display names intact, including commas in surnames.
  const entries = input.match(/(?:"[^"]*"|[^;,\n\r])+/g) ?? [];
  const addresses: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const raw of entries) {
    const entry = raw.trim();
    if (!entry) continue;
    const bracket = entry.match(/^[^<>]*<([^<>]+)>$/);
    const address = (bracket ? bracket[1] : entry).trim().toLowerCase();
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(address)
      || address.startsWith('.') || address.includes('..') || address.includes('.@') || address.length > 254) {
      invalid.push(entry);
    } else if (seen.has(address)) {
      duplicates++;
    } else {
      seen.add(address);
      addresses.push(address);
    }
  }
  return { addresses, invalid, duplicates };
}
