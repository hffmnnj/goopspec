/**
 * Brave Search API HTTP client.
 *
 * Wraps the Brave Web Search v1 endpoint with typed request/response
 * handling. Requires `BRAVE_API_KEY` environment variable.
 */

export type BraveSearchResult = {
  title: string;
  url: string;
  description: string;
  age?: string;
};

export type BraveSearchResponse = {
  results: BraveSearchResult[];
  query: string;
};

const BRAVE_SEARCH_API = "https://api.search.brave.com/res/v1/web/search";

export async function searchBrave(
  query: string,
  options: {
    count?: number;
    country?: string;
    freshness?: string;
  } = {},
): Promise<BraveSearchResponse> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BRAVE_API_KEY environment variable is not set. " +
        "Get a free API key at https://api.search.brave.com/",
    );
  }

  const params = new URLSearchParams({
    q: query,
    count: String(options.count ?? 10),
    ...(options.country && { country: options.country }),
    ...(options.freshness && { freshness: options.freshness }),
  });

  const response = await fetch(`${BRAVE_SEARCH_API}?${params}`, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    web?: {
      results?: Array<{
        title?: string;
        url?: string;
        description?: string;
        age?: string;
      }>;
    };
    query?: { original?: string };
  };

  const results: BraveSearchResult[] = (data.web?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    description: r.description ?? "",
    age: r.age,
  }));

  return { results, query: data.query?.original ?? query };
}
