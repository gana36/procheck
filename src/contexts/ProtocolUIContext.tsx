import { createContext, useContext, useRef, useCallback, ReactNode, useState } from 'react';

interface ProtocolUIState {
  expandedSteps: Set<number>;
  activeThreads: Map<string, number>; // protocolId -> stepId
}

interface ProtocolUIContextType {
  getExpandedSteps: (protocolId: string) => Set<number>;
  setExpandedSteps: (protocolId: string, steps: Set<number>) => void;
  getActiveThread: (protocolId: string) => number | null;
  setActiveThread: (protocolId: string, stepId: number | null) => void;
}

const ProtocolUIContext = createContext<ProtocolUIContextType | undefined>(undefined);

export function ProtocolUIProvider({ children }: { children: ReactNode }) {
  // Use ref to avoid re-renders on state updates
  const stateRef = useRef<Map<string, ProtocolUIState>>(new Map());
  const [,] = useState({});

  const getProtocolState = useCallback((protocolId: string): ProtocolUIState => {
    if (!stateRef.current.has(protocolId)) {
      return {
        expandedSteps: new Set<number>(),
        activeThreads: new Map<string, number>(),
      };
    }
    return stateRef.current.get(protocolId)!;
  }, []);

  const getExpandedSteps = useCallback((protocolId: string): Set<number> => {
    return getProtocolState(protocolId).expandedSteps;
  }, [getProtocolState]);

  const setExpandedSteps = useCallback((protocolId: string, steps: Set<number>) => {
    const protocolState = getProtocolState(protocolId);
    stateRef.current.set(protocolId, {
      ...protocolState,
      expandedSteps: steps,
    });
    // Force a minimal re-render only if needed
  }, [getProtocolState]);

  const getActiveThread = useCallback((protocolId: string): number | null => {
    return getProtocolState(protocolId).activeThreads.get(protocolId) ?? null;
  }, [getProtocolState]);

  const setActiveThread = useCallback((protocolId: string, stepId: number | null) => {
    const protocolState = getProtocolState(protocolId);
    const activeThreads = new Map(protocolState.activeThreads);
    
    if (stepId === null) {
      activeThreads.delete(protocolId);
    } else {
      activeThreads.set(protocolId, stepId);
    }
    
    stateRef.current.set(protocolId, {
      ...protocolState,
      activeThreads,
    });
    // Force a minimal re-render only if needed
  }, [getProtocolState]);

  return (
    <ProtocolUIContext.Provider
      value={{
        getExpandedSteps,
        setExpandedSteps,
        getActiveThread,
        setActiveThread,
      }}
    >
      {children}
    </ProtocolUIContext.Provider>
  );
}

export function useProtocolUI() {
  const context = useContext(ProtocolUIContext);
  if (!context) {
    throw new Error('useProtocolUI must be used within ProtocolUIProvider');
  }
  return context;
}

