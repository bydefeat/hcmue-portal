import "server-only";
import { BlockList, isIP } from "node:net";
import { env } from "@/shared/libs/env.lib";

const trustedProxies = new BlockList();
for (const entry of env.DEFEAT_TRUSTED_PROXIES) {
  const [address, prefix] = entry.split("/");
  if (!isIP(address)) continue;
  const family = isIP(address) === 6 ? "ipv6" : "ipv4";
  if (prefix === undefined) trustedProxies.addAddress(address, family);
  else trustedProxies.addSubnet(address, Number(prefix), family);
}

function isTrustedProxy(address: string) {
  return trustedProxies.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

export function clientIpFrom(headers: Headers) {
  const hops = (headers.get(env.DEFEAT_TRUSTED_IP_HEADER) ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  if (env.DEFEAT_TRUSTED_PROXIES.length === 0) return hops.length === 1 && isIP(hops[0]) ? hops[0] : null;
  for (const hop of hops.toReversed()) {
    if (!isIP(hop)) return null;
    if (!isTrustedProxy(hop)) return hop;
  }
  return null;
}
