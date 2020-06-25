import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import pkg from './package.json';
import babel from 'rollup-plugin-babel';
import minify from 'rollup-plugin-babel-minify';
import postcss from 'rollup-plugin-postcss';
import autoprefixer from 'autoprefixer';
import license from 'rollup-plugin-license';
import licenseCss from  'postcss-banner';
import moment from  'moment';
const banner = `${pkg.name} v${pkg.version} 
Build on ${moment().format('YYYY-DD-MM')}
Author ${pkg.author}, Copyright ${pkg.license}
https://zumly.org`

export default [
  // browser-friendly UMD build
  {
    input: 'src/index.js',
    output: {
      name: 'zumly',
      file: pkg.main,
      format: 'es'
    },
    plugins: [
      minify({
        comments: false
      }),
      license({
        banner: banner
      }),
      postcss({
        extract: true,
        minimize: true,
        plugins: [
          autoprefixer,
          licenseCss({
            banner: banner
          })
        ]
      })
    ]
  },
  {
    input: 'src/index.js',
    output: {
      name: 'zumly',
      file: pkg.module,
      format: 'es'
    },
    plugins: [
      license({
        banner: banner
      }),
      postcss({
        extract: true,
        plugins: [
          autoprefixer,
          licenseCss({
            banner: banner
          })
        ]
      })
    ]
  },
  {
    input: 'src/index.js',
    external: [],
    plugins: [
      resolve(),
      commonjs(),
      babel({
        exclude: 'node_modules/**',
      }),
      minify({
        comments: false,
      }),
      license({
        banner: banner
      }),
      postcss({
        plugins: [
          autoprefixer,
          licenseCss({
            banner: banner
          })
        ]
      })
    ],
    output: { 
      name: 'zumly', 
      file: pkg.browser, 
      format: 'umd'
    },
  },
];
