"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const GOAL_CELEBRATION_ROOT_ID = "goal-celebration-root";

export function useGoalCelebrationRoot(): HTMLElement | null {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setRoot(document.getElementById(GOAL_CELEBRATION_ROOT_ID));
  }, []);

  return root;
}

export function GoalCelebrationPortal({
  children,
}: {
  children: ReactNode;
}) {
  const root = useGoalCelebrationRoot();
  if (!root) return null;
  return createPortal(children, root);
}
