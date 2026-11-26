import { describe, expect, it } from "vitest";

import { fetchSite, isPublicAddress } from "./fetch-site";

describe("isPublicAddress", () => {
  it("rejects private, loopback, link-local and reserved addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "not an ip"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
  it("accepts ordinary public addresses", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:2800:220:1:248:1893:25c8:1946"]) expect(isPublicAddress(ip), ip).toBe(true);
  });
});

const html = (body = "<html><title>Hi</title></html>", init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
const publicResolve = async () => ["93.184.216.34"];

describe("fetchSite", () => {
  it("fetches a public https page and returns its html and final url", async () => {
    const r = await fetchSite("https://example.com/", { resolve: publicResolve, fetchImpl: async () => html() });
    expect(r).toEqual({ ok: true, html: "<html><title>Hi</title></html>", finalUrl: "https://example.com/" });
  });

  it("refuses http, other ports, credentials, and local names without any request", async () => {
    let calls = 0;
    const fetchImpl = async () => (calls++, html());
    for (const u of ["http://example.com/", "https://localhost/", "https://example.com:8443/", "https://user:pw@example.com/", "https://127.0.0.1/", "https://[::1]/", "ftp://example.com", "nonsense"]) {
      const r = await fetchSite(u, { resolve: publicResolve, fetchImpl });
      expect(r.ok, u).toBe(false);
    }
    expect(calls).toBe(0);
  });

  it("refuses a host that resolves to a private address, even if another answer is public", async () => {
    let calls = 0;
    const r = await fetchSite("https://sneaky.example/", { resolve: async () => ["93.184.216.34", "10.0.0.5"], fetchImpl: async () => (calls++, html()) });
    expect(r.ok).toBe(false);
    expect(calls).toBe(0);
  });

  it("refuses a redirect to a private host", async () => {
    const resolve = async (h: string) => (h === "internal.example" ? ["10.0.0.1"] : ["93.184.216.34"]);
    const fetchImpl = async () => new Response(null, { status: 302, headers: { location: "https://internal.example/admin" } });
    const r = await fetchSite("https://example.com/", { resolve, fetchImpl });
    expect(r.ok).toBe(false);
  });

  it("follows up to 3 redirects, and refuses a fourth", async () => {
    let hop = 0;
    const fetchImpl = async () => (hop++ < 3 ? new Response(null, { status: 301, headers: { location: `https://example.com/${hop}` } }) : html());
    expect((await fetchSite("https://example.com/", { resolve: publicResolve, fetchImpl })).ok).toBe(true);
    hop = -1;
    expect((await fetchSite("https://example.com/", { resolve: publicResolve, fetchImpl })).ok).toBe(false);
  });

  it("refuses a redirect that downgrades to http", async () => {
    const fetchImpl = async () => new Response(null, { status: 302, headers: { location: "http://example.com/" } });
    expect((await fetchSite("https://example.com/", { resolve: publicResolve, fetchImpl })).ok).toBe(false);
  });

  it("refuses a body over 1 MB, whether declared or streamed", async () => {
    const big = "x".repeat(1_048_577);
    expect((await fetchSite("https://example.com/", { resolve: publicResolve, fetchImpl: async () => html(big) })).ok).toBe(false);
    const streamed = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } }), { status: 200, headers: { "content-type": "text/html" } });
    expect((await fetchSite("https://example.com/", { resolve: publicResolve, fetchImpl: async () => streamed })).ok).toBe(false);
  });

  it("gives up when the site is too slow", async () => {
    const fetchImpl = (_u: string, init?: { signal?: AbortSignal }) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const r = await fetchSite("https://example.com/", { resolve: publicResolve, fetchImpl, timeoutMs: 30 });
    expect(r).toMatchObject({ ok: false });
  });

  it("refuses pages that are not html, and error statuses", async () => {
    expect((await fetchSite("https://example.com/", { resolve: publicResolve, fetchImpl: async () => new Response("{}", { headers: { "content-type": "application/json" } }) })).ok).toBe(false);
    expect((await fetchSite("https://example.com/", { resolve: publicResolve, fetchImpl: async () => html("nope", { status: 404 }) })).ok).toBe(false);
  });

  it("explains a name that does not resolve", async () => {
    const r = await fetchSite("https://nope.example/", { resolve: async () => { throw new Error("ENOTFOUND"); }, fetchImpl: async () => html() });
    expect(r).toMatchObject({ ok: false });
  });
});
