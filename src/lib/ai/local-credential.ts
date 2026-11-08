type Environment = Record<string, string | undefined>;

function isLoopback(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol)
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

// Import is an explicit, authenticated action. Environment keys never act as a
// shared fallback for arbitrary users, previews or a remote Supabase project.
export function canImportLocalOpenAIKey(env: Environment, requestUrl: string) {
  return env.NODE_ENV === "development"
    && !env.VERCEL
    && !!env.OPENAI_API_KEY
    && isLoopback(env.SUPABASE_URL)
    && isLoopback(requestUrl);
}
