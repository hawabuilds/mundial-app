import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "ghost" | "soft";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  fullWidth?: boolean;
  children: ReactNode;
};

export default function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const cls = [
    styles.btn,
    styles[variant],
    fullWidth ? styles.full : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={cls} {...props}>
      {children}
    </button>
  );
}
