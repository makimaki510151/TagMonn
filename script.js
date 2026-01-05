let gameData = { resistances: [], tags: [], moves: [] };
let myChars = JSON.parse(localStorage.getItem('tm_chars') || '[]');
let myParties = JSON.parse(localStorage.getItem('tm_parties') || '[]');

let currentBuild = { name: "", tags: [], moves: [] };
let currentPartyMembers = [];

let selectedP1 = null;
let selectedP2 = null;
let battleState = { 
    p1: [], p2: [], 
    p1ActiveIdx: 0, p2ActiveIdx: 0,
    p1NextAction: null, p2NextAction: null,
    isProcessing: false
};

window.onload = async () => {
    const success = await loadData();
    if (success) {
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

function setupEventListeners() {
    document.getElementById('save-char-btn').onclick = saveCharacter;
    document.getElementById('save-party-btn').onclick = saveParty;
    document.getElementById('start-battle-btn').onclick = startBattle;
}

// --- 共通UI処理 ---
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
        const tNames = item.types.map(id => getResName(id)).join('・');
        html += `[${tNames}] 威力:${item.power} 命中:${item.accuracy}<br>`;
        html += `<small>${item.description}</small>`;
    }
    detailBox.innerHTML = html;
}

// --- ビルド画面 ---
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
            
            // タグ変更時に条件外の技を解除
            currentBuild.moves = currentBuild.moves.filter(move => 
                (move.required_tags || []).every(reqId => currentBuild.tags.some(t => t.id === reqId))
            );
            renderBuildScreen();
        };
        container.appendChild(btn);
    });
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

    let hp = 100, atk = 50, spd = 50;
    currentBuild.tags.forEach(t => { hp += t.hp; atk += t.atk; spd += (t.spd || 0); });
    
    const statPreview = document.getElementById('stat-preview');
    statPreview.innerHTML = `
        <div class="stat-row"><span class="stat-label">HP</span><span class="stat-value">${hp}</span></div>
        <div class="stat-row"><span class="stat-label">ATK</span><span class="stat-value">${atk}</span></div>
        <div class="stat-row"><span class="stat-label">SPD</span><span class="stat-value">${spd}</span></div>
        <div style="margin-top:10px; font-size:0.8rem; color:var(--text-muted);">技スロット: ${currentBuild.moves.length}/4</div>
    `;
}

function saveCharacter() {
    const nameInput = document.getElementById('char-name');
    if (!nameInput.value || currentBuild.tags.length === 0) return alert("名前とタグを入力してください");
    myChars.push({ ...JSON.parse(JSON.stringify(currentBuild)), name: nameInput.value, id: Date.now() });
    localStorage.setItem('tm_chars', JSON.stringify(myChars));
    nameInput.value = "";
    renderSavedChars();
}

function renderSavedChars() {
    const list = document.getElementById('saved-chars-list');
    if (!list) return;
    list.innerHTML = myChars.map(c => `
        <div class="mini-list">
            <span style="font-weight:600;">${c.name}</span>
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

// --- パーティ編成 ---
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

// --- バトルロジック ---
function renderBattleSetup() {
    const p1div = document.getElementById('select-p1-party');
    const p2div = document.getElementById('select-p2-party');
    const draw = (p, pNum) => `<button class="tag-btn ${((pNum===1?selectedP1:selectedP2)?.id === p.id) ? 'active' : ''}" onclick="setBattleParty(${pNum}, ${p.id})">${p.name}</button>`;
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
        let hp = 100, spd = 50, atk = 50;
        m.tags.forEach(t => { hp += t.hp; spd += (t.spd || 0); atk += t.atk; });
        return { ...m, maxHp: hp, currentHp: hp, battleSpd: spd, battleAtk: atk, isFainted: false };
    };
    battleState.p1 = selectedP1.members.map(initSet);
    battleState.p2 = selectedP2.members.map(initSet);
    battleState.p1ActiveIdx = 0;
    battleState.p2ActiveIdx = 0;
    battleState.p1NextAction = null;
    battleState.p2NextAction = null;
    battleState.isProcessing = false;
    
    document.getElementById('battle-log').innerHTML = "<div>バトル開始！</div>";
    updateBattleUI();
}

function updateBattleUI() {
    const a1 = battleState.p1[battleState.p1ActiveIdx];
    const a2 = battleState.p2[battleState.p2ActiveIdx];

    updateCharDisplay(1, a1);
    updateCharDisplay(2, a2);

    renderActionPanel(1, a1, 'move-actions');
    renderActionPanel(2, a2, 'switch-actions');
}

function updateCharDisplay(pNum, char) {
    const prefix = pNum === 1 ? 'p1' : 'p2';
    const nameEl = document.getElementById(`${prefix}-active-info`);
    const fillEl = document.getElementById(pNum === 1 ? 'p1-fill' : 'p2-hp-fill');
    
    nameEl.innerHTML = `
        <div class="char-name">${char.name}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">SPD: ${char.battleSpd} / ATK: ${char.battleAtk}</div>
        <div class="resistance-grid">${renderResistances(char)}</div>
    `;
    
    const hpPercent = (char.currentHp / char.maxHp) * 100;
    fillEl.style.width = `${hpPercent}%`;
    fillEl.className = 'fill';
    if (hpPercent < 20) fillEl.classList.add('danger');
    else if (hpPercent < 50) fillEl.classList.add('warning');
}

function renderResistances(char) {
    // 簡易的な耐性計算ロジック（タグの説明文から推測する仕組みを模擬）
    // 本来はデータ側に耐性値を持つべきだが、現状はタグの特性から表示
    const resMap = {};
    char.tags.forEach(t => {
        if (t.name === "悪性") { resMap[21] = "resist"; resMap[20] = "weak"; }
        if (t.name === "飛翔") { resMap[30] = "weak"; }
        if (t.name === "機械") { resMap[12] = "weak"; resMap[40] = "weak"; }
        if (t.name === "古龍") { resMap[11] = "weak"; }
        if (t.name === "火精") { resMap[10] = "resist"; resMap[11] = "weak"; }
        if (t.name === "水妖") { resMap[15] = "resist"; resMap[12] = "weak"; }
        if (t.name === "不死") { resMap[20] = "weak"; }
        if (t.name === "雷禍") { resMap[12] = "resist"; resMap[14] = "weak"; }
    });

    return Object.entries(resMap).map(([id, type]) => {
        const name = getResName(parseInt(id));
        return `<div class="res-item ${type === 'weak' ? 'res-weak' : 'res-resist'}">${name}</div>`;
    }).join('') || '<div class="res-item">耐性なし</div>';
}

function renderActionPanel(pNum, char, containerId) {
    const cont = document.getElementById(containerId);
    cont.innerHTML = `<h4>Player ${pNum} の選択</h4><div class="action-grid"></div>`;
    const grid = cont.querySelector('.action-grid');
    
    if (battleState.isProcessing) return;

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
            btn.textContent = `交代:${c.name}`;
            btn.className = 'action-btn switch';
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
        const priA = a.act.type === 'switch' ? 1000 : a.char.battleSpd;
        const priB = b.act.type === 'switch' ? 1000 : b.char.battleSpd;
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
            const target = a.p === 1 ? battleState.p2[battleState.p2ActiveIdx] : battleState.p1[battleState.p1ActiveIdx];
            const targetPrefix = a.p === 1 ? 'p2' : 'p1';
            
            log(`P${a.p}: ${attacker.name}の ${a.act.move.name}！`);
            
            // アニメーション演出
            const targetEl = document.querySelector(`.${targetPrefix === 'p1' ? 'side-ui:first-child' : 'side-ui:last-child'}`);
            targetEl.classList.add('shake', 'flash');
            setTimeout(() => targetEl.classList.remove('shake', 'flash'), 500);

            const damage = Math.floor((a.act.move.power || 20) * (attacker.battleAtk / 50));
            target.currentHp = Math.max(0, target.currentHp - damage);
            
            if (target.currentHp <= 0) {
                target.isFainted = true;
                log(`${target.name}は倒れた！`);
                const party = a.p === 1 ? battleState.p2 : battleState.p1;
                const next = party.findIndex(c => !c.isFainted);
                if (next !== -1) {
                    if (a.p === 1) battleState.p2ActiveIdx = next; else battleState.p1ActiveIdx = next;
                    log(`P${a.p === 1 ? 2 : 1}: ${party[next].name}が登場！`);
                } else {
                    log(`P${a.p === 1 ? 2 : 1}の全滅！ P${a.p}の勝利！`);
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
