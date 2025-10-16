import { X, XCircle } from 'lucide-react';
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
  onCloseAll?: () => void;
}

export default function ProtocolTabs({ tabs, onTabClick, onTabClose, onNewTab, onCloseAll }: ProtocolTabsProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'center' }} className="bg-slate-50 border-b border-slate-200 px-4 py-2">
      <div 
        style={{ 
          overflow: 'auto hidden', 
          display: 'flex', 
          gap: '0.25rem', 
          alignItems: 'center',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        className="[&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`
              flex items-center space-x-2 px-3 py-2 rounded-t-lg border-b-2 cursor-pointer
              transition-all duration-150 group
              ${tab.isActive 
                ? 'bg-white border-teal-500 text-teal-700 shadow-sm' 
                : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'
              }
            `}
            style={{ flexShrink: 0, maxWidth: '300px', whiteSpace: 'nowrap' }}
            onClick={() => onTabClick(tab.id)}
          >
            <span className="text-sm font-medium truncate" style={{ maxWidth: '200px' }}>
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
      
      {/* Fixed action buttons */}
      <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
        {/* Close All Tabs Button - only show if more than 1 tab */}
        {tabs.length > 1 && onCloseAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCloseAll}
            className="text-slate-500 hover:text-red-600 hover:bg-red-50 text-xs"
            title="Close all tabs"
          >
            <XCircle className="h-4 w-4 mr-1" />
            Close All
          </Button>
        )}
        
        {/* New Tab Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewTab}
          className="text-slate-500 hover:text-slate-700 hover:bg-slate-200"
        >
          <span className="text-lg font-light">+</span>
        </Button>
      </div>
    </div>
  );
}
