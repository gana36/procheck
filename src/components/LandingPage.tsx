import { useState } from "react";
import { Search, Stethoscope, User, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { sampleQueries } from "@/data/mockData";

const SAMPLE_QUERIES = sampleQueries.slice(0, 4); // Use first 4 queries from mockData

interface LandingPageProps {
  onStartSearch?: () => void;
  onSampleQuery?: (query: string) => void;
  onShowLogoutModal?: () => void;
}

export default function LandingPage({ onStartSearch, onSampleQuery, onShowLogoutModal }: LandingPageProps) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [query, setQuery] = useState("");

  const handleSearch = () => {
    if (query.trim()) {
      // If there's a query, treat it like a sample query click
      if (onSampleQuery) {
        onSampleQuery(query.trim());
      }
      navigate('/dashboard');
    } else {
      // If no query, just navigate to dashboard
      if (onStartSearch) {
        onStartSearch();
      } else {
        navigate('/dashboard');
      }
    }
  };

  const handleQueryClick = (q: string) => {
    setQuery(q);
    if (onSampleQuery) {
      onSampleQuery(q);
    }
    navigate('/dashboard');
  };

  const handleSignIn = () => {
    navigate('/login');
  };

  const handleLogout = () => {
    if (onShowLogoutModal) {
      onShowLogoutModal();
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Minimal header */}
      <header className="px-6 py-6 mt-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-3 group"
          >
            {/* Option 1: Stethoscope icon (matching main app) */}
            <div className="p-2 bg-teal-100 rounded-lg group-hover:bg-teal-200 transition-colors">
              <Stethoscope className="h-5 w-5 text-teal-600" />
            </div>
            
            {/* Option 2: SVG Checkmark (Figma design) - currently hidden */}
            {/* <svg className="w-8 h-8 group-hover:scale-110 transition-transform" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#14b8a6"/>
              <path d="M9 16l4 4 10-10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg> */}
            
            <span className="text-xl text-slate-900 font-semibold group-hover:text-teal-600 transition-colors">
              ProCheck
            </span>
          </button>
          
          <div className="flex items-center gap-4">
            {currentUser ? (
              <>
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                  <User className="h-4 w-4 text-slate-500" />
                  <span className="text-sm text-slate-700">
                    {currentUser.displayName || currentUser.email?.split('@')[0]}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <button 
                onClick={handleSignIn}
                className="px-5 py-2 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content - centered like Google */}
      <main className="flex-1 flex items-center justify-center px-6 pb-32 pt-12">
        <div className="w-full max-w-3xl">
          {/* Logo/Title */}
          <div className="text-center mb-10">
            <h1 className="text-6xl text-slate-900 mb-4">ProCheck</h1>
            <p className="text-xl text-slate-600">
              Search medical protocols from WHO, CDC, NHS, and ICMR
            </p>
          </div>

          {/* Search bar - THE HERO */}
          <div className="mb-6">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full blur opacity-0 group-hover:opacity-10 transition-opacity" />
              <div className="relative flex items-center bg-white border-2 border-slate-200 hover:border-teal-400 focus-within:border-teal-500 rounded-full shadow-lg hover:shadow-xl transition-all px-6 py-4">
                <Search className="w-6 h-6 text-slate-400 mr-4" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search clinical protocols..."
                  className="flex-1 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent"
                />
                {query && (
                  <button 
                    onClick={handleSearch}
                    className="ml-4 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-full transition-colors flex items-center gap-2"
                  >
                    <Search className="w-4 h-4" />
                    Search
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Sample queries - like ChatGPT */}
          <div className="grid grid-cols-2 gap-3 mb-12">
            {SAMPLE_QUERIES.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleQueryClick(q)}
                className="text-left p-4 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-xl transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-white border border-slate-200 group-hover:border-teal-400 rounded-lg flex items-center justify-center">
                    <Search className="w-4 h-4 text-slate-400 group-hover:text-teal-600" />
                  </div>
                  <span className="text-slate-700 group-hover:text-slate-900 text-sm leading-relaxed">{q}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Simple stats */}
          <div className="flex items-center justify-center gap-8 text-sm text-slate-600">
            <div>protocols</div>
            <div className="w-1 h-1 bg-slate-300 rounded-full" />
            <div>sources</div>
            <div className="w-1 h-1 bg-slate-300 rounded-full" />
            <div>flash search</div>
          </div>

          {/* Medical illustration section below */}
          <div className="mt-20 pt-12 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              {/* Doctor Image */}
              <div className="flex justify-center">
                <img 
                  src="/doctor.png" 
                  alt="Healthcare professional with stethoscope" 
                  className="w-full max-w-sm h-auto"
                  onError={(e) => {
                    // Fallback to emoji if image not found
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const fallback = document.createElement('div');
                    fallback.className = 'w-full max-w-sm aspect-square bg-gradient-to-br from-teal-50 to-emerald-50 rounded-3xl flex items-center justify-center';
                    fallback.innerHTML = '<div class="text-9xl">👨‍⚕️</div>';
                    target.parentNode?.appendChild(fallback);
                  }}
                />
              </div>

              {/* Info */}
              <div>
                <h2 className="text-3xl text-slate-900 mb-4">
                  Evidence-based protocols, instantly
                </h2>
                <p className="text-slate-600 mb-6 leading-relaxed">
                  ProCheck uses hybrid AI search to synthesize medical protocols from 
                  global health authorities. Get comprehensive clinical guidelines in 10 seconds.
                </p>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-teal-500 rounded-full" />
                    <span className="text-slate-700">Step-by-step protocols with full citations</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                    <span className="text-slate-700">2024 latest guidelines from WHO, CDC, NHS, ICMR</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    <span className="text-slate-700">90x faster than manual search</span>
                  </div>
                </div>

                <button
                  onClick={handleSearch}
                  className="mt-8 px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-full transition-colors font-semibold flex items-center gap-2"
                >
                  <Search className="w-5 h-5" />
                  Start Searching
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Simple footer */}
      <footer className="py-8 px-6 border-t border-slate-200">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <div>
            Built with Elasticsearch & Google Cloud Gemini
          </div>
          <div className="flex items-center gap-6">
            <span className="text-slate-400">Professional Use Only</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
