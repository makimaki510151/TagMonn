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
    showSection('battle');
    document.getElementById('battle-mode-select').classList.remove('hidden');
    document.getElementById('battle-setup').classList.add('hidden');
    document.getElementById('battle-field').classList.add('hidden');
    document.getElementById('online-section').classList.add('hidden');
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
    }
}

async function loadData() {
    try {
        const res = await fetch('data.json');
        gameData = await res.json();
        return true;
    } catch (e) { return false; }
}

function initPresets() {
    if (myChars.length === 0) {
        const presets = [
            { name: "ファイアドラゴン", tags: [103, 113, 116], moves: [1031, 1131, 1162, 1161], id: 1 },
            { name: "アクアナイト", tags: [104, 108, 120], moves: [1041, 1042, 1201, 1081], id: 2 }
        ];
        presets.forEach(p => {
            const tags = p.tags.map(tid => gameData.tags.find(t => t.id === tid));
            const moves = p.moves.map(mid => gameData.moves.find(m => m.id === mid));
            myChars.push({ id: p.id, name: p.name, tags, moves, baseStats: calculateStats(tags), resistances: calculateResistances(tags) });
        });
        localStorage.setItem('tm_chars', JSON.stringify(myChars));
    }
    if (myParties.length === 0) {
        myParties.push({ id: 1001, name: "サンプル", members: [myChars[0], myChars[1]] });
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
    if (target) target.classList.remove('hidden');
    const navBtn = document.querySelector(`nav button[onclick*="'${id}'"]`);
    if (navBtn) navBtn.classList.add('active');
    if (id === 'build') renderBuildScreen();
    if (id === 'party') renderPartyScreen();
}

function getResName(id) {
    const res = gameData.resistances.find(r => r.id === id);
    return res ? res.name : "無";
}

function showDetail(item, type) {
    const detailBox = document.getElementById('detail-display');
    if (!detailBox) return;
    let html = `<strong>${item.name}</strong><br>`;
    if (type === 'tag') html += `HP:${item.hp} / ATK:${item.atk} / SPD:${item.spd || 0}<br><small>${item.description}</small>`;
    else if (type === 'move') html += `[${getResName(item.res_type)}] 威力:${item.power} 命中:${item.accuracy}<br><small>${item.description}</small>`;
    detailBox.innerHTML = html;
}

function calculateStats(tags) {
    let hp = 150, atk = 80, spd = 80;
    tags.forEach(t => { hp += t.hp * 0.5; atk += t.atk * 0.3; spd += (t.spd || 0) * 0.3; });
    return { hp: Math.floor(hp), atk: Math.floor(atk), spd: Math.floor(spd) };
}

function calculateResistances(tags) {
    let res = { 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0 };
    tags.forEach(t => {
        if (t.name === "硬質") { res[1] *= 0.9; res[2] *= 0.9; res[3] *= 0.9; res[4] *= 0.9; }
    });
    return res;
}

function renderBuildScreen() {
    const container = document.getElementById('tag-container');
    container.innerHTML = '';
    gameData.tags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = `tag-btn ${currentBuild.tags.some(t => t.id === tag.id) ? 'active' : ''}`;
        btn.textContent = tag.name;
        btn.onclick = () => {
            const idx = currentBuild.tags.findIndex(t => t.id === tag.id);
            if (idx > -1) currentBuild.tags.splice(idx, 1);
            else if (currentBuild.tags.length < 6) currentBuild.tags.push(tag);
            renderBuildScreen();
        };
        container.appendChild(btn);
    });
    updateBuildPreview();
}

function updateBuildPreview() {
    const moveCont = document.getElementById('move-candidate-container');
    moveCont.innerHTML = '';
    const available = gameData.moves.filter(m => (m.required_tags || []).every(reqId => currentBuild.tags.some(t => t.id === reqId)));
    available.forEach(move => {
        const btn = document.createElement('button');
        btn.className = `tag-btn ${currentBuild.moves.some(m => m.id === move.id) ? 'active' : ''}`;
        btn.textContent = move.name;
        btn.onclick = () => {
            const idx = currentBuild.moves.findIndex(m => m.id === move.id);
            if (idx > -1) currentBuild.moves.splice(idx, 1);
            else if (currentBuild.moves.length < 4) currentBuild.moves.push(move);
            updateBuildPreview();
        };
        moveCont.appendChild(btn);
    });
    const stats = calculateStats(currentBuild.tags);
    document.getElementById('stat-preview').innerHTML = `HP: ${stats.hp} ATK: ${stats.atk} SPD: ${stats.spd}`;
}

function saveCharacter() {
    const name = document.getElementById('char-name').value;
    if (!name || currentBuild.tags.length < 3) return alert("不備があります");
    const char = { ...currentBuild, name, id: currentBuild.id || Date.now(), baseStats: calculateStats(currentBuild.tags), resistances: calculateResistances(currentBuild.tags) };
    if (currentBuild.id) myChars = myChars.map(c => c.id === char.id ? char : c);
    else myChars.push(char);
    localStorage.setItem('tm_chars', JSON.stringify(myChars));
    location.reload();
}

function renderPartyScreen() {
    const cand = document.getElementById('party-char-candidates');
    cand.innerHTML = myChars.map(c => `<button class="tag-btn" onclick="currentPartyMembers.push(myChars.find(x=>x.id===${c.id})); renderCurrentParty();">${c.name}</button>`).join('');
    renderCurrentParty();
}

function renderCurrentParty() {
    document.getElementById('current-party-list').innerHTML = currentPartyMembers.map((m, i) => `<div class="mini-list">${m.name} <button onclick="currentPartyMembers.splice(${i},1); renderCurrentParty();">×</button></div>`).join('');
}

function saveParty() {
    const name = document.getElementById('party-name').value;
    if (!name || currentPartyMembers.length === 0) return alert("不備があります");
    myParties.push({ name, members: [...currentPartyMembers], id: Date.now() });
    localStorage.setItem('tm_parties', JSON.stringify(myParties));
    location.reload();
}

function renderBattleSetup() {
    const draw = (pNum) => myParties.map(p => `<button class="tag-btn" onclick="setBattleParty(${pNum}, ${p.id})">${p.name}</button>`).join('');
    document.getElementById('select-p1-party').innerHTML = draw(1);
    document.getElementById('select-p2-party').innerHTML = draw(2);
}

window.setBattleParty = (pNum, id) => {
    const p = myParties.find(x => x.id === id);
    if (pNum === 1) selectedP1 = p; else selectedP2 = p;
};

function startBattle() {
    if (!selectedP1 || !selectedP2) return alert("パーティを選んでください");
    onlineState.isOnlineBattle = false;
    document.getElementById('battle-setup').classList.add('hidden');
    document.getElementById('battle-field').classList.remove('hidden');
    const init = (m) => ({ ...m, maxHp: m.baseStats.hp, currentHp: m.baseStats.hp, battleSpd: m.baseStats.spd, battleAtk: m.baseStats.atk, isFainted: false });
    battleState.p1 = selectedP1.members.map(init);
    battleState.p2 = selectedP2.members.map(init);
    battleState.isSelectingInitial = true;
    updateBattleUI();
}

function updateBattleUI() {
    const a1 = battleState.p1[battleState.p1ActiveIdx];
    const a2 = battleState.p2[battleState.p2ActiveIdx];
    updateCharDisplay(1, a1);
    updateCharDisplay(2, a2);
    
    const mCont = document.getElementById('move-actions');
    const sCont = document.getElementById('switch-actions');
    mCont.innerHTML = ""; sCont.innerHTML = "";

    if (battleState.isSelectingInitial || battleState.isForcedSwitch) {
        renderSelectionPanel(mCont, sCont);
    } else if (!battleState.isProcessing) {
        if (onlineState.isOnlineBattle) {
            const role = onlineState.role;
            renderActionPanel(role, role === 1 ? a1 : a2, role === 1 ? 'move-actions' : 'switch-actions');
        } else {
            renderActionPanel(1, a1, 'move-actions');
            renderActionPanel(2, a2, 'switch-actions');
        }
    }
}

function updateCharDisplay(pNum, char) {
    const info = document.getElementById(`p${pNum}-active-info`);
    const fill = document.getElementById(pNum === 1 ? 'p1-fill' : 'p2-hp-fill');
    if (!char) { info.innerHTML = "???"; fill.style.width = "0%"; return; }
    info.innerHTML = `<strong>${char.name}</strong> HP:${Math.floor(char.currentHp)}/${char.maxHp}`;
    fill.style.width = `${(char.currentHp / char.maxHp) * 100}%`;
}

function renderSelectionPanel(mCont, sCont) {
    const pNum = battleState.isSelectingInitial ? (battleState.p1ActiveIdx === -1 ? 1 : 2) : battleState.isForcedSwitch;
    const targetCont = (onlineState.isOnlineBattle ? (onlineState.role === 1 ? mCont : sCont) : (pNum === 1 ? mCont : sCont));
    
    if (onlineState.isOnlineBattle && pNum !== onlineState.role) {
        targetCont.innerHTML = "相手の選択待ち..."; return;
    }
    
    targetCont.innerHTML = `<h4>P${pNum} キャラ選択</h4>`;
    const party = pNum === 1 ? battleState.p1 : battleState.p2;
    party.forEach((c, i) => {
        if (!c.isFainted) {
            const btn = document.createElement('button');
            btn.className = 'action-btn'; btn.textContent = c.name;
            btn.onclick = () => selectCharacter(pNum, i);
            targetCont.appendChild(btn);
        }
    });
}

function selectCharacter(pNum, idx) {
    if (onlineState.isOnlineBattle) {
        const type = battleState.isSelectingInitial ? 'submit_initial_pick' : 'submit_action';
        const action = battleState.isSelectingInitial ? idx : { type: 'switch', index: idx };
        socket.emit(type, { roomId: onlineState.roomId, role: onlineState.role, index: idx, action });
        document.getElementById('waiting-overlay').classList.remove('hidden');
    } else {
        if (battleState.isSelectingInitial) {
            if (pNum === 1) battleState.p1ActiveIdx = idx; else { battleState.p2ActiveIdx = idx; battleState.isSelectingInitial = false; }
        } else {
            if (pNum === 1) battleState.p1ActiveIdx = idx; else battleState.p2ActiveIdx = idx;
            battleState.isForcedSwitch = null;
        }
        updateBattleUI();
    }
}

function renderActionPanel(pNum, char, contId) {
    const cont = document.getElementById(contId);
    cont.innerHTML = `<h4>P${pNum} 行動選択</h4>`;
    char.moves.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'action-btn'; btn.textContent = m.name;
        btn.onclick = () => handleAction(pNum, { type: 'move', move: m });
        cont.appendChild(btn);
    });
}

function handleAction(pNum, action) {
    if (onlineState.isOnlineBattle) {
        socket.emit('submit_action', { roomId: onlineState.roomId, role: onlineState.role, action });
        document.getElementById('waiting-overlay').classList.remove('hidden');
    } else {
        if (pNum === 1) battleState.p1NextAction = action; else battleState.p2NextAction = action;
        if (battleState.p1NextAction && battleState.p2NextAction) localProcess();
    }
}

async function onlineProcess(outcomes) {
    battleState.isProcessing = true;
    document.getElementById('waiting-overlay').classList.add('hidden');
    for (let o of outcomes) {
        if (o.type === 'switch_sync') {
            battleState.p1ActiveIdx = o.p1Idx; battleState.p1[o.p1Idx] = o.p1Char;
            battleState.p2ActiveIdx = o.p2Idx; battleState.p2[o.p2Idx] = o.p2Char;
            battleState.isForcedSwitch = null;
            log("両者のキャラが繰り出された！");
        } else if (o.type === 'switch') {
            const p = o.p === 1 ? battleState.p1 : battleState.p2;
            p[o.index] = o.charDetails;
            if (o.p === 1) battleState.p1ActiveIdx = o.index; else battleState.p2ActiveIdx = o.index;
            log(`P${o.p}は交代した！`);
        } else if (o.type === 'move') {
            const target = (o.targetP === 1 ? battleState.p1 : battleState.p2)[o.targetP === 1 ? battleState.p1ActiveIdx : battleState.p2ActiveIdx];
            log(`P${o.p}の ${o.moveName}！ ${o.damage}ダメージ！`);
            target.currentHp = o.targetHp; target.isFainted = o.targetFainted;
            if (target.isFainted) {
                log(`${target.name}は倒れた！`);
                battleState.isForcedSwitch = o.targetP;
            }
        }
        updateBattleUI();
        await new Promise(r => setTimeout(r, 800));
    }
    battleState.isProcessing = false;
    updateBattleUI();
}

function log(m) {
    const d = document.getElementById('battle-log');
    const e = document.createElement('div'); e.textContent = m;
    d.appendChild(e); d.scrollTop = d.scrollHeight;
}

function connectOnline() {
    const name = document.getElementById('online-player-name').value;
    if (!name) return;
    socket = io(DEFAULT_SERVER_URL);
    socket.on('connect', () => {
        onlineState.name = name; socket.emit('join_lobby', name);
        document.getElementById('online-login').classList.add('hidden');
        document.getElementById('online-lobby').classList.remove('hidden');
    });
    socket.on('update_player_list', (ps) => {
        const list = document.getElementById('online-player-list'); list.innerHTML = "";
        ps.forEach(p => {
            if (p.id === socket.id) return;
            const d = document.createElement('div'); d.className = 'player-row';
            d.innerHTML = `${p.name} <button onclick="socket.emit('send_challenge', '${p.id}')">対戦</button>`;
            list.appendChild(d);
        });
    });
    socket.on('receive_challenge', ({ fromId, fromName }) => {
        if (confirm(`${fromName}から対戦希望。受けますか？`)) socket.emit('respond_challenge', { targetId: fromId, accept: true });
    });
    socket.on('match_established', ({ roomId, role }) => {
        onlineState.roomId = roomId; onlineState.role = role;
        document.getElementById('online-lobby').classList.add('hidden');
        document.getElementById('online-regulation').classList.remove('hidden');
    });
    socket.on('regulation_decided', () => {
        document.getElementById('online-regulation').classList.add('hidden');
        document.getElementById('online-party-select').classList.remove('hidden');
        const list = document.getElementById('online-party-list');
        list.innerHTML = myParties.map(p => `<button onclick="window.submitOnlineParty(${p.id})">${p.name}</button>`).join('');
    });
    window.submitOnlineParty = (id) => {
        const p = myParties.find(x => x.id === id);
        socket.emit('submit_party', { roomId: onlineState.roomId, role: onlineState.role, partyData: p.members });
    };
    socket.on('battle_ready_selection', ({ opponentPartySize }) => {
        onlineState.isOnlineBattle = true;
        document.getElementById('online-section').classList.add('hidden');
        document.getElementById('battle-field').classList.remove('hidden');
        const dummy = Array(opponentPartySize).fill(null);
        if (onlineState.role === 1) battleState.p2 = dummy; else battleState.p1 = dummy;
        battleState.isSelectingInitial = true;
        updateBattleUI();
    });
    socket.on('initial_pick_reveal', ({ myIndex, oppIndex, oppActiveChar, oppPartySize }) => {
        if (onlineState.role === 1) {
            battleState.p1ActiveIdx = myIndex; battleState.p2ActiveIdx = oppIndex;
            battleState.p2 = Array(oppPartySize).fill(null); battleState.p2[oppIndex] = oppActiveChar;
        } else {
            battleState.p2ActiveIdx = myIndex; battleState.p1ActiveIdx = oppIndex;
            battleState.p1 = Array(oppPartySize).fill(null); battleState.p1[oppIndex] = oppActiveChar;
        }
        battleState.isSelectingInitial = false;
        document.getElementById('waiting-overlay').classList.add('hidden');
        updateBattleUI();
    });
    socket.on('resolve_turn', ({ outcomes }) => onlineProcess(outcomes));
}

function sendRegulation(size) {
    socket.emit('propose_regulation', { roomId: onlineState.roomId, partySize: size });
    socket.emit('accept_regulation', { roomId: onlineState.roomId });
}