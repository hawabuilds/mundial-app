import assert from "node:assert/strict";
import {
  hasInjectedSolanaWallet,
  isInAppBrowser,
  isWalletInAppBrowser,
  walletConnectionBlocked,
} from "./mobile-browser";

const iosTwitter =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 Twitter for iPhone";

const iosPhantom =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 Phantom";

const iosWebkitNoSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329";

assert.equal(isInAppBrowser(iosTwitter), true);
assert.equal(isWalletInAppBrowser(iosPhantom), true);
assert.equal(isInAppBrowser(iosPhantom), false);
assert.equal(walletConnectionBlocked(iosPhantom), false);

assert.equal(isInAppBrowser(iosWebkitNoSafari), true);
assert.equal(
  walletConnectionBlocked(iosWebkitNoSafari, {
    phantom: { solana: { isPhantom: true } },
  } as Window),
  false,
);

assert.equal(
  hasInjectedSolanaWallet({
    phantom: { solana: {} },
  } as Window),
  true,
);

console.log("mobile-browser.test.ts: ok");
