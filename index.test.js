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

test('a name-only branded pack requires a matching validated barcode before inheriting an ingredient', async()=>{
  const {verifyBarcode}=await import('./index.js');
  const ref={sku:'other',activeIngredients:['Sulfato de Morfina']};
  const refs=new Map([['7896676406177',ref]]);
  const local={sku:'local',name:'Dimorf 10mg',gtin:'7896676406177'};
  const intent={kind:'ingredient',name:'morfina',suffix:'10mg'};
  assert.equal(verifyBarcode(local,refs,intent).sku,'local');
  assert.equal(verifyBarcode({...local,gtin:'7896676406184'},refs,intent),undefined);
  assert.equal(verifyBarcode(local,refs,{...intent,suffix:'30mg'}),undefined);
});

test('an exhausted ingredient page cannot start a different barcode search', async t=>{
  t.mock.method(globalThis,'fetch',async (url,init)=>{
    const path=new URL(url).pathname;
    if(path==='/pesquisa/paracetamol') return new Response('<b id="quantidade-busca">1</b><div id="search-produtos"><div class="produto" data-produto_id="123"><a href="/local"></a><span data-target="nome_produto">Paracetamol 500mg</span></div></div>');
    throw Error('unexpected '+path);
  });
  assert.deepEqual(await retailer.search('paracetamol',2,10),[]);
});

test('facts for a name or local SKU never request prices or stock', async t=>{
  t.mock.method(globalThis,'fetch',async url=>{
    const path=new URL(url).pathname;
    if(path === '/pesquisa/123' || path === '/pesquisa/paracetamol') return new Response(
      '<b id="quantidade-busca">1</b><div id="search-produtos"><div class="produto" data-produto_id="123"><a href="/local"></a><span data-target="nome_produto">Paracetamol 500mg</span></div></div>');
    if(path === '/local') return new Response('<p>Código: 123 | EAN: 7891058002602</p>');
    throw Error('Unexpected '+path);
  });
  for (const q of ['123','paracetamol']) {
    const [p]=await retailer.facts(q);
    assert.equal(p.sku,'123');
    assert.equal(p.currentPrice,undefined);
    assert.equal(p.branches,undefined);
  }
});
