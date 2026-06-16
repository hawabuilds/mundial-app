"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  sessionUserIdentity,
  signOutOfX,
} from "../lib/auth-client";
import LbAvatar from "./LbAvatar";
import SwitchXAccountModal from "./SwitchXAccountModal";
import styles from "./NavUserControl.module.css";

export default function NavUserControl() {
  const t = useTranslations("nav");
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const user = sessionUserIdentity(
    status,
    session?.user?.name,
    session?.user?.image,
    session?.user?.username,
  );

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  if (!user.signedIn) return null;

  const shortHandle = user.handle.replace(/^@/, "");
  const displayHandle =
    shortHandle.length > 10 ? `@${shortHandle.slice(0, 9)}…` : user.handle;

  return (
    <>
      <div className={styles.navUserWrap} ref={rootRef}>
        <button
          type="button"
          className={styles.navUserBtn}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t("accountMenu")}
        >
          <span className={styles.navUserAv}>
            <LbAvatar
              username={user.username}
              initials={user.initials}
              imageSrc={user.image}
              me
            />
          </span>
          <span className={styles.navUserHandle}>{displayHandle}</span>
        </button>
        {open ? (
          <div className={styles.navUserMenu} role="menu">
            <button
              type="button"
              className={styles.navUserMenuItem}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setSwitchModalOpen(true);
              }}
            >
              {t("switchXAccount")}
            </button>
            <button
              type="button"
              className={styles.navUserMenuItem}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                signOutOfX();
              }}
            >
              {t("signOutOfX")}
            </button>
          </div>
        ) : null}
      </div>

      <SwitchXAccountModal
        open={switchModalOpen}
        onClose={() => setSwitchModalOpen(false)}
        signedIn
      />
    </>
  );
}
