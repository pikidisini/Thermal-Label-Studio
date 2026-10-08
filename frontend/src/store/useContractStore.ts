import { create } from 'zustand';
import type { JsonObject } from '../types/api';
import { compositionFields } from '../features/data-tokens/model/composition';
import { adaptSapContract } from '../features/data-tokens';
import type { FlatSapTokenMap, RawSapContract } from '../features/data-tokens';

interface ContractState {
  sampleContracts: Record<string, RawSapContract>;
  activeContractKey: string;
  jsonData: JsonObject;
  tokenMap: FlatSapTokenMap;
  fieldDescriptions: Record<string, string>;
  usedTokens: Set<string>;
  localImport: { format: 'v1.1' | 'raw-v2' | 'data'; fileName: string; itemSequence: number; itemCount: number } | null;
  customTokens: Set<string>;

  // Actions
  setSampleContracts: (contracts: Record<string, RawSapContract>) => void;
  setActiveContractKey: (key: string) => void;
  switchContract: (key: string) => void;
  setJsonData: (data: JsonObject | ((prev: JsonObject) => JsonObject)) => void;
  setTokenMap: (data: FlatSapTokenMap) => void;
  updateTokenValue: (key: string, value: string) => void;
  setUsedTokens: (tokens: Set<string>) => void;
  updateUsedTokensFromCanvas: (canvas: any) => void;
  setLocalImportedContract: (contract: RawSapContract, tokenMap: FlatSapTokenMap, context: ContractState['localImport']) => void;
  markCustomToken: (key: string) => void;
}

export const useContractStore = create<ContractState>((set, get) => ({
  sampleContracts: {},
  activeContractKey: 'goods_receipt',
  jsonData: {},
  tokenMap: {},
  fieldDescriptions: {},
  usedTokens: new Set<string>(),
  localImport: null,
  customTokens: new Set<string>(),

  setSampleContracts: (sampleContracts) => set({ sampleContracts }),
  setActiveContractKey: (activeContractKey) => set({ activeContractKey }),
  switchContract: (key: string) => {
    const contracts = get().sampleContracts;
    set({
      activeContractKey: key,
      jsonData: contracts[key] || get().jsonData,
      tokenMap: contracts[key] ? adaptSapContract(contracts[key]).tokenMap : get().tokenMap,
      fieldDescriptions: contracts[key] ? contracts[key].field_descriptions || {} : get().fieldDescriptions,
      localImport: null,
      customTokens: new Set<string>(),
    });
  },
  setJsonData: (jsonData) =>
    set((state) => ({
      jsonData: typeof jsonData === 'function' ? jsonData(state.jsonData) : jsonData,
    })),
  setTokenMap: (tokenMap) => set({ tokenMap }),
  updateTokenValue: (key, value) => set((state) => {
    const next = { ...state.jsonData } as any;
    const section = next.fields && Object.prototype.hasOwnProperty.call(next.fields, key) ? 'fields' : next.codes && Object.prototype.hasOwnProperty.call(next.codes, key) ? 'codes' : 'fields';
    if (section) next[section] = { ...next[section], [key]: value };
    else next[key] = value;
    return { tokenMap: { ...state.tokenMap, [key]: value }, jsonData: next };
  }),
  setUsedTokens: (usedTokens) => set({ usedTokens }),
  setLocalImportedContract: (contract, tokenMap, localImport) => set({
    jsonData: contract,
    tokenMap,
    localImport,
    fieldDescriptions: contract.field_descriptions || {},
    customTokens: new Set<string>(),
    activeContractKey: `local:${localImport?.itemSequence ?? 1}`,
  }),
  markCustomToken: (key) => set((state) => ({ customTokens: new Set(state.customTokens).add(`${state.activeContractKey}:${key.toLocaleLowerCase()}`) })),

  updateUsedTokensFromCanvas: (canvas) => {
    if (!canvas) return;
    const tokens = new Set<string>();
    const visit = (obj: any) => {
      obj.getObjects?.().forEach(visit);
      if (typeof obj.payloadTemplate === 'string') compositionFields(obj.payloadTemplate).forEach((key) => tokens.add(key));
      if (obj.dataField) tokens.add(obj.dataField);
      if (obj.dataBarcode) tokens.add(obj.dataBarcode);
      if (obj.dataQr) tokens.add(obj.dataQr);
      if (obj.barcodeValue && typeof obj.barcodeValue === 'string') {
        const matches = obj.barcodeValue.match(/{{(.*?)}}/g);
        if (matches) {
          matches.forEach((m: string) => tokens.add(m.replace(/[{}]/g, '').trim()));
        }
      }
      if (obj.text && typeof obj.text === 'string') {
        const matches = obj.text.match(/{{(.*?)}}/g);
        if (matches) {
          matches.forEach((m: string) => tokens.add(m.replace(/[{}]/g, '').trim()));
        }
      }
    };
    canvas.getObjects().forEach(visit);
    set({ usedTokens: tokens });
  },
}));
