# InsightSnap Backend API

A robust Node.js backend API for social media research and content analysis.

## Quick Start

1. **Clone this repository**
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Set up environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your API keys
   ```
4. **Start the server:**
   ```bash
   npm run dev
   ```

## Environment Variables

Create a `.env` file with:

```env
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://insightsnap.co
X_BEARER_TOKEN=your_x_bearer_token_here
PERPLEXITY_API_KEY=your_perplexity_api_key_here
```

## API Endpoints

- `POST /api/search` - Main search endpoint
- `GET /health` - Health check
- `GET /api/reddit/health` - Reddit service status
- `GET /api/x/health` - X service status

## Deployment

This backend is designed to be deployed on Railway, Heroku, or similar platforms.

### Railway Deployment

1. Connect this repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically

### Environment Variables for Production

Set these in your deployment platform:

- `X_BEARER_TOKEN` - Your X API Bearer Token
- `PERPLEXITY_API_KEY` - Your Perplexity AI API Key
- `FRONTEND_URL` - Your frontend URL (https://insightsnap.co)

## Features

- Multi-platform search (Reddit, X)
- AI-powered content categorization
- Rate limiting and security
- Comprehensive error handling
- Detailed logging

## License

MIT