#!/usr/bin/env node
import { run } from 'paguemenos-cli/runner';
import { retailer } from './index.js';
const args=process.argv.slice(2);
const operation = args[0] === 'stores' ? retailer.stores().then(rows=>console.log(JSON.stringify(rows,null,2))) :
  run(retailer,args,'farmaciaindependente');
operation.catch(err=>{console.error(err.message);process.exitCode=2;});
