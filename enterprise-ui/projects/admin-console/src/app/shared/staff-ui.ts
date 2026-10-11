/**
 * Presentation primitives shared with the Staff application, so both products look like one company. Only stateless
 * UI crosses this boundary: no Staff auth, API or business rule is imported into the Admin Console.
 */
export { ConfirmDialogComponent } from '../../../../case-management/src/app/shared/confirm-dialog.component';
export { EmptyStateComponent } from '../../../../case-management/src/app/shared/empty-state.component';
export { ErrorStateComponent } from '../../../../case-management/src/app/shared/error-state.component';
export { PaginationComponent } from '../../../../case-management/src/app/shared/pagination.component';
export { SkeletonComponent } from '../../../../case-management/src/app/shared/skeleton.component';
export { IhIconComponent } from '../../../../case-management/src/app/shared/icon/ih-icon.component';
export { ToastService } from '../../../../case-management/src/app/shared/toast.service';
