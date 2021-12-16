<p align="center">
  <a href="https://zumly.org">
    <img src="https://raw.githubusercontent.com/zumly/website/gh-pages/images/logo-zumly.png" width="200">
  </a>
</p>

<p align="center">
  Zumly is a Javascript library for building zooming user interfaces. Create zooming experiences using web standards.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/zumly"><img src="https://img.shields.io/npm/v/zumly.svg"></a>
</p>

## Overview

Zumly is a frontend library for creating zoomable user interfaces ([ZUI](https://en.wikipedia.org/wiki/Zooming_user_interface)). Instead of hyperlinks and windows, Zumly uses zooming as a metaphor for browsing through information. This way it offers an infinite virtual canvas in which elements can be zoomed themselves to reveal further details. 

To be more flexible Zumly is primarily focused on zooming transitions without caring about visual design. Most CSS frameworks or custom designs work with Zumly.

## Installation

### NPM
```sh
npm install zumly

# or

yarn add zumly
```

### Content delivery networks (CDN)
Include https://unpkg.com/zumly in your project in a `<script>` tag. 


### Direct download

Download Zumly files from [unpkg.com](https://unpkg.com/zumly/). Files are in `dist` folder.


## Setup


### ES6 modules

1. Add CSS inside `<head>` tag: 
```html

<link rel="stylesheet" href="zumly/dist/zumly.css">

<!-- Or "https://unpkg.com/zumly@0.9.11/dist/zumly.css" -->

```

2. Add Zumly as ES6 module: 
```html
<script type="module">
  import Zumly from "zumly/dist/zumly.mjs"

  // Or "https://unpkg.com/zumly@0.9.11/dist/zumly.mjs"
</script>
```

### UMD modules

1. Add Zumly CSS Styles inside `<head>` tag: 
```html

<link rel="stylesheet" href="zumly/dist/zumly.css">

<!-- Or "https://unpkg.com/zumly@0.9.11/dist/zumly.css" -->

```

2. Add Zumly as UMD module: 
```html

<script src="zumly/dist/zumly.umd.js"></script>

// Or "https://unpkg.com/zumly"

```


## Hello World

1. Create a container for your Zumly app with `.zumly-canvas`: 

```html

<div class="example zumly-canvas"></div>

```

2. Inside `script` tag write this code:

```js
// Some views
const hello = `
<div class="z-view">
H E L L O <br>
W <span class="zoom-me" data-to="world">O</span> R L D!
</div>
`;

const world = `
<div class="z-view">
<img src="https://raw.githubusercontent.com/zumly/website/gh-pages/images/world.png"/>
</div>
`;

// Zumly instance
const app = new Zumly({
  mount: '.example',
  initialView: 'hello',
  views: {
    hello,
    world
  }
})

app.init()

```

- See this example live at [codePen](https://codepen.io/zumly/pen/gOPQovd)

### Zumly options

1. The Zumly instance:

```js
const app = new Zumly({
  // Mount DOM Element. String. Required
  mount: '.className',
  // First rendered view name. String. Required
  initialView: 'viewName',
  // Store all views. Object. Required
  views: {
    view1,
    view2,
    . . .
  }, 
  // Customize transitions. Object. Optional
  transitions: {
    // Effects for background views. Array. ['blur', 'sepia', 'saturate']
    effects: ['sepia'],
    // How new injected view is adapted. String. Default 'width'
    cover: 'height',
    // Transition duration. String. Default '1s'
    duration: '1300ms' ,
    // Transition ease. String. Default 'ease-in-out'
    ease: 'cubic-bezier(0.25,0.1,0.25,1)'
  },
  // Activate debug notifications. Boolean. Default false
  debug: true
})
// Initialize instance
app.init()
```

2. Options for each zoomable element:

- Add `z-view` class in you view container:

```html

<div class="z-view"></div>

```

- Add `zoom-me` class to an HTML element to make it zoomable and add `data-to` attribute with the name of the target view

```html

<div class="zoom-me" data-to="anotherView">Zoom me!</div>

```

- Each zooming transition can be customized by adding some `data-` attributes:

```html

<div class="zoom-me" data-to="anotherView" data-with-duration="2s" data-with-ease="ease-in">
  Zoom me!
</div>

```

## Development 

### Developer environment requirements

To run this project, you will need:

- Node.js >= v10.5.0

### Dev mode

When developing you can run:

```sh
npm run dev

# or

yarn dev
```

This will regenerate the build files each time a source file is changed and serve on http://localhost:9090

### Running tests

```sh
npm run test

# or

yarn test
```

### Building

```sh
npm run build

# or

yarn build
```

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information what has changed recently.

### Status: beta

Zumly is on early stages of development.

### Roadmap

- Allow different template engines. Currently Zumly only accepts string literal templates.
- Add lateral navigation for same zoom level elements.
- Add a navegation widget.
- Add programmatic navigation.
- Add preseted navigation.
- Add router. [#3](https://github.com/zumly/zumly/issues/3)
- Allow recalculate zoom position on resize events.


## Stay in touch

- [Telegram group](https://t.me/ZumlyCommunity)

## Original idea

Zumly is a new approach based on another library I made, [Zircle UI](https://github.com/zircleUI/zircleUI)

## License

The MIT License (MIT). Please see [License File](LICENSE) for more information.


