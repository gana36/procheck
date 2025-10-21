# ProCheck Setup Guide

This guide will walk you through setting up ProCheck for local development.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18.x or higher ([Download](https://nodejs.org/))
- **Python** 3.8 or higher ([Download](https://www.python.org/))
- **Git** ([Download](https://git-scm.com/))

You'll also need accounts for:
- **Firebase** ([Sign up](https://firebase.google.com/))
- **Google Cloud Platform** with Gemini API access ([Sign up](https://cloud.google.com/))
- **Elasticsearch** (Cloud or self-hosted) ([Sign up](https://www.elastic.co/cloud/))

## Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/procheck.git
cd procheck
```

## Step 2: Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable **Authentication** with Email/Password and Google providers
4. Enable **Firestore Database**
5. Enable **Storage**
6. Go to Project Settings → General → Your apps
7. Copy your Firebase configuration

## Step 3: Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Generative Language API** (Gemini)
3. Create an API key for Gemini
4. Create a service account for Firestore access
5. Download the service account JSON credentials

## Step 4: Elasticsearch Setup

### Option A: Elasticsearch Cloud (Recommended)

1. Sign up at [Elastic Cloud](https://cloud.elastic.co/)
2. Create a deployment
3. Copy your Cloud ID and API key
4. Note your Elasticsearch URL

### Option B: Local Elasticsearch

```bash
# Using Docker
docker run -d \
  --name elasticsearch \
  -p 9200:9200 \
  -p 9300:9300 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  docker.elastic.co/elasticsearch/elasticsearch:8.11.0
```

## Step 5: Frontend Configuration

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Edit `.env` with your Firebase configuration:
```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_API_URL=http://localhost:8000
```

3. Install dependencies:
```bash
npm install
```

4. Start the development server:
```bash
npm run dev
```

The frontend will be available at http://localhost:5173

## Step 6: Backend Configuration

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv

# On macOS/Linux:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Copy the environment template:
```bash
cp .env.example .env
```

5. Edit `backend/.env` with your credentials:
```env
# Elasticsearch
ELASTICSEARCH_URL=https://your-deployment.es.us-central1.gcp.cloud.es.io:443
ELASTICSEARCH_API_KEY=your_api_key_here
ELASTICSEARCH_INDEX_NAME=medical_protocols

# Gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash-exp

# Google Cloud / Firestore
GOOGLE_CLOUD_CREDENTIALS_PATH=/path/to/service-account.json

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=True

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

6. Place your Google Cloud service account JSON file in the backend directory:
```bash
# Example: backend/cred.json
# Update GOOGLE_CLOUD_CREDENTIALS_PATH in .env to match
```

7. Start the backend server:
```bash
python main.py
```

The backend API will be available at http://localhost:8000

## Step 7: Initialize Elasticsearch Index

1. Ensure the backend is running
2. Visit http://localhost:8000/docs (FastAPI Swagger UI)
3. Execute the `POST /elasticsearch/ensure-index` endpoint
4. This creates the index with proper vector field mappings

## Step 8: Index Sample Data (Optional)

To get started quickly with sample medical protocols:

```bash
cd backend
python utils/index_documents.py data/sample_protocols.json
```

## Step 9: Verify Installation

1. Open http://localhost:5173 in your browser
2. Sign up for a new account
3. Try searching for "malaria treatment"
4. Generate a protocol checklist
5. Upload a custom protocol (PDF or text)

## Troubleshooting

### Frontend Issues

**Port 5173 already in use:**
```bash
# Kill the process using the port
lsof -ti:5173 | xargs kill -9
```

**Firebase authentication errors:**
- Verify your Firebase config in `.env`
- Check that Email/Password auth is enabled in Firebase Console
- Ensure your domain is authorized in Firebase Console

### Backend Issues

**Elasticsearch connection failed:**
- Verify your Elasticsearch URL and API key
- Check that your Elasticsearch cluster is running
- Ensure network connectivity (firewall/VPN)

**Gemini API errors:**
- Verify your API key is correct
- Check that the Generative Language API is enabled
- Ensure you have sufficient quota

**Firestore permission denied:**
- Verify your service account JSON path is correct
- Check that the service account has Firestore permissions
- Ensure Firestore is enabled in your Firebase project

**Module not found errors:**
```bash
# Reinstall dependencies
rm -rf venv
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Common Issues

**CORS errors:**
- Ensure `ALLOWED_ORIGINS` in backend `.env` includes your frontend URL
- Check that both frontend and backend are running

**Slow search results:**
- First search may be slow as embeddings are generated
- Subsequent searches use cached embeddings
- Consider using a more powerful Elasticsearch deployment

## Development Tips

### Hot Reload

Both frontend and backend support hot reload:
- Frontend: Changes auto-reload in browser
- Backend: Restart required for changes (or use `uvicorn --reload`)

### API Documentation

Visit http://localhost:8000/docs for interactive API documentation

### Debugging

Frontend logs are visible in browser console (only in development mode)
Backend logs are printed to terminal

### Database Inspection

- **Firestore**: Use Firebase Console → Firestore Database
- **Elasticsearch**: Use Kibana or http://localhost:8000/elasticsearch/sample

## Next Steps

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines
- Check out the [backend README](backend/README.md) for API details
- Explore the codebase and start contributing!

## Need Help?

- Open an issue on GitHub
- Check existing issues for solutions
- Review the main [README.md](README.md)

---

Happy coding!
