import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function getEncryptionKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;

  if (!raw || raw.includes("replace-with")) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be set before storing tokens.");
  }

  const encoded = raw.startsWith("base64:") ? raw.slice("base64:".length) : raw;
  const key = Buffer.from(encoded, "base64");

  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  }

  return key;
}

export function encryptSecret(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(cipherText: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = cipherText.split(":");

  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Unsupported encrypted token format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function digestSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

