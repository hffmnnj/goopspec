import { decodeProjectPath } from '$lib/routing/path-codec.js';
import type { LayoutLoad } from './$types';

export const prerender = false;
export const ssr = false;

export const load: LayoutLoad = ({ params }) => {
  try {
    return {
      projectParam: params.project,
      projectPath: decodeProjectPath(params.project),
      projectError: null,
    };
  } catch (error) {
    return {
      projectParam: params.project,
      projectPath: null,
      projectError: error instanceof Error ? error.message : 'Invalid project route',
    };
  }
};
