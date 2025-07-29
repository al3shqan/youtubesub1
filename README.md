Project Overview: YouTube Subscription Viewer App
✅ Project Purpose
This application is designed to provide a focused and minimal YouTube viewing experience. It allows the user to sign in with their Google account and view only videos from the channels they are subscribed to. The app deliberately limits access to other parts of YouTube—such as trending videos, homepage recommendations, or general search—to reduce distractions and provide a clean, subscription-only interface.

🧠 Core Features
Google OAuth Authentication

Users sign in using their Google account.

OAuth 2.0 is used for secure access to the YouTube Data API.

Fetch Subscribed Channels

Once authenticated, the app retrieves a list of channels the user is subscribed to.

Display Latest Videos

For each subscribed channel, the app fetches and displays the most recent videos in a clean and scrollable feed.

Restrictive Navigation

The app strictly prevents navigation outside of the user's subscriptions.

No access to search, trending, or suggested content.

🔧 Technology Stack
Frontend: React (or similar modern frontend framework)

Backend (optional): Node.js / Express (if server-side handling of tokens or caching is needed)

APIs Used:

Google OAuth 2.0

YouTube Data API v3
