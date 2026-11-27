/**
 * 客户端测试共享的最小 React stub（无 DOM 依赖）。
 *
 * 冒烟测试与真实语料测试共用：createElement + 常用 hooks + 虚拟树遍历。
 * 语义对齐真实 React 的关键点：
 * - 类组件靠 prototype.isReactComponent 判定，render 抛错时模拟错误边界
 *   （getDerivedStateFromError + 重渲染）；
 * - 函数组件在 createElement 时内联渲染（真实 React 延后，但渲染期抛错
 *   传播行为一致）；
 * - children 一层展平并过滤 null/undefined/false/''（真实 React 保留 ''，
 *   差异不影响断言）。
 */

/** 制造一套独立 hooks 状态（每个测试/每次挂载一套）。 */
export function makeHooks() {
  const states = []
  const effects = []
  const memos = []
  let cursor = 0
  let component = null
  let props = null
  let root = null
  let pending = false

  function scheduleRender() {
    if (pending) return
    pending = true
    queueMicrotask(() => { pending = false; render() })
  }

  function render() {
    cursor = 0
    root = component(props)
    return root
  }

  return {
    mount(comp, p) { component = comp; props = p; render() },
    get root() { return root },
    useState(initial) {
      const i = cursor++
      if (!Object.hasOwn(states, i)) {
        states[i] = { value: typeof initial === 'function' ? initial() : initial }
      }
      return [
        states[i].value,
        (v) => {
          states[i].value = typeof v === 'function' ? v(states[i].value) : v
          scheduleRender()
        },
      ]
    },
    useEffect(fn, deps) {
      const i = cursor++
      const prev = effects[i]
      if (!prev || !deps || deps.some((d, k) => !Object.is(d, prev.deps?.[k]))) {
        if (prev?.cleanup) prev.cleanup()
        const cleanup = fn()
        effects[i] = {
          deps: deps ? deps.slice() : undefined,
          cleanup: typeof cleanup === 'function' ? cleanup : undefined,
        }
      }
    },
    useMemo(fn, deps) {
      const i = cursor++
      const prev = memos[i]
      if (!prev || !deps || deps.some((d, k) => !Object.is(d, prev.deps?.[k]))) {
        memos[i] = { value: fn(), deps: deps ? deps.slice() : undefined }
      }
      return memos[i].value
    },
    useCallback(fn, deps) {
      const i = cursor++
      const prev = memos[i]
      if (!prev || !deps || deps.some((d, k) => !Object.is(d, prev.deps?.[k]))) {
        memos[i] = { value: fn, deps: deps ? deps.slice() : undefined }
      }
      return memos[i].value
    },
    useRef(initial) {
      const i = cursor++
      if (!Object.hasOwn(states, i)) states[i] = { value: { current: initial } }
      return states[i].value
    },
    useDeferredValue(value) {
      // 测试桩直接返回当前值；真实 React 的延迟调度不影响断言
      return value
    },
  }
}

/** React.Component 的桩基类（ErrorBoundary 需要 Component/super/setState 语义）。 */
export class StubReactComponent {
  constructor(props) {
    this.props = props
    this.state = {}
  }

  setState(partial) {
    Object.assign(this.state, partial)
  }
}
// 对齐真实 React：类组件靠 prototype.isReactComponent 判定
StubReactComponent.prototype.isReactComponent = true

/**
 * createElement 桩：类组件实例化 + render（含错误边界模拟），
 * 函数组件内联渲染，宿主元素记录 props/children。
 * @param {string|Function} type - 元素类型或组件。
 * @param {object} props - 元素属性。
 * @returns {object} 虚拟节点。
 */
export function createElement(type, props, ...children) {
  if (typeof type === 'function' && type.prototype?.isReactComponent) {
    const instance = new type({ ...(props || {}), children })
    try {
      const rendered = instance.render()
      return Array.isArray(rendered) ? rendered[0] : rendered
    } catch (err) {
      const derived = type.getDerivedStateFromError?.(err)
      if (!derived) throw err
      instance.setState(derived)
      const rendered = instance.render()
      return Array.isArray(rendered) ? rendered[0] : rendered
    }
  }
  if (typeof type === 'function') {
    return type({ ...(props || {}), children })
  }
  return {
    type,
    props: props || {},
    children: children.flat().filter(c => c !== null && c !== undefined && c !== false && c !== ''),
  }
}

/**
 * 为某套 hooks 构造 require('react') 的桩接口。
 * @param {object} hooks - makeHooks() 的返回值。
 * @returns {object} React 模块桩。
 */
export function reactFor(hooks) {
  return {
    createElement,
    Component: StubReactComponent,
    useState: hooks.useState,
    useEffect: hooks.useEffect,
    useMemo: hooks.useMemo,
    useCallback: hooks.useCallback,
    useRef: hooks.useRef,
    useDeferredValue: hooks.useDeferredValue,
  }
}

/**
 * 深度收集虚拟树中的文本（children 字符串）。
 * @param {object|string|number} node - 虚拟节点。
 * @param {string[]} out - 收集输出。
 * @returns {string[]} 文本数组。
 */
export function collectTexts(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    node.forEach(c => collectTexts(c, out))
    return out
  }
  for (const child of node.children ?? []) collectTexts(child, out)
  return out
}

/**
 * 在虚拟树里找第一个满足断言的节点。
 * @param {object} node - 根节点。
 * @param {(node:object)=>boolean} pred - 判定函数。
 * @returns {object|null} 匹配节点。
 */
export function findNode(node, pred) {
  if (!node || typeof node !== 'object') return null
  if (pred(node)) return node
  for (const child of node.children ?? []) {
    const hit = findNode(child, pred)
    if (hit) return hit
  }
  return null
}

/** 等待微任务与定时器排空（异步数据装载完成）。 */
export const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
