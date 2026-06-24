import { transformSync } from '@babel/core';
import transformTypeScript from '@babel/plugin-transform-typescript';
import { compileModule } from 'svelte/compiler';

const EXT = /\.svelte\.(ts|js)$/;

function stripTypeScript(source: string): string {
  const result = transformSync(source, {
    filename: 'module.ts',
    plugins: [transformTypeScript],
    configFile: false,
  });
  return result?.code ?? source;
}

function compileSvelteModule(source: string, filename: string): string {
  const withoutTypes = stripTypeScript(source);
  const { js } = compileModule(withoutTypes, {
    filename,
    generate: 'client',
  });
  return js.code;
}

if (typeof Bun !== 'undefined' && Bun.plugin) {
  Bun.plugin({
    name: 'svelte-module-loader',
    setup(build) {
      build.onLoad({ filter: EXT }, async (args) => {
        const source = await Bun.file(args.path).text();
        const code = compileSvelteModule(source, args.path);
        return { contents: code, loader: 'js' };
      });
    },
  });
}

export {};
