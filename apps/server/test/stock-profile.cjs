const {PerformanceObserver,performance}=require('node:perf_hooks');
const write=sample=>process.stdout.write('STOCK_PROFILE '+JSON.stringify(sample)+'\n');
require('node:diagnostics_channel').channel('marketplace.stock-admission').subscribe(sample=>write({type:'admission',at:Date.now(),...sample}));
new PerformanceObserver(list=>{
    for(const entry of list.getEntries())if(entry.duration>=10)write({type:'gc',at:performance.timeOrigin+entry.startTime,durationMs:entry.duration});
}).observe({entryTypes:['gc']});
const {config}=require('../dist/vendure-config');
config.dbConnectionOptions.maxQueryExecutionTime=15;
config.dbConnectionOptions.logger={
    logQuery(){},logQueryError(){},logSchemaBuild(){},logMigration(){},log(){},
    logQuerySlow(durationMs,query){
        const text=query.trim();
        const operation=/FOR UPDATE OF o/.test(text)?'order-lock':/pg_advisory_xact_lock/.test(text)?'variant-lock':/FOR UPDATE OF s/.test(text)?'stock-lock':/^WITH input/.test(text)?'stock-write':/global_settings/.test(text)?'settings':/^SELECT l.id/.test(text)?'lines':/INSERT INTO.*marketplace_checkout_hold/.test(text)?'hold-insert':text.split(/\s+/)[0];
        write({type:'sql',at:Date.now()-durationMs,durationMs,operation});
    }
};
