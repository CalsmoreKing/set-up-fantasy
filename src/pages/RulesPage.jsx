const cell = { padding:'9px 10px', borderBottom:'1px solid rgba(255,255,255,.06)', fontSize:12, lineHeight:1.55 }
const gold = { ...cell, color:'var(--gold)', fontFamily:'Orbitron,sans-serif', fontWeight:700 }

function RuleTable({ headers, rows }) {
  return <div style={{overflowX:'auto'}}><table className="rules-table"><thead><tr>{headers.map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{row.map((value,col)=><td key={col} style={col===row.length-1 && row.length>1 ? gold : cell}>{value}</td>)}</tr>)}</tbody></table></div>
}

export default function RulesPage() {
  return <main className="rules-page">
    <div className="section-label">Правила Set-Up Fantasy</div>
    <p className="rules-intro">Єдині правила гонки та спринту застосовуються до всіх етапів сезону, включно з архівними.</p>
    <section className="rules-section">
      <h3>Гонка · Топ-10</h3>
      <p>За пілота на прогнозованій позиції бали нараховуються лише якщо він фінішував у Топ-10.</p>
      <RuleTable headers={['Похибка','Прогноз P1–P5','Прогноз P6–P10']} rows={[
        ['Точне місце','5','6'],['±1 позиція','2','3'],['±2 позиції','1','2'],['±3 позиції','0','1'],['4+ позиції','0','0'],
      ]}/>
      <RuleTable headers={['Бонус','Бали']} rows={[
        ['Швидке коло','+2'],['Прорив — пілот із найбільшим прогресом від старту','+4'],
        ['Точний склад Топ-3 у будь-якому порядку','+2'],['Точний склад Топ-5 у будь-якому порядку','+2'],
      ]}/>
    </section>
    <section className="rules-section">
      <h3>Спринт · Топ-5</h3>
      <p>У кожному спринті гравці прогнозують лише перші 5 місць. Бали нараховуються за відповідність позиції серед фактичного Топ-5 спринту; правило однакове для всіх етапів сезону.</p>
      <RuleTable headers={['Похибка','Бали за прогноз P1–P5']} rows={[
        ['Точне місце','6'],['±1 позиція','3'],['±2 позиції','1'],['3+ позиції','0'],
      ]}/>
      <p>Додаткових бонусів у спринті немає.</p>
    </section>
    <section className="rules-section">
      <h3>Кваліфікація</h3>
      <p>Кваліфікація не змінюється в цьому перерахунку. Її правила та архівні прогнози окремо перевіримо перед наступним кроком.</p>
    </section>
    <section className="rules-section">
      <h3>Бонус новачка</h3>
      <p>Правило бонусу буде налаштовано окремо разом із перевіркою історії складу команд і відсутніх на етапі гравців. До цього кроку бонуси не трактуються як архівні залишки: у перерахунку використовуватимуться лише перевірені записи бонусів.</p>
    </section>
    <section className="rules-section">
      <h3>Залік команд</h3>
      <p>Загальний рахунок команди — сума балів її гравців. Бали етапу — сума кваліфікації, спринту (якщо він є) та гонки.</p>
      <div className="rules-note">Прогнози після дедлайну не змінюються. Відсутні прогнози не вигадуються.</div>
    </section>
  </main>
}
