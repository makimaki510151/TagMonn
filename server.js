const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// 静的ファイルの配信（ローカル確認用）
app.use(express.static(__dirname));

let players = {}; // socket.id -> { name, status, roomId }
let rooms = {};   // roomId -> { p1: socketId, p2: socketId, p1Ready: bool, p2Ready: bool, ... }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. ロビー入室
    socket.on('join_lobby', (name) => {
        players[socket.id] = { name: name, status: 'idle', id: socket.id };
        io.emit('update_player_list', Object.values(players));
    });

    // 2. 対戦申し込み
    socket.on('send_challenge', (targetId) => {
        if (players[targetId] && players[targetId].status === 'idle') {
            io.to(targetId).emit('receive_challenge', { fromId: socket.id, fromName: players[socket.id].name });
        }
    });

    // 3. 対戦受諾・拒否
    socket.on('respond_challenge', ({ targetId, accept }) => {
        if (accept) {
            // 部屋作成
            const roomId = `room_${Date.now()}_${Math.random()}`;
            players[socket.id].status = 'battle';
            players[targetId].status = 'battle';
            players[socket.id].roomId = roomId;
            players[targetId].roomId = roomId;

            rooms[roomId] = {
                p1: targetId, // 申し込んだ側をP1とする
                p2: socket.id, // 受けた側をP2とする
                regulation: null,
                p1Party: null,
                p2Party: null,
                p1Action: null,
                p2Action: null
            };

            // 両者に通知（P1, P2の割り当て）
            io.to(targetId).emit('match_established', { roomId, role: 1, opponentName: players[socket.id].name });
            io.to(socket.id).emit('match_established', { roomId, role: 2, opponentName: players[targetId].name });
            
            io.emit('update_player_list', Object.values(players));
        } else {
            io.to(targetId).emit('challenge_declined', { fromName: players[socket.id].name });
        }
    });

    // 4. レギュレーション設定
    socket.on('propose_regulation', ({ roomId, partySize }) => {
        const room = rooms[roomId];
        if (!room) return;
        io.to(room.p1).to(room.p2).emit('regulation_proposed', { partySize });
    });

    socket.on('accept_regulation', ({ roomId }) => {
        // 片方が同意したら即決定とする（簡易実装）
        io.to(roomId).emit('regulation_decided');
    });

    // 5. パーティ情報送信
    socket.on('submit_party', ({ roomId, partyData, role }) => {
        const room = rooms[roomId];
        if (!room) return;
        
        if (role === 1) room.p1Party = partyData;
        else room.p2Party = partyData;

        if (room.p1Party && room.p2Party) {
            // 両者揃ったらバトル開始画面へ。ただし相手の具体的な技は見せない
            io.to(room.p1).emit('battle_ready_selection', { opponentPartySize: room.p2Party.length });
            io.to(room.p2).emit('battle_ready_selection', { opponentPartySize: room.p1Party.length });
        }
    });

    // 6. 初手キャラ選択
    socket.on('submit_initial_pick', ({ roomId, role, index }) => {
        const room = rooms[roomId];
        if (!room) return;

        if (role === 1) room.p1Action = { type: 'initial', index }; // actionスロットを一時利用
        else room.p2Action = { type: 'initial', index };

        if (room.p1Action && room.p2Action) {
            // 両者選択完了。相手の情報を公開
            io.to(room.p1).emit('initial_pick_reveal', { 
                myIndex: room.p1Action.index,
                oppIndex: room.p2Action.index,
                oppParty: room.p2Party // ここで初めて相手のパーティ詳細を送る
            });
            io.to(room.p2).emit('initial_pick_reveal', { 
                myIndex: room.p2Action.index,
                oppIndex: room.p1Action.index,
                oppParty: room.p1Party 
            });
            // アクションリセット
            room.p1Action = null;
            room.p2Action = null;
        }
    });

    // 7. アクション送信
    socket.on('submit_action', ({ roomId, role, action }) => {
        const room = rooms[roomId];
        if (!room) return;

        if (role === 1) room.p1Action = action;
        else room.p2Action = action;

        // 両方のアクションが揃ったら解決指示を出す
        if (room.p1Action && room.p2Action) {
            const data = {
                p1Action: room.p1Action,
                p2Action: room.p2Action
            };
            io.to(room.p1).to(room.p2).emit('resolve_turn', data);
            
            room.p1Action = null;
            room.p2Action = null;
        }
    });

    // 8. 終了・切断
    socket.on('leave_battle', () => {
        resetPlayer(socket);
    });

    socket.on('disconnect', () => {
        resetPlayer(socket);
        console.log('User disconnected:', socket.id);
    });

    function resetPlayer(s) {
        if (players[s.id]) {
            const roomId = players[s.id].roomId;
            if (roomId && rooms[roomId]) {
                const room = rooms[roomId];
                const opponentId = room.p1 === s.id ? room.p2 : room.p1;
                io.to(opponentId).emit('opponent_left');
                if (players[opponentId]) {
                    players[opponentId].status = 'idle';
                    players[opponentId].roomId = null;
                }
                delete rooms[roomId];
            }
            delete players[s.id];
            io.emit('update_player_list', Object.values(players));
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});