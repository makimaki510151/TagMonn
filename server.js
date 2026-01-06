const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let users = {}; // socket.id -> { name, state, id }
let battles = {}; // battleId -> { p1, p2, regulations, state, actions }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // ユーザー参加
    socket.on('join_lobby', (userData) => {
        users[socket.id] = {
            id: socket.id,
            name: userData.name,
            state: 'lobby' // lobby, preparing, battling
        };
        io.emit('update_user_list', Object.values(users));
    });

    // 対戦申し込み
    socket.on('send_challenge', (targetId) => {
        const challenger = users[socket.id];
        if (challenger && users[targetId] && users[targetId].state === 'lobby') {
            io.to(targetId).emit('receive_challenge', {
                fromId: socket.id,
                fromName: challenger.name
            });
        }
    });

    // 対戦拒否
    socket.on('decline_challenge', (targetId) => {
        io.to(targetId).emit('challenge_declined', { name: users[socket.id].name });
    });

    // 対戦承諾 & レギュレーション設定へ
    socket.on('accept_challenge', (targetId) => {
        const p1 = users[targetId]; // 申し込んだ側
        const p2 = users[socket.id]; // 受けた側

        if (p1 && p2) {
            const battleId = `battle_${Date.now()}`;
            p1.state = 'preparing';
            p2.state = 'preparing';
            
            battles[battleId] = {
                id: battleId,
                p1: p1.id,
                p2: p2.id,
                phase: 'regulation',
                readyCount: 0,
                partyData: {},
                initialPicks: {},
                actions: {}
            };

            // 両者にレギュレーション画面を表示させる
            io.to(p1.id).emit('start_regulation', { battleId, opponent: p2.name, isHost: true });
            io.to(p2.id).emit('start_regulation', { battleId, opponent: p1.name, isHost: false });
            
            io.emit('update_user_list', Object.values(users));
        }
    });

    // レギュレーション決定 (Hostのみが送信)
    socket.on('set_regulation', ({ battleId, partySize }) => {
        const battle = battles[battleId];
        if (battle) {
            battle.regulations = { partySize };
            battle.phase = 'party_select';
            // 両者にパーティ選択画面へ移行指示
            io.to(battle.p1).emit('go_to_party_select', { partySize });
            io.to(battle.p2).emit('go_to_party_select', { partySize });
        }
    });

    // パーティ＆初期キャラ選択完了
    socket.on('submit_party', ({ battleId, party, initialIndex }) => {
        const battle = battles[battleId];
        if (!battle) return;

        // データの保存（相手にはまだ見せない）
        battle.partyData[socket.id] = party;
        battle.initialPicks[socket.id] = initialIndex;
        battle.readyCount++;

        if (battle.readyCount === 2) {
            battle.phase = 'battle';
            battle.readyCount = 0; // アクション待ち用にリセット

            // 両者のデータが揃ったので、相手の情報を（技を隠して）送信
            const p1Data = battle.partyData[battle.p1];
            const p2Data = battle.partyData[battle.p2];
            const p1Init = battle.initialPicks[battle.p1];
            const p2Init = battle.initialPicks[battle.p2];

            // P1に送るデータ（P2の技は隠す）
            io.to(battle.p1).emit('battle_start', {
                myParty: p1Data,
                myInitial: p1Init,
                oppParty: sanitizeParty(p2Data), // 技ID等を隠蔽または削除
                oppInitial: p2Init,
                isP1: true
            });

            // P2に送るデータ（P1の技は隠す）
            io.to(battle.p2).emit('battle_start', {
                myParty: p2Data,
                myInitial: p2Init,
                oppParty: sanitizeParty(p1Data),
                oppInitial: p1Init,
                isP1: false
            });
            
            // ユーザー状態更新
            users[battle.p1].state = 'battling';
            users[battle.p2].state = 'battling';
            io.emit('update_user_list', Object.values(users));
        }
    });

    // バトルアクション受信
    socket.on('submit_action', ({ battleId, action }) => {
        const battle = battles[battleId];
        if (!battle) return;

        battle.actions[socket.id] = action;
        
        // 両者のアクションが揃ったら
        if (Object.keys(battle.actions).length === 2) {
            // クライアント側で計算させるため、お互いのアクションを開示
            // ※本来はサーバーで計算すべきだが、構造理解のためリレー方式を採用
            io.to(battle.p1).emit('resolve_turn', {
                oppAction: battle.actions[battle.p2]
            });
            io.to(battle.p2).emit('resolve_turn', {
                oppAction: battle.actions[battle.p1]
            });
            
            battle.actions = {}; // リセット
        }
    });
    
    // バトル終了
    socket.on('battle_end', ({ battleId }) => {
        const battle = battles[battleId];
        if(battle) {
             users[battle.p1].state = 'lobby';
             users[battle.p2].state = 'lobby';
             delete battles[battleId];
             io.emit('update_user_list', Object.values(users));
        }
    });

    // 切断
    socket.on('disconnect', () => {
        if (users[socket.id]) {
            delete users[socket.id];
            io.emit('update_user_list', Object.values(users));
        }
    });
});

// 相手に見せる情報のフィルタリング（技の詳細を隠す）
function sanitizeParty(party) {
    return party.map(char => ({
        ...char,
        moves: [] // 技情報を空にする（クライアント側で見えないようにする）
    }));
}

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});