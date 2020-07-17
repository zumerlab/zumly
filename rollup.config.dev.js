import pkg from './package.json';
import postcss from 'rollup-plugin-postcss';
import commonjs from '@rollup/plugin-commonjs';
import liveServer from 'rollup-plugin-live-server';

export default [
{
  input: 'src/entry.js',
  // check this in near future
  onwarn (warning, warn) {return},
  output: {
    name: pkg.name,
    file: 'public/' + pkg.browser,
    format: 'umd'
  },
  plugins: [
    postcss(),
    commonjs()
  ]
}, 
{
  input: 'src/entry.js',
  onwarn (warning, warn) {return},
  output: [{
    name: pkg.name,
    file: 'public/' + pkg.module,
    format: 'es'
  }],
  plugins: [
    postcss({
      extract:true,
    }),
   liveServer({
      port: 9090,
      host: "localhost",
      root: "public"
    })
  ],
  watch: {
    clearScreen: false
  }
}]
