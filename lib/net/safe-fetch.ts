/**
 * Fetching addresses that somebody else chose.
 *
 * Every page this app reads is at a URL a signed-in user typed, so the server is
 * a fetching service pointed wherever they like. Without a guard that is a
 * server-side request forgery hole, and a readable one rather than a blind one:
 * `read_site` hands 2500 characters of the response back as the tool's excerpt,
 * so it lands in the model's context, in the transcript, and in the brand kit.
 *
 * `normalizeSite` is not that guard and cannot become one. Requiring a dot in the
 * host stops `localhost` and nothing else — `127.0.0.1`, `127.1`, `10.0.0.5`,
 * `192.168.1.1`, `169.254.169.254` (the cloud metadata address), and
 * `metadata.google.internal` all satisfy it, because they all contain dots. Its
 * job is catching a typo before somebody is sent through sign-up; this one's job
 * is refusing to be used as a proxy into a private network.
 *
 * Two things have to be true, and the second is the one that is easy to miss:
 *
 *  1. The host must resolve to a public address. Checked by resolving it, not by
 *     pattern-matching the name, so `metadata.google.internal` and any other
 *     hostname pointed at private space is caught by where it actually goes.
 *  2. Every redirect hop must also resolve to a public address. `redirect:
 *     "follow"` hands the decision to the remote server, so a perfectly public
 *     domain answering `302 -> http://169.254.169.254/` walks straight through a
 *     check that only looked at what the user typed. So redirects are followed
 *     here, one at a time, with the same check applied to each.
 *
 * Residual risk, stated rather than papered over: between the resolve and the
 * connect, the name is resolved a second time by the fetch itself, so a DNS entry
 * that changes between them (rebinding) is not covered. Closing that needs the
 * socket pinned to the address we checked, which means giving up TLS SNI and
 * virtual hosting. Given the payoff here is reading a marketing page, the check
 * on every hop is the proportionate stop.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class BlockedAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedAddressError";
  }
}

/**
 * Is this IPv4 address one nobody outside the network should be able to reach?
 *
 * Written as explicit ranges rather than a cleverer numeric form because the list
 * is the point: anybody auditing this needs to see which blocks are covered, and
 * `169.254` — the one an attacker actually wants, because it is where cloud
 * providers serve instance credentials — should be findable by searching for it.
 */
const blockedV4 = (address: string) => {
  const [a, b] = address.split(".").map(Number);

  return (
    a === 0 || // 0.0.0.0/8 "this host"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64/10 carrier NAT
    (a === 169 && b === 254) || // link-local — cloud instance metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0) || // 192.0.0/24 protocol assignments, 192.0.2/24 docs
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51) || // documentation
    (a === 203 && b === 0) || // documentation
    a >= 224 // multicast and reserved, through 255.255.255.255
  );
};

const blockedV6 = (address: string) => {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");

  // An IPv4 address wearing an IPv6 coat: ::ffff:127.0.0.1 reaches loopback just
  // as well as 127.0.0.1 does, so it has to be unwrapped rather than trusted for
  // not looking like an IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped) return blockedV4(mapped[1]);

  return (
    value === "::" || // unspecified
    value === "::1" || // loopback
    /^f[cd]/.test(value) || // fc00::/7 unique local
    /^fe[89ab]/.test(value) || // fe80::/10 link-local
    /^ff/.test(value) || // multicast
    value.startsWith("2001:db8") // documentation
  );
};

const isBlocked = (address: string, family: number) =>
  family === 4 ? blockedV4(address) : blockedV6(address);

/**
 * Resolve a host and refuse it if anything it points at is private.
 *
 * Every answer is checked, not just the first: a name with both a public and a
 * private record would otherwise pass on the strength of whichever the resolver
 * happened to order first, and which one that is can change between calls.
 */
const assertPublicHost = async (hostname: string) => {
  const bare = hostname.replace(/^\[|\]$/g, "");

  // An IP literal needs no resolver, and `dns.lookup` on some platforms will
  // happily hand one back with the wrong family attached.
  const literal = isIP(bare);
  if (literal) {
    if (isBlocked(bare, literal)) {
      throw new BlockedAddressError(
        `${hostname} is a private or reserved address, so it will not be fetched.`
      );
    }
    return;
  }

  let answers: { address: string; family: number }[];
  try {
    answers = await lookup(bare, { all: true });
  } catch {
    throw new BlockedAddressError(`${hostname} does not resolve.`);
  }

  if (!answers.length) {
    throw new BlockedAddressError(`${hostname} does not resolve.`);
  }

  for (const { address, family } of answers) {
    if (isBlocked(address, family)) {
      throw new BlockedAddressError(
        `${hostname} resolves to ${address}, which is a private or reserved ` +
          `address, so it will not be fetched.`
      );
    }
  }
};

/** Only the two schemes a web page is served over. `file:` and friends are not pages. */
const assertHttp = (url: URL) => {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedAddressError(
      `${url.protocol} is not a web address, so it will not be fetched.`
    );
  }
};

/**
 * `fetch`, with every hop checked and redirects followed by hand.
 *
 * The returned response is the last one, and `response.url` is the address it
 * actually came from — callers that care where they ended up should read it from
 * there rather than assuming the URL they passed in.
 */
export const safeFetch = async (
  input: string,
  init: RequestInit & { maxRedirects?: number } = {}
): Promise<Response> => {
  const { maxRedirects = 5, ...rest } = init;

  let current = new URL(input);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    assertHttp(current);
    await assertPublicHost(current.hostname);

    const response = await fetch(current, { ...rest, redirect: "manual" });

    // 304 carries a Location-less non-2xx status in some caches; only the 3xx
    // codes that actually redirect are followed.
    const location =
      response.status >= 300 && response.status < 400
        ? response.headers.get("location")
        : null;

    if (!location) {
      // `response.url` is empty on a manual-redirect response in undici, and
      // callers use it to know the final address — so it is set from what we
      // actually requested.
      Object.defineProperty(response, "url", {
        value: current.href,
        configurable: true,
      });
      return response;
    }

    current = new URL(location, current);
  }

  throw new BlockedAddressError(
    `${input} redirected more than ${maxRedirects} times.`
  );
};
