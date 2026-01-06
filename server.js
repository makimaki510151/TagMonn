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

        // 双方が必要な入力を終えたかチェック
        if (room.p1Action && room.p2Action) {
            const outcomes = [];

            if (p1NeedsSwitch || p2NeedsSwitch) {
                // 死に出し解決フェーズ
                if (p1NeedsSwitch && room.p1Action.type === 'switch') {
                    room.p1ActiveIdx = room.p1Action.index;
                }
                if (p2NeedsSwitch && room.p2Action.type === 'switch') {
                    room.p2ActiveIdx = room.p2Action.index;
                }

                const c1 = room.p1Party[room.p1ActiveIdx];
                const c2 = room.p2Party[room.p2ActiveIdx];

                outcomes.push({
                    type: 'switch_sync',
                    p1Idx: room.p1ActiveIdx, p1Char: { name: c1.name, baseStats: c1.baseStats, resistances: c1.resistances, currentHp: c1.currentHp, maxHp: c1.maxHp },
                    p2Idx: room.p2ActiveIdx, p2Char: { name: c2.name, baseStats: c2.baseStats, resistances: c2.resistances, currentHp: c2.currentHp, maxHp: c2.maxHp }
                });
            } else {
                // 通常ターン解決フェーズ
                let acts = [
                    { p: 1, act: room.p1Action, char: p1Active },
                    { p: 2, act: room.p2Action, char: p2Active }
                ];

                acts.sort((a, b) => {
                    const priA = (a.act.type === 'switch' ? 1000 : (a.act.move?.priority || 0) * 100) + a.char.battleSpd;
                    const priB = (b.act.type === 'switch' ? 1000 : (b.act.move?.priority || 0) * 100) + b.char.battleSpd;
                    return priB - priA;
                });

                for (let a of acts) {
                    if (a.char.isFainted) continue;

                    if (a.act.type === 'switch') {
                        if (a.p === 1) room.p1ActiveIdx = a.act.index;
                        else room.p2ActiveIdx = a.act.index;
                        const nC = (a.p === 1 ? room.p1Party : room.p2Party)[a.act.index];
                        outcomes.push({
                            type: 'switch', p: a.p, index: a.act.index,
                            charDetails: { name: nC.name, baseStats: nC.baseStats, resistances: nC.resistances, currentHp: nC.currentHp, maxHp: nC.maxHp }
                        });
                    } else {
                        const targetSide = a.p === 1 ? 2 : 1;
                        const target = (targetSide === 1 ? room.p1Party : room.p2Party)[targetSide === 1 ? room.p1ActiveIdx : room.p2ActiveIdx];
                        const move = a.act.move;
                        const resMult = target.resistances[move.res_type] || 1.0;
                        const damage = Math.floor(move.power * (a.char.battleAtk / 80) * resMult);

                        target.currentHp = Math.max(0, target.currentHp - damage);
                        if (target.currentHp <= 0) target.isFainted = true;

                        outcomes.push({
                            type: 'move', p: a.p, moveName: move.name, damage, resMult,
                            targetP: targetSide, targetHp: target.currentHp, targetFainted: target.isFainted
                        });
                        if (target.isFainted) break;
                    }
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