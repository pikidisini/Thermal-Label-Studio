import { LABEL_FIELD_CATALOG } from './labelFieldCatalog';
import type { FlatSapTokenMap } from './sapContractAdapter';

/** Fresh synthetic startup data from the SAP sample; never merge into imported data. */
export function createDefaultTokenData(): FlatSapTokenMap {
  return Object.fromEntries(LABEL_FIELD_CATALOG.map(field => [field.key, field.example]));
}
