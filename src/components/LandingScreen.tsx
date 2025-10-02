import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Stethoscope, Shield, Search, Globe, Clock, CheckCircle, User, LogOut } from 'lucide-react';
import { sampleQueries } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';

interface LandingScreenProps {
  onStartSearch: () => void;
  onSampleQuery: (query: string) => void;
}

export default function LandingScreen({ onStartSearch, onSampleQuery }: LandingScreenProps) {
  const { currentUser, logout } = useAuth();
  
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  const features: Array<{
    icon: JSX.Element;
    title: string;
    description: string;
    badge?: string;
  }> = [
    {
      icon: <Search className="h-6 w-6 text-teal-600" />,
      title: "Hybrid Search",
      description: "Powered by Elastic + Google Cloud AI with semantic understanding for better results",
      badge: "NEW"
    },
    {
      icon: <Shield className="h-6 w-6 text-teal-600" />,
      title: "Clinically Cited",
      description: "Every protocol backed by peer-reviewed medical literature and official guidelines"
    },
    {
      icon: <Globe className="h-6 w-6 text-teal-600" />,
      title: "Global Standards",
      description: "Access protocols from WHO, NHS, CDC, and regional health authorities"
    },
    {
      icon: <Clock className="h-6 w-6 text-teal-600" />,
      title: "Always Updated",
      description: "Latest 2024 guidelines with real-time updates and version tracking"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50">
      {/* Header */}
      <header className="px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-teal-100 rounded-lg">
              <Stethoscope className="h-6 w-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">ProCheck</h1>
              <p className="text-sm text-slate-600">Protocol Synthesizer</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Badge variant="secondary" className="bg-teal-100 text-teal-700">
              Beta
            </Badge>
            {currentUser ? (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-slate-600" />
                  <span className="text-sm text-slate-700">
                    {currentUser.displayName || currentUser.email}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="text-slate-600 hover:text-slate-900"
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  Logout
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900">
                    Sign In
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white">
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="px-6 py-12">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8">
            <h2 className="text-5xl font-bold text-slate-900 mb-4">
              Instant Protocol
              <span className="text-teal-600"> Synthesizer</span>
            </h2>
            <p className="text-xl text-slate-600 mb-2">
              Clinically Cited. Globally Trusted.
            </p>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Access evidence-based medical protocols instantly. Get comprehensive, 
              cited guidelines from trusted sources like WHO, ICMR, and regional health authorities.
            </p>
          </div>

          <Button 
            size="lg" 
            className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 text-lg"
            onClick={onStartSearch}
          >
            <Search className="h-5 w-5 mr-2" />
            Start Protocol Search
          </Button>
        </div>

        {/* Sample Queries */}
        <div className="max-w-6xl mx-auto mt-16">
          <h3 className="text-2xl font-semibold text-slate-900 text-center mb-8">
            Try These Sample Queries
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sampleQueries.map((query, index) => (
              <Card 
                key={index}
                className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:border-teal-200"
                onClick={() => onSampleQuery(query)}
              >
                <CardContent className="p-4">
                  <p className="text-sm text-slate-700 font-medium">{query}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Features Grid */}
        <div className="max-w-6xl mx-auto mt-20">
          <h3 className="text-2xl font-semibold text-slate-900 text-center mb-12">
            Why Healthcare Professionals Trust ProCheck
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="text-center hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <div className="mx-auto mb-3 p-3 bg-slate-50 rounded-full w-fit">
                    {feature.icon}
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <CardTitle className="text-lg text-slate-900">{feature.title}</CardTitle>
                    {feature.badge && (
                      <Badge className="bg-gradient-to-r from-teal-500 to-teal-600 text-white text-xs">
                        {feature.badge}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-600">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-8 mt-20 bg-white border-t border-slate-200">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <CheckCircle className="h-5 w-5 text-teal-600" />
            <p className="text-sm text-slate-600">
              Professional Use Only - This tool is designed for healthcare professionals
            </p>
          </div>
          <p className="text-xs text-slate-500">
            ProCheck synthesizes publicly available medical guidelines and protocols. 
            Always verify information with official sources and clinical judgment.
          </p>
        </div>
      </footer>
    </div>
  );
}
