import type { LayoutLoad } from './$types';

export const prerender = false;
export const ssr = false;

// Pass the encoded project segment through so the sidebar can build nav hrefs.
export const load: LayoutLoad = ({ params }) => {
  return {
    projectParam: params.project,
  };
};
