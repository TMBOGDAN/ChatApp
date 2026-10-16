// ======================
// server.js
// ======================

const WebSocket = require('ws');
const { Pool } = require('pg');

// ======================
// PostgreSQL Connection
// ======================

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: Number(process.env.PGPORT || 5432),
});

pool.connect()
    .then(client => {
        console.log('Connected to PostgreSQL database');
        client.release();
    })
    .catch(err => console.error('Error connecting to DB', err.stack));

// ======================
// WebSocket Server
// ======================

const sessions = new Map(); 

const getSessionKey = (a, b) => {
    return [a, b].sort().join('|');
};

const wss = new WebSocket.Server({ port: 8080 }, () => {
    console.log('WebSocket server running on ws://localhost:8080');
});

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (message) => {

        let data;

        // ======================
        // Parse JSON
        // ======================
        try {
            data = JSON.parse(message);
        } catch (err) {
            ws.send(JSON.stringify({
                type: 'error',
                success: false,
                message: 'Invalid JSON message'
            }));
            return;
        }

        // ======================
        // LOGIN
        // ======================
        if (data.type === 'login') {
            const { email, password } = data;

            try {
                const res = await pool.query(
                    'SELECT * FROM account WHERE email = $1 AND password_hash = $2',
                    [email, password]
                );

                if (res.rows.length > 0) {
                    
                    const user = res.rows[0];
                    const loginRes = {
                        type: 'login_result',
                        success: true,
                        message: 'Login successful',
                        user: {
                            
                            id: Number(user.id),
                            username: user.username,
                            email: user.email
                        }
                    };
                    ws.send(JSON.stringify(loginRes));
                } else {
                    ws.send(JSON.stringify({
                        type: 'login_result',
                        success: false,
                        message: 'Incorrect email or password'
                    }));
                }
            } catch (err) {
                console.error(err);
                ws.send(JSON.stringify({
                    type: 'login_result',
                    success: false,
                    message: 'Server error'
                }));
            }

            return;
        }

        // ======================
        // REGISTER
        // ======================
        if (data.type === 'register') {
            const { email, username, password } = data;

            try {
                const check = await pool.query(
                    'SELECT 1 FROM account WHERE email = $1 OR username = $2',
                    [email, username]
                );

                if (check.rowCount > 0) {
                    ws.send(JSON.stringify({
                        type: 'register',
                        success: false,
                        message: 'Email or username already in use'
                    }));
                    return;
                }

                await pool.query(
                    'INSERT INTO account (email, username, password_hash) VALUES ($1, $2, $3)',
                    [email, username, password]
                );

                ws.send(JSON.stringify({
                    type: 'register',
                    success: true,
                    message: 'Account created successfully'
                }));

            } catch (err) {
                console.error(err);
                ws.send(JSON.stringify({
                    type: 'register',
                    success: false,
                    message: 'Server error'
                }));
            }

            return;
        }

        // ======================
        // FRIEND REQUEST
        // ======================
        if (data.type === 'friend request') {
    const { sender_user, receiver_user } = data;

    try {
        // Get sender ID
        const senderRes = await pool.query(
            'SELECT id FROM account WHERE username = $1',
            [sender_user]
        );

        if (senderRes.rows.length === 0) {
            ws.send(JSON.stringify({
                type: 'friend request result',
                success: false,
                message: 'Sender not found!'
            }));
            return;
        }

        const receiverRes = await pool.query(
            'SELECT id FROM account WHERE username = $1',
            [receiver_user]
        );

        if (receiverRes.rows.length === 0) {
            ws.send(JSON.stringify({
                type: 'friend request result',
                success: false,
                message: 'Receiver not found!'
            }));
            return;
        }

        const requester_id = senderRes.rows[0].id;
        const receiver_id = receiverRes.rows[0].id;

        
        if (requester_id === receiver_id) {
            ws.send(JSON.stringify({
                type: 'friend request result',
                success: false,
                message: 'You cannot add yourself!'
            }));
            return;
        }

        
        const existing = await pool.query(
            `SELECT 1 FROM friendships
             WHERE (requester_id = $1 AND receiver_id = $2)
                OR (requester_id = $2 AND receiver_id = $1)`,
            [requester_id, receiver_id]
        );

        if (existing.rows.length > 0) {
            ws.send(JSON.stringify({
                type: 'friend request result',
                success: false,
                message: 'Friend request already exists!'
            }));
            return;
        }

        // Insert the request
        await pool.query(
            `INSERT INTO friendships
             (requester_id, receiver_id, status, created_at, user1accepted, user2accepted)
             VALUES ($1, $2, 'pending', NOW(), true, false)`,
            [requester_id, receiver_id]
        );

        ws.send(JSON.stringify({
            type: 'friend request result',
            success: true,
            message: 'Friend request sent!'
        }));

    } catch (err) {
        console.error(err);
        ws.send(JSON.stringify({
            type: 'friend request result',
            success: false,
            message: 'Server error'
        }));
    }

    return;
        }
        // ======================
        // get friend requests
        // ======================
        if (data.type === 'get_friend_requests') {
        const { user_id } = data;
    

    try {
        const result = await pool.query(`
            SELECT fr.requester_id, ac.username
            FROM friendships fr
            JOIN account ac ON fr.requester_id = ac.id
            WHERE fr.receiver_id = $1
            AND fr.status = 'pending'
        `, [user_id]);

        
        ws.send(JSON.stringify({
            type: 'get_friend_requests_result',
            success: true,
            friend_requests: result.rows
        }));

    } catch (err) {
        console.error(err);
    }
        }
       
        // ======================
        // RESPOND TO FRIEND REQUEST
        // ======================
        if (data.type === 'friend request response') {

    const { requester_username, responder_username, accepted } = data;

    try {

        const requesterRes = await pool.query(
            'SELECT id FROM account WHERE username = $1',
            [requester_username]
        );

        if (requesterRes.rows.length === 0) {
            ws.send(JSON.stringify({
                type: 'friend_request_response_result',
                success: false,
                message: 'Requester not found'
            }));
            return;
        }

        const responderRes = await pool.query(
            'SELECT id FROM account WHERE username = $1',
            [responder_username]
        );

        if (responderRes.rows.length === 0) {
            ws.send(JSON.stringify({
                type: 'friend_request_response_result',
                success: false,
                message: 'Responder not found'
            }));
            return;
        }

        const requesterId = requesterRes.rows[0].id;
        const responderId = responderRes.rows[0].id;

        if (accepted) {

            const result = await pool.query(
                `UPDATE friendships
                 SET status = 'accepted',
                     user1accepted = true,
                     user2accepted = true
                 WHERE requester_id = $1
                   AND receiver_id = $2
                   AND status = 'pending'`,
                [requesterId, responderId]
            );

            if (result.rowCount === 0) {
                ws.send(JSON.stringify({
                    type: 'friend_request_response_result',
                    success: false,
                    message: 'Friend request not found'
                }));
                return;
            }

            ws.send(JSON.stringify({
                type: 'friend_request_response_result',
                success: true,
                message: 'Friend request accepted'
            }));

        } else {

            const result = await pool.query(
                `DELETE FROM friendships
                 WHERE requester_id = $1
                   AND receiver_id = $2
                   AND status = 'pending'`,
                [requesterId, responderId]
            );

            if (result.rowCount === 0) {
                ws.send(JSON.stringify({
                    type: 'friend_request_response_result',
                    success: false,
                    message: 'Friend request not found'
                }));
                return;
            }

            ws.send(JSON.stringify({
                type: 'friend_request_response_result',
                success: true,
                message: 'Friend request rejected'
            }));
        }

    } catch (err) {
        console.error(err);

        ws.send(JSON.stringify({
            type: 'friend_request_response_result',
            success: false,
            message: 'Server error'
        }));
    }

    return;
        }       
        // ======================
        // get friends list
        // ======================
        if(data.type==='get_friends'){
             const { user_id } = data;
             try{
               const result1 = await pool.query(`SELECT ac.username FROM friendships fr 
                JOIN account ac ON fr.receiver_id = ac.id
                WHERE fr.requester_id = $1 AND fr.status = 'accepted'`, [user_id]);              
            const result2 = await pool.query(`SELECT ac.username FROM friendships fr 
                JOIN account ac ON fr.requester_id = ac.id
                WHERE fr.receiver_id = $1 AND fr.status = 'accepted'`, [user_id]);
            
            const friends = [
                ...result1.rows.map(row => row.username),
                ...result2.rows.map(row => row.username)
            ];
            
            ws.send(JSON.stringify({
                type: 'get_friends_result',
                success: true,
                friends: friends
            }));
             }
             catch(err){
             console.error(err);
             ws.send(JSON.stringify({
                 type: 'get_friends_result',
                 success: false,
                 message: 'Server error'
             }));
             }
        }

        // ======================
        // GET MESSAGES
        // ======================
        if (data.type === 'get_messages') {

            const myUser = data.myUser;
            const friendUser = data.friendUser;
            const key = getSessionKey(myUser, friendUser);

            
            if (sessions.has(key)) {
                const session = sessions.get(key);
                ws.send(JSON.stringify({
                    type: 'messages_list',
                    messages: session.messages
                }));
                return;
            }

       
            try {
                const result = await pool.query(
                    `SELECT sender_user, receiver_user, content, sent_at
                     FROM messages
                     WHERE 
                     (sender_user = $1 AND receiver_user = $2)
                     OR
                     (sender_user = $2 AND receiver_user = $1)
                     ORDER BY sent_at`,
                    [myUser, friendUser]
                );

                const messages = result.rows.map(row => ({
                    sender_user: row.sender_user,
                    receiver_user: row.receiver_user,
                    content: row.content,
                    sent_at: row.sent_at.toISOString ? row.sent_at.toISOString() : row.sent_at
                }));

                sessions.set(key, { messages: messages, unsaved: [] });

                ws.send(JSON.stringify({
                    type: 'messages_list',
                    messages: messages
                }));

            } catch (err) {
                console.error('Error loading messages:', err);

                ws.send(JSON.stringify({
                    type: 'messages_list',
                    messages: []
                }));
            }

            return;
        }

        // ======================
        // SAVE SESSION
        // ======================
        if (data.type === 'save_session') {
            const myUser = data.myUser;
            const friendUser = data.friendUser;
            const key = getSessionKey(myUser, friendUser);

            const session = sessions.get(key);
            if (!session || session.unsaved.length === 0) {
                ws.send(JSON.stringify({ type: 'save_session_result', success: true, message: 'No pending messages to save' }));
                return;
            }

            try {
                const insertValues = [];
                const params = [];
                let paramIndex = 1;

                for (const msg of session.unsaved) {
                    insertValues.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
                    params.push(msg.sender_user, msg.receiver_user, msg.content, msg.sent_at);
                }

                const queryText = `INSERT INTO messages(sender_user, receiver_user, content, sent_at) VALUES ${insertValues.join(',')}`;
                await pool.query(queryText, params);

                session.unsaved = [];
                sessions.set(key, session);

                ws.send(JSON.stringify({ type: 'save_session_result', success: true, message: 'Session saved' }));
            } catch (err) {
                console.error('Error saving session:', err);
                ws.send(JSON.stringify({ type: 'save_session_result', success: false, message: 'Error while saving session' }));
            }

            return;
        }

        // ======================
        // NORMAL MESSAGE 
        // ======================
        if (data.type === 'message') {

            const { sender_username, receiver_username, text } = data;
            const sent_at = new Date().toISOString();
            const key = getSessionKey(sender_username, receiver_username);

            const messageObject = {
                sender_user: sender_username,
                receiver_user: receiver_username,
                content: text,
                sent_at
            };

            const session = sessions.get(key) || { messages: [], unsaved: [] };
            session.messages.push(messageObject);
            session.unsaved.push(messageObject);
            sessions.set(key, session);

            
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'message',
                        sender_user: sender_username,
                        receiver_user: receiver_username,
                        content: text,
                        sent_at
                    }));
                }
            });

            return;
        }

    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});
