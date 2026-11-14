import { strToU8, zipSync } from 'fflate'
import { buildStageTotals } from './standings.js'

const COLUMNS = ['Ім\'я', 'Спринт', 'Квала', 'Гонка', 'Бонус новачка', 'Разом']
const COLUMN_NAMES = ['name', 'sprint', 'qual', 'race', 'newcomerBonus', 'total']

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function safeSheetName(value, usedNames) {
  const base = String(value || 'Етап').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Етап'
  let name = base
  let suffix = 2
  while (usedNames.has(name.toLocaleLowerCase())) {
    const ending = ` ${suffix++}`
    name = `${base.slice(0, 31 - ending.length)}${ending}`
  }
  usedNames.add(name.toLocaleLowerCase())
  return name
}

export function buildStageExportSheets(stages, players, sessions, forecasts, qualAssignments, newcomerBonuses = []) {
  const stageTotals = buildStageTotals(players, sessions, forecasts, qualAssignments, newcomerBonuses)
  return [...(stages || [])]
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map(stage => {
      const stageSessions = (sessions || []).filter(session => session.stage_id === stage.id)
      const typeValue = (type, value) => {
        const session = stageSessions.find(row => row.type === type)
        if (session?.committed) return Number(value) || 0
        return session ? null : '—'
      }
      const raceSession = stageSessions.find(session => session.type === 'race')
      const totals = stageTotals[stage.id] || {}
      const bonusByPlayer = (newcomerBonuses || []).reduce((map, bonus) => {
        if (bonus.stage_id === stage.id) map.set(bonus.player_id, (map.get(bonus.player_id) || 0) + (Number(bonus.points) || 0))
        return map
      }, new Map())
      const rows = (players || []).map(player => {
        const score = totals[player.id] || {}
        return {
          name: player.name,
          sprint: typeValue('sprint', score.sprint),
          qual: typeValue('qual', score.qual),
          race: typeValue('race', score.race),
          newcomerBonus: raceSession?.committed ? bonusByPlayer.get(player.id) || 0 : raceSession ? null : '—',
          total: Number(score.total) || 0,
        }
      }).sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name), 'uk'))
      return { stage, rows }
    })
}

function columnName(number) {
  let value = number
  let name = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function cellXml(value, reference, header = false) {
  const style = header ? ' s="1"' : ''
  if (value === null || value === undefined || value === '') return `<c r="${reference}"${style}/>`
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}"${style}><v>${value}</v></c>`
  return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
}

function worksheetXml(rows) {
  const header = `<row r="1">${COLUMNS.map((label, index) => cellXml(label, `${columnName(index + 1)}1`, true)).join('')}</row>`
  const data = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 2
    return `<row r="${rowNumber}">${COLUMN_NAMES.map((key, columnIndex) => cellXml(row[key], `${columnName(columnIndex + 1)}${rowNumber}`)).join('')}</row>`
  }).join('')
  const lastRow = rows.length + 1
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="4" width="12" customWidth="1"/><col min="5" max="5" width="20" customWidth="1"/><col min="6" max="6" width="12" customWidth="1"/></cols>
  <sheetData>${header}${data}</sheetData><autoFilter ref="A1:F${lastRow}"/>
</worksheet>`
}

function workbookFiles(sheets) {
  const usedNames = new Set()
  const names = sheets.map(({ stage }) => safeSheetName(stage.name || stage.key, usedNames))
  const worksheetFiles = Object.fromEntries(sheets.map(({ rows }, index) => [`xl/worksheets/sheet${index + 1}.xml`, strToU8(worksheetXml(rows))]))
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

  return {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/styles.xml': strToU8(styles),
    ...worksheetFiles,
  }
}

export function buildStageWorkbookXlsx(sheets) {
  return zipSync(workbookFiles(sheets), { level: 6 })
}

export function downloadStageWorkbook(sheets, filename = 'fantasy-etapy-2026.xlsx') {
  const blob = new Blob([buildStageWorkbookXlsx(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
