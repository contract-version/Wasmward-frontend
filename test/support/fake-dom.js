// A very small stand-in for the parts of the DOM the page uses, so its behaviour can be tested in Node with
// no browser and no dependencies. It is built from the real index.html (every element with an id, with its tag
// name and its initial hidden/disabled state), so a test cannot use an element the page does not have.
//
// It implements only what the page does: textContent, className, hidden, disabled, value, href, attributes,
// append/prepend/remove, children, and addEventListener with a way to dispatch an event. If the page starts using
// something else, this throws on the missing method rather than quietly doing nothing.

class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.textContent = String(text);
    this.parentNode = null;
  }
}

export class FakeElement {
  constructor(tagName, id = '') {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.href = '';
    this.parentNode = null;
    this.childNodes = [];
    this.attributes = {};
    this.listeners = {};
    this.ownText = '';
    // How many times the text was set, so a test can tell a page that rewrites a live region every second from
    // one that writes only when something changed.
    this.textWrites = 0;
  }

  get textContent() {
    return this.ownText + this.childNodes.map((node) => node.textContent).join('');
  }

  // Like the real one: setting text drops every child.
  set textContent(value) {
    this.textWrites += 1;
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this.ownText = String(value);
  }

  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1);
  }

  get firstElementChild() {
    return this.children[0] ?? null;
  }

  get lastElementChild() {
    return this.children.at(-1) ?? null;
  }

  #adopt(nodes) {
    return nodes.map((node) => {
      const adopted = typeof node === 'string' ? new FakeText(node) : node;
      adopted.parentNode?.removeChild(adopted);
      adopted.parentNode = this;
      return adopted;
    });
  }

  append(...nodes) {
    this.childNodes.push(...this.#adopt(nodes));
  }

  prepend(...nodes) {
    this.childNodes.unshift(...this.#adopt(nodes));
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index < 0) throw new Error('removeChild: not a child of this element');
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }

  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  /** Calls the listeners for `type` with an event object (`target` is this element) and resolves when they finish. */
  async dispatch(type, event = {}) {
    const fired = { type, target: this, ...event };
    for (const listener of this.listeners[type] ?? []) await listener(fired);
    return fired;
  }

  /** Like a user's click: nothing happens if the element is disabled. */
  async click() {
    if (this.disabled) return undefined;
    return this.dispatch('click');
  }
}

export class FakeDocument {
  constructor() {
    this.byId = new Map();
    this.listeners = {};
    this.visibilityState = 'visible';
    this.title = '';
    // The <html> element: where the page puts data-theme.
    this.documentElement = new FakeElement('html');
  }

  getElementById(id) {
    return this.byId.get(id) ?? null;
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createTextNode(text) {
    return new FakeText(text);
  }

  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  async dispatch(type, event = {}) {
    for (const listener of this.listeners[type] ?? []) await listener({ type, target: this, ...event });
  }
}

/** The elements of an HTML page that have an id, as a FakeDocument. Initial `hidden` and `disabled` are read. */
export function documentFromHtml(html) {
  const doc = new FakeDocument();
  for (const [, tag, attributes] of html.matchAll(/<([a-z0-9]+)\b([^>]*\bid="[^"]+"[^>]*)>/gi)) {
    const id = attributes.match(/\bid="([^"]+)"/)[1];
    if (doc.byId.has(id)) throw new Error(`the page has the id "${id}" twice`);
    const element = new FakeElement(tag, id);
    element.hidden = /\shidden(\s|=|$)/.test(` ${attributes} `);
    element.disabled = /\sdisabled(\s|=|$)/.test(` ${attributes} `);
    const classes = attributes.match(/\bclass="([^"]*)"/);
    if (classes) element.className = classes[1];
    doc.byId.set(id, element);
  }
  // A <select> starts on its first option, as in a browser.
  const select = html.match(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/);
  if (select) doc.byId.get(select[1]).value = select[2].match(/<option\s+value="([^"]*)"/)?.[1] ?? '';
  return doc;
}
