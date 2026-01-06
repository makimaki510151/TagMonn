let gameData = { resistances: [], tags: [], moves: [] };
let myChars = JSON.parse(localStorage.getItem('tm_chars') || '[]');
let myParties = JSON.parse(localStorage.getItem('tm_parties') || '[]');

let currentBuild = { id: null, name: "", tags: [], moves: [] };
let currentPartyMembers = [];

let selectedP1 = null;
let selectedP2 = null;
let battleState = {
    p1: [], p2: [],
    p1ActiveIdx: -1, p2ActiveIdx: -1,
    p1NextAction: null, p2NextAction: null,
    isProcessing: false,
    isSelectingInitial: false,
    isForcedSwitch: null // 1 or 2
};

window.onload = async () => {
    const success = await loadData();
    if (success) {
        initPresets();
        setupEventListeners();
        showSection('build');
    }
};

async function loadData() {
    try {
        const res = await fetch('data.json');
        gameData = await res.json();
        return true;
    } catch (e) {
        console.error("データ読み込み失敗", e);
        return false;
    }
}

function initPresets() {
    if (myChars.length === 0) {
        const presets = [
            { name: "ファイアドラゴン", tags: [103, 113, 116], moves: [1031, 1131, 1162, 1], id: 1 },
            { name: "アクアナイト", tags: [104, 108, 120], moves: [1041, 1042, 1201, 1], id: 2 },
            { name: "サンダーバード", tags: [105, 110, 117], moves: [1051, 1101, 1171, 3], id: 3 },
            { name: "ダークウィザード", tags: [101, 118, 121], moves: [1011, 1181, 1211, 2], id: 4 },
            { name: "アイアンゴーレム", tags: [106, 111, 108], moves: [1061, 1111, 1081, 1], id: 5 },
            { name: "ホーリーエルフ", tags: [102, 109, 118], moves: [1021, 1022, 1091, 2], id: 6 }
        ];
        presets.forEach(p => {
            const tags = p.tags.map(tid => gameData.tags.find(t => t.id === tid));
            const moves = p.moves.map(mid => gameData.moves.find(m => m.id === mid));
            myChars.push({
                id: p.id, name: p.name, tags, moves,
                baseStats: calculateStats(tags),
                resistances: calculateResistances(tags)
            });
        });
        localStorage.setItem('tm_chars', JSON.stringify(myChars));
    }

    if (myParties.length === 0) {
        myParties.push({
            id: 1001, name: "【初心者用】バランスパーティ",
            members: [myChars[0], myChars[1], myChars[2]]
        });
        myParties.push({
            id: 1002, name: "【初心者用】テクニカルパーティ",
            members: [myChars[3], myChars[4], myChars[5]]
        });
        localStorage.setItem('tm_parties', JSON.stringify(myParties));
    }
}

function setupEventListeners() {
    document.getElementById('save-char-btn').onclick = saveCharacter;
    document.getElementById('save-party-btn').onclick = saveParty;
    document.getElementById('start-battle-btn').onclick = startBattle;
}

function showSection(id) {
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));

    const target = document.getElementById(`${id}-section`);
    const navBtn = document.querySelector(`nav button[onclick*="'${id}'"]`);

    if (target) target.classList.remove('hidden');
    if (navBtn) navBtn.classList.add('active');

    if (id === 'build') renderBuildScreen();
    if (id === 'party') renderPartyScreen();
    if (id === 'battle') renderBattleSetup();
}

function getResName(id) {
    const res = gameData.resistances.find(r => r.id === id);
    return res ? res.name : "無";
}

function showDetail(item, type) {
    const detailBox = document.getElementById('detail-display');
    if (!detailBox) return;
    let html = `<strong>${item.name}</strong><br>`;
    if (type === 'tag') {
        html += `HP:${item.hp > 0 ? '+' : ''}${item.hp} / ATK:${item.atk > 0 ? '+' : ''}${item.atk} / SPD:${item.spd || 0}<br>`;
        html += `<small>${item.description}</small>`;
    } else if (type === 'move') {
        const resName = getResName(item.res_type);
        html += `[${resName}] 威力:${item.power} 命中:${item.accuracy}<br>`;
        html += `<small>${item.description}</small>`;
    }
    detailBox.innerHTML = html;
}

function renderBuildScreen() {
    renderTags();
    updateBuildPreview();
    renderSavedChars();
}

function renderTags() {
    const container = document.getElementById('tag-container');
    if (!container) return;
    container.innerHTML = '';
    gameData.tags.forEach(tag => {
        const btn = document.createElement('button');
        const isActive = currentBuild.tags.some(t => t.id === tag.id);
        btn.className = `tag-btn ${isActive ? 'active' : ''}`;
        btn.textContent = tag.name;
        btn.onmouseover = () => showDetail(tag, 'tag');
        btn.onclick = () => {
            const idx = currentBuild.tags.findIndex(t => t.id === tag.id);
            if (idx > -1) currentBuild.tags.splice(idx, 1);
            else if (currentBuild.tags.length < 6) currentBuild.tags.push(tag);

            currentBuild.moves = currentBuild.moves.filter(move =>
                (move.required_tags || []).every(reqId => currentBuild.tags.some(t => t.id === reqId))
            );
            renderBuildScreen();
        };
        container.appendChild(btn);
    });
}

function calculateStats(tags) {
    let baseHp = 150, baseAtk = 80, baseSpd = 80;
    let modHp = 0, modAtk = 0, modSpd = 0;
    tags.forEach(t => {
        modHp += t.hp * 0.5;
        modAtk += t.atk * 0.3;
        modSpd += (t.spd || 0) * 0.3;
    });
    return {
        hp: Math.floor(baseHp + modHp),
        atk: Math.floor(baseAtk + modAtk),
        spd: Math.floor(baseSpd + modSpd)
    };
}

function calculateResistances(tags) {
    let res = { 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0 };
    tags.forEach(t => {
        if (t.name === "悪性") { res[3] *= 1.5; res[4] *= 0.7; }
        if (t.name === "善性") { res[4] *= 1.5; res[3] *= 0.7; }
        if (t.name === "火精" || t.name === "水精" || t.name === "雷精" || t.name === "風精") { res[2] *= 0.8; }
        if (t.name === "地精") { res[1] *= 0.8; res[2] *= 1.2; }
        if (t.name === "機械") { res[1] *= 0.7; res[2] *= 1.3; }
        if (t.name === "生体") { res[3] *= 0.8; res[4] *= 1.2; }
        if (t.name === "飛翔") { res[1] *= 1.2; res[2] *= 0.8; }
        if (t.name === "重厚") { res[1] *= 0.6; res[4] *= 1.4; }
        if (t.name === "電脳") { res[3] *= 0.7; res[2] *= 1.3; }
        if (t.name === "古龍") { res[2] *= 0.6; res[4] *= 1.2; }
        if (t.name === "不死") { res[4] *= 0.5; res[3] *= 1.5; }
        if (t.name === "虚空") { res[1] *= 0.5; res[3] *= 1.5; }
        if (t.name === "剛腕") { res[1] *= 0.9; }
        if (t.name === "俊足") { res[2] *= 0.9; }
        if (t.name === "知性") { res[3] *= 0.9; }
        if (t.name === "毒性") { res[4] *= 0.8; }
        if (t.name === "硬質") { res[1] *= 0.9; res[2] *= 0.9; res[3] *= 0.9; res[4] *= 0.9; }
        if (t.name === "幻影") { res[3] *= 0.8; res[1] *= 1.2; }
        if (t.name === "磁力") { res[4] *= 0.9; res[1] *= 1.1; }
        if (t.name === "音響") { res[2] *= 0.9; res[4] *= 1.1; }
    });
    return res;
}

function updateBuildPreview() {
    const moveCont = document.getElementById('move-candidate-container');
    if (!moveCont) return;
    moveCont.innerHTML = '';

    const available = gameData.moves.filter(m =>
        (m.required_tags || []).every(reqId => currentBuild.tags.some(t => t.id === reqId))
    );

    available.forEach(move => {
        const btn = document.createElement('button');
        const isSelected = currentBuild.moves.some(m => m.id === move.id);
        btn.className = `tag-btn ${isSelected ? 'active' : ''}`;
        btn.textContent = move.name;
        btn.onmouseover = () => showDetail(move, 'move');
        btn.onclick = () => {
            const idx = currentBuild.moves.findIndex(m => m.id === move.id);
            if (idx > -1) currentBuild.moves.splice(idx, 1);
            else if (currentBuild.moves.length < 4) currentBuild.moves.push(move);
            updateBuildPreview();
        };
        moveCont.appendChild(btn);
    });

    const stats = calculateStats(currentBuild.tags);
    const res = calculateResistances(currentBuild.tags);

    const statPreview = document.getElementById('stat-preview');
    let resHtml = '<div class="resistance-grid" style="margin-top:15px;">';
    Object.entries(res).forEach(([id, val]) => {
        const name = getResName(parseInt(id));
        let cls = '';
        if (val < 1.0) cls = 'res-resist';
        else if (val > 1.0) cls = 'res-weak';
        resHtml += `<div class="res-item ${cls}">${name}: ${Math.round(val * 100)}%</div>`;
    });
    resHtml += '</div>';

    statPreview.innerHTML = `
        <div class="stat-row"><span class="stat-label">HP</span><span class="stat-value">${stats.hp}</span></div>
        <div class="stat-row"><span class="stat-label">ATK</span><span class="stat-value">${stats.atk}</span></div>
        <div class="stat-row"><span class="stat-label">SPD</span><span class="stat-value">${stats.spd}</span></div>
        <div style="margin-top:10px; font-size:0.8rem; color:${currentBuild.tags.length < 3 ? 'var(--danger)' : 'var(--text-muted)'};">
            タグ数: ${currentBuild.tags.length}/6 (3つ以上必須)
        </div>
        <div style="font-size:0.8rem; color:var(--text-muted);">技スロット: ${currentBuild.moves.length}/4</div>
        ${resHtml}
    `;

    const saveBtn = document.getElementById('save-char-btn');
    saveBtn.textContent = currentBuild.id ? "キャラクターを更新" : "キャラクターを保存";
}

function saveCharacter() {
    const nameInput = document.getElementById('char-name');
    if (!nameInput.value) return alert("名前を入力してください");
    if (currentBuild.tags.length < 3) return alert("タグを3つ以上選択してください");

    const stats = calculateStats(currentBuild.tags);
    const res = calculateResistances(currentBuild.tags);

    const charData = {
        ...JSON.parse(JSON.stringify(currentBuild)),
        name: nameInput.value,
        baseStats: stats,
        resistances: res
    };

    if (currentBuild.id) {
        const idx = myChars.findIndex(c => c.id === currentBuild.id);
        myChars[idx] = charData;
    } else {
        charData.id = Date.now();
        myChars.push(charData);
    }

    localStorage.setItem('tm_chars', JSON.stringify(myChars));
    resetBuild();
    renderBuildScreen();
}

function resetBuild() {
    currentBuild = { id: null, name: "", tags: [], moves: [] };
    document.getElementById('char-name').value = "";
}

function editChar(id) {
    const char = myChars.find(c => c.id === id);
    if (!char) return;
    currentBuild = JSON.parse(JSON.stringify(char));
    document.getElementById('char-name').value = char.name;
    renderBuildScreen();
    window.scrollTo(0, 0);
}

function renderSavedChars() {
    const list = document.getElementById('saved-chars-list');
    if (!list) return;
    list.innerHTML = myChars.map(c => `
        <div class="mini-list">
            <span style="font-weight:600; cursor:pointer;" onclick="editChar(${c.id})">${c.name} <small>(編集)</small></span>
            <button class="del-btn" onclick="deleteChar(${c.id})">×</button>
        </div>
    `).join('');
}

function deleteChar(id) {
    if (!confirm("キャラを削除しますか？")) return;
    myChars = myChars.filter(c => c.id !== id);
    localStorage.setItem('tm_chars', JSON.stringify(myChars));
    renderSavedChars();
}

function renderPartyScreen() {
    const cand = document.getElementById('party-char-candidates');
    cand.innerHTML = '';
    myChars.forEach(char => {
        const btn = document.createElement('button');
        btn.className = 'tag-btn';
        btn.textContent = char.name;
        btn.onclick = () => {
            if (currentPartyMembers.length < 6) {
                currentPartyMembers.push(char);
                renderCurrentParty();
            }
        };
        cand.appendChild(btn);
    });
    renderCurrentParty();
    renderSavedParties();
}

function renderCurrentParty() {
    const list = document.getElementById('current-party-list');
    list.innerHTML = currentPartyMembers.map((m, i) => `
        <div class="mini-list">
            <span>${m.name}</span>
            <button class="del-btn" onclick="currentPartyMembers.splice(${i}, 1); renderCurrentParty();">×</button>
        </div>
    `).join('');
}

function renderSavedParties() {
    const list = document.getElementById('saved-parties-list');
    list.innerHTML = myParties.map(p => `
        <div class="mini-list">
            <span>${p.name} <small>(${p.members.length}体)</small></span>
            <button class="del-btn" onclick="deleteParty(${p.id})">×</button>
        </div>
    `).join('');
}

function deleteParty(id) {
    if (!confirm("パーティを削除しますか？")) return;
    myParties = myParties.filter(p => p.id !== id);
    localStorage.setItem('tm_parties', JSON.stringify(myParties));
    renderSavedParties();
}

function saveParty() {
    const name = document.getElementById('party-name').value;
    if (!name || currentPartyMembers.length === 0) return alert("名前とメンバーが必要です");
    myParties.push({ name, members: [...currentPartyMembers], id: Date.now() });
    localStorage.setItem('tm_parties', JSON.stringify(myParties));
    currentPartyMembers = [];
    document.getElementById('party-name').value = "";
    renderPartyScreen();
}

function renderBattleSetup() {
    const p1div = document.getElementById('select-p1-party');
    const p2div = document.getElementById('select-p2-party');
    const draw = (p, pNum) => `<button class="tag-btn ${((pNum === 1 ? selectedP1 : selectedP2)?.id === p.id) ? 'active' : ''}" onclick="setBattleParty(${pNum}, ${p.id})">${p.name}</button>`;
    p1div.innerHTML = myParties.map(p => draw(p, 1)).join('');
    p2div.innerHTML = myParties.map(p => draw(p, 2)).join('');
}

window.setBattleParty = (pNum, pId) => {
    const party = myParties.find(p => p.id == pId);
    if (pNum === 1) selectedP1 = party;
    else selectedP2 = party;
    renderBattleSetup();
};

function startBattle() {
    if (!selectedP1 || !selectedP2) return alert("パーティを選んでください");
    document.getElementById('battle-setup').classList.add('hidden');
    document.getElementById('battle-field').classList.remove('hidden');

    const initSet = (m) => {
        return {
            ...m,
            maxHp: m.baseStats.hp,
            currentHp: m.baseStats.hp,
            battleSpd: m.baseStats.spd,
            battleAtk: m.baseStats.atk,
            isFainted: false
        };
    };
    battleState.p1 = selectedP1.members.map(initSet);
    battleState.p2 = selectedP2.members.map(initSet);
    
    // 選出フェーズの初期化
    battleState.p1ActiveIdx = -1;
    battleState.p2ActiveIdx = -1;
    battleState.isSelectingInitial = true;
    battleState.isForcedSwitch = null;

    document.getElementById('battle-log').innerHTML = "<div>バトル開始！1体目のキャラを選んでください。</div>";
    updateBattleUI();
}

function updateBattleUI() {
    const a1 = battleState.p1ActiveIdx !== -1 ? battleState.p1[battleState.p1ActiveIdx] : null;
    const a2 = battleState.p2ActiveIdx !== -1 ? battleState.p2[battleState.p2ActiveIdx] : null;

    updateCharDisplay(1, a1);
    updateCharDisplay(2, a2);

    if (battleState.isSelectingInitial) {
        renderSelectionPanel();
    } else if (battleState.isForcedSwitch) {
        renderSelectionPanel();
    } else {
        renderActionPanel(1, a1, 'move-actions');
        renderActionPanel(2, a2, 'switch-actions');
    }
}

function updateCharDisplay(pNum, char) {
    const prefix = pNum === 1 ? 'p1' : 'p2';
    const infoEl = document.getElementById(`${prefix}-active-info`);
    const fillEl = document.getElementById(pNum === 1 ? 'p1-fill' : 'p2-hp-fill');

    if (!char) {
        infoEl.innerHTML = `<div class="char-name" style="color:var(--text-muted)">選出待機中...</div>`;
        fillEl.style.width = `0%`;
        return;
    }

    let resHtml = `<div class="resistance-grid ${pNum === 2 ? 'right' : ''}" style="margin-top: 8px;">`;
    Object.entries(char.resistances).forEach(([id, val]) => {
        const name = getResName(parseInt(id));
        let cls = '';
        if (val < 1.0) cls = 'res-resist';
        else if (val > 1.0) cls = 'res-weak';
        resHtml += `<div class="res-item ${cls}" style="font-size:0.65rem;">${name}:${Math.round(val * 100)}%</div>`;
    });
    resHtml += '</div>';

    infoEl.innerHTML = `
        <div class="char-name">${char.name}</div>
        <div class="char-stats">
            HP: ${Math.floor(char.currentHp)}/${char.maxHp} | ATK: ${Math.floor(char.battleAtk)} | SPD: ${Math.floor(char.battleSpd)}
        </div>
        ${resHtml}
    `;

    const hpPercent = (char.currentHp / char.maxHp) * 100;
    fillEl.style.width = `${hpPercent}%`;
    fillEl.className = 'fill';
    if (hpPercent < 20) fillEl.classList.add('danger');
    else if (hpPercent < 50) fillEl.classList.add('warning');
}

function renderSelectionPanel() {
    const moveCont = document.getElementById('move-actions');
    const switchCont = document.getElementById('switch-actions');
    
    // 表示のリセット
    moveCont.innerHTML = "";
    switchCont.innerHTML = "";

    // どちらのプレイヤーが選ぶべきか判定
    let pNum = 1;
    if (battleState.isSelectingInitial) {
        pNum = battleState.p1ActiveIdx === -1 ? 1 : 2;
    } else {
        pNum = battleState.isForcedSwitch;
    }

    const container = pNum === 1 ? moveCont : switchCont;
    container.innerHTML = `<h4>Player ${pNum} 出すキャラを選択</h4><div class="action-grid"></div>`;
    const grid = container.querySelector('.action-grid');

    const party = pNum === 1 ? battleState.p1 : battleState.p2;
    party.forEach((c, idx) => {
        if (!c.isFainted) {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.style.textAlign = 'left';
            btn.style.height = 'auto';

            let resSummary = '';
            Object.entries(c.resistances).forEach(([id, val]) => {
                if (val !== 1.0) {
                    const name = getResName(parseInt(id)).charAt(0);
                    resSummary += `<span style="color:${val < 1.0 ? 'var(--success)' : 'var(--danger)'}; margin-right:4px;">${name}${Math.round(val * 100)}</span>`;
                }
            });

            btn.innerHTML = `
                <div style="font-weight:bold; font-size:0.8rem;">${c.name}</div>
                <div style="font-size:0.7rem; color:var(--text-muted);">H:${Math.floor(c.currentHp)} A:${c.battleAtk} S:${c.battleSpd}</div>
                <div style="font-size:0.6rem; margin-top:2px;">${resSummary}</div>
            `;

            btn.onclick = () => selectCharacter(pNum, idx);
            grid.appendChild(btn);
        }
    });
}

function selectCharacter(pNum, idx) {
    const party = pNum === 1 ? battleState.p1 : battleState.p2;
    
    if (battleState.isSelectingInitial) {
        if (pNum === 1) battleState.p1ActiveIdx = idx;
        else {
            battleState.p2ActiveIdx = idx;
            battleState.isSelectingInitial = false;
        }
        log(`P${pNum}: ${party[idx].name}を繰り出した！`);
    } else if (battleState.isForcedSwitch) {
        if (pNum === 1) battleState.p1ActiveIdx = idx;
        else battleState.p2ActiveIdx = idx;
        
        log(`P${pNum}: 交代して ${party[idx].name}を繰り出した！`);
        battleState.isForcedSwitch = null;
    }
    
    updateBattleUI();
}

function renderActionPanel(pNum, char, containerId) {
    const cont = document.getElementById(containerId);
    cont.innerHTML = `<h4>Player ${pNum} の選択</h4><div class="action-grid"></div>`;
    const grid = cont.querySelector('.action-grid');

    if (battleState.isProcessing || battleState.isForcedSwitch) return;

    char.moves.forEach(m => {
        const btn = document.createElement('button');
        btn.textContent = m.name;
        btn.onmouseover = () => showDetail(m, 'move');
        btn.className = 'action-btn';
        if ((pNum === 1 ? battleState.p1NextAction : battleState.p2NextAction)?.move?.id === m.id) {
            btn.classList.add('active');
        }
        btn.onclick = () => {
            if (pNum === 1) battleState.p1NextAction = { type: 'move', move: m };
            else battleState.p2NextAction = { type: 'move', move: m };
            checkTurnReady();
        };
        grid.appendChild(btn);
    });

    const party = pNum === 1 ? battleState.p1 : battleState.p2;
    party.forEach((c, idx) => {
        if (idx !== (pNum === 1 ? battleState.p1ActiveIdx : battleState.p2ActiveIdx) && !c.isFainted) {
            const btn = document.createElement('button');
            btn.className = 'action-btn switch';
            btn.style.textAlign = 'left';
            btn.style.height = 'auto';
            btn.style.padding = '8px';

            let resSummary = '';
            Object.entries(c.resistances).forEach(([id, val]) => {
                if (val !== 1.0) {
                    const name = getResName(parseInt(id)).charAt(0);
                    resSummary += `<span style="color:${val < 1.0 ? 'var(--success)' : 'var(--danger)'}; margin-right:4px;">${name}${Math.round(val * 100)}</span>`;
                }
            });

            btn.innerHTML = `
                <div style="font-weight:bold; font-size:0.8rem;">交代:${c.name}</div>
                <div style="font-size:0.7rem; color:var(--text-muted);">H:${Math.floor(c.currentHp)} A:${c.battleAtk} S:${c.battleSpd}</div>
                <div style="font-size:0.6rem; margin-top:2px;">${resSummary}</div>
            `;

            btn.onclick = () => {
                if (pNum === 1) battleState.p1NextAction = { type: 'switch', index: idx };
                else battleState.p2NextAction = { type: 'switch', index: idx };
                checkTurnReady();
            };
            grid.appendChild(btn);
        }
    });
}

function checkTurnReady() {
    if (battleState.p1NextAction && battleState.p2NextAction) {
        processTurn();
    } else {
        updateBattleUI();
    }
}

async function processTurn() {
    battleState.isProcessing = true;
    updateBattleUI();

    let acts = [
        { p: 1, act: battleState.p1NextAction, char: battleState.p1[battleState.p1ActiveIdx] },
        { p: 2, act: battleState.p2NextAction, char: battleState.p2[battleState.p2ActiveIdx] }
    ];

    acts.sort((a, b) => {
        const priA = (a.act.type === 'switch' ? 1000 : (a.act.move.priority || 0) * 100) + a.char.battleSpd;
        const priB = (b.act.type === 'switch' ? 1000 : (b.act.move.priority || 0) * 100) + b.char.battleSpd;
        return priB - priA;
    });

    for (let a of acts) {
        if (a.char.isFainted) continue;

        if (a.act.type === 'switch') {
            const party = a.p === 1 ? battleState.p1 : battleState.p2;
            const prevIdx = a.p === 1 ? battleState.p1ActiveIdx : battleState.p2ActiveIdx;
            const prevName = party[prevIdx].name;
            if (a.p === 1) battleState.p1ActiveIdx = a.act.index;
            else battleState.p2ActiveIdx = a.act.index;
            log(`P${a.p}: ${prevName}を戻して ${party[a.act.index].name}を繰り出した！`);
        } else {
            const attacker = a.char;
            const targetSideNum = a.p === 1 ? 2 : 1;
            const targetIdx = targetSideNum === 1 ? battleState.p1ActiveIdx : battleState.p2ActiveIdx;
            const target = targetSideNum === 1 ? battleState.p1[targetIdx] : battleState.p2[targetIdx];
            const targetSideId = a.p === 1 ? 'p2-active-area' : 'p1-active-area';

            log(`P${a.p}: ${attacker.name}の ${a.act.move.name}！`);

            const targetEl = document.getElementById(targetSideId);
            targetEl.classList.add('shake', 'flash');
            setTimeout(() => targetEl.classList.remove('shake', 'flash'), 500);

            const move = a.act.move;
            const resMult = target.resistances[move.res_type] || 1.0;
            let damage = Math.floor(move.power * (attacker.battleAtk / 80) * resMult);

            if (damage > 0) {
                if (resMult > 1.0) log("効果は抜群だ！");
                if (resMult < 1.0) log("効果はいまひとつのようだ...");
            }

            target.currentHp = Math.max(0, target.currentHp - damage);

            if (move.effect) {
                const eff = move.effect;
                if (Math.random() < (eff.chance || 1.0)) {
                    if (eff.type === 'buff') {
                        attacker[`battle${eff.stat.charAt(0).toUpperCase() + eff.stat.slice(1)}`] *= eff.value;
                        log(`${attacker.name}の${eff.stat}が上がった！`);
                    } else if (eff.type === 'debuff') {
                        target[`battle${eff.stat.charAt(0).toUpperCase() + eff.stat.slice(1)}`] *= eff.value;
                        log(`${target.name}の${eff.stat}が下がった！`);
                    } else if (eff.type === 'heal') {
                        const healAmt = Math.floor(attacker.maxHp * eff.value);
                        attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmt);
                        log(`${attacker.name}は体力を回復した！`);
                    } else if (eff.type === 'drain') {
                        const drainAmt = Math.floor(damage * eff.value);
                        attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + drainAmt);
                        log(`${attacker.name}は体力を吸収した！`);
                    }
                }
            }

            if (target.currentHp <= 0) {
                target.isFainted = true;
                log(`${target.name}は倒れた！`);
                
                const party = targetSideNum === 1 ? battleState.p1 : battleState.p2;
                const hasSurvivor = party.some(c => !c.isFainted);
                
                if (!hasSurvivor) {
                    log(`P${targetSideNum}の全滅！ P${a.p}の勝利！`);
                    battleState.isProcessing = false;
                    updateBattleUI();
                    return;
                } else {
                    // 交代先選択フラグを立てて、ターン処理を中断
                    battleState.isForcedSwitch = targetSideNum;
                    battleState.p1NextAction = null;
                    battleState.p2NextAction = null;
                    battleState.isProcessing = false;
                    updateBattleUI();
                    return; 
                }
            }
        }
        updateBattleUI();
        await new Promise(r => setTimeout(r, 1000));
    }

    battleState.p1NextAction = null;
    battleState.p2NextAction = null;
    battleState.isProcessing = false;
    updateBattleUI();
}

function log(m) {
    const d = document.getElementById('battle-log');
    const entry = document.createElement('div');
    entry.textContent = m;
    d.appendChild(entry);
    d.scrollTop = d.scrollHeight;
}