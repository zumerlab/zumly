import pkg from './package.json';
import { terser } from 'rollup-plugin-terser';
import postcss from 'rollup-plugin-postcss';
import postcssBanner from 'postcss-banner';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy'
const banner = `/**
* ${pkg.name} v${pkg.version} 
* Author ${pkg.author.name}, @license ${pkg.license}
* https://zumly.org 
*/`
const bannerCss = `${pkg.name} v${pkg.version} 
Author ${pkg.author.name}, @license ${pkg.license}
https://zumly.org`

export default [
{
  input: 'src/entry.js',
  // check this in near future
  onwarn (warning, warn) {return},
  output: {
    name: pkg.name,
    file: pkg.browser,
    format: 'umd',
    banner
  },
  plugins: [
    postcss(),
    commonjs()
  ]
},
{
  input: 'src/entry.js',
  // check this in near future
  onwarn (warning, warn) {return},
  output: {
    name: pkg.name,
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
    })
  ]
},
{
  input: 'src/entry.js',
  // check this in near future
  onwarn (warning, warn) {return},
  output: {
    name: pkg.name,
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
    terser(),
    copy({
      targets: [{
        src: './src/assets/readme-template.md',
        rename: 'README.md',
        dest: './',
        transform: (contents) => contents.toString().replace(new RegExp('__VERSION__', 'g'), pkg.version)
      }]
    })
  ]
}]