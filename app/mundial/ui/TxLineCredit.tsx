import styles from "./TxLineCredit.module.css";

const TXLINE_DOCS = "https://txline.txodds.com/documentation/worldcup";

type TxLineCreditProps = {
  /** Compact row inside the fixed app bottom dock. */
  variant?: "dock" | "footer";
};

export default function TxLineCredit({ variant = "footer" }: TxLineCreditProps) {
  return (
    <a
      href={TXLINE_DOCS}
      className={variant === "dock" ? styles.creditDock : styles.creditFooter}
      target="_blank"
      rel="noopener noreferrer"
    >
      Powered by <strong>TxLINE</strong>
    </a>
  );
}

export { TXLINE_DOCS };
