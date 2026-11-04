import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { statisticsAdminApi } from './api/statistics.graphql';
import { StatisticsResolver } from './api/statistics.resolver';
import { StatisticsService } from './services/statistics.service';
import { StatisticsExportService } from './services/statistics-export.service';
import { STATISTICS_OPTIONS, StatisticsOptions } from './statistics.options';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [StatisticsService, StatisticsExportService, { provide: STATISTICS_OPTIONS, useFactory: () => StatisticsPlugin.options }],
    exports: [StatisticsExportService],
    adminApiExtensions: { schema: statisticsAdminApi, resolvers: [StatisticsResolver] },
    dashboard: './dashboard/index.tsx',
    compatibility: '^3.0.0',
})
export class StatisticsPlugin {
    static options: StatisticsOptions;
    static init(options: StatisticsOptions) { this.options = options; return StatisticsPlugin; }
}
