/**
 * Development logger utility
 * Logs are only shown in development mode (import.meta.env.DEV)
 * In production builds, all debug logs are no-ops for performance
 */

const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  },
  
  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args);
    }
  },
  
  warn: (...args: any[]) => {
    // Always show warnings
    console.warn(...args);
  },
  
  error: (...args: any[]) => {
    // Always log errors, even in production
    console.error(...args);
  },
  
  debug: (...args: any[]) => {
    if (isDev) {
      console.debug(...args);
    }
  },
  
  group: (label: string) => {
    if (isDev) {
      console.group(label);
    }
  },
  
  groupEnd: () => {
    if (isDev) {
      console.groupEnd();
    }
  }
};

// For backward compatibility, also export as default
export default logger;
