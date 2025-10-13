/**
 * Date utilities for chat message grouping and formatting
 */

export function formatMessageDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  // Reset hours for date comparison
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

  if (dateOnly.getTime() === todayOnly.getTime()) {
    return 'Today';
  } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
    return 'Yesterday';
  } else if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
    // Within the last week
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } else if (date.getFullYear() === now.getFullYear()) {
    // Same year
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  } else {
    // Different year
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
}

export function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function isSameDay(timestamp1: string, timestamp2: string): boolean {
  const date1 = new Date(timestamp1);
  const date2 = new Date(timestamp2);

  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

export interface DateGroup {
  date: string;
  label: string;
  messageIndices: number[];
}

export function groupMessagesByDate<T extends { timestamp: string }>(messages: T[]): DateGroup[] {
  const groups: DateGroup[] = [];
  const groupMap = new Map<string, number[]>();

  messages.forEach((message, index) => {
    const dateLabel = formatMessageDate(message.timestamp);
    
    if (!groupMap.has(dateLabel)) {
      groupMap.set(dateLabel, []);
    }
    groupMap.get(dateLabel)!.push(index);
  });

  groupMap.forEach((indices, label) => {
    groups.push({
      date: messages[indices[0]].timestamp,
      label,
      messageIndices: indices,
    });
  });

  return groups;
}
