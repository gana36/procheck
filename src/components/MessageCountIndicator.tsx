import { memo } from 'react';
import { MessageCircle } from 'lucide-react';

interface MessageCountIndicatorProps {
  count: number;
  scrollToTop?: () => void;
}

const MessageCountIndicator = memo(({ count, scrollToTop }: MessageCountIndicatorProps) => {
  if (count <= 20) return null;

  return (
    <div className="sticky top-0 z-10 bg-gradient-to-b from-slate-50 to-transparent pb-3 pt-2 px-4">
      <div className="flex items-center justify-between bg-white/80 backdrop-blur-sm rounded-lg px-4 py-2 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <MessageCircle className="w-4 h-4" />
          <span className="font-medium">{count} messages</span>
          {count > 50 && (
            <span className="text-xs text-slate-500">
              • Lazy loading enabled
            </span>
          )}
        </div>
        {scrollToTop && (
          <button
            onClick={scrollToTop}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            Jump to Top ↑
          </button>
        )}
      </div>
    </div>
  );
});

MessageCountIndicator.displayName = 'MessageCountIndicator';

export default MessageCountIndicator;
