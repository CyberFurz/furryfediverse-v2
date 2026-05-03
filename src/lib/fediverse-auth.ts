import crypto from "crypto";

const AUTH_SECRET = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "dev-fediverse-secret";

export function deriveFediversePassword(input: {
  platform: string;
  instanceDomain: string;
  externalAccountId: string;
}) {
  const payload = `${input.platform}:${input.instanceDomain}:${input.externalAccountId}`;
  const digest = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
  return `ffv2-fedi-${digest}-${digest}`;
}
