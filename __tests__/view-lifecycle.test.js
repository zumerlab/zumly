import { describe, it, expect, vi, afterEach } from 'vitest'
import { ViewResolver } from '../src/view-resolver.js'
import { disposeView } from '../src/view-lifecycle.js'
import { disposeView as disposeFromSeparateModule } from '../src/view-lifecycle.js?separate-copy'
import { prepareAndInsertView, renderView } from '../src/utils.js'
import { removeViewFromCanvas } from '../src/drivers/driver-helpers.js'

afterEach(() => { document.body.innerHTML = '' })

describe('view context and lifecycle', () => {
  it('shares cleanup with separately loaded modules without transferring it to DOM clones', async () => {
    const cleanup = vi.fn()
    const node = await new ViewResolver({ component: ({ onCleanup }) => {
      onCleanup(cleanup)
      return '<section>Component</section>'
    } }).resolve('component')
    disposeFromSeparateModule(node.cloneNode(true))
    expect(cleanup).not.toHaveBeenCalled()
    disposeFromSeparateModule(node)
    disposeView(node)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('provides a complete context to both function and object views', async () => {
    const contexts = []
    const resolver = new ViewResolver({
      fn: context => { contexts.push(context); return '<div>Function</div>' },
      object: { render: context => { contexts.push(context); return document.createElement('section') } }
    })
    await resolver.resolve('fn')
    const objectNode = await resolver.resolve('object')
    expect(objectNode.tagName).toBe('SECTION')
    for (const context of contexts) {
      expect(context.target).toBeInstanceOf(HTMLDivElement)
      expect(context.props).toEqual({})
      expect(context.context).toBeInstanceOf(Map)
      expect(context.onCleanup).toBeTypeOf('function')
    }
    expect(contexts[0].target).not.toBe(contexts[1].target)
  })

  it('passes shared context to an initial view through the compatibility helper', async () => {
    const shared = { store: 'value' }
    const render = vi.fn(() => document.createElement('div'))
    const canvas = document.createElement('div')
    await renderView('home', canvas, { home: render }, true, shared)
    expect(render.mock.calls[0][0].context).toBe(shared)
    expect(render.mock.calls[0][0].props).toEqual({})
  })

  it('keeps the framework mount container and multiple roots intact until permanent removal', async () => {
    let target
    const cleanup = vi.fn()
    const resolver = new ViewResolver({ component: context => {
      target = context.target
      const first = document.createElement('button')
      const second = document.createElement('p')
      target.append(first, second)
      context.onCleanup(cleanup)
    } })
    const node = await resolver.resolve('component')
    const canvas = document.createElement('div')
    document.body.append(canvas)
    await prepareAndInsertView(node, 'component', canvas, true, {}, {})
    expect(node).toBe(target)
    expect(node.children).toHaveLength(2)
    expect(node.style.width).toBe('100%')
    expect(node.style.height).toBe('100%')
    node.remove() // Depth history temporarily detaches the same live instance.
    expect(cleanup).not.toHaveBeenCalled()
    canvas.append(node)
    removeViewFromCanvas(node, canvas)
    expect(cleanup).toHaveBeenCalledOnce()
    disposeView(node)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('preserves authored framework wrapper classes and inline sizing', async () => {
    const resolver = new ViewResolver({
      inline: ({ target }) => { target.style.width = '300px'; target.style.height = '200px' },
      stylesheet: ({ target }) => { target.className = 'dashboard-size' }
    })
    const inline = await resolver.resolve('inline')
    expect(inline.style.width).toBe('300px')
    expect(inline.style.height).toBe('200px')
    const stylesheet = await resolver.resolve('stylesheet')
    expect(stylesheet.className).toBe('dashboard-size')
    expect(stylesheet.style.width).toBe('')
    expect(stylesheet.style.height).toBe('')
  })

  it('cleans failed renders and invokes late registrations once the scope was disposed', async () => {
    const cleanup = vi.fn()
    let onCleanup
    const resolver = new ViewResolver({ failed: context => {
      onCleanup = context.onCleanup
      onCleanup(cleanup)
      throw new Error('render failed')
    } })
    await expect(resolver.resolve('failed')).rejects.toThrow('render failed')
    expect(cleanup).toHaveBeenCalledOnce()
    const lateCleanup = vi.fn()
    onCleanup(lateCleanup)
    expect(lateCleanup).toHaveBeenCalledOnce()
  })

  it('removes and cleans a view whose mounted hook fails', async () => {
    const cleanup = vi.fn()
    const view = {
      render ({ onCleanup }) { onCleanup(cleanup); return document.createElement('article') },
      async mounted () { throw new Error('mount failed') }
    }
    const canvas = document.createElement('div')
    const node = await new ViewResolver({ view }).resolve('view')
    await expect(prepareAndInsertView(node, 'view', canvas, false, { view }, {})).rejects.toThrow('mount failed')
    expect(canvas.children).toHaveLength(0)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('cleans nested view instances independently and continues after a cleanup error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const parentCleanup = vi.fn()
    const childCleanup = vi.fn()
    const resolver = new ViewResolver({
      parent: ({ onCleanup }) => { onCleanup(parentCleanup); return '<div></div>' },
      child: ({ onCleanup }) => {
        onCleanup(childCleanup)
        onCleanup(() => { throw new Error('cleanup failed') })
        return '<section></section>'
      }
    })
    try {
      const parent = await resolver.resolve('parent')
      const child = await resolver.resolve('child')
      parent.append(child)
      disposeView(parent)
      disposeView(child)
      expect(parentCleanup).toHaveBeenCalledOnce()
      expect(childCleanup).toHaveBeenCalledOnce()
      expect(error).toHaveBeenCalledOnce()
    } finally { error.mockRestore() }
  })
})
