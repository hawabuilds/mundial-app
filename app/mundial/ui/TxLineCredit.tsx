import styles from "./TxLineCredit.module.css";

const TXLINE_DOCS = "https://txline.txodds.com/documentation/worldcup";

export default function TxLineCredit() {
  return (
    <a
      href={TXLINE_DOCS}
      className={styles.credit}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className={styles.mark} aria-hidden>
        Tx
      </span>
      <span>
        Powered by <strong>TxLINE</strong>
      </span>
    </a>
  );
}

export { TXLINE_DOCS };
