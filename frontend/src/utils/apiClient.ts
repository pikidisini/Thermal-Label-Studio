import { templatesApi } from './api/templatesApi';
import { renderApi } from './api/renderApi';
import { printApi } from './api/printApi';
import { sapApi } from './api/sapApi';
import { safeDemoApi } from './api/safeDemoApi';

export const apiClient = {
  // Template Services
  listTemplates: templatesApi.listTemplates,
  listTemplatesStrict: templatesApi.listTemplatesStrict,
  getTemplate: templatesApi.getTemplate,
  getTemplateStrict: templatesApi.getTemplateStrict,
  saveTemplate: templatesApi.saveTemplate,
  deleteTemplate: templatesApi.deleteTemplate,
  uploadTemplate: templatesApi.uploadTemplate,
  listTemplateFolders: templatesApi.listFolders,
  createTemplateFolder: templatesApi.createFolder,
  moveTemplate: templatesApi.moveTemplate,

  // Rendering & Inspection Services
  renderSimulation: renderApi.renderSimulation,
  renderPreviewBlob: renderApi.renderPreviewBlob,
  exportRenderJob: renderApi.exportRenderJob,
  inspectSvgTokens: renderApi.inspectSvgTokens,

  // Printing Services
  listSpoolerPrinters: printApi.listSpoolerPrinters,
  printDirect: printApi.printDirect,
  printBatch: printApi.printBatch,

  // Safe Demo Mode & Batch Monitoring
  safeDemo: safeDemoApi,

  // SAP Contracts & Inspection
  getSampleContracts: sapApi.getSampleContracts,
  validateSapPayload: sapApi.validateSapPayload,
};


export default apiClient;
