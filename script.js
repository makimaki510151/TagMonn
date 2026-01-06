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
    isForcedSwitch: null
};

const DEFAULT_SERVER_URL = "https://makkili.a.pinggy.link";
let socket = null;
let onlineState = {
    id: null,
    name: "",
    roomId: null,
    role: null,
    partyLimit: 3,
    opponentName: "",
    isOnlineBattle: false
};

window.onload = async () => {
    const success = await loadData();
    if (success) {
        initPresets();
        setupEventListeners();
        showSection('build');
        checkServerStatus();
    }
};

async function checkServerStatus() {
    const lamp = document.getElementById('status-lamp');
    const text = document.getElementById('status-text');
    if (!lamp || !text) return;
    try {
        await fetch(`${DEFAULT_SERVER_URL}/socket.io/?EIO=4&transport=polling`, { mode: 'no-cors' });
        lamp.style.background = 'var(--success)';
        text.textContent = 'サーバー稼働中';
    } catch (e) {
        lamp.style.background = 'var(--danger)';
        text.textContent = 'サーバー停止中';
    }
}

function showBattleModeSelect() {
    if (window._isShowingBattleMode) return;
    window._isShowingBattleMode = true;
    showSection('battle');
    document.getElementById('battle-mode-select').classList.remove('hidden');
    document.getElementById('battle-setup').classList.add('hidden');
    document.getElementById('battle-field').classList.add('hidden');
    document.getElementById('online-section').classList.add('hidden');
    window._isShowingBattleMode = false;
}

function showBattleSetup(mode) {
    document.getElementById('battle-mode-select').classList.add('hidden');
    if (mode === 'local') {
        document.getElementById('battle-setup').classList.remove('hidden');
        renderBattleSetup();
    } else {
        document.getElementById('battle-section').classList.remove('hidden');
        document.getElementById('online-section').classList.remove('hidden');
        document.getElementById('online-login').classList.remove('hidden');
        document.getElementById('online-lobby').classList.add('hidden');
        document.getElementById('online-regulation').classList.add('hidden');
        document.getElementById('online-party-select').classList.add('hidden');
        checkServerStatus();
    }
}

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
            { name: "ファイアドラゴン", tags: [103, 113, 116], moves: [1031, 1131, 1162, 1161], id: 1 },
            { name: "アクアナイト", tags: [104, 108, 120], moves: [1041, 1042, 1201, 1081], id: 2 },
            { name: "サンダーバード", tags: [105, 110, 117], moves: [1051, 1101, 1171, 1101], id: 3 },
            { name: "ダークウィザード", tags: [101, 118, 121], moves: [1011, 1181, 1211, 1181], id: 4 },
            { name: "アイアンゴーレム", tags: [106, 111, 108], moves: [1061, 1111, 1081, 1111], id: 5 },
            { name: "ホーリーエルフ", tags: [102, 109, 118], moves: [1021, 1022, 1091, 1022], id: 6 }
        ];
        presets.forEach(p => {
            const tags = p.tags.map(tid => gameData.tags.find(t => t.id === tid));
            const moves = p.moves.map(mid => gameData.moves.find(m => m.id === mid));
            myChars.push({ id: p.id, name: p.name, tags, moves, baseStats: calculateStats(tags), resistances: calculateResistances(tags) });
        });
        localStorage.setItem('tm_chars', JSON.stringify(myChars));
    }
    if (myParties.length === 0) {
        myParties.push({ id: 1001, name: "【初心者用】バランスパーティ", members: [myChars[0], myChars[1], myChars[2]] });
        myParties.push({ id: 1002, name: "【初心者用】テクニカルパーティ", members: [myChars[3], myChars[4], myChars[5]] });
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
    if (id === 'battle') {
        const isBattleFieldVisible = !document.getElementById('battle-field').classList.contains('hidden');
        const isBattleSetupVisible = !document.getElementById('battle-setup').classList.contains('hidden');
        const isOnlineSectionVisible = !document.getElementById('online-section').classList.contains('hidden');
        if (!battleState.isProcessing && !isBattleFieldVisible && !isBattleSetupVisible && !isOnlineSectionVisible) {
            showBattleModeSelect();
        }
    }
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
        html += `HP:${item.hp} / ATK:${item.atk} / SPD:${item.spd || 0}<br><small>${item.description}</small>`;
    } else if (type === 'move') {
        html += `[${getResName(item.res_type)}] 威力:${item.power} 命中:${item.accuracy}<br><small>${item.description}</small>`;
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
            currentBuild.moves = currentBuild.moves.filter(move => (move.required_tags || []).every(reqId => currentBuild.tags.some(t => t.id === reqId)));
            renderBuildScreen();
        };
        container.appendChild(btn);
    });
}

function calculateStats(tags) {
    let baseHp = 150, baseAtk = 80, baseSpd = 80;
    let modHp = 0, modAtk = 0, modSpd = 0;
    tags.forEach(t => { modHp += t.hp * 0.5; modAtk += t.atk * 0.3; modSpd += (t.spd || 0) * 0.3; });
    return { hp: Math.floor(baseHp + modHp), atk: Math.floor(baseAtk + modAtk), spd: Math.floor(baseSpd + modSpd) };
}

function calculateResistances(tags) {
    let res = { 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0 };
    tags.forEach(t => {
        if (t.name === "悪性") { res[3] *= 1.5; res[4] *= 0.7; }
        if (t.name === "善性") { res[4] *= 1.5; res[3] *= 0.7; }
        if (["火精", "水精", "雷精", "風精"].includes(t.name)) { res[2] *= 0.8; }
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
    const available = gameData.moves.filter(m => (m.required_tags || []).every(reqId => currentBuild.tags.some(t => t.id === reqId)));
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
        resHtml += `<div class="res-item ${val < 1.0 ? 'res-resist' : (val > 1.0 ? 'res-weak' : '')}">${name}: ${Math.round(val * 100)}%</div>`;
    });
    resHtml += '</div>';
    statPreview.innerHTML = `
        <div class="stat-row"><span class="stat-label">HP</span><span class="stat-value">${stats.hp}</span></div>
        <div class="stat-row"><span class="stat-label">ATK</span><span class="stat-value">${stats.atk}</span></div>
        <div class="stat-row"><span class="stat-label">SPD</span><span class="stat-value">${stats.spd}</span></div>
        <div style="margin-top:10px; font-size:0.8rem; color:${currentBuild.tags.length < 3 ? 'var(--danger)' : 'var(--text-muted)'};">タグ数: ${currentBuild.tags.length}/6 (3つ以上必須)</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">技スロット: ${currentBuild.moves.length}/4</div>
        ${resHtml}
    `;
    document.getElementById('save-char-btn').textContent = currentBuild.id ? "キャラクターを更新" : "キャラクターを保存";
}

function saveCharacter() {
    const nameInput = document.getElementById('char-name');
    if (!nameInput.value) return alert("名前を入力してください");
    if (currentBuild.tags.length < 3) return alert("タグを3つ以上選択してください");
    const stats = calculateStats(currentBuild.tags);
    const res = calculateResistances(currentBuild.tags);
    const charData = { ...JSON.parse(JSON.stringify(currentBuild)), name: nameInput.value, baseStats: stats, resistances: res };
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

function resetBuild() { currentBuild = { id: null, name: "", tags: [], moves: [] }; document.getElementById('char-name').value = ""; }

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
        btn.onclick = () => { if (currentPartyMembers.length < 6) { currentPartyMembers.push(char); renderCurrentParty(); } };
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
    onlineState.isOnlineBattle = false;
    document.getElementById('battle-setup').classList.add('hidden');
    document.getElementById('battle-field').classList.remove('hidden');
    document.getElementById('online-back-btn').classList.add('hidden');
    const initSet = (m) => ({ ...m, maxHp: m.baseStats.hp, currentHp: m.baseStats.hp, battleSpd: m.baseStats.spd, battleAtk: m.baseStats.atk, isFainted: false });
    battleState.p1 = selectedP1.members.map(initSet);
    battleState.p2 = selectedP2.members.map(initSet);
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
    if (onlineState.isOnlineBattle && battleState.isSelectingInitial && a2 === null && onlineState.role === 1) {
        updateCharDisplay(1, a1); updateCharDisplay(2, null);
    } else if (onlineState.isOnlineBattle && battleState.isSelectingInitial && a1 === null && onlineState.role === 2) {
        updateCharDisplay(1, null); updateCharDisplay(2, a2);
    } else {
        updateCharDisplay(1, a1); updateCharDisplay(2, a2);
    }
    if (battleState.isSelectingInitial || battleState.isForcedSwitch) {
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
        infoEl.innerHTML = `<div class="char-name" style="color:var(--text-muted)">? ? ?</div>`;
        fillEl.style.width = `0%`; return;
    }
    const isOpponent = onlineState.isOnlineBattle && onlineState.role !== pNum;
    let resHtml = `<div class="resistance-grid ${pNum === 2 ? 'right' : ''}" style="margin-top: 8px;">`;
    Object.entries(char.resistances).forEach(([id, val]) => {
        const name = getResName(parseInt(id));
        resHtml += `<div class="res-item ${val < 1.0 ? 'res-resist' : (val > 1.0 ? 'res-weak' : '')}" style="font-size:0.65rem;">${name}:${Math.round(val * 100)}%</div>`;
    });
    resHtml += '</div>';
    infoEl.innerHTML = `
        <div class="char-name">${char.name}</div>
        <div class="char-stats">HP: ${Math.floor(char.currentHp)}/${char.maxHp} ${!isOpponent ? `| ATK: ${Math.floor(char.battleAtk)} | SPD: ${Math.floor(char.battleSpd)}` : ''}</div>
        ${resHtml}
    `;
    const hpPercent = (char.currentHp / char.maxHp) * 100;
    fillEl.style.width = `${hpPercent}%`;
    fillEl.className = 'fill' + (hpPercent < 20 ? ' danger' : (hpPercent < 50 ? ' warning' : ''));
}

function renderSelectionPanel() {
    const moveCont = document.getElementById('move-actions');
    const switchCont = document.getElementById('switch-actions');
    moveCont.innerHTML = ""; switchCont.innerHTML = "";
    if (onlineState.isOnlineBattle) {
        if (onlineState.role === 1) renderOnlineSelection(1, moveCont);
        else renderOnlineSelection(2, switchCont);
        return;
    }
    let pNum = battleState.isSelectingInitial ? (battleState.p1ActiveIdx === -1 ? 1 : 2) : battleState.isForcedSwitch;
    const container = pNum === 1 ? moveCont : switchCont;
    container.innerHTML = `<h4>Player ${pNum} 出すキャラを選択</h4><div class="action-grid"></div>`;
    generateSelectionButtons(pNum, container.querySelector('.action-grid'));
}

function renderOnlineSelection(pNum, container) {
    let isMyTurn = battleState.isSelectingInitial ? (pNum === 1 && battleState.p1ActiveIdx === -1) || (pNum === 2 && battleState.p2ActiveIdx === -1) : battleState.isForcedSwitch === pNum;
    if (isMyTurn) {
        container.innerHTML = `<h4>あなたの選出</h4><div class="action-grid"></div>`;
        generateSelectionButtons(pNum, container.querySelector('.action-grid'));
    } else {
        container.innerHTML = `<h4>相手の選出待ち...</h4>`;
    }
}

function generateSelectionButtons(pNum, grid) {
    const party = pNum === 1 ? battleState.p1 : battleState.p2;
    party.forEach((c, idx) => {
        if (!c.isFainted) {
            const btn = document.createElement('button');
            btn.className = 'action-btn'; btn.style.textAlign = 'left'; btn.style.height = 'auto';
            let resSummary = '';
            Object.entries(c.resistances).forEach(([id, val]) => { if (val !== 1.0) resSummary += `<span style="color:${val < 1.0 ? 'var(--success)' : 'var(--danger)'}; margin-right:4px;">${getResName(parseInt(id)).charAt(0)}${Math.round(val * 100)}</span>`; });
            btn.innerHTML = `<div style="font-weight:bold; font-size:0.8rem;">${c.name}</div><div style="font-size:0.7rem; color:var(--text-muted);">H:${Math.floor(c.currentHp)} A:${c.battleAtk} S:${c.battleSpd}</div><div style="font-size:0.6rem; margin-top:2px;">${resSummary}</div>`;
            btn.onclick = () => selectCharacter(pNum, idx);
            grid.appendChild(btn);
        }
    });
}

function selectCharacter(pNum, idx) {
    if (onlineState.isOnlineBattle) {
        if (battleState.isSelectingInitial) {
            socket.emit('submit_initial_pick', { roomId: onlineState.roomId, role: onlineState.role, index: idx });
            document.getElementById('waiting-overlay').classList.remove('hidden');
        } else if (battleState.isForcedSwitch) {
            socket.emit('submit_action', { roomId: onlineState.roomId, role: onlineState.role, action: { type: 'switch', index: idx } });
            document.getElementById('waiting-overlay').classList.remove('hidden');
        }
        return;
    }
    const party = pNum === 1 ? battleState.p1 : battleState.p2;
    if (battleState.isSelectingInitial) {
        if (pNum === 1) battleState.p1ActiveIdx = idx;
        else { battleState.p2ActiveIdx = idx; battleState.isSelectingInitial = false; }
        log(`P${pNum}: ${party[idx].name}を繰り出した！`);
    } else if (battleState.isForcedSwitch) {
        if (pNum === 1) battleState.p1ActiveIdx = idx; else battleState.p2ActiveIdx = idx;
        log(`P${pNum}: 交代して ${party[idx].name}を繰り出した！`);
        battleState.isForcedSwitch = null;
    }
    updateBattleUI();
}

function renderActionPanel(pNum, char, containerId) {
    const cont = document.getElementById(containerId);
    if (onlineState.isOnlineBattle) {
        if (onlineState.role !== pNum) { cont.innerHTML = ``; return; }
        cont.innerHTML = `<h4>あなた(${pNum}) の選択</h4><div class="action-grid"></div>`;
    } else {
        cont.innerHTML = `<h4>Player ${pNum} の選択</h4><div class="action-grid"></div>`;
    }
    const grid = cont.querySelector('.action-grid');
    if (battleState.isProcessing || battleState.isForcedSwitch) return;
    if (onlineState.isOnlineBattle) {
        if ((onlineState.role === 1 && battleState.p1NextAction) || (onlineState.role === 2 && battleState.p2NextAction)) {
            grid.innerHTML = "<div>行動選択済み。待機中...</div>"; return;
        }
    }
    char.moves.forEach(m => {
        const btn = document.createElement('button');
        btn.textContent = m.name; btn.onmouseover = () => showDetail(m, 'move'); btn.className = 'action-btn';
        if ((pNum === 1 ? battleState.p1NextAction : battleState.p2NextAction)?.move?.id === m.id) btn.classList.add('active');
        btn.onclick = () => handleAction(pNum, { type: 'move', move: m });
        grid.appendChild(btn);
    });
    const party = pNum === 1 ? battleState.p1 : battleState.p2;
    party.forEach((c, idx) => {
        if (idx !== (pNum === 1 ? battleState.p1ActiveIdx : battleState.p2ActiveIdx) && !c.isFainted) {
            const btn = document.createElement('button');
            btn.className = 'action-btn switch'; btn.style.textAlign = 'left'; btn.style.height = 'auto'; btn.style.padding = '8px';
            btn.innerHTML = `<div style="font-weight:bold; font-size:0.8rem;">交代:${c.name}</div><div style="font-size:0.7rem; color:var(--text-muted);">H:${Math.floor(c.currentHp)} A:${c.battleAtk} S:${c.battleSpd}</div>`;
            btn.onclick = () => handleAction(pNum, { type: 'switch', index: idx });
            grid.appendChild(btn);
        }
    });
}

function handleAction(pNum, action) {
    if (onlineState.isOnlineBattle) {
        socket.emit('submit_action', { roomId: onlineState.roomId, role: onlineState.role, action });
        if (pNum === 1) battleState.p1NextAction = action; else battleState.p2NextAction = action;
        document.getElementById('waiting-overlay').classList.remove('hidden');
        renderActionPanel(pNum, (pNum === 1 ? battleState.p1[battleState.p1ActiveIdx] : battleState.p2[battleState.p2ActiveIdx]), pNum === 1 ? 'move-actions' : 'switch-actions');
    } else {
        if (pNum === 1) battleState.p1NextAction = action; else battleState.p2NextAction = action;
        if (battleState.p1NextAction && battleState.p2NextAction) localProcessTurn();
        else updateBattleUI();
    }
}

async function localProcessTurn() {
    battleState.isProcessing = true; updateBattleUI();
    let acts = [{ p: 1, act: battleState.p1NextAction, char: battleState.p1[battleState.p1ActiveIdx] }, { p: 2, act: battleState.p2NextAction, char: battleState.p2[battleState.p2ActiveIdx] }];
    acts.sort((a, b) => ((b.act.type === 'switch' ? 1000 : (b.act.move.priority || 0) * 100) + b.char.battleSpd) - ((a.act.type === 'switch' ? 1000 : (a.act.move.priority || 0) * 100) + a.char.battleSpd));
    for (let a of acts) {
        if (a.char.isFainted) continue;
        if (a.act.type === 'switch') {
            const party = a.p === 1 ? battleState.p1 : battleState.p2;
            const prevName = party[a.p === 1 ? battleState.p1ActiveIdx : battleState.p2ActiveIdx]?.name || "???";
            if (a.p === 1) battleState.p1ActiveIdx = a.act.index; else battleState.p2ActiveIdx = a.act.index;
            log(`P${a.p}: ${prevName}を戻して ${party[a.act.index].name}を繰り出した！`);
        } else {
            const attacker = a.char; const targetSideNum = a.p === 1 ? 2 : 1;
            const target = (targetSideNum === 1 ? battleState.p1 : battleState.p2)[targetSideNum === 1 ? battleState.p1ActiveIdx : battleState.p2ActiveIdx];
            log(`P${a.p}: ${attacker.name}の ${a.act.move.name}！`);
            const targetEl = document.getElementById(a.p === 1 ? 'p2-active-area' : 'p1-active-area');
            targetEl.classList.add('shake', 'flash'); setTimeout(() => targetEl.classList.remove('shake', 'flash'), 500);
            const resMult = target.resistances[a.act.move.res_type] || 1.0;
            let damage = Math.floor(a.act.move.power * (attacker.battleAtk / 80) * resMult);
            if (damage > 0) { if (resMult > 1.0) log("効果は抜群だ！"); if (resMult < 1.0) log("効果はいまひとつのようだ..."); }
            target.currentHp = Math.max(0, target.currentHp - damage);
            if (a.act.move.effect && Math.random() < (a.act.move.effect.chance || 1.0)) {
                const eff = a.act.move.effect;
                if (eff.type === 'buff') { attacker[`battle${eff.stat.charAt(0).toUpperCase() + eff.stat.slice(1)}`] *= eff.value; log(`${attacker.name}の${eff.stat}が上がった！`); }
                else if (eff.type === 'debuff') { target[`battle${eff.stat.charAt(0).toUpperCase() + eff.stat.slice(1)}`] *= eff.value; log(`${target.name}の${eff.stat}が下がった！`); }
            }
            if (target.currentHp <= 0) {
                target.isFainted = true; log(`${target.name}は倒れた！`);
                const party = targetSideNum === 1 ? battleState.p1 : battleState.p2;
                if (!party.some(c => !c.isFainted)) { log(`P${targetSideNum}全滅！ P${a.p}の勝利！`); battleState.isProcessing = false; updateBattleUI(); return; }
                else { battleState.isForcedSwitch = targetSideNum; battleState.p1NextAction = null; battleState.p2NextAction = null; battleState.isProcessing = false; updateBattleUI(); return; }
            }
        }
        updateBattleUI(); await new Promise(r => setTimeout(r, 1000));
    }
    battleState.p1NextAction = null; battleState.p2NextAction = null; battleState.isProcessing = false; updateBattleUI();
}

async function onlineProcessTurn(outcomes) {
    battleState.isProcessing = true; updateBattleUI();
    document.getElementById('waiting-overlay').classList.add('hidden');
    for (let o of outcomes) {
        if (o.type === 'switch') {
            const party = o.p === 1 ? battleState.p1 : battleState.p2;
            const prevIdx = o.p === 1 ? battleState.p1ActiveIdx : battleState.p2ActiveIdx;
            const prevName = party[prevIdx] ? party[prevIdx].name : "???";
            party[o.index] = { ...o.charDetails, maxHp: o.charDetails.baseStats.hp, currentHp: o.charDetails.currentHp, battleSpd: o.charDetails.baseStats.spd, battleAtk: o.charDetails.baseStats.atk, isFainted: false };
            if (o.p === 1) battleState.p1ActiveIdx = o.index; else battleState.p2ActiveIdx = o.index;
            log(`P${o.p}: ${prevName}を戻して ${party[o.index].name}を繰り出した！`);
        } else {
            const attacker = (o.p === 1 ? battleState.p1 : battleState.p2)[o.p === 1 ? battleState.p1ActiveIdx : battleState.p2ActiveIdx];
            const target = (o.targetP === 1 ? battleState.p1 : battleState.p2)[o.targetP === 1 ? battleState.p1ActiveIdx : battleState.p2ActiveIdx];
            log(`P${o.p}: ${attacker.name}の ${o.moveName}！`);
            const targetEl = document.getElementById(o.targetP === 1 ? 'p1-active-area' : 'p2-active-area');
            targetEl.classList.add('shake', 'flash'); setTimeout(() => targetEl.classList.remove('shake', 'flash'), 500);
            if (o.damage > 0) { if (o.resMult > 1.0) log("効果は抜群だ！"); if (o.resMult < 1.0) log("効果はいまひとつのようだ..."); }
            target.currentHp = o.targetHp; target.isFainted = o.targetFainted;
            o.effects.forEach(e => {
                if (e.type === 'buff') log(`P${e.userP}のキャラの${e.stat}が上がった！`);
                else if (e.type === 'debuff') log(`P${e.targetP}のキャラの${e.stat}が下がった！`);
                else if (e.type === 'heal' || e.type === 'drain') { (e.userP === 1 ? battleState.p1[battleState.p1ActiveIdx] : battleState.p2[battleState.p2ActiveIdx]).currentHp = e.userHp; log(`P${e.userP}は体力を回復した！`); }
            });
            if (target.isFainted) {
                log(`${target.name}は倒れた！`);
                const party = o.targetP === 1 ? battleState.p1 : battleState.p2;
                if (!party.some(c => !c.isFainted)) { log(`P${o.targetP}全滅！ P${o.p}の勝利！`); updateBattleUI(); document.getElementById('online-back-btn').classList.remove('hidden'); battleState.isProcessing = false; return; }
                else { battleState.isForcedSwitch = o.targetP; battleState.p1NextAction = null; battleState.p2NextAction = null; updateBattleUI(); battleState.isProcessing = false; return; }
            }
        }
        updateBattleUI(); await new Promise(r => setTimeout(r, 1000));
    }
    battleState.p1NextAction = null; battleState.p2NextAction = null; battleState.isProcessing = false; updateBattleUI();
}

function log(m) { const d = document.getElementById('battle-log'); const entry = document.createElement('div'); entry.textContent = m; d.appendChild(entry); d.scrollTop = d.scrollHeight; }

function connectOnline() {
    const name = document.getElementById('online-player-name').value;
    if (!name) return alert("名前を入力してください");
    const connectBtn = document.getElementById('connect-btn');
    connectBtn.disabled = true; connectBtn.textContent = "接続中...";
    try {
        socket = io(DEFAULT_SERVER_URL);
        socket.on('connect_error', () => { alert("接続失敗"); connectBtn.disabled = false; connectBtn.textContent = "接続"; });
        socket.on('connect', () => {
            onlineState.id = socket.id; onlineState.name = name; socket.emit('join_lobby', name);
            document.getElementById('online-login').classList.add('hidden'); document.getElementById('online-lobby').classList.remove('hidden');
            document.getElementById('my-online-name').textContent = name; addOnlineLog("ロビー入室");
        });
        socket.on('update_player_list', (players) => {
            const list = document.getElementById('online-player-list'); list.innerHTML = '';
            players.forEach(p => {
                if (p.id === socket.id) return;
                const div = document.createElement('div'); div.className = 'player-row';
                div.innerHTML = `<span>${p.name} (${p.status})</span>${p.status === 'idle' ? `<button onclick="sendChallenge('${p.id}')">対戦申込</button>` : ''}`;
                list.appendChild(div);
            });
        });
        socket.on('receive_challenge', ({ fromId, fromName }) => {
            const msgArea = document.getElementById('online-msg-area'); const div = document.createElement('div'); div.className = 'challenge-modal';
            div.innerHTML = `<span><strong>${fromName}</strong>から対戦申し込み！</span><div><button onclick="respondChallenge('${fromId}', true)" style="background:var(--primary);">受ける</button><button onclick="respondChallenge('${fromId}', false)" style="background:var(--danger);">断る</button></div>`;
            msgArea.insertBefore(div, msgArea.firstChild);
        });
        socket.on('challenge_declined', ({ fromName }) => addOnlineLog(`${fromName}に断られました。`));
        socket.on('match_established', ({ roomId, role, opponentName }) => {
            onlineState.roomId = roomId; onlineState.role = role; onlineState.opponentName = opponentName;
            addOnlineLog(`マッチ成立: ${opponentName}`); document.getElementById('online-lobby').classList.add('hidden'); document.getElementById('online-regulation').classList.remove('hidden');
        });
        socket.on('regulation_proposed', ({ partySize, proposerId }) => {
            onlineState.partyLimit = partySize;
            document.getElementById('reg-status').innerHTML = socket.id === proposerId ? `${partySize} on ${partySize} を提案中...` : `相手が ${partySize} on ${partySize} を提案。 <button class="primary-btn" onclick="window.acceptRegulation()">承認</button>`;
        });
        socket.on('regulation_decided', ({ partySize }) => {
            onlineState.partyLimit = partySize; document.getElementById('online-regulation').classList.add('hidden'); document.getElementById('online-party-select').classList.remove('hidden');
            document.getElementById('party-select-msg').textContent = `レギュレーション: ${partySize} on ${partySize}`; window.renderOnlinePartyList();
        });
        window.renderOnlinePartyList = function() {
            const list = document.getElementById('online-party-list'); const valid = myParties.filter(p => p.members.length === onlineState.partyLimit);
            if (valid.length === 0) { list.innerHTML = `<div style="color:var(--danger); padding:10px;">${onlineState.partyLimit}体編成のパーティがありません。</div>`; return; }
            list.innerHTML = valid.map(p => `<div class="player-row"><span>${p.name}</span><button class="primary-btn" onclick="window.submitOnlineParty(${p.id})">選択</button></div>`).join('');
        };
        socket.on('battle_ready_selection', ({ opponentPartySize }) => {
            document.getElementById('online-party-select').classList.add('hidden'); document.getElementById('online-section').classList.add('hidden');
            showSection('battle'); document.getElementById('battle-mode-select').classList.add('hidden'); document.getElementById('battle-setup').classList.add('hidden');
            document.getElementById('battle-field').classList.remove('hidden'); startOnlineBattle(opponentPartySize);
        });
        window.acceptRegulation = () => socket.emit('accept_regulation', { roomId: onlineState.roomId });
        window.submitOnlineParty = (id) => {
            const p = myParties.find(x => x.id === id); if (!p) return;
            const members = p.members.slice(0, onlineState.partyLimit);
            const initSet = (m) => ({ ...m, maxHp: m.baseStats.hp, currentHp: m.baseStats.hp, battleSpd: m.baseStats.spd, battleAtk: m.baseStats.atk, isFainted: false });
            if (onlineState.role === 1) battleState.p1 = members.map(initSet); else battleState.p2 = members.map(initSet);
            socket.emit('submit_party', { roomId: onlineState.roomId, role: onlineState.role, partyData: members });
            document.getElementById('online-party-select').innerHTML = `<p>相手の選択待ち...</p>`;
        };
        socket.on('initial_pick_reveal', ({ myIndex, oppIndex, oppActiveChar, oppPartySize }) => {
            const initSet = (m) => ({ ...m, maxHp: m.baseStats.hp, currentHp: m.baseStats.hp, battleSpd: m.baseStats.spd, battleAtk: m.baseStats.atk, isFainted: false });
            const dummy = Array(oppPartySize).fill(null).map(() => ({ name: "???", isFainted: false, currentHp: 1, maxHp: 1, resistances: {}, moves: [], baseStats: { hp: 1, atk: 1, spd: 1 } }));
            if (onlineState.role === 1) { battleState.p2 = dummy; battleState.p2[oppIndex] = initSet(oppActiveChar); battleState.p1ActiveIdx = myIndex; battleState.p2ActiveIdx = oppIndex; }
            else { battleState.p1 = dummy; battleState.p1[oppIndex] = initSet(oppActiveChar); battleState.p2ActiveIdx = myIndex; battleState.p1ActiveIdx = oppIndex; }
            battleState.isSelectingInitial = false; document.getElementById('waiting-overlay').classList.add('hidden');
            log(`開始！ P1:${battleState.p1[battleState.p1ActiveIdx].name} vs P2:${battleState.p2[battleState.p2ActiveIdx].name}`);
            updateBattleUI();
        });
        socket.on('resolve_turn', ({ outcomes }) => onlineProcessTurn(outcomes));
        socket.on('opponent_left', () => { alert("相手が切断しました"); returnToLobby(); });
    } catch (e) { console.error(e); alert("接続失敗"); }
}

function disconnectOnline() { if (socket) socket.disconnect(); socket = null; document.getElementById('online-lobby').classList.add('hidden'); document.getElementById('online-login').classList.remove('hidden'); }
function addOnlineLog(msg) { const d = document.getElementById('online-msg-area'); const div = document.createElement('div'); div.textContent = msg; div.style.padding = "4px 0"; div.style.borderBottom = "1px solid #eee"; d.insertBefore(div, d.firstChild); }
function sendChallenge(id) { socket.emit('send_challenge', id); addOnlineLog("申し込み送信..."); }
function respondChallenge(id, accept) { socket.emit('respond_challenge', { targetId: id, accept }); const m = document.querySelector('.challenge-modal'); if (m) m.remove(); }
function sendRegulation(size) { onlineState.partyLimit = size; socket.emit('propose_regulation', { roomId: onlineState.roomId, partySize: size }); document.getElementById('reg-status').textContent = `${size} on ${size} を提案中...`; }

function startOnlineBattle(oppSize) {
    onlineState.isOnlineBattle = true; battleState.p1ActiveIdx = -1; battleState.p2ActiveIdx = -1; battleState.isSelectingInitial = true; battleState.isForcedSwitch = null;
    const dummy = Array(oppSize).fill(null); if (onlineState.role === 1) battleState.p2 = dummy; else battleState.p1 = dummy;
    document.getElementById('battle-log').innerHTML = "<div>オンライン対戦開始！初手を選んでください。</div>"; updateBattleUI();
}

function returnToLobby() {
    onlineState.isOnlineBattle = false; if (socket) socket.emit('leave_battle');
    document.getElementById('battle-field').classList.add('hidden'); document.getElementById('online-back-btn').classList.add('hidden');
    showSection('battle'); showBattleModeSelect();
}