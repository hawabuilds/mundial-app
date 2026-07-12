import styles from "./LinksPage.module.css";

const LINKS = [
  {
    href: "https://x.com/copamundialapp",
    title: "Twitter / X",
    subtitle: "Follow for match posts",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    href: "https://discord.gg/BS3q3aMFd",
    title: "Discord",
    subtitle: "Join the community",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M20.317 4.37a19.8 19.8 0 00-4.885-1.515.07.07 0 00-.074.035c-.21.375-.444.864-.608 1.25a18.3 18.3 0 00-5.487 0 12.6 12.6 0 00-.617-1.25.07.07 0 00-.074-.035A19.7 19.7 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 00.031.057 19.9 19.9 0 005.993 3.03.08.08 0 00.084-.027c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.07.07 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.07.07 0 01.078.01c.12.099.246.198.373.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.08.08 0 00.084.028 19.8 19.8 0 006.002-3.03.08.08 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
  {
    href: "https://copamundial.app",
    title: "Website",
    subtitle: "View fixtures, leaderboard & claim rewards",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.93 6h-2.95a15.7 15.7 0 00-1.38-3.56A8.03 8.03 0 0118.93 8zM12 4c.83 1.2 1.48 2.53 1.91 4h-3.82c.43-1.47 1.08-2.8 1.91-4zM4.26 14a7.96 7.96 0 010-4h3.38a16.6 16.6 0 000 4zm.81 2h2.95c.34 1.27.81 2.47 1.38 3.56A8.03 8.03 0 015.07 16zm2.95-8H5.07a8.03 8.03 0 014.33-3.56A15.7 15.7 0 008.02 8zM12 20c-.83-1.2-1.48-2.53-1.91-4h3.82c-.43 1.47-1.08 2.8-1.91 4zm2.36-6h-4.72a14.7 14.7 0 010-4h4.72a14.7 14.7 0 010 4zm.62 5.56c.57-1.09 1.04-2.29 1.38-3.56h2.95a8.03 8.03 0 01-4.33 3.56zM16.36 14a16.6 16.6 0 000-4h3.38a7.96 7.96 0 010 4z" />
      </svg>
    ),
  },
  {
    href: "https://copamundial.app/docs",
    title: "Docs",
    subtitle: "How it works & tokenomics",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm8 1.5V8h4.5L14 3.5zM8 12h8v1.6H8zm0 3.4h8V17H8zm0-6.8h4v1.6H8z" />
      </svg>
    ),
  },
] as const;

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default function LinksPage() {
  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.logo} src="/linktree-logo.png" alt="Mundial" />
        <div className={styles.name}>MUNDIAL</div>

        <div className={styles.links}>
          {LINKS.map((link) => (
            <a
              key={link.href}
              className={styles.btn}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className={styles.ico}>{link.icon}</span>
              <span className={styles.lbl}>
                <b>{link.title}</b>
                <span>{link.subtitle}</span>
              </span>
              <span className={styles.chev}>
                <Chevron />
              </span>
            </a>
          ))}
        </div>

        <div className={styles.foot}>© Mundial</div>
      </div>
    </main>
  );
}
