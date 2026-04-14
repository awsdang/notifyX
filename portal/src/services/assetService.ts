import type { ApiEnvelope } from "../lib/api";

function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL || "http://localhost:3000";
  return configured.endsWith("/api/v1")
    ? configured
    : `${configured.replace(/\/$/, "")}/api/v1`;
}

const API_URL = getApiBaseUrl();
const API_KEY = import.meta.env.VITE_API_KEY || "";

export interface UploadedAsset {
  id: string;
  appId: string;
  type: string;
  url: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
}

export async function uploadAppImageAsset(
  appId: string,
  file: File,
  token: string | null,
): Promise<UploadedAsset> {
  const body = new FormData();
  body.append("file", file);
  body.append("appId", appId);

  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (API_KEY) headers.set("X-API-Key", API_KEY);

  const response = await fetch(`${API_URL}/assets/upload`, {
    method: "POST",
    headers,
    body,
  });

  const json = (await response.json().catch(() => null)) as ApiEnvelope<UploadedAsset> | null;
  if (!response.ok || !json?.data) {
    throw new Error(json?.message || "Asset upload failed");
  }

  return json.data;
}
