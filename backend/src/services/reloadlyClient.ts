import axios from "axios";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/**
 * Fetches (and caches) an OAuth access token from Reloadly using the
 * client-credentials grant, scoped to the sandbox topups audience.
 * See: https://developers.reloadly.com/ — "Authentication" section.
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  const { data } = await axios.post(process.env.RELOADLY_AUTH_URL!, {
    client_id: process.env.RELOADLY_CLIENT_ID,
    client_secret: process.env.RELOADLY_CLIENT_SECRET,
    grant_type: "client_credentials",
    audience: process.env.RELOADLY_AUDIENCE,
  });

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

export async function reloadlyRequest<T = any>(method: "get" | "post", path: string, body?: any): Promise<T> {
  const token = await getAccessToken();
  const { data } = await axios.request<T>({
    method,
    url: `${process.env.RELOADLY_BASE_URL}${path}`,
    data: body,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/com.reloadly.topups-v1+json",
    },
  });
  return data;
}
