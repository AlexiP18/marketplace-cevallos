import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ForbiddenError, Permission, RequestContext } from '@vendure/core';
import { StatisticsService, StatisticsInput } from '../services/statistics.service';

@Resolver()
export class StatisticsResolver {
    constructor(private statistics: StatisticsService) {}

    @Allow(Permission.ReadOrder)
    @Query()
    footwearStatistics(@Ctx() ctx: RequestContext, @Args('input') input: StatisticsInput) {
        if (!ctx.userHasAllPermissions([Permission.ReadOrder, Permission.ReadCatalog])) {
            throw new ForbiddenError();
        }
        return this.statistics.report(ctx, input);
    }
}
