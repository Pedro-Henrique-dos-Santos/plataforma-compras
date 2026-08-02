const saoPauloDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
});

export function currentBusinessIsoDate(now = new Date()): string {
  const parts = Object.fromEntries(
    saoPauloDateFormatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}
