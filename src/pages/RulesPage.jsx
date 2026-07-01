import { useAuth } from '../contexts/AuthContext'

export default function RulesPage() {
  return (
    <main>
      <div className="section-label">Правила Set-Up Fantasy</div>

      {/* ЗАГАЛЬНЕ */}
      <div className="rules-section">
        <div style={{fontFamily:'Orbitron,sans-serif',fontSize:11,color:'var(--red)',letterSpacing:2,marginBottom:10}}>ЯК ЦЕ ПРАЦЮЄ</div>
        <p style={{fontSize:13,lineHeight:1.8,color:'var(--muted)'}}>
          Перед кожним заїздом (Кваліфікація, Спринт, Гонка) ти вписуєш свій прогноз —
          хто фінішує на яких позиціях. Після реального результату система автоматично
          рахує твої бали. Чим точніший прогноз — тим більше балів.
          Наприкінці сезону перемагає гравець з найбільшою кількістю балів.
        </p>
      </div>

      {/* ГОНКА */}
      <div className="rules-section">
        <div style={{fontFamily:'Orbitron,sans-serif',fontSize:11,color:'var(--red)',letterSpacing:2,marginBottom:10}}>🏁 ГОНКА — ПРОГНОЗ ТОП-10</div>
        <table className="rules-table">
          <thead>
            <tr>
              <th>Точність прогнозу</th>
              <th>Позиції 1–5</th>
              <th>Позиції 6–10</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Точне місце</td><td style={{color:'var(--gold)',fontFamily:'Orbitron,sans-serif'}}>5</td><td style={{color:'var(--gold)',fontFamily:'Orbitron,sans-serif'}}>6</td></tr>
            <tr><td>Похибка ±1 позиція</td><td style={{fontFamily:'Orbitron,sans-serif'}}>2</td><td style={{fontFamily:'Orbitron,sans-serif'}}>3</td></tr>
            <tr><td>Похибка ±2 позиції</td><td style={{fontFamily:'Orbitron,sans-serif'}}>1</td><td style={{fontFamily:'Orbitron,sans-serif'}}>2</td></tr>
            <tr><td>Похибка ±3 позиції</td><td style={{color:'var(--muted)'}}>0</td><td style={{fontFamily:'Orbitron,sans-serif'}}>1</td></tr>
            <tr><td>Похибка 4+ позицій</td><td style={{color:'var(--muted)'}}>0</td><td style={{color:'var(--muted)'}}>0</td></tr>
          </tbody>
        </table>

        <div style={{marginTop:16,fontFamily:'Orbitron,sans-serif',fontSize:10,color:'var(--red)',letterSpacing:2,marginBottom:8}}>БОНУСИ</div>
        <table className="rules-table">
          <thead>
            <tr><th>Умова</th><th>Бали</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>⚡ Швидке коло</strong> — вгадав пілота з найкращим часом кола</td>
              <td style={{fontFamily:'Orbitron,sans-serif',color:'var(--gold)'}}>+2</td>
            </tr>
            <tr>
              <td><strong>🚀 Прорив</strong> — вгадав пілота, який відіграв найбільше позицій відносно стартового місця</td>
              <td style={{fontFamily:'Orbitron,sans-serif',color:'var(--gold)'}}>+4</td>
            </tr>
            <tr>
              <td><strong>🏆 Склад Топ-3</strong> — всі три обрані пілоти фінішували на подіумі (незалежно від порядку)</td>
              <td style={{fontFamily:'Orbitron,sans-serif',color:'var(--gold)'}}>+2</td>
            </tr>
            <tr>
              <td><strong>🏆 Склад Топ-5</strong> — всі п'ять обраних пілотів фінішували в першій п'ятірці (незалежно від порядку)</td>
              <td style={{fontFamily:'Orbitron,sans-serif',color:'var(--gold)'}}>+2</td>
            </tr>
          </tbody>
        </table>
        <div className="rules-note">
          <strong>Бонуси Топ-3 і Топ-5 сумуються.</strong> Якщо вгадав і Топ-3 і Топ-5 — отримуєш +4 бонусних балів зверху.
        </div>
      </div>

      {/* КВАЛІФІКАЦІЯ */}
      <div className="rules-section">
        <div style={{fontFamily:'Orbitron,sans-serif',fontSize:11,color:'var(--red)',letterSpacing:2,marginBottom:10}}>⏱️ КВАЛІФІКАЦІЯ</div>
        <p style={{fontSize:13,lineHeight:1.8,color:'var(--muted)',marginBottom:12}}>
          Перед кваліфікацією кожен гравець отримує <strong style={{color:'var(--text)'}}>одного випадкового пілота</strong> через рулетку.
          Кожен пілот може випасти конкретному гравцю лише <strong style={{color:'var(--text)'}}>один раз за весь сезон</strong>.
          Твоє завдання — вгадати, яке місце цей пілот посяде в кваліфікації.
        </p>
        <table className="rules-table">
          <thead>
            <tr><th>Точність прогнозу</th><th>Бали</th></tr>
          </thead>
          <tbody>
            <tr><td>Точне місце</td><td style={{color:'var(--gold)',fontFamily:'Orbitron,sans-serif'}}>6</td></tr>
            <tr><td>Похибка ±1 позиція</td><td style={{fontFamily:'Orbitron,sans-serif'}}>3</td></tr>
            <tr><td>Похибка ±2 позиції</td><td style={{fontFamily:'Orbitron,sans-serif'}}>1</td></tr>
            <tr><td>Похибка 3+ позицій</td><td style={{color:'var(--muted)'}}>0</td></tr>
          </tbody>
        </table>
        <div className="rules-note">
          <strong>Подвійні кваліфікації</strong> — на останніх 5 етапах сезону (Мексика, Бразилія, Лас Вегас, Катар, ОАЕ)
          кожен гравець отримує <strong style={{color:'var(--text)'}}>двох пілотів</strong> замість одного.
          Бали рахуються за кожного окремо і сумуються.
        </div>
      </div>

      {/* СПРИНТ */}
      <div className="rules-section">
        <div style={{fontFamily:'Orbitron,sans-serif',fontSize:11,color:'var(--red)',letterSpacing:2,marginBottom:10}}>💨 СПРИНТ — ПРОГНОЗ ТОП-5</div>
        <p style={{fontSize:13,lineHeight:1.8,color:'var(--muted)',marginBottom:12}}>
          Спринт є лише на 7 етапах: <strong style={{color:'var(--text)'}}>Британія, Бельгія, Нідерланди, Сінгапур, США, Бразилія, Катар</strong>.
          Прогнозуєш перші 5 місць. Реальні результати фіксуються для 7 позицій — це дозволяє
          зараховувати бали за похибку, якщо твій пілот фінішував 6-м чи 7-м.
        </p>
        <table className="rules-table">
          <thead>
            <tr><th>Точність прогнозу</th><th>Бали</th></tr>
          </thead>
          <tbody>
            <tr><td>Точне місце</td><td style={{color:'var(--gold)',fontFamily:'Orbitron,sans-serif'}}>3</td></tr>
            <tr><td>Похибка ±1 позиція</td><td style={{fontFamily:'Orbitron,sans-serif'}}>2</td></tr>
            <tr><td>Похибка ±2 позиції</td><td style={{fontFamily:'Orbitron,sans-serif'}}>1</td></tr>
            <tr><td>Похибка 3+ позицій</td><td style={{color:'var(--muted)'}}>0</td></tr>
          </tbody>
        </table>
      </div>

      {/* КОМАНДИ */}
      <div className="rules-section">
        <div style={{fontFamily:'Orbitron,sans-serif',fontSize:11,color:'var(--red)',letterSpacing:2,marginBottom:10}}>🏎️ КОМАНДНИЙ ЗАЛІК</div>
        <p style={{fontSize:13,lineHeight:1.8,color:'var(--muted)',marginBottom:12}}>
          Кожен гравець представляє одну з команд. Бали двох гравців однієї команди сумуються
          в командному заліку. Перемагає команда з найбільшою сумою балів.
        </p>
        <table className="rules-table">
          <thead><tr><th>Команда</th><th>Гравці</th></tr></thead>
          <tbody>
            {[
              ['Макларен',            '#FF8000', 'Ярослав · Мія'],
              ['Мерседес',             '#00D2BE', 'Іванна · Марго'],
              ['Феррарі',              '#E8002D', 'Іван · Ігор'],
              ['Альпін',               '#0090FF', 'Андрій · Валентин'],
              ['Ред Булл',             '#3671C6', 'Нептун · Хонда'],
              ['Ауді',                 '#888888', 'Чак · Калсмор'],
              ['Астон Мартін',         '#358C75', 'Ярік · Анастасія'],
              ['Альфа Ромео',          '#C92D4B', 'Софія · Стас'],
              ['Ред Булл Рейсінг',     '#1E3A8A', 'Кітасу · Миколапка'],
            ].map(([team, color, players]) => (
              <tr key={team}>
                <td><span style={{color,fontWeight:600}}>{team}</span></td>
                <td style={{color:'var(--muted)'}}>{players}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ЗАГАЛЬНІ ПРИМІТКИ */}
      <div className="rules-section">
        <div style={{fontFamily:'Orbitron,sans-serif',fontSize:11,color:'var(--red)',letterSpacing:2,marginBottom:10}}>📌 ВАЖЛИВО</div>
        <div className="rules-note" style={{marginBottom:10}}>
          <strong>Прогноз не можна змінити після закриття сесії.</strong> Після того як адмін заблокує
          сесію (зазвичай безпосередньо перед заїздом) — прогноз зафіксований.
        </div>
        <div className="rules-note" style={{marginBottom:10}}>
          <strong>Кожен пілот кваліфікації — унікальний для тебе.</strong> Система пам'ятає всіх
          пілотів, які вже випадали тобі, і більше їх не призначає.
        </div>
        <div className="rules-note">
          <strong>Бали зараховуються після кожного заїзду.</strong> Адмін вводить реальні результати
          і натискає «Зарахувати» — бали автоматично додаються до твого рахунку. Переглянути
          деталі можна у вкладці «Таблиця».
        </div>
      </div>
    </main>
  )
}
