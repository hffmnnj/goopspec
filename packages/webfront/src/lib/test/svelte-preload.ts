import { compileModule } from 'svelte/compiler';

const EXT = /\.svelte\.(ts|js)$/;
const tsTranspiler = new Bun.Transpiler({ loader: 'ts', target: 'browser' });

function stripTypeScript(source: string): string {
  return tsTranspiler.transformSync(source);
}

function compileSvelteModule(source: string, filename: string): string {
  const withoutTypes = filename.endsWith('.ts') ? stripTypeScript(source) : source;
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
