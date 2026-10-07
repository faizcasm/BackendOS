/**
 * @deprecated Import from `src/core/config` instead.
 *
 * This module is kept as a thin alias so existing consumers of the old
 * `shared/utils/config` path keep working. It always resolves to the single
 * validated configuration object.
 */
export { config, type AppConfig } from '../../core/config';
