import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { labelingAdminApi } from './api/labeling.graphql';
import { LabelTemplateResolver } from './api/label-template.resolver';
import { LabelTemplate } from './entities/label-template.entity';
import { LabelTemplateService } from './services/label-template.service';
import { LabelCode } from './entities/label-code.entity';
import { LabelCodeService } from './services/label-code.service';
import { LabelPdfService } from './services/label-pdf.service';
import { LABELING_OPTIONS, LabelingOptions } from './labeling.options';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [LabelTemplate, LabelCode],
    providers: [LabelTemplateService, LabelCodeService, LabelPdfService, { provide: LABELING_OPTIONS, useFactory: () => LabelingPlugin.options }],
    exports: [LabelCodeService, LabelPdfService],
    adminApiExtensions: { schema: labelingAdminApi, resolvers: [LabelTemplateResolver] },
    dashboard: './dashboard/index.tsx',
    compatibility: '^3.0.0',
})
export class LabelingPlugin {
    static options: LabelingOptions;
    static init(options: LabelingOptions) { this.options = options; return LabelingPlugin; }
}
