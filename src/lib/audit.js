export const AUDIT_ACTION_LABELS = {
  bulk_import: 'Масовий імпорт прогнозів',
  bulk_qual_forecast: 'Масовий імпорт кваліфікації',
  commit_session: 'Зарахування балів',
  recalculate_session: 'Перерахунок балів',
  edit_player: 'Зміна даних гравця',
  add_player: 'Додавання гравця',
  delete_player: 'Видалення гравця',
  unlink_account: 'Відв’язування акаунта',
  lock_stage: 'Блокування етапу',
  unlock_stage: 'Розблокування етапу',
  lock_session: 'Блокування сесії',
  unlock_session: 'Розблокування сесії',
  approved_qualifying_corrections: 'Корекція кваліфікаційних прогнозів',
  save_results: 'Оновлення реальних результатів',
  pilot_substitution: 'Заміна пілота для етапу',
  archive_stage: 'Перенесення етапу в архів',
  unarchive_stage: 'Повернення етапу з архіву',
}

export function auditActionLabel(action) {
  return AUDIT_ACTION_LABELS[action] || 'Адміністративна дія'
}

export function auditActorLabel(row) {
  const details = row?.details || {}
  const actor = String(row?.actor || '').trim()
  if (actor && !['admin', 'system', 'null'].includes(actor.toLowerCase())) return actor
  return details.actor_name || details.actor_email || 'Адміністратор (ім’я не записане)'
}

export function auditSummary(row, playerNameById = {}) {
  const d = row?.details || {}
  const targetName = d.player || d.player_name || playerNameById[d.player_id]
  const fieldLabels = { name: 'ім’я', team: 'команду', base_pts: 'загальні бали', is_admin: 'права адміністратора' }
  switch (row?.action) {
    case 'bulk_import': return `${d.player || 'Гравець'}: імпорт прогнозу · ${d.stage_name || 'етап'} · ${sessionTypeLabel(d.type)}`
    case 'bulk_qual_forecast': return `${d.player || 'Гравець'}: ${d.stage_name || 'етап'} · прогноз кваліфікації${d.pilot ? ` · ${d.pilot}` : ''}${d.pos ? ` · P${d.pos}` : ''}`
    case 'edit_player': return `${targetName || 'Гравець'}: змінено ${fieldLabels[d.field] || d.field || 'дані'}${d.value !== undefined ? `: ${d.old_value ?? '—'} → ${d.value}` : ''}`
    case 'add_player': return `Додано гравця ${d.player_name || '—'}${d.team ? ` до команди ${d.team}` : ''}`
    case 'delete_player': return `Видалено гравця ${targetName || '—'}`
    case 'unlink_account': return `Відв’язано акаунт ${targetName || 'гравця'}`
    case 'commit_session':
    case 'recalculate_session': return `${d.stage || 'Етап'} · ${sessionTypeLabel(d.type)}${Array.isArray(d.breakdown) ? ` · ${d.breakdown.length} гравців у розписці` : ''}`
    case 'lock_stage':
    case 'unlock_stage': return `${d.stage_name || d.stage || 'Етап'}`
    case 'lock_session':
    case 'unlock_session': return `${d.stage_name || d.stage || 'Етап'} · ${sessionTypeLabel(d.type)}`
    case 'approved_qualifying_corrections': return `Схвалено корекцій: ${d.changes?.length || 0}; знято ${d.total_points_removed || 0} балів`
    case 'save_results': return `${d.stage_name || d.stage || 'Етап'} · ${sessionTypeLabel(d.type)}: змінено реальний результат`
    case 'pilot_substitution': return `${d.stage_name || d.stage || 'Етап'}: ${d.outgoing_driver || '—'} → ${d.incoming_driver || 'видалено'}`
    case 'archive_stage':
    case 'unarchive_stage': return d.stage_name || d.stage || 'Етап'
    default: return d.summary || 'Подробиці доступні в розкритті'
  }
}

export function sessionTypeLabel(type) {
  return ({ qual: 'кваліфікація', sprint: 'спринт', race: 'гонка' })[type] || type || 'сесія'
}
