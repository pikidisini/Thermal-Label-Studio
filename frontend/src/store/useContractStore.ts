import { create } from 'zustand';
import type { JsonObject } from '../types/api';
import { adaptSapContract } from '../utils/sapContractAdapter';
import type { FlatSapTokenMap, RawSapContract } from '../utils/sapContractAdapter';

interface ContractState {
  sampleContracts: Record<string, RawSapContract>;
  activeContractKey: string;
  jsonData: JsonObject;
  tokenMap: FlatSapTokenMap;
  usedTokens: Set<string>;

  // Actions
  setSampleContracts: (contracts: Record<string, RawSapContract>) => void;
  setActiveContractKey: (key: string) => void;
  switchContract: (key: string) => void;
  setJsonData: (data: JsonObject | ((prev: JsonObject) => JsonObject)) => void;
  setTokenMap: (data: FlatSapTokenMap) => void;
  setUsedTokens: (tokens: Set<string>) => void;
  updateUsedTokensFromCanvas: (canvas: any) => void;
}

export const useContractStore = create<ContractState>((set, get) => ({
  sampleContracts: {},
  activeContractKey: 'goods_receipt',
  jsonData: {},
  tokenMap: {},
  usedTokens: new Set<string>(),

  setSampleContracts: (sampleContracts) => set({ sampleContracts }),
  setActiveContractKey: (activeContractKey) => set({ activeContractKey }),
  switchContract: (key: string) => {
    const contracts = get().sampleContracts;
    set({
      activeContractKey: key,
      jsonData: contracts[key] || get().jsonData,
      tokenMap: contracts[key] ? adaptSapContract(contracts[key]).tokenMap : get().tokenMap,
    });
  },
  setJsonData: (jsonData) =>
    set((state) => ({
      jsonData: typeof jsonData === 'function' ? jsonData(state.jsonData) : jsonData,
    })),
  setTokenMap: (tokenMap) => set({ tokenMap }),
  setUsedTokens: (usedTokens) => set({ usedTokens }),

  updateUsedTokensFromCanvas: (canvas) => {
    if (!canvas) return;
    const tokens = new Set<string>();
    canvas.getObjects().forEach((obj: any) => {
      if (obj.dataField) tokens.add(obj.dataField);
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
    });
    set({ usedTokens: tokens });
  },
}));
