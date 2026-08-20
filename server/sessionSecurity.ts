import { createHash } from "crypto";

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function readCookie(header: string | undefined, name: string) {
  return header?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
