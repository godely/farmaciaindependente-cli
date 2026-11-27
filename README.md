# Farmácias Independente CLI

Independent CLI for the retailer's public search, product pages, anonymous offers, directory and reported branch stock. Install with npm ci on Node 20+.

```sh
node cli.js search dipirona --limit 10
node cli.js product 94043081 --json
node cli.js gtin 7891058002602 --json
node cli.js info 94043081
node cli.js stores
node cli.js stock 94043081 --cep "$CEP"
```

Stock lookup resolves the supplied CEP's municipality via ViaCEP, then filters the retailer's branch response by city and state. The retailer can return distances from a different origin. The CLI omits those distances and preserves the public inventory band. The price is the anonymous online offer, independently of branch stock. Clube, PBM and subscription offers are excluded. A missing price or unspecified quantity remains unknown. No purchase, prescription or customer registration occurs.

[Retailer](https://www.farmaciasindependente.com.br/) · [Store directory](https://www.farmaciasindependente.com.br/nossas-lojas)

Medication searches use shared spelling suggestions. When an ingredient is missing from local titles, the adapter can verify a branded presentation by matching the local product page's barcode to a structured ingredient record in the São Paulo catalog. JSON results identify the evidence, the local SKU and the reference SKU. A brand on its own does not prove composition.
