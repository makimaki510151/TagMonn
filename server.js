const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const BattleLogic = require('./battleLogic');

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

        // 既にバトル中の死に出し（forced switch）の場合
        const roomState = rooms[roomId];
        if (roomState.p1Party && roomState.p2Party && roomState.p1ActiveIdx !== -1 && roomState.p2ActiveIdx !== -1) {
            // 片方が倒れていて、もう片方が選択した場合
            const p1Fainted = roomState.p1Party.every(c => c.isFainted || roomState.p1Party.indexOf(c) !== roomState.p1ActiveIdx); // 簡易判定
            // 実際には、クライアントからのsubmit_actionでtype: 'switch'が送られてくるはずなので、そちらで処理する
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

        // 双方が必要な入力を終えたかチェック
        if (room.p1Action && room.p2Action) {
            const outcomes = [];
            const actions = [
                { p: 1, act: room.p1Action, char: room.p1Party[room.p1ActiveIdx] },
                { p: 2, act: room.p2Action, char: room.p2Party[room.p2ActiveIdx] }
            ];

            // 素早さ順にソート（交代は最優先）
            actions.sort((a, b) => {
                const priority = (act) => {
                    if (act.type === 'switch') return 1000;
                    return (act.move.priority || 0) * 100;
                };
                const priA = priority(a.act) + a.char.battleSpd;
                const priB = priority(b.act) + b.char.battleSpd;
                return priB - priA;
            });

            for (const a of actions) {
                const attackerSide = a.p;
                const targetSide = a.p === 1 ? 2 : 1;
                const attacker = a.p === 1 ? room.p1Party[room.p1ActiveIdx] : room.p2Party[room.p2ActiveIdx];
                const target = a.p === 1 ? room.p2Party[room.p2ActiveIdx] : room.p1Party[room.p1ActiveIdx];

                if (a.char.isFainted) continue;

                // ★追加：ひるみ判定
                if (a.char.isFlinching) {
                    outcomes.push({
                        type: 'flinch_wait', // クライアント側に「動けない」ことを伝える
                        attackerName: a.char.name,
                        p: a.p
                    });
                    a.char.isFlinching = false; // ひるみ状態を解除
                    continue; // 以降の攻撃処理をスキップ
                }

                // server.js ターン解決部分
                if (a.act.type === 'move') {
                    const move = a.act.move;
                    const battleResult = BattleLogic.calculateDamage(move, attacker, target);

                    const damage = battleResult.damage;
                    const resMult = battleResult.resMult;
                    const isHit = battleResult.isHit;

                    outcomes.push({
                        type: 'move',
                        p: attackerSide,
                        attackerName: attacker.name,
                        moveName: move.name,
                        isHit: isHit,
                        damage: damage,
                        resMult: resMult,
                        targetP: targetSide,
                        targetHp: isHit ? Math.max(0, target.currentHp - damage) : target.currentHp,
                        targetFainted: isHit && (target.currentHp - damage <= 0)
                    });

                    if (isHit) {
                        // ダメージの適用
                        target.currentHp = Math.max(0, target.currentHp - damage);
                        if (target.currentHp <= 0) target.isFainted = true;

                        // 効果の適用
                        if (move.effect) {
                            const effectResult = BattleLogic.applyEffect(move.effect, attacker, target, damage);
                            if (effectResult) {
                                if (effectResult.type === 'heal') {
                                    outcomes.push({
                                        type: 'heal', p: attackerSide, attackerName: attacker.name, moveName: move.name, healAmt: effectResult.amount, currentHp: attacker.currentHp
                                    });
                                } else if (effectResult.type === 'drain') {
                                    outcomes.push({
                                        type: 'drain', p: attackerSide, attackerName: attacker.name, moveName: move.name, drainAmt: effectResult.amount, currentHp: attacker.currentHp
                                    });
                                } else if (effectResult.type === 'buff' || effectResult.type === 'debuff') {
                                    const isBuff = effectResult.type === 'buff';
                                    const targetRole = isBuff ? attackerSide : targetSide;
                                    const targetChar = isBuff ? attacker : target;

                                    if (effectResult.stat === 'def') {
                                        outcomes.push({
                                            type: 'stat_change',
                                            p: attackerSide,
                                            moveName: move.name,
                                            targetP: targetRole,
                                            stat: 'resistance',
                                            resType: move.res_type,
                                            newValue: targetChar.resistances[move.res_type],
                                            isBuff: isBuff
                                        });
                                    } else {
                                        outcomes.push({
                                            type: 'stat_change',
                                            p: attackerSide,
                                            moveName: move.name,
                                            targetP: targetRole,
                                            stat: effectResult.stat,
                                            newValue: targetChar[`battle${effectResult.stat.charAt(0).toUpperCase() + effectResult.stat.slice(1)}`],
                                            isBuff: isBuff
                                        });
                                    }
                                } else if (effectResult.type === 'flinch') {
                                    // すでに動いていない場合のみ有効（先手を取った時のみ意味がある）
                                    outcomes.push({
                                        type: 'flinch_apply',
                                        targetP: targetSide,
                                        targetName: target.name
                                    });
                                }
                            }
                        }
                    }
                } else if (a.act.type === 'switch') {
                    const prevIdx = a.p === 1 ? room.p1ActiveIdx : room.p2ActiveIdx;

                    if (a.p === 1) room.p1ActiveIdx = a.act.index;
                    else room.p2ActiveIdx = a.act.index;

                    const activeChar = a.p === 1 ? room.p1Party[room.p1ActiveIdx] : room.p2Party[room.p2ActiveIdx];
                    activeChar.isFlinching = false;

                    outcomes.push({
                        type: 'switch',
                        p: a.p,
                        index: a.act.index,
                        char: activeChar
                    });

                    // 死に出し（forced switch）の場合、相手に新しいキャラの情報を通知する必要がある
                    // 通常の交代でも同様だが、特に死に出し時はクライアント側で待機が発生するため重要
                    const opponentId = a.p === 1 ? room.p2 : room.p1;
                    io.to(opponentId).emit('forced_switch_reveal', {
                        role: a.p,
                        index: a.act.index,
                        activeChar: activeChar
                    });
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