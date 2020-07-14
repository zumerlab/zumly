import pkg from './package.json';
import { terser } from 'rollup-plugin-terser';
import postcss from 'rollup-plugin-postcss';
import postcssBanner from 'postcss-banner';
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
  ]
}]