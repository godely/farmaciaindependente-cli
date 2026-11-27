import { load } from 'cheerio';
import { validGtin } from 'paguemenos-cli/vtex';
const site = 'https://www.farmaciasindependente.com.br';
const name = 'Farmácias Independente';
const fold = s => String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
const money = s => (typeof s === 'string' || typeof s === 'number') && String(s).trim() && Number.isFinite(Number(s)) && Number(s) >= 0 ? Number(s) : null;

async function session(path) {
  const url = new URL(path,site);
  if (url.origin !== site) throw new Error('Unexpected retailer link');
  const page = await fetch(url,{ signal:AbortSignal.timeout(15000),redirect:'error' });
  if (!page.ok) throw new Error('Storefront HTTP '+page.status);
  const cookies = page.headers.getSetCookie().map(cookie=>cookie.split(';')[0]);
  const token = cookies.find(c=>c.startsWith('csrftoken='))?.slice(10);
  const html = await page.text();
  async function post(endpoint, fields) {
    if (!token) throw new Error('Storefront session unavailable');
    const response = await fetch(new URL(endpoint,site),{ method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{ Cookie:cookies.join('; '), Referer:url.href,'X-CSRFToken':token,'X-Requested-With':'XMLHttpRequest' },
      body:new URLSearchParams(fields) });
    if (!response.ok) throw new Error('Storefront HTTP '+response.status);
    return response.json();
  }
  return { html, post };
}

function offer(base, raw) {
  const normal = raw?.publico;
  const price = normal && !normal.is_recorrencia ? normal : {};
  return { ...base, retailer:name,seller:name,currency:'BRL',currentPrice:money(price.valor_fim),
    listPrice:money(price.valor_ini),inStock:null,priceScope:'anonymous_online',observedAt:new Date().toISOString() };
}
export function parseCards(html) {
  const $ = load(html);
  const container = $('#search-produtos');
  if (!container.length && !$('#quantidade-busca').length) {
    // Empty searches use a separate empty-state page with suggested products.
    if (/nenhum resultado|nenhum produto|não encontramos/i.test($('main, body').text())) return [];
    throw new Error('Retailer search results unavailable');
  }
  return container.find('.produto[data-produto_id]').map((_,e)=>{
    const card=$(e), link=card.find('a[href]').first().attr('href');
    if (!/^\/[\w%-]+$/.test(link ?? '')) return null;
    return {sku:card.attr('data-produto_id'), name:card.find('[data-target="nome_produto"]').text().trim(),productUrl:site+link};
  }).get();
}
async function search(query, page=1, limit=20) {
  if (!Number.isInteger(page) || page<1 || !Number.isInteger(limit) || limit<1 || limit>50) throw new Error('Invalid page or limit');
  const term=query.trim().replace(/\s+/g,'-');
  const {html,post}=await session('/pesquisa/'+encodeURIComponent(term));
  let cards;
  if (page === 1) cards=parseCards(html);
  else {
    const next=await post('/pesquisa/pesquisar',{termo:'pesquisa/'+term,pagina:String(page),ordenacao:'',is_termo:'true'});
    if (!Array.isArray(next.produtos)) throw new Error('Search page unavailable');
    cards=next.produtos.map(p=>p._source).filter(p=>/^[\w%-]+$/.test(p.url_produto)).map(p=>({
      sku:String(p.cd_produto),name:p.nm_produto,productUrl:site+'/'+p.url_produto }));
  }
  cards=cards.slice(0,limit);
  if (!cards.length) return [];
  const prices=await post('/pegar/preco',cards.map(c=>['produtos_ids[]',c.sku]));
  if (!prices.precos) throw new Error('Price response unavailable');
  return cards.map(card=>offer(card,prices.precos[card.sku]));
}
async function details(card) {
  const { html }=await session(card.productUrl);
  const $=load(html);
  const id=$('p').filter((_,e)=>/Código:\s*\d+\s*\|\s*EAN:/i.test($(e).text())).first().text().match(/Código:\s*(\d+)\s*\|\s*EAN:\s*(\d+)/i);
  if (!id || id[1]!==card.sku) return null;
  return {...card,gtin:validGtin(id[2])?id[2]:null,itemName:card.name};
}
async function product(sku) {
  if (!/^\d+$/.test(sku)) throw new Error('Expected a numeric SKU');
  const card=(await search(sku)).find(c=>c.sku===String(sku));
  if (!card) return [];
  const item=await details(card);
  return item?[item]:[];
}
async function byGtin(gtin) {
  if (!validGtin(gtin)) throw new Error('Expected a valid GTIN');
  const items=[];
  for (const card of await search(gtin,1,10)) {
    const item=await details(card);
    if (item?.gtin===gtin) items.push(item);
  }
  return items;
}
async function municipality(postal) {
  const cityResponse=await fetch('https://viacep.com.br/ws/'+postal+'/json/', {signal:AbortSignal.timeout(10000)});
  if (!cityResponse.ok) throw new Error('CEP municipality unavailable');
  const city=await cityResponse.json();
  if (!city.localidade || !city.uf) throw new Error('Unknown CEP municipality');
  return city;
}
async function stores() {
  const {html}=await session('/nossas-lojas');
  const $=load(html);
  const rows=$('p.font-xs').map((_,e)=>{
    const address=$(e).text().replace(/\s+/g,' ').trim();
    const match=address.match(/,\s*([^,/]+)\/([A-Z]{2})\s*-/);
    return match?{name:$(e).prev('p').text().trim(),address,city:match[1].trim(),state:match[2]}:null;
  }).get();
  if (!rows.length) throw new Error('Store directory unavailable');
  return rows;
}
async function serves(zipcode) {
  const city=await municipality(zipcode.replace('-',''));
  return (await stores()).some(b=>fold(b.city)===fold(city.localidade) && b.state===city.uf);
}
async function local(row, zipcode, quantity=1) {
  if (!/^\d{5}-?\d{3}$/.test(zipcode) || !Number.isSafeInteger(quantity) || quantity<1) throw new TypeError('Invalid CEP or quantity');
  const postal=zipcode.replace('-','');
  const city=await municipality(postal);
  const { post }=await session(row.productUrl);
  const data=await post('/buscar/estoque',{produto_id:row.sku,cep:postal,coordenadas:'',cliente_id:'',parceiro_id:'',endereco_id:''});
  if (!data.status || !Array.isArray(data.lista_estoque)) throw new Error('Branch stock unavailable');
  const branches=data.lista_estoque.filter(b=>fold(b.cidade)===fold(city.localidade) && fold(b.uf)===fold(city.uf))
    .flatMap(b=>(b.produtos??[]).filter(p=>String(p.produto_id)===row.sku).map(p=>({id:String(b.cd_filial),
      name:b.nm_filial,street:b.endereco,number:b.numero,city:b.cidade,state:b.uf,phone:b.telefone,
      reportedStock:p.nivel_descricao??null})));
  return {...row,branches,methods:[],localStatus:branches.length?'city_stock_reported':'unverified',
    requestedQuantity:quantity,quantityVerified:false,observedAt:new Date().toISOString()};
}
export const retailer={name,site,search,product,byGtin,local,stores,serves};
