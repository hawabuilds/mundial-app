import styles from "./BrandMark.module.css";

const LOGO_SRC = "/mundial-logo.jpg";

type BrandMarkProps = {
  size?: "md" | "lg";
};

export default function BrandMark({ size = "md" }: BrandMarkProps) {
  return (
    <div className={styles.mark}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_SRC}
        alt=""
        className={size === "lg" ? styles.logoLg : styles.logo}
      />
      <span className={size === "lg" ? styles.nameLg : styles.name}>Mundial</span>
    </div>
  );
}
