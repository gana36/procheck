# ProCheck - AI-Powered Medical Protocol Search & Generation Demo[https://drive.google.com/file/d/1_U9R20qm6uc9ez-LN3eoPamVUqU0SB-T/view]

> An intelligent medical protocol search and checklist generation platform powered by Elasticsearch Hybrid Search and Google Gemini AI.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)

## Features

### Hybrid Search
- **BM25 + Vector Search**: Combines keyword matching with semantic understanding using Elasticsearch's RRF (Reciprocal Rank Fusion)
- **AI Query Enhancement**: Automatically expands medical queries with relevant terminology using Gemini AI
- **Smart Citations**: Every answer includes source references with confidence scores

### Conversational AI
- **Context-Aware Chat**: Follow-up questions maintain conversation context
- **Protocol Generation**: Generate custom medical checklists from any protocol
- **Real-time Streaming**: See AI responses as they're generated

### Protocol Management
- **Save & Organize**: Bookmark important protocols and conversations
- **Upload Custom Protocols**: Index your own medical documents with automatic embedding generation
- **Version Control**: Track and manage protocol updates

### Modern UI/UX
- **Tab-Based Interface**: Work with multiple protocols simultaneously
- **Optimized Performance**: Virtualized lists for long conversations (30+ messages)
- **Message Search**: Find specific information in long chat histories (Cmd/Ctrl + F)
- **Offline Support**: Graceful degradation with network status indicators

## Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.8+
- **Elasticsearch** cluster (local or cloud)
- **Google Cloud** account with Gemini API access
- **Firebase** project for authentication and Firestore

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/procheck.git
cd procheck
```

2. **Frontend Setup**
```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your Firebase configuration

# Start development server
npm run dev
```

3. **Backend Setup**
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
# Edit .env with your Elasticsearch, Gemini, and Firebase credentials

# Start backend server
python main.py
```

4. **Access the application**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Project Structure

```
procheck/
├── src/                      # Frontend React application
│   ├── components/          # React components
│   │   ├── auth/           # Authentication components
│   │   ├── ui/             # Reusable UI components (shadcn/ui)
│   │   └── ...             # Feature components
│   ├── contexts/           # React Context providers
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility functions and API clients
│   └── types/              # TypeScript type definitions
├── backend/                 # FastAPI backend
│   ├── config/             # Configuration modules
│   ├── services/           # Business logic services
│   │   ├── elasticsearch_service.py  # Hybrid search implementation
│   │   ├── gemini_service.py         # AI integration
│   │   └── embedding_service.py      # Vector embeddings
│   ├── models/             # Pydantic models
│   ├── utils/              # Utility functions
│   └── main.py             # FastAPI application entry point
├── public/                  # Static assets
└── index.html              # HTML entry point
```

## Configuration

### Frontend Environment Variables

Create a `.env` file in the root directory:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Backend API URL
VITE_API_URL=http://localhost:8000
```

### Backend Environment Variables

See `backend/.env.example` for required configuration:
- Elasticsearch connection details
- Google Gemini API key
- Firebase/Firestore credentials
- CORS settings

## Usage

### Basic Search
1. Enter a medical query (e.g., "malaria treatment protocol")
2. Choose search scope: All Protocols, My Uploads, or Saved
3. View results with citations and confidence scores

### Generate Protocol Checklist
1. Search for a protocol
2. Click "Generate Checklist" on any result
3. Review and customize the generated checklist
4. Save for future reference

### Upload Custom Protocols
1. Click "Upload Protocol" in the sidebar
2. Select a PDF or text file
3. System automatically generates embeddings and indexes the content
4. Search and generate checklists from your uploaded protocols

### Conversational Follow-ups
1. After generating a protocol, ask follow-up questions
2. System maintains context and provides relevant answers
3. All responses include source citations

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **TailwindCSS** for styling
- **shadcn/ui** for UI components
- **React Router** for navigation
- **Firebase** for authentication
- **Lucide React** for icons

### Backend
- **FastAPI** for high-performance API
- **Elasticsearch** for hybrid search
- **Google Gemini AI** for embeddings and generation
- **Firebase Admin SDK** for Firestore
- **Pydantic** for data validation

## Performance Features

- **Optimistic Updates**: Messages appear instantly before server confirmation
- **Message Deduplication**: Prevents duplicate sends (2-second window)
- **LRU Cache**: Automatically manages conversation cache (max 20 conversations)
- **Debounced Saves**: Reduces API calls with smart batching
- **Virtual Scrolling**: Handles thousands of messages efficiently
- **Tab Persistence**: Conversations survive page refreshes

## Development

### Console Logging

The application uses Vite's esbuild configuration to automatically remove `console.log`, `console.debug`, and `console.info` statements in production builds. `console.error` and `console.warn` are preserved for production debugging.

**Development mode:** All console statements work normally
**Production build:** Only `console.error` and `console.warn` are included

Alternatively, you can use the logger utility for more control:

```typescript
import logger from '@/lib/logger';

logger.log('Debug info');    // Only in development
logger.error('Error');        // Always logged
logger.warn('Warning');       // Always logged
```

### Run Tests
```bash
# Frontend
npm run test

# Backend
cd backend
pytest
```

### Lint Code
```bash
# Frontend
npm run lint

# Backend
cd backend
pylint services/ models/ utils/
```

### Build for Production
```bash
# Frontend
npm run build

# Backend is production-ready as-is
# Use gunicorn or uvicorn for deployment
```

## Contributing

Contributions are welcome! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Elasticsearch** for powerful hybrid search capabilities
- **Google Cloud** for Gemini AI and embeddings
- **Firebase** for authentication and database services
- **shadcn/ui** for beautiful, accessible UI components

## Contact

For questions or support, please open an issue on GitHub.

## Roadmap

- [ ] Multi-language support
- [ ] Mobile app (React Native)
- [ ] Advanced analytics dashboard
- [ ] Collaborative protocol editing
- [ ] Integration with EHR systems
- [ ] Voice input support
- [ ] Offline mode with sync

---

Built for healthcare professionals
