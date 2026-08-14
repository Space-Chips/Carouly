/**
 * Copying a run's output into our own bucket.
 *
 * A fal result URL is a receipt, not a home: the provider expires them, and a
 * library entry that points at one is a thumbnail that works today and 404s next
 * month. So anything worth keeping — an actor's master frame, a finished cut — is
 * pulled down once and re-uploaded to the public asset bucket, and the library
 * stores that durable copy.
 *
 * Two classes of URL are left exactly as they are, because there is nothing
 * durable to make of them: dry-run placeholders (fake by construction) and
 * local render-server URLs (127.0.0.1, unreachable from anywhere but the machine
 * that made them). For those, rehosting returns the original untouched — the
 * caller still gets a value, it just is not a promise the file will outlive the
 * session.
 */

import { safeFetch } from "@/lib/net/safe-fetch";
import type { StorageState } from "@/lib/assets/types";
import { uploadAsset } from "@/lib/supabase";

const isDurable = (url: string) =>
  /^https?:\/\//.test(url) &&
  !url.startsWith("https://dry-run.local/") &&
  !/localhost|127\.0\.0\.1/.test(url);

const extension = (url: string, contentType: string) => {
  const fromType = contentType.split("/")[1]?.split(";")[0];
  if (fromType) return fromType === "jpeg" ? "jpg" : fromType;
  const fromUrl = url.split("?")[0].split(".").pop();
  return fromUrl && fromUrl.length <= 4 ? fromUrl : "bin";
};

/**
 * Fetch `url` and store it under `library/<userId>/<prefix>-<name>.<ext>`.
 *
 * Returns the copy *and what kind of copy it is*, which is the part that
 * matters: a failed rehost still yields a working URL today, so returning only
 * the string would quietly hand back something that 404s in a month with nothing
 * to distinguish it from a durable copy. The caller stores the state alongside
 * the URL and the UI says so.
 */
export const rehost = async (
  url: string | undefined,
  {
    userId,
    prefix,
    name,
  }: { userId: string; prefix: string; name: string }
): Promise<{ url?: string; storage: StorageState }> => {
  if (!url) return { url, storage: "placeholder" };
  if (!isDurable(url)) return { url, storage: "placeholder" };

  try {
    /**
     * `safeFetch`, because not every URL reaching here is a provider's.
     *
     * A finished cut comes back from fal or the local renderer, but a *brand
     * image* is whatever the captured page's markup pointed at — so an
     * `<img src="http://10.0.0.5/secret">` on a site somebody asked us to read
     * arrives here as an asset worth keeping. That makes this the worst of the
     * fetches to leave open: the bytes are not merely read into a transcript,
     * they are uploaded to the *public* asset bucket, which turns a request
     * forgery into an exfiltration route with a shareable URL on the end of it.
     *
     * `isDurable` above is not the guard — its `localhost|127.0.0.1` test is
     * there to skip local render output, and it matches neither `10.0.0.5` nor
     * `169.254.169.254` nor `127.1`.
     *
     * A refusal throws, which the catch below already turns into `remote`: the
     * entry keeps its original URL and is honestly marked as not durable, rather
     * than failing the run.
     */
    const response = await safeFetch(url);
    if (!response.ok) return { url, storage: "remote" };

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const bytes = new Uint8Array(await response.arrayBuffer());
    const path = `library/${userId}/${prefix}-${name}.${extension(url, contentType)}`;

    return { url: await uploadAsset(path, bytes, contentType), storage: "durable" };
  } catch {
    // A library entry pointing at a live-but-expiring URL beats no entry — but
    // it is recorded as `remote` so it can be retried and shown honestly.
    return { url, storage: "remote" };
  }
};

/** A filesystem-safe token for a rehosted filename. */
export const slugToken = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
