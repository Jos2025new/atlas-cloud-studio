export type AtlasConnectionStatus = "missing" | "checking" | "connected" | "invalid" | "limited" | "unreachable";

export type AtlasConnection = {
  status: AtlasConnectionStatus;
  balance?: number;
  currency?: string;
  message?: string;
};

export const connectionCopy: Record<AtlasConnectionStatus, { label: string; detail: string; dot: string }> = {
  missing: { label: "Not connected", detail: "Add an Atlas API key to run a request.", dot: "bg-[#e7d9c7]" },
  checking: { label: "Checking connection", detail: "Contacting Atlas through this server…", dot: "bg-[#c5b8ff] pulse-dot" },
  connected: { label: "Connected to Atlas", detail: "The key and billing access were verified.", dot: "bg-[#8ee6a0]" },
  invalid: { label: "Key rejected", detail: "Atlas did not accept this API key.", dot: "bg-red-400" },
  limited: { label: "Key accepted", detail: "Connected, but balance access is not permitted.", dot: "bg-amber-300" },
  unreachable: { label: "Atlas unreachable", detail: "This server could not reach Atlas. The key was saved but not verified.", dot: "bg-red-400" },
};
