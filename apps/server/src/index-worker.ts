import { bootstrapWorker } from '@vendure/core';
import { config, marketplaceWorkerRole } from './vendure-config';

bootstrapWorker(config)
    .then(worker => marketplaceWorkerRole === 'admission' ? undefined : worker.startJobQueue())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
