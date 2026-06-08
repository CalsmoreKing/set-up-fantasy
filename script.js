        // Час вказано за Києвом (формат ISO з часовим поясом +03:00)
        // Для спринт-вікендів додано параметр sprint
        const gpSchedule = {
            'Монако': { qualy: '2026-06-06T15:00:00+03:00', race: '2026-06-07T15:00:00+03:00' },
            'Барселона': { qualy: '2026-06-13T15:00:00+03:00', race: '2026-06-14T15:00:00+03:00' },
            'Австрія': { qualy: '2026-06-27T15:00:00+03:00', race: '2026-06-28T15:00:00+03:00' },
            'Велика Британія': { qualy: '2026-07-04T15:00:00+03:00', race: '2026-07-05T15:00:00+03:00' },
            'Бельгія': { qualy: '2026-07-18T15:00:00+03:00', sprint: '2026-07-18T11:00:00+03:00', race: '2026-07-19T15:00:00+03:00' },
            'Угорщина': { qualy: '2026-07-25T15:00:00+03:00', race: '2026-07-26T15:00:00+03:00' },
            'Нідерланди': { qualy: '2026-08-22T15:00:00+03:00', race: '2026-08-23T15:00:00+03:00' },
            'Італія': { qualy: '2026-09-05T15:00:00+03:00', race: '2026-09-06T15:00:00+03:00' },
            'Мадрид': { qualy: '2026-09-12T15:00:00+03:00', race: '2026-09-13T15:00:00+03:00' },
            'Азербайджан': { qualy: '2026-09-25T15:00:00+03:00', race: '2026-09-26T15:00:00+03:00' },
            'Сінгапур': { qualy: '2026-10-10T20:00:00+03:00', race: '2026-10-11T20:00:00+03:00' },
            'США': { qualy: '2026-10-24T15:00:00+03:00', sprint: '2026-10-24T11:00:00+03:00', race: '2026-10-25T15:00:00+03:00' },
            'Мексика': { qualy: '2026-10-31T14:00:00+03:00', race: '2026-11-01T14:00:00+03:00' },
            'Бразилія': { qualy: '2026-11-07T14:00:00+03:00', sprint: '2026-11-07T10:00:00+03:00', race: '2026-11-08T14:00:00+03:00' },
            'Лас-Вегас': { qualy: '2026-11-20T20:00:00+03:00', race: '2026-11-21T20:00:00+03:00' },
            'Катар': { qualy: '2026-11-28T19:00:00+03:00', sprint: '2026-11-28T15:00:00+03:00', race: '2026-11-29T19:00:00+03:00' },
            'Абу-Дабі': { qualy: '2026-12-05T17:00:00+03:00', race: '2026-12-06T17:00:00+03:00' }
        };
        
        function isSessionLockedByTime(gpName, currentSession) {
            if (isAdmin) return false; 
            if (!gpSchedule[gpName] || !gpSchedule[gpName][currentSession]) return false;
            
            const sessionStartTime = new Date(gpSchedule[gpName][currentSession]).getTime();
            const currentTime = new Date().getTime();
            const minutesToStart = (sessionStartTime - currentTime) / (1000 * 60);
            
            return minutesToStart <= 30; 
        }

        function updateGPDropdown() {
            const select = document.getElementById('gp-select');
            let foundCurrent = false;
            let currentGPValue = null;
            const now = new Date().getTime();

            Array.from(select.options).forEach(opt => {
                const gpName = opt.value;
                const schedule = gpSchedule[gpName];
                
                if (schedule && schedule.race) {
                    const raceTime = new Date(schedule.race).getTime();
                    if (raceTime < now) {
                        opt.text = `✅ ${gpName}`; // Завершено
                    } else if (!foundCurrent) {
                        opt.text = `🟡 ${gpName}`; // Актуальний
                        currentGPValue = gpName;
                        foundCurrent = true;
                    } else {
                        opt.text = gpName; // Майбутній
                    }
                }
            });

            // Автовибір поточного етапу при першому завантаженні (якщо ми ще не клацали самі)
            if (currentGPValue && !window.gpAutoSelected) {
                select.value = currentGPValue;
                window.gpAutoSelected = true;
            }
        }

        // === СИСТЕМА ДОСТУПУ ===
            const f1Roster = ["HAM", "LEC", "VER", "RUS", "ANT", "HAD", "PIA", "HUL", "BOR", "BEA", "GAS", "SAI", "ALB", "LIN", "COL", "LAW", "OCO", "PER", "NOR", "ALO", "STR", "BOT"];
            const urlParams = new URLSearchParams(window.location.search);
            const isAdmin = urlParams.get('pass') === '9123';
            let myPlayer = localStorage.getItem('f1_auth_player');
            let dirtyFields = {}; // Відстежує, що саме було відредаговано до збереження

        // Ініціалізація Supabase
        const SUPABASE_URL = 'https://fvubnbkqnldsspsjduqc.supabase.co'; // Зверни увагу: без /rest/v1/ на кінці
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2dWJuYmtxbmxkc3Nwc2pkdXFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTAyNTYsImV4cCI6MjA5NjE4NjI1Nn0.VykrfV5a4e7cmPZfwUwzFRYkMuIiegW8dSXadcHW59w'; // Встав сюди свій ключ, який починається на eyJhbGciOi...
        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const teams = [
            { id: 'mclaren', n: 'McLaren', p: ['Ярослав', 'Мія'] },
            { id: 'redbull', n: 'Red Bull', p: ['Нептун', 'Хонда'] },
            { id: 'mercedes', n: 'Mercedes', p: ['Іванна', 'Марго'] },
            { id: 'audi', n: 'Audi', p: ['Чак', 'Калсмор'] },
            { id: 'ferrari', n: 'Ferrari', p: ['Іван', 'Ігор'] },
            { id: 'aston', n: 'Aston Martin', p: ['Ярік', 'Анастасія'] },
            { id: 'alpine', n: 'Alpine', p: ['Андрій', 'Валентін'] },
            { id: 'alfaromeo', n: 'Alfa Romeo', p: ['Софія', 'Стас'] },
            { id: 'rbr', n: 'Red Bull Racing', p: ['K1tasu', 'Миколапка'] }
        ];

        const teamColors = {
            mclaren: ['#FF8000', '#B14AFA'],
            redbull: ['#3366FF', '#FFC200'], 
            mercedes: ['#00D2BE', '#999999'], 
            audi: ['#555555', '#FF5A36'], 
            ferrari: ['#DC0000', '#FFFFFF'], 
            aston: ['#006F62', '#ADFF2F'], 
            alpine: ['#0090FF', '#FF69B4'], 
            alfaromeo: ['#8B0000', '#00ff00'],
            rbr: ['#1E41FF', '#CC0000'] 
        };

        const teamTextColors = {
            'mclaren': '#FF8000', 'redbull': '#FFC200', 'mercedes': '#00D2BE',
            'audi': '#FF5A36', 'ferrari': '#FFFFFF', 'aston': '#006F62',
            'alpine': '#0090FF', 'alfaromeo': '#00ff00', 'rbr': '#FFFFFF'
        };

        const tgHandles = {
            'Ярослав': '@abramiuk8', 'Мія': '@koteklewyy',
            'Нептун': '@neptunegx', 'Хонда': '@alphahonda_f1',
            'Іванна': '@ivnnbgln', 'Марго': '@marguirybak',
            'Чак': '@chaksv', 'Калсмор': '@calsmoreking',
            'Іван': '@phoenix_v0', 'Ігор': '@Igor548',
            'Ярік': '@Maximuse3', 'Анастасія': 'Anastasia💞',
            'Андрій': '@dev_andrii', 'Валентін': '@Valentin_Patseruk',
            'Софія': '@sofiadutko', 'Стас': '@mkhvka',
            'K1tasu': '@K1tasu', 'Миколапка': '@irimklvn'
        };

        const teamLogos = {
            'mclaren': 'https://cdn.jsdelivr.net/npm/simple-icons@11.0.0/icons/mclaren.svg',
            'redbull': 'https://cdn.jsdelivr.net/npm/simple-icons@11.0.0/icons/redbull.svg',
            'mercedes': 'https://cdn.jsdelivr.net/npm/simple-icons@11.0.0/icons/mercedes.svg',
            'audi': 'https://cdn.jsdelivr.net/npm/simple-icons@11.0.0/icons/audi.svg',
            'ferrari': 'https://cdn.jsdelivr.net/npm/simple-icons@11.0.0/icons/ferrari.svg',
            'aston': 'https://cdn.jsdelivr.net/npm/simple-icons@11.0.0/icons/astonmartin.svg',
            'alpine': 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Alpine_F1_Team_Logo.svg',
            'alfaromeo': 'https://cdn.jsdelivr.net/npm/simple-icons@11.0.0/icons/alfaromeo.svg',
            'rbr': 'data:image/svg+xml;utf8,<svg viewBox="0 0 500 500" fill="%23FFFFFF" xmlns="http://www.w3.org/2000/svg"><path d="M250,20 C123.5,20 20,123.5 20,250 C20,376.5 123.5,480 250,480 C376.5,480 480,376.5 480,250 C480,123.5 376.5,20 250,20 Z M250,50 C360.5,50 450,139.5 450,250 C450,360.5 360.5,450 250,450 C139.5,450 50,360.5 50,250 C50,139.5 139.5,50 250,50 Z M208.5,130.5 L125.5,365.5 L174,365.5 L192.5,310.5 L307.5,310.5 L326,365.5 L374.5,365.5 L291.5,130.5 L208.5,130.5 Z M250,185 L293.5,274.5 L206.5,274.5 L250,185 Z M120,210 L120,250 L380,250 L380,210 L120,210 Z"/></svg>'
        };

        const getGpIndex = (gpName) => {
            const opts = document.getElementById('gp-select').options;
            for(let i=0; i<opts.length; i++) { if(opts[i].value === gpName) return i; }
            return -1;
        };

        const getPlayerColor = (playerName) => {
            if (playerName === '—') return '#fff';
            let teamObj = teams.find(t => t.p.includes(playerName));
            if (!teamObj) return '#fff';
            let idx = teamObj.p.indexOf(playerName);
            return teamColors[teamObj.id][idx] || teamColors[teamObj.id][0];
        };

        const getColorHtml = (namesArr, isTeam = false) => {
            if (!namesArr || namesArr.length === 0 || namesArr[0] === '—') return '#fff';
            let main = namesArr[0];
            let tObj = isTeam ? teams.find(t => t.n === main) : teams.find(t => t.p.includes(main));
            return tObj ? teamTextColors[tObj.id] : '#fff';
        };

        function declOfNum(n, text_forms) {
            n = Math.abs(n) % 100;
            var n1 = n % 10;
            if (n > 10 && n < 20) { return text_forms[2]; }
            if (n1 > 1 && n1 < 5) { return text_forms[1]; }
            if (n1 == 1) { return text_forms[0]; }
            return text_forms[2];
        }

        let sess = 'race';
        // Оголошуємо змінні порожніми
        let db = { st: {}, hist: {}, prevOrder: [], qDrivers: {} };
        let allTmp = {};
        let isDataLoaded = false;

        async function initCloudDB() {
            try {
                const { data, error } = await supabaseClient.from('f1_data').select('*');
                if (error) throw error;

                if (data && data.length > 0) {
                    let mainRow = data.find(row => row.id === 'main_db');
                    let tmpRow = data.find(row => row.id === 'tmp_db');
                    
                    if (mainRow && mainRow.data) {
                        // Зберігаємо хардкод-гравців перед злиттям
                        const hardcodedSt = db.st ? JSON.parse(JSON.stringify(db.st)) : {};
                        
                        db = mainRow.data; // Отримуємо хмарні дані
                        
                        // Відновлюємо хардкод і зливаємо з хмарою (хмара має пріоритет)
                        db.st = { ...hardcodedSt, ...(db.st || {}) };
                    }
                    if (tmpRow && tmpRow.data) allTmp = tmpRow.data;
                }
                
                // Базові перевірки структури
                if (!db.qDrivers) db.qDrivers = {};
                if (!db.st) db.st = {};

                isDataLoaded = true;
                applyNewbieBonuses();
                
                if (typeof updateTables === 'function') updateTables();
                if (typeof render === 'function') render();
                
            } catch (err) {
                console.error("Не вдалося завантажити базу з Supabase, використовуємо локальну:", err);
                const hardcodedSt = db.st ? JSON.parse(JSON.stringify(db.st)) : {};
                
                db = JSON.parse(localStorage.getItem('f1_v14_db')) || db;
                db.st = { ...hardcodedSt, ...(db.st || {}) };
                
                allTmp = JSON.parse(localStorage.getItem('f1_v14_allTmp')) || allTmp;
                
                isDataLoaded = true;
                applyNewbieBonuses(); 

                if (typeof updateTables === 'function') updateTables();
                if (typeof render === 'function') render();
                changeGP();
            }
        }

        // Запускаємо завантаження
        initCloudDB();

        // --- МІГРАЦІЯ БАЗИ ДАНИХ: Ася -> Софія ---
        let needsSave = false;
        
        // 1. Загальний залік
        if (db.st && db.st['Ася']) {
            db.st['Софія'] = db.st['Ася'];
            delete db.st['Ася'];
            needsSave = true;
        }
        
        // 2. Історія Гран-прі
        for (let gp in db.hist) {
            if (db.hist[gp]['Ася']) {
                db.hist[gp]['Софія'] = db.hist[gp]['Ася'];
                delete db.hist[gp]['Ася'];
                needsSave = true;
            }
        }
        
        // 3. Попередній порядок (для стрілочок +/-)
        if (db.prevOrder) {
            let idx = db.prevOrder.indexOf('Ася');
            if (idx !== -1) {
                db.prevOrder[idx] = 'Софія';
                needsSave = true;
            }
        }
        
        // 4. Призначені пілоти на кваліфікацію
        for (let gp in db.qDrivers) {
            if (db.qDrivers[gp]['Ася']) {
                db.qDrivers[gp]['Софія'] = db.qDrivers[gp]['Ася'];
                delete db.qDrivers[gp]['Ася'];
                needsSave = true;
            }
        }

        // 5. Тимчасові прогнози (LIVE)
        for (let gp in allTmp) {
            ['qualy', 'sprint', 'race'].forEach(s => {
                if (allTmp[gp][s] && allTmp[gp][s].p && allTmp[gp][s].p['Ася'] !== undefined) {
                    allTmp[gp][s].p['Софія'] = allTmp[gp][s].p['Ася'];
                    delete allTmp[gp][s].p['Ася'];
                    
                    if (allTmp[gp][s].fl && allTmp[gp][s].fl['Ася'] !== undefined) {
                        allTmp[gp][s].fl['Софія'] = allTmp[gp][s].fl['Ася'];
                        delete allTmp[gp][s].fl['Ася'];
                    }
                    if (allTmp[gp][s].c && allTmp[gp][s].c['Ася'] !== undefined) {
                        allTmp[gp][s].c['Софія'] = allTmp[gp][s].c['Ася'];
                        delete allTmp[gp][s].c['Ася'];
                    }
                    needsSave = true;
                }
            });
        }

        // --- МІГРАЦІЯ БАЗИ ДАНИХ: vvm -> Стас ---
        // 1. Загальний залік
        if (db.st && db.st['vvm']) {
            db.st['Стас'] = db.st['vvm'];
            delete db.st['vvm'];
            needsSave = true;
        }
        
        // 2. Історія Гран-прі
        for (let gp in db.hist) {
            if (db.hist[gp]['vvm']) {
                db.hist[gp]['Стас'] = db.hist[gp]['vvm'];
                delete db.hist[gp]['vvm'];
                needsSave = true;
            }
        }
        
        // 3. Попередній порядок
        if (db.prevOrder) {
            let idx = db.prevOrder.indexOf('vvm');
            if (idx !== -1) {
                db.prevOrder[idx] = 'Стас';
                needsSave = true;
            }
        }
        
        // 4. Призначені пілоти на кваліфікацію
        for (let gp in db.qDrivers) {
            if (db.qDrivers[gp]['vvm']) {
                db.qDrivers[gp]['Стас'] = db.qDrivers[gp]['vvm'];
                delete db.qDrivers[gp]['vvm'];
                needsSave = true;
            }
        }

        // 5. Тимчасові прогнози (LIVE)
        for (let gp in allTmp) {
            ['qualy', 'sprint', 'race'].forEach(s => {
                if (allTmp[gp][s] && allTmp[gp][s].p && allTmp[gp][s].p['vvm'] !== undefined) {
                    allTmp[gp][s].p['Стас'] = allTmp[gp][s].p['vvm'];
                    delete allTmp[gp][s].p['vvm'];
                    
                    if (allTmp[gp][s].fl && allTmp[gp][s].fl['vvm'] !== undefined) {
                        allTmp[gp][s].fl['Стас'] = allTmp[gp][s].fl['vvm'];
                        delete allTmp[gp][s].fl['vvm'];
                    }
                    if (allTmp[gp][s].c && allTmp[gp][s].c['vvm'] !== undefined) {
                        allTmp[gp][s].c['Стас'] = allTmp[gp][s].c['vvm'];
                        delete allTmp[gp][s].c['vvm'];
                    }
                    needsSave = true;
                }
            });
        }

        // Зберігаємо оновлену базу
        if (needsSave) {
            localStorage.setItem('f1_v14_db', JSON.stringify(db));
            localStorage.setItem('f1_v14_allTmp', JSON.stringify(allTmp));
        }
        // --- КІНЕЦЬ МІГРАЦІЇ ---

// --- ПОВНИЙ ПЕРЕРАХУНОК ЗАГАЛЬНОГО ЗАЛІКУ ---
        Object.keys(db.st).forEach(p => {
            let correctPts = 0;
            Object.values(db.hist).forEach(gpData => {
                if (gpData[p]) {
                    correctPts += (gpData[p].q + gpData[p].s + gpData[p].r + (gpData[p].b || 0));
                }
            });
            db.st[p].pts = correctPts;
        });
        localStorage.setItem('f1_v14_db', JSON.stringify(db));
        // --- КІНЕЦЬ ПЕРЕРАХУНКУ ---
        
        let sortCol = 'total';

        function getTmp() {
            const gp = document.getElementById('gp-select').value;
            if (!allTmp[gp]) {
                allTmp[gp] = { qualy: { r: "", p: {}, fl: {}, c: {} }, sprint: { r: "", p: {}, fl: {}, c: {} }, race: { r: "", p: {}, fl: {}, c: {} } };
            }
            return allTmp[gp];
        }

        let tmp = getTmp();
        let editTargetGP = '';
        let editTargetPlayer = '';

        function applyNewbieBonuses() {
            // Жорсткий запобіжник від подвійного нарахування після імпорту
            if (db.bonusesSynced) return;

            const bonuses = {
                'Австралія': { 'Ярік': 18, 'Анастасія': 18, 'Андрій': 18, 'Валентін': 18, 'Софія': 18, 'Стас': 18, 'K1tasu': 18, 'Миколапка': 18 },
                'Китай': { 'Ярік': 9, 'Анастасія': 9, 'Андрій': 9, 'Валентін': 9, 'Софія': 9, 'Стас': 9, 'K1tasu': 9, 'Миколапка': 9 },
                'Японія': { 'Андрій': 11, 'Валентін': 11, 'Софія': 11, 'Стас': 11, 'K1tasu': 11, 'Миколапка': 11 },
                'Маямі': { 'K1tasu': 5, 'Миколапка': 5 },
                'Канада': { 'Стас': 8, 'K1tasu': 8, 'Миколапка': 8 }
            };
            
            let changed = false;
            
            if (!db.hist) db.hist = {};

            for (const [gp, players] of Object.entries(bonuses)) {
                if (!db.hist[gp]) db.hist[gp] = {};
                for (const [p, pts] of Object.entries(players)) {
                    if (!db.hist[gp][p]) db.hist[gp][p] = { q:0, s:0, r:0, b:0, bd: {q:'', s:'', r:''} };
                    
                    let oldBonus = db.hist[gp][p].b || 0;
                    if (oldBonus !== pts) {
                        db.hist[gp][p].b = pts; 
                        
                        if (!db.st[p]) {
                            let tObj = teams.find(t => t.p.includes(p));
                            db.st[p] = { t: tObj ? tObj.n : '', pts: 0 };
                        }
                        db.st[p].pts += (pts - oldBonus);
                        changed = true;
                    }
                }
            }
            
            if (changed) {
                db.bonusesSynced = true; // Блокуємо повторне виконання для цієї версії бази
                save();
                if (typeof updateTables === 'function') updateTables();
            }
        }

        function switchTab(tabId, btnElem) {
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            
            document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
            if(btnElem) btnElem.classList.add('active');

            if(tabId === 'tab-h2h') setTimeout(renderH2H, 50); 
            if(tabId === 'tab-perf') setTimeout(initChart, 50); 
            if(tabId === 'tab-details') updateDetailsTable();
        }

        function goToGP(gpName, e) {
            if(e) e.stopPropagation();
            if(!gpName) return;
            let btn = document.getElementById('nav-btn-details');
            switchTab('tab-details', btn);
            document.getElementById('gp-select-details').value = gpName;
            updateDetailsTable();
        }

        // === ГЛОБАЛЬНІ ЗМІННІ ДЛЯ ЧЕРГИ ЗБЕРЕЖЕНЬ ===
        let isSaving = false;
        let pendingSave = false;

        // === РОЗУМНЕ ЗБЕРЕЖЕННЯ З БЛОКУВАННЯМ ПОТОКІВ ===
        async function save() {
            // Якщо збереження вже йде, ставимо наступне в чергу і скасовуємо паралельний запуск
            if (isSaving) {
                pendingSave = true;
                console.log("⏳ Збереження вже йде. Запит поставлено в чергу...");
                return;
            }
            
            isSaving = true;
            console.log("=== ПОЧАТОК ЗБЕРЕЖЕННЯ (SAVE) ===");

            if (!db || !db.st || Object.keys(db.st).length === 0) {
                isSaving = false;
                return;
            }

            try {
                // Фіксуємо поточні мітки і одразу очищаємо глобальний об'єкт.
                // Це гарантує, що якщо ти введеш щось НОВЕ під час збереження, воно не загубиться.
                let activeDirty = { ...dirtyFields };
                dirtyFields = {};

                const { data, error } = await supabaseClient.from('f1_data').select('*');
                if (error) throw error;

                let cloudMain = data.find(row => row.id === 'main_db')?.data || {};
                let cloudTmp = data.find(row => row.id === 'tmp_db')?.data || {};

                if (!db.pins) db.pins = {};

                // Злиття лічильників змін
                if (!db.changes) db.changes = {};
                if (cloudMain.changes) {
                    for (let gpKey in cloudMain.changes) {
                        if (!db.changes[gpKey]) db.changes[gpKey] = {};
                        for (let pName in cloudMain.changes[gpKey]) {
                            if (!db.changes[gpKey][pName]) {
                                db.changes[gpKey][pName] = cloudMain.changes[gpKey][pName];
                            }
                        }
                    }
                }

                if (cloudMain.pins) {
                    for (let pName in cloudMain.pins) {
                        if (pName !== myPlayer || !db.pins[pName]) db.pins[pName] = cloudMain.pins[pName];
                    }
                }

                for (let gpKey in allTmp) {
                    if (!cloudTmp[gpKey]) continue; 
                    ['qualy', 'sprint', 'race'].forEach(s => {
                        if (!allTmp[gpKey][s]) allTmp[gpKey][s] = { p: {}, fl: {}, c: {}, r: "" };
                        if (!cloudTmp[gpKey][s]) cloudTmp[gpKey][s] = { p: {}, fl: {}, c: {}, r: "" };

                        let cP = cloudTmp[gpKey][s].p || {}; 
                        let cFl = cloudTmp[gpKey][s].fl || {}; 
                        let cC = cloudTmp[gpKey][s].c || {};

                        let lP = allTmp[gpKey][s].p; 
                        let lFl = allTmp[gpKey][s].fl; 
                        let lC = allTmp[gpKey][s].c;

                        const allPlayers = teams.flatMap(t => t.p);
                        allPlayers.forEach(pName => {
                            // Використовуємо activeDirty, щоб перевірити, чи міняли ми це поле щойно
                            if (pName !== myPlayer && !activeDirty[`${gpKey}_${s}_p_${pName}`]) {
                                if (cP[pName] !== undefined && cP[pName] !== null) lP[pName] = cP[pName];
                            }
                            if (pName !== myPlayer && !activeDirty[`${gpKey}_${s}_fl_${pName}`]) {
                                if (cFl[pName] !== undefined && cFl[pName] !== null) lFl[pName] = cFl[pName];
                            }
                            if (pName !== myPlayer && !activeDirty[`${gpKey}_${s}_c_${pName}`]) {
                                if (cC[pName] !== undefined && cC[pName] !== null) lC[pName] = cC[pName];
                            }
                        });
                    });
                }

                localStorage.setItem('f1_v14_db', JSON.stringify(db));
                localStorage.setItem('f1_v14_allTmp', JSON.stringify(allTmp));

                const { error: upsertError } = await supabaseClient.from('f1_data').upsert([
                    { id: 'main_db', data: db },
                    { id: 'tmp_db', data: allTmp }
                ]);
                if (upsertError) throw upsertError;
                
                console.log("✅ 4. УСПІХ! Дані зафіксовано в хмарі.");

            } catch(err) { 
                console.error("❌ Помилка збереження:", err); 
            } finally {
                // Знімаємо блокування
                isSaving = false;
                
                // Якщо за час збереження накопичилися нові зміни - запускаємо процес ще раз
                if (pendingSave) {
                    pendingSave = false;
                    console.log("🔄 Запуск відкладеного збереження з черги...");
                    save(); 
                }
            }
        }

        const TELEGRAM_BOT_TOKEN = '8922387886:AAG0NLq3FY5Zsl1lTbDGcuhCKZsE-g0b9uk'; // Встав сюди токен від BotFather
        const TELEGRAM_CHAT_ID = '-1003958806927';

        async function sendTelegramNotification() {
            const gpName = document.getElementById('gp-select').value;
            const siteUrl = "https://calsmoreking.github.io/set-up-fantasy/";
            const message = `🏁 Результати Гран-прі (${gpName}) зафіксовано!\n\nОновлений загальний залік вже доступний на сайті:\n${siteUrl}`;

            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: message
                    })
                });
                
                if (response.ok) {
                    alert('Повідомлення успішно відправлено в групу!');
                } else {
                    console.error('Помилка Telegram API:', await response.text());
                    alert('Помилка відправки. Перевір консоль.');
                }
            } catch (error) {
                console.error('Помилка мережі:', error);
                alert('Не вдалося з\'єднатися з Telegram.');
            }
        }

        function changeGP() {
            updateGPDropdown(); 
            
            const gp = document.getElementById('gp-select').value;
            const btnSprint = document.getElementById('btn-sprint');
            
            // Якщо в gpSchedule для цього етапу немає ключа 'sprint' — ховаємо кнопку
            if (gpSchedule[gp] && !gpSchedule[gp].sprint) {
                if (btnSprint) btnSprint.style.display = 'none';
                if (sess === 'sprint') {
                    sess = 'qualy'; // Якщо гравець був на спринті, перекидаємо на квалу
                    document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
                    document.getElementById('btn-qualy').classList.add('active');
                }
            } else {
                if (btnSprint) btnSprint.style.display = 'inline-block';
            }

            tmp = getTmp();
            render();
            updateTables();
            updateChartData(); 
        }

        function exportDB() {
            const data = { db: db, allTmp: allTmp };
            const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `f1_league_backup_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function importDB(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const data = JSON.parse(evt.target.result);
                    if (data.db) {
                        db = data.db; 
                        if(!db.qDrivers) db.qDrivers = {};
                        if (data.allTmp) { allTmp = data.allTmp; } 
                        else if (data.tmp) { allTmp = {}; allTmp[document.getElementById('gp-select').value] = data.tmp; }
                        
                        applyNewbieBonuses(); 
                        tmp = getTmp();
                        save(); render(); updateTables(); renderH2H(); updateChartData(); updateDetailsTable();
                        alert("Базу успішно відновлено!");
                    } else { alert("Невірний формат файлу!"); }
                } catch(err) { alert("Помилка читання файлу! Переконайтесь, що це правильний JSON."); }
                document.getElementById('file-import').value = "";
            };
            reader.readAsText(file);
        }

        function setS(s) {
            sess = s;
            document.querySelectorAll('.header-panel .btn').forEach(b => b.classList.remove('active'));
            document.getElementById('btn-'+s).classList.add('active');
            document.getElementById('sess-label').innerText = s === 'qualy' ? 'Кваліфікація' : s === 'sprint' ? 'Спринт' : 'Гонка';
            render();
        }

        function autoFormat(elem, pName) {
            if (elem.readOnly) return; 
            let val = elem.value.trim().toUpperCase();
            if (val === '') return; // Ігноруємо пусті поля

            // 1. Перевірка на Швидке коло (FL, ФЛ, Швид, Найшвидше)
            const flMatch = val.match(/^(?:ШВИД|ШВИДКЕ КОЛО|НАЙШВИДШЕ|FL|ФЛ|КОЛО)[\s:\-.,_]*([A-ZА-Я]{3})$/i);
            
            // 2. Перевірка на позицію (напр. 1 ver, 1.ver, 1_ver, 1-ver)
            const posMatch = val.match(/^(\d+)[\s\-.,_]+([A-ZА-Я]{3})$/i);

            if (flMatch) {
                val = `ШВИДКЕ КОЛО - ${flMatch[1]}`;
            } else if (posMatch) {
                val = `${posMatch[1]} - ${posMatch[2]}`;
            } else {
                alert(`⚠️ Формат не розпізнано: "${val}".\nВикористовуйте формати: "1 - VER" або "Швидке коло - VER".`);
                elem.focus(); // Повертаємо курсор для виправлення
                return; // Зупиняємо збереження помилкового формату
            }

            elem.value = val;
            tmp[sess].p[pName] = val;
            
            const gp = document.getElementById('gp-select').value;
            dirtyFields[`${gp}_${sess}_p_${pName}`] = true;
            
            console.log(`[ЗБЕРЕЖЕННЯ] Формат виправлено для ${pName}:`, val);
            logChange(pName, `Змінив текст прогнозу на: ${val}`, myPlayer || "Гість");
            save(); 
        }

        function render() {
            // === НАДІЙНИЙ ФІКС АВТОРИЗАЦІЇ ===
            const urlParams = new URLSearchParams(window.location.search);
            const isAdmin = urlParams.get('pass') === '9123';
            const myPlayer = localStorage.getItem('f1_auth_player');
            // ==================================

            const grid = document.getElementById('main-grid');
            grid.innerHTML = '';
            grid.className = 'compact-grid';
            
            const gp = document.getElementById('gp-select').value;
            const gpIdx = getGpIndex(gp);
            const isNewQualy = (sess === 'qualy' && gpIdx >= getGpIndex('Канада'));

            const btnRand = document.getElementById('btn-random-qualy');
            
            // БЛОКУВАННЯ ІНТЕРФЕЙСУ ДЛЯ НЕ-АДМІНІВ
            const realInput = document.getElementById('real-input');
            if (!isAdmin) {
                btnRand.style.display = 'none';
                realInput.style.display = 'none'; // Приховуємо поле реальних результатів від гравців
            } else {
                if (isNewQualy) btnRand.style.display = 'inline-flex';
                else btnRand.style.display = 'none';
                
                realInput.style.display = 'block';
                realInput.value = tmp[sess].r || '';
                if(isNewQualy) realInput.placeholder = "Введіть усі 22 позиції кваліфікації...";
                else if (sess === 'qualy') realInput.placeholder = "Введіть володаря поулу (напр. 1 - VER)...";
                else realInput.placeholder = "Вводьте результати сюди, щоб бачити LIVE бали...";
                
                realInput.style.height = '50px'; 
                realInput.style.height = realInput.scrollHeight + 'px';
            }

            const timeLocked = isSessionLockedByTime(gp, sess);

            teams.forEach(t => {
                const teamBlock = document.createElement('div');
                teamBlock.className = `team-block ${t.id}`;
                
                t.p.forEach(p => {
                    const isC = tmp[sess].c[p];
                    const row = document.createElement('div');
                    row.className = `player-row ${isC ? 'confirmed' : ''}`;

                    // Перевірка ліміту
                    let changesCount = (db.changes && db.changes[gp] && db.changes[gp][p] && db.changes[gp][p][sess]) ? db.changes[gp][p][sess] : 0;
                    const isLockedPermanently = isC && changesCount >= 1 && !isAdmin;

                    const canEdit = isAdmin || (myPlayer === p && !isC);
                    const isLockedForMe = !isAdmin && myPlayer !== p;

                    let lockAction = '';
                    if (isLockedForMe) {
                        lockAction = `onclick="checkAuth('${p}')" readonly style="background: #2a2a2a; color: #aaa; cursor: pointer;" title="Авторизуватись"`;
                    } else if (timeLocked) {
                        lockAction = 'readonly disabled style="background: #331a00; color: #888; cursor: not-allowed;" title="Час вийшов (менше 30 хв до старту)"';
                    } else if (isLockedPermanently) {
                        lockAction = 'readonly disabled style="background: #4a0000; color: #888; cursor: not-allowed;" title="Ліміт змін вичерпано"';
                    } else if (!canEdit) {
                        lockAction = 'readonly disabled style="background: #2a2a2a; color: #888;"';
                    }

                    const flHTML = (sess === 'race') 
                        ? `<input class="p-fl" value="${tmp[sess].fl[p] || ''}" oninput="updFL('${p}', this.value)" placeholder="Шв. коло" ${lockAction}>` 
                        : '';

                    let inputHTML = '';
                    if (isNewQualy) {
                        let assignedDriver = (db.qDrivers[gp] && db.qDrivers[gp][p]) ? db.qDrivers[gp][p] : '???';
                        let assignClick = isAdmin ? `onclick="openDriverModal('${gp}', '${p}')"` : '';
                        inputHTML = `
                            <div class="q-assigned" title="${isAdmin ? 'Змінити пілота' : ''}" ${assignClick}>${assignedDriver}</div>
                            <input type="number" min="1" max="22" class="p-pred" style="width: 80px; flex: none; text-align: center; font-size: 16px;" value="${tmp[sess].p[p] || ''}" oninput="updP('${p}', this.value)" placeholder="Місце" ${lockAction}>
                        `;
                    } else {
                        inputHTML = `<textarea class="p-pred" oninput="updP('${p}', this.value)" onblur="autoFormat(this, '${p}')" placeholder="${isLockedForMe ? '🔒 Натисніть для входу...' : 'Прогноз...'}" ${lockAction}>${tmp[sess].p[p] || ''}</textarea>`;
                    }

                    let btnCheckHTML = '';
                    if (isAdmin || myPlayer === p) {
                        if (timeLocked) {
                            btnCheckHTML = `<button class="btn-check" style="background: #331a00; border-color: #e67e22; cursor: not-allowed;" title="Час вийшов">⏳</button>`;
                        } else if (isLockedPermanently) {
                            btnCheckHTML = `<button class="btn-check" style="background: #4a0000; border-color: #ff3e3e; cursor: not-allowed;" title="Заблоковано">🔒</button>`;
                        } else {
                            btnCheckHTML = `
                                <button class="btn-check" onclick="togC('${p}')" title="${isC ? 'Скасувати' : 'Затвердити'}">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                </button>`;
                        }
                    }

                    row.innerHTML = `
                        <div class="p-info">
                            <span class="p-name">${p}</span>
                            <span class="p-tag">${tgHandles[p] || ''}</span>
                        </div>
                        <div class="p-input-zone">
                            ${inputHTML}
                            ${flHTML}
                        </div>
                        <div class="p-live-pts" id="live-badge-${p}">0</div>
                        ${btnCheckHTML}
                    `;
                    teamBlock.appendChild(row);
                });
                grid.appendChild(teamBlock);
            });
            updateLiveBadges();
        }

        function randomizeQualyDrivers() {
            const gp = document.getElementById('gp-select').value;
            if(!db.qDrivers) db.qDrivers = {};
            
            if(confirm("Згенерувати випадкових унікальних пілотів для всіх гравців на цей етап? Попередній розподіл для цього етапу буде перезаписано.")){
                db.qDrivers[gp] = {};
                const allPlayers = teams.flatMap(t => t.p);
                
                let success = false;
                for(let attempt = 0; attempt < 100; attempt++) {
                    let tempAssignment = {};
                    let poolForThisGP = [...f1Roster]; 
                    let failed = false;

                    let shuffledPlayers = [...allPlayers].sort(() => Math.random() - 0.5);

                    for (let p of shuffledPlayers) {
                        let usedByPlayer = [];
                        for (let pastGp in db.qDrivers) {
                            if (pastGp !== gp && db.qDrivers[pastGp][p]) {
                                usedByPlayer.push(db.qDrivers[pastGp][p]);
                            }
                        }

                        let availableForP = poolForThisGP.filter(d => !usedByPlayer.includes(d));

                        if (availableForP.length === 0) {
                            failed = true;
                            break;
                        }

                        let picked = availableForP[Math.floor(Math.random() * availableForP.length)];
                        tempAssignment[p] = picked;
                        poolForThisGP = poolForThisGP.filter(d => d !== picked); 
                    }

                    if (!failed) {
                        db.qDrivers[gp] = tempAssignment;
                        success = true;
                        break;
                    }
                }

                if (success) {
                    save();
                    render();
                } else {
                    alert("Помилка генерації! Можливо, пілотів не вистачає для унікального розподілу.");
                }
            }
        }

        function openDriverModal(gp, pName) {
            editTargetGP = gp;
            editTargetPlayer = pName;
            document.getElementById('edit-driver-title').innerText = `Пілот для: ${pName}`;
            
            let current = (db.qDrivers[gp] && db.qDrivers[gp][pName]) ? db.qDrivers[gp][pName] : '';
            document.getElementById('manual-driver-input').value = current;

            document.getElementById('edit-driver-modal').style.display = 'flex';
        }

        function closeDriverModal() {
            document.getElementById('edit-driver-modal').style.display = 'none';
        }

        function generateSingleDriver() {
            if(!db.qDrivers[editTargetGP]) db.qDrivers[editTargetGP] = {};
            let usedInCurrentGp = Object.values(db.qDrivers[editTargetGP]);
            let usedByPlayer = [];
            for (let pastGp in db.qDrivers) {
                if (pastGp !== editTargetGP && db.qDrivers[pastGp][editTargetPlayer]) {
                    usedByPlayer.push(db.qDrivers[pastGp][editTargetPlayer]);
                }
            }
            let available = f1Roster.filter(d => !usedInCurrentGp.includes(d) && !usedByPlayer.includes(d));
            if (available.length > 0) {
                let picked = available[Math.floor(Math.random() * available.length)];
                db.qDrivers[editTargetGP][editTargetPlayer] = picked;
                save();
                render();
                closeDriverModal();
            } else {
                alert("Немає доступних пілотів для цього гравця (всі розібрані на цьому етапі або вже використовувались ним раніше)!");
            }
        }

        function saveManualDriver() {
            let val = document.getElementById('manual-driver-input').value.trim().toUpperCase();
            if (val.length === 3) {
                if(!db.qDrivers[editTargetGP]) db.qDrivers[editTargetGP] = {};
                db.qDrivers[editTargetGP][editTargetPlayer] = val;
                save();
                render();
                closeDriverModal();
            } else {
                alert("Введіть 3 літери!");
            }
        }

        function clearManualDriver() {
            if(db.qDrivers[editTargetGP]) {
                delete db.qDrivers[editTargetGP][editTargetPlayer];
                save();
                render();
                closeDriverModal();
            }
        }

        // === ФУНКЦІЇ ВВОДУ ТА МІТКИ РЕДАГУВАННЯ ===
        function updP(p, v) { 
            tmp[sess].p[p] = v; 
            const gp = document.getElementById('gp-select').value;
            dirtyFields[`${gp}_${sess}_p_${p}`] = true; // Ставимо мітку, що це поле змінено локально
        }
        
        function updFL(p, v) { 
            tmp[sess].fl[p] = v; 
            const gp = document.getElementById('gp-select').value;
            dirtyFields[`${gp}_${sess}_fl_${p}`] = true;
        }
        
        function syncRealInput(elem) {
            let val = elem.value;
            let realInput = document.getElementById('real-input');
            let modalInput = document.getElementById('live-modal-real-input');
            
            realInput.value = val;
            modalInput.value = val;
            
            realInput.style.height = '50px'; 
            realInput.style.height = realInput.scrollHeight + 'px';
            modalInput.style.height = '60px';
            modalInput.style.height = modalInput.scrollHeight + 'px';

            tmp[sess].r = val;
            save();
            updateLiveBadges();
            if (document.getElementById('live-modal').style.display === 'flex') {
                renderLiveModalTable();
            }
        }

        async function togC(pName) { 
            const gp = document.getElementById('gp-select').value;

            if (!isAdmin && myPlayer !== pName) {
                alert("Ви можете затверджувати лише свій прогноз!");
                return;
            }

            // Ініціалізація лічильника змін
            if (!db.changes) db.changes = {};
            if (!db.changes[gp]) db.changes[gp] = {};
            if (!db.changes[gp][pName]) db.changes[gp][pName] = { qualy: 0, sprint: 0, race: 0 };

            let isCurrentlyConfirmed = tmp[sess].c[pName];

            if (isCurrentlyConfirmed) {
                // Спроба розблокувати
                if (!isAdmin && db.changes[gp][pName][sess] >= 1) {
                    alert("Ліміт змін вичерпано. Прогноз заблоковано остаточно.");
                    return;
                }
                if (!isAdmin) {
                    if (!confirm("Увага! Ви маєте лише 1 спробу на зміну після затвердження. Розблокувати?")) return;
                    db.changes[gp][pName][sess]++;
                }
                tmp[sess].c[pName] = false;
            } else {
                // Затвердження
                tmp[sess].c[pName] = true;
            }

            // Запис дії в лог
            logChange(pName, tmp[sess].c[pName] ? "Затвердив прогноз" : "Розблокував прогноз", myPlayer || "Гість");

            dirtyFields[`${gp}_${sess}_c_${pName}`] = true;
            
            await save(); 
            let scrollY = window.scrollY; 
            render(); 
            window.scrollTo(0, scrollY); 
        }
        
        function confirmAll() { 
        const gp = document.getElementById('gp-select').value;
        teams.forEach(t => t.p.forEach(p => {
            tmp[sess].c[p] = true; 
            
            // ПРИМУСОВІ МІТКИ: кажемо базі, що адмін щойно затвердив ці поля,
            // тому Supabase НЕ МАЄ ПРАВА затирати їх пустими даними з хмари.
            dirtyFields[`${gp}_${sess}_c_${p}`] = true;
            dirtyFields[`${gp}_${sess}_p_${p}`] = true;
            dirtyFields[`${gp}_${sess}_fl_${p}`] = true;
        })); 
        save(); 
        let scrollY = window.scrollY; 
        render(); 
        window.scrollTo(0, scrollY); 
    }

        function importFromText() {
            const text = document.getElementById('bulk-import').value;
            const aliases = { 'АЛЬФАХОНДА': 'Хонда', 'НАСТЯ': 'Анастасія', 'ВАЛЕНТИН': 'Валентін' };
            const pMap = [];
            
            teams.forEach(t => t.p.forEach(p => pMap.push({ s: p, r: p })));
            Object.entries(aliases).forEach(([alias, real]) => pMap.push({ s: alias, r: real }));
            pMap.sort((a,b) => b.s.length - a.s.length);

            let currentMatchedPlayer = null;
            let parsedData = {};

            const lines = text.split('\n');
            const gp = document.getElementById('gp-select').value; 
            const gpIdx = getGpIndex(gp);
            const isNewQualy = (sess === 'qualy' && gpIdx >= getGpIndex('Канада'));

            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine === '') return;

                let isHeaderOrInline = false;
                for (let item of pMap) {
                    const inlineRegex = new RegExp("^\\s*" + item.s + "\\s*[:\\-–]\\s*(.+)$", "i");
                    const inlineMatch = trimmedLine.match(inlineRegex);
                    if (inlineMatch && inlineMatch[1].trim() !== '') {
                        parsedData[item.r] = [inlineMatch[1].trim()];
                        currentMatchedPlayer = null; 
                        isHeaderOrInline = true;
                        break;
                    }
                    const headerRegex = new RegExp("^\\s*" + item.s + "\\s*:?\\s*$", "i");
                    if (headerRegex.test(trimmedLine)) {
                        currentMatchedPlayer = item.r;
                        if (!parsedData[item.r]) parsedData[item.r] = [];
                        isHeaderOrInline = true;
                        break;
                    }
                }

                if (!isHeaderOrInline) {
                    const isPrediction = /^(?:\d|Швид|Найшвид|Коло|FL|Q|Квалі)/i.test(trimmedLine);
                    
                    if (!isPrediction && currentMatchedPlayer) {
                        let userInput = prompt(`⚠️ Перевірка рядка:\n"${trimmedLine}"\n\n(Зараз записуємо для: ${currentMatchedPlayer})\n\nЩо з цим робити?\n• Якщо це коментар гравця — натисніть "ОК" (пусте поле).\n• Якщо це гравець з помилкою в імені — напишіть його правильне ім'я.\n• Якщо це неактивний гравець — натисніть "Скасувати".`);
                        
                        if (userInput === null) {
                            currentMatchedPlayer = null;
                        } else if (userInput.trim() !== '') {
                            const typedName = userInput.trim().toLowerCase();
                            const matchedName = teams.flatMap(t => t.p).find(n => n.toLowerCase() === typedName);
                            if (matchedName) {
                                currentMatchedPlayer = matchedName;
                                if (!parsedData[matchedName]) parsedData[matchedName] = [];
                            } else {
                                alert(`Гравця "${userInput}" немає в базі! Цей блок буде пропущено.`);
                                currentMatchedPlayer = null;
                            }
                        } else {
                            parsedData[currentMatchedPlayer].push(trimmedLine);
                        }
                    } else if (!isPrediction && !currentMatchedPlayer) {
                        let userInput = prompt(`⚠️ Нерозпізнаний текст або неактивний гравець:\n"${trimmedLine}"\n\nКому призначити цей блок?\n• Введіть ім'я з бази, щоб зарахувати.\n• Натисніть "Скасувати", щоб пропустити цей текст.`);
                        
                        if (userInput && userInput.trim() !== '') {
                            const typedName = userInput.trim().toLowerCase();
                            const matchedName = teams.flatMap(t => t.p).find(n => n.toLowerCase() === typedName);
                            if (matchedName) {
                                currentMatchedPlayer = matchedName;
                                if (!parsedData[matchedName]) parsedData[matchedName] = [];
                            } else {
                                alert(`Гравця "${userInput}" немає в базі! Пропускаємо.`);
                                currentMatchedPlayer = null;
                            }
                        }
                    } else if (isPrediction && currentMatchedPlayer) {
                        parsedData[currentMatchedPlayer].push(trimmedLine);
                    }
                }
            });

            let importedCount = 0;
            Object.keys(parsedData).forEach(name => {
                let content = parsedData[name].join('\n').trim();
                if (content.length > 0) {
                    
                    // Застосовуємо логіку форматування з autoFormat
                    let cleanPreds = "";
                    const linesToProcess = content.split('\n');
                    linesToProcess.forEach(line => {
                        let val = line.trim().toUpperCase();
                        if (val === '') return;
                        
                        const flMatch = val.match(/^(?:ШВИД|ШВИДКЕ КОЛО|НАЙШВИДШЕ|FL|ФЛ|КОЛО)[\s:\-.,_]*([A-ZА-Я]{3})$/i);
                        const posMatch = val.match(/^(\d+)[\s\-.,_]+([A-ZА-Я]{3})$/i);

                        if (flMatch) {
                            tmp[sess].fl[name] = flMatch[1];
                        } else if (posMatch) {
                            cleanPreds += `${posMatch[1]} - ${posMatch[2]}\n`;
                        } else if(isNewQualy){
                            let numMatch = val.match(/(\d+)/);
                            if(numMatch) tmp[sess].p[name] = numMatch[1];
                        } else {
                            // Якщо формат не розпізнано, додаємо як є (можливо, потребує ручного втручання)
                            cleanPreds += val + '\n';
                        }
                    });

                    if(!isNewQualy) {
                        tmp[sess].p[name] = cleanPreds.trim();
                    }
                    
                    tmp[sess].c[name] = false; 
                    
                    dirtyFields[`${gp}_${sess}_p_${name}`] = true;
                    dirtyFields[`${gp}_${sess}_fl_${name}`] = true;
                    dirtyFields[`${gp}_${sess}_c_${name}`] = true;
                    
                    importedCount++;
                }
            });

            save(); render();
            if (importedCount > 0) {
                alert(`Успішно імпортовано та відформатовано прогнози для ${importedCount} гравців!`);
                document.getElementById('bulk-import').value = ""; 
            } else {
                alert("Жодного імені не розпізнано. Перевірте формат тексту.");
            }
        }

        function parse(txt, isQ, isNewQualy) {
            let d = []; let f = "";
            if (!txt) return { d, f };

            const cyrToLat = {
                'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 
                'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'І': 'I'
            };

            const sanitizeCode = (str) => {
                return str.toUpperCase().trim().split('').map(char => cyrToLat[char] || char).join('');
            };

            if (isQ && !isNewQualy) {
                let rawCode = txt.trim().split('\n')[0].replace(/^\d+[\s\-\–\.]+/, '');
                return { d: [sanitizeCode(rawCode)], f: "" };
            }
            
            txt.split('\n').forEach(line => {
                let m = line.match(/(\d+)\s*[\-\–\.]\s*([A-Za-zА-Яа-я]+)/i);
                if (m) d[parseInt(m[1])-1] = sanitizeCode(m[2]);
                
                let flm = line.match(/коло\s*[\-\–\.]\s*([A-Za-zА-Яа-я]+)/i);
                if (flm) f = sanitizeCode(flm[1]);
            });
            return { d, f };
        }

        function calcSingleSessionPts(act, pr, pFL, sessionType, pName, currentGp) {
            let pts = 0;
            const points = [11, 9, 8, 7, 6, 5, 4, 3, 2, 1];
            const gpIdx = getGpIndex(currentGp);

            if (sessionType === 'qualy') {
                if (gpIdx >= getGpIndex('Канада')) {
                    let assignedDriver = (db.qDrivers[currentGp] && db.qDrivers[currentGp][pName]) ? db.qDrivers[currentGp][pName] : null;
                    let predictedPos = parseInt(tmp[sess].p[pName]);
                    
                    if (assignedDriver && !isNaN(predictedPos)) {
                        let actualIdx = act.d.indexOf(assignedDriver);
                        if (actualIdx !== -1) {
                            let actualPos = actualIdx + 1;
                            let diff = Math.abs(actualPos - predictedPos);
                            if (diff === 0) pts += 5;
                            else if (diff === 1) pts += 2;
                        }
                    }
                } else {
                    if (pr.d[0] === act.d[0] && act.d[0]) pts += 1;
                }
            } else {
                const ptsMap = sessionType === 'race' ? points : [5, 4, 3, 2, 1];
                pr.d.forEach((drCode, prIdx) => {
                    if(!drCode) return;
                    const actIdx = act.d.indexOf(drCode);
                    if(actIdx !== -1) {
                        if(prIdx === actIdx) pts += (ptsMap[prIdx] || 0);
                        else if(Math.abs(prIdx - actIdx) === 1) pts += 1;
                    }
                });
                if (sessionType === 'race') {
                    if (act.d.length >= 3 && pr.d.length >= 3) {
                        const actP = act.d.slice(0,3).sort().join('');
                        const prP = pr.d.slice(0,3).sort().join('');
                        if (actP === prP && actP !== "") pts += 4;
                    }
                    if (pFL === act.f && act.f) pts += 1;
                }
            }
            return pts;
        }

        function updateLiveBadges() {
            const gp = document.getElementById('gp-select').value;
            const isNewQualy = (sess === 'qualy' && getGpIndex(gp) >= getGpIndex('Канада'));
            const act = parse(tmp[sess].r, sess === 'qualy', isNewQualy);
            
            teams.forEach(t => t.p.forEach(p => {
                const badge = document.getElementById(`live-badge-${p}`);
                if (!badge) return;

                if (!tmp[sess].r.trim()) {
                    badge.classList.remove('show');
                    return;
                }

                const pr = parse(tmp[sess].p[p], sess === 'qualy', isNewQualy);
                const pFL = (tmp[sess].fl[p] || "").toUpperCase().trim();
                const pts = calcSingleSessionPts(act, pr, pFL, sess, p, gp);

                badge.classList.add('show');
                // Цей шматок замінює старий вивід балів всередині updateLiveBadges
                if (pts > 0) {
                    badge.innerText = `+${pts}`;
                    badge.className = 'p-live-pts active-pts';
                } else {
                    badge.innerText = `0`;
                    badge.className = 'p-live-pts';
                }
            }));
        }

        function openLiveModal() {
            const sessName = sess === 'qualy' ? 'Кваліфікація' : sess === 'sprint' ? 'Спринт' : 'Гонка';
            document.getElementById('live-modal-sess-label').innerText = sessName;
            document.getElementById('live-modal-real-input').value = tmp[sess].r;
            
            let modalInput = document.getElementById('live-modal-real-input');
            modalInput.style.height = '60px';
            modalInput.style.height = modalInput.scrollHeight + 'px';

            renderLiveModalTable();
            document.getElementById('live-modal').style.display = 'flex';
        }

        function renderLiveModalTable() {
            const gp = document.getElementById('gp-select').value;
            const isNewQualy = (sess === 'qualy' && getGpIndex(gp) >= getGpIndex('Канада'));
            let proj = [];
            
            teams.forEach(t => t.p.forEach(p => {
                let added = 0;
                const act = parse(tmp[sess].r, sess === 'qualy', isNewQualy);
                const pr = parse(tmp[sess].p[p], sess === 'qualy', isNewQualy);
                const pFL = (tmp[sess].fl[p] || "").toUpperCase().trim();
                added = calcSingleSessionPts(act, pr, pFL, sess, p, gp);

                const basePts = db.st[p] ? db.st[p].pts : 0;
                proj.push({ p: p, t: t, base: basePts, added: added, total: basePts + added });
            }));

            proj.sort((a,b) => {
                if (b.total !== a.total) return b.total - a.total;
                return b.base - a.base;
            });

            const tbody = document.getElementById('live-modal-tbody');
            tbody.innerHTML = '';
            
            proj.forEach((item, idx) => {
                const addedStr = item.added > 0 ? `<span style="color:var(--success);">+${item.added}</span>` : `<span style="color:#555;">0</span>`;
                const rowHTML = `
                    <tr class="row-${item.t.id}">
                        <td>${idx+1}</td>
                        <td class="logo-cell">
                            <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                                <span>${item.p}</span> <span class="tg-handle">${tgHandles[item.p] || ''}</span>
                            </div>
                        </td>
                        <td style="color:#aaa;">${item.base}</td>
                        <td style="font-weight:bold; font-size:14px;">${addedStr}</td>
                        <td style="font-size:15px; font-weight:bold; color:#fff;">${item.total}</td>
                    </tr>`;
                tbody.innerHTML += rowHTML;
            });
        }

        async function promptAdjustPts(name) {
            if (!isAdmin) {
                alert("Руки геть! Тільки адміністратор може змінювати бали вручну.");
                return;
            }

            let adj = prompt(`Змінити бали для ${name} (наприклад: 5 або -3):`, "0");
            if (adj === null) return; 
            
            adj = parseInt(adj, 10);
            if (!isNaN(adj)) {
                if (!db.st[name]) db.st[name] = { pts: 0 }; 
                db.st[name].pts += adj;
                
                updateTables(); 
                
                try {
                    await save(); 
                    console.log(`Бали для ${name} успішно оновлено та збережено.`);
                } catch (err) {
                    console.error("Не вдалося зберегти нові бали в Supabase:", err);
                    alert("Помилка збереження! Перевір консоль.");
                }
            } else {
                alert("Введено некоректне число.");
            }
        }

        function resetStage() {
            const gp = document.getElementById('gp-select').value;
            if (confirm(`Видалити розраховані бали за етап "${gp}"? Прогнози залишаться в комірках, віднімуться лише бали з таблиць.`)) {
                if (db.hist[gp]) {
                    Object.entries(db.hist[gp]).forEach(([p, s]) => {
                        if (db.st[p]) { db.st[p].pts -= (s.q + s.s + s.r); }
                    });
                    Object.entries(db.hist[gp]).forEach(([p, s]) => {
                        s.q = 0; s.s = 0; s.r = 0; s.bd = {q:'', s:'', r:''};
                    });
                }
                save(); render(); updateTables(); renderH2H(); updateChartData(); updateDetailsTable();
            }
        }

        function resetSystem() { 
            if(confirm("ВИДАЛИТИ ВСІ ДАНІ СЕЗОНУ? Цю дію неможливо скасувати! Зробіть Експорт бази перед цим!")) { 
                localStorage.clear(); 
                location.reload(); 
            } 
        }

        function calculateAll() {
            const gp = document.getElementById('gp-select').value;
            const gpIdx = getGpIndex(gp);
            const isNewQualy = (sess === 'qualy' && gpIdx >= getGpIndex('Канада'));

            if (!db.hist[gp]) db.hist[gp] = {};

            let errors = [];
            const actText = tmp[sess].r;
            
            if (!actText.trim()) { 
                alert("Помилка: Не введено реальні результати гонки чи спринту!"); 
                return; 
            }

            teams.forEach(t => t.p.forEach(p => {
                const prText = tmp[sess].p[p];
                const flText = tmp[sess].fl[p];
                
                if (!prText || !prText.trim()) {
                    errors.push(`• ${p}: Немає жодного прогнозу (пусте поле).`);
                    return; 
                }

                if (sess === 'race') {
                    if (!flText || !flText.trim()) {
                        errors.push(`• ${p}: Не вписано швидке коло!`);
                    }
                }

                if (!isNewQualy && /\d+\./.test(prText)) {
                    errors.push(`• ${p}: Використано крапку ("1.") замість дефісу ("1 -").`);
                }

                if (isNewQualy) {
                    let val = parseInt(prText);
                    if(isNaN(val) || val < 1 || val > 22) errors.push(`• ${p}: Вказано не число або число поза межами (1-22) для кваліфікації ("${prText}").`);
                    let assignedDriver = (db.qDrivers[gp] && db.qDrivers[gp][p]) ? db.qDrivers[gp][p] : null;
                    if(!assignedDriver) errors.push(`• ${p}: Немає призначеного пілота на цю кваліфікацію! Натисніть кнопку рандому.`);
                } else {
                    const parsed = parse(prText, sess === 'qualy', false);
                    if (sess === 'qualy') {
                        let code = parsed.d[0];
                        if (!code || !/^[A-Z]{3}$/.test(code)) {
                            errors.push(`• ${p}: Квала виглядає неправильно ("${code}"). Очікується 3 літери.`);
                        } else if (code === 'MAX') {
                            errors.push(`• ${p}: Написано "MAX" замість "VER".`);
                        }
                    } else {
                        let count = parsed.d.filter(x => x).length;
                        if (count < 3) {
                            errors.push(`• ${p}: Розпізнано занадто мало позицій (${count}). Перевірте правильність формату.`);
                        }
                        parsed.d.forEach(code => {
                            if (code) {
                                if (!/^[A-Z]{3}$/.test(code)) errors.push(`• ${p}: Некоректний код пілота "${code}". Очікується 3 латинські літери.`);
                                if (code === 'MAX') errors.push(`• ${p}: Написано "MAX" замість офіційного коду "VER".`);
                            }
                        });
                    }
                }
            }));

            if (errors.length > 0) {
                let msg = "Знайдено можливі помилки у форматуванні:\n\n" + errors.join('\n') + "\n\nБажаєте проігнорувати їх і перерахувати бали?";
                if (!confirm(msg)) return; 
            }

            db.prevOrder = Object.entries(db.st).sort((a,b) => b[1].pts - a[1].pts).map(x => x[0]);
            const points = [11, 9, 8, 7, 6, 5, 4, 3, 2, 1];
            
            const act = parse(tmp[sess].r, sess === 'qualy', isNewQualy);

            teams.forEach(t => t.p.forEach(p => {
                const pr = parse(tmp[sess].p[p], sess === 'qualy', isNewQualy);
                const pFL = (tmp[sess].fl[p] || "").toUpperCase().trim();
                let pts = 0; let breakdownStr = [];

                if (sess === 'qualy') {
                    if (isNewQualy) {
                        let assignedDriver = (db.qDrivers[gp] && db.qDrivers[gp][p]) ? db.qDrivers[gp][p] : '???';
                        let predictedPos = parseInt(tmp[sess].p[p]);
                        let actualIdx = act.d.indexOf(assignedDriver);
                        
                        if (actualIdx !== -1) {
                            let actualPos = actualIdx + 1;
                            let diff = Math.abs(actualPos - predictedPos);
                            let scoreAdded = 0;
                            
                            if (diff === 0) scoreAdded = 5;
                            else if (diff === 1) scoreAdded = 2;
                            
                            pts += scoreAdded;
                            
                            if (scoreAdded > 0) {
                                breakdownStr.push(`Пілот: <strong>${assignedDriver}</strong><br>Прогноз: ${predictedPos}, Реал: ${actualPos}<br>Бали: <span class="tt-highlight">+${scoreAdded}</span>`);
                            } else {
                                breakdownStr.push(`Пілот: <strong>${assignedDriver}</strong><br>Прогноз: ${predictedPos}, Реал: ${actualPos}<br>Бали: 0`);
                            }
                        } else {
                            breakdownStr.push(`Пілот: <strong>${assignedDriver}</strong><br>Не знайдено в результатах<br>Бали: 0`);
                        }
                    } else {
                        if (pr.d[0] === act.d[0] && act.d[0]) {
                            pts += 1; breakdownStr.push(`Поул (${pr.d[0]}): <span class="tt-highlight">+1</span>`);
                        } else { breakdownStr.push(`Поул: 0`); }
                    }
                } else {
                    const ptsMap = sess === 'race' ? points : [5, 4, 3, 2, 1];
                    pr.d.forEach((driverCode, prIdx) => {
                        if (!driverCode) return;
                        const actIdx = act.d.indexOf(driverCode);
                        if (actIdx === -1) { breakdownStr.push(`${prIdx+1}. ${driverCode}: 0`); return; }

                        if (prIdx === actIdx) {
                            let pScore = ptsMap[prIdx] || 0;
                            pts += pScore; breakdownStr.push(`${prIdx+1}. ${driverCode}: <span class="tt-highlight">+${pScore}</span> (Точно)`);
                        } else if (Math.abs(prIdx - actIdx) === 1) {
                            pts += 1; breakdownStr.push(`${prIdx+1}. ${driverCode}: <span class="tt-highlight">+1</span> (±1 поз.)`);
                        } else { breakdownStr.push(`${prIdx+1}. ${driverCode}: 0`); }
                    });

                    if (sess === 'race') {
                        if (act.d.length >= 3 && pr.d.length >= 3) {
                            const actP = act.d.slice(0,3).sort().join('');
                            const prP = pr.d.slice(0,3).sort().join('');
                            if (actP === prP && actP !== "") {
                                pts += 4; breakdownStr.push(`Подіум: <span class="tt-highlight">+4</span>`);
                            } else { breakdownStr.push(`Подіум: 0`); }
                        }
                        if (pFL === act.f && act.f) {
                            pts += 1; breakdownStr.push(`Швидке коло: <span class="tt-highlight">+1</span>`);
                        } else if (pFL) { breakdownStr.push(`Швидке коло: 0`); }
                    }
                }

                if (!db.st[p]) db.st[p] = { t: t.n, pts: 0 };
                if (!db.hist[gp][p]) db.hist[gp][p] = { q:0, s:0, r:0, b:0, bd: {q:'', s:'', r:''} };
                if (!db.hist[gp][p].bd) db.hist[gp][p].bd = {q:'', s:'', r:''};
                
                let sessKey = sess === 'qualy' ? 'q' : sess === 'sprint' ? 's' : 'r';
                
                let oldPts = db.hist[gp][p][sessKey] || 0; 
                let diff = pts - oldPts; 
                
                db.st[p].pts += diff; 
                db.hist[gp][p][sessKey] = pts; 
                db.hist[gp][p].bd[sessKey] = breakdownStr.join('<br>');
            }));

            save(); render(); updateTables(); renderH2H(); updateChartData(); updateDetailsTable();
            
            let sessName = sess === 'qualy' ? 'Кваліфікацію' : sess === 'sprint' ? 'Спринт' : 'Гонку';
            alert(`${sessName} успішно перераховано! Бали перезаписано без подвоєння.`);
        }

        function updateStatsTable() {
            let stats = { wins: {}, podiums: {}, totalQ: {}, totalS: {}, totalR: {} };
            let maxScore = { v: 0, entries: [] }; 
            let minScore = { v: 999, entries: [] };
            let maxTeamScore = { v: 0, entries: [] }; 

            let allPlayers = new Set();
            teams.forEach(t => t.p.forEach(p => allPlayers.add(p)));
            Object.values(db.hist).forEach(data => Object.keys(data).forEach(p => allPlayers.add(p)));

            allPlayers.forEach(p => {
                stats.wins[p] = 0; stats.podiums[p] = 0;
                stats.totalQ[p] = 0; stats.totalS[p] = 0; stats.totalR[p] = 0;
            });

            Object.entries(db.hist).forEach(([gp, data]) => {
                let gpScores = [];
                let gpTeamScores = {};

                Object.entries(data).forEach(([p, s]) => {
                    let total = s.q + s.s + s.r + (s.b || 0); 
                    gpScores.push({p, total});
                    
                    stats.totalQ[p] += s.q;
                    stats.totalS[p] += s.s;
                    stats.totalR[p] += s.r;

                    if (total > maxScore.v) { maxScore.v = total; maxScore.entries = [{p, gp}]; }
                    else if (total === maxScore.v && total > 0) { maxScore.entries.push({p, gp}); }

                    if (total > 0 && total < minScore.v) { minScore.v = total; minScore.entries = [{p, gp}]; }
                    else if (total > 0 && total === minScore.v) { minScore.entries.push({p, gp}); }

                    let foundTeam = teams.find(t => t.p.includes(p));
                    let tName = foundTeam ? foundTeam.n : (db.st[p] ? db.st[p].t : 'Колишні гравці');
                    
                    if (!gpTeamScores[tName]) gpTeamScores[tName] = 0;
                    gpTeamScores[tName] += total;
                });

                Object.entries(gpTeamScores).forEach(([t, v]) => {
                    if (v > maxTeamScore.v) { maxTeamScore.v = v; maxTeamScore.entries = [{t, gp}]; }
                    else if (v === maxTeamScore.v && v > 0) { maxTeamScore.entries.push({t, gp}); }
                });

                gpScores.sort((a, b) => b.total - a.total);
                if (gpScores.length > 0) {
                    let maxPts = gpScores[0].total;
                    if (maxPts > 0) {
                        gpScores.forEach(s => { if(s.total === maxPts) stats.wins[s.p]++; });
                        let uniqueScores = [...new Set(gpScores.map(x => x.total))].sort((a,b)=>b-a);
                        let podiumScores = uniqueScores.slice(0, 3);
                        gpScores.forEach(s => { if(podiumScores.includes(s.total)) stats.podiums[s.p]++; });
                    }
                }
            });

            const getTopObj = (obj) => {
                let maxVal = Math.max(...Object.values(obj), 0);
                if (maxVal === 0) return { names: ['—'], v: 0 };
                let names = Object.keys(obj).filter(k => obj[k] === maxVal);
                return { names, v: maxVal };
            };

            const getTClass = (nameArr, isTeam = false) => {
                if (!nameArr || nameArr.length === 0 || nameArr[0] === '—') return '';
                let main = nameArr[0];
                let tObj = isTeam ? teams.find(t => t.n === main) : teams.find(t => t.p.includes(main));
                return tObj ? `row-${tObj.id}` : '';
            };

            const formatNames = (namesArr) => {
                if (!namesArr || namesArr.length === 0 || namesArr[0] === '—') return '<span style="color:#888;">—</span>';
                let unique = [...new Set(namesArr)];
                let main = unique[0];
                let html = `<span style="font-weight:bold;">${main}</span>`;
                if (unique.length > 1) {
                    let others = unique.slice(1).join(', ');
                    html += ` <span style="font-size:10px; opacity:0.6; font-weight:normal;">(також ${others})</span>`;
                }
                return html;
            };

            const getGpsText = (entries) => {
                if (!entries || entries.length === 0) return '';
                let gps = [...new Set(entries.map(e => e.gp))].join(', ');
                return ` <span style="font-size:10px; opacity:0.6; font-weight:normal;">(${gps})</span>`;
            };

            let topWins = getTopObj(stats.wins);
            let topPodiums = getTopObj(stats.podiums);
            let topQ = getTopObj(stats.totalQ);
            let topS = getTopObj(stats.totalS);
            let topR = getTopObj(stats.totalR);
            let maxScoreNames = maxScore.entries.map(e => e.p);
            let minScoreNames = minScore.v === 999 ? [] : minScore.entries.map(e => e.p);
            let maxTeamNames = maxTeamScore.entries.map(e => e.t);

            let cWins = getColorHtml(topWins.names);
            let cPod = getColorHtml(topPodiums.names);
            let cScore = getColorHtml(maxScoreNames);
            let cTeamScore = getColorHtml(maxTeamNames, true);
            let cR = getColorHtml(topR.names);
            let cS = getColorHtml(topS.names);
            let cQ = getColorHtml(topQ.names);
            let cMin = getColorHtml(minScoreNames);

            let wText = declOfNum(topWins.v, ['перше місце', 'перших місця', 'перших місць']);
            let pText = declOfNum(topPodiums.v, ['подіум', 'подіуми', 'подіумів']);
            let bTextScore = declOfNum(maxScore.v, ['бал', 'бали', 'балів']);
            let bTextTeam = declOfNum(maxTeamScore.v, ['бал', 'бали', 'балів']);
            let bTextR = declOfNum(topR.v, ['бал', 'бали', 'балів']);
            let bTextS = declOfNum(topS.v, ['бал', 'бали', 'балів']);
            let bTextQ = declOfNum(topQ.v, ['бал', 'бали', 'балів']);
            let bTextMin = declOfNum(minScore.v === 999 ? 0 : minScore.v, ['бал', 'бали', 'балів']);

            const statT = document.getElementById('table-stats');
            statT.innerHTML = `
                <tr><th style="width: 40%;">Номінація</th><th>Лідер / Команда</th><th>Показник</th></tr>
                <tr class="${getTClass(topWins.names)}"><td style="color:#aaa;">Царь гори</td><td>${formatNames(topWins.names)}</td><td style="color:${cWins}; font-weight:bold;">${topWins.v} <span style="font-size:10px; opacity:0.7;">${wText}</span></td></tr>
                <tr class="${getTClass(topPodiums.names)}"><td style="color:#aaa;">Гідний суперник</td><td>${formatNames(topPodiums.names)}</td><td style="color:${cPod}; font-weight:bold;">${topPodiums.v} <span style="font-size:10px; opacity:0.7;">${pText}</span></td></tr>
                <tr class="${getTClass(maxScoreNames)}"><td style="color:#aaa;">Абсолютний рекорд</td><td>${formatNames(maxScoreNames)}</td><td style="color:${cScore}; font-weight:bold;">${maxScore.v} <span style="font-size:10px; opacity:0.7;">${bTextScore}</span>${getGpsText(maxScore.entries)}</td></tr>
                <tr class="${getTClass(maxTeamNames, true)}"><td style="color:#aaa;">Рекорд команди</td><td>${formatNames(maxTeamNames, true)}</td><td style="color:${cTeamScore}; font-weight:bold;">${maxTeamScore.v} <span style="font-size:10px; opacity:0.7;">${bTextTeam}</span>${getGpsText(maxTeamScore.entries)}</td></tr>
                <tr class="${getTClass(topR.names)}"><td style="color:#aaa;">Бог Гонок</td><td>${formatNames(topR.names)}</td><td style="color:${cR}; font-weight:bold;">${topR.v} <span style="font-size:10px; opacity:0.7;">${bTextR}</span></td></tr>
                <tr class="${getTClass(topS.names)}"><td style="color:#aaa;">Майстер Спринтів</td><td>${formatNames(topS.names)}</td><td style="color:${cS}; font-weight:bold;">${topS.v} <span style="font-size:10px; opacity:0.7;">${bTextS}</span></td></tr>
                <tr class="${getTClass(topQ.names)}"><td style="color:#aaa;">Король Кваліфікацій</td><td>${formatNames(topQ.names)}</td><td style="color:${cQ}; font-weight:bold;">${topQ.v} <span style="font-size:10px; opacity:0.7;">${bTextQ}</span></td></tr>
                <tr class="${getTClass(minScoreNames)}"><td style="color:#aaa;">Антирекордсмен</td><td>${formatNames(minScoreNames)}</td><td style="color:${cMin}; font-weight:bold;">${minScore.v === 999 ? 0 : minScore.v} <span style="font-size:10px; opacity:0.7;">${bTextMin}</span>${getGpsText(minScore.entries)}</td></tr>
            `;
        }

        function toggleSort(col) {
            sortCol = (sortCol === col) ? 'total' : col;
            updateTables();
        }

        function updateTables() {
            // === 1. ЖОРСТКЕ ВІДНОВЛЕННЯ ТА ІНІЦІАЛІЗАЦІЯ ===
            if (!db.st) db.st = {};
            if (!db.hist) db.hist = {};
            if (!db.prevOrder) db.prevOrder = [];

            // Гарантуємо, що всі 8 гравців (і будь-які інші з команд) завжди існують у базі
            teams.forEach(t => {
                t.p.forEach(playerName => {
                    if (!db.st[playerName]) {
                        // Якщо гравця немає, створюємо з базовими 0 балів
                        db.st[playerName] = { t: t.n, pts: 0 };
                    } else if (!db.st[playerName].t) {
                        // Відновлюємо прив'язку до команди, якщо вона злетіла
                        db.st[playerName].t = t.n; 
                    }
                });
            });

            // ТУТ МОЖЕШ ДОДАТИ СВОЇ БОНУСИ НОВАЧКІВ, ЯКЩО ВОНИ ХАРДКОДЯТЬСЯ
            // Наприклад: if (db.st['Ім\'яГраця'] && db.st['Ім\'яГраця'].pts === 0) db.st['Ім\'яГраця'].pts = 10;
            // ===============================================

            let showDetailed = document.getElementById('detailed-view-toggle').checked;
            
            if (!showDetailed) sortCol = 'total';

            let allOptions = Array.from(document.getElementById('gp-select').options).map(o => o.value);
            let completedGPs = allOptions.filter(gp => db.hist[gp] && Object.keys(db.hist[gp]).length > 0);
            
            let displayGPs = showDetailed ? completedGPs : [];
            
            const drT = document.getElementById('table-dr');
            
            let totalActiveStyle = sortCol === 'total' ? 'color: var(--success); text-shadow: 0 0 5px rgba(0,255,0,0.5);' : '';
            let thead = `<tr><th>#</th><th>Пілот</th><th style="cursor:pointer; transition:0.3s; ${totalActiveStyle}" onclick="toggleSort('total')">Бали ${sortCol === 'total' ? '▼' : ''}</th>`;
            
            if (showDetailed) {
                displayGPs.forEach(gp => {
                    let active = sortCol === gp;
                    let style = active ? 'color:var(--success); text-shadow:0 0 5px rgba(0,255,0,0.5);' : 'cursor:pointer;';
                    let arrow = active ? ' ▼' : '';
                    thead += `<th title="Сортувати за етапом: ${gp}" style="font-size:10px; text-align:center; transition:0.3s; ${style}" onclick="toggleSort('${gp}')">${gp.substring(0,3).toUpperCase()}${arrow}</th>`;
                });
            } else {
                thead += `<th>+/-</th>`;
            }
            thead += `</tr>`;
            drT.innerHTML = thead;
            
            let playersData = Object.entries(db.st).map(([name, d]) => {
                let gpPts = 0;
                if (sortCol !== 'total' && db.hist[sortCol] && db.hist[sortCol][name]) {
                    let h = db.hist[sortCol][name];
                    gpPts = h.q + h.s + h.r + (h.b || 0);
                }
                return { name, d, totalPts: d.pts, gpPts };
            });

            playersData.sort((a, b) => {
                if (sortCol === 'total') {
                    return b.totalPts - a.totalPts;
                } else {
                    if (b.gpPts !== a.gpPts) return b.gpPts - a.gpPts; 
                    return b.totalPts - a.totalPts; 
                }
            });
            
            playersData.forEach((item, idx) => {
                const name = item.name;
                const d = item.d;
                
                // Тепер ця стрічка ніколи не викличе помилку
                const pTeam = teams.find(t => t.n === d.t);
                const pColor = pTeam ? teamTextColors[pTeam.id] : '#fff'; // Захист кольору

                const prevIdx = db.prevOrder.indexOf(name);
                
                let trend = '<span class="same">—</span>';
                if (prevIdx !== -1) {
                    const diff = prevIdx - idx;
                    if (diff > 0) trend = `<span class="up">▲ <span style="font-size: 10px;">${diff}</span></span>`;
                    else if (diff < 0) trend = `<span class="down">▼ <span style="font-size: 10px;">${Math.abs(diff)}</span></span>`;
                }

                let trHTML = `
                    <tr class="${pTeam ? 'row-' + pTeam.id : ''}">
                        <td>${idx+1}</td>
                        <td class="logo-cell">
                            <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                                <span>${name}</span>
                                <span class="tg-handle">${tgHandles[name] || ''}</span>
                            </div>
                        </td>
                        <td>
                            ${d.pts}
                            <button class="adj-btn" onclick="promptAdjustPts('${name}')">±</button>
                        </td>`;
                
                if (showDetailed) {
                    displayGPs.forEach(gp => {
                        let pts = 0;
                        if (db.hist[gp] && db.hist[gp][name]) {
                            let h = db.hist[gp][name];
                            pts = h.q + h.s + h.r + (h.b || 0);
                        }
                        
                        let cellColor = '#ccc';
                        let cellFontWeight = 'normal';
                        if (sortCol === gp) {
                            cellColor = pColor;
                            cellFontWeight = 'bold';
                        }
                        
                        trHTML += `<td style="text-align:center; color:${cellColor}; font-weight:${cellFontWeight}; font-size:13px; transition:0.3s;">${pts}</td>`;
                    });
                } else {
                    trHTML += `<td>${trend}</td>`;
                }

                trHTML += `</tr>`;
                drT.innerHTML += trHTML;
            });

            const tmT = document.getElementById('table-tm');
            tmT.innerHTML = '<tr><th>#</th><th>Команда</th><th>Бали</th></tr>';
            let tmData = {}; teams.forEach(t => tmData[t.n] = { id: t.id, pts: 0 });
            Object.values(db.st).forEach(d => { if(tmData[d.t]) tmData[d.t].pts += d.pts; });
            Object.entries(tmData).sort((a,b) => b[1].pts - a[1].pts).forEach(([n, d], i) => {
                const teamObj = teams.find(t => t.n === n);
                const driversStr = teamObj ? teamObj.p.join(', ') : '';
                tmT.innerHTML += `<tr class="row-${d.id}"><td>${i+1}</td><td class="logo-cell"><div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;"><span>${n}</span> <span style="font-size:10px; color:#777;">(${driversStr})</span></div></td><td>${d.pts}</td></tr>`;
            });

            // Захист виклику таблиці статистики
            if (typeof updateStatsTable === 'function') updateStatsTable();
        }

        function updateDetailsTable() {
            const gp = document.getElementById('gp-select-details').value;
            const hT = document.getElementById('table-hist');
            hT.innerHTML = '<tr><th>Пілот</th><th>Квала</th><th>Спринт</th><th>Гонка</th><th>Σ</th></tr>';
            if (db.hist[gp]) {
                Object.entries(db.hist[gp]).sort((a,b) => (b[1].q+b[1].s+b[1].r+(b[1].b||0)) - (a[1].q+a[1].s+a[1].r+(a[1].b||0))).forEach(([p,s]) => {
                    const t = teams.find(tm => tm.p.includes(p));
                    const qTT = `<span class="tt-wrapper">${s.q}<span class="tt-content">${s.bd.q||'0'}</span></span>`;
                    const sTT = `<span class="tt-wrapper">${s.s}<span class="tt-content">${s.bd.s||'0'}</span></span>`;
                    const rTT = `<span class="tt-wrapper">${s.r}<span class="tt-content">${s.bd.r||'0'}</span></span>`;
                    
                    const sumScore = s.q + s.s + s.r + (s.b || 0);
                    let bonusHTML = s.b ? `<br><br><strong style="color:var(--success);">БОНУС НОВАЧКА:</strong><br>+${s.b}` : '';
                    const sumTT = `<span class="tt-wrapper" style="font-weight:bold;">${sumScore}<span class="tt-content"><strong>КВАЛІФІКАЦІЯ:</strong><br>${s.bd.q||'0'}<br><br><strong>СПРИНТ:</strong><br>${s.bd.s||'0'}<br><br><strong>ГОНКА:</strong><br>${s.bd.r||'0'}${bonusHTML}</span></span>`;

                    hT.innerHTML += `<tr class="row-${t.id}"><td class="logo-cell"><div style="display:flex; align-items:center;"><span>${p}</span></div></td><td>${qTT}</td><td>${sTT}</td><td>${rTT}</td><td>${sumTT}</td></tr>`;
                });
            } else {
                hT.innerHTML += '<tr><td colspan="5" style="text-align:center; color:#555;">Немає даних для цього етапу</td></tr>';
            }
        }

        /* H2H ЛОГІКА */
        function selectTeamH2H(teamId) {
            let teamObj = teams.find(t => t.id === teamId);
            if(teamObj && teamObj.p.length >= 2) {
                document.getElementById('h2h-p1').value = teamObj.p[0];
                document.getElementById('h2h-p2').value = teamObj.p[1];
                renderH2H();
            }
            document.getElementById('h2h-custom-dropdown').classList.remove('show');
        }

        function createH2HBar(label, val1, val2, col1, col2) {
            let total = val1 + val2;
            let p1 = total === 0 ? 0 : (val1 / total) * 100;
            let p2 = total === 0 ? 0 : (val2 / total) * 100;
            
            let pct1 = total === 0 ? "0%" : Math.round(p1) + "%";
            let pct2 = total === 0 ? "0%" : Math.round(p2) + "%";

            let fw1 = val1 > val2 ? '900' : 'normal';
            let fw2 = val2 > val1 ? '900' : 'normal';
            let sz1 = val1 > val2 ? '28px' : '20px';
            let sz2 = val2 > val1 ? '28px' : '20px';

            return `
            <div style="width: 100%;">
                <div class="h2h-label">${label}</div>
                <div class="h2h-row-new">
                    <div class="h2h-val left">
                        <span class="h-num" style="color:${col1}; font-size:${sz1}; font-weight:${fw1};">${val1}</span>
                        <span class="h-pct">${pct1}</span>
                    </div>
                    <div class="h2h-bar-wrap">
                        <div class="bar-side left">
                            <div class="bar-fill" style="background-color:${col1};" data-w="${p1}%"></div>
                        </div>
                        <div class="bar-center-divider"></div>
                        <div class="bar-side right">
                            <div class="bar-fill" style="background-color:${col2};" data-w="${p2}%"></div>
                        </div>
                    </div>
                    <div class="h2h-val right">
                        <span class="h-num" style="color:${col2}; font-size:${sz2}; font-weight:${fw2};">${val2}</span>
                        <span class="h-pct">${pct2}</span>
                    </div>
                </div>
            </div>
            `;
        }

        let h2hRadarChartInst = null;

        function renderH2H() {
            let p1 = document.getElementById('h2h-p1').value;
            let p2 = document.getElementById('h2h-p2').value;

            let t1 = teams.find(t => t.p.includes(p1));
            let t2 = teams.find(t => t.p.includes(p2));

            let logoContainer = document.getElementById('h2h-center-logo');
            if (t1 && t2 && t1.id === t2.id && teamLogos[t1.id]) {
                logoContainer.style.backgroundImage = `url('${teamLogos[t1.id]}')`;
                logoContainer.innerHTML = '';
            } else {
                logoContainer.style.backgroundImage = 'none';
                logoContainer.innerHTML = '<div class="vs-text">VS</div>';
            }

            let col1 = getPlayerColor(p1);
            let col2 = getPlayerColor(p2);

            let s1 = { q:0, s:0, r:0, total:0, wins:0, best:0 };
            let s2 = { q:0, s:0, r:0, total:0, wins:0, best:0 };
            let playedCount = 0;
            
            let allGPs = Array.from(document.getElementById('gp-select').options).map(o => o.value);
            let r1Data = [];
            let r2Data = [];

            allGPs.forEach(gp => {
                let pts1 = 0, pts2 = 0;
                let played = db.hist[gp] !== undefined;

                if (played) {
                    playedCount++;
                    if (db.hist[gp][p1]) {
                        let h = db.hist[gp][p1];
                        pts1 = h.q + h.s + h.r + (h.b || 0); 
                        s1.q += h.q; s1.s += h.s; s1.r += h.r;
                        s1.total += pts1;
                        if (pts1 > s1.best) s1.best = pts1;
                    }
                    if (db.hist[gp][p2]) {
                        let h = db.hist[gp][p2];
                        pts2 = h.q + h.s + h.r + (h.b || 0); 
                        s2.q += h.q; s2.s += h.s; s2.r += h.r;
                        s2.total += pts2;
                        if (pts2 > s2.best) s2.best = pts2;
                    }
                    if (pts1 > 0 || pts2 > 0) {
                        if (pts1 > pts2) s1.wins++;
                        else if (pts2 > pts1) s2.wins++;
                    }
                }

                r1Data.push({ pts: pts1, played: played });
                r2Data.push({ pts: pts2, played: played });
            });

            let avg1 = playedCount > 0 ? (s1.total / playedCount).toFixed(1) : 0;
            let avg2 = playedCount > 0 ? (s2.total / playedCount).toFixed(1) : 0;

            let barsHTML = `<div style="display: flex; flex-direction: column; width: 100%;">`;
            barsHTML += createH2HBar("Загалом балів", s1.total, s2.total, col1, col2);
            barsHTML += createH2HBar("Середній бал", parseFloat(avg1), parseFloat(avg2), col1, col2);
            barsHTML += createH2HBar("Кваліфікації", s1.q, s2.q, col1, col2);
            barsHTML += createH2HBar("Гонки", s1.r, s2.r, col1, col2);
            barsHTML += createH2HBar("Спринти", s1.s, s2.s, col1, col2);
            barsHTML += createH2HBar("Дуелі", s1.wins, s2.wins, col1, col2);
            barsHTML += createH2HBar("Рекорд балів", s1.best, s2.best, col1, col2);
            barsHTML += `</div>`;
            document.getElementById('h2h-bars').innerHTML = barsHTML;

            setTimeout(() => {
                document.querySelectorAll('.bar-fill').forEach(el => {
                    el.style.width = el.getAttribute('data-w');
                });
            }, 50);

            if (h2hRadarChartInst) h2hRadarChartInst.destroy();
            const ctxR = document.getElementById('h2hRadar').getContext('2d');
            
            let maxQ = Math.max(s1.q, s2.q) || 1;
            let maxS = Math.max(s1.s, s2.s) || 1;
            let maxR = Math.max(s1.r, s2.r) || 1;
            let maxWins = Math.max(s1.wins, s2.wins) || 1;
            let maxAvg = Math.max(parseFloat(avg1), parseFloat(avg2)) || 1;

            h2hRadarChartInst = new Chart(ctxR, {
                type: 'radar',
                data: {
                    labels: ['Кваліфікація', 'Спринт', 'Гонка', 'Середній бал', 'Перемоги в дуелях'],
                    datasets: [
                        {
                            label: p1,
                            data: [(s1.q/maxQ)*100, (s1.s/maxS)*100, (s1.r/maxR)*100, (parseFloat(avg1)/maxAvg)*100, (s1.wins/maxWins)*100],
                            backgroundColor: col1 + '40', 
                            borderColor: col1,
                            pointBackgroundColor: col1,
                            borderWidth: 2
                        },
                        {
                            label: p2,
                            data: [(s2.q/maxQ)*100, (s2.s/maxS)*100, (s2.r/maxR)*100, (parseFloat(avg2)/maxAvg)*100, (s2.wins/maxWins)*100],
                            backgroundColor: col2 + '40',
                            borderColor: col2,
                            pointBackgroundColor: col2,
                            borderWidth: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: false } }, 
                    scales: {
                        r: {
                            angleLines: { color: '#333' },
                            grid: { color: '#333' },
                            pointLabels: { color: '#aaa', font: { size: 10, weight: 'bold' } },
                            ticks: { display: false, min: 0, max: 100 }
                        }
                    }
                }
            });

            let thead = `<tr><th>ПІЛОТ</th>`;
            allGPs.forEach(gp => {
                thead += `<th title="${gp}">${gp.substring(0,3).toUpperCase()}</th>`;
            });
            thead += `</tr>`;

            let tr1 = `<tr class="row-${t1 ? t1.id : ''}"><td><span style="color:${col1};">${p1}</span></td>`;
            let tr2 = `<tr class="row-${t2 ? t2.id : ''}" style="border-bottom: 2px solid #333;"><td><span style="color:${col2};">${p2}</span></td>`;

            for(let i=0; i<allGPs.length; i++) {
                if(!r1Data[i].played) {
                    tr1 += `<td class="empty">-</td>`;
                    tr2 += `<td class="empty">-</td>`;
                    continue;
                }

                let pts1 = r1Data[i].pts;
                let pts2 = r2Data[i].pts;
                
                let c1 = 'empty', c2 = 'empty';
                if (pts1 > pts2) { c1 = 'win'; c2 = 'loss'; }
                else if (pts2 > pts1) { c1 = 'loss'; c2 = 'win'; }
                else { c1 = 'tie'; c2 = 'tie'; }

                tr1 += `<td class="${c1}">${pts1}</td>`;
                tr2 += `<td class="${c2}">${pts2}</td>`;
            }
            tr1 += '</tr>';
            tr2 += '</tr>';

            document.getElementById('h2h-table').innerHTML = thead + tr1 + tr2;
        }

        /* ЛОГІКА PERFORMANCE CHART */
        let perfChart = null;
        let chartMode = 'cumulative'; 
        let activePlayers = new Set(teams.map(t => t.p).flat()); 

        function initChartSidebar() {
            let html = '';
            teams.forEach(t => {
                let teamColor = teamColors[t.id][0]; 
                t.p.forEach(p => {
                    let pColor = getPlayerColor(p);
                    let isActive = activePlayers.has(p) ? 'active' : '';
                    html += `
                        <div class="perf-player-item ${isActive}" onclick="toggleChartPlayer('${p}', this)">
                            <div class="perf-p-name">${p} <span class="perf-t-name" style="color:${teamColor};">${t.n}</span></div>
                            <div class="perf-color-box" style="background-color: ${pColor};"></div>
                        </div>
                    `;
                });
            });
            document.getElementById('perf-players-list').innerHTML = html;
        }

        function toggleChartPlayer(pName, elem) {
            if (activePlayers.has(pName)) {
                activePlayers.delete(pName);
                elem.classList.remove('active');
            } else {
                activePlayers.add(pName);
                elem.classList.add('active');
            }
            updateChartData();
        }

        function toggleAllChartPlayers() {
            let btn = document.getElementById('selectAllBtn');
            if (activePlayers.size > 0) {
                activePlayers.clear();
                document.querySelectorAll('.perf-player-item').forEach(e => e.classList.remove('active'));
                btn.innerText = "Показати всіх";
            } else {
                teams.forEach(t => t.p.forEach(p => activePlayers.add(p)));
                document.querySelectorAll('.perf-player-item').forEach(e => e.classList.add('active'));
                btn.innerText = "Сховати всіх";
            }
            updateChartData();
        }

        function setChartMode(mode, btnElem) {
            chartMode = mode;
            document.querySelectorAll('.perf-btn').forEach(b => b.classList.remove('active'));
            btnElem.classList.add('active');
            updateChartData();
        }

        function initChart() {
            if (perfChart) return; 

            const ctx = document.getElementById('perfChart').getContext('2d');
            
            Chart.defaults.color = '#888';
            Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
            
            perfChart = new Chart(ctx, {
                type: 'line',
                data: { labels: [], datasets: [] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: { top: 30 } // Опускає графік трохи нижче, щоб не ліз на текст
                    },
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            itemSort: function(a, b) {
                                return b.raw - a.raw; // Автоматичне сортування від найбільшого до найменшого
                            }
                        }
                    },
                    scales: {
                        y: { reverse: false, grid: { color: '#333' } },
                        x: { grid: { display: false } }
                    }
                }
            });

            initChartSidebar();
            updateChartData();
        }

        function updateChartData() {
            if (!perfChart) return;

            let allGPs = Array.from(document.getElementById('gp-select').options).map(o => o.value);
            let labels = [];
            let datasets = [];

            allGPs.forEach(gp => {
                if (db.hist[gp]) labels.push(gp.substring(0, 3).toUpperCase()); 
            });

            if (labels.length === 0) {
                labels = [allGPs[0].substring(0, 3).toUpperCase()];
            }

            teams.forEach(t => {
                t.p.forEach(p => {
                    if (!activePlayers.has(p)) return;

                    let data = [];
                    let cumTotal = 0;

                    allGPs.forEach(gp => {
                        if (!db.hist[gp]) return; 

                        let gpPts = 0;
                        if (db.hist[gp][p]) {
                            let h = db.hist[gp][p];
                            gpPts = h.q + h.s + h.r + (h.b || 0); 
                        }

                        if (chartMode === 'cumulative') {
                            cumTotal += gpPts;
                            data.push(cumTotal);
                        } else { 
                            data.push(gpPts);
                        }
                    });

                    if (data.length === 0) data = [0];

                    datasets.push({
                        label: p,
                        data: data,
                        borderColor: getPlayerColor(p),
                        backgroundColor: getPlayerColor(p),
                        pointBackgroundColor: '#111',
                        borderWidth: chartMode === 'cumulative' ? 3 : 2,
                        tension: chartMode === 'cumulative' ? 0.3 : 0 
                    });
                });
            });

            perfChart.data.labels = labels;
            perfChart.data.datasets = datasets;
            perfChart.update();
        }

        async function checkAuth(pName) {
            if (isAdmin) return;

            // ПРИМУСОВЕ ОНОВЛЕННЯ БАЗИ ПІНІВ ПЕРЕД ПЕРЕВІРКОЮ
            try {
                const { data } = await supabaseClient.from('f1_data').select('data').eq('id', 'main_db').single();
                if (data && data.data && data.data.pins) {
                    db.pins = data.data.pins;
                }
            } catch(e) { console.warn("Не вдалося перевірити хмару:", e); }

            if (!db.pins) db.pins = {};

            if (!db.pins[pName]) {
                let newPin = prompt(`Профіль "${pName}" ще не захищено. Придумайте ваш PIN-код (мінімум 4 символи):`);
                if (newPin && newPin.trim().length >= 4) {
                    // Фінальна перевірка, чи ніхто не зайняв профіль, поки ми думали над паролем
                    try {
                        const { data } = await supabaseClient.from('f1_data').select('data').eq('id', 'main_db').single();
                        if (data && data.data && data.data.pins && data.data.pins[pName]) {
                            alert("Хтось інший щойно зареєстрував цей профіль! Оновіть сторінку.");
                            return;
                        }
                    } catch(e) {}

                    db.pins[pName] = newPin.trim();
                    localStorage.setItem('f1_auth_player', pName);
                    myPlayer = pName;
                    await save();
                    render();
                } else if (newPin !== null) {
                    alert("Помилка: PIN-код має містити щонайменше 4 символи.");
                }
            } else {
                let enterPin = prompt(`Введіть PIN-код для доступу до профілю "${pName}":`);
                if (enterPin === db.pins[pName]) {
                    localStorage.setItem('f1_auth_player', pName);
                    myPlayer = pName;
                    render();
                } else if (enterPin !== null) {
                    alert("Невірний PIN-код!");
                }
            }
        }

        function changeMyPin() {
            if (!myPlayer) {
                alert("Ви ще не авторизовані. Спочатку натисніть на своє поле і введіть PIN.");
                return;
            }
            
            let currentPin = prompt(`Зміна PIN-коду для "${myPlayer}". Введіть ваш ПОТОЧНИЙ PIN-код:`);
            if (currentPin === null) return; // Гравець натиснув "Скасувати"
            
            if (currentPin === db.pins[myPlayer]) {
                let newPin = prompt("Введіть НОВИЙ PIN-код (мінімум 4 символи):");
                if (newPin && newPin.trim().length >= 4) {
                    db.pins[myPlayer] = newPin.trim();
                    save(); // Зберігаємо в Supabase
                    alert("Ваш PIN-код успішно змінено!");
                } else if (newPin !== null) {
                    alert("Помилка: новий PIN-код має містити щонайменше 4 символи.");
                }
            } else {
                alert("Невірний поточний PIN-код! Зміна скасована.");
            }
        }

        // Для адміна: якщо хтось вкрав чужий акаунт, адмін може скинути PIN через консоль
        function resetPin(pName) {
            if (db.pins && db.pins[pName]) {
                delete db.pins[pName];
                save();
                console.log(`PIN для ${pName} скинуто.`);
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            
            document.getElementById('gp-select-details').innerHTML = document.getElementById('gp-select').innerHTML;

            let h2hP1 = document.getElementById('h2h-p1');
            let h2hP2 = document.getElementById('h2h-p2');
            let p1HTML = '';
            
            teams.forEach(t => {
                let teamColor = teamColors[t.id][0];
                p1HTML += `<optgroup label="${t.n}" style="color:${teamColor};">`;
                t.p.forEach(p => p1HTML += `<option value="${p}" style="color:#fff;">${p}</option>`);
                p1HTML += `</optgroup>`;
            });
            h2hP1.innerHTML = p1HTML;
            h2hP2.innerHTML = p1HTML;
            
            let customDropdown = document.getElementById('h2h-custom-dropdown');
            let dropHTML = '';
            teams.forEach(t => {
                let tCol = teamColors[t.id][0];
                dropHTML += `<div class="dropdown-item" style="color:${tCol};" onclick="selectTeamH2H('${t.id}')">${t.n}</div>`;
            });
            customDropdown.innerHTML = dropHTML;

            document.getElementById('h2h-center-logo').addEventListener('click', function(e) {
                e.stopPropagation();
                customDropdown.classList.toggle('show');
            });
            
            document.addEventListener('click', function() {
                customDropdown.classList.remove('show');
            });

            if(teams[0].p.length >= 2) {
                h2hP1.value = teams[0].p[0];
                h2hP2.value = teams[0].p[1];
            }

            document.getElementById('gp-select').value = "Австралія";
            changeGP();
        });

        // Горизонтальний скрол коліщатком миші для Детальної таблиці
        document.addEventListener('DOMContentLoaded', () => {
            const wrappers = document.querySelectorAll('.table-scroll-wrapper');
            wrappers.forEach(wrapper => {
                wrapper.addEventListener('wheel', function(e) {
                    if (e.deltaY !== 0) {
                        // Перевіряємо, чи є куди скролити по горизонталі
                        const canScrollLeft = this.scrollLeft > 0;
                        const canScrollRight = this.scrollLeft < this.scrollWidth - this.clientWidth;
                        
                        // Якщо таблиця може скролитися в обраному напрямку, блокуємо вертикальний скрол сторінки
                        if ((e.deltaY < 0 && canScrollLeft) || (e.deltaY > 0 && canScrollRight)) {
                            e.preventDefault();
                            this.scrollLeft += e.deltaY;
                        }
                    }
                });
            });
        });

        // Глобальний обробник скролу коліщатком для детальної таблиці
        document.addEventListener('wheel', function(e) {
            const wrapper = e.target.closest('.table-scroll-wrapper');
            if (wrapper) {
                const canScrollLeft = wrapper.scrollLeft > 0;
                const canScrollRight = Math.ceil(wrapper.scrollLeft) < wrapper.scrollWidth - wrapper.clientWidth;
                
                // Якщо крутимо в межах таблиці - блокуємо рух сторінки і скролимо етапи
                if ((e.deltaY > 0 && canScrollRight) || (e.deltaY < 0 && canScrollLeft)) {
                    e.preventDefault();
                    wrapper.scrollLeft += e.deltaY;
                }
            }
        }, { passive: false });

        document.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('pass') !== '9123') { 
                document.querySelectorAll('.admin-only, .adj-btn').forEach(el => {
                    el.style.display = 'none';
                });
            }
        });

        // === АУДИТ ЗМІН ===
        function logChange(pName, action, actor) {
            if (!db.logs) db.logs = [];
            const entry = {
                time: new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' }),
                player: pName,
                action: action,
                actor: actor || "Система"
            };
            db.logs.unshift(entry);
            if (db.logs.length > 50) db.logs.pop(); // Зберігаємо останні 50 подій
        }

        function showLogs() {
            if (!db.logs || db.logs.length === 0) {
                alert("Логів поки немає.");
                return;
            }
            const logText = db.logs.slice(0, 20).map(l => `[${l.time}] ${l.player}: ${l.action} (Автор: ${l.actor})`).join('\n\n');
            alert("ОСТАННІ 20 ЗМІН:\n\n" + logText);
        }

        // === МЕНЕДЖЕР ПАРОЛІВ ===
        function managePins() {
            if (!isAdmin) return;
            if (!db.pins || Object.keys(db.pins).length === 0) {
                alert("База паролів порожня.");
                return;
            }
            
            let pinList = "Поточні PIN-коди гравців:\n\n";
            for (let p in db.pins) {
                pinList += `${p}: ${db.pins[p]}\n`;
            }
            pinList += "\nВведіть ім'я гравця, щоб ЗМІНИТИ або ВИДАЛИТИ його пароль (або натисніть Скасувати):";
            
            let targetPlayer = prompt(pinList);
            if (!targetPlayer) return;
            
            let actualName = Object.keys(db.pins).find(p => p.toLowerCase() === targetPlayer.trim().toLowerCase());
            
            if (actualName) {
                let newPin = prompt(`Введіть новий PIN для ${actualName}\n(Залиште порожнім, щоб повністю видалити пароль):`);
                if (newPin === null) return;
                
                if (newPin.trim() === "") {
                    delete db.pins[actualName];
                    alert(`Пароль для ${actualName} ВИДАЛЕНО.`);
                } else {
                    db.pins[actualName] = newPin.trim();
                    alert(`Пароль для ${actualName} змінено на: ${newPin.trim()}`);
                }
                save(); 
            } else {
                alert("Гравця з таким іменем не знайдено.");
            }
        }