# ChatApp

A learning project for desktop messaging: a C++17 / Qt 6 client communicates with a Node.js WebSocket server backed by PostgreSQL. It demonstrates a client–server UI, JSON messages, friend requests, and conversation history. It is not ready for production use.

## Features

- Register and sign in with an email and password.
- Search for users, send and respond to friend requests, and list friends.
- Exchange messages through a WebSocket connection and load conversation history.
- Save pending conversation messages to PostgreSQL with `save_session`.

## Tech stack and structure

- `ChatApp/`: Qt Widgets desktop client, with `src/`, `headers/`, and Qt Designer `ui/` forms. `ChatApp/CMakeLists.txt` requires Qt 6 Core, Widgets, and WebSockets.
- `AppServer/server.js`: Node.js server using `ws` and `pg`; listens on `ws://localhost:8080`.
- `AppServer/schema.sql`: PostgreSQL tables for accounts, friendships, and messages, derived from the current server queries.
- `AppServer/package.json` and `package-lock.json`: server dependencies.

## Local setup

1. Install PostgreSQL, Node.js, CMake 3.16+, a C++17 compiler, and Qt 6 with Core, Widgets, and WebSockets.
2. Create an empty PostgreSQL database, then apply `AppServer/schema.sql` with `psql -d YOUR_DATABASE -f AppServer/schema.sql`. The script creates tables and indexes; it does not create an account or a database.
3. Set `PGUSER`, `PGPASSWORD`, and `PGDATABASE` in the server process environment. `PGHOST` defaults to `localhost` and `PGPORT` to `5432`. Do not commit a real `.env` file.
4. In `AppServer/`, run `npm ci` and `node server.js`.
5. Open `ChatApp/CMakeLists.txt` in Qt Creator with a compatible Qt kit, build, and run. Alternatively, run `cmake -S ChatApp -B ChatApp/build` followed by `cmake --build ChatApp/build`. Start the server before signing in.

## WebSocket protocol

The server accepts JSON messages with a `type` property. Implemented types include `register`, `login`, `friend request`, `get_friend_requests`, `friend request response`, `get_friends`, `message`, `get_messages`, and `save_session`. See `AppServer/server.js` for each payload and response; this is a WebSocket protocol, not an HTTP REST API.

## Security and limitations

**Do not use real passwords or expose the server to the internet.** The current registration code puts raw passwords into a database column named `password_hash`, and login compares raw values. The column name does not mean passwords are hashed. Fix registration and verification with a suitable password hashing algorithm and migrate or reset existing accounts before real use. The server also accepts claimed user names/IDs in several messages without session based authorization.

No automated tests or deployment configuration are included. The PostgreSQL schema is based on the current server queries and should be validated against the desired production data model before deployment. Generated Qt `build/` files and server `node_modules/` were removed from the tracked tree; `.gitignore` keeps new copies local. Earlier Git commits still contain generated files.

## Next steps

Add password hashing and authenticated WebSocket sessions, validate message payloads and access to conversations, then add server and client tests.
