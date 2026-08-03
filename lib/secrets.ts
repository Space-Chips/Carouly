import crypto from "crypto";

/**
 * Social platform tokens are long-lived and let anyone post as the user, so
 * they are encrypted at rest with AES-256-GCM. The key never touches the
 * database — only APP_ENCRYPTION_KEY (32 bytes, hex or base64) in the env.
 */

const getKey = (): Buffer => {
  const raw = process.env.APP_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32"
    );
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error(
      "APP_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars)."
    );
  }

  return key;
};

export const encryptJson = (value: unknown): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);

  const payload = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);

  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    payload.toString("base64"),
  ].join(".");
};

export const decryptJson = <T>(blob: string | null): T | null => {
  if (!blob) return null;

  const [ivPart, tagPart, dataPart] = blob.split(".");
  if (!ivPart || !tagPart || !dataPart) return null;

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivPart, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));

  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plain) as T;
};

/** Shows the shape of a stored secret without revealing it. */
export const maskSecret = (value?: string | null): string => {
  if (!value) return "—";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
};
