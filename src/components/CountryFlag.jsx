function countryCodeFromFlag(flag) {
  const points = Array.from(String(flag || ''), character => character.codePointAt(0))
    .filter(point => point >= 0x1f1e6 && point <= 0x1f1ff)
  if (points.length < 2) return ''
  return points.slice(0, 2).map(point => String.fromCharCode(point - 0x1f1e6 + 65)).join('').toLowerCase()
}

export default function CountryFlag({ flag, className = '' }) {
  const code = countryCodeFromFlag(flag)
  return (
    <>
      {flag && <span aria-hidden="true" className={`country-flag-emoji ${className}`}>{flag}</span>}
      {code && <img aria-hidden="true" alt="" src={`/flags/${code}.svg`} className={`country-flag-svg ${className}`} />}
    </>
  )
}
