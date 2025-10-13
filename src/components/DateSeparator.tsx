import { memo } from 'react';

interface DateSeparatorProps {
  label: string;
}

const DateSeparator = memo(({ label }: DateSeparatorProps) => {
  return (
    <div className="flex items-center justify-center my-6 px-4">
      <div className="flex-1 h-px bg-slate-200"></div>
      <span className="px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      <div className="flex-1 h-px bg-slate-200"></div>
    </div>
  );
});

DateSeparator.displayName = 'DateSeparator';

export default DateSeparator;
