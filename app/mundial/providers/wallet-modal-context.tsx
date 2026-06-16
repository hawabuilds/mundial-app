"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type WalletModalContextValue = {
  visible: boolean;
  setVisible: (open: boolean) => void;
  open: () => void;
  close: () => void;
};

const WalletModalContext = createContext<WalletModalContextValue | null>(null);

export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  const value = useMemo(
    () => ({ visible, setVisible, open, close }),
    [visible, open, close],
  );

  return (
    <WalletModalContext.Provider value={value}>
      {children}
    </WalletModalContext.Provider>
  );
}

export function useWalletModal() {
  const ctx = useContext(WalletModalContext);
  if (!ctx) {
    throw new Error("useWalletModal must be used within WalletModalProvider");
  }
  return ctx;
}
