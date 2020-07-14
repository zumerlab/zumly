import pkg from './package.json';
import postcss from 'rollup-plugin-postcss';
import liveServer from 'rollup-plugin-live-server';

export default {
  input: 'src/index.js',
  onwarn (warning, warn) {return},
  output: {
    name: pkg.name.toLowerCase(),
    file: 'public/' + pkg.module,
    format: 'es'
  },
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
}