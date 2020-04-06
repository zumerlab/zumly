# Zumly

> Full featured Javascript library for building zoomable user interfaces (ZUI)

## Features
- Infinite zoom levels
- Multiple instances
- Framework agnostic library, but framework friendly
- UI agnostic.
- ESM
- No dependencies

## Developer environment requirements

To run this project, you will need:

- Node.js >= v10.5.0, use nvm - [install instructions](https://github.com/creationix/nvm#install-script)
- Yarn >= v1.7.0 - [install instructions ("Alternatives" tab)](https://yarnpkg.com/en/docs/install#alternatives-rc)

## Dev mode

When developing you can run:

```
yarn watch
```

This will regenerate the build files each time a source file is changed and serve on http://127.0.0.1:5000.

### Previewing umd build in the browser

If your package works in the browser, you can open `dev/index.html` to try it out.

## Running tests

```sh
yarn
yarn test
yarn test --watch
```

## Publishing

```sh
npm publish
```

## Additional tooling

Based on your need, you might want to add:
- [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/)
- CHANGELOG.md generation with [conventional-changelog](https://github.com/conventional-changelog)

If so, please do and open pull requests when you feel like it.

## Original idea

I initially created Zircle as an experiment, now the things are a bit serious.
