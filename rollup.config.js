import pkg from './package.json';
import { terser } from 'rollup-plugin-terser';
import postcss from 'rollup-plugin-postcss';
import postcssBanner from 'postcss-banner';
import copy from 'rollup-plugin-copy';
import serve from 'rollup-plugin-serve'
import livereload from 'rollup-plugin-livereload'
const banner = `/**
* ${pkg.name} v${pkg.version} 
* Author ${pkg.author}, @license ${pkg.license}
* https://zumly.org 
*/`
const bannerCss = `${pkg.name} v${pkg.version} 
Author ${pkg.author}, @license ${pkg.license}
https://zumly.org`

export default [
  {
    input: 'src/index.js',
    // check this in near future
    onwarn (warning, warn) {return},
    output: {
      name: pkg.name.toLowerCase(),
      file: pkg.main,
      format: 'es',
      banner
    },
    plugins: [
      postcss({
        extract:true,
        minimize: true,
        plugins: [
          postcssBanner({
            banner: bannerCss,
            important: true
          })
        ]
      }),
      terser()
    ],
    watch: {
      clearScreen: false
    }
  },
  {
    input: 'src/index.js',
    onwarn (warning, warn) {return},
    output: {
      name: pkg.name.toLowerCase(),
      file: pkg.module,
      format: 'es',
      banner
    },
    plugins: [
      postcss({
        extract:true,
        plugins: [
          postcssBanner({
            banner: bannerCss
          })
        ]
      }),
      copy({
        targets: [
          { src: 'dist', dest: 'public' },
          { 
            src: 'src/assets/index.html', 
            dest: 'public', 
            transform: (contents) => contents.toString().replace('__VERSION__', `v${pkg.version}` )
          }
        ]
      }),
     serve({contentBase:'public', port:'9090'}),
     livereload('public')
    ],
    watch: {
      clearScreen: false
    }
  }
]