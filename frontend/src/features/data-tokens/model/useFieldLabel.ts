import { useContractStore } from '../../../store/useContractStore';
import { getFieldLabel } from './fieldPresentation';

export function useFieldLabel(): (key: string) => string {
  const descriptions = useContractStore((state) => state.fieldDescriptions);
  return (key) => getFieldLabel(key, descriptions);
}
