// Manually transferred legacy totals from the user's archive screenshot.
// The green +N deltas were deliberately excluded.
export const ARCHIVE_BASELINE = Object.freeze({
  'Калсмор':165,
  'Іванна':153,
  'Хонда':151,
  'Ігор':131,
  'Мія':130,
  'Марго':120,
  'Нептун':116,
  'Ярослав':114,
  'Іван':113,
  'Чак':111,
  'Ярік':109,
  'Валентин':107,
  'Андріі':94, // current profile for Sofia
  'Даня':90, // current profile for Mykolapka
  'Анастасія':89,
  'Кітасу':87,
  'Андрій':84,
  'Стас':71,
})

export const NO_ARCHIVE_BASELINE_PLAYERS = new Set(['Педрі','Хексі'])
export const ARCHIVE_BASELINE_TOTAL = Object.values(ARCHIVE_BASELINE).reduce((sum, points) => sum + points, 0)

export function archiveBaselineForPlayer(playerName) {
  if (Object.hasOwn(ARCHIVE_BASELINE, playerName)) return ARCHIVE_BASELINE[playerName]
  if (NO_ARCHIVE_BASELINE_PLAYERS.has(playerName)) return 0
  return null
}
