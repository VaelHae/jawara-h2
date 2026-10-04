# Attendance Discord Fix V2

Fixes automatic Attendance recap delivery to Discord.

- Attendance recap events now carry the configured Attendance Channel ID.
- Bot uses the event channel first, then Settings as fallback.
- Bot no longer acknowledges (`ack`) a recap event when the Attendance Channel ID is missing or the channel cannot be fetched.
- Missing/invalid channel configuration stays in the event queue and is retried on the next poll instead of being silently lost.
- Player online/offline logging remains on the Player Log Channel.
- Attendance recap remains on the Attendance Channel.

## Run

npm install
npm run dev:api
npm run dev:bot
npm run dev:web

Set the Attendance Channel ID in Dashboard -> Settings -> Discord Bot Integration.
