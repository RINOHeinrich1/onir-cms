import { promises as dns } from "node:dns";
import type { StandaloneDnsResolver } from "@/application/ports/standalone-dns";

export function nodeStandaloneDnsResolver(): StandaloneDnsResolver {
  return {
    async resolveTxt(name) {
      return dns.resolveTxt(name);
    },
    async resolveCname(name) {
      return dns.resolveCname(name);
    },
  };
}
