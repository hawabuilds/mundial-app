"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  sessionUserIdentity,
  signInWithXAfterSwitch,
} from "@/app/lib/auth-client";
import { mundialHomePath } from "../lib/mundial-path";
import styles from "./ProfileMenu.module.css";

export default function ProfileMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const user = sessionUserIdentity(
    status,
    session?.user?.name,
    session?.user?.image,
    session?.user?.username,
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  const initials = user.initials;
  const image = user.image;

  return (
    <div className={styles.wrap} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <span className={styles.avatarInitials}>…</span>
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className={styles.avatarImg} />
        ) : (
          <span className={styles.avatarInitials}>{initials}</span>
        )}
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          <p className={styles.handle}>{user.handle}</p>
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signInWithXAfterSwitch(mundialHomePath());
            }}
          >
            Switch account
          </button>
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut({ callbackUrl: mundialHomePath() });
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
