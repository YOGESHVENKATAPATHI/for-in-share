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

## Automated Services

### Metadata Update Service

A web service that continuously updates existing video records with missing metadata (file size, MIME type, uploader info).

**Features:**

- Fetches metadata from video URLs
- Updates only null fields (preserves existing data)
- Runs continuously with keep-alive pings
- Suitable for Render deployment

**Running locally:**

```bash
npm run update-metadata
```

**Deploying to Render:**

1. Create a new Web Service
2. Set build command: `npm install`
3. Set start command: `npm run update-metadata`
4. Configure environment variables:
   - `PORT`: Port for the service (auto-assigned by Render)
   - `MAIN_SERVER_URLS`: Comma-separated URLs to ping for keep-alive (e.g., your main app URL)
   - `KEEP_ALIVE_INTERVAL_MS`: Ping interval in milliseconds (default: 30000)

**Status endpoint:** Visit the service URL to see current status and logs.

### URL Extraction Service

Extracts video URLs from websites and saves them to the database.

```bash
npm run extract-urls <starting-url>
```

## Live Updates

The platform includes comprehensive WebSocket-based live updates:

- **Forum Events**: Creation, deletion
- **Access Management**: Request creation, approval/rejection, member additions
- **File Operations**: Upload progress, completion notifications
- **Messaging**: Real-time chat messages
- **Partial Uploads**: Resume functionality with progress tracking

All updates are broadcast to connected clients instantly, ensuring a seamless real-time experience.

## Multiple Neon DBs / Extracted DB management

This project supports searching across multiple Neon (extracted) databases and can optionally read additional Neon connection strings from Airtable.

Environment variables:

- `DATABASE_URL` (optional): comma-separated connection strings (existing behaviour)
- `AIRTABLE_API_KEY`: Airtable API key to read additional Neon connectionstrings
- `AIRTABLE_BASE_ID`: Airtable base id
- `AIRTABLE_TABLE_ID`: Airtable table id for storing Neon `connectionstring` values.
- `NEON_DB_MAX_BYTES`: optional numeric DB bytes threshold. When primary DB size >= threshold, a replication attempt is triggered to the first available backup DB.
- `HARDCODED_EXTRACTED_DB`: optional fallback connection string used if not supplied elsewhere.

Notes:

- Do not commit credentials. Store sensitive keys in `.env` or secret manager.
- Replication copies missing rows from `video_mappings` by ID into a target Neon DB and will not overwrite existing rows (ON CONFLICT DO NOTHING).
- If you'd like scheduled replication or automatic management by transfer usage, the system will attempt DB-size-based replication when `NEON_DB_MAX_BYTES` is set; you can also call the endpoint `/api/neon/replicate` (POST, admin) to trigger manual replication.

### Import backup JSON to Neon

You can import a backup JSON of `video_mappings` into a selected Neon DB and make it the main extraction DB.

- CLI (picks smallest Neon DB automatically):

  - `npx tsx scripts/import-neon-backup.mjs [path/to/video_mappings.json] [target-connection-string]`
  - Example: `npx tsx scripts/import-neon-backup.mjs video_mappings.json`

- API (admin only):
  - `POST /api/neon/import-backup`
  - Request body: `{ "filePath": "/path/to/video_mappings.json", "targetConn": "<optional-conn-string>" }`
  - The import runs in the background and will persist the chosen target as the main extracted DB (written to `meta/extracted_main.json`).

Environment variables to reduce extraction DB network use:

- `NEON_EXTRACTED_ONLY_MAIN` (true/false) — if true, extracted search will query only the main extracted DB.
- `NEON_EXTRACTED_FIND_FIRST` (true/false) — if true, extracted search will stop after finding the first DB that has matches.
