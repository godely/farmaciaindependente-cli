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

test('client page sizes span the retailer pages and stop at the reported end', async t => {
  const card = n => '<div class="produto" data-produto_id="'+n+'"><a href="/p-'+n+'"></a><span data-target="nome_produto">Produto '+n+'</span></div>';
  let queried = [];
  t.mock.method(globalThis,'fetch',async (url, init) => {
    const path = new URL(url).pathname;
    if (path.startsWith('/pesquisa/') && !init.method) {
      return new Response('<b id="quantidade-busca">5</b><div id="search-produtos">'+[1,2,3].map(card).join('')+'</div>',{headers:{'Set-Cookie':'csrftoken=test; Path=/'}});
    }
    if (path === '/pegar/preco') return Response.json({precos:{}});
    assert.equal(path,'/pesquisa/pesquisar'); queried.push(init.body.get('pagina'));
    return Response.json({pagina_atual:2,produtos:[4,5].map(n=>({_source:{cd_produto:n,nm_produto:'Produto '+n,url_produto:'p-'+n}}))});
  });
  assert.deepEqual((await retailer.search('produto',2,2)).map(r=>r.sku),['3','4']);
  assert.deepEqual((await retailer.search('produto',3,2)).map(r=>r.sku),['5']);
  assert.deepEqual(await retailer.search('produto',4,2),[]);
  assert.deepEqual(queried,['2','2']);
});
