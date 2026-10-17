// Prints a new VAPID key pair for push notifications, ready to paste as
// environment variables (in Vercel: Settings → Environment Variables).
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const { x, y, d } = privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(x, "base64url"), Buffer.from(y, "base64url")]);

console.log(`VAPID_PUBLIC_KEY=${publicKey.toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
console.log("# Optional: how push services can contact you. Defaults to the site's address.");
console.log("# VAPID_SUBJECT=mailto:you@example.com");
