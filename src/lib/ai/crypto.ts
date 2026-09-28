import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(secret: string): Buffer {
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32 || key.toString("base64") !== secret) {
    throw new Error("Gemini 키 암호화 설정을 확인해주세요");
  }
  return key;
}

export function encryptApiKey(
  value: string,
  userId: string,
  secret: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(`gemini:v1:${userId}`));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptApiKey(
  value: string,
  userId: string,
  secret: string,
): string {
  const [version, iv, tag, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra !== undefined)
    throw new Error("Invalid encrypted key");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    Buffer.from(iv, "base64"),
  );
  decipher.setAAD(Buffer.from(`gemini:v1:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
