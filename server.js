const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "https://makimaki510151.github.io",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

let players = {};
let rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_lobby', (name) => {
        players[socket.id] = { name: name, status: 'idle', id: socket.id };
        io.emit('update_player_list', Object.values(players));
    });

    socket.on('send_challenge', (targetId) => {
        if (players[targetId] && players[targetId].status === 'idle') {
            io.to(targetId).emit('receive_challenge', { fromId: socket.id, fromName: players[socket.id].name });
        }
    });

    socket.on('respond_challenge', ({ targetId, accept }) => {
        if (accept) {
            const roomId = `room_${Date.now()}_${Math.random()}`;
            players[socket.id].status = 'battle';
            players[targetId].status = 'battle';
            players[socket.id].roomId = roomId;
            players[targetId].roomId = roomId;

            rooms[roomId] = {
                p1: targetId,
                p2: socket.id,
                regulation: null,
                p1Party: null,
                p2Party: null,
                p1Action: null,
                p2Action: null,
                p1ActiveIdx: -1,
                p2ActiveIdx: -1
            };

            socket.join(roomId);
            const targetSocket = io.sockets.sockets.get(targetId);
            if (targetSocket) targetSocket.join(roomId);

            io.to(targetId).emit('match_established', { roomId, role: 1, opponentName: players[socket.id].name });
            io.to(socket.id).emit('match_established', { roomId, role: 2, opponentName: players[targetId].name });
            io.emit('update_player_list', Object.values(players));
        } else {
            io.to(targetId).emit('challenge_declined', { fromName: players[socket.id].name });
        }
    });

    socket.on('propose_regulation', ({ roomId, partySize }) => {
        const room = rooms[roomId];
        if (!room) return;
        room.regulation = partySize;
        io.to(roomId).emit('regulation_proposed', { partySize, proposerId: socket.id });
    });

    socket.on('accept_regulation', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;
        io.to(roomId).emit('regulation_decided', { partySize: room.regulation });
    });

    socket.on('submit_party', ({ roomId, partyData, role }) => {
        const room = rooms[roomId];
        if (!room) return;

        const partyWithStatus = partyData.map(m => ({
            ...m,
            maxHp: m.baseStats.hp,
            currentHp: m.baseStats.hp,
            battleSpd: m.baseStats.spd,
            battleAtk: m.baseStats.atk,
            isFainted: false
        }));

        if (role === 1) room.p1Party = partyWithStatus;
        else room.p2Party = partyWithStatus;

        if (room.p1Party && room.p2Party) {
            io.to(room.p1).emit('battle_ready_selection', { opponentPartySize: room.p2Party.length });
            io.to(room.p2).emit('battle_ready_selection', { opponentPartySize: room.p1Party.length });
        }
    });

    socket.on('submit_initial_pick', ({ roomId, role, index }) => {
        const room = rooms[roomId];
        if (!room) return;

        if (role === 1) {
            room.p1ActiveIdx = index;
            room.p1Action = { type: 'initial' };
        } else {
            room.p2ActiveIdx = index;
            room.p2Action = { type: 'initial' };
        }

        if (room.p1Action && room.p2Action) {
            const p1Char = room.p1Party[room.p1ActiveIdx];
            const p2Char = room.p2Party[room.p2ActiveIdx];
            io.to(room.p1).emit('initial_pick_reveal', { myIndex: room.p1ActiveIdx, oppIndex: room.p2ActiveIdx, oppActiveChar: p2Char, oppPartySize: room.p2Party.length });
            io.to(room.p2).emit('initial_pick_reveal', { myIndex: room.p2ActiveIdx, oppIndex: room.p1ActiveIdx, oppActiveChar: p1Char, oppPartySize: room.p1Party.length });
            room.p1Action = null;
            room.p2Action = null;
        }
    });

    socket.on('submit_action', ({ roomId, role, action }) => {
        const room = rooms[roomId];
        if (!room) return;

        if (role === 1) room.p1Action = action;
        else room.p2Action = action;

        const p1Active = room.p1Party[room.p1ActiveIdx];
        const p2Active = room.p2Party[room.p2ActiveIdx];

        // 死に出し（交代のみ）が必要なケースか判定
        const p1NeedsSwitch = p1Active.isFainted;
        const p2NeedsSwitch = p2Active.isFainted;

        if (action.type === 'switch' && !room.isResolving) {
            if (role === 1) {
                room.p1ActiveIdx = action.index;
            } else {
                room.p2ActiveIdx = action.index;
            }
            const activeChar = (role === 1 ? room.p1Party : room.p2Party)[action.index];
            io.to(roomId).emit('forced_switch_reveal', { 
                role, 
                index: action.index, 
                activeChar: activeChar 
            });
            
            // アクションをリセットして次のターンの入力を待つ
            if (role === 1) room.p1Action = null;
            else room.p2Action = null;
            return; 
        }

        // 双方が必要な入力を終えたかチェック
        if (room.p1Action && room.p2Action) {
            const outcomes = [];
            const actions = [
                { p: 1, act: room.p1Action, char: room.p1Party[room.p1ActiveIdx] },
                { p: 2, act: room.p2Action, char: room.p2Party[room.p2ActiveIdx] }
            ];

            // 素早さ順にソート（交代は最優先）
            actions.sort((a, b) => {
                const priority = (act) => act.type === 'switch' ? 999 : 0;
                if (priority(a.act) !== priority(b.act)) return priority(b.act) - priority(a.act);
                return b.char.battleSpd - a.char.battleSpd;
            });

            for (const a of actions) {
                const attackerSide = a.p;
                const targetSide = a.p === 1 ? 2 : 1;
                const attacker = a.p === 1 ? room.p1Party[room.p1ActiveIdx] : room.p2Party[room.p2ActiveIdx];
                const target = a.p === 1 ? room.p2Party[room.p2ActiveIdx] : room.p1Party[room.p1ActiveIdx];

                if (attacker.isFainted) continue;

                if (a.act.type === 'move') {
                    const move = a.act.move;

                    // 1. 回復処理の実装
                    if (move.effect && move.effect.type === 'heal') {
                        const healAmt = Math.floor(attacker.maxHp * move.effect.value);
                        attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmt);
                        outcomes.push({
                            type: 'heal', p: attackerSide, moveName: move.name, healAmt, currentHp: attacker.currentHp
                        });
                    }

                    // 2. バフ・デバフ処理の実装（耐性への干渉）
                    if (move.effect && (move.effect.type === 'buff' || move.effect.type === 'debuff')) {
                        const isBuff = move.effect.type === 'buff';
                        const targetChar = move.effect.target === 'self' ? attacker : target;
                        const effectSide = (move.effect.target === 'self' ? attackerSide : targetSide);

                        if (move.effect.stat === 'def') {
                            // 防御バフ/デバフは「その技の属性の耐性」を変化させる
                            // 例: バフなら 0.5倍(ダメージ半減)、デバフなら 1.5倍(ダメージ増加)
                            const resType = move.res_type;
                            if (!targetChar.resistances[resType]) targetChar.resistances[resType] = 1.0;

                            targetChar.resistances[resType] *= move.effect.value;

                            outcomes.push({
                                type: 'stat_change', p: attackerSide, moveName: move.name,
                                targetP: effectSide, stat: 'resistance', resType, newValue: targetChar.resistances[resType]
                            });
                        } else if (move.effect.stat === 'atk') {
                            targetChar.battleAtk *= move.effect.value;
                            outcomes.push({ type: 'stat_change', p: attackerSide, moveName: move.name, targetP: effectSide, stat: 'atk' });
                        }
                    }

                    // 3. ダメージ計算（バグ修正：耐性値をダメージ計算に確実に反映）
                    if (move.power > 0) {
                        const resMult = target.resistances[move.res_type] || 1.0;
                        const damage = Math.floor((move.power * (attacker.battleAtk / 100)) * (1 / resMult));

                        target.currentHp = Math.max(0, target.currentHp - damage);
                        if (target.currentHp <= 0) target.isFainted = true;

                        outcomes.push({
                            type: 'move', p: attackerSide, moveName: move.name, damage, resMult,
                            targetP: targetSide, targetHp: target.currentHp, targetFainted: target.isFainted
                        });
                    }
                } else if (a.act.type === 'switch') {
                    // ... (既存の交代処理) ...
                    if (a.p === 1) room.p1ActiveIdx = a.act.index;
                    else room.p2ActiveIdx = a.act.index;
                    outcomes.push({ type: 'switch', p: a.p, index: a.act.index, char: (a.p === 1 ? room.p1Party[a.act.index] : room.p2Party[a.act.index]) });
                }
            }
            io.to(roomId).emit('resolve_turn', { outcomes });
            room.p1Action = null;
            room.p2Action = null;
        }
    });

    socket.on('leave_battle', () => resetPlayer(socket));
    socket.on('disconnect', () => { resetPlayer(socket); });

    function resetPlayer(s) {
        if (players[s.id]) {
            const roomId = players[s.id].roomId;
            if (roomId && rooms[roomId]) {
                const opponentId = rooms[roomId].p1 === s.id ? rooms[roomId].p2 : rooms[roomId].p1;
                io.to(opponentId).emit('opponent_left');
                if (players[opponentId]) { players[opponentId].status = 'idle'; players[opponentId].roomId = null; }
                delete rooms[roomId];
            }
            delete players[s.id];
            io.emit('update_player_list', Object.values(players));
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));