const COPA_APEX = "copamundial.app";

export function isCopaMundialHost(host?: string): boolean {
  const h = (host ?? (typeof window !== "undefined" ? window.location.hostname : ""))
    .split(":")[0]!
    .toLowerCase();
  return h === COPA_APEX;
}

/** App home path — `/` on copamundial.app, `/mundial` elsewhere. */
export function mundialHomePath(): string {
  return isCopaMundialHost() ? "/" : "/mundial";
}

/** Docs — `/docs` on copamundial.app, `/mundial/docs` elsewhere. */
export function mundialDocsPath(): string {
  return isCopaMundialHost() ? "/docs" : "/mundial/docs";
}
