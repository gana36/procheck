# ProCheck - Medical Protocol Search Interface

A React/TypeScript application that provides healthcare professionals with instant access to comprehensive, clinically cited medical protocols. Built with a clean, professional interface inspired by modern AI chat applications.

## 🏥 Features

- **Instant Protocol Synthesis**: Get comprehensive medical protocols in seconds
- **Clinically Cited**: Every protocol backed by peer-reviewed medical literature
- **Global Standards**: Access protocols from WHO, ICMR, CDC, and regional health authorities
- **Always Updated**: Latest 2024 guidelines with real-time updates
- **User Authentication**: Secure login with email/password and Google sign-in
- **Professional UI**: Clean, medical-themed interface with teal/blue color palette
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd procheck
```

2. Install dependencies:
```bash
npm install
```

3. Set up Firebase Authentication:
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication and configure Email/Password and Google sign-in
   - Create a `.env` file in the root directory with your Firebase config:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:5173`

## 🏗️ Project Structure

```
src/
├── components/
│   ├── auth/               # Authentication components
│   │   ├── LoginPage.tsx   # Login page with email/Google auth
│   │   ├── SignupPage.tsx  # Signup page with validation
│   │   ├── ForgotPasswordPage.tsx # Password reset page
│   │   └── ProtectedRoute.tsx # Route protection component
│   ├── ui/                 # ShadCN UI components
│   ├── LandingScreen.tsx   # Landing page with hero section
│   ├── Sidebar.tsx         # Navigation with recent searches
│   ├── ChatInput.tsx       # Input with region/year selectors
│   ├── ChatMessage.tsx     # Message display component
│   └── ProtocolCard.tsx    # Complex protocol display
├── contexts/
│   └── AuthContext.tsx     # Authentication context and provider
├── data/
│   └── mockData.ts         # Mock medical protocol data
├── types/
│   └── index.ts            # TypeScript interfaces
├── lib/
│   ├── firebase.ts         # Firebase configuration
│   └── utils.ts            # Utility functions
└── App.tsx                 # Main application component with routing
```

## 🎨 Design System

### Color Palette
- **Primary Teal**: `#0d9488`, `#14b8a6`
- **Secondary Blue**: `#1d4ed8`, `#3b82f6`
- **Neutral Slate**: `#334155`, `#64748b`, `#f1f5f9`

### Typography
- Clean, readable fonts optimized for medical content
- Proper hierarchy with headings and body text
- Accessible contrast ratios

## 🧩 Key Components

### LandingScreen
- Professional hero section with medical branding
- Sample query cards for quick access
- Feature grid explaining benefits
- Call-to-action to start searching

### Sidebar
- Recent searches with timestamps and region badges
- Saved protocol checklists
- New search button
- Profile and settings access

### ChatInput
- Region and year selectors
- Sample query suggestions
- Large, accessible input field
- Send and attach functionality

### ProtocolCard
- Comprehensive protocol display
- Numbered steps with citations
- Save/copy/download actions
- Collapsible references section
- "New in 2024" badges for updated content

## 🔧 Technical Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **React Router** for client-side routing
- **Firebase** for authentication and database
- **Tailwind CSS** for styling
- **ShadCN UI** for component library
- **Lucide React** for icons
- **Radix UI** for accessible primitives

## 📱 Responsive Design

- Mobile-first approach
- Collapsible sidebar for mobile devices
- Touch-friendly interface elements
- Optimized for various screen sizes

## 🚀 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🔐 Authentication Features

- **Email/Password Authentication**: Secure account creation and login
- **Google Sign-In**: One-click authentication with Google
- **Password Reset**: Forgot password functionality with email verification
- **Protected Routes**: Dashboard access requires authentication
- **Session Management**: Persistent login state across browser sessions
- **Error Handling**: Comprehensive error messages for auth failures

## 🔮 Future Enhancements

- Backend integration with medical databases
- LLM integration for dynamic protocol generation
- PDF export functionality
- Team collaboration features
- Real-time protocol updates
- Advanced search filters
- Protocol comparison tools
- User profile management
- Saved protocols persistence

## 🏥 Medical Disclaimer

This tool is designed for healthcare professionals and synthesizes publicly available medical guidelines and protocols. Always verify information with official sources and exercise clinical judgment when applying protocols to patient care.

## 📄 License

This project is licensed under the MIT License.

---

Built with ❤️ for healthcare professionals
