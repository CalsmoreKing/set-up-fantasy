import { buildStageTotals } from './standings.js'

const COLUMNS = ['Ім\'я', 'Спринт', 'Квала', 'Гонка', 'Бонус новачка', 'Разом']

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

function cell(value, styleId = null) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : ''
  if (value === null || value === undefined || value === '') return `<Cell${style}/>`
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell${style}><Data ss:Type="Number">${value}</Data></Cell>`
  }
  return `<Cell${style}><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`
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
        const row = {
          name: player.name,
          sprint: typeValue('sprint', score.sprint),
          qual: typeValue('qual', score.qual),
          race: typeValue('race', score.race),
          newcomerBonus: raceSession?.committed ? bonusByPlayer.get(player.id) || 0 : raceSession ? null : '—',
          total: Number(score.total) || 0,
        }
        return row
      }).sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name), 'uk'))
      return { stage, rows }
    })
}

export function buildStageWorkbookXml(sheets) {
  const usedNames = new Set()
  const worksheets = (sheets || []).map(({ stage, rows }) => {
    const sheetName = safeSheetName(stage.name || stage.key, usedNames)
    const header = `<Row ss:StyleID="Header">${COLUMNS.map(label => cell(label, 'Header')).join('')}</Row>`
    const dataRows = rows.map(row => `<Row>${[
      row.name,
      row.sprint,
      row.qual,
      row.race,
      row.newcomerBonus,
      row.total,
    ].map(value => cell(value)).join('')}</Row>`).join('')
    return `<Worksheet ss:Name="${xmlEscape(sheetName)}"><Table>
      <Column ss:Width="150"/><Column ss:Width="75"/><Column ss:Width="75"/><Column ss:Width="75"/><Column ss:Width="120"/><Column ss:Width="75"/>
      ${header}${dataRows}
    </Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/><Interior/></Style><Style ss:ID="Header"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#E8EDF3" ss:Pattern="Solid"/></Style></Styles>
  ${worksheets}
</Workbook>`
}

export function downloadStageWorkbook(sheets, filename = 'fantasy-etapy-2026.xml') {
  const blob = new Blob([buildStageWorkbookXml(sheets)], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
