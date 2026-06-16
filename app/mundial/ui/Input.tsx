import styles from "./Input.module.css";

type InputProps = {
  label: string;
  placeholder?: string;
  value?: string;
  hint?: string;
};

export default function Input({ label, placeholder, value, hint }: InputProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        type="text"
        placeholder={placeholder}
        defaultValue={value}
        readOnly
      />
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}
