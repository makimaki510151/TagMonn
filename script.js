let gameData = { resistances: [], tags: [], moves: [], story_stages: [] };
let myChars = [];
let myParties = [];

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
    isForcedSwitch: null, // 1 or 2
    isStoryMode: false,
    currentStage: null
};

// オンライン用変数
const DEFAULT_SERVER_URL = "https://makkili.a.pinggy.link";
let socket = null;
let onlineState = {
    id: null,
    name: "",
    roomId: null,
    role: null, // 1 or 2
    partyLimit: 3,
    opponentName: "",
    isOnlineBattle: false
};

window.onload = async () => {
    const success = await loadData();
    if (success) {
        ModeManager.init();
        refreshLocalData();
        initPresets();
        setupEventListeners();
        showTitle();
        checkServerStatus();
    }
};

function refreshLocalData() {
    myChars = ModeManager.getChars();
    myParties = ModeManager.getParties();
}

function showTitle() {
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('game-header').classList.add('hidden');
    document.getElementById('detail-display').classList.add('hidden');
    document.getElementById('title-section').classList.remove('hidden');
}

function selectGameMode(mode) {
    ModeManager.setMode(mode);
    refreshLocalData();
    
    document.getElementById('game-header').classList.remove('hidden');
    document.getElementById('detail-display').classList.remove('hidden');
    document.getElementById('title-section').classList.add('hidden');
    
    const modeTitle = mode === 'story' ? 'Tagmon Story' : 'Tagmon Free';
    document.getElementById('mode-title').textContent = modeTitle;
    document.getElementById('mode-title').style.color = mode === 'story' ? 'var(--primary)' : '#8b5cf6';
    
    const storyNav = document.getElementById('nav-story');
    const battleNav = document.getElementById('nav-battle');
    
    if (mode === 'story') {
        storyNav.classList.remove('hidden');
        battleNav.classList.add('hidden');
        showSection('story');
    } else {
        storyNav.classList.add('hidden');
        battleNav.classList.remove('hidden');
        showSection('build');
    }
    
    resetBuild();
}

function returnToTitle() {
    if (confirm('タイトルに戻りますか？（進行中のバトルは破棄されます）')) {
        showTitle();
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
    if (localStorage.getItem('tm_free_chars') && JSON.parse(localStorage.getItem('tm_free_chars')).length > 0) return;

    const presets = [
        { name: "ファイアドラゴン", tags: [103, 113, 116], moves: [1031, 1131, 1162, 1], id: 1 },
        { name: "アクアナイト", tags: [104, 108, 120], moves: [1041, 1042, 1201, 1], id: 2 },
        { name: "サンダーバード", tags: [105, 110, 117], moves: [1051, 1101, 1171, 3], id: 3 },
        { name: "ダークウィザード", tags: [101, 118, 121], moves: [1011, 1181, 1211, 2], id: 4 },
        { name: "アイアンゴーレム", tags: [106, 111, 108], moves: [1061, 1111, 1081, 1], id: 5 },
        { name: "ホーリーエルフ", tags: [102, 109, 118], moves: [1021, 1022, 1091, 2], id: 6 }
    ];
    
    const freeChars = [];
    presets.forEach(p => {
        const tags = p.tags.map(tid => gameData.tags.find(t => t.id === tid));
        const moves = p.moves.map(mid => gameData.moves.find(m => m.id === mid));
        freeChars.push({
            id: p.id, name: p.name, tags, moves,
            baseStats: calculateStats(tags),
            resistances: calculateResistances(tags)
        });
    });
    localStorage.setItem('tm_free_chars', JSON.stringify(freeChars));

    const freeParties = [
        { id: 1001, name: "【初心者用】バランスパーティ", members: [freeChars[0], freeChars[1], freeChars[2]] },
        { id: 1002, name: "【初心者用】テクニカルパーティ", members: [freeChars[3], freeChars[4], freeChars[5]] }
    ];
    localStorage.setItem('tm_free_parties', JSON.stringify(freeParties));
    
    refreshLocalData();
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
    const navBtn = document.getElementById(`nav-${id}`);

    if (target) target.classList.remove('hidden');
    if (navBtn) navBtn.classList.add('active');

    if (id === 'build') renderBuildScreen();
    if (id === 'party') renderPartyScreen();
    if (id === 'story') renderStoryScreen();
    if (id === 'battle') {
        const isBattleFieldVisible = !document.getElementById('battle-field').classList.contains('hidden');
        const isBattleSetupVisible = !document.getElementById('battle-setup').classList.contains('hidden');
        const isOnlineSectionVisible = !document.getElementById('online-section').classList.contains('hidden');

        if (!battleState.isProcessing && !isBattleFieldVisible && !isBattleSetupVisible && !isOnlineSectionVisible) {
            showBattleModeSelect();
        }
    } else {
        if (document.getElementById('battle-field').classList.contains('hidden')) {
            battleState.isStoryMode = false;
        }
    }
}

// ----------------------------------------------------------------
// Build & Party Functions
// ----------------------------------------------------------------

function renderBuildScreen() {
    renderTags();
    updateBuildPreview();
    renderSavedChars();
}

function renderTags() {
    const container = document.getElementById('tag-container');
    if (!container) return;
    container.innerHTML = '';

    const unlockedTagIds = ModeManager.getUnlockedTags();
    
    gameData.tags.forEach(tag => {
        const isUnlocked = unlockedTagIds.includes(tag.id);
        if (ModeManager.currentMode === 'story' && !isUnlocked) return;

        const btn = document.createElement('button');
        if (!isUnlocked) {
            btn.className = 'tag-btn locked';
            btn.disabled = true;
            btn.textContent = '???';
            container.appendChild(btn);
            return;
        }
        const isActive = currentBuild.tags.some(t => t.id === tag.id);
        btn.className = `tag-btn ${isActive ? 'active' : ''}`;
        btn.textContent = tag.name;
        btn.onclick = () => toggleTag(tag);
        btn.onmouseover = () => showDetail(tag, 'tag');
        container.appendChild(btn);
    });
}

function toggleTag(tag) {
    const idx = currentBuild.tags.findIndex(t => t.id === tag.id);
    if (idx >= 0) {
        currentBuild.tags.splice(idx, 1);
    } else {
        if (currentBuild.tags.length >= 6) return alert("タグは最大6つまでです");
        currentBuild.tags.push(tag);
    }
    currentBuild.moves = currentBuild.moves.filter(m => {
        if (m.required_tags.length === 0) return true;
        return m.required_tags.some(tid => currentBuild.tags.some(t => t.id === tid));
    });
    renderBuildScreen();
}

function updateBuildPreview() {
    const preview = document.getElementById('stat-preview');
    const stats = calculateStats(currentBuild.tags);
    const res = calculateResistances(currentBuild.tags);

    let resHtml = '<div class="resistance-grid">';
    gameData.resistances.forEach(r => {
        const val = res[r.id] || 1.0;
        let cls = '';
        if (val < 1.0) cls = 'res-resist';
        else if (val > 1.0) cls = 'res-weak';
        resHtml += `<div class="res-item ${cls}">${r.name}: ${Math.round(val * 100)}%</div>`;
    });
    resHtml += '</div>';

    preview.innerHTML = `
        <div class="stat-row"><span>HP</span><strong>${stats.hp}</strong></div>
        <div class="stat-row"><span>ATK</span><strong>${stats.atk}</strong></div>
        <div class="stat-row"><span>SPD</span><strong>${stats.spd}</strong></div>
        <div style="margin-top:10px; font-size:0.8rem; color:${currentBuild.tags.length < 1 ? 'var(--danger)' : 'var(--text-muted)'};">
            タグ数: ${currentBuild.tags.length}/6
        </div>
        <div style="font-size:0.8rem; color:var(--text-muted);">技スロット: ${currentBuild.moves.length}/4</div>
        <hr>
        ${resHtml}
    `;

    renderMoveCandidates();
    const saveBtn = document.getElementById('save-char-btn');
    saveBtn.textContent = currentBuild.id ? "キャラクターを更新" : "キャラクターを保存";
}

// ステータス計算式を元に戻す
function calculateStats(tags) {
    let baseHp = 150, baseAtk = 80, baseSpd = 80;
    let modHp = 0, modAtk = 0, modSpd = 0;
    tags.forEach(t => {
        modHp += (t.hp || 0) * 0.5;
        modAtk += (t.atk || 0) * 0.3;
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
        if (t.res_mod) {
            for (let rid in t.res_mod) {
                res[rid] *= t.res_mod[rid];
            }
        }
    });
    return res;
}

function renderMoveCandidates() {
    const container = document.getElementById('move-candidate-container');
    container.innerHTML = '';

    gameData.moves.forEach(move => {
        const canLearn = move.required_tags.length === 0 || 
                         move.required_tags.some(tid => currentBuild.tags.some(t => t.id === tid));
        if (!canLearn) return;

        const btn = document.createElement('button');
        const isActive = currentBuild.moves.some(m => m.id === move.id);
        btn.className = `tag-btn ${isActive ? 'active' : ''}`;
        btn.textContent = move.name;
        btn.onclick = () => toggleMove(move);
        btn.onmouseover = () => showDetail(move, 'move');
        container.appendChild(btn);
    });
}

function toggleMove(move) {
    const idx = currentBuild.moves.findIndex(m => m.id === move.id);
    if (idx >= 0) {
        currentBuild.moves.splice(idx, 1);
    } else {
        if (currentBuild.moves.length >= 4) return alert("技は最大4つまでです");
        currentBuild.moves.push(move);
    }
    renderBuildScreen();
}

function saveCharacter() {
    const nameInput = document.getElementById('char-name');
    if (!nameInput.value) return alert("名前を入力してください");
    if (currentBuild.tags.length === 0) return alert("タグを1つ以上選んでください");

    const charData = {
        ...currentBuild,
        name: nameInput.value,
        baseStats: calculateStats(currentBuild.tags),
        resistances: calculateResistances(currentBuild.tags)
    };

    if (currentBuild.id) {
        ModeManager.updateCharacter(charData);
    } else {
        charData.id = Date.now();
        ModeManager.saveCharacter(charData);
    }

    refreshLocalData();
    resetBuild();
    renderBuildScreen();
}

function resetBuild() {
    currentBuild = { id: null, name: "", tags: [], moves: [] };
    document.getElementById('char-name').value = "";
}

window.editChar = (id) => {
    const char = myChars.find(c => c.id === id);
    if (!char) return;
    if (char.isStoryOrigin && ModeManager.currentMode === 'free') {
        alert("ストーリーモードで作成したキャラクターはフリーモードでは編集できません。");
        return;
    }
    currentBuild = JSON.parse(JSON.stringify(char));
    document.getElementById('char-name').value = char.name;
    renderBuildScreen();
    window.scrollTo(0, 0);
};

function renderSavedChars() {
    const container = document.getElementById('saved-chars-list');
    container.innerHTML = myChars.map(c => {
        const isEditable = !(c.isStoryOrigin && ModeManager.currentMode === 'free');
        return `
        <div class="mini-list">
            <span style="font-weight:600; cursor:${isEditable ? 'pointer' : 'default'};" 
                  onclick="${isEditable ? `editChar(${c.id})` : ''}">
                ${c.name} ${c.isStoryOrigin ? '<small>(Story)</small>' : ''} 
                ${isEditable ? '<small style="color:var(--primary); margin-left:5px;">(編集)</small>' : ''}
            </span>
            <button onclick="deleteChar(${c.id})" class="del-btn">×</button>
        </div>
    `;
    }).join('');
}

window.deleteChar = (id) => {
    if (!confirm("キャラを削除しますか？")) return;
    const key = ModeManager.currentMode === 'free' ? 'tm_free_chars' : 'tm_story_chars';
    let chars = JSON.parse(localStorage.getItem(key) || '[]');
    const targetIdx = chars.findIndex(c => c.id === id);
    if (targetIdx === -1) {
        alert("このモードでは削除できないキャラクターです。");
        return;
    }
    chars.splice(targetIdx, 1);
    localStorage.setItem(key, JSON.stringify(chars));
    refreshLocalData();
    renderBuildScreen();
    if (currentBuild.id === id) resetBuild();
};

function renderPartyScreen() {
    const cand = document.getElementById('party-char-candidates');
    cand.innerHTML = '';
    myChars.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'tag-btn';
        btn.textContent = c.name + (c.isStoryOrigin ? ' (S)' : '');
        btn.onclick = () => {
            if (currentPartyMembers.length >= 6) return alert("最大6体です");
            currentPartyMembers.push(c);
            renderPartyScreen();
        };
        cand.appendChild(btn);
    });

    const curr = document.getElementById('current-party-list');
    curr.innerHTML = currentPartyMembers.map((c, i) => `
        <div class="mini-list">
            <span>${i + 1}. ${c.name}</span>
            <button onclick="removeFromParty(${i})" class="del-btn">×</button>
        </div>
    `).join('');

    const saved = document.getElementById('saved-parties-list');
    saved.innerHTML = myParties.map(p => `
        <div class="mini-list">
            <span>${p.name} (${p.members.length}体) ${p.isStoryOrigin ? '<small>(Story)</small>' : ''}</span>
            <button onclick="deleteParty(${p.id})" class="del-btn">×</button>
        </div>
    `).join('');
}

window.removeFromParty = (i) => {
    currentPartyMembers.splice(i, 1);
    renderPartyScreen();
};

window.deleteParty = (id) => {
    if (!confirm("パーティを削除しますか？")) return;
    const key = ModeManager.currentMode === 'free' ? 'tm_free_parties' : 'tm_story_parties';
    let parties = JSON.parse(localStorage.getItem(key) || '[]');
    parties = parties.filter(p => p.id !== id);
    localStorage.setItem(key, JSON.stringify(parties));
    refreshLocalData();
    renderPartyScreen();
};

function saveParty() {
    const name = document.getElementById('party-name').value;
    if (!name) return alert("パーティ名を入力してください");
    if (currentPartyMembers.length === 0) return alert("キャラを1体以上選んでください");

    const party = {
        id: Date.now(),
        name: name,
        members: [...currentPartyMembers]
    };
    ModeManager.saveParty(party);
    refreshLocalData();
    currentPartyMembers = [];
    document.getElementById('party-name').value = "";
    renderPartyScreen();
}

// ----------------------------------------------------------------
// Story Mode Functions
// ----------------------------------------------------------------

function renderStoryScreen() {
    const list = document.getElementById('story-stage-list');
    const progress = JSON.parse(localStorage.getItem('tm_story_progress'));
    
    list.innerHTML = gameData.story_stages.map(s => {
        const isCleared = progress.clearedStages.includes(s.id);
        return `
            <div class="mini-list" style="flex-direction: column; align-items: flex-start; gap: 10px; padding: 15px; height: auto;">
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <strong>第${s.id}話: ${s.title}</strong>
                    ${isCleared ? '<span style="color:var(--success); font-weight:bold;">CLEAR!</span>' : ''}
                </div>
                <button onclick="startStory(${s.id})" class="primary-btn" style="width: 100%;">${isCleared ? '再挑戦' : '挑戦する'}</button>
            </div>
        `;
    }).join('');
}

window.startStory = (id) => {
    const stage = gameData.story_stages.find(s => s.id === id);
    battleState.currentStage = stage;
    
    document.getElementById('story-list-view').classList.add('hidden');
    document.getElementById('story-dialogue-view').classList.remove('hidden');
    document.getElementById('story-dialogue-title').textContent = stage.title;
    document.getElementById('story-dialogue-text').textContent = stage.introText;
    document.getElementById('story-dialogue-btn').onclick = () => {
        if (myParties.length === 0) {
            alert("パーティがありません。パーティ編成画面で作成してください。");
            showSection('party');
            return;
        }
        showStoryBattleSetup();
    };
};

function showStoryBattleSetup() {
    document.getElementById('story-dialogue-view').classList.add('hidden');
    showSection('battle');
    
    document.getElementById('battle-mode-select').classList.add('hidden');
    document.getElementById('battle-setup').classList.remove('hidden');
    
    const p1div = document.getElementById('select-p1-party');
    const p2div = document.getElementById('select-p2-party');
    
    p1div.innerHTML = myParties.map(p => `<button class="tag-btn ${(selectedP1?.id === p.id) ? 'active' : ''}" onclick="setStoryParty(${p.id})">${p.name}</button>`).join('');
    p2div.innerHTML = `<div class="tag-btn active" style="cursor:default;">エネミーチーム</div>`;
    
    selectedP2 = {
        name: "エネミー",
        members: battleState.currentStage.enemyParty.map(e => {
            const tags = e.tags.map(tid => gameData.tags.find(t => t.id === tid));
            const moves = e.moves.map(mid => gameData.moves.find(m => m.id === mid));
            return {
                name: e.name, tags, moves,
                baseStats: calculateStats(tags),
                resistances: calculateResistances(tags)
            };
        })
    };
}

window.setStoryParty = (id) => {
    selectedP1 = myParties.find(p => p.id === id);
    showStoryBattleSetup();
};

function getResName(id) {
    const res = gameData.resistances.find(r => r.id === id);
    return res ? res.name : "無";
}

function showDetail(item, type) {
    const detailBox = document.getElementById('detail-display');
    if (!detailBox) return;
    let html = `<strong>${item.name}</strong><br>`;
    if (type === 'tag') {
        html += `HP:${item.hp} / ATK:${item.atk} / SPD:${item.spd || 0}<br>`;
        html += `<small>${item.description}</small>`;
    } else if (type === 'move') {
        const resName = getResName(item.res_type);
        html += `[${resName}] 威力:${item.power} 命中:${item.accuracy}<br>`;
        html += `<small>${item.description}</small>`;
    }
    detailBox.innerHTML = html;
}

// ----------------------------------------------------------------
// Battle System Functions (Restored)
// ----------------------------------------------------------------

async function checkServerStatus() {
    const lamp = document.getElementById('status-lamp');
    const text = document.getElementById('status-text');
    const joinBtn = document.getElementById('connect-btn');
    if (!lamp || !text) return;
    
    lamp.style.background = '#cbd5e1';
    text.textContent = 'サーバー接続確認中...';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const res = await fetch(`${DEFAULT_SERVER_URL}/socket.io/?EIO=4&transport=polling`, { 
            mode: 'no-cors', 
            signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        lamp.style.background = 'var(--success)';
        text.textContent = 'サーバー稼働中';
        if (joinBtn) joinBtn.disabled = false;
    } catch (e) {
        lamp.style.background = 'var(--danger)';
        text.textContent = 'サーバー停止中または接続エラー';
        if (joinBtn) joinBtn.disabled = true;
        console.warn("Server check failed:", e.message);
    }
}

function showBattleModeSelect() {
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
        document.getElementById('online-section').classList.remove('hidden');
        checkServerStatus();
    }
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
    battleState.isStoryMode = (ModeManager.currentMode === 'story');
    onlineState.isOnlineBattle = false;
    document.getElementById('battle-setup').classList.add('hidden');
    document.getElementById('battle-field').classList.remove('hidden');
    const initSet = (m) => ({ ...m, maxHp: m.baseStats.hp, currentHp: m.baseStats.hp, battleSpd: m.baseStats.spd, battleAtk: m.baseStats.atk, isFainted: false });
    battleState.p1 = selectedP1.members.map(initSet);
    battleState.p2 = selectedP2.members.map(initSet);
    battleState.p1ActiveIdx = -1; battleState.p2ActiveIdx = -1;
    battleState.isSelectingInitial = true;
    log("バトル開始！");
    updateBattleUI();
}

function updateBattleUI() {
    const a1 = battleState.p1ActiveIdx !== -1 ? battleState.p1[battleState.p1ActiveIdx] : null;
    const a2 = battleState.p2ActiveIdx !== -1 ? battleState.p2[battleState.p2ActiveIdx] : null;
    updateCharDisplay(1, a1);
    updateCharDisplay(2, a2);
    if (battleState.isSelectingInitial || battleState.isForcedSwitch) {
        renderSelectionPanel();
    } else if (!battleState.isProcessing) {
        renderActionPanel(1, a1, 'move-actions');
        renderActionPanel(2, a2, 'switch-actions');
    } else {
        document.getElementById('move-actions').innerHTML = "";
        document.getElementById('switch-actions').innerHTML = "";
    }
}

function updateCharDisplay(pNum, char) {
    const prefix = pNum === 1 ? 'p1' : 'p2';
    const infoEl = document.getElementById(`${prefix}-active-info`);
    const fillEl = document.getElementById(pNum === 1 ? 'p1-fill' : 'p2-hp-fill');
    if (!char) {
        infoEl.innerHTML = `<div class="char-name">? ? ?</div>`;
        fillEl.style.width = `0%`;
        return;
    }
    let resHtml = '<div class="resistance-grid">';
    Object.entries(char.resistances).forEach(([id, val]) => {
        const name = getResName(parseInt(id));
        resHtml += `<div class="res-item ${val < 1.0 ? 'res-resist' : (val > 1.0 ? 'res-weak' : '')}">${name}:${Math.round(val * 100)}%</div>`;
    });
    resHtml += '</div>';
    infoEl.innerHTML = `<div class="char-name">${char.name}</div><div class="char-stats">HP: ${Math.floor(char.currentHp)}/${char.maxHp}</div>${resHtml}`;
    fillEl.style.width = `${(char.currentHp / char.maxHp) * 100}%`;
}

// 初期選択や死に出し時のUI
function renderSelectionPanel() {
    const moveCont = document.getElementById('move-actions');
    const switchCont = document.getElementById('switch-actions');
    moveCont.innerHTML = ""; switchCont.innerHTML = "";
    let pNum = battleState.isSelectingInitial ? (battleState.p1ActiveIdx === -1 ? 1 : 2) : battleState.isForcedSwitch;
    
    // ストーリーモードのCPU処理
    if (battleState.isStoryMode && pNum === 2) {
        setTimeout(() => {
            const party = battleState.p2;
            const idx = party.findIndex(c => !c.isFainted);
            selectCharacter(2, idx);
        }, 500);
        return;
    }
    
    const container = pNum === 1 ? moveCont : switchCont;
    container.innerHTML = `<h4>キャラ選択</h4><div class="action-grid"></div>`;
    const grid = container.querySelector('.action-grid');
    const party = pNum === 1 ? battleState.p1 : battleState.p2;
    party.forEach((c, idx) => {
        if (!c.isFainted) {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            
            // 詳細情報表示
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
            
            btn.onmouseover = () => showDetail(move, 'move');
            btn.onclick = () => selectCharacter(pNum, idx);
            grid.appendChild(btn);
        }
    });
}

function selectCharacter(pNum, idx) {
    if (battleState.isSelectingInitial) {
        if (pNum === 1) battleState.p1ActiveIdx = idx;
        else { battleState.p2ActiveIdx = idx; battleState.isSelectingInitial = false; }
    } else {
        if (pNum === 1) battleState.p1ActiveIdx = idx;
        else battleState.p2ActiveIdx = idx;
        battleState.isForcedSwitch = null;
    }
    log(`P${pNum}は${(pNum === 1 ? battleState.p1 : battleState.p2)[idx].name}を繰り出した！`);
    updateBattleUI();
}

// ターン中の行動選択パネル（技と交代ボタンを並べる）
function renderActionPanel(pNum, char, containerId) {
    const cont = document.getElementById(containerId);
    
    // CPU処理
    if (battleState.isStoryMode && pNum === 2) {
        if (!battleState.p2NextAction) {
            const move = char.moves[Math.floor(Math.random() * char.moves.length)];
            battleState.p2NextAction = { type: 'move', move };
            if (battleState.p1NextAction) processTurn();
        }
        return;
    }
    
    cont.innerHTML = `<h4>P${pNum}の選択</h4><div class="action-grid"></div>`;
    const grid = cont.querySelector('.action-grid');
    
    // 選択中のアクションを取得してハイライト
    const currentAction = pNum === 1 ? battleState.p1NextAction : battleState.p2NextAction;

    // 技ボタン
    char.moves.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        if (currentAction?.type === 'move' && currentAction.move.id === m.id) {
            btn.classList.add('active');
        }
        btn.textContent = m.name;
        btn.onclick = () => handleAction(pNum, { type: 'move', move: m });
        grid.appendChild(btn);
    });
    
    // 交代ボタン（控えキャラを表示）
    const party = pNum === 1 ? battleState.p1 : battleState.p2;
    party.forEach((c, idx) => {
        if (idx !== (pNum === 1 ? battleState.p1ActiveIdx : battleState.p2ActiveIdx) && !c.isFainted) {
            const btn = document.createElement('button');
            btn.className = 'action-btn switch';
            if (currentAction?.type === 'switch' && currentAction.index === idx) {
                btn.classList.add('active');
            }
            btn.style.textAlign = 'left';
            btn.style.height = 'auto';
            btn.style.padding = '8px';
            btn.style.background = '#f0f9ff'; // 技と区別するための背景色

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

            btn.onclick = () => handleAction(pNum, { type: 'switch', index: idx });
            grid.appendChild(btn);
        }
    });
}

function handleAction(pNum, action) {
    if (pNum === 1) battleState.p1NextAction = action;
    else battleState.p2NextAction = action;
    
    if (battleState.p1NextAction && battleState.p2NextAction) processTurn();
    else updateBattleUI();
}

async function processTurn() {
    battleState.isProcessing = true;
    updateBattleUI(); // パネルを消す

    const a1 = battleState.p1[battleState.p1ActiveIdx];
    const a2 = battleState.p2[battleState.p2ActiveIdx];
    
    const actions = [
        { p: 1, act: battleState.p1NextAction, char: a1, target: a2 },
        { p: 2, act: battleState.p2NextAction, char: a2, target: a1 }
    ].sort((a, b) => {
        // 優先度計算: 交代(1000) > 技優先度 > 素早さ
        const priA = (a.act.type === 'switch' ? 1000 : (a.act.move.priority || 0) * 100) + a.char.battleSpd;
        const priB = (b.act.type === 'switch' ? 1000 : (b.act.move.priority || 0) * 100) + b.char.battleSpd;
        return priB - priA;
    });

    for (let action of actions) {
        if (action.char.isFainted) continue;

        // 交代アクションの処理
        if (action.act.type === 'switch') {
            const party = action.p === 1 ? battleState.p1 : battleState.p2;
            const prevName = action.char.name;
            const nextIdx = action.act.index;
            const nextChar = party[nextIdx];
            
            if (action.p === 1) battleState.p1ActiveIdx = nextIdx;
            else battleState.p2ActiveIdx = nextIdx;
            
            log(`P${action.p}: ${prevName}を戻して ${nextChar.name}を繰り出した！`);
            updateBattleUI();
            await new Promise(r => setTimeout(r, 1000));
            continue; // 交代したらこのターンは終わり
        }

        // 攻撃技の処理
        // ターゲットが交代している可能性があるため再取得
        const currentTargetIdx = action.p === 1 ? battleState.p2ActiveIdx : battleState.p1ActiveIdx;
        const currentTarget = action.p === 1 ? battleState.p2[currentTargetIdx] : battleState.p1[currentTargetIdx];

        log(`${action.char.name}の${action.act.move.name}！`);
        const res = BattleLogic.calculateDamage(action.act.move, action.char, currentTarget);
        
        if (res.isHit) {
            currentTarget.currentHp -= res.damage;
            log(`${res.damage}のダメージ！`);
            
            if (res.resMult > 1.0) log("効果は抜群だ！");
            if (res.resMult < 1.0) log("効果はいまひとつのようだ...");

            // 効果処理
            if (action.act.move.effect) {
                const effectResult = BattleLogic.applyEffect(action.act.move.effect, action.char, currentTarget, res.damage);
                if (effectResult) {
                     if (effectResult.type === 'buff') log(`${action.char.name}の${effectResult.stat}が上がった！`);
                     else if (effectResult.type === 'debuff') log(`${currentTarget.name}の${effectResult.stat}が下がった！`);
                     else if (effectResult.type === 'heal') log(`${action.char.name}は回復した！`);
                }
            }

            if (currentTarget.currentHp <= 0) {
                currentTarget.currentHp = 0;
                currentTarget.isFainted = true;
                log(`${currentTarget.name}は倒れた！`);
                
                // 全滅判定
                const party = action.p === 1 ? battleState.p2 : battleState.p1;
                if (!party.some(c => !c.isFainted)) {
                    log(`P${action.p}の勝利！`);
                    if (battleState.isStoryMode && action.p === 1) handleStoryClear();
                    battleState.isProcessing = false;
                    updateBattleUI();
                    return;
                }
                
                // 倒れた場合、次の行動（倒された側の攻撃など）はキャンセルされるが、
                // 強制交代（死に出し）フェーズへ移行するためループを抜ける
                battleState.isForcedSwitch = (action.p === 1 ? 2 : 1);
                break;
            }
        } else {
            log("攻撃は外れた！");
        }
        updateBattleUI();
        await new Promise(r => setTimeout(r, 1000));
    }
    
    battleState.p1NextAction = null; battleState.p2NextAction = null;
    battleState.isProcessing = false;
    updateBattleUI();
}

function handleStoryClear() {
    const stage = battleState.currentStage;
    ModeManager.clearStage(stage.id);
    const rewardTag = gameData.tags.find(t => t.id === stage.rewardTagId);
    ModeManager.unlockTag(stage.rewardTagId);
    
    document.getElementById('battle-field').classList.add('hidden');
    document.getElementById('story-section').classList.remove('hidden');
    document.getElementById('story-list-view').classList.add('hidden');
    document.getElementById('story-dialogue-view').classList.remove('hidden');
    document.getElementById('story-dialogue-title').textContent = "クリア！";
    document.getElementById('story-dialogue-text').textContent = stage.clearText + `\n【新タグ解放: ${rewardTag.name}】`;
    document.getElementById('story-dialogue-btn').onclick = () => {
        document.getElementById('story-dialogue-view').classList.add('hidden');
        document.getElementById('story-list-view').classList.remove('hidden');
        renderStoryScreen();
    };
}

function log(m) {
    const d = document.getElementById('battle-log');
    if (!d) return;
    const entry = document.createElement('div');
    entry.textContent = m;
    d.appendChild(entry);
    d.scrollTop = d.scrollHeight;
}

// オンライン対戦用関数群
function connectOnline() {
    const name = document.getElementById('online-player-name').value;
    if (!name) return alert("名前を入力してください");
    const connectBtn = document.getElementById('connect-btn');
    connectBtn.disabled = true;
    connectBtn.textContent = "接続中...";
    try {
        socket = io(DEFAULT_SERVER_URL);
        socket.on('connect_error', () => {
            alert("サーバーに接続できませんでした。");
            connectBtn.disabled = false;
            connectBtn.textContent = "接続";
        });
        socket.on('connect', () => {
            onlineState.id = socket.id;
            onlineState.name = name;
            socket.emit('join_lobby', name);
            document.getElementById('online-login').classList.add('hidden');
            document.getElementById('online-lobby').classList.remove('hidden');
            document.getElementById('my-online-name').textContent = name;
            addOnlineLog("ロビーに入室しました。");
        });
        socket.on('update_player_list', (players) => {
            const list = document.getElementById('online-player-list');
            list.innerHTML = '';
            players.forEach(p => {
                if (p.id === socket.id) return;
                const div = document.createElement('div');
                div.className = 'player-row';
                div.innerHTML = `<span>${p.name} <small>(${p.status})</small></span>${p.status === 'idle' ? `<button onclick="sendChallenge('${p.id}')">対戦申込</button>` : ''}`;
                list.appendChild(div);
            });
        });
        socket.on('receive_challenge', ({ fromId, fromName }) => {
            const msgArea = document.getElementById('online-msg-area');
            const div = document.createElement('div');
            div.className = 'challenge-modal';
            div.innerHTML = `<span><strong>${fromName}</strong>から対戦申し込み！</span><div><button onclick="respondChallenge('${fromId}', true)" style="margin-right:5px; background:var(--primary);">受ける</button><button onclick="respondChallenge('${fromId}', false)" style="background:var(--danger);">断る</button></div>`;
            msgArea.insertBefore(div, msgArea.firstChild);
        });
        socket.on('match_established', ({ roomId, role, opponentName }) => {
            onlineState.roomId = roomId; onlineState.role = role; onlineState.opponentName = opponentName;
            addOnlineLog(`マッチ成立！相手: ${opponentName}`);
            document.getElementById('online-lobby').classList.add('hidden');
            document.getElementById('online-regulation').classList.remove('hidden');
        });
        socket.on('regulation_decided', ({ partySize }) => {
            onlineState.partyLimit = partySize;
            document.getElementById('online-regulation').classList.add('hidden');
            document.getElementById('online-party-select').classList.remove('hidden');
            window.renderOnlinePartyList();
        });
        socket.on('battle_ready_selection', ({ opponentPartySize }) => {
            document.getElementById('online-party-select').classList.add('hidden');
            document.getElementById('online-section').classList.add('hidden');
            showSection('battle');
            document.getElementById('battle-mode-select').classList.add('hidden');
            document.getElementById('battle-setup').classList.add('hidden');
            document.getElementById('battle-field').classList.remove('hidden');
            onlineState.isOnlineBattle = true;
        });
        socket.on('resolve_turn', async ({ outcomes }) => {
            processOnlineTurn(outcomes);
        });
    } catch (e) { console.error(e); }
}

function addOnlineLog(m) {
    const area = document.getElementById('online-msg-area');
    if (!area) return;
    const div = document.createElement('div');
    div.textContent = `[${new Date().toLocaleTimeString()}] ${m}`;
    area.insertBefore(div, area.firstChild);
}

window.sendChallenge = (id) => { socket.emit('send_challenge', id); addOnlineLog("対戦を申し込みました。"); };
window.respondChallenge = (id, accept) => { socket.emit('respond_challenge', { fromId: id, accept }); };
window.sendRegulation = (size) => { socket.emit('propose_regulation', { roomId: onlineState.roomId, partySize: size }); };
window.returnToLobby = () => { location.reload(); };

async function processOnlineTurn(outcomes) {
    // オンライン用のターン処理
    battleState.isProcessing = true;
    updateBattleUI();
    
    for (let out of outcomes) {
        if (out.type === 'move') {
             log(`P${out.p}: ${out.attackerName}の ${out.moveName}！`);
             if (out.isHit) {
                 log(`${out.damage}のダメージ！`);
             } else {
                 log("攻撃は外れた！");
             }
        } else if (out.type === 'switch') {
             log(`P${out.p}: ${out.char.name}に交代！`);
        }
    }
    battleState.isProcessing = false;
    updateBattleUI();
}