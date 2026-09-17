import { templatesApi } from './api/templatesApi';
import { renderApi } from './api/renderApi';
import { printApi } from './api/printApi';
import { sapApi } from './api/sapApi';

export const apiClient = {
  // Template Services
  listTemplates: templatesApi.listTemplates,
  getTemplate: templatesApi.getTemplate,
  saveTemplate: templatesApi.saveTemplate,
  deleteTemplate: templatesApi.deleteTemplate,
  uploadTemplate: templatesApi.uploadTemplate,

  // Rendering & Inspection Services
  renderSimulation: renderApi.renderSimulation,
  renderPreviewBlob: renderApi.renderPreviewBlob,
  exportRenderJob: renderApi.exportRenderJob,
  inspectSvgTokens: renderApi.inspectSvgTokens,

  // Printing Services
  listSpoolerPrinters: printApi.listSpoolerPrinters,
  printDirect: printApi.printDirect,
  printBatch: printApi.printBatch,

  // SAP Contracts & Inspection
  getSampleContracts: sapApi.getSampleContracts,
  validateSapPayload: sapApi.validateSapPayload,
};

export default apiClient;
