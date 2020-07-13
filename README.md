# Zumly

> Zumly powers user interfaces with beautiful zooming transitions.


## Installation
```sh
npm install @zumly/zumly

# or

yarn add @zumly/zumly
```

## Usage
```js

import Zumly from 'zumly/zumly.mjs'
import {home} from './views/home.js'

const app = new Zumly({
	mount: '.one',
	initialView: 'home',
	views: {
	  home
	}
})

app.init()

```

```html
<!-- Each view needs a .z-view -->
<div class="z-view">
<!-- Zoomable elements need .zoom-me and data-to with atarget view-->
 <div class='zoom-me' data-to='anotherView'>
 </div>
</div>

```

### Options

```js
Zumly({
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
		// Effects for background views. Array. ['blur', 'sepia', 'sature']
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
.init()
```

## Developer environment requirements

To run this project, you will need:

- Node.js >= v10.5.0,[install instructions](https://nodejs.org/)

## Dev mode

When developing you can run:

```sh
npm run dev

# or

yarn dev
```

This will regenerate the build files each time a source file is changed and serve on http://localhost:9090

## Running tests

```sh
npm run test

# or

yarn test
```

## Building

```sh
npm run build

# or

yarn build
```

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information what has changed recently.

## Original idea

I initially created [Zircle UI](https://github.com/zircleUI/zircleUI) as an experiment, now the things are a bit more serious.

## License

The MIT License (MIT). Please see [License File](LICENSE) for more information.


