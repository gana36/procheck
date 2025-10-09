import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ProtocolTab {
  id: string;
  title: string;
  isActive: boolean;
}

interface ProtocolTabsProps {
  tabs: ProtocolTab[];
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
}

export default function ProtocolTabs({ tabs, onTabClick, onTabClose, onNewTab }: ProtocolTabsProps) {
  return (
    <div className="flex items-center bg-slate-50 border-b border-slate-200 px-4 py-2 overflow-x-auto">
      <div className="flex items-center space-x-1 min-w-0 flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`
              flex items-center space-x-2 px-3 py-2 rounded-t-lg border-b-2 cursor-pointer
              transition-all duration-200 min-w-0 max-w-xs group
              ${tab.isActive 
                ? 'bg-white border-teal-500 text-teal-700 shadow-sm' 
                : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'
              }
            `}
            onClick={() => onTabClick(tab.id)}
          >
            <span className="text-sm font-medium truncate flex-1 min-w-0">
              {tab.title}
            </span>
            {tabs.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className={`
                  h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity
                  ${tab.isActive ? 'hover:bg-teal-100' : 'hover:bg-slate-300'}
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
      
      {/* New Tab Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onNewTab}
        className="ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 flex-shrink-0"
      >
        <span className="text-lg font-light">+</span>
      </Button>
    </div>
  );
}
