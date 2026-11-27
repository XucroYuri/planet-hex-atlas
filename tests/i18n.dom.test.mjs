import assert from 'node:assert/strict';
import { readFile, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import * as vm from 'node:vm';
import test from 'node:test';
import { browserCases, deepExpectations, exerciseLocalizedPage } from './i18n.browser.test.mjs';

const require = createRequire(import.meta.url);
const domModule = process.env.ORBIS_TEST_DOM_MODULE;
const web = new URL('../web/', import.meta.url);
const read = promisify(readFile);

test('实际数据和交互逻辑覆盖全部八种语言', {
  skip: !domModule && '设置 ORBIS_TEST_DOM_MODULE 为 jsdom 模块路径，并启用 --experimental-vm-modules',
  timeout: 120000,
}, async (suite) => {
  const { JSDOM, VirtualConsole } = require(domModule);
  const markup = readFileSync(new URL('index.html', web), 'utf8');
  const h3 = readFileSync(new URL('vendor/h3.js', web), 'utf8');

  for (const [tag, entry] of Object.entries(browserCases)) {
    await suite.test(tag, async () => {
      const errors = [];
      const virtualConsole = new VirtualConsole();
      virtualConsole.on('error', error => errors.push(String(error)));
      virtualConsole.on('jsdomError', error => errors.push(String(error)));
      const dom = new JSDOM(markup, {
        url: tag === 'ar' ? 'https://orbis.test/?lang=ar-EG' : 'https://orbis.test/',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole,
      });
      try {
        const { window } = dom;
        Object.defineProperty(window.navigator, 'languages', { value: [['ar', 'fr'].includes(tag) ? 'en-US' : entry[0]] });
        if (['ar', 'fr'].includes(tag)) window.localStorage.setItem('orbis-atlas.locale', 'fr');
        window.HTMLCanvasElement.prototype.getContext = type => type === '2d' ? ({ isPointInPath: () => false }) : null;
        window.ResizeObserver = class { observe() {} };
        window.Path2D = class { moveTo() {} lineTo() {} closePath() {} };
        window.matchMedia = () => ({ matches: false });
        window.URL.revokeObjectURL = () => {};
        window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
        window.HTMLDialogElement.prototype.close = function () {
          this.open = false;
          this.dispatchEvent(new window.Event('close'));
        };
        window.fetch = async (input) => {
          const url = new URL(String(input));
          assert.ok(url.href.startsWith(new URL('data/', web).href) || url.href.startsWith(new URL('locales/', web).href), `Unexpected fetch: ${url.href}`);
          return new Response(await read(url));
        };
        window.eval(h3);

        const modules = new Map();
        const linker = (specifier, { identifier }) => loadModule(new URL(specifier, identifier).href);
        function loadModule(identifier) {
          if (modules.has(identifier)) return modules.get(identifier);
          assert.ok(identifier.startsWith(web.href));
          const module = new vm.SourceTextModule(readFileSync(new URL(identifier), 'utf8'), {
            context: dom.getInternalVMContext(),
            identifier,
            initializeImportMeta: (meta) => { meta.url = identifier; },
            importModuleDynamically: async (specifier, referrer) => {
              const dependency = linker(specifier, referrer);
              if (dependency.status === 'unlinked') await dependency.link(linker);
              if (dependency.status === 'linked') await dependency.evaluate();
              return dependency;
            },
          });
          modules.set(identifier, module);
          return module;
        }
        const app = loadModule(new URL('js/app.js', web).href);
        await app.link(linker);
        await app.evaluate();
        const exercise = window.eval(`(${exerciseLocalizedPage.toString()})`);
        await exercise([tag, entry, deepExpectations[tag], false]);
        assert.deepEqual(errors, []);
      } finally {
        dom.window.close();
      }
    });
  }
});
