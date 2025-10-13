import { FileText } from 'lucide-react';

export default function TypingIndicator() {
  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-[95%] w-full">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 mt-1">
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center shadow-sm">
              <FileText className="h-5 w-5 text-slate-700" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-2">
              <h4 className="font-semibold text-slate-900">ProCheck AI</h4>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center space-x-2">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className="text-sm text-slate-600">Analyzing your query...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
