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

// オンライン用変数
let socket = io("https://makkili.a.pinggy.link");
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
    // onlineは特別な初期化なし（connectOnlineでやる）
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

    onlineState.isOnlineBattle = false; // ローカルバトル

    document.getElementById('battle-setup').classList.add('hidden');
    document.getElementById('battle-field').classList.remove('hidden');
    document.getElementById('online-back-btn').classList.add('hidden'); // ローカルでは戻るボタン非表示

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

    // オンラインの場合、相手が確定していない(blind pick中)なら情報は隠す
    if (onlineState.isOnlineBattle && battleState.isSelectingInitial && a2 === null && onlineState.role === 1) {
        // P1視点、P2未定
        updateCharDisplay(1, a1);
        updateCharDisplay(2, null);
    } else if (onlineState.isOnlineBattle && battleState.isSelectingInitial && a1 === null && onlineState.role === 2) {
        // P2視点、P1未定
        updateCharDisplay(1, null);
        updateCharDisplay(2, a2);
    } else {
        updateCharDisplay(1, a1);
        updateCharDisplay(2, a2);
    }

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
        infoEl.innerHTML = `<div class="char-name" style="color:var(--text-muted)">? ? ?</div>`;
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

    // オンラインの場合、自分のパネルのみ表示
    if (onlineState.isOnlineBattle) {
        if (onlineState.role === 1) renderOnlineSelection(1, moveCont);
        else renderOnlineSelection(2, switchCont); // P2は右側に表示
        return;
    }

    // 以下ローカル用ロジック
    let pNum = 1;
    if (battleState.isSelectingInitial) {
        pNum = battleState.p1ActiveIdx === -1 ? 1 : 2;
    } else {
        pNum = battleState.isForcedSwitch;
    }

    const container = pNum === 1 ? moveCont : switchCont;
    container.innerHTML = `<h4>Player ${pNum} 出すキャラを選択</h4><div class="action-grid"></div>`;
    const grid = container.querySelector('.action-grid');
    generateSelectionButtons(pNum, grid);
}

function renderOnlineSelection(pNum, container) {
    // 交代が必要なのは自分か？
    let isMyTurnToSelect = false;
    if (battleState.isSelectingInitial) {
        isMyTurnToSelect = (pNum === 1 && battleState.p1ActiveIdx === -1) || (pNum === 2 && battleState.p2ActiveIdx === -1);
    } else {
        isMyTurnToSelect = battleState.isForcedSwitch === pNum;
    }

    if (isMyTurnToSelect) {
        container.innerHTML = `<h4>あなたの選出</h4><div class="action-grid"></div>`;
        const grid = container.querySelector('.action-grid');
        generateSelectionButtons(pNum, grid);
    } else {
        container.innerHTML = `<h4>相手の選出待ち...</h4>`;
    }
}

function generateSelectionButtons(pNum, grid) {
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

    if (onlineState.isOnlineBattle) {
        // オンライン: サーバーに選択を送信
        if (battleState.isSelectingInitial) {
            socket.emit('submit_initial_pick', { roomId: onlineState.roomId, role: onlineState.role, index: idx });
            document.getElementById('waiting-overlay').classList.remove('hidden');
            // 一時的に自分のステートには反映せず、サーバーのrevealイベントを待つ
        } else if (battleState.isForcedSwitch) {
            // 強制交代時
            socket.emit('submit_action', { roomId: onlineState.roomId, role: onlineState.role, action: { type: 'switch', index: idx } });
            document.getElementById('waiting-overlay').classList.remove('hidden');
        }
        return;
    }

    // ローカル処理
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

    // オンラインの場合、自分以外のコントロールは非表示
    if (onlineState.isOnlineBattle) {
        if (onlineState.role !== pNum) {
            cont.innerHTML = ``;
            return;
        }
        cont.innerHTML = `<h4>あなた(${pNum}) の選択</h4><div class="action-grid"></div>`;
    } else {
        cont.innerHTML = `<h4>Player ${pNum} の選択</h4><div class="action-grid"></div>`;
    }

    const grid = cont.querySelector('.action-grid');

    if (battleState.isProcessing || battleState.isForcedSwitch) return;

    // 既にアクション選択済みなら待機表示（オンライン用）
    if (onlineState.isOnlineBattle) {
        if (onlineState.role === 1 && battleState.p1NextAction) {
            grid.innerHTML = "<div>行動選択済み。待機中...</div>";
            return;
        }
        if (onlineState.role === 2 && battleState.p2NextAction) {
            grid.innerHTML = "<div>行動選択済み。待機中...</div>";
            return;
        }
    }

    char.moves.forEach(m => {
        const btn = document.createElement('button');
        btn.textContent = m.name;
        btn.onmouseover = () => showDetail(m, 'move');
        btn.className = 'action-btn';
        if ((pNum === 1 ? battleState.p1NextAction : battleState.p2NextAction)?.move?.id === m.id) {
            btn.classList.add('active');
        }
        btn.onclick = () => {
            handleAction(pNum, { type: 'move', move: m });
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
                handleAction(pNum, { type: 'switch', index: idx });
            };
            grid.appendChild(btn);
        }
    });
}

function handleAction(pNum, action) {
    if (onlineState.isOnlineBattle) {
        // サーバーへ送信
        socket.emit('submit_action', { roomId: onlineState.roomId, role: onlineState.role, action });
        // 自分のアクションだけ仮セットしてUIロック
        if (pNum === 1) battleState.p1NextAction = action;
        else battleState.p2NextAction = action;

        document.getElementById('waiting-overlay').classList.remove('hidden');
        renderActionPanel(pNum, (pNum === 1 ? battleState.p1[battleState.p1ActiveIdx] : battleState.p2[battleState.p2ActiveIdx]), pNum === 1 ? 'move-actions' : 'switch-actions');
    } else {
        // ローカル
        if (pNum === 1) battleState.p1NextAction = action;
        else battleState.p2NextAction = action;
        checkTurnReady();
    }
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
    document.getElementById('waiting-overlay').classList.add('hidden'); // アニメーション中は待機解除

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
                    if (onlineState.isOnlineBattle) document.getElementById('online-back-btn').classList.remove('hidden');
                    return;
                } else {
                    // 交代先選択フラグ
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

// ----------------------------------------------------
// オンライン対戦用関数群
// ----------------------------------------------------

function connectOnline() {
    const serverUrl = document.getElementById('online-server-url').value;
    const name = document.getElementById('online-player-name').value;
    if (!name) return alert("名前を入力してください");

    try {
        // Socket接続 (URLがあれば指定、なければデフォルト)
        socket = serverUrl ? io(serverUrl) : io();

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
                if (p.id === socket.id) return; // 自分は表示しない
                const div = document.createElement('div');
                div.className = 'player-row';
                div.innerHTML = `
                    <span>${p.name} <small>(${p.status})</small></span>
                    ${p.status === 'idle' ? `<button onclick="sendChallenge('${p.id}')">対戦申込</button>` : ''}
                `;
                list.appendChild(div);
            });
        });

        socket.on('receive_challenge', ({ fromId, fromName }) => {
            const msgArea = document.getElementById('online-msg-area');
            const div = document.createElement('div');
            div.className = 'challenge-modal';
            div.innerHTML = `
                <span><strong>${fromName}</strong>から対戦申し込み！</span>
                <div>
                    <button onclick="respondChallenge('${fromId}', true)" style="margin-right:5px; background:var(--primary);">受ける</button>
                    <button onclick="respondChallenge('${fromId}', false)" style="background:var(--danger);">断る</button>
                </div>
            `;
            msgArea.insertBefore(div, msgArea.firstChild);
        });

        socket.on('challenge_declined', ({ fromName }) => {
            addOnlineLog(`${fromName}に対戦を断られました。`);
        });

        socket.on('match_established', ({ roomId, role, opponentName }) => {
            onlineState.roomId = roomId;
            onlineState.role = role;
            onlineState.opponentName = opponentName;
            addOnlineLog(`マッチ成立！相手: ${opponentName}`);

            document.getElementById('online-lobby').classList.add('hidden');
            document.getElementById('online-regulation').classList.remove('hidden');
        });

        // サーバーからのレギュレーション提案受信
        socket.on('regulation_proposed', ({ partySize, proposerId }) => {
            onlineState.partyLimit = partySize;
            document.getElementById('online-regulation').classList.remove('hidden');

            const regStatus = document.getElementById('reg-status');
            if (socket.id === proposerId) {
                // 自分が提案した場合は待機
                regStatus.innerHTML = `${partySize} on ${partySize} を提案中。相手の承認を待っています...`;
            } else {
                // 相手が提案した場合は承認ボタンを表示
                regStatus.innerHTML = `相手が ${partySize} on ${partySize} を提案しました。 <button class="primary-btn" onclick="acceptRegulation()">承認する</button>`;
            }
        });

        // レギュレーション決定時の処理
        socket.on('regulation_decided', ({ partySize }) => {
            onlineState.partyLimit = partySize;

            // UIの切り替え
            document.getElementById('online-regulation').classList.add('hidden');
            document.getElementById('online-party-select').classList.remove('hidden');

            const msg = document.getElementById('party-select-msg');
            msg.textContent = `レギュレーション: ${partySize} on ${partySize}。使用するパーティを選択してください。`;

            // 選択可能なパーティ一覧を表示
            renderOnlinePartyList();
        });

        // パーティリストの描画（レギュレーションに合うものだけ表示）
        function renderOnlinePartyList() {
            const list = document.getElementById('online-party-list');
            // レギュレーションの数と一致するメンバー数のパーティだけを抽出
            const validParties = myParties.filter(p => p.members.length === onlineState.partyLimit);

            if (validParties.length === 0) {
                list.innerHTML = `<div style="color:var(--danger); padding:10px;">
            ${onlineState.partyLimit}体編成のパーティが登録されていません。
            「パーティ編成」タブで作成してください。
        </div>`;
                return;
            }

            list.innerHTML = validParties.map(p => `
        <div class="player-row">
            <span>${p.name} (メンバー: ${p.members.length}体)</span>
            <button class="primary-btn" onclick="submitOnlineParty(${p.id})">選択</button>
        </div>
    `).join('');
        }

        // 承認ボタンの動作
        function acceptRegulation() {
            socket.emit('accept_regulation', { roomId: onlineState.roomId });
        }

        // パーティ送信
        function submitOnlineParty(partyId) {
            const party = myParties.find(p => p.id === partyId);
            if (!party) return;

            const initSet = (m) => ({
                ...m,
                maxHp: m.baseStats.hp,
                currentHp: m.baseStats.hp,
                battleSpd: m.baseStats.spd,
                battleAtk: m.baseStats.atk,
                isFainted: false
            });

            // 自分の役割に合わせてバトル状態を初期化
            if (onlineState.role === 1) {
                battleState.p1 = party.members.map(initSet);
            } else {
                battleState.p2 = party.members.map(initSet);
            }

            socket.emit('submit_party', {
                roomId: onlineState.roomId,
                partyData: party.members,
                role: onlineState.role
            });

            document.getElementById('online-party-list').innerHTML = "<div>相手の選択を待っています...</div>";
        }

        socket.on('battle_ready_selection', ({ opponentPartySize }) => {
            // バトル画面へ移行
            document.getElementById('online-party-select').classList.add('hidden');
            document.getElementById('online-section').classList.add('hidden');
            document.getElementById('battle-field').classList.remove('hidden');

            startOnlineBattle(opponentPartySize);
        });

        socket.on('initial_pick_reveal', ({ myIndex, oppIndex, oppParty }) => {
            // 相手パーティ情報を受信して更新
            const initSet = (m) => ({
                ...m,
                maxHp: m.baseStats.hp,
                currentHp: m.baseStats.hp,
                battleSpd: m.baseStats.spd,
                battleAtk: m.baseStats.atk,
                isFainted: false
            });

            // 相手パーティをセット
            if (onlineState.role === 1) battleState.p2 = oppParty.map(initSet);
            else battleState.p1 = oppParty.map(initSet);

            document.getElementById('waiting-overlay').classList.add('hidden');

            // 選出反映
            battleState.p1ActiveIdx = onlineState.role === 1 ? myIndex : oppIndex;
            battleState.p2ActiveIdx = onlineState.role === 1 ? oppIndex : myIndex;
            battleState.isSelectingInitial = false;

            const p1Name = battleState.p1[battleState.p1ActiveIdx].name;
            const p2Name = battleState.p2[battleState.p2ActiveIdx].name;
            log(`バトル開始！ P1:${p1Name} vs P2:${p2Name}`);

            updateBattleUI();
        });

        socket.on('resolve_turn', ({ p1Action, p2Action }) => {
            // アクションを受信してローカルステートに適用
            battleState.p1NextAction = p1Action;
            battleState.p2NextAction = p2Action;

            // ターン処理実行
            processTurn();
        });

        socket.on('opponent_left', () => {
            alert("相手が切断しました。");
            returnToLobby();
        });

    } catch (e) {
        console.error("Connection failed", e);
        alert("サーバーに接続できませんでした。");
    }
}

function disconnectOnline() {
    if (socket) socket.disconnect();
    socket = null;
    document.getElementById('online-lobby').classList.add('hidden');
    document.getElementById('online-login').classList.remove('hidden');
}

function addOnlineLog(msg) {
    const d = document.getElementById('online-msg-area');
    const div = document.createElement('div');
    div.textContent = msg;
    div.style.padding = "4px 0";
    div.style.borderBottom = "1px solid #eee";
    d.insertBefore(div, d.firstChild);
}

function sendChallenge(id) {
    socket.emit('send_challenge', id);
    addOnlineLog("申し込みを送信しました...");
}

function respondChallenge(id, accept) {
    socket.emit('respond_challenge', { targetId: id, accept });
    const modal = document.querySelector('.challenge-modal');
    if (modal) modal.remove();
}

function sendRegulation(size) {
    onlineState.partyLimit = size;
    socket.emit('propose_regulation', { roomId: onlineState.roomId, partySize: size });
    document.getElementById('reg-status').textContent = `${size} on ${size} を提案中...`;
}

function acceptRegulation(size) {
    onlineState.partyLimit = size;
    socket.emit('accept_regulation', { roomId: onlineState.roomId });
}

function renderOnlinePartySelect() {
    document.getElementById('online-party-select').classList.remove('hidden');
    document.getElementById('party-select-msg').textContent = `${onlineState.partyLimit}体以上のパーティを選択してください。`;

    const list = document.getElementById('online-party-list');
    list.innerHTML = myParties.filter(p => p.members.length >= onlineState.partyLimit).map(p => `
        <div class="mini-list">
             <span>${p.name} (${p.members.length}体)</span>
             <button class="primary-btn" style="width:auto; padding:8px;" onclick="confirmOnlineParty(${p.id})">決定</button>
        </div>
    `).join('');
}

function confirmOnlineParty(pid) {
    const party = myParties.find(p => p.id === pid);
    // レギュレーション数に合わせて先頭から抽出
    const selectedMembers = party.members.slice(0, onlineState.partyLimit);

    // 自分のパーティをローカルセット
    const initSet = (m) => ({
        ...m,
        maxHp: m.baseStats.hp,
        currentHp: m.baseStats.hp,
        battleSpd: m.baseStats.spd,
        battleAtk: m.baseStats.atk,
        isFainted: false
    });

    if (onlineState.role === 1) battleState.p1 = selectedMembers.map(initSet);
    else battleState.p2 = selectedMembers.map(initSet);

    // サーバーに送信 (詳細データごと送る)
    socket.emit('submit_party', { roomId: onlineState.roomId, partyData: selectedMembers, role: onlineState.role });

    document.getElementById('online-party-list').innerHTML = "<div>待機中...</div>";
}

function startOnlineBattle(oppSize) {
    onlineState.isOnlineBattle = true;
    battleState.p1ActiveIdx = -1;
    battleState.p2ActiveIdx = -1;
    battleState.isSelectingInitial = true;
    battleState.isForcedSwitch = null;

    // 相手のパーティはまだ空っぽ(Blind)にするが、枠だけ確保しておくと安全
    const dummy = Array(oppSize).fill(null);
    if (onlineState.role === 1) battleState.p2 = dummy;
    else battleState.p1 = dummy;

    document.getElementById('battle-log').innerHTML = "<div>オンライン対戦開始！初手を選んでください。</div>";
    updateBattleUI();
}

function returnToLobby() {
    socket.emit('leave_battle');
    onlineState.isOnlineBattle = false;
    document.getElementById('battle-field').classList.add('hidden');
    document.getElementById('battle-section').classList.add('hidden');
    document.getElementById('online-section').classList.remove('hidden');
    document.getElementById('online-lobby').classList.remove('hidden');
    document.getElementById('online-back-btn').classList.add('hidden');
}