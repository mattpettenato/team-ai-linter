const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const cliOnly = process.argv.includes('--cli');
const pkgVersion = require('./package.json').version

async function main() {
  if (!cliOnly) {
    const ctx = await esbuild.context({
      entryPoints: ['src/extension.ts'],
      bundle: true,
      format: 'cjs',
      minify: production,
      sourcemap: !production,
      sourcesContent: false,
      platform: 'node',
      outfile: 'dist/extension.js',
      external: [
        'vscode',
        'eslint',
        '@eslint/js',
        'typescript-eslint',
        '@typescript-eslint/parser',
        '@typescript-eslint/utils',
        '@typescript-eslint/eslint-plugin',
        'globals',
        'checksumai-eslint-config',
      ],
      logLevel: 'info',
    });

    if (watch) {
      await ctx.watch();
      console.log('Watching for changes...');
    } else {
      await ctx.rebuild();
      await ctx.dispose();
    }
  }

  if (cliOnly) {
    await esbuild.build({
      entryPoints: ['src/cli/lintCli.ts'],
      bundle: true,
      format: 'cjs',
      minify: production,
      sourcemap: false,
      platform: 'node',
      outfile: 'dist/linter-cli.js',
      external: [
        'vscode',
        'eslint',
        '@eslint/js',
        'typescript-eslint',
        '@typescript-eslint/parser',
        '@typescript-eslint/utils',
        '@typescript-eslint/eslint-plugin',
        'globals',
        'checksumai-eslint-config',
      ],
      alias: {
        vscode: './src/cli/stubs/vscode-stub.cjs',
        'cspell-lib': './src/cli/stubs/cspell-lib-stub.cjs',
        jiti: './src/cli/stubs/jiti-stub.cjs',
      },
      define: { __CLI_VERSION__: JSON.stringify(pkgVersion) },
      // stdout must stay JSON-only. Bundled dep initializers run BEFORE the
      // entry body in esbuild's CJS output, so the entry's own console.log
      // rebind is too late for load-time logs — the banner runs first.
      banner: { js: 'console.log = console.error;' },
      logLevel: 'info',
    })
    return
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
