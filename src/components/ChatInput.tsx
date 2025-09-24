import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Send, 
  Paperclip, 
  MapPin, 
  Calendar,
  X,
  Loader2
} from 'lucide-react';
import { Region, Year, regions, years } from '@/types';
import { sampleQueries } from '@/data/mockData';

interface ChatInputProps {
  onSendMessage: (message: string, region: Region, year: Year) => void;
  isLoading: boolean;
}

export default function ChatInput({ onSendMessage, isLoading }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<Region>('India');
  const [selectedYear, setSelectedYear] = useState<Year>('2024');
  const [showSampleQueries, setShowSampleQueries] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim(), selectedRegion, selectedYear);
      setMessage('');
      setShowSampleQueries(false);
    }
  };

  const handleSampleQuery = (query: string) => {
    setMessage(query);
    setShowSampleQueries(false);
  };

  const removeRegion = () => setSelectedRegion('India');
  const removeYear = () => setSelectedYear('2024');

  return (
    <div className="bg-white border-t border-slate-200 p-4">
      {/* Sample Queries Bar */}
      {showSampleQueries && message === '' && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-600">Try these sample queries:</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSampleQueries(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sampleQueries.slice(0, 3).map((query, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleSampleQuery(query)}
                className="text-xs text-slate-600 hover:bg-teal-50 hover:border-teal-200"
              >
                {query}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Region and Year Selectors */}
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <div className="flex items-center space-x-1">
            <MapPin className="h-4 w-4 text-slate-500" />
            <span className="text-sm text-slate-600">Region:</span>
          </div>
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value as Region)}
            className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white"
          >
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          
          <div className="flex items-center space-x-1">
            <Calendar className="h-4 w-4 text-slate-500" />
            <span className="text-sm text-slate-600">Year:</span>
          </div>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value as Year)}
            className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        
        {/* Display Selected Filters */}
        <div className="flex items-center space-x-2">
          <Badge 
            variant="secondary" 
            className="bg-teal-100 text-teal-700 hover:bg-teal-200 cursor-pointer"
            onClick={removeRegion}
          >
            <MapPin className="h-3 w-3 mr-1" />
            {selectedRegion}
            <X className="h-3 w-3 ml-1" />
          </Badge>
          <Badge 
            variant="secondary" 
            className="bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer"
            onClick={removeYear}
          >
            <Calendar className="h-3 w-3 mr-1" />
            {selectedYear}
            <X className="h-3 w-3 ml-1" />
          </Badge>
        </div>
      </div>

      {/* Input Field */}
      <form onSubmit={handleSubmit} className="flex items-end space-x-2">
        <div className="flex-1">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about any protocol, e.g. 'Checklist for dengue in Delhi, 2024'..."
            className="min-h-[60px] resize-none rounded-xl border-slate-200 focus:border-teal-300 focus:ring-teal-200"
            disabled={isLoading}
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-[60px] w-[60px] rounded-xl border-slate-200 hover:bg-slate-50"
            disabled={isLoading}
          >
            <Paperclip className="h-5 w-5 text-slate-500" />
          </Button>
          
          <Button
            type="submit"
            size="icon"
            className="h-[60px] w-[60px] rounded-xl bg-teal-600 hover:bg-teal-700"
            disabled={!message.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            ) : (
              <Send className="h-5 w-5 text-white" />
            )}
          </Button>
        </div>
      </form>

      {/* Show sample queries if input is empty */}
      {message === '' && !showSampleQueries && (
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSampleQueries(true)}
            className="text-slate-500 hover:text-slate-700"
          >
            Show sample queries
          </Button>
        </div>
      )}
    </div>
  );
}
