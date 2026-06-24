// The offline fallback must be a precacheable static document so the service
// worker can serve it when a navigation request fails with no network.
export const prerender = true;
export const ssr = true;
