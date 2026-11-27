import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, retailer } from './index.js';
test('retailer search excludes recommended products outside the results', () => {
  const card='<div class="produto" data-produto_id="17"><a href="/example"></a><span data-target="nome_produto">Example</span></div>';
  const result=parseCards('<div id="search-produtos">'+card+'</div><aside>'+card+'</aside>');
  assert.equal(result.length,1);
  assert.equal(result[0].sku,'17');
  assert.throws(()=>parseCards('<body>unavailable</body>'));
});
test('exact product lookup rejects invalid IDs', async()=>assert.rejects(retailer.product('abc')));
