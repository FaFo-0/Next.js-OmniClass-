import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeacherBrowserGate, isFirefox } from '../src/components/auth/teacher-browser-gate';

test('portal content stays accessible before browser detection for every role', () => {
  for (const role of ['student', 'admin', 'teacher']) {
    const props = { role, children: createElement('button', null, 'Open lesson') };
    const html = renderToStaticMarkup(createElement(TeacherBrowserGate, props));
    assert.match(html, /<button>Open lesson<\/button>/);
    assert.doesNotMatch(html, /Get Google Chrome/);
  }
});

test('the compatibility notice targets Firefox rather than blocking all non-Chrome browsers', () => {
  assert.equal(isFirefox('Mozilla/5.0 Gecko/20100101 Firefox/144.0'), true);
  assert.equal(isFirefox('Mozilla/5.0 FxiOS/144.0 Mobile/15E148'), true);
  assert.equal(isFirefox('Mozilla/5.0 Chrome/140.0 Safari/537.36'), false);
  assert.equal(isFirefox('Mozilla/5.0 Version/18.0 Safari/605.1.15'), false);
});
