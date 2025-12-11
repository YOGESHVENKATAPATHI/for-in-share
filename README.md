# Forum Platform

A real-time forum platform with file sharing capabilities.

## Features

- Real-time messaging and file uploads
- Private and public forums
- Access request system with live updates
- Partial upload resume functionality
- WebSocket-based live updates for:
  - Forum creation/deletion
  - Access request creation and status updates
  - Member additions
  - File upload completions
  - Chat messages

## Running the Server

### Development Mode

```bash
npm run dev
```

### Production Mode (24/7)

To run the server continuously with automatic restart on crashes:

**Windows:**

```bash
start-server.bat
```

**Linux/Mac:**

```bash
while true; do npx tsx server/index.ts; echo "Server crashed, restarting in 5 seconds..."; sleep 5; done
```

### Using PM2 (Recommended for production)

```bash
npm install -g pm2
pm2 start "npx tsx server/index.ts" --name forum-server
pm2 save
pm2 startup
```

## Live Updates

The platform includes comprehensive WebSocket-based live updates:

- **Forum Events**: Creation, deletion
- **Access Management**: Request creation, approval/rejection, member additions
- **File Operations**: Upload progress, completion notifications
- **Messaging**: Real-time chat messages
- **Partial Uploads**: Resume functionality with progress tracking

All updates are broadcast to connected clients instantly, ensuring a seamless real-time experience.
