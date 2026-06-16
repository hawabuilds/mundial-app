import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  glow?: boolean;
  children: ReactNode;
};

export default function Card({
  glow = false,
  className = "",
  children,
  ...props
}: CardProps) {
  const cls = [styles.card, glow ? styles.glow : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} {...props}>
      {children}
    </div>
  );
}
