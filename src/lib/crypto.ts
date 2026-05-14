import crypto from "crypto";

function getKey() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is required");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

export function encryptText(plainText: string) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptText(payload: string) {
  const [ivRaw, tagRaw, dataRaw] = payload.split(".");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataRaw, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function maskSecret(value: string, keep = 2) {
  if (!value) return "";
  if (value.length <= keep * 2) return "*".repeat(value.length);
  return `${value.slice(0, keep)}${"*".repeat(Math.max(4, value.length - keep * 2))}${value.slice(-keep)}`;
}

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return maskSecret(email);
  const maskedName =
    name.length <= 2
      ? `${name.slice(0, 1)}*`
      : `${name.slice(0, 1)}${"*".repeat(Math.max(2, name.length - 2))}${name.slice(-1)}`;
  return `${maskedName}@${domain}`;
}
