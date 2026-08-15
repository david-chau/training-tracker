// reportView, loaded out of the working copy the way the unit tests load it.
const fs = require('fs');
const vm = require('vm');

function reportMarkup(data) {
  const src = fs.readFileSync(__dirname + '/../src/Index.html', 'utf8');
  const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  // Enough of an element for the script to finish loading. It wires up the
  // whole page on load; only reportView's return value is wanted.
  const node = () => ({
    style: {}, className: '', id: '', innerHTML: '', textContent: '', value: '',
    children: [], classList: { add() {}, remove() {}, toggle() {},
                               contains: () => false },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.unshift(c); return c; },
    addEventListener() {}, setAttribute() {}, insertAdjacentHTML() {},
    insertAdjacentElement(p, e) { return e; }, remove() {}, focus() {},
    querySelector: () => null, querySelectorAll: () => []
  });
  const byId = {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      getElementById: id => (byId[id] = byId[id] || node()),
      createElement: node,
      createTextNode: t => ({ nodeValue: String(t) }),
      querySelectorAll: () => [], addEventListener() {}
    },
    window: { addEventListener() {} },
    // Chainable: withSuccessHandler().withFailureHandler().whatever() has to
    // keep returning something callable, and never actually call anything.
    google: { script: { run: new Proxy({}, {
      get(t, k) { return () => (k.toString().startsWith('with') ? t : undefined); }
    }) } }
  };
  sandbox.window = Object.assign(sandbox.window, sandbox);
  sandbox.google.script.run = new Proxy({}, {
    get(t, k) { return () => (k.toString().startsWith('with') ? proxied : undefined); }
  });
  const proxied = sandbox.google.script.run;
  vm.createContext(sandbox);
  vm.runInContext('var CAN_EDIT = true; var KEY = "k";' +
    blocks[blocks.length - 1].replace('<?= canEdit ?>', 'true')
                             .replace('<?= editKey ?>', 'k'), sandbox);
  return sandbox.reportView(data).innerHTML;
}

module.exports = { reportMarkup };
