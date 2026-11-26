import { lookup } from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";

export const MAX_BYTES = 1_048_576;
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 8000;

function v4Public(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this-network, private, loopback, multicast and reserved
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, includes cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && p[2] === 0))) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  return true;
}

/** Eight 16-bit groups of an IPv6 address, or null. */
function groupsV6(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const q = tail[1].split(".").map(Number);
    if (q.some((n) => n > 255)) return null;
    text = text.slice(0, -tail[1].length) + ((q[0] << 8) | q[1]).toString(16) + ":" + ((q[2] << 8) | q[3]).toString(16);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array<string>(fill).fill("0"), ...rest].map((g) => parseInt(g, 16));
  return all.length === 8 && all.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? all : null;
}

/** True only for ordinary public internet addresses. Anything private, local, reserved or unparseable is false. */
export function isPublicAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return v4Public(ip);
  if (kind !== 6) return false;
  const g = groupsV6(ip);
  if (!g) return false;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4Public(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`); // IPv4-mapped
  if ((g[0] & 0xe000) !== 0x2000) return false; // only global unicast 2000::/3
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return false; // documentation, Teredo
  if (g[0] === 0x2002) return false; // 6to4 embeds an IPv4 address
  return true;
}

type FetchLike = (url: string, init: { signal: AbortSignal; address: string; redirect: "manual" }) => Promise<Response>;

/** GET over https, connecting to the address we already checked (so a second DNS answer cannot swap in a private one). */
const pinnedFetch: FetchLike = (url, { signal, address }) =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        host: u.hostname,
        port: 443,
        path: `${u.pathname}${u.search}`,
        method: "GET",
        headers: { "user-agent": "HostelPulseBot/1.0 (website check)", accept: "text/html,application/xhtml+xml" },
        signal,
        lookup: (_h, opts, cb) => {
          const family = net.isIP(address);
          if ((opts as { all?: boolean }).all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
          else cb(null, address, family);
        },
      },
      (res) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        const status = res.statusCode ?? 0;
        const noBody = status === 204 || status === 205 || status === 304 || (status >= 300 && status < 400);
        if (noBody) res.resume();
        resolve(new Response(noBody ? null : (Readable.toWeb(res) as unknown as ReadableStream), { status, headers }));
      },
    );
    req.on("error", reject);
    req.end();
  });

export type FetchSiteResult = { ok: true; html: string; finalUrl: string } | { ok: false; error: string };

async function readCapped(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return null;
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

function check(raw: string): URL | string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "That does not look like a web address.";
  }
  if (u.protocol !== "https:") return "Only https:// addresses can be checked.";
  if (u.username || u.password) return "Addresses with a username or password cannot be checked.";
  if (u.port) return "Only standard https addresses can be checked.";
  const host = u.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".") || /(^|\.)localhost$|\.(local|internal|lan|home|corp)$/.test(host)) {
    return "Enter your public website name, like https://yourhostel.com";
  }
  return u;
}

/**
 * Downloads a public web page safely. Public https hosts only, every address a name resolves to must be public,
 * at most 3 redirects (each checked again), 1 MB, 8 seconds. Used to read the hostel's own website.
 */
export async function fetchSite(
  url: string,
  opts: { resolve?: (host: string) => Promise<string[]>; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<FetchSiteResult> {
  const resolve = opts.resolve ?? (async (h: string) => (await lookup(h, { all: true })).map((r) => r.address));
  const doFetch = opts.fetchImpl ?? pinnedFetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    let current = url;
    for (let hops = 0; ; hops++) {
      const u = check(current);
      if (typeof u === "string") return { ok: false, error: u };

      let addresses: string[];
      try {
        addresses = await resolve(u.hostname);
      } catch {
        return { ok: false, error: "We could not find that website. Check the address." };
      }
      if (addresses.length === 0 || !addresses.every(isPublicAddress)) return { ok: false, error: "That address is not a public website." };

      const res = await doFetch(u.toString(), { signal: ctrl.signal, address: addresses[0], redirect: "manual" });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, error: "The website redirected without saying where." };
        if (hops >= MAX_REDIRECTS) return { ok: false, error: "The website redirects too many times." };
        try {
          current = new URL(loc, u).toString();
        } catch {
          return { ok: false, error: "The website redirected to an invalid address." };
        }
        continue;
      }
      if (res.status < 200 || res.status >= 300) return { ok: false, error: `The website answered with an error (${res.status}).` };
      const type = res.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/i.test(type)) return { ok: false, error: "That address is not a web page." };

      const html = await readCapped(res);
      if (html === null) return { ok: false, error: "That page is larger than 1 MB, so we did not read it." };
      return { ok: true, html, finalUrl: u.toString() };
    }
  } catch {
    return { ok: false, error: ctrl.signal.aborted ? "The website took too long to answer." : "We could not reach that website." };
  } finally {
    clearTimeout(timer);
  }
}
